# Backend Architecture Spec

## 1. 目标

本文定义后端模块的职责边界与依赖方向，用于指导：

- RAG、Agent、Tool 的职责拆分
- 新旧接口并存
- 结构化知识与语义知识的统一接入
- 后续测试与维护边界

## 2. 现状问题

当前后端的主要问题如下：

1. API 层、业务编排层、RAG 层职责混杂。
2. `ChatEngine` 承载过多责任，包括模型配置、配额控制、检索编排、图片输入处理、流式输出。
3. 结构化知识访问能力尚未成为正式工具。
4. Agent 化能力尚未形成单独边界。
5. 文档规范与代码实现存在漂移。

## 3. 目标分层

目标后端拆分为四层：

1. API Layer — HTTP 接口与协议
2. Agent Layer — Agent 编排与 Prompt 管理
3. Tool Layer — 结构化知识 + RAG 检索的工具封装
4. RAG Layer — 语义召回与答案合成

> 不再单独设 Knowledge Access Layer。结构化知识读取（`derived/` 目录）直接由 Tool Layer 内部完成，无需额外抽象。

## 4. 各层职责

### 4.1 API Layer

职责：

1. 定义 HTTP 路由（`/api/v1/rag/*`、`/api/v1/agent/*`）。
2. 负责请求校验与响应序列化。
3. 负责流式 SSE 输出控制。

不负责：

1. Prompt 编排或工具选择。
2. 直接读取知识文件。

建议目录：`backend/api/`

### 4.2 Agent Layer

职责：

1. 管理 System Prompt 与轻量上下文注入。
2. 注册 tools，初始化 LlamaIndex FunctionAgent。
3. 执行 tool-calling 对话循环。
4. 汇总 tool trace、sources、stats。

不负责：

1. 底层知识文件 IO。
2. 向量检索实现细节。
3. HTTP 协议细节。

建议目录：`backend/agent/`

### 4.3 Tool Layer

职责：

1. 对 Agent 暴露 3 个稳定工具（参见 [agent-tools.md](agent-tools.md)）：
   - `get_node_info` — 读取 `derived/index.json` + `derived/node/*.md`
   - `get_document_content` — 读取 `derived/` 下对应文档正文
   - `search_knowledge` — 调用 RAG Layer
