/**
 * scripts/import-products.ts —— 【内容生产脚本,不在服务运行路径上】
 *
 * 用途:把品牌方给的 `.docx` 产品资料编译成 `products/<库>/` 那份**机器可读的内容目录**
 * (库元信息 + 分类总览 + 品类匹配速查表 + 逐条产品 JSON + 体检报告)。
 *
 * ★ **与同目录另外两个脚本有一处实质差别,先看这一条**:
 *   `probe-tool-calling.ts` / `qwen-image-makeup.ts` 的产物落在 `./out/`(**已 gitignore**),
 *   是"跑完看看结果"的实验夹具;**本脚本的产物是要入库的内容**(`products/`,进 git)。
 *   所以它不是实验,是**内容生产工具**——**重跑会整体改写被版本管理的文件**。
 *
 * 定位:品牌资料唯一的进口。**改数据只能改源 docx,不许手改生成物**——
 *   手改的东西下一次重导会全丢,而且没人记得改过什么(这条是 owner 拍板的)。
 *   所以脏数据检测必须是**算出来的**(见 `buildHealth`),不能手工标注。
 *
 * 接口形状:
 *   入口 → 读 docx(zip→XML→纯文本)→ 切条目/维度 → 算派生索引 → 体检 → 落盘
 *   产物 → `<out>/library.json` + `<out>/<类别 slug>/<NN>-<英文 slug>.json` + `<out>/source/<原 docx>`
 *   可重复执行:每次**整体重生成**,不追加、不合并;上一版 `library.json` 里记着的类别目录会先清掉。
 *
 * 坑(踩过的,别重踩):
 *   1. **docx 是 zip,而本项目没有 zip 依赖**(运行时依赖只有 fastify 三件套 + zod)。
 *      所以这里手写了一段最小 ZIP 读取器(中央目录 + `zlib.inflateRawSync`),
 *      **只认 `word/document.xml` 这一个条目**,别拿它当通用 unzip 用。
 *   2. **表格单元格的分隔符我用的是 `\t`,不是文档里显示的那个 ` | `**——
 *      那个 ` | ` 是上一轮抽取时我自己插的,不是原文。重建取文本时,**`<w:tab/>` 要映射成空格**
 *      而不是 `\t`,否则正文里的制表符会把一条普通段落劈成假的表格行。
 *   3. **条目编号只按"下一个期望值"收**(见 `parseEntries`):正文里 `3.4%甘醇酸` 这种
 *      以数字开头的正则在行首也能命中,靠"必须是 lastNumber+1"把它挡在外面。
 *      顺带这也就成了编号断档的检测。
 *
 * 用法:
 *   npx tsx scripts/import-products.ts --dry-run     # 只解析 + 打体检报告,一个文件都不写
 *   npx tsx scripts/import-products.ts               # 真导(会覆盖 products/ysl-property/)
 *   npx tsx scripts/import-products.ts --docx <p> --out <dir>
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// ── 位置 ────────────────────────────────────────────────────────────────────

/** 仓库根。用 `import.meta.dirname` 而不是 cwd:脚本从哪儿跑都该找得到同一份资料。 */
const REPO_ROOT = path.join(import.meta.dirname, '..', '..');

const DEFAULT_OUT = path.join(REPO_ROOT, 'products', 'ysl-property');

// ── 六个维度(固定,顺序即展示顺序) ──────────────────────────────────────────

interface DimensionDef {
  key: string;
  label: string;
  /** 可选维度缺失**不算数据问题** —— 报告里单列,免得把真问题淹掉。见 `feedback`。 */
  optional?: boolean;
}

/**
 * ★ 这六项是**品牌资料自己的**分类,不是我们发明的。顺序照原文。
 * `适用肤质` 在原文里有 `（眼部状况）` / `（唇部状况）` 两种带括注的写法,
 * 解析时**按这个 label 归一**,括注只当同义写法丢掉——值是原文照存,不动。
 *
 * ★ `feedback` 标成可选是有依据的:57 条里只有 47 条有社交反馈,缺的那 10 条
 * **不是资料漏了**,是那些产品本来就没被摘录。把它算成"缺维度"会让 #36/#40
 * 这两个真问题淹没在 10 行噪声里——体检报告一旦需要人工筛,就等于没有。
 */
const DIMENSIONS: DimensionDef[] = [
  { key: 'texture', label: '质地/妆效' },
  { key: 'ingredients', label: '核心成分' },
  { key: 'skinTypes', label: '适用肤质' },
  { key: 'occasions', label: '适用天气/场景' },
  { key: 'warnings', label: '成分预警' },
  { key: 'feedback', label: '社交平台用户反馈摘要', optional: true },
];

