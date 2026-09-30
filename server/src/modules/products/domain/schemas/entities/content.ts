/**
 * domain/schemas/entities/content.ts —— 内容目录里那两种 JSON 的形状(zod 单源)。
 *
 * ★ `schema` 与 `validator` 分工照 `cabinet` 的先例:**这里只描述形状**,
 *   "读文件 → 校验 → 抛一句人看得懂的话"在 `domain/validators/` 里。
 *
 * ★ **`Product` / `ProductLibrary` 这几个领域类型也由本文件推导**(§4.1):
 *   内容由 `scripts/import-products.ts` 从品牌方的 docx **加上** `products/overlay/<库>/`
 *   那份手写层编译而来,领域模型**就是**那个文件的形状,没有"实体 ↔ 存储"的转换
 *   (转换层会立刻产生第二个真相)。所以这里 `z.output` 出来的 `ProductFile` / `LibraryFile`
 *   就是实体本身,`domain/entities/*` 只把它们改名转出并挂上说明。
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
 * ✏️ 2026-09-30 前端那份 `voice`(标签写着「用户口碑」)并进了这一格 —— 那条红线就此闭合:
 * 它从来也是同一份转述,只是前端给它挂了个它承担不起的名字。
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
 * 六格文本。**内容有两位提供者,形状只有这一份**:
 * `dimensions` 是品牌资料原文,`wording` 是 `products/overlay/` 那份手写层补的话。
 * 两者**必须物理分开**——混在一起就没人分得清哪句是品牌说的、哪句是我们补的(§13-6)。
 *
 * ★ 六格在这里**逐字写出**,不从 `DIMENSION_KEYS` 生成:生成出来的类型会退化成
 *   `Record<string, …>`,`product.dimensions.skinTypes` 这类按名字取的地方就失去编译期保护。
 *
 *   ⚠️ 于是六格与 `DIMENSION_KEYS` 是**两处**在写同一个清单,靠 `test/products.test.ts`
 *   对表。那份对表**不是多余的**:今天漏一格多半会炸(`.strict()` 加上仓库里那份真内容
 *   恰好六格都有),但那份"会炸"是**运气**——内容里哪天不写某一维,漏掉它就没人报了。
 *   对表测的是清单本身,与内容碰巧带了哪几维无关。
 */
const sixTextSchema = z
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
 * 一个色号。
 *
 * ★ `hexApprox` 是 **`z.literal(true)`**,不是 `z.boolean()` —— 这不是洁癖:
 *   这批 hex 是**按色号名推的近似值**(YSL 不公布 HEX),而它们现在与品牌资料的原文
 *   躺在同一棵目录里、看起来一样权威。写成 literal 意味着**任何一行想声称自己是实测值
 *   都过不了校验**,得先来改这一行。
 */
const shadeSchema = z
  .object({
    /** 色号(`B10` / `LC1` / `03`)。★ **同一件产品里唯一**——`hexOf(pid, code)` 靠它。 */
    code: z.string().min(1),
    name: z.string().min(1),
    hex: z.string().regex(/^#[0-9a-f]{6}$/i),
    hexApprox: z.literal(true),
    /** 中文色调描述,如 `暖调偏中性`。展示用。 */
    tone: z.string().min(1),
    /** 色调的机器可读那一格。筛选按钮按它分组。 */
    toneKey: z.enum(['warm', 'cool', 'neutral']),
    lightness: z.string().optional(),
    saturation: z.string().optional(),
  })
  .strict();

/**
 * 一条产品记录(`derived` 的说明见 `entities/product.ts` 的文件头:
 * `dimensions` / `wording` 是**别人写的原文**,`derived` 是**我们加工出来的索引字段**)。
 */
export const productFileSchema = z
  .object({
    /**
     * 产品 id,**就是文件名**。★ 用 slug(`base-fd-new`)而不是 `31-all-hours-foundation`:
     * 它同时是配方里的 `pid`、化妆包里的行、模型的句柄、URL 里那一段,
     * 两套词汇并存就会有"同一件东西两个名字"。
     */
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id 必须是 slug(小写字母数字与连字符)'),
    /** 品牌资料里的编号(1–57)。★ **可空**:手写层补录的条目源资料里没有编号。 */
    number: z.number().int().positive().nullable(),
    name: z.string().min(1),
    /** 展示类目 id(如 `lip`),对应 `library.json` 里的 `categories[].id`,**也是目录名**。 */
    category: z.string().min(1),
    /** `series` 是**系列卡**:它自己不是一件产品,`derived.contains` 列出它管的产品。 */
    kind: z.enum(['product', 'series']),
    /** ★ 品牌资料原文,一个字没改写。 */
    dimensions: sixTextSchema,
    /** ★ `products/overlay/` 那份手写层补的话,**键与六个维度同一套**(不新增第七维)。 */
    wording: sixTextSchema.optional(),
    /** 试色面板。`label` 是面板标题(源资料里它比产品名短)。 */
    shades: z
      .object({
        label: z.string().min(1),
        shades: z.array(shadeSchema),
      })
      .strict()
      .optional(),
    /** 目录卡上那一句。 */
    blurb: z.string().min(1).optional(),
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
        /** ★ 只有 `kind: 'series'` 会有:这个系列底下那几件产品的 id。 */
        contains: z.array(z.string()).optional(),
      })
      .strict(),
    /**
     * 源资料在这个条目下写的**非维度**说明。
     * 目前只有 #36 藏金粉霜那条"待补"占位会用到——
     * ★ 它存在的意义是:**别让一个空壳看起来像"导成功了"**。
     */
    notes: z.array(z.string()).optional(),
    /** 这一条是从哪儿来的。补录条目天然没有 `dimensions`,分开报免得淹掉真问题。 */
    origin: z.enum(['docx', 'overlay']),
  })
  .strict();

