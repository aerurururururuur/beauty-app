/**
 * domain/validator —— 校验行为单测。
 * 输出侧:validateEngineResult 把关外部引擎产物(路径/类型/look 几何)。
 * (输入侧的 validateSubmitJob / validateJobId 随 jobs 模块删除,2026-09-29。)
 */
import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../src/modules/shared/index.js';
import type { EngineResult } from '../src/modules/makeup/index.js';
import { validateEngineResult } from '../src/modules/makeup/index.js';

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
    image: { filePath: '/tmp/out.png', mimeType: 'image/png' },
    look: { style: '正式得体妆', palette: [{ role: '唇', rgb: [230, 178, 186] }], zones: [] },
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
    expectCode(
      () => validateEngineResult(result({ image: { filePath: '  ', mimeType: 'image/png' } })),
      ErrorCode.INTERNAL_ERROR,
    );
  });

  it('缺少成品图类型 → INTERNAL_ERROR', () => {
    expectCode(
      () => validateEngineResult(result({ image: { filePath: '/tmp/out.png', mimeType: ' ' } })),
      ErrorCode.INTERNAL_ERROR,
    );
  });

  // ── ★ 下面七条:同一格的七种坏法,一种一条 ─────────────────────────────────
  // 就是 `schemas/entities/makeup-zone.ts` 那七个键与 `assertZone` 查的七件事的**对表**。
  // 两份形状是各自写的、且**不能合并**(schema 七个全必填,assertZone 是"字段在才查"),
  // 所以它们会各改各的 —— 而 `assertZone` 按**字符串**取键,那边改名字**不报错**,
  // 只会让某一格的检查静默消失(本仓库的头号 bug 类型:假开关)。
  // ⚠️ 所以:改 `makeupZoneRowSchema` 的键名时,这七条得跟着绿;
  //    哪天删了一条,等于那一格的检查从此没人看着。
  it('role 不是字符串 → INTERNAL_ERROR', () => {
    expectCode(
      () => validateEngineResult(result({ look: { zones: [zone({ role: 123 })] } })),
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

  it('size 超出归一化范围 0..1 → INTERNAL_ERROR', () => {
    expectCode(
      () =>
        validateEngineResult(result({ look: { zones: [zone({ size: { w: 1.4, h: 0.5 } })] } })),
      ErrorCode.INTERNAL_ERROR,
    );
  });

  it('非法 RGB(越界)→ INTERNAL_ERROR', () => {
    expectCode(
      () => validateEngineResult(result({ look: { zones: [zone({ rgb: [300, 0, 0] })] } })),
      ErrorCode.INTERNAL_ERROR,
    );
  });

  it('blend 不是字符串 → INTERNAL_ERROR', () => {
    expectCode(
      () => validateEngineResult(result({ look: { zones: [zone({ blend: 3 })] } })),
      ErrorCode.INTERNAL_ERROR,
    );
  });

  it('blur 为负数 → INTERNAL_ERROR', () => {
    expectCode(
      () => validateEngineResult(result({ look: { zones: [zone({ blur: -1 })] } })),
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