/** 资料里那个"待补"占位用的是 `说明：`,不是六个维度之一。单列,不当成维度。 */
const NOTE_LABEL = '说明';

// ── 九个类别 ────────────────────────────────────────────────────────────────

interface CategoryDef {
  id: string;
  label: string;
  order: number;
}

/**
 * slug ↔ 中文名。★ **slug 是我们定的**(跨平台安全的目录名/标识),
 * **中文名是原文的**(文档里的章节标题),字面对得上才收——对不上直接报错,
 * 因为那意味着源文档的分类变了,而这个表还没跟上。
 */
const CATEGORIES: CategoryDef[] = [
  { id: 'skincare', label: '护肤类', order: 1 },
  { id: 'sunscreen', label: '防晒类', order: 2 },
  { id: 'primer', label: '妆前类', order: 3 },
  { id: 'base', label: '底妆类', order: 4 },
  { id: 'concealer', label: '遮瑕类', order: 5 },
  { id: 'setting', label: '定妆类', order: 6 },
  { id: 'lip', label: '唇部彩妆', order: 7 },
  { id: 'eye', label: '眼部彩妆', order: 8 },
  { id: 'blush-highlight', label: '腮红与高光修容', order: 9 },
];

/**
 * 品类 → `LookSpec` 槽位。**派生,非原文**,而且刻意做得比"按类别一刀切"更细:
 * `eye` 类里只有眼影盘对得上 `zones.eyeshadow`、眉笔对得上 `zones.brow`,
 * 睫毛膏/眼线笔**对不上任何槽位**;`blush-highlight` 里高光也对不上。
 * 一刀切会让模型以为"眼部彩妆"整类都能填眼影槽,那是错的。
 */
function deriveLookSpecSlots(categoryId: string, name: string): string[] {
  switch (categoryId) {
    case 'base':
    case 'concealer':
      return ['base'];
    case 'lip':
      return ['zones.lip'];
    case 'blush-highlight':
      return /腮红/.test(name) ? ['zones.cheek'] : [];
    case 'eye':
      if (/眼影/.test(name)) return ['zones.eyeshadow'];
      if (/眉笔|眉粉/.test(name)) return ['zones.brow'];
      return [];
    default:
      // 护肤 / 防晒 / 妆前 / 定妆:LookSpec 里没有对应槽位。★ 空着是**如实**,不是缺失。
      return [];
  }
}

// ── argv ────────────────────────────────────────────────────────────────────

interface Argv {
  docx?: string;
  out: string;
  dryRun: boolean;
}

function usage(): never {
  console.error(`用法: tsx scripts/import-products.ts [选项]

  --docx <path>      源 docx(缺省:先找 <out>/source/ 里的,再找 products/ 根下的)
  --out <dir>        产物目录(缺省: products/ysl-property)
  --dry-run          只解析并打报告,一个文件都不写
  -h, --help         显示本帮助
`);
  process.exit(2);
}

function parseArgv(argv: string[]): Argv {
  const out: Argv = { out: DEFAULT_OUT, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') usage();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--docx') {
      const v = argv[++i];
      if (!v) usage();
      out.docx = path.resolve(v);
    } else if (a === '--out') {
      const v = argv[++i];
      if (!v) usage();
      out.out = path.resolve(v);
    } else {
      console.error(`未知参数:${a}`);
      usage();
    }
  }
  return out;
}

// ── 最小 ZIP 读取器 ──────────────────────────────────────────────────────────
//
// 只做一件事:从 docx 里取出 `word/document.xml`。**刻意不通用**——
// 不处理 ZIP64、不处理加密、不处理多个同名条目,遇到了就报错而不是猜。
// 理由见文件头「坑 1」:为这一件事装一个 zip 依赖不划算,但也不能假装它能干别的。

const EOCD_SIG = 0x06054b50; // End of Central Directory
const CEN_SIG = 0x02014b50; // Central Directory File Header
const LOC_SIG = 0x04034b50; // Local File Header

function readZipEntry(buf: Buffer, wanted: string): Buffer {
  // EOCD 在文件末尾,后面最多跟 65535 字节的注释 —— 从尾巴往前扫签名。
  let eocd = -1;
  const floor = Math.max(0, buf.length - (22 + 0xffff));
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 zip:找不到中央目录结尾(EOCD)。这个文件真的是 .docx 吗?');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error(`中央目录第 ${i} 条签名不对,文件可能被截断`);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');

    if (name === wanted) {
      if (buf.readUInt32LE(localOff) !== LOC_SIG) throw new Error('本地文件头签名不对');
      // ★ 本地头的 nameLen/extraLen 常与中央目录不同(extra 字段可以不一样),
      //   所以数据起点必须**按本地头重算**,不能复用中央目录那两个值。
      const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data); // stored
      if (method === 8) return zlib.inflateRawSync(data); // deflate
      throw new Error(`不支持的压缩方式 ${method}(只认 0=stored / 8=deflate)`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`zip 里没有 ${wanted}`);
}

