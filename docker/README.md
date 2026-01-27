# Docker 部署

## 方法一：通过Docker Compose启动

### Step1. 构建镜像

> docker hub里有推送较早版本的镜像，未及时更新

```bash
cd docker

# 构建 Docker 镜像
docker build -t dudukl/miliastra-toolbox:latest .
```


### Step2. 修改环境变量

```bash
# 修改docker-compose.yml 设置必需的嵌入模型环境变量（默认硅基流动）
vim docker-compose.yml

export OPENAI_API_KEY=your-api-key
```

**必需**：
- `OPENAI_API_KEY` - 硅基流动 API Key（用于嵌入和检索）

**可选**（都有默认值）：
- `OPENAI_BASE_URL` - API Base URL（默认: 硅基流动 API）
- `EMBEDDING_MODEL` - 嵌入模型（默认: BAAI/bge-m3）
- `DEFAULT_FREE_MODEL_KEY` - 默认免费模型 Key
- `DEFAULT_FREE_MODEL_URL` - 默认免费模型 URL
- `DEFAULT_FREE_MODEL_NAME` - 默认免费模型名称
- `DEFAULT_FREE_MODEL_KEY2` - 默认免费模型2 Key
- `DEFAULT_FREE_MODEL_URL2` - 默认免费模型2 URL
- `DEFAULT_FREE_MODEL_NAME2` - 默认免费模型2名称
- `TOP_K` - 检索文档数（默认: 5）
- `SIMILARITY_THRESHOLD` - 相似度阈值（默认: 0.3）
- `PG_URL` - PostgreSQL URL（仅分享功能需要）

### Step3. 部署服务

```
# 启动服务
docker-compose up -d
```

访问 http://localhost:8000

您也可以粘贴docker-compose.yml到dokploy等平台部署，注意修改环境变量。

### 常用命令

```bash
# 启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down

# 重启
docker-compose restart
```

---

## 方式二：Railway 一键部署

TODO