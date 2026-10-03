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
 * ★ **所以「生成」「出图」全是真的要等的**(最长 90 秒,见
 *   `api/agent.js` 的 `AGENT_TIMEOUT_MS`)。`generating` 不是装饰,页面必须拿它
 *   禁用按钮——出图那条路点两下是真的会花两次钱。
 *
 * ✏️ 2026-10-02:**`styleOptions` / `setStyle` / `regenerate` / `runTurn` 都删了**。
 *   步骤改由模型自己写之后,配方不再是一份"可选清单"(`plan.styleOptions` 连同
 *   `family` 一起从 `PlanView` 下线),那一排 chips 与「换一版」按钮整块消失。
 *   ⚠️ `runTurn` 是**跟着它们一起死的**:它当时只有这两个调用点,而 `/result` 上
 *   没有任何输入框——留一个零消费者的"发一句话"就是本仓最恨的假开关形状
 *   (`api/agent.js` 的 `sendAgentMessage` 照旧留着,`submit` 还在用它发开场白)。
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
   * (`palette[].hex` / `products[].hex`,由服务端的 `decoratePlan` 填,
   * 理由见 `api/design.js` 文件头)。页面拿到什么就画什么。
   *
   * ✏️ 2026-10-02:步骤改由模型自己写(`plan.steps`),色号只住在**计划级**的
   *   `plan.products` 里——**步骤不再带 products**,所以页面别再去每步里找产品。
   *   `plan.meta` 也只剩 `stepCount`(`minutes` / `level` 随配方下线)。
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
  const stepCount = computed(() => plan.value?.steps?.length || 0)

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
   * 提交那一下:建会话 → 传脸 → 传参考图 → **读图** → 开场那句话(见下面那条 ★)。
   * **这就是「填完交给 agent」那一下。**
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
      const refs = canSendRefImages ? api.refImagesOf(fields).sent : []
      for (const { kind, file } of refs) {
        adopt(await agent.uploadAgentImage({ sessionId: created.sessionId, userId, file, kind }))
      }

      // ★ 读图**必须在开场白之前**:读出来的肤色 / 场景 / 风格是 agent 配妆的输入,
      //   要赶在 `propose_look` 之前进会话;摆在结果页上点,读完也没有回合会用它
      //   (2026-10-03 从 `ResultView` 挪到这里)。`face` 也读:人设那档肤色认不出来时
      //   (自建档)只有它能补上。**已填过的格子服务端会跳过,不花钱**(`would_overwrite`)。
      // ⚠️ 整段**跟着 `canSendRefImages` 走**(= 服务端那个 `canAnalyzeFace`):为假时
      //   那两条路由根本没注册,读一次就是 404,整次提交会栽在这。
      const kinds = canSendRefImages
        ? [...(faceFile ? ['face'] : []), ...refs.map((r) => r.kind)]
        : []
      for (const kind of kinds) {
        const { session: next } = await agent.analyzeAgentImage({
          sessionId: created.sessionId,
          userId,
          kind,
        })
        adopt(next)
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

  function reset() {
    form.value = null
    session.value = null
    sessionId.value = ''
    error.value = ''
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
    sceneNameOf,
    loadForm,
    submit,
    loadSession,
    confirmRender,
    reset,
  }
})
