/**
 * agent/domain/schemas/entities/session.ts —— 会话状态的形状(zod 单源)。
 *
 * 实体在 `../../entities/session.ts`,那边**一个字段都不声明**(同 `message.ts` 的口径)。
 * 品牌的由来见 `./message.ts` 的文件头 —— 这里它收拢的是同一件事:
 * **会话的写入只能经 `session.ts` 那几个具名函数**(§8「实体是只读快照 + 具名守卫」)。
 *
 * ⚠️ **这份 schema 不解析任何外部数据**(会话在内存里,不落盘、没有持久化行),
 *   所以它只描述形状,**不含取值规则**(§4.2)。
 *
 * ★ 下面三格用 `z.custom<T>()`:**只接类型,不做任何运行时检查** ——
 *   `brief` / `lookSpec` / `styleRead` 的形状属于**别的模块**,收窄在各自的校验器里
 *   (`shared/domain/validators/brief-fields.validator.ts`、
 *   `makeup/domain/validators/look-spec.validator.ts`:它们是「类型谓词 + 复合守卫 +
 *   逐字段装配」,不是 zod)。在这里把那些形状重述一遍就是写第二份;
 *   把枚举搬进 schema 又会让那些校验器给模型看的中文文案失去落点。
 *   ★ **所以别拿这份 schema 去 `.parse` 外部数据** —— 那三格会全放行,
 *   而它长得跟别的 schema 一样,是个看不出来的假开关。
 */
import { z } from 'zod';
import type { MakeupBrief } from '../../../../shared/index.js';
import { imageRefSchema } from '../../../../shared/index.js';
import type { LookSpec, StyleRead } from '../../../../makeup/index.js';
import { ANALYZE_CASES } from '../api/agent-http.js';
import { messageSchema } from './message.js';

/**
 * 出过的一张图。★ **它是历史,不是当前状态**——
 * `lookDescription` 记的是**出这张图时**那份妆面单的说法,而不是"现在这套"。
 * 用户后来改了妆,已经出出来的那张图仍然是当时那套妆的样子,
 * 界面上必须还能这么说;**让它跟着 `session.lookSpec` 变,就是伪造了历史。**
 */
export const renderRecordSchema = z
  .object({
    /** 从 1 开始。**同时是取图 URL 里的序号**(`/renders/:seq`),因为一个会话可以出多张。 */
    seq: z.number(),
    /** 落盘后的引用(经 `SessionArtifacts` 端口)。 */
    ref: imageRefSchema,
    /** 出这张图时 `describeLook(lookSpec)` 的人话。 */
    lookDescription: z.string(),
    createdAt: z.string(),
  })
  .strict();

export type RenderRecordRow = z.output<typeof renderRecordSchema>;

/**
 * 做过的一次读图分析。
 *
 * ★ **它同时是"这个会话花过几次钱"的唯一依据**(不另存一个计数器——否则就会出现
 *   "计数器说 3 次、数组里只有 2 次"这种状态)。
 * ★ 记的是**尝试**不是**成功**:失败的调用同样已经花掉了钱(见 `analyze-image.ts`
 *   里"先记后调"那段),而只记成功等于给了一条"反复失败不计数"的免费通道。
 */
export const analysisRecordSchema = z
  .object({
    /** ★ 复用本模块 `api/agent-http.ts` 那份词表,不新造第三份(那三处的代价见那里)。 */
    kind: z.enum(ANALYZE_CASES),
    at: z.string(),
  })
  .strict();

export type AnalysisRecordRow = z.output<typeof analysisRecordSchema>;

/**
 * 本次对话里**被查到过**的一条品牌产品(来自 `read_product`)。
 *
 * ★ **它是"清单"不是"历史"**——与上面 `RenderRecord` 的关键区别就在这:
 *   `RenderRecord` 要记 `createdAt`,因为"出这张图时那套妆"是一个**过去的状态**,
 *   必须能复述当时的样子;而这里记的是"这条资料在本次对话里进过模型的眼睛",
 *   它是个**集合**,重不重要、什么时候读的都不影响它该被标出来,所以**按 id 去重、不记时间**。
 *
 * ★ **它是红线 §13-6 在客户端的落点。** 光靠模型自由文本,「品牌参考」那个角标
 *   就取决于模型怎么措辞了;而角标必须由**我们**保证。
 *   记的是"读过"而不是"推荐过"——**故意取超集**:宁可多标一条没被推荐的,
 *   也不要漏标一条被推荐的。**漏标是虚假披露,多标只是啰嗦。**
 */
