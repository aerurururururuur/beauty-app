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

// 场合语义单一源(中文名/方向/标签/关键词 + 纯函数 describeScene)。
// ★ 本文件同时被前端经 vite alias `@scene-rules` 直接执行,规矩见其文件头。
export {
  DEFAULT_OCCASION,
  SCENE_MATCH_ORDER,
  SCENE_RULES,
  describeScene,
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
  MAX_SCENE_TEXT,
} from './domain/validators/brief-fields.validator.js';
export type {
  BriefFieldsCheck,
  BriefFieldsInput,
} from './domain/validators/brief-fields.validator.js';
