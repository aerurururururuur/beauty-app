# 场合美妆镜 · Occasion Makeup

> 为「重要场合」配一张得体妆容的 AI 上妆应用：上传**本人正面照**，告诉我们要去往的**场合**（面试 / 约会 / 见家长 / 上台 / 日常…），再补上**肤质 / 肤色 / 穿搭 / 当天天气**，AI 依据「场合 × 你的脸」去参考真实妆面，为照片配一套妆容并渲染出来。
>
> 立项语境：欧莱雅黑客马拉松 · 赛道 3「无界体验家」· 受众路径 A「重要场合体面平等」。详见 [`docs/plan/roadmap.md`](docs/plan/roadmap.md)。

当前为**可运行骨架**：场景理解 / 参考图检索 / 上妆引擎均为 mock 实现，接口与分层已按可替换接缝留好，换真实实现不改业务层。

## 业务流程

```
本人照片 ─┐                    occasion 面试/约会/见家长/上台/日常
          ├─► ① 场合理解 ─► ② 按场合检索参考妆 ─► ③ 按肤质肤色配妆并渲染 ─► ④ 返回结果
需求简报  ┘      scene             references            engine               result
(brief)        (label)
```

- **需求简报 brief**：`occasion` + `sceneText`(自由文字) + `skinType` + `skinTone` + `dress` + `weather`，经 multipart 的 `meta`(JSON) 传入。
- **肤色 5 档** `light…deep`，缺省默认 `medium`（中间档）——不默认「浅肤色」审美，按真实肤色调色。
- 0..6 张**氛围参考图**（`scene`）保留为可选：不驱动成片，仅回显（未来视觉读景的接缝）。

异步任务流水线，进度以 `queued → scene_understand(20) → reference_gather(40) → makeup_generate(70) → store_result(100)` 推进，前端轮询可见。

## 仓库结构

| 目录 | 说明 |
| --- | --- |
| `server/` | 后端，TypeScript + **模块化清洁架构**：`src/modules/*` 按功能拆模块，模块内部再走四层（详见 [server/README.md](server/README.md)） |
| `vue/` | 前端，Vue 3 + Vite + Pinia（详见 [vue/README.md](vue/README.md)），内置离线 mock 演示 |

## 快速开始

需要 Node.js ≥ 22。

```bash
# 1) 后端(默认 :3000)
cd server
npm install
npm run dev

# 2) 前端(默认 :5173)
cd ../vue
npm install
npm run dev
```

浏览器打开 http://localhost:5173 。

- 前端默认 **mock 模式**（`VITE_USE_MOCK` 未设为 `false`），无需后端即可演示完整流程；
- 连真实后端：复制 `vue/.env.example` 为 `vue/.env` 并设 `VITE_USE_MOCK=false`，开发时代理把 `/api` 转发到 `:3000`。

一个最小联调（提交「面试 + 小麦肤色」的简报）：

```bash
curl -s -F "face=@vue/public/demo/demo-photo.svg" \
     -F "scene=@vue/public/demo/scenery.svg" \
     -F 'meta={"occasion":"interview","sceneText":"正式终面 干练得体","skinType":"combination","skinTone":"tan","dress":"西装·藏青","weather":{"condition":"晴","temperatureC":24,"humidityPct":45,"uvIndex":3}}' \
     http://localhost:3000/api/jobs          # → 202 { id, status, progress, step }
curl -s http://localhost:3000/api/jobs/<id>  # 轮询到 done,断言 scene.label==='interview'
curl -s -o out.bin http://localhost:3000/api/jobs/<id>/result
```

## 后端架构要点

`server/src` 按**功能模块**组织（`modules/*`），每个模块内部再走清洁分层；依赖单向向内，只有组装根（`src/index.ts` + 各模块 `compose.ts`）认识全部实现：

```
src/
├── index.ts         组装根:config → 各 createXxxModule → buildApp → 启停
├── app.ts           Fastify web shell(挂 /api 路由、错误码→HTTP)
└── modules/
    ├── shared/          地基:brief 枚举单源 / 图片值对象 / AppError
    ├── assets/          图片存取:ArtifactStore 端口 + 本地文件系统实现
    ├── references/      参考妆面:端口 + mock(自绘授权诚实)
    ├── makeup/          上妆引擎:Engine 端口 + 输出校验 + mock 引擎
    ├── jobs/            Job 生命周期 + 流水线编排(编排方)
    ├── user/            账号:昵称+密码(scrypt,不存明文) / 注册·登录核对·查档案
    ├── cabinet/         衣橱:用户自己的化妆品(名称 + 自定义特性),按 userId 归属
    └── weather/         当日天气:open-meteo 实拉 + 查询校验
```

每个模块 = `index.ts`(public barrel，跨模块只走它) + `compose.ts`(组合根) + 模块内 `domain ← application ← presentation`、`infrastructure` 只实现模块内 `domain/ports`。各「类别」（entities/schemas/validators/ports/errors/api）都落在各自所属模块内。

> **schema vs validator**：schema 只描述「长什么样」（形状单源）；validator 才是被上层调用、做校验动作的对象——跨字段业务规则、语义错误码、输出（引擎产物几何/颜色）把关都在这层。

**换真实实现只换 adapter**：真实上妆引擎、真实网页/图库参考检索、天气，都只需实现对应模块的 port，业务与 HTTP 层不感知（见 `docs/plan/roadmap.md` 的「接缝地图」）。
视觉大模型场景理解（§4）与推荐 / 品牌参考位（§9）**当前都没有对应模块**：两处的空壳都在 2026-09-10 删掉了（空壳端口比没有更容易误导），要做时在 `docs/plan/roadmap.md` 里按那两节**重建**接缝。

## 文档

- [docs/环境搭建-Windows版.md](docs/环境搭建-Windows版.md) — Windows 小白装环境指南（Node.js/VS Code/Git）
- [server/README.md](server/README.md) — 后端分层、HTTP 契约、错误码、命令、测试
- [vue/README.md](vue/README.md) — 前端页面、mock 与联调、目录
- [docs/plan/roadmap.md](docs/plan/roadmap.md) — 开发路线图：按 `server/src/modules/*` 拆的模块任务板（可派单 + 接缝地图 + 红线）

## 测试

```bash
cd server && npm test    # Vitest,内存假端口 + validator 用例
```

## 当前是骨架：不做 / 留作接缝

**不做**：真实妆容渲染引擎（当前是 `MockEngine`）、视觉大模型场合理解、真实参考图检索（素材须逐张回填授权来源，不抓网络图）、登录态（账号 + 密码已做，但**不签发 token / 不建会话**）、购物记录导入、化妆品拍照识别、削峰队列与多机 / 云存储。

**已拍板要做、尚未开工**：推荐 / **品牌参考位**（只推赞助方旗下产品，匹配逻辑不为推广让路——见 `docs/plan/roadmap.md` §9 与红线 §13-6）、**外部教程入口**（纯外链，不搬运不内嵌）、**数字妆造间**（存哪待拍板，见 §12）。
