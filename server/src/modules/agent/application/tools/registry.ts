/**
 * application/tools/registry.ts —— 工具注册表的装配点。
 *
 * ★ **注册表同时就是白名单。** `agent-loop` 分发时查的是 `Map.get(name)`,
 * 查不到一律拒绝(见 `agent-loop.ts` 的 `runToolSafely`)——
 * 模型只能调用**在这里被显式装进去**的东西,它编出来的名字进不来。
 * 这是"模型只提议、后端必须校验工具名"这条安全底线在本项目里的落法。
 *
 * 依赖注入照 `AddCosmetic({ items, users })`:工具需要的端口从构造参数进来,
 * 由 `compose.ts` 装配。**本文件不 import 任何别的业务模块。**
 */
import type { Engine, SkinTonePalette } from '../../../makeup/index.js';
import type { CosmeticReader } from '../../domain/ports/cosmetic-reader.js';
import type { FeatureStrategies } from '../../domain/ports/feature-strategies.js';
import type { ProductLibrary } from '../../domain/ports/product-library.js';
import type { ShadeCatalog } from '../../domain/ports/shade-catalog.js';
import type { SessionArtifacts } from '../../domain/ports/session-artifacts.js';
import type { ShadeLookup } from '../../../styling/index.js';
import type { Tool } from '../../domain/tools/tool.js';
import { indexTools } from '../../domain/tools/tool.js';
import { ListCabinetTool } from './list-cabinet.js';
import { ListProductsTool } from './list-products.js';
import { PatchBriefTool } from './patch-brief.js';
import { ProposeLookTool } from './propose-look.js';
import { ReadProductTool } from './read-product.js';
import { ReadStyleRecipeTool } from './read-style-recipe.js';
import { RenderLookTool } from './render-look.js';

export interface ToolDeps {
  /** 读用户衣橱。实现由组装根把 cabinet 的 `listByUser` 包一层喂进来(§7.1)。 */
  cosmetics: CosmeticReader;
  /** 真出图用。★ 由组装根把 `makeup` 的引擎实例注进来(§8.1:引擎的第一个消费者是本模块)。 */
  engine: Engine;
  /** 照片与成品图。同样由组装根包一层 `assets` 的那个存储喂进来。 */
  artifacts: SessionArtifacts;
  /**
   * 词表端口:`propose_look` 拿它按肤色收窄色域(§6 规矩 4)。
   * ★ **必填**——缺了它,收窄会静默失效(见 `makeup/domain/ports/skin-tone-palette.ts`)。
   */
  palette: SkinTonePalette;
  /**
   * 特征策略卡端口:`propose_look` 拿它把 `brief.features` 里的裸 id 翻成
   * 「针对本人」那几张调整卡。
   * ★ **必填**——缺了它那一块**永远为空**,而界面上没人看得出来
   * (见 `agent/domain/ports/feature-strategies.ts`)。
   */
  features: FeatureStrategies;
  /**
   * 色号 → 色值。★ **必填**——缺了它方案里每一块色卡都没有颜色,而条数一格不少
   * (见 `styling/application/decorate-plan.ts`)。由组装根把产品库包一层喂进来。
   */
  shades: ShadeLookup;
  /**
   * ★ **可选依赖之一。** 读品牌产品库。
   *
   * 缺省 = **这个部署没有产品库** → `list_products` / `read_product` **不注册**。
   * ⚠️ **刻意不做成"注册了但返回空列表"**——那是假开关:模型会以为自己有个空产品库,
   *   然后对着空库编出似是而非的推荐,而它自己完全不知道哪里不对。
   *   工具**不在名单里**,模型连想都不会想,那才是诚实的。
   *
   * 为什么它可以可选、而上面五个必须必填:那五个缺了,这个 agent 就**干不成它的事**
   * (没引擎出不了图、没衣橱读不了柜子、没策略卡方案里那块恒空)。产品库是**增强项**——没有它,
   * "聊需求 → 出妆面 → 出图"整条链路一点没缺,只是最后少一句"买什么"。
   *
   * ★ 它与下面的 `shadeCatalog` **成对**:同一份产品库的两个视图,组装根一处给出。
   *   ⚠️ 只有其中一个时**两个工具都不注册**(见 `createToolRegistry` 的判据)——
   *   半配的部署里"读得成产品、印不出色号"是没有意义的中间态。
   */
  products?: ProductLibrary;
  /**
   * ★ 同上,成对的那一半:`read_product` 拿它印出产品的色号表,
   * `propose_look` 拿它校验模型推荐的 `(pid, code)`。见 `domain/ports/shade-catalog.ts`。
   */
  shadeCatalog?: ShadeCatalog;
}

/**
 * 装配本轮注册的全部工具。
 * ★ **没配产品库时是 5 个,配了是 7 个**——这个数目随部署变,是设计的一部分
 *   (见 `ToolDeps.products` 与 `definitions.ts` 里"为什么从 4 变 6、又从 6 变 7"那两段)。
 */
export function createToolRegistry(deps: ToolDeps): Map<string, Tool> {
  // ★ 产品库那两件**一起进或一起不进**(理由见 `ToolDeps.products`)。
  const catalog =
    deps.products && deps.shadeCatalog
      ? { library: deps.products, shades: deps.shadeCatalog }
      : undefined;

  return indexTools([
    new PatchBriefTool(),
    // ★ 排在 `propose_look` 前面:它是那一步的前置功课(写 `steps` 前先读配方当参考)。
    new ReadStyleRecipeTool(deps.shades),
    new ProposeLookTool(deps.palette, deps.features, deps.shades, catalog?.library, catalog?.shades),
    new ListCabinetTool(deps.cosmetics),
    ...(catalog
      ? [new ListProductsTool(catalog.library), new ReadProductTool(catalog.library, catalog.shades)]
      : []),
    new RenderLookTool({
      engine: deps.engine,
      artifacts: deps.artifacts,
    }),
  ]);
}
