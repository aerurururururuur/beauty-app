import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

// 样式引入顺序有讲究,别调换:
// tokens 先(下面三份都吃它的变量)→ base(骨架/侧栏/通用类)→ pages(第一层页面)
// → flow(第二层动线页)。后两份的选择器更具体,顺序反了会被 base 压掉。
import './assets/styles/tokens.css'
import './assets/styles/base.css'
import './assets/styles/pages.css'
import './assets/styles/flow.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
