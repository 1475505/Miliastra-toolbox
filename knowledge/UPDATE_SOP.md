# 知识库版本更新 SOP

本流程覆盖官方指南、教程、FAQ、BBS 问答、派生节点/SVG、向量库及首页公告。当前执行示例为 7.2（官方发布 2026-11-04，知识库发布 2026-11-05），上次主库更新为 7.1（2026-09-24）。

## 1. 确认基线与备份

- 检查主仓库和 `knowledge/Miliastra-knowledge` 子模块的 `git status`、分支、远端及提交号。保留已有用户改动，不直接覆盖或在脏工作区盲目 `git pull`。
- 记录上次版本、目录更新时间和 BBS 已收录最大楼层。BBS 楼层是增量游标，不是日期。
- 保存 `config/urls-*.json`、原始官方目录和更新日志，作为本次差异核对依据。
- 备份整个 `rag_v1/db/`，SQLite 文件用 Python `sqlite3.Connection.backup()` 获取一致快照；发布前备份 `backend/static/`。
- 确认磁盘空间、Firecrawl 和 Embedding 服务可用；不输出 `.env` 内容。

## 2. 对照官方变更确定范围

官方更新日志：https://act.mihoyo.com/ys/ugc/tutorial/detail/mhs2w008wf14

官方目录位于 `https://act-webstatic.mihoyo.com/ugc-tutorial/{knowledge|course|faq}/cn/zh-cn/catalog.json`。

比较文档 ID、标题和 `updated_at`，分别列出新增、修改、移除和未变条目。官方时间戳可能早于版本发布日，不能直接用新版本发布日期当 `--since`；用上次抓取边界，并核对新增 ID 是否全部进入候选。

复制上一版配置为 `config/filtered-<版本>.json`，保留累计规则：

- `divertIds` / `divertScope`：客户端控件、Lua 脚本及相关教程分流到 `client/`，不进入主目录、`title.json` 和向量库。
- `skipUpdateIds`：保留旧内容和旧目录元数据；必须记录原因，避免日后误以为是最新正文。
- `redactSections`：从混合文档中删除客户端专题；`expectedMatches` 必须与原文一致。匹配失败先检查原文结构，不能关闭过滤后强行落盘。
- `bbs`：记录帖子 ID、起始楼层和人工审阅后的 `excludeFloorIds`；不要仅凭“客户端”三个字排除普通客户端节点图。

传统界面控件与客户端 Lua 控件不同。普通按钮拍照、卡牌控件等非 Lua 功能可进入主库；混合内容必须审阅。主库排除不等于删除现有独立 `client/` 文档。

## 3. 抓取官方目录与正文

在 `knowledge/spider/` 执行：

```bash
npm run crawl -- --filter-config=../config/filtered-7.2.json
npm run scrape -- --since=2026-09-23 --force --filter-config=../config/filtered-7.2.json
```

目录与正文必须使用同一个配置。`scrape` 自动读取 `urls-client.json`，分流内容也会抓取，但不会进入主库。默认限速为每分钟 4 次请求；保留日志并检查最终失败数，失败时不要宣布抓取完成。

按 ID 补抓失败项（`--ids` 仍受日期和过滤条件约束）：

```bash
npm run scrape -- --ids=文档ID1,文档ID2 --since=2026-09-23 --force --filter-config=../config/filtered-7.2.json
```

页面抓取失败时可尝试现有官方静态正文回退。检查编码、标题层级、表格和图片链接；正文为空、乱码或过滤未匹配时应失败，不得覆盖现有有效文档。

## 4. 更新 BBS 问答

从已入库的最大楼层加 1 开始。本轮原最大楼层为 1315：

```bash
cd knowledge/bbs_spider
python3 crawler.py --since-id 1316
```

此目录生成文件与中间 JSON 默认被 Git 忽略。相同 `since-id` 会复用缓存；重试要先核对缓存日期和 API 分页是否完整，不能把历史缓存当成最新抓取。

逐条审阅问题和回答，把 Lua/客户端控件相关楼层加入本次配置，再从仓库根目录执行：

```bash
python3 knowledge/filter_bbs.py \
  knowledge/bbs_spider/bbs-faq-since1316.md \
  knowledge/Miliastra-knowledge/bbs/bbs-faq-since1316.md \
  --filter-config knowledge/config/filtered-7.2.json
```

