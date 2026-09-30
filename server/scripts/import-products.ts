/**
 * scripts/import-products.ts —— 【内容生产脚本,不在服务运行路径上】
 *
 * 用途:把品牌方给的 `.docx` 产品资料 + `products/overlay/<库>/` 那份**手写层**
 * 编译成 `products/<库>/` 那份**机器可读的内容目录**
 * (库元信息 + 分类总览 + 品类匹配速查表 + 逐条产品 JSON + 体检报告)。
 *
 * ★ **与同目录另外两个脚本有一处实质差别,先看这一条**:
 *   `probe-tool-calling.ts` / `qwen-image-makeup.ts` 的产物落在 `./out/`(**已 gitignore**),
 *   是"跑完看看结果"的实验夹具;**本脚本的产物是要入库的内容**(`products/`,进 git)。
 *   所以它不是实验,是**内容生产工具**——**重跑会整体改写被版本管理的文件**。
 *
 * ── 两个输入 ────────────────────────────────────────────────────────────────
 * | 输入 | 提供什么 | 在哪儿 |
 * | --- | --- | --- |
 * | 源 docx | 产品名 / 编号 / 六个维度 / 章节结构 / 速查表 | `<out>/source/*.docx` |
 * | 手写层 | **id 与分类的绑定**、前端那五格文案、色号、补录条目 | `products/overlay/<库>/` |
 *
 * ★ 手写层不是"可选补充",它**是 id 的唯一来源**:docx 里只有 `1..57` 的编号,
 *   而库里的 id 必须是 slug(配方、化妆包、URL 都指着 slug)。
 *   ⇒ 缺了它就只能退回去编一套 `NN-latin`,而那正是这次要消灭的第二套词汇,
 *     所以**这里直接停下**(见 `loadOverlay` 里的报错)。
 *
 * 接口形状:
 *   入口 → 读 docx(zip→XML→纯文本)→ 切条目/维度 → 读手写层 → 合并 → 算派生索引 → 体检 → 落盘
 *   产物 → `<out>/library.json` + `<out>/<类别 slug>/<slug>.json` + `<out>/source/<原 docx>`
 *   可重复执行:每次**整体重生成**,不追加、不合并;每个还活着的类别目录都**整个删掉重建**。
 *   ★ **幂等是硬要求**:`--check` 重跑一遍、与磁盘逐字节比对,有漂移就非零退出。
 *     它就是"重导不会吃掉手写内容"这句话的证明。
 *
 * 坑(踩过的,别重踩):
 *   1. **docx 是 zip,而本项目没有 zip 依赖**(运行时依赖只有 fastify 三件套 + zod)。
 *      所以这里手写了一段最小 ZIP 读取器(中央目录 + `zlib.inflateRawSync`),
 *      **只认 `word/document.xml` 这一个条目**,别拿它当通用 unzip 用。
 *   2. **表格单元格的分隔符我用的是 `\t`,不是文档里显示的那个 ` | `**——
 *      那个 ` | ` 是上一轮抽取时我自己插的,不是原文。重建取文本时,**`<w:tab/>` 要映射成空格**
 *      而不是 `\t`,否则正文里的制表符会把一条普通段落劈成假的表格行。
 *   3. **条目编号只按"下一个期望值"收**(见 `parseDocument`):正文里 `3.4%甘醇酸` 这种
 *      以数字开头的正则在行首也能命中,靠"必须是 lastNumber+1"把它挡在外面。
 *      顺带这也就成了编号断档的检测。
 *
 * 用法:
 *   npx tsx scripts/import-products.ts --dry-run     # 只解析 + 打报告,一个文件都不写
 *   npx tsx scripts/import-products.ts               # 真导(会覆盖 products/ysl-property/)
 *   npx tsx scripts/import-products.ts --check       # ★ 幂等检查:与磁盘逐字节比,有漂移就非零退出
 *   npx tsx scripts/import-products.ts --docx <p> --out <dir> --overlay <dir>
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
// ★ 深层 import,不走模块的公共 barrel:这个脚本是**内容的作者**,不是模块的消费者。
//   它要的是"加载器用的那份形状",而 barrel 有意只暴露运行时 API(见 products/index.ts 头注)。
import {
  parseLibraryFile,
  parseProductFile,
} from '../src/modules/products/domain/validators/content.validator.js';
import type { DimensionKey, LibraryFile, ProductFile } from '../src/modules/products/domain/schemas/index.js';

/**
 * 六个维度键 → 文本。**键借 schema 那份,不在这里另写一遍** ——
 * 写第二遍的后果是"导入器以为有第七维、加载器不认",而那是启动时炸。
 */
type SixText = Partial<Record<DimensionKey, string>>;

// ── 位置 ────────────────────────────────────────────────────────────────────

/** 仓库根。用 `import.meta.dirname` 而不是 cwd:脚本从哪儿跑都该找得到同一份资料。 */
const REPO_ROOT = path.join(import.meta.dirname, '..', '..');

