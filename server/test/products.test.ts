/**
 * products 模块:内容加载 + **坏数据启动即失败** + 体检报告。
 *
 * ★ 本文件测的是**这个模块唯一的实质判断**:什么样的目录算"没有产品库"(静默),
 *   什么样算"内容坏了"(炸)。两者的分界线写错了,后果不对称——
 *   划错前者的后果是功能没了(看得见);划错后者的后果是**模型从残缺库里推荐**(看不见)。
 *   所以下面"该炸"的那几条是这个文件里最要紧的。
 *
 * ★ 有一组用例直接跑**仓库里那份真内容**(`products/ysl-property/`)。
 *   那不是在测"内容对不对",是在测"**发出去的那份内容真的加载得起来**"——
 *   内容进 git 就等于是代码的一部分,它加载不起来 = 服务起不来。
 *
 * ⚠️ 与 `test/helpers/fakes.ts` 无关:本模块的假件就是**临时目录里的 JSON**,
 *   比假对象更接近真实(能顺带测到 zod 与文件系统那一层)。
 */
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZONE_ROLES } from '../src/modules/makeup/index.js';
import {
  DIMENSION_KEYS,
  JsonProductCatalog,
  createProductsModule,
  loadCatalogIfPresent,
  toLibraryView,
  toProductDetailView,
} from '../src/modules/products/index.js';
import type {
  Product,
  ProductCatalog,
  ProductDetailView,
  LibraryView,
} from '../src/modules/products/index.js';
import { REAL_PRODUCTS_DIR } from './helpers/product-content.js';

const REAL_CONTENT = REAL_PRODUCTS_DIR;

/**
 * 端口只给领域类型,给模型看的样子要先过投影。
 * 这两个小帮手替组装根做同一件事(`src/index.ts` 那段粘合),这样断言写起来还是老样子。
 */
function viewOf(catalog: ProductCatalog): LibraryView {
  return toLibraryView(catalog.library(), catalog.list());
}
function detailOf(catalog: ProductCatalog, id: string): ProductDetailView | undefined {
  const p = catalog.find(id);
  return p ? toProductDetailView(p, catalog.library()) : undefined;
}

