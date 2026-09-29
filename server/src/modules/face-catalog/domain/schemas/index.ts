/**
 * face-catalog/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * 两个 JSON 词表文件的形状是两个持久化/资产文件的行，故进 `entities/`。
 * 「档位是否自洽」那类业务规则在 `domain/validators/vocabulary.validator.ts`。
 */
export { skinToneFileSchema, featureFileSchema } from './entities/vocabulary.js';
