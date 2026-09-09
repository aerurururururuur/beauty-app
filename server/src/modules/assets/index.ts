/**
 * modules/assets —— 图片文件存储模块(public barrel)。
 * 端口 ArtifactStore 声明存储行为;本模块自持其本地文件系统实现。
 * 依赖 shared(ImageRef)。将来换对象存储只动本模块。
 */
export type { ArtifactStore, InputKind, StoredResult, UploadFile } from './domain/ports/artifact-store.js';
export { FileSystemArtifactStore } from './infrastructure/file-system/artifact-store.js';
export { createAssetsModule } from './compose.js';
export type { AssetsModuleServices } from './compose.js';
