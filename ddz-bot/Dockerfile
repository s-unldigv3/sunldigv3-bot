# 基础镜像：Node.js 18 Alpine
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 关键修正1：本地安装 ws（无 --global），先赋权 root 安装，再切换用户
RUN npm install --silent ws@8.16.0

# 复制机器人代码（含端口监听）
COPY ddz_bot.js ./

# HF 安全要求：创建普通用户并赋权
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app  # 把 node_modules 也赋权给普通用户

# 切换到普通用户
USER appuser

# 健康检查（检测 7860 端口）
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:7860 || exit 1

# 启动机器人
CMD ["node", "ddz_bot.js"]