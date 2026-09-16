/**
 * infrastructure/engine/replay-engine.ts —— 夹具回放引擎(§5.4)。**CI 用,零成本零网络。**
 *
 * 它是 `Engine` 端口的第三个实现,而**端口同样一个字节没改**——
 * 这正是 `domain/ports/engine.ts` 存在的意义:回放引擎对流水线、对 agent 都不可见。
 *
 * ★ **未命中要显式炸,不许静默给个假图。**
 *   静默返回一张"看起来跑通了"的图,比报错危险得多:CI 会全绿,
 *   而实际上**这段代码从来没有被真正验证过**。所以未命中一律抛错,
 *   并把"该录什么"一并写进错误里(prompt + 键),让下一次录制是照着做的。
 *
 * ★ **命中不等于"这个请求是对的"。** 它只证明"这次组装与录制时逐位相同"。
 *   夹具全绿而线上翻车是完全可能的(平台方改了模型行为)——§12.1 的实测打分不能省。
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { AppError, ErrorCode } from '../../../shared/index.js';
import { describeLook } from '../../application/look-description.js';
import type { Look } from '../../domain/entities/look.js';
import type { Engine, EngineInput, EngineResult } from '../../domain/ports/engine.js';
import { readFixture } from './engine-fixtures.js';
import { TEMPLATE_VERSION } from './prompt-builder.js';
import { buildGenerateRequest, fixtureKeyOf } from './qwen-request.js';

export interface ReplayEngineOptions {
  /** 夹具目录(内含 `<key>.json` 与同名成品图)。 */
  fixturesDir: string;
  /** 回放出的图落到哪里。 */
  outputDir: string;
  /** 键计算需要的模型名。**必须与录制时一致**,否则永远未命中。 */
  model: string;
}

/**
 * 占位主机名。回放**不发请求**,`url` 只是 `buildGenerateRequest` 的产物之一。
 * 用一个明显的假域名而不是空串,免得排查时有人以为它真会去连。
 */
const REPLAY_API_HOST = 'https://replay.invalid';

export class ReplayEngine implements Engine {
  readonly name = 'replay';

  constructor(private readonly opts: ReplayEngineOptions) {}

  async generate(input: EngineInput): Promise<EngineResult> {
    const req = buildGenerateRequest(input, {
      apiHost: REPLAY_API_HOST,
      model: this.opts.model,
    });
    const key = fixtureKeyOf(req);

    const fixture = readFixture(this.opts.fixturesDir, key);
    if (!fixture) {
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        [
          `未录制的请求(夹具键 ${key})。`,
          `夹具目录:${this.opts.fixturesDir}`,
          `要录这一条:设 MAKEUP_ENGINE=qwen 且 MAKEUP_FIXTURES_DIR 指向该目录,用同样的输入真跑一次。`,
          `本次提示词:`,
          req.prompt,
        ].join('\n'),
      );
    }

    // ★ 模板版本对不上也要当未命中:措辞变了,录的那张图**不再对应这次的输入**。
    //   放它过去会得到一个"命中但答非所问"的结果,比未命中更难查。
    if (fixture.templateVersion !== TEMPLATE_VERSION) {
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        `夹具 ${key} 录于模板 ${fixture.templateVersion},当前模板是 ${TEMPLATE_VERSION};` +
          `措辞已变,该夹具不再对应这次输入,请重录。`,
      );
    }

    const src = path.join(this.opts.fixturesDir, fixture.response.imageFile);
    mkdirSync(this.opts.outputDir, { recursive: true });
    const dest = path.join(this.opts.outputDir, path.basename(fixture.response.imageFile));
    copyFileSync(src, dest);

    const spec = input.lookSpec;
    const look: Look = {
      engine: 'replay',
      style: spec ? describeLook(spec) : '',
      model: this.opts.model,
      templateVersion: TEMPLATE_VERSION,
      // 留一条线索:这张图是**录的**,不是当场生成的。
      // 没有它,拿到产物的人会以为这是引擎跑出来的结果。
      replayedFrom: fixture.createdAt,
    };

    return { resultFilePath: dest, mimeType: fixture.response.mimeType, look };
  }
}
