<template>
  <FlowTopbar
    back-to="/create"
    title="开始设计"
    :steps="['1 选场景', '2 选形象', '3 填信息', '4 生成方案']"
    :active-step="3"
  />

  <main class="content content--flow">
    <div class="flow-head">
      <h1 class="form-title">{{ form?.name || '' }}</h1>
      <p class="form-sub">{{ form?.tagline || '' }} · 告诉我们更多细节，AI 才能给得准</p>
    </div>

    <!-- 当前代入的人设:肤色与面部特征由档案带出,可回人设库换一份 -->
    <div v-if="persona" class="persona-bar">
      <PersonaAvatar :persona="persona" :size="44" />
      <div class="persona-bar__body">
        <div class="persona-bar__name">本次为「{{ persona.name }}」设计</div>
        <div class="persona-bar__meta">
          {{ persona.skinToneName || '未定档' }}{{
            persona.featureNames.length ? ` · ${persona.featureNames.join('、')}` : ' · 未标面部特征'
          }}
        </div>
        <!-- ★ 占位图出不了图,而那次失败只报在服务端日志里(见 `personaPlaceholder`) —— 话摆这儿 -->
        <div v-if="personaPlaceholder" class="persona-bar__warn">
          这张脸只有示例占位图，出不了成片。请到人设库给它换一张真实照片。
        </div>
      </div>
      <RouterLink class="persona-bar__switch" :to="{ path: '/personas', query: personaQuery }">换一份</RouterLink>
    </div>

    <!--
      今日天气:可选,不拉也能提交。
      ★ 拉不到 / 服务端标了「离线示意」时**整块不出现**——不标来源就不摆一份编出来的天气。
    -->
    <div class="weather-bar">
      <div class="weather-bar__row">
        <input
          v-model="city"
          class="weather-bar__input"
          type="text"
          :maxlength="MAX_CITY"
          placeholder="城市（例如：上海），回车即可查"
          @keyup.enter="lookupByCity"
        />
        <button class="btn btn--soft" type="button" :disabled="weatherLoading" @click="lookupByCity">
          查天气
        </button>
        <button class="btn btn--soft" type="button" :disabled="weatherLoading" @click="useMyLocation">
          用当前位置
        </button>
      </div>
      <p v-if="weatherLine || weatherNote" class="weather-bar__state">{{ weatherLine || weatherNote }}</p>
    </div>

    <!--
      字段依场景而定(旅行 4 格、面试 6 格),一格一个 tab,切着看而不是一路下滑。
      ★ 面板用 `v-show` 不是 `v-if`:留着重进时 textarea 的滚动位置还在。
    -->
    <nav class="field-tabs">
      <button
        v-for="f in fields"
        :key="f.key"
        type="button"
        class="field-tab"
        :class="{ 'field-tab--on': f.key === activeKey }"
        @click="activeKey = f.key"
      >
        {{ f.label }}
      </button>
    </nav>

    <div class="form-fields">
      <section v-for="f in fields" v-show="f.key === activeKey" :key="f.key" class="info-field">
        <header class="info-field__head">
          <h3 class="info-field__label">
            {{ f.label }}
            <span v-if="f.required" class="info-field__req">必填</span>
            <span v-else class="info-field__opt">选填</span>
          </h3>
        </header>
        <p class="info-field__hint">{{ f.hint || '' }}</p>

        <!--
          ★ 文字与图片**不互斥**:两个块同时摆着,想填哪个填哪个、也可以都填。
            `collectFields` 照样两种都收,`type` 会记成 'both'。
        -->
        <div class="info-field__pane">
          <span class="info-field__pane-label">文字描述</span>
          <textarea v-model="inputs[f.key].text" class="info-field__input" rows="3" :placeholder="f.placeholder || ''"></textarea>
          <!--
            预设选项是快捷输入,与手写的文字一起提交(不是二选一)。
            ★ 级联格(`f.cascade`)上游没选时 `optionsOf` 返回 `null` —— 那时摆的是
              `f.lockHint` 那句话,不是一排点了也没有下文的 chip。
          -->
          <div v-if="optionsOf(f) === null" class="opt-locked">{{ f.lockHint }}</div>
          <div v-else-if="optionsOf(f).length" class="info-field__opts">
            <button
              v-for="o in optionsOf(f)"
              :key="o"
              type="button"
              class="opt-chip"
              :class="{ 'opt-chip--on': inputs[f.key].opts.includes(o) }"
              @click="toggleOpt(f.key, o)"
            >
              {{ o }}
            </button>
          </div>
        </div>

        <div class="info-field__pane">
          <span class="info-field__pane-label">上传图片</span>
          <div class="uploader">
            <div class="uploader__slots">
              <div v-for="(img, i) in inputs[f.key].images" :key="img.url" class="uploader__slot">
                <img :src="img.url" alt="" />
                <button class="uploader__del" type="button" @click="dropImage(f.key, i)">×</button>
              </div>
              <label class="uploader__add">
                <Icon name="plus" :size="20" color="var(--color-text-disabled)" />
                <input type="file" accept="image/*" multiple hidden @change="onFiles(f.key, $event)" />
              </label>
            </div>
            <p class="uploader__tip">点击上传图片，支持多张</p>
          </div>
        </div>
      </section>
    </div>

    <!-- ★ 提交会顺带读参考图(会花钱),先说清;没传图 / 这个部署读不了时这一句不出现 -->
    <p v-if="willReadImages" class="form-read-note">提交时会读你传的参考图，一次读图调用会花钱。</p>

    <footer class="form-actions">
      <RouterLink class="btn btn--soft" :to="{ path: '/personas', query: personaQuery }">上一步</RouterLink>
      <!-- ★ 没走到最后一格时主按钮是「下一步」:不给它,两头的按钮长得一模一样,
           用户不知道后面还有几格没看 -->
      <button
        v-if="activeIndex < fields.length - 1"
        class="btn btn--primary"
        type="button"
        @click="nextField"
      >
        下一步
      </button>
      <button v-else class="btn btn--primary" :disabled="design.generating" @click="onSubmit">
        {{ design.generating ? '正在配妆…' : '生成我的妆容' }}
      </button>
    </footer>
    <!-- 后端给的那句人话原样展示,前端不按 code 分支（AGENTS.md §7.3） -->
    <ErrorNote :text="design.error" />
  </main>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { briefWeatherOf, getFieldOptions } from '@/api/design'
