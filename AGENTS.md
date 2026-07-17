所有的修改，若对该子模块下的README.md、测试或者任何文档的信息产生了破坏，请进行对应的修改。

使用python3启动，而非python

禁止使用any、object等非具体的数据类型，根据实际函数签名接受的参数类型决定。充分利用文档搜索等方式，获取正确的API调用方法和示例代码。

## 项目更新与重启流程

本项目为前后端一体化部署：前端构建产物输出到 `backend/static`，由后端 FastAPI 统一托管。

1. 更新代码：
   ```bash
   git pull origin main
   ```

2. 构建前端（输出至 `backend/static`）：
   ```bash
   cd frontend
   npm run build
   ```

3. 重启后端服务（PM2 管理）：
   ```bash
   pm2 restart qx-be
   pm2 save
   ```

后端实际启动命令为 `uvicorn main:app --host 0.0.0.0 --port 8000`，详细配置见 `backend/ecosystem.config.cjs`。