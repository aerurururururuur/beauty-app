/**
 * test/analysis.test.ts —— ★ **用户点触发读图**(✏️ 2026-09-29 新建)。
 *
 * 三条口一起测:两个新适配器之外的全部链路 —— 提示词、校验、用例、路由注册。
 * 全部**不联网、不花钱**:多模态客户端是 `FakeVisionClient`(按队列回话),
 * 分析器在用例层是 `FakeAnalyzers`(只记调用)。
 *
 * ★ 这一组里最重要的是四条,它们各自盯着一种"看起来成功了"的失败:
 *   ① **越界一律抛错** —— 模型回 `light`(不在 8 档里)时"就近映射"到某一档,
 *      就是本仓头号 bug 的形状:200、日志干净、肤色悄悄是错的,还一路流进提示词;
 *   ② **「用户填的优先」要断言的是一次都没调**(不是"调了但没用")—— 反过来的话
 *      用户每点一次就白花一次钱,而结果一定被丢弃;
 *   ③ **`VISION_ANALYZER=off` ⇒ 两条路由 404**,不是"注册了但什么都不发生";
 *   ④ **`app.ts` 那一行转发** —— 漏了它,配了 `real`、启动日志也照打"已启用",
 *      而两条口根本没挂上。这条只有走到 `buildApp` 才验得到,所以下面有一组 HTTP 用例。
 *
 * ⚠️ 它**管不了**的那一半照仓库惯例写在这里:真实多模态端点的请求形状与回复长相
 * 全靠 `npm run probe:vision` 实测,本轮**没跑过**(见 plan 的第 5 条)。
 * **单测全绿不等于这条路已经验过。**
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createAssetsModule } from '../src/modules/assets/index.js';
import { createSessionArtifacts } from '../src/session-artifacts.js';
import { buildApp } from '../src/app.js';
import {
  DEPTHS,
  FINISHES,
  FACE_PROMPT,
  FaceAnalyzer,
  SATURATIONS,
  SCENE_PROMPT,
  STYLE_PROMPT,
  SceneAnalyzer,
  StyleAnalyzer,
  TONE_KEYS,
  createMakeupModule,
} from '../src/modules/makeup/index.js';
import type { Analyzers, Engine, StyleRead } from '../src/modules/makeup/index.js';
import {
  ANALYZE_CASES,
  AttachImage,
  AnalyzeImage,
  InMemorySessionStore,
  addAnalysis,
  createSession,
  setFaceRef,
  setImageRef,
  validateAnalysesRequest,
  validateAnalysisKind,
  validateImageKindField,
  createAgentModule,
  toSessionView,
} from '../src/modules/agent/index.js';
import type { PhotoUpload, SessionArtifacts } from '../src/modules/agent/index.js';
import { ErrorCode, OCCASIONS, SKIN_TONES } from '../src/modules/shared/index.js';
// ★ 深路径:组装层的配置不进 `shared` 的 barrel(同 `test/config.test.ts`)。
import { loadConfig } from '../src/modules/shared/infrastructure/config.js';
import { createCabinetModule } from '../src/modules/cabinet/index.js';
import { createProductsModule } from '../src/modules/products/index.js';
import { createUserModule } from '../src/modules/user/index.js';
import { createWeatherModule } from '../src/modules/weather/index.js';
import { FakeAnalyzers, FakeVisionClient, fakeLooksModule } from './helpers/fakes.js';
import { MockLlm } from './helpers/mock-llm.js';
import { MockWeatherProvider } from './helpers/mock-weather-provider.js';
import { MockEngine } from './helpers/mock-engine.js';

/** 一张"图"。★ 只验路径的流转,内容随便 —— 这一层谁都不读图。 */
const IMG = { filePath: '/tmp/x/face.png', mimeType: 'image/png' };

const FACE_REF = { storeKey: 'inputs/s1/face/f.png', mimeType: 'image/png' };

const upload = (name = 'ref.png'): PhotoUpload => ({
  originalName: name,
  mimeType: 'image/png',
  stream: Readable.from([`bytes-of-${name}`]),
});

// ── 每个用例一个临时数据目录 ─────────────────────────────────────────────────

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'analysis-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * 用例层的夹具:真文件系统上的 `SessionArtifacts`(不是假存储)+ 假分析器。
 * ★ 用真存储是刻意的:两个新方法(`putImage` / `resolveImage`)的落点
 *   (`inputs/<id>/<kind>/`)正是 TTL 清理靠的东西,假存储验不到它。
 */
