/**
 * 会话思考档位 — Host half.（第三版身份 @local/think-level）
 *
 * 语义：**每个会话单独设定**推理档位（六档：关闭/低/中/高/最高/超高），
 * 子代理继承所属会话的档位（沿 session.header.parentSession 向上找最近
 * 单独设定）；会话未单独设定时用全局默认档（Config.level）。
 *
 * 实现：
 * - 每会话档位存在 Config 的 volatile 字段 `sessions`（key=会话 id），
 *   与默认档 `level` 同一写通道（settings → configEditor → profile 补丁层），
 *   实时生效（不重挂插件）、持久化、升级不丢。
 * - `agent/request` 瀑布按上述规则解析该会话的有效档位，再就近收敛到目标
 *   模型 `reasoning.efforts` 实际支持的档位后改写 reasoningEffort。
 * - 工具 set_thinking_level 与 UI 是同一操作两个入口（user-actions 契约）。
 *
 * 铁律：
 * 1. 只发目标模型认识的档位（DeepSeek off/low/high/max 与 pi-ai
 *    off/minimal/low/medium/high/xhigh/max 两族都会对未知档位抛
 *    UNSUPPORTED_REASONING_EFFORT）；模型无推理能力时不改写。
 * 2. 瀑布监听器 `prepend: true`：Cordis 瀑布「先注册=最外层=最终值」。
 * 3. schemastery `z.dict(inner, sKey)`：**第一参=值 schema，第二参=键 schema**
 *    （曾把键值序写反，导致按会话写入被「键不在档位枚举内」拒绝）。
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** 设置命名空间 = Loader 行 id（见 cordis.patch.yml）。 */
const SETTINGS_NS = 'think-level';

/** 六档全局思考等级（升序）。 */
const LEVEL_IDS = ['off', 'low', 'medium', 'high', 'xhigh', 'max'];

/** 档位中文名（工具结果里给中文用户看）。 */
const LEVEL_LABELS = {
  off: '关闭',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '最高',
  max: '超高'
};

/**
 * 通用档位排序标尺（含适配器词汇里可能出现的 minimal）。
 * 请求档位与模型支持档位都在这把尺子上比较：取「大于等于请求的最小档」，
 * 没有则取模型支持的最高档；请求 off 时优先 off，否则取最低档。
 */
const RANK = { off: 0, minimal: 1, low: 2, medium: 3, high: 4, xhigh: 5, max: 6 };

/**
 * 解析 schemastery：正常包解析优先；失败时从运行中的 Harness 自身与
 * profile 依赖树兜底（工作区软链安装的 bundle 可能不在常规解析路径上）。
 * @returns schemastery 的默认导出（z）。
 */
function requireSchemastery() {
  const require = createRequire(import.meta.url);
  const attempts = [
    () => require('@deepseek-ai/schemastery'),
    () => {
      const entry = process.argv[1];
      return entry ? createRequire(pathToFileURL(entry).href)('@deepseek-ai/schemastery') : undefined;
    },
    () => {
      const root = process.env.DSH_PROFILE_DIR;
      return root ? require(join(root, 'node_modules', '@deepseek-ai', 'schemastery')) : undefined;
    }
  ];
  for (const attempt of attempts) {
    try {
      const loaded = attempt();
      if (typeof loaded === 'function') return loaded;
      if (loaded && typeof loaded === 'object' && loaded.default) return loaded.default;
    } catch { /* 尝试下一个解析路径 */ }
  }
  throw new Error('think-level: cannot resolve @deepseek-ai/schemastery (expected in the profile node_modules or the Harness installation)');
}

const z = requireSchemastery();

/**
 * 插件 Config：
 * - `level`：默认档（会话未单独设定时生效），volatile；
 * - `sessions`：每会话单独设定表（key=会话 id，value=六档之一），volatile。
 * 注意 schemastery 的 z.dict(inner, sKey)：inner=值 schema，sKey=键 schema。
 */
export const Config = z.object({
  level: z.union(LEVEL_IDS)
    .default('high')
    .description('Default thinking level for sessions without their own setting: off (关闭) / low (低) / medium (中) / high (高) / xhigh (最高) / max (超高).')
    .volatile(),
  sessions: z.dict(z.union(LEVEL_IDS), z.string())
    .default({})
    .description('Per-session thinking levels: sessionId → one of off/low/medium/high/xhigh/max. A session with its own entry overrides the default; subagents inherit their parent session entry.')
    .volatile()
});

