import api from './index'
import { useMock } from './mock'
import { DEFAULT_WEATHER } from '@/constants/options'

/**
 * 拉取当日天气（GET /weather，后端 open-meteo 实拉）。
 * 契约见 server/README.md：200 { source, place, condition, temperatureC, humidityPct, uvIndex }。
 *
 * 失败（422 没给地点 / 404 城名查不到 / 502 上游挂了 / 断网）一律 reject：
 * 本文件不吞错、更不编数据，由调用方决定回落到手动预设——天气永远不阻塞提交。
 *
 * mock 模式（纯前端演示、没有后端）不联网，回本地示意值并标 source='mock'，
 * 与后端 mock provider 同语义：它是兜底，不是实况。
 */
export async function fetchWeather({ city }) {
  if (useMock()) {
    return { ...DEFAULT_WEATHER, source: 'mock', place: city }
  }
  return api.get('/weather', { params: { city } })
}
