# Frontend 模块

前端采用 React + TailwindCSS 开发。使用localStorage存储openai配置

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
# 构建产物将输出到 backend/static/ 目录
npm run build
```

启动后端（将自动托管该前端）：
```bash
cd ../backend
python3 main.py
```
访问 http://localhost:8000

## 📁 主要目录结构

```text
frontend/
├── src/
│   ├── components/      # UI 组件 (主要含 Chat 聊天、Notes 笔记等及左侧菜单)
│   ├── utils/           # 各类工具函数（API调用、配置读写等）
│   ├── App.tsx          # 页面主体布局与路由切换
│   └── main.tsx         # React 挂载点
├── public/              # 静态资源存放处
├── tailwind.config.js   # Tailwind 配置
└── vite.config.ts       # Vite 构建配置支持
```