const DEFAULT_OUT = path.join(REPO_ROOT, 'products', 'ysl-property');

// ── 六个维度(固定,顺序即展示顺序) ──────────────────────────────────────────

interface DimensionDef {
  key: DimensionKey;
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
 *
 * ★ **手写层那五格复用同一套键**(`wording`),所以这里**永远是六项**,不会长出第七个。
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

/**
 * 类目 → `LookSpec` 槽位。**派生,非原文**,而且刻意做得比"按类别一刀切"更细:
 * `eye` 类里只有眼影盘对得上 `zones.eyeshadow`、眉笔对得上 `zones.brow`,
 * 睫毛膏/眼线笔**对不上任何槽位**;`contour`(高光/修容)也对不上。
 * 一刀切会让模型以为"眼部彩妆"整类都能填眼影槽,那是错的。
 */
function deriveLookSpecSlots(categoryId: string, name: string): string[] {
  switch (categoryId) {
    case 'base':
    case 'concealer':
      return ['base'];
    case 'lip':
      return ['zones.lip'];
    case 'blush':
      return ['zones.cheek'];
    case 'eye':
      if (/眼影/.test(name)) return ['zones.eyeshadow'];
      if (/眉笔|眉粉/.test(name)) return ['zones.brow'];
      return [];
    default:
      // 护肤 / 妆前 / 定妆 / 修容:LookSpec 里没有对应槽位。★ 空着是**如实**,不是缺失。
      return [];
  }
}

// ── argv ────────────────────────────────────────────────────────────────────

interface Argv {
  docx?: string;
  out: string;
  overlay: string;
  dryRun: boolean;
  check: boolean;
}

function usage(): never {
  console.error(`用法: tsx scripts/import-products.ts [选项]

  --docx <path>      源 docx(缺省:先找 <out>/source/ 里的,再找 products/ 根下的)
  --out <dir>        产物目录(缺省: products/ysl-property)
  --overlay <dir>    手写层目录(缺省: products/overlay/<out 的目录名>)
  --dry-run          只解析并打报告,一个文件都不写
  --check            与磁盘上那份逐字节比对,有漂移就非零退出(不写)
  -h, --help         显示本帮助
`);
  process.exit(2);
}

function parseArgv(argv: string[]): Argv {
  const out: Argv = { out: DEFAULT_OUT, overlay: '', dryRun: false, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') usage();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--check') out.check = true;
    else if (a === '--docx') {
      const v = argv[++i];
      if (!v) usage();
      out.docx = path.resolve(v);
    } else if (a === '--out') {
      const v = argv[++i];
      if (!v) usage();
      out.out = path.resolve(v);
    } else if (a === '--overlay') {
      const v = argv[++i];
      if (!v) usage();
      out.overlay = path.resolve(v);
    } else {
      console.error(`未知参数:${a}`);
      usage();
    }
  }
  if (out.dryRun && out.check) {
    console.error('--dry-run 与 --check 不能一起用:一个什么都不写,一个要读着磁盘比。');
    process.exit(2);
  }
  // 手写层跟着 `--out` 走:产物目录叫 `products/foo`,`--out products/foo` 自然配 `products/overlay/foo`。
  if (!out.overlay) out.overlay = path.join(path.dirname(out.out), 'overlay', path.basename(out.out));
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

// ── 手写层 ──────────────────────────────────────────────────────────────────
//
// ★ 它是**第二个输入**,不是补丁仓库:docx 提供内容,它提供**身份**(id 与分类)
//   和 docx 里没有的那几样(文案 / 色号 / 补录条目)。
//   规矩写在 `products/overlay/README.md`,这里只负责"读进来 + 错一条就停"。

interface OverlayCategory {
  id: string;
  label: string;
  group: string;
  order: number;
}

/** 一条 patch。**每个键都是可选的**,因为 docx 有的条目只需要补几样。 */
interface OverlayPatch {
  id: string;
  name?: string;
  category?: string;
  kind?: 'product' | 'series';
  wording?: Record<string, string>;
  shades?: { label: string; shades: unknown[] };
  blurb?: string;
  contains?: string[];
}

interface Overlay {
  dir: string;
  groups: { id: string; label: string; order: number }[];
  categories: OverlayCategory[];
  /** docx 章节名 → 展示类目;`null` = 该章节的条目各自在 patch 里声明类目。 */
  sections: Map<string, string | null>;
  /** docx 编号 → slug。 */
  entries: Map<number, string>;
  /** slug → patch(**所有** patch 文件,含只补几样的那些)。 */
  patches: Map<string, OverlayPatch>;
}

function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`手写层读不出来:${file} —— ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 读手写层。**一条不对就停**,与"章节表对不上就停"同一条规矩:
 * 猜一个 id、跳过一条读不出来的 patch,后果都是**库悄悄地少一件产品或换了个名字**,
 * 而界面上完全看不出来。
 */
function loadOverlay(dir: string, expectedLibrary: string): Overlay {
  const crosswalkPath = path.join(dir, 'crosswalk.json');
  if (!existsSync(crosswalkPath)) {
    throw new Error(
      `找不到手写层:${crosswalkPath}\n` +
        '  导入器有**两个输入**:源 docx + 手写层(见 products/overlay/README.md)。\n' +
        '  手写层是产品 id 的唯一来源 —— docx 里只有编号,没有 slug。\n' +
        '  (缺省路径是 products/overlay/<--out 的目录名>,可以用 --overlay 指定。)',
    );
  }
  const raw = readJsonFile(crosswalkPath) as Record<string, unknown>;

  const groups = raw.groups as Overlay['groups'] | undefined;
  const categories = raw.categories as OverlayCategory[] | undefined;
  const docxSections = raw.docxSections as { label: string; category: string | null }[] | undefined;
  const entriesRaw = raw.entries as Record<string, string> | undefined;
  if (!groups || !categories || !docxSections || !entriesRaw) {
    throw new Error(`${crosswalkPath} 少了必填的 groups / categories / docxSections / entries`);
  }

  // ★ 先核"这是哪个库的手写层"。`--overlay` 收的是任意路径,配错一次就是
  //   拿 A 的手写层去改 B 的库:patch 名字对不上时**大部分会静默落空**
  //   (buildProducts 的 docx 那一路只按编号找 patch,找不到就当"这条没有手写内容"),
  //   结果 B 库里一半产品少了色号,而导入器打印的条数一切正常。
  if (raw.library !== expectedLibrary) {
    throw new Error(
      `手写层配错了:${crosswalkPath} 说它是「${String(raw.library)}」库的,` +
        `而 --out 指的是「${expectedLibrary}」。`,
    );
  }

  const groupIds = new Set(groups.map((g) => g.id));
  const categoryIds = new Set(categories.map((c) => c.id));
  for (const c of categories) {
    if (!groupIds.has(c.group)) throw new Error(`crosswalk: 类目「${c.id}」的分组「${c.group}」不在 groups 里`);
  }

  const sections = new Map<string, string | null>();
  for (const s of docxSections) {
    if (sections.has(s.label)) throw new Error(`crosswalk: docx 章节「${s.label}」写了两次`);
    if (s.category !== null && !categoryIds.has(s.category)) {
      throw new Error(`crosswalk: 章节「${s.label}」映射到不存在的类目「${s.category}」`);
    }
    sections.set(s.label, s.category);
  }

  const entries = new Map<number, string>();
  const slugSeen = new Set<string>();
  for (const [k, slug] of Object.entries(entriesRaw)) {
    const n = Number(k);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`crosswalk.entries 的键「${k}」不是 docx 编号`);
    if (slugSeen.has(slug)) throw new Error(`crosswalk: slug「${slug}」被两个编号指着`);
    slugSeen.add(slug);
    entries.set(n, slug);
  }

  // 每个 patch 文件。★ 文件名就是 id,两者不一致就是"改了文件名忘了改内容"。
  const patches = new Map<string, OverlayPatch>();
  const productsDir = path.join(dir, 'products');
  if (!existsSync(productsDir)) throw new Error(`手写层里没有 products/ 目录:${productsDir}`);
  for (const file of readdirSync(productsDir).sort()) {
    if (!file.endsWith('.json')) continue;
    const slug = file.slice(0, -'.json'.length);
    const patch = readJsonFile(path.join(productsDir, file)) as OverlayPatch;
    if (patch.id !== slug) {
      throw new Error(`手写层 ${file} 里的 id 是「${patch.id}」,与文件名对不上。两者必须一致。`);
    }
    if (patch.category !== undefined && !categoryIds.has(patch.category)) {
      throw new Error(`手写层 ${file}:类目「${patch.category}」不在 crosswalk.categories 里`);
    }
    const codes = (patch.shades?.shades ?? []) as { code?: unknown }[];
    const seen = new Set<unknown>();
    for (const s of codes) {
      if (seen.has(s.code)) {
        throw new Error(
          `手写层 ${file}:色号「${String(s.code)}」出现了两次。` +
            '同一件产品里色号必须唯一 —— 方案按 (产品 id, 色号) 取色块,重复就没有唯一答案。',
        );
      }
      seen.add(s.code);
    }
    patches.set(slug, patch);
  }

  return { dir, groups, categories, sections, entries, patches };
}

// ── 文档解析 ────────────────────────────────────────────────────────────────

interface ParsedProduct {
  number: number;
  name: string;
  /** ★ docx **自己的**章节名(如 `护肤类`)。展示类目要到合并那一步才定。 */
  section: string;
  series?: string;
  dimensions: SixText;
  notes: string[];
}

interface ParsedGuideRow {
  condition: string;
  cells: string[];
}

interface ParsedDoc {
  title: string;
  intro: string;
  /** 分类总览:docx 章节名 → 文档自称的款数。 */
  statedCounts: Map<string, number>;
  /** 文档里所有「共 N 款产品」的说法(正文一处、补充说明一处),连同出现的行号。 */
  statedTotals: { line: number; value: number }[];
  products: ParsedProduct[];
  /** 章节名 → 该章的系列小标题与说明(只有护肤类有,如实照存)。 */
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

/**
 * 切 docx。`sectionLabels` 是**产品章节**的白名单(来自手写层的 `docxSections`)——
 * 只有认得出的章节里的 `N. 名字` 才算条目,否则"分类总览"那种表也能被切出产品来。
 */
function parseDocument(text: string, sectionLabels: Set<string>): ParsedDoc {
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
  let inProductSection = false;
  let currentSeries: string | undefined;
  let current: ParsedProduct | undefined;
  let currentDim: DimensionKey | undefined;
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
    //   SECTION_RE 抓不到它。起初漏了这一条,结果每个章节的 `stated` 全是 null ——
    //   而 null 在体检报告里显示成"没意见",于是"文档自称 21 款、实际 22 款"
    //   这个已知毛病**静默消失了**。这类错最难看出来的地方就在这儿。
    if (line === '分类总览') {
      closeProduct();
      section = line;
      inProductSection = false;
      plateau = 'overview';
      continue;
    }

    // —— 分节 ——
    const sec = SECTION_RE.exec(line);
    if (sec) {
      closeProduct();
      section = sec[2]!.trim();
      inProductSection = sectionLabels.has(section);
      currentSeries = undefined;
      if (section === '分类总览') plateau = 'overview';
      else if (section.startsWith('品类匹配逻辑速查表')) plateau = 'guide';
      else if (section.startsWith('知识库补充说明')) plateau = 'notes';
      else {
        plateau = 'none';
        if (inProductSection) series.set(section, []);
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
        if (m && sectionLabels.has(label)) statedCounts.set(label, Number(m[1]));
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
    if (ser && inProductSection) {
      closeProduct();
      currentSeries = ser[1]!.trim();
      series.get(section)!.push({ title: currentSeries });
      continue;
    }

    // —— 条目 ——
    const ent = ENTRY_RE.exec(line);
    if (ent && inProductSection) {
      const n = Number(ent[1]);
      // ★ 只收"下一个期望的编号"。正文里 `3.4%甘醇酸` 这类行首数字靠这条挡掉,
      //   顺带也就抓出了编号断档(见下面那条 warn)。
      if (n === expected) {
        closeProduct();
        expected = n + 1;
        current = { number: n, name: ent[2]!.trim(), section, dimensions: {}, notes: [] };
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
    if (inProductSection && !current && currentSeries) {
      const entry = series.get(section)!;
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

// ── 合并(两份输入 → 库里的条目) ─────────────────────────────────────────────

/**
 * 取名字里的拉丁文部分。**只用来做体检报告里的"源资料没给英文名"那一项**——
 * id 已经不由它决定了(见 `Overlay.entries`)。
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

const EMPTY_DIMENSIONS: SixText = {};

/**
 * 两路合流。★ 有一条顺序上的讲究:**docx 那一路先铺,手写层按 slug 叠上去**——
 * 反过来写的话,"docx 里有的字段以 docx 为准"这条规矩就得靠每个字段各判一次。
 */
function buildProducts(doc: ParsedDoc, overlay: Overlay): ProductFile[] {
  const docxSlugs = new Set(overlay.entries.values());
  const out: ProductFile[] = [];

  for (const p of doc.products) {
    const slug = overlay.entries.get(p.number);
    if (!slug) throw new Error(`docx 编号 ${p.number} 在手写层的 entries 里没有对应 slug`); // 前面已查,这里只是收窄类型
    const patch = overlay.patches.get(slug);
    const category = patch?.category ?? overlay.sections.get(p.section) ?? '';
    if (!category) {
      throw new Error(
        `docx 编号 ${p.number}(${p.name.slice(0, 20)}…)不知道该归哪个类目:` +
          `它所在的章节「${p.section}」在 crosswalk 里标着 category: null,` +
          `而手写层 products/${slug}.json 没写 category。`,
      );
    }
    const hasData = Object.values(p.dimensions).some((v) => v.trim() !== '');

    const file: ProductFile = {
      id: slug,
      number: p.number,
      name: p.name,
      category,
      kind: 'product',
      dimensions: p.dimensions,
      derived: {
        // ★ 一个维度都没有的条目(源资料里只有占位说明的那种)**不许宣称覆盖任何槽位**。
        //   #36 藏金粉霜本来会顶着 `lookSpecSlots: ["base"]` 进库 —— 那就是在告诉模型
        //   "这款能填底妆槽",而它一个字的产品信息都没有。空着才是实话。
        lookSpecSlots: hasData ? deriveLookSpecSlots(category, p.name) : [],
      },
      origin: 'docx',
    };
    if (p.series) file.derived.series = p.series;
    if (p.notes.length > 0) file.notes = p.notes;
    if (patch?.wording) file.wording = patch.wording;
    if (patch?.shades) file.shades = patch.shades as ProductFile['shades'];
    if (patch?.blurb) file.blurb = patch.blurb;
    out.push(file);
  }

  // 手写层补录的:docx 里没有,整条都由 patch 提供。
  for (const [slug, patch] of overlay.patches) {
    if (docxSlugs.has(slug)) continue;
    if (!patch.name || !patch.category) {
      throw new Error(
        `手写层 products/${slug}.json 既不在 crosswalk.entries 里(docx 里没有这一条),` +
          '又没写 name / category —— 没有这两样它进不了库。',
      );
    }
    const kind = patch.kind ?? 'product';
    const file: ProductFile = {
      id: slug,
      number: null,
      name: patch.name,
      category: patch.category,
      kind,
      dimensions: EMPTY_DIMENSIONS,
      // 系列卡自己不是产品,不覆盖任何妆面槽位。
      derived: {
        lookSpecSlots: kind === 'series' ? [] : deriveLookSpecSlots(patch.category, patch.name),
        ...(patch.contains ? { contains: patch.contains } : {}),
      },
      origin: 'overlay',
    };
    if (patch.wording) file.wording = patch.wording;
    if (patch.shades) file.shades = patch.shades as ProductFile['shades'];
    if (patch.blurb) file.blurb = patch.blurb;
    out.push(file);
  }

  // 系列卡的孩子必须真的在库里。★ 悬空的 `contains` 不报错的话,界面上那张系列卡
  // 点进去就是一片空白,而"为什么空"没有任何地方说 —— 同 `checkCrosswalk` 的同一条规矩。
  const allSlugs = new Set(out.map((p) => p.id));
  for (const p of out) {
    for (const kid of p.derived.contains ?? []) {
      if (!allSlugs.has(kid)) {
        throw new Error(`手写层 ${p.id}.json 的 contains 里有「${kid}」,但库里没有这个 id。`);
      }
    }
  }

  // ★ 类别目录名就是分类 id,顺序按 slug —— 让写盘顺序**只由 slug 决定**,
  //   重跑两次的字节才会一样(`--check` 靠这条)。
  return out.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
}

/**
 * 两个方向都查:docx 每个编号都要有 slug,`entries` 每个键都要真的在 docx 里。
 * ★ 只查一个方向的后果是**单侧的**:源文档加了一条产品、而交叉表没跟上时,
 * 那条产品会**静默地不进库** —— 界面上它就是不存在的,没有任何一行日志说为什么。
 */
function checkCrosswalk(doc: ParsedDoc, overlay: Overlay): void {
  const numbers = new Set(doc.products.map((p) => p.number));
  const missing = [...numbers].filter((n) => !overlay.entries.has(n)).sort((a, b) => a - b);
  if (missing.length > 0) {
    throw new Error(
      `源文档里这些编号在 crosswalk.entries 里没有 slug:${missing.join('、')}。` +
        '源文档加了产品,而手写层没跟上 —— 请补上再重导。',
    );
  }
  const extra = [...overlay.entries.keys()].filter((n) => !numbers.has(n)).sort((a, b) => a - b);
  if (extra.length > 0) {
    throw new Error(`crosswalk.entries 里这些编号源文档里没有:${extra.join('、')}。写错了或者源文档删了条目。`);
  }
  for (const [label] of overlay.sections) {
    if (!doc.products.some((p) => p.section === label)) {
      throw new Error(
        `crosswalk.docxSections 里的章节「${label}」一条产品都没解析到。` +
          '多半是源文档的章节标题改了,而这张表还没跟上。',
      );
    }
  }
}

// ── 体检报告 ────────────────────────────────────────────────────────────────
//
// ★ 全部**算出来**,没有一项是手工标注的 —— 手工标注会被重导冲掉(见文件头)。
//   所以"修好源 docx / 改好手写层 → 重导"这条路天然能把报告清零,不用谁记得去删一行注记。

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

function buildHealth(doc: ParsedDoc, products: ProductFile[], overlay: Overlay): LibraryFile['health'] {
  // ① docx 审 docx。★ 键是**源文档自己的章节名**,与展示类目无关 ——
  //    这是它和旧版 `statedVsActual` 唯一的区别,也是它现在唯一说得通的地方。
  const perSection = [...overlay.sections.keys()].map((label) => {
    const parsed = doc.products.filter((p) => p.section === label).length;
    const stated = doc.statedCounts.get(label) ?? null;
    return { label, stated, parsed, ok: stated === null || stated === parsed };
  });

  // ② 两份输入并起来之后的样子。
  const overlaySlugs = new Set(products.filter((p) => p.origin === 'overlay').map((p) => p.id));
  const byCategory = overlay.categories.map((c) => {
    const mine = products.filter((p) => p.category === c.id);
    return {
      id: c.id,
      count: mine.length,
      docx: mine.filter((p) => p.origin === 'docx').length,
      overlayOnly: mine.filter((p) => p.origin === 'overlay').length,
    };
  });
  const shaded = products.filter((p) => p.shades);

  // ③ 缺维度。★ 必填与可选分开收 —— 见 DIMENSIONS 里 `feedback` 那段注释。
  const missingOf = (p: ProductFile, optional: boolean): DimensionKey[] =>
    DIMENSIONS.filter((d) => Boolean(d.optional) === optional)
      .filter((d) => !(p.dimensions[d.key] ?? '').trim())
      .map((d) => d.key);

  const missingDimensions = products
    .map((p) => ({ id: p.id, number: p.number, missing: missingOf(p, false) }))
    .filter((x) => x.missing.length > 0);
  const missingOptionalDimensions = products
    .map((p) => ({ id: p.id, number: p.number, missing: missingOf(p, true) }))
    .filter((x) => x.missing.length > 0);

  // ④ 疑似重复:**比整条记录,不是只比核心成分**。
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
  //
  //    ⚠️ 补录/系列卡**不参与**:它们没有 `dimensions`,两两之间相似度恒为 0,
  //    参与进来只会让这张表变长而一条都不增加信息。
  const compared = products.filter((p) => p.origin === 'docx');
  const suspectedDuplicates: { a: string; b: string; similarity: number; sameDimensions: number }[] = [];
  for (let i = 0; i < compared.length; i++) {
    for (let j = i + 1; j < compared.length; j++) {
      const a = compared[i]!;
      const b = compared[j]!;
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

  // ⑤ 色号泄漏。★ 只看 `dimensions`(docx 原文),**不看 `wording`** ——
  //    这一项问的是"品牌资料自称剥离了色号,做到了吗",手写层那几句不归它管。
  const shadeLeakage: { id: string; hits: string[]; where: string }[] = [];
  for (const p of products) {
    for (const [key, value] of Object.entries(p.dimensions) as [string, string][]) {
      const hits = scanShadeLeak(value);
      if (hits.length > 0) shadeLeakage.push({ id: p.id, hits, where: key });
    }
    const inName = scanShadeLeak(p.name);
    if (inName.length > 0) shadeLeakage.push({ id: p.id, hits: inName, where: 'name' });
  }

  // ⑥ 源资料没给英文名的条目。
  const missingEnglishName = products
    .filter((p) => p.origin === 'docx' && latinSlug(p.name) === '')
    .map((p) => ({ id: p.id, number: p.number, name: p.name }));

  return {
    docxSections: { perSection, statedTotals: doc.statedTotals, parsedTotal: doc.products.length },
    merge: {
      docxEntries: doc.products.length,
      mergedEntries: products.length,
      overlayOnly: [...overlaySlugs].sort(),
      byCategory,
      shades: {
        products: shaded.length,
        rows: shaded.reduce((n, p) => n + (p.shades?.shades.length ?? 0), 0),
      },
    },
    missingDimensions,
    missingOptionalDimensions,
    suspectedDuplicates,
    shadeLeakage,
    missingEnglishName,
  };
}

// ── 落盘 ────────────────────────────────────────────────────────────────────

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, serialize(value), 'utf8');
}

/** ★ 只有一处能决定"文件长什么样"——`--check` 逐字节比的就是它。 */
function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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

interface Built {
  doc: ParsedDoc;
  overlay: Overlay;
  /** 源 docx 的绝对路径(`source/` 里那份溯源副本就是从它复制的)。 */
  docxPath: string;
  products: ProductFile[];
  library: LibraryFile;
  /** 相对 `<out>/`,每个产物文件 → 它该有的字节。`--check` 拿它与磁盘比。 */
  files: Map<string, string>;
}

function build(argv: Argv): Built {
  const docxPath = resolveDocx(argv.docx, argv.out);
  const overlay = loadOverlay(argv.overlay, path.basename(argv.out));

  const bytes = readFileSync(docxPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const text = documentXmlToText(readZipEntry(bytes, 'word/document.xml').toString('utf8'));
  const doc = parseDocument(text, new Set(overlay.sections.keys()));
  checkCrosswalk(doc, overlay);

  const products = buildProducts(doc, overlay);
  const health = buildHealth(doc, products, overlay);

  const library: LibraryFile = {
    id: path.basename(argv.out),
    name: doc.title,
    brand: 'YSL',
    source: {
      file: path
        .relative(argv.out, path.join(argv.out, 'source', path.basename(docxPath)))
        .split(path.sep)
        .join('/'),
      sha256,
      importedAt: new Date().toISOString(),
      importer: 'scripts/import-products.ts',
    },
    dimensions: DIMENSIONS,
    groups: overlay.groups,
    categories: overlay.categories.map((c) => {
      const mine = products.filter((p) => p.category === c.id);
      return {
        id: c.id,
        label: c.label,
        group: c.group,
        order: c.order,
        actualCount: mine.length,
        lookSpecSlots: [...new Set(mine.flatMap((p) => p.derived.lookSpecSlots))],
        // docx 自己那几段系列说明,按映射到这一类目的章节收集。
        series: [...overlay.sections]
          .filter(([, category]) => category === c.id)
          .flatMap(([label]) => doc.series.get(label) ?? []),
      };
    }),
    matchingGuide: { columns: doc.guide.columns, rows: doc.guide.rows },
    notes: doc.notes,
    health,
  };

  // 每个产物文件都过一遍**加载器用的那份 schema**。
  // ★ 这一条保证"导入器写得出的,加载器一定读得进"——两边各有各的形状定义时,
  //   它们会漂,而漂的那天是**启动时炸**,不是导的时候。
  parseLibraryFile(library, 'library.json');
  const files = new Map<string, string>();
  for (const p of products) {
    parseProductFile(p, `${p.category}/${p.id}.json`);
    files.set(`${p.category}/${p.id}.json`, serialize(p));
  }
  files.set('library.json', serialize(library));

  return { doc, overlay, docxPath, products, library, files };
}

function report(built: Built): void {
  const { doc, overlay, library } = built;
  const health = library.health;
  const log = console.log;

  log(`手写层:${overlay.dir}`);
  log(`标题:${doc.title}`);
  log('');
  log(`docx 条目:${health.merge.docxEntries}  →  合并后:${health.merge.mergedEntries} 条`);
  log('');
  log('分类:');
  for (const c of health.merge.byCategory) {
    const cat = library.categories.find((x) => x.id === c.id)!;
    log(
      `  ${c.id.padEnd(11)} ${cat.label.padEnd(9)} ${String(c.count).padStart(3)} 条` +
        (c.overlayOnly > 0 ? `(手写层 ${c.overlayOnly})` : ''),
    );
  }
  log('');
  log('体检报告:');
  log('  ① docx 自报 vs 实解析(拿 docx 审 docx,与手写层无关):');
  for (const s of health.docxSections.perSection) {
    const flag = s.ok ? '' : `  ← 资料自称 ${s.stated} 款`;
    log(`       ${s.label.padEnd(9)} ${String(s.parsed).padStart(3)} 条${flag}`);
  }
  const totals = doc.statedTotals.map((t) => `第 ${t.line} 行说「${t.value} 款」`).join('、');
  log(`     总数说法:${totals || '(一处都没有)'} —— 实解析 ${health.docxSections.parsedTotal} 款`);
  const overlayOnly = new Set(health.merge.overlayOnly);
  const seriesCount = built.products.filter((p) => p.kind === 'series').length;
  const docxGaps = health.missingDimensions.filter((m) => !overlayOnly.has(m.id));
  const docxOptionalGaps = health.missingOptionalDimensions.filter((m) => !overlayOnly.has(m.id));

  log(
    `  ② 合并:手写层独有 ${overlayOnly.size} 条` +
      `(${overlayOnly.size - seriesCount} 条补录 + ${seriesCount} 张系列卡)/ ` +
      `色号 ${health.merge.shades.rows} 行(${health.merge.shades.products} 件产品有试色)`,
  );
  for (const slug of health.merge.overlayOnly) log(`       ${slug}`);
  log(`  ③ 缺维度:${docxGaps.length} 条(必填)`);
  for (const m of docxGaps) log(`       ${m.id} 缺 ${m.missing.join('/')}`);
  log(`     另有 ${docxOptionalGaps.length} 条缺可选的社交反馈(不是数据问题)`);
  // ★ 上面两行**只数源 docx 那一路**。手写层补录/系列卡天然没有六维度(它们的内容
  //   只有目录卡上那几样),混进来就是 9 行噪声压着 2 行真话 —— 那是这份报告唯一的用途。
  //   `library.json` 里的两个 `missing*` 列表仍然是**全的**,这里只是不重复铺开。
  log(`     ★ 那 ${overlayOnly.size} 条手写层独有的上面都列了,不重复算进这里。`);
  log(`  ④ 疑似重复:${health.suspectedDuplicates.length} 对`);
  for (const d of health.suspectedDuplicates) {
    log(`       ${d.a} ↔ ${d.b}(整条相似度 ${d.similarity},其中 ${d.sameDimensions} 个维度高度重合)`);
  }
  log(`  ⑤ 色号泄漏:${health.shadeLeakage.length} 处`);
  for (const s of health.shadeLeakage) log(`       ${s.id} [${s.where}] ${s.hits.join(' ')}`);
  log(`  ⑥ 源资料没给英文名:${health.missingEnglishName.length} 条`);
  for (const m of health.missingEnglishName) log(`       #${m.number} ${m.name} → ${m.id}`);
  log(`  ⑦ 匹配速查表:${doc.guide.rows.length} 行 × ${doc.guide.columns.length} 列`);
  log('');
}

