import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * agent store —— 对话定妆的状态。
 *
 * ── 它管两样形状完全不同的东西,别混起来 ──────────────────────────────────────
 *
 * 1. **服务端视图**(`session`):妆面 `lookSpec` / `lookDescription`、有没有照片
 *    `hasFace`、已出的图 `renders`、读过资料的产品 `consultedProducts`、
 *    待确认的出图请求 `pendingRender`、**界面自己摆的那条出图消息** `renderOffer`。
 *    **这一份是权威**,本 store 从不自己造它的字段——刷新后也是靠它恢复的。
 *    ✏️ 2026-09-16:后两个是**互斥**的两种出图入口(见下面那两个 computed);
 *    以前只有 `pendingRender`,于是"用户想要成片"这件事必须由模型开口才成立。
 * 2. **本地气泡**(`messages`):用户与助手说过的话。
 *    ★ **它只活在内存里**,而且**服务端也给不出这一份**(后端刻意不返回 `messages[]`,
 *    见 `application/mapping/turn-view.mapper.ts` 文件头)。所以刷新之后
 *    聊天原文**没有回放**——页面会如实说这一句,而不是假装有记录。
 *
 * ⚠️ **刻意不把聊天原文写进 localStorage。** 设计文档 §9 已拍板「会话内容存服务端,
 *   不是浏览器 localStorage」,而且这里装的是"我要去面试 / 我偏油"这类个人信息。
 *
 * ── ★ 两条硬约束(这个前端没有任何工具能查出它们,注释是唯一的护栏) ────────────
 *
 * 1. **不许静态 `import '@/api/agent'`。** `stores/user.js` 会静态引本 store 来
 *    做 `logout()` 清理,而 `user.js` 在**首屏链**上(router 守卫 → user store)——
 *    静态引就会把 axios 拽进首屏包。做法照 `user.js` 引 `@/api/users` 的先例:
 *    模块作用域只留 `vue` + `pinia`,api 在一个 helper 里**惰性 import**。
 *    (同样理由见 `api/use-mock.js` 的文件头。)
 * 2. **不许 import `stores/user.js`。** 那边引本 store,反过来引就成环。
 *    所以 `userId` 一律**由页面逐次传进来**。
 */
const STORAGE_KEY = 'beauty-app.agent-session'

/**
 * 照片挂上之后要补进气泡的那句话。
 *
 * ★ **它是服务端 `domain/tools/observations.ts` 里那个常量的副本,必须逐字一致。**
 *   服务端确实往会话历史里补了这句(模型据此知道自己有照片了),但**视图刻意不透出它**
 *   (视图不透出任何 `messages[]` 内容)。不补这一句,用户就看不到自己刚传的那一步,
 *   而模型的下一句话会以「你为什么还没传照片」开头。
 *   ⚠️ 服务端那份有测试钉着(`test/demo-llm.test.ts`);这一份**没有任何东西拦着**,
 *   改服务端那句时要一起改这里。
 */
const PHOTO_BUBBLE_TEXT = '(我传了一张本人的正面照片。)'

/** 惰性取 api(理由见文件头硬约束 1)。 */
async function agentApi() {
  return import('@/api/agent')
}

function readPointer() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const saved = raw ? JSON.parse(raw) : null
    // 只认这两个字段:一个不透明的会话 id + 它属于谁。多出来的键一律丢弃。
    if (saved && typeof saved.userId === 'string' && typeof saved.sessionId === 'string') {
      return { userId: saved.userId, sessionId: saved.sessionId }
    }
  } catch {
    /* 隐私模式 / 脏数据:当作没有 */
  }
  return null
}

