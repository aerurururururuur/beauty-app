/**
 * domain/entities/brief.ts —— 一次上妆的「用户需求简报」(值对象)。
 *
 * roadmap 把输入重心从「风景图」移到「场合 + 人本维度」:
 *   - occasion  重要场合(面试/约会/上台/见家长/日常)= 风格主判据
 *   - 肤质/肤色 是「按真实肤色走、禁止默认浅肤色审美」的包容落点
 *   - 穿搭 tag + 日期天气 只作为可选的辅助回显/文案素材,不深建模
 *   - sceneText 仍是自由输入自定义板
 *
 * 枚举常量数组作为「单源」:schema(z.enum)、validator、mock 适配器、
 * narration、前端契约都从这里取,避免各自再写一遍字符串集合。
 */
export const OCCASIONS = ['interview', 'date', 'stage', 'family', 'daily'] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const SKIN_TYPES = ['dry', 'oily', 'combination', 'sensitive', 'neutral'] as const;
export type SkinType = (typeof SKIN_TYPES)[number];

/** 肤色深浅 5 档(roadmap 拍板)。缺省走中间档 medium,不以浅肤色为默认。 */
export const SKIN_TONES = ['light', 'light_medium', 'medium', 'tan', 'deep'] as const;
export type SkinTone = (typeof SKIN_TONES)[number];

/** 日期天气(免费源实拉是 W2 的事;骨架由前端带确定默认,结构先行)。 */
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
  weather?: WeatherInfo;
}