function usecaseFixture() {
  const dir = tempDir();
  const { artifactStore } = createAssetsModule({ dataDir: dir });
  const artifacts: SessionArtifacts = createSessionArtifacts(artifactStore, {
    engineOutDir: path.join(dir, 'engine-out'),
  });
  const sessions = new InMemorySessionStore();
  const analyzers = new FakeAnalyzers();
  return {
    dir,
    artifacts,
    sessions,
    analyzers,
    attach: new AttachImage({ sessions, artifacts }),
    analyze: new AnalyzeImage({ sessions, artifacts, analyzers }),
  };
}

// ── ① 三个适配器 ─────────────────────────────────────────────────────────────

describe('三个适配器 —— 越界当场抛错,绝不"就近映射"', () => {
  it('★ face:回一个不在 8 档里的词 ⇒ 抛错,不映射到任何一档', async () => {
    // `light` 是 vue/AGENTS.md 里那套**错的**5 档词表里的一个,正好是真实的踩法。
    const face = new FaceAnalyzer(new FakeVisionClient('{"skinTone":"light"}'));
    await expect(face.read({ image: IMG })).rejects.toThrow(/肤色/);
  });

  it('★ face:unknown 是失败通道,不是一种肤色', async () => {
    const face = new FaceAnalyzer(new FakeVisionClient('{"skinTone":"unknown"}'));
    await expect(face.read({ image: IMG })).rejects.toThrow(/没读出可信的肤色/);
  });

  it('face:合法档位原样交回', async () => {
    const face = new FaceAnalyzer(new FakeVisionClient('{"skinTone":"deep_brown"}'));
    expect(await face.read({ image: IMG })).toEqual({ skinTone: 'deep_brown' });
  });

  it('face:``` 围栏里的 JSON 也认(容错,不是规则)', async () => {
    const face = new FaceAnalyzer(new FakeVisionClient('```json\n{"skinTone":"olive"}\n```'));
    expect(await face.read({ image: IMG })).toEqual({ skinTone: 'olive' });
  });

  it('★ face:回复里夹着别的话 ⇒ 抛错(宁可不猜)', async () => {
    const face = new FaceAnalyzer(new FakeVisionClient('照片里的人是 warm_ivory 大概'));
    await expect(face.read({ image: IMG })).rejects.toThrow(/不是合法 JSON/);
  });

  it('scene:一句话原样交回(**不做归类**)', async () => {
    const scene = new SceneAnalyzer(
      new FakeVisionClient('{"scene":"办公室冷白光,白天,正式度中等"}'),
    );
    expect(await scene.read({ image: IMG })).toEqual({
      sceneNote: '办公室冷白光,白天,正式度中等',
    });
  });

  it('★ scene:模型回旧版字段名(`occasion`)⇒ 抛错,不许当"没读到"放过', async () => {
    // 形状是 `.strict()` 的,而字段名就是那次改动的**全部区别** —— 放过去的话,
    // 这条读数会静默变成空,而界面上只看到"分析成功、什么都没变"(假开关)。
    const scene = new SceneAnalyzer(new FakeVisionClient('{"occasion":"stage"}'));
    await expect(scene.read({ image: IMG })).rejects.toThrow(/场合/);
  });

  it('★ scene:失败通道与空串都拦在这里', async () => {
    const unknown = new SceneAnalyzer(new FakeVisionClient('{"scene":"unknown"}'));
    await expect(unknown.read({ image: IMG })).rejects.toThrow(/场合/);

    // 空串:形状层是宽 string,拦它的是 validator(同"取值规则不在 schema 里"的分工)。
    const blank = new SceneAnalyzer(new FakeVisionClient('{"scene":"   "}'));
    await expect(blank.read({ image: IMG })).rejects.toThrow(/场合/);
  });

  it('★ style:色号不在闭集里 ⇒ 抛错', async () => {
    const style = new StyleAnalyzer(
      new FakeVisionClient(
        '{"base":{"coverage":3,"finish":"satin","warmth":0},' +
          '"zones":{"lip":{"tone":"血橙色","depth":"medium","saturation":"medium","finish":"matte","intensity":3},' +
          '"cheek":{"tone":"coral","depth":"medium","saturation":"medium","finish":"satin","intensity":2},' +
          '"eyeshadow":{"tone":"nude","depth":"medium","saturation":"medium","finish":"satin","intensity":2}}}',
      ),
    );
    // 报的是**哪一格**越界(不是笼统的"读图失败"),否则排查时不知道该改提示词还是改图。
    await expect(style.read({ image: IMG })).rejects.toThrow(/zones\.lip\.tone/);
  });

  it('★ style:{"unknown":true} ⇒ 抛错,不落一份空读数', async () => {
    const style = new StyleAnalyzer(new FakeVisionClient('{"unknown":true}'));
    await expect(style.read({ image: IMG })).rejects.toThrow(/没能提炼出可信的风格/);
  });

  it('style:合法读数交回一个 StyleRead(不是一段话)', async () => {
    const style = new StyleAnalyzer(
      new FakeVisionClient(
        '{"base":{"coverage":3,"finish":"satin","warmth":-1},' +
          '"zones":{"lip":{"tone":"rose","depth":"light","saturation":"low","finish":"matte","intensity":3},' +
          '"cheek":{"tone":"coral","depth":"medium","saturation":"medium","finish":"satin","intensity":2},' +
          '"eyeshadow":{"tone":"nude","depth":"medium","saturation":"medium","finish":"matte","intensity":2}}}',
      ),
    );
    const read: StyleRead = await style.read({ image: IMG });
    expect(read.base.warmth).toBe(-1);
    expect(read.zones.lip.tone).toBe('rose');
    // ★ 深浅 / 饱和也要真的落进读数 —— 漏了它们,读图那一轮就会拿到一份没有这两格的参考。
    expect(read.zones.lip.depth).toBe('light');
    expect(read.zones.lip.saturation).toBe('low');
  });

  it('★ 问出去的时候带上了那张图,提示词就是那个常量', async () => {
    const client = new FakeVisionClient('{"skinTone":"olive"}');
    await new FaceAnalyzer(client).read({ image: IMG });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.images).toEqual([IMG]);
    expect(client.calls[0]?.prompt).toBe(FACE_PROMPT);
  });
});

