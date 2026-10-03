<template>
  <FlowTopbar :back-to="backTo" :title="isEdit ? '形象详情' : '捏个新人设'" />

  <main class="content content--flow">
    <div class="flow-head">
      <h1 class="flow-head__title">{{ isEdit ? '这份人设的档案' : '建一份人设档案' }}</h1>
      <p class="flow-head__sub">
        {{
          isEdit
            ? '照片与档案都存在你的桃妆账号里，有变化随时改，改完点「保存修改」'
            : '照片与档案都会存在你的桃妆账号里；什么时候送去渲染由你决定'
        }}
      </p>
    </div>

    <ErrorNote :text="personas.error" />

    <div class="quiz-layout">
      <!-- 左栏：新建 = 上传 / 预览；编辑 = 已有照片的三态盒子 -->
      <aside class="quiz-side">
        <template v-if="!isEdit">
          <div v-if="!displayPhoto" class="upload-row">
            <button class="upload-card" @click="pickFile({ camera: true })">
              <span class="upload-card__icon"><Icon name="camera" :size="40" color="var(--color-rose)" /></span>
              <span class="upload-card__title">拍照上传</span>
              <span class="upload-card__desc">正对镜头、光线均匀，当场拍一张</span>
            </button>
            <button class="upload-card" @click="pickFile()">
              <span class="upload-card__icon"><Icon name="upload" :size="40" color="var(--color-rose)" /></span>
              <span class="upload-card__title">相册上传</span>
              <span class="upload-card__desc">从相册选一张清晰的正面照</span>
            </button>
          </div>
          <template v-else>
            <img class="quiz-photo" :src="displayPhoto" alt="人设照片预览" />
            <button class="btn btn--soft" type="button" @click="pickFile({ camera: true })">重拍一张</button>
            <button class="btn btn--soft" type="button" @click="pickFile()">换一张照片</button>
          </template>

          <!-- ★ 读脸整块只在新建态:这是一次会花钱的调用,点了才发 -->
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
        </template>

        <div v-else class="detail-photo">
          <img
            v-if="displayPhoto"
            class="detail-photo__img"
            :src="displayPhoto"
            :alt="`${source?.name || ''} 的正脸照片`"
          />
          <div v-else class="detail-photo__empty">暂无正脸照片</div>
          <button class="detail-photo__change" @click="pickFile()">
            <Icon name="upload" :size="16" color="var(--color-text)" />
            <span>换一张照片</span>
          </button>
          <button v-if="displayPhoto" class="detail-photo__change" @click="onDropPhoto">
            <Icon name="more" :size="16" color="var(--color-text)" />
            <span>移除照片</span>
          </button>
        </div>

        <!-- 拍照与相册共用一个 input,只差 `capture` 一行(见 useFilePick) -->
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          :capture="useCamera"
          hidden
          @change="onPhotoChange"
        />
      </aside>

      <!-- 右栏：两态同一套字段 -->
      <div class="quiz-main">
        <section class="quiz-block">
          <h2 class="quiz-block__title">
            {{ isEdit ? '名字' : '给这个人设起个名字' }}<span class="quiz-block__req">必填</span>
          </h2>
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
            placeholder="例如：同事 / 搭子"
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
        <FeaturePicker
          v-model="features"
          :groups="personas.featureGroups"
          :features="personas.featureList"
          :library="personas.customFeatures"
          @add-feature="onAddFeature"
          @remove-feature="onRemoveFeature"
        />

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

        <footer class="form-actions">
          <button v-if="isEdit" class="btn btn--danger" type="button" @click="onDelete">删除</button>
          <button
            class="btn btn--primary"
            type="button"
            :disabled="!canSubmit || personas.busy"
            @click="onSubmit"
          >
            {{ submitText }}
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
import Icon from '@/components/Icon.vue'
import SkinTonePicker from '@/components/SkinTonePicker.vue'
import { useFilePick } from '@/composables/useFilePick'
import { useRouteParam } from '@/composables/useQueryParam'
import { useSceneQuery } from '@/composables/useSceneQuery'
import { useUserStore } from '@/stores/user'
import { usePersonasStore } from '@/stores/personas'

