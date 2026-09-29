/**
 * domain/schemas/entities/content.ts —— 内容目录里那两种 JSON 的形状(zod 单源)。
 *
 * ★ `schema` 与 `validator` 分工照 `cabinet` 的先例:**这里只描述形状**,
 *   "读文件 → 校验 → 抛一句人看得懂的话"在 `domain/validators/` 里。
 *
 * ★ **`Product` / `ProductLibrary` 这几个领域类型也由本文件推导**(§4.1):
 *   内容由 `scripts/import-products.ts` 从品牌方的 docx 编译而来,领域模型**就是**
 *   那个文件的形状,没有"实体 ↔ 存储"的转换(转换层会立刻产生第二个真相)。
 *   所以这里 `z.output` 出来的 `ProductFile` / `LibraryFile` 就是实体本身,
 *   `domain/entities/*` 只把它们改名转出并挂上说明。
 *
 * ★ 用 `.strict()`:多一个不认识的键就是**有人改了导入器而模块没跟上**,
 *   那种事要在启动时炸,不要静默吞掉。少一个键同理。
 *
 * ⚠️ 这里是**内容**校验,不是入参校验:它抛的是普通 `Error`(启动即失败),
 *   不是 `AppError`——内容坏了和请求坏了不是一类事。
 */
import { z } from 'zod';

/**
 * 品牌资料自己定的六个维度(顺序即展示顺序)。
 *
 * ★ **字面量写在这里**,不写在 `entities/product.ts` —— 它其实是**形状的词汇表**:
 *   `dimensionsSchema` 的六格、`dimensionKeySchema`、`health.missing*.missing[]`
 *   都在用它,而它们就在本文件。放在这里,`entities` 才是**单向**依赖 `schemas`(§4.1);
 *   `entities/product.ts` 的 `DIMENSION_KEYS` / `DimensionKey` 从这里转出,不另写一份。
 *
 * ⚠️ `feedback`(**社交平台用户反馈摘要**)是**唯一可选**的一个:
 * 57 条里只有 47 条有,缺的那 10 条不是资料漏了,是那些产品本来就没被摘录。
 * ★ 而且它有个特别的身份——**它是品牌资料里的转述,不是我们采集的用户口碑**。
 * 转述它时必须说明出处(§13-6「不得伪装成用户口碑或中立评测」)。
 */
export const DIMENSION_KEYS = [
  'texture',
  'ingredients',
  'skinTypes',
  'occasions',
  'warnings',
  'feedback',
] as const;

/** 一个维度的键。 */
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

/**
 * 维度键的枚举。
 *
 * ★ **`z.enum` 是 §4.2 之后有意留在 schema 里的一处**,不是漏搬。
 *   理由与 `face-catalog` 那份不同,值得写下来:
 *   · 内容校验**只有一个入口**(`parseLibraryFile`),而它的唯一调用者就是这个 validator
 *     —— schema 是 validator 的私有件,§14-08「规则只在一个入口生效」那个风险在这里不存在;
 *   · 这个键**嵌在一棵很深的树里**(`dimensions[].key` 与 `health.missing*.missing[]`),
 *     而 `ProductLibrary` **就是** `z.output<typeof libraryFileSchema>`(不再是手写的
 *     interface,见下面)。要把它搬出去,就等于在 validator 里**重建整棵树**才能收窄回
 *     `DimensionKey` —— 那是把这份形状写第二遍,比留一处 `z.enum` 糟得多。
 *   · `face-catalog` 那边能搬,是因为它本来就在逐条 `new SkinToneTier(...)` /
 *     `new FeatureValue(...)`,收窄是顺手的事。
 */
export const dimensionKeySchema = z.enum(DIMENSION_KEYS);

/**
 * 六个维度都是可选键:必填与否是**数据质量**问题(体检报告管),不是形状问题。
 *
 * ★ 六格在这里**逐字写出**,不从 `DIMENSION_KEYS` 生成:生成出来的类型会退化成
 *   `Record<string, …>`,`product.dimensions.skinTypes` 这类按名字取的地方就失去编译期保护。
 *
 *   ⚠️ 于是六格与 `DIMENSION_KEYS` 是**两处**在写同一个清单,靠 `test/products.test.ts`
 *   对表。那份对表**不是多余的**:今天漏一格多半会炸(`.strict()` 加上仓库里那份真内容
 *   恰好六格都有),但那份"会炸"是**运气**——内容里哪天不写某一维,漏掉它就没人报了。
 *   对表测的是清单本身,与内容碰巧带了哪几维无关。
 */
const dimensionsSchema = z
  .object({
    texture: z.string().optional(),
    ingredients: z.string().optional(),
    skinTypes: z.string().optional(),
    occasions: z.string().optional(),
    warnings: z.string().optional(),
    feedback: z.string().optional(),
  })
  .strict();

