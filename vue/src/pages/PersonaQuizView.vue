<template>
  <FlowTopbar back-to="/personas/new" title="填人设档案" />

  <main class="content content--flow">
    <div class="quiz-layout">
      <!-- 左栏:照片 + 读脸入口 -->
      <aside class="quiz-side">
        <img v-if="photo" class="quiz-photo" :src="photo" alt="人设照片" />
        <div v-else class="quiz-photo ph">未带照片<br />可手动填写档案</div>

        <!-- ★ 这个按钮只在「这个部署真的有读脸能力」时出现;点了才发请求(一次会花钱的调用) -->
        <button
          v-if="canReadFace"
          class="btn btn--soft"
          type="button"
          :disabled="personas.analyzing"
          @click="onReadFace"
        >
          {{ personas.analyzing ? '正在读这张脸…' : '让 AI 读一次脸，给个肤色建议' }}
        </button>

        <div class="analyze-state" :class="{ 'analyze-state--busy': personas.analyzing }">
          {{ analyzeState }}
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
              @click="pickRelation(r.id)"
            >
              {{ r.label }}
            </button>
            <button
              type="button"
              class="rel-chip rel-chip--add"
              :class="{ 'rel-chip--on': relEditing }"
              @click="openRelation"
            >
              + 自定义
            </button>
          </div>
          <input
            v-if="relEditing"
            v-model="relation"
            class="rel-input"
            type="text"
            maxlength="12"
            placeholder="例如：同事 / 继母 / 搭子"
          />
        </section>

        <SkinTonePicker
          v-model="skin"
          :tones="personas.allSkinTones"
          :hint="skinHint"
          manageable
          @add-tone="onAddTone"
          @remove-tone="onRemoveTone"
        />
        <FeaturePicker v-model="features" :groups="personas.featureGroups" :features="personas.featureList" />

        <section class="quiz-block">
          <h2 class="quiz-block__title">补充说明<span class="quiz-block__opt">选填</span></h2>
          <textarea
            v-model="notes"
            class="info-field__input notes-input"
            :maxlength="MAX_NOTES"
            rows="3"
            placeholder="还有什么想让它知道的？例如：想要更冷调 / 别用亮片 / 眉毛别修太细"
          ></textarea>
          <p class="notes-count">{{ notes.length }} / {{ MAX_NOTES }}</p>
        </section>

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
import { MAX_NOTES, RELATIONS } from '@/api/personas'
import ErrorNote from '@/components/ErrorNote.vue'
import FeaturePicker from '@/components/FeaturePicker.vue'
import FlowTopbar from '@/components/FlowTopbar.vue'
import SkinTonePicker from '@/components/SkinTonePicker.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import { useUserStore } from '@/stores/user'
import { usePersonasStore } from '@/stores/personas'

/**
 * 捏个新人设 · 第 2 步:填档案(名字 / 关系 / 肤色 / 面部特征)→ 建档。
 *
 * ★ 左栏是照片与**读脸那一个入口**,右栏才是用户真正确认的值。
 *   肤色可以由 AI 读一次脸给个建议,但**必须由用户确认**——照片的白平衡会把肤色
 *   整体拉偏,所以这里的值永远是人点出来的,不是判定出来的(红线 §8-1)。
 *
 * ★★ **读脸是用户点出来的,不是进页面就跑的**(2026-09-30 改的口径)。
 *   它是一次**会花钱**的多模态调用,所以:① 绝不放在 `onMounted` 里;
 *   ② 服务端配 `VISION_ANALYZER=off`(缺省)时那条路由**根本没注册**,
 *      这时界面上**一个「AI」字都不出现**、也没有那个按钮——
 *      **绝不回落到任何本地哈希兜底**:那等于把「没做」讲成「做了」(§8-4)。
 *   ③ 服务端在列表里给的那一格 `canAnalyzeFace` 就是判据,前端不自己推。
 * ★ 读脸**只给肤色**:没有面部特征、也没有置信度(服务端那格契约就只有 `skinTone`)。
 *   所以**特征永远由用户自己勾**——此前那句「AI 建议已预填」把特征也一起说了进去,
 *   是一句半谎(旧版那个本地哈希确实会瞎猜两个特征)。
 * ★ 等待态是真的在等:一句「正在读这张脸…」+ `.analyze-state--busy` 那个脉冲。
 *   ⚠️ 那条 CSS 规则以前是**零消费者**的(旧版没有任何读脸请求,也就没有等待态),
 *   现在它才真的对上了一个在等的东西。
 *
 * ★ 名字、关系、肤色是**硬门槛**(`canCreate`),特征与补充说明都可以空着。
 * ★ 建档那一刻照片才上传(见 `stores/personas.js` 的 `create` 与 `PersonaNewView` 的注释)。
 */