import { MAX_CITY, fetchWeather } from '@/api/weather'
import ErrorNote from '@/components/ErrorNote.vue'
import FlowTopbar from '@/components/FlowTopbar.vue'
import Icon from '@/components/Icon.vue'
import PersonaAvatar from '@/components/PersonaAvatar.vue'
import { useObjectUrls } from '@/composables/useObjectUrls'
import { useQueryParam } from '@/composables/useQueryParam'
import { useUserStore } from '@/stores/user'
import { usePersonasStore } from '@/stores/personas'
import { useDesignStore } from '@/stores/design'

/**
 * 开始设计 · 第 3 步:填信息。
 *
 * ★ 动线是固定的:场景 → 人设库选一张脸 → 本页。**没有 `?persona=` 就回人设库**,
 *   不允许跳过——肤色与面部特征都从那份档案带出来,跳过了结果页就没有可个性化的依据。
 *
 * ★ 每个字段**文字与图片两个块同时摆着**,想填哪个填哪个、也可以都填——
 *   不搞切换(`collectFields` 的 `type` 记下实际用了哪种:'text' / 'image' / 'both')。
 *
 * ★★ 这一屏就是「填完交给 agent」那一下。提交时会做三次握手
 *   (建会话 → 传脸 → 开场那句话,见 `stores/design.js` 的 `submit`)。
 *   ⇒ 所以按钮**会有真的等待**(最长 90 秒),文案也照实说「正在配妆…」——
 *     它不再是假等待屏(那条规矩随本地推导一起作废了,见 `vue/AGENTS.md` §8-4)。
 *
 * ✏️ 2026-09-30:参考图会送给 agent —— 每个 `kind` 只送一张(后端槽就一个),
 *   多出来的不静默丢,`toBrief` 会在 `sceneText` 里照实写。
 *   ⚠️ **只有 `canAnalyzeFace` 为真时才送**(那两条路由缺省不注册,传了就是 404)。
 *   ✏️ 2026-10-03:读图**也在提交这一下走**(`design.submit` 里,开场白之前)——它读出来的
 *   肤色 / 场景 / 风格是 agent 配妆的输入,赶在 `propose_look` 之前进会话才有用。
 *   ⚠️ 那是**付费**调用,所以下面那句提示必须留着(不传图时不出现)。
 *
 * ✏️ 2026-09-30:本页可以拉当日天气(手填城市 / 用当前位置,后端 `GET /weather`),随 `brief` 交给 agent。
 *   它是**可选**的:拉不到照样提交,失败只落在天气那一块,**不写 `design.error`**。
 *   ★ 非实况来源的天气**既不摆也不进 brief**(判据见 `api/design.js` 的 `briefWeatherOf`)。
 *
 * ★ 图片预览走 `URL.createObjectURL`,用完**必须 revoke**——否则每选一张图就漏一份内存,
 *   而且 blob URL 会把文件一直钉在内存里直到刷新。这条生命周期收在 `useObjectUrls` 里,
 *   本页只负责「移除某一张时 release 它」,离开页面那一步由那个 composable 兜底。
 *
 * ✏️ 步骤条与源站略有出入:源站的 form.html 写的是「1 选场景 / 2 填信息 / 3 生成方案」
 *    (少一步「选形象」,于是"2"在这一屏指填信息、在上一屏指选形象)。
 *    这里统一成与 create / personas / result 一致的 4 步,本屏高亮第 3 步。
 */
