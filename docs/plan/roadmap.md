# 场景美妆镜 · 剩余工作路线图

> 状态(2026-09)：已交付**可运行骨架**——四层清洁架构后端 + Vue3 前端，
> 引擎 / 场景理解 / 参考检索均为 mock。本文列出让产品真正可用还需要做的事，
> 按优先级分组；每项标注落地位置（多数只换 `infrastructure/` 的 adapter）。

图例：`[ ]` 待办 · `[~]` 部分完成 · `[x]` 已完成(供对照)

- [x] 四层清洁架构骨架（presentation/application/domain/infrastructure）
- [x] domain 分类：entities / schemas(形状) / validator(行为) / ports / errors / api
- [x] 异步 Job 流水线（scene_understand → reference_gather → makeup_generate → store_result）
- [x] 前端三页（Home / Upload / Result）+ 离线 mock 演示 + 后端真实联调

---

---

## 基础设施(infrastructure/)盘点 —— 还没实现的有多少

`server/src/infrastructure/` 现有 **7 个文件**，映射到 `domain/ports` 的 6 个端口 + 配置加载：

| infra 文件 | 实现的端口 | 当前形态 | 还没实现 / 待升级 |
| --- | --- | --- | --- |
| `config.ts` | (非端口,配置) | **已实现** · 真 | — |
| `file-system/artifact-store.ts` | `ArtifactStore` | **已实现** · 本地文件系统(单机可用) | 对象存储 / 云存储、产物回源签名 |
| `json/job-repository.ts` | `JobRepository` | **已实现** · JSON 文件(单机/演示可用) | 数据库(PostgreSQL 等) |
| `queue/in-memory-queue.ts` | `JobQueue` | **部分实现** · 仅进程内串行(重启即丢) | 持久队列 / 削峰 / 多机 / 重试超时 |
| `engine/mock-engine.ts` | `Engine` | **未实现** · 仅 mock(返回原图+look.preview) | 真实上妆引擎(参数化渲染 / 第三方图像 API) |
| `scene-analyzer/mock-scene-analyzer.ts` | `SceneAnalyzer` | **未实现** · 仅 mock(关键词,不读图) | 视觉大模型场景理解 |
| `reference-provider/mock-reference-provider.ts` | `ReferenceProvider` | **未实现** · 仅 mock(预设条目) | 网页/图库真实检索(含授权/缓存) |

**结论**：真·完整可用的基础设施只有 **4/7**（config + 本地 FS + JSON 仓库 + 进程内队列），其中队列仍缺持久化；
**3 个业务端口至今只有 mock**（engine / scene-analyzer / reference-provider）——这 3 个正是「产品能用」的最短路径，
即下方 P0 的 1/3/4 项；P1 的「队列/存储换真」对应上表后三行的升级。

## P0 · 把「demo」变成「真产品」的核心能力

- [ ] **真实上妆引擎**（最大缺口）：参数化重绘(把妆容画到照片像素) 或 第三方图像 API。
  位置：实现 `domain/ports/engine.ts` 的 `generate()`，产物继续走 `validateEngineResult`；
  组装：`infrastructure/engine/` 新增实现 + `src/index.ts` 按 `MAKEUP_ENGINE` 分发。
  骨架现状：mock 只「复制原图 + 返回 look.preview」，妆容由前端 CSS 叠加示意。
- [ ] **五官关键点检测 / 对齐**：当前 mock 用「正面照 + 归一化固定坐标」（唇 50/47…）。
  真实照片需检测人脸关键点（或交给真实引擎内建），坐标才算得准；决定：由本端做还是引擎端做。
- [ ] **真实场景理解**：视觉大模型读「风景图」判定氛围/主色/光线（当前只对文字/文件名做关键词）。
  位置：`domain/ports/scene-analyzer.ts` 的 `analyze()`，替换 `MockSceneAnalyzer`。
- [ ] **真实参考图检索**：按场景去网页 / 图库抓图，回填合规 `license` / `sourceUrl`。
  位置：`domain/ports/reference-provider.ts`，替换 `MockReferenceProvider`；
  注意：下载与缓存、robots / 授权条款、图源去重。
- [ ] **人像输入把关**：上传引导 + 服务端校验（含人脸、清晰度、非风景照误传），让「上妆」有把握。

## P1 · 后端工程化（把 mock 换成能上生产的形状）

- [ ] **队列与可靠性**：进程内串行 → BullMQ / 任务表，支持恢复、重试、超时、并发与削峰；
  优雅停机已有雏形（`queue.whenIdle`）。
- [ ] **存储升级**：JSON 仓库 → PostgreSQL；本地文件 → 对象存储(OSS/S3)；
  产物生命周期（保留期、清理、回源 URL 签名）。
  位置：分别实现 `domain/ports/job-repository.ts`、`artifact-store.ts`。
- [ ] **引擎/模型开关真正生效**：`index.ts` 现在无条件 `new MockXxx`；
  按 `config.MAKEUP_ENGINE / SCENE_ANALYZER / REFERENCE_PROVIDER` 真实分发。
- [ ] **鉴权 / 限流 / 配额**：用户系统；每用户任务频率；更细的上传约束（分辨率/尺寸）；内容安全。
- [ ] **可观测性**：结构化日志完善、请求与任务指标、错误上报、耗时统计。
- [ ] **更多测试**：HTTP 集成测试（用 `app.inject()` 打真实路由）、失败重试场景、
  前后端契约测试（`domain/api` 即契约源，做 schema 快照/断言）。

## P2 · 前端打磨

- [ ] **结果图真实展示**：`ResultView` 已支持 `resultUrl`，但真实引擎接入后需回归「成品图」分支，
  并处理 `object-fit: cover` 下任意尺寸照片与 look 叠加区的坐标偏差。
- [ ] **上传体验**：图片压缩 / 裁剪 / 相机调用、更多人像与风景示例、上传即人脸反馈。
- [ ] **历史与分享**：任务记录列表、结果对比、下载成品、分享链接。
- [ ] **前端测试**：目前只有构建无单测；补组件/流程测试 + mock 契约测试。
- [ ] **移动端 / 无障碍 / 文案**：真机适配、可访问性、错误态与加载骨架、文案打磨。

## P3 · 发布与协作

- [ ] 一键开发脚本 + 补全 `.env.example`（前端/后端已各有一份，核对缺项）
- [ ] CI：typecheck / test / build / lint / 契约检查
- [ ] Dockerfile / docker-compose、HTTPS、产物回源
- [ ] 提交规范 / lint / husky / 依赖审计；`docs/` 沉淀架构决策(ADR)

---

## 建议顺序

1. **真实上妆引擎 + 五官对齐**（P0）——没有它，前端 `resultUrl` 分支无真实数据可验。
2. **人像把关 + 真实场景理解**（P0）——改善「输入质量 → 输出质量」。
3. **队列/存储换真**（P1）——支撑异步、可恢复与多机。
4. 其余按上线的实际目标取舍。

> 迁移原则：除「引擎/模型开关分发」需要动 `src/index.ts`（组装根本应只认识实现），
> P0/P1 几乎都是「新增/替换 infrastructure adapter + 换一行 new」，不动 domain/application/presentation。
