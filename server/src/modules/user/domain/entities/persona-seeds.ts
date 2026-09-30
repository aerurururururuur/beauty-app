/**
 * domain/entities/persona-seeds.ts —— 示例人设(种子)。**每用户各一份,不是全局共享。**
 *
 * ★ 这 5 份是从前端 `SEED_PERSONAS` **逐字搬来**的,搬迁时一格没改(本机那批数据是删掉重建的)。
 *   ⚠️ 要改这里任何一格,先想清楚「同一份种子已经在用户的服务端数据里了」—— 种子只补**缺失**的 id,
 *   改字段**不会**更新已播种的那份。
 *
 * ── 三条刻意如此、别"顺手修好" ──────────────────────────────────────────────
 * 1. **3 份 `photo` 是 `none`**(`ps-self` / `ps-mom` / `ps-friend`):那不是漏了配图,
 *    是前端的原样(`vue/AGENTS.md` §11-14)。补图会让"没人设照片长什么样"这条路径没人走过。
 * 2. **`skinTone` 存前端展示档 id**(`yellow-1`),不是后端那套 —— 见 `schemas/entities/persona.ts`。
 * 3. **`createdAt` 写死**(不是播种那一刻):它决定列表次序,取"此刻"会让每次重播都换顺序。
 *
 * ★ `PERSONA_SEED_VERSION`:**升它才会给老账号补新种子**,不升则一份都不动。
 */
import type { PersonaRow } from '../schemas/index.js';

/** 一份种子 = **落盘行去掉 `userId`**(归属由播种时那个账号定)。不另立 schema,只是一个 `Omit`。 */
export type PersonaSeed = Omit<PersonaRow, 'userId'>;

/** 种子版本。★ **加一份新种子时要 +1**,否则老账号永远看不到它(见文件头)。 */
export const PERSONA_SEED_VERSION = 3;

/** 示例人设。顺序 = 播种顺序;列表对外按 `createdAt` 倒序排(见 `ListPersonas`)。 */
export const PERSONA_SEEDS: readonly PersonaSeed[] = [
  {
    id: 'ps-self',
    name: '我的形象',
    relation: 'self',
    photo: { kind: 'none' },
    skinTone: 'yellow-1',
    features: ['eye-single', 'face-round', 'skin-combo'],
    createdAt: '2026-09-20T10:00:00.000Z',
  },
  {
    id: 'ps-mom',
    name: '妈妈',
    relation: 'family',
    photo: { kind: 'none' },
    skinTone: 'yellow-2',
    features: ['eye-drop', 'lip-lines', 'skin-dry'],
    createdAt: '2026-09-22T10:00:00.000Z',
  },
  {
    id: 'ps-friend',
    name: '闺蜜的形象',
    relation: 'friend',
    photo: { kind: 'none' },
    skinTone: 'cool-fair',
    features: ['eye-up', 'face-oval'],
    createdAt: '2026-09-25T10:00:00.000Z',
  },
  {
    id: 'ps-colleague',
    name: '同事小敏',
    relation: 'friend',
    photo: { kind: 'seed', url: '/assets/img/ph-colleague.svg' },
    skinTone: 'pink-fair',
    features: ['eye-deep', 'face-oval', 'skin-dry'],
    createdAt: '2026-09-26T10:00:00.000Z',
  },
  {
    id: 'ps-sister',
    name: '姐姐',
    relation: 'family',
    photo: { kind: 'seed', url: '/assets/img/ph-sister.svg' },
    skinTone: 'olive',
    features: ['eye-up', 'face-long', 'skin-combo'],
    createdAt: '2026-09-27T10:00:00.000Z',
  },
];