function main(): void {
  const argv = parseArgv(process.argv.slice(2));
  const built = build(argv);
  report(built);

  if (argv.dryRun) {
    console.log('--dry-run:以上只是解析结果,一个文件都没写。');
    return;
  }

  if (argv.check) checkAgainstDisk(argv.out, built);
  else writeAll(argv.out, built);
}

/**
 * 与磁盘逐字节比。★ 这是**幂等的证明**:重导两次之间手写层没变,
 * 产物就该一个字节都不差 —— 差一个字都说明生成过程里有非确定性(时间戳除外),
 * 或者有人手改过生成物。
 */
function checkAgainstDisk(outDir: string, built: Built): void {
  const drifts: string[] = [];
  const onDisk = new Set<string>();

  for (const [rel, expected] of built.files) {
    onDisk.add(rel);
    const file = path.join(outDir, rel);
    if (!existsSync(file)) {
      drifts.push(`${rel}:磁盘上没有`);
      continue;
    }
    const actual = readFileSync(file, 'utf8');
    if (rel === 'library.json') {
      // `importedAt` 每次都变,比它没有意义 —— 忽略这一格再比。
      const strip = (s: string): string =>
        s.replace(/"importedAt":\s*"[^"]*"/, '"importedAt": "(ignored)"');
      if (strip(actual) !== strip(expected)) drifts.push(`${rel}:内容有漂移`);
      continue;
    }
    if (actual !== expected) drifts.push(`${rel}:内容有漂移`);
  }

  // 反向:磁盘上多出来的产品文件(改了名、源文档删了条目,都会留下这种)。
  for (const cat of built.library.categories) {
    const dir = path.join(outDir, cat.id);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      if (!onDisk.has(`${cat.id}/${f}`)) drifts.push(`${cat.id}/${f}:磁盘上有,这次生成里没有`);
    }
  }

  // ★ 还要看**目录**这一层:改名留下的旧类目目录(这次就出现过 skincare/ / sunscreen/ /
  //   blush-highlight/)下面的文件全都能对上号,但目录本身是多余的 ——
  //   而加载器对库根下任何不在 `categories` 里的目录是**启动即失败**。
  //   只按文件比会漏掉它,`--check` 然后就变成一句不成立的保证。
  const liveCats = new Set(built.library.categories.map((c) => c.id));
  if (existsSync(outDir)) {
    for (const entry of readdirSync(outDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'source' || liveCats.has(entry.name)) continue;
      drifts.push(`${entry.name}/:磁盘上有这个目录,而它不在 categories 里`);
    }
  }

  if (drifts.length === 0) {
    console.log(`--check 干净:${built.files.size} 个文件与磁盘逐字节一致。`);
    return;
  }
  console.error(`--check 发现 ${drifts.length} 处漂移:`);
  for (const d of drifts) console.error(`  ${d}`);
  console.error('重跑一次(不带 --check)可以对齐;若对齐后仍有漂移,那是生成过程本身不确定。');
  process.exitCode = 1;
}

