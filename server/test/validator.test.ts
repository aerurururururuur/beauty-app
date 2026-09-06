/**
 * domain/validator —— 校验行为单测。
 * 输入侧:validateSubmitJob / validateJobId 执行业务规则并抛语义错误码;
 * 输出侧:validateEngineResult 把关外部引擎产物(路径/类型/look 几何)。
 */
import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../src/domain/errors/app-error.js';
import type { EngineResult } from '../src/domain/ports/engine.js';
import { validateJobId } from '../src/domain/validator/job-id.validator.js';
import { validateSubmitJob } from '../src/domain/validator/job-submit.validator.js';
import { MAX_SCENES } from '../src/domain/schemas/job-submit.js';
import { validateEngineResult } from '../src/domain/validator/engine-output.validator.js';

const meta = (mimeType = 'image/png', originalName = 'a.png') => ({ originalName, mimeType });

/** 断言函数抛出指定错误码的 AppError。 */
function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error('应当抛出 AppError,却通过了校验');
  } catch (e) {
    if (e instanceof AppError) {
      expect(e.code).toBe(code);
    } else if (e instanceof Error && e.message === '应当抛出 AppError,却通过了校验') {
      throw e;
    } else {
      throw new Error(`期望 AppError(${code}),实际抛了:${String(e)}`);
    }
  }
}

describe('validateSubmitJob(输入)', () => {
  it('合法输入:face + scenes + 带空白的 sceneText → 返回清洗结果', () => {
    const input = validateSubmitJob({
      faces: [meta('image/png', 'me.png')],
      scenes: [meta('image/jpeg', 's.jpg')],
      sceneText: '  雪景 清透  ',
    });
    expect(input.face.originalName).toBe('me.png');
    expect(input.scenes).toHaveLength(1);
    expect(input.sceneText).toBe('雪景 清透');
  });

  it('仅文字(trim 后)即可,scenes 可为空', () => {
    const input = validateSubmitJob({ faces: [meta()], scenes: [], sceneText: ' 城市夜景 ' });
    expect(input.scenes).toEqual([]);
    expect(input.sceneText).toBe('城市夜景');
  });

  it('无任何场景(无图且文字为空白)→ SCENES_REQUIRED', () => {
    expectCode(
      () => validateSubmitJob({ faces: [meta()], scenes: [], sceneText: '   ' }),
      ErrorCode.SCENES_REQUIRED,
    );
  });

  it('风景图超上限 → SCENES_MAX_EXCEEDED', () => {
    const scenes = Array.from({ length: MAX_SCENES + 1 }, () => meta());
    expectCode(
      () => validateSubmitJob({ faces: [meta()], scenes, sceneText: '雪' }),
      ErrorCode.SCENES_MAX_EXCEEDED,
    );
  });

  it('缺少本人照片 → FACE_REQUIRED', () => {
    expectCode(
      () => validateSubmitJob({ faces: [], scenes: [meta()], sceneText: '雪' }),
      ErrorCode.FACE_REQUIRED,
    );
  });

  it('本人照片多于一张 → VALIDATION_ERROR', () => {
    expectCode(
      () =>
        validateSubmitJob({ faces: [meta(), meta()], scenes: [meta()], sceneText: '雪' }),
      ErrorCode.VALIDATION_ERROR,
    );
  });

  it('文件非 image/* → VALIDATION_ERROR(形状层拒绝)', () => {
    expectCode(
      () => validateSubmitJob({ faces: [meta('text/plain')], scenes: [], sceneText: '雪' }),
      ErrorCode.VALIDATION_ERROR,
    );
  });
});

describe('validateJobId', () => {
  it('合法 id 原样返回', () => {
    expect(validateJobId('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(
      '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    );
  });
  it('非法 id → VALIDATION_ERROR', () => {
    expectCode(() => validateJobId('../etc'), ErrorCode.VALIDATION_ERROR);
    expectCode(() => validateJobId(''), ErrorCode.VALIDATION_ERROR);
  });
});

function zone(overrides: Record<string, unknown> = {}) {
  return {
    role: '唇',
    anchor: { x: 0.5, y: 0.47 },
    size: { w: 0.26, h: 0.13 },
    rgb: [230, 178, 186],
    blend: 'multiply',
    blur: 12,
    opacity: 0.8,
    ...overrides,
  };
}

function result(overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    resultFilePath: '/tmp/out.png',
    mimeType: 'image/png',
    look: { style: '雪景妆', palette: [{ role: '唇', rgb: [230, 178, 186] }], zones: [] },
    ...overrides,
  };
}

describe('validateEngineResult(输出)', () => {
  it('合法产物(look 无 zones 或空 zones)通过并原样返回', () => {
    const ok = result();
    expect(validateEngineResult(ok)).toBe(ok);
    const withZones = result({ look: { zones: [zone()] } });
    expect(validateEngineResult(withZones)).toBe(withZones);
  });

  it('缺少成品图路径 → INTERNAL_ERROR', () => {
    expectCode(() => validateEngineResult(result({ resultFilePath: '  ' })), ErrorCode.INTERNAL_ERROR);
  });

  it('非法 RGB(越界)→ INTERNAL_ERROR', () => {
    expectCode(
      () => validateEngineResult(result({ look: { zones: [zone({ rgb: [300, 0, 0] })] } })),
      ErrorCode.INTERNAL_ERROR,
    );
  });

  it('anchor 超出归一化范围 0..1 → INTERNAL_ERROR', () => {
    expectCode(
      () =>
        validateEngineResult(
          result({ look: { zones: [zone({ anchor: { x: 1.5, y: -0.1 } })] } }),
        ),
      ErrorCode.INTERNAL_ERROR,
    );
  });

  it('opacity 越界 → INTERNAL_ERROR', () => {
    expectCode(
      () => validateEngineResult(result({ look: { zones: [zone({ opacity: 1.4 })] } })),
      ErrorCode.INTERNAL_ERROR,
    );
  });

  it('zones 不是数组 → INTERNAL_ERROR', () => {
    expectCode(
      () => validateEngineResult(result({ look: { zones: { 0: zone() } } })),
      ErrorCode.INTERNAL_ERROR,
    );
  });
});
