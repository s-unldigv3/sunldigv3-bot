# 使用轻量级的 Node 镜像
FROM node:20-slim

# 安装基础依赖（保留git，和参考示例一致）
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# 设置容器内工作目录
WORKDIR /app

# 1. 初始化并安装你的所有依赖（包含async-mutex）
RUN npm init -y && \
    npm install ws node-fetch@2 fs-extra async-mutex --save

# 2. 复制你的 index.js 到容器内
COPY index.js .

# 3. 针对 HF Spaces 的保活机制（重要）：
# 自动往index.js末尾追加健康检查代码，监听7860端口
RUN echo "require('http').createServer((req, res) => res.end('Bot Running')).listen(7860, '0.0.0.0');" >> index.js

# 4. 执行命令
CMD ["node", "index.js"]
