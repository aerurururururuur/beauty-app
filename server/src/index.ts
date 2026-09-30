/**
 * src/index.ts —— 组装根(唯一认识所有实现的文件)。
 * 读配置 → 逐模块 createXxxModule → 装配 web shell → 启动/优雅停机。
 * 模块内部的实现选择被组合根隔离;依赖只经各模块 public barrel。
 * 换真实引擎/模型时,在对应模块 compose 里按 config.* 开关分发即可。
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  loadConfig,
  loadDotEnvIfPresent,
  readDashScopeApiKey,
} from './modules/shared/infrastructure/config.js';
import { createAssetsModule } from './modules/assets/index.js';
import { createMakeupModule } from './modules/makeup/index.js';
import { createUserModule, dataUrlToBytes } from './modules/user/index.js';
import type { FaceReader } from './modules/user/index.js';
import { createWeatherModule } from './modules/weather/index.js';
import { createCabinetModule } from './modules/cabinet/index.js';
import { createProductsModule, toLibraryView, toProductDetailView } from './modules/products/index.js';
import { createFaceCatalogModule } from './modules/face-catalog/index.js';
import { createAgentModule } from './modules/agent/index.js';
import type { CosmeticReader, FeatureStrategies, ProductLibrary } from './modules/agent/index.js';
import type { SkinTonePalette } from './modules/makeup/index.js';
import type { ShadeLookup } from './modules/styling/index.js';
import { AppError, ErrorCode } from './modules/shared/index.js';
import { createSessionArtifacts } from './session-artifacts.js';
import { buildApp } from './app.js';

/**
 * TTL 清理的扫描间隔。★ TTL 以**小时**计,所以这里扫得多勤只影响"最坏晚删多久":
 * 固定 1 小时时,到期的照片最多多留 1 小时。相对 24 小时这个量级,不值得为它调参。
 * (真要调也是调 `AGENT_SESSION_TTL_HOURS`,不是调这个。)
 */
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const config = loadConfig();

  // —— 各模块组合 ——
  // ★ MAKEUP_ENGINE **2026-09-16 起真的接通了**(在 makeup/compose.ts 里按 kind 分发):
  //    mock(缺省,骨架)/ image(真出图,计费)。
  //    **仍然没有 off** —— 没有引擎就出不了成品,硬接一个 off 分支只会得到
  //    又一个假开关,而那正是本仓反复要修掉的东西。
  // ★ 场景理解**没有**模块也没有开关(2026-09-10 删):妆容方向是 shared/domain/scene-rules.ts
  //   里的纯查表函数。它没有可换的实现,所以不该有开关。
  const { artifactStore } = createAssetsModule({ dataDir: config.dataDir });
  // 上妆引擎 + 读图分析。★ `MAKEUP_ENGINE=image` 需要**妆面单(LookSpec)**,
  //   而只有对话 agent 会产出它——所以缺省 mock 是唯一能让"没配 key 也起得来服务"
  //   的取值,不只是省钱。
  // ★ `VISION_ANALYZER=real` 时这里一并装出三个读图适配器(同一个 key、同一个域名,
  //   只多一个模型名);`off`(缺省)时返回 `undefined`,**下面那条口整个键不出现**
  //   ⇒ 两条路由不注册。「关掉」= 入口不存在,不是"注册了但什么都不发生"。
  const { engine, analyzers } = createMakeupModule({
    kind: config.makeupEngine,
    outputDir: config.makeupOutDir,
    model: config.makeupModel,
    qwen: {
      // key 不进 ServerConfig(见 config.ts 里 readDashScopeApiKey 的注释)。
      apiKey: readDashScopeApiKey(),
      apiHost: config.makeupApiHost,
    },
    // ⚠️ 这两项**无条件传**:`off` 时 `buildAnalyzers` 直接返回 `undefined`,
    //   连 `vision` 都不看。所以这里不需要再写一遍"配了才传"的写法。
    //   (`readDashScopeApiKey` 没配 key 时返回空串而不是抛错,理由同上面那个包。)
    analyzerKind: config.visionAnalyzer,
    vision: {
      apiKey: readDashScopeApiKey(),
      baseUrl: config.visionBaseUrl,
      model: config.visionModel,
    },
  });

  // ── 面部词表 ──
  // ★ **这一处与产品库刻意相反:没有"目录不存在"这一格。**
  //   产品库是增强项(没有它只是不注册产品工具),词表是 `skinTone` 合法档位的来源——
  //   缺了它整条 brief 校验无从谈起。所以这里**不接 `undefined`**:读不到就抛错,
  //   进程起不来。见 `face-catalog/compose.ts` 的文件头。
  // ⚠️ 副作用是那一串红线校验(§13-3「缺省档不许是最浅档」等)**在这一行跑**。
  const faceCatalog = createFaceCatalogModule({ contentDir: config.faceCatalogDir });

  /**
   * `FaceVocabulary` → `makeup` / `agent` 的 `SkinTonePalette`
   * (第 N 处跨模块粘合,同下面的 `userExists` / `cosmetics` / `productLibrary`)。
   *
   * ★ **显式挑字段,而不是把 `vocabulary` 直接塞过去。** 结构上也许能凑合,但那样
   *   **经过这条缝的字段就没人负责了**:词表哪天多一列,它会静默地跟着流进妆面校验。
   *   这条缝该是决定"谁看得见什么"的唯一地方 —— 同 `productLibrary` 那段。
   *
   * ⚠️ **必须排在 `createAgentModule` 之前**:agent 的 propose-look 要用它换肤色调色盘
   *   (第一版排在后面,`tsc` 直接报了「used before its declaration」——
   *   这个顺序不是风格,是依赖)。
   */
  const palette: SkinTonePalette = {
    toneKeysFor: (skinTone) => faceCatalog.vocabulary.tierById(skinTone)?.toneKeys,
    labelOf: (skinTone) => faceCatalog.vocabulary.tierById(skinTone)?.label,
  };

  /**
   * `FaceVocabulary` → agent 的 `FeatureStrategies`(同一个词表,第二条缝)。
   *
   * ★ **显式挑字段**:这张卡会**原样出现在 `/result` 的「针对本人」那一块上**,
   *   所以经过这条缝的每一格都要有人认领 —— 同 `palette` 那段。
   *   `route` 那一格**刻意不往下传**:它是留给几何提示词(P3)的,
   *   漏进方案只会多一格没人读、却会被当成"方案的一部分"渲染出去的东西。
   *
   * ⚠️ 查不到就返回 `undefined`,**不回落**:用户人设里存的 id 可能比词表旧,
   *   那是正常情况,由 `propose_look` 把那一条剔掉(`brief.features` 的注释里写着这条)。
   */
  const features: FeatureStrategies = {
    byId: (id) => {
      const hit = faceCatalog.vocabulary.featureById(id);
      if (!hit) return undefined;
      return {
        id: hit.value.id,
        group: hit.dimension.id,
        groupName: hit.dimension.label,
        name: hit.value.label,
        desc: hit.value.desc,
        fix: hit.value.fix,
        products: [...hit.value.products],
      };
    },
  };

  /**
   * `Analyzers['face']` → `user` 模块的 `FaceReader`(第三处跨模块粘合)。三件事只在这一层发生:
   *
   *   ① **dataURL → 临时文件**:`makeup` 的读图口收 `ResolvedImage`(本地路径 + mime),
   *      而这边手上只有 dataURL。解码用 `user` 导出的 `dataUrlToBytes`,**不写第二个解码器**。
   *   ⚠️ 临时文件落 `os.tmpdir()`,**读图前后都不进 dataDir**:读脸是"看一眼",没有落盘的理由。
   *   ② **失败分类**:"模型说读不出肤色"在 `makeup` 那边是 `VALIDATION_ERROR`,**别的异常一律原样抛出去** ——
   *      把网断/key 过期说成"读不出来"就是让用户去换一张本来没问题的照片。
   *      ★ 只有**这一层**同时知道两边的词汇表,所以判据写在这里而不是端口里。
   *   ③ **清理临时文件**(`finally`)。读失败也要删 —— 那是一张脸。
   *
   * ★ `analyzers` 缺省 ⇒ `faceReader` 是 `undefined` ⇒ 没有读脸用例 ⇒ `/personas/analyze` 不注册。
   */
  const faceReader: FaceReader | undefined = analyzers
    ? {
        analyzeFace: async (photo) => {
          const { mime, bytes } = dataUrlToBytes(photo);
          const scratchDir = path.join(tmpdir(), 'olyhks-face');
          await mkdir(scratchDir, { recursive: true });
          const filePath = path.join(scratchDir, randomUUID());
          await writeFile(filePath, bytes);
          try {
            const { skinTone } = await analyzers.face.read({ image: { filePath, mimeType: mime } });
            return { ok: true, skinTone };
          } catch (err) {
            if (err instanceof AppError && err.code === ErrorCode.VALIDATION_ERROR) {
              return { ok: false, reason: 'unreadable' };
            }
            throw err;
          } finally {
            await rm(filePath, { force: true });
          }
        },
      }
    : undefined;

  // 账号表落 dataDir/users/users.json;密码只存 scrypt 凭据,不存明文。
  // ★ 人设库也在这个模块里(落 dataDir/personas/),读脸端口按上面那条链可缺省。
  const user = createUserModule({
    dataDir: config.dataDir,
    ...(faceReader ? { faceReader } : {}),
  });

  // 当日天气:缺省 live 实拉,WEATHER_PROVIDER=mock 切离线示意。
  const weather = createWeatherModule({ kind: config.weatherProvider });

  /**
   * ★ 「这个 userId 存在吗」——**一个闭包,两个模块用**。
   *
   * 衣橱(存条目时的归属)与 agent(开会话时的归属)都要问这一句。
   * 提出来的理由不只是省几行:**它必须只有一份**——
   * "什么算用户不存在"是一个判断,而这里有一处刻意的收窄:
   * **只把 `USER_NOT_FOUND` 翻译成 `false`,存储故障等真错误照常抛出**,
   * 否则会把 500 说成 404。两份拷贝早晚会在这种细节上分叉。
   *
   * ⚠️ 两边的端口**类型**是各自声明的(`cabinet` 一份、`agent` 一份,
   * 因为业务模块之间零 import,§7.1),只是**形状**相同 ⇒ 这个函数同时满足两者。
   */
  const userExists = async (userId: string): Promise<boolean> => {
    try {
      await user.getUser.execute(userId);
      return true;
    } catch (err) {
      if (err instanceof AppError && err.code === ErrorCode.USER_NOT_FOUND) return false;
      throw err;
    }
  };

  // 衣橱:归属校验要问 user 模块「这人存在吗」。
  // ★ 跨模块粘合**只发生在这里**——cabinet 自己不 import user,
  //   它只声明 UserDirectory 端口(见 cabinet/domain/ports/user-directory.ts)。
  const cabinet = createCabinetModule({ dataDir: config.dataDir, userExists });

  // ── 产品库 ──
  // 把 `products/<库>/` 那份内容目录读进内存。★ **这是第三处跨模块粘合**
  //   (前两处:上面的 `userExists`、下面的 `cosmetics`),同一条规矩——
  //   `agent` 不 import `products`,它在自己那侧用**原始类型**声明了
  //   `ProductLibrary` 端口(§7.1),这里负责把 products 的实现包一层接上去。
  //
  // ★ 三种加载结果,处理**刻意不同**(口径写在 `products/compose.ts`):
  //   目录不存在 → `catalog: undefined` → agent 不注册产品工具(不是"注册了返回空");
  //   目录在但内容坏 → **`createProductsModule` 在这里抛错,进程起不来**;
  //   正常 → 见下面启动日志那一段。
  const products = createProductsModule({ contentDir: config.productsDir });

  /**
   * `ProductCatalog` → agent 的 `ProductLibrary`。
   *
   * ★ **显式挑字段,而不是把 `catalog` 直接塞过去。** 结构上确实能对上(多出来的字段
   *   不影响赋值),但那样**经过这条缝的字段就没人负责了**:products 哪天往索引里
   *   多塞一列,它会**静默地跟着进模型上下文**,而这里本该是决定"哪些字段值得烧 token"
   *   的唯一地方(所以 `number` / `categoryId` 都不往下传——编号是给人看的,
   *   类目名模型已经拿到了,两样都不值得乘 66 条进上下文)。
   */
  const catalog = products.catalog;
  const productLibrary: ProductLibrary | undefined = catalog
    ? {
        overview: () => {
          // ★ 领域类型 → 投影 → 这一层再挑一遍字段,三步各管一件事:
          //   投影(`toLibraryView`)决定"这个模块往外给哪些字段",
          //   这里决定"其中哪些值得进模型上下文"。
          const o = toLibraryView(catalog.library(), catalog.list());
          return {
            name: o.name,
            brand: o.brand,
            categories: o.categories.map((c) => ({
              label: c.label,
              count: c.count,
              lookSpecSlots: c.lookSpecSlots,
            })),
            matchingGuide: o.matchingGuide,
            notes: o.notes,
            products: o.products.map((p) => ({
              id: p.id,
              name: p.name,
              categoryLabel: p.categoryLabel,
              ...(p.series ? { series: p.series } : {}),
              lookSpecSlots: p.lookSpecSlots,
              textureFirst: p.textureFirst,
              skinTypesFirst: p.skinTypesFirst,
              occasionsFirst: p.occasionsFirst,
            })),
          };
        },
        find: (id) => {
          const p = catalog.find(id);
          if (!p) return undefined;
          const d = toProductDetailView(p, catalog.library());
          return {
            id: d.id,
            name: d.name,
            categoryLabel: d.categoryLabel,
            ...(d.series ? { series: d.series } : {}),
            lookSpecSlots: d.lookSpecSlots,
            // `key`(英文键)不透给模型:它读的是中文标签,英文键只是我们的内部标识。
            facts: d.dimensions.map((dim) => ({ label: dim.label, text: dim.text })),
            ...(d.notes ? { notes: d.notes } : {}),
          };
        },
      }
    : undefined;

  /**
   * `ProductCatalog` → `styling` 的 `ShadeLookup`(第四处跨模块粘合)。
   *
   * ★ **搬过来的就是前端 `api/design.js` 里 `hexOf` 那一句**(色值的唯一来源是产品库),
   *   搬完之后前端那半删掉 —— 从此全仓只有这一处查色值。
   *
   * ★ **没有产品库时照样是这个闭包**,`catalog` 是 `undefined` ⇒ 一律回空串 ⇒
   *   色板项被丢、步骤里的产品不画色点。**这是一次诚实的降级,不是错误**:
   *   没配产品库的部署本来就一个色值都没有,编不出来。
   */
  const shades: ShadeLookup = {
    hexOf: (pid, code) =>
      catalog?.find(pid)?.shades?.shades.find((s) => s.code === code)?.hex ?? '',
  };

  // 对话 agent。「用户上传的信息」喂给它的现在有**四样**:
  //   ① 结构化需求 `brief`——由 `patch_brief` 工具直接写进会话,不经过端口;
  //   ② 衣橱——★ 走的正是下面这个**包一层**的注入(§7.1 零 import 那条规矩);
  //   ③ ★ **用户本人的照片**——同样包一层,但底下是 `assets` 的 `ArtifactStore`
  //      (2026-09-16 拍板:**不新写第二套照片存储**);
  //   ④ ✏️ **读图分析的结论**——`face` / `scene` 补进 `brief`, `style` 落成一条
  //      「我传了张风格参考图」的说明进 `messages[]`。★ 它**不是工具**:由用户那次
  //      HTTP 点击触发,模型自己碰不到(见 `agent/compose.ts` 的 `analyzers`)。
  // ⚠️ 从 ③ 起本会话**有隐私面**了:照片 + 出图都在盘上,所以
  //   `[I8]` 的 TTL 真删**不再是可选项**(见文件末尾那个定时器)。
  const cosmetics: CosmeticReader = {
    listByUser: async (userId) => {
      const view = await cabinet.listCosmetics.execute({ userId });
      // 只取 agent 用得上的两项。**多给的每一列都是模型要读的 token**,
      // 而 id / createdAt 对"配一套妆"这件事没有用。
      return view.items.map((item) => ({
        name: item.name,
        attributes: item.attributes.map((a) => ({ label: a.label, value: a.value })),
      }));
    },
  };

  // ★ `SessionArtifacts` 端口 → `ArtifactStore` 的适配(§7.1,消费者声明端口)。
  //   **底下就是上面那个 `artifactStore` 实例本身**——没有第二套照片存储。
  //   映射规则(尤其是"一图一键"那条嵌套 id)在 `src/session-artifacts.ts`,
  //   那里有测试;这里只是一行装配。
  // ★ `engineOutDir` 是**给删的**:收编一张成品图之后把引擎那份中间产物删掉。
  //   ⚠️ 那道边界不是可选的,少了它会**删掉用户上传的照片**——理由写在
  //   `session-artifacts.ts` 的 `disposeScratch` 里,那里有一个已经踩过的例子。
  const sessionArtifacts = createSessionArtifacts(artifactStore, {
    engineOutDir: config.makeupOutDir,
  });

  const agent = createAgentModule({
    kind: config.agentLlm,
    real: {
      // key 不进 ServerConfig(见 config.ts 里 readDashScopeApiKey 的注释)。
      apiKey: readDashScopeApiKey(),
      baseUrl: config.agentBaseUrl,
      model: config.agentModel,
    },
    cosmetics,
    // ★ **同一个 `userExists`**,与 cabinet 用的是上面那一个闭包(见它的注释)。
    //   挡的是"给一个不存在的用户开会话"——理由在
    //   `agent/domain/ports/user-directory.ts` 的文件头。
    userExists,
    // ★ **同一个引擎实例**,不是新造的:它和上面对 `createMakeupModule` 的调用共用
    //   同一份配置,于是"`MAKEUP_ENGINE` 换一个值,出图跟着变"。
    engine,
    artifacts: sessionArtifacts,
    palette,
    // ★ 同一个词表的第二条缝(见上面 `features` 那段):`propose_look` 靠它把
    //   `brief.features` 翻成方案里「针对本人」那几张调整卡。
    features,
    // ★ 上面那个闭包。**必填**,与 `products` 那个可选键是两回事,理由见
    //   `agent/compose.ts` 的 `AgentModuleOptions.shades`。
    shades,
    // ★ 没配产品库时**整个键不出现在 options 里**(不是给一个 `undefined`)——
    //   语义上就是"这个部署没有产品库",agent 那边照此不注册那两个工具。
    ...(productLibrary ? { products: productLibrary } : {}),
    // ★ 同上:`VISION_ANALYZER=off` 时**整个键不出现** ⇒ agent 不暴露收图与分析
    //   那两条口(`/images` / `/analyses` 不注册)。**同一个 `analyzers` 实例**
    //   与上面 `createMakeupModule` 那次调用共用,不是新造一份。
    ...(analyzers ? { analyzers } : {}),
    sessionTtlHours: config.agentSessionTtlHours,
  });

  // —— web shell ——
  const app = await buildApp({ config, user, weather, cabinet, products, agent });

  /**
   * ★ **启动时把「对面是真的还是假的」打出来。**
   *
   * 这一段不是为了日志好看:`AGENT_LLM=mock` 走的是**脚本化演示**
   * (`modules/agent/infrastructure/llm/demo-llm.ts`)——它会照常提议出图、
   * 照常弹确认框、照常回一句「图已经出好了」,**从界面上完全分不出来**。
   * 引擎同理:`MAKEUP_ENGINE=mock` 把输入照片原样当成品交回来,
   * 那一步看着像"出图成功了",其实什么都没发生。
   *
   * 两个 `mock` 都是**有意的缺省兜底**(离线、不花钱),这句话也不是警告;
   * 它只是不让任何人**误以为自己在看真效果**——而那正是本文档反复说的
   * 「一个会瞎编的假后端比一个承认自己是假的假后端糟得多」。
   */
  const fakes: string[] = [];
  if (config.agentLlm === 'mock') {
    fakes.push('AGENT_LLM=mock (scripted demo, no model, offline)');
  }
  if (config.makeupEngine === 'mock') {
    fakes.push('MAKEUP_ENGINE=mock (engine returns the input photo as-is)');
  }
  if (fakes.length > 0) {
    app.log.info(`[agent] offline config: ${fakes.join('; ')} - see server/README.md`);
  }

  /**
   * ★ **读图能力这一行。** 同上面那段:分析是"用户点一下才会去读图"的,
   *   而 `off` 时那两条口**根本不注册**——前端若还摆着入口,点下去只会得到 404。
   *   把"这个部署到底有没有读图能力"写在启动日志里,别让下一个人从 404 反推。
   *   ⚠️ 这两条口**会花钱**(每次分析一次多模态调用),所以开着的时候也要说出来。
   */
  app.log.info(
    config.visionAnalyzer === 'real'
      ? `[analyzer] vision ON (${config.visionModel}): /images + /analyses + /personas/analyze registered; every call costs money`
      : '[analyzer] vision OFF (VISION_ANALYZER=off, default): /images, /analyses and /personas/analyze are NOT registered (404)',
  );

  /**
   * ★ **产品库的加载结果与体检报告摘要。**
   *
   * 这一段和上面那段"对面是真的还是假的"是同一个用意:**不让任何人误以为自己在看真效果**。
   * 体检报告 `health` 里那些数是**导入器算出来的**(不是人工标注,所以"改源文档 → 重导"
   * 会自然清零),它们**不进模型上下文**(进去只是白烧 token),所以这里是唯一能看见它们的地方。
   *
   * ⚠️ 打的是 `warn` 而不是 `info`:那几项**都是已经知道的数据债**,
   *   让它们以 info 混在启动日志里,下一个人就会当它是正常噪音略过。
   *   详单在 `products/<库>/library.json` 的 `health` 字段。
   */
  if (!products.loaded) {
    app.log.info(
      `[products] no catalog (${config.productsDir} missing) - list_products / read_product ` +
        `NOT registered; GET /api/products NOT registered; plan swatches will have NO colour`,
    );
  } else {
    const library = products.loaded.library();
    const health = library.health;
    const debts: string[] = [];
    // ★ 这一行的键是**源文档自己的章节名**(`health.docxSections`),不是我们的展示类目 ——
    //   两者在重构后不再一一对应(展示的「提前护理」= docx 的「护肤类」+ 手写层的 3 张系列卡),
    //   按展示类目报就成了一个假的对照表。分家的理由写在 `content.ts` 的 `healthSchema` 上。
    const mismatched = health.docxSections.perSection.filter((s) => !s.ok).length;
    if (mismatched > 0) debts.push(`docxSectionMismatch ${mismatched}`);
    if (health.docxSections.statedTotals.length > 1) {
      debts.push(`statedTotals ${health.docxSections.statedTotals.length}`);
    }
    if (health.missingDimensions.length > 0) debts.push(`missingDimensions ${health.missingDimensions.length}`);
    if (health.suspectedDuplicates.length > 0) debts.push(`suspectedDuplicates ${health.suspectedDuplicates.length}`);
    if (health.shadeLeakage.length > 0) debts.push(`shadeLeakage ${health.shadeLeakage.length}`);
    if (health.missingEnglishName.length > 0) debts.push(`missingEnglishName ${health.missingEnglishName.length}`);

    // ★ 打 `library.id` 而不是 `library.name`、不带来原始文件名:那些都是中文,
    //   在 GBK 终端里又会花。这一行只要回答"加载了哪个库、多少条"。
    //   ★ 条数用 `mergedEntries`(**并完手写层之后**那个数)—— 这才是加载器真的读到的条数;
    //     `docxEntries` 是"只解源文档"的数,它比库里少,拿它打日志会让人以为少了产品。
    const head =
      `[products] loaded ${library.id}: ${health.merge.mergedEntries} items / ` +
      `${library.categories.length} categories`;
    app.log.info(head);
    if (debts.length > 0) {
      app.log.warn(
        `[products] catalog health: ${debts.join(', ')} - source-doc issues, not parse errors; ` +
          `see ${library.id}/library.json health`,
      );
    }
  }

  /**
   * ★ **词表的加载结果。** 与上面两段同一个用意:不让任何人**误以为**识别在按这张表走。
   *   档位表是 §13-3 红线盯的东西,而它现在**不在代码里**(在 `assests/face-catalog/`),
   *   所以"实际读的是哪一版、几档、缺省哪一档"必须在启动日志里留一行 ——
   *   否则改坏了词表的人只会看到服务照常起来。
   */
  app.log.info(
    `[face-catalog] lexicon ${faceCatalog.vocabulary.version}: ` +
      `${faceCatalog.vocabulary.tones.length} tones ` +
      `(default ${faceCatalog.vocabulary.defaultTier().id}) / ` +
      `${faceCatalog.vocabulary.dimensions.length} features`,
  );

  /**
   * ★ **会话 TTL 清理**(§10 `[I8]` / 隐私红线)。
   *
   * 定时器归**组装根**:它跨模块、跨请求,既不属于 agent 的业务逻辑,
   * 也不属于某个 HTTP 路由。用例本身(`agent.purgeExpired`)**不自我调度**——
   * 那样它就没法在测试里"只跑一次"。
   *
   * ⚠️ `unref()`:这个定时器**不该拖住进程退出**(同"优雅停机不等它")。
   * ★ **"重启之后照片留在盘上"那个缺口已关**(2026-09-16):用例现在扫**两遍**,
   *   第二遍从盘反查"没有会话认领的目录"并真删(见 `purge-expired-sessions.ts` 文件头)。
   *   所以下面那个 `orphans` 是**异常信号**——正常流程里每个目录都有主。
   */
  const purgeTimer = setInterval(() => {
    void agent.purgeExpired
      .execute()
      .then(({ purged, orphans }) => {
        if (purged > 0) app.log.info(`[agent] 清理了 ${purged} 个到期会话(照片与产物已真删)`);
        // 单独一条、且用 warn:它不是常规清理,是"有东西没人认领"。
        if (orphans > 0) {
          app.log.warn(`[agent] 清掉了 ${orphans} 个没有会话认领的存储目录(上次进程的残骸)`);
        }
      })
      .catch((err: unknown) => {
        // 清理失败不该让进程挂掉,但**必须留下痕迹**——它漏的是隐私承诺。
        app.log.error(err, '[agent] 会话清理失败');
      });
  }, PURGE_INTERVAL_MS);
  purgeTimer.unref();

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`收到 ${signal},等在途请求收尾后退出`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
