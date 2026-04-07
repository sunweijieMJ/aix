# ---- Stage 1: Builder ----
FROM node:22-alpine AS builder

# 安装原生模块编译工具（better-sqlite3 需要 node-gyp）
RUN apk add --no-cache python3 make g++

# 启用 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 复制整个 monorepo（pnpm workspace 解析需要完整结构）
COPY . .

# 安装所有依赖（含 devDependencies，供构建使用）
RUN pnpm install --frozen-lockfile

# 构建 server 包
RUN pnpm --filter=@aix/server build

# 提取独立部署包（仅保留生产依赖，解析 workspace: 协议）
RUN pnpm --filter=@aix/server deploy --prod /deploy

# ---- Stage 2: Runner ----
FROM node:22-alpine AS runner

WORKDIR /app

# 从构建阶段复制独立部署包（已含编译后的原生模块）
COPY --from=builder /deploy .

# 预建持久化目录（需挂载 volume）
RUN mkdir -p storage/data storage/uploads/docs

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
