/**
 * src/index.ts —— 组装根(唯一认识所有实现的文件)。
 * 读配置 → 逐模块 createXxxModule → 装配 web shell → 启动/优雅停机。
 * 模块内部的实现选择被组合根隔离;依赖只经各模块 public barrel。
 * 换真实引擎/模型时,在对应模块 compose 里按 config.* 开关分发即可。
 */
import {
  loadConfig,
  loadDotEnvIfPresent,
  readDashScopeApiKey,
} from './modules/shared/infrastructure/config.js';
import { createAssetsModule } from './modules/assets/index.js';
import { createReferencesModule } from './modules/references/index.js';
import { createMakeupModule } from './modules/makeup/index.js';
import { createJobsModule } from './modules/jobs/index.js';
import { createUserModule } from './modules/user/index.js';
import { createWeatherModule } from './modules/weather/index.js';
import { createCabinetModule } from './modules/cabinet/index.js';
import { createProductsModule } from './modules/products/index.js';
import { createAgentModule } from './modules/agent/index.js';
import type { CosmeticReader, ProductLibrary } from './modules/agent/index.js';
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
  // REFERENCE_PROVIDER 已真正接通(在 references/compose.ts 里按 kind 分发)。
  // ★ MAKEUP_ENGINE **2026-09-16 起也真的接通了**(在 makeup/compose.ts 里按 kind 分发):
  //    mock(缺省,骨架)/ image(真出图,计费)/ replay(回放夹具,CI)。
  //    **仍然没有 off** —— 流水线没有引擎就出不了成品,硬接一个 off 分支只会得到
  //    又一个假开关,而那正是本轮要修掉的东西。
  // ★ 场景理解**没有**模块也没有开关(2026-09-10 删):妆容方向是 shared/domain/scene-rules.ts
  //   里的纯查表函数,由 run-pipeline 直接调用。它没有可换的实现,所以不该有开关。
  const { artifactStore } = createAssetsModule({ dataDir: config.dataDir });
  // 参考源:缺省 mock(离线即用);REFERENCE_PROVIDER=bing 走外部检索,
  // 站点基址经 REFERENCE_BASE_URL 配(部署环境出站策略不同,换站点不该改代码)。
  const { referenceProvider } = createReferencesModule({
    kind: config.referenceProvider,
    baseUrl: config.referenceBaseUrl,
    timeoutMs: config.referenceTimeoutMs,
  });
  // 上妆引擎。★ `MAKEUP_ENGINE=image` 时表单路径**不可用**(引擎需要妆面单,而表单不传它),
  //   这是 §8.1「出图能力接给 agent」的直接后果——缺省 mock 因此不只是省钱,也是 `[I7]` 的兜底。
  const { engine } = createMakeupModule({
    kind: config.makeupEngine,
    outputDir: config.makeupOutDir,
    model: config.makeupModel,
    qwen: {
      // key 不进 ServerConfig(见 config.ts 里 readDashScopeApiKey 的注释)。
      apiKey: readDashScopeApiKey(),
      apiHost: config.makeupApiHost,
    },
    ...(config.makeupFixturesDir ? { fixturesDir: config.makeupFixturesDir } : {}),
  });

  const jobs = createJobsModule({
    dataDir: config.dataDir,
    artifactStore,
    referenceProvider,
    engine,
  });

  // 账号表落 dataDir/users/users.json;密码只存 scrypt 凭据,不存明文。
  const user = createUserModule({ dataDir: config.dataDir });

  // 当日天气:缺省 open-meteo 实拉,WEATHER_PROVIDER=mock 切离线示意。
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
   *   的唯一地方(所以 `number` / `categoryId` / `statedCount` 都不往下传——
   *   `statedCount` 尤其不能传:那是源资料自称的款数,而它本来就是错的)。
   */
  const catalog = products.catalog;
  const productLibrary: ProductLibrary | undefined = catalog
    ? {
        overview: () => {
          const o = catalog.overview();
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
          const d = catalog.find(id);
          if (!d) return undefined;
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

  // 对话 agent。「用户上传的信息」喂给它的现在有**三样**:
  //   ① 结构化需求 `brief`——由 `patch_brief` 工具直接写进会话,不经过端口;
  //   ② 衣橱——★ 走的正是下面这个**包一层**的注入(§7.1 零 import 那条规矩);
  //   ③ ★ **用户本人的照片**——同样包一层,但底下是 `assets` 的 `ArtifactStore`
  //      (2026-09-16 拍板:**不新写第二套照片存储**)。
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
  //   **底下就是同一个 `artifactStore` 实例**,和 `jobs` 用的那个是同一个。
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
    dashscope: {
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
    // ★ **同一个引擎实例**,不是一个新的:出图那条路与表单那条路用同一份配置,
    //   于是"`MAKEUP_ENGINE` 换一个值,两边一起变"——这正是 §8.1 想要的。
    engine,
    artifacts: sessionArtifacts,
    // ★ 没配产品库时**整个键不出现在 options 里**(不是给一个 `undefined`)——
    //   语义上就是"这个部署没有产品库",agent 那边照此不注册那两个工具。
    ...(productLibrary ? { products: productLibrary } : {}),
    maxRenders: config.agentMaxRenders,
    sessionTtlHours: config.agentSessionTtlHours,
  });

  // —— web shell ——
  const app = await buildApp({ config, jobs, user, weather, cabinet, agent });

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
    fakes.push('对话用脚本化演示(不是模型):按固定脚本演一遍,不联网、不花钱');
  }
  if (config.makeupEngine === 'mock') {
    fakes.push('上妆用假引擎:它把输入照片原样返回,不是真的上妆效果');
  }
  if (fakes.length > 0) {
    app.log.info(`[agent] 当前为离线配置 —— ${fakes.join(';')}。详见 server/README.md 与 .env.example`);
  }

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
      `[products] 没有产品库(${config.productsDir} 不存在或不是目录)——` +
        'list_products / read_product 不会注册。要接上就配 PRODUCTS_DIR,见 .env.example。',
    );
  } else {
    const library = products.loaded.library;
    const health = library.health;
    const debts: string[] = [];
    const mismatched = health.statedVsActual.perCategory.filter((c) => !c.ok).length;
    if (mismatched > 0) debts.push(`类目款数与资料自称对不上 ${mismatched} 处`);
    if (health.statedVsActual.statedTotals.length > 1) {
      debts.push(`资料内总数说法有 ${health.statedVsActual.statedTotals.length} 种`);
    }
    if (health.missingDimensions.length > 0) debts.push(`必填维度缺 ${health.missingDimensions.length} 条`);
    if (health.suspectedDuplicates.length > 0) debts.push(`疑似重复 ${health.suspectedDuplicates.length} 对`);
    if (health.shadeLeakage.length > 0) debts.push(`色号泄漏 ${health.shadeLeakage.length} 处`);
    if (health.missingEnglishName.length > 0) debts.push(`无英文名 ${health.missingEnglishName.length} 条`);

    const head =
      `[products] 已加载「${library.name}」:${health.statedVsActual.actualTotal} 条 / ` +
      `${library.categories.length} 类目(源资料:${library.source.file})。`;
    app.log.info(head);
    if (debts.length > 0) {
      app.log.warn(
        `[products] 已知数据债:${debts.join(' · ')}。` +
          '这些都是**源资料自身**的问题,不是解析出错;这类问题原样入库,' +
          `要修请改源文档后重跑 scripts/import-products.ts。详单见 ${library.id}/library.json 的 health。`,
      );
    }
  }

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
    app.log.info(`收到 ${signal},排空队列后退出`);
    await jobs.queue.whenIdle();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
