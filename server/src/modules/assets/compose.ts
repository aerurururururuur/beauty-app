/**
 * modules/assets/compose.ts —— 组合根。
 * 用本地文件系统实现 ArtifactStore(dataDir 之下:inputs/results)。换对象存储在此换实现。
 */
import type { ArtifactStore } from './domain/ports/artifact-store.js';
import { FileSystemArtifactStore } from './infrastructure/file-system/artifact-store.js';

export interface AssetsModuleOptions {
  /** 数据根目录绝对路径(任务记录 + 输入/产物文件都在其下)。 */
  dataDir: string;
}

export interface AssetsModuleServices {
  artifactStore: ArtifactStore;
}

export function createAssetsModule(options: AssetsModuleOptions): AssetsModuleServices {
  return { artifactStore: new FileSystemArtifactStore(options.dataDir) };
}
