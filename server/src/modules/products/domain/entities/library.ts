/**
 * domain/entities/library.ts —— 内容库本身的元信息(对应 `library.json`)。
 *
 * 一个"库"= `products/` 下的一个目录。现在只有一个(`ysl-property`),
 * 以后加第二个库 = 加一个平级目录,不需要动这里的类型。
 *
 * ★ **形状不在本文件**:下面五个类型都是从 `schemas/entities/content.ts` 的
 *   `libraryFileSchema` 上**切下来的**(§4.1 同一个形状只有一份定义)。
 *   它们是嵌在 `library.json` 里的子树 —— 逐字段重写一遍就等于把那份形状写第二遍,
 *   而 validator 返回的正是 schema 的输出:两处只要有一处改了,另一处**不会报错**。
 *   别在这里补字段声明;要加字段,改 schema。
 */
import type { LibraryFile } from '../schemas/index.js';

/** `library.json` 的整体形状 = 库这个领域对象。 */
export type ProductLibrary = LibraryFile;
/** 一个类目在库里的登记。 */
export type LibraryCategory = ProductLibrary['categories'][number];
/** 第十节那张「品类匹配逻辑速查表」。 */
export type MatchingGuide = ProductLibrary['matchingGuide'];
/** 一条库级说明。 */
export type LibraryNote = ProductLibrary['notes'][number];

/**
 * 体检报告。**由导入器算出来的,不是人工标注的**——所以"修好源文档再重导"能自然清零。
 *
 * ★ 它**不进上下文**(模型不需要,进去只是白烧 token),用途有两个:
 *   ① 启动时打一行日志,让已知的数据债保持可见,而不是悄悄跟着上线;
 *   ② 让人打开 `library.json` 就能知道该去修什么。
 */
export type LibraryHealth = ProductLibrary['health'];
