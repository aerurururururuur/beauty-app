/**
 * test/multipart-upload.test.ts —— ★ **上传的回归测试**(✏️ 2026-09-16 新建)。
 *
 * ── 它为什么存在 ─────────────────────────────────────────────────────────────
 *
 * 在它之前,`test/` 里**没有任何一条 HTTP 层的上传用例**。两个 multipart 解析器
 * (`agent/presentation/multipart.ts`、`jobs/presentation/multipart.ts`)都只在
 * 用例层被间接碰过,而那两条路走的是**假的上传流**(`test/helpers/fakes.ts` 造的),
 * 真正的 busboy 一次都没进过测试。
 *
 * 于是这个 bug 活了下来:**文件读不完 ⇒ 请求永远挂着**(不报错、不完成、半截文件都不写)。
 * 规矩是 busboy 的——**上一个 part 的流没被消费,它就不解析下一个**,
 * 而两个解析器原来都是"循环里只登记流、出了循环才读"。真实照片没有小于 16 KB 的,
 * 所以这等于**上传整个不可用**。
 *
 * ★ **两处实测的阈值不一样,都要知道**(它们指向同一条规矩,别以为只有大文件才中):
 *   · **真 socket(curl → 真服务)**:1024 / 8192 / 12000 字节过,**16384 起挂** ——
 *     因为 ≤16 KB 时流内部的缓冲装得下,出循环再读恰好也读得完;
 *   · **`app.inject` 上更严**:同样的旧代码,**1 KB 的 part 也会挂**
 *     (这条用例里的小夹具用例在修之前就是超时的)。
 *   所以下面那两条小夹具用例**也是回归的一部分**,别当成"顺手加的"。
 *
 * ── ⚠️ 两条夹具纪律,改这个文件时别弄丢 ──────────────────────────────────────
 *
 * 1. ★★ **大文件那条必须真的够大(这里是 64 KB)。** 它钉的是真机上那条阈值:
 *    换成 1 KB,即使只做真 socket 的验证也会漏掉"16 KB 以上全挂"这件事。**这条用例的全部价值就在那个尺寸上。**
 * 2. ⚠️ **这里验的是解析器这一层,不是整个应用。** 起的是一个小 Fastify +
 *    真 `@fastify/multipart`,挂两条只调解析器的路由——bug 就在解析器里,
 *    而把 `buildApp` 的十几个端口全接上对这条断言没有任何增益。
 *    (用 `app.inject` 就够:实测它**能**复现这个挂起,不需要真开端口。)
 */
import { Buffer } from 'node:buffer';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { parsePhotoRequest } from '../src/modules/agent/presentation/multipart.js';
import { parseJobParts } from '../src/modules/jobs/presentation/multipart.js';
import type { Readable } from 'node:stream';

/** 两条用例共用的边界串。★ 手工拼 multipart 体,不引任何依赖(同本仓的"不加新 zip"那条规矩)。 */
const BOUNDARY = 'X-BEAUTY-BOUNDARY';

interface Part {
  name: string;
  /** 标量字段的值。与 `bytes` 二选一。 */
  value?: string;
  filename?: string;
  bytes?: Buffer;
}

/** 拼一个合法的 multipart/form-data 体。 */
function multipartBody(parts: Part[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition =
      part.bytes === undefined
        ? `Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value ?? ''}`
        : `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename ?? part.name}"\r\n` +
          `Content-Type: image/png\r\n\r\n`;
    chunks.push(Buffer.from(`--${BOUNDARY}\r\n${disposition}`));
    if (part.bytes !== undefined) chunks.push(part.bytes);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

/** 把流读干并返回字节(顺带验证"这份数据真的还在、也真的读得完")。 */
async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

/** 每个字节都不同 ⇒ 长度对了而内容错了也能被抓到。 */
function pattern(size: number): Buffer {
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i += 1) buf[i] = i % 251;
  return buf;
}

/** ★ 大夹具:64 KB,刻意超过流内部缓冲的 16 KB(见文件头纪律 1)。 */
const BIG = 64 * 1024;
/** 小夹具:16 KB 以内,用来钉住"别把小文件改坏"。 */
const SMALL = 1024;

function makeApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 12, fields: 8 } });

  // 两条路由都**只做一件事**:调解析器,然后把解析器交出来的流读干。
  // ⚠️ 读的动作写在这里(而不是解析器里),正是为了复现"出了循环才读"这个真实形状。
  app.post('/photo', async (request) => {
    const parsed = await parsePhotoRequest(request);
    return {
      userId: parsed.userId,
      unknownFields: parsed.unknownFields,
      file: parsed.file
        ? {
            originalName: parsed.file.originalName,
            mimeType: parsed.file.mimeType,
            bytes: (await drain(parsed.file.stream)).length,
          }
        : null,
    };
  });

  app.post('/jobs', async (request) => {
    const parsed = await parseJobParts(request);
    const shape = async (files: { originalName: string; mimeType: string; stream: Readable }[]) =>
      Promise.all(
        files.map(async (f) => ({
          originalName: f.originalName,
          mimeType: f.mimeType,
          bytes: (await drain(f.stream)).length,
        })),
      );
    return {
      metaRaw: parsed.metaRaw,
      unknownFields: parsed.unknownFields,
      face: await shape(parsed.faceFiles),
      scene: await shape(parsed.sceneFiles),
    };
  });

  return app;
}

