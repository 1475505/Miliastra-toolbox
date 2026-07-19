# API 文档

## 目录

- [RAG API](#rag-api)
  - [1. 非流式接口](#1-非流式接口)
  - [2. 流式接口](#2-流式接口)

- [Agent API](#agent-api)
  - [1. 非流式接口](#1-agent-非流式接口)
  - [2. 流式接口](#2-agent-流式接口)
  - [3. 能力发现](#3-能力发现接口)
  - [4. 获取图表 PNG](#4-获取图表-png)

- [Skill API](#skill-api)
  - [1. Skill 列表](#1-skill-列表)
  - [2. Skill 详情](#2-skill-详情)
  - [3. Tool 执行](#3-tool-执行)

- [笔记 API](#笔记api)
  - [1. 创建笔记](#1-创建笔记)
  - [2. 修改笔记](#2-修改笔记)
  - [3. 点赞笔记](#3-点赞笔记)
  - [4. 查询笔记列表](#4-查询笔记列表)
  - [5. 获取单个笔记详情](#5-获取单个笔记详情)

- [Data 数据查询 API](#data-数据查询-api)
  - [1. 物件查询](#1-物件查询)
  - [2. 特效查询](#2-特效查询)
  - [3. 背景音乐查询](#3-背景音乐查询)

- [Translation API](#translation-api)
  - [1. 术语翻译查询](#1-术语翻译查询)
  - [2. 批量术语翻译](#2-批量术语翻译)

- [SVG 一图流 API](#svg-一图流-api)
  - [1. 获取目录结构](#1-获取目录结构)
  - [2. 名称搜索并获取图表](#2-名称搜索并获取图表)
  - [3. 按文件名获取原始 SVG](#3-按文件名获取原始-svg)
  - [4. 模糊匹配并获取页面链接](#4-模糊匹配并获取页面链接)

---

# RAG API

## 概述

提供两种对话模式：
- **非流式**：适合 API 调用、命令行测试
- **流式**：适合 Web 前端实时渲染

---

## 1. 非流式接口

### 接口地址
**POST** `/api/v1/rag/chat`

### 特点
- 返回完整 JSON 响应
- 适合命令行测试
- 兼容性好

### 请求参数

```json
{
  "id": "string - 会话ID（可选，预留字段）",
  "message": "string - 用户问题（必填）",
  "conversation": [
    {
      "role": "user|assistant",
      "content": "string - 消息内容"
    }
  ],
  "config": {
    "api_key": "string - 用户自定义 API Key",
    "api_base_url": "string - 用户自定义 API 基础 URL",
    "model": "string - 用户自定义模型名称",
    "use_default_model": "number - 0:不使用, 1:默认免费模型, 2:备用免费模型",
    "answer_language": "string - 回答语言，默认 chs；可选 chs、cht、de、en、es、fr、id、it、jp、kr、pt、ru、th、tr、vi"
  },
  "image_base64": "string - 单张图片 Base64 Data URI（兼容旧版，可选）",
  "image_base64s": ["string - 多张图片 Base64 Data URI（可选）"]
}
```

**配置优先级说明**：
1. **优先使用免费模型**：若 `use_default_model` 为 1，使用默认免费模型；若为 2，使用备用免费模型（最高优先级）
2. **其次使用自定义配置**：若 `api_key`、`api_base_url`、`model` 三者均非空，则使用用户自定义配置
3. **否则报错**：若以上两种配置都不满足，返回错误

### 请求示例

**方式1：使用用户自定义配置（优先级最高）**
```json
{
  "id": "session_001",
  "message": "小地图如何使用？",
  "conversation": [
    {
      "role": "user",
      "content": "什么是小地图？"
    },
    {
      "role": "assistant",
      "content": "小地图是游戏中的重要功能..."
    }
  ],
  "config": {
    "api_key": "sk-xxxxxxxx",
    "api_base_url": "https://api.deepseek.com/v1",
    "model": "deepseek-v4-flash",
    "use_default_model": 0,
    "context_length": 1,
    "answer_language": "chs"
  }
}
```

**方式2：使用后端默认免费模型**
```json
{
  "id": "session_002",
  "message": "小地图如何使用？",
  "conversation": [],
  "config": {
    "api_key": "",
    "api_base_url": "",
    "model": "",
    "use_default_model": 1,
    "answer_language": "chs"
  }
}
```

### 响应参数

```json
{
  "success": "boolean - 是否成功",
  "data": {
    "id": "string - 会话ID",
    "question": "string - 用户问题",
    "answer": "string - AI 回答",
    "reasoning": "string - 推理内容（暂不支持）",
    "sources": [
      {
        "title": "string - 文档标题",
        "doc_id": "string - 文档ID",
        "similarity": "number - 相似度 0-1",
        "text_snippet": "string - 文本片段",
        "url": "string - 文档链接"
      }
    ],
    "stats": {
      "tokens": "number - 消耗的tokens"
    }
  },
  "error": "string - 错误信息（失败时）"
}
```

### 响应示例
```json
{
  "success": true,
  "data": {
    "id": "session_001",
    "question": "小地图如何使用？",
    "answer": "小地图的使用方法如下：\n1. 点击左下角小地图图标...",
    "sources": [
      {
        "title": "用户指南-小地图",
        "doc_id": "guide_map_001",
        "similarity": 0.89,
        "text_snippet": "小地图是游戏中的重要功能，位于屏幕左下角...",
        "url": "/knowledge/Miliastra-knowledge/official/guide/map.md"
      },
      {
        "title": "教程-小地图功能",
        "doc_id": "tutorial_map_002",
        "similarity": 0.76,
        "text_snippet": "要使用小地图，需要先在设置中开启...",
        "url": "/knowledge/Miliastra-knowledge/official/tutorial/map.md"
      }
    ],
    "stats": {
      "tokens": 1250
    }
  }
}
```

### 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | API Key 无效 |
| 422 | 对话历史格式错误 |
| 500 | 服务器内部错误 |

### 客户端调用示例

### 1. 非流式调用

#### JavaScript
```javascript
const response = await fetch('/api/v1/rag/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '小地图如何使用？',
    conversation: [],
    config: {
      api_key: 'sk-xxxxxxxx',
      api_base_url: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-flash'
    }
  })
});

const data = await response.json();
if (data.success) {
  console.log('回答:', data.data.answer);
  console.log('引用来源:', data.data.sources);
}
```

#### Python
```python
import requests

response = requests.post('http://localhost:8000/api/v1/rag/chat', json={
    'message': '小地图如何使用？',
    'conversation': [],
    'config': {
        'api_key': 'sk-xxxxxxxx',
        'api_base_url': 'https://api.deepseek.com/v1',
        'model': 'deepseek-v4-flash'
    }
})

data = response.json()
if data['success']:
    print('回答:', data['data']['answer'])
```

#### cURL
```bash
curl -X POST http://localhost:8000/api/v1/rag/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "小地图如何使用？",
    "conversation": [],
    "config": {
      "api_key": "sk-xxxxxxxx",
      "api_base_url": "https://api.deepseek.com/v1",
      "model": "deepseek-v4-flash"
    }
  }'
```

---

## 2. 流式接口

### 接口地址
**POST** `/api/v1/rag/chat/stream`

### 特点
- 返回 SSE (Server-Sent Events) 流
- 实时逐字显示
- 更好的用户体验

### 请求参数
与非流式接口相同

### 响应格式（SSE）

```
            - : heartbeat (心跳/状态注释)
            - data: {"type": "sources", "data": [...]}
            - data: {"type": "reasoning", "data": "推理内容"}
            - data: {"type": "token", "data": "文本块"}
            - data: {"type": "done", "data": {"tokens": 123}}
```

### 事件类型

| 类型 | 说明 | 数据格式 |
|------|------|---------|
| `sources` | 引用来源 | `{"data": [{"title", "url", "similarity"}]}` |
| `reasoning` | 推理内容（暂不支持） | `{"data": "推理文本"}` |
| `token` | 文本片段 | `{"data": "文本内容"}` |
| `done` | 完成信号 | `{"data": {"tokens": 123}}` |
| `error` | 错误信息 | `{"data": "错误描述"}` |

> 注：以 `: ` 开头的行为心跳或状态更新（如 `: heartbeat`, `: retrieval_done`），前端可用于保活或显示进度。

### 客户端调用示例

#### JavaScript (Fetch API)
```javascript
const response = await fetch('/api/v1/rag/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '小地图如何使用？',
    conversation: [],
    config: {
      api_key: 'sk-xxxxxxxx',
      api_base_url: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-flash'
    }
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      
      if (data.type === 'token') {
        console.log(data.data); // 实时输出文本
      } else if (data.type === 'done') {
        console.log('完成，消耗 tokens:', data.data.tokens);
      }
    }
  }
}
```

#### Python (SSE Client)
```python
import requests
import json

response = requests.post(
    'http://localhost:8000/api/v1/rag/chat/stream',
    json={
        'message': '小地图如何使用？',
        'conversation': [],
        'config': {
            'api_key': 'sk-xxxxxxxx',
            'api_base_url': 'https://api.deepseek.com/v1',
            'model': 'deepseek-v4-flash'
        }
    },
    stream=True
)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            data = json.loads(line[6:])
            if data['type'] == 'token':
                print(data['data'], end='', flush=True)
            elif data['type'] == 'done':
                print(f"\n\n消耗 tokens: {data['data']['tokens']}")
```
---

# Agent API

## 概述

基于 LlamaIndex FunctionAgent 的 Agent 模式对话接口，与现有 RAG 接口并存。Agent 模式通过 tool-calling 机制，优先使用结构化知识查询（节点信息、文档内容），并可兖底使用 RAG 语义检索。

详细规范请参考 [Agent API Spec](./specs/agent-api.md) 和 [Agent Tools Spec](./specs/agent-tools.md)。

### 可用工具

| 工具名 | 职责 |
|--------|------|
| `get_node_info` | 输入节点名称列表，返回节点说明、参数、所在文档 |
| `list_documents` | 列出文档标题和路径，可选关键词模糊过滤 |
| `get_document` | 输入文档标题，返回文档全文，并附带相关节点匹配 |
| `search_knowledge` | 向量检索知识库，语义搜索 |
| `generate_diagram` | 生成 SVG 流程/节点图并转为 PNG，返回图片 URL 和 markdown 嵌入代码 |
| `translate_terms` | 用任意语言术语查询目标语言官方译法，用于多语言回答时的术语校准 |

---

## 1. Agent 非流式接口

### 接口地址
**POST** `/api/v1/agent/chat`

### 请求参数

与 RAG 接口共用请求模型：

```json
{
  "id": "string（可选）",
  "message": "string（必填，max=2000）",
  "conversation": [{"role": "user|assistant", "content": "string"}],
  "config": {
    "api_key": "string",
    "api_base_url": "string",
    "model": "string",
    "use_default_model": 0,
    "context_length": 3,
    "answer_language": "chs"
  },
  "image_base64": "string - 单张图片 Base64 Data URI（兼容旧版，可选）",
  "image_base64s": ["string - 多张图片 Base64 Data URI（可选）"]
}
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "agent-abc123",
    "question": "碰撞触发器怎么用？",
    "answer": "碰撞触发器是事件节点...",
    "sources": [
      {"title": "碰撞触发器", "doc_id": "事件节点", "similarity": 1.0, "text_snippet": "...", "url": ""}
    ],
    "stats": {"tokens": 0, "tool_calls": 1, "retrieval_calls": 0},
    "mode": "agent",
    "tool_trace": [
      {"tool": "get_node_info", "args": {"names": ["碰撞触发器"]}, "status": "success", "summary": "..."}
    ],
    "diagrams": [
      {
        "diagram_id": "a1b2c3d4...",
        "title": "碰撞触发器流程",
        "png_data_uri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
      }
    ]
  },
  "error": null
}
```

**`diagrams` 字段说明**：AI 调用 `generate_diagram` 时自动填充，每项含 `diagram_id`、`title`、`png_data_uri`；无图表时为空数组 `[]`。PNG 同时可通过 `GET /api/v1/agent/diagram/{diagram_id}` 直接访问（内存存储，服务重启后失效）。

---

## 2. Agent 流式接口

### 接口地址
**POST** `/api/v1/agent/chat/stream`

### 请求参数
与非流式接口相同。

### SSE 事件类型

| 事件类型 | 说明 |
|----------|------|
| `tool_call` | 即将调用工具 |
| `tool_result` | 工具调用结果摘要 |
| `token` | 流式文本片段 |
| `sources` | 最终来源列表 |
| `done` | 本轮完成，含统计信息 |
| `error` | 错误 |

### SSE 数据格式

```text
data: {"type": "tool_call", "data": {"tool": "get_node_info", "args": {"names": ["碰撞触发器"]}}}
data: {"type": "tool_result", "data": {"tool": "get_node_info", "status": "success", "summary": "找到1个匹配节点"}}
data: {"type": "tool_call", "data": {"tool": "generate_diagram", "args": {"svg_content": "<SVG 980 chars>", "title": "碰撞触发器流程"}}}
data: {"type": "tool_result", "data": {"tool": "generate_diagram", "status": "success", "summary": "已生成图表「碰撞触发器流程」", "sources": [{"title": "碰撞触发器流程", "url": "/api/v1/agent/diagram/abc..."}]}}
data: {"type": "token", "data": "碰撞触发器是事件节点，"}
data: {"type": "token", "data": "\n\n![碰撞触发器流程](/api/v1/agent/diagram/abc...)"}
data: {"type": "sources", "data": [...]}
data: {"type": "done", "data": {"stats": {"tokens": 0, "tool_calls": 2, "retrieval_calls": 0}}}
```

> `generate_diagram` 的 `args.svg_content` 在 SSE 和 trace 中被自动脱敏为 `"<SVG N chars>"`，不透传原始 SVG 文本。流式模式下图表以 `![title](url)` markdown 格式内嵌在 `token` 事件中，前端 markdown 渲染器可直接展示。

---

## 3. 能力发现接口

### 接口地址
**GET** `/api/v1/agent/capabilities`

### 响应示例

```json
{
  "success": true,
  "data": {
    "mode": "agent",
    "streaming": true,
    "image_input": true,
    "tools": ["get_node_info", "list_documents", "get_document", "search_knowledge", "generate_diagram", "translate_terms"]
  }
}
```

### 安全限制

| 参数 | 默认值 | 环境变量 | 说明 |
|------|--------|----------|------|
| 最大工具调用轮次 | 6 | `AGENT_MAX_TOOL_ROUNDS` | 超出后截断事件流 |
| 最大思考迭代数 | 10 | `AGENT_MAX_ITERATIONS` | 超出后禁用工具，将已有工具结果摘要交给模型生成最终回答 |
| 超时时间 | 300s | `AGENT_TIMEOUT` | 超时后 Agent 强制终止 |

---

## 4. 获取图表 PNG

### 接口地址
**GET** `/api/v1/agent/diagram/{diagram_id}`

### 说明

返回 AI 在本轮对话中通过 `generate_diagram` 工具生成的 PNG 图片。

- **内存存储**：图片仅存于进程内存（LRU 缓存，最多 `DIAGRAM_STORE_MAX` 张，默认 100），服务重启后失效
- **缓存控制**：响应包含 `Cache-Control: public, max-age=3600`
- **分辨率**：以 2x 缩放渲染，适合高 DPI 屏幕

### 请求示例

```bash
# 浏览器直接访问（在 markdown 中自动触发）
GET /api/v1/agent/diagram/abc1234...

# cURL 保存到文件
curl -o diagram.png http://localhost:8000/api/v1/agent/diagram/abc1234...
```

### 错误码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功，返回 `image/png` |
| 404 | 图表不存在（ID 无效或服务已重启） |

---

# Skill API

## 概述

Skill API 将千星沙箱知识库能力以 HTTP 形式暴露，和 MCP Server 共享同一套底层实现。适合以下场景：

- 前端做 skill 列表或技能中心
- 第三方服务通过 HTTP 直接调用知识工具
- 后续扩展 skill marketplace 或开放平台

当前提供 1 个 skill：`miliastra-knowledge`

## 1. Skill 列表

### 接口地址
**GET** `/api/v1/skills`

### 响应示例

```json
{
  "success": true,
  "data": [
    {
      "id": "miliastra-knowledge",
      "version": "1.0.0",
      "title": "Miliastra Knowledge",
      "description": "以 skill + HTTP API 形式暴露千星沙箱知识库查询能力。",
      "transports": ["mcp", "http"],
      "tools": [
        {
          "name": "get_node_info",
          "description": "根据节点名称查询节点说明、参数表、所属文档。",
          "http_path": "/api/v1/skills/miliastra-knowledge/tools/get_node_info",
          "parameters": [
            {"name": "names", "type": "string[]", "required": true, "description": "节点名称列表", "default_value": null}
          ]
        }
      ]
    }
  ],
  "error": null
}
```

## 2. Skill 详情

### 接口地址
**GET** `/api/v1/skills/miliastra-knowledge`

### 说明

- 返回 skill 元信息
- 返回 5 个工具的 HTTP 调用路径
- 返回 `mcp/SKILL.md` 原始 markdown 内容，方便前端直接展示说明

## 3. Tool 执行

### 3.1 get_node_info

**POST** `/api/v1/skills/miliastra-knowledge/tools/get_node_info`

请求体：

```json
{
  "names": ["碰撞触发器", "死亡触发器"]
}
```

### 3.2 list_documents

**POST** `/api/v1/skills/miliastra-knowledge/tools/list_documents`

请求体：

```json
{
  "keywords": ["仇恨", "背包"]
}
```

### 3.3 get_document

**POST** `/api/v1/skills/miliastra-knowledge/tools/get_document`

请求体：

```json
{
  "titles": ["事件节点"]
}
```

### 3.4 rag_search

**POST** `/api/v1/skills/miliastra-knowledge/tools/rag_search`

请求体：

```json
{
  "queries": ["碰撞事件怎么触发"],
  "top_k": 5
}
```

### 3.5 translate_terms

**POST** `/api/v1/skills/miliastra-knowledge/tools/translate_terms`

请求体：

```json
{
  "terms": ["攻击", "道具"],
  "source_lang": "chs",
  "target_lang": "en"
}
```

### 通用响应格式

```json
{
  "success": true,
  "data": {
    "skill": "miliastra-knowledge",
    "tool": "get_node_info",
    "result": []
  },
  "error": null
}
```

---

# 笔记API

## 概述

提供笔记的完整管理功能：
- **创建笔记**：新增笔记内容
- **修改笔记**：更新笔记内容（保留历史版本）
- **点赞笔记**：为有用的笔记点赞
- **查询笔记**：支持按点赞数/创建时间排序和搜索

**版本控制说明**：
- 每次创建或修改笔记时，`version` 字段自动填入当前时间戳
- 修改笔记时会新建一行记录，沿用原笔记的 `id`，更新 `version` 和修改的字段
- 查询时只返回每个 `id` 的最新 `version` 记录
- 创建笔记时，如果已存在内容完全相同的笔记，则返回 `409` 错误

---

## 1. 创建笔记

### 接口地址
**POST** `/api/v1/notes`

### 请求参数

```json
{
  "author": "string - 作者（可选）",
  "content": "string - 笔记内容（必填）"
}
```

### 请求示例

```bash
curl -X POST http://localhost:8000/api/v1/notes \
  -H "Content-Type: application/json" \
  -d '{
    "author": "张三",
    "content": "小地图可以通过右键点击设置显示范围，非常实用！"
  }'
```

### 响应参数

```json
{
  "success": true,
  "data": {
    "id": 1,
    "created_at": "2024-01-01T12:00:00Z",
    "version": "2024-01-01T12:00:00",
    "author": "张三",
    "content": "小地图可以通过右键点击设置显示范围，非常实用！",
    "likes": 0
  }
}
```

### 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误（内容为空等） |
| 409 | 已存在内容完全相同的笔记 |
| 500 | 服务器内部错误 |

---

## 2. 修改笔记

### 接口地址
**PUT** `/api/v1/notes/{id}`

### 请求参数

```json
{
  "author": "string - 作者（可选）",
  "content": "string - 笔记内容（可选）"
}
```

**注意**：
- 至少需要提供 `author` 或 `content` 其中之一
- 修改操作会创建新的版本记录，保留原有数据
- 未提供的字段会沿用原笔记的值

### 请求示例

```bash
curl -X PUT http://localhost:8000/api/v1/notes/1 \
  -H "Content-Type: application/json" \
  -d '{
    "content": "小地图可以通过右键点击设置显示范围和透明度，非常实用！"
  }'
```

### 响应参数

```json
{
  "success": true,
  "data": {
    "id": 1,
    "created_at": "2024-01-01T12:00:00Z",
    "version": "2024-01-01T12:30:00",
    "author": "张三",
    "content": "小地图可以通过右键点击设置显示范围和透明度，非常实用！",
    "likes": 0
  }
}
```

### 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误（未提供任何更新字段等） |
| 404 | 笔记不存在 |
| 500 | 服务器内部错误 |

---

## 3. 点赞笔记

### 接口地址
**POST** `/api/v1/notes/{id}/like`

### 请求参数
无需请求体

使用浏览器 `localStorage` 存储已点赞的笔记 ID 列表，避免重复点赞

### 请求示例

```bash
curl -X POST http://localhost:8000/api/v1/notes/1/like
```

### 响应参数

```json
{
  "success": true,
  "data": {
    "id": 1,
    "likes": 1
  }
}
```

**添加 IP 限制后的响应示例**：
```json
{
  "success": false,
  "error": "您已经为该笔记点过赞了"
}
```

### 错误码

| 状态码 | 说明 |
|--------|------|
| 404 | 笔记不存在 |
| 429 | 重复点赞（已点过赞） |
| 500 | 服务器内部错误 |

---

## 4. 查询笔记列表

### 接口地址
**GET** `/api/v1/notes`

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| search | string | 否 | 搜索关键词（在内容和作者中模糊搜索） |
| sort_by | string | 否 | 排序方式：`likes`（按点赞数降序，默认）或 `created_at`（按创建时间降序） |
| limit | integer | 否 | 返回数量限制（默认 20，最大 100） |
| offset | integer | 否 | 偏移量（默认 0） |

### 请求示例

```bash
# 获取所有笔记（按点赞数降序）
GET /api/v1/notes

# 按创建时间降序
GET /api/v1/notes?sort_by=created_at

# 搜索笔记
GET /api/v1/notes?search=小地图

# 组合查询
GET /api/v1/notes?search=技能&sort_by=likes&limit=10&offset=0
```

### 响应参数

```json
{
  "success": true,
  "data": {
    "total": 50,
    "items": [
      {
        "id": 1,
        "created_at": "2024-01-01T12:00:00Z",
        "version": "2024-01-01T12:30:00",
        "author": "张三",
        "content": "小地图可以通过右键点击设置显示范围和透明度，非常实用！",
        "likes": 15
      },
      {
        "id": 2,
        "created_at": "2024-01-01T13:00:00Z",
        "version": "2024-01-01T13:00:00",
        "author": "李四",
        "content": "技能动画可以在节点图中自定义，效果很棒！",
        "likes": 8
      }
    ]
  }
}
```

### 错误响应

```json
{
  "success": false,
  "error": "数据库查询失败"
}
```

### 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误（sort_by 值不合法等） |
| 500 | 服务器内部错误 |

---

## 5. 获取单个笔记详情

### 接口地址
**GET** `/api/v1/notes/{id}`

### 请求参数
无需查询参数

### 请求示例

```bash
GET /api/v1/notes/1
```

### 响应参数

```json
{
  "success": true,
  "data": {
    "id": 1,
    "created_at": "2024-01-01T12:00:00Z",
    "version": "2024-01-01T12:30:00",
    "author": "张三",
    "content": "小地图可以通过右键点击设置显示范围和透明度，非常实用！",
    "likes": 15
  }
}
```

### 错误码

| 状态码 | 说明 |
|--------|------|
| 404 | 笔记不存在 |
| 500 | 服务器内部错误 |

---

## 客户端调用示例

### JavaScript

```javascript
// 创建笔记
const createNote = async () => {
  const response = await fetch('/api/v1/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      author: '张三',
      content: '这是一条有用的笔记！'
    })
  });
  const data = await response.json();
  console.log('创建成功:', data.data);
};

// 修改笔记
const updateNote = async (id) => {
  const response = await fetch(`/api/v1/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: '更新后的内容'
    })
  });
  const data = await response.json();
  console.log('更新成功:', data.data);
};

// 点赞笔记
const likeNote = async (id) => {
  const response = await fetch(`/api/v1/notes/${id}/like`, {
    method: 'POST'
  });
  const data = await response.json();
  console.log('点赞成功，当前点赞数:', data.data.likes);
};

// 查询笔记列表
const getNotes = async () => {
  const response = await fetch('/api/v1/notes?sort_by=likes&limit=10');
  const data = await response.json();
  console.log('笔记列表:', data.data.items);
};

// 搜索笔记
const searchNotes = async (keyword) => {
  const response = await fetch(`/api/v1/notes?search=${encodeURIComponent(keyword)}`);
  const data = await response.json();
  console.log('搜索结果:', data.data.items);
};
```

### Python

```python
import requests

BASE_URL = 'http://localhost:8000/api/v1'

# 创建笔记
def create_note():
    response = requests.post(f'{BASE_URL}/notes', json={
        'author': '张三',
        'content': '这是一条有用的笔记！'
    })
    data = response.json()
    print('创建成功:', data['data'])

# 修改笔记
def update_note(note_id):
    response = requests.put(f'{BASE_URL}/notes/{note_id}', json={
        'content': '更新后的内容'
    })
    data = response.json()
    print('更新成功:', data['data'])

# 点赞笔记
def like_note(note_id):
    response = requests.post(f'{BASE_URL}/notes/{note_id}/like')
    data = response.json()
    print('点赞成功，当前点赞数:', data['data']['likes'])

# 查询笔记列表
def get_notes():
    response = requests.get(f'{BASE_URL}/notes', params={
        'sort_by': 'likes',
        'limit': 10
    })
    data = response.json()
    print('笔记列表:', data['data']['items'])

# 搜索笔记
def search_notes(keyword):
    response = requests.get(f'{BASE_URL}/notes', params={
        'search': keyword
    })
    data = response.json()
    print('搜索结果:', data['data']['items'])
```

---

## 数据模型说明

### 版本控制机制

笔记表使用 `(id, version)` 作为联合主键，实现版本控制：

1. **创建笔记**：
   - 生成新的 `id`
   - `version` 设置为当前时间戳
   - `created_at` 设置为当前时间戳

2. **修改笔记**：
   - 保持原 `id` 不变
   - 新建一行记录
   - `version` 更新为当前时间戳
   - `created_at` 保持原值
   - 其他字段：修改的字段更新，未修改的字段沿用原值

3. **点赞笔记**：
   - 找到指定 `id` 的最新 `version` 记录
   - 直接更新该记录的 `likes` 字段（+1）
   - 不创建新版本

4. **查询笔记**：
   - 使用子查询找出每个 `id` 的最新 `version`
   - 只返回最新版本的记录

### 示例数据

| id | created_at | version | author | content | likes |
|----|------------|---------|--------|---------|-------|
| 1 | 2024-01-01 12:00:00 | 2024-01-01 12:00:00 | 张三 | 原始内容 | 0 |
| 1 | 2024-01-01 12:00:00 | 2024-01-01 12:30:00 | 张三 | 修改后的内容 | 5 |
| 2 | 2024-01-01 13:00:00 | 2024-01-01 13:00:00 | 李四 | 另一条笔记 | 3 |

查询时只会返回 `id=1` 的第二行（最新版本）和 `id=2` 的记录。

---

# Data 数据查询 API

## 概述

提供 UGC 编辑器配置数据的查询能力，支持按 **ID 精确查找** 或 **中文名模糊查找**，涵盖物件、特效、背景音乐三类。

数据来源：Supabase PostgreSQL，表结构见 `ugc/schema.sql`。

**通用查询规则**：
- `id` 与 `name` 至少提供一个，否则返回 400。
- `id` 精确匹配（整数），`name` 做大小写不敏感的子串模糊匹配（`ILIKE '%name%'`）。
- 同时提供 `id` 和 `name` 时，以 `id` 为准（忽略 `name`）。
- 支持分页参数 `limit`（默认 20，最大 100）和 `offset`（默认 0）。

---

## 1. 物件查询

### 接口地址
**GET** `/api/v1/data/gadgets`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | integer | 与 `name` 二选一 | 物件目录 ID（`ugc_gadgets.list_id`），精确匹配 |
| `name` | string | 与 `id` 二选一 | 物件中文名，大小写不敏感子串模糊匹配 |
| `limit` | integer | 否 | 最多返回条数，默认 20，最大 100 |
| `offset` | integer | 否 | 偏移量，默认 0 |

### 响应字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `list_id` | integer | 物件目录 ID（主键） |
| `name` | string | 物件中文名称 |
| `size_x` | number | 包围盒宽（X 轴，单位：游戏单位） |
| `size_y` | number | 包围盒高（Y 轴） |
| `size_z` | number | 包围盒深（Z 轴） |

### 请求示例

```bash
# 按 ID 精确查找
GET /api/v1/data/gadgets?id=10001

# 按中文名模糊查找
GET /api/v1/data/gadgets?name=乔木&limit=10

# cURL
curl "http://localhost:8000/api/v1/data/gadgets?name=史莱姆&limit=5"
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "total": 3,
    "items": [
      {
        "list_id": 10001,
        "name": "小史莱姆",
        "size_x": 1.2,
        "size_y": 1.0,
        "size_z": 1.2
      }
    ]
  }
}
```

### 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | `id` 与 `name` 均未提供，或 `id` 非整数，或分页参数非法 |
| 404 | 按 ID 查找时未找到对应物件 |
| 500 | 服务器内部错误 |

---

## 2. 特效查询

### 接口地址
**GET** `/api/v1/data/effects`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | integer | 与 `name` 二选一 | 特效配置 ID（`ugc_effects.id`），精确匹配 |
| `name` | string | 与 `id` 二选一 | 特效中文名，大小写不敏感子串模糊匹配 |
| `limit` | integer | 否 | 最多返回条数，默认 20，最大 100 |
| `offset` | integer | 否 | 偏移量，默认 0 |

### 响应字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | integer | 特效配置 ID（主键） |
| `name` | string | 特效中文名称 |
| `duration` | number | 持续时长（秒），`-1` 表示循环/常驻特效 |
| `is_loop` | boolean | 是否循环（与 `duration == -1` 严格对应） |
| `radius` | number | 预览/影响半径 |

### 请求示例

```bash
# 按 ID 精确查找
GET /api/v1/data/effects?id=20001

# 按中文名模糊查找
GET /api/v1/data/effects?name=烟尘&limit=10

# cURL
curl "http://localhost:8000/api/v1/data/effects?name=白色烟尘"
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "total": 2,
    "items": [
      {
        "id": 20001,
        "name": "白色烟尘",
        "duration": -1.0,
        "is_loop": true,
        "radius": 3.0
      },
      {
        "id": 20002,
        "name": "白色烟尘（单次）",
        "duration": 2.5,
        "is_loop": false,
        "radius": 2.0
      }
    ]
  }
}
```

### 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | `id` 与 `name` 均未提供，或 `id` 非整数，或分页参数非法 |
| 404 | 按 ID 查找时未找到对应特效 |
| 500 | 服务器内部错误 |

---

## 3. 背景音乐查询

### 接口地址
**GET** `/api/v1/data/bgm`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | integer | 与 `name` 二选一 | 音乐 ID（`ugc_bgm.bgm_id`），精确匹配 |
| `name` | string | 与 `id` 二选一 | 音乐中文名，大小写不敏感子串模糊匹配 |
| `limit` | integer | 否 | 最多返回条数，默认 20，最大 100 |
| `offset` | integer | 否 | 偏移量，默认 0 |

### 响应字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `bgm_id` | integer | 音乐 ID（主键） |
| `name` | string | 音乐中文名称 |
| `duration_sec` | number | 时长（秒，由原始毫秒字段 `duration_ms / 1000.0` 换算） |
| `category_name` | string | 分类名称：`101`→`探索` / `102`→`战斗` / `103`→`任务` / `104`→`其他` |

### 请求示例

```bash
# 按 ID 精确查找
GET /api/v1/data/bgm?id=10001

# 按中文名模糊查找
GET /api/v1/data/bgm?name=辉闪

# cURL
curl "http://localhost:8000/api/v1/data/bgm?name=鲜衣游侠"
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "total": 1,
    "items": [
      {
        "bgm_id": 10001,
        "name": "辉闪驰行",
        "duration_sec": 71.211,
        "category_name": "探索"
      }
    ]
  }
}
```

### 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | `id` 与 `name` 均未提供，或 `id` 非整数，或分页参数非法 |
| 404 | 按 ID 查找时未找到对应音乐 |
| 500 | 服务器内部错误 |

---

# Translation API

## 概述

提供 `TermTable_15Lang.csv` 术语表的 15 语言翻译查询能力。支持指定**搜索语言列**和**返回语言列**；返回候选列表时会先展示**精确包含匹配**，再按相似度补充**模糊匹配**，整体最多 10 条。

**技术特点**：
- 中文（`chs`）底层使用 **SQLite + FTS5** 索引，精确查询 < 10 ms
- 其他语言列使用 `LIKE` 扫描 + **rapidfuzz** 模糊匹配（首次可能数百 ms，命中缓存后 < 1 ms）
- 支持 `langs` 参数只返回指定的语言列
- 术语表初始化失败为**软失败**，不影响其他 API

---

## 1. 术语翻译查询

### 接口地址
**GET** `/api/v1/translate/terms`

### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | 是 | 查询关键词，最小长度 1 |
| `source_lang` | string | 否 | query 所属语言列，默认 `chs`；可选 `chs`、`cht`、`de`、`en`、`es`、`fr`、`id`、`it`、`jp`、`kr`、`pt`、`ru`、`th`、`tr`、`vi` |
| `langs` | string / string[] | 否 | 指定返回的语言列（如 `en`、`jp`），支持逗号分隔或多次传入；默认返回全部 15 种语言 |

### 请求示例

```bash
# 按中文精确查询（默认）
curl "http://localhost:8000/api/v1/translate/terms?query=黑名单"

# 按英文搜索，只返回中文和日文列
curl "http://localhost:8000/api/v1/translate/terms?query=Blocklist&source_lang=en&langs=chs,jp"

# 查询候选（精确结果优先，其余位置补充模糊候选）
curl "http://localhost:8000/api/v1/translate/terms?query=xyznotfound"
```

### 响应参数

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 是否成功 |
| `data.exact_match` | boolean | 是否存在精确包含匹配 |
| `data.query` | string | 原始查询词 |
| `data.total` | integer | 返回候选数量（最多 10） |
| `data.results` | array | 翻译结果候选列表，顺序为“精确匹配在前，模糊匹配在后” |
| `data.message` | string | 补充模糊候选或仅返回模糊候选时的提示信息 |

### 结果项字段

默认每条结果包含 15 个语言字段。当传入 `langs` 时，仅返回 `rowid`、source_lang 列以及 `langs` 中指定的列。

| 字段 | 说明 |
|------|------|
| `rowid` | 数据库行号 |
| `chs` | 简体中文 |
| `cht` | 繁体中文 |
| `de` | 德语 |
| `en` | 英语 |
| `es` | 西班牙语 |
| `fr` | 法语 |
| `id` | 印尼语 |
| `it` | 意大利语 |
| `jp` | 日语 |
| `kr` | 韩语 |
| `pt` | 葡萄牙语 |
| `ru` | 俄语 |
| `th` | 泰语 |
| `tr` | 土耳其语 |
| `vi` | 越南语 |

### 响应示例 — 精确优先，后接模糊候选

```json
{
  "success": true,
  "data": {
    "exact_match": true,
    "query": "黑名单",
    "total": 3,
    "message": "已优先展示精确匹配结果，并补充相似候选",
    "results": [
      {
        "rowid": 496053,
        "chs": "黑名单",
        "cht": "黑名單",
        "de": "Schwarze Liste",
        "en": "Blocklist",
        "es": "Lista negra",
        "fr": "Liste noire",
        "id": "Blacklist",
        "it": "Lista utenti bloccati",
        "jp": "ブラックリスト",
        "kr": "블랙리스트",
        "pt": "Lista Negra",
        "ru": "Чёрный список",
        "th": "แบล็คลิสต์",
        "tr": "Engellenenler",
        "vi": "Danh Sách Đen"
      },
      {
        "rowid": 496054,
        "chs": "黑名单上限",
        "cht": "黑名單上限",
        "de": "Blacklist-Obergrenze",
        "en": "Blocklist Limit",
        "es": "Límite de lista negra",
        "fr": "Limite de liste noire",
        "id": "Batas blacklist",
        "it": "Limite lista utenti bloccati",
        "jp": "ブラックリスト上限",
        "kr": "블랙리스트 상한",
        "pt": "Limite da lista negra",
        "ru": "Лимит чёрного списка",
        "th": "ขีดจำกัดแบล็คลิสต์",
        "tr": "Engellenenler sınırı",
        "vi": "Giới Hạn Danh Sách Đen"
      }
    ]
  }
}
```

### 响应示例 — 模糊匹配

```json
{
  "success": true,
  "data": {
    "exact_match": false,
    "message": "未找到完全包含该关键词的术语，以下是最相似的 10 条候选",
    "query": "xyznotfound",
    "total": 10,
    "results": [
      {
        "rowid": 26708,
        "chs": "x",
        "cht": "x",
        "de": "×",
        "en": "×",
        "es": "×",
        "fr": "×",
        "id": "x",
        "it": "x",
        "jp": "×",
        "kr": "x",
        "pt": "x",
        "ru": "×",
        "th": "x",
        "tr": "x",
        "vi": "x"
      }
    ]
  }
}
```

### 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 缺少/空的 `query` 参数，或 `source_lang` / `langs` 包含无效语言代码 |
| 503 | 术语表服务暂不可用（CSV/DB 缺失或损坏） |
| 500 | 查询过程中发生未预期的运行时错误 |

---

## 2. 批量术语翻译

### 接口地址
**POST** `/api/v1/translate/terms/batch`

### 说明

- 一次查询多条术语，返回每条术语在目标语言的官方译法。
- **仅接受精确等值匹配**；无匹配时返回 `translation: null`，由调用方（如 Agent）自行翻译。
- 主要用于 Agent 的 `translate_terms` 工具及 Skill / MCP 调用。

### 请求参数

```json
{
  "terms": ["攻击", "道具"],
  "source_lang": "chs",
  "target_lang": "en"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `terms` | string[] | 是 | 待翻译术语列表，至少 1 条 |
| `source_lang` | string | 否 | 术语所属语言列，默认 `chs` |
| `target_lang` | string | 是 | 目标语言列 |

### 响应示例

```json
{
  "success": true,
  "data": [
    {
      "source_term": "攻击",
      "source_lang": "chs",
      "target_lang": "en",
      "translation": "Attack",
      "chs": "攻击",
      "matched": true
    },
    {
      "source_term": "道具",
      "source_lang": "chs",
      "target_lang": "en",
      "translation": "Item",
      "chs": "道具",
      "matched": true
    }
  ]
}
```

### 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 缺少 `terms`、`target_lang`，或包含无效语言代码 |
| 503 | 术语表服务暂不可用 |
| 500 | 服务器内部错误 |

---

## 客户端调用示例

### 查询术语翻译（GET）

#### JavaScript

```javascript
// 查询术语翻译
const translateTerm = async (query, sourceLang = 'chs', langs = null) => {
  const params = new URLSearchParams({ query, source_lang: sourceLang });
  if (langs) {
    if (Array.isArray(langs)) {
      langs.forEach((l) => params.append('langs', l));
    } else {
      params.set('langs', langs);
    }
  }
  const response = await fetch(`/api/v1/translate/terms?${params.toString()}`);
  const data = await response.json();
  if (data.success) {
    console.log('精确匹配:', data.data.exact_match);
    console.log('结果数量:', data.data.total);
    console.log('翻译结果:', data.data.results);
  }
};

// 示例
translateTerm('黑名单');
translateTerm('Blocklist', 'en', ['chs', 'jp']);
```

#### Python

```python
import requests

BASE_URL = 'http://localhost:8000/api/v1'

def translate_term(query, source_lang='chs', langs=None):
    params = {'query': query, 'source_lang': source_lang}
    if langs:
        params['langs'] = langs
    response = requests.get(f'{BASE_URL}/translate/terms', params=params)
    data = response.json()
    if data['success']:
        print(f"精确匹配: {data['data']['exact_match']}")
        print(f"结果数量: {data['data']['total']}")
        for item in data['data']['results']:
            print(f"  CHS: {item.get('chs')}")
            print(f"  EN:  {item.get('en')}")
            print(f"  JP:  {item.get('jp')}")
    return data

# 示例
translate_term('黑名单')
translate_term('Blocklist', source_lang='en', langs='chs,jp')
```

#### cURL

```bash
# 精确查询（默认中文）
curl -sL "http://localhost:8000/api/v1/translate/terms?query=黑名单"

# 按英文搜索，只返回中文和日文
curl -sL "http://localhost:8000/api/v1/translate/terms?query=Blocklist&source_lang=en&langs=chs,jp"

# 模糊查询
curl -sL "http://localhost:8000/api/v1/translate/terms?query=某某词"
```

### 批量术语翻译（POST）

#### JavaScript

```javascript
const translateTermsBatch = async (terms, targetLang, sourceLang = 'chs') => {
  const response = await fetch('/api/v1/translate/terms/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terms, source_lang: sourceLang, target_lang: targetLang })
  });
  const data = await response.json();
  if (data.success) {
    console.log('批量翻译结果:', data.data);
  }
};

translateTermsBatch(['攻击', '道具'], 'en');
```

#### Python

```python
import requests

BASE_URL = 'http://localhost:8000/api/v1'

def translate_terms_batch(terms, target_lang, source_lang='chs'):
    response = requests.post(f'{BASE_URL}/translate/terms/batch', json={
        'terms': terms,
        'source_lang': source_lang,
        'target_lang': target_lang
    })
    data = response.json()
    if data['success']:
        for item in data['data']:
            print(f"{item['source_term']} -> {item.get('translation')}")
    return data

translate_terms_batch(['攻击', '道具'], 'en')
```

#### cURL

```bash
curl -X POST "http://localhost:8000/api/v1/translate/terms/batch" \
  -H "Content-Type: application/json" \
  -d '{"terms": ["攻击", "道具"], "source_lang": "chs", "target_lang": "en"}'
```

---

## 实现细节

### 查询流程

1. **Phase 1 — 精确包含查询**
   - `source_lang=chs` 时使用 FTS5 全文索引在 `CHS` 列上搜索
   - `source_lang` 为其他语言时使用 `LIKE` 扫描该语言列
   - Python 后过滤：`query.lower() in row[source_lang].lower()`
   - 中文典型延迟：< 10 ms；其他语言首次查询可能数百毫秒，结果被 LRU 缓存后 < 1 ms

2. **Phase 2 — 模糊候选补位**
  - 无论是否命中精确结果，都会在剩余位置补充模糊候选
  - 使用 `rapidfuzz` 在 600K 条内存索引上计算相似度
  - 与精确结果去重后，整体候选最多返回 10 条
   - 典型延迟：50–200 ms

### 故障隔离

- 术语表初始化失败为**软失败**，不影响 RAG / Agent / Skill / Data 等其他 API
- 服务不可用时返回 `503` 状态码

### 依赖

- `rapidfuzz` — 用于高性能模糊匹配（C++ 后端）
- `sqlite3`（Python 标准库）— SQLite + FTS5 全文索引

---

# SVG 一图流 API

提供对 `knowledge/Miliastra-knowledge/derived/svg/` 目录的文档浏览能力，以 `svg_index.md` 作为目录索引（`##` 作为文件夹分组）。

前端页面入口：`/svg`

---

## 1. 获取目录结构

### 接口地址
**GET** `/api/v1/svg/index`

### 响应示例

```json
{
  "sections": [
    {
      "title": "地形编辑",
      "level": 2,
      "items": [
        { "number": "02", "title": "02-地形编辑", "filename": "02-地形编辑.svg" },
        { "number": "03", "title": "03-环境配置", "filename": "03-环境配置.svg" },
        { "number": "04", "title": "04-快捷设置（编辑界面右上角齿轮）", "filename": "04-快捷设置.svg" }
      ]
    }
  ]
}
```

- `level`：`2` 表示 `##` 普通分组，`1` 表示 `#` 顶层特殊分组（如版本更新）
- `filename`：若对应 SVG 文件尚不存在则为 `null`

---

## 2. 名称搜索并获取图表

### 接口地址
**GET** `/api/v1/svg/search`

### 查询参数

| 参数    | 类型    | 必填 | 默认值 | 说明                                               |
| ------- | ------- | ---- | ------ | -------------------------------------------------- |
| `name`  | string  | 是   | —      | 搜索关键词，忽略大小写，采用**包含/被包含**匹配    |
| `png`   | boolean | 否   | false  | 设为 `true` 时将 SVG 渲染为 PNG 返回               |
| `scale` | float   | 否   | 2.0    | PNG 渲染分辨率缩放倍数（0.5–4.0），仅 `png=true` 时有效 |

### 返回

- `png=false`（默认）：返回 SVG 文件，`Content-Type: image/svg+xml`
- `png=true`：返回 PNG 图像，`Content-Type: image/png`
- 响应头均包含 `X-Svg-Filename`，值为实际匹配到的文件名
- 响应头均包含 `X-Page-Url`，值为对应前端页面地址，如 `/svg/31-技能`

### 错误码

| 状态码 | 说明                  |
| ------ | --------------------- |
| 404    | 未找到与关键词匹配的图表 |

### 示例

```bash
# 搜索"技能"相关图表，返回 SVG
curl -O -J "http://localhost:8000/api/v1/svg/search?name=技能"

# 搜索"界面布局"，渲染为 PNG（2× 分辨率）
curl -o layout.png "http://localhost:8000/api/v1/svg/search?name=界面布局&png=true&scale=2.0"

# 搜索"地形"，渲染为低分辨率 PNG
curl -o terrain.png "http://localhost:8000/api/v1/svg/search?name=地形&png=true&scale=1.0"
```

---

## 3. 按文件名获取原始 SVG / PNG

### 接口地址
**GET** `/api/v1/svg/raw/{filename}`

### 路径参数

| 参数       | 类型   | 说明                                        |
| ---------- | ------ | ------------------------------------------- |
| `filename` | string | SVG 文件名，如 `02-地形编辑.svg`（URL 编码）|

### 查询参数

| 参数    | 类型    | 默认值 | 说明                                       |
| ------- | ------- | ------ | ------------------------------------------ |
| `png`   | boolean | false  | 设为 `true` 时将 SVG 渲染为 PNG 后返回     |
| `scale` | float   | 2.0    | PNG 渲染分辨率缩放（0.5–4.0，仅 png=true） |

### 响应

- 成功（SVG）：返回 SVG 文件内容，`Content-Type: image/svg+xml`
- 成功（PNG）：返回渲染后的 PNG，`Content-Type: image/png`，中文使用 Noto Sans CJK 字体
- 失败：`400`（非法文件名）/ `404`（文件不存在）

---

## 4. 模糊匹配并获取页面链接

### 接口地址
**GET** `/api/v1/svg/resolve`

### 说明

- 按名称模糊匹配图表，返回可在浏览器直接打开的完整 URL
- 支持包含/被包含匹配，如 `变量` 可匹配 `16-变量.svg`
- 适用于 AI 工具调用（MCP）等外部场景

### 查询参数

| 参数 | 类型   | 必选 | 说明                                       |
| ---- | ------ | ---- | ------------------------------------------ |
| `q`  | string | 是   | 图表名称，如 `变量`、`技能`、`地形编辑`   |

### 响应示例

```json
{
  "query": "变量",
  "title": "16-变量",
  "url": "https://ugc.070077.xyz/svg/16"
}
```

### 示例请求

```bash
curl "http://localhost:8000/api/v1/svg/resolve?q=变量"
```

### 错误码

| 状态码 | 说明                      |
| ------ | ------------------------- |
| 404    | 未找到与关键词匹配的图表 |

