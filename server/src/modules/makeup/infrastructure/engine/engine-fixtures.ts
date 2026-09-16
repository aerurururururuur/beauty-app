/**
 * infrastructure/engine/engine-fixtures.ts —— 引擎调用的 **record/replay 夹具**(§5.4)。
 *
 * 为什么要这个东西,一句话:**真实调用要花钱、要联网、还会随平台方改行为失效。**
 * 把跑过的那几次冻成夹具之后,CI 与单测可以零成本、零网络地跑同一批输入。
 *
 * ⚠️ **夹具的诚实边界(别把它读大):**
 * - **夹具绿 ≠ 线上绿。** 它证明的是"我们的组装逻辑没变",**不是**"模型还会这么画"。
 *   平台方换了模型行为,夹具照样全绿。所以 §12.1 的实测打分**不能**被夹具替代。
 * - **当前 `__fixtures__/` 是空的。** 录制要真花钱跑一遍(`MAKEUP_ENGINE=qwen` + 录制开关),
 *   本项目尚未跑。也就是说**阶段 1 的验收目前只完成了一半**:`buildPrompt` 的硬断言绿,
 *   夹具那一半**等一次付费录制**。
 *
 * ★ **图片不进 JSON。** base64 有几 MB,写进 json 会让夹具没法读、没法 diff、
 *   也没法进 git。所以 json 只存**摘要与文件名**,图另外落一个文件。
 * ★ **路径不进夹具。** 存的是相对同目录的文件名(见 `qwen-request.ts` 文件头)。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 夹具的**格式**版本。与 `TEMPLATE_VERSION`(提示词模板版本)是两件事,别混:
 * 这个变了说明"读数的方式变了",那个变了说明"发出去的措辞变了"。
 * 两者都进键/进记录,因为**任一改变都让旧夹具不再可比**。
 */
export const FIXTURE_FORMAT_VERSION = 1;

export interface EngineFixture {
  formatVersion: number;
  /** 录制时的提示词模板版本。回放时不一致就说明措辞变了,不该命中。 */
  templateVersion: string;
  key: string;
  /** 录制时间。**只作人类排查用,不参与键计算。** */
  createdAt: string;
  request: {
    model: string;
    prompt: string;
    negativePrompt: string;
    parameters: Record<string, unknown>;
    /** 输入图摘要(顺序即请求里的顺序,本人照片在最后)。 */
    inputs: { role: 'reference' | 'face'; sha256: string; bytes: number }[];
  };
  response: {
    requestId?: string;
    /** 与 json 同目录的成品图文件名。 */
    imageFile: string;
    mimeType: string;
    bytes: number;
  };
}

const jsonPathOf = (dir: string, key: string): string => path.join(dir, `${key}.json`);

/** 成品图在夹具目录里的落点。`ext` 由响应类型决定,缺省 png(接口返回 PNG URL)。 */
export const imagePathOf = (dir: string, key: string, ext = '.png'): string =>
  path.join(dir, `${key}${ext}`);

export function readFixture(dir: string, key: string): EngineFixture | null {
  const file = jsonPathOf(dir, key);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as EngineFixture;
    // 格式版本对不上就当"没有这份夹具":宁可显式未命中,也不要按旧格式读出半个对象。
    if (parsed.formatVersion !== FIXTURE_FORMAT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeFixture(dir: string, fixture: EngineFixture): string {
  mkdirSync(dir, { recursive: true });
  const file = jsonPathOf(dir, fixture.key);
  writeFileSync(file, JSON.stringify(fixture, null, 2));
  return file;
}
