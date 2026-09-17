# scripts/ —— 离线脚本

这里的东西**不参与 `npm run dev` / `build`**,`tsconfig.json` 的 `include` 只有 `src`,
所以它们既不进 `dist/`,也不在 `npm run typecheck` 的范围里 ——
脚本有自己的 `scripts/tsconfig.json`(`noEmit`)与 `npm run typecheck:scripts`,
别指望根那条门禁能拦住脚本里的类型错。

用途是**出离线素材 / 做对照实验**,不是给流水线调用的实现。
要进流水线,先按 `docs/plan/ai-engine-api-spike.md` §4.5 的 record/replay 固化成夹具。

> ★ **一个例外,先看这里:`import-products.ts` 的产物是入库的。**
>
> 上面那条「产物落在 `./out/`,已 gitignore」**对它不成立**。本目录其余两个脚本的产物
> 是**实验夹具**(跑完看看结果就完了);`import-products.ts` 的产物是
> `products/<库>/` 那份**内容**,**进 git、被服务在启动时读**。
> 所以它不是一个"跑完看看"的实验,而是**内容生产工具** ——
> **重跑会改写被版本管理的文件**。跑之前先想清楚这一点。

## `qwen-image-makeup.ts` —— 调千问图像编辑出妆后图

拿**我们自己的照片**调阿里云百炼(DashScope)的 `qwen-image-edit-plus`,把上妆结果 PNG 落到本地。

```bash
# 1. 先在 .env 里填 DASHSCOPE_API_KEY(见 .env.example 的「千问图像编辑」一节)
# 2. 只看请求体结构,不发请求、不花钱 —— 第一次接之前先跑这个
npm run qwen:makeup -- --dry-run

# 3. 真跑(什么都不加就有缺省输入照片 + 缺省妆面稿)
npm run qwen:makeup

npm run qwen:makeup -- --template --occasion date    # 对照:只说妆、不说构图(能保住本人)
npm run qwen:makeup -- --image ./me.jpg --ref ./look.png --n 3 --seed 42 --size 1024*1536
```

- 产物落在 `./out/qwen-image-makeup/`(**已 gitignore**):`<时间戳>-<名字>-N.png` + 一份同名 `.json`。
- **`.json` 不是日志,是夹具**:记了 model / parameters / prompt / 输入 / request_id / usage。
  没有它,过两天没人说得清这张图是哪组参数出的,`api-spike.md` 要求的「同一套夹具 + 同一张评分表」
  就无从谈起。**要对比模型或改 prompt,先固定 `--seed`。**
- 接口返回的图片 URL **只活 24 小时**,脚本已当场下载落地。
- 输入照片走 **Base64** 直传,不先传 OSS —— 少一步外部依赖,照片也不落到第三方存储桶。

### 状态(别把这张表读大)

**已实测:2026-09-15 跑了 3 次真实调用**(输入都是 `scripts/assets/face-local.webp`,同一张脸、`seed=42`)。

| 那次用的提示词 | 出图结果 | 身份 |
| --- | --- | --- |
| **缺省(= 妆面稿)** | 1024×1024,白底裸肩、黑长直发 —— **图上每一句都兑现了** | ❌ **完全不是本人**,是另一个人 |
| 妆面稿 + `--keep-identity` | 又一张漂亮人像,**仍不是她** | ❌ 锚句**拉不住**稿子里的构图/背景/裸肩条款 |
| `--template --occasion date`(只说妆,不说构图) | 妆效很淡,更像磨皮 + 提气色 | ✅ **是本人** —— 围巾、发型、脸型都对得上 |

> **结论(这是本轮唯一值钱的发现):身份丢不丢,不取决于模型能不能编辑,而取决于提示词里
> 有没有「重摆构图 / 换背景 / 换服装」的条款。** 只要有,模型就当生成任务做,照片里那个人就没了;
> 只让它改妆,它就真的只改妆。
>
> 所以那句「以我本人照片为底图、只修改妆容」**挡不住后面紧接着的「极近距离特写 / 裸肩 / 纯白背景」**。
> 妆面稿作为**风格图/预录素材**成立,作为「用户本人上妆」的提示词**不成立**。

