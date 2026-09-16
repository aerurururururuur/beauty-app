<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { useUserStore } from '@/stores/user'
import { useAgentStore } from '@/stores/agent'
import { useMock } from '@/api/use-mock'
import { MAX_AGENT_TEXT, renderImageHref } from '@/api/agent'

/**
 * 对话定妆 —— 与 agent 对话把妆面定下来,最后点一次「确认出图」。
 *
 * ── 这一屏的四个判断,都不是随手做的 ──────────────────────────────────────────
 *
 * 1. ★ **`VITE_USE_MOCK=true` 时这里明确说"不可用",不给假对话。**
 *    这是六个 api 模块里**唯一没有 mock 分支**的一条(理由写在 `api/agent.js` 文件头):
 *    对话的状态在服务端一个真实的 `messages[]` 上,而"确认出图"是一条真实的、
 *    会花钱的 HTTP 路由——在浏览器里复刻一份,复刻出来的既不是那条路由、
 *    也不检验那条循环,只会让"看起来能用"和"真的能用"分不清。
 *    ⚠️ 所以下面这道 `isMock` 判断**不是**一个普通的降级,它是决定 4 的落点。
 *
 * 2. ★ **不逐条播放 `events[]` 里的 `tool_start` / `tool_end`。**
 *    它们随整轮**一次性**返回(服务端还不是 SSE),等前端拿到时早就跑完了。
 *    把已经跑完的事演成"正在进行"是**假的进度**——宁可只说一句"正在想"。
 *    等 SSE 接上,这里才该变成真的「正在翻你的衣橱…」。
 *
 * 3. ★ **空会话不伪造一条开场白。** 服务端开会话时一条消息都没有
 *    (`StartSession` 只造一个空会话),而那句话不是模型说的,做成气泡就是撒谎。
 *    所以它是一条**页面级**提示,长得明显不像气泡。
 *
 * 4. ★ **只有网络 / HTTP 层失败才出错误行。** 服务端的五种收束
 *    (`timeout` / `max_iterations` / `max_tokens` / `llm_unavailable` / `refusal`)都已经
 *    往历史里补了一句人话,那句话会**作为助手正文出现在气泡里**;
 *    再叠一个红色报错,就是同一件事说两遍。
 *    ★ **收束话术全部由服务端给**(`agent-loop.ts` 的 `CLOSING_WORDS`),前端**一句都不补**。
 *    这里因此**没有 `stopReason` 分支可看**——那正是本条要的样子:
 *    前端若也按 `stopReason` 补一句,服务端补完前端再补,就是同一件事说两遍。
 */
const router = useRouter()
const user = useUserStore()
const store = useAgentStore()
const isMock = useMock()

const draft = ref('')
const draftEl = ref(null)
const scroller = ref(null)
const fileEl = ref(null)

const busy = computed(() => !!store.waiting)
const tooLong = computed(() => draft.value.length > MAX_AGENT_TEXT)
const canSend = computed(() => draft.value.trim().length > 0 && !busy.value && !tooLong.value)

onMounted(() => {
  if (isMock) return
  // 接回上一次会话(只接服务端有的那部分,见 `stores/agent.js` 的 `restore`)。
  store.restore(user.id)
})

// ---- 滚动:★ 仓库里没有任何先例,这段是这一屏自己加的 ----
//
// `router/index.js` 的全局 `scrollBehavior` 永远回到 `{top:0}`,对一屏对话是错的。
// 做法是让消息区自己 `overflow-y:auto`,新内容进来时滚到底——
// ★ 但**用户手动往上滚过之后就不再抢**:判据是"离底部还有多远",
//   而不是无条件滚。否则用户往回翻记录时会被一直拽下来。
let stickToBottom = true

