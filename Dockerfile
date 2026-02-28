# 使用轻量级的 Node 镜像
FROM node:20-slim

# 安装基础依赖
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# 设置容器内工作目录
WORKDIR /app

# 1. 按照你要求的步骤：初始化并安装依赖
RUN npm init -y && \
    npm install ws node-fetch@2 fs-extra --save

# 2. 复制你的 index.js 到容器内
COPY index.js .

# 3. 针对 HF Spaces 的保活机制（重要）：
# 如果你的代码没有监听端口，HF 可能会判定为启动失败。
# 我们在启动脚本里强行加上一个简单的健康检查。
RUN echo "require('http').createServer((req, res) => res.end('Bot Running')).listen(7860);" >> index.js

# 4. 执行命令
CMD ["node", "index.js"]