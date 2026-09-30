<template>
  <FlowTopbar back-to="/personas" title="形象详情" />

  <main class="content content--flow">
    <div class="flow-head">
      <h1 class="flow-head__title">这份人设的档案</h1>
      <p class="flow-head__sub">照片与档案都存在你的桃妆账号里，有变化随时改，改完点「保存修改」</p>
    </div>

    <ErrorNote :text="personas.error" />

    <div class="quiz-layout">
      <!-- 左栏:已上传的正脸照 + 换 / 移除 -->
      <aside class="quiz-side">
        <div class="detail-photo">
          <img v-if="photoUrl" class="detail-photo__img" :src="photoUrl" :alt="`${source?.name || ''} 的正脸照片`" />
          <div v-else class="detail-photo__empty">暂无正脸照片</div>
          <button class="detail-photo__change" @click="pickPhoto()">
            <Icon name="upload" :size="16" color="var(--color-text)" />
            <span>换一张照片</span>
          </button>
          <button v-if="photoUrl" class="detail-photo__change" @click="onDropPhoto">
            <Icon name="more" :size="16" color="var(--color-text)" />
            <span>移除照片</span>
          </button>
          <input ref="fileInput" type="file" accept="image/*" hidden @change="onPhotoChange" />
        </div>
      </aside>

      <!-- 右栏:补充信息(可编辑) -->
      <div class="quiz-main">
        <section class="quiz-block">
          <h2 class="quiz-block__title">名字<span class="quiz-block__req">必填</span></h2>
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

        <footer class="form-actions">
          <button class="btn btn--danger" type="button" @click="onDelete">删除</button>
          <button
            class="btn btn--primary"
            type="button"
            :disabled="!canSave || personas.busy"
            @click="onSave"
          >
            {{ personas.busy ? '保存中…' : '保存修改' }}
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
import { useUserStore } from '@/stores/user'
import { usePersonasStore } from '@/stores/personas'

/**
 * 形象详情 / 编辑。从人设库点一张卡进来。
 *
 * ★ 找不到这份人设(删过了、或者 URL 里的 id 不属于当前账号——服务端两者都报 404)
 *   就**回人设库**,不在页面上留一个空壳——那是把「没有」装成「有,只是没显示」。
 *
 * ★★ **照片这一格有三态,不是两态**(2026-09-30 照片搬到服务端之后才有的区别):
 *   没动过 / 换了一张 / 要删掉。它们在请求里是**三种不同的东西**:
 *     · 没动过 ⇒ **不传 `photo`**(服务端保持不动);
 *     · 换了一张 ⇒ 传那张 dataURL;
 *     · 要删掉 ⇒ 传**空串 `''`**(服务端把字节和那一格一起清掉)。
 *   所以这里用一个 `photoMode` 记着用户干了什么,而不是拿 `photoUrl` 是否为空去猜——
 *   猜的话「没照片的人没动过」与「有照片的人刚点移除」会长得一模一样。
 *
 * ★ 换照片走 store 的 `shrinkOnly`(只缩图、不碰建档草稿):
 *   这张照片属于**已有**档案,借建档草稿那条路会把用户正在建的另一份覆盖掉。
 *   ✏️ 源站这里直接存 FileReader 的原图 dataURL——手机照片会有几 MB,
 *   那时撞的是 localStorage 配额,现在撞的是服务端那条 1 MiB 的网。
 *
 * ★ 字段是**本地编辑态**:改动只在点「保存修改」时才落盘,中途离开不写。
 *   ⚠️ 「移除照片」也只改这里的编辑态,不点保存就什么也没发生(所以它不需要二次确认——
 *   误点了再选一张、或者直接退出这一页就行)。
 */
const router = useRouter()
const user = useUserStore()
const personas = usePersonasStore()

const id = useRouteParam('id')
const source = computed(() => personas.getById(id.value))

const name = ref('')
const relation = ref('self')
const skin = ref('')
const features = ref([])
const notes = ref('')
/** 「+ 自定义」那格展开着没有。载入时若关系本来就不是那三个预置值,它就是 true(见 `onMounted`)。 */
const relEditing = ref(false)

/** 服务端那份照片的地址(种子人设是静态图,自己传的是 `/personas/<id>/photo`)。 */
const sourcePhoto = ref('')
/** 照片这一格的编辑态。取值见文件头:没动过 / 换了一张 / 要删掉。 */
const photoMode = ref('keep')
/** `photoMode === 'replace'` 时用户新选的那张(已缩过的 dataURL)。 */
const photoData = ref('')

const photoUrl = computed(() => {
  if (photoMode.value === 'replace') return photoData.value
  if (photoMode.value === 'clear') return ''
  return sourcePhoto.value
})

const canSave = computed(() => Boolean(name.value.trim() && relation.value.trim()))

/** 点预置那三个:选它、并收起自定义输入框(否则输入框里那几个字还盖着关系)。 */
function pickRelation(id) {
  relation.value = id
  relEditing.value = false
}

/** ★ 不清空也不猜:关系先置空,让用户自己写;空着时「保存修改」是灰的(服务端也会 422)。 */
function openRelation() {
  relation.value = ''
  relEditing.value = true
}

/** 自建档的增删都走 store(整账号共用一份小库,建完它会把列表重取回来)。 */
function onAddTone({ name: toneName, hex }) {
  return personas.addTone(toneName, hex)
}

function onRemoveTone(toneId) {
  return personas.removeTone(toneId)
}

const { inputRef: fileInput, pick: pickPhoto } = useFilePick()

onMounted(async () => {
  // ★ 必须 await:人设从服务端拉,不等它回来 `getById` 一定是 null,
  //   于是**每一份人设都会被判成「没有这份」**、用户被静默踢回人设库。
  await personas.load(user.id)
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

async function onPhotoChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const shrunk = await personas.shrinkOnly(file)
  // 缩图失败(读不出来 / 不是图片)时 store 已经把原因写进 error,这里不覆盖已有照片
  if (shrunk) {
    photoData.value = shrunk
    photoMode.value = 'replace'
  }
  event.target.value = ''
}

/** 只改编辑态:真正删掉字节要等用户点「保存修改」(见 `onSave`)。 */
function onDropPhoto() {
  photoMode.value = 'clear'
}

async function onSave() {
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

  const saved = await personas.update(id.value, patch)
  if (saved) router.push('/personas')
}

async function onDelete() {
  if (!window.confirm(`确定删除「${name.value.trim() || '这份人设'}」？服务端那份照片也会一起删掉，此操作不可恢复`)) return
  const ok = await personas.remove(id.value)
  if (ok) router.push('/personas')
}
</script>