function onThreadScroll() {
  const el = scroller.value
  if (!el) return
  stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

/** ★ 用户**自己动了手**(发了话 / 传了照片 / 点了确认)⇒ 接下来的新内容要跟着他走。 */
function follow() {
  stickToBottom = true
}

async function scrollToBottom() {
  await nextTick()
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  () => [store.messages.length, store.waiting, store.pendingRender && true],
  () => {
    if (stickToBottom) scrollToBottom()
  }
)

/**
 * ★ **成品图加载完再滚一次,不然等于没滚。**
 *
 * 实测(2026-09-16,headless 走查):图刚进 DOM 时高度是 0,那一刻"滚到底"只滚到
 * 气泡文字的末尾;等图片解码出来,内容又长出三百多像素,而用户看到的还是上面那一段
 * ——**刚出的图正好在屏幕外**,他得自己往下划才看得见。这正是这一屏最要紧的那一下。
 */
function onShotLoad() {
  if (stickToBottom) scrollToBottom()
}

// ---- 输入 ----

/** 输入框跟着内容长高(1 行起步,最高约 5 行)。 */
watch(draft, async () => {
  await nextTick()
  const el = draftEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
})

function onKeydown(e) {
  // ★ 中文输入法下回车是「选词」不是「发送」。不放过它:
  //   打「面试」按回车选词就会把半句话发出去,而且 `preventDefault` 会打断候选框。
  if (e.isComposing || e.keyCode === 229) return
  if (e.key !== 'Enter' || e.shiftKey) return // Shift+Enter = 换行
  e.preventDefault()
  submit()
}

function submit() {
  if (!canSend.value) return
  const text = draft.value
  draft.value = ''
  follow()
  // 失败时把话还给输入框:`send` 失败多半是网络,让用户重按一次比重新打一遍好。
  store.send(user.id, text).then((ok) => {
    if (!ok && !draft.value) draft.value = text
  })
}

// ---- 照片 ----

function pickPhoto() {
  if (busy.value) return
  fileEl.value?.click()
}

function onFilePicked(e) {
  const file = e.target.files?.[0]
  // 选完就把 input 清空:不清的话选同一张第二次不会触发 change。
  e.target.value = ''
  if (!file) return
  // 客户端先挡一道,省一次白跑的 422(后端也会挡)。
  if (!file.type.startsWith('image/')) {
    store.clearError()
    errorNote.value = '这里只收图片文件'
    return
  }
  errorNote.value = ''
  // ★ 传完**不自动发一句话**:出图那一步由用户自己决定什么时候提。
  follow()
  store.attachPhoto(user.id, file)
}

/** 页内瞬时提示(不属于 store 的跨页状态,见 `AGENTS.md` §3.3)。 */
const errorNote = ref('')

// ---- 出图确认 ----

function onConfirm() {
  follow()
  store.confirmRender(user.id)
}

function onDecline() {
  follow()
  store.declineRender(user.id)
}

// ---- 成品图地址 ----

/** ★ 路径型 URL 要补 `API_BASE`,还要补 `?userId=`(取图靠查询串判归属)。 */
function hrefFor(seq) {
  const render = store.renderBySeq.get(seq)
  return render ? renderImageHref(render.url, user.id) : ''
}

function captionFor(seq) {
  return store.renderBySeq.get(seq)?.lookDescription || ''
}
</script>

<template>
  <div class="page chat-page">
    <header class="page-header">
      <button class="back-btn" aria-label="返回" @click="router.push('/')">
        <Icon name="arrowLeft" :size="16" />
      </button>
      <div class="title">对话定妆</div>
      <div class="spacer" />
      <span v-if="!isMock" class="caps">{{ store.hasLook ? '已定妆面' : '还没定妆' }}</span>
    </header>

    <!-- ★ 决定 4 的落点:mock 模式下明确说不可用,不给假对话(见文件头 1)。 -->
    <section v-if="isMock" class="card notice-card">
      <div class="caps">OFFLINE</div>
      <h2 class="card-title">对话功能需要真实后端</h2>
      <p class="card-sub">
        这一屏要跟服务端来回好几轮(定妆面、收照片、确认出图),其中"确认出图"还会真的调一次引擎。
        浏览器里的演示后端复刻不了这条链路——所以这里不演一个假的。
      </p>
      <p class="notice-how">
        想看这条链路:起后端(<code>cd server &amp;&amp; npm run dev</code>),
        再把 <code>vue/.env</code> 里的 <code>VITE_USE_MOCK</code> 设成 <code>false</code> 重启。
        ⚠️ 缺省配置(<code>AGENT_LLM=mock</code> + <code>MAKEUP_ENGINE=mock</code>)是<strong>离线</strong>的,
        不联网也不花钱——够把整条链路走一遍。
      </p>
      <button class="btn btn-ghost btn-block" @click="router.push('/upload')">
        <Icon name="upload" :size="16" />
        改用「开始配妆」那条路
      </button>
    </section>

    <template v-else>
      <!-- 恢复提示:只说这次是"接回来的",并明说聊天原文没有回放 -->
      <p v-if="store.restoreNote" class="restore-note">
        {{ store.restoreNote }}
        <button class="text-link" @click="store.dismissNote()">知道了</button>
      </p>

      <div ref="scroller" class="thread" @scroll="onThreadScroll">
        <!-- ★ 空会话不伪造开场白(见文件头 3):它不是气泡。
             已经在聊的会话(刷新恢复过来的)也不再显示这句——妆面都定了,
             再问"你要去哪儿"是装没看见。那时说话的应该是下面那张妆面卡。 -->
        <p v-if="store.messages.length === 0 && !store.hasLook" class="thread-hint caps">
          说说你要去哪儿 —— 面试、约会、见家长、上台,我帮你定一套
        </p>

        <template v-for="m in store.messages" :key="m.id">
          <div v-if="m.role === 'user'" class="row-user">
            <p class="bubble">{{ m.text }}</p>
          </div>
          <div v-else class="row-bot">
            <p v-if="m.text" class="bot-text">{{ m.text }}</p>
            <figure v-for="seq in m.renders" :key="seq" class="shot">
              <img :src="hrefFor(seq)" alt="成品图" @load="onShotLoad" />
              <figcaption class="shot-cap">{{ captionFor(seq) }}</figcaption>
            </figure>
          </div>
        </template>

        <!-- 刷新恢复的图不在任何气泡里,另起一格(不然那几张就找不到了) -->
        <section v-if="store.orphanRenders.length" class="card shots-card">
          <div class="caps">已出的图</div>
          <figure v-for="r in store.orphanRenders" :key="r.seq" class="shot">
            <img :src="renderImageHref(r.url, user.id)" alt="成品图" @load="onShotLoad" />
            <figcaption class="shot-cap">{{ r.lookDescription }}</figcaption>
          </figure>
        </section>

        <!-- ★ 服务端那份妆面说法的**唯一**渲染位:`describeLook` 的结果原样展示 -->
        <section v-if="store.lookDescription" class="card look-card">
          <div class="caps">当前妆面</div>
          <p class="look-text">{{ store.lookDescription }}</p>
          <p v-if="!store.hasFace" class="look-note">
            出图前还需要一张你的正面照。
          </p>
        </section>

        <!-- 模型这次读了资料的产品(§13-6 的落地)。
             ★ 位置紧跟在妆面之后:产品本来就是在妆面定下来之后才谈的。
             ⚠️ 角标文案「品牌参考」由**前端写死**,不由模型生成 ——
                "推广必须可辨认"这件事不能取决于模型那次怎么措辞。
                也确实是「品牌参考」:这是品牌资料,里面那句"社交平台用户反馈摘要"
                摘自品牌资料,**不是我们采集的口碑**。
                ⚠️ 只有真收了钱才该写「赞助」:少标一个字只是不够显眼,多标一个字是虚假披露。
             ★ 措辞是「这次参考了」而不是「为你推荐了」:服务端记的是**读过**的产品,
                它是推荐的超集(读了 6 条、只推 2 条是常事)——说成"推荐了"是替模型说话。
             ★ 为空时**整块不渲染**:一份空清单硬贴个标题只是噪声。 -->
        <section v-if="store.consultedProducts.length" class="card products-card">
          <div class="products-head">
            <span class="caps">这次参考了</span>
            <span class="ref-role">品牌参考</span>
          </div>
          <ul class="product-list">
            <li v-for="p in store.consultedProducts" :key="p.id" class="product-row">
              <span class="product-name">{{ p.name }}</span>
              <span class="product-cat">{{ p.categoryLabel }}</span>
            </li>
          </ul>
        </section>

        <p v-if="store.waiting" class="waiting">{{ store.waiting }}</p>
        <!-- 只有网络 / HTTP 层失败才出这一行(见文件头 4) -->
        <p v-else-if="store.error" class="error-line">{{ store.error }}</p>
      </div>

      <!-- 确认卡:服务端说了什么就显示什么,一个字的措辞都不自己加 -->
      <section v-if="store.pendingRender" class="card confirm-card">
        <div class="caps">需要你确认</div>
        <p class="confirm-text">{{ store.pendingRender.summary }}</p>
        <div class="confirm-actions">
          <!-- ★ 两个按钮都要在等待时禁用,不是只禁点下去的那个: -->
          <!--   若在"一句话那一轮"还在飞的时候按下确认,那句话会先把待确认按 declined -->
          <!--   了结掉,接着 render 就撞 422 —— 用户却以为自己在确认出图。 -->
          <button class="btn btn-primary" :disabled="busy" @click="onConfirm">
            <Icon name="sparkle" :size="15" />
            确认出图
          </button>
          <button class="btn btn-ghost" :disabled="busy" @click="onDecline">先不出图</button>
        </div>
      </section>

      <div class="composer">
        <input ref="fileEl" type="file" accept="image/*" hidden @change="onFilePicked" />
        <button
          class="cam-btn"
          :class="{ pending: !store.hasFace }"
          :disabled="busy"
          :aria-label="store.hasFace ? '换一张本人照片' : '上传本人照片'"
          @click="pickPhoto"
        >
          <Icon name="camera" :size="17" />
        </button>
        <img v-if="store.facePreviewUrl" class="face-thumb" :src="store.facePreviewUrl" alt="" />
        <span v-else-if="store.hasFace" class="tag face-tag">已上传本人照片</span>

        <textarea
          ref="draftEl"
          v-model="draft"
          class="draft"
          rows="1"
          :disabled="busy"
          :placeholder="store.hasFace ? '还想调哪里?' : '说一句你要去哪儿…'"
          @keydown="onKeydown"
          @input="errorNote = ''"
        />
        <button class="btn btn-primary send-btn" :disabled="!canSend" @click="submit">发送</button>
      </div>

      <p v-if="tooLong" class="foot-note warn">
        消息最多 {{ MAX_AGENT_TEXT }} 字,现在 {{ draft.length }} 字
      </p>
      <p v-else-if="errorNote" class="foot-note warn">{{ errorNote }}</p>
      <p v-else class="foot-note">回车发送 · Shift + 回车换行</p>
    </template>
  </div>
</template>

<style scoped>
/*
 * ★ 本页复写全局 `.page`:一屏对话要**固定高度**、由消息区自己滚,
 *   输入框才能吸在底部。全局那份是 `min-height`(整页滚),在这里不成立。
 *   两条 `height` 是有意的:`dvh` 在移动端才不会因为地址栏伸缩而跳,
 *   不认它的浏览器用前一条 `100vh`。
 */
.page {
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  padding-bottom: 14px;
  gap: 12px;
}

/* ---------- 恢复提示 ---------- */
.restore-note {
  margin: 0;
  padding: 9px 12px;
  border-left: 2px solid var(--c-gold);
  background: var(--c-surface-2);
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--c-ink-soft);
}

