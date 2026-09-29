/**
 * shared/domain/entities/image.ts —— 图片相关值对象(跨模块共享)。
 *
 * ImageRef:已落盘图片的存储引用(存储键 + MIME),**不含绝对路径**;
 *   绝对路径只由 infrastructure 经端口解析,domain 不持有文件系统路径。
 * ResolvedImage:已解析到本机磁盘、可直接读取的图片(绝对路径 + MIME)。
 *
 * 两者都放 shared:makeup(引擎 / 分析器端口)与 agent(解析路径后构造它)都要引用,
 * 放公共处避免模块间互相 import 造成环。
 *
 * ★ 形状分工(§4.1):
 *   · `ImageRef` —— **三个模块共用**,所以形状在
 *     `../schemas/contracts/image-ref.ts`,这里只转出,不重抄字段;
 *   · `ResolvedImage` —— 只在**本文件这一处**声明(没有任何第二份),所以保持普通 interface:
 *     给它补一份 schema 只是多一层,没有"两份会不会漂"可防。
 */
// ★ 只转出名字,不重抄字段:形状(与它派生的类型)都在 `../schemas/contracts/image-ref.ts`。
export type { ImageRef } from '../schemas/index.js';

/**
 * 已解析到本机磁盘的一张图。
 *
 * ★ 引擎的**输入**、分析器的输入、以及**读回的产物**共用这一个形状 ——
 *   三者装的都是「一张本机上的图 + 它的 MIME」,分成三个类型只会得到三处同形声明。
 */
export interface ResolvedImage {
  filePath: string; // 本机绝对路径
  mimeType: string;
  originalName?: string;
}