/** 硬依赖服务：模型能力查询、工具注册、设置持久化、会话归属链。 */
export const inject = ['llm', 'tools', 'settings', 'agents'];

/**
 * 读取 volatile 句柄的当前值（运行期 volatile 字段是取值句柄）。
 * @param raw - Config 字段（可能为 volatile 句柄）。
 * @returns 裸值。
 */
function readVolatile(raw) {
  return raw !== null && typeof raw === 'object' && typeof raw.get === 'function' ? raw.get() : raw;
}

/**
 * 在目标模型支持的档位里为请求档位找一个安全落点。
 * @param supported - 模型 `reasoning.efforts` 报告的档位 id 列表。
 * @param level - 请求档位（六档之一）。
 * @returns 应写入请求的档位 id；无可落点时返回 undefined（不改写）。
 */
function clampToSupported(supported, level) {
  const usable = supported.filter((id) => RANK[id] !== undefined);
  if (usable.length === 0) return undefined;
  const byRank = (a, b) => RANK[a] - RANK[b];
  if (level === 'off') {
    return usable.includes('off') ? 'off' : [...usable].sort(byRank)[0];
  }
  const want = RANK[level];
  const above = usable.filter((id) => RANK[id] >= want).sort(byRank);
  if (above.length > 0) return above[0];
  return [...usable].sort(byRank).pop();
}

/**
 * Host 插件主体：注册每会话档位改写与查询/设置工具。
 * @param ctx - 插件上下文。
 * @param config - 插件 Config（level / sessions 为 volatile 句柄）。
 */
