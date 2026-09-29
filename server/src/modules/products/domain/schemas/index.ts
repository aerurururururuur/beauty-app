/**
 * products/domain/schemas —— 形状的 barrel（目录里有 index.ts 就必须走它）。
 *
 * 内容目录里那两个 JSON 文件的形状 = 资产文件的行，故进 `entities/`。
 * 无 HTTP 面，无 `api/`；目录不存在是合法关闭形态，判断在 validator 里。
 */
export { productFileSchema, libraryFileSchema } from './entities/content.js';