**其余实测数字**:单次 6.9–7.4 秒;`usage.image_count=1`、1024×1024;每次调用一个 `request_id`(都在 `.json` 里)。

| | |
| --- | --- |
| **已在本地核对过** | 端点 URL、`Bearer` 鉴权、请求体结构(无效 key 拿到真实 `InvalidApiKey` + `request_id`);`--dry-run` / 参数归一化 / 退出码各路径;三次端到端出图 |
| **尚未验证** | 百炼对**真人自拍**的审核会不会拦 —— 三次跑的都是网上抓的图,**没试过真实自拍**,这一格仍是空的;画质(输入只有 303×303,低于接口建议的 384px 下限);与 `qwen-image-edit` / `-max` 的对比;计费明细 |

> **「人脸审核」那一格仍是接入前的第 0 步**:这类平台通常有人脸内容审核,**现场真人自拍可能被拦**,
> 而这一格本脚本无法替代 —— 必须拿真自拍试一次。同 `ai-engine-selfhost-review.md` §6 末的口径:
> **可达性是第 0 步。**

### 网络:本机到阿里云的路由是**抖的**(已加重试)

实测同一天内:同一个主机一次 **370ms 通**,几分钟后 `Connect Timeout Error (timeout: 10000ms)`
—— 10 秒是 undici 的默认连接超时,没装 `undici` 包就改不动。结果域名
(`dashscope-*.oss-cn-*.aliyuncs.com`)同样:一次连不上,几分钟后同一域名能下 1.1MB(走了 11.6 秒)。

所以**生成请求与下载都带重试**。两处的判据不同,别混:

- **下载**:一律重试(下不下来就是白干,重试无副作用)。
- **生成**:只重试**连接阶段**的错误(`UND_ERR_CONNECT_TIMEOUT` / `ECONNRESET` / `EAI_AGAIN` 等),
  **刻意不重试整体超时**(`AbortSignal.timeout` 那个)—— 那是「已经发出去、没等到响应」,
  服务端可能已经跑完并计费,盲目重试会重复烧钱。这一格宁可手动重跑。

### 两个已处理的坑(都来自文档原文,不是推测)

1. **多图输入时,输出比例以「最后一张」为准。** 所以脚本把**本人照片压轴**,参考妆照放前面;
   prompt 里也据此措辞。反过来放,输出尺寸会跟着参考图走。
2. **`qwen-image-edit`(无后缀)是单图进单图出的简化版**,不认 `size` / `prompt_extend` / 多图输出,
   传了会报错。脚本会按模型能力**归一化参数**(而不是只打个告警然后照发)。

### 提示词从哪来(四个来源,优先级高→低)

| 来源 | 触发 | 内容 |
| --- | --- | --- |
| `--prompt-file <p>` | 显式指定文件 | 长稿改措辞走这条 |
| `--prompt <text>` | 命令行 | **整段替换**,不是追加 |
| `--template` | 开关 | 按 `--occasion` 生成(与前端同一份 `SCENE_RULES` 场合语义) |
| 缺省 | 什么都不给 | `scripts/prompts/look-sheet.txt` |

**缺省那份妆面稿存在文件里而不是代码常量里** —— 改措辞不该动代码,
也避免「代码一份、文档一份」的漂移。

> ★ **2026-09-16:这份稿子已按「只留色 / 质地 / 浓度」重写**(设计文档 §5.2 明确要求
> 「接线时那份稿子要按这条重写,**不能原样搬进去**」)。
>
> 重写前的版本(= owner 2026-09-15 给的初稿,逐字使用)里除了妆面还写了**头发**、
> **构图**(极近距离特写)、**服装**(裸肩)、**背景**(纯白工作室)——那不是「在本人照片上补妆」,
> 是一份**整幅重画**的取景单。**run 1 就是照它跑的:五官身份全换。**
>
> 现在文件里的这一行**就是 run 4 的原文**(实测身份保住 + 妆效清楚可见),
> 逐字从 `out/look-sheet-color-only.txt` 搬来,没有重新措辞——**别在这里"顺手润色"**,
> 那就把唯一一份有实测支撑的措辞改成了一个没测过的。
> 两份中间稿(`look-sheet-no-composition.txt` / 上面那份)留在 `out/` 里作对照。