// ── ② 提示词里的枚举与元组不许漂 ─────────────────────────────────────────────

/** 抠出标记之后那串「A / B / C」。精确相等 ⇒ 多一个少一个都算漂。 */
function listedAfter(prompt: string, marker: string): string[] {
  const out: string[] = [];
  for (const line of prompt.split('\n')) {
    const at = line.indexOf(marker);
    if (at < 0) continue;
    out.push(
      ...line
        .slice(at + marker.length)
        .split('/')
        .map((t) => t.trim())
        .filter(Boolean),
    );
  }
  return out;
}

describe('提示词漂移 —— 枚举 token 与元组逐项一致', () => {
  it(`face 列全那 ${SKIN_TONES.length} 档(多一个少一个都失败)`, () => {
    expect(listedAfter(FACE_PROMPT, '不要改):')).toEqual([...SKIN_TONES]);
  });

  /**
   * ★★ **scene 是唯一一个"不列取值"的提示词**,这是刻意离开上面那条纪律的
   *   (2026-09-30,理由见 `validateSceneReading` 的文件头)。
   *
   *   此前它列全 8 档、模型只能从中挑一个 —— 那是**归类**,而想归类就得把用户
   *   表外的说法硬塞进最近的一格。现在读的是图上真有的东西(灯光 / 正式程度 / 氛围),
   *   没有清单可列,所以这条断言反过来:**列了才算漂**。
   */
  it('★ scene 提示词**不再**列出 8 档场合(读图是"读出",不是"归类")', () => {
    for (const occasion of OCCASIONS) {
      expect(SCENE_PROMPT, `提示词里又出现了场合枚举「${occasion}」`).not.toContain(
        ` ${occasion} /`,
      );
    }
    // 换成一句话的要求,失败通道也换了字段名。
    expect(SCENE_PROMPT).toContain('"scene"');
    expect(SCENE_PROMPT).not.toContain('"occasion"');
  });

  it('style 列全色相、深浅、饱和与质地', () => {
    expect(listedAfter(STYLE_PROMPT, '之一:').sort()).toEqual(
      [...TONE_KEYS, ...DEPTHS, ...SATURATIONS, ...FINISHES].sort(),
    );
  });

  it('★ 三个提示词都给了显式的失败通道(`unknown`)', () => {
    expect(FACE_PROMPT).toContain('"skinTone":"unknown"');
    expect(SCENE_PROMPT).toContain('"scene":"unknown"');
    expect(STYLE_PROMPT).toContain('{"unknown": true}');
  });

  it('ANALYZE_CASES 就是三个分析器的 case', () => {
    expect([...ANALYZE_CASES].sort()).toEqual(['face', 'scene', 'style']);
  });

  it('★ 收图口的 kind 只认参考图两种 —— 本人照片不走这条', () => {
    expect(validateImageKindField('style')).toBe('style');
    expect(validateImageKindField('scene')).toBe('scene');
    expect(() => validateImageKindField('face')).toThrow(/kind/);
  });

  it('★ 分析口的 kind 越界 ⇒ 抛错并列出合法取值,不兜到缺省上', () => {
    expect(validateAnalysisKind('face')).toBe('face');
    const boom = (): void => void validateAnalysisKind('skin');
    expect(boom).toThrow(/face \/ scene \/ style/);
  });

  it('分析请求:kind 缺失/空白都拦在这里', () => {
    expect(() => validateAnalysesRequest({ userId: 'u1' })).toThrow(/kind/);
    expect(() => validateAnalysesRequest({ userId: 'u1', kind: '  ' })).toThrow(/kind/);
    expect(validateAnalysesRequest({ userId: ' u1 ', kind: 'style' })).toEqual({
      userId: 'u1',
      kind: 'style',
    });
  });
});

