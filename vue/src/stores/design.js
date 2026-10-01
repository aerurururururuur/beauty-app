import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as api from '@/api/design'

/**
 * 「开始设计」那条链的 store:场景 → 选形象 → 填信息 → 交给 agent。
 *
 * ★★ **方案由后端 agent 产出,不在本地推导。** 这条链的第三次握手
 *    (`submit`) 把 `/form` 收上来的东西拼成一份 `brief` 发给
 *    `POST /agent/sessions`,agent 在 `propose_look` 那一步把「方案」
 *    (步骤/色板/产品/个性化)与「妆面单」**在同一次工具调用里**一起写进会话。
 *    本 store 只是那份会话视图的一份缓存。
 *
 * ★ **所以「生成」「换风格」「出图」全是真的要等的**(最长 90 秒,见
 *   `api/agent.js` 的 `AGENT_TIMEOUT_MS`)。`generating` 不是装饰,页面必须拿它
 *   禁用按钮——出图那条路点两下是真的会花两次钱。
 *
 * ★ **页面之间传的是 URL 参数 `?session=<id>`,不是这家 store。**
 *   会话**可深链**:刷新 `/result` 靠 `loadSession()` 从服务端把同一次会话拉回来
 *   (§3 第 6 条)。store 里这份只是这次会话的缓存。
 *
 * ★ `@/api/agent` 必须**惰性引入**:本 store 被 `stores/user.js` 的 `logout()`
 *   静态引到,而那条链在路由守卫的首屏路径上(`router → user store → isLoggedIn`)。
 *   静态引就等于把 axios 拽进首屏包(§6.3 那条 grep 盯的就是它)。
 */
/**
 * 开场那句。★ 它是**用户说的话**,会被记进会话历史。
 *
 * 写成这一句而不是把表单原文塞进来,是因为表单内容已经随 `brief` 到了
 * (而且**只有 brief 那一份是结构化的**,模型能逐字段引用)。两处各说一遍,
 * 迟早会出现「聊天里说的」和「brief 里记的」不是一套。
 */
const OPENING_TEXT = '按我填的需求给我定一套妆。'