const router = useRouter()
const user = useUserStore()
const personas = usePersonasStore()
const design = useDesignStore()

// ★ `scene` 的兜底是 'party'(不是 ''):直接打开 /form 时也得能配出一套
const sceneId = useQueryParam('scene', 'party')
const personaId = useQueryParam('persona')

const persona = ref(null)
const form = computed(() => design.form)

/** 每格字段的输入态:`{ [key]: { text, opts, images } }`。 */
const inputs = ref({})

/**
 * 让每一格字段都**先有**一个输入态——这是渲染的前提,不是收尾工作。
 *
 * ★ 为什么必须在这里、而不是 `onMounted`:首屏渲染**早于** `onMounted`,而 `form` 住在
 *   store 里、跨页面活着,`inputs` 是本页的。第二次进本页(「换一份」/「上一步」回去换张脸、
 *   或 HMR 重挂)时,首屏就有字段了而 `inputs` 还是空的,模板里的 `inputs[f.key].text`
 *   会报 `Cannot read properties of undefined`。`immediate` 会在 setup 里同步跑一次,
 *   早于首次渲染,于是「渲染出来的字段一定有输入态」成了一条结构性保证,不靠时序凑巧。
 * ★ 已填过的格子**不覆盖**:换场景时同一格重进,用户写下的东西不该被清掉。
 * ★ `defaultOpts` 是这一格的**预选值**(目前只有「场合」那一格用:场景名,
 *   见 `api/design.js` 的 `getSceneForm`)。不读它,那一格就是空的 —— 而用户看到的
 *   会是一个本该填好的空白格,提交上去 `occasion` 就少了一截。
 */
watch(
  form,
  (next) => {
    const seeded = {}
    for (const f of next?.fields || []) {
      seeded[f.key] =
        inputs.value[f.key] ||
        { text: '', opts: [...(f.defaultOpts || [])], images: [] }
    }
    inputs.value = seeded
  },
  { immediate: true }
)

/* --------------------------- 字段 tab --------------------------- */

/**
 * 当前展开的那一格。★ 存的是**字段键**不是下标——换场景时下标会指到另一格上去。
 * ★ `immediate` 是前提不是收尾:首屏渲染早于 `onMounted`,不在这里先定一次,
 *   第一帧就是「tab 全不亮、下面也没有面板」。
 */
const activeKey = ref('')

const fields = computed(() => form.value?.fields || [])

