/**
 * domain/entities/brief.ts —— 一次上妆的「用户需求简报」(值对象)。
 *
 * roadmap 把输入重心从「风景图」移到「场合 + 人本维度」:
 *   - occasion  重要场合(面试/约会/上台/见家长/日常 + 聚会/旅行/奇想)= 风格主判据
 *   - 肤质/肤色 是「按真实肤色走、禁止默认浅肤色审美」的包容落点
 *   - 穿搭 tag + 日期天气 只作为可选的辅助回显/文案素材,不深建模
 *   - sceneText 仍是自由输入自定义板
 *
 * 枚举常量数组作为「单源」:schema、validator、mock 适配器、
 * 前端契约都从这里取,避免各自再写一遍字符串集合。
 */
/**
 * 预设场合表。前 5 个是原有的,`party` / `travel` / `fantasy` 是 2026-09-30 补的
 * ——补完之后这 8 个与桃妆前端的 5 个场景 id(`vue/src/api/design.js` 的 `SCENES`)完全同名。
 *
 * ★ **它和 `STYLE_LIBRARY`(预设风格表)是一对,地位相同。** 两张都是**预设**,
 *   两张都**允许用户写表外的东西**,而且两者**自由组合**——任何场合配任何风格,
 *   中间没有「这个场合只能配那几条风格」的绑定。
 *
 * ★ 因此它**不是校验白名单**,别拿它卡入参:那会把用户自己说的「朋友的婚礼」打成 422,
 *   整份 brief 一起丢。`brief.occasion` 与 `LookSpec.occasion` 都是**自由文本**。
 *
 * 表里的取值仍是那张表的键:`scene-rules.ts` 的 `Record<Occasion, SceneStyle>`
 * (每个预设场合的中文名 / 方向 / 标签 / 关键词)靠它穷尽。
 */
export const OCCASIONS = [
  'interview',
  'date',
  'stage',
  'family',
  'daily',
  'party',
  'travel',
  'fantasy',
] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const SKIN_TYPES = ['dry', 'oily', 'combination', 'sensitive', 'neutral'] as const;
export type SkinType = (typeof SKIN_TYPES)[number];

/**
 * 肤色 8 档(2026-09-29 owner 拍板;此前是 roadmap 定的 5 档)。
 *
 * ★ **这 8 个 id 是「代码」,不是「内容」。** 它们必须与词表目录
 *   `assests/face-catalog/skin-tones.json` 里 `tones[].id` 的集合**完全一致** ——
 *   启动时逐项对账,多一个少一个都起不来(见 `face-catalog` 的 `vocabulary.validator.ts`)。
 *   **加一档 = 改 JSON + 这里加一行。**
 *
 *   档位的**名字 / 色卡 / 深浅次序 / 可用色域 / 哪一档是缺省**全在目录里,这里只放 id。
 *   与 `TONE_KEYS` 同一条理由:靠编译期元组才拿得到穷尽检查,挪进 JSON 就只剩运行时。
 *
 * ★ 缺省档由目录的 `isDefault` 标出,**且它不许是最浅那一档** —— 那是启动校验,
 *   不是注释(§13-3 那条肤色包容红线的实质要求)。
 */
export const SKIN_TONES = [
  'cool_porcelain',
  'pink_porcelain',
  'warm_ivory',
  'warm_beige',
  'olive',
  'warm_tan',
  'wheat',
  'deep_brown',
] as const;
export type SkinTone = (typeof SKIN_TONES)[number];

/**
 * 日期天气。实拉见 `weather` 模块(GET /api/weather,open-meteo);
 * 前端拿到后填进这里,**拿不到就整个省掉**(前端无手动预设,不吃假数据)。
 */
export interface WeatherInfo {
  condition?: string; // 晴 / 多云 / 雨 …
  temperatureC?: number;
  humidityPct?: number;
  uvIndex?: number;
}

export interface MakeupBrief {
  /**
   * 用户说的场合,如「面试」,或表外的「朋友的婚礼」。**自由文本,不是枚举**——
   * 取值不可枚举正是它被松绑的原因。校验只管长度(`MAX_OCCASION`)。
   */
  occasion?: string;
  /**
   * 用户想要的风格,如「纯欲妆」「清冷一点」。自由文本,同样可以是 `STYLE_LIBRARY` 表外的。
   *
   * ★ 与 `sceneText` **分开**:风格是这一套妆要**照着做**的东西(模型据此挑 `styleId`),
   *   混进 `sceneText` 会被淹没,所以它在系统提示里单独占一行。
   */
  styleText?: string;
  /** 自由文字自定义板(可替代 occasion 作为风格信号)。 */
  sceneText?: string;
  /**
   * 场景图读数:分析器从一张场景照片里读出的一句话。**自由文本**。
   * ★ 照 `weather` 那条先例——由分析器写,`patch_brief` 写不了(不在 `PATCH_BRIEF` 里)。
   */
  sceneNote?: string;
  skinType?: SkinType;
  skinTone?: SkinTone;
  /** 穿搭一句话:风格 + 主色,如「西装 · 藏青」。 */
  dress?: string;
  /**
   * 用户本人的面部特征 id(可多选),如 `eye-drop` / `face-round`。
   *
   * ★ **取值与含义不在这里**,在 `face-catalog` 的目录
   *   (`assests/face-catalog/features.json`)——`shared` 不能 import 它(反向依赖)。
   *   这里只声明"有这一列"。**合法成员在 `face-catalog` 的 validator 里查**。
   *
   * ★ **未知 id 由消费者剔掉,不在这里报错**(见 `styling` 的方案推导):
   *   用户数据里存的 id 可能比后端词表旧,那不该让整份需求被打回。
   */
  features?: readonly string[];
  /**
   * 人设档案里那段「补充说明」+ 用户自己写的、词表里没有的特征 —— 前端 `toBrief` 拼成一段话放这里。
   * ★ 与 `features` 分开:那一格只收**认得出的 id**,认不出的原话塞进去是**白塞**;进这一格
   *   模型在系统提示里才真的读得到(`patch_brief` 写不了)。
   */
  personaNotes?: string;
  weather?: WeatherInfo;
}
