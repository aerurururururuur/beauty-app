/**
 * application/persona-view.ts —— 领域 Persona → 对外 PersonaView。纯投影,无 IO。
 *
 * ★★ **`photoUrl` 错起来是静默的。** `kind:'file'` 时给的是 **`/personas/<id>/photo`(不带 `/api`)**,
 * 由前端补 `API_BASE` 与 `?userId=` 再进 `<img>`。**绝不在这里拼绝对地址** —— 后端不知道部署前缀。
 * ⚠️ 前端的坑:dev 下 Vite 会把裸 `/personas/<id>/photo` 当前端路由 `/personas/:id`,回 index.html
 * ⇒ 破图 / `fetch` 拿到 HTML,**全都不报错**。所以 `photoSource` 那一格不是可选的。
 *
 * ★ **中文派生字段(关系名 / 档名 / 色值 / 特征名)不在这里补**:它们要的 `hex` 与中文档名只在前端 kb,
 * 后端那份是另一套词、另一组色值,下发只会在同一屏上造出两个颜色。由前端 `decoratePersona` 做。
 */
import type { Persona } from '../domain/entities/persona.js';
import type { PersonaView } from '../domain/schemas/index.js';

/** 存储在服务端的照片,对外那条路由(不带 `/api`,见文件头)。 */
export function personaPhotoPath(id: string): string {
  return `/personas/${id}/photo`;
}

/** 照片那一格 → 对外两格。三种情形分开写:这个函数错起来是静默的(破图 / 空 src)。 */
function projectPhoto(persona: Persona): Pick<PersonaView, 'photoUrl' | 'photoSource'> {
  const photo = persona.photo;
  if (photo.kind === 'seed') return { photoUrl: photo.url, photoSource: 'static' };
  if (photo.kind === 'file') return { photoUrl: personaPhotoPath(persona.id), photoSource: 'stored' };
  return { photoUrl: '', photoSource: 'none' };
}

export function toPersonaView(persona: Persona): PersonaView {
  return {
    id: persona.id,
    name: persona.name,
    relation: persona.relation,
    skinTone: persona.skinTone,
    // ★ 复制成新数组:视图与实体从此互不影响(同 `toCosmeticItemView` 的理由)。
    features: [...persona.features],
    // ★ 行里没有这一格(没写过补充说明)时给空串:**恒有这一格**是契约,见 DTO 那条注释。
    notes: persona.notes ?? '',
    ...projectPhoto(persona),
    createdAt: persona.createdAt,
    ...(persona.updatedAt !== undefined ? { updatedAt: persona.updatedAt } : {}),
  };
}
