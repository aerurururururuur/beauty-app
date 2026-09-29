/**
 * application/narration.ts —— 面向用户文案的纯组装函数。
 * 与引擎解耦:文案模板固定,引擎只需返回结构化妆容元信息(look)。
 * 输入附加 MakeupBrief(occasion / 肤质肤色 / 穿搭 / 天气),拼出「为什么这套」——
 * 呼应 roadmap:场合 formality 决定风格、肤质决定持妆选择、肤色决定色板(不默认浅肤色审美)。
 */
import type { MakeupBrief, Occasion, SceneDescriptor, SkinType } from '../../shared/index.js';
import { SCENE_RULES } from '../../shared/index.js';
import type { Look } from '../domain/entities/look.js';
import type { ResultText } from '../domain/entities/result-text.js';
import type { SkinTonePalette } from '../domain/ports/skin-tone-palette.js';

/**
 * 场合英文 label → 中文名。
 *
 * 单一源在 `shared/domain/scene-rules.ts` —— 这里不再自己抄一份(曾经有第三份,
 * 与前端 constants 各写一遍,加减场合时会漏改)。`Record<Occasion, …>` 保证查得到,
 * 所以不需要「认不出就回显」那条回落路——那是给「将来接视觉模型可能给出非枚举标签」
 * 留的,而 `SceneDescriptor.label` 现在就是枚举本身。
 */
function occasionCn(label: Occasion): string {
  return SCENE_RULES[label].cn;
}

const SKIN_TYPE_CN: Record<SkinType, string> = {
  dry: '干性',
  oily: '油性',
  combination: '混合',
  sensitive: '敏感',
  neutral: '中性',
};

// ⚠️ 肤色档中文名**不在这里** —— 它是词表的内容(`assests/face-catalog/skin-tones.json`
//    的 `label`),从 `SkinTonePalette` 端口查进来(见 `buildNarrative` 的 `palette` 参数)。
//    曾经这里有第二份 `SKIN_TONE_CN`,与 `look-spec.validator.ts` 那份逐字相同。

/** 肤质对应的上妆选择话术。 */
const TYPE_STRATEGY: Record<SkinType, string> = {
  dry: '偏干肌先做好滋润打底,选滋润服帖的粉质',
  oily: '偏油肌优先控油持妆,用雾面质感并做好定妆',
  combination: '混合肌重点做好 T 区控油 + 两颊保湿,持妆中带自然光泽',
  sensitive: '敏感肌精简步骤、选配方温和的产品,妆前先局部试敏',
  neutral: '中性肌质地随喜好,通勤用通透妆感就好',
};

export function buildNarrative(
  scene: SceneDescriptor,
  engineName: string,
  look: Look,
  brief: MakeupBrief | undefined,
  /** 词表端口。只用它的 `labelOf`(把肤色档 id 说成中文)。 */
  palette: SkinTonePalette,
): ResultText {
  const isOccasion = brief?.occasion !== undefined;
  const sceneCn = isOccasion && brief?.occasion
    ? occasionCn(brief.occasion)
    : brief?.sceneText?.trim()
      ? '自定义需求'
      : occasionCn(scene.label);
  // ⚠️ 叫 `paletteColors` 不叫 `palette`:后者是**本函数的参数**(肤色档词表端口),
  //    两者在同一个作用域里,重名会让 `palette.labelOf` 撞进 TDZ(第一版就是这么红的)。
  const paletteColors = Array.isArray(look.palette) ? (look.palette as unknown[]) : [];
  const style = typeof look.style === 'string' && look.style ? (look.style as string) : '自然日常';

  const basisParts: string[] = [];
  if (brief?.occasion) basisParts.push(`场合:${occasionCn(brief.occasion)}`);
  if (brief?.sceneText?.trim()) basisParts.push(`需求:${brief.sceneText.trim()}`);
  const basis = basisParts.join(' / ') || sceneCn;

  const analysis = `识别为「${basis}」→ 妆容方向:${scene.direction}${
    scene.tags.length > 0 ? `(关键词:${scene.tags.join(' / ')})` : ''
  }。`;

  const explainParts = [`为「${sceneCn}」场合选配「${style}」妆容。`];
  if (brief?.skinTone) {
    // 查不到名字就退回 id 本身:文案难看,但比悄悄少一句强(缺档是启动校验该拦的事)。
    const toneCn = palette.labelOf(brief.skinTone) ?? brief.skinTone;
    explainParts.push(`按你的肤色(${toneCn})挑色板——不为「显白」而牺牲素颜真实度。`);
  }
  if (brief?.skinType) {
    explainParts.push(`${SKIN_TYPE_CN[brief.skinType]}肤质:${TYPE_STRATEGY[brief.skinType]}。`);
  }
  if (brief?.dress?.trim()) {
    explainParts.push(`穿搭「${brief.dress.trim()}」的主色可与妆容呼应,保持整体利落不抢镜。`);
  }
  explainParts.push(`由 ${engineName} 引擎生成,主色板 ${paletteColors.length} 色。`);
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