.restore-note .text-link {
  margin-left: 4px;
}

/* ---------- 消息区 ---------- */
.thread {
  flex: 1 1 auto;
  min-height: 0; /* ★ 少了它 flex 子项不会收缩,滚动条永远不出现 */
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 2px;
}

.thread-hint {
  margin: 10px 2px;
  line-height: 1.9;
  letter-spacing: 0.08em;
}

.row-user {
  display: flex;
  justify-content: flex-end;
}

.bubble {
  margin: 0;
  max-width: 82%;
  padding: 9px 13px;
  border-radius: var(--radius);
  border-bottom-right-radius: var(--radius-sm);
  background: var(--c-surface-2);
  font-size: 13.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.row-bot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

/* 助手的话不套气泡:一屏里两边都是气泡,读起来像两个人在吵架。 */
.bot-text {
  margin: 0;
  max-width: 92%;
  font-size: 13.5px;
  line-height: 1.85;
  color: var(--c-ink);
  white-space: pre-wrap;
  word-break: break-word;
}

.shot {
  margin: 0;
  max-width: 92%;
}

.shot img {
  width: 100%;
  border-radius: var(--radius);
  border: 1px solid var(--c-line);
  box-shadow: var(--shadow-soft);
}

.shot-cap {
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--c-ink-faint);
}

