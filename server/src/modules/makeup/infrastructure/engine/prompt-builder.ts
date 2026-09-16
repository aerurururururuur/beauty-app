/**
 * infrastructure/engine/prompt-builder.ts —— ★ 层 A 最该投入的文件(设计文档 §5.2)。
 *
 * ★★ **存在的全部理由,是一条已经花过钱的实测结论(§4.4)。**
 *
 * run 3 已经把构图 / 服装 / 背景条款**全部砍掉**,人**仍然漂**——眼睛变大、外眼角上扬、
 * 鼻唇跟着被重画。剥剩的词就是原因:「放大感美瞳」「外眼角加长」「眼线向外拉长并轻微上扬」。
 * **那不是色与质地,是几何。** run 4 把几何词也删掉、只留色 / 质地 / 浓度 →
 * **身份保住、妆效清楚可见、构图全在**(§4.4.3)。
 *
 * 所以本文件的对策不是"把坏话压住",而是**坏话根本没有地方生成**:
 *
 * | 类别 | 处置 | 依据 |
 * | --- | --- | --- |
 * | 构图 / 服装 / 背景 | **模板里没有这三个槽位** | §4.1;run 1 全换、run 3 部分丢 |
 * | 几何词(放大/拉长/上扬/浓密/加长) | **措辞层不产出** | §4.4.1;run 3 漂移的直接原因 |
 * | 位置 / 轮廓(眼尾/唇线/外环) | **不产出** | §4.4.3 表;run 4 删掉它们才成功 |
 * | 眉形 | **不产出**(见下) | §4.4.3:run 4 删掉的正是「自然平眉」的「平」 |
 * | 色 / 质地 / 浓度 | ✅ 唯一被实测证明安全的通道 | §4.4.3:「写得再细都不花身份」 |
 *
 * ⚠️ **三条要说清楚的实话:**
 *
 * ① **这一层的措辞是"降低概率",不是护栏。** §4.4.2:prompt 里写「不要磨皮」、
 *    反向提示词里也有「过度磨皮」,**三次输出全部重度磨皮**。所以锚句与反向提示词
 *    都留着(它们能压低概率),但**身份保真的把关在 §12.1 的实测打分,不在这里**。
 *    别因为"模板里有锚句"就默认通过。
 *
 * ② ★ **本文件产出的措辞 `[未验证]`——它不等于 run 4 那一份。**
 *    run 4 成功用的是 `out/look-sheet-color-only.txt` 里那**一段手写死的中文**
 *    (「中等遮瑕度的细腻清透奶油光泽底妆,额头、鼻梁与面中带水润高光,低饱和冷粉色腮红…」)。
 *    那段话只对应**一套具体的妆**(冷粉腮红/灰棕眉/藕粉眼影/裸玫瑰唇),
 *    **没法泛化到任意 `LookSpec`** —— 所以这里必须重新渲染一套能随 spec 变的措辞。
 *    重新渲染的这一版**只继承了 run 4 的约束(不含几何词),没有继承它的实测结论**。
 *    验证路径是 §5.4 的 record/replay 夹具 + §12.1 的实测打分,**不是"看起来更像 run 4"**。
 *
 * ③ **`brow.shape` 这个字段本文件刻意不渲染。** 它是 §6 点名的已知欠债(几何字段),
 *    而 run 4 的成功里恰好包含"删掉眉形那个字"。字段暂且留在 `LookSpec` 里
 *    (删它是契约变更,要同时动 `propose_look` 的工具契约与实例),
 *    **但它现在没有任何消费者**——见文件末的待办。
 *
 * ★ **纯函数,无 IO、无随机、无时间。** 同输入必同输出:夹具才可复现,
 *   `TEMPLATE_VERSION` 才有意义(§5.2)。
 */
import { SCENE_RULES } from '../../../shared/index.js';
import type { SkinTone } from '../../../shared/index.js';
import type { Finish, Intensity, LookSpec, ToneKey } from '../../domain/entities/look-spec.js';

/**
 * ★ 模板版本号,**随每次引擎调用记进夹具**(§5.2 / §5.4)。
 *
 * 理由照抄 `scripts/README.md` 那句:**"没有它,过两天没人说得清这张图是哪组参数出的。"**
 * ⚠️ **改动本文件的任何措辞都要 +1**——措辞变了但版本没变,历史夹具就变成了假证据。
 */
export const TEMPLATE_VERSION = 'v1';