function writeAll(outDir: string, built: Built): void {
  // ★ **库根下除 `source/` 之外,每个目录都整个删掉重建**,不看它是不是"还活着的类目"。
  //
  //   上一版只删"整块消失的类目",漏掉了**改名**这一种:类目 `base`/`lip` 一直都在,
  //   只是下面的文件名换了,于是旧文件留在原地 —— 而加载器对库根下任何不在
  //   `categories` 里的目录是**启动即失败**。这次重构正好踩中:老分类
  //   `skincare`/`sunscreen`/`blush-highlight` 三个目录连同 26 个文件原样留着,
  //   下一次 `npm run dev` 就会炸。导入器造的孽不该让加载器背。
  //   ⚠️ 删目录时**不递归进 `source/`** —— 那是源 docx 的溯源副本,删了就只能重新找原件。
  if (existsSync(outDir)) {
    for (const entry of readdirSync(outDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'source') continue;
      rmSync(path.join(outDir, entry.name), { recursive: true, force: true });
    }
  }
  for (const [rel, content] of built.files) {
    const file = path.join(outDir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, 'utf8');
  }

  // source/ 溯源副本(§13-2:素材逐张记录来源)。★ 不在 `files` 里 ——
  // 它是**原样的字节**,不是生成物,`--check` 没法逐字节"比"一个自己。
  const docxPath = built.docxPath;
  const sourceDir = path.join(outDir, 'source');
  mkdirSync(sourceDir, { recursive: true });
  const dest = path.join(sourceDir, path.basename(docxPath));
  if (path.resolve(dest) !== path.resolve(docxPath)) copyFileSync(docxPath, dest);

  console.log(
    `写好了:${built.products.length} 个条目 + library.json + source/${path.basename(docxPath)}`,
  );
  console.log(`产物目录:${outDir}`);
}

// ★ 解析类失败(章节表对不上、zip 坏了、手写层少一条)是**预期内**的,给一句话就够,不用甩栈。
try {
  main();
} catch (err) {
  console.error(`导入失败:${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