/** 没找到时是 -1;模板据此决定摆「下一步」还是「生成我的妆容」。 */
const activeIndex = computed(() => fields.value.findIndex((f) => f.key === activeKey.value))

function nextField() {
  const next = fields.value[activeIndex.value + 1]
  if (next) activeKey.value = next.key
}

watch(
  fields,
  (list) => {
    if (!list.some((f) => f.key === activeKey.value)) activeKey.value = list[0]?.key || ''
  },
  { immediate: true }
)

/* --------------------------- 级联选项 --------------------------- */

/** 级联链上游的当前取值,交给 `getFieldOptions` 查表。只认链上那几格。 */
function currentValues() {
  const first = (key) => inputs.value[key]?.opts?.[0] || ''
  return { industry: first('industry'), relation: first('relation'), place: first('place') }
}

/**
 * 这一格当前该显示的选项。
 * ★ 级联格(`f.cascade`)的选项**不写在字段上**(那里是空数组),由上游现算;
 *   上游还没选 ⇒ 返回 `null`(模板据此显示 `f.lockHint`);非级联格就是字段自带那份。
 */
function optionsOf(f) {
  if (!f.cascade) return f.options || []
  return getFieldOptions({ sceneId: sceneId.value, fieldKey: f.key, values: currentValues() })
}

/**
 * 级联失效清理:上游一改,下游原来选的那个可能已经不在新选项里了。
 * ★ **必须清掉。** 留着的话 `collectFields` 会把它照常提交 —— 用户看到的是新地点,
 *   送出去的却还是上一个对象对应的旧地点,而界面上看不出任何异常。
 * ★ 按字段顺序走这一遍瀑布:清完「地点」再算「穿搭」,顺序反了穿搭就清不干净。
 */
watch(
  inputs,
  () => {
    for (const f of form.value?.fields || []) {
      if (!f.cascade) continue
      const picked = inputs.value[f.key]?.opts || []
      if (!picked.length) continue
      const opts = optionsOf(f)
      if (!opts || !picked.every((o) => opts.includes(o))) inputs.value[f.key].opts = []
    }
  },
  { deep: true }
)

const personaQuery = computed(() => ({ scene: sceneId.value, pick: '1' }))

/**
 * 这张脸是不是**只有示例占位图**:后端种子表那两张 SVG 是唯一的 `'static'` 来源。
 * ★ 必须在这儿说 —— 出图引擎不收 SVG,而那次失败**只写在服务端日志里**(`/render` 照样回 200),
 *   用户点了「确认生成」既没图也没话。这一屏是他唯一还来得及换照片的地方。
 */
const personaPlaceholder = computed(() => persona.value?.photoSource === 'static')

onMounted(async () => {
  // ★★ **必须 `await`。** 人设现在从服务端拉(`stores/personas.js` 的 `load` 是异步的),
  //   不等它回来就读 `getById`,列表还是空的 ⇒ **每一张脸都会被判成「没有这份人设」**,
  //   于是用户刚挑好的人被静默踢回人设库,而且看不出发生了什么(本仓的头号形状)。
  await personas.load(user.id)
  const p = personas.getById(personaId.value)
  if (!p) {
    // 没有（或已删掉）那份人设:回人设库重选一份,别在这一屏留一个空壳
    router.replace({ path: '/personas', query: personaQuery.value })
    return
  }
  persona.value = p
  // 输入态由上面那个 `watch(form, …)` 补,这里只管换/定表单定义
  design.loadForm(sceneId.value)
})

/* --------------------------- 今日天气 --------------------------- */

/**
 * 四个 ref 只这一屏用得到(§3 第 3 条),提交时随 `design.submit` 送给 `toBrief`。
 * ★ **不放进 `onMounted`**:那时没有城市可查,而进页面就弹定位权限框是在替用户做决定。
 */
const city = ref('')
/** 这次拉回来的那份 `WeatherView`(形状见 `server/.../weather-view.ts`)。 */
const weather = ref(null)
/** 有请求在飞。两个按钮都拿它禁用。 */
const weatherLoading = ref(false)
/** 输入框下面那一句:正在查 / 后端给的人话 / 本地提示。**不是** `design.error`。 */
const weatherNote = ref('')

