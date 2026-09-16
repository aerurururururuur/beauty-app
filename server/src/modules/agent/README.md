# modules/agent —— 对话 agent（阶段 3：**引擎已接上，出图要人点确认**）

把用户模糊的说法收敛成一份结构化的妆面单（`LookSpec`），用工具调用驱动，多轮对话，
最后**在用户明确同意之后**真的出一张图。

它存在的理由只有一条：**`LookSpec` 需要有人把它填出来，而填它的过程要能问、能改、能反悔。**
四次实测（设计文档 §4.4）的结论是「决定像不像本人的不是提示词写得多细，而是提示词里有没有几何词」，
所以工程上的对策是**LLM 不许写 prompt**——它只填结构化字段，措辞交给引擎侧的固定模板。
本模块就是那道闸门的**输入侧**；`propose_look` 与 `render_look` 是本模块两个有产出的工具。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/ports/llm.ts` | `Llm` 端口 + `LlmRequest`/`LlmResponse` + `LlmUnavailableError`。★ **本模块存在的技术理由**：把「线上两支工具调用协议的差异」关在适配器里，业务层不认识任何具体家 |
| `domain/entities/message.ts` | 供应商无关的消息模型（content 块）。取「块」做规范形因为它**是超集** |
| `domain/entities/session.ts` | `Session`（`messages[]` + `brief` + `lookSpec` + `faceRef` + `renders[]`）+ 纯函数工厂。★ `system` **不存**在这里（派生状态不存第二遍） |
| `domain/ports/session-store.ts` | `SessionStore`（`create`/`find`/`save`/`findUpdatedBefore`/`delete`）。★ `findUpdatedBefore(cutoffIso)` 是给 TTL 用的——传**时间戳**而不是小时数：钟在用例那边（可注入、可测），存储只管比较。仍是内存实现，**重启即丢** |
| `domain/ports/cosmetic-reader.ts` | 读衣橱的端口。★ 声明在**本模块**，实现由组装根包一层注入（不 import cabinet） |
| `domain/ports/user-directory.ts` | `exists(userId)`——开会话时校验归属用户存在。★ 与 `cabinet` 那份**同名同形但不是同一个类型**（不 import cabinet）；组装根用**同一个闭包**满足两边 |
| `domain/ports/session-artifacts.ts` | ★ 照片与成品图的端口。**底下就是 `assets` 的 `ArtifactStore`**（2026-09-16 拍板：不新写第二套照片存储），由组装根包一层注入。★ 另有 `listStored()`：**问盘上"有哪些会话目录"**（不是问会话存储），它是 TTL 清理**第二遍扫盘**的输入，用来删掉上一进程留下的孤儿 |
| `domain/tools/` | `tool.ts`（工具形状 + `ToolContext.confirmation`）+ `definitions.ts`（**给模型看的契约**，是产品文案） |
| `domain/schemas/` | `brief-patch.ts` / `agent-http.ts`（纯形状）+ `domain/validators/`（行为与中文错误） |
| `application/agent-loop.ts` | ★ **harness**。本模块唯一有真实复杂度的地方；文件头列了六条被结构钉死的不变量 |
| `application/system-prompt.ts` | 每轮现拼的系统提示（嵌当前 brief / LookSpec / 出图状态 + 七条硬规则；★ 版本号与沿革都在文件头） |
| `application/brief-description.ts` | 把"agent 现在知道什么"讲成一行字。★ 值**原样透出**，不建中文标签表（那会是第三份，见 `narration.ts` 记的教训） |
| `application/render-state-description.ts` | 把"出图走到哪一步了"讲成一行字（照片在不在 / 出过几张 / **此刻有没有确认框在等**）。★ 与视图的 `pendingRender` **同源**（都用 `danglingToolUses`），免得两边一个说有、一个说没有——模型会照提示词行事 |
| `application/tools/` | 工具的注册表（注册表**同时就是白名单**）。**没配产品库是四个，配了是六个**；`render-look.ts` 另导出 `renderConfirmationSummary`——确认框那句话的**唯一**来源 |
| `application/usecases/` | `StartSession` / `GetSession` / `SendMessage` / `AttachPhoto` / `ConfirmRender` / `GetRender` / `PurgeExpiredSessions` |
| `application/mapping/` | 会话 → 对外视图（★ 不透出 `messages[]`，理由见文件头；★ 透出 `pendingRender`，让刷新页面后确认框还在） |
| `infrastructure/llm/dashscope-llm.ts` | 阿里云百炼适配器（**实测夹具**为形状依据，不是读文档来的） |
| `infrastructure/llm/mock-llm.ts` | 脚本化假 LLM：**单测**的驱动源（按脚本顺序回话）——`AGENT_LLM=mock` 现在**不用它**，见下一行 |
| `infrastructure/llm/demo-llm.ts` | ★ `AGENT_LLM=mock` 实际用的那个：**按请求状态求值的离线演示脚本**（见下） |
| `infrastructure/memory/session-store.ts` | 内存会话存储（重启即丢，见待办） |
| `presentation/multipart.ts` | `POST …/photo` 的 multipart 解析（只认 `face` + `userId` 两个字段） |
| `compose.ts` / `index.ts` | `createAgentModule({…})` / public barrel |

## 端点

| 方法 & 路径 | 说明 |
| --- | --- |
| `POST /api/agent/sessions` | JSON `{ userId }` → **201** 会话视图。★ 用户不存在 → **404** `USER_NOT_FOUND`（**一条会话都不落库**，理由见待办里那条拍板） |
| `GET /api/agent/sessions/:id?userId=` | → **200** 会话视图（刷新页面后接着看） |
| `POST /api/agent/sessions/:id/messages` | JSON `{ userId, text }` → **200** 会话视图 + `stopReason` + 本轮 `events` |
| `POST /api/agent/sessions/:id/photo` | multipart，字段 `face`（文件）+ `userId` → **200** 会话视图 |
| `POST /api/agent/sessions/:id/render` | ★ JSON `{ userId }`，**一个出图参数都不收** → **200** 会话视图 + 本轮 `events` |
| `GET /api/agent/sessions/:id/renders/:seq?userId=` | → **200** 图片字节（`content-type` 随产物） |

响应里的 `lookDescription` 是 `describeLook` 的渲染结果。**前端必须原样展示它**，
不要自己再拼一遍——两处拼就会有两套说法，而用户是拿这段文字决定要不要花钱出图的。

**`render` 那条路由收不到任何出图参数，这是有意的。** 要出的就是用户在屏幕上看到的那一套，
而那一套已经在会话里了（`lookSpec` + `faceRef`）。让前端把参数再传一遍，
就等于给了第二条能改变"出什么"的路径，而它绕过了对话记录。

**仍然不是 SSE。** 响应已经造成事件流形状（`events[]`），是为了让 SSE 那一步只换传输、
不换契约：前端把"一次拿到全部"改成"逐条收到"即可。现在不做 SSE 是因为
**出图那 7 秒发生在确认之后的第二轮请求里**，前端那时本来就在等一个已知会长的事情——
真正需要推流的是"边想边说"，而那要等会话落盘之后再说。

失败怎么表现：

| 情况 | 错误码 | HTTP |
| --- | --- | --- |
| 会话不存在 / 不属于该用户 | `SESSION_NOT_FOUND` | 404（两者共用，不泄露存在性） |
| 成品图号不存在 / 不属于该会话 | `RENDER_NOT_FOUND` | 404（**与上一条分开**：归属已先查过，这里是真的没有那张图） |
| `userId` / `text` 缺失或全空白、text 超 1000 字 | `VALIDATION_ERROR` | 422 |
| 没有挂待确认的出图请求就调 `render` | `VALIDATION_ERROR` | 422 |
| 照片不是图片 / 没收到文件 / 缺表单里的 `userId` | `VALIDATION_ERROR` | 422 |
| 后台连不上 | **不是错误**——循环收束成一句话，并点名 `POST /api/jobs` 这条出路 | 200 |

> ★ **每一轮收束都保证有一句话给用户。** 四种收束（`timeout` / `max_iterations` /
> `max_tokens` / `refusal`）由 `agent-loop.ts` 的 `CLOSING_WORDS` 补，`llm_unavailable`
> 有自己那句；`awaiting_confirmation` 不是收束（那是"轮到你了"，提示在前端的确认框上）。
> ⚠️ `refusal` 只在**模型一个字都没给**时才补：它若自己解释了为什么拒答，
> 那句话就是回答本身，再叠一句就是**在它嘴上说话**。
> （此前 `refusal` 是唯一不补的，会落成**空气泡**，前端只好自己兜一句——那个兜底**已删除**。）

> `GET …/renders/:seq` 那条**先查会话归属、再查文档记录，最后才碰存储**。
> 顺序是有意的：反过来的话，一个不属于你的 `seq` 会先去存储里探一次，
> 而"文件在不在"本身就能被当成信息（时间差、错误文案的细微差别）。

## 六条被结构钉死的不变量

写在 `application/agent-loop.ts` 文件头，这里只列名字；**违反它们会 400 或静默丢结果**：

`[A]` assistant 那一轮原样回填 · `[B]` 每个 `tool_use` 配一个 `tool_result` ·
`[C]` 同轮结果装进**同一条** user 消息 · `[D]` 工具错误转 observation，不抛穿循环 ·
`[E]` 未知工具名也要回结果 · `[F]` 必须有迭代上限与超时

终止判据是**「有没有 `tool_use` 块」，不是 `stopReason`**：一旦不一致，只要模型吐了块就欠着一条
`tool_result` 没还，此时终止则下一轮必 400。

`[A]` 在阶段 3 有个容易看错的地方：**确认出图后的第二次请求里，那个 `tool_use` 块仍然在**。
这是对的——`[A]` 要求 assistant 那一轮逐字回填，所以"请求里没有 `tool_use`"**不是**
"没有欠账"的判据，`danglingToolUses(...)` 才是。

## 人在回路：确认出图怎么落地

生图是本项目**唯一花钱的动作**，所以它必须由人的一次 HTTP 动作触发，不能由模型在对话里"替用户点"。

```
模型调 render_look
  → 工具返回 pendingConfirmation，服务端**不执行**
  → events[] 以 tool_pending 收尾，stopReason=awaiting_confirmation
  → 前端弹出确认框（文案来自 pendingRender.summary）
