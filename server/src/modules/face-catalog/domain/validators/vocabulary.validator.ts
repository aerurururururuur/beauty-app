/**
 * domain/validators/vocabulary.validator.ts —— 面部词表的行为(形状在 `../schemas/entities/vocabulary.ts`)。
 *
 * ★ **这里唯一的职责是:坏词表不许静默溜进去。**
 *   少了它,一份 `toneKeys` 写空的词表会读成"这一档没什么色可选",而模型会照着
 *   一个残缺的色域往外配妆 —— **没有任何人会知道**。所以一律抛错,不返回 `null`、不留空壳。
 *
 * 抛的是普通 `Error`,不是 `AppError`:词表坏了不是"这个请求不合法",
 * 是**这个服务不该以当前状态启动**(同 `products/domain/validators/content.validator.ts`)。
 */
import { z } from 'zod';
import { SKIN_TONES, TONE_KEYS, zodIssuesMessage } from '../../../shared/index.js';
import {
  FeatureDimension,
  FeatureValue,
  FaceVocabulary,
  SkinToneTier,
} from '../entities/face-vocabulary.js';
import { featureFileSchema, skinToneFileSchema } from '../schemas/index.js';

/**
 * 代码里那份元组的集合形式。
 *
 * ★ **只在这里建一次,不再有第二份** —— 见下面 `parseFaceVocabulary` 里那段对账。
 */
const CODE_TONE_IDS = new Set<string>(SKIN_TONES);

/** `file` 是**相对词表根**的文件名,用来把话说清楚;调用方负责传对。 */
function fail(file: string, message: string): never {
  // 句号在这里统一补:调用方写多句解释时容易自带结尾句号,补两次会出「。。」。
  const body = message.endsWith('。') ? message : `${message}。`;
  throw new Error(
    `面部词表内容不合法:${file} —— ${body}` +
      '这份词表是人手维护的内容(不在代码里),改完请重跑 `npm test`。',
  );
}

/**
 * 两个文件 → 一份词表。形状不对、或跨条目规则破了,**都在这里抛错**。
 *
 * 跨条目规则(形状表达不了的那些):
 *   · ★ **档位 `id` 集合与代码里的 `SKIN_TONES` 逐字相同**(两个方向都查);
 *   · 档位 `id` / `order` 不重复,`isDefault` 恰好一条;
 *   · ★ **`isDefault` 那一档的 `order` 不得是最小值**(§13-3 红线的实质要求);
 *   · `TONE_KEYS` 里每个色至少有一档能用它(否则是死色,任何肤色都配不出来);
 *   · 特征类 `id` 不重复,同一类里取值 `id` 不重复;
 *   · 两个文件 `version` 一致(它们是一份词表的两半)。
 */