/** 那一行天气。★ 空串 = **整行不出现**(没拉 / 拉不到 / 服务端标了「离线示意」)。 */
const weatherLine = computed(() => {
  const w = briefWeatherOf(weather.value)
  if (!w) return ''
  return [
    w.condition,
    w.temperatureC !== undefined ? `${w.temperatureC}℃` : '',
    w.humidityPct !== undefined ? `湿度 ${w.humidityPct}%` : '',
    w.uvIndex !== undefined ? `紫外线 ${w.uvIndex}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
})

/**
 * 拉一次。★ 失败**不写 `design.error`**:天气是可选的,拉不到照样能提交。
 * ★ 拉之前**先清掉上一份**——留着它就是一份对不上新城市的旧值。
 */
async function lookup(params, note) {
  if (weatherLoading.value) return
  weatherLoading.value = true
  weather.value = null
  weatherNote.value = note
  try {
    weather.value = await fetchWeather(params)
    // 非实况那份由 `briefWeatherOf` 挡住(既不上屏也不进 brief),这里只补一句人话。
    weatherNote.value = briefWeatherOf(weather.value)
      ? ''
      : '这次没取到实时天气，可以在描述里自己写一句'
  } catch (e) {
    weatherNote.value = e?.message || '这次没能取到天气，稍后再试也可以'
  } finally {
    weatherLoading.value = false
  }
}

/** 手填城市那条路。★ 空城市就地拦下、不发请求(后端那句 `LOCATION_REQUIRED` 是给排查的人看的)。 */
function lookupByCity() {
  const value = city.value.trim()
  if (!value) {
    weatherNote.value = '先填一个城市，或者点右边「用当前位置」'
    return
  }
  lookup({ city: value }, '正在查天气…')
}

/** 定位那条路。★ 不支持 / 拒绝 / 超时**都不算失败**:另一条路还在,只留一句提示。 */
function useMyLocation() {
  if (!navigator?.geolocation) {
    weatherNote.value = '这个浏览器不支持定位，填一个城市也一样'
    return
  }
  weatherNote.value = '正在取定位…'
  navigator.geolocation.getCurrentPosition(
    (pos) => lookup({ lat: pos.coords.latitude, lon: pos.coords.longitude }, '正在查天气…'),
    () => {
      weatherNote.value = '没拿到定位，填一个城市也一样'
    },
    { timeout: 10000, maximumAge: 600000 }
  )
}

/* --------------------------- 图片预览 --------------------------- */

/**
 * 预览图的生命周期交给 `useObjectUrls`(红线:create 了就必须 revoke)。
 * 移除时 release 一个,离开页面时它自动收掉剩下的——本页不再自己写 `onBeforeUnmount`。
 */
const { create: createPreviewUrl, release: releasePreviewUrl } = useObjectUrls()

function onFiles(key, event) {
  const files = [...(event.target.files || [])]
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    // ★ 预览地址给眼睛用,`file` **给上传用** —— 两个都要留住。
    //   只留 `url` 的话,提交时手上就没有字节了:那个 `blob:` 地址是 fetch 不回来的
    //   (它只在本文档内解析),而要把字节拿回来,本来就得靠当初这个 `File`。
    inputs.value[key].images.push({ url: createPreviewUrl(file), file })
  }
  event.target.value = ''
}

/**
 * 预设选项:再点一次就取消。它与手写的文字一起进 `collectFields`。
 * ★ `f.single` 的格子(级联链上的那四格)**一次只亮一个**:多选时「地点随哪个对象变」
 *   根本没有答案。其余格子照旧多选。
 */
function toggleOpt(key, option) {
  const picked = inputs.value[key].opts
  const at = picked.indexOf(option)
  if (at >= 0) {
    picked.splice(at, 1)
    return
  }
  const single = (form.value?.fields || []).find((f) => f.key === key)?.single
  if (single) picked.splice(0, picked.length, option)
  else picked.push(option)
}

function dropImage(key, index) {
  const [gone] = inputs.value[key].images.splice(index, 1)
  if (gone) releasePreviewUrl(gone.url)
}

/* --------------------------- 提交 --------------------------- */

/**
 * 收集:每格都保留文字与图片两种输入,`type` 说明这一格实际用了哪种。
 *
 * ★ **`images` 与 `files` 是两份**:`images` 是预览地址(给人看,`toBrief` 拿它数数),
 *   `files` 才是要送出去的**字节**(`stores/design.js` 送去 `/agent/sessions/:id/images`)。
 *   别把两份合成一份 —— 合并之后 `toBrief` 那句「用户上传了 N 张图片」就会开始数错。
 */
function collectFields() {
  return (form.value?.fields || []).map((f) => {
    const input = inputs.value[f.key]
    const text = [input.text.trim(), ...input.opts].filter(Boolean).join('；')
    const images = input.images.map((img) => img.url)
    const files = input.images.map((img) => img.file).filter(Boolean)
    return {
      key: f.key,
      type: text && images.length ? 'both' : images.length ? 'image' : 'text',
      text,
      images,
      files,
    }
  })
}

/**
 * 人设照片 → 要上传的那个文件。
 *
 * ★ 人设照片现在是**两种**来源(2026-09-30 起都是**服务端给的一个地址**):
 *   用户自己传的那份走 `/personas/<id>/photo?userId=`,种子那几份是 `public/` 下的静态 SVG。
 *   两种都能被 `fetch` 读成字节,所以这里不分支
 *   ——分支就会出现「种子人设传不上去」这种只有挑特定脸才会遇到的怪毛病。
 *   ★ 那个 URL 由 `decoratePersona` 拼好(已带 `API_BASE` 与 `?userId=`),本页不自己拼。
 * ★ 没有照片时返回 null:那就不传,让 agent 去要一张(结果页会显示 `hasFace=false`)。
 */
async function faceFileOf(p) {
  if (!p?.photoUrl) return null
  const blob = await (await fetch(p.photoUrl)).blob()
  return new File([blob], 'face.jpg', { type: blob.type || 'image/jpeg' })
}

/** ★ 提交时会读参考图(`design.submit`)——只在**真传了图**且这个部署能读时提示。 */
const willReadImages = computed(
  () =>
    personas.canAnalyzeFace &&
    Object.values(inputs.value).some((x) => (x.images || []).length > 0)
)

async function onSubmit() {
  const sessionId = await design.submit({
    userId: user.id,
    sceneId: sceneId.value,
    persona: persona.value,
    fields: collectFields(),
    faceFile: await faceFileOf(persona.value),
    // ★ 判据**只此一处**:服务端在 `GET /personas` 里回的那个 `canAnalyzeFace`
    //   (`VISION_ANALYZER=off` 时为假 ⇒ 送参考图那两条路由根本没注册)。
    //   为假时**一张都不传**,否则 404 会把整次提交打掉。
    canSendRefImages: personas.canAnalyzeFace,
    // ★ 天气是**可选**的:没拉、拉不到、或服务端标了「离线示意」时传 null,
    //   `toBrief` 那边就整块不给 `weather` —— 前端没有"手填天气"的兜底。
    weather: weather.value,
  })
  // 失败时不跳转:错误就打在按钮旁边(design.error),地址栏不动
  if (!sessionId) return
  router.push({ path: '/result', query: { session: sessionId } })
}
</script>

<style scoped>
/* 「提交时会读参考图」那句:靠右、贴着下面那排按钮 */
.form-read-note {
  margin: 16px 0 0;
  font-size: 13px;
  color: var(--color-text-sub);
  text-align: right;
}

/* 页内私有:字段 tab 只有这一屏有(美妆台那两个是页签式的,不共用) */
.field-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 5px;
  border-radius: var(--radius-lg);
  background: var(--color-card);
}

.field-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-sub);
  transition: background 0.18s var(--ease), color 0.18s var(--ease);
}

.field-tab:hover {
  color: var(--color-text);
}

.field-tab--on {
  background: var(--color-white);
  color: var(--color-text);
  font-weight: 700;
  box-shadow: var(--shadow-card);
}
</style>
