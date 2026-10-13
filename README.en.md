<div align="center">

<img src="docs/banner.svg" alt="think-level — per-session thinking level, six-position reasoning switch" width="720">

**Set the reasoning level per session page (Off / Low / Medium / High / Highest / Ultra). Subagents inherit their parent session's level.**

[![license](https://img.shields.io/badge/license-MIT-65a30d?style=flat)](LICENSE)
[![dsh](https://img.shields.io/badge/DSH-0.2.x-0ea5e9?style=flat)](#-compatibility)
[![platform](https://img.shields.io/badge/platform-DeepSeek%20Harness-0ea5e9?style=flat)](https://github.com/deepseek-ai/deepseek-harness)

[中文](README.md) · **English**

</div>

---

## ✨ Features

- **Per session**: a six-position arc picker ("Think ▾") in every session's composer — sessions don't affect each other
- **Subagent inheritance**: walks `session.header.parentSession` to the nearest explicitly-set level
- **Safe clamping**: each request is clamped to the levels the exact model actually supports (e.g. Medium→High on a 4-level model) — unsupported levels are never sent
- **Model selector cleanup**: hides DSH's built-in "Reasoning level" entry and its sub-panel (the capability vocabulary stays for the request path)
- **Two entrances, one write path**: the UI picker and the `set_thinking_level` tool share the same live, persisted state

## 📦 Install

```bash
dsh plugin --profile web add github:373831615/dsh-think-level
```

## 🧩 Compatibility

| | Supported |
|---|---|
| **DSH kernel** | **0.2.x** — tested on `0.2.1-alpha.1` (also exercised on `0.2.0-rc.2`) |
| UI | DSH Web (client half `platform: web`) |
| Node.js | ≥ 20.18.1 (install time) |

- Peers: `@deepseek-ai/dsh-settings` (optional, shipped with the kernel) `^0.2.0-rc.1 || ^0.2.1-0`, `@deepseek-ai/schemastery@^3.18.1`
- Kernel API baseline (all **0.2.x-era**): `agent/request` waterfall, volatile Config, the settings form write path, the `conversation.input.left` slot, the `remote.session` namespace
- **0.1.x is untested and unsupported**; 0.3.x will be certified when it ships

## 🧭 Usage

| Think ▾ | Off | Low | Medium | High | Highest | Ultra |
|---|---|---|---|---|---|---|
| level id | `off` | `low` | `medium` | `high` | `xhigh` | `max` |

- **Session composer** (left of the model selector): pick a level for **this session**; unset sessions follow the default level
- **Ask the assistant**: "set this session's thinking to ultra" → tool `set_thinking_level` (`action=get|set`, `target=session|default`)
- **Default level** (for sessions without their own): `set_thinking_level target=default`

## ⚙️ How it works

The chosen level is resolved per request (`sessions[this session]` → parent chain → default), clamped to the target model's supported `reasoningEfforts`, and written into every model call's `reasoningEffort` via the `agent/request` waterfall. Internal calls (titles, compaction) are left untouched. The model config's `reasoningEfforts` declarations are the plugin's vocabulary — deleting them disables the switch.

## 🧪 Dev notes

- **Client half (`client.js`) is live on save** (client-hmr poll + SSE hot swap, or page refresh)
- **Host half (`main.js`) is pinned by module-generation caches**: same-identity hot swap never takes; use a fresh identity (new package name + dir + row id) or restart the kernel
- Contract gotchas: `output.render(args, value)` — first arg is the tool arguments; schemastery `z.dict(inner, sKey)` — first arg is the **value** schema

## 📄 License

[MIT](LICENSE)
