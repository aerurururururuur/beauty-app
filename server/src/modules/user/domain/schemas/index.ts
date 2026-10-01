/**
 * user/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * `entities/` 是账号表那一行的形状（凭据入参与 id），`api/` 是对外 DTO。
 * ★ 这里只有形状;长度上下限与 id 格式在 `domain/validators/user.validator.ts`(§4.2)。
 * ★ `UserView` 不含 `passwordHash`，落地在 `application/user-view.ts` 的投影里。
 */
export {
  credentialsSchema,
  userIdSchema,
  userProfileSchema,
  userSchema,
  userTableSchema,
} from './entities/user.js';
export type { CredentialsRaw, UserIdScalar, UserProfileRaw, UserRow } from './entities/user.js';

export { userAvatarSourceSchema, userViewSchema } from './api/user-view.js';
export type { UserView } from './api/user-view.js';

// ---- 人设库(2026-09-30 落地:此前整块住在前端 localStorage 里)----
// ★ `skinTone` / `features` 在这里**只查形状**,白名单不在这份文件里 —— 理由见
//   `entities/persona.ts` 的文件头(与前端展示档是两套词,靠测试对表)。
export {
  personaAnalyzeSchema,
  personaCreateSchema,
  personaIdSchema,
  personaOwnerQuerySchema,
  personaPhotoSchema,
  personaRowSchema,
  personaSchema,
  personaSeedTableSchema,
  personaTableSchema,
  personaUpdateSchema,
} from './entities/persona.js';
export type {
  PersonaAnalyzeRaw,
  PersonaCreateRaw,
  PersonaOwnerQueryRaw,
  PersonaPhoto,
  PersonaRow,
  PersonaShape,
  PersonaUpdateRaw,
} from './entities/persona.js';

export {
  personaFaceSuggestionSchema,
  personaListViewSchema,
  personaPhotoSourceSchema,
  personaViewSchema,
} from './api/persona-view.js';
export type {
  PersonaFaceSuggestion,
  PersonaListView,
  PersonaView,
} from './api/persona-view.js';

// ---- 自建肤色档(2026-09-30:人设的肤色不再只有预置那 8 档)----
export {
  skinToneCreateSchema,
  skinToneRowSchema,
  skinToneSchema,
  skinToneTableSchema,
} from './entities/skin-tone.js';
export type {
  SkinToneCreateRaw,
  SkinToneRow,
  SkinToneShape,
} from './entities/skin-tone.js';

export { skinToneViewSchema } from './api/skin-tone-view.js';
export type { SkinToneView } from './api/skin-tone-view.js';

// ---- 自建特征(2026-09-30:用户自己写的特征也能整账号共用一份小库)----
// ★ `group` 与 `text` 都只查形状:六个分组词表住在前端 kb,服务端不抄第二份(同 `features` 那条理由)。
export {
  customFeatureCreateSchema,
  customFeatureRowSchema,
  customFeatureSchema,
  customFeatureTableSchema,
} from './entities/custom-feature.js';
export type {
  CustomFeatureCreateRaw,
  CustomFeatureRow,
  CustomFeatureShape,
} from './entities/custom-feature.js';

export { customFeatureViewSchema } from './api/custom-feature-view.js';
export type { CustomFeatureView } from './api/custom-feature-view.js';
