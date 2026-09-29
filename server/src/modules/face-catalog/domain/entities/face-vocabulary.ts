/**
 * domain/entities/face-vocabulary.ts —— 面部词表的实体。
 *
 * 三处分工,照 `products` 的先例:
 *   `../schemas/entities/vocabulary.ts`             两个 JSON 文件的形状(zod,**单源**)
 *   `../validators/vocabulary.validator.ts` 形状之外的规则,坏数据在这里抛普通 `Error`
 *   本文件                                  把**已经校验过的**两棵树装成可查询的对象
 *
 * ★ **字段一律不在本文件声明**(§4.1):形状在 `../schemas/entities/vocabulary.ts` 写一次,
 *   这里只 `Object.assign` 搬过来(逐格赋值会静默丢字段,搬才不会),
 *   再靠声明合并把类型接上。两个收窄格(`toneKeys` / `route`)用 `Omit` 覆盖 ——
 *   枚举白名单是**业务规则**,留在 validator 里(§4.2),实体只在类型上如实标出来。
 *
 * 所以构造函数不自带规则校验:"恰好一条 isDefault"「toneKeys 必须是合法色」
 * 这类判据都在 validator 里,这里只拒绝唯一一种装不起来的情况(一条 isDefault 都没有)。
 */
import type { DimensionRow, FeatureValueRow, ToneTierRow } from '../schemas/index.js';
import type { FeatureRoute, ToneKey } from '../../../shared/index.js';

/** 肤色一档(共 8 档)。 */
export class SkinToneTier {
  constructor(row: ToneTierRow) {
    Object.assign(this, row);
  }

  /** 这一档能不能用这个色。 */
  allows(tone: ToneKey): boolean {
    return this.toneKeys.includes(tone);
  }
}
export interface SkinToneTier extends Omit<ToneTierRow, 'toneKeys'> {
  /**
   * 该档可用的色域。非空(按 `min(1)` 那条在 schema 里);
   * 每个值必须是 `shared` 的 `TONE_KEYS` 之一 —— 那条在 validator 里查,所以这里收窄。
   */
  readonly toneKeys: readonly ToneKey[];
}

/** 一类面部特征下的一个取值。 */
export class FeatureValue {
  constructor(row: FeatureValueRow) {
    Object.assign(this, row);
  }
}
export interface FeatureValue extends Omit<FeatureValueRow, 'route'> {
  /**
   * 这个取值在图像提示词里的去向。`advisory` = 只给用户建议,一个字都不进出图文案。
   * ★ 文件里那一格是宽 Raw(`slot` 是 `string`);收窄成 `GEOMETRY_SLOTS` 之一在 validator 里。
   */
  readonly route: FeatureRoute;
}

/** 一类面部特征:眼型 / 脸型 / 颧骨 / 唇形 / 肤质 / 五官比例。 */
export class FeatureDimension {
  readonly #byId: Map<string, FeatureValue>;

  constructor(row: DimensionRow) {
    Object.assign(this, row);
    // ★ 从 `this.values` 建索引,**不**从 `row.values`:row 是**文件**那一格的宽类型
    //   (`FeatureValueRow[]`),而建索引要的是**装好的** `FeatureValue[]` ——
    //   这正是改动前那个参数的类型,一个字没动。宽的那份只是"过一手"。
    this.#byId = new Map(this.values.map((v) => [v.id, v]));
  }

  /** 按 id 取一个取值;不在这一类里就是 `undefined`。 */
  valueById(id: string): FeatureValue | undefined {
    return this.#byId.get(id);
  }
}
export interface FeatureDimension extends Omit<DimensionRow, 'values'> {
  /** ★ 文件里是宽 Raw(`FeatureValueRow[]`);这里已经是装好的实体。 */
  readonly values: readonly FeatureValue[];
}

/**
 * 整份面部词表 = `skin-tones.json` + `features.json`。
 *
 * ★ **它是本模块唯一一个「参数照旧、没接 schema」的类,理由是它压根不是任何一份文件的形状**:
 *   `version` / `disclaimer` 来自 `skin-tones.json`,`dimensions` 来自 `features.json` ——
 *   它是两份文件**装配**出来的第三个东西,词表里没有哪一行能当它的 `Row`。
 *   硬造一份只会得到一份"谁都不写、谁都不读"的 schema。
 *   ⚠️ 三个形状都是**已校验过的实体**(`SkinToneTier` / `FeatureDimension`),
 *   不是裸 JSON —— 这也是它接不上"文件形状"的更硬的理由。
 */
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
