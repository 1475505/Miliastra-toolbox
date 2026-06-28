# Agent API Spec

## 1. 目标

本文定义新的 Agent 化问答接口规范。该接口与现有 RAG 接口并存，不替换现有 `/api/v1/rag/*` 路径。

新接口的目标是：

1. 对外暴露 Agent 模式能力。
2. 保持与现有请求结构尽可能兼容。
3. 增加 tool trace、mode 等 Agent 特有信息。
4. 允许后端继续复用现有 RAG 链路作为底层工具。

## 2. 版本与路径

### 2.1 路径

第一阶段新增接口：

- `POST /api/v1/agent/chat` — 非流式
- `POST /api/v1/agent/chat/stream` — 流式

可选调试接口：

- `GET /api/v1/agent/capabilities` — 能力发现

### 2.2 兼容策略

1. 旧接口 `/api/v1/rag/chat` 和 `/api/v1/rag/chat/stream` 保持可用。
2. 新接口仅用于 Agent 模式。
3. 前端在第一阶段可以通过开关显式选择使用 Agent 接口。

## 3. 请求模型

### 3.1 非流式与流式请求共用模型

```json
{
  "id": "string, optional",
  "message": "string, required, max=2000",
  "conversation": [
    {
      "role": "user|assistant",
      "content": "string"
    }
  ],
  "config": {
    "api_key": "string",
    "api_base_url": "string",
    "model": "string",
    "use_default_model": 0,
    "context_length": 3
  },
  "image_base64": "string, optional - 单张图片 Base64 Data URI（兼容旧版）",
  "image_base64s": ["string, optional - 多张图片 Base64 Data URI"]
}
```

### 3.2 请求约束

1. `message` 必填。
2. `conversation` 仅允许 `user` 和 `assistant`。
3. `context_length` 表示截断对话历史的轮次，不是 Agent 内部的推理步数。

## 4. 非流式接口

### 4.1 路径

`POST /api/v1/agent/chat`

### 4.2 响应模型

```json
{
  "success": true,
  "data": {
    "id": "string",
    "question": "string",
    "answer": "string",
    "sources": [
      {
        "title": "string",
        "doc_id": "string",
        "similarity": 0.0,
        "text_snippet": "string",
        "url": "string"
      }
    ],
    "stats": {
      "tokens": 0,
      "tool_calls": 0,
      "retrieval_calls": 0
    },
    "mode": "agent",
    "tool_trace": [
      {
        "tool": "string",
        "args": {},
        "status": "success|error",
        "summary": "string",
        "sources": [{"title": "string", "url": "string"}]
      }
    ],
    "diagrams": [
      {
        "diagram_id": "string",
        "title": "string",
        "png_data_uri": "string"
      }
    ]
  },
  "error": null
}
```

### 4.3 字段定义

1. `mode` 固定为 `agent`。
2. `tool_trace` 用于展示本轮调用过的工具链路。
3. `retrieval_calls` 仅统计 `search_knowledge` 调用次数。
4. `sources` 为最终回答引用来源的统一视图。
5. `diagrams` 为本轮由 `generate_diagram` 工具生成的图表列表，每条含 `diagram_id`、`title` 和 `png_data_uri`（包含 Data URI 前缀的 base64 PNG）。无图表时为空数组。
6. PNG 图片也可通过 `GET /api/v1/agent/diagram/{diagram_id}` 单独获取（内存存储，服务重启后失效）。

## 5. 流式接口

### 5.1 路径

`POST /api/v1/agent/chat/stream`

### 5.2 协议

使用 `text/event-stream`。

### 5.3 事件类型

1. `tool_call` — 即将调用工具
2. `tool_result` — 工具调用结果摘要
3. `token` — 流式文本片段
4. `sources` — 最终来源列表
5. `done` — 本轮完成，含统计信息
6. `error` — 错误

### 5.4 SSE 数据格式

```text
data: {"type": "tool_call", "data": {"tool": "get_node_info", "args": {"names": ["碰撞触发器"]}}}

data: {"type": "tool_result", "data": {"tool": "get_node_info", "status": "success", "summary": "找到1个匹配节点"}}

data: {"type": "tool_call", "data": {"tool": "generate_diagram", "args": {"svg_content": "<SVG 980 chars>", "title": "碰撞触发器流程"}}}

data: {"type": "tool_result", "data": {"tool": "generate_diagram", "status": "success", "summary": "已生成图表「碰撞触发器流程」", "sources": [{"title": "碰撞触发器流程", "url": "/api/v1/agent/diagram/abc..."}]}}

data: {"type": "token", "data": "碰撞触发器是事件节点，"}

data: {"type": "token", "data": "\n\n![碰撞触发器流程](/api/v1/agent/diagram/abc...)"}

data: {"type": "sources", "data": [{"title": "碰撞触发器", "url": ""}]}

data: {"type": "done", "data": {"stats": {"tokens": 0, "tool_calls": 2, "retrieval_calls": 0}}}
```

> `generate_diagram` 的 `args.svg_content` 在 SSE 和 trace 中被自动脱敏为 `"<SVG N chars>"`，不透传原始 SVG 文本。

### 5.5 事件约束

1. `tool_call` 事件在真实调用工具前发送。
2. `tool_result` 事件只发送摘要；`generate_diagram` 的 `svg_content` 参数自动截断为 `<SVG N chars>`。
3. `done` 事件必须包含本轮统计信息。

## 6. 错误语义

### 6.1 HTTP 状态码