// ── ③ 用例层 ─────────────────────────────────────────────────────────────────

describe('AnalyzeImage —— 花钱之前先把不该花的挡住', () => {
  it('★ 用户已填肤色 ⇒ 回 would_overwrite,而且**一次都没调**(没花钱)', async () => {
    const fx = usecaseFixture();
    const session = createSession('s1', 'u1', { skinTone: 'olive' });
    await fx.sessions.create(setFaceRef(session, FACE_REF));

    const out = await fx.analyze.execute('s1', 'u1', 'face');

    expect(out.status).toBe('would_overwrite');
    expect(out.notice).toContain('不会覆盖');
    expect(fx.analyzers.calls).toEqual([]);
    // 会话也一个字节没动:没记账(那次点击不算数)。
    expect((await fx.sessions.find('s1'))?.analyses).toHaveLength(0);
  });

  /**
   * ★★ **同一句话,两个读者(2026-09-30)。** 事后(`AnalyzeOutcome.notice`)与提前
   * (`cases[].notice`,结果页那颗置灰按钮上的说明)必须**逐字**同句。
   * ⚠️ 钉的不是"两处都有话说"(抄成两份也过),是**说的是同一句**。
   */
  it('★★ 置灰按钮上那句说明 = 点下去之后那句 notice(逐字,不是"意思差不多")', async () => {
    const fx = usecaseFixture();
    const session = createSession('s1', 'u1', { skinTone: 'olive' });
    await fx.sessions.create(setFaceRef(session, FACE_REF));

    const out = await fx.analyze.execute('s1', 'u1', 'face');
    const view = toSessionView(out.session, { hasAnalysis: true });
    const face = view.analysisOffer?.cases.find((c) => c.kind === 'face');

    expect(face?.wouldOverwrite).toBe(true);
    expect(face?.notice).toBe(out.notice);
    // 空串也能"逐字相等",所以还得说一句它真有内容。
    expect(face?.notice).toContain('不会覆盖');
  });

  /**
   * 反过来的一半:`wouldOverwrite` 为假时**不许**带 `notice`。
   * ★ 否则能点的按钮上挂着一句"你已经填过了"——那句话从别的状态漏过来的,界面上看不出。
   */
  it('不需要覆盖的 case 不带 notice(别把上一状态那句话漏给能点的按钮)', () => {
    const session = createSession('s1', 'u1', { skinTone: 'olive' });
    const view = toSessionView(setFaceRef(session, FACE_REF), { hasAnalysis: true });
    const scene = view.analysisOffer?.cases.find((c) => c.kind === 'scene');

    expect(scene?.wouldOverwrite).toBe(false);
    expect(scene && 'notice' in scene).toBe(false);
  });

  /**
   * ★★ **死锁的回归钉子(2026-09-30)。**
   *
   * `analysisWouldOverwrite` 曾对 `scene` 判 `brief.occasion !== undefined`,而表单
   * **无条件**写那一格 ⇒ 从 `/form` 来的会话恒为真:图传上去、点分析、一次模型都不调,
   * 直接回「你已经填过场合了」。界面上一切正常,只有结果是错的(「假开关」)。
   *
   * ⚠️ **必须**带"用户已经填了场合"这个前提跑:不带就和上面那条「没有那张图」没区别,
   *   而那正是当初漏掉这个 bug 的原因。
   */
  it('★★ 已填场合 + 有场景图 ⇒ 照常 analyzed(不再是"你已经填过场合了")', async () => {
    const fx = usecaseFixture();
    fx.analyzers.sceneNote = '办公室冷白光,白天,正式度中等';
    const session = createSession('s1', 'u1', { occasion: 'interview' });
    await fx.sessions.create(setImageRef(session, 'scene', FACE_REF));

    const out = await fx.analyze.execute('s1', 'u1', 'scene');

    expect(out.status).toBe('analyzed');
    expect(fx.analyzers.calls).toEqual(['scene']);
    // ★ 两个格子**各归各**:读数进 `sceneNote`,用户填的场合一个字节不动。
    expect(out.session.brief.sceneNote).toBe('办公室冷白光,白天,正式度中等');
    expect(out.session.brief.occasion).toBe('interview');
  });

  it('场景图**不会**盖掉用户填的场合(反过来也不成立:那是两个格子)', async () => {
    const fx = usecaseFixture();
    fx.analyzers.sceneNote = '暗场生日会,暖黄灯光';
    await fx.sessions.create(setImageRef(createSession('s1', 'u1', { occasion: '朋友的婚礼' }), 'scene', FACE_REF));

    const out = await fx.analyze.execute('s1', 'u1', 'scene');

    // 表外的场合原样留着 —— 读图**不归类**,所以它不可能把「朋友的婚礼」换成别的词。
    expect(out.session.brief.occasion).toBe('朋友的婚礼');
    expect(out.session.brief.sceneNote).toBe('暗场生日会,暖黄灯光');
  });

  it('归属不符 / 不存在 ⇒ 同一个 SESSION_NOT_FOUND(不外泄存在性)', async () => {
    const fx = usecaseFixture();
    await fx.sessions.create(setFaceRef(createSession('s1', 'u1', {}), FACE_REF));

    await expect(fx.analyze.execute('s1', '别人', 'face')).rejects.toMatchObject({
      code: ErrorCode.SESSION_NOT_FOUND,
    });
    await expect(fx.analyze.execute('不存在', 'u1', 'face')).rejects.toMatchObject({
      code: ErrorCode.SESSION_NOT_FOUND,
    });
  });

  it('★ 没有那张图 ⇒ 422 且点名要哪一张,分析器一次都没调', async () => {
    const fx = usecaseFixture();
    await fx.sessions.create(createSession('s1', 'u1', {}));

    await expect(fx.analyze.execute('s1', 'u1', 'face')).rejects.toThrow(/还没有你的照片/);
    await expect(fx.analyze.execute('s1', 'u1', 'style')).rejects.toThrow(/风格参考图/);
    await expect(fx.analyze.execute('s1', 'u1', 'scene')).rejects.toThrow(/场景图/);
    expect(fx.analyzers.calls).toEqual([]);
  });

  // ✏️ 2026-09-29:配额(`AGENT_MAX_ANALYSES`)删掉了 —— 所以原来那条
  //   「第 4 次被拒」的测试连着它一起没了。★ 但**账还记**(`addAnalysis` 留下),
  //   下面这条钉的正是这个:额度没了 ≠ 记账没了。
  it('★ 没有配额 —— 已经记过 3 次,第 4 次照样跑,并且账记到第 4 条', async () => {
    const fx = usecaseFixture();
    // ★ 简报留空(种记录不走 `patchBrief`),否则第 4 次会撞「用户填的优先」那扇门,
    //   就分不清"因为没配额所以放行"和"因为不会覆盖所以放行"了。
    const base = setFaceRef(createSession('s1', 'u1', {}), FACE_REF);
    await fx.sessions.create(addAnalysis(addAnalysis(addAnalysis(base, 'face'), 'face'), 'face'));

    const out = await fx.analyze.execute('s1', 'u1', 'face');

    expect(out.status).toBe('analyzed');
    expect(out.session.analyses).toHaveLength(4);
    expect(fx.analyzers.calls).toEqual(['face']);
  });

  it('★ 分析器抛错 ⇒ **照样记账**(记账在花钱之前),简报没被写脏', async () => {
    const fx = usecaseFixture();
    fx.analyzers.failWith = new Error('端点 500');
    await fx.sessions.create(setFaceRef(createSession('s1', 'u1', {}), FACE_REF));

    await expect(fx.analyze.execute('s1', 'u1', 'face')).rejects.toThrow(/端点 500/);
    const after = await fx.sessions.find('s1');
    expect(after?.analyses).toHaveLength(1);
    expect(after?.brief.skinTone).toBeUndefined();
  });

  it('face 成功 ⇒ 落进 brief.skinTone,并把**本机路径**交给分析器', async () => {
    const fx = usecaseFixture();
    fx.analyzers.skinTone = 'warm_beige';
    await fx.sessions.create(setFaceRef(createSession('s1', 'u1', {}), FACE_REF));

    const out = await fx.analyze.execute('s1', 'u1', 'face');

    expect(out.status).toBe('analyzed');
    expect(out.session.brief.skinTone).toBe('warm_beige');
    expect(out.session.analyses).toHaveLength(1);
    // ★ 交给分析器的是解析出来的绝对路径,不是 `storeKey`。
    expect(fx.analyzers.images[0]?.filePath).toContain(path.join('inputs', 's1', 'face'));
  });

  it('★ style 成功 ⇒ 落进 styleRead,并**追加一条模型看得见**的说明', async () => {
    const fx = usecaseFixture();
    await fx.sessions.create(setImageRef(createSession('s1', 'u1', {}), 'style', FACE_REF));

    const out = await fx.analyze.execute('s1', 'u1', 'style');

    expect(out.session.styleRead).toBeDefined();
    const note = out.session.messages.at(-1);
    expect(note?.role).toBe('user');
    // 说明里带着读数的人话(否则模型只知道"有张图",不知道读出了什么)。
    expect(JSON.stringify(note?.content)).toContain('底妆');
  });

  it('scene 成功 ⇒ 落进 brief.sceneNote', async () => {
    const fx = usecaseFixture();
    fx.analyzers.sceneNote = '暗场生日会,暖黄灯光,气氛热闹';
    await fx.sessions.create(setImageRef(createSession('s1', 'u1', {}), 'scene', FACE_REF));

    expect((await fx.analyze.execute('s1', 'u1', 'scene')).session.brief.sceneNote).toBe(
      '暗场生日会,暖黄灯光,气氛热闹',
    );
  });
});

