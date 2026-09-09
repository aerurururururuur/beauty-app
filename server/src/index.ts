/**
 * src/index.ts —— 组装根(唯一认识所有实现的文件)。
 * 读配置 → 逐模块 createXxxModule → 装配 web shell → 启动/优雅停机。
 * 模块内部的实现选择被组合根隔离;依赖只经各模块 public barrel。
 * 换真实引擎/模型时,在对应模块 compose 里按 config.* 开关分发即可。
 */
import { loadConfig, loadDotEnvIfPresent } from './modules/shared/infrastructure/config.js';
import { createAssetsModule } from './modules/assets/index.js';
import { createUnderstandingModule } from './modules/understanding/index.js';
import { createReferencesModule } from './modules/references/index.js';
import { createMakeupModule } from './modules/makeup/index.js';
import { createJobsModule } from './modules/jobs/index.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const config = loadConfig();

  // —— 各模块组合(当前全部走 mock 适配器;config.SCENE_ANALYZER / REFERENCE_PROVIDER /
  //    MAKEUP_ENGINE 是未来分发开关,接入真实实现时在对应 create*Module 内读取) ——
  const { artifactStore } = createAssetsModule({ dataDir: config.dataDir });
  const { sceneAnalyzer } = createUnderstandingModule();
  const { referenceProvider } = createReferencesModule();
  const { engine } = createMakeupModule();

  const jobs = createJobsModule({
    dataDir: config.dataDir,
    artifactStore,
    sceneAnalyzer,
    referenceProvider,
    engine,
  });

  // —— web shell ——
  const app = await buildApp({ config, jobs });

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
