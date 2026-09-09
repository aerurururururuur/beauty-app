# modules/shared —— 地基（全局共享）

被所有业务模块依赖、不依赖任何业务模块的公共地基。**只放放之四海皆准的类型/常量/错误，别把业务逻辑塞进来。**

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/brief.ts` | ★ 枚举单源：`OCCASIONS`(interview/date/stage/family/daily) · `SKIN_TYPES`(5) · `SKIN_TONES`(**5 档,缺省 `medium` 中间档,不默认浅肤色**) · `WeatherInfo` · `MakeupBrief` |
| `domain/entities/image.ts` | `ImageRef` / `EngineSourceImage`(给引擎/分析器的图片值对象:filePath/mimeType/originalName) |
| `domain/errors/app-error.ts` | `AppError` + `ErrorCode`(**不携带 HTTP 状态码**) |
| `infrastructure/config.ts` | `.env`/环境变量读取(属组装关心,只由 `src/index.ts` 深路径取用,**不进 barrel**) |
| `presentation/error-handler.ts` | 错误码 → HTTP 的唯一映射(由 `src/app.ts` 深路径取用) |
| `index.ts` | public barrel：导出 brief 常量/类型 + 图片类型 + `AppError`/`ErrorCode` |
| `compose.ts` | 占位组合根(shared 无独立运行时服务;未来日志器/时钟从此暴露) |

## 依赖 / 被依赖

- 依赖：无（纯 TypeScript，不碰框架 / IO）。
- 被依赖：`assets / understanding / references / makeup / jobs`（经 `shared/index.js`）。

## 现状与改法

- **现状**：地基稳定，`config`/`error-handler` 已接好。
- **怎么改**：未来要新增输入维度（如妆品偏好），先在 `brief.ts` 加枚举与类型 → 同步 `jobs` 的 `metaSchema` / validator / 测试 → `vue` 表单。**只有 brief.ts 是唯一改点**，别到处复写枚举。
- **红线**：`SKIN_TONES` 5 档、缺省 `medium`，不要默认浅肤色审美。