// ── 词表 ────────────────────────────────────────────────────────────────────
//
// ★ 与 `application/look-description.ts` 的 `FINISH_CN` / `TONE_CN` **刻意不合并**:
//   两者是**不同的语域**——那边是给人看的一句话(「雾面(哑光)」要解释),
//   这里是给模型看的词组(「雾面」越短越好)。合并只能取其一,取谁都别扭。
//   保证"不漏"的机制是 `Record<枚举, string>`:**枚举加一档,两边都编译不过**。
//   (教训出处:`narration.ts` 记的"曾经有第三份场合名表",那条是**同语域**的重复,
//    与这里的情况不同。)

/** 质地。**只描述"什么光泽",不描述"涂到哪、涂多宽"。** */
const FINISH_TOKEN: Record<Finish, string> = {
  satin: '缎光',
  matte: '雾面',
  glossy: '高光泽水光',
};

/** 色相。**只有颜色名,不含"外环""渐变"这类形状/工艺词**(run 4 删掉的那类)。 */
const TONE_TOKEN: Record<ToneKey, string> = {
  rose: '玫瑰粉',
  coral: '珊瑚橘',
  peach: '蜜桃粉',
  berry: '莓果红',
  brick: '砖红',
  nude: '裸色',
  plum: '梅子紫',
};

/** 浓度。`Record<Intensity, …>`:`INTENSITY_MIN/MAX` 一旦改档,这里编译不过。 */
const INTENSITY_TOKEN: Record<Intensity, string> = {
  1: '极淡',
  2: '淡',
  3: '中等',
  4: '明显',
  5: '浓',
};

/** 冷暖偏移(-2..+2)。超出范围的值按端点夹取,不抛错——校验器已经管过形状了。 */
function warmthToken(warmth: number): string {
  if (warmth <= -1.5) return '整体明显偏冷';
  if (warmth <= -0.5) return '整体略偏冷';
  if (warmth < 0.5) return '整体色温中性';
  if (warmth < 1.5) return '整体略偏暖';
  return '整体明显偏暖';
}

// ── 固定文本 ────────────────────────────────────────────────────────────────

/**
 * 身份锚句。**放在最前面,是"收窄模型有权改动的范围",不是"压住后面的坏条款"**——
 * 后者已被实测证伪(§5.2:「锚句不能靠放在开头来压住后面的坏条款,实测证明拉不住」)。
 *
 * ⚠️ 这段里出现了「背景」「发型」这类**保护性**表述。它们与 run 1 翻车的
 * 「纯白工作室背景」是两回事:这里说的是"**不要动它**",那里说的是"**改成它**"。
 * 单测的禁词扫描因此只针对 `renderLookClauses()` 的输出(随 spec 变化的那部分),
 * 不扫描本常量——详见 `test/makeup-prompt.test.ts`。
 */
export const IDENTITY_ANCHOR =
  '最后一张是我本人的正面照片,以它为底图,只修改妆容。' +
  '请保持我的身份、五官形状、脸型、发型、皮肤真实质感与毛孔、拍摄角度、背景、光线全部不变。' +
  '不要改变肤色深浅,不要让我看起来像另一个人。';

/**
 * 反向提示词。★ **前四项(变形/换脸/改变五官/改变脸型)是身份保真的护栏**——
 * 这类编辑模型最大的失败模式不是妆难看,是**把脸换了**。
 *
 * ⚠️ 含「过度磨皮」,而它**三次实测全部无效**(§4.4.2)。留着是因为"降低概率"仍有价值,
 * **不是因为它管用**——不要把身份保真押在这一格上。
 * 逐条沿用 `scripts/qwen-image-makeup.ts` 里那份(它的依据是真实跑过的四轮)。
 */
export const NEGATIVE_PROMPT = [
  '变形',
  '换脸',
  '改变五官',
  '改变脸型',
  '改变人物身份',
  '改变背景',
  '多余的饰品',
  '文字',
  '水印',
  '过度磨皮',
  '塑料感',
  '浓妆艳抹',
].join('、');

/** 收尾的质量句。**不带分辨率 / 镜头 / 特写**——那些是构图词,归 run 1 那一类。 */
const QUALITY_TAIL =
  '成片要像真人化完妆后拍的照片,保留真实皮肤质感与自然高光,不要像贴纸或滤镜。';

// ── 主体 ────────────────────────────────────────────────────────────────────

