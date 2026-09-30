<template>
  <FlowTopbar
    :back-to="pick ? '/create' : '/'"
    title="人设库"
    :steps="pick ? ['1 选场景', '2 选形象', '3 填信息', '4 生成方案'] : []"
    :active-step="pick ? 2 : 0"
  />

  <main class="content content--flow">
    <div class="flow-head">
      <template v-if="pick">
        <h1 class="flow-head__title">为「{{ sceneName }}」选一张脸</h1>
        <p class="flow-head__sub">从人设库挑一份档案直接代入，也可以临时上传一张新的</p>
      </template>
      <template v-else>
        <h1 class="flow-head__title">人设库</h1>
        <p class="flow-head__sub">
          你的每一张脸，都值得一份档案——给自己、家人、朋友各建一份，存在你的桃妆账号里，创作时任选代入
        </p>
      </template>
    </div>

    <ErrorNote :text="personas.error" />

    <div class="persona-grid">
      <div v-if="createdId" class="persona-notice">新人设已建好，放进你的人设库了</div>

      <article
        v-for="p in personas.personas"
        :key="p.id"
        class="persona-card"
        :class="{ 'persona-card--pick': pick, 'persona-card--new': p.id === createdId }"
        :role="pick ? 'button' : null"
        :tabindex="pick ? 0 : null"
        @click="openCard(p.id)"
      >
        <button
          v-if="!pick"
          class="persona-card__del"
          title="删除这个人设"
          @click.stop="onDelete(p.id)"
        >
          ×
        </button>

        <PersonaAvatar :persona="p" :size="72" />

        <div class="persona-card__head">
          <span class="persona-card__name">{{ p.name }}</span>
          <span class="persona-card__rel">{{ p.relationName }}</span>
        </div>

        <div class="persona-card__skin">
          <span class="persona-card__skin-dot" :style="{ background: p.skinToneHex || 'transparent' }"></span>
          <span>{{ p.skinToneName || '未定档' }}</span>
        </div>

        <!-- 特征只摆前 3 个,其余的折成 +N;一个都没有时说明「未标特征」 -->
        <div class="persona-card__tags">
          <span v-for="n in p.featureNames.slice(0, 3)" :key="n" class="persona-card__tag">{{ n }}</span>
          <span v-if="p.featureNames.length > 3" class="persona-card__tag persona-card__tag--more">
            +{{ p.featureNames.length - 3 }}
          </span>
          <span v-if="!p.featureNames.length" class="persona-card__tag persona-card__tag--more">未标特征</span>
        </div>

        <div class="persona-card__foot">
          <span class="persona-card__date">{{ (p.createdAt || '').slice(0, 10) }} 建档</span>
          <RouterLink v-if="pick" class="persona-card__use" :to="cardTo(p.id)" @click.stop>
            用这个人设 <Icon name="arrowRight" :size="12" color="var(--color-rose)" />
          </RouterLink>
        </div>
      </article>

      <RouterLink class="persona-card persona-card--create" :to="createTo">
        <span class="persona-card__plus"><Icon name="plus" :size="22" color="var(--color-rose)" /></span>
        <span class="persona-card__create-name">{{ pick ? '上传新形象，新建一份脸模' : '捏个新人设' }}</span>
        <span class="persona-card__create-desc">拍一张或传一张照片，肤色与特征由你确认</span>
      </RouterLink>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ErrorNote from '@/components/ErrorNote.vue'
import FlowTopbar from '@/components/FlowTopbar.vue'
import Icon from '@/components/Icon.vue'
import PersonaAvatar from '@/components/PersonaAvatar.vue'
import { useQueryParam } from '@/composables/useQueryParam'
import { useSceneQuery } from '@/composables/useSceneQuery'
import { useUserStore } from '@/stores/user'
import { usePersonasStore } from '@/stores/personas'
import { useDesignStore } from '@/stores/design'

/**
 * 人设库。两种模式共用这一屏:
 *   管理模式(默认)          —— 浏览 / 删除已建人设,进创建流程
 *   选人模式(?scene=&pick=1) —— 从「开始设计」跳来,挑一份档案代入创作
 *
 * ★ 两种模式的差别只有三处:返回去哪、头部那句话、点卡片去哪。
 *   卡片本身是同一张,所以不拆成两个页面。
 *
 * ★ `?created=<id>` 是建完档回来时带的一次性通知:显示一条提示、给那一张卡加高亮。
 *   它不是数据(刷新后照旧显示,源站也这样),别拿它当状态判断。
 *
 * ★ 删除走 `window.confirm` 二次确认——删掉的是**服务端**那一份(连照片字节一起),
 *   没有回收站,删了就没了。
 *   失败时 store 会把后端那句人话(`error`)原样显示出来,这里不自己编文案。
 */
const router = useRouter()
const user = useUserStore()
const personas = usePersonasStore()
const design = useDesignStore()

/** 只有带了场景才进选人模式——没场景可代入时,选人没有意义(规则见 useSceneQuery)。 */
const { sceneId, pick } = useSceneQuery()
const createdId = useQueryParam('created')

const sceneName = computed(() => (pick.value ? design.sceneNameOf(sceneId.value) : ''))

/** 建新档案的入口要把当前模式带过去:选人模式建完还要回到「替哪个场景选脸」。 */
const createTo = computed(() =>
  pick.value ? { path: '/personas/new', query: { scene: sceneId.value, pick: '1' } } : { path: '/personas/new' }
)

/** 点一张卡:选人模式代入创作,管理模式进详情。 */
function cardTo(id) {
  return pick.value
    ? { path: '/form', query: { scene: sceneId.value, persona: id } }
    : { path: `/personas/${id}` }
}

async function onDelete(id) {
  if (!window.confirm('确定删除这份人设？此操作不可恢复')) return
  await personas.remove(id)
}

/** 整张卡也是可点区域:选人模式代入创作,管理模式进详情。 */
function openCard(id) {
  router.push(cardTo(id))
}

onMounted(async () => {
  // ★ 列表现在从服务端来,不等它回来这一屏就是空的(「捏个新人设」那张卡照旧在,
  //   所以看起来不像坏了——这正是它容易被漏掉的原因)。
  await personas.load(user.id)
})
</script>