- `400` — 请求参数非法
- `401` — 模型配置不可用或鉴权失败
- `422` — 会话结构不合法
- `429` — 渠道额度限制
- `500` — 后端内部错误
- `503` — Agent 或底层知识服务暂不可用

### 6.2 响应体错误对象

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

## 7. 能力发现接口（可选）

`GET /api/v1/agent/capabilities`

用于前端调试或运维检查：

```json
{
  "success": true,
  "data": {
    "mode": "agent",
    "streaming": true,
    "image_input": true,
    "tools": [
      "get_node_info",
      "list_documents",
      "get_document",
      "search_knowledge",
      "generate_diagram"
    ]
  }
}
```

## 8. 完整请求-响应案例

### 8.1 案例：非流式 Agent 对话

**请求：**

```bash
curl -X POST http://localhost:8000/api/v1/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "碰撞触发器怎么用？需要配置哪些参数？",
    "conversation": [],
    "config": { "use_default_model": 1 }
  }'
```

**Agent 内部执行过程：**

```
1. 注入 System Prompt（含轻量目录上下文）
2. Agent 分析意图 → 明确节点名称，选择 get_node_info
3. Tool Call: get_node_info({"name": "碰撞触发器"})
   → 返回节点功能描述 + 参数表
4. Agent 判断信息充分，生成最终回答
```

**响应：**

```json
{
  "success": true,
  "data": {
    "id": "agent-20260330-001",
    "question": "碰撞触发器怎么用？需要配置哪些参数？",
    "answer": "碰撞触发器是事件节点，当碰撞盒组件发生碰撞时触发。需要配置以下参数：\n\n| 类型 | 名称 | 数据类型 | 说明 |\n|------|------|----------|------|\n| 入参 | 实体 | Entity | 检测碰撞的实体 |\n| 出参 | 碰撞实体 | Entity | 发生碰撞的另一个实体 |\n| 出参 | 碰撞点 | Vector3 | 碰撞发生的位置 |",
    "sources": [
      {
        "title": "碰撞触发器",
        "doc_id": "事件节点",
        "similarity": 1.0,
        "text_snippet": "当碰撞盒组件发生碰撞时触发",
        "url": ""
      }
    ],
    "stats": { "tokens": 420, "tool_calls": 1, "retrieval_calls": 0 },
    "mode": "agent",
    "tool_trace": [
      {
        "tool": "get_node_info",
        "args": { "name": "碰撞触发器" },
        "status": "success",
        "summary": "找到1个匹配节点：碰撞触发器（事件节点）"
      }
    ]
  },
  "error": null
}
```

### 8.2 案例：多工具协作 + RAG 兜底

**请求：**

```json
{
  "message": "实体死亡后怎么播放特效？具体步骤是什么？",
  "conversation": [],
  "config": { "use_default_model": 2 }
}
```

**Agent 内部执行过程：**

```
1. Agent 分析：涉及"死亡"事件 + "播放特效"执行，需要两个节点
2. Tool Call: get_node_info({"names": ["死亡触发器", "播放特效"]})
   → 返回两个节点的功能和参数
3. Agent 判断：节点参数已清楚，但"具体步骤"可能需要教程补充
4. Tool Call: search_knowledge({"query": "实体死亡播放特效步骤"})
   → 返回相关文档片段
5. Agent 汇总结构化节点信息 + RAG 检索结果，生成完整回答
```

**响应（tool_trace 摘要）：**

```json
{
  "tool_trace": [
    { "tool": "get_node_info", "args": { "names": ["死亡触发器", "播放特效"] }, "status": "success", "summary": "找到2个节点" },
    { "tool": "search_knowledge", "args": { "query": "实体死亡播放特效步骤" }, "status": "success", "summary": "检索到3条相关结果" }
  ],
  "stats": { "tokens": 680, "tool_calls": 2, "retrieval_calls": 1 }
}
```

## 9. 与旧 RAG API 的关系

1. 旧 RAG API 保持"直接检索 + 合成的问答模式"。
2. 新 Agent API 保持"tool-calling 的问答模式"。
3. Agent API 内部通过 `search_knowledge` 工具复用现有 RAG 能力。

## 10. generate_diagram 工具规范

### 10.1 输入

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `svg_content` | string | 是 | 完整 SVG XML。文本只允许中文、英文、数字和基础标点，禁止 emoji 及装饰性 Unicode 符号（棋子、播放控制、天气、表情等） |
| `title` | string | 否 | 图表标题，用于 alt 文本和 trace 展示 |

### 10.2 输出（JSON 字符串）

```json
{
  "diagram_id": "hex-uuid",
  "png_url": "/api/v1/agent/diagram/{diagram_id}",
  "markdown": "![title](/api/v1/agent/diagram/{diagram_id})",
  "title": "string"
}
```

错误时返回 `{"error": "string"}`。

### 10.3 约束

- SVG 不得引用外部字体或图片资源（SSRF 防护，`<script>` 及外部 `href`/`src` 会被自动剥离）
- 建议画布宽度不超过 1200px
- 模型调用成功后必须将 `markdown` 字段原样嵌入回答正文
- `svg_content` 在 SSE/trace 中自动脱敏为 `<SVG N chars>`

### 10.4 PNG 服务

`GET /api/v1/agent/diagram/{diagram_id}` — 返回 `image/png`；图片仅存于进程内存（LRU，默认上限 100 张，由 `DIAGRAM_STORE_MAX` 控制），服务重启后失效。

## 11. 非目标

当前阶段不包含：

1. 多 Agent 路由
2. 长期会话记忆协议
3. 前端展示完整推理链
4. 外部第三方工具注册
