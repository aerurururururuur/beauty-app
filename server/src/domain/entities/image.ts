/**
 * domain/entities/image.ts —— 已落盘图片的引用值对象。
 * 只携带存储键与类型信息;绝对路径仅由 infrastructure 经端口解析,domain 不持有文件系统路径。
 */
export interface ImageRef {
  /** 相对数据目录的相对路径(由 artifact-store 生成)。 */
  storeKey: string;
  mimeType: string;
  /** 用户原始文件名(仅用于界面回显,不落盘解析)。 */
  originalName?: string;
}
