# 场合美妆后端（server/）

TypeScript + Fastify 的 HTTP 服务，给「场合美妆」前端提供账号、任务、天气、衣橱和对话式定妆 agent。
前后端都跑在 Node.js 上，没有数据库，没有 Docker，没有 Python。

**这份文档只讲怎么把它跑起来、怎么配。** 其余的事在别处：

| 想干什么 | 去哪看 |
| --- | --- |
| 架构、分层、HTTP 契约、错误码、测试清单 | [`docs/architecture.md`](../docs/architecture.md) |
| 某个模块内部怎么改 | `src/modules/<模块>/README.md`，每个模块都有一份 |
| 当初为什么这么选 | `docs/plan/` 下的设计文档 |
| 连 Node 都还没装 | [`docs/环境搭建-Windows版.md`](../docs/环境搭建-Windows版.md) |
| 每一项配置的详细注释 | `.env.example`，注释就写在配置旁边 |

技术栈：Node.js ≥ 22、TypeScript、Fastify 5、zod、Vitest。没有别的。

## 快速开始

在 `server/` 目录下执行：

```bash
npm install
cp .env.example .env
npm run dev
```

服务起在 `http://127.0.0.1:3000`。`.env` 不改也能跑，缺省配置全部离线。确认它活着：

```bash
curl -s http://127.0.0.1:3000/api/health
```

★ **命令要在 `server/` 下执行，`.env` 也要放在 `server/` 下。** 程序按当前工作目录找 `.env`，
从仓库根跑 `node server/dist/index.js` 会找不到它，然后你会以为配的开关没生效。`npm run dev` 已经切对了目录。

## 怎么填 API key

只有阿里云百炼（DashScope）这一件事要花钱。一个 key 同时管**对话模型**和**真实出图**，不用分别配。

### 1. 建 key

到 <https://bailian.console.aliyun.com> 建一个 API Key，填进 `server/.env`：

```ini
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
```

⚠️ 华北2（北京）和新加坡的 Key 不通用。在一个区建的 Key 拿到另一个区的端点上会返回 401。

### 2. 打开要用它的开关

只填 key、不改开关，等于什么都没发生。两个开关各自决定这份 key 被谁用：

| 想做什么 | 改这一行 | 计费 |
| --- | --- | --- |
| 让**对话**用真实模型 | `AGENT_LLM=dashscope` | 按 **token** |
| 让**出图**真的生成 | `MAKEUP_ENGINE=image` | 按 **次** |

两个都改就是全真。只改一个也完全正常，比如只想试真实对话、图仍走离线骨架。

### 3. 怎么保证不误花

缺省值一律选不产生账单的那个，`AGENT_LLM` 和 `MAKEUP_ENGINE` 缺省都是 `mock`。
只有你显式改了开关，才会用到 key 和钱。

出图是全项目唯一会花钱的入口，而且分两步：模型只能在对话里**提议**，服务端不执行；
界面上弹一个确认框，**用户点了**才真的生成。关掉页面或者干脆不点，都不会产生费用。

单会话出图次数有上限，`AGENT_MAX_RENDERS` 缺省 3。这条不是为省钱，是防失控：
没有上限时模型可以一直要，用户点烦了就会闭眼点，那时「每次确认」这道闸门就名存实亡了。

### 4. key 没填会怎样

**启动就失败**，不会静默回落：

```
AGENT_LLM=dashscope 但没有拿到 DASHSCOPE_API_KEY。请在 .env 里填上…
MAKEUP_ENGINE=image 但没有拿到 DASHSCOPE_API_KEY。请在 .env 里填上…
```

这是故意的。配置错了却还能启动，是最容易拖到演示当天才炸的一类问题。
要临时回到离线，把开关改回 `mock` 就行，不用删 key。

想换端点改 `DASHSCOPE_API_HOST`，想换对话模型改 `AGENT_MODEL`，实测候选见 `npm run probe:tools -- --list`。