export function parseFaceVocabulary(
  raw: { skinTones: unknown; features: unknown },
  files: { skinTones: string; features: string },
): FaceVocabulary {
  const tonesParsed = skinToneFileSchema.safeParse(raw.skinTones);
  if (!tonesParsed.success) fail(files.skinTones, zodIssuesMessage(tonesParsed.error));
  const featuresParsed = featureFileSchema.safeParse(raw.features);
  if (!featuresParsed.success) fail(files.features, zodIssuesMessage(featuresParsed.error));

  const { tones, disclaimer, version } = tonesParsed.data;
  const { dimensions } = featuresParsed.data;

  const seenIds = new Set<string>();
  const seenOrders = new Set<number>();
  for (const tone of tones) {
    if (seenIds.has(tone.id)) fail(files.skinTones, `档位 id 重复:${tone.id}`);
    seenIds.add(tone.id);
    if (seenOrders.has(tone.order)) {
      fail(files.skinTones, `order 重复:${tone.order}(${tone.label} 与另一档撞了)`);
    }
    seenOrders.add(tone.order);
  }

  // ── 与代码里的 `SKIN_TONES` 对账 ──
  // ★ 这是"档位 id 留在代码里"那条选择的**全部代价与全部收益**:代码里留一份元组,
  //   换来 `Record<SkinTone, …>` / `z.enum(SKIN_TONES)` 这些编译期穷尽照旧;
  //   兑换条件就是**这一行**——两边对不上就起不来,否则那份元组会静默变成谎话。
  // ⚠️ 两个方向都要查:少了 id,取妆面时会拿到 `undefined`;多了 id,
  //   编译期根本表达不出来,只能靠运行时。
  const catalogIds = new Set(tones.map((t) => t.id));
  const missingInCatalog = SKIN_TONES.filter((id) => !catalogIds.has(id));
  const extraInCatalog = tones.map((t) => t.id).filter((id) => !CODE_TONE_IDS.has(id));
  if (missingInCatalog.length > 0 || extraInCatalog.length > 0) {
    const diff: string[] = [];
    if (missingInCatalog.length > 0) {
      diff.push(`词表里没有 ${missingInCatalog.join('、')}(代码里有)`);
    }
    if (extraInCatalog.length > 0) {
      diff.push(`词表里多出 ${extraInCatalog.join('、')}(代码里没有)`);
    }
    fail(
      files.skinTones,
      `档位 id 与代码里的 SKIN_TONES 对不上 —— ${diff.join(';')}。` +
        '两边必须逐字相同:JSON 负责 label / order / toneKeys / isDefault,代码那份元组负责编译期穷尽。' +
        '加一档 = 改这个 JSON **并且**在 shared/domain/entities/brief.ts 的 SKIN_TONES 里加一行。',
    );
  }

  const defaults = tones.filter((t) => t.isDefault);
  const fallbackTier = defaults[0];
  if (defaults.length !== 1 || !fallbackTier) {
    fail(files.skinTones, `isDefault 必须恰好一条,现在有 ${defaults.length} 条。`);
  }

  const lightestOrder = Math.min(...tones.map((t) => t.order));
  if (fallbackTier.order === lightestOrder) {
    fail(
      files.skinTones,
      `isDefault 那一档「${fallbackTier.label}」就是最浅的一档(order=${fallbackTier.order})。` +
        '缺省档不许是最浅档 —— 要么换一档标 isDefault,要么往浅色那头补档。',
    );
  }

  const usableTones = new Set<string>(tones.flatMap((t) => t.toneKeys));
  const deadTones = TONE_KEYS.filter((key) => !usableTones.has(key));
  if (deadTones.length > 0) {
    fail(
      files.skinTones,
      `${deadTones.join('、')} 在 ${tones.length} 档里没有任何一档可用(死色),` +
        '任何肤色都配不出这几个色。',
    );
  }

  const seenDimensions = new Set<string>();
  for (const dimension of dimensions) {
    if (seenDimensions.has(dimension.id)) {
      fail(files.features, `特征类 id 重复:${dimension.id}`);
    }
    seenDimensions.add(dimension.id);

    const seenValues = new Set<string>();
    for (const value of dimension.values) {
      if (seenValues.has(value.id)) {
        fail(files.features, `同一类里取值 id 重复:${dimension.id}.${value.id}`);
      }
      seenValues.add(value.id);
    }
  }

  if (version !== featuresParsed.data.version) {
    fail(
      files.features,
      `版本对不上:${files.skinTones} 是 ${version},` +
        `${files.features} 是 ${featuresParsed.data.version}。两个文件是一份词表的两半,改一个要一起改。`,
    );
  }

  return new FaceVocabulary(
    version,
    tones.map(
      (t) => new SkinToneTier(t.id, t.label, t.order, t.isDefault, t.toneKeys, t.swatch),
    ),
    dimensions.map(
      (d) =>
        new FeatureDimension(
          d.id,
          d.label,
          d.strategy,
          d.multi,
          d.values.map((v) => new FeatureValue(v.id, v.label, v.route)),
        ),
    ),
    disclaimer,
  );
}