// ── XML → 纯文本 ────────────────────────────────────────────────────────────

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return XML_ENTITIES[body] ?? full;
  });
}

/**
 * 把 `word/document.xml` 压成"一行一段、一格一 tab"的纯文本。
 *
 * 段/单元格的边界是**结构**给的(`</w:p>` / `</w:tc>`),不是靠猜标点——
 * 这是这一层唯一值得做的事。
 */
function documentXmlToText(xml: string): string {
  const TOKEN_RE =
    /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>|<w:tab\b[^>]*\/>|<\/w:p>|<\/w:tc>|<\/w:tr>/g;

  let out = '';
  for (const m of xml.matchAll(TOKEN_RE)) {
    const whole = m[0];
    const run = m[1];
    if (run !== undefined) {
      // 运行块里的换行/制表是 XML 排版留下的,不是内容 —— 折成空格。
      out += decodeXml(run).replace(/[\r\n\t]+/g, ' ');
    } else if (whole === '</w:p>') {
      out += '\n';
    } else if (whole === '</w:tc>') {
      out += '\t';
    } else if (whole === '</w:tr>') {
      out += '\n';
    } else {
      // <w:br/> / <w:tab/>:★ 映射成空格,**绝不能是 `\t`** —— 见文件头「坑 2」。
      out += ' ';
    }
  }
  // `</w:p></w:tc>` 会连出一个多余的换行,抹掉:一格的结尾不该断行。
  return out.replace(/\n\t/g, '\t');
}

// ── 文档解析 ────────────────────────────────────────────────────────────────

interface ParsedProduct {
  number: number;
  name: string;
  categoryId: string;
  series?: string;
  dimensions: Record<string, string>;
  notes: string[];
}

interface ParsedGuideRow {
  condition: string;
  cells: string[];
}

interface ParsedDoc {
  title: string;
  intro: string;
  /** 分类总览:类别名 → 文档自称的款数。 */
  statedCounts: Map<string, number>;
  /** 文档里所有「共 N 款产品」的说法(正文一处、补充说明一处),连同出现的行号。 */
  statedTotals: { line: number; value: number }[];
  products: ParsedProduct[];
  /** 类目 → 该类的系列小标题与说明(只有护肤类有,如实照存)。 */
  series: Map<string, { title: string; note?: string }[]>;
  guide: { columns: string[]; rows: ParsedGuideRow[] };
  notes: { label: string; text: string }[];
}

const SECTION_RE = /^([一二三四五六七八九十]+)、(.+)$/;
const SERIES_RE = /^（[一二三四五六七八九十]+）(.+)$/;
const ENTRY_RE = /^(\d+)\.\s*(.+)$/;
const DIM_RE = new RegExp(`^(${DIMENSIONS.map((d) => d.label).join('|')})(?:（[^）]*）)?：(.*)$`);
const NOTE_RE = new RegExp(`^${NOTE_LABEL}：(.*)$`);

function splitRow(line: string): string[] {
  return line.split('\t').map((c) => c.trim());
}

