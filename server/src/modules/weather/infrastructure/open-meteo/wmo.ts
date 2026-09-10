/**
 * infrastructure/open-meteo/wmo.ts —— WMO 天气码 → 中文简述。
 * WMO 码是**上游的编码约定**,不是业务枚举,故留在适配器目录里而不进 domain
 * (换天气源时这套映射跟着换,业务层只认字符串 condition)。
 * 映射表:https://open-meteo.com/en/docs(WMO Weather interpretation codes)。
 */
const CONDITION_BY_CODE: Readonly<Record<number, string>> = {
  0: '晴',
  1: '大致晴朗',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  56: '冻毛毛雨',
  57: '冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '阵雨',
  81: '强阵雨',
  82: '暴阵雨',
  85: '阵雪',
  86: '强阵雪',
  95: '雷阵雨',
  96: '雷阵雨伴冰雹',
  99: '雷阵雨伴冰雹',
};

/** 未知码返回「未知」而不是编一个像样的天气——宁可显示得含糊,不要显示得错误。 */
export function conditionFromWmoCode(code: number): string {
  return CONDITION_BY_CODE[code] ?? '未知';
}
