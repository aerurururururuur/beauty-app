# modules/assets —— 图片文件存储

负责上传图片「落盘」与成品图片「取回」的存取抽象：输入按 job+kind 写盘、引擎产物收编为任务产物、把 `ImageRef` 解析成本机可读路径。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/ports/artifact-store.ts` | `ArtifactStore` 端口（本模块持契约）：`putInputFile`(face/scene) · `putResult` · `resolveToFilePath` · `readResult` |
| `infrastructure/file-system/artifact-store.ts` | `FileSystemArtifactStore`：dataDir 下写盘、rename 原子收编产物 |
| `index.ts` | public barrel |
| `compose.ts` | `createAssetsModule({ dataDir })` → `{ artifactStore }` |

## 依赖 / 被依赖

- 依赖：`shared`（`ImageRef` 类型）。
- 被依赖：`jobs`（经 `jobs/compose.ts` 注入 `artifactStore`）。

## 现状与改法

- **现状**：本地文件系统实现已可用、够用。
- **待办（接真实引擎后）**：真实渲染引擎会产出全新文件（mock 目前是「把本人照片原样收编为 result」），确认产物目录是否需要按 job 隔离，避免多任务串写。
- **怎么换对象存储**：实现 `ArtifactStore` 端口 → 在 `assets/compose.ts` 换实现即可，其余模块不感知。
