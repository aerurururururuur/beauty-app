/**
 * domain/schemas/contracts/image-ref.ts —— 已落盘图片的存储引用的形状(`ImageRef`)。
 *
 * 属跨模块契约(`contracts/`):`assets` 生成它、`agent` 把它填进会话、`makeup` 的端口收它。
 * 三个模块用的是**同一个** `ImageRef`,所以形状只此一份 ——
 * `domain/entities/image.ts` 那边只 `z.output` 转出,一个字段都不重抄(§4.1)。
 *
 * ★ **只有形状**:`ImageRef` 由 `artifact-store` 直接构造出来,不经 zod 解析,
 *   所以这里不写 `.min(1)` 这类取值规则(§4.2 —— 写了也只是把一条没人执行的规则摆两处)。
 *   真出现"从外部读进一份 ImageRef"的那天再补,别提前加。
 */
import { z } from 'zod';

export const imageRefSchema = z
  .object({
    /** 相对数据目录的相对路径(正斜杠,由 artifact-store 生成)。 */
    storeKey: z.string(),
    mimeType: z.string(),
    /** 用户原始文件名(仅用于界面回显,不落盘解析)。 */
    originalName: z.string().optional(),
  })
  .strict();

/**
 * 已落盘图片的存储引用。★ 形状的**单源就是上面那份 schema** ——
 * `domain/entities/image.ts` 只把这个名字转出去,不重抄字段。
 */
export type ImageRef = z.output<typeof imageRefSchema>;
