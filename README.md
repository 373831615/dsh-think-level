<div align="center">

<img src="docs/banner.svg" alt="think-level — 会话思考档位，每会话六档推理开关" width="720">

**每个会话页面单独设定推理档位（关闭 / 低 / 中 / 高 / 最高 / 超高），子代理继承所属会话档位。**

[![license](https://img.shields.io/badge/license-MIT-65a30d?style=flat)](LICENSE)
[![dsh](https://img.shields.io/badge/DSH-0.2.x-0ea5e9?style=flat)](#-兼容性)
[![platform](https://img.shields.io/badge/platform-DeepSeek%20Harness-0ea5e9?style=flat)](https://github.com/deepseek-ai/deepseek-harness)
![language](https://img.shields.io/badge/language-JS%20plain-F0DB4F?style=flat&logo=javascript&logoColor=000)

**中文** · [English](README.en.md)

</div>

---

## ✨ 功能

- **每会话独立**：会话输入区「思考 ▾」六档圆弧选择器，写入本会话档位，会话之间互不影响
- **子代理继承**：沿 `session.header.parentSession` 归属链，找到最近单独设定的会话档位
- **就近收敛**：按目标模型 `reasoningEfforts` **实际支持**的档位自动收敛（如四档模型上 中→高、最高→超高），绝不直发模型不认识的档位
- **模型选择器清理**：隐藏 DSH 原生「推理等级 >」入口与其二级面板（能力词典保留给请求链，界面不再露出）
- **双入口同写**：UI 选择器与 `set_thinking_level` 工具走同一写通道，实时生效、持久化到 profile 补丁层

## 📦 安装

```bash
dsh plugin --profile web add github:373831615/dsh-think-level
```

本地目录安装：`dsh plugin --profile web add <本目录绝对路径>`。

## 🧩 兼容性

| 项 | 支持 |
|---|---|
| **DSH 内核** | **0.2.x** —— 实测 `0.2.1-alpha.1`（开发期同时覆盖 `0.2.0-rc.2`） |
| 界面 | DSH Web（client 半 `platform: web`） |
| Node.js | ≥ 20.18.1（安装期） |

- 依赖声明：`@deepseek-ai/dsh-settings`（可选 peer，内核自带）`^0.2.0-rc.1 || ^0.2.1-0`、`@deepseek-ai/schemastery@^3.18.1`
- 内核 API 基线（均为 **0.2.x 世代**）：`agent/request` 瀑布、volatile Config、settings 表单写通道、`conversation.input.left` 插槽、`remote.session` 命名空间
- **0.1.x 未测不承诺**；0.3.x 未出、届时回归再认证

## 🧭 使用

六档从低到高（内部档位 id）：

| 思考 ▾ | 关闭 | 低 | 中 | 高 | 最高 | 超高 |
|---|---|---|---|---|---|---|
| 档位 | `off` | `low` | `medium` | `high` | `xhigh` | `max` |

- **会话输入区**（模型选择器同排左侧）：点「思考 ▾」为**本会话**选档；未设定的会话显示并跟随默认档
- **对助手说**：「把本会话思考调到超高」→ 工具 `set_thinking_level`（`action=get|set`、`target=session|default`）
- **默认档**（未单独设定的会话生效）：`set_thinking_level target=default`，或补丁层 `think-level.config.level`

## ⚙️ 生效机制

```
「思考 ▾」/ set_thinking_level
        │  （同一写通道：configForms → remote.settings → volatile）
        ▼
Config: level（默认档）+ sessions{会话id: 档位}
        │
        ▼  agent/request 瀑布（prepend，最外层=最终值）
有效档位 = sessions[本会话] ?? 沿父链继承 ?? level
        │  就近收敛到 reasoning.efforts
        ▼
每次模型调用的 reasoningEffort   （子代理继承所属会话档位）
```

- 标题生成、压缩摘要等内部调用不走该瀑布（保持便宜）
- 模型配置里的 `reasoningEfforts` 声明是**档位词典**（模型认哪几档的元数据），留给请求链使用；删掉会让六档开关失效

## 🗂 目录结构

```
think-level/
├── main.js            # Host：Config（level + sessions）+ agent/request 改写 + set_thinking_level 工具
├── client.js          # Client：会话输入区「思考 ▾」+ 模型选择器推理等级隐藏
├── cordis.patch.yml   # Loader 行（id=think-level，即设置命名空间）
├── locale/            # 显示元数据（en / zh）
├── docs/banner.svg    # 横幅
├── icon.svg           # 图标
└── package.json
```

## 🧪 开发备注

- **Client 半（client.js）存盘即生效**（client-hmr 轮询 + SSE 热替换，或刷新页面）
- **Host 半（main.js）改码受模块代际缓存约束**：同身份热替换在运行中进程里不生效，可靠做法是换包名/目录/行 id 全新身份重装，或重启内核
- 工具契约坑：`output.render(args, value)` 首参是工具入参；schemastery `z.dict(inner, sKey)` 第一参是**值** schema
- 隐藏推理等级入口的刀口：remote 命名空间方法是 getter-only 访问器，包装要打底层 `invokeRemote`

## 📄 许可证

[MIT](LICENSE)
