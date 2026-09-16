/**
 * agent/domain/tools/definitions.ts —— 六个工具的**给模型看的契约**。
 *
 * §7.3 第 3 条:「**工具描述是给模型看的 prompt,是产品的一部分**,
 * 要按文案对待、要有人看、要能改。」所以它们在这里,而不是散在实现文件里当注释。
 *
 * ★ **枚举与上下界全部从实体常量取,一个都不手抄**(`TONE_KEYS` / `INTENSITY_MIN` …)。
 *   手抄出来的第二份词表,是这类代码最典型的漂移点——改了 `LookSpec` 却忘了改
 *   给模型的 schema,模型就会一直提交被校验器拒绝的取值,而报错还看起来像模型的错。
 *   ⚠️ 但**结构**(哪个字段必填、嵌套怎么套)**是手写的**:
 *   `LookSpec` 是 zod schema,这里要的是 JSON Schema,仓库没有 zod→JSON Schema 的依赖,
 *   为这一处引一个包不划算。**结构漂移由测试兜**(见 `test/agent-tools.test.ts`
 *   用一份合法样例双向校验)。
 *
 * ★ 而且从阶段 3 起多了一条硬要求:任何新工具都必须能**重放**(见 `tool.ts` 约束 3),
 *   因为它可能与一个待确认的 `render_look` 同处一轮。
 */

/**
 * ★ **2026-09-16:工具集从 4 变 6。这次破例的边界写在这里,别让它悄悄扩大。**
 *
 * §7.2 立的是「工具集**小且正交**,四个」,并明确拒绝了「二十个工具」的方向。
 * 接入产品库时加了 `list_products` / `read_product` 两个,理由与边界:
 *
 * - **它服务的是同一件事的两个必要面**:`list_products` 给索引(挑),
 *   `read_product` 给全文(读)。**不是两个方向上的发散。**
 * - **两个都是只读、免费、无副作用**——`render_look` 仍是唯一有成本的那个,
 *   这条没有被稀释。
 * - **不合并成 `read_product(id?)` 的隐式重载**("不传参返回全表"):那种重载
 *   比两个显式工具更难读,而且会让"传没传参"变成一个语义开关——
 *   同 `renders.ts` 那条「宁可两个显式工具」的判断。
 * - ★ **没有第三个。** 考虑过并**否掉**了 `recommend_products(ids[])`
 *   (显式记「我推荐了这几支」、由代码校验 id 真实存在)。否掉的理由:
 *   **那个动作模型本来也做不成**——产品名只能经这两个工具进上下文,它写不出
 *   没见过的条目,所以那个工具换来的只是"把提示词能管的事改成代码管",
 *   代价是多一个工具 + 一套新状态。
 *   ⚠️ **但如果后来发现模型仍在正文里编产品名,第一个该补的就是它。**
 *   把「读过哪些产品」记进会话的是 `read_product` 的副作用(那条路不需要新工具,
 *   见 `entities/session.ts` 的 `ConsultedProduct`)。
 */

import { OCCASIONS, SKIN_TONES, SKIN_TYPES } from '../../../shared/index.js';
import {
  BROW_SHAPES,
  FINISHES,
  INTENSITY_MAX,
  INTENSITY_MIN,
  TONE_KEYS,
  WARMTH_MAX,
  WARMTH_MIN,
} from '../../../makeup/index.js';
import type { LlmToolDefinition } from '../ports/llm.js';

/** 工具名。写成常量而不是散落的字符串字面量,免得注册表和分发器对不上。 */
export const TOOL_NAMES = {
  patchBrief: 'patch_brief',
  proposeLook: 'propose_look',
  listCabinet: 'list_cabinet',
  renderLook: 'render_look',
  listProducts: 'list_products',
  readProduct: 'read_product',
} as const;

const intensitySchema = {
  type: 'integer',
  minimum: INTENSITY_MIN,
  maximum: INTENSITY_MAX,
} as const;