describe('AttachImage —— 收图免费,而且不给模型递话', () => {
  it('★ 落成会话里的 styleRef/sceneRef,但**不追加任何消息**', async () => {
    const fx = usecaseFixture();
    const before = createSession('s1', 'u1', {});
    await fx.sessions.create(before);

    for (const kind of ['style', 'scene'] as const) {
      const next = await fx.attach.execute('s1', 'u1', kind, upload(`${kind}.png`));
      expect(next.messages).toHaveLength(before.messages.length);
    }

    const after = await fx.sessions.find('s1');
    expect(after?.styleRef?.storeKey).toContain('style');
    expect(after?.sceneRef?.storeKey).toContain('scene');
  });

  it('归属不符 ⇒ SESSION_NOT_FOUND,而且**一个字都没落盘**', async () => {
    const fx = usecaseFixture();
    await fx.sessions.create(createSession('s1', 'u1', {}));

    await expect(fx.attach.execute('s1', 'u2', 'style', upload())).rejects.toMatchObject({
      code: ErrorCode.SESSION_NOT_FOUND,
    });
    expect((await fx.sessions.find('s1'))?.styleRef).toBeUndefined();
  });
});

// ── ④ 组合与路由:`off` 必须是"入口不存在" ───────────────────────────────────

describe('createMakeupModule 的读图开关', () => {
  it('off(缺省)⇒ 整个 analyzers 键不出现;引擎是注进来的那一个', () => {
    const engine = new MockEngine();
    const made = createMakeupModule({ engine });
    expect('analyzers' in made).toBe(false);
    expect(made.engine).toBe(engine);
  });

  it('★ real 但没拿到 key ⇒ **启动即失败**(不留到用户点下去那一刻)', () => {
    expect(() =>
      createMakeupModule({
        engine: new MockEngine(),
        analyzerKind: 'real',
        vision: { apiKey: '', baseUrl: 'https://x/v1', model: 'qwen-vl-max' },
      }),
    ).toThrow(/VISION_ANALYZER=real/);
  });

  it('real ⇒ 三个 case 齐了(少一个编译不过,见 Analyzers 那个 mapped type)', () => {
    const made = createMakeupModule({
      engine: new MockEngine(),
      analyzerKind: 'real',
      vision: { apiKey: 'k', baseUrl: 'https://x/v1', model: 'qwen-vl-max' },
    });
    expect(Object.keys(made.analyzers ?? {}).sort()).toEqual(['face', 'scene', 'style']);
  });
});