function post(app: FastifyInstance, url: string, parts: Part[]) {
  return app.inject({
    method: 'POST',
    url,
    payload: multipartBody(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  });
}

describe('parsePhotoRequest —— 大文件不能在出循环之后才读', () => {
  it('★ 64 KB 的照片能读完,一个字节都不少(挂住的话这条会超时)', async () => {
    const app = makeApp();
    const body = pattern(BIG);
    const res = await post(app, '/photo', [
      { name: 'face', filename: 'face.png', bytes: body },
      { name: 'userId', value: 'u-1' },
    ]);
    await app.close();

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.file.bytes).toBe(BIG);
    expect(json.userId).toBe('u-1');
    expect(json.unknownFields).toEqual([]);
  });

  it('★ 内容也要对得上,不只是长度对(读的是同一份字节)', async () => {
    const app = makeApp();
    const body = pattern(BIG);
    // 换个写法:直接照解析器交出来的流比字节。
    app.post('/raw', async (request) => {
      const parsed = await parsePhotoRequest(request);
      if (!parsed.file) return { same: false };
      const got = await drain(parsed.file.stream);
      return { same: got.equals(body), received: got.length };
    });
    const res = await post(app, '/raw', [{ name: 'face', filename: 'face.png', bytes: body }]);
    await app.close();

    expect(res.json()).toEqual({ same: true, received: BIG });
  });

  it('小文件照旧(1 KB;别为了修大的把小的改坏)', async () => {
    const app = makeApp();
    const res = await post(app, '/photo', [
      { name: 'face', filename: 'face.png', bytes: pattern(SMALL) },
      { name: 'userId', value: 'u-2' },
    ]);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().file.bytes).toBe(SMALL);
  });

  it('认不出的字段名:登记下来,而且那个大流也要放掉(否则后面读不到)', async () => {
    const app = makeApp();
    const res = await post(app, '/photo', [
      { name: 'face', filename: 'face.png', bytes: pattern(BIG) },
      { name: 'nope', filename: 'x.png', bytes: pattern(BIG) },
      { name: 'userId', value: 'u-3' },
    ]);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().unknownFields).toEqual(['nope']);
    expect(res.json().file.bytes).toBe(BIG);
  });

  it('没带文件:交给校验器去说人话,解析器不抢着抛', async () => {
    const app = makeApp();
    const res = await post(app, '/photo', [{ name: 'userId', value: 'u-4' }]);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().file).toBe(null);
    expect(res.json().userId).toBe('u-4');
  });

  it('客户端没带 Content-Type:按扩展名推断成 image/png(那张小表就是为这条路留的)', async () => {
    const app = makeApp();
    // 手工拼一个不带 Content-Type 的 part。
    // ⚠️ busboy 在这种情形下会把类型填成 `text/plain`(RFC 7578 的缺省),
    //    所以走的是"声明不是 image/* ⇒ 查扩展名"那一支 —— 这正是推断存在的理由。
    const payload = Buffer.concat([
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="face"; filename="face.png"\r\n\r\n`,
      ),
      pattern(SMALL),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]);
    const res = await app.inject({
      method: 'POST',
      url: '/photo',
      payload,
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().file.mimeType).toBe('image/png');
    expect(res.json().file.bytes).toBe(SMALL);
  });
});

describe('parseJobParts —— 同一个毛病,同一个改法', () => {
  it('★ 64 KB 的本人照 + 64 KB 的氛围参考,两张都读得完', async () => {
    const app = makeApp();
    const face = pattern(BIG);
    const scene = pattern(BIG);
    const res = await post(app, '/jobs', [
      { name: 'face', filename: 'face.png', bytes: face },
      { name: 'scene', filename: 'scene.png', bytes: scene },
      { name: 'meta', value: JSON.stringify({ sceneText: '面试' }) },
    ]);
    await app.close();

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.face).toEqual([{ originalName: 'face.png', mimeType: 'image/png', bytes: BIG }]);
    expect(json.scene).toEqual([{ originalName: 'scene.png', mimeType: 'image/png', bytes: BIG }]);
    expect(json.metaRaw).toBe(JSON.stringify({ sceneText: '面试' }));
    expect(json.unknownFields).toEqual([]);
  });

  it('小文件照旧(1 KB)', async () => {
    const app = makeApp();
    const res = await post(app, '/jobs', [
      { name: 'face', filename: 'face.png', bytes: pattern(SMALL) },
      { name: 'meta', value: '{}' },
    ]);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().face[0].bytes).toBe(SMALL);
  });

  it('没带 meta:metaRaw 缺省,不是空串(调用方按"没给"处理)', async () => {
    const app = makeApp();
    const res = await post(app, '/jobs', [{ name: 'face', filename: 'face.png', bytes: pattern(SMALL) }]);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.json().metaRaw).toBeUndefined();
  });
});
