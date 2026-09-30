<template>
  <FlowTopbar back-to="/personas" title="形象详情" />

  <main class="content content--flow">
    <div class="flow-head">
      <h1 class="flow-head__title">这份人设的档案</h1>
      <p class="flow-head__sub">看看已上传的正脸照与补充信息，有变化随时改，改完点「保存修改」</p>
    </div>

    <ErrorNote :text="personas.error" />

    <div class="quiz-layout">
      <!-- 左栏:已上传的正脸照 + 换照片 -->
      <aside class="quiz-side">
        <div class="detail-photo">
          <img v-if="photoUrl" class="detail-photo__img" :src="photoUrl" :alt="`${source?.name || ''} 的正脸照片`" />
          <div v-else class="detail-photo__empty">暂无正脸照片</div>
          <button class="detail-photo__change" @click="pickPhoto()">
            <Icon name="upload" :size="16" color="var(--color-text)" />
            <span>换一张照片</span>
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
              @click="relation = r.id"
            >
              {{ r.label }}
            </button>
          </div>
        </section>

        <SkinTonePicker v-model="skin" :tones="personas.skinTones" />
        <FeaturePicker v-model="features" :groups="personas.featureGroups" :features="personas.featureList" />

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
import { RELATIONS } from '@/api/personas'
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
 * ★ 找不到这份人设(删过了、或者 URL 里的 id 不属于当前账号)就**回人设库**,
 *   不在页面上留一个空壳——那是把「没有」装成「有,只是没显示」。
 *
 * ★ 换照片走 store 的 `shrinkOnly`(只缩图、不碰建档草稿):
 *   这张照片属于**已有**档案,借建档草稿那条路会把用户正在建的另一份覆盖掉。
 *   ✏️ 源站这里直接存 FileReader 的原图 dataURL——手机照片会有几 MB,
 *   撞上 localStorage 配额就是「看着保存成功、刷新后变回去」。
 *
 * ★ 字段是**本地编辑态**:改动只在点「保存修改」时才落盘,中途离开不写。
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
const photoUrl = ref('')

const canSave = computed(() => Boolean(name.value.trim()))

const { inputRef: fileInput, pick: pickPhoto } = useFilePick()

onMounted(() => {
  personas.load(user.id)
  const p = personas.getById(id.value)
  if (!p) {
    router.replace('/personas')
    return
  }
  name.value = p.name || ''
  relation.value = p.relation || 'self'
  skin.value = p.skinTone || ''
  features.value = [...(p.features || [])]
  photoUrl.value = p.photoUrl || ''
})

async function onPhotoChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const shrunk = await personas.shrinkOnly(file)
  // 缩图失败(读不出来 / 不是图片)时 store 已经把原因写进 error,这里不覆盖已有照片
  if (shrunk) photoUrl.value = shrunk
  event.target.value = ''
}

async function onSave() {
  const saved = await personas.update(id.value, {
    name: name.value.trim(),
    relation: relation.value,
    photoUrl: photoUrl.value,
    skinTone: skin.value,
    features: features.value,
  })
  if (saved) router.push('/personas')
}

async function onDelete() {
  if (!window.confirm(`确定删除「${name.value.trim() || '这份人设'}」？此操作不可恢复`)) return
  const ok = await personas.remove(id.value)
  if (ok) router.push('/personas')
}
</script>