let dir: string;
let tempDirs: string[] = [];

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'products-'));
  tempDirs.push(dir);
});
afterEach(() => {
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// ── 搭一个最小但合法的小库 ───────────────────────────────────────────────────

function productFile(over: Partial<Product> = {}): Product {
  return {
    id: '01-x',
    number: 1,
    name: '某产品',
    category: 'lip',
    kind: 'product',
    dimensions: { texture: '哑光。' },
    derived: { lookSpecSlots: ['zones.lip'] },
    origin: 'docx',
    ...over,
  };
}

function libraryFile(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-lib',
    name: '测试库',
    brand: '测试牌',
    source: { file: 'source/x.docx', sha256: 'abc', importedAt: '2026-09-16T00:00:00.000Z', importer: 'test' },
    dimensions: [{ key: 'texture', label: '质地/妆效' }],
    groups: [{ id: 'makeup', label: '彩妆', order: 1 }],
    categories: [
      {
        id: 'lip',
        label: '唇部彩妆',
        group: 'makeup',
        order: 1,
        actualCount: 1,
        lookSpecSlots: ['zones.lip'],
        series: [],
      },
    ],
    matchingGuide: { columns: ['条件', '首选'], rows: [] },
    notes: [],
    health: {
      docxSections: { perSection: [], statedTotals: [], parsedTotal: 1 },
      merge: {
        docxEntries: 1,
        mergedEntries: 1,
        overlayOnly: [],
        byCategory: [],
        shades: { products: 0, rows: 0 },
      },
      missingDimensions: [],
      missingOptionalDimensions: [],
      suspectedDuplicates: [],
      shadeLeakage: [],
      missingEnglishName: [],
    },
    ...over,
  };
}

/** 把一份 library.json + 若干条目落成 `root` 这个内容目录,返回 `root`。 */
function writeLibraryAt(
  root: string,
  library: Record<string, unknown>,
  files: Record<string, Product>,
): string {
  mkdirSync(path.join(root, 'lip'), { recursive: true });
  writeFileSync(path.join(root, 'library.json'), JSON.stringify(library, null, 2));
  for (const [name, product] of Object.entries(files)) {
    writeFileSync(path.join(root, 'lip', `${name}.json`), JSON.stringify(product, null, 2));
  }
  return root;
}

/** 落一个内容目录到 `<tmp>/lib`,返回库根。 */
function writeLibrary(
  library: Record<string, unknown>,
  files: Record<string, Product>,
): string {
  return writeLibraryAt(path.join(dir, 'lib'), library, files);
}

/** `libraryFile()` 里那条 lip 类目的样子(改条数时用),免得每次重抄一整行。 */
function lipCategory(actualCount: number): Record<string, unknown> {
  return {
    id: 'lip',
    label: '唇部彩妆',
    group: 'makeup',
    order: 1,
    actualCount,
    lookSpecSlots: [],
    series: [],
  };
}

// ── 该静默的:目录不存在 = 没有产品库 ────────────────────────────────────────

describe('没有产品库(静默,不炸)', () => {
  it('目录不存在 → catalog 是 undefined,而不是"空库"', () => {
    const services = createProductsModule({ contentDir: path.join(dir, '并不存在') });
    expect(services.catalog).toBeUndefined();
    expect(services.loaded).toBeUndefined();
  });

  it('路径指向一个**文件**而不是目录 → 同样视为没有', () => {
    const file = path.join(dir, 'a.txt');
    writeFileSync(file, 'x');
    expect(loadCatalogIfPresent(file)).toBeUndefined();
    expect(() => createProductsModule({ contentDir: file })).not.toThrow();
  });
});

// ── 该炸的:目录在但内容坏 ──────────────────────────────────────────────────

describe('★ 坏数据一律启动即失败(绝不静默跳过)', () => {
  /** 断言"炸了,且那句错话说明了是哪份文件、哪里不对"。 */
  function expectStartupFailure(root: string, ...mustMention: string[]): void {
    let thrown: unknown;
    try {
      createProductsModule({ contentDir: root });
    } catch (err) {
      thrown = err;
    }
    expect(thrown, '这个库本该让启动失败,但它没有').toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    for (const fragment of mustMention) expect(message).toContain(fragment);
  }

  it('目录里没有 library.json', () => {
    mkdirSync(path.join(dir, 'empty'), { recursive: true });
    expectStartupFailure(path.join(dir, 'empty'), 'library.json');
  });

  it('JSON 语法坏了', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile() });
    writeFileSync(path.join(root, 'library.json'), '{ 这不是 JSON');
    expectStartupFailure(root, '读不出来');
  });

  it('条目缺字段(zod 挡下)', () => {
    const broken = productFile();
    delete (broken as { name?: string }).name;
    const root = writeLibrary(libraryFile(), { '01-x': broken });
    expectStartupFailure(root, 'name');
  });

  it('★ 条目多了字段也炸(.strict)——那是"有人改了导入器而模块没跟上"', () => {
    const root = writeLibrary(libraryFile(), {
      '01-x': { ...productFile(), 多出来的: 'x' } as unknown as Product,
    });
    expectStartupFailure(root, '多出来的');
  });

  it('★ 维度列表里多出一个键也炸(`dimensionsSchema` 自己也是 .strict())', () => {
    // 与上一条不同的地方:这是在**嵌套的那一层**。上一条只挡住产品文件的顶层键,
    // 而"导入器加了个第七维度"改的正是这一层。
    const root = writeLibrary(libraryFile(), {
      '01-x': productFile({
        dimensions: { ...productFile().dimensions, 新维度: 'x' } as Product['dimensions'],
      }),
    });
    expectStartupFailure(root, '新维度');
  });

  it('★ `wording`(手写补充)与 `dimensions` 一样是六格 .strict(),多一格同样炸', () => {
    // ★ 这两格共用 `sixTextSchema`,所以"不新增第七维"这条规矩在这里才真的成立:
    //   否则手写层可以塞一个后端不认识的键进来,而**没有任何一层会报**。
    const root = writeLibrary(libraryFile(), {
      '01-x': productFile({ wording: { 第七维: 'x' } as Product['wording'] }),
    });
    expectStartupFailure(root, '第七维');
  });

  it('★ 色号的 hex 不合形状就炸(前端拿它当 CSS 颜色,错了整块色卡是白的)', () => {
    const root = writeLibrary(libraryFile(), {
      '01-x': productFile({
        shades: {
          label: '试色',
          shades: [
            { code: '01', name: '红', hex: 'red', hexApprox: true, tone: '暖', toneKey: 'warm' },
          ],
        },
      }),
    });
    expectStartupFailure(root, 'hex');
  });

  it('★ 色号少了 `hexApprox: true` 也炸(那是它唯一承认"这是推出来的"的地方)', () => {
    // `hexApprox` 是 `z.literal(true)`:谁想把推出来的近似值说成实测值,得先来改这一行。
    const root = writeLibrary(libraryFile(), {
      '01-x': productFile({
        shades: {
          label: '试色',
          shades: [
            {
              code: '01',
              name: '红',
              hex: '#aabbcc',
              hexApprox: false,
              tone: '暖',
              toneKey: 'warm',
            } as unknown as NonNullable<Product['shades']>['shades'][number],
          ],
        },
      }),
    });
    expectStartupFailure(root, 'hexApprox');
  });

  it('★ category 与所在目录不符(目录即索引,两处必须一致)', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile({ category: 'base' }) });
    expectStartupFailure(root, '目录即索引');
  });

  it('★ 文件名与 id 不符(生成物被手改过,或改了名没重导)', () => {
    // 这一条不炸的后果很轻(按 id 查还是查得到),但**完全看不出来**:
    // 只有 `ls` 出来的那一列名字与产品对不上。导入器生成时两者同源,没有正当理由分叉。
    const root = writeLibrary(libraryFile(), { '别的名字': productFile() });
    expectStartupFailure(root, '与文件名对不上');
  });

  it('★ library.json 里没登记的目录(绝不静默跳过——那会让产品凭空消失)', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile() });
    mkdirSync(path.join(root, '不认识的类目'), { recursive: true });
    expectStartupFailure(root, '不认识的目录');
  });

  it('★ 类目登记的条数与实际扫到的对不上(有人删了文件却没重导)', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile() });
    writeFileSync(
      path.join(root, 'lip', '02-y.json'),
      JSON.stringify(productFile({ id: '02-y', number: 2 })),
    );
    expectStartupFailure(root, '实际扫到 2 条');
  });

  it('★ 产品 id 重复(跨类目——同名文件放在两个类目目录里)', () => {
    // ⚠️ 重复的 id 必须**跨目录**造:同一个目录里放两个同 id 的文件,现在会先被
    //   "文件名 = id"那条挡住(两个文件不能同名),根本走不到 id 去重。
    //   跨目录则是真实会出的事:导入器给两条产品分配了同一个 slug。
    const base = { id: 'base', label: '底妆', group: 'makeup', order: 2, actualCount: 1, lookSpecSlots: [], series: [] };
    const root = writeLibrary(libraryFile({ categories: [lipCategory(1), base] }), {
      '01-x': productFile(),
    });
    mkdirSync(path.join(root, 'base'), { recursive: true });
    writeFileSync(
      path.join(root, 'base', '01-x.json'),
      JSON.stringify(productFile({ category: 'base' })),
    );
    expectStartupFailure(root, 'id 重复');
  });

  it('source/ 不是类目,要被跳过(它是溯源副本)', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile() });
    mkdirSync(path.join(root, 'source'), { recursive: true });
    writeFileSync(path.join(root, 'source', 'x.docx'), 'binary-ish');
    expect(() => createProductsModule({ contentDir: root })).not.toThrow();
  });
});

