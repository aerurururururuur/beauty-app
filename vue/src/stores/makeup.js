import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * makeup store —— 「场景美妆镜」制作台的**表单状态**。
 *
 * 采什么字段:本人照片 1 张 + 需求简报(brief)——
 * occasion 场合(interview/date/stage/family/daily)、sceneText 自由文字、
 * skinType/skinTone 肤质肤色、dress 穿搭、weather 日期天气。
 *
 * ✏️ 2026-09-29:提交那条路从"建任务"换成了"**开一段 agent 会话**"。
 *   表单一次填完的 brief 随开会话直接进会话,不再有任务 id / 进度 / 轮询状态机。
 *   所以下面记的是 `sessionId` 而不是 `jobId`——它就只是一个**不透明的会话 id**。
 *
 * ⚠️ **风景参考图(`sceneFiles` / `sceneUrls`)已经摘掉。** agent 的照片口只认
 *   `face` 一个字段,引擎的 `scenes` 那格也删了——留着就是"界面上收图、后端静默丢掉"。
 *   它要回来得等"风格图进引擎"那一轮(位置已经在 `EngineInput.references` 留好)。
 */
export const useMakeupStore = defineStore('makeup', () => {
  // ---- 本人照(必填) ----
  const portraitFile = ref(null) // File | null(demo 填充时为 null 也可提交,mock 下无碍)
  const portraitUrl = ref('') // 本人照片预览(objectURL 或静态路径)

  // ---- 需求简报 brief ----
  const occasion = ref('') // Occasion | ''(未选)
  const sceneText = ref('') // 自由文字自定义板
  const skinType = ref('') // SkinType | ''(未选)
  // SkinTone。★ 缺省 = 词表里标了 isDefault 的那一档(`olive`,橄榄皮·橄榄调),红线 §8-1:
  //   **不许改成最浅那一档**(`cool_porcelain`),也不许出现 `skinTone || 'cool_porcelain'` 这种兜底。
  //   改了这里前端自己不会红,但服务端 `z.enum(SKIN_TONES)` 认这个值——档位名要与
  //   `constants/options.js` 和 `assests/face-catalog/skin-tones.json` 一致。
  const skinTone = ref('olive')
  const dress = ref('') // 穿搭一句话(风格 + 主色)

  // ---- 天气:只有「实拉」一条路(无手动预设)。没拉成功就是空,不编数据 ----
  const weather = ref({}) // 空对象 = 本次不带天气提交
  const weatherCity = ref('') // 用户输入的城市(拉取用)
  const weatherPlace = ref('') // 拉取回来的地点回显(如「北京 · 中国」)
  const weatherSource = ref('') // '' 未拉取 | open-meteo | mock(后端 provider 原样透传)
  const weatherNote = ref('') // 给用户看的一行说明
  const weatherWarn = ref(false) // 该说明是否要提示色(离线示意 / 拉取失败)

  // ---- 会话 ----
  /** ★ 从 agent 那条路拿回来的会话 id。空 = 还没提交过。 */
  const sessionId = ref('')
  const submitting = ref(false)

  /** 提交用简报:只收有值的字段,与后端 meta 契约一一对应。 */
  const brief = computed(() => {
    const b = {}
    if (occasion.value) b.occasion = occasion.value
    const text = (sceneText.value || '').trim()
    if (text) b.sceneText = text
    if (skinType.value) b.skinType = skinType.value
    if (skinTone.value) b.skinTone = skinTone.value
    const d = (dress.value || '').trim()
    if (d) b.dress = d
    // 天气拉到了才带:一个字段都没有时就整个省掉(后端 weather 本来就是可选)。
    if (Object.keys(weather.value).length > 0) b.weather = { ...weather.value }
    return b
  })

  function revoke(url) {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  function setPortrait(file, url) {
    revoke(portraitUrl.value)
    portraitFile.value = file
    portraitUrl.value = url
  }

  function setSceneText(text) {
    sceneText.value = text
  }

  /**
   * 把 GET /weather 的响应填进 brief.weather。
   * 只收天气字段——place/source 是回显用的元信息,**不进 meta**(后端 weather schema 是 strict 的)。
   */
  function applyWeather(view) {
    const next = {}
    if (view?.condition) next.condition = view.condition
    if (typeof view?.temperatureC === 'number') next.temperatureC = view.temperatureC
    if (typeof view?.humidityPct === 'number') next.humidityPct = view.humidityPct
    if (typeof view?.uvIndex === 'number') next.uvIndex = view.uvIndex
    weather.value = next

    weatherPlace.value = view?.place || ''
    // 原样透传 provider 名,不猜:后端加第三个源时前端不会把它错标成 open-meteo。
    // 视图侧对认不出的 source 有一层兜底文案。
    weatherSource.value = view?.source || ''
    // 具体数值与地点由视图直接渲染 weather / weatherPlace;
    // 这里只留「需要提醒一句」的情况——正常拉成功就不必再啰嗦一行字。
    weatherWarn.value = weatherSource.value === 'mock'
    weatherNote.value = weatherWarn.value ? '离线示意——不是实况，仅作演示' : ''
  }

  /**
   * 拉取失败:只把原因说清楚,**不阻塞提交**。
   * 调用方已先 clearWeather() 清空,所以这里只负责「说明」这一件事;
   * 没有手动预设可回落——拉不到就是不带天气,比留着一份对不上城市的值更诚实。
   */
  function setWeatherFailure(message) {
    weatherWarn.value = true
    weatherNote.value = `${message}——没有天气也能提交`
  }

  /** 发起新一次拉取前先清空(视图在 await 之前调用):避免旧数值与「拉取中」并存。 */
  function clearWeather() {
    weather.value = {}
    weatherPlace.value = ''
    weatherSource.value = ''
    weatherNote.value = ''
    weatherWarn.value = false
  }

  function startSubmit() {
    submitting.value = true
  }

  function finishSubmit(id) {
    sessionId.value = id
    submitting.value = false
  }

  function failSubmit() {
    submitting.value = false
  }

  function reset() {
    revoke(portraitUrl.value)
    portraitFile.value = null
    portraitUrl.value = ''
    occasion.value = ''
    sceneText.value = ''
    skinType.value = ''
    skinTone.value = 'olive' // ★ 与上面那个 `ref('olive')` 必须一致,改一处要改两处
    dress.value = ''
    weather.value = {}
    weatherCity.value = ''
    weatherPlace.value = ''
    weatherSource.value = ''
    weatherNote.value = ''
    weatherWarn.value = false
    sessionId.value = ''
    submitting.value = false
  }

  // ---- 派生 ----
  const hasContext = computed(
    () => !!occasion.value || (sceneText.value || '').trim().length > 0
  )
  const canSubmit = computed(
    () => !!portraitUrl.value && hasContext.value && !submitting.value
  )

  return {
    portraitFile,
    portraitUrl,
    occasion,
    sceneText,
    skinType,
    skinTone,
    dress,
    weather,
    weatherCity,
    weatherPlace,
    weatherSource,
    weatherNote,
    weatherWarn,
    brief,
    sessionId,
    submitting,
    hasContext,
    canSubmit,
    setPortrait,
    setSceneText,
    applyWeather,
    setWeatherFailure,
    clearWeather,
    startSubmit,
    finishSubmit,
    failSubmit,
    reset
  }
})
