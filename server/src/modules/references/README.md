# modules/references —— 参考妆面检索

给定场景分析，返回**带授权来源标注**的参考妆面条目。供「对着参考画」与结果回显用；**license 诚实红线是本模块的立身之本**。

## 这里有什么

| 路径 | 内容 |
| --- | --- |
| `domain/entities/reference.ts` | `ReferenceImage`：`{ id, title, license, sourceUrl }`（license 必填） |
| `domain/ports/reference-provider.ts` | `ReferenceProvider` 端口（本模块持契约）：`fetch(SceneAnalysis) → ReferenceImage[]` |
| `infrastructure/reference-provider/mock-reference-provider.ts` | `MockReferenceProvider`：按场景 label 返回自绘示意样本，license 诚实标注、sourceUrl 置空 |
| `index.ts` | public barrel |
| `compose.ts` | `createReferencesModule()` → `{ referenceProvider }` |

## 依赖 / 被依赖

- 依赖：`shared`（类型）、`understanding`（`SceneAnalysis` 类型）。
- 被依赖：`jobs`（注入 `referenceProvider`）。

## 现状与改法

- **现状**：mock 自绘样本可用。
- **待办（替换素材，阻塞性）**：逐张换成 自绘/自有/可授权 来源并回填 `license` + 真实 `sourceUrl`。**不抓网络图、不用 example.com**（主办明文：侵犯第三方知识产权直接出局）。
- **可选扩展**：参考妆面按 `skinTone`/场合分层，让参考对深肤色用户同样有代表性——需先扩展 `ReferenceImage` + port 形状，评估后再动。
