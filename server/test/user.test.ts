/**
 * 用户模块用例单测:注册 / 登录 / 查档案(内存假端口)+ 真实 JSON 仓库与 scrypt 凭据。
 * 重点守两条红线:明文密码不落库、对外视图不含凭据。
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError, ErrorCode } from '../src/modules/shared/index.js';
import {
  AuthenticateUser,
  GetUser,
  JsonUserRepository,
  RegisterUser,
  ScryptPasswordHasher,
  createUser,
  userSchema,
  validateCredentials,
  validateUserId,
} from '../src/modules/user/index.js';
import { FakePasswordHasher, FakeUserRepository } from './helpers/fakes.js';

function setup() {
  const users = new FakeUserRepository();
  const hasher = new FakePasswordHasher();
  return {
    users,
    hasher,
    registerUser: new RegisterUser({ users, hasher }),
    authenticateUser: new AuthenticateUser({ users, hasher }),
    getUser: new GetUser(users),
  };
}

describe('RegisterUser', () => {
  it('注册成功:返回档案视图、凭据落库且不等于明文', async () => {
    const { registerUser, users } = setup();
    const view = await registerUser.execute({ nickname: '小美', password: 'hunter2' });

    expect(view.nickname).toBe('小美');
    expect(view.id).toBeTruthy();
    expect(new Date(view.createdAt).toString()).not.toBe('Invalid Date');

    const stored = users.get(view.id)!;
    expect(stored.passwordHash).toBe('fake-hash:hunter2');
    expect(stored.passwordHash).not.toBe('hunter2');
  });

  it('对外视图不含任何凭据字段', async () => {
    const { registerUser } = setup();
    const view = await registerUser.execute({ nickname: '小美', password: 'hunter2' });
    expect('passwordHash' in view).toBe(false);
    expect(Object.keys(view).sort()).toEqual(['createdAt', 'id', 'nickname']);
  });

  it('昵称首尾空白被清洗,占用判断也按清洗后的值', async () => {
    const { registerUser } = setup();
    const a = await registerUser.execute({ nickname: '  小美  ', password: 'hunter2' });
    expect(a.nickname).toBe('小美');
    await expect(
      registerUser.execute({ nickname: '小美', password: 'other-pass' }),
    ).rejects.toMatchObject({ code: ErrorCode.NICKNAME_TAKEN });
  });

  it('密码不被清洗:前后空格是密码的一部分', async () => {
    const { registerUser, users } = setup();
    const view = await registerUser.execute({ nickname: '小美', password: '  pad  ' });
    expect(users.get(view.id)!.passwordHash).toBe('fake-hash:  pad  ');
  });

  it('昵称过短 / 密码过短 / 含控制字符 → VALIDATION_ERROR', async () => {
    const { registerUser } = setup();
    await expect(
      registerUser.execute({ nickname: ' A ', password: 'hunter2' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(
      registerUser.execute({ nickname: '小美', password: '123' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(
      registerUser.execute({ nickname: '小\n美', password: 'hunter2' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('缺字段 / 多余字段 → VALIDATION_ERROR', async () => {
    const { registerUser } = setup();
    await expect(registerUser.execute({ nickname: '小美' })).rejects.toBeInstanceOf(AppError);
    await expect(
      registerUser.execute({ nickname: '小美', password: 'hunter2', admin: true }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });
});

describe('AuthenticateUser', () => {
  it('密码正确 → 返回档案', async () => {
    const { registerUser, authenticateUser } = setup();
    const created = await registerUser.execute({ nickname: '小美', password: 'hunter2' });
    const view = await authenticateUser.execute({ nickname: '小美', password: 'hunter2' });
    expect(view.id).toBe(created.id);
  });

  it('密码错误与账号不存在返回同一错误码(防昵称枚举)', async () => {
    const { registerUser, authenticateUser } = setup();
    await registerUser.execute({ nickname: '小美', password: 'hunter2' });

    const wrongPassword = await authenticateUser
      .execute({ nickname: '小美', password: 'nope-nope' })
      .catch((e: AppError) => e.code);
    const noSuchUser = await authenticateUser
      .execute({ nickname: '没这个人', password: 'hunter2' })
      .catch((e: AppError) => e.code);

    expect(wrongPassword).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(noSuchUser).toBe(ErrorCode.INVALID_CREDENTIALS);
  });
});

describe('GetUser / validator', () => {
  it('按 id 命中;id 不存在 → USER_NOT_FOUND', async () => {
    const { registerUser, getUser } = setup();
    const created = await registerUser.execute({ nickname: '小美', password: 'hunter2' });
    expect((await getUser.execute(created.id)).id).toBe(created.id);
    await expect(getUser.execute(randomUUID())).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
    });
  });

  it('validateUserId 只放行 URL 安全字符', () => {
    expect(validateUserId('abc-123_XYZ')).toBe('abc-123_XYZ');
    expect(() => validateUserId('../../etc/passwd')).toThrow(AppError);
  });

  it('validateCredentials 返回清洗后的昵称', () => {
    expect(validateCredentials({ nickname: ' 小美 ', password: 'hunter2' })).toEqual({
      nickname: '小美',
      password: 'hunter2',
    });
  });
});

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('同一明文两次哈希结果不同(盐随机),都能验证通过', async () => {
    const a = await hasher.hash('hunter2');
    const b = await hasher.hash('hunter2');
    expect(a).not.toBe(b);
    expect(a).not.toContain('hunter2');
    expect(await hasher.verify('hunter2', a)).toBe(true);
    expect(await hasher.verify('hunter2', b)).toBe(true);
  });

  it('密码不匹配 → false;凭据格式非法 → false(不抛异常)', async () => {
    const encoded = await hasher.hash('hunter2');
    expect(await hasher.verify('hunter3', encoded)).toBe(false);
    expect(await hasher.verify('hunter2', 'not-a-credential')).toBe(false);
    expect(await hasher.verify('hunter2', 'scrypt$$')).toBe(false);
  });
});

describe('JsonUserRepository', () => {
  let dir: string | null = null;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it('落盘后按 id / 昵称都能读回,新实例(重启)也读得到', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'user-repo-'));
    const repo = new JsonUserRepository(dir);
    await repo.save({
      id: 'u1',
      nickname: '小美',
      passwordHash: 'scrypt$c2FsdA==$aGFzaA==',
      createdAt: new Date().toISOString(),
    });

    expect((await repo.findById('u1'))?.nickname).toBe('小美');
    expect((await repo.findByNickname('小美'))?.id).toBe('u1');
    expect(await repo.findById('nope')).toBeNull();
    expect(await repo.findByNickname('没这个人')).toBeNull();

    // 「重启」:新实例读同一目录
    const reopened = new JsonUserRepository(dir);
    expect((await reopened.findByNickname('小美'))?.id).toBe('u1');
  });

  /**
   * ★ 往返:盘上一条账号的**键集合**必须与 `userSchema` 一格不差。
   * 理由同 `cabinet` 那份(见 `test/cabinet.test.ts` 的对应注释):字段各写一份之后
   * 少掉一格**编译不报错**,只在写盘时悄悄丢 —— 而密码哈希少一格就不是"少一格"了。
   */
  it('★ 落盘的键集合与 userSchema 一格不差(字段只有一份定义)', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'user-repo-'));
    const repo = new JsonUserRepository(dir);
    const user = createUser('u1', '小美', 'scrypt$c2FsdA==$aGFzaA==');
    await repo.save(user);

    const onDisk = JSON.parse(await readFile(path.join(dir, 'users.json'), 'utf8')) as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(onDisk.u1!).sort()).toEqual(Object.keys(userSchema.shape).sort());
    expect(onDisk.u1).toEqual(user);
  });

  it('★ 盘上的文件被手改坏 → 报的是「哪个文件、坏在哪」', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'user-repo-'));
    await writeFile(path.join(dir, 'users.json'), '{ 这不是 JSON', 'utf8');
    await expect(new JsonUserRepository(dir).findById('u1')).rejects.toThrow(/users\.json/);
  });

  it('★ 形状对不上的落盘数据读不进来(§7.2:不拿 as 断言硬说"我知道它是什么形状")', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'user-repo-'));
    // 少一格 `passwordHash`:登录会变成"密码永远不对",查起来离现场很远。
    await writeFile(
      path.join(dir, 'users.json'),
      JSON.stringify({ u1: { id: 'u1', nickname: '小美', createdAt: 'x' } }),
      'utf8',
    );
    await expect(new JsonUserRepository(dir).findById('u1')).rejects.toThrow(/users\.json/);
  });

  it('★ 键与行里的 id 对不上 → 读不进来(那会让「按 id 查不到、按昵称却查得到」)', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'user-repo-'));
    await writeFile(
      path.join(dir, 'users.json'),
      JSON.stringify({ u1: { ...createUser('other', '小美', 'h'), id: 'other' } }),
      'utf8',
    );
    await expect(new JsonUserRepository(dir).findById('u1')).rejects.toThrow(/两者必须一致/);
  });
});
