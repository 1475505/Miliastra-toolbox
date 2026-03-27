# 千星奇域工具箱

千星奇域工具箱是AI赋能，提升千星沙箱编辑效率的工具集合。

## 快速使用

- **前端知识问答**: [访问地址](https://ugc.070077.xyz)（建议自带API使用）
- **QQ机器人**: 通过nonebot插件提供问答。群号：1007538100（工具箱用户群）

## 部署与开发

详细的模块文档请参考各子目录的 `README.md`：

1. **[Docker 一键部署](./docker/README.md)**（推荐）
2. **源码本地启动流程**:
   - [知识库构建](./knowledge/rag_v1/README.md)
   - [前端构建](./frontend/README.md)（可选，代码库已包含构建产物）
   - [后端启动](./backend/README.md)

## 开发计划

- [x] **知识问答系统**：支持多目录（guide + tutorial）的知识库构建和查询。
- [x] **前后端搭建**：FastAPI后端（提供免费模型）与 React前端。
- [ ] **数据问答系统**：集合并统计参数数据，与AI对话设计。
- [ ] **素材寻找系统**：通过多模态RAG快速寻找符合描述的素材。

> 本项目大部分代码由AI生成

## 项目结构 (Project Structure)

```text
.
├── backend/       # FastAPI 后端服务（处理对话、RAG 检索）
├── frontend/      # React 前端交互界面
├── knowledge/     # 知识库管理
│   ├── spider/        # 官方文档爬虫
│   ├── bbs_spider/    # 论坛问答爬虫
│   ├── rag_v1/        # 向量知识库构建与 RAG 核心逻辑
│   └── Miliastra-knowledge/ # 实际的 Markdown 文档存放库
├── docker/        # Docker Compose 部署配置
└── CLAUDE.md      # 开发与 AI 协作规范
```