`--keep-identity` 的锚句与反向提示词(`变形/换脸/改五官/改脸型`…)是两道**身份保真**的护栏:
这类编辑模型最常见的翻车不是妆难看,是**把人换了**。

> ⚠️ **2026-09-16 补记(四次实测,详见 `docs/plan/makeup-agent-design.md` §4.4)**:
> 上句里「锚句是护栏」这个说法**要打折**。四次实测的结论是:
> **① 锚句挡不住「磨皮」**——prompt 里明写「不要磨皮」、反向提示词里有「过度磨皮」,
> 四次输出**全部偏光滑**。锚句是**建议**,不是护栏。
> **② 真正决定身份的是提示词里有没有「几何词」**(放大/拉长/上扬/浓密/加长),
> 而不是有没有锚句。把几何词全删掉、只留色/质地/浓度 → **身份保住且妆效清楚可见**(run 4);
> 留着几何词、只删构图条款 → **仍然漂**(run 3)。
> 所以「**LLM 不写 prompt、模板只输出色/质地/浓度**」这条设计约束的实测依据在这里。

> ⚠️ **这份文件与服务路径无关,别把它当成服务用的那份。**
> 服务路径(`MAKEUP_ENGINE=image`)的措辞唯一来源是
> `src/modules/makeup/infrastructure/engine/prompt-builder.ts`,它按 `LookSpec` 现拼,
> **不读这个文件**。两者会漂 —— 改任一处都该看一眼另一处。
> ★ 而且 `prompt-builder` 的输出**是本项目自己重新渲染的、尚未实测过**那一版
> (run 4 那份是手写死的一套妆,没法泛化到任意 `LookSpec`);
> 它要靠 §5.4 的 record/replay 夹具 + §12.1 的实测打分来验,别默认它跟 run 4 一样好用。

---

## `import-products.ts` —— 从源 docx 生成产品库内容 ★**产物进 git**

把 `products/<库>/source/` 下的那份 Word 资料,解析成 `products/<库>/` 那份内容目录:
`library.json`(库元信息 + 匹配速查表 + 体检报告)+ 每个类目一个子目录 + 每条产品一个 JSON。

```bash
npm run import-products -- --dry-run        # 只解析、只打印,一个文件都不写。第一次跑先跑这个
npm run import-products                     # 真写(会**整体重生成**,不追加、不合并)
npm run import-products -- --docx <路径> --out <目录>
```

- **零新依赖**:docx 本质是 zip,脚本里手写了一段最小 ZIP 读取器(找 EOCD → 遍历中央目录 →
  按**本地文件头**重算数据起点 → `zlib.inflateRawSync` 解 raw deflate),只认 `word/document.xml`。
  为这一个用途引一个 zip 包不划算。
- **可重复执行**:每次整体重生成,不追加、不合并。所以**改内容的唯一正道是改源文档再重跑**——
  **别手改生成物**,那会在下次重导时全丢,而且没人记得改过什么。
- **脏数据原样入库。** 源资料自身的问题(款数三种说法、空占位条目、疑似重复、
  「色号全部剥离」其实没剥干净)**不改写、不跳过**,而是由脚本**算出来**记进 `library.json`
  的 `health` 字段。体检报告是生成的、不是人工标注的,所以「修好源文档 → 重导」会自然清零。
  服务启动时会以 `warn` 打一行摘要(见 `src/index.ts`),详单在 `library.json` 里。
- **产物形状**由 `src/modules/products/domain/schemas/content.ts` 的 zod 管。改了这里的输出、
  没跟着改那边的 schema → **服务启动即失败**(`.strict()` 会抓到)。这是故意的。

**2026-09-16 首跑结果**:57 条 / 9 类目;体检报告报出 4 类已知问题 + 2 类附带发现
(见 `products/ysl-property/library.json` 的 `health`,以及 `src/modules/products/README.md`)。

---

## `probe-tool-calling.ts` —— 验百炼的 function calling

回答**一个问题**:OpenAI 兼容端点支不支持 `tools`,**哪些模型支持**。
写它的起因是 `makeup-agent-design.md` §7.5 —— 那条结论当时只从搜索引擎摘要读到过
(摘要原话 "some models support function calling, some don't"),而 **tool calling 是整个
对话式 agent 的地基**,不成立就整个不用开工。

