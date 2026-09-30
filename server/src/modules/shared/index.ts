/**
 * modules/shared —— 全局共享模块(public barrel)。
 * 唯一被依赖、不依赖任何业务模块的地基:brief 枚举单源、图片值对象、领域错误。
 * 运行配置(config)与错误码→HTTP 映射(error-handler)属于「组装/web shell」关心,
 * 只由 src/ 根(组合根)按深路径取用,不进此 barrel。
 */
export { OCCASIONS, SKIN_TONES, SKIN_TYPES } from './domain/entities/brief.js';
export type {
  MakeupBrief,
  Occasion,
  SkinTone,
  SkinType,
  WeatherInfo,
} from './domain/entities/brief.js';

export type { ImageRef, ResolvedImage } from './domain/entities/image.js';

// ★ 引擎的**封闭词汇表**(色汇表 + 几何槽位)。从 `makeup` 迁来,理由见其文件头:
//   `look-spec.ts` 头部预言的搬迁条件("待前端 chips 落地时再迁")已经成立,
//   而且 `face-catalog` 要校验目录里的 `toneKeys` / `route.slot`,不能反向依赖 `makeup`。
export { GEOMETRY_SLOTS, TONE_KEYS } from './domain/entities/look-vocabulary.js';
export type { FeatureRoute, GeometrySlot, ToneKey } from './domain/entities/look-vocabulary.js';

// 预设场合的语义单一源(中文名/方向/标签/关键词 + 纯函数 sceneRuleFor / describeScene)。
// ★ 本文件同时被前端经 vite alias `@scene-rules` 直接执行,规矩见其文件头。
// ★ 自由文本的场合要用那张表时**走 `sceneRuleFor`**(裸下标会在自定义场合上炸)。
//   ⚠️ 要**显示**场合(不是判定)时走 `presetOccasionCn`:预设 id 翻成中文名,
//   用户自己的说法原样返回 —— 别用 `sceneRuleFor` 的 `label`,那会把原话收成一档。
export {
  DEFAULT_OCCASION,
  SCENE_MATCH_ORDER,
  SCENE_RULES,
  describeScene,
  presetOccasionCn,
  sceneRuleFor,
} from './domain/scene-rules.js';
export type { SceneDescriptor, SceneStyle } from './domain/scene-rules.js';

export { AppError, ErrorCode } from './domain/errors/app-error.js';
export type { ErrorCodeValue } from './domain/errors/app-error.js';

// ★ 上提的公共零件(不是新能力,是把已有副本合成一份,见各自文件头):
//   · zodIssuesMessage    —— 此前 jobs / user / weather / cabinet 各持一份逐字相同的实现
//   · briefFields + 规则  —— 此前表单与对话两条路各写一遍「改一处要记得改另一处」
// ⚠️ `agent/domain/validators/validate.ts` 那份**不在**这里,它是给模型看的变体,不是副本。
export { zodIssuesMessage } from './domain/validators/zod-issues.js';

// ★ 形状与行为**分两处**导出(§4.2):
//   · `briefFields`      —— 只有结构(五个可选字符串),给两条路的 schema 展开
//   · `checkBriefFields` —— 规则(枚举白名单 / 上限 / trim)与两个上限常量
//   两条入口(表单 metaRaw / 对话 patch_brief)调的都是后者那一份。
export { briefFields } from './domain/schemas/index.js';

// ★ 形状从 `schemas/` 走(§4.1),`ImageRef` 的**类型**由 `domain/entities/image.js` 转出;
//   这里补的是**值**:`agent` 的 `sessionSchema` 要拿它当 `faceRef`/`styleRef`/`sceneRef` 的字段形状。
export { imageRefSchema } from './domain/schemas/index.js';
export {
  checkBriefFields,
  MAX_DRESS,
  // ★ 2026-09-30 补进 barrel:`user` 的人设库要拿它给 `features` 条数封顶
  //   (人设的 `features` 与 `brief.features` 是**同一个词**,不该有第二个上限)。
  MAX_FEATURES,
  MAX_OCCASION,
  // ★ 「补充说明」那段话的上限。⚠️ 与 `user` 的 `MAX_NOTES`(200)是两个数:这一格还要装自定义特征。
  MAX_PERSONA_NOTES,
  MAX_SCENE_NOTE,
  MAX_SCENE_TEXT,
  MAX_STYLE_TEXT,
} from './domain/validators/brief-fields.validator.js';
export type {
  BriefFieldsCheck,
  BriefFieldsInput,
} from './domain/validators/brief-fields.validator.js';