function parseDocument(text: string): ParsedDoc {
  const lines = text.split('\n');

  // 头两行「非空」就是标题与引言。★ 不用固定下标:抽取出来的文本前面有没有空行,
  // 取决于 docx 里第一个段落之前有没有东西,那种细节不该让标题取错。
  const head = lines.map((l) => l.trim()).filter((l) => l !== '');
  const title = head[0] ?? '';
  const intro = head[1] ?? '';

  // 「共 N 款产品」的每一处说法。数字对不上是**这份资料已知的毛病**,如实记下来。
  const statedTotals: { line: number; value: number }[] = [];
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/共[^。;；]*?(\d+)\s*款产品/g)) {
      statedTotals.push({ line: i + 1, value: Number(m[1]) });
    }
  });

  const statedCounts = new Map<string, number>();
  const products: ParsedProduct[] = [];
  const series = new Map<string, { title: string; note?: string }[]>();
  const notes: { label: string; text: string }[] = [];
  let guide: ParsedDoc['guide'] = { columns: [], rows: [] };

  let section = '';
  let categoryId: string | undefined;
  let currentSeries: string | undefined;
  let current: ParsedProduct | undefined;
  let currentDim: string | undefined;
  let plateau: 'overview' | 'guide' | 'notes' | 'none' = 'none';
  let expected = 1;

  const closeProduct = (): void => {
    if (current) products.push(current);
    current = undefined;
    currentDim = undefined;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line === '') continue;

    // ★ 「分类总览」得单独认:它排在第一章**之前**,所以不写成 `N、xxx`,
    //   SECTION_RE 抓不到它。起初漏了这一条,结果每个类别的 `statedCount` 全是 null ——
    //   而 null 在体检报告里显示成"没意见",于是"文档自称 21 款、实际 22 款"
    //   这个已知毛病**静默消失了**。这类错最难看出来的地方就在这儿。
    if (line === '分类总览') {
      closeProduct();
      section = line;
      categoryId = undefined;
      plateau = 'overview';
      continue;
    }

    // —— 分节 ——
    const sec = SECTION_RE.exec(line);
    if (sec) {
      closeProduct();
      section = sec[2]!.trim();
      const def = CATEGORIES.find((c) => c.label === section);
      categoryId = def?.id;
      currentSeries = undefined;
      if (section === '分类总览') plateau = 'overview';
      else if (section.startsWith('品类匹配逻辑速查表')) plateau = 'guide';
      else if (section.startsWith('知识库补充说明')) plateau = 'notes';
      else {
        plateau = 'none';
        if (def && section !== '分类总览') series.set(def.id, []);
      }
      continue;
    }

    // —— 分类总览:类别 / 数量 / 产品 ——
    if (plateau === 'overview') {
      if (line.includes('\t') || line.startsWith('类别')) {
        const cells = splitRow(line);
        const label = cells[0] ?? '';
        const qty = cells[1] ?? '';
        const m = /^(\d+)\s*款/.exec(qty);
        if (m && CATEGORIES.some((c) => c.label === label)) statedCounts.set(label, Number(m[1]));
      }
      continue;
    }

    // —— 第十节 匹配速查表 ——
    if (plateau === 'guide') {
      if (line.includes('\t')) {
        const cells = splitRow(line);
        // 表头那行的第一格是「天气/场景条件」,拿来当列名。
        if (cells[0] === '天气/场景条件' || (guide.columns.length === 0 && cells.length >= 2)) {
          guide.columns = cells;
        } else if (cells.length >= 2) {
          guide.rows.push({ condition: cells[0] ?? '', cells: cells.slice(1) });
        } else if (guide.rows.length > 0) {
          // 单格续行:并进上一行的该列(源表里有拆行的情况)。
          const last = guide.rows[guide.rows.length - 1]!;
          const idx = cells.findIndex((c) => c !== '');
          if (idx >= 0) last.cells[idx] = `${last.cells[idx] ?? ''}${cells[idx] ?? ''}`.trim();
        }
      }
      continue;
    }

    // —— 第十一节 补充说明 ——
    if (plateau === 'notes') {
      const m = /^([^：]{2,20})：(.*)$/.exec(line);
      if (m) notes.push({ label: m[1]!.trim(), text: m[2]!.trim() });
      continue;
    }

    // —— 类目章节内的系列小标题 ——
    const ser = SERIES_RE.exec(line);
    if (ser && categoryId) {
      closeProduct();
      currentSeries = ser[1]!.trim();
      series.get(categoryId)!.push({ title: currentSeries });
      continue;
    }

    // —— 条目 ——
    const ent = ENTRY_RE.exec(line);
    if (ent && categoryId) {
      const n = Number(ent[1]);
      // ★ 只收"下一个期望的编号"。正文里 `3.4%甘醇酸` 这类行首数字靠这条挡掉,
      //   顺带也就抓出了编号断档(见下面那条 warn)。
      if (n === expected) {
        closeProduct();
        expected = n + 1;
        current = { number: n, name: ent[2]!.trim(), categoryId, dimensions: {}, notes: [] };
        if (currentSeries) current.series = currentSeries;
        continue;
      }
      if (current) {
        // 落在条目里的非期望编号:当正文,不当新条目。
        if (currentDim) current.dimensions[currentDim] = `${current.dimensions[currentDim] ?? ''}${line}`;
        continue;
      }
      continue;
    }

    // —— 系列说明行(小标题紧跟着的那段) ——
    if (categoryId && !current && currentSeries) {
      const entry = series.get(categoryId)!;
      const last = entry[entry.length - 1]!;
      last.note = last.note ? `${last.note}${line}` : line;
      continue;
    }

    // —— 维度 / 占位说明 ——
    if (current) {
      const dim = DIM_RE.exec(line);
      if (dim) {
        const def = DIMENSIONS.find((d) => d.label === dim[1]);
        if (def) {
          currentDim = def.key;
          current.dimensions[def.key] = dim[2]!.trim();
          continue;
        }
      }
      const note = NOTE_RE.exec(line);
      if (note) {
        currentDim = undefined;
        current.notes.push(note[1]!.trim());
        continue;
      }
      // 续行:并进当前维度(源文档里长句偶尔会断行)。
      if (currentDim) {
        current.dimensions[currentDim] = `${current.dimensions[currentDim] ?? ''}${line}`.trim();
      }
    }
  }
  closeProduct();

  return { title, intro, statedCounts, statedTotals, products, series, guide, notes };
}