.shots-card,
.look-card,
.products-card {
  padding: 16px;
}

.shots-card .shot,
.look-card .shot {
  margin-top: 12px;
  max-width: 100%;
}

/* ---------- 妆面卡 ---------- */
.look-text {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.9;
}

.look-note {
  margin: 10px 0 0;
  font-size: 11.5px;
  color: var(--c-accent);
}

/* ---------- 参考产品卡 ---------- */
.products-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 角标样式照抄 `ResultView.vue` 的 `.ref-role`(那儿已有彩色 pill 的先例)——
   两个页面的 `<style>` 都是 scoped,所以只能各写一份,不是重复定义。 */
.ref-role {
  font-size: 10px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  color: var(--c-accent);
  background: var(--c-accent-soft);
  flex-shrink: 0;
}

.product-list {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.product-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  border-top: 1px solid var(--c-line);
  font-size: 12.5px;
  line-height: 1.7;
}

/* 第一条不画线——上面紧挨着就是标题,再来条横线像分隔符 */
.product-row:first-child {
  border-top: none;
}

.product-name {
  min-width: 0;
  /* 产品名里有大段英文(Pure Shots Clean Reboot Cleanser…),不给它断点会顶破卡片 */
  overflow-wrap: break-word;
}

.product-cat {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--c-ink-faint);
}

