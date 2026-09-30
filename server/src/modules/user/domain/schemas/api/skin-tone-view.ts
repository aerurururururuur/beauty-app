/**
 * domain/schemas/api/skin-tone-view.ts —— 自建肤色档的对外 DTO 形状(zod,无行为)。
 * ★ 只有三格:`userId` / `createdAt` 是库内记账,前端画个色点用不着。
 * ★ 没有 `tone` / `desc`:那是前端给预置 8 档配的展示词,自建档没有,后端也不替它编。
 */
import { z } from 'zod';

/** 一个自建肤色档的对外形状。 */
export const skinToneViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** `#rrggbb`,直接当色点底色用。 */
    hex: z.string(),
  })
  .strict();

/** 一条自建肤色档的对外形状。 */
export type SkinToneView = z.output<typeof skinToneViewSchema>;
