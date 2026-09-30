/**
 * domain/schemas/api/products-view.ts —— ★ 对外 API 契约 / DTO。
 * 前后端以此联调;类型唯一真源。presentation 直接返回这些形状,
 * application 只负责把领域对象映射过来(见 `application/products-view.ts` 的后半)。
 * 不引入网络/框架类型,保持纯数据。
 *
 * ★ 形状的单源是下面这几份 schema,`…View` 由它们 `z.output` 推出(§4.1)。
 *
 * ★★ **为什么产品库有 HTTP 面了。** 这个模块此前一条出口都没有(`presentation/README.md`
 *   当年论证过"预计长期为空")——那是**当产品库只服务 agent 时**的正确判断。
 *   2026-09-30 起它多了一个读者:`vue/` 的「数字美妆台」,而那一半界面今天用的是
 *   另一份手抄的本地 kb(`vue/src/api/kb/*`),与这里的内容**同源但不同文**。
 *   两份并存 = 同一件产品两个 id、两套文案,所以前端那份退役,改成读这里。
 *
 * ★★ **两条路由的分工是"体积"决定的,不是"职责"决定的:**
 *   · `GET /api/products` —— 整库一次给(66 条卡片 + 全部色号)。前端要按分类铺产品、
 *     要给化妆包卡片画色点、要整表试色,那三处都要色号,分批取就是 N+1;
 *   · `GET /api/products/:id` —— 六维原文 + 手写补充。**刻意不放进上面那条**:
 *     把 66 条 × 6 段原文也一次推下去,payload 会翻好几倍,而它只在"点开某一件的信息面板"
 *     那一处用得到。
 *
 * ⚠️ **这里每一格都必须有读者。** 卡片那一格乘 66,而多一格没人读的字段就是本仓
 *   反复要修的那种「假开关」。所以下面刻意**没有** `productCount`(分类树下不显示条数)、
 *   也没有 `isSeries`(界面对系列卡与普通产品一视同仁)——它们今天都零读者,谁要谁加。
 */
import { z } from 'zod';

/** 一个色号。字段与 `entities/content.ts` 的 `shadeSchema` 逐格相同——**它就是那个领域类型**。 */
export const shadeViewSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    hex: z.string(),
    /** ★ 恒为 `true`(近似值)。见 `content.ts` 那一行的说明:它是**声明**,不是数据。 */
    hexApprox: z.literal(true),
    tone: z.string(),
    toneKey: z.enum(['warm', 'cool', 'neutral']),
    lightness: z.string().optional(),
    saturation: z.string().optional(),
  })
  .strict();

/** 一件产品的试色面板。`label` 是面板标题。 */
export const shadesViewSchema = z
  .object({
    label: z.string(),
    shades: z.array(shadeViewSchema),
  })
  .strict();

/**
 * 目录卡上的一行。
 *
 * ★ **只放卡片上真的会画出来的东西**(见文件头那条 ⚠️)。六维原文**不在这里**——
 *   那是详情那条口的事。
 */
export const productCardViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** 类目 id(= 目录名),如 `lip`。★ 它是这条卡片与分类树之间的那个键。 */
    categoryId: z.string(),
    /** 类目的中文名,如「口红」。 */
    categoryLabel: z.string(),
    /**
     * 卡片上那一行字。
     * ★ 优先取**手写层**补的那句(前端原来 `kb/catalog.js` 里那张卡的描述),
     *   没有才退回品牌资料「质地/妆效」的**首句**。取法在 `application/products-view.ts`。
     */
    text: z.string(),
    /** 色号行数。**0 就是 0。** */
    shadeCount: z.number(),
    /**
     * ★ 这件产品**有没有色号这回事**——睫毛膏、精华、防晒这些不分类色号的产品是 `false`。
     *   判据是内容文件里有没有 `shades`(**不是** `shadeCount > 0`)。
     *   ✏️ 界面照它写「无色号」——**不是**「色号待补」:后者是一句"以后会补上"的承诺,
     *   而这些产品永远不会有色号(手写层漏了色号是另一件事,由导入器的校验兜住)。
     */
    hasShades: z.boolean(),
  })
  .strict();

/** 分类树的一个二级节点。 ★ **条数不在这里**——分类树下不显示它(见文件头)。 */
export const catalogCategoryViewSchema = z
  .object({
    id: z.string(),
    label: z.string(),
  })
  .strict();

/** 分类树的一级节点(护肤 / 彩妆)。 */
export const catalogGroupViewSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    children: z.array(catalogCategoryViewSchema),
  })
  .strict();

/**
 * ★ 整库一次给。`shades` 是 `{ [产品 id]: 面板 }` 的字典 —— 前端按 id 直接取,
 *   不做线性查找(化妆包要按 id 给每件产品画色点)。
 *   ⚠️ 没有色号的产品**不出现在这个字典里**(不是给一个空数组):理由同卡片上的 `hasShades`。
 */
export const catalogViewSchema = z
  .object({
    groups: z.array(catalogGroupViewSchema),
    products: z.array(productCardViewSchema),
    shades: z.record(shadesViewSchema),
  })
  .strict();

/** 信息面板上的一段原文。`key` 是那六个维度之一。 */
export const dimensionViewSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    text: z.string(),
  })
  .strict();

/**
 * 一件产品的详情。
 *
 * ★★ `dimensions` 与 `wording` **分成两段下发**,不是并成一段。
 *   一行来自品牌资料、一行是我们补的,而本仓那条「谁说的」红线要求界面上分得清——
 *   并起来就没得分了。**模型那条路才并**(省 token,见 `products-view.ts` 的
 *   `toProductDetailView`):它写给模型,模型只需要事实,不需要出处标记。
 */
export const productDetailViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    categoryId: z.string(),
    categoryLabel: z.string(),
    /** ★ 补录条目在源资料里没有编号,这里是 `null`(不是 0、也不是缺键)。 */
    number: z.number().nullable(),
    /** 品牌资料原文,一个字没改写。 */
    dimensions: z.array(dimensionViewSchema),
    /** 手写层补的那几格,**键是同一套六个维度**。空数组 = 这条没有补充。 */
    wording: z.array(dimensionViewSchema),
    /** 试色面板;这件没有色号时**整个键不出现**。 */
    shades: shadesViewSchema.optional(),
  })
  .strict();

export type ShadeView = z.output<typeof shadeViewSchema>;
export type ShadesView = z.output<typeof shadesViewSchema>;
export type ProductCardView = z.output<typeof productCardViewSchema>;
export type CatalogCategoryView = z.output<typeof catalogCategoryViewSchema>;
export type CatalogGroupView = z.output<typeof catalogGroupViewSchema>;
export type CatalogView = z.output<typeof catalogViewSchema>;
export type ProductDimensionView = z.output<typeof dimensionViewSchema>;
export type ProductDetailResponse = z.output<typeof productDetailViewSchema>;