// ── 派生索引 ────────────────────────────────────────────────────────────────

/**
 * 取名字里的拉丁文部分做英文 slug(品牌资料里英文名都在括号内)。
 *
 * ★ **必须按词去重**:整名里包含括号里的那段,直接拼会把英文名算两遍,
 * 得到 `54-dessin-des-sourcils-dessin-des-sourcils` 这种废 slug
 * (已实测出现过,不是假想)。
 */
function latinSlug(name: string): string {
  const parens = [...name.matchAll(/[（(]([^）)]*)[）)]/g)].map((m) => m[1] ?? '');
  // 括号里的更具体,排前面;整名兜底。
  const pool = [...parens, name].join(' ').replace(/YSL/gi, ' ');

  const seen = new Set<string>();
  const words: string[] = [];
  for (const w of pool.match(/[A-Za-z][A-Za-z0-9'’.-]*/g) ?? []) {
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(key);
  }

  const slug = words.join('-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  // 截到 6 段:再长就不是文件名而是句子了。
  return slug.split('-').filter(Boolean).slice(0, 6).join('-');
}

interface ProductFile {
  id: string;
  number: number;
  name: string;
  category: string;
  dimensions: Record<string, string>;
  derived: {
    lookSpecSlots: string[];
    series?: string;
  };
  /** 源资料里这个条目只有占位说明、没有维度时,原样留一句,别让它看起来像"导成功了"。 */
  notes?: string[];
}

function buildProduct(p: ParsedProduct): ProductFile {
  const slug = latinSlug(p.name);
  // ★ 没有英文名时用**类目**兜底(`29-base`),不用 `ysl-29` ——
  //   编号前缀本来就在,`29-ysl-29` 只是把那两个数字说两遍。
  //   兜底本身是诚实的信号:这几条在源资料里**只有中文名**,该由 owner 去补,不是我们编。
  const id = `${String(p.number).padStart(2, '0')}-${slug || p.categoryId}`;
  // ★ 一个维度都没有的条目(源资料里只有占位说明的那种)**不许宣称覆盖任何槽位**。
  //   #36 藏金粉霜本来会顶着 `lookSpecSlots: ["base"]` 进库 —— 那就是在告诉模型
  //   "这款能填底妆槽",而它一个字的产品信息都没有。空着才是实话。
  const hasData = Object.values(p.dimensions).some((v) => v.trim() !== '');

  const file: ProductFile = {
    id,
    number: p.number,
    name: p.name,
    category: p.categoryId,
    dimensions: p.dimensions,
    derived: { lookSpecSlots: hasData ? deriveLookSpecSlots(p.categoryId, p.name) : [] },
  };
  if (p.series) file.derived.series = p.series;
  if (p.notes.length > 0) file.notes = p.notes;
  return file;
}

// ── 体检报告 ────────────────────────────────────────────────────────────────
//
// ★ 全部**算出来**,没有一项是手工标注的 —— 手工标注会被重导冲掉(见文件头)。
//   所以"修好源 docx → 重导"这条路天然能把报告清零,不用谁记得去删一行注记。

/** 去掉空白与所有标点,只留下字与词 —— 用来比"两条的核心成分是不是同一段话"。 */
function normalizeForCompare(s: string): string {
  return s.replace(/[\s\p{P}\p{S}]/gu, '');
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 整条记录(六个维度拼起来)的字组。判据为什么用整条而不是单维,见 `buildHealth` ③。 */
function recordBigrams(p: ProductFile): Set<string> {
  return bigrams(DIMENSIONS.map((d) => normalizeForCompare(p.dimensions[d.key] ?? '')).join(''));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const common = intersect(a, b);
  return common / (a.size + b.size - common);
}

function intersect(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

/**
 * 重叠系数 = 交集 / 较短那个的大小。
 *
 * ★ **不能只用 Jaccard** —— 这份资料里"疑似重复"的实际形状是
 * **一条短的把一条长的压缩复述一遍**(#6 玻尿酸精华 与 #12 玻色因精华:
 * `高浓度玻色因、香根鸢尾精萃、鼠李糖+玻尿酸` 是另一条的子集)。
 * 那种情况 Jaccard 会被并集里长的那条摊薄到 0.4 上下,**正好漏掉**;
 * 重叠系数则给出 0.9+。两个一起取最大,各管一种形状:
 * Jaccard 管"两条差不多长且基本一样",重叠系数管"短的是长的子集"。
 */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  return intersect(a, b) / Math.min(a.size, b.size);
}

/**
 * 量词。★ 加这一条是因为实测**误伤过**:`48小时持色持妆` 里的 `48` 命中了
 * 「数字+颜色」那条规则(`小时持` 当成了修饰词)。色号是裸数字,数字后面**立刻**
 * 跟量词的就不是色号。
 */
const MEASURE_UNIT = '(?:小时|分钟|秒|周|天|日|年|月|次|倍|款|度|层|重|种|个|片|支|瓶|步|档|成|分|%|ml|g)';

/** 色号样式。资料自称"色号全部剥离",这几条就是拿来打脸的。 */
const SHADE_PATTERNS: { name: string; re: RegExp }[] = [
  { name: '「N号」', re: /\d+\s*号/g },
  // `610裸茶色` 这种:裸数字直接接颜色词。
  { name: '「数字+颜色」', re: new RegExp(`\\d{2,4}(?!${MEASURE_UNIT})(?=[一-鿿]{0,3}(?:色|调))`, 'g') },
  // `B10` / `BR20` 这类字母数字码。SPF/PA 是防晒标识,不是色号,排掉。
  { name: '「字母数字码」', re: /\b[A-Z]{1,3}\d{2,3}\b/g },
];

function scanShadeLeak(text: string): string[] {
  const hits: string[] = [];
  for (const { re } of SHADE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const hit = m[0];
      if (/^(SPF|PA)/i.test(hit)) continue;
      hits.push(hit);
    }
  }
  return [...new Set(hits)];
}

interface Health {
  statedVsActual: {
    perCategory: { id: string; label: string; stated: number | null; actual: number; ok: boolean }[];
    statedTotals: { line: number; value: number }[];
    actualTotal: number;
  };
  missingDimensions: { id: string; number: number; missing: string[] }[];
  /** 可选维度(目前只有社交反馈)的缺失。**单列,因为它不是数据问题**。 */
  missingOptionalDimensions: { id: string; number: number; missing: string[] }[];
  suspectedDuplicates: { a: string; b: string; similarity: number; sameDimensions: number }[];
  shadeLeakage: { id: string; hits: string[]; where: string }[];
  /** 名字里一个拉丁字母都没有、slug 只能拿类目兜底的条目。**源资料的缺口,不是解析的失败。** */
  missingEnglishName: { id: string; number: number; name: string }[];
}

function buildHealth(products: ProductFile[], doc: ParsedDoc): Health {
  // ① 自称 vs 实际
  const perCategory = CATEGORIES.map((c) => {
    const actual = products.filter((p) => p.category === c.id).length;
    const stated = doc.statedCounts.get(c.label) ?? null;
    return { id: c.id, label: c.label, stated, actual, ok: stated === null || stated === actual };
  });

  // ② 缺维度。★ 必填与可选分开收 —— 见 DIMENSIONS 里 `feedback` 那段注释。
  const missingOf = (p: ProductFile, optional: boolean): string[] =>
    DIMENSIONS.filter((d) => Boolean(d.optional) === optional)
      .filter((d) => !(p.dimensions[d.key] ?? '').trim())
      .map((d) => d.key);

  const missingDimensions = products
    .map((p) => ({ id: p.id, number: p.number, missing: missingOf(p, false) }))
    .filter((x) => x.missing.length > 0);
  const missingOptionalDimensions = products
    .map((p) => ({ id: p.id, number: p.number, missing: missingOf(p, true) }))
    .filter((x) => x.missing.length > 0);

  // ③ 疑似重复:**比整条记录,不是只比核心成分**。
  //
  //    ★ 这里换过一次判据,理由值得留着 —— 一开始只比 `ingredients`,阈值 0.5,
  //    结果 57 条里报出 **13 对**,而其中 11 对是**同门产品的正常相似**
  //    (轻盈版/滋润版、防水版/非防水版、同系列的气垫…同系列本来就共享活性成分)。
  //    更要命的是真问题 `#4 ↔ #13` 得分 0.64,比噪声 `#29 ↔ #30` 的 0.74 **还低** ——
  //    说明单看成分这一维,**阈值怎么调都分不开**。
  //    换成整条记录后,同样的 57 条只剩 **4 对**,噪声全掉光了。
  //    原因不难理解:同门产品只在"成分"这一维上像,别的维度各写各的;
  //    而真重复是**整条被复述了一遍**。
  //
  //    ⚠️ 这是**提示不是判定** —— 它只把可疑的一对指出来给人看,绝不自动合并。
  //    那 4 对里有 2 对(#15↔#17 精华乳/面霜、#42↔#43 小金条/丝绒版)其实**是两款产品**,
  //    但它们的「适用肤质/天气」是复制来的,所以那几项**不构成真实差异** ——
  //    这同样是要让人看见的事。
  const suspectedDuplicates: { a: string; b: string; similarity: number; sameDimensions: number }[] = [];
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const a = products[i]!;
      const b = products[j]!;
      const ra = recordBigrams(a);
      const rb = recordBigrams(b);
      const sim = Math.max(jaccard(ra, rb), overlap(ra, rb));
      if (sim < 0.5) continue;
      const sameDimensions = DIMENSIONS.filter((d) => {
        const ta = normalizeForCompare(a.dimensions[d.key] ?? '');
        const tb = normalizeForCompare(b.dimensions[d.key] ?? '');
        if (ta.length < 8 || tb.length < 8) return false;
        return overlap(bigrams(ta), bigrams(tb)) >= 0.7;
      }).length;
      suspectedDuplicates.push({ a: a.id, b: b.id, similarity: Number(sim.toFixed(2)), sameDimensions });
    }
  }
  suspectedDuplicates.sort((x, y) => y.similarity - x.similarity);

  // ④ 色号泄漏
  const shadeLeakage: { id: string; hits: string[]; where: string }[] = [];
  for (const p of products) {
    for (const [key, value] of Object.entries(p.dimensions)) {
      const hits = scanShadeLeak(value);
      if (hits.length > 0) shadeLeakage.push({ id: p.id, hits, where: key });
    }
    const inName = scanShadeLeak(p.name);
    if (inName.length > 0) shadeLeakage.push({ id: p.id, hits: inName, where: 'name' });
  }

  // ⑤ 源资料没给英文名的条目(slug 只能拿类目兜底)。
  const missingEnglishName = products
    .filter((p) => latinSlug(p.name) === '')
    .map((p) => ({ id: p.id, number: p.number, name: p.name }));

  return {
    statedVsActual: { perCategory, statedTotals: doc.statedTotals, actualTotal: products.length },
    missingDimensions,
    missingOptionalDimensions,
    suspectedDuplicates,
    shadeLeakage,
    missingEnglishName,
  };
}