/**
 * 体检报告。**分成两半是有意的**,它们回答的是两个不同的问题:
 *
 * - `docxSections`:拿 **docx 审 docx**。键是**源文档自己的章节名**,
 *   与"我们怎么分类""手写层补了什么"完全无关,所以它是稳定的。
 *   ✏️ 它此前叫 `statedVsActual` 且按**展示类目**分行 —— 那两个东西在重构后不再一一对应
 *   (展示类的「提前护理」= docx 的「护肤类」+ 3 张系列卡),留着就是**一个假的对照表**。
 * - `merge`:我们**把两份输入并起来**之后长什么样。
 *
 * 后面那几项(缺维度 / 疑似重复 / 色号泄漏 / 没英文名)一律按**合并后**的条目算。
 */
const healthSchema = z
  .object({
    docxSections: z.object({
      perSection: z.array(
        z.object({
          /** docx 自己的章节名(如 `护肤类`)。 */
          label: z.string(),
          /** 资料在「分类总览」里**自称**的款数。没写就是 null,不是 0。 */
          stated: z.number().nullable(),
          /** 实解析到几条。 */
          parsed: z.number(),
          ok: z.boolean(),
        }),
      ),
      /** 文档里所有「共 N 款产品」的说法,连同出现的行号。 */
      statedTotals: z.array(z.object({ line: z.number(), value: z.number() })),
      parsedTotal: z.number(),
    }),
    merge: z.object({
      /** docx 解出几条(不含手写层)。 */
      docxEntries: z.number(),
      /** 并完之后库里一共几条。 */
      mergedEntries: z.number(),
      /** 手写层补录、docx 里没有的 slug。★ 它们的 `dimensions` 天然是空的。 */
      overlayOnly: z.array(z.string()),
      byCategory: z.array(
        z.object({ id: z.string(), count: z.number(), docx: z.number(), overlayOnly: z.number() }),
      ),
      shades: z.object({ products: z.number(), rows: z.number() }),
    }),
    /** 必填维度缺失。 */
    missingDimensions: z.array(
      z.object({ id: z.string(), number: z.number().nullable(), missing: z.array(dimensionKeySchema) }),
    ),
    /** 可选维度(社交反馈)缺失。单列,因为它不是数据问题。 */
    missingOptionalDimensions: z.array(
      z.object({ id: z.string(), number: z.number().nullable(), missing: z.array(dimensionKeySchema) }),
    ),
    suspectedDuplicates: z.array(
      z.object({ a: z.string(), b: z.string(), similarity: z.number(), sameDimensions: z.number() }),
    ),
    shadeLeakage: z.array(z.object({ id: z.string(), hits: z.array(z.string()), where: z.string() })),
    /** 源资料没给英文名的条目(源资料的缺口,不是解析的失败)。 */
    missingEnglishName: z.array(z.object({ id: z.string(), number: z.number().nullable(), name: z.string() })),
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
    /** 分类的分组(`护肤` / `彩妆`)。界面按它分两层。 */
    groups: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), order: z.number() })),
    categories: z.array(
      z.object({
        /** slug(目录名)。 */
        id: z.string().min(1),
        /** 展示用的中文名。 */
        label: z.string().min(1),
        /** ★ 所属分组,取自 `groups[].id`。 */
        group: z.string().min(1),
        /** 组内顺序。 */
        order: z.number(),
        actualCount: z.number(),
        /** 该类目下所有产品对上妆面槽位的**并集**。空 = 该类目在 LookSpec 里没有位置。 */
        lookSpecSlots: z.array(z.string()),
        /** docx 里那几个系列小标题与说明(**源文档的结构**,与系列卡不是一回事)。 */
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
/** 一个色号。 */
export type Shade = z.output<typeof shadeSchema>;
