/**
 * look-renders.test.ts —— 档案的源图适配器(agent 的 `GetRender` → `looks` 的 `RenderSource`)。
 *
 * 守一条:那层收窄**只认两种"查不到"**,别的错误照抛。
 * ★ 这条最容易写错的地方是图省事 `catch { return null }` —— 那会把一次存储故障
 *   (或一次 500)说成"这张图已经过期了,请重新生成一版",用户重生成一遍还是失败,
 *   而日志里什么都没有。所以下面两条"照抛"的用例是这组测试的重点,不是陪衬。
 */
import { describe, expect, it } from 'vitest';
import { createRenderSource } from '../src/look-renders.js';
import { AppError, ErrorCode } from '../src/modules/shared/index.js';
import type { ResolvedImage } from '../src/modules/shared/index.js';
import type { GetRender } from '../src/modules/agent/index.js';

const IMAGE: ResolvedImage = { filePath: '/tmp/r3/result.png', mimeType: 'image/png' };

/** 只造 `GetRender` 的公开形状(`execute`)——适配器只调这一个方法。 */
function renderOf(behavior: () => Promise<ResolvedImage>): GetRender {
  return { execute: behavior } as unknown as GetRender;
}

describe('createRenderSource', () => {
  it('拿得到就原样回(路径 + MIME,不建流)', async () => {
    const source = createRenderSource(renderOf(async () => IMAGE));
    await expect(source.resolve('s1', 3, 'u1')).resolves.toEqual(IMAGE);
  });

  it('SESSION_NOT_FOUND ⇒ null(会话不在 / 重启后没了 / 不是你的)', async () => {
    const source = createRenderSource(
      renderOf(async () => {
        throw new AppError(ErrorCode.SESSION_NOT_FOUND, '会话不存在,或不属于该用户');
      }),
    );
    await expect(source.resolve('s1', 3, 'u1')).resolves.toBeNull();
  });

  it('RENDER_NOT_FOUND ⇒ null(序号不在这个会话里 / 字节没了)', async () => {
    const source = createRenderSource(
      renderOf(async () => {
        throw new AppError(ErrorCode.RENDER_NOT_FOUND, '这次生成里没有第 3 张图');
      }),
    );
    await expect(source.resolve('s1', 3, 'u1')).resolves.toBeNull();
  });

  it('★ 别的 AppError 照抛 —— 别把真错误说成"图过期了"', async () => {
    const boom = new AppError(ErrorCode.INTERNAL_ERROR, '磁盘挂了');
    const source = createRenderSource(
      renderOf(async () => {
        throw boom;
      }),
    );
    await expect(source.resolve('s1', 3, 'u1')).rejects.toBe(boom);
  });

  it('★ 任何普通 Error 也照抛(不该被静默吞掉)', async () => {
    const boom = new Error('ENOSPC');
    const source = createRenderSource(
      renderOf(async () => {
        throw boom;
      }),
    );
    await expect(source.resolve('s1', 3, 'u1')).rejects.toBe(boom);
  });
});
