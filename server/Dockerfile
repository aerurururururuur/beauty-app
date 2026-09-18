# syntax=docker/dockerfile:1
#
# 后端镜像。★ build context 必须是**仓库根**,不是 server/:
#   docker build -f server/Dockerfile -t olyhks-server .
# 因为 .dockerignore 在根上,且后续前端镜像要读 ../products(见 compose)。
#
# 这个项目对容器化很友好:纯 JS 依赖、无 node-gyp 编译、无数据库。
# 真正需要注意的不在这里,而在 .env / cwd / HOST 那三处,逐条注释在下面。

# ── 构建阶段:装全量依赖 + 编译 TS ──────────────────────────────
FROM node:22-slim AS build
WORKDIR /app/server

# 先只拷 manifest,让依赖层能被 Docker 缓存住 —— 改业务代码不重装依赖。
COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# ── 运行阶段:只留编译产物 + 生产依赖 ──────────────────────────
FROM node:22-slim AS runtime

# ★ 容器内必须监听 0.0.0.0。
#   配置缺省是 127.0.0.1(config.ts:212),容器里那等于只听 loopback:
#   服务起来了、docker ps 正常、日志干净,但宿主 curl 连不上,-p 映射形同虚设。
#
# ★ 用 ENV 钉而不是改 .env,是有意为之,但**它只挡得住其中一种来源**,说清楚:
#   1) 把 .env **当作文件**挂进容器(-v ./server/.env:/app/server/.env) → 挡得住。
#      它走 app 自己的 loadDotEnvIfPresent,而那支的口径是"已有环境变量优先"
#      (config.ts:142),所以镜像 ENV 赢。
#   2) docker run --env-file / compose 的 env_file: → ★ **挡不住**。
#      那不是挂文件,是 Docker 在运行时直接注入环境变量,会覆盖镜像 ENV。
#      .env 里的 HOST=127.0.0.1 会把下面这行顶掉,容器又变成只听 loopback。
#   ⇒ 所以 compose 里既然挂了 server/.env,就必须再用 environment: 把
#     HOST / PORT / DATA_DIR 显式钉一遍(compose 的 environment 优先于 env_file)。
#
# ★ DATA_DIR 必须是绝对路径:config.ts:215 是 path.resolve(cwd, DATA_DIR),
#   相对值会落在镜像层内的 /app/server/data —— 容器一重建,任务记录和照片全没。
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/server/dist ./dist

# ── 产品库(生成物,已进 git,直接拷)──────────────────────────────
# ★ 这一步漏了**不会报错**。PRODUCTS_DIR 的语义是"指向不存在的路径 = 关掉产品库"
#   (见 .env.example,那是为回归测试故意留的):工具不注册、模型看不到产品、
#   推荐功能消失,而服务照跑、接口照回 200、日志里只有"没那行"。
#   验收判据就是启动日志必须打出 `[products] 已加载…:57 条 / 9 类目`。
COPY products /app/products

# ★ 指到**容器目录**而不是具体那个库,是有意选的:
#   指到 /app/products/ysl-property 时,将来 products/ 下多一个品牌库,
#   容器会静默只推 YSL;指到容器目录则"有多个库就启动即失败并要求指明一个"。
#   这正是 PRODUCTS_DIR 注释里的原话:"随便挑一个的后果是模型只看得见其中一个品牌,
#   而它自己不知道"。宁可吵。
ENV PRODUCTS_DIR=/app/products

# 注意:**不 COPY server/.env**。
# 镜像里没有它,运行时不挂载就一律走 .env.example 那套"不产生账单"的缺省
# (AGENT_LLM=mock / MAKEUP_ENGINE=mock / WEATHER_PROVIDER 除外,那条缺省实拉但免费)。
# 要全真,运行时再 --env-file 或 -e 挂进来,key 不进镜像。

# 非 root 运行。先建好 /data 并改属主:命名卷首次挂载时会**继承镜像里的属主**,
# 所以这一步做对了,`-v olyhks-data:/data` 起的卷 node 用户才写得进去。
# ⚠️ bind mount(-v ./data:/data)不继承,那条路要自己在宿主上 chown。
RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 3000
CMD ["node", "dist/index.js"]
