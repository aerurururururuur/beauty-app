/**
 * styling/domain/ports/shade-lookup.ts —— 「这个产品的这个色号是什么颜色」。
 *
 * ★ **食言方声明**(§7.1):本模块只认这一个方法,不认识产品库。
 *   由组装根(`src/index.ts`)把产品库包成闭包注进来,形状与
 *   `agent/domain/ports/product-library.ts` / `cabinet/domain/ports/user-directory.ts` 一致。
 *
 * ★ **裸类型,不 import `products`。** 一旦这里出现 `Product` / `ProductCatalog`,
 *   这条缝就变成了模块间直接依赖,而它存在的全部意义就是**没有**那层依赖。
 *
 * ★ **查不到返回空串,不是 `undefined`。** 调用方(`decorate-plan.ts`)只做一件事:
 *   空串 = 「这一格没有色块」。多一个 `undefined` 态就要多一处判空,
 *   而两者的处理完全相同——那多出来的一态就是没人读的形状。
 */
export interface ShadeLookup {
  /**
   * @param pid 产品 id(slug,如 `lip-gold`)
   * @param code 色号编码(如 `1966`)
   * @returns 形如 `#b03a3a` 的十六进制色值;**产品不存在 / 色号不存在 / 没配产品库时都是 `''`**
   */
  hexOf(pid: string, code: string): string;
}
