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
  ReadUserAvatar,
  UpdateProfile,
  updateUserProfile,
  userSchema,
  validateCredentials,
  validateProfileInput,
  validateUserId,
  MAX_BIO,
} from '../src/modules/user/index.js';
import { FakePasswordHasher, FakeUserAvatarStore, FakeUserRepository } from './helpers/fakes.js';

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
    expect(Object.keys(view).sort()).toEqual([
      'avatarSource',
      'avatarUrl',
      'bio',
      'createdAt',
      'id',
      'nickname',
    ]);
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
   * ★ 用**改过资料**的那一份来比:`bio` / `avatarMime` 是后加的可选格,新账号本来就没有,
   *   拿刚注册的行比会对不上(那不是丢字段,是"没填")。两份都存,才把两种情况都钉住。
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
    // 刚注册:只有必填那四格 —— 每一个键都必须是 schema 认得的(多一个会在读出口被 `.strict()` 抛出来)。
    expect(Object.keys(onDisk.u1!).sort()).toEqual(['createdAt', 'id', 'nickname', 'passwordHash']);
    expect(onDisk.u1).toEqual(user);

    // 改过资料:这才应当与 schema 的键集合一格不差。
    const full = updateUserProfile(user, {
      bio: '混合偏干皮 · 冷调一白',
      avatar: { kind: 'file', mime: 'image/jpeg' },
    });
    await repo.save(full);
    const again = JSON.parse(await readFile(path.join(dir, 'users.json'), 'utf8')) as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(again.u1!).sort()).toEqual(Object.keys(userSchema.shape).sort());
    expect(again.u1).toEqual(full);
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

/* ========================= 编辑资料(bio + 头像)========================= */

/** 一张**真的**能被解码的极小 PNG(1×1)。 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function profileSetup() {
  const users = new FakeUserRepository();
  const avatars = new FakeUserAvatarStore();
  return {
    users,
    avatars,
    updateProfile: new UpdateProfile({ users, avatars }),
    readUserAvatar: new ReadUserAvatar({ users, avatars }),
  };
}

describe('validateProfileInput', () => {
  it('简介 trim;只写了空白 = 空串(=清空),不是 422', () => {
    expect(validateProfileInput({ bio: '  淡颜系  ' }).bio).toBe('淡颜系');
    expect(validateProfileInput({ bio: '   ' }).bio).toBe('');
  });

  it('简介上限:清洗前 120、清洗后 60', () => {
    expect(validateProfileInput({ bio: '很'.repeat(MAX_BIO) }).bio).toHaveLength(MAX_BIO);
    expect(() => validateProfileInput({ bio: '很'.repeat(MAX_BIO + 1) })).toThrow(/最多 60/);
    expect(() => validateProfileInput({ bio: '很'.repeat(121) })).toThrow(/原文最多 120/);
  });

  it('简介拒控制字符,但**换行照收**(从别处粘两句进来不该 422)', () => {
    expect(validateProfileInput({ bio: '冷调一白\r\n淡颜系' }).bio).toBe('冷调一白\n淡颜系');
    expect(() => validateProfileInput({ bio: '冷调\u0000一白' })).toThrow(/控制字符/);
  });

  it('头像三态:不给 = 不动;空串 = 清空;dataURL = 解出字节', () => {
    expect(validateProfileInput({ bio: 'x' }).avatar).toBeUndefined();
    expect(validateProfileInput({ avatar: '' }).avatar).toEqual({ kind: 'none' });

    const avatar = validateProfileInput({ avatar: PNG_DATA_URL }).avatar;
    expect(avatar).toMatchObject({ kind: 'file', mime: 'image/png' });
    expect(avatar && 'bytes' in avatar && avatar.bytes.subarray(0, 8).toString('latin1')).toContain(
      'PNG',
    );
  });

  it('不是图片 / 两格都不给 ⇒ VALIDATION_ERROR', () => {
    expect(() => validateProfileInput({ avatar: 'https://example.com/a.png' })).toThrow(
      /需要 data:image/,
    );
    expect(() => validateProfileInput({})).toThrow(/至少要修改一项/);
  });
});

describe('UpdateProfile', () => {
  async function seeded() {
    const ctx = profileSetup();
    const user = createUser('u1', '小美', 'scrypt$c2FsdA==$aGFzaA==');
    await ctx.users.save(user);
    return { ...ctx, user };
  }

  it('★ 只改简介时一个字节都不碰(没传 ≠ 清空 —— 错了会顺手删掉用户的头像)', async () => {
    const { users, avatars, updateProfile, user } = await seeded();
    await updateProfile.execute('u1', { avatar: PNG_DATA_URL });
    const callsAfterUpload = [...avatars.calls];

    const view = await updateProfile.execute('u1', { bio: '只有简介变了' });

    expect(avatars.calls).toEqual(callsAfterUpload);
    expect(view.avatarSource).toBe('stored');
    expect((await users.findById('u1'))?.avatarMime).toBe('image/png');
    expect(user.avatarMime).toBeUndefined(); // 原来那份行没被就地改
  });

  it('清空头像 ⇒ 行里那一格被删掉(不是留个空串),字节也没了', async () => {
    const { users, avatars, updateProfile } = await seeded();
    await updateProfile.execute('u1', { avatar: PNG_DATA_URL });

    const view = await updateProfile.execute('u1', { avatar: '' });

    expect(view.avatarSource).toBe('none');
    expect(avatars.has('u1')).toBe(false);
    expect('avatarMime' in ((await users.findById('u1')) ?? {})).toBe(false);
  });

  it('简介传空串 ⇒ 那一格从行里删掉(与"没填"同形)', async () => {
    const { users, updateProfile } = await seeded();
    await updateProfile.execute('u1', { bio: '先写一句' });
    await updateProfile.execute('u1', { bio: '  ' });
    expect('bio' in ((await users.findById('u1')) ?? {})).toBe(false);
  });

  it('★ 字节写失败时不许留下"行说换了、图还是旧的"(两条路径的顺序都钉住)', async () => {
    const { users, avatars, updateProfile } = await seeded();
    await updateProfile.execute('u1', { avatar: PNG_DATA_URL });

    avatars.save = async () => {
      throw new Error('盘满了');
    };
    await expect(updateProfile.execute('u1', { avatar: PNG_DATA_URL })).rejects.toThrow(/盘满了/);
    expect((await users.findById('u1'))?.avatarMime).toBe('image/png'); // 行没动

    avatars.remove = async () => {
      throw new Error('盘只读');
    };
    await expect(updateProfile.execute('u1', { avatar: '' })).rejects.toThrow(/盘只读/);
    expect((await users.findById('u1'))?.avatarMime).toBe('image/png'); // 行仍说有条目
  });

  it('账号不存在 ⇒ USER_NOT_FOUND;ReadUserAvatar 没设过头像 ⇒ USER_AVATAR_NOT_FOUND', async () => {
    const { updateProfile, readUserAvatar } = await seeded();
    await expect(updateProfile.execute('nope', { bio: 'x' })).rejects.toMatchObject({
      code: ErrorCode.USER_NOT_FOUND,
    });
    await expect(readUserAvatar.execute('u1')).rejects.toMatchObject({
      code: ErrorCode.USER_AVATAR_NOT_FOUND,
    });
  });
});