export const useAgentStore = defineStore('agent', () => {
  // ---- 服务端那份(权威) ----
  const session = ref(null) // AgentSessionView | AgentTurnView | null
  const sessionId = ref('')

  // ---- 本地那份(只活在内存) ----
  const messages = ref([]) // { id, role: 'user'|'assistant', text, renders: number[] }[]
  const facePreviewUrl = ref('') // 本人照的本地预览(objectURL)

  // ---- 瞬时 UI ----
  const waiting = ref('') // 非空 = 正在等一个请求(页面显示它 + 禁用输入)
  const error = ref('') // 只有**网络 / HTTP 层失败**才写这里
  const restoreNote = ref('') // 非空 = 页面顶部那条一次性说明

  const booting = ref(false) // restore() 的幂等闸(dev 的 HMR 会让 onMounted 再跑一次)
  let bubbleSeq = 0

  // ---- 派生:全部读服务端那一份,不在前端另算一遍 ----

  const hasSession = computed(() => sessionId.value.length > 0)
  /** 收到本人照片了没有。★ 服务端只给这一个布尔,不给路径也不给字节。 */
  const hasFace = computed(() => !!session.value?.hasFace)
  /** 已出的图(按 seq 升序;服务端已经排好)。 */
  const renders = computed(() => session.value?.renders || [])
  /**
   * 模型这次会话**读过资料的产品**(按首次读到的顺序,服务端去重)。
   *
   * ★ **恒在的数组,不是"空则无键"** —— 这点与 `pendingRender` 相反、与 `renders` 一致:
   *   它表达的是一条"清单",空清单就是空数组。
   * ⚠️ **它是"读过"的超集,不全是"推荐了"**:模型可能读了 6 条、只推 2 条。
   *   所以页面上的措辞不能说成"为你推荐了这几支"(那是替模型说话),
   *   而要说成"这次参考了这几支"——**角标「品牌参考」就是这个意思**。
   * ★ 角标文案**只能由前端写死**(红线 §13-6 的内容由服务端保证,措辞由我们保证):
   *   见 `AgentView.vue` 里那块展示区。
   */
  const consultedProducts = computed(() => session.value?.consultedProducts || [])
  /** ★ 非空 = **模型**提了一条出图请求、在等用户点确认。 */
  const pendingRender = computed(() => session.value?.pendingRender || null)
  /**
   * ★ **界面按状态自己摆的那条出图消息**(✏️ 2026-09-16 新增)。
   *
   * 妆面定了、照片有了、也没有提议欠着 ⇒ 服务端给这一段,页面**自己**把它渲染成
   * 对话里的一条消息 + 一个「确认生成」按钮。**它和模型说不说话无关** ——
   * 这正是这次改动要的:出图不再串在"模型愿不愿意开口"后面。
   *
   * ⚠️ 它**不是"已经出了"的记录**:出完图之后它照旧在,只是 `alreadyRendered`
   *   变成真、按钮改口叫「再生成一张」。额度用尽时它也在,`left` 是 0(那时不给按钮)。
   * ⚠️ `left` 是 `null` 表示**不限量**(配置成 `AGENT_MAX_RENDERS=0`),
   *   **别把 `null` 和 `0` 混起来**——一个是"随便出",一个是"用完了"。
   */
  const renderOffer = computed(() => session.value?.renderOffer || null)
  /**
   * ★ **页面上唯一的那条出图请求**。两者**不会同时有**(服务端保证),
   *   所以这里取先有的那个就行——**界面上只该有一个出图入口**,
   *   两个按钮指向同一次花钱的话,其中一个必然 422。
   */
  const renderRequest = computed(() => pendingRender.value || renderOffer.value)
  /** 妆面的人话。★ `describeLook` 的唯一渲染,**原样展示,不要自己再拼一遍**。 */
  const lookDescription = computed(() => session.value?.lookDescription || '')
  const brief = computed(() => session.value?.brief || {})
  const hasLook = computed(() => !!session.value?.lookSpec)

  /** seq → 视图里那张图,给模板按气泡里的 seq 取地址用。 */
  const renderBySeq = computed(() => new Map(renders.value.map((r) => [r.seq, r])))

  /**
   * ★ **没有出现在任何气泡里的成品图**(刷新恢复时就是全部)。
   * 页面对它们另起一格「已出的图」——不然那几张图就再也找不到了。
   */
  const orphanRenders = computed(() => {
    const inBubbles = new Set(messages.value.flatMap((m) => m.renders || []))
    return renders.value.filter((r) => !inBubbles.has(r.seq))
  })

  // ---- 内部小工具 ----

  function revoke(url) {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  function pushBubble(role, text, renderSeqs = []) {
    bubbleSeq += 1
    messages.value.push({ id: `m${bubbleSeq}`, role, text, renders: [...renderSeqs] })
  }

  function adopt(view) {
    session.value = view
    sessionId.value = view?.sessionId || ''
  }

  function remember(userId) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ userId, sessionId: sessionId.value })
      )
    } catch {
      /* 存不下就算了,本次会话内仍可用(下次刷新会当新会话) */
    }
  }

  /**
   * 丢掉那条指针。
   * ★ 它只是一个**不透明 id**(服务端还要 `userId` 才认它),所以它不是"会话内容";
   *   但它仍是一条"这台机器用过对话功能"的痕迹,退出登录 / 会话失效时要收掉。
   */
  function forget() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* 同上 */
    }
  }

  // ---- action ----

  /** 没有会话就开一个。返回是否可用。 */
  async function ensureSession(userId) {
    if (!userId) {
      error.value = '还没有登录'
      return false
    }
    if (sessionId.value) return true
    waiting.value = '正在开一段新对话…'
    error.value = ''
    try {
      const api = await agentApi()
      adopt(await api.startAgentSession({ userId }))
      remember(userId)
      return true
    } catch (e) {
      // ★ 服务端 2026-09-16 起会校验 userId 是否存在,所以这里可能拿到 **404
      //   `用户不存在:<id>`**——那不代表代码坏了,它代表**这台浏览器存着的登录
      //   在服务端已经查无此人**(服务端 `dataDir` 被重置过 / 换了库)。
      //   ⚠️ 刻意**不**在这里顺手 `logout()`:那是 user store 的语义
      //   (会影响所有页面),不该由一个页面的会话开不出来时替它决定。这里如实报错。
      error.value = e?.message || '开不了会话,请稍后再试'
      return false
    } finally {
      waiting.value = ''
    }
  }

  /**
   * 挂载时调一次:把上一次会话接回来。
   *
   * ★ **只恢复服务端有的那部分**(妆面 / 有没有照片 / 已出的图 / 待确认框),
   *   并**明说聊天原文没有回放**——服务端刻意不返回 `messages[]`,这不是 bug,
   *   是"要什么给什么"那条取舍。假装有记录比承认没有更糟。
   * ⚠️ 会话存储是**内存实现**,服务端一重启所有会话就没了。那时 `GET` 报 404,
   *   这不是错误、也不能静默:`forget()` + 开一段新的,并在页面上说一句。
   */
  async function restore(userId) {
    if (booting.value) return hasSession.value
    booting.value = true
    restoreNote.value = ''
    try {
      const pointer = readPointer()
      // 换了账号:上一个人那条指针必须丢掉,否则下一次回来会去拉一个不属于自己的会话。
      if (!pointer || !userId || pointer.userId !== userId) {
        forget()
        return await ensureSession(userId)
      }

      waiting.value = '正在接回上次的对话…'
      error.value = ''
      try {
        const api = await agentApi()
        adopt(await api.fetchAgentSession({ sessionId: pointer.sessionId, userId }))
        restoreNote.value =
          '接回了上次的会话:妆面、已出的图、出图那条消息都还在。' +
          '聊天原文没有回放——那些话只存在当前这一屏里。'
        return true
      } catch {
        forget()
        const ok = await ensureSession(userId)
        if (ok) restoreNote.value = '上一段对话已经不在服务端了,这是新开的一段。'
        return ok
      } finally {
        waiting.value = ''
      }
    } finally {
      booting.value = false
    }
  }

  /** 发一句话,跑一整轮。 */
  async function send(userId, text) {
    const trimmed = (text || '').trim()
    if (!trimmed || waiting.value) return false
    if (!(await ensureSession(userId))) return false

    pushBubble('user', trimmed)
    return runTurn(userId, '正在想…', (api) =>
      api.sendAgentMessage({ sessionId: sessionId.value, userId, text: trimmed })
    )
  }

  /**
   * ★ **出图**——全项目唯一会花钱的一次点击。
   *
   * 触发它的是页面上**那唯一一条**出图请求(`renderRequest`):模型提的(`pendingRender`),
   * 或界面自己摆的(`renderOffer`)。**两者走同一条路由、同一个请求体**,
   * 由服务端按会话状态分派(见 `confirm-render.ts` 文件头的两条入口)——
   * 所以这里**没有第二个 api 函数**。
   *
   * ⚠️ 服务端会把那一整轮**重放一遍**(入口 A)或**代递一条提议再跑**(入口 B),
   *   所以这一段比普通一轮长:出图那几秒 + 一次 LLM 往返。等待文案要如实说。
   *
   * 失败时**再拉一次会话视图**:后端那 422 有三个真实原因(缺妆面 / 缺照片 /
   * 上一轮欠着的不是出图请求,还有一种"正在出图"的并发连点),
   * 那条 message 本身就是人话(前端**不按 code 分支**,见 `AGENTS.md` §7.3)。
   * 顺手刷新一次,屏幕上那条**过期的**消息就换成最新的那份,而不是继续诱人点。
   *
   * ⚠️ 那道 `waiting` 守卫是**防连点的第一道**(它一按下去就置位,按钮同时被禁用);
   *   第二道在服务端(按会话的进程内锁)。**两道都是缓解,不是"已经安全了"**:
   *   响应在回程丢了、用户看着屏幕上那条消息又点一次,服务端会当成一个正当的新请求
   *   再出一张。那要幂等键才关得掉,而幂等键要在这条"一个出图参数都不收"的路由上
   *   加客户端输入——**不为这个洞破例**(见 `confirm-render.ts` 的「残余空洞」)。
   */
  async function confirmRender(userId) {
    if (waiting.value || !renderRequest.value) return false
    const ok = await runTurn(userId, '正在出图,大约 7 秒…', (api) =>
      api.confirmAgentRender({ sessionId: sessionId.value, userId })
    )
    if (!ok) await refresh(userId)
    return ok
  }

  /** 只读一次会话视图,不动气泡(确认框过期 / 手抖点重时的收场)。 */
  async function refresh(userId) {
    if (!sessionId.value) return false
    try {
      const api = await agentApi()
      adopt(await api.fetchAgentSession({ sessionId: sessionId.value, userId }))
      return true
    } catch {
      /* 拉不到就保持现状;上面那条错误说明已经在屏幕上了 */
      return false
    }
  }

  /** 跑一轮并把结果落下来。★ 所有"会改变会话"的调用都走这里,免得三处各写一遍。 */
  async function runTurn(userId, label, call) {
    // ★ 先记下"这一轮之前已有哪些图":结束后新增的那几张,就是要挂到
    //   本条气泡下面的**这一轮**的产物(而不是把历史全画一遍)。
    const before = new Set(renders.value.map((r) => r.seq))

    waiting.value = label
    error.value = ''
    try {
      const api = await agentApi()
      const view = await call(api)
      adopt(view)

      // ★ 正文**只**来自服务端这一轮的 `text_delta`,本地一个字都不编。
      //   先前这里还有一句 `|| closingNote(view)` 给 `refusal` 兜底——**已删除**:
      //   那是前端在替服务端擦屁股(服务端当时对"模型拒答且一个字没给"不补话,
      //   落成空气泡)。现在服务端保证每轮收束都有一句话(`agent-loop.ts` 的
      //   `CLOSING_WORDS`),本地再补就会**同一件事说两遍**。
      const text = (view.events || [])
        .filter((e) => e.type === 'text_delta')
        .map((e) => e.text)
        .join('')
      const added = (view.renders || []).filter((r) => !before.has(r.seq)).map((r) => r.seq)
      if (text || added.length > 0) pushBubble('assistant', text, added)
      return true
    } catch (e) {
      error.value = e?.message || '这一轮没说成,请再试一次'
      return false
    } finally {
      waiting.value = ''
    }
  }

  /**
   * 上传本人照片。
   * ★ 这只是"存盘 + 记一笔",**不跑循环**——所以服务端回的是会话视图,
   *   没有 `events` 可播。用户看到的新气泡由本地补(见 `PHOTO_BUBBLE_TEXT`)。
   */
  async function attachPhoto(userId, file) {
    if (waiting.value || !file) return false
    if (!(await ensureSession(userId))) return false

    waiting.value = '正在上传照片…'
    error.value = ''
    try {
      const api = await agentApi()
      adopt(await api.uploadAgentPhoto({ sessionId: sessionId.value, userId, file }))
      pushBubble('user', PHOTO_BUBBLE_TEXT)
      revoke(facePreviewUrl.value)
      facePreviewUrl.value = URL.createObjectURL(file)
      return true
    } catch (e) {
      error.value = e?.message || '照片没传上去,请再试一次'
      return false
    } finally {
      waiting.value = ''
    }
  }

  function clearError() {
    error.value = ''
  }

  function dismissNote() {
    restoreNote.value = ''
  }

  /**
   * 清干净。★ **身份边界就是现场照片的边界**(同 `stores/makeup.js` 的 `reset()`):
   * 退出登录时必须一起收——不清的话换个人登录进来,会话 id 还是上一个人的,
   * 而那个会话里挂着上一个人的本人照片。
   */
  function reset() {
    revoke(facePreviewUrl.value)
    facePreviewUrl.value = ''
    session.value = null
    sessionId.value = ''
    messages.value = []
    waiting.value = ''
    error.value = ''
    restoreNote.value = ''
    booting.value = false
    bubbleSeq = 0
    forget()
  }

  return {
    // 状态
    session,
    sessionId,
    messages,
    facePreviewUrl,
    waiting,
    error,
    restoreNote,
    // 派生
    hasSession,
    hasFace,
    hasLook,
    renders,
    consultedProducts,
    pendingRender,
    renderOffer,
    renderRequest,
    lookDescription,
    brief,
    renderBySeq,
    orphanRenders,
    // action
    ensureSession,
    restore,
    refresh,
    send,
    confirmRender,
    attachPhoto,
    clearError,
    dismissNote,
    reset
  }
})
