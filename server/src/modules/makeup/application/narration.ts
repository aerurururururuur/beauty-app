/**
 * application/narration.ts —— 面向用户文案的纯组装函数。
 * 与引擎解耦:文案模板固定,引擎只需返回结构化妆容元信息(look)。
 * 输入附加 MakeupBrief(occasion / 肤质肤色 / 穿搭 / 天气),拼出「为什么这套」——
 * 呼应 roadmap:场合 formality 决定风格、肤质决定持妆选择、肤色决定色板(不默认浅肤色审美)。
 */
import type { MakeupBrief, Occasion, SkinTone, SkinType } from '../../shared/index.js';
import type { SceneAnalysis } from '../../understanding/index.js';
import type { Look } from '../domain/entities/look.js';
import type { ResultText } from '../domain/entities/result-text.js';

/** 场合英文 label → 中文名(缺失时原样回显)。 */
const OCCASION_CN: Record<string, string> = {
  interview: '面试',
  date: '约会',
  stage: '上台',
  family: '见家长',
  daily: '日常',
};

const SKIN_TYPE_CN: Record<SkinType, string> = {
  dry: '干性',
  oily: '油性',
  combination: '混合',
  sensitive: '敏感',
  neutral: '中性',
};

const SKIN_TONE_CN: Record<SkinTone, string> = {
  light: '浅',
  light_medium: '浅中',
  medium: '中',
  tan: '小麦',
  deep: '深',
};

/** 肤质对应的上妆选择话术。 */
const TYPE_STRATEGY: Record<SkinType, string> = {
  dry: '偏干肌先做好滋润打底,选滋润服帖的粉质',
  oily: '偏油肌优先控油持妆,用雾面质感并做好定妆',
  combination: '混合肌重点做好 T 区控油 + 两颊保湿,持妆中带自然光泽',
  sensitive: '敏感肌精简步骤、选配方温和的产品,妆前先局部试敏',
  neutral: '中性肌质地随喜好,通勤用通透妆感就好',
};

export function buildNarrative(
  scene: SceneAnalysis,
  engineName: string,
  look: Look,
  brief?: MakeupBrief,
): ResultText {
  const isOccasion = brief?.occasion !== undefined;
  const sceneCn = isOccasion && brief?.occasion
    ? (OCCASION_CN[brief.occasion as Occasion] ?? brief.occasion)
    : brief?.sceneText?.trim()
      ? '自定义需求'
      : (OCCASION_CN[scene.label] ?? scene.label);
  const palette = Array.isArray(look.palette) ? (look.palette as unknown[]) : [];
  const style = typeof look.style === 'string' && look.style ? (look.style as string) : '自然日常';

  const basisParts: string[] = [];
  if (brief?.occasion) basisParts.push(`场合:${OCCASION_CN[brief.occasion] ?? brief.occasion}`);
  if (brief?.sceneText?.trim()) basisParts.push(`需求:${brief.sceneText.trim()}`);
  const basis = basisParts.join(' / ') || sceneCn;

  const analysis = `识别为「${basis}」→ 妆容方向:${scene.direction}${
    scene.tags.length > 0 ? `(关键词:${scene.tags.join(' / ')})` : ''
  }。`;

  const explainParts = [`为「${sceneCn}」场合选配「${style}」妆容。`];
  if (brief?.skinTone) {
    explainParts.push(
      `按你的肤色(深浅·${SKIN_TONE_CN[brief.skinTone]})挑色板——不为「显白」而牺牲素颜真实度。`,
    );
  }
  if (brief?.skinType) {
    explainParts.push(`${SKIN_TYPE_CN[brief.skinType]}肤质:${TYPE_STRATEGY[brief.skinType]}。`);
  }
  if (brief?.dress?.trim()) {
    explainParts.push(`穿搭「${brief.dress.trim()}」的主色可与妆容呼应,保持整体利落不抢镜。`);
  }
  explainParts.push(`由 ${engineName} 引擎生成,主色板 ${palette.length} 色。`);
  const explain = explainParts.join('');

  // 3 条 tips:肤质持妆 / 肤色/穿搭 / 天气。
  const tips: string[] = [];
  tips.push(
    brief?.skinType
      ? TYPE_STRATEGY[brief.skinType] + ',现场更耐看'
      : '底妆薄透为主,重要场合前先在自然光下检查一次妆面',
  );
  tips.push(
    brief?.dress?.trim()
      ? `穿搭主色为「${brief.dress.trim()}」,唇颊选择与之协调的同类色相最得体`
      : `这套妆容走低饱和同类色,和多数正式穿搭都能搭`,
  );
  if (brief?.weather) {
    const w = brief.weather;
    const bits: string[] = [];
    if (w.uvIndex !== undefined && w.uvIndex >= 3) bits.push('紫外线偏强,记得带防晒打底');
    if ((w.humidityPct ?? 50) >= 60) bits.push('湿度偏高,定妆不能省、随身带粉饼补妆');
    if (w.temperatureC !== undefined && w.temperatureC >= 28) bits.push('高温易脱妆,选持妆型妆效更稳');
    tips.push(bits.length > 0 ? bits.join(';') : `按当日天气(${w.condition ?? '温和'})调整持妆策略即可`);
  } else {
    tips.push('出门前对照当日天气定妆,湿度高的日子多定妆少叠加');
  }

  return { analysis, explain, tips };
}
