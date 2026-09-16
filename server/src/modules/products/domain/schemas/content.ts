/**
 * domain/schemas/content.ts —— 内容目录里那两种 JSON 的形状(zod 单源)。
 *
 * ★ `schema` 与 `validator` 分工照 `cabinet` 的先例:**这里只描述形状**,
 *   "读文件 → 校验 → 抛一句人看得懂的话"在 `domain/validators/` 里。
 *
 * ★ 用 `.strict()`:多一个不认识的键就是**有人改了导入器而模块没跟上**,
 *   那种事要在启动时炸,不要静默吞掉。少一个键同理。
 *
 * ⚠️ 这里是**内容**校验,不是入参校验:它抛的是普通 `Error`(启动即失败),
 *   不是 `AppError`——内容坏了和请求坏了不是一类事。
 */
import { z } from 'zod';
import { DIMENSION_KEYS } from '../entities/product.js';

const dimensionKeySchema = z.enum(DIMENSION_KEYS);

/** 六个维度都是可选键:必填与否是**数据质量**问题(体检报告管),不是形状问题。 */
const dimensionsSchema = z
  .object({
    texture: z.string().optional(),
    ingredients: z.string().optional(),
    skinTypes: z.string().optional(),
    occasions: z.string().optional(),
    warnings: z.string().optional(),
    feedback: z.string().optional(),
  })
  .strict();

export const productFileSchema = z
  .object({
    id: z.string().min(1),
    number: z.number().int().positive(),
    name: z.string().min(1),
    category: z.string().min(1),
    dimensions: dimensionsSchema,
    derived: z
      .object({
        lookSpecSlots: z.array(z.string()),
        series: z.string().optional(),
      })
      .strict(),
    notes: z.array(z.string()).optional(),
  })
  .strict();

const healthSchema = z
  .object({
    statedVsActual: z.object({
      perCategory: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          stated: z.number().nullable(),
          actual: z.number(),
          ok: z.boolean(),
        }),
      ),
      statedTotals: z.array(z.object({ line: z.number(), value: z.number() })),
      actualTotal: z.number(),
    }),
    missingDimensions: z.array(
      z.object({ id: z.string(), number: z.number(), missing: z.array(dimensionKeySchema) }),
    ),
    missingOptionalDimensions: z.array(
      z.object({ id: z.string(), number: z.number(), missing: z.array(dimensionKeySchema) }),
    ),
    suspectedDuplicates: z.array(
      z.object({ a: z.string(), b: z.string(), similarity: z.number(), sameDimensions: z.number() }),
    ),
    shadeLeakage: z.array(z.object({ id: z.string(), hits: z.array(z.string()), where: z.string() })),
    missingEnglishName: z.array(z.object({ id: z.string(), number: z.number(), name: z.string() })),
  })
  .strict();

export const libraryFileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    brand: z.string().min(1),
    source: z.object({
      file: z.string(),
      sha256: z.string(),
      importedAt: z.string(),
      importer: z.string(),
    }),
    dimensions: z.array(
      z.object({ key: dimensionKeySchema, label: z.string(), optional: z.boolean().optional() }),
    ),
    categories: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        order: z.number(),
        statedCount: z.number().nullable(),
        actualCount: z.number(),
        lookSpecSlots: z.array(z.string()),
        series: z.array(z.object({ title: z.string(), note: z.string().optional() })),
      }),
    ),
    matchingGuide: z.object({
      columns: z.array(z.string()),
      rows: z.array(z.object({ condition: z.string(), cells: z.array(z.string()) })),
    }),
    notes: z.array(z.object({ label: z.string(), text: z.string() })),
    health: healthSchema,
  })
  .strict();