const router = useRouter()
const user = useUserStore()
const personas = usePersonasStore()

const sceneId = useQueryParam('scene')

const name = ref('')
const relation = ref('self')
const skin = ref('')
const features = ref([])
const notes = ref('')
/** 「+ 自定义」按下了没有。为真时关系那格换成输入框,`relation` 存的就是用户的原话。 */
const relEditing = ref(false)
/** 这次读脸读成了没有。`'idle'` = 还没读过(或没读成),`'done'` = 读完了。 */
const readState = ref('idle')

const photo = computed(() => personas.draft.photo || '')
const canCreate = computed(() => Boolean(name.value.trim() && relation.value.trim() && skin.value))

/** 点预置那三个:选它、并收起自定义输入框(否则输入框里那几个字还盖着关系)。 */
function pickRelation(id) {
  relation.value = id
  relEditing.value = false
}

/** ★ 不清空也不猜:关系先置空,让用户自己写;空着时「建好这个人设」是灰的(服务端也会 422)。 */
function openRelation() {
  relation.value = ''
  relEditing.value = true
}

/** 自建档的增删都走 store(整账号共用一份小库,建完它会把列表重取回来)。 */
function onAddTone({ name: toneName, hex }) {
  return personas.addTone(toneName, hex)
}

function onRemoveTone(id) {
  return personas.removeTone(id)
}
/** 有照片 **且** 这个部署有读脸能力,才摆那个按钮。 */
const canReadFace = computed(() => personas.canAnalyzeFace && Boolean(photo.value))

/** 只有**真读过**之后才让肤色卡说「AI 给的是建议档」——没读过时那句话是假的。 */
const skinHint = computed(() =>
  readState.value === 'done'
    ? '照片难免有色差，这是 AI 读出来的建议档，请按素颜自然光下的真实肤色确认。'
    : ''
)

/** 左栏那一句:它随「有没有照片 / 读过没有 / 这个部署能不能读」三种情况变。 */
const analyzeState = computed(() => {
  if (personas.analyzing) return '正在读这张脸，请稍候…'
  if (!photo.value) return '未带照片，请手动选择肤色与面部特征'
  if (readState.value === 'done') {
    return skin.value
      ? 'AI 读出的肤色档建议已预填（面部特征请自己勾），照片有色差，请按真实情况确认'
      : '这次没能看出肤色档，请自己选；面部特征也请自己勾'
  }
  return canReadFace.value
    ? '肤色与面部特征都可以自己选，也可以点上面让 AI 读一次脸，只给肤色建议'
    : '肤色与面部特征由你自己选'
})

onMounted(async () => {
  // ★ 只拉账号(建档要用 store 里那个 userId)。**读脸不在这里**——理由见文件头。
  await personas.load(user.id)
})

async function onReadFace() {
  const suggestion = await personas.analyze(photo.value)
  // 失败时 store 已经写了 error(ErrorNote 会显示),这里不覆盖它、也不改 readState
  if (!suggestion) return
  readState.value = 'done'
  // ★ 服务端回的档位翻不出来时是空串:那就**留空**等用户自己选,绝不猜一个档安上去(§8-1)
  if (suggestion.skinTone) skin.value = suggestion.skinTone
}

async function onCreate() {
  const created = await personas.create({
    name: name.value.trim(),
    relation: relation.value.trim(),
    photo: photo.value,
    skinTone: skin.value,
    features: features.value,
    notes: notes.value.trim(),
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
