<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTryonStore } from '@/stores/tryon'
import { getLipsticks, analyzeTryon } from '@/api/lipsticks'
import LipstickCard from '@/components/LipstickCard.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import Icon from '@/components/Icon.vue'

const router = useRouter()
const store = useTryonStore()

const lipsticks = ref([])
const loading = ref(false)
const error = ref('')
const pendingId = ref(null)

onMounted(async () => {
  if (!store.photoUrl) {
    router.replace('/upload')
    return
  }
  try {
    lipsticks.value = await getLipsticks()
  } catch (e) {
    error.value = e.message
  }
})

async function onSelect(lipstick) {
  if (loading.value) return
  pendingId.value = lipstick.id
  loading.value = true
  error.value = ''
  try {
    const result = await analyzeTryon({
      photoFile: store.photoFile,
      colorCardFile: store.colorCardFile,
      lipstickId: lipstick.id
    })
    store.selectLipstick(lipstick)
    store.setResult(result)
    router.push('/result')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
    pendingId.value = null
  }
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <button class="back-btn" @click="router.push('/upload')"><Icon name="arrowLeft" :size="18" /></button>
      <div class="title">选择色号</div>
      <span class="spacer"></span>
    </header>

    <div v-if="store.photoUrl" class="thumb-row">
      <img class="thumb" :src="store.photoUrl" alt="" />
      <span class="thumb-text">为你试色 {{ lipsticks.length }} 款热门口红</span>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="grid">
      <LipstickCard
        v-for="l in lipsticks"
        :key="l.id"
        :lipstick="l"
        :active="pendingId === l.id"
        @select="onSelect"
      />
    </div>

    <LoadingOverlay v-if="loading" text="试色生成中…" />
  </div>
</template>

<style scoped>
.thumb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 2px 18px;
}

.thumb {
  width: 44px;
  height: 44px;
  border-radius: 4px;
  object-fit: cover;
  border: 1px solid var(--c-line);
}

.thumb-text {
  font-size: 12px;
  color: var(--c-ink-soft);
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.error {
  color: var(--c-accent-deep);
  font-size: 13px;
}
</style>
