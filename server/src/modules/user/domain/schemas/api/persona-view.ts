/**
 * domain/schemas/api/persona-view.ts —— 人设的对外 DTO 形状(zod,无行为)。
 *
 * ★ 与落盘行不是一份,刻意如此:行里是 `photo: {kind,url|mime}`,对外是 `photoUrl` + `photoSource` ——
 * "这个 src 该填什么"才是调用方要的。投影在 `application/persona-view.ts`。
 *
 * ★★ **没有 `relationName` / `skinToneName` / `skinToneHex` / `featureNames`**:那几个中文派生字段
 * 由**前端** `decoratePersona` 算,因为要的 `hex` / 中文档名只在前端 kb 里,后端那份是另一套词、另一组色值。
 */
import { z } from 'zod';
import { customFeatureViewSchema } from './custom-feature-view.js';
import { skinToneViewSchema } from './skin-tone-view.js';

/** 照片的来源。★ 前端据此决定要不要把 `photoUrl` 补成绝对地址(见 DTO 里那一格)。 */
export const personaPhotoSourceSchema = z.enum(['none', 'static', 'stored']);

export const personaViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    relation: z.string(),
    /** ★ **展示档 id**(`yellow-1` 那种),与落盘那一格是同一个值,原样转手。 */
    skinTone: z.string(),
    features: z.array(z.string()),
    /**
     * 「补充说明」:用户自己写的一段话。★ **恒有这一格**(没有就是空串)——
     * 它给 `<textarea>` 回填用,`undefined` 会让输入框在 Vue 里变成非受控,而那是**静默**的坏法。
     * ★ 出图时它作为 `brief.personaNotes` 交给后端 agent(`api/design.js` 的 `toBrief`)。
     */
    notes: z.string(),
    /**
     * 给 `<img :src>` 用的地址。`photoSource` 为 `stored` 时是
     * **`/personas/<id>/photo`(不含 `/api`)**,由前端补前缀与 `?userId=`;
     * `static` 时是前端 `public/` 下的绝对路径;`none` 时是空串。
     */
    photoUrl: z.string(),
    photoSource: personaPhotoSourceSchema,
    createdAt: z.string(),
    updatedAt: z.string().optional(),
  })
  .strict();

/**
 * 列表响应。★ `canAnalyzeFace` = **这个部署有没有读脸能力**,取值只来自「组合根接没接读脸端口」。
 * 没这一格前端只能靠"点一下看是不是 404"猜,而那正是「off 要表现为入口不存在」想避免的。
 */
export const personaListViewSchema = z
  .object({
    personas: z.array(personaViewSchema),
    /**
     * 本账号**自建**的肤色档(预置那 8 档在前端 kb 里,**不在这份里**)。
     * ★ 搭列表一起回,不另开 `GET /personas/tones`:那一屏同时要这两样。
     */
    skinTones: z.array(skinToneViewSchema),
    /**
     * 本账号**自建**的特征(前端 kb 里那 31 条目录**不在这份里**)。
     * ★ 同上,搭列表一起回,不另开 `GET /personas/features`。
     * ⚠️ 这一格叫 `customFeatures` 而上一格叫 `skinTones`,是**刻意不对称**的:
     *   `features` 一个词在本仓已经被"人设自己那一格"占了,重名会读错。
     */
    customFeatures: z.array(customFeatureViewSchema),
    canAnalyzeFace: z.boolean(),
  })
  .strict();

/**
 * 读脸的响应:一个**建议**肤色档。
 * ★ 值是**后端档 id**(`olive`/`warm_beige`),翻成展示档由前端反查表做(`api/design.js`)。
 * ★ 没有 `features`、没有 `confidence`:读脸的契约只有一格 `skinTone`,多回一个在那边是当场失败。
 * ★ **不落任何库**:落档由用户确认后的 `POST /personas` 完成。
 */
export const personaFaceSuggestionSchema = z.object({ skinTone: z.string() }).strict();

/** 一条人设的对外形状。 */
export type PersonaView = z.output<typeof personaViewSchema>;
/** 列表响应。 */
export type PersonaListView = z.output<typeof personaListViewSchema>;
/** 读脸响应。 */
export type PersonaFaceSuggestion = z.output<typeof personaFaceSuggestionSchema>;
