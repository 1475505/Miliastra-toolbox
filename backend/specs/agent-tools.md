# Agent Tools Spec

## 1. 目标

本文定义 Agent 可调用工具的标准契约。与 [mcp/SKILL.md](../../mcp/SKILL.md) 保持一一对应：

- 4 个工具
- 输入输出 schema
- 模糊匹配与批量调用规则
- 错误语义

## 2. 设计原则

1. 工具面向 Agent，不面向 HTTP。
2. 工具与 `mcp/SKILL.md` 中描述的三类知识访问一一对应。
3. 结构化工具优先于 RAG 工具。
4. 工具支持模糊匹配，避免轻微命名差异导致空结果。
5. 工具支持批量调用，减少 Agent 多轮请求消耗 token。
6. 工具直接返回 JSON 字符串，不额外包装 `{success, data, error}`。

## 3. 工具列表

| 编号 | 工具名 | 职责 |
|------|--------|------|
| 1 | `get_node_info` | 输入节点名称列表，返回节点说明、参数、所在文档 |
| 2 | `list_documents` | 列出文档标题和路径，可选关键词模糊过滤 |
| 3 | `get_document` | 输入文档标题，返回 official/ 下的文档全文，并附带相关节点匹配 |
| 4 | `rag_search` | 直接查询 ChromaDB 向量库进行语义检索 |

## 4. 通用约束

### 4.1 匹配规则

所有文本匹配忽略大小写，优先子串匹配，其次字符顺序模糊匹配。

### 4.2 来源结构

节点类结果包含的来源字段：

```json
{
  "title": "碰撞触发器",
  "main_title": "二、触发器",
  "source_doc_title": "事件节点",
  "local_path": "official/guide/事件节点.md",
  "output_file": "derived/node/事件节点.md",
  "content": "..."
}
```

## 5. Tool: get_node_info

### 5.1 职责

根据节点名称查询节点的说明和参数。数据来源：`derived/index.json` + `derived/node/*.md`。

### 5.2 输入

```json
{
  "names": "string[], required — 节点名称列表，支持模糊匹配"
}
```

### 5.3 输出

```json
[
  {
    "query": "碰撞触发器",
    "matches": [
      {
        "title": "碰撞触发器",
        "main_title": "二、触发器",
        "source_doc_title": "事件节点",
        "local_path": "official/guide/事件节点.md",
        "output_file": "derived/node/事件节点.md",
        "content": "## 碰撞触发器\n..."
      }
    ]
  }
]
```

无匹配时 `matches` 为空数组，附带 `message` 提示。

### 5.4 匹配规则

1. 优先级：标题完全匹配 > 标题包含 > 模糊匹配。
2. 允许返回重复标题的节点（去重规则是"标题 + 正文内容"联合去重）。
3. 单个 name 匹配多个结果时全部返回。

## 6. Tool: list_documents

### 6.1 职责

列出 `official/` 目录下的文档标题和相对路径，可选关键词模糊过滤。

### 6.2 输入

```json
{
  "keyword": "string, optional — 过滤关键词，支持模糊匹配。为空时返回全部"
}
```

### 6.3 输出

```json
{
  "keyword": "触发器",
  "total": 3,
  "documents": [
    {"title": "碰撞触发器", "file": "official/guide/碰撞触发器.md"}
  ]
}
```

不传 keyword 时无 `keyword` 字段，返回全部文档。

### 6.4 匹配规则

1. 同时匹配 frontmatter title 和文件名。
2. 跳过 readme.md 和 category.md。

## 7. Tool: get_document

### 7.1 职责

根据文档标题返回 `official/` 目录下完整文档正文，同时用同关键词查找节点信息。

### 7.2 输入

```json
{
  "title": "string, required — 文档标题，支持模糊匹配"
}
```

### 7.3 输出

正常匹配（≤5篇）：

```json
[
  {
    "title": "事件节点",
    "file": "official/guide/事件节点.md",
    "content": "# 事件节点\n...",
    "related_nodes": [...]
  }
]
```

匹配过多（>5篇）返回摘要列表 + `related_nodes`。无匹配返回可用标题样本 + `related_nodes`。

### 7.4 匹配规则

1. 同时匹配文档 frontmatter title 和文件名。
2. 跳过 readme.md 和 category.md。

## 8. Tool: rag_search

### 8.1 职责

直接查询 ChromaDB 向量库进行语义检索，作为结构化工具的兜底。

### 8.2 输入

```json
{
  "query": "string, required — 自然语言检索问题",
  "top_k": "integer, optional, default=5"
}
```

### 8.3 输出

```json
{
  "query": "碰撞事件怎么触发",
  "total_results": 3,
  "results": [
    {
      "title": "碰撞触发器",
      "h1_title": "一、碰撞触发器组件的功能",
      "file_name": "碰撞触发器.md",
      "similarity": 0.85,
      "text_snippet": "当碰撞盒组件发生碰撞时..."
    }
  ]
}
```

异常时返回 `{"error": "RAG 检索异常: ..."}`。

### 8.4 使用策略

1. 当问题可通过 `get_node_info` 或 `get_document` 直接回答时，不应优先调用此工具。
2. 当问题是开放式、排障、总结、跨文档比较时，应优先或补充调用此工具。

## 9. Agent 使用策略

以下为写入 System Prompt 的工具选择指导规则：

1. 用户问明确的节点名称、参数 → 优先 `get_node_info`
2. 用户问某篇文档的完整内容 → 用 `get_document`
3. 用户问开放问题、排障、总结 → 用 `rag_search`
4. 结构化工具结果不足 → 补充调用 `rag_search`

## 10. 非目标

当前阶段不包含：

1. 外部 HTTP tool
2. 数据写入类工具
3. 自动修改知识库内容的工具
4. FAQ 单独作为独立工具（通过 `get_document` + `rag_search` 覆盖）
