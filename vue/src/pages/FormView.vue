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
      <button class="btn btn--primary" @click="onSubmit">生成我的妆容</button>
    </footer>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
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
 * ★★ 填的这些东西**今天不会影响结果**。方案由场景 + 风格 + 人设特征在本地推导,
 *    没有任何后端接收这几十个字(见 `stores/design.js` 的 `fields` 与 `api/design.js`
 *    的文件头)。所以:结果页**不许**声称读了你写的内容,页面也不加"AI 正在理解你的描述"
 *    这类话。等真接上后端,这里收的 `fields` 就是它的入参。
 *
 * ★ 图片走 `URL.createObjectURL`,预览用完**必须 revoke**——否则每选一张图就漏一份内存,
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

// ★ `scene` 的兜底是 'party'(不是 ''):直接打开 /form 时也得能算出一版方案
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

function onSubmit() {
  const { styleId } = design.submit({
    sceneId: sceneId.value,
    features: persona.value?.features || [],
    fields: collectFields(),
  })
  router.push({ path: '/result', query: { scene: sceneId.value, style: styleId, persona: personaId.value } })
}
</script>