2. 直接读取 `derived/` 目录下的结构化知识产物（index.json、node/*.md、faq/faq.md），无需额外 Knowledge Access 抽象。
3. 保证输入输出 schema 稳定，支持模糊匹配。

不负责：

1. HTTP 接口。
2. Prompt 设计。

建议目录：`backend/tools/`

### 4.4 RAG Layer

职责：

1. 负责语义召回（向量检索 + 元数据过滤）。
2. 负责答案合成。
3. 负责和 LlamaIndex / Chroma 等组件交互。
4. 作为 `search_knowledge` 工具的下游能力。
5. 通过 `RAGEngine.retrieve_nodes()` 为 backend `CombinedRetriever` 提供带过滤的原始节点检索。

建议目录：`backend/rag_core/`

说明：第一阶段通过 adapter 复用现有 `knowledge/rag_v1/src/rag_engine.py`。backend 的 `CombinedRetriever` 已改为通过 `rag_engine.retrieve_nodes()` 执行检索，不再直接访问 `rag_engine.index`。

## 5. 推荐目录结构

```text
backend/
  api/
    rag_router.py        # 旧 RAG 路由（保持兼容）
    agent_router.py      # 新 Agent 路由
    models.py            # 请求/响应 Pydantic 模型
  agent/
    engine.py            # FunctionAgent 创建与运行
    prompts.py           # System Prompt 模板管理
    context.py           # 轻量上下文（目录摘要）生成
  tools/
    registry.py          # 工具注册表
    node_tools.py        # get_node_info 实现
    document_tools.py    # get_document_content 实现
    rag_tools.py         # search_knowledge 实现
  rag_core/
    adapter.py           # 对 rag_v1 的适配封装
  shared/
    llm_factory.py       # LLM 实例化与渠道配置
    quota_service.py     # 配额管理
    errors.py            # 统一异常
  main.py
```

## 6. 依赖方向

允许的依赖方向：

```
API Layer  ->  Agent Layer  ->  Tool Layer  ->  RAG Layer
   |               |               |               |
   +-> shared      +-> shared      +-> shared      +-> shared
```

禁止的依赖方向：

1. RAG Layer -> API / Agent / Tool（仅被调用，不反向引用）
2. Tool Layer -> API / Agent
3. Agent Layer -> API

## 7. 核心数据流

### 7.1 RAG API 数据流（保持不变）

```
用户请求 -> API -> ChatEngine -> CombinedRetriever -> rag_engine.retrieve_nodes(filters) -> ChromaDB -> 合并去重 -> LLM 合成 -> API 响应
```

`CombinedRetriever` 执行基于名额分配的两阶段优先级检索：
1. Phase 1: 召回 `bbs_key != bbs_value` 的节点（如官方文档），最多 `doc_max` 条
2. Phase 2: 召回 `bbs_key == bbs_value` 的节点（如 bbs 帖子），补齐至 `total_k` 条
3. 合并后按 `node_id` 去重

### 7.2 Agent API 数据流

```
用户请求
  -> API 解析请求
  -> Agent Engine 注入 system prompt + 轻量目录上下文
  -> Agent 判断调用哪些 tool
     -> get_node_info("碰撞触发器")    → 读 derived/index.json + node/事件节点.md
     -> search_knowledge("碰撞事件触发条件")  → RAG 向量检索
  -> Agent 汇总工具结果，生成最终回答
  -> API 输出 answer + sources + tool_trace
```

## 8. Agent 运行时案例

以下是一次完整的 Agent 对话执行流程示例。

### 8.1 用户输入

```
碰撞触发器怎么用？需要配置哪些参数？
```

### 8.2 System Prompt（注入时）

```
你是千星沙箱知识助手，千星沙箱是一款游戏UGC编辑器，主要通过配置实体、节点图来进行操作。

你可以使用以下工具获取信息：
- get_node_info: 查询节点名称、说明、参数，输入节点名称
- get_document_content: 获取某篇文档的完整内容，输入文档标题
- search_knowledge: 在知识库中语义检索，输入自然语言问题

当前知识库包含以下文档目录：
- 执行节点（56 个节点）
- 事件节点（43 个节点）
- 流程控制节点（28 个节点）
- 查询节点（65 个节点）
- 运算节点（30 个节点）
- 其它节点（18 个节点）
- FAQ（392 条）

使用策略：
1. 用户问的是明确的节点、组件、参数 → 优先用 get_node_info
2. 用户问的是某篇文档的内容 → 用 get_document_content
3. 用户问的是开放问题、排障、跨文档比较 → 用 search_knowledge
4. 结构化工具结果不足时,再补充调用 search_knowledge

回答时引用来源，若需要出现文档未提及的观点，请简单标注。
```

### 8.3 Agent 推理过程

```
Step 1 — Agent 分析意图
  用户问"碰撞触发器"，这是明确的节点名称，优先使用 get_node_info

Step 2 — Tool Call: get_node_info
  输入: {"name": "碰撞触发器"}
  输出: {
    "success": true,
    "data": {
      "title": "碰撞触发器",
      "main_title": "二、触发器",
      "source_doc": "事件节点",
      "content": "## 碰撞触发器\n\n### 节点功能\n当碰撞盒组件...\n\n### 节点参数\n| 类型 | 名称 | 数据类型 | 说明 |\n..."
    }
  }

Step 3 — Agent 判断信息是否充分
  节点参数表已完整返回，无需追加检索

Step 4 — Agent 生成最终回答
  基于 get_node_info 返回的内容，组织自然语言回答
```

### 8.4 API 响应（摘要）

```json
{
  "success": true,
  "data": {
    "answer": "碰撞触发器是事件节点，当碰撞盒组件发生碰撞时触发。需要配置以下参数：...",
    "sources": [
      {"title": "碰撞触发器", "source_doc": "事件节点", "local_path": "official/guide/事件节点.md"}
    ],
    "mode": "agent",
    "tool_trace": [
      {"tool": "get_node_info", "args": {"name": "碰撞触发器"}, "status": "success"}
    ],
    "stats": {"tool_calls": 1, "retrieval_calls": 0, "tokens": 420}
  }
}
```

### 8.5 多工具协作案例

用户输入：`实体死亡后怎么播放特效？`

```
Step 1 — Agent 分析：涉及"死亡"事件 + "特效播放"执行，可能需要多个节点信息

Step 2 — Tool Call: get_node_info({"name": "死亡触发器"})
  → 返回死亡触发器的事件节点信息

Step 3 — Tool Call: get_node_info({"name": "播放特效"})
  → 返回播放特效的执行节点信息

Step 4 — Agent 判断：两个节点信息已足够说明流程，无需 RAG

Step 5 — 生成回答：先用死亡触发器监听事件，再连接播放特效节点...
```

## 9. 迁移策略

### 9.1 第一阶段

1. 保留现有 `rag/` 目录和路由，不改动。
2. 新增 `api/agent_router.py`、`agent/`、`tools/`、`rag_core/adapter.py`。
3. Tool Layer 直接读 `derived/` 产物。
4. `rag_core/adapter.py` 封装对 `rag_v1` 的调用。
5. `shared/` 从 `ChatEngine` 中提取 LLM 配置和配额逻辑。

### 9.2 第二阶段

1. 将现有 `ChatEngine` 能力下沉拆分到 `rag_core/` 和 `shared/`。
2. 旧 `rag/` 路由迁移到 `api/rag_router.py`。
3. 收敛模型配置与配额逻辑到 `shared/`。

## 10. 测试边界

### 10.1 Tool Layer

应测试：

1. `get_node_info` — 精确匹配、模糊匹配、未找到
2. `get_document_content` — 正常读取、标题模糊、不存在
3. `search_knowledge` — RAG 调用正确性、结果格式
4. 输入校验与错误包装

### 10.2 Agent Layer

应测试：

1. System Prompt 正确拼接（含轻量上下文）
2. 工具注册完整性
3. tool trace 记录完整
4. 结果汇总格式正确

### 10.3 API Layer

应测试：

1. 请求模型校验
2. 非流式响应格式
3. 流式 SSE 事件顺序与格式
4. 错误码与错误对象

## 11. 可观测性要求

建议每轮请求记录以下信息：

1. 请求模式：`rag` 或 `agent`
2. 使用的模型渠道
3. 工具调用次数与名称
4. RAG 检索次数
5. 最终来源数
6. completion tokens
7. 总耗时

## 12. 非目标

当前阶段不包含：

1. 多 Agent 架构
2. 动态外部工具热插拔
3. 写入型知识维护工作流
4. 完整 A2A 或 MCP 协议支持