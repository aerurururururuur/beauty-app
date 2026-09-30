/**
 * domain/schemas/api/custom-feature-view.ts —— 自建特征的对外 DTO 形状(zod,无行为)。
 * ★ 只有三格:`userId` / `createdAt` 是库内记账,前端摆一个 chip 用不着。
 * ★ 与本仓别处不同的一点:`id` 前端**用不到**(人设行里存的是 `group/text` 那串),但仍然下发 ——
 *   删这一条要按 id 走 `DELETE /personas/features/:id`,没有它前端就删不掉自己建的。
 */
import { z } from 'zod';

/** 一条自建特征的对外形状。 */
export const customFeatureViewSchema = z
  .object({
    id: z.string(),
    /** 分组 id(前端 kb 那六个之一)。★ 服务端只转发,不校验。 */
    group: z.string(),
    /** 用户写的原话,**不含分组前缀**。 */
    text: z.string(),
  })
  .strict();

/** 一条自建特征的对外形状。 */
export type CustomFeatureView = z.output<typeof customFeatureViewSchema>;