核对保留/排除数量、楼层重复和上下界。问答保留作者及楼层来源，社区观点不改写成官方保证。

## 5. 同步派生资产与索引

- 审阅子模块正文差异，确认新增主库文档和客户端分流路径。
- 更新文档子模块 `AGENTS.md` 中的目录摘要。
- 从仓库根目录运行 `python3 mcp/process_docs.py`，生成节点分类和 `derived/index.json`。
- 对本轮功能变化更新现有 SVG；新主题新增 SVG，并同步 `derived/svg_index.md`。SVG 以官方正文为依据，检查 XML、文字溢出和版本标记；未涉及的旧图不应只改版本号伪装成已更新。
- 检查主目录及派生节点中不存在本轮排除的客户端章节。
- 节点索引与 Markdown 使用 `chunk_id` 对齐，禁止按标题覆盖正文。同端且文字定义相同的节点合并，保留全部来源和配图；不同端或参数不同的同名节点保留独立条目。

## 6. 增量更新向量库

在 `knowledge/rag_v1/` 执行：

```bash
python3 rag_cli.py init
python3 rag_cli.py status
python3 rag_cli.py retrieve '造物扰动装置如何配置'
```

不要使用 `init --force`：它会清空集合并全量重建。普通增量依赖 `crawledAt`；文档前置元数据 `force: true`（历史 BBS 文件常见）仍会触发重新嵌入，因此处理数不一定等于新增文档数。

普通 `init` 完成后自动执行确定性清洗：排除 README/category、空块与播放器模板，完全相同切片合并并保留 `all_sources_json`。文档 ID 重复时停止导入，需先清理旧标题文件；爬虫成功保存新文件后会清理同 ID 的旧文件。自定义目录导入不会触发全库清洗。

已有向量库可先预览再应用（不调用嵌入服务；缺少任一源切片的向量时停止写入）：

```bash
# 从仓库根目录执行；应用前备份数据库并停止持有嵌入式 Chroma 的服务
python3 -m knowledge.rag_v1.src.cleanup
python3 -m knowledge.rag_v1.src.cleanup --apply
```

应用后再次预览，`removed` 和 `metadata_updates` 应为 0；核对每条来源切片都有对应向量（包含合并来源），并检查源文件 ID、BBS 楼层唯一性。

必须核对：失败数为 0、新文档/BBS 节点存在、分流 ID 不在集合中、删节正文未残留。检查实际召回来源，而不只看总节点数。若当前向量库已有应排除的历史数据，须按明确 ID 处理，不能仅期待增量任务自动删除。

## 7. 公告与发布

- 更新 `frontend/public/NOTICE.md` 的日期和版本，保留当前公告形式及必要链接。
- 公告由前端请求 Markdown。源文件更新不等于线上更新，必须构建到 `backend/static`。
- 公告应避免长时间缓存；同时验证公开域名与本机源站。已打开的旧页面至少需要刷新一次。
- 发布授权已获得时，按现行项目流程构建、重启；不要重复询问同一个已授权步骤。

```bash
cd frontend
npm run build
```

需要提交发布时：先提交并推送文档子模块，再提交主仓库的新子模块指针、配置、脚本、文档、公告和向量库。主仓库的向量 SQLite 使用 Git LFS，确认 LFS 上传成功；不提交 `.env`、抓取缓存、备份或 `.codex/` 本地文件。已有无关改动保留原状。

```bash
pm2 restart qx-be
pm2 restart qx-mcp
pm2 save
```

后端与 MCP 都会缓存派生索引，所以两者都需要重启。

## 8. 验收和记录

- 爬虫测试和 TypeScript 检查通过；前端构建通过；Python 语法、SVG XML、`git diff --check` 通过。
- 主库新增文档、过滤规则和 BBS 排除楼层审计通过。
- `/health`、`/NOTICE.md`、`/all` 正常；公告为本轮日期版本，MCP 工具能够读取新文档。
- 公开域名验收内容及缓存头，不能仅用本机 HTTP 200 代替用户可见结果。
- 记录抓取候选/成功/失败数、BBS 保留/排除数、向量节点数、提交号及部署状态到 `knowledge/updates/<版本>.md`。
- 失败时保留日志，按阶段重试；回滚使用本轮备份和明确的旧提交，不覆盖无关工作区改动。