/* ---------- 等待 / 错误 ---------- */
.waiting,
.error-line {
  margin: 0;
  font-size: 12px;
  color: var(--c-ink-faint);
}

.error-line {
  color: var(--c-accent);
  line-height: 1.7;
}

/* ---------- 确认卡 ---------- */
.confirm-card {
  border-color: var(--c-accent);
  padding: 16px;
}

.confirm-text {
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.8;
}

.confirm-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.confirm-actions .btn {
  flex: 1;
  padding: 0 12px;
}

/* ---------- 输入区 ---------- */
.composer {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--c-line);
  padding-top: 12px;
}

.cam-btn {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--c-line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-ink-soft);
  transition: border-color 0.15s ease, color 0.15s ease;
}

/* 还没照片时它得显眼一点:它是这条路唯一的入口 */
.cam-btn.pending {
  border-color: var(--c-accent);
  color: var(--c-accent);
}

.cam-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.face-thumb {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 50%;
  border: 1px solid var(--c-line);
}

.face-tag {
  flex: 0 0 auto;
}

/* ⚠️ 与 `.text-input`(LoginView / UploadView / CabinetView 各一份)形状相近,
   但**没有**沿用那个类名:本页要的是多行、会自己长高的输入框,
   直接复用会让人以为它是同一套控件。见 `AGENTS.md` §5.2 那条已知重复。 */
.draft {
  flex: 1 1 auto;
  min-width: 0;
  resize: none;
  overflow-y: auto;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--radius-sm);
  background: var(--c-surface);
  color: var(--c-ink);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  padding: 10px 12px;
  outline: none;
}

.draft:disabled {
  opacity: 0.5;
}

.send-btn {
  flex: 0 0 auto;
  height: 40px;
  padding: 0 18px;
}

/* ---------- 脚注 ---------- */
.foot-note {
  margin: 0;
  text-align: center;
  font-size: 10.5px;
  color: var(--c-ink-faint);
}

.foot-note.warn {
  color: var(--c-accent);
}

/* ---------- mock 提示卡 ---------- */
.notice-card {
  margin-top: 8px;
}

.notice-how {
  font-size: 11.5px;
  line-height: 1.9;
  color: var(--c-ink-soft);
  margin: 0 0 16px;
}

.notice-how code {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--c-surface-2);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}
</style>