/** 一个「色 + 质地 + 浓度」区的 JSON Schema(三个区位共用)。 */
const zoneSchema = {
  type: 'object',
  properties: {
    tone: { type: 'string', enum: [...TONE_KEYS], description: '色相' },
    finish: { type: 'string', enum: [...FINISHES], description: '质地' },
    intensity: { ...intensitySchema, description: '浓度' },
  },
  required: ['tone', 'finish', 'intensity'],
  additionalProperties: false,
} as const;

/**
 * `patch_brief` —— 增量记录需求。**免费**,可以随时调用。
 *
 * 描述里特意写了「一次只填确定知道的」:测试里观察到模型倾向于
 * **一次把五个字段全填满**(包括自己猜的肤色)。填错肤色的后果不是难看,
 * 是 `validateLookSpec` 会按错肤色的色域收窄(§6 规矩 4),把整轮对话带偏。
 */
export const PATCH_BRIEF: LlmToolDefinition = {
  name: TOOL_NAMES.patchBrief,
  description: [
    '记录用户在这次对话里透露出的需求信息。只填用户**明确说过或明确同意**的字段,',
    '不确定的一律不填——不要替用户猜肤色、猜场合。',
    '一次只填你确实知道的那些;没提到的字段保持原样,不会被清空。',
    '用户改主意时再调一次即可,新值会覆盖旧值。',
    '这个操作免费,不需要用户确认。',
  ].join(''),
  inputSchema: {
    type: 'object',
    properties: {
      occasion: {
        type: 'string',
        enum: [...OCCASIONS],
        description: '场合。只有用户说了才填。',
      },
      sceneText: {
        type: 'string',
        description: '用户的自由描述原文(如「想要清冷一点的」)。保留用户自己的措辞,不要改写。',
      },
      skinType: { type: 'string', enum: [...SKIN_TYPES], description: '肤质。用户没说就别填。' },
      skinTone: {
        type: 'string',
        enum: [...SKIN_TONES],
        description: '肤色深浅。**这是最不该猜的一个**——用户没说就别填,猜错会让配色整体走偏。',
      },
      dress: { type: 'string', description: '穿搭一句话,如「西装 · 藏青」。' },
    },
    additionalProperties: false,
  },
};

/**
 * `propose_look` —— 产出/修改妆面单。**免费**,agent 的主要产出物。
 *
 * ★ 描述里必须说清「**只有这些字段**」以及「读不懂的诉求要明说不支持」。
 * §6 规矩 5 末 + §13 都点名盯着这条:`LookSpec` 故意没有自由文本字段,
 * 而模型遇到表达不了的诉求(「放大感美瞳」)时,**最顺手的做法就是编一个字段塞进去**。
 * 描述是唯一能提前拦住它的地方——schema 只能打回,不能解释为什么。
 */
export const PROPOSE_LOOK: LlmToolDefinition = {
  name: TOOL_NAMES.proposeLook,
  description: [
    '提出或修改一套妆面。这是你在这个对话里的主要产出物。',
    '妆面只由这些维度描述:**颜色、质地、浓度**(底妆另有冷暖偏移),没有别的。',
    '所以「眼睛放大一点」「脸显小」「拉长眼型」这类**形态**诉求,',
    '这套妆面表达不了——遇到时要用文字向用户说明做不到,不要硬塞进这几个字段。',
    '调用后你会拿到这段妆面的中文描述,把它讲给用户听,并问清楚要不要调整。',
    '这个操作免费,不需要用户确认。',
  ].join(''),
  inputSchema: {
    type: 'object',
    properties: {
      occasion: { type: 'string', enum: [...OCCASIONS], description: '这套妆服务的场合' },
      base: {
        type: 'object',
        properties: {
          coverage: { ...intensitySchema, description: '遮瑕度' },
          finish: { type: 'string', enum: [...FINISHES], description: '质地' },
          warmth: {
            type: 'number',
            minimum: WARMTH_MIN,
            maximum: WARMTH_MAX,
            description: `整体冷暖偏移,${WARMTH_MIN} 最冷、0 中性、${WARMTH_MAX} 最暖`,
          },
        },
        required: ['coverage', 'finish', 'warmth'],
        additionalProperties: false,
      },
      zones: {
        type: 'object',
        properties: {
          lip: { ...zoneSchema, description: '唇' },
          cheek: { ...zoneSchema, description: '颊' },
          eyeshadow: { ...zoneSchema, description: '眼影' },
          brow: {
            type: 'object',
            properties: {
              shape: { type: 'string', enum: [...BROW_SHAPES], description: '眉形' },
              intensity: { ...intensitySchema, description: '浓度' },
            },
            required: ['shape', 'intensity'],
            additionalProperties: false,
          },
        },
        required: ['lip', 'cheek', 'eyeshadow', 'brow'],
        additionalProperties: false,
      },
    },
    required: ['occasion', 'base', 'zones'],
    additionalProperties: false,
  },
};

