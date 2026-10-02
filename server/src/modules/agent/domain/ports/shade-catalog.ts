/**
 * agent/domain/ports/shade-catalog.ts —— 「这件产品有哪些色号」的端口。
 *
 * ★ **食言方声明**(§7.1):声明在消费方(agent),实现由组装根 `src/index.ts` 把
 *   产品库包一层粘进来。**本文件不 import `products`** —— 借一个类型,这道缝就白留。
 *
 * ★ **为什么要它**:模型要自己写「推荐产品」,就得有**真实色号词表**可挑。
 *   `ProductLibrary` 那条缝刻意不带色号(它只给六维原文),所以单开这一条;
 *   `ShadeLookup`(styling 那边)只回答单个 `(pid, code)` 的色值,给不出"有哪些"。
 *
 * ★ **查不到返回空数组,不是 `undefined`**:未知 pid 与"这件产品没有色号"
 *   在模型眼里是同一件事(这个 pid 挑不出色号),多一态就要多一处判空。
 */

/** 一件产品的一个色号。★ 没有 `pid`:问的就是"这个 pid 的色号"。 */
export interface ShadeOffer {
  /** 色号编码(如 `1966`)。**propose_look 的 `products[].code` 填这个。** */
  code: string;
  /** 色号名(如「复古红」)。 */
  name: string;
  /** 形如 `#b03a3a` 的近似色值(YSL 不公布 HEX,见产品库)。 */
  hex: string;
}

export interface ShadeCatalog {
  /** @param pid 产品 id(slug,如 `lip-gold`)。**未知 pid / 没配产品库时返回 `[]`**。 */
  shadesOf(pid: string): readonly ShadeOffer[];
}
