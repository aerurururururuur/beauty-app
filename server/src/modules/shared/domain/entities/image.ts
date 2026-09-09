/**
 * shared/domain/entities/image.ts —— 图片相关值对象(跨模块共享)。
 *
 * ImageRef:已落盘图片的存储引用,只携带存储键与类型信息;绝对路径仅由
 *   infrastructure 经端口解析,domain 不持有文件系统路径。
 * EngineSourceImage:已解析为本机绝对路径、可直接交给引擎/分析器读取的输入图。
 *
 * EngineSourceImage 之所以放 shared:understanding(场景分析)与 makeup(上妆引擎)
 * 两个模块的端口都要引用它,放公共处避免模块间互相 import 造成环。
 */
export interface ImageRef {
  /** 相对数据目录的相对路径(由 artifact-store 生成)。 */
  storeKey: string;
  mimeType: string;
  /** 用户原始文件名(仅用于界面回显,不落盘解析)。 */
  originalName?: string;
}

/** 已解析到本机磁盘、可被分析器/引擎直接读取的输入图。 */
export interface EngineSourceImage {
  filePath: string; // 本机绝对路径
  mimeType: string;
  originalName?: string;
}
