/**
 * domain/schemas/entities/persona.ts —— 人设行的形状(zod,无行为)。
 * 只答「这是什么结构」;长度 / 白名单 / 上限全是业务规则,在 `persona.validator.ts`。
 *
 * ★★ **`skinTone` / `features` 在这里只查形状,不查成员——刻意的。**
 *   行里存的是**前端展示档 id**(`yellow-1`),与 `brief.ts` 的 `SKIN_TONES`(`warm_beige`)
 *   是两套词且色值逐条不同,拿后端那套校验会 422 掉每一份合法人设。
 *   一致性由 `test/persona-vocabulary.test.ts` 对表钉住,不在这里抄第二份清单。
 */
import { z } from 'zod';

/**
 * 照片那一格:行里存的是**指向**,不是路径也不是字节。
 *   · `none` —— 没有照片(种子里 3 份就是这一态,别顺手补图);
 *   · `seed` —— 示例人设的静态资源(前端 `public/` 下),`url` 是那个绝对路径;
 *   · `file` —— 用户传的,字节在 `<dataDir>/personas/photos/<id>.<ext>`,这里只留 mime。
 * ⚠️ `file` **不存 URL**:对外那条 `/personas/<id>/photo` 由视图层拼,URL 变了不该动盘上数据。
 */
export const personaPhotoSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('seed'), url: z.string() }).strict(),
  z.object({ kind: z.literal('file'), mime: z.string() }).strict(),
]);

/**
 * ★ 落盘行的形状(`personas.json` 里的一条)。别另立第二份字段清单:实体类也只 `Object.assign` 这一份。
 */
export const personaRowSchema = z
  .object({
    /** 人设唯一标识(UUID,服务端生成)。 */
    id: z.string(),
    /** 归属账号(前端传的 `userId`)。★ 归属不符一律 404,见实体的 `assertOwnedBy`。 */
    userId: z.string(),
    /** 这份人设叫什么(「妈妈」「同事小敏」)。 */
    name: z.string(),
    /** 关系:`self` / `family` / `friend` 或用户自己填的关系。★ 只判形状,见 validator。 */
    relation: z.string(),
    /** 肤色展示档 id。★ 见文件头:这里**不查成员**。 */
    skinTone: z.string(),
    /** 面部特征 id 列表。★ 同上,这里**不查成员**。 */
    features: z.array(z.string()),
    /**
     * 「补充说明」:用户自己写的一段话。上限在 validator(`MAX_NOTES`)。
     * ★ **可选**是为了 2026-09-30 之前落盘的行照样读得出来;但**必须登记在这一格** ——
     *   行是 `.strict()`,没登记的键会让 `parsePersonaTable` 抛普通 `Error`(500,不是 422)。
     */
    notes: z.string().optional(),
    /** 照片指向(见上)。 */
    photo: personaPhotoSchema,
    /** 建档时间(ISO 8601)。 */
    createdAt: z.string(),
    /** 最近一次改动时间(ISO 8601);没改过就没有这一格。 */
    updatedAt: z.string().optional(),
  })
  .strict();

/** 带品牌的行(实例那一侧)。 */
export const personaSchema = personaRowSchema.brand<'Persona'>();

/** 落盘表的形状:`{ [id]: PersonaRow }`。★ 用**不带品牌**那份:读出来的是行,由本轮包成实体。 */
export const personaTableSchema = z.record(z.string(), personaRowSchema);

/**
 * 播种表:`{ [userId]: 已播种到的版本号 }`(落 `seeded.json`)。
 * ★★ 没有它就会「删掉的种子下次进人设库自己回来」:播种只发生一次,而"发生过没有"是**每用户**状态,
 *   不能从 `personas.json` 推——5 份种子被删光时,那张表和一个从没播种过的新账号一模一样。
 */
export const personaSeedTableSchema = z.record(z.string(), z.number());

/** 「这份人设是谁的」查询串(列表 / 取照片 / 删除共用,那几条没有请求体)。 */
export const personaOwnerQuerySchema = z.object({ userId: z.string() }).strict();

/** 路径参数 `:id` 的形状。 */
export const personaIdSchema = z.string();

/**
 * 建档入参。★ `photo` 是**字符串**(dataURL 或空串),不是文件 —— `user` 模块不接 multipart:
 * 前端手上从来就是 `shrinkPhoto` 出的 dataURL,而 multipart 解析器住在 `agent/presentation/`。
 * `''` 表示**不要照片**(建档时与"没传这一格"同义)。
 */
export const personaCreateSchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    relation: z.string(),
    skinTone: z.string(),
    features: z.array(z.string()).optional(),
    notes: z.string().optional(),
    photo: z.string().optional(),
  })
  .strict();

/** 改档入参:只改传来的字段(与 `cabinet` 的 `updateItemSchema` 同款的部分更新)。 */
export const personaUpdateSchema = z
  .object({
    userId: z.string(),
    name: z.string().optional(),
    relation: z.string().optional(),
    skinTone: z.string().optional(),
    features: z.array(z.string()).optional(),
    /** ★ 三态:不给 = 不动;`''` = **清空**;有字 = 改(与 `photo` 同一套口径)。 */
    notes: z.string().optional(),
    photo: z.string().optional(),
  })
  .strict();

/**
 * 读脸入参。★ `photo` **必填**:没照片就没可读的东西,由形状直接拒掉,不当成"读不出来"往下走。
 */
export const personaAnalyzeSchema = z
  .object({
    userId: z.string(),
    photo: z.string(),
  })
  .strict();

/** 通过形状校验的一条人设行。 */
export type PersonaRow = z.output<typeof personaRowSchema>;
/** 带品牌的实例形状(实体类 `Persona` 的实例那一侧)。 */
export type PersonaShape = z.output<typeof personaSchema>;
/** 照片那一格。 */
export type PersonaPhoto = z.output<typeof personaPhotoSchema>;
/** 「这份人设是谁的」查询串。 */
export type PersonaOwnerQueryRaw = z.output<typeof personaOwnerQuerySchema>;
/** 通过形状校验的建档入参。 */
export type PersonaCreateRaw = z.output<typeof personaCreateSchema>;
/** 通过形状校验的改档入参。 */
export type PersonaUpdateRaw = z.output<typeof personaUpdateSchema>;
/** 通过形状校验的读脸入参。 */
export type PersonaAnalyzeRaw = z.output<typeof personaAnalyzeSchema>;