// ── 两种指法:指到库根,或指到装着它的容器 ──────────────────────────────────
//
// ★ 缺省 `PRODUCTS_DIR=../products` 指的是**容器**,所以这一组不是边角料,是缺省路径。
//   它同时是"什么时候静默"那条分界线**最容易划错**的地方:容器扫描返回 0 个库,
//   一眼看上去很像"没有产品库",但它其实是**内容没复制全 / library.json 被删**。
//   划错的后果就是本文件开头说的那种:功能静默没了,没有一行日志说为什么。

describe('★ 两种指法(库根 / 容器)', () => {
  it('指到容器 → 取出下面唯一的那个库', () => {
    const container = path.join(dir, 'container');
    writeLibraryAt(path.join(container, 'only-lib'), libraryFile(), { '01-x': productFile() });

    const catalog = loadCatalogIfPresent(container);
    expect(catalog).toBeDefined();
    expect(catalog!.find('01-x')?.name).toBe('某产品');
  });

  it('★ 容器下有 >=2 个库 → 抛错,且把两个库名都报出来(不猜)', () => {
    const container = path.join(dir, 'two');
    writeLibraryAt(path.join(container, 'lib-a'), libraryFile({ id: 'a' }), {
      '01-x': productFile(),
    });
    writeLibraryAt(path.join(container, 'lib-b'), libraryFile({ id: 'b' }), {
      '02-y': productFile({ id: '02-y', number: 2 }),
    });

    // 随便挑一个的后果是模型只看得见一个品牌而它自己不知道 —— 所以必须炸。
    expect(() => createProductsModule({ contentDir: container })).toThrow(/lib-a/);
    expect(() => createProductsModule({ contentDir: container })).toThrow(/lib-b/);
    expect(() => createProductsModule({ contentDir: container })).toThrow(/不知道该用哪个/);
  });

  it('★★ 容器在、但下面一个库都没有(内容没复制全)→ 抛错,不当"没有产品库"', () => {
    const container = path.join(dir, 'half-copied');
    // 有子目录,但里面没有 library.json —— 正是"复制到一半"的样子。
    mkdirSync(path.join(container, 'ysl-property', 'lip'), { recursive: true });
    writeFileSync(path.join(container, 'ysl-property', 'lip', '01-x.json'), '{}');

    expect(() => createProductsModule({ contentDir: container })).toThrow(/library\.json/);
  });

  it('★ 库根自己少了 library.json(不是容器,是库)→ 同样抛错', () => {
    const root = path.join(dir, 'lib-lost-its-json');
    mkdirSync(path.join(root, 'lip'), { recursive: true });
    writeFileSync(path.join(root, 'lip', '01-x.json'), '{}');

    expect(() => createProductsModule({ contentDir: root })).toThrow(/library\.json/);
  });
});