/**
 * `list_cabinet` —— 读用户**自己已经有的**化妆品。**免费**。
 *
 * 这是「用户上传的信息暴露给 agent」里最实的一块:配色时优先用她手头有的色号,
 * 比推荐一堆买不到的东西有用(呼应 `roadmap.md` §9「用户『已拥有产品』从哪来」)。
 * 数据经 `CosmeticReader` 端口来,**agent 不 import cabinet 模块**(§7.1)。
 */
export const LIST_CABINET: LlmToolDefinition = {
  name: TOOL_NAMES.listCabinet,
  description: [
    '读取用户在「我的化妆品」里登记过的产品清单(名称 + 自定义特性,如色号、质地)。',
    '配色时优先参考她**手头已有**的产品,而不是凭空推荐。',
    '清单可能是空的——那是正常情况(用户还没登记),不要反复重试。',
    '这个操作免费,不需要用户确认。',
  ].join(''),
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

/**
 * `list_products` —— 读品牌产品库的**索引**(库名 + 类目 + 匹配速查表 + 每条一行)。**免费**。
 *
 * ★★ **触发条件:用户开口之后才读。这一条不能含糊。**
 *   产品推荐是**用户要的**,不是**妆容做完了我们该给的**。
 *   所以判据是「用户这一轮开口了没有」,**不是**「模型觉得这个需求跟库里的东西对得上」——
 *   后者听起来更聪明,但它等于把"什么时候谈钱"交给模型判断,妆面一做完它就会
 *   先把库读一遍备着、再顺口推两支。那是主动推销,不是这个功能要的样子。
 *
 *   ⚠️ **但"用户开口"包含"答应了模型的话头"**:人可以主动挑话头,这是允许的,也是想要的。
 *   **要分开的是"问"和"读"** —— 问,随时可以、而且该主动;读,等用户点头。
 *   文案上两句都得有,少写一句模型就会倒向一边:
 *   只写"等用户开口"→ 它连问都不敢问;只写"可以问一句"→ 它问完直接就去读了。
 *
 *   ★★ **这条读库的门,`v8` 一个字都没动**;动的是"问"那一侧:从"可以问一句"改成了
 *   **主动挑话头 + 由头触发**(沿革见 `system-prompt.ts` 的 `v8`)。
 *   ⚠️ **这两件事很容易被下一个人混成一件**——改"问"的措辞时,手一滑就会把
 *   "由头"也写成读库的理由,那样就回到了"妆面做完自动推"。**由头只买得到一句话。**
 *
 * ★ 描述里必须钉死「**只推库里有的,一个都不许编**」(红线 §13-6)。
 *   这是这套系统里模型最容易越界的地方:用户问「那我买什么好」,模型的训练数据里
 *   有的是品牌知识,顺口就能说出一个这个库里根本没有的产品。
 *   **宁可空着,不可编。** 描述是唯一能提前拦住它的地方。
 *
 * ★ 速查表那一句「**含需要注意避开的品类**」也不能省:那张表最有用的一列
 *   恰恰是负向的,模型读表时默认只看正列,不点破就会漏掉。
 */
export const LIST_PRODUCTS: LlmToolDefinition = {
  name: TOOL_NAMES.listProducts,
  description: [
    '读取品牌产品库的索引:库名、类目、一张「品类匹配逻辑速查表」,以及每条产品的一行摘要。',
    '速查表按天气/场景 × 肤质给建议,**含「需要注意避开的品类」这一列**——别只看推荐列。',
    '拿到索引后用 `read_product` 读你真正想推的那几条的完整资料。',
    '★ **要用户开口了才用这个工具。** 两种情况:用户自己问起(如「那我该买什么」',
    '「有推荐的牌子吗」),或者**你挑过话头、用户答应了**。除此之外不要调它。',
    '★★ **"妆面做完""用户提到天气/脱妆/预算"都只是"提一句"的时机,不是读库的理由。**',
    '用户还没开口的那一轮,不要先把库读出来备着——等用户真开口了你再读。',
    '★ **只能推库里真实存在的条目,一个都不许编。** 库里没有用户想要的,就直说没有,',
    '不要拿你本来就知道的别的产品顶上——用户看到的名字必须来自这个库。',
    '这个操作免费,不需要用户确认。',
  ].join(''),
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

/**
 * `read_product` —— 读一条产品的**六维度全文**(质地/妆效、核心成分、适用肤质、
 * 适用天气/场景、成分预警、社交平台用户反馈摘要)。**免费**。
 *
 * ★ **触发条件同 `list_products`**:用户开口了才读(自己问起,或答应了模型的提议)。
 *   它是同一扇门的下半截——这里再写一句,是因为模型完全可能在**别的轮次**记得某个 id
 *   就顺手读一下。
 *
 * ★ **转述「社交平台用户反馈摘要」时必须说明它出自品牌资料。**
 *   红线 §13-6 的原话是「不得伪装成用户口碑或中立评测」——而这一段恰恰**长得就像**
 *   用户口碑。模型不加限定地转述,用户会以为是我们采集的真实评价。这是本工具
 *   在文案上唯一的硬要求,不能靠模型自觉,得写在它读得到的地方。
 */
export const READ_PRODUCT: LlmToolDefinition = {
  name: TOOL_NAMES.readProduct,
  description: [
    '读一条产品的完整资料:质地/妆效、核心成分、适用肤质、适用天气与场景、成分预警、',
    '以及一段「社交平台用户反馈摘要」。',
    '`id` 用 `list_products` 给的那个 id,**不要自己编**——给错了会返回「没有这条」。',
    '★ 同样**要用户开口了才用**(自己问起,或答应了你的提议):下面这几条资料',
    '是给用户那一问准备的,不是先读出来备着的。',
    '★ 转述那段「社交平台用户反馈摘要」时**必须说明它来自品牌资料**',
    '(如「品牌资料里提到用户反馈……」),**不要讲成是真实用户评价、也不要讲成是中立测评**。',
    '资料里**没写的维度不会出现**,那是源资料的空缺,不是"这条产品没这个性质"。',
    '这个操作免费,不需要用户确认。',
  ].join(''),
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '产品 id,取自 `list_products` 返回的索引。',
      },
    },
    required: ['id'],
    additionalProperties: false,
  },
};

