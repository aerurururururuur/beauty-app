/**
 * modules/user —— 用户模块(public barrel)。
 * 账号 = 昵称 + 密码(只存哈希,不存明文):注册 / 登录核对 / 按 id 查档案。
 * ✏️ 2026-10-01:「编辑资料」落地 —— 账号多了可改的简介与头像(`PATCH /users/:id`)。
 * ✏️ 2026-09-30:它**还拿着人设库**(`/personas` 那一族)—— 一份人设是挂在账号下的一张脸,
 * 归属校验直接问本模块的账号仓库,所以落在同一个模块里(见 `modules/user/README.md`)。
 * 本轮仍不做登录态(不签发 token);跨模块协作只经由这里。
 */

// ---- 领域实体(纯数据 + 工厂)----
export type { User } from './domain/entities/user.js';
export type { UserAvatarChange } from './domain/entities/user.js';
export {
  createUser,
  updateUserProfile,
  userAvatarMissing,
  userNotFound,
} from './domain/entities/user.js';
export type { Persona } from './domain/entities/persona.js';
export { createPersona, personaNotFound, updatePersona } from './domain/entities/persona.js';
export type { SkinTone } from './domain/entities/skin-tone.js';
export {
  MAX_TONES_PER_USER,
  createSkinTone,
  skinToneInUse,
  skinToneNotFound,
} from './domain/entities/skin-tone.js';
export type { CustomFeature } from './domain/entities/custom-feature.js';
export {
  MAX_CUSTOM_FEATURES_PER_USER,
  createCustomFeature,
  customFeatureIdOf,
  customFeatureInUse,
  customFeatureNotFound,
} from './domain/entities/custom-feature.js';

// ---- schemas(形状/契约,无行为)----
export { credentialsSchema, userIdSchema } from './domain/schemas/index.js';
export type { CredentialsRaw, UserIdScalar } from './domain/schemas/index.js';
/**
 * ★ **落盘行的形状也导出**(同 `cabinet` / `agent` 那条测试接缝的理由):
 * 读出口的解析依据是它(§7.2),而「盘上写下去的键集合与这份 schema 一格不差」
 * 只有拿到 schema 才验得了(`test/user.test.ts` 的往返那条)。**它是形状,不是规则。**
 */
export { userAvatarSourceSchema, userProfileSchema, userSchema, userTableSchema } from './domain/schemas/index.js';
export type { UserProfileRaw, UserRow } from './domain/schemas/index.js';

// ---- validators(校验行为,语义错误码)----
// ★ 五个长度常量跟着规则搬到了 validator(§4.2)。**仍从这里转出**:不让既有调用方改
//   import 路径(同样的转发在 `shared` 的 `MAX_SCENE_TEXT` 上也有)。新代码请直接从
//   `domain/validators/user.validator.js` 引——barrel 上这条转发只是兼容。
export {
  MAX_BIO,
  MAX_BIO_RAW,
  MAX_NICKNAME,
  MAX_NICKNAME_RAW,
  MAX_PASSWORD,
  MIN_NICKNAME,
  MIN_PASSWORD,
  validateCredentials,
  validateProfileInput,
  validateUserId,
} from './domain/validators/user.validator.js';
export type {
  Credentials,
  UserAvatarInput,
  UserProfileInput,
} from './domain/validators/user.validator.js';

// ---- 对外 API 契约 / DTO ----
export type { UserView } from './domain/schemas/index.js';

/* ========================= 人设库(personas)========================= */
// ★ 分成两截的理由与上面账号那一段一致:形状 / 规则 / 端口 / 用例 / HTTP 各自成组。
//   本模块**没有**为它单独开第二个 barrel —— 它就是 user 模块的一部分。

// ---- 形状(契约,无行为)----
export {
  personaCreateSchema,
  personaRowSchema,
  personaSchema,
  personaSeedTableSchema,
  personaTableSchema,
  personaUpdateSchema,
} from './domain/schemas/index.js';
export type {
  PersonaCreateRaw,
  PersonaPhoto,
  PersonaRow,
  PersonaShape,
  PersonaUpdateRaw,
} from './domain/schemas/index.js';
export {
  customFeatureRowSchema,
  customFeatureSchema,
  customFeatureTableSchema,
  customFeatureViewSchema,
  personaFaceSuggestionSchema,
  personaListViewSchema,
  personaPhotoSourceSchema,
  personaViewSchema,
  skinToneRowSchema,
  skinToneSchema,
  skinToneTableSchema,
  skinToneViewSchema,
} from './domain/schemas/index.js';
export type {
  CustomFeatureRow,
  CustomFeatureShape,
  CustomFeatureView,
  PersonaFaceSuggestion,
  PersonaListView,
  PersonaView,
  SkinToneRow,
  SkinToneShape,
  SkinToneView,
} from './domain/schemas/index.js';

// ---- 示例人设(种子)----
// ★ 导出的理由与 `userSchema` 那条一样:测试要拿它**对表**
//   (`test/persona-vocabulary.test.ts` 逐条对前端的展示档 / 特征库 / 静态图)。
export { PERSONA_SEEDS, PERSONA_SEED_VERSION } from './domain/entities/persona-seeds.js';
export type { PersonaSeed } from './domain/entities/persona-seeds.js';