/**
 * 人设档案：**同一个组件挂两条路由**——`/personas/new`(新建)与 `/personas/:id`(查看/编辑)。
 * 判据只有 `isEdit` 一处(`/personas/new` 没有 `:id` 参数,兜底是空串)。
 *
 * ★ 照片有**两条互不相同的路**,不许混用:
 *   新建写草稿(`putDraftPhoto`,只在本机 sessionStorage),建档那一刻才随 `create` 上传;
 *   编辑走 `shrinkOnly`(只缩图,碰草稿就会覆盖用户正在建的另一份)。
 * ★ 编辑态的照片是**三态**:没动过 / 换了一张 / 要删掉 ⇒ 请求里是 不传 `photo` / dataURL / 空串。
 * ★ 读脸**只在新建态**、只在用户点那一下发(会花钱),`canAnalyzeFace` 为假时连按钮与「AI」字样都不出现。
 */

const router = useRouter()
const user = useUserStore()
const personas = usePersonasStore()

const id = useRouteParam('id')
const isEdit = computed(() => Boolean(id.value))
const { sceneId, pick } = useSceneQuery()

const name = ref('')
const relation = ref('self')
const skin = ref('')
const features = ref([])
const notes = ref('')
/** 「+ 自定义」按下了没有。为真时关系那格换成输入框,`relation` 存的就是用户的原话。 */
const relEditing = ref(false)
/** 这次读脸读成了没有。`'idle'` = 还没读过(或没读成),`'done'` = 读完了。 */
const readState = ref('idle')

/** 服务端那份照片的地址(种子人设是静态图,自己传的是 `/personas/<id>/photo`)。 */
const sourcePhoto = ref('')
/** 照片这一格的编辑态:没动过 / 换了一张 / 要删掉。 */
const photoMode = ref('keep')
/** `photoMode === 'replace'` 时用户新选的那张(已缩过的 dataURL)。 */
const photoData = ref('')

const source = computed(() => personas.getById(id.value))

/** 左栏摆哪张图。★ 两态的唯一入口,别在别处再读一次 `draft`。 */
const displayPhoto = computed(() => {
  if (!isEdit.value) return personas.draft.photo || ''
  if (photoMode.value === 'replace') return photoData.value
  if (photoMode.value === 'clear') return ''
  return sourcePhoto.value
})

const backTo = computed(() => {
  if (isEdit.value) return '/personas'
  return pick.value ? `/personas?scene=${encodeURIComponent(sceneId.value)}&pick=1` : '/personas'
})

/** 有照片 **且** 这个部署有读脸能力,才摆那个按钮。★ 编辑态永不出现。 */
const canReadFace = computed(() => !isEdit.value && personas.canAnalyzeFace && Boolean(displayPhoto.value))

/** 只有**真读过**之后才让肤色卡说「AI 给的是建议档」——没读过时那句话是假的。 */
const skinHint = computed(() =>
  !isEdit.value && readState.value === 'done'
    ? '照片难免有色差，这是 AI 读出来的建议档，请按素颜自然光下的真实肤色确认。'
    : ''
)

/** 左栏那一句:它随「有没有照片 / 读过没有 / 这个部署能不能读」三种情况变。 */
const analyzeState = computed(() => {
  if (personas.analyzing) return '正在读这张脸，请稍候…'
  if (!displayPhoto.value) return '还没有照片，可以先填档案；想读脸就传一张正脸照'
  if (readState.value === 'done') {
    return skin.value
      ? 'AI 读出的肤色档建议已预填（面部特征请自己勾），照片有色差，请按真实情况确认'
      : '这次没能看出肤色档，请自己选；面部特征也请自己勾'
  }
  return canReadFace.value
    ? '肤色与面部特征都可以自己选，也可以点上面让 AI 读一次脸，只给肤色建议'
    : '肤色与面部特征由你自己选'
})

/** ★ 两个门槛**刻意不同**:新建要肤色,编辑不要(存量档案可能本来就没定档)。 */
const canCreate = computed(() => Boolean(name.value.trim() && relation.value.trim() && skin.value))
const canSave = computed(() => Boolean(name.value.trim() && relation.value.trim()))
const canSubmit = computed(() => (isEdit.value ? canSave.value : canCreate.value))
const submitText = computed(() => {
  if (personas.busy) return isEdit.value ? '保存中…' : '正在建档…'
  return isEdit.value ? '保存修改' : '建好这个人设'
})

/** 点预置那三个:选它、并收起自定义输入框(否则输入框里那几个字还盖着关系)。 */
function pickRelation(relationId) {
  relation.value = relationId
  relEditing.value = false
}

