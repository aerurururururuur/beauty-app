/**
 * modules/user/compose.ts —— 组合根:把持久化与用例装起来,由 src/index.ts 注入 web shell。
 * ✏️ 2026-09-30:人设库落地到本模块,于是多了人设仓库 + 照片字节库 + 六个用例 + 一个**可缺省**的读脸端口。
 */
import path from 'node:path';
import { RegisterUser } from './application/usecases/register-user.js';
import { AuthenticateUser } from './application/usecases/authenticate-user.js';
import { GetUser } from './application/usecases/get-user.js';
import { ListPersonas } from './application/usecases/list-personas.js';
import { CreatePersona } from './application/usecases/create-persona.js';
import { UpdatePersona } from './application/usecases/update-persona.js';
import { RemovePersona } from './application/usecases/remove-persona.js';
import { ReadPersonaPhoto } from './application/usecases/read-persona-photo.js';
import { AnalyzePersonaFace } from './application/usecases/analyze-persona-face.js';
import { ListSkinTones } from './application/usecases/list-skin-tones.js';
import { CreateSkinTone } from './application/usecases/create-skin-tone.js';
import { RemoveSkinTone } from './application/usecases/remove-skin-tone.js';
import { JsonUserRepository } from './infrastructure/json/user-repository.js';
import { JsonPersonaRepository } from './infrastructure/json/persona-repository.js';
import { JsonSkinToneRepository } from './infrastructure/json/skin-tone-repository.js';
import { FilePersonaPhotoStore } from './infrastructure/file-system/persona-photo-store.js';
import { ScryptPasswordHasher } from './infrastructure/crypto/scrypt-password-hasher.js';
import type { PasswordHasher } from './domain/ports/password-hasher.js';
import type { UserRepository } from './domain/ports/user-repository.js';
import type { PersonaRepository } from './domain/ports/persona-repository.js';
import type { PersonaPhotoStore } from './domain/ports/persona-photo-store.js';
import type { SkinToneRepository } from './domain/ports/skin-tone-repository.js';
import type { FaceReader } from './domain/ports/face-reader.js';

export interface UserModuleOptions {
  /** 数据根目录绝对路径;账号表落在其下 users/ 子目录(users.json)。 */
  dataDir: string;
  /**
   * ★ **读脸端口,可缺省** —— 它底下会花钱,所以接不接是部署决定:`VISION_ANALYZER=off`(缺省)时
   * 本模块没有 `AnalyzePersonaFace`,那条路由不注册(404),列表里 `canAnalyzeFace: false`。
   * 接线在 `src/index.ts`(包一层 `makeup` 的 `Analyzers['face']`),本模块不 import `makeup`。
   */
  faceReader?: FaceReader;
}

export interface UserModuleServices {
  users: UserRepository;
  hasher: PasswordHasher;
  registerUser: RegisterUser;
  authenticateUser: AuthenticateUser;
  getUser: GetUser;

  // ---- 人设库(落 `dataDir/personas/`:personas.json + seeded.json + tones.json + photos/)----
  personas: PersonaRepository;
  personaPhotos: PersonaPhotoStore;
  /** ★ 自建肤色档(2026-09-30):**按账号**共用一份小库,人设行按 id 引用其中一档。 */
  skinTones: SkinToneRepository;
  listPersonas: ListPersonas;
  createPersona: CreatePersona;
  updatePersona: UpdatePersona;
  removePersona: RemovePersona;
  readPersonaPhoto: ReadPersonaPhoto;
  listSkinTones: ListSkinTones;
  createSkinTone: CreateSkinTone;
  removeSkinTone: RemoveSkinTone;
  /** ★ 没有读脸端口时**这个键不存在**(不是给一个 `undefined`)。 */
  analyzePersonaFace?: AnalyzePersonaFace;
}

export function createUserModule(options: UserModuleOptions): UserModuleServices {
  const users: UserRepository = new JsonUserRepository(path.join(options.dataDir, 'users'));
  const hasher: PasswordHasher = new ScryptPasswordHasher();

  const registerUser = new RegisterUser({ users, hasher });
  const authenticateUser = new AuthenticateUser({ users, hasher });
  const getUser = new GetUser(users);

  // ★ 人设住**自己的子目录** —— 照片字节绝不许落进 `assets` 的 inputs/results,那两处会被 TTL 清理真删。
  const personaDir = path.join(options.dataDir, 'personas');
  const personas: PersonaRepository = new JsonPersonaRepository(personaDir);
  const personaPhotos: PersonaPhotoStore = new FilePersonaPhotoStore(
    path.join(personaDir, 'photos'),
  );

  const listPersonas = new ListPersonas({ personas, users });
  const createPersona = new CreatePersona({ personas, photos: personaPhotos, users });
  const updatePersona = new UpdatePersona({ personas, photos: personaPhotos });
  const removePersona = new RemovePersona({ personas, photos: personaPhotos });
  const readPersonaPhoto = new ReadPersonaPhoto({ personas, photos: personaPhotos });

  // ★ 自建档与人设表**同目录不同文件**(tones.json):它们是同一族数据,一起看好读。
  const skinTones: SkinToneRepository = new JsonSkinToneRepository(personaDir);
  const listSkinTones = new ListSkinTones({ tones: skinTones });
  const createSkinTone = new CreateSkinTone({ tones: skinTones, users });
  // ★ 删除要问人设仓库"还有谁在用" —— 这也是这一档住在 user 模块里的一个好处。
  const removeSkinTone = new RemoveSkinTone({ tones: skinTones, personas });

  // ★ 读脸用例**只有拿到端口才构造**。`faceReader` 缺省 ⇒ 下面那一格不出现 ⇒
  //   `app.ts` 那个"配了才传"的写法收不到东西 ⇒ 路由不注册。一条链,不是一个开关。
  const faceReader = options.faceReader;
  const analyzePersonaFace = faceReader ? new AnalyzePersonaFace({ users, faceReader }) : undefined;

  return {
    users,
    hasher,
    registerUser,
    authenticateUser,
    getUser,
    personas,
    personaPhotos,
    skinTones,
    listPersonas,
    createPersona,
    updatePersona,
    removePersona,
    readPersonaPhoto,
    listSkinTones,
    createSkinTone,
    removeSkinTone,
    ...(analyzePersonaFace ? { analyzePersonaFace } : {}),
  };
}