用户点「确认」→ POST /agent/sessions/:id/render
  → 服务端把**那一整轮**重放一遍，这次 `confirmation='approved'` → 真出图
用户点「取消」→ 就是不发这条请求（缺省即 `declined`）
```

四个决定性的细节：

- **闸门不在模型手里。** `confirmation` 只由确认那条 HTTP 路径（和它的 `declined` 兜底）设置。
  工具描述里写了"调用不等于出图"是给模型听的，但**模型无论怎么措辞都改不了它**——
  它连"用户已经同意了"这个谎都撒不出来，因为那不经过它。
- **`pendingRender` 存进会话视图，不只活在 `events[]` 里。** 它是一个还没答的 `tool_use`
  这个**派生状态**（不存第二遍），刷新页面后确认框因此还在。
- **重放那一整轮，而不是只跑工具。** `[C]` 要求同轮结果装进同一条 user 消息，
  所以待确认的那一轮**一条结果都不发**（发了就有结果缺一块，或者要拆成两条）。
  代价是**每个工具都必须可重入**——`patch_brief` / `propose_look` / `list_cabinet`
  在重放时会再跑一遍，它们的副作用必须是幂等的（写 brief 是覆盖，读衣橱无副作用）。
- **额度查两遍。** 提议时查一遍（前端因此拿不到一个点下去必然失败的确认框），
  `'approved'` 分支**再查一遍**——提议与确认之间隔着一次用户往返，期间他完全可能又出了一张。

### ★ 别让模型转述它看不到的 UI 状态（2026-09-16 用四轮真实实测换来的）

上面那个流程里有一个**只有界面知道**的事实：**此刻有没有一个确认框在等用户点**。
模型看不到它，却一度被要求转述它——「告诉用户『确认之后我就开始出图』」。
后果实测了三遍，三种形状：**没调工具时说了** / **调了但报错时也说了**，
用户都去找一张不存在的卡片。中间试过给状态、给前提、在报错里当场提醒、撤掉句式，
**都还会漏**（沿革见 `application/system-prompt.ts` 的 `v5`–`v7`）。

最后落定的口径是**取消这项义务**：

- **那句话不再由模型说。** 确认框是界面自己弹的，文案是 `renderConfirmationSummary`
  自己写的（唯一来源），模型既不转述也不交代它的状态。**没有义务，就没有"说错时机"。**
- 提示词与工具描述里只留**禁令**：别承诺"我这就出图"、别说"已经交给你确认了"、
  别催用户点确认。并把"框不总是存在"这个理由说给它（只给禁令不给理由，它不当回事）。
- **状态还是给它**（`render-state-description.ts`），但用途变成"让它别重复提议"，
  不再是"让它播报"。
- **假后端也算产品说的话。** `demo-llm.ts` 那句提议出图的文案里原本也带着
  「确认之后我就开始出图」——它在脚本里**本来是准确的**（照片必有、调用与这句话同一条回复，
  框一定弹），**正因为准确，它最容易被当成范式抄回去**。`v7` 之后删掉，
  并在 `test/demo-llm.test.ts` 钉了一条：脚本正文不得出现转述确认框的句式。
- `render_look` **每一个失败分支**都缀着 `NO_CONFIRMATION_NOTICE`
  （见 `domain/tools/observations.ts`）：模型手里正拿着的那句 `tool_result`，比上文里的
  规则近得多。★ 同一招也补在了 `propose_look` 的校验失败上——实测里它报错后
  **没重试，却在正文里把一套妆面讲成已定**，`lookSpec` 一直是空的，
  直到"出图"那一轮才在 `render_look` 那里塌下来。**失败的文案必须把"什么都没发生"说在最前面。**
- ⚠️ **如果这一支还会复现，下一步是改代码不是改措辞**（判据与备选方案写在 `v7` 的沿革里）。

## 产品推荐：**问和读是两件事**

人拍板的口径，一天内改过一次，两次的错法**方向相反**——所以两个方向都得钉：

- **读**（`list_products` / `read_product`）**必须等用户开口**。推荐是**用户要的**，
  不是**妆容做完了我们该给的**。判据是「用户这一轮开口了没有」，
  **不是**「模型觉得这个需求跟库里的东西对得上」——后者听着更聪明，
  但它等于把"什么时候谈钱"交给模型判断，妆面一做完它就会先把库读出来备着。
  这条与红线 §13-6 直接相关。
- **问**（挑话头）**可以主动**，而且该主动。`v7` 之前写的是「妆面定下来之后，你可以问一句」
  ——**一次都没触发过**：它是个许可，而同一轮里压着"要不要出图""先给我一张照片"这些更硬的活。
  **许可输给义务**，和确认框那边那句"可以告诉用户"是同一种死法。
  `v8` 起改成**两种触发**：① 提出妆面那一条回复里**必须**撂一句（时机确定，
  所以不需要新增会话状态）；② 用户**这一轮自己**带来由头（天气、脱妆、预算、过敏、问价）
  且库里真有对得上的品类时，就地再提一句。

⚠️ **"由头"是这套东西里最接近推销的地方，也是分界线所在**：由头是模型自己判的，
它想推的时候总能找到由头。所以配套钉了三条**逐条可查、不靠计数**的约束：
**不许自己制造由头**（她没提天气就不许拿天气说事）、**没对上就不提**、
**同一个由头只说一次、她没接就不再提**。
★ **刻意没有写"整场最多 N 次"**：那要求模型数得清自己说过几次，而我们没有这个状态
——**给义务不给状态**正是确认框那边翻车的形状。**用由头当闸门，不用计数当闸门。**
⚠️ 实测里若它开始在没有由头的轮次也提，下一步是把"由头"**收窄成一张白名单**，
或把这道理序挪进代码；**不是**再补一句"别太频繁"。

★ **由头只买得到一句话，买不到一次读库。** 改"问"的措辞时手一滑就会把由头也写成读的理由，
那样就回到了"妆面做完自动推"。

## 工具

| 工具 | 成本 | 作用 |
| --- | --- | --- |
| `patch_brief` | 免费 | 增量记录需求（场合/肤质/肤色/穿搭/自由文字）。**没有 `weather`**——天气不是问出来的 |
| `propose_look` | 免费 | 产出 `LookSpec`。★ 主产出物；自由文本诉求在这里被挡回（§6：开了这个口子身份保持就形同虚设） |
| `list_cabinet` | 免费（一次 IO） | 读用户**已有的**化妆品，配色优先用她手头有的 |
| `render_look` | ★ **按次计费** | 出成品图。**必须经用户确认**（见上一节）；缺妆面 / 缺照片 / 超额都在这之前挡回 |

`render_look` 的前置条件（缺 `lookSpec`、缺 `faceRef`）在**提议阶段就查**，
不是在用户点完确认之后才说"不行"——那是最坏的一种交互：用户已经做了决定，
系统却在他决定之后才说自己没准备好。

## 依赖 / 被依赖

- 依赖：`shared`（`MakeupBrief` / `AppError` / `ErrorCode` / `ImageRef` / ★ `briefFields`）、
  `makeup`（`LookSpec` 契约 + `validateLookSpec` + `describeLook` + **`Engine` 端口**）、zod。
- **不依赖 `cabinet` / `assets` / `user`**：读衣橱、存取照片与产物、查用户是否存在
  都走**本模块自己声明的端口**，实现由**组装根**（`src/index.ts`）包一层注入（§7.1）。
  依赖图仍无环、模块间仍零 import。
- ★ **依赖方向 agent → makeup**：引擎不 import 本模块。§8.1 拍板**引擎的第一个消费者就是本模块**
  （不再先接给 `jobs` 表单路径），所以 `makeup` 的 `Engine` 端口是为此而留的。
- 被依赖：`src/index.ts`（组装）、`src/app.ts`（挂路由）。

## 开关与接线

- `AGENT_LLM=mock`（**缺省**，离线、不出账单）| `dashscope`（真实模型，按 token 计费）。
  ★ 缺省是 `mock` 而不是实拉，与 `WEATHER_PROVIDER` 缺省 `open-meteo` 相反，理由是**花钱**：
  缺省值必须是"不会意外产生账单"的那个。现场演示要用真模型就显式写 `AGENT_LLM=dashscope`。
  ★ **`mock` 走的是 `DemoLlm`——一段脚本化演示，不是"回一句演示模式"。**
  它读请求里的状态（定下妆面没有 / 有照片没有 / 上次出图成没成）决定下一步，
  于是能演完「需求 → 妆面 → 照片 → 确认出图」整条链，**包括确认框那一段**。
  改掉这一点上的旧行为是有具体原因的：原来的空脚本**永远走不到 `awaiting_confirmation`**
  （回复里没有 `tool_use`），于是全项目唯一花钱的那条链路，在缺省配置下**一次都跑不起来**。
  ⚠️ 它**不是模型**：除了一张明写在代码里的场合关键词表，它不解析任何语义，
  所以**不能拿它判断妆面质量**，也不能拿它当"模型会怎么回话"的证据。
  ⚠️ 它也写不出 `brief` 的结构化字段，只能把用户那句话原样塞进 `sceneText`——
  mock 下 `brief` 看着"薄"是**脚本的局限，不是 bug**。
  ★ **被拒之后不再提议**：用户点了「先不出图」，它接一句"我们接着调"，**再聊一句也不会
  又弹一个确认框**——那条线以「脚本演完了」收尾。**宁可明说演完了，也不重复提议**：
  重复提议会让用户点完拒绝立刻又看到一个确认框，而那和没有确认框一样糟。
  `MockLlm`（按脚本顺序回话）**没有删**，它是单测的驱动源，测试直接 `new` 它。
  整条链路的自动化证据在 `test/demo-llm.test.ts`。
- `AGENT_MODEL`（缺省 `qwen-flash`，实测 847ms 跑完整两轮工具调用）/ `AGENT_BASE_URL`（一般不用改）。
- `AGENT_MAX_RENDERS`（缺省 3，`0` = 不限制）：§10 `[I3]` 的单会话出图上限。
  ★ 上限的理由**不是省钱**（一张才几分钱），是**防失控**：没有上限时模型可以一直要，
  用户点烦了就会开始闭眼点——那时"每次确认"这道闸门就名存实亡了。
- `AGENT_SESSION_TTL_HOURS`（缺省 24）：§10 `[I8]` 的会话寿命，到期**真删**照片与成品图。
  ★ 它不是调优参数，它同时是"用户本人的照片在服务端最多留多久"这个承诺，
  **改大它等于改隐私条款**。要让清理更勤是改 `src/index.ts` 的 `PURGE_INTERVAL_MS`，不是改这一项。
- `DASHSCOPE_API_KEY` 为 `dashscope` 时必填，**缺 key 启动即失败**，不留到第一次对话才炸。
  ★ key 不进 `ServerConfig`（见 `config.ts` 里 `readDashScopeApiKey` 的注释）——那个对象会被传进
  `buildApp` 并挂在 `app` 上，任何一次调试式日志都会把它打出来。
  ★ 它**同时也是出图的 key**：`AGENT_LLM=dashscope` 与 `MAKEUP_ENGINE=qwen` 走同一个 key、同一个域名开关。

## 照片与产物落在哪

| 端口这边 | `ArtifactStore` 那边 |
| --- | --- |
| 照片 | `inputs/<sessionId>/face/<随机名>` |
| 第 n 张成品图 | `results/<sessionId>/r<n>/result.<ext>` |
| 引擎写的中间产物 | **收编之后删掉**——⚠️ **只删确实落在 `engineOutDir` 里的那些**（见下） |
| 删一个会话 | `remove(<sessionId>)`（递归，连上面两者一起删） |

映射规则与"为什么必须嵌 `r<seq>` 那一层"记在 `src/session-artifacts.ts`（**不在本模块里**——
那是组装根那类代码，`agent` 一行都不该知道 `ArtifactStore` 长什么样），并有测试对着真盘钉住。

★ **为什么收编之后要删源文件**：引擎把成品写在 `<DATA_DIR>/engine-out/<时间戳>.png`，
而那张图**就是用户的脸上了妆**，且**不归任何会话**——清理任务永远枚举不到它。
不删的话，`[I8]` 那句"照片与产物被真实删除"就是**假的**：会话那份删了，副本永远留着。

⚠️ **但那一下删除必须带边界**，否则会删掉用户的照片——**这不是假想的**：
`MockEngine` 返回的 `resultFilePath` **就是 `input.face.filePath`**（它不出图，只把输入当输出），
而那个路径在 `inputs/<sid>/face/` 下。所以只有落在引擎输出目录里的源文件才删，
别的一律不动。边界与那道"前缀相近不算"的规矩都有测试
（`★★ 源文件不在引擎输出目录里 → 一个字节都不许动它`）。

⚠️ `jobs` 那条路**不走这个适配器**，它的中间产物照旧只增不减（`jobs` 已冻结、`qwen` 下表单路径
不可用，所以当前没有真实泄漏，但**别当它已关闭**）。细节与那个 `MAKEUP_FIXTURES_DIR`
的配置坑记在 `modules/makeup/README.md` 的待办里。

★ **照片的字节永远不进 `messages[]`。** 会话里只有 `faceRef`（一个带 `storeKey` 的引用），
模型看到的是"用户已经上传了照片"，看不到图。上传之后循环会往会话里补一条说明，
那是给模型的状态，不是给用户的对话。

## 待办（阶段 3 剩下的）

- [x] ~~`render_look` 工具 + 人在回路确认~~ —— **2026-09-16 完成**（工具 + 服务端确认回合 + 6 条路由）。
      前置的 `prompt-builder` + 引擎也已在 `makeup` 里落地，两边同时上的。
- [x] ~~TTL~~ —— **2026-09-16 完成**：`PurgeExpiredSessions` 用例 + 组装根那段 `setInterval`
      （`PURGE_INTERVAL_MS`，**用例自己不调度**，否则测试里没法"只跑一次"）。
- [ ] **SSE**：把已经造好的 `events[]` 从"一次返回"改成"逐条推"。
      ⚠️ 现在**不阻塞前端**：真正慢的那一步（出图 7 秒）在 `POST …/render` 里，
      而那是一次用户已经点了确认的等待。**不要为了 SSE 提前把契约改复杂。**
- [ ] **会话落盘**。⚠️ 它现在**同时是两个问题的解**：
      ① 重启即丢；② 多实例部署（现在两台机器各持一半会话）。
      （此前还有第 ③ 条「TTL 缺口」——**那条已单独关掉**，不必等它，见下。）
- [x] ✅ **TTL 缺口已关（2026-09-16）：重启后上一进程留下的照片没人认领。**
      会话在内存里，进程一重启那些照片**没有任何会话能枚举到**，清理任务扫不出来 ——
      此前 `[I8]` 只在"没重启过"的前提下成立。
      现在 `PurgeExpiredSessions` 扫**两遍**：第一遍顺会话记录找（原来那遍），
      第二遍**从盘反查**——`SessionArtifacts.listStored()` 列出盘上现有的会话 id，
      `sessions.find(id)` 找不到的就是**没人认领的残骸**，`removeAll` 真删。
      ★ 原文写的是"随会话落盘一起关掉"，那是把一条**隐私承诺**挂在一个功能排期上：
      重启是常态（开发、发版、崩溃），而承诺是"最多留 24 小时"，不是"最多留到我们做完落盘"。
      ⚠️ 落盘之后第二遍**仍要保留**：那时它从"唯一手段"变成"兜底自愈"。
      ⚠️ 第二遍**不判过期**：没有会话认领的目录**永远不可达**，早删只有好处；
      也正因此不必拿目录 mtime 当"年龄"（跨平台语义不一致，是个会骗人的近似）。
- [x] ✅ **2026-09-16 收口三条（本轮小修）**：
      ① **`zodIssuesMessage` 上提到 `shared`**——jobs / user / weather / cabinet 四份逐字相同的副本
      合成 `shared/domain/validators/zod-issues.ts`。★ 本模块那份 `describeIssues` **没有**跟着合并，
      而且不该并：它给**模型**看（错误会回填成 observation），必须带上合法取值清单；
      shared 那份给**人**看（HTTP 错误体）。**两份的消费者不同 ⇒ 不是重复。**
      ② **简报字段共用一份**（`shared/domain/schemas/brief-fields.ts`）——`patch_brief` 的
      `briefPatchSchema` 与 `POST /api/jobs` 的 `metaSchema` 现在铺开的是同一份字段定义，
      一致性由 `test/schemas.test.ts` 的**表驱动对拍**钉住（**故意不靠注释维持**）。
      只共用**字段**，不共用对象：`jobs` 多一个 `weather`，两边各自留 `.strict()`。
      ③ **`refusal` 收束补话**（见上面那张 stopReason 表）——它此前是四种收束里唯一不补的，
      用户看到的是一个**空气泡**，前端只好自己兜一句；现在服务端补，**前端那个兜底已删**。
- [x] ✅ **`POST /agent/sessions` 的 userId 校验（2026-09-16 拍板：做，走端口）。**
      此前标着"仍未定"，两个候选是「补 `UserDirectory` 端口」与「让 `list_cabinet` 报错就够了」。
      **选了前者**，理由按分量排：
      ① **仓库已经答过一次这个问题**：同样会把 userId 存进数据的 `cabinet` 就是这么做的
      （端口文件自己写着「否则条目会变成孤儿」）。而全仓库**只有两个模块存 userId**——
      `agent` 与 `cabinet`（`jobs` 根本没有 userId）。**不校验的那个才是少数派。**
      ② ★ **原来那条不是"无害"，是"更坏的一种失败"**：ghost 用户拿到 201 后能正常聊，
      直到模型调 `list_cabinet`——`ListCosmetics` 对不存在的用户**刻意**报 `USER_NOT_FOUND`
      （它不装作"衣橱是空的"），那个错误按 `[D]`/`[E]` 回填成 observation 喂给模型，
      而**模型改不了它**（不是参数写错，是状态不存在）⇒ 空转，正是本模块
      `validators/validate.ts` 文件头点名的那个成因。**开局 404 比聊到一半报错诚实。**
      ③ 一旦「会话落盘」落地，ghost 会话还会变成盘上的持久记录。
      **落法**：`domain/ports/user-directory.ts`（本模块自己声明，不 import cabinet，§7.1，
      所以它**不是** `shared` 该收的那种重复——两份是**两个消费者各自的声明**）；
      检查在 `StartSession` 里、**建实体之前**；`AgentModuleOptions.userExists` **必填**
      （缺省成 `() => true` 就等于"检查静默消失"，而这轮刚踩过一次这种坑）。
      ★ 组装根把**同一个** `userExists` 闭包同时给 `cabinet` 与 `agent`（见 `src/index.ts`：
      它必须只有一份，因为"只把 `USER_NOT_FOUND` 翻译成 `false`、其余照抛"是个判断）。
      ⚠️ **这不是鉴权**：无令牌（红线 §13-5），userId 本来就是客户端的一句声明，
      它挡的是**孤儿**，不是冒用。
      ⚠️ **注意它与上面那条"重启残骸"不是一件事**（曾经被混为一谈过）：那条是
      **存储里有、会话认领不到**（隐私问题，已关）；这条是**会话指向的用户不存在**
      （卫生问题，无越权风险——会话仍只能由同一个 userId 取到）。
      两条的唯一共同点是都跟"孤儿"沾边。
- [ ] LLM 调用的 record/replay 夹具（设计文档 §11：形状依据是实测，而实测会随平台方改行为失效）
- [ ] **类型推断表是第二份拷贝**（`presentation/multipart.ts` 的 `EXT_MIME` vs
      `jobs/presentation/multipart.ts` 的那份）。它不是外部依赖也不是业务规则，就七个扩展名；
      要合成一份得先在 `assets` 的 barrel 上开口子。**等第三处出现时再合**——
      那时它才有第二个调用方之外的正当性。