export const useDesignStore = defineStore('design', () => {
  const scenes = api.getScenes()

  /** 填信息页当前用的表单定义。 */
  const form = ref(null)
  /** 服务端那一次的会话视图(形状见 `server/src/modules/agent/application/agent-view.ts`)。 */
  const session = ref(null)
  /** 会话 id。它是 `/result` 地址栏里那个 `?session=` 的来源。 */
  const sessionId = ref('')
  /** 有请求在飞(建会话 / 一轮对话 / 出图)。**出图那条路必须用它禁用按钮。** */
  const generating = ref(false)
  const error = ref('')

  /**
   * 后端那份方案,原样。★ **前端一个字段都不补**——色值也已经在里面了
   * (`steps[].products[].hex` / `palette[].hex`,由服务端的 `decoratePlan` 填,
   * 理由见 `api/design.js` 文件头)。页面拿到什么就画什么。
   */
  const plan = computed(() => session.value?.plan || null)
  /** 「这套妆是什么」的唯一说法,由服务端的 `describeLook` 确定性生成,原样展示。 */
  const lookDescription = computed(() => session.value?.lookDescription || '')
  const hasFace = computed(() => Boolean(session.value?.hasFace))
  /**
   * 出图那件事在视图里是**两个互斥的字段**(见后端 `agent-view.ts`):
   * `pendingRender` 是模型提的、等用户点头;`renderOffer` 是界面按状态自己摆的。
   * ★ 页面上**只该有一个出图入口**——两个都读、都摆,就会出现两个按钮。
   */
  const pendingRender = computed(() => session.value?.pendingRender || null)
  const renderOffer = computed(() => session.value?.renderOffer || null)
  const renders = computed(() => session.value?.renders || [])
  /**
   * ★ **每个上妆步对到哪一张图**:`{ [步骤 id]: seq }`,取最后一轮。由服务端算好
   * (`agent-view.ts` 的 `stepRendersOf`),因为「步骤名 → 区名」那张表服务端只有一份。
   * ⚠️ 护肤 / 妆前 / 防晒 / 定妆**永远不在里面**——它们没有图,所以页面取不到就整块不摆,
   * 不许补一个点下去没结果的空位。
   */
  const stepRenders = computed(() => session.value?.stepRenders || {})
  /** ★ 这个部署的读图入口(`VISION_ANALYZER=real` 才有);**空则无键**,不是空数组。 */
  const analysisOffer = computed(() => session.value?.analysisOffer || null)
  /** 上一次读图没读成的理由(后端 `notice` 原文)。★ 不是错误,别塞进 `error`。 */
  const analysisNotice = ref('')
  const stepCount = computed(() => plan.value?.steps?.length || 0)
  const styleOptions = computed(() => plan.value?.styleOptions || [])

  /* ------------------------------ 场景 ------------------------------ */

  function sceneNameOf(sceneId) {
    return api.sceneNameOf(sceneId)
  }

  /** 填信息页:`form` 决定本场景出现哪几个字段(旅行只有两个,面试有四个)。 */
  function loadForm(sceneId) {
    form.value = api.getSceneForm({ sceneId })
    return form.value
  }

  /* ------------------------------ 会话 ------------------------------ */

  /** 收下一份会话视图。**所有动作的出口都是它**——状态永远以服务端那份为准。 */
  function adopt(view) {
    session.value = view
    sessionId.value = view?.sessionId || ''
    return view
  }

  /** 惰性引入传输层(理由见文件头最后一段)。 */
  function agentApi() {
    return import('@/api/agent')
  }

  /**
   * 三次握手:建会话 → 传脸 → 开场那句话。**这就是「填完交给 agent」那一下。**
   *
   * 返回可用的会话 id;失败返回空串,**错误不吞**(`error` 里是后端给的那句人话,
   * 页面原样展示,§3 第 2 条)。
   *
   * ⚠️ 三步之间**没有事务**:第一步成功了、第二步失败,服务端会留下一个空会话。
   *   那是可以接受的(会话有 TTL,到点自己删);**不可接受的是把失败藏起来**——
   *   那会让用户带着一个空会话进结果页,而结果页上是空的方案。
   *
   * ★ `weather` 是页面在 `/form` 上拉回来的那份(可以是 `null`:没拉/拉不到/服务端标了离线示意)。
   *   挑哪几格、以及哪些不收,是 `api/design.js` 的 `briefWeatherOf` 决定的,这里不重判。
   */
  async function submit({
    userId,
    sceneId = 'party',
    persona = null,
    fields = [],
    faceFile = null,
    canSendRefImages = false,
    weather = null,
  }) {
    if (generating.value) return ''
    generating.value = true
    error.value = ''
    try {
      const agent = await agentApi()
      const brief = api.toBrief({ sceneId, persona, fields, canSendRefImages, weather })
      const created = adopt(await agent.startAgentSession({ userId, brief }))
      if (faceFile) {
        adopt(await agent.uploadAgentPhoto({ sessionId: created.sessionId, userId, file: faceFile }))
      }
      // 参考图逐 `kind` 送一张 —— 挑法只此一处(`refImagesOf`),别在这儿再判一遍。
      // ⚠️ **没有读图能力时一张都别传**:那两条路由根本没注册,传了就是 404,整次提交会栽在这。
      // ★ 送上去只是"图在那儿了",**读它们要用户点**(会花钱,见 `analyze`)。
      if (canSendRefImages) {
        for (const { kind, file } of api.refImagesOf(fields).sent) {
          adopt(await agent.uploadAgentImage({ sessionId: created.sessionId, userId, file, kind }))
        }
      }
      adopt(
        await agent.sendAgentMessage({
          sessionId: created.sessionId,
          userId,
          text: OPENING_TEXT
        })
      )
      return sessionId.value
    } catch (e) {
      error.value = e?.message || '没能把需求交给 agent，请稍后再试'
      return ''
    } finally {
      generating.value = false
    }
  }

  /**
   * 读回一次会话。刷新 `/result` 时靠它接回上下文(地址栏里那个 `?session=`)。
   * 会话不存在 / 不属于这个账号 → 后端报的是同一个 404,这里就是一句人话。
   */
  async function loadSession({ sessionId: id = '', userId }) {
    if (!id) {
      error.value = '这次要看的会话不见了（地址栏里没有会话号）。'
      return false
    }
    generating.value = true
    error.value = ''
    try {
      const agent = await agentApi()
      adopt(await agent.fetchAgentSession({ sessionId: id, userId }))
      return true
    } catch (e) {
      session.value = null
      sessionId.value = ''
      error.value = e?.message || '这段会话找不到了，请回到「开始设计」重新走一遍。'
      return false
    } finally {
      generating.value = false
    }
  }

  /** 跑一轮对话。换风格 / 换一版都走这里——它们都是「再让 agent 定一套」。 */
  async function runTurn(userId, text) {
    if (!sessionId.value || generating.value) return false
    generating.value = true
    error.value = ''
    try {
      const agent = await agentApi()
      adopt(await agent.sendAgentMessage({ sessionId: sessionId.value, userId, text }))
      return true
    } catch (e) {
      error.value = e?.message || '这一轮没跑完，请稍后再试'
      return false
    } finally {
      generating.value = false
    }
  }

  /**
   * ★ **出图**——全项目唯一会真的花钱的动作。调用方**必须**拿 `generating` 禁用按钮。
   *
   * ⚠️ 失败之后**重新拉一次会话视图**:服务端可能已经把图出了、只是这次连接断了
   *   (超时那一条,`api/agent.js` 的 `AGENT_TIMEOUT_MS` ③)。以服务端那份为准,
   *   但**保留上面那句 error**——"请求失败"是实话(我们不知道出没出成),
   *   而刷新后的视图会把真的出了的那张图显示出来。
   */
  async function confirmRender({ userId }) {
    if (!sessionId.value || generating.value) return false
    const id = sessionId.value
    generating.value = true
    error.value = ''
    try {
      const agent = await agentApi()
      adopt(await agent.confirmAgentRender({ sessionId: id, userId }))
      return true
    } catch (e) {
      error.value = e?.message || '这次没能出图，请稍后再试'
      try {
        const agent = await agentApi()
        adopt(await agent.fetchAgentSession({ sessionId: id, userId }))
      } catch {
        /* 连会话都拉不回来时，就留着上面那句 error */
      }
      return false
    } finally {
      generating.value = false
    }
  }

  /**
   * ★ **读一张图**(`kind` = `face` / `scene` / `style`)—— **会花钱**。
   *
   * ⚠️ 只能由用户点那一下触发,调用方**必须**拿 `generating` 禁用按钮。
   * ⚠️ `would_overwrite`(用户自己填过了)**没读也没花钱**,那句话落进 `analysisNotice`。
   */
  async function analyze({ userId, kind }) {
    if (!sessionId.value || generating.value) return false
    generating.value = true
    error.value = ''
    analysisNotice.value = ''
    try {
      const agent = await agentApi()
      const { session: next, notice } = await agent.analyzeAgentImage({
        sessionId: sessionId.value,
        userId,
        kind,
      })
      adopt(next)
      // 只有"没读成"那一次才带 notice;读成了就是一段新状态,没有话要说。
      analysisNotice.value = notice || ''
      return true
    } catch (e) {
      error.value = e?.message || '这次没能读这张图，请稍后再试'
      return false
    } finally {
      generating.value = false
    }
  }

  /**
   * 换一个妆容风格。★ **代价是它不再免费、也不再是毫秒级**——一次 agent 回合,
   * 最长 90 秒(决策:方案改由 agent 产出)。步骤的数量与顺序会跟着配方变。
   *
   * 说给 agent 的那句话里**同时带 id 与中文名**:模型看到的那份清单本来就是
   * `id(中文名)` 的形状(见后端 `style-options-description.ts`),带上 id 它不必猜。
   * ★ 换的是**配方**,不是场合 —— 风格与场合是两张各自独立的表,换它不会动 `brief`。
   */
  function setStyle({ userId, styleId = '' }) {
    const option = styleOptions.value.find((o) => o.id === styleId)
    if (!option) return Promise.resolve(false)
    return runTurn(userId, `换成「${option.name}」(${option.id}) 这个风格，重新给我一套。`)
  }

  /**
   * 换一版:切到这个配方的**同族兄弟**里的下一个。
   * ★ 候选由后端给(`plan.styleOptions`,同 `family` 的配方,含自身),这里是环状的:
   *   走到最后一个就绕回第一个。不再有"按场合派池子"那回事。
   */
  function regenerate({ userId }) {
    const pool = styleOptions.value
    if (!pool.length) return Promise.resolve(false)
    const at = pool.findIndex((o) => o.id === plan.value?.styleId)
    const next = pool[(at + 1) % pool.length]
    return setStyle({ userId, styleId: next.id })
  }

  /**
   * 「记下这一版」。★ 不调任何接口、不假装落库——返回的就是一份**本地 JSON 快照**
   *   (`api/design.js` 的 snapshotDesign 说明为什么这么设计)。
   *   页面的按钮文案要说「已记下这一版」,不能说「已保存到我的作品」。
   *
   * ⚠️ 场景取自**表单定义**,不是 `brief.occasion` —— 后者从 2026-09-30 起可能是
   *   用户自己的话(「朋友的婚礼」),拿它当场景 id 查出来是空的。
   */
  function snapshot() {
    const sceneId = form.value?.sceneId || ''
    return api.snapshotDesign({
      sceneId,
      sceneName: sceneNameOf(sceneId),
      plan: plan.value,
    })
  }

  function reset() {
    form.value = null
    session.value = null
    sessionId.value = ''
    error.value = ''
    analysisNotice.value = ''
  }

  return {
    scenes,
    form,
    session,
    sessionId,
    generating,
    error,
    plan,
    lookDescription,
    hasFace,
    pendingRender,
    renderOffer,
    renders,
    stepRenders,
    stepCount,
    styleOptions,
    analysisOffer,
    analysisNotice,
    sceneNameOf,
    loadForm,
    submit,
    loadSession,
    analyze,
    confirmRender,
    setStyle,
    regenerate,
    snapshot,
    reset,
  }
})
