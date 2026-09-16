/**
 * makeup/application/look-description.ts —— 把 `LookSpec` 讲成一句人话。
 *
 * ★ **这个函数是「预览」的替代品**(§7.4.2)。CSS 叠加预览被砍掉之后,
 * 用户在出图前**只有文字能判断**;所以「唇再淡一点」这类微调要不要花一次钱去试,
 * 全看这句描述准不准。原文写得很直:
 * 「**agent 的文字描述质量直接决定体验**——它必须把 `LookSpec` 讲成一句人话
 * (「偏冷的玫瑰色唇、雾面质地、中等浓度」),这句描述就是『预览』的替代品。」
 *
 * ★ **所以它必须是确定性纯函数,不能交给 LLM 自由发挥。**
 * 理由与 `narration.ts` 完全相同,而且在这里更硬:LLM 写的描述可能与 `LookSpec`
 * **不一致**(说"雾面"而 spec 是 `glossy`)。那样用户就是**对着一段和实物无关的文字**
 * 决定要不要花钱——**比没有预览更糟,因为它给了虚假的确认感**(§7.4.1 第 2 条
 * 判 CSS 预览死刑用的就是这条理由,LLM 代笔会犯同一个错)。
 *
 * 与 `narration.ts` 的分工:那个讲「**为什么**是这套」(场合/肤质/肤色/天气的推理),
 * 这个讲「**这套是什么**」(妆面本身)。前者需要 `brief`,后者只需要 `LookSpec`。
 */
import type { Occasion } from '../../shared/index.js';
import { SCENE_RULES } from '../../shared/index.js';
import type { BrowShape, Finish, Intensity, LookSpec, ToneKey, ZoneSpec } from '../domain/entities/look-spec.js';

const FINISH_CN: Record<Finish, string> = {
  satin: '缎光(微光泽)',
  matte: '雾面(哑光)',
  glossy: '水光(高光泽)',
};

/**
 * ⚠️ 色相的中文名。**与占位词表同寿**——`TONE_KEYS` 一旦按 5 档肤色实测替换,
 * 这张表要一起换(`Record<ToneKey, …>` 保证不漏,漏了编译不过)。
 */
const TONE_CN: Record<ToneKey, string> = {
  rose: '玫瑰粉',
  coral: '珊瑚橘粉',
  peach: '蜜桃粉',
  berry: '莓果红',
  brick: '砖红',
  nude: '裸色',
  plum: '梅子紫',
};

const BROW_CN: Record<BrowShape, string> = {
  natural: '自然眉',
  soft_arch: '柔和微挑',
  straight: '平直眉',
};

/** 1..5 → 中文浓度。`Record<Intensity, …>` 保证五档都有,漏一档编译不过。 */
const INTENSITY_CN: Record<Intensity, string> = {
  1: '很淡',
  2: '淡',
  3: '中等',
  4: '明显',
  5: '浓',
};

function occasionCn(occasion: Occasion): string {
  return SCENE_RULES[occasion].cn;
}

/** 冷暖偏移 → 人话(0 是中性,所以两头分别是"偏暖/偏冷一点")。 */
function warmthCn(warmth: number): string {
  if (warmth <= -1.5) return '整体明显偏冷';
  if (warmth <= -0.5) return '整体偏冷一点';
  if (warmth < 0.5) return '整体不偏冷暖';
  if (warmth < 1.5) return '整体偏暖一点';
  return '整体明显偏暖';
}

function zoneCn(label: string, zone: ZoneSpec): string {
  return `${label}是${TONE_CN[zone.tone]}的${FINISH_CN[zone.finish]}、${INTENSITY_CN[zone.intensity]}浓度`;
}

/**
 * 把一份妆面单写成一段中文描述。
 *
 * 输出刻意**只讲色 / 质地 / 浓度**——这正是 `LookSpec` 里安全的那三个维度(§6 规矩 5)。
 * 唯一的例外是眉形,因为它本来就是几何字段(§6 点名的欠债)。
 * **不要在这段文案里加入 `LookSpec` 之外的信息**(比如"显得脸小"),那是拿描述
 * 偷偷扩权,而用户会拿它当成对成片的承诺。
 */
export function describeLook(spec: LookSpec): string {
  const base = `底妆是${INTENSITY_CN[spec.base.coverage]}遮瑕的${FINISH_CN[spec.base.finish]},${warmthCn(spec.base.warmth)}`;
  const parts = [
    zoneCn('唇', spec.zones.lip),
    zoneCn('颊', spec.zones.cheek),
    zoneCn('眼影', spec.zones.eyeshadow),
    `眉是${BROW_CN[spec.zones.brow.shape]}、${INTENSITY_CN[spec.zones.brow.intensity]}浓度`,
  ];
  return `按「${occasionCn(spec.occasion)}」场合配的这套:${base};${parts.join(';')}。`;
}
