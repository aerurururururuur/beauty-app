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
      </div>
      <RouterLink class="persona-bar__switch" :to="{ path: '/personas', query: personaQuery }">换一份</RouterLink>
    </div>

    <!-- 字段依场景而定:旅行只有两个,面试有四个 -->
    <div class="form-fields">
      <section v-for="f in form?.fields || []" :key="f.key" class="info-field" :data-key="f.key">
        <header class="info-field__head">
          <h3 class="info-field__label">
            {{ f.label }}
            <span v-if="f.required" class="info-field__req">必填</span>
            <span v-else class="info-field__opt">选填</span>
          </h3>
          <div class="info-field__switch" role="tablist">
            <button
              class="switch-tab"
              :class="{ 'switch-tab--active': inputs[f.key]?.mode === 'text' }"
              role="tab"
              type="button"
              @click="inputs[f.key].mode = 'text'"
            >
              文字描述
            </button>
            <button
              class="switch-tab"
              :class="{ 'switch-tab--active': inputs[f.key]?.mode === 'image' }"
              role="tab"
              type="button"
              @click="inputs[f.key].mode = 'image'"
            >
              图片上传
            </button>
          </div>
        </header>
        <p class="info-field__hint">{{ f.hint || '' }}</p>

        <div v-show="inputs[f.key]?.mode === 'text'" class="info-field__pane info-field__pane--text">
          <textarea v-model="inputs[f.key].text" class="info-field__input" rows="3" :placeholder="f.placeholder || ''"></textarea>
          <!-- 预设选项是多选快捷输入,与手写的文字一起提交(不是二选一) -->
          <div v-if="(f.options || []).length" class="info-field__opts">
            <button
              v-for="o in f.options"
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

        <div v-show="inputs[f.key]?.mode === 'image'" class="info-field__pane info-field__pane--image">
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

    <footer class="form-actions">
      <RouterLink class="btn btn--soft" :to="{ path: '/personas', query: personaQuery }">上一步</RouterLink>
      <button class="btn btn--primary" :disabled="design.generating" @click="onSubmit">
        {{ design.generating ? '正在配妆…' : '生成我的妆容' }}
      </button>
    </footer>
    <!-- 后端给的那句人话原样展示,前端不按 code 分支（AGENTS.md §7.3） -->
    <ErrorNote :text="design.error" />
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
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
 * ★ 每个字段两种输入方式(文字 / 图片),二选一显示,但**收集时两种都要**
 *   (`collectFields` 里的 `type` 就是给这个用的:'text' / 'image' / 'both')。
 *
 * ★★ 这一屏就是「填完交给 agent」那一下。提交时会做三次握手
 *   (建会话 → 传脸 → 开场那句话,见 `stores/design.js` 的 `submit`)。
 *   ⇒ 所以按钮**会有真的等待**(最长 90 秒),文案也照实说「正在配妆…」——
 *     它不再是假等待屏(那条规矩随本地推导一起作废了,见 `vue/AGENTS.md` §8-4)。
 *
 * ★ **只上传这一张脸。** `/form` 收的**信息图这一期不传**——它们对应后端
 *   `/images` 的 `kind: scene`,而 `VISION_ANALYZER=off`(缺省)时那条路由
 *   根本没注册,发过去是 404。`toBrief` 会在 `sceneText` 里补一句「用户上传了
 *   N 张图片(本次未能送达)」,让 agent 知道有这回事、可以开口问——**不能装没看见**。
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

/** 每格字段的输入态:`{ [key]: { mode, text, opts, images } }`。 */
const inputs = ref({})

const personaQuery = computed(() => ({ scene: sceneId.value, pick: '1' }))

onMounted(() => {
  personas.load(user.id)
  const p = personas.getById(personaId.value)
  if (!p) {
    // 没有（或已删掉）那份人设:回人设库重选一份,别在这一屏留一个空壳
    router.replace({ path: '/personas', query: personaQuery.value })
    return
  }
  persona.value = p
  design.loadForm(sceneId.value)
  for (const f of form.value.fields) {
    inputs.value[f.key] = { mode: 'text', text: '', opts: [], images: [] }
  }
})

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
    inputs.value[key].images.push({ url: createPreviewUrl(file) })
  }
  event.target.value = ''
}

/** 预设选项:再点一次就取消。它与手写的文字一起进 `collectFields`。 */
function toggleOpt(key, option) {
  const picked = inputs.value[key].opts
  const at = picked.indexOf(option)
  if (at >= 0) picked.splice(at, 1)
  else picked.push(option)
}

function dropImage(key, index) {
  const [gone] = inputs.value[key].images.splice(index, 1)
  if (gone) releasePreviewUrl(gone.url)
}

/* --------------------------- 提交 --------------------------- */

/** 收集:每格都保留文字与图片两种输入,`type` 说明这一格实际用了哪种。 */
function collectFields() {
  return (form.value?.fields || []).map((f) => {
    const input = inputs.value[f.key]
    const text = [input.text.trim(), ...input.opts].filter(Boolean).join('；')
    const images = input.images.map((img) => img.url)
    return {
      key: f.key,
      type: text && images.length ? 'both' : images.length ? 'image' : 'text',
      text,
      images,
    }
  })
}

/**
 * 人设照片 → 要上传的那个文件。
 *
 * ★ 人设照片在本机是**两种**形态:用户自己传的存成 dataURL,种子那几份是
 *   `public/` 下的静态 SVG 路径。两种都能被 `fetch` 读成字节,所以这里不分支
 *   ——分支就会出现「种子人设传不上去」这种只有挑特定脸才会遇到的怪毛病。
 * ★ 没有照片时返回 null:那就不传,让 agent 去要一张(结果页会显示 `hasFace=false`)。
 */
async function faceFileOf(p) {
  if (!p?.photoUrl) return null
  const blob = await (await fetch(p.photoUrl)).blob()
  return new File([blob], 'face.jpg', { type: blob.type || 'image/jpeg' })
}

async function onSubmit() {
  const sessionId = await design.submit({
    userId: user.id,
    sceneId: sceneId.value,
    persona: persona.value,
    fields: collectFields(),
    faceFile: await faceFileOf(persona.value),
  })
  // 失败时不跳转:错误就打在按钮旁边(design.error),地址栏不动
  if (!sessionId) return
  router.push({ path: '/result', query: { session: sessionId } })
}
</script>