/** 一个只会在被调用时炸的引擎:这一组里没有任何一条口该走到出图。 */
const stubEngine: Engine = {
  name: 'stub',
  generate: async () => {
    throw new Error('这一组用例不该出图');
  },
};

/**
 * 装一个**真的** `buildApp`(各模块用真 compose,只有分析器与出图引擎是假的)。
 * ★ 为什么费这个劲:④ 里那条「`off` ⇒ 404」与「`app.ts` 真的把 `analysis` 转手了」
 *   都是**装配层**的事,在用例层怎么断言都验不到 —— 而漏掉那一行正是本仓头号 bug。
 */
async function makeApp(withAnalysis: boolean): Promise<FastifyInstance> {
  const dir = tempDir();
  const config = loadConfig({
    DATA_DIR: dir,
    // 指到不存在的目录 = 这个部署没有产品库(合法形态,见 products/compose.ts)。
    PRODUCTS_DIR: path.join(dir, 'no-products'),
  });
  const { artifactStore } = createAssetsModule({ dataDir: config.dataDir });
  const userExists = async (): Promise<boolean> => true;
  const analyzers: Analyzers | undefined = withAnalysis ? new FakeAnalyzers() : undefined;

  const agent = createAgentModule({
    llm: new MockLlm(),
    cosmetics: { listByUser: async () => [] },
    userExists,
    engine: stubEngine,
    artifacts: createSessionArtifacts(artifactStore, { engineOutDir: config.makeupOutDir }),
    // 这一组不碰妆面校验,所以调色盘给空的就够(它只在 propose_look 那一步被读)。
    palette: { toneKeysFor: () => undefined, labelOf: () => undefined },
    // 同上:特征策略卡也只在 propose_look 那一步被读。
    features: { byId: () => undefined },
    // 同上:色值也只在 propose_look 那一步被读。下面 `PRODUCTS_DIR` 指的是不存在的目录,
    // 所以生产里这里拿到的也是一律回空串的那个闭包 —— 这一行与部署形态一致。
    shades: { hexOf: () => '' },
    ...(analyzers ? { analyzers } : {}),
  });

  return buildApp({
    config,
    user: createUserModule({ dataDir: config.dataDir }),
    weather: createWeatherModule({ provider: new MockWeatherProvider() }),
    cabinet: createCabinetModule({ dataDir: config.dataDir, userExists }),
    looks: fakeLooksModule({ dataDir: config.dataDir, userExists }),
    // ★ 走真 compose(与 `src/index.ts` 同一条路),不是塞一个空壳 —— 这条测试
    //   要验的正是**装配层**的事,拿手搓的替身就把要验的那一层换掉了。
    products: createProductsModule({ contentDir: config.productsDir }),
    agent,
  });
}

