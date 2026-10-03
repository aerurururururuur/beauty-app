<template>
  <FlowTopbar back-to="/mine" title="我的 AI 妆容档案" />

  <main class="content content--flow">
    <div class="flow-head">
      <h1 class="flow-head__title">我的 AI 妆容档案</h1>
    </div>

    <ErrorNote :text="error" />

    <!-- ★ 三态分开:读的过程中不许渲染成「暂无」——那会把「还没回来」说成「一条都没有」 -->
    <p v-if="loading" class="looks-hint">正在读你的妆容档案…</p>

    <!-- 空态就是网格里的第一张卡(不是一句躺着的提示):点它去做一版 -->
    <div v-else-if="!looks.length" class="card-grid">
      <RouterLink class="look-card looks-new" to="/create">
        <div class="look-card__cover ph" style="height: 220px">
          <Icon name="plus" :size="26" color="var(--color-rose)" />
        </div>
        <h3 class="look-card__title">去做一版</h3>
        <p class="looks-new__desc">在结果页把出好的图存下来，就会出现在这里</p>
      </RouterLink>
    </div>

    <div v-else class="card-grid">
      <div v-for="look in looks" :key="look.id" class="looks-item">
        <LookCard :item="cardOf(look)" :height="220" />
        <button class="looks-item__del" :disabled="removing === look.id" @click="onDelete(look)">
          {{ removing === look.id ? '正在删…' : '删掉' }}
        </button>
      </div>
    </div>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import ErrorNote from '@/components/ErrorNote.vue'
import FlowTopbar from '@/components/FlowTopbar.vue'
import Icon from '@/components/Icon.vue'
import LookCard from '@/components/LookCard.vue'
import { listLooks, lookCoverHref, removeLook } from '@/api/looks'
import { useUserStore } from '@/stores/user'

/**
 * 我的妆容档案。列出在 `/result` 上「保存到我的妆容档案」存下来的每一版。
 *
 * ★ 归属靠显式传 `userId`(后端本轮不签发 token),同化妆包。
 * ★ 封面地址每次渲染现拼(`lookCoverHref`)——后端给的是裸路径,不带 API 前缀、不带 userId。
 * ★ 删除是**必须有的**:`DELETE /looks/:id` 没有调用点就是本仓判死的「零消费者 = 假开关」。
 *   删的是服务端的记录**和**封面字节,没有回收站。
 */
const user = useUserStore()

const looks = ref([])
const loading = ref(true)
const error = ref('')
/** 正在删的那一版的 id;空串 = 没有在删。用来禁掉按钮,防连点。 */
const removing = ref('')

/** 卡片只吃两格;脸的作者与点赞数在档案里没有意义,LookCard 那一段会自己收起。 */
function cardOf(look) {
  return {
    title: look.styleName || look.sceneName,
    coverUrl: lookCoverHref(look.coverUrl, user.id),
  }
}

async function load() {
  loading.value = true
  try {
    looks.value = await listLooks({ userId: user.id })
  } catch (e) {
    // ★ 读不到就照实说,不把列表当成空(「一条都没有」和「没读到」是两回事)
    error.value = e?.message || '没能读到你的妆容档案，请稍后再试'
  } finally {
    loading.value = false
  }
}

async function onDelete(look) {
  if (!window.confirm('确定删掉这一版妆容？封面图也会一起删掉，不可恢复')) return
  error.value = ''
  removing.value = look.id
  try {
    await removeLook({ id: look.id, userId: user.id })
    // 删完**重取**而不是就地过滤:列表显示的是服务端那本账,不是本地的推断
    looks.value = await listLooks({ userId: user.id })
  } catch (e) {
    error.value = e?.message || '没能删掉这一版，请稍后再试'
  } finally {
    removing.value = ''
  }
}

onMounted(load)
</script>

<style scoped>
/* 页内私有:档案页只有这一屏,不进共享样式表 */
.looks-hint {
  padding: 32px 0;
  color: var(--color-text-sub);
  font-size: 14px;
}

.looks-new__desc {
  color: var(--color-text-sub);
  font-size: 13px;
  line-height: 1.5;
}

.looks-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.looks-item__del {
  align-self: flex-end;
  border: none;
  background: none;
  padding: 0;
  color: var(--color-text-sub);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.looks-item__del:hover:not(:disabled) {
  color: var(--color-danger);
}

.looks-item__del:disabled {
  color: var(--color-text-disabled);
  cursor: default;
}


</style>