/** ★ 不清空也不猜:关系先置空,让用户自己写;空着时提交按钮是灰的(服务端也会 422)。 */
function openRelation() {
  relation.value = ''
  relEditing.value = true
}

/** 自建档的增删都走 store(整账号共用一份小库,建完它会把列表重取回来)。 */
function onAddTone({ name: toneName, hex }) {
  return personas.addTone(toneName, hex)
}

/** ★ 删成功且**删的就是当前选中的那一档**时把选择一起清掉:留着它就是一个指向已删档的悬空 id。 */
async function onRemoveTone(toneId) {
  const ok = await personas.removeTone(toneId)
  if (ok && skin.value === toneId) skin.value = ''
  return ok
}

/**
 * 自建特征同理:store 回的是**写进人设的那一串**(不是库行),拿到就 push —— 拼接在 store 一处。
 */
async function onAddFeature({ group, text }) {
  const featureId = await personas.addFeature(group, text)
  if (featureId && !features.value.includes(featureId)) features.value = [...features.value, featureId]
  return featureId
}

async function onRemoveFeature(featureId) {
  const ok = await personas.removeFeature(featureId)
  if (ok) features.value = features.value.filter((x) => x !== featureId)
  return ok
}

const { inputRef: fileInput, capture: useCamera, pick: pickFile } = useFilePick()

onMounted(async () => {
  // ★ 必须 await:人设从服务端拉,不等它回来 `getById` 一定是 null,
  //   于是**每一份人设都会被判成「没有这份」**、用户被静默踢回人设库。
  await personas.load(user.id)
  if (!isEdit.value) return
  const p = personas.getById(id.value)
  if (!p) {
    router.replace('/personas')
    return
  }
  name.value = p.name || ''
  relation.value = p.relation || 'self'
  skin.value = p.skinTone || ''
  features.value = [...(p.features || [])]
  notes.value = p.notes || ''
  sourcePhoto.value = p.photoUrl || ''
  // ★ 认不出的关系就是用户自己填的:那格要直接展开成输入框,否则它**一个都不高亮**、
  //   看起来像没选,而点保存时它又确实带着那串原话。
  relEditing.value = !RELATIONS.some((r) => r.id === relation.value)
})

/** 新建 ⇄ 编辑的照片在这一个入口分岔,见文件头那两条路。 */
async function onPhotoChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (isEdit.value) {
    const shrunk = await personas.shrinkOnly(file)
    // 缩图失败(读不出来 / 不是图片)时 store 已经把原因写进 error,这里不覆盖已有照片
    if (shrunk) {
      photoData.value = shrunk
      photoMode.value = 'replace'
    }
  } else {
    await personas.putDraftPhoto(file)
  }
  event.target.value = ''
}

/** 只改编辑态:真正删掉字节要等用户点「保存修改」(见 `onSubmit`)。 */
function onDropPhoto() {
  photoMode.value = 'clear'
}

async function onReadFace() {
  if (isEdit.value) return
  const suggestion = await personas.analyze(displayPhoto.value)
  // 失败时 store 已经写了 error(ErrorNote 会显示),这里不覆盖它、也不改 readState
  if (!suggestion) return
  readState.value = 'done'
  // ★ 服务端回的档位翻不出来时是空串:那就**留空**等用户自己选,绝不猜一个档安上去
  if (suggestion.skinTone) skin.value = suggestion.skinTone
}

async function onSubmit() {
  if (isEdit.value) {
    const patch = {
      name: name.value.trim(),
      relation: relation.value.trim(),
      skinTone: skin.value,
      features: features.value,
      // ★ 这一格**恒发**:空串 = 清空笔记(服务端三态里的"清空"那一支),不传才是"不动"。
      notes: notes.value.trim(),
    }
    // ★ 三种状态 → 三种请求。`keep` 时**整个键不出现**,服务端就保持不动。
    if (photoMode.value === 'replace') patch.photo = photoData.value
    if (photoMode.value === 'clear') patch.photo = ''
    if (await personas.update(id.value, patch)) router.push('/personas')
    return
  }

  const created = await personas.create({
    name: name.value.trim(),
    relation: relation.value.trim(),
    photo: displayPhoto.value,
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

async function onDelete() {
  if (!window.confirm(`确定删除「${name.value.trim() || '这份人设'}」？服务端那份照片也会一起删掉，此操作不可恢复`)) return
  if (await personas.remove(id.value)) router.push('/personas')
}
</script>