/**
 * 六维度里,`derived` 的说明见 `entities/product.ts` 的文件头:
 * `dimensions` 是**品牌资料的原文**(一个字都没改写),`derived` 是**我们加工出来的
 * 索引字段**。两者物理分开,混在一起就没人分得清哪句是品牌说的、哪句是我们推断的。
 */
export const productFileSchema = z
  .object({
    /** 如 `01-pure-shots-clean-reboot-cleanser`。★ 这是给模型用的句柄,也是文件名。 */
    id: z.string().min(1),
    /** 品牌资料里的编号(1–57)。留着便于和源文档对照。 */
    number: z.number().int().positive(),
    name: z.string().min(1),
    /** 类目 slug(如 `skincare`),对应 `library.json` 里的 `categories[].id`。 */
    category: z.string().min(1),
    dimensions: dimensionsSchema,
    derived: z
      .object({
        /**
         * 这条产品能对上妆面(`LookSpec`)的哪个槽位。
         * ★ **空数组是常见且正常的结果**——护肤/防晒/妆前/定妆在 `LookSpec` 里没有对应槽位
         * (它只有 base + lip/cheek/eyeshadow/brow),睫毛膏、眼线笔、高光同理。
         * 这个稀疏是**如实**,不是数据缺失。推荐时覆盖薄的地方要明说,不能硬凑。
         */
        lookSpecSlots: z.array(z.string()),
        /** 所属系列(如「Pure Shots 悦享青春系列」)。只有护肤类有;原文照存。 */
        series: z.string().optional(),
      })
      .strict(),
    /**
     * 源资料在这个条目下写的**非维度**说明。
     * 目前只有 #36 藏金粉霜那条"待补"占位会用到——
     * ★ 它存在的意义是:**别让一个空壳看起来像"导成功了"**。
     */
    notes: z.array(z.string()).optional(),
  })
  .strict();

const healthSchema = z
  .object({
    statedVsActual: z.object({
      perCategory: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          stated: z.number().nullable(),
          actual: z.number(),
          ok: z.boolean(),
        }),
      ),
      statedTotals: z.array(z.object({ line: z.number(), value: z.number() })),
      actualTotal: z.number(),
    }),
    /** 必填维度缺失。 */
    missingDimensions: z.array(
      z.object({ id: z.string(), number: z.number(), missing: z.array(dimensionKeySchema) }),
    ),
    /** 可选维度(社交反馈)缺失。单列,因为它不是数据问题。 */
    missingOptionalDimensions: z.array(
      z.object({ id: z.string(), number: z.number(), missing: z.array(dimensionKeySchema) }),
    ),
    suspectedDuplicates: z.array(
      z.object({ a: z.string(), b: z.string(), similarity: z.number(), sameDimensions: z.number() }),
    ),
    shadeLeakage: z.array(z.object({ id: z.string(), hits: z.array(z.string()), where: z.string() })),
    /** 名字里没有拉丁字母、slug 只能拿类目兜底的条目(源资料的缺口)。 */
    missingEnglishName: z.array(z.object({ id: z.string(), number: z.number(), name: z.string() })),
  })
  .strict();

export const libraryFileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    brand: z.string().min(1),
    source: z.object({
      file: z.string(),
      sha256: z.string(),
      importedAt: z.string(),
      importer: z.string(),
    }),
    dimensions: z.array(
      z.object({ key: dimensionKeySchema, label: z.string(), optional: z.boolean().optional() }),
    ),
    categories: z.array(
      z.object({
        /** slug(目录名)。 */
        id: z.string().min(1),
        /** 品牌资料里的中文名。 */
        label: z.string().min(1),
        order: z.number(),
        /** ★ 品牌资料**自称**的款数。对不上就是资料的问题,不是解析的问题。 */
        statedCount: z.number().nullable(),
        actualCount: z.number(),
        /** 该类目下所有产品对上妆面槽位的**并集**。空 = 该类目在 LookSpec 里没有位置。 */
        lookSpecSlots: z.array(z.string()),
        series: z.array(z.object({ title: z.string(), note: z.string().optional() })),
      }),
    ),
    /** 第十节那张「品类匹配逻辑速查表」。`cells` 与 `columns` 按位置对应。 */
    matchingGuide: z.object({
      columns: z.array(z.string()),
      rows: z.array(z.object({ condition: z.string(), cells: z.array(z.string()) })),
    }),
    notes: z.array(z.object({ label: z.string(), text: z.string() })),
    health: healthSchema,
  })
  .strict();

/** 一条产品记录(= 内容目录里那个 JSON 文件的形状)。领域实体 `Product` 就是它。 */
export type ProductFile = z.output<typeof productFileSchema>;
/** 一个库的元信息(= `library.json` 的形状)。领域实体 `ProductLibrary` 就是它。 */
export type LibraryFile = z.output<typeof libraryFileSchema>;
