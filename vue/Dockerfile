# syntax=docker/dockerfile:1
#
# 前端镜像。★ build context 必须是**仓库根**,不是 vue/:
#   docker build -f vue/Dockerfile -t olyhks-vue .
#
# ★ 为什么不能 context=vue/:
#   vite.config.js:13 把 `@scene-rules` 别名指到 ../server/src/modules/shared/domain/scene-rules.ts
#   —— 前端**直接执行后端源码**里的场合规则,为的是"浏览器 mock 与真实后端必须给出同一个判定,
#   各抄一份会静默漂移"。所以 vue/ 单独作 context 时那个文件不在,构建必然失败。
#   这是本项目最不"标准"的一点,照抄网上 Vue Dockerfile 必踩。

# ── 构建阶段 ────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app/vue

COPY vue/package.json vue/package-lock.json ./
RUN npm ci

# 把后端那份场景规则放到别名期望的相对位置(/app/vue/../server/... == /app/server/...)。
# 只拷这一个文件就够:它只 import type(编译期擦除),其余 import 全是类型。
# ⚠️ 将来往 @scene-rules 或别的跨包别名里加文件,这里要同步加 —— 漏了是**构建报错**,
#   不是静默出错,这个失败方式可以接受。
COPY server/src/modules/shared/domain/scene-rules.ts /app/server/src/modules/shared/domain/scene-rules.ts

# ── 构建期变量(★ 这是最容易做出"假开关"的一处)───────────────────
# VITE_* 是 **build 时烘焙**进产物的,和后端运行时读 env 不是一回事 ——
# 运行时给 `-e VITE_USE_MOCK=false` **完全无效**,别试。
#
# ★ 缺省为什么是 false(走真实后端),而不是跟着 .env.example 的 true:
#   看 vue/src/api/use-mock.js:11 —— `import.meta.env.VITE_USE_MOCK !== 'false'`。
#   变量**没设**时求值为 true,即 **mock 模式**。而 .dockerignore 排掉了 vue/.env
#   (那是故意的:否则你本机 .env 的设置会悄悄决定镜像内容),所以不做这一步
#   就会构建出一个"不调后端、不发一个请求、界面却完全正常"的纯假镜像。
#   后端那几个开关缺省选 mock 是为了"不花钱";这一个缺省选 false 是为了**不骗人** ——
#   容器是拿来跑真实服务的。
ARG VITE_USE_MOCK=false
# 走相对路径,由 nginx.conf 把 /api 反代到 server 服务。
# 给成绝对地址(如 http://api.example.com)会让浏览器直连、绕过 nginx 反代,并撞 CORS。
ARG VITE_API_BASE=/api

# Vite 的 loadEnv 会把进程环境里 VITE_ 开头的变量纳入 import.meta.env,
# 所以这里用 ENV 把 ARG 传给 `npm run build` 这一步。
ENV VITE_USE_MOCK=${VITE_USE_MOCK} \
    VITE_API_BASE=${VITE_API_BASE}

# 拷前端本体。.dockerignore 排掉了 vue/.env,构建不再受本机设置影响 ——
# 镜像内容只由上面两个 ARG 决定,可复现。
COPY vue/ ./

RUN npm run build

# ── 运行阶段:nginx 托静态产物 ─────────────────────────────────
# 前端是纯静态 SPA,不需要 node 运行时。跑 node 只会把镜像做大并多一堆运行时 CVE。
FROM nginx:1.27-alpine AS runtime

COPY vue/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/vue/dist /usr/share/nginx/html

EXPOSE 80
