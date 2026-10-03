/**
 * application/look-view.ts —— 领域 Look → 对外 LookView。只做纯投影,不含任何 IO。
 * 每一格**复制**成新对象(含嵌套数组),不把实体的引用透出去:
 * 视图与领域对象从此互不影响,也顺带剥掉实体将来可能多出来的字段。
 *
 * ★ `coverUrl` 是**裸路径** `/<模块>/<id>/cover` —— 不含 `API_BASE`、不含 `userId`。
 *   同 `avatarUrl` / `photoUrl` 的约定:后端只说出「图在哪条路由上」,怎么拼基址、
 *   带上谁的 userId 是前端的事(`lookCoverHref`)。
 */
import type { Look } from '../domain/entities/look.js';
import type { LookView } from '../domain/schemas/index.js';

export function toLookView(look: Look): LookView {
  return {
    id: look.id,
    userId: look.userId,
    sessionId: look.sessionId,
    seq: look.seq,
    sceneId: look.sceneId,
    sceneName: look.sceneName,
    ...(look.styleId !== undefined ? { styleId: look.styleId } : {}),
    styleName: look.styleName,
    lookDescription: look.lookDescription,
    summary: look.summary,
    keywords: [...look.keywords],
    stepCount: look.stepCount,
    palette: look.palette.map((entry) => ({ ...entry })),
    products: look.products.map((p) => ({ ...p })),
    steps: look.steps.map((step) => ({ ...step, tips: [...step.tips] })),
    personalized: look.personalized.map((p) => ({ ...p, products: [...p.products] })),
    coverUrl: `/looks/${look.id}/cover`,
    createdAt: look.createdAt,
  };
}