/** 手工拼一个 multipart 体(同 `multipart-upload.test.ts`,不引依赖)。 */
const BOUNDARY = 'X-ANALYSIS-BOUNDARY';
function multipartBody(parts: { name: string; value?: string; bytes?: Buffer }[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(
      Buffer.from(
        part.bytes === undefined
          ? `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value ?? ''}\r\n`
          : `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.name}.png"\r\n` +
              'Content-Type: image/png\r\n\r\n',
      ),
    );
    if (part.bytes !== undefined) {
      chunks.push(part.bytes, Buffer.from('\r\n'));
    }
  }
  return Buffer.concat([...chunks, Buffer.from(`--${BOUNDARY}--\r\n`)]);
}

const MULTIPART = { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };

describe('HTTP 层 —— `VISION_ANALYZER` 决定入口在不在', () => {
  it('★ off:两条口**404**(不是"注册了但什么都不发生")', async () => {
    const app = await makeApp(false);

    const images = await app.inject({ method: 'POST', url: '/api/agent/sessions/s1/images' });
    const analyses = await app.inject({
      method: 'POST',
      url: '/api/agent/sessions/s1/analyses',
      payload: { userId: 'u1', kind: 'face' },
    });
    expect(images.statusCode).toBe(404);
    expect(analyses.statusCode).toBe(404);

    // ★ 而照片那条口照旧在(404 不是因为整个 agent 没挂上)。
    const photo = await app.inject({ method: 'POST', url: '/api/agent/sessions/s1/photo' });
    expect(photo.statusCode).not.toBe(404);
    await app.close();
  });

  it('★ real:两条口在(缺参是 422,不是 404)', async () => {
    const app = await makeApp(true);

    const analyses = await app.inject({
      method: 'POST',
      url: '/api/agent/sessions/s1/analyses',
      payload: { userId: 'u1' },
    });
    expect(analyses.statusCode).toBe(422);

    const images = await app.inject({ method: 'POST', url: '/api/agent/sessions/s1/images' });
    expect(images.statusCode).not.toBe(404);
    await app.close();
  });

  it('★ 端到端:开会话 → 传本人照片 → 分析 ⇒ 简报里落上肤色', async () => {
    const app = await makeApp(true);
    const started = await app.inject({
      method: 'POST',
      url: '/api/agent/sessions',
      payload: { userId: 'u1' },
    });
    expect(started.statusCode).toBe(201);
    const id = started.json().sessionId as string;

    const photo = await app.inject({
      method: 'POST',
      url: `/api/agent/sessions/${id}/photo`,
      payload: multipartBody([
        { name: 'face', bytes: Buffer.from('fake-photo-bytes') },
        { name: 'userId', value: 'u1' },
      ]),
      headers: MULTIPART,
    });
    expect(photo.statusCode).toBe(200);

    const done = await app.inject({
      method: 'POST',
      url: `/api/agent/sessions/${id}/analyses`,
      payload: { userId: 'u1', kind: 'face' },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json().status).toBe('analyzed');
    expect(done.json().session.brief.skinTone).toBe('warm_ivory');
    await app.close();
  });

  it('★ 端到端:表单已填肤色 ⇒ 200 但是 would_overwrite,而且没花钱', async () => {
    const app = await makeApp(true);
    const started = await app.inject({
      method: 'POST',
      url: '/api/agent/sessions',
      // ★ 简报字段在**入口这一层是平铺的**(`startSessionSchema` 展开 `briefFields`,
      //   校验器再收进 `brief`)。写成 `brief: {…}` 会被 `.strict()` 判成多余字段 ⇒ 422,
      //   而 422 拿到的 `sessionId` 是 undefined,后面那条 URL 会 404 —— 一个很像
      //   "路由没注册"的假象。
      payload: { userId: 'u1', skinTone: 'olive' },
    });
    const id = started.json().sessionId as string;

    const done = await app.inject({
      method: 'POST',
      url: `/api/agent/sessions/${id}/analyses`,
      payload: { userId: 'u1', kind: 'face' },
    });

    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ status: 'would_overwrite' });
    expect(done.json().notice).toContain('不会覆盖');
    // ★ 简报原样(还是用户填的那一档)。
    expect(done.json().session.brief.skinTone).toBe('olive');
    await app.close();
  });

  it('★ 端到端:收一张风格图 ⇒ 会话上多了 styleRef', async () => {
    const app = await makeApp(true);
    const started = await app.inject({
      method: 'POST',
      url: '/api/agent/sessions',
      payload: { userId: 'u1' },
    });
    const id = started.json().sessionId as string;

    const res = await app.inject({
      method: 'POST',
      url: `/api/agent/sessions/${id}/images`,
      payload: multipartBody([
        { name: 'file', bytes: Buffer.from('fake-style-image') },
        { name: 'userId', value: 'u1' },
        { name: 'kind', value: 'style' },
      ]),
      headers: MULTIPART,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().hasStyleRef).toBe(true);
    // ★ 收图**不给模型递话**(见 `attach-image.ts` 文件头),但分析那块里这一格
    //   从"没有图"变成"有图" —— 前端据此才知道可以摆按钮了。
    expect(started.json().analysisOffer.cases).toContainEqual({
      kind: 'style',
      hasImage: false,
      wouldOverwrite: false,
    });
    expect(res.json().analysisOffer.cases).toContainEqual({
      kind: 'style',
      hasImage: true,
      wouldOverwrite: false,
    });
    await app.close();
  });

  it('★ 收图口传 kind=face ⇒ 422(本人照片不走这条)', async () => {
    const app = await makeApp(true);
    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/sessions/s1/images',
      payload: multipartBody([
        { name: 'file', bytes: Buffer.from('x') },
        { name: 'userId', value: 'u1' },
        { name: 'kind', value: 'face' },
      ]),
      headers: MULTIPART,
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