/**
 * ★ **本文件真正要守住的那个函数**:把 `LookSpec` 渲染成几条只含色 / 质地 / 浓度的短句。
 *
 * 为什么单独拆出来而不是内联进 `buildPrompt`:
 * **它是单测的禁词扫描对象**。锚句里有「背景不变」「发型不变」这类保护性表述,
 * 整段扫描会误伤;而"随 spec 变化的那部分不许出现几何词"这条**必须能精确断言**。
 * 拆出来之后,扫描对象就是模型真正会因为 spec 而改动的那几行。
 *
 * ★ **刻意不渲染 `spec.zones.brow.shape`**:run 4 的成功里包含"删掉眉形那个字"(§4.4.3),
 *   而它的同类正是 run 3 翻车的「放大感美瞳」。眉部只输出浓度。
 *
 * ★ **刻意不渲染 `spec.occasion` 的 `direction` / `tags`**:那两串里有「利落」「立体」
 *   这类几何/风格词。run 2 带着它们跑也保住了身份(§4.4 表),所以**不是**因为有害才去掉,
 *   而是因为**色 / 质地 / 浓度是唯一有实测支撑的通道,本函数不往里加第二条没测过的**。
 *   要加,先补实测。
 */
export function renderLookClauses(spec: LookSpec): string[] {
  const { base, zones } = spec;
  const zone = (label: string, z: { tone: ToneKey; finish: Finish; intensity: Intensity }): string =>
    `${label}用${TONE_TOKEN[z.tone]}、${FINISH_TOKEN[z.finish]}质地、${INTENSITY_TOKEN[z.intensity]}浓度`;

  return [
    `底妆:${INTENSITY_TOKEN[base.coverage]}遮瑕的${FINISH_TOKEN[base.finish]}质地,${warmthToken(base.warmth)}。`,
    `${zone('唇部', zones.lip)}。`,
    `${zone('腮红', zones.cheek)}。`,
    `${zone('眼影', zones.eyeshadow)}。`,
    // 只有浓度,没有形状(见函数头 ★)。
    `眉部:${INTENSITY_TOKEN[zones.brow.intensity]}浓度,色调自然。`,
  ];
}

export interface PromptOptions {
  /**
   * 已知肤色。**给了才写肤色锚句**——理由同 `validateLookSpec`:「不知道肤色」和
   * 「知道但不提」是两回事,而 roadmap 的红线是**禁止默认浅肤色审美**(§6 规矩 4),
   * 所以"不知道"时宁可不提,也不许暗示一个缺省肤色。
   */
  skinTone?: SkinTone;
}

/**
 * `LookSpec` → 一份可以直接发给图像模型的提示词。**纯函数。**
 *
 * ★ **刻意不接收 `brief.dress`**(穿搭)。理由不是"没用",是**run 1 的翻车清单里就有服装**
 *   (裸肩):凡是让模型重画画面的输入都是同一类风险,而描述妆容**不需要**知道穿了什么。
 *   `brief` 里其余的字段(sceneText / weather)同理——它们是"为什么选这套妆"的解释素材
 *   (`narration.ts` 的活),不是出图指令。
 *
 * 输出顺序 = 锚句 → 肤色句 → 妆面 → 质量句。**顺序只是可读性,不是"压制力"**
 * (实测已证伪,见 `IDENTITY_ANCHOR` 的注释)。
 */
export function buildPrompt(spec: LookSpec, opts: PromptOptions = {}): {
  prompt: string;
  negativePrompt: string;
} {
  const lines = [IDENTITY_ANCHOR];

  if (opts.skinTone) {
    // §6 规矩 4 / roadmap:按真实肤色走,不许提亮成浅肤色。
    lines.push(`请按我本人的真实肤色上妆,不要把肤色提亮或改成浅肤色。`);
  }

  // 场合只作为一句话的语境,不带 direction / tags(见 renderLookClauses 注释)。
  lines.push(`妆容方向:${SCENE_RULES[spec.occasion].cn}场合。`);
  lines.push(...renderLookClauses(spec));
  lines.push(QUALITY_TAIL);

  return { prompt: lines.join('\n'), negativePrompt: NEGATIVE_PROMPT };
}

// ── 待办 ────────────────────────────────────────────────────────────────────
//
// - [ ] **`LookSpec.zones.brow.shape` 现在没有任何消费者**(本文件刻意不渲染它)。
//       要么找到色/质地/浓度维度的替代表达并删掉这个字段,要么先补实测证明眉形安全。
//       在那之前它是 §6 规矩 5 点名的欠债,`propose_look` 还在让模型填它。
// - [ ] `TEMPLATE_VERSION` 的每一次 +1 都该在 `docs/plan/makeup-agent-design.md` 留一行
//       为什么改——版本号没有配套说明的话,历史夹具还是不可比。
