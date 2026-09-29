/**
 * domain/entities/face-vocabulary.ts —— 面部词表的实体。
 *
 * 三处分工,照 `products` 的先例:
 *   `../schemas/entities/vocabulary.ts`             两个 JSON 文件的形状(zod)
 *   `../validators/vocabulary.validator.ts` 形状之外的规则,坏数据在这里抛普通 `Error`
 *   本文件                                  把**已经校验过的**两棵树装成可查询的对象
 *
 * 所以构造函数不自带规则校验:"恰好一条 isDefault"「toneKeys 必须是合法色」
 * 这类判据都在 validator 里,这里只拒绝唯一一种装不起来的情况(一条 isDefault 都没有)。
 */
import type { FeatureRoute, ToneKey } from '../../../shared/index.js';

/** 肤色一档(共 8 档)。 */
export class SkinToneTier {
  constructor(
    /** 档位 id。`brief.skinTone` 存的就是它,也是识别结果白名单里的值。 */
    readonly id: string,
    /** 中文档名,直接上界面。 */
    readonly label: string,
    /** 浅 → 深的次序,从 1 起,不许重复。 */
    readonly order: number,
    /** 缺省档。全表恰好一条为 `true`,且它的 `order` 不得是最小值。 */
    readonly isDefault: boolean,
    /** 该档可用的色域。非空,每个值必须是 `shared` 的 `TONE_KEYS` 之一。 */
    readonly toneKeys: readonly ToneKey[],
    /** 界面色卡色值,如 `#d9c79e`。 */
    readonly swatch?: string,
  ) {}

  /** 这一档能不能用这个色。 */
  allows(tone: ToneKey): boolean {
    return this.toneKeys.includes(tone);
  }
}

/** 一类面部特征下的一个取值。 */
export class FeatureValue {
  constructor(
    /** 取值 id。存进 `brief.features` 的是它。 */
    readonly id: string,
    /** 中文名,直接上界面。 */
    readonly label: string,
    /** 这个取值在图像提示词里的去向。`advisory` = 只给用户建议,一个字都不进出图文案。 */
    readonly route: FeatureRoute,
  ) {}
}

/** 一类面部特征:眼型 / 脸型 / 颧骨 / 唇形 / 肤质 / 五官比例。 */
export class FeatureDimension {
  readonly #byId: Map<string, FeatureValue>;

  constructor(
    /** 类 id,如 `eye_shape`。 */
    readonly id: string,
    /** 中文类名,如「眼型」。 */
    readonly label: string,
    /** 这类「决定什么策略」。owner 原文,当界面提示文案用。 */
    readonly strategy: string,
    /** 可多选为 `true`。 */
    readonly multi: boolean,
    readonly values: readonly FeatureValue[],
  ) {
    this.#byId = new Map(values.map((v) => [v.id, v]));
  }

  /** 按 id 取一个取值;不在这一类里就是 `undefined`。 */
  valueById(id: string): FeatureValue | undefined {
    return this.#byId.get(id);
  }
}

/** 整份面部词表 = `skin-tones.json` + `features.json`。 */
export class FaceVocabulary {
  /** 词表版本。两个文件必须一致(validators 里校验)。 */
  readonly version: string;
  /** 肤色档位。**恒按 `order` 升序**(浅 → 深),与 JSON 里的书写顺序无关。 */
  readonly tones: readonly SkinToneTier[];
  readonly dimensions: readonly FeatureDimension[];
  /** 免责语。必须原样展示给用户,不许改写。 */
  readonly disclaimer: string;

  readonly #byId: Map<string, SkinToneTier>;
  readonly #dimensions: Map<string, FeatureDimension>;
  readonly #defaultTier: SkinToneTier;

  constructor(
    version: string,
    tones: readonly SkinToneTier[],
    dimensions: readonly FeatureDimension[],
    disclaimer: string,
  ) {
    this.version = version;
    this.tones = [...tones].sort((a, b) => a.order - b.order);
    this.dimensions = dimensions;
    this.disclaimer = disclaimer;

    this.#byId = new Map(tones.map((t) => [t.id, t]));
    this.#dimensions = new Map(dimensions.map((d) => [d.id, d]));

    const def = this.tones.find((t) => t.isDefault);
    if (!def) throw new Error('面部词表:没有任何一档标了 isDefault。');
    this.#defaultTier = def;
  }

  /** 缺省档。**不是**最浅那一档(validators 保证)。 */
  defaultTier(): SkinToneTier {
    return this.#defaultTier;
  }

  /**
   * 按 id 取一档。
   * 不认识就是 `undefined`(**不抛错**——"这一档不存在"是正常查询结果,不是故障)。
   */
  tierById(id: string): SkinToneTier | undefined {
    return this.#byId.get(id);
  }

  /** 按 id 取一类特征;不认识就是 `undefined`。 */
  dimensionById(id: string): FeatureDimension | undefined {
    return this.#dimensions.get(id);
  }
}
