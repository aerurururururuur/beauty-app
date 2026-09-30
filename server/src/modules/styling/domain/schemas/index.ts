/**
 * domain/schemas —— 形状的 barrel(同 `agent` / `face-catalog` 的先例)。
 * 对外只出**输出行类型**,实体那边拿它当 `type X = XRow`。
 */
export {
  styleProductSchema,
  styleRecipeSchema,
  styleStepSchema,
} from './entities/style-recipes.js';
export type {
  StyleProductRow,
  StyleRecipeRow,
  StyleStepRow,
} from './entities/style-recipes.js';
