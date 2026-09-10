# modules/shared —— 地基（全局共享）

被所有业务模块依赖、不依赖任何业务模块的公共地基。**只放放之四海皆准的类型/常量/错误，别把业务逻辑塞进来。**

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/brief.ts` | ★ 枚举单源：`OCCASIONS`(interview/date/stage/family/daily) · `SKIN_TYPES`(5) · `SKIN_TONES`(**5 档,缺省 `medium` 中间档,不默认浅肤色**) · `WeatherInfo` · `MakeupBrief` |
| `domain/entities/image.ts` | `ImageRef` / `EngineSourceImage`(给引擎/分析器的图片值对象:filePath/mimeType/originalName) |
| `domain/scene-rules.ts` | ★ **前后端单一源**:`SCENE_RULES`(场合→中文名/方向/标签/关键词) · `SCENE_MATCH_ORDER`(命中优先级) · `DEFAULT_OCCASION` · 纯函数 `describeScene(brief)`。**零运行时依赖,前端会直接执行它**——见下 |
| `domain/errors/app-error.ts` | `AppError` + `ErrorCode`(**不携带 HTTP 状态码**) |
| `infrastructure/config.ts` | `.env`/环境变量读取(属组装关心,只由 `src/index.ts` 深路径取用,**不进 barrel**) |
| `presentation/error-handler.ts` | 错误码 → HTTP 的唯一映射(由 `src/app.ts` 深路径取用) |
| `index.ts` | public barrel：导出 brief 常量/类型 + 图片类型 + `AppError`/`ErrorCode` + 场合规则与 `describeScene` |
| `compose.ts` | 占位组合根(shared 无独立运行时服务;未来日志器/时钟从此暴露) |

## ★ 跨端共享资产:`domain/scene-rules.ts`

这是本项目**唯一**一处「前端直接执行后端源码」的地方,所以规矩比别处严:

- 前端经 vite alias `@scene-rules` 直读它(`vue/vite.config.js` 的 `resolve.alias` +
  `server.fs.allow` 放行 `../server`;本项目没有 workspace,dev server 默认根是 `vue/`,
  不放行就取不到)。
- **禁止任何运行时 import / 顶层副作用**,只允许 `import type`(编译期擦除)。加一句
  `import fs from 'node:fs'` 会让前端构建以很难懂的方式炸掉——而且可能 build 过得去、dev 才炸。
  `test/understanding.test.ts` 有一条正则扫源码把这个约束钉住。
- **改它 = 同时改前后端行为**,这是它存在的理由(此前前端抄了一份关键词表,静默漂移)。
- 它为什么不算「业务逻辑」:场合语义独立于上妆引擎,换任何引擎都成立;而 `brief.ts` 本就是
  枚举单源的家。把每个取值连同它的中文名/方向/标签/关键词收在一处,`Record<Occasion, …>`
  会把「漏配」变成**编译错误**。
- 前端 `constants/options.js` 里的 `label`(「面试 / 终面」这种带补充说明的长标签)是**表单文案**,
  与这里的短中文名 `cn`(「面试」)是两回事,不要试图合并。

## 依赖 / 被依赖

- 依赖：无（纯 TypeScript，不碰框架 / IO）。
- 被依赖：`assets / understanding / references / makeup / jobs`（经 `shared/index.js`）。
  `scene-rules.ts` 另被 `vue/src/api/mock.js` 直读（唯一跨端消费者）。

## 现状与改法

- **现状**：地基稳定，`config`/`error-handler` 已接好；场合语义已单源化并被测试覆盖。
- **怎么改**：未来要新增输入维度（如妆品偏好），先在 `brief.ts` 加枚举与类型 → 同步 `jobs` 的 `metaSchema` / validator / 测试 → `vue` 表单。**枚举只在 `brief.ts` 定义一处**，别到处复写。
- **加减场合时是两处**：`brief.ts` 的 `OCCASIONS` + `scene-rules.ts` 的 `SCENE_RULES` / `SCENE_MATCH_ORDER`（漏配后两者会编译不过 / 测试红）。前端 `OCCASION_OPTIONS` 是纯展示，也要跟着加。
- **红线**：`SKIN_TONES` 5 档、缺省 `medium`，不要默认浅肤色审美。场合语义里**刻意不收「显白」**（见 `scene-rules.ts` 文件头）。
