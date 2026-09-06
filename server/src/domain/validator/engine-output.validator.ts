/**
 * domain/validator/engine-output.validator.ts —— 上妆引擎「输出」的校验行为。
 * 引擎是外部适配器(mock/参数化/第三方),它的输出在进入流水线前必须被校验,
 * 否则越界坐标/非法颜色会污染产物。规则只对「存在且声明了」的字段生效——
 * 未来引擎可以更换自己的私有 look 形状,只要它声明的几何/颜色字段合理即可。
 * 校验失败以 AppError(INTERNAL_ERROR)抛出,由 RunPipeline 捕获并将任务置为 failed。
 */
import { AppError, ErrorCode } from '../errors/app-error.js';
import type { EngineResult } from '../ports/engine.js';

function fail(reason: string): never {
  throw new AppError(ErrorCode.INTERNAL_ERROR, `引擎输出校验失败:${reason}`);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 归一化坐标/比例:0..1。 */
function isUnit01(v: unknown): boolean {
  return isFiniteNumber(v) && v >= 0 && v <= 1;
}

/** RGB 三元组:三个 0..255 的数。 */
function isRgb(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((c) => isFiniteNumber(c) && c >= 0 && c <= 255)
  );
}

/** 校验单个叠加区(存在即校验,缺失字段按引擎私有契约放行)。 */
function assertZone(zone: unknown, index: number): void {
  if (typeof zone !== 'object' || zone === null || Array.isArray(zone)) {
    fail(`zones[${index}] 不是对象`);
  }
  const z = zone as Record<string, unknown>;
  if (z.role !== undefined && typeof z.role !== 'string') fail(`zones[${index}].role 必须是字符串`);
  if (z.anchor !== undefined) {
    const a = z.anchor as Record<string, unknown>;
    if (typeof a !== 'object' || a === null) fail(`zones[${index}].anchor 不是对象`);
    if (!isUnit01(a.x) || !isUnit01(a.y)) {
      fail(`zones[${index}].anchor 坐标须在 0..1(当前 x=${String(a.x)}, y=${String(a.y)})`);
    }
  }
  if (z.size !== undefined) {
    const s = z.size as Record<string, unknown>;
    if (typeof s !== 'object' || s === null) fail(`zones[${index}].size 不是对象`);
    if (!isUnit01(s.w) || !isUnit01(s.h)) {
      fail(`zones[${index}].size 须在 0..1(当前 w=${String(s.w)}, h=${String(s.h)})`);
    }
  }
  if (z.rgb !== undefined && !isRgb(z.rgb)) fail(`zones[${index}].rgb 须为 0..255 的 RGB 三元组`);
  if (z.blend !== undefined && typeof z.blend !== 'string') fail(`zones[${index}].blend 必须是字符串`);
  if (z.blur !== undefined && (!isFiniteNumber(z.blur) || z.blur < 0)) {
    fail(`zones[${index}].blur 须为非负数`);
  }
  if (z.opacity !== undefined && !isUnit01(z.opacity)) {
    fail(`zones[${index}].opacity 须在 0..1`);
  }
}

/**
 * 校验引擎产物结构:成品图路径/类型必须有;look 里声明的 zones / palette
 * 若存在则逐项做几何与颜色合法性检查。通过则原样返回。
 */
export function validateEngineResult(result: EngineResult): EngineResult {
  if (!result || typeof result !== 'object') fail('引擎未返回结果');
  if (typeof result.resultFilePath !== 'string' || result.resultFilePath.trim() === '') {
    fail('缺少成品图路径(resultFilePath)');
  }
  if (typeof result.mimeType !== 'string' || result.mimeType.trim() === '') {
    fail('缺少成品图类型(mimeType)');
  }

  const look = result.look;
  if (!look || typeof look !== 'object' || Array.isArray(look)) fail('look 必须是对象');

  const zones = (look as { zones?: unknown }).zones;
  if (zones !== undefined) {
    if (!Array.isArray(zones)) fail('look.zones 必须是数组');
    zones.forEach((zone, i) => assertZone(zone, i));
  }

  const palette = (look as { palette?: unknown }).palette;
  if (palette !== undefined) {
    if (!Array.isArray(palette)) fail('look.palette 必须是数组');
    palette.forEach((item, i) => {
      if (typeof item !== 'object' || item === null) fail(`palette[${i}] 不是对象`);
      const p = item as Record<string, unknown>;
      if (p.role !== undefined && typeof p.role !== 'string') fail(`palette[${i}].role 必须是字符串`);
      if (p.rgb !== undefined && !isRgb(p.rgb)) fail(`palette[${i}].rgb 须为 0..255 的 RGB 三元组`);
    });
  }

  return result;
}
