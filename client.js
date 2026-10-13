/**
 * 会话思考档位 — Client half.（第三版身份 @local/think-level）
 *
 * 入口：**每个会话页面的输入区**（conversation.input.left）——本会话档位选择器
 * （关闭/低/中/高/最高/超高），写 `sessions[会话 id]`，会话间互不影响；
 * 未单独设定的会话显示并跟随全局默认档（默认档经工具/补丁层维护）。
 * （设置 → 通用 的默认档行已按用户要求移除，2026-10-13。）
 * 读写都走设置传输（ctx.configForms → remote.settings → Host settings），
 * 与 Host 工具 set_thinking_level 是同一写通道、同一持久层。
 * 样式只用 --dsw-* 主题令牌。
 */
window.__ModuleLoader__.load({
  id: '@local/think-level',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** 设置命名空间 = Loader 行 id。 */
    const NS = 'think-level';

    /** 六档（升序），与 Host 端 LEVEL_IDS 一一对应。 */
    const LEVELS = [
      { id: 'off', zh: '关闭', en: 'Off' },
      { id: 'low', zh: '低', en: 'Low' },
      { id: 'medium', zh: '中', en: 'Medium' },
      { id: 'high', zh: '高', en: 'High' },
      { id: 'xhigh', zh: '最高', en: 'Highest' },
      { id: 'max', zh: '超高', en: 'Ultra' }
    ];

    /** 本插件命名空间词典（zh / en）。 */
    const DICT = {
      zh: {
        title: '默认思考档位',
        hint: '未单独设定的会话生效；每个会话可在其输入区单独设定（子代理继承所属会话）',
        chip: '思考',
        chipOwn: '本会话档位（已单独设定，点击可改）',
        chipDefault: '默认档位（点击为本会话单独设定）',
        capOwn: '本会话',
        capDefault: '默认',
        off: '关闭',
        low: '低',
        medium: '中',
        high: '高',
        xhigh: '最高',
        max: '超高'
      },
      en: {
        title: 'Default thinking level',
        hint: 'Applies to sessions without their own setting; each session can set its own in its composer (subagents inherit)',
        chip: 'Think',
        chipOwn: 'This session’s level (set individually; click to change)',
        chipDefault: 'Default level (click to set for this session)',
        capOwn: 'This session',
        capDefault: 'Default',
        off: 'Off',
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        xhigh: 'Highest',
        max: 'Ultra'
      }
    };

    /** 站内样式（类名前缀 gtl_，只引用 --dsw-* 主题令牌；全圆弧胶囊语言，无直角）。 */
    const CSS = [
      '.gtl_chipLabel{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.gtl_trigger{border:.5px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:12px;line-height:18px;padding:5px 12px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex:none;transition:background .15s ease,border-color .15s ease}',
      '.gtl_trigger:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1))}',
      '.gtl_trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.gtl_value{color:var(--dsw-alias-label-primary);font-weight:500}',
      '.gtl_arrow{color:var(--dsw-alias-label-secondary);flex:none;transition:transform .18s ease}',
      '.gtl_arrowOpen{transform:rotate(180deg)}',
      '.gtl_panel{position:fixed;z-index:1200;width:60px;flex-direction:column;gap:2px;padding:5px 4px;border-radius:14px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));box-shadow:var(--dsw-shadow-lv2,0 4px 16px rgba(0,0,0,.16));display:flex}',
      '.gtl_menuHint{color:var(--dsw-alias-label-secondary);font-size:10px;line-height:14px;padding:1px 2px 4px;text-align:center}',
      '.gtl_menuItem{border:none;background:transparent;border-radius:999px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:13px;line-height:18px;padding:5px 3px;display:flex;align-items:center;justify-content:center;gap:3px;text-align:center;white-space:nowrap;transition:background .12s ease}',
      '.gtl_menuItem:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}',
      '.gtl_menuItem[aria-selected="true"]{background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-2));font-weight:500}',
      '.gtl_menuItem:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.gtl_check{color:var(--dsw-alias-brand-primary);flex:none}'
    ].join('');

    /** 工厂期共享引用：apply() 里填入表单句柄。 */
    const api = { form: undefined };

    /**
     * 读取表单快照：每会话档位与默认档。
     * @param form - configForms 表单控制器。
     * @param sessionId - 会话 id（可缺省）。
     * @returns { level, own }：own=会话是否单独设定。
     */
    function readLevels(form, sessionId) {
      if (!form || typeof form.getSnapshot !== 'function') return { level: undefined, own: false };
      const snapshot = form.getSnapshot();
      const value = snapshot ? snapshot.value : undefined;
      if (!value || typeof value !== 'object') return { level: undefined, own: false };
      const sessions = value.sessions && typeof value.sessions === 'object' ? value.sessions : {};
      const own = typeof sessionId === 'string' ? sessions[sessionId] : undefined;
      if (LEVELS.some((entry) => entry.id === own)) return { level: own, own: true };
      return { level: LEVELS.some((entry) => entry.id === value.level) ? value.level : undefined, own: false };
    }

    /**
     * 订阅档位变化 + 写回的共享逻辑。
     * @param form - configForms 表单控制器。
     * @param sessionId - 会话 id（缺省时仅读写默认档）。
     * @returns [state, pick, pending]——{level, own}、写入函数、写入中。
     */
    function useLevel(form, sessionId) {
      const [state, setState] = React.useState(() => readLevels(form, sessionId));
      const [pending, setPending] = React.useState(false);
      React.useEffect(() => {
        if (!form || typeof form.subscribe !== 'function') return undefined;
        setState(readLevels(form, sessionId));
        return form.subscribe(() => setState(readLevels(form, sessionId)));
      }, [form, sessionId]);
      const pick = (id) => {
        if (pending || id === state.level || !form) return;
        const write = typeof sessionId === 'string' && typeof form.mutate === 'function'
          ? form.mutate([{ op: 'set', path: ['sessions', sessionId], value: id }])
          : (typeof form.set === 'function' ? form.set('level', id) : false);
        setPending(true);
        Promise.resolve(write)
          .catch(() => false)
          .then(() => setState(readLevels(form, sessionId)))
          .finally(() => setPending(false));
      };
      return [state, pick, pending];
    }

    /**
     * 会话输入区的每会话档位选择器（每个会话页面都渲染，各写各的会话）。
     * @param props - 插槽标准 props（t 来自 locale 座位；sessionId 来自 inject）。
     * @returns 控件元素树。
     */
    function SessionThinkingChip(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => (DICT.zh[key] ?? key);
      const sessionId = props.sessionId;
      const [state, pick, pending] = useLevel(api.form, sessionId);
      const [open, setOpen] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const triggerRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const title = state.own ? t('chipOwn') : t('chipDefault');
      const label = state.level === undefined ? '…' : t(state.level);

      /** 按触发器位置摆放面板（下方优先，越界翻上方/左移）。 */
      const place = () => {
        const el = triggerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const width = 60;
        const height = 236;
        let top = rect.bottom + 6;
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
        let left = rect.left;
        if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
        setPos({ top, left });
      };

      const close = () => {
        setOpen(false);
        const el = triggerRef.current;
        if (el && typeof el.focus === 'function') el.focus();
      };

      React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            close();
          }
        };
        const onDown = (event) => {
          const target = event.target;
          const panel = panelRef.current;
          const trigger = triggerRef.current;
          if (panel && panel.contains(target)) return;
          if (trigger && trigger.contains(target)) return;
          setOpen(false);
        };
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('resize', place);
        return () => {
          document.removeEventListener('keydown', onKey, true);
          document.removeEventListener('pointerdown', onDown, true);
          window.removeEventListener('resize', place);
        };
      }, [open]);

      const chevron = (openNow) => h('svg', {
        className: 'gtl_arrow' + (openNow ? ' gtl_arrowOpen' : ''),
        width: 12,
        height: 12,
        viewBox: '0 0 12 12',
        fill: 'none',
        'aria-hidden': 'true'
      }, h('path', {
        d: 'M2.75 4.75 6 8l3.25-3.25',
        stroke: 'currentColor',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      }));

      const trigger = h('button', {
        key: 'trigger',
        ref: triggerRef,
        type: 'button',
        className: 'gtl_trigger',
        'aria-haspopup': 'listbox',
        'aria-expanded': String(open),
        title,
        onClick: () => {
          if (open) {
            setOpen(false);
            return;
          }
          place();
          setOpen(true);
        }
      }, [
        h('span', { key: 'label', className: 'gtl_chipLabel' }, t('chip')),
        h('span', { key: 'value', className: 'gtl_value' }, label),
        chevron(open)
      ]);

      const panel = open && pos ? h('div', {
        key: 'panel',
        ref: panelRef,
        className: 'gtl_panel',
        role: 'listbox',
        'aria-label': t('title'),
        style: { top: `${pos.top}px`, left: `${pos.left}px` }
      }, [
        h('div', { key: 'hint', className: 'gtl_menuHint' }, state.own ? t('capOwn') : t('capDefault')),
        ...LEVELS.map((entry) => h('button', {
          key: entry.id,
          type: 'button',
          role: 'option',
          'aria-selected': String(state.level === entry.id),
          className: 'gtl_menuItem',
          disabled: pending,
          onClick: () => {
            pick(entry.id);
            close();
          }
        }, [
          h('span', { key: 'text' }, t(entry.id)),
          state.level === entry.id ? h('svg', {
            key: 'check',
            className: 'gtl_check',
            width: 10,
            height: 10,
            viewBox: '0 0 14 14',
            fill: 'none',
            'aria-hidden': 'true'
          }, h('path', {
            d: 'M2.8 7.4 5.6 10.2 11.2 4.2',
            stroke: 'currentColor',
            'stroke-width': '1.8',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round'
          })) : null
        ]))
      ]) : null;

      return h(React.Fragment, null, panel ? [trigger, panel] : [trigger]);
    }

    return {
      // remote / remote.session 必须**显式**写进 inject：cordis 客户端里带点的服务路径
      // （remote.session）同样受 inject 守卫，未声明时读取即抛错（cannot get property
      // "remote.session" without inject）——ctx.get('remote') 只能拿到外层代理，绕不过
      // 内层守卫。官方插件一律这么声明（如 dsh-client-ui-model-selection 的
      // ["sessions","remote","remote.session"]）。
      // 代价：这两个服务未就绪时本插件会停在 pending（而不是以前的 failed）。
      inject: ['slots', 'configForms', 'locale', 'remote', 'remote.session'],
      apply(ctx) {
        // 按用户要求（2026-10-13）删除模型选择器里的「推理等级」选项：
        // 让 UI 的模型目录看不到 reasoning 能力元数据（宿主的「推理等级」格是
        // 自身条件渲染——目录没有词典就整块消失）。请求路径走适配器私有元数据、
        // 本插件的档位改写走 Host llm.resolveModelInfo 原始词典，均不受影响。
        // 安装成功后强制刷新一次模型目录（它在启动早期就已带词典加载过）。
        const stripReasoning = (value) => {
          if (Array.isArray(value)) return value.map(stripReasoning);
          if (value !== null && typeof value === 'object') {
            const copy = {};
            for (const [key, item] of Object.entries(value)) {
              if (key === 'reasoning') continue;
              copy[key] = stripReasoning(item);
            }
            return copy;
          }
          return value;
        };
        let installed = false;
        const installStrip = () => {
          if (installed) return true;
          // 铁律：cordis 客户端里 `ctx.<service>` 在服务未注入或未就绪时是**抛错**，
          // 不是返回 undefined —— `ctx.remote && ctx.remote.session` 这种短路守卫无效
          // （属性读取本身就炸，&& 根本没机会求值），会直接把 apply() 顶穿、client
          // fiber 变 failed、整块 UI 不挂载。
          // 因此：remote / remote.session 写进 inject 正式声明（见上）；真正可选的
          // modelDirectories 走 ctx.get()（找不到返回 undefined）；整体再套一层 try/catch
          // 兜底，任何意外都不许冒泡出 apply()。
          try {
            const remote = ctx.remote;
            const remoteSession = remote && remote.session;
            const catalog = (ctx.get('modelDirectories') || {}).catalog;
            // 主通路：命名空间方法是 getter-only 访问器（赋值抛 TypeError），改写它
            // 底层的 invokeRemote（普通可写字段），按 descriptor.method 精确识别 modelCatalog。
            if (remoteSession && typeof remoteSession.invokeRemote === 'function' && typeof remoteSession.modelCatalog === 'function') {
              const originalInvoke = remoteSession.invokeRemote;
              try {
                remoteSession.invokeRemote = (direct, scoped, caller, args) => {
                  const result = originalInvoke(direct, scoped, caller, args);
                  const method = (direct && direct.descriptor && direct.descriptor.method)
                    || (scoped && scoped.descriptor && scoped.descriptor.method);
                  return method === 'modelCatalog' ? Promise.resolve(result).then(stripReasoning) : result;
                };
                ctx.effect(() => () => {
                  remoteSession.invokeRemote = originalInvoke;
                }, 'think-level hide model reasoning');
                installed = true;
              } catch (error) {
                console.error('think-level: cannot wrap invokeRemote', error);
              }
            } else if (catalog && typeof catalog.load === 'function') {
              try {
                const originalLoad = catalog.load.bind(catalog);
                catalog.load = () => originalLoad().then((value) => {
                  const stripped = stripReasoning(value);
                  try {
                    catalog.store.set({ value: stripped, status: 'ready', error: null });
                  } catch (error) {
                    console.error('think-level: cannot restrip catalog store', error);
                  }
                  return stripped;
                });
                ctx.effect(() => () => {
                  catalog.load = originalLoad;
                }, 'think-level hide model reasoning');
                installed = true;
              } catch (error) {
                console.error('think-level: cannot wrap catalog.load', error);
              }
            }
            if (installed && catalog && typeof catalog.refresh === 'function') {
              try {
                catalog.refresh();
              } catch (error) {
                console.error('think-level: catalog refresh failed', error);
              }
            }
          } catch (error) {
            // 兜底：任何意外都不得冒泡出 apply()，否则整个 client 半不挂载。
            console.error('think-level: cannot install model-catalog strip', error);
          }
          return installed;
        };
        if (!installStrip()) {
          const timer = setInterval(() => {
            if (installStrip()) clearInterval(timer);
          }, 300);
          const stop = setTimeout(() => clearInterval(timer), 20000);
          ctx.effect(() => () => {
            clearInterval(timer);
            clearTimeout(stop);
          }, 'think-level model strip bootstrap');
        }
        if (typeof document !== 'undefined' && document.head) {
          const tag = document.createElement('style');
          tag.dataset.plugin = NS;
          tag.textContent = CSS;
          document.head.appendChild(tag);
          ctx.effect(() => () => tag.remove(), 'think-level styles');
        }
        ctx.effect(() => ctx.locale.register(NS, DICT), 'think-level locale');
        api.form = ctx.configForms.get(NS);
        // 每个会话页面的输入区：本会话档位选择器（inject 提供会话 id，各写各的）。
        // 设置 → 通用 的默认档行已按用户要求移除（2026-10-13）；默认档可用
        // 工具 set_thinking_level target=default 或补丁层修改。
        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'thinking-level',
          order: 5,
          locale: NS,
          inject: (sessionId) => ({ sessionId })
        }, SessionThinkingChip));
      }
    };
  }
});
