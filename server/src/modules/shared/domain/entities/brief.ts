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
 * 场合(单一源)。前 5 个是原有的,`party` / `travel` / `fantasy` 是 2026-09-30 补的
 * ——补完之后这 8 个与桃妆前端的 5 个场景 id(`vue/src/api/design.js` 的 `SCENES`)完全同名。
 * 判定优先级不看这个数组,看 `scene-rules.ts` 的 `SCENE_MATCH_ORDER`。
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
  occasion?: Occasion;
  /** 自由文字自定义板(可替代 occasion 作为风格信号)。 */
  sceneText?: string;
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
  weather?: WeatherInfo;
}
