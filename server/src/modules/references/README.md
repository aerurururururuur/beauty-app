# modules/references —— 参考妆面检索

给定场景分析，返回**按部位分解**的参考图片来源。供结果页「这批参考是从哪来的」回显用。

## ★ 2026-09-11：本模块的性质变了（知情变更）

**以前**：返回自绘示意条目，逐张标 `license`，红线是「**不抓网络图**」（见 roadmap §13-2）。
**现在**：改为**真实外部检索**（`REFERENCE_PROVIDER=bing`），红线被**主动推翻**。

变更理由与实测原始记录见 `docs/plan/reference-fetch-feasibility.md`。这里只记结论与代价。

### 必须一起读的三件事（别只看「能出图了」）

1. **授权问题没有解决，只是换了对象。** 抓来的图落在 知乎图床 / 摄图网(付费图库) / 花瓣网 / 新浪图床 ——
   与抓 Pinterest 是同一类处境，不多不少。
   主办方的合规条款里确有「**所有参赛代码、算法模型及方案必须确保原创性，不得侵犯第三方知识产权**」，
   以及「参赛者须保证……不侵犯第三方知识产权，**否则后果自负**」——**本模块正落在这一条上**。
   删掉 `license` 字段**不等于**拿到了授权，只等于「不再在数据里写一句无法核实的授权声明」。

   > ⚠️ **这段引文的核实状态，别当成主办方原字**：2026-09-11 只核到**搜索引擎摘要**这一层。
   > `<tianchi.aliyun.com>` 的赛题页是 JS 渲染的空壳（curl 只拿到 34KB shell，无正文），
   > WebFetch 被域名策略挡，转载规则的二手站一个连不上、一个 403。**没能看到主办方页面上的原文。**
   > 另有一处归属不一致：一份摘要说该条出自「赛题2 信任守护师」页面而非赛道3（通用条款的可能性大，未证实）。
   > 待办：由**有账号的人**登录天池读「参赛须知 / 合规性承诺」原文，读到了回来更新本节。
   > 详细核实过程见 `docs/plan/reference-fetch-feasibility.md` §6。
2. **`role` 不是视觉识别的结果。** 它是「这张图是哪个检索词搜出来的」。
   本项目没有视觉模型，无法真的看出「这张图在画唇」。`ReferenceImage.role` 的注释里也写了这条。
3. **场合不再参与检索。** 见下面「检索词」一节 —— 带上场合会让 5 个部位返回同一批图。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/reference.ts` | `ReferenceImage`：`{ id, title, imageUrl, sourceUrl, role, retrievedAt }`（**已删 `license`**） |
| `domain/ports/reference-provider.ts` | `ReferenceProvider` 端口：`fetch(SceneDescriptor) → ReferenceImage[]`，**约定失败降级为空数组、绝不抛错** |
| `infrastructure/reference-provider/bing-reference-provider.ts` | `BingReferenceProvider`：按部位各搜一次，解析结果页 HTML |
| `infrastructure/reference-provider/parse-bing.ts` | `parseBingHits(html)`：纯函数，从 HTML 抠 `m="…"` 属性里的 `murl`/`purl`/`t` |
| `infrastructure/reference-provider/mock-reference-provider.ts` | `MockReferenceProvider`：写死的中文标题样本，**不给 imageUrl / sourceUrl**（编一个假地址只会渲染出裂图） |
| `infrastructure/reference-provider/off-reference-provider.ts` | `OffReferenceProvider`：恒返回空列表 |
| `compose.ts` | `createReferencesModule({ kind, baseUrl, timeoutMs })`；`kind` 取自 `config.referenceProvider` |

三个开关（`REFERENCE_PROVIDER`）：`mock`（缺省，离线，只出文字） / `off`（空） / `bing`（真实检索）。

## 检索词（**改这里之前先读**）

`bing-reference-provider.ts` 的 `ROLE_QUERY` 把部位映射到**具体品类词**，不是部位名本身：

```
底妆→粉底液   眉→眉毛   眼影→眼影   颊→腮红   唇→口红
```

实测两轮的依据：部位名自己当检索词会漂移 —— `底妆` 搜出砂糖橘、`底妆 粉底` 搜出电击棍（两轮结果还不一样）、
`眼影 妆容` 搜出毛泽东画像；换成品类词后两轮都稳定对题。

**为什么查询里不带场合词**：带上之后 Bing 会把查询**坍缩到场合词上** ——
`面试 底妆 妆容` / `面试 眉 妆容` / … 五组返回的图**完全相同**（前 10 张两两 Jaccard = 1.00），
「按部位分解」这个前提直接没了。场合对参考图的影响目前**不走检索词**。

## 依赖 / 被依赖

- 依赖：`shared`（`SceneDescriptor`、`SCENE_RULES`）。
- 被依赖：`jobs`（注入 `referenceProvider`）。**`jobs` 调本端口时没有 try/catch** —— 所以端口约定「失败回空数组」是硬约束，不是风格偏好。

## 已知代价（都是知情接受，不是疏漏）

- **图片是第三方热链**，没下载到本地：图片地址失效 / 对方上防盗链，结果页就会白图。
  实测主流源（知乎图床、摄图网、新浪图床）目前**可直连、无防盗链**。要走「下载到本地再经自己 origin 供图」，
  得先给 `assets` 加「下载远端图并存盘」能力 + 加一条静态图路由 —— 那是新增面，本轮没做。
- **失败会静默降级为空列表**，用户只看到参考区不出现，不会被告知「检索挂了」。这是刻意的：参考图是增强项。
- **单次检索会重试一次**（`ATTEMPTS=2`）。本机出站实测是**成窗口**抖动的（连打 100 次全成功，
  但会突然整片连不上、几秒到一两分钟后自愈）。所以断网时每个任务的检索阶段是约 `2 × timeout + 400ms`，
  而不是 `timeout`。

## 待办

- **授权**：本模块目前**没有**合规的素材来源。要么回头做自绘/自有素材，要么拿到可授权的图源 ——
  在解决之前，`REFERENCE_PROVIDER=bing` 上生产就是带着主办规则那条红线跑。
- 参考妆面按 `skinTone` 分层，让深肤色用户也有代表性 —— 需先扩展 port 形状，评估后再动。
