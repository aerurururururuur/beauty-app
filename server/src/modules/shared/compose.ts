/**
 * modules/shared/compose.ts —— shared 无独立运行时服务,占位以保持每模块都有组合根。
 * 纯类型/常量的模块无需装配;真正需要时(如日志器、时钟)再在此返回共享实例。
 */
export interface SharedModuleServices {
  /** 预留:未来共享基础设施(日志/时钟/配置句柄)从这里暴露。 */
  ready: true;
}

export function createSharedModule(): SharedModuleServices {
  return { ready: true };
}