// ── 概览与查询 ──────────────────────────────────────────────────────────────

describe('overview / find', () => {
  it('find 按 id 取;查不到是 undefined,不抛错', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile() });
    const catalog = loadCatalogIfPresent(root)!;

    expect(catalog.find('01-x')?.name).toBe('某产品');
    expect(catalog.find('不存在')).toBeUndefined();
  });

  it('★ `textureFirst` 取的是**首句**而不是截断', () => {
    const long = '哑光质地，显色度高。第二句不该出现。第三句也不该。';
    const root = writeLibrary(libraryFile(), {
      '01-x': productFile({ dimensions: { texture: long } }),
    });
    const catalog = loadCatalogIfPresent(root)!;

    expect(viewOf(catalog).products[0]?.textureFirst).toBe('哑光质地，显色度高。');
  });

  it('缺的维度在详情里**不出现**(不是空串)——那是"源资料没写",不是"没这个性质"', () => {
    const root = writeLibrary(libraryFile(), {
      '01-x': productFile({ dimensions: { texture: '哑光。', warnings: '含香精。' } }),
    });
    const catalog = loadCatalogIfPresent(root)!;

    expect(detailOf(catalog, '01-x')?.dimensions.map((d) => d.key)).toEqual(['texture', 'warnings']);
  });

  it('★ 六个维度全给 → 一个不少、顺序也对(dimensionsSchema 与 DIMENSION_KEYS 对表)', () => {
    // `dimensionsSchema` 的六格是**逐字写**的(生成出来会退化成 Record,见 schema 里的注释),
    // 于是同一份清单有两处:那六格,以及 DIMENSION_KEYS。这条钉的是"两处一字不差"。
    // ★ 为什么值得单独钉:今天漏一格多半会炸(`.strict()` 撞上真内容里那份六格齐全的
    //   文件),但"会炸"靠的是内容碰巧带了那一维——换一份内容就没人报了。这条与内容无关。
    const all = Object.fromEntries(DIMENSION_KEYS.map((k) => [k, '原文。'])) as Product['dimensions'];
    const root = writeLibrary(libraryFile(), { '01-x': productFile({ dimensions: all }) });
    const catalog = loadCatalogIfPresent(root)!;

    // 顺序一起钉:出详情的顺序就是展示顺序,两处顺序不同样是"说一套做一套"。
    expect(detailOf(catalog, '01-x')?.dimensions.map((d) => d.key)).toEqual([...DIMENSION_KEYS]);
  });

  it('overview 里透出的条目数就是实际扫到的数', () => {
    const root = writeLibrary(libraryFile(), { '01-x': productFile() });
    const catalog = loadCatalogIfPresent(root)!;
    expect(viewOf(catalog).products).toHaveLength(1);
    expect(viewOf(catalog).categories[0]?.count).toBe(1);
  });
});