export function apply(ctx, config) {
  /** (provider, model) → 推理能力缓存；适配器拓扑变化即失效。 */
  const capability = new Map();
  ctx.on('llm/adapters-updated', () => capability.clear());

  /** @returns 每会话设定表（裸对象）。 */
  const sessionMap = () => {
    const map = readVolatile(config.sessions);
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  };

  /** @returns 全局默认档。 */
  const defaultLevel = () => {
    const value = readVolatile(config.level);
    return LEVEL_IDS.includes(value) ? value : 'high';
  };

  /**
   * 沿 parentSession 链解析一个会话的有效档位。
   * @param sessionId - 会话 id（可缺省）。
   * @returns { level, own, sessionId }：own 表示是否命中会话自己的设定。
   */
  function levelForSession(sessionId) {
    const map = sessionMap();
    const seen = new Set();
    let id = sessionId;
    while (typeof id === 'string' && id.length > 0 && !seen.has(id)) {
      seen.add(id);
      const value = map[id];
      if (LEVEL_IDS.includes(value)) return { level: value, own: true, sessionId: id };
      let parent;
      try {
        const agent = ctx.agents.get(id);
        parent = agent && agent.session ? agent.session.header.parentSession : undefined;
      } catch { parent = undefined; }
      id = parent;
    }
    return { level: defaultLevel(), own: false, sessionId: undefined };
  }

  /**
   * 解析一次请求应携带的档位（含就近收敛）。
   * @param provider - 请求 provider。
   * @param model - 请求 model。
   * @param level - 有效档位（六档之一）。
   * @returns 落点档位 id；不改写时返回 undefined。
   */
  async function effortFor(provider, model, level) {
    if (!provider || !model) return undefined;
    const key = `${provider}\u0000${model}`;
    let info = capability.get(key);
    if (info === undefined) {
      info = await ctx.llm.resolveModelInfo(provider, model);
      capability.set(key, info);
    }
    const efforts = info && info.reasoning ? info.reasoning.efforts : undefined;
    if (!Array.isArray(efforts) || efforts.length === 0) return undefined;
    return clampToSupported(efforts.map((entry) => entry.id), level);
  }

  // 先注册 = 最外层 = 最终值：档位覆盖不被其他 agent/request 监听器抹掉。
  ctx.on('agent/request', async (payload, next) => {
    const call = await next();
    try {
      const sessionId = payload && payload.agent ? payload.agent.id : undefined;
      const { level } = levelForSession(sessionId);
      const chosen = await effortFor(call.provider, call.model, level);
      if (chosen === undefined || chosen === call.reasoningEffort) return call;
      return { ...call, reasoningEffort: chosen };
    } catch (error) {
      // 能力查询失败时不改写请求，交回原配置，绝不因本插件打断对话。
      ctx.logger?.warn?.(`think-level: capability lookup failed for ${call.provider}/${call.model}: ${String(error)}`);
      return call;
    }
  }, { prepend: true });

  /** 工具结果展示文案（契约：render(args, value)，首参是工具入参）。 */
  function render(_args, value) {
    if (!value || !value.ok) {
      return [{ type: 'text', text: `设置失败：${value && value.error ? value.error : `返回异常：${JSON.stringify(value)}`}` }];
    }
    const where = value.target === 'default' ? '默认档位' : '本会话档位';
    return [{
      type: 'text',
      text: `${where}${value.changed ? '已设置' : '当前'}：${value.label}（${value.level}）。${value.target === 'default' ? '未单独设定的会话生效。' : '仅本会话生效（子代理继承）；实际请求就近收敛到目标模型支持的档位。'}`
    }];
  }

  // 同一操作两个入口（会话输入区 UI 与本工具），语义：每会话单独设定。
  ctx.tools.register({
    name: 'set_thinking_level',
    description: '查询或修改【本会话】的思考档位（每会话单独设定，子代理继承所属会话档位；会话未单独设定时用全局默认档）。档位从低到高：off=关闭、low=低、medium=中、high=高、xhigh=最高、max=超高；实际请求会就近收敛到目标模型支持的档位。action=get 查询有效档位，action=set 修改；target=session（默认）改本会话，target=default 改全局默认档。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set'],
          description: 'get=查询本会话有效档位；set=修改（默认 get）。'
        },
        level: {
          type: 'string',
          enum: LEVEL_IDS,
          description: '目标档位（action=set 时必填）：off=关闭、low=低、medium=中、high=高、xhigh=最高、max=超高。'
        },
        target: {
          type: 'string',
          enum: ['session', 'default'],
          description: 'session=改本会话单独设定（默认）；default=改全局默认档（未单独设定的会话生效）。'
        }
      },
      required: [],
      additionalProperties: false
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          level: { type: 'string', enum: LEVEL_IDS },
          label: { type: 'string' },
          target: { type: 'string', enum: ['session', 'default'] },
          own: { type: 'boolean' },
          changed: { type: 'boolean' },
          error: { type: 'string' }
        },
        required: ['ok', 'level'],
        additionalProperties: false
      },
      render
    },
    async execute(args, exec) {
      const action = args && args.action === 'set' ? 'set' : 'get';
      const target = args && args.target === 'default' ? 'default' : 'session';
      const sessionId = exec && exec.agent ? exec.agent.id : undefined;
      const effective = levelForSession(sessionId);
      if (action === 'get') {
        return {
          ok: true,
          level: effective.level,
          label: LEVEL_LABELS[effective.level],
          target,
          own: effective.own
        };
      }
      const wanted = args ? args.level : undefined;
      if (!LEVEL_IDS.includes(wanted)) {
        throw new Error(`level 必须是 ${LEVEL_IDS.join('/')} 之一（off=关闭、low=低、medium=中、high=高、xhigh=最高、max=超高）`);
      }
      if (target === 'session' && typeof sessionId !== 'string') {
        throw new Error('当前调用没有会话上下文，请在会话内调用（或用 target=default 改全局默认档）');
      }
      try {
        if (target === 'default') {
          await ctx.settings.mutate(SETTINGS_NS, [{ op: 'set', path: ['level'], value: wanted }], undefined);
        } else {
          await ctx.settings.mutate(SETTINGS_NS, [{ op: 'set', path: ['sessions', String(sessionId)], value: wanted }], undefined);
        }
      } catch (error) {
        return {
          ok: false,
          level: effective.level,
          label: LEVEL_LABELS[effective.level],
          target,
          own: effective.own,
          error: String(error && error.message ? error.message : error)
        };
      }
      return {
        ok: true,
        level: wanted,
        label: LEVEL_LABELS[wanted],
        target,
        own: target === 'session',
        changed: true
      };
    }
  });
}
