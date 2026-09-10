/**
 * cabinet.test.ts —— 衣橱模块单测。
 * 守三条:① 归属必须指向真实用户,孤儿条目一律不落库;
 *        ② 改/删的归属不符报「找不到」而非「无权」,且**不动数据**;
 *        ③ 特性是用户自定义的自由键值,但空白、控制字符、重名一律拒收(不静默丢数据)。
 * 真实 JSON 仓库另用 mkdtemp 验一次「重启后还在」。
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../src/modules/shared/index.js';
import {
  AddCosmetic,
  JsonCosmeticRepository,
  ListCosmetics,
  createCosmeticItem,
  MAX_ATTRIBUTES,
  MAX_ATTRIBUTE_LABEL,
  MAX_ATTRIBUTE_VALUE,
  MAX_ITEMS_PER_USER,
  MAX_NAME,
  RemoveCosmetic,
  UpdateCosmetic,
  validateCreateInput,
  validateItemId,
  validateOwnerQuery,
  validateUpdateInput,
} from '../src/modules/cabinet/index.js';
import { FakeCosmeticRepository, FakeUserDirectory } from './helpers/fakes.js';

function setup(existingUserIds: string[] = ['u1', 'u2']) {
  const items = new FakeCosmeticRepository();
  const users = new FakeUserDirectory(existingUserIds);
  return {
    items,
    users,
    addCosmetic: new AddCosmetic({ items, users }),
    listCosmetics: new ListCosmetics({ items, users }),
    updateCosmetic: new UpdateCosmetic(items),
    removeCosmetic: new RemoveCosmetic(items),
  };
}

describe('AddCosmetic', () => {
  it('加一件:回视图,特性照原样存(仅 trim 首尾空白)', async () => {
    const s = setup();

    const view = await s.addCosmetic.execute({
      userId: 'u1',
      name: '  豆沙色唇釉  ',
      attributes: [
        { label: ' 色号 ', value: ' #420 豆沙 ' },
        { label: '质地', value: '哑光' },
      ],
    });

    expect(view.name).toBe('豆沙色唇釉');
    expect(view.userId).toBe('u1');
    expect(view.attributes).toEqual([
      { label: '色号', value: '#420 豆沙' },
      { label: '质地', value: '哑光' },
    ]);
    expect(s.items.size()).toBe(1);
  });

  it('不给特性 → 空数组(允许"只记个名字")', async () => {
    const s = setup();
    const view = await s.addCosmetic.execute({ userId: 'u1', name: '口红' });
    expect(view.attributes).toEqual([]);
  });

  it('归属用户不存在 → USER_NOT_FOUND,且**不落库**', async () => {
    const s = setup(['u1']);
    // 用「格式合法但不存在」的 id:写成中文会先被字符集校验拦成 VALIDATION_ERROR,
    // 那样测的就不是"用户不存在"这条路径了。
    await expect(s.addCosmetic.execute({ userId: 'ghost-user', name: '口红' })).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
    });
    expect(s.items.size()).toBe(0);
  });

  it('超过单用户上限 → CABINET_FULL(第 101 件加不进去)', async () => {
    const s = setup();
    for (let i = 0; i < MAX_ITEMS_PER_USER; i += 1) {
      await s.addCosmetic.execute({ userId: 'u1', name: `第 ${i} 件` });
    }
    expect(s.items.size()).toBe(MAX_ITEMS_PER_USER);

    await expect(s.addCosmetic.execute({ userId: 'u1', name: '再加一件' })).rejects.toMatchObject({
      code: ErrorCode.CABINET_FULL,
    });
    // 上限是**按人**算的:另一个人不受影响
    await expect(s.addCosmetic.execute({ userId: 'u2', name: '别人的第一件' })).resolves.toBeTruthy();
  });
});

describe('ListCosmetics', () => {
  it('只回该用户的条目,并按建档时间升序(同刻用 id 兜底)', async () => {
    const s = setup();
    // 直接塞仓库,才能精确控制 createdAt 来验排序
    await s.items.save(createCosmeticItem('b', 'u1', '第二件', []));
    await s.items.save({ ...createCosmeticItem('a', 'u1', '第一件', []), createdAt: '2026-01-01T00:00:00.000Z' });
    await s.items.save({ ...createCosmeticItem('c', 'u1', '第三件', []), createdAt: '2026-06-01T00:00:00.000Z' });
    await s.items.save(createCosmeticItem('x', 'u2', '别人的', []));

    const list = await s.listCosmetics.execute({ userId: 'u1' });
    expect(list.items.map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(list.items.every((i) => i.userId === 'u1')).toBe(true);
  });

  it('用户不存在 → USER_NOT_FOUND(不装作"衣橱是空的")', async () => {
    const s = setup(['u1']);
    await expect(s.listCosmetics.execute({ userId: 'ghost-user' })).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
    });
  });

  it('没给 userId → VALIDATION_ERROR', async () => {
    const s = setup();
    await expect(s.listCosmetics.execute({})).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });
});

describe('UpdateCosmetic', () => {
  it('改名称与特性,并刷新 updatedAt', async () => {
    const s = setup();
    const created = await s.addCosmetic.execute({ userId: 'u1', name: '旧名', attributes: [] });

    const updated = await s.updateCosmetic.execute(created.id, {
      userId: 'u1',
      name: '新名',
      attributes: [{ label: '品类', value: '唇部' }],
    });

    expect(updated.name).toBe('新名');
    expect(updated.attributes).toEqual([{ label: '品类', value: '唇部' }]);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBeTruthy();
  });

  it('只给 name 时,特性保持不动(部分更新)', async () => {
    const s = setup();
    const created = await s.addCosmetic.execute({
      userId: 'u1',
      name: '旧名',
      attributes: [{ label: '色号', value: '#420' }],
    });

    const updated = await s.updateCosmetic.execute(created.id, { userId: 'u1', name: '新名' });
    expect(updated.attributes).toEqual([{ label: '色号', value: '#420' }]);
  });

  it('name 与 attributes 都不给 → VALIDATION_ERROR(空操作不当合法请求)', async () => {
    const s = setup();
    const created = await s.addCosmetic.execute({ userId: 'u1', name: '口红' });
    await expect(
      s.updateCosmetic.execute(created.id, { userId: 'u1' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('条目不存在 → CABINET_ITEM_NOT_FOUND', async () => {
    const s = setup();
    await expect(
      s.updateCosmetic.execute('no-such-item', { userId: 'u1', name: '新名' }),
    ).rejects.toMatchObject({ code: ErrorCode.CABINET_ITEM_NOT_FOUND });
  });

  it('★ 归属不符 → 报「找不到」而非「无权」,且原数据不动', async () => {
    const s = setup();
    const created = await s.addCosmetic.execute({ userId: 'u1', name: '我的口红' });

    await expect(
      s.updateCosmetic.execute(created.id, { userId: 'u2', name: '被改了' }),
    ).rejects.toMatchObject({ code: ErrorCode.CABINET_ITEM_NOT_FOUND });

    expect((await s.items.findById(created.id))?.name).toBe('我的口红');
  });
});

describe('RemoveCosmetic', () => {
  it('删掉自己的条目', async () => {
    const s = setup();
    const created = await s.addCosmetic.execute({ userId: 'u1', name: '口红' });

    await s.removeCosmetic.execute(created.id, { userId: 'u1' });
    expect(await s.items.findById(created.id)).toBeNull();
    expect((await s.listCosmetics.execute({ userId: 'u1' })).items).toEqual([]);
  });

  it('★ 归属不符 → 报「找不到」,且**条目还在**', async () => {
    const s = setup();
    const created = await s.addCosmetic.execute({ userId: 'u1', name: '我的口红' });

    await expect(
      s.removeCosmetic.execute(created.id, { userId: 'u2' }),
    ).rejects.toMatchObject({ code: ErrorCode.CABINET_ITEM_NOT_FOUND });

    expect(await s.items.findById(created.id)).not.toBeNull();
  });

  it('没给 userId → VALIDATION_ERROR(不会误删)', async () => {
    const s = setup();
    const created = await s.addCosmetic.execute({ userId: 'u1', name: '口红' });

    await expect(s.removeCosmetic.execute(created.id, {})).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    expect(await s.items.findById(created.id)).not.toBeNull();
  });
});

describe('validator', () => {
  it('名称:空 / 纯空白 / 超长 一律拒收', () => {
    expect(() => validateCreateInput({ userId: 'u1', name: '' })).toThrow(AppError);
    expect(() => validateCreateInput({ userId: 'u1', name: '   ' })).toThrow(AppError);
    expect(() => validateCreateInput({ userId: 'u1', name: 'x'.repeat(MAX_NAME + 1) })).toThrow(
      AppError,
    );
  });

  it('名称含换行 / 制表符 → 拒收', () => {
    expect(() => validateCreateInput({ userId: 'u1', name: '口红\n第二行' })).toThrow(AppError);
    expect(() => validateCreateInput({ userId: 'u1', name: '口\t红' })).toThrow(AppError);
  });

  it('特性值不能为空(有标签没值 = 噪音)', () => {
    expect(() =>
      validateCreateInput({ userId: 'u1', name: '口红', attributes: [{ label: '色号', value: ' ' }] }),
    ).toThrow(AppError);
  });

  it('特性名不能为空', () => {
    expect(() =>
      validateCreateInput({ userId: 'u1', name: '口红', attributes: [{ label: '  ', value: '哑光' }] }),
    ).toThrow(AppError);
  });

  it('★ 特性名重复 → 拒收(不静默取后一个)', () => {
    expect(() =>
      validateCreateInput({
        userId: 'u1',
        name: '口红',
        attributes: [
          { label: '色号', value: '#420' },
          { label: ' 色号 ', value: '#421' },
        ],
      }),
    ).toThrow(/特性名重复/);
  });

  it('特性条数 / 标签长度 / 值长度上限', () => {
    const tooMany = Array.from({ length: MAX_ATTRIBUTES + 1 }, (_, i) => ({
      label: `L${i}`,
      value: 'v',
    }));
    expect(() => validateCreateInput({ userId: 'u1', name: '口红', attributes: tooMany })).toThrow(
      AppError,
    );
    expect(() =>
      validateCreateInput({
        userId: 'u1',
        name: '口红',
        attributes: [{ label: 'x'.repeat(MAX_ATTRIBUTE_LABEL + 1), value: 'v' }],
      }),
    ).toThrow(AppError);
    expect(() =>
      validateCreateInput({
        userId: 'u1',
        name: '口红',
        attributes: [{ label: 'L', value: 'x'.repeat(MAX_ATTRIBUTE_VALUE + 1) }],
      }),
    ).toThrow(AppError);
  });

  it('多余字段 / 缺 userId → 拒收(strict)', () => {
    expect(() => validateCreateInput({ userId: 'u1', name: '口红', extra: 1 })).toThrow(AppError);
    expect(() => validateCreateInput({ name: '口红' })).toThrow(AppError);
  });

  it('id 只放行 URL 安全字符', () => {
    expect(validateItemId('abc-123_X')).toBe('abc-123_X');
    expect(() => validateItemId('../../etc/passwd')).toThrow(AppError);
    expect(() => validateItemId(123)).toThrow(AppError);
  });

  it('归属查询串只认 userId 一个键', () => {
    expect(validateOwnerQuery({ userId: 'u1' })).toEqual({ userId: 'u1' });
    expect(() => validateOwnerQuery({ userId: 'u1', other: 'x' })).toThrow(AppError);
  });

  it('validateUpdateInput:至多给一个以上字段才合法', () => {
    expect(validateUpdateInput({ userId: 'u1', name: '新名' })).toEqual({ userId: 'u1', name: '新名' });
    expect(validateUpdateInput({ userId: 'u1', attributes: [] })).toEqual({
      userId: 'u1',
      attributes: [],
    });
    expect(() => validateUpdateInput({ userId: 'u1' })).toThrow(AppError);
  });
});

describe('JsonCosmeticRepository', () => {
  let dir: string | null = null;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it('落盘后按 id / 按用户都能读回,新实例(重启)也读得到', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cabinet-repo-'));
    const repo = new JsonCosmeticRepository(dir);

    await repo.save(createCosmeticItem('c1', 'u1', '唇釉', [{ label: '色号', value: '#420' }]));
    await repo.save(createCosmeticItem('c2', 'u2', '别人的粉底', []));

    expect((await repo.findById('c1'))?.name).toBe('唇釉');
    expect((await repo.findById('c1'))?.attributes).toEqual([{ label: '色号', value: '#420' }]);
    expect(await repo.findById('nope')).toBeNull();
    expect((await repo.listByUser('u1')).map((i) => i.id)).toEqual(['c1']);
    expect((await repo.listByUser('u2')).map((i) => i.id)).toEqual(['c2']);

    // 「重启」:新实例读同一目录
    const reopened = new JsonCosmeticRepository(dir);
    expect((await reopened.findById('c1'))?.name).toBe('唇釉');
  });

  it('删除后不再读回;删不存在的 id 是幂等的(不抛)', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cabinet-repo-'));
    const repo = new JsonCosmeticRepository(dir);

    await repo.save(createCosmeticItem('c1', 'u1', '唇釉', []));
    await repo.remove('c1');
    expect(await repo.findById('c1')).toBeNull();

    await expect(repo.remove('c1')).resolves.toBeUndefined();
    await expect(repo.remove('从没存在过')).resolves.toBeUndefined();
  });
});