// ── 真内容:发出去的那份加载得起来 ──────────────────────────────────────────

describe('★ 仓库里那份真内容(改了它的形状这里会红)', () => {
  it('加载得起来,条数与类目对得上', () => {
    const catalog = new JsonProductCatalog(REAL_CONTENT);
    const overview = viewOf(catalog);

    expect(overview.categories).toHaveLength(9);
    // 条数写死是**故意的**:这份数字变了,要么是内容真的变了(那就该来改这里),
    // 要么是导入器坏了。两种都该有人看一眼。
    // ✏️ 57 → 66:2026-09-30 把前端那三份 kb 并进来,加了 6 条补录 + 3 张系列卡。
    expect(overview.products).toHaveLength(66);
    expect(overview.matchingGuide.rows).toHaveLength(13);
    expect(overview.matchingGuide.columns[0]).toBe('天气/场景条件');
  });

  it('★ 两个分组、九个类目,条数逐个钉住(合并/补录有没有漏,看的就是这张表)', () => {
    const library = new JsonProductCatalog(REAL_CONTENT).library();
    expect(library.groups.map((g) => g.id)).toEqual(['skincare', 'makeup']);
    // ★ 按 **id** 比而不是按顺序:顺序由 `order` 决定、是展示的事,
    //   而"哪一类有几条"才是内容。两者混在一条断言里,改展示顺序会红得莫名其妙。
    expect(
      Object.fromEntries(library.categories.map((c) => [c.id, c.actualCount])),
    ).toEqual({
      precare: 25,
      primer: 6,
      base: 8,
      concealer: 2,
      setting: 3,
      blush: 1,
      eye: 7,
      lip: 11,
      contour: 3,
    });
    // 每个类目都挂在真有一个的分组上(挂空了,界面上那一组就整个不出现)。
    const groups = new Set(library.groups.map((g) => g.id));
    expect(library.categories.filter((c) => !groups.has(c.group)).map((c) => c.id)).toEqual([]);
  });

  it('每一条都能按 id 取回详情(索引里的 id 与 find 对得上)', () => {
    const catalog = new JsonProductCatalog(REAL_CONTENT);
    for (const entry of viewOf(catalog).products) {
      expect(catalog.find(entry.id), `索引里的 ${entry.id} 取不回详情`).toBeDefined();
    }
  });

  it('★ 体检报告抓得到我们手工核出来的那几类问题(正向验证)', () => {
    // 这一条是"规则写对了"的证明,不是"数据干净"的证明:
    // 已知有四类问题,体检报告一项都没报出来才说明它坏了。
    const health = new JsonProductCatalog(REAL_CONTENT).library().health;

    expect(health.docxSections.statedTotals.length).toBeGreaterThan(1); // 资料内 55/57 两种说法
    expect(health.missingDimensions.length).toBeGreaterThan(0); // #36 空占位、#40 缺成分
    expect(health.suspectedDuplicates.length).toBeGreaterThan(0);
    expect(health.shadeLeakage.length).toBeGreaterThan(0);
    expect(health.missingEnglishName.length).toBeGreaterThan(0);
    // 源文档的章节自称与实际解析对不上(护肤 21 vs 22)。
    expect(health.docxSections.perSection.some((s) => !s.ok)).toBe(true);
  });
});

// ── 真内容的**不变量**:两份输入并起来之后必须成立的那些事 ──────────────────
//
// ★ 为什么这些值得单开一组:它们全是"错了也**没有一个地方会报**"的形状。
//   上面前两组钉的是"加载得起来"与"几类已知问题还在不在";
//   下面钉的是**加载器看不见的契约** —— 色号是唯一的、系列卡的孩子真的存在、
//   `number` 只在有编号的条目上出现。这些错了之后,界面照常渲染,
//   只是某一块**静默地不对**(本仓的头号 bug 类型)。

