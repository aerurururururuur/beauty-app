# modules/weather/application —— 应用层

本层放「天气的独立用例/策略」。

- **现状**：空（空壳模块，未 wire）。`weather/compose.ts` 返回 `{ provider: null }`，尚未在 `src/index.ts` 接入。
- **将来放什么**：天气拉取若需独立编排（城市/坐标归一、失败回退到前端预设、限频缓存）放这里；`compose.ts` 里把 provider 实例化并返回。
- **起点**：先实现 `domain/ports/weather-provider.ts` 的一个免费源实现（放 `infrastructure`）——见本模块根 README 待办。
