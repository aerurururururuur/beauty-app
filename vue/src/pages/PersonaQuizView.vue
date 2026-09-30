<template>
  <FlowTopbar back-to="/personas/new" title="人设面诊" />

  <main class="content content--flow">
    <div class="quiz-layout">
      <!-- 左栏:照片 + 建议状态 -->
      <aside class="quiz-side">
        <img v-if="photo" class="quiz-photo" :src="photo" alt="人设照片" />
        <div v-else class="quiz-photo ph">未带照片<br />可手动填写档案</div>

        <div class="analyze-state">
          {{ photo ? 'AI 建议已预填 · 照片有色差，肤色档请按真实情况确认' : '未检测到照片，请手动选择肤色与面部特征' }}
        </div>
      </aside>

      <!-- 右栏:起名 + 关系 + 肤色 + 面部特征 -->
      <div class="quiz-main">
        <section class="quiz-block">
          <h2 class="quiz-block__title">给这个人设起个名字<span class="quiz-block__req">必填</span></h2>
          <input
            v-model="name"
            class="quiz-name-input"
            type="text"
            maxlength="12"
            placeholder="例如：我自己 / 妈妈 / 闺蜜阿柚"
          />
          <div class="rel-chips">
            <button
              v-for="r in RELATIONS"
              :key="r.id"
              type="button"
              class="rel-chip"
              :class="{ 'rel-chip--on': relation === r.id }"
              @click="relation = r.id"
            >
              {{ r.label }}
            </button>
          </div>
        </section>

        <SkinTonePicker v-model="skin" :tones="personas.skinTones" />
        <FeaturePicker v-model="features" :groups="personas.featureGroups" :features="personas.featureList" />

        <ErrorNote :text="personas.error" />

        <footer class="form-actions">
          <button class="btn btn--primary" :disabled="!canCreate || personas.busy" @click="onCreate">
            {{ personas.busy ? '正在建档…' : '建好这个人设' }}
          </button>
        </footer>
      </div>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { RELATIONS } from '@/api/personas'
import ErrorNote from '@/components/ErrorNote.vue'
import FeaturePicker from '@/components/FeaturePicker.vue'
import FlowTopbar from '@/components/FlowTopbar.vue'
import SkinTonePicker from '@/components/SkinTonePicker.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import { useUserStore } from '@/stores/user'
import { usePersonasStore } from '@/stores/personas'

/**
 * 捏个新人设 · 第 2 步:AI 面诊 → 建档。
 *
 * ★ 左栏是照片 + **建议**状态,右栏才是用户真正确认的值。
 *   肤色与特征都由 `analyzePortrait()` **预填**,但**必须由用户确认**——
 *   照片的白平衡会把肤色整体拉偏,所以这里的值永远是人点出来的,不是判定出来的。
 *
 * ★ 今天没有等待态,也没有「AI 正在读脸…」那句。
 *   `analyzePortrait()` 是**同步**的本地建议(按照片哈希取一组稳定结果),
 *   中间没有任何请求在跑。演一个假的等待屏 = 告诉用户「刚才有台服务器在为你工作」,
 *   而并没有。真接上分析接口时再加等待态,那时它才配得上这个名字。
 *
 * ★ 名字与肤色是**硬门槛**(`canCreate`),特征可以不勾。
 */
const router = useRouter()
const user = useUserStore()
const personas = usePersonasStore()

const sceneId = useQueryParam('scene')

const name = ref('')
const relation = ref('self')
const skin = ref('')
const features = ref([])

const photo = computed(() => personas.draft.photo || '')
const canCreate = computed(() => Boolean(name.value.trim() && skin.value))

onMounted(() => {
  personas.load(user.id)
  if (!photo.value) return
  // 建议:同一张照片每次给同一组结果(见 api/personas.js 的 analyzePortrait)
  const suggestion = personas.analyze(photo.value)
  skin.value = suggestion.skinTone || ''
  features.value = suggestion.features || []
})

async function onCreate() {
  const created = await personas.create({
    name: name.value.trim(),
    relation: relation.value,
    photoUrl: photo.value,
    skinTone: skin.value,
    features: features.value,
  })
  if (!created) return
  // 选人流程里建完直接代入填信息;单独建档则回人设库并带上一次性提醒
  router.push(
    sceneId.value
      ? { path: '/form', query: { scene: sceneId.value, persona: created.id } }
      : { path: '/personas', query: { created: created.id } }
  )
}
</script>
