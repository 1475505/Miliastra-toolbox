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
# 构建产物输出到 backend/static/ 目录（构建产物不入库）
npm run build
```

启动后端（将自动托管该前端，可以通过pm2托管，使用pm2 restart qx-be重新部署）：
```bash
cd ../backend
python3 main.py
```
访问 http://localhost:8000

## 仓库策略说明

- `backend/static/` 下的构建产物（`index.html`、`assets/*`）不提交到 Git。
- 每次部署都需要先执行 `npm run build`，再重启后端进程（如 `pm2 restart qx-be`）。
- 这样可以减少 PR 中因 hash 文件名变化导致的大量 delete/add 噪音。

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
