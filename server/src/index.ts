/**
 * src/index.ts —— 组装根(唯一认识所有实现的文件)。
 * 读配置 → 逐模块 createXxxModule → 装配 web shell → 启动/优雅停机。
 * 模块内部的实现选择被组合根隔离;依赖只经各模块 public barrel。
 * 换真实引擎/模型时,在对应模块 compose 里按 config.* 开关分发即可。
 */
import { loadConfig, loadDotEnvIfPresent } from './modules/shared/infrastructure/config.js';
import { createAssetsModule } from './modules/assets/index.js';
import { createReferencesModule } from './modules/references/index.js';
import { createMakeupModule } from './modules/makeup/index.js';
import { createJobsModule } from './modules/jobs/index.js';
import { createUserModule } from './modules/user/index.js';
import { createWeatherModule } from './modules/weather/index.js';
import { createCabinetModule } from './modules/cabinet/index.js';
import { AppError, ErrorCode } from './modules/shared/index.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const config = loadConfig();

  // —— 各模块组合 ——
  // REFERENCE_PROVIDER 已真正接通(在 references/compose.ts 里按 kind 分发)。
  // ★ MAKEUP_ENGINE 仍**故意**没接:`off` 对「上妆引擎」没有意义——流水线没有引擎就出不了
  //   成品,硬接一个 off 分支只会得到又一个假开关,而那正是本轮要修掉的东西。
  //   接真实引擎时它的 kind 会扩成 'mock' | 'param' | 'api' 之类,那时再接。
  // ★ 场景理解**没有**模块也没有开关(2026-09-10 删):妆容方向是 shared/domain/scene-rules.ts
  //   里的纯查表函数,由 run-pipeline 直接调用。它没有可换的实现,所以不该有开关。
  const { artifactStore } = createAssetsModule({ dataDir: config.dataDir });
  const { referenceProvider } = createReferencesModule({ kind: config.referenceProvider });
  const { engine } = createMakeupModule();

  const jobs = createJobsModule({
    dataDir: config.dataDir,
    artifactStore,
    referenceProvider,
    engine,
  });

  // 账号表落 dataDir/users/users.json;密码只存 scrypt 凭据,不存明文。
  const user = createUserModule({ dataDir: config.dataDir });

  // 当日天气:缺省 open-meteo 实拉,WEATHER_PROVIDER=mock 切离线示意。
  const weather = createWeatherModule({ kind: config.weatherProvider });

  // 衣橱:归属校验要问 user 模块「这人存在吗」。
  // ★ 跨模块粘合**只发生在这里**——cabinet 自己不 import user,
  //   它只声明 UserDirectory 端口(见 cabinet/domain/ports/user-directory.ts)。
  const cabinet = createCabinetModule({
    dataDir: config.dataDir,
    userExists: async (userId) => {
      try {
        await user.getUser.execute(userId);
        return true;
      } catch (err) {
        // 只把「用户不存在」翻译成 false;存储故障等真错误照常抛出,
        // 不能伪装成「用户不存在」把 500 说成 404。
        if (err instanceof AppError && err.code === ErrorCode.USER_NOT_FOUND) return false;
        throw err;
      }
    },
  });

  // —— web shell ——
  const app = await buildApp({ config, jobs, user, weather, cabinet });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`收到 ${signal},排空队列后退出`);
    await jobs.queue.whenIdle();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
