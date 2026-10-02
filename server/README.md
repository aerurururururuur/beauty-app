# 桃妆后端（server/）

TypeScript + Fastify 的 HTTP 服务，给「桃妆」前端提供账号**与人设库**、天气、衣橱和对话式定妆 agent。
✏️ 2026-09-30：此处原写「给**场合美妆**前端提供账号、**任务**、天气…」——
那个前端已被桃妆整个替换（见 `vue/AGENTS.md` 文件头），`jobs`（任务）模块也早在 09-29 删了。
**27 条路由里桃妆用 23 条**（账号 2 + **人设库 10** + 衣橱 3 + agent 会话 8），完整对照表见 `vue/AGENTS.md` §7.1。
✏️ 同一天稍后：桃妆的 `/form → /result` 接上了本仓的 agent 会话链，**agent 那 6 条从零调用变成 6 条**——
所以「定妆 agent」不再只是给对话页用的，**它现在就是桃妆设计链的实现**（见下「表单那条路」）。
✏️ **又稍后：人设库落地到 `user` 模块**（`GET/POST/PATCH/DELETE /personas` + 取照片 + 读脸那 6 条）。
它以前是纯前端 `localStorage`，用户拍板搬到服务端——**照片也一起**。所以服务端多了一件
**长期保留**的东西：人设照片存 `<DATA_DIR>/personas/photos/`，**没有 TTL**，
只有用户自己删掉那份人设才消失——与 agent 会话照片的「24h 真删」是两套口径。
见 `src/modules/user/README.md`。
✏️ **再稍后：人设库多了两个「账号共用的小库」**——自建肤色档与自建特征，各两条端点（建 + 删）。
它们**没有单独的 `GET`**，搭 `GET /personas` 一起回。上面那个「人设库 6」因此变成 10。
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

服务起在 `http://127.0.0.1:3000`。**`.env` 里必须填上 `DASHSCOPE_API_KEY`**——
对话模型与出图引擎现在只接真的，没有离线档（本地纯跑 `npm test` 不需要它）。确认它活着：

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

### 2. 还有一个开关：读图分析

对话与出图**不再是开关**——填了 key 就一律走真的。只剩 `VISION_ANALYZER`：

| 想做什么 | 改这一行 | 计费 |
| --- | --- | --- |
| 让**读图分析**真的读 | `VISION_ANALYZER=real` | 按 **token** |

缺省 `off`（分析没有安全的假货——一个编出来的肤色会一路流进妆面单和提示词，见 `config.ts`）。
只有你显式打开它，才会用到这份 key 的第二处消费。

### 3. 怎么保证不误花

★ **2026-10-02：`AGENT_LLM` / `MAKEUP_ENGINE` / `WEATHER_PROVIDER` 三个开关连同各自的
假实现（`DemoLlm` / `MockEngine` / `MockWeatherProvider`）一起删了**——它们现在只在
`test/helpers/` 里当测试替身，生产代码再也拿不到。代价是**服务不再有离线档**：
没配 `DASHSCOPE_API_KEY` 就起不来。

**会花钱的入口有三个，全都要用户当场点一下**：
① 出图（`POST /agent/sessions/:id/render`，按次）；② 会话里读图（`…/analyses`，按 token）；
③ 人设库的「读脸」（`POST /personas/analyze`，按 token）。
出图那条还多一道：模型只能在对话里**提议**，服务端不执行，界面上弹一个确认框，
**用户点了**才真的生成。关掉页面或者干脆不点，都不会产生费用。
读图那两条同样是**用户点了才发**，没有"进页面就先跑一次"的自动调用。
（✏️ 此前说「出图是全项目唯一会花钱的入口」，三条都不对了。）

会话里的出图与分析次数**都没有上限**，兜底的就是上面那道「每一次都要人点一遍确认」的闸门
（✏️ 2026-09-29 前有 `AGENT_MAX_RENDERS` / `AGENT_MAX_ANALYSES` 两道配额，已随功能整条删除）。

### 4. key 没填会怎样

**启动就失败**，不会静默回落：

```
没有拿到 DASHSCOPE_API_KEY —— 出图引擎与对话模型都起不来。请在 .env 里填上(见 .env.example)。
```

这是故意的。配置错了却还能启动，是最容易拖到演示当天才炸的一类问题。

开关**取值**写错走的是同一条路：`VISION_ANALYZER=on` 或者拼错一个字母，服务同样
**启动即失败**，报错会列出这一项的全部合法取值。以前不是这样——以前它悄悄回落，
于是"以为自己开着真读图、对面其实什么都没发生"。

想换端点改 `DASHSCOPE_API_HOST`，想换对话模型改 `AGENT_MODEL`，实测候选见 `npm run probe:tools -- --list`。

key 不会进 `ServerConfig` 对象，所以任何一次 `app.log.info(config)` 式的调试都打不出它。
`test/agent-llm.test.ts` 钉着这一点。

## 运行形态