/**
 * `render_look` —— ★ **唯一有成本的那个工具**。真出一张图。
 *
 * ★ **它不接受任何参数,这是有意的。** 出的是**会话里当前那份妆面单**。
 *   如果让模型传一套新的 `LookSpec` 进来,就会出现这个场面:
 *   模型跟用户描述的是 A 妆,提交出图的却是 B 妆 —— **用户确认了一个他没看过的东西**。
 *   (同 §7.4.1 砍掉 CSS 预览的那条理由:虚假的确认感比没有确认更糟。)
 *
 * ★ **描述里必须说清「调用 ≠ 出图」**。§7.4 把"贵的操作由人拍板"定成了产品规则,
 *   而模型唯一能读到的规则就是这里。不说清的话它会回复用户"图已经出好了",
 *   而实际上还停在确认框上——那是**对用户撒谎**,比多花一次钱严重。
 *
 * ⚠️ **2026-09-16 补的前半截:那句示范话还得有前提。** 原来的写法只说了"调用后说这句",
 *   却把「确认之后我就开始出图」**当引文印在了这里**——而模型每一轮都读得到这段描述,
 *   于是它拿到的是一句**随时可用的句式**,不是**对一个已发生事件**的回执。
 *   实测里它就在没调工具的一轮说了出来(详见 `system-prompt.ts` 的 `v5` / `v6` 沿革)。
 *
 * ★★ **`v6` 起这段描述里不再出现那句示范话了,这是有意的。**
 *   原因是它被印在这里、又被规则 6 引一遍之后,变成了模型手里一个**随时可套用的句式**;
 *   而"什么时候不该说"永远是更弱的一条——三次真实翻车都是这么来的。
 *   现在只讲**要对用户说的事**(请求已交给他确认、要他点一下),措辞留给它自己组织。
 *   ⚠️ **别再把它写回来**:想"给模型一个示范"是最自然的冲动,而它正是这个 bug 的成因。
 *   要钉的是**条件**,不是句式;条件一共两条,见下面那段。
 *   ⚠️ 条件**不能**写成"等它返回结果之后再说":有 `pending` 时那一轮的结果
 *   **是被丢掉的**(见 `agent-loop.ts` 的 ⑦ 第 1 条,发一半会 400),模型**永远看不到**
 *   那次返回。写成"返回之后"就是一句它做不到的指令。
 */
