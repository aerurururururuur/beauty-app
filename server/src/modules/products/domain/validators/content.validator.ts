/**
 * domain/validators/content.validator.ts —— 内容文件的行为(形状在 `../schemas/content.ts`)。
 *
 * ★ **这里唯一的职责是:坏数据不许静默溜进去。**
 *   少了它,一条字段缺失的产品会被读成"这条没什么可推荐的",而模型会照着
 *   一个残缺的库往外推荐——**没有任何人会知道**。
 *   所以这里一律**抛错**,不返回 `null`、不留空壳。
 *
 * 抛的是普通 `Error`,不是 `AppError`:内容坏了不是"这个请求不合法",
 * 是**这个服务不该以当前状态启动**。区别在于谁来处理——
 * `AppError` 由 HTTP 错误处理器接、回一个状态码;这个接不住,它就该把启动打断。
 */
import { z } from 'zod';
import { zodIssuesMessage } from '../../../shared/index.js';
import { libraryFileSchema, productFileSchema } from '../schemas/content.js';
import type { ProductLibrary } from '../entities/library.js';
import type { Product } from '../entities/product.js';

/** `file` 是**相对库根**的路径,用来把话说清楚;调用方负责传对。 */
function fail(file: string, err: z.ZodError): never {
  throw new Error(
    `产品库内容不合法:${file} —— ${zodIssuesMessage(err)}。` +
      '内容由 scripts/import-products.ts 从源 docx 生成;手改过的话请重导,' +
      '生成器不对的话请改生成器。',
  );
}

export function parseLibraryFile(raw: unknown, file: string): ProductLibrary {
  const result = libraryFileSchema.safeParse(raw);
  if (!result.success) fail(file, result.error);
  return result.data;
}

export function parseProductFile(raw: unknown, file: string): Product {
  const result = productFileSchema.safeParse(raw);
  if (!result.success) fail(file, result.error);
  return result.data;
}