// ── 落盘 ────────────────────────────────────────────────────────────────────

interface LibraryFile {
  id: string;
  name: string;
  brand: string;
  source: { file: string; sha256: string; importedAt: string; importer: string };
  dimensions: DimensionDef[];
  categories: {
    id: string;
    label: string;
    order: number;
    statedCount: number | null;
    actualCount: number;
    lookSpecSlots: string[];
    series: { title: string; note?: string }[];
  }[];
  matchingGuide: { columns: string[]; rows: { condition: string; cells: string[] }[] };
  notes: { label: string; text: string }[];
  health: Health;
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** 上一版 library.json 里记着的类别目录。用来清掉"这次源文档里已经没有了"的旧目录。 */
function previousCategoryIds(outDir: string): string[] {
  const p = path.join(outDir, 'library.json');
  if (!existsSync(p)) return [];
  try {
    const prev = JSON.parse(readFileSync(p, 'utf8')) as { categories?: { id?: string }[] };
    return (prev.categories ?? []).map((c) => c.id).filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function resolveDocx(explicit: string | undefined, outDir: string): string {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`找不到 --docx 指定的文件:${explicit}`);
    return explicit;
  }
  // ★ 先看 <out>/source/:第一次导完源文件会被挪进去,再导就不该又要人指一次路径。
  const candidates = [path.join(outDir, 'source'), path.join(REPO_ROOT, 'products')];
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    const docx = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.docx'));
    if (docx.length === 1) return path.join(dir, docx[0]!);
    if (docx.length > 1) {
      throw new Error(`${dir} 下有 ${docx.length} 个 .docx,不知道用哪个。用 --docx 指定`);
    }
  }
  throw new Error('找不到源 docx。用 --docx <path> 指定');
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

function main(): void {
  const argv = parseArgv(process.argv.slice(2));
  const docxPath = resolveDocx(argv.docx, argv.out);

  const bytes = readFileSync(docxPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const text = documentXmlToText(readZipEntry(bytes, 'word/document.xml').toString('utf8'));
  const doc = parseDocument(text);

  // 章节表对不上就是源文档变类了,直接停下 —— 不要"尽力而为"地导出一半。
  const unknown = CATEGORIES.filter((c) => !doc.products.some((p) => p.categoryId === c.id));
  if (unknown.length > 0) {
    throw new Error(
      `这些类别一条产品都没解析到:${unknown.map((c) => `${c.label}(${c.id})`).join('、')}。` +
        '多半是源文档的章节标题改了,而 CATEGORIES 表还没跟上。',
    );
  }

  const products = doc.products.map(buildProduct);
  const health = buildHealth(products, doc);

  // ——— 报告 ———
  const log = console.log;
  log(`源文件:${docxPath}`);
  log(`sha256:${sha256}`);
  log(`标题:${doc.title}`);
  log('');
  log(`条目数:${products.length}`);
  log('');
  log('分类:');
  for (const c of CATEGORIES) {
    const actual = products.filter((p) => p.category === c.id).length;
    const stated = doc.statedCounts.get(c.label);
    const flag = stated !== undefined && stated !== actual ? `  ← 文档自称 ${stated} 款` : '';
    log(`  ${c.id.padEnd(16)} ${c.label.padEnd(8)} ${String(actual).padStart(3)} 条${flag}`);
  }
  log('');

  log('体检报告:');
  const totals = doc.statedTotals.map((t) => `第 ${t.line} 行说「${t.value} 款」`).join('、');
  log(`  ① 总数说法:${totals || '(一处都没有)'} —— 实际 ${products.length} 款`);
  log(`  ② 缺维度:${health.missingDimensions.length} 条(必填)`);
  for (const m of health.missingDimensions) log(`       #${m.number} ${m.id} 缺 ${m.missing.join('/')}`);
  log(`     另有 ${health.missingOptionalDimensions.length} 条缺可选的社交反馈(不是数据问题)`);
  log(`  ③ 疑似重复:${health.suspectedDuplicates.length} 对`);
  for (const d of health.suspectedDuplicates) {
    log(`       ${d.a} ↔ ${d.b}(整条相似度 ${d.similarity},其中 ${d.sameDimensions} 个维度高度重合)`);
  }
  log(`  ④ 色号泄漏:${health.shadeLeakage.length} 处`);
  for (const s of health.shadeLeakage) log(`       ${s.id} [${s.where}] ${s.hits.join(' ')}`);
  log(`  ⑤ 源资料没给英文名:${health.missingEnglishName.length} 条(id 用类目兜底)`);
  for (const m of health.missingEnglishName) log(`       #${m.number} ${m.name} → ${m.id}`);
  log(`  ⑥ 匹配速查表:${doc.guide.rows.length} 行 × ${doc.guide.columns.length} 列`);
  log('');

  if (argv.dryRun) {
    log('--dry-run:以上只是解析结果,一个文件都没写。');
    return;
  }

  // ——— 写 ———
  const outDir = argv.out;

  // 先清掉上一版记着的、这次已经没有的类别目录,再逐个重写。
  // ★ 只删 library.json 点过名的那些目录:**不动 source/,也不动任何不认识的目录**。
  const prevIds = previousCategoryIds(outDir);
  const liveIds = new Set(CATEGORIES.map((c) => c.id));
  for (const id of prevIds) {
    if (!liveIds.has(id)) {
      const stale = path.join(outDir, id);
      if (existsSync(stale)) {
        rmSync(stale, { recursive: true, force: true });
        log(`清掉了上一版有、这一版没有的类别目录:${id}`);
      }
    }
  }

  for (const file of products) {
    writeJson(path.join(outDir, file.category, `${file.id}.json`), file);
  }

  const library: LibraryFile = {
    id: path.basename(outDir),
    name: `${doc.title}`,
    brand: 'YSL',
    source: {
      file: path.relative(outDir, path.join(outDir, 'source', path.basename(docxPath))).split(path.sep).join('/'),
      sha256,
      importedAt: new Date().toISOString(),
      importer: 'scripts/import-products.ts',
    },
    dimensions: DIMENSIONS,
    categories: CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      order: c.order,
      statedCount: doc.statedCounts.get(c.label) ?? null,
      actualCount: products.filter((p) => p.category === c.id).length,
      lookSpecSlots: [...new Set(products.filter((p) => p.category === c.id).flatMap((p) => p.derived.lookSpecSlots))],
      series: doc.series.get(c.id) ?? [],
    })),
    matchingGuide: { columns: doc.guide.columns, rows: doc.guide.rows },
    notes: doc.notes,
    health,
  };
  writeJson(path.join(outDir, 'library.json'), library);

  // source/ 溯源副本(§13-2:素材逐张记录来源)。
  const sourceDir = path.join(outDir, 'source');
  mkdirSync(sourceDir, { recursive: true });
  const dest = path.join(sourceDir, path.basename(docxPath));
  if (path.resolve(dest) !== path.resolve(docxPath)) copyFileSync(docxPath, dest);

  log(`写好了:${products.length} 个条目 + library.json + source/${path.basename(docxPath)}`);
  log(`产物目录:${outDir}`);
}

// ★ 解析类失败(章节表对不上、zip 坏了)是**预期内**的,给一句话就够,不用甩栈。
try {
  main();
} catch (err) {
  console.error(`导入失败:${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