```bash
npm run probe:tools -- --dry-run              # 只看请求体,不发送、不花钱
npm run probe:tools -- --list                # 列该端点认得的模型(实测 252 个)
npm run probe:tools                          # 跑缺省候选表
npm run probe:tools -- --models qwen-plus,deepseek-v3
```

**测的是完整两轮,不是「回没回 tool_calls」**:① 带 `tools` 提问 → 是否回正确的 `tool_calls`;
② 把 `tool_result` 回填 → **是否能收束成最终答复**。**只过第一轮说明不了问题。**

- 产物在 `./out/probe-tool-calling/`(**已 gitignore**):`<时间戳>-summary.json`,含各模型原始响应。
  **它是夹具,下次不用重复烧这次调用。**
- 退出码:只要有一个模型能跑完整循环就是 0(接缝成立),全挂才是 1。
- 重试判据与 `qwen-image-makeup.ts` 一致:**只重试连接阶段错误,整体超时刻意不重试**。

**2026-09-16 结果:7/7 全部通过**(`qwen-flash` 847ms / `qwen-plus` 1390ms / `deepseek-v3` 1838ms /
`deepseek-v4-flash` 2434ms / `glm-5.3` 2639ms / `qwen3.8-max` 3767ms / `qwen3.5-plus` 7407ms),
工具名与参数全部正确。**§7.5 原先那条阻塞项已关闭。**

## `probe-agent-prompt.ts` —— 单变量验 system 提示词(★ 上一节的下半截)

上一节证明的是「**端点 + 模型 + 喂到嘴边的 schema**」这一层行不行;
本脚本问的是**另一件事**:接进真链路之后,**提示词**会不会让模型干脆不调工具。

起因见 `docs/plan/makeup-agent-design.md` §14.1:真模型(`AGENT_LLM=dashscope`,
`qwen-plus`)在真会话里**一个工具都不调**,把整套妆面用散文写出来 ⇒ `lookSpec` 永远空
⇒ 界面那条出图入口摆不出来 ⇒ **用户拿不到图**。当时定位到 `system-prompt.ts` 的**规则 3**,
但**每个变体只跑了 1 次**。本脚本是那一轮验证的可重复版本。

```bash
npm run probe:agent-prompt -- --dry-run              # 只看长度/概要,不发送、不花钱
npm run probe:agent-prompt -- --verify v12d          # ★ 一次调用都不发:核对
                                                     #   "代码里现在这一段 == 当时测的那一段"
npm run probe:agent-prompt -- --variant all --reps 3 # 跑全部变体各 3 次(花钱)
npm run probe:agent-prompt -- --variant v12d --reps 5
```

★★ **它跑的是真循环 + 真工具**(`AgentLoop` + 真注册表),记的不是 `tool_calls` 有几条,
而是**会话里落没落下一份 `lookSpec`**。这个区别实测是决定性的:有一版变体"工具调用了、
落下了妆面",而它是靠**替用户猜了肤色**换来的——`patch_brief` 里写死 `skinTone`,
`propose_look` 被按肤色收窄的校验器打回,再靠模型读报错改一次才成立
(工具序列:`propose_look✗ → propose_look✓`)。**只数 `tool_calls` 会把这个读成成功。**

- 产物在 `./out/probe-agent-prompt/<时间戳>/`(**已 gitignore**):每次一行 `summary.json`
  + 每个变体每轮一份完整 `messages[]`。**它是夹具**。
- 替换规则 3 那一段是**按结构找的**(`3.` 开头到下一个编号规则),不是按原文找——
  否则代码一改,脚本就在**最该还能跑的那一天**变成一句"找不到就退出"。
- `--verify` 那一格存在的理由:提示词改过之后,"代码里这段 ≠ 当时测的那段"是个**静默**的错。
  它必须**免费**——要花钱才能确认的话,没人会去确认。

**2026-09-17 结果(每个变体 `n=3`,`qwen-plus`,同一句用户原话)**:
`v11` 基线 **0/3** 落空;`v12a`/`v12c` 3/3 但**靠猜肤色**;`v12b` 2/3;
★ **采用 `v12d`:2/3,且一次都没猜肤色**。取舍与全部理由写在 `system-prompt.ts` 的 `v12` 沿革里。
