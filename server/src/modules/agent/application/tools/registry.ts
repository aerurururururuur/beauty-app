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
import type { Engine } from '../../../makeup/index.js';
import type { CosmeticReader } from '../../domain/ports/cosmetic-reader.js';
import type { ProductLibrary } from '../../domain/ports/product-library.js';
import type { SessionArtifacts } from '../../domain/ports/session-artifacts.js';
import type { Tool } from '../../domain/tools/tool.js';
import { indexTools } from '../../domain/tools/tool.js';
import { ListCabinetTool } from './list-cabinet.js';
import { ListProductsTool } from './list-products.js';
import { PatchBriefTool } from './patch-brief.js';
import { ProposeLookTool } from './propose-look.js';
import { ReadProductTool } from './read-product.js';
import { RenderLookTool } from './render-look.js';

export interface ToolDeps {
  /** 读用户衣橱。实现由组装根把 cabinet 的 `listByUser` 包一层喂进来(§7.1)。 */
  cosmetics: CosmeticReader;
  /** 真出图用。★ 由组装根把 `makeup` 的引擎实例注进来(§8.1:引擎的第一个消费者是本模块)。 */
  engine: Engine;
  /** 照片与成品图。同样由组装根包一层 `assets` 的那个存储喂进来。 */
  artifacts: SessionArtifacts;
  /** §10 `[I3]` 单会话出图上限。 */
  maxRenders: number;
  /**
   * ★ **唯一一个可选依赖。** 读品牌产品库。
   *
   * 缺省 = **这个部署没有产品库** → `list_products` / `read_product` **不注册**。
   * ⚠️ **刻意不做成"注册了但返回空列表"**——那是假开关:模型会以为自己有个空产品库,
   *   然后对着空库编出似是而非的推荐,而它自己完全不知道哪里不对。
   *   工具**不在名单里**,模型连想都不会想,那才是诚实的。
   *
   * 为什么它可以可选、而上面四个必须必填:那四个缺了,这个 agent 就**干不成它的事**
   * (没引擎出不了图、没衣橱读不了柜子)。产品库是**增强项**——没有它,
   * "聊需求 → 出妆面 → 出图"整条链路一点没缺,只是最后少一句"买什么"。
   */
  products?: ProductLibrary;
}

/**
 * 装配本轮注册的全部工具。
 * ★ **没配产品库时是 4 个,配了是 6 个**——这个数目随部署变,是设计的一部分
 *   (见 `ToolDeps.products` 与 `definitions.ts` 里"为什么从 4 变 6"那段)。
 */
export function createToolRegistry(deps: ToolDeps): Map<string, Tool> {
  return indexTools([
    new PatchBriefTool(),
    new ProposeLookTool(),
    new ListCabinetTool(deps.cosmetics),
    ...(deps.products
      ? [new ListProductsTool(deps.products), new ReadProductTool(deps.products)]
      : []),
    new RenderLookTool({
      engine: deps.engine,
      artifacts: deps.artifacts,
      maxRenders: deps.maxRenders,
    }),
  ]);
}
