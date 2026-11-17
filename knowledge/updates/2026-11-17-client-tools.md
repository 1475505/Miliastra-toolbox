# 聊天知识库：模拟器与客户端文档集成

- 子模块 main 从 `766999d` 快进到 `0973567`，新增 `tools/simulator.md`。
- 默认 RAG 知识源新增 `tools/` 和 `client/`；初始化及清洗按 ID 排除 Lua API 参考 `mhtakr07vej4`，保留其他客户端控件、容器和教程。
- 聊天检索将 `client` 视为官方来源，`tools` 参与补充召回。
- 停止后端后备份现有向量库至 `/tmp/miliastra-rag-before-client-tools-20261117.tar.gz`，按两个新目录增量导入，未全量重建。
- 导入 11 篇，失败 0：客户端 10 篇 / 29 个块，模拟器 1 篇 / 4 个块；库内总节点 2272。Lua API ID 不在向量库中。
- 通过实际 `CombinedRetriever` 验证“千星沙箱模拟器如何安装到 DeepSeek Harness”召回 `simulator.md`，“客户端控件容器如何配置”召回客户端容器文档。
- `python3 -m unittest knowledge.test_cleanup mcp.test_process_docs`：11 项通过；`git diff --check` 通过。
- 已重启 `qx-be` 并保存 PM2 状态。本次无需前端构建；未修改 MCP 派生索引。代码、子模块指针及向量库随本次集成提交发布。
