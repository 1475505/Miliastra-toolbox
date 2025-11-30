# Frontend 模块

前端。远期新增其他功能时使用，这里建议先用backend（fastapi）里的简单前端



### prompt


index.html现在配置了基本的前端，但是不好看，请基于此，需要用react写一个（但是部署还是需要前后端一体的）。这里要求：

1. 白色基调，分左右两个部分。
  - 左边：
     -- 上边：切换功能（知识库问答、笔记）
     -- 下边：OpenAI配置（按钮）
2. 右边：对应该功能的界面。希望简洁好看。

要求：
- 使用localStorage存储openai配置
- 保持index.html的前后端交互处理逻辑
- 不要过度设计，像 Apple 官网那样简洁
- 对话时是流式处理，请保持连接，5分钟无心跳则报错超时。

技术栈:React + TailwindCSS，与 FastAPI 后端一体部署。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式

```bash
npm run dev
```

访问 http://localhost:5173

### 3. 构建部署

```bash
# 构建到 backend/static/ 目录
npm run build

# 启动后端（自动托管前端）
cd ../backend
python main.py
```

访问 http://localhost:8000