key 不会进 `ServerConfig` 对象，所以任何一次 `app.log.info(config)` 式的调试都打不出它。
`test/agent-llm.test.ts` 钉着这一点。

## 三种运行形态

| 形态 | `.env` 要改的 | 花钱 | 说明 |
| --- | --- | --- | --- |
| **离线演示**，缺省 | 无 | 否 | 全流程能走通，包括那个出图确认框 |
| **真对话 + 假图** | `AGENT_LLM=dashscope` + key | 按 token | 妆面是真的，图还是原图 |
| **全真** | 上面再加 `MAKEUP_ENGINE=image` | token + 按次 | 表单那条路在这个形态下不可用，见下 |

★ **`MAKEUP_ENGINE=image` 会让表单路径 `POST /api/jobs` 不可用。** 真实引擎需要一份妆面单
`LookSpec`，而表单从来不传它，所以那条路会明确报错，不是瞎编一套妆。这个形态下能出真图的只有
对话 agent 那条路：agent 先定出妆面，再交给引擎。

★ **`AGENT_LLM=mock` 是一段脚本，不是模型。** 它读会话状态决定下一步——定下妆面了没有、
有照片了没有、上次出图成没成——所以同一个进程里开个新会话就能从头再演一遍。
它存在的理由很具体：空的 mock 永远走不到确认出图那一步，于是这条全项目唯一花钱的链路，
在最安全的缺省配置下一次都跑不起来，而它恰恰是最需要能离线复现的那条。

别拿它判断妆面质量，也别拿它当「模型会怎么回话」的证据。它除了一张写死在代码里的场合关键词表，
不解析任何语义，也写不出 `brief` 里那几项结构化字段，只会把用户的话原样塞进 `sceneText`。
那件事只有 `AGENT_LLM=dashscope` 能给出。

起服务时会打一行日志说明当前是不是离线配置，免得现场分不清对面是真模型还是那段脚本。

## 常用命令

在 `server/` 下：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式，改代码自动重启 |
| `npm run build` | 编译到 `dist/` |
| `npm run start` | 跑编译产物 |
| `npm test` | 全部单测 |
| `npm run typecheck` | `tsc --noEmit`。⚠️ 不覆盖 `test/`，见 [`docs/architecture.md` §8](../docs/architecture.md) |
| `npm run typecheck:scripts` | `scripts/` 那份单独的 tsconfig |
| `npm run import-products` | 从源 docx 重新生成产品库内容，见 `scripts/README.md` |
| `npm run probe:tools` | 试对话模型的工具调用能力。`--list` 只列模型，`--dry-run` 不发送请求 |
| `npm run probe:agent-prompt` | 提示词变体的单变量对照实验，`--dry-run` 零成本 |

★ 两个 probe 词条不带参数跑都会花钱。

## 常见坑

**中文 Windows 的 PowerShell 5.1 里日志是乱码**，比如 `[products] 宸插姞杞?…`。
日志本身没错，写出去的是正确的 UTF-8，是终端按 936（GBK）在解它。别去改日志的编码，
那是把错怪在没做错的一边。让这个窗口改读 UTF-8：

```powershell
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

每次开窗都要敲，真要顺就写进 `$PROFILE`。PowerShell 7 默认 UTF-8，没这问题；Git Bash 和 CI 也没有。
它只咬「中文 Windows + PS 5.1」这一个组合。

**上传大图失败**看 `MAX_UPLOAD_MB`，缺省 25。框架级超限会保留 `413`，不走我们那套
`{ error: { code, message } }` 错误体，前端要两种都认。

**现场断网演示前**把 `WEATHER_PROVIDER` 改成 `mock`。天气是唯一一项缺省就实拉的配置，
实拉免费，但断网时它会让 `/api/weather` 回 502。

**改了 `.env` 要重启服务**。`loadDotEnvIfPresent()` 只在启动时读一次，不是热加载。
