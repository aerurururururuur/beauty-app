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
 * LLM 写的描述可能与 `LookSpec` **不一致**(说"雾面"而 spec 是 `glossy`)。
 * 那样用户就是**对着一段和实物无关的文字**决定要不要花钱——
 * **比没有预览更糟,因为它给了虚假的确认感**(§7.4.1 第 2 条判 CSS 预览死刑
 * 用的就是这条理由,LLM 代笔会犯同一个错)。
 *
 * ★ 它只讲「**这套是什么**」(妆面本身),因为只吃 `LookSpec`;
 * 「**为什么**是这套」(场合/肤质/肤色/天气的推理)是另一件事,由模型在对话里讲。
 */
import { presetOccasionCn } from '../../shared/index.js';
import { STYLE_READ_ZONES, ZONE_ROLES } from '../domain/entities/look-spec.js';
import type {
  BrowShape,
  Finish,
  Intensity,
  LookSpec,
  ToneKey,
  ZoneRole,
  ZoneSpec,
} from '../domain/entities/look-spec.js';
import type { StyleRead } from '../domain/entities/style-read.js';

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

/**
 * 区名的**人话**说法。
 *
 * ★ 与 `prompt-builder` 的 `ZONE_TOKEN` **刻意不合并**:那边是给模型看的词组
 *   (「唇部」「提亮」,越短越好),这边是给人看的一句话——两者语域不同,合并只能取其一。
 *   保证"不漏"的机制同其它几张表:`Record<ZoneRole, …>`,**加一个区两边都编译不过**。
 */
const ZONE_CN: Record<ZoneRole, string> = {
  lip: '唇',
  cheek: '颊',
  eyeshadow: '眼影',
  concealer: '遮瑕',
  contour: '修容',
  highlight: '提亮',
  aegyoSal: '卧蚕',
  liner: '眼线',
  lash: '睫毛',
};

/** 1..5 → 中文浓度。`Record<Intensity, …>` 保证五档都有,漏一档编译不过。 */
const INTENSITY_CN: Record<Intensity, string> = {
  1: '很淡',
  2: '淡',
  3: '中等',
  4: '明显',
  5: '浓',
};

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
/**
 * 把一份**风格读数**写成中文(读图那一轮)。
 *
 * ★ 与 `describeLook` **共用上面那几个小函数**——说法只有一份,不另抄一套。
 *   它比 `describeLook` 少两块(没有场合、没有眉形),理由见 `StyleRead` 的文件头。
 * ★ 它的读者是**模型**(经 `agent` 的 `styleReadNote` 进 `messages[]`),
 *   不是用户;但措辞照样只讲色 / 质地 / 浓度,同 `describeLook` 那条纪律。
 */
export function describeStyleRead(read: StyleRead): string {
  const base = `底妆是${INTENSITY_CN[read.base.coverage]}遮瑕的${FINISH_CN[read.base.finish]},${warmthCn(read.base.warmth)}`;
  // ★ 逐个区名从 `STYLE_READ_ZONES` 来,不手抄三遍 —— 读数的闭集要是哪天变了,
  //   这里跟着变,而不会剩下两个永远不会被讲到的格子(它们是必填的,漏了 TS 会红)。
  const parts = STYLE_READ_ZONES.map((role) => zoneCn(ZONE_CN[role], read.zones[role]));
  return [base, ...parts].join(';');
}

/**
 * @param applied ★ **只讲这几个区**(✏️ 2026-10-01 逐步累积出图)。
 *   缺省 = 妆面单里填了的区全讲,也就是今天的行为;给了值就只讲那几步画到的地方。
 *   ⚠️ 与 `prompt-builder` 的 `appliedZones` **是同一个集合的两种说法**,
 *   同一张图的两处描述必须由**同一个 `applied`** 算出来,否则图与话对不上。
 */
export function describeLook(spec: LookSpec, applied?: readonly ZoneRole[]): string {
  const base = `底妆是${INTENSITY_CN[spec.base.coverage]}遮瑕的${FINISH_CN[spec.base.finish]},${warmthCn(spec.base.warmth)}`;
  const parts = ZONE_ROLES.flatMap((role): string[] => {
    const zone: ZoneSpec | undefined = spec.zones[role];
    // 本套配方没这一步 / 这一步还没画到 ⇒ 不讲它。★ 这两条都**不许**退化成空串占位:
    // 那句描述是"预览"的替代品,多讲一格用户就会以为成片上有它(见文件头)。
    if (!zone) return [];
    if (applied !== undefined && !applied.includes(role)) return [];
    return [zoneCn(ZONE_CN[role], zone)];
  });
  parts.push(`眉是${BROW_CN[spec.zones.brow.shape]}、${INTENSITY_CN[spec.zones.brow.intensity]}浓度`);
  // ★ 场合是**自由文本**:预设 id(`interview`)翻成中文名,用户自己的说法
  //   (如「朋友的婚礼」)原样念 —— 不要用 `sceneRuleFor` 的 `label`,那会把原话收进一档。
  return `按「${presetOccasionCn(spec.occasion) ?? spec.occasion}」场合配的这套:${base};${parts.join(';')}。`;
}
