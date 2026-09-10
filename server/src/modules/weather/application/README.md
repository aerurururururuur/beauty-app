# modules/weather/application —— 应用层

放「取天气用例」：`usecases/get-weather.ts`，外加 `mapping/weather-view.mapper.ts`（结果 → 对外视图）。

- **现状**：已实现并接线。用例只做编排——校验入参（`domain/validator`）、调 `WeatherProvider` 端口、投影成 `WeatherView`。
- **关键职责**：这里是**上游错误与业务错误码的唯一翻译点**——`CityNotFoundError` → `CITY_NOT_FOUND`(404)，
  其余异常 → `WEATHER_UNAVAILABLE`(502)。控制器因此不必认识任何上游错误类型。
- **别做**：别在这里碰 HTTP、别在这里拼上游 URL（那是 `infrastructure` 的事）、别在上游失败时**返回猜测的天气**。