export const RENDER_LOOK: LlmToolDefinition = {
  name: TOOL_NAMES.renderLook,
  description: [
    '给用户出成片图。**这个动作会真的生成一张图、并且按次计费**,是全流程唯一花钱的地方。',
    '★ 调用它**不会立刻出图**:系统会把这次请求交给用户确认,用户点了确认才真的生成。',
    '★ 那个确认框**由界面自己弹、自己解释**,你不需要转述它,也不要向用户交代它的状态,',
    '**不要说你已经出好了**——你还没有。',
    '★★ **一个字都别提"确认框"**:不要承诺"我这就出图"、不要说"已经交给你确认了"、',
    '也不要催他"点一下确认"。本次调用**报错时不会有任何框**',
    '(它会回你一句以「★ 这次调用**没有**弹出确认框」开头的话),',
    '而用户会照着你的话去找一张永远不出现的卡片——那时把失败原因如实讲给用户就是全部该说的。',
    '它不接受任何参数:出的就是你当前提出的那份妆面。所以要先跟用户把妆面聊定,再调用它。',
    '只在用户明确想要看成片时调用(例如说「出图」「给我看看」「可以了」),不要每轮都调。',
    '每个会话有出图次数上限,超了会失败;如果还没拿到用户的照片、或者还没提出妆面,也会失败并说明缺什么。',
    '调用后你会拿到一句结果说明,把它讲给用户听。',
  ].join(''),
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

/**
 * 全部工具定义(**全集**)。
 *
 * ⚠️ **真正发给模型的不是这一份,是注册表里装配进去的那些**(见 `registry.ts`)——
 *   `agent-loop.ts` 从 `Map` 里取 `definition`。所以没配产品库时,
 *   `list_products` / `read_product` 虽然在这个数组里,**模型根本看不到它们**。
 *   这份数组的用途是"本模块能注册的全集",给类型与测试一个单一出处。
 *
 * ★ 顺序上 `render_look` **留在最后**:它是唯一有成本的、也是"聊定了才做"的那一步,
 *   把它排在末尾让最贵的动作在模型看来是收尾而不是随手可调。
 * ⚠️ `test/agent-tools.test.ts` 会断言这份名单,加工具必挂——**这正是它存在的意义**。
 */
export const TOOL_DEFINITIONS: readonly LlmToolDefinition[] = [
  PATCH_BRIEF,
  PROPOSE_LOOK,
  LIST_CABINET,
  LIST_PRODUCTS,
  READ_PRODUCT,
  RENDER_LOOK,
];