describe('★ 真内容的不变量(加载器看不见的那几条)', () => {
  const catalog = new JsonProductCatalog(REAL_CONTENT);
  const products = catalog.list();

  it('文件名 = id = `category/文件名.json` 的落点(三处同源,靠导入器保证)', () => {
    for (const c of catalog.library().categories) {
      // ⚠️ **先去掉 `.json` 再排**,不是排完再去掉:`eye-lash-clash-wp.json` 与
      //   `eye-lash-clash.json` 在带扩展名时的次序**正好相反**(`-` 0x2D < `.` 0x2E),
      //   排完再截会让两条都对的列表"对不上"。
      const names = readdirSync(path.join(REAL_CONTENT, c.id))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
        .sort();
      const ids = products.filter((p) => p.category === c.id).map((p) => p.id).sort();
      expect(names, `类目 ${c.id} 的文件名与 id 对不上`).toEqual(ids);
    }
  });

  it('★★ 同一件产品里色号 `code` 不重复(按 (产品, 色号) 取色块必须只有一个答案)', () => {
    // 这是合并那四组时**唯一真正的坑**:`con-touch` 并进来 8 个与 `ct-touch` 同名的色号,
    // 不去重就会让「这个色号是哪个颜色」没有唯一答案 —— 而两行都长得正常。
    const dup = products
      .filter((p) => p.shades)
      .flatMap((p) => {
        const codes = p.shades!.shades.map((s) => s.code);
        const seen = new Set<string>();
        return codes
          .filter((code) => (seen.has(code) ? true : (seen.add(code), false)))
          .map((code) => `${p.id} 里的色号 ${code} 出现了两次`);
      });
    expect(dup).toEqual([]);
  });

  it('★ 每条色号都 id 唯一且带 `hexApprox: true`(推出来的近似值,不许冒充实测)', () => {
    const bad = products
      .filter((p) => p.shades)
      .filter((p) => p.shades!.shades.some((s) => s.hexApprox !== true))
      .map((p) => p.id);
    // 形状本身由 schema 钉着(zod 会炸),这条钉的是**内容真的都带了这个字段** ——
    // 它就是这个库唯一承认"这批色值是按色号名推的"的地方。
    expect(bad).toEqual([]);
    const rows = products.reduce((n, p) => n + (p.shades?.shades.length ?? 0), 0);
    expect(rows).toBe(163);
  });

  it('★ 系列卡的孩子(`derived.contains`)全都真的在库里', () => {
    // 悬空的孩子不报错的话,界面上那张系列卡点进去就是一片空白,而"为什么空"没人说。
    const ids = new Set(products.map((p) => p.id));
    const dangling = products.flatMap((p) =>
      (p.derived.contains ?? []).filter((kid) => !ids.has(kid)).map((kid) => `${p.id} → ${kid}`),
    );
    expect(dangling).toEqual([]);
  });

  it('★ `kind` 与 `contains` 互为条件:系列卡必须有孩子,产品必须没有', () => {
    const series = products.filter((p) => p.kind === 'series');
    expect(series.length, '一张系列卡都没有 —— `kind` 这一栏是空的').toBeGreaterThan(0);
    expect(series.filter((p) => (p.derived.contains ?? []).length === 0).map((p) => p.id)).toEqual([]);
    expect(
      products.filter((p) => p.kind === 'product' && p.derived.contains !== undefined).map((p) => p.id),
    ).toEqual([]);
  });

  it('★ `number` 为空 ⟺ 来自手写层(补录条目没有源资料编号,有编号的一定来自 docx)', () => {
    // 两者分叉不会报错,只会让详情页的「#null」或者一个假编号出现在界面上。
    const mismatched = products
      .filter((p) => (p.number === null) !== (p.origin === 'overlay'))
      .map((p) => `${p.id}(number=${String(p.number)}, origin=${p.origin})`);
    expect(mismatched).toEqual([]);
    // 编号在 docx 那一路里必须唯一 —— 两张补录卡不会撞,但源文档抄两遍会。
    const numbers = products.filter((p) => p.number !== null).map((p) => p.number!);
    expect(new Set(numbers).size, '源资料编号有重复').toBe(numbers.length);
  });

  it('★ `lookSpecSlots` 只出现**妆面真的有的**槽位(多一个就是往模型嘴里塞假的)', () => {
    // 派生规则在导入器的 `deriveLookSpecSlots` 里。写错一个字符串(如 `zones.checks`)
    // 不会有任何征兆:槽位只是**永远匹配不上**,推荐时那一笔就静默地少一件产品。
    // ⚠️ 期望集合**照 `ZONE_ROLES` 算**,不再手抄一遍 —— 抄的那份会在妆面单扩区时漏掉,
    //   于是"新开的区没有任何产品认领"这件事没人看得见。
    //   `zones.brow` 单列:眉只有浓度、没有色/质地,本来就不在 `ZONE_ROLES` 里。
    const KNOWN = new Set(['base', 'zones.brow', ...ZONE_ROLES.map((role) => `zones.${role}`)]);
    const unknown = products.flatMap((p) =>
      p.derived.lookSpecSlots.filter((s) => !KNOWN.has(s)).map((s) => `${p.id} → ${s}`),
    );
    expect(unknown).toEqual([]);
    // ★ 反过来也钉:每个槽位都要**真有产品落在上面**。导入器里那条正则写错一个字
    //   (`/睫目/`)只会让那几件产品静默变成空槽位,上面那条 `unknown` 永远不红。
    //   ⚠️ `zones.aegyoSal` 例外 —— YSL 整条产品线里没有卧蚕笔,空着是如实。
    const covered = new Set(products.flatMap((p) => p.derived.lookSpecSlots));
    const nobody = [...KNOWN].filter((s) => s !== 'zones.aegyoSal' && !covered.has(s));
    expect(nobody, '这些槽位没有任何产品覆盖').toEqual([]);
  });

  it('★ 补录/系列卡一律 `dimensions: {}`(它们的内容只有目录卡上那几样)', () => {
    // 手写层给不出品牌原文。哪天有人给它们编一段"质地/成分"填进去,
    // 那段话在界面上与品牌资料长得**一模一样** —— 这条挡的就是那件事。
    const invented = products
      .filter((p) => p.origin === 'overlay')
      .filter((p) => Object.values(p.dimensions).some((v) => (v ?? '').trim() !== ''))
      .map((p) => p.id);
    expect(invented).toEqual([]);
  });

  it('★ 四组合并的结果:条数与色号都按合并后的来(被并掉的 slug 不再出现)', () => {
    const byId = new Map(products.map((p) => [p.id, p]));
    // 被并掉的 6 个前端 slug 一个都不该在库里 —— 留着就是"同一件产品两个名字"。
    for (const gone of ['base-fd-old', 'pr-mist', 'bl-powder', 'bl-liquid', 'ct-touch', 'ct-touch-hl']) {
      expect(byId.has(gone), `${gone} 应该已经被并掉了`).toBe(false);
    }
    // 合并后的三条各自带着两边的色号(去重后)。
    expect(byId.get('base-fd-new')?.shades?.shades.length).toBe(16);
    expect(byId.get('bl-couture-blush')?.shades?.shades.length).toBe(16);
    expect(byId.get('con-touch')?.shades?.shades.length).toBe(9);
    // ★ 被并进来那一路的色号名带上了前缀:不加前缀就是拿旧配方的色号冒充新版的。
    const base = byId.get('base-fd-new')!.shades!.shades;
    expect(base.filter((s) => s.name.startsWith('旧版 · ')).length).toBe(5);
    const blush = byId.get('bl-couture-blush')!.shades!.shades;
    expect(blush.filter((s) => s.name.startsWith('液态 · ')).length).toBe(3);
  });

  it('★ 丢掉的两条 `sk-1week` / `sk-3day` 确实不在库里,而三条系列卡在', () => {
    const ids = new Set(products.map((p) => p.id));
    expect([...ids].filter((id) => id === 'sk-1week' || id === 'sk-3day')).toEqual([]);
    // 系列卡留着是**硬要求**:`style-recipes.ts` 的配方直接引 `sk-orrouge`,删了 pid 就悬空。
    for (const id of ['sk-pureshots', 'sk-orrouge', 'sk-reload']) {
      expect(ids.has(id), `${id} 不能丢 —— 有配方指着它`).toBe(true);
    }
  });
});