★ **2026-10-02 起只有一种**：对话走 `DashScopeLlm`、出图走 `ImageEngine`，都要 `DASHSCOPE_API_KEY`。
曾经有过"离线演示"那一档（缺省 `AGENT_LLM=mock` + `MAKEUP_ENGINE=mock`），连假实现一起删了——
假件搬进 `test/helpers/` 当测试替身，生产代码再也拿不到它们。
`VISION_ANALYZER`（读图，缺省 `off`）是唯一剩下的开关。

★ **出图需要一份妆面单 `LookSpec`，而全项目只有 `propose_look` 产出它。**
桃妆的 `/form` 提交走的就是本仓的 agent 会话链（`POST /agent/sessions` 带初始 brief → 传照片 → 发一句话），
所以**表单提交同样能出真图**，它和对话页是同一条路。真正会明确报错（而不是瞎编一套妆）的，只有绕过 agent 直接调引擎。

★ **`propose_look` 成功时服务端同时存下两样东西**：`lookSpec`（用来出图）与
`plan`（步骤 / 色号 / 产品 / 个性化，由 `modules/styling` 展开），前端 `/result` 渲染的是后者。
理由只有一条：**两次调用就会有两个决定**，而用户会拿方案当成对成片的承诺——
一次调用、一个决定、两样产出，一致性由结构保证。
见 `src/modules/styling/README.md` 与 `agent/README.md` 的 `propose_look` 那一节。


## 常用命令

在 `server/` 下：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式，改代码自动重启 |
| `npm run build` | 编译到 `dist/` |
| `npm run start` | 跑编译产物 |
| `npm test` | 全部单测 |
| `npm run typecheck` | `tsc --noEmit`，只覆盖 `src/` |
| `npm run typecheck:scripts` | `scripts/` 那份单独的 tsconfig |
| `npm run typecheck:test` | `test/` 那份单独的 tsconfig（2026-09-29 加）。⚠️ 前三者**缺一不可**：`test/` 此前掉在**所有** tsconfig 之外，假实现少一个方法也照样全绿 |
| `npm run import-products` | 从源 docx 重新生成产品库内容，见 `scripts/README.md` |
| `npm run probe:tools` | 试对话模型的工具调用能力。`--list` 只列模型，`--dry-run` 不发送请求 |
| `npm run probe:agent-prompt` | 提示词变体的单变量对照实验，`--dry-run` 零成本 |

★ 两个 probe 词条不带参数跑都会花钱。

## 常见坑

**中文 Windows 的 PowerShell 5.1 里日志是乱码**，比如业务错误那句人话会变成
`鏈嶅姟鏆傛椂涓嶅彲鐢?…`。日志本身没错，写出去的是正确的 UTF-8，是终端按 936（GBK）在解它。
别去改日志的编码，那是把错怪在没做错的一边。让这个窗口改读 UTF-8：

```powershell
chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

每次开窗都要敲，真要顺就写进 `$PROFILE`。PowerShell 7 默认 UTF-8，没这问题；Git Bash 和 CI 也没有。
它只咬「中文 Windows + PS 5.1」这一个组合。

★ **启动自检与请求那几行是**故意写成 ASCII 英文的（`[analyzer] vision OFF (…)`、
`POST /api/agent/sessions 201 8ms`），就是为了让它们**在解错码的终端里也读得出来**。
所以就算你懒得敲 `chcp`，请求也看得见；花掉的只剩业务错误那几句人话。
请求日志一个请求**一行**：`方法 路径 状态 耗时`，4xx 走 warn、5xx 走 error。
（框架自带的那套两条 JSON 已关掉——见 `src/app.ts` 里的 `logController`，别把两边都开着。）

**上传大图失败**看 `MAX_UPLOAD_MB`，缺省 25。框架级错误（超限 413、空 body、坏 JSON……）
**保留它自己的状态码**，但错误体是**同一个信封**：`{ error: { code: 'HTTP_ERROR', message } }`。
没挂上的路由（404）同理——此前 fastify 缺省那套 `{ message, error, statusCode }` 会让前端
取到字符串 `"Not Found"` **直接显示在界面上**。
★ 那个 `message` **恒是中文**：fastify / zod 给的都是英文原文，而前端把它**原样**打在输入框旁边，
所以 `error-handler.ts` 与 `zod-issues.ts` 各有一张表逐条翻；表里没有的也回中文、原文进日志。
⚠️ **那条 25 MB 管不着人设照片**：走 `/personas` 的那张脸是 **JSON 里的一串 dataURL**
（不是 multipart），上限在 `persona.validator.ts` 的 `MAX_PHOTO_BYTES`（1 MiB），
比它更外面还有一道路由 `bodyLimit`。两个都要改才动得了这个上限——
**只改一个的坏法是 413 而不是那句人话的 422**。

天气一律实拉（open-meteo，免费、无 key）。断网时 `/api/weather` 回 502，
前端**整块不带 `weather` 提交**——那是诚实的空，不是缺件（✏️ 2026-10-02：`WEATHER_PROVIDER=mock` 那一档已删）。

**改了 `.env` 要重启服务**。`loadDotEnvIfPresent()` 只在启动时读一次，不是热加载。
