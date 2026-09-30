<template>
  <FlowTopbar back-to="/vanity" title="添新宠" />

  <main class="content content--flow">
    <div class="flow-head">
      <h1 class="flow-head__title">挑几样收进化妆包</h1>
      <p class="flow-head__sub">
        已经在你化妆包里的不会再出现。这里是整件收纳,收好后再去「全部产品」里把具体的色号挑出来
      </p>
    </div>

    <ErrorNote :text="vanity.error" />

    <!-- ★ 目录没回来之前**什么都不摆**:这一屏的「这一类都已经在你的化妆包里了」
         是一句关于数据的结论,目录还在路上时它多半是假的。 -->
    <div v-if="vanity.catalogLoading" class="vanity-state">
      <div class="vanity-state__art">
        <Icon name="palette" :size="40" color="var(--color-peach)" />
      </div>
      <p class="vanity-state__title">正在取产品目录…</p>
      <p class="vanity-state__sub">收录的产品都从后端来,这一屏要等它一下</p>
    </div>

    <div v-else-if="vanity.catalogError" class="vanity-state">
      <div class="vanity-state__art">
        <Icon name="palette" :size="40" color="var(--color-peach)" />
      </div>
      <p class="vanity-state__title">产品目录没能取回来</p>
      <p class="vanity-state__sub">{{ vanity.catalogError }}</p>
      <button class="btn btn--soft vanity-state__action" @click="vanity.loadCatalog()">再试一次</button>
    </div>

    <template v-else>
      <!-- 分类筛选(由产品数据推导,不写死) -->
      <div class="cat-filter">
        <button
          class="cat-chip"
          :class="{ 'cat-chip--active': vanity.addCategory === 'all' }"
          @click="vanity.addCategory = 'all'"
        >
          全部 {{ vanity.catalog.length }}
        </button>
        <button
          v-for="c in vanity.catalogCategories"
          :key="c.name"
          class="cat-chip"
          :class="{ 'cat-chip--active': vanity.addCategory === c.name }"
          @click="vanity.addCategory = c.name"
        >
          {{ c.name }} {{ c.count }}
        </button>
      </div>

      <!-- 可选产品(已剔除已拥有) -->
      <div v-if="!vanity.catalogVisible.length" class="empty">这一类都已经在你的化妆包里了</div>
      <div v-else class="catalog-grid">
        <button
          v-for="p in vanity.catalogVisible"
          :key="p.id"
          class="catalog-card"
          :class="{ 'catalog-card--picked': vanity.isPicked(p.id) }"
          :aria-pressed="vanity.isPicked(p.id)"
          @click="vanity.togglePick(p.id)"
        >
          <span class="catalog-card__tick"><Icon name="check" :size="16" /></span>
          <div class="catalog-card__thumb"></div>
          <div class="catalog-card__body">
            <span class="catalog-card__cat">{{ p.categoryLabel || '' }}</span>
            <span class="catalog-card__name">{{ p.name }}</span>
            <span class="catalog-card__meta">{{ p.text || '' }}</span>
          </div>
          <span class="catalog-card__shades" :class="{ 'catalog-card__shades--none': !p.hasShades }">
            {{ p.hasShades ? `${p.shadeCount} 色` : '无色号' }}
          </span>
        </button>
      </div>
    </template>
  </main>

  <!-- 底部操作条:选中数量 + 收纳按钮 -->
  <footer class="add-bar">
    <span class="add-bar__count">已选 <em>{{ vanity.picked.length }}</em> 件</span>
    <span class="add-bar__spacer"></span>
    <RouterLink class="btn btn--soft" to="/vanity">先不添了</RouterLink>
    <button
      class="btn btn--primary"
      :disabled="!vanity.picked.length || vanity.busy || !vanity.catalogLoaded"
      @click="onCommit"
    >
      {{ vanity.busy ? '收进中…' : '收进化妆包' }}
    </button>
  </footer>
</template>

<script setup>
import { onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ErrorNote from '@/components/ErrorNote.vue'
import FlowTopbar from '@/components/FlowTopbar.vue'
import Icon from '@/components/Icon.vue'
import { useUserStore } from '@/stores/user'
import { useVanityStore } from '@/stores/vanity'

/**
 * 添新宠:从全系目录里挑产品**整件**收进化妆包。
 *
 * ★ 候选列表 = 全量产品 − 已拥有(stores/vanity.js 里那个 `catalog` computed 减的),
 *   所以同一件不会重复入库。
 * ★ 目录**来自后端**(`GET /api/products`),要等一个来回 ⇒ 这一屏也是三态
 *   (加载中 / 目录没拉回来 / 有数据)。`await vanity.load(...)` 那个 await 不能漏。
 * ★ 这一屏收的是「整件」,**不收色号**——色号去「全部产品」里逐个挑。
 *   所以产品卡上不出现任何色号相关的操作。
 * ★ 分类 chips 由候选产品自己的分类推出来,不写死;计数也跟着候选集走。
 */
const user = useUserStore()
const vanity = useVanityStore()
const router = useRouter()

onMounted(async () => {
  await vanity.load(user.id)
  vanity.enterAddView()
})

async function onCommit() {
  const ok = await vanity.commitPicked()
  if (ok) router.push('/vanity')
}
</script>
