# ============================================
# 第一阶段：构建阶段
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装所有依赖（包括 devDependencies）
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建应用
RUN pnpm build

# ============================================
# 第二阶段：生产运行阶段
# ============================================
ARG BASE_IMAGE=node:22-alpine
FROM $BASE_IMAGE

WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 只安装生产依赖
RUN pnpm install --prod --frozen-lockfile

# 从构建阶段复制构建产物
COPY --from=builder /app/dist ./dist

# 复制构建信息文件（如果存在）
COPY server_build_info.sh ./

# 创建数据目录
RUN mkdir -p /app/data && \
    chown -R node:node /app

# 使用非 root 用户运行
USER node

# 暴露端口
EXPOSE 31100

# 设置环境变量
ENV NODE_ENV=production \
    PORT=31100

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:31100/health || exit 1

# 启动应用
CMD ["pnpm", "prod"]