// ---- validators(校验行为,语义错误码)----
export {
  MAX_FEATURE_ID,
  MAX_NAME,
  MAX_NAME_RAW,
  MAX_NOTES,
  MAX_RELATION,
  MAX_SKIN_TONE,
  PERSONA_RELATIONS,
  parsePersonaTable,
  parseSeedTable,
  validateAnalyzeInput,
  validateCreateInput,
  validateOwnerQuery,
  validatePersonaId,
  validateUpdateInput,
} from './domain/validators/persona.validator.js';
export type {
  AnalyzePersonaInput,
  CreatePersonaInput,
  PersonaOwnerQuery,
  PersonaPhotoInput,
  UpdatePersonaInput,
} from './domain/validators/persona.validator.js';

// ★ 图片 dataURL 的体积/类型上限与解码器:人设照片与账号头像共用(✏️ 2026-10-01 从 persona.validator 搬出);
//   组装根接读脸端口那处也拿 `dataUrlToBytes`(见 `src/index.ts`)—— 那是跨模块的取用点,别在 barrel 里断掉。
export { MAX_PHOTO_BYTES, MAX_PHOTO_DATAURL, PHOTO_MIME, dataUrlToBytes } from './domain/validators/photo.validator.js';
export type { DecodedPhoto } from './domain/validators/photo.validator.js';

// ★ 自建肤色档的三个常量与解析器:测试要拿它们对表(同 `personaRowSchema` 那条的理由)。
export {
  MAX_TONE_NAME,
  MAX_TONE_NAME_RAW,
  parseSkinToneTable,
  validateCreateSkinToneInput,
} from './domain/validators/skin-tone.validator.js';
export type { CreateSkinToneInput } from './domain/validators/skin-tone.validator.js';

// ★ 自建特征的三个常量与解析器:理由同上。
export {
  MAX_FEATURE_GROUP,
  MAX_FEATURE_TEXT,
  MAX_FEATURE_TEXT_RAW,
  parseCustomFeatureTable,
  validateCreateCustomFeatureInput,
} from './domain/validators/custom-feature.validator.js';
export type { CreateCustomFeatureInput } from './domain/validators/custom-feature.validator.js';

// ---- ports(本模块持契约;实现见 infrastructure)----
export type { FaceReader, FaceReadOutcome } from './domain/ports/face-reader.js';
export type { PersonaPhotoStore } from './domain/ports/persona-photo-store.js';
export type { PersonaRepository } from './domain/ports/persona-repository.js';
export type { CustomFeatureRepository } from './domain/ports/custom-feature-repository.js';
export type { SkinToneRepository } from './domain/ports/skin-tone-repository.js';
export type { UserAvatarStore } from './domain/ports/user-avatar-store.js';
// 默认实现的导出只为组合根与测试(同 `JsonUserRepository`);业务代码请依赖上面的端口类型。
export { JsonCustomFeatureRepository } from './infrastructure/json/custom-feature-repository.js';
export { JsonPersonaRepository } from './infrastructure/json/persona-repository.js';
export { JsonSkinToneRepository } from './infrastructure/json/skin-tone-repository.js';
// ✏️ 2026-10-01:原 `FilePersonaPhotoStore` 泛化成它 —— 人设照片与账号头像各 new 一次。
export { FilePhotoStore } from './infrastructure/file-system/photo-store.js';

// ---- 用例 ----
export { AnalyzePersonaFace } from './application/usecases/analyze-persona-face.js';
export { CreateCustomFeature } from './application/usecases/create-custom-feature.js';
export { CreatePersona } from './application/usecases/create-persona.js';
export { CreateSkinTone } from './application/usecases/create-skin-tone.js';
export { ListCustomFeatures } from './application/usecases/list-custom-features.js';
export { ListPersonas } from './application/usecases/list-personas.js';
export { ListSkinTones } from './application/usecases/list-skin-tones.js';
export { ReadPersonaPhoto } from './application/usecases/read-persona-photo.js';
export { ReadUserAvatar } from './application/usecases/read-user-avatar.js';
export { UpdateProfile } from './application/usecases/update-profile.js';
export { RemoveCustomFeature } from './application/usecases/remove-custom-feature.js';
export { RemovePersona } from './application/usecases/remove-persona.js';
export { RemoveSkinTone } from './application/usecases/remove-skin-tone.js';
export { UpdatePersona } from './application/usecases/update-persona.js';

// ---- presentation(HTTP 路由挂载)----
export { registerPersonasRoutes } from './presentation/routes/personas.route.js';
export type { PersonasDeps } from './presentation/personas.controller.js';

// ---- ports(本模块持契约;实现见 infrastructure)----
export type { PasswordHasher } from './domain/ports/password-hasher.js';
export type { UserRepository } from './domain/ports/user-repository.js';
// 默认实现的导出只为组合根与测试(同 makeup 导 ImageEngine);业务代码请依赖上面的端口类型。
export { JsonUserRepository } from './infrastructure/json/user-repository.js';
export { ScryptPasswordHasher } from './infrastructure/crypto/scrypt-password-hasher.js';

// ---- 用例 ----
export { AuthenticateUser } from './application/usecases/authenticate-user.js';
export { GetUser } from './application/usecases/get-user.js';
export { RegisterUser } from './application/usecases/register-user.js';

// ---- presentation(HTTP 路由挂载)----
export { registerUsersRoutes } from './presentation/routes/users.route.js';
export type { UsersDeps } from './presentation/users.controller.js';

// ---- 组合根 ----
export { createUserModule } from './compose.js';
export type { UserModuleOptions, UserModuleServices } from './compose.js';