export const consultedProductSchema = z
  .object({
    /** 产品 id(`read_product` 的入参)。★ 去重键。 */
    id: z.string(),
    name: z.string(),
    /** 中文类目名,给前端做「唇部彩妆」这类小字用。 */
    categoryLabel: z.string(),
  })
  .strict();

export type ConsultedProductRow = z.output<typeof consultedProductSchema>;

const sessionRowSchema = z
  .object({
    id: z.string(),
    /**
     * 归属用户。★ **不做登录态 / token**(红线 §13-5 不变),由客户端显式传,
     * 与 `cabinet` 同一口径。
     */
    userId: z.string(),
    /** 对话历史(**不含** system;见实体的文件头)。user / assistant 交替。 */
    messages: z.array(messageSchema),
    /**
     * 从对话里收敛出的已知事实。
     * ★ 形状**就是** `shared` 的 `MakeupBrief`——§7.2 对 `patch_brief` 写死了
     * 「形状即现有 `MakeupBrief`」,不另造一个字段同构的孪生类型(那会漂)。
     */
    brief: z.custom<MakeupBrief>(),
    /** 当前妆面单(`propose_look` 的产出)。还没提出过时为 `undefined`。 */
    lookSpec: z.custom<LookSpec>().optional(),
    /**
     * ★ 用户上传的**本人照片**(阶段 3 起)。`render_look` 没有它出不了图。
     *
     * ⚠️ **这是本会话里唯一一件真实个人信息**,所以它连带两条硬约束:
     * ① 存服务端、**不进 `messages[]`**(几 MB 的 base64 会让会话没法读、没法落盘);
     * ② 会话 TTL 到期**必须真删**(§10 `[I8]`,见 `SessionArtifacts.removeAll`)。
     */
    faceRef: imageRefSchema.optional(),
    /**
     * 用户上传的**风格参考图**(✏️ 读图那一轮)。
     *
     * ★ **不一定是妆容照**:人脸照、一幅画、插画、漫画分镜都算。
     *   它只被**文本化**成 `styleRead`,**不进引擎**(拍板决定,理由见 `makeup/README.md`)。
     */
    styleRef: imageRefSchema.optional(),
    /** 用户上传的**场景地点图**。只用来读 `occasion`,不进引擎。 */
    sceneRef: imageRefSchema.optional(),
    /**
     * `style` 分析的产物:一份**闭集**的妆面读数(不是一段描述,理由见 `StyleRead` 文件头)。
     *
     * ⚠️ **光存在这里等于假开关**——它必须进模型看得到的地方(`messages[]` 里那条说明,
     *   由 `analyze-image.ts` 追加),否则它只在界面上好看、对出图毫无影响。
     */
    styleRead: z.custom<StyleRead>().optional(),
    /**
     * 已出的图(按 `seq` 递增)。★ **它是"这个会话出过几张"的唯一依据**——
     * 不另存一个计数器(2026-09-29 前它还是出图配额的计数依据,配额已删)。
     */
    renders: z.array(renderRecordSchema),
    /**
     * 本次对话里查过的品牌产品(按 id 去重)。**恒在的数组**,没查过就是空数组——
     * 与 `renders` 同一形状。装配时没配产品库、或模型一次都没调 `read_product`,
     * 它就一直是空的,前端据此**整块不渲染**。
     *
     * ⚠️ **别把它退化成"从 `messages[]` 反推"**:那要解析 `tool_result` 里的 JSON 文本,
     * 既脆弱又不稳(见实体的文件头「派生出来的东西不存第二遍」——那条约束的是
     * `pendingRender` 那种**瞬时**状态;读过的产品是一份**有结构的清单**,值得存,`renders` 同理)。
     */
    consultedProducts: z.array(consultedProductSchema),
    /**
     * 做过的读图分析(按先后)。**恒在的数组**,没做过就是空数组(同 `renders`)。
     * ★ 见 `AnalysisRecord`(它是"这个会话为分析花过几次钱"的依据)。
     */
    analyses: z.array(analysisRecordSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export const sessionSchema = sessionRowSchema.brand<'Session'>();
export type SessionRow = z.output<typeof sessionRowSchema>;
export type SessionShape = z.output<typeof sessionSchema>;
