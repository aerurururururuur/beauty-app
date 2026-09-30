/**
 * infrastructure/json/content-loader.ts —— 把 `products/<库>/` 那份内容目录读进内存。
 *
 * ★ **刻意急切加载**(启动时整个读进来、物化成一个 Map),这和本项目其它地方
 *   (makeup 夹具懒读、assets/user 懒读 + `existsSync` 挡)
 *   **都不一样**。理由只有一条,但它足够:
 *
 *   **只有急切才拿得到"坏数据启动即失败"。**
 *   懒读意味着一条字段损坏的产品要到**对话进行到一半、模型真的去读它**时才暴露,
 *   而那时用户正等着推荐——那是这套系统最不该失败的时刻。
 *   同 `makeup/compose.ts` 里那句话:**配置错了却"能启动",是最容易拖到演示当天
 *   才炸的一类问题。** 内容数据同理。
 *
 *   代价是启动时多读 ~57 个小文件(实测 50KB 上下),可以忽略。
 *   ⚠️ **这个取舍有规模上限**:内容库涨到几千条时,急切加载和"整库索引进上下文"
 *   两件事都会先撑不住(见 `application/products-view.ts` 里 `toLibraryView` 的注释)。
 *   到那天再谈分片,现在不谈。
 *
 * ★ `library.json` 里的 `categories[].id` 就是子目录名 —— **目录即索引**,
 *   没有一张另外维护的"产品到类目"的映射表可以漂。
 *
 * ★ 目录层级是 **库 → 类别 → 产品**:`products/<库>/<类别>/<产品>.json`。
 *   `PRODUCTS_DIR` 指到**库**(`products/ysl-property`)或指到**容器**(`products/`)都行,
 *   后者取下面唯一的那个库;有多个库、或一个都没有,都报错(见 `resolveLibraryRoot`)。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseLibraryFile, parseProductFile } from '../../domain/validators/content.validator.js';
import type { Product } from '../../domain/entities/product.js';
import type { ProductLibrary } from '../../domain/entities/library.js';
import type { ProductCatalog } from '../../domain/ports/product-catalog.js';

/** `library.json` 的文件名。子目录里除它以外全是产品文件。 */
const LIBRARY_FILE = 'library.json';
/** 溯源副本的目录名。**它不是类目**,扫描类目时要跳过。 */
const SOURCE_DIR = 'source';

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(
      `产品库内容读不出来:${file} —— ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** 库根目录 → (库元信息, 全部条目)。坏数据在这里就炸,不会走到运行时。 */
function loadLibrary(rootDir: string): { library: ProductLibrary; products: Product[] } {
  const libraryPath = path.join(rootDir, LIBRARY_FILE);
  if (!existsSync(libraryPath)) {
    throw new Error(`产品库目录里没有 ${LIBRARY_FILE}:${rootDir}。这个目录是内容目录吗?`);
  }
  const library = parseLibraryFile(readJson(libraryPath), LIBRARY_FILE);

  const knownCategories = new Set(library.categories.map((c) => c.id));
  const products: Product[] = [];
  const seenIds = new Set<string>();

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === SOURCE_DIR) continue; // 溯源副本,不是类目
    if (!knownCategories.has(entry.name)) {
      // ★ 不静默跳过:多一个目录要么是类目表没跟上,要么是有人放错了地方。
      //   两种都该让人知道,而不是让那些产品"凭空消失"。
      throw new Error(
        `产品库里有 ${LIBRARY_FILE} 不认识的目录:${entry.name}。` +
          `已知类目:${[...knownCategories].join('、')}。`,
      );
    }
    const dir = path.join(rootDir, entry.name);
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.json')) continue;
      const rel = `${entry.name}/${file}`;
      const product = parseProductFile(readJson(path.join(dir, file)), rel);
      if (product.category !== entry.name) {
        throw new Error(
          `产品 ${rel} 的 category 是「${product.category}」,但它放在「${entry.name}」目录下。` +
            '两处必须一致——目录即索引。',
        );
      }
      // ★ 文件名也**就是** id(导入器生成时两者同源)。查这一条不是洁癖:
      //   生成的库被手改过、或者文件被改过名而没人重导时,`find(id)` 照样取得到东西,
      //   于是**没有别的征兆** —— 只有 `ls` 出来的那一列名字与产品对不上。
      if (path.basename(file, '.json') !== product.id) {
        throw new Error(
          `产品 ${rel} 的 id 是「${product.id}」,与文件名对不上。` +
            '内容由 scripts/import-products.ts 生成,文件名即 id;手改过的话请重导。',
        );
      }
      if (seenIds.has(product.id)) throw new Error(`产品 id 重复:${product.id}`);
      seenIds.add(product.id);
      products.push(product);
    }
  }

  // 类目自报的条数与实际文件数对不上,说明有人删/加了文件却没重导。
  for (const category of library.categories) {
    const actual = products.filter((p) => p.category === category.id).length;
    if (actual !== category.actualCount) {
      throw new Error(
        `类目「${category.label}」(${category.id})登记了 ${category.actualCount} 条,` +
          `实际扫到 ${actual} 条。请重跑 scripts/import-products.ts。`,
      );
    }
  }

  return { library, products };
}

/**
 * ★ **本类只做"读进来 + 索引",不做投影。**
 *   取首句、贴类目中文名、按 DIMENSION_KEYS 排序这些往外给的样子,
 *   一律在 `application/products-view.ts`(§6 唯一投影点)。
 *   端口文件头记着这条边界为什么在这里而不是在类型声明上。
 */
export class JsonProductCatalog implements ProductCatalog {
  readonly #library: ProductLibrary;
  readonly #products: Product[];
  /** ★ 目录即哈希表:id → 条目。查不到就是 `undefined`,不抛错。 */
  readonly #byId: Map<string, Product>;

  constructor(rootDir: string) {
    const { library, products } = loadLibrary(rootDir);
    this.#library = library;
    this.#products = products;
    this.#byId = new Map(products.map((p) => [p.id, p]));
  }

  /** 库元信息(`library.json` 那个领域对象本身)。进模型上下文前要先过投影。 */
  library(): ProductLibrary {
    return this.#library;
  }

  /**
   * 全部条目,**按扫描顺序**(类目目录序 + 文件名序)。
   * ★ 给的是副本 —— 否则调用方一次 `.sort()` 就把这个顺序**全局改掉**了,
   *   而那个顺序是 `list()` 承诺的一部分。(条目本身是只读内容,不深拷贝。)
   */
  list(): Product[] {
    return [...this.#products];
  }

  find(id: string): Product | undefined {
    return this.#byId.get(id);
  }
}

/**
 * 从 `dir` 里找出**库根**(那个直接含 `library.json` 的目录)。
 *
 * ★ 允许两种指法,因为两种都自然:
 *   - 直接指到一个库(如 `products/ysl-property`)→ 它自己就是库根;
 *   - 指到**容器**(如 `products/`)→ 它下面唯一的那个库。
 *
 * ★ **"没有产品库"只有一个判据:这个路径不存在。** 关掉功能就指一个不存在的路径
 *   (`.env.example` 是这么写的,回归测试也靠它)。
 *   ⚠️ **一个存在的目录取不到库,一律抛错,绝不当作"没有产品库"。**
 *   这条是本函数最容易写错的地方,而错法很隐蔽:如果"目录空着"也算作没有库,
 *   那么**有人删掉 `library.json`、或者内容没复制全**,启动会**照常成功**,
 *   只是模型静默地再也推荐不出东西 —— 而没有任何一行日志说为什么。
 *   那正是本模块急切加载要防的那件事(`compose.ts` 文件头),所以这里必须炸。
 *
 * ★ **多个库也抛错,不猜。** 随便挑一个的后果是**模型只看得见其中一个品牌**
 *   而它自己不知道,推荐起来完全看不出问题。宁可让它起不来。
 */
function resolveLibraryRoot(dir: string): string | undefined {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return undefined;
  if (existsSync(path.join(dir, LIBRARY_FILE))) return dir;

  const candidates = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name))
    .filter((p) => existsSync(path.join(p, LIBRARY_FILE)))
    .sort();

  if (candidates.length > 1) {
    throw new Error(
      `${dir} 下有 ${candidates.length} 个产品库(` +
        `${candidates.map((p) => path.basename(p)).join('、')}),不知道该用哪个。` +
        '请把 PRODUCTS_DIR 直接指到其中一个(见 .env.example)。',
    );
  }
  const only = candidates[0];
  if (!only) {
    // 目录在,但里面(含下一层)没有 library.json。
    // ★ 两种可能都不是"没配":内容没复制全,或者 library.json 被删/被改名。
    throw new Error(
      `${dir} 存在,但里面(含下一层)没有 ${LIBRARY_FILE}。` +
        '要么指到真正的库目录,要么指一个**不存在的路径**来关掉产品库(见 .env.example)。',
    );
  }
  return only;
}

/**
 * 找出并加载产品库。没有库返回 `undefined`(由 `compose.ts` 决定怎么处理);
 * 有库但内容坏**抛错**(见文件头,以及 `compose.ts` 里那张两种情况对照表)。
 */
export function loadCatalogIfPresent(dir: string): JsonProductCatalog | undefined {
  const rootDir = resolveLibraryRoot(dir);
  if (!rootDir) return undefined;
  return new JsonProductCatalog(rootDir);
}
