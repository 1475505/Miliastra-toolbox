# API 文档

## 目录

- [RAG API](#rag-api)
  - [1. 非流式接口](#1-非流式接口)
  - [2. 流式接口](#2-流式接口)

- [笔记 API](#笔记api)
  - [1. 创建笔记](#1-创建笔记)
  - [2. 修改笔记](#2-修改笔记)
  - [3. 点赞笔记](#3-点赞笔记)
  - [4. 查询笔记列表](#4-查询笔记列表)
  - [5. 获取单个笔记详情](#5-获取单个笔记详情)

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
    "use_default_model": "boolean - 是否使用后端默认免费模型（默认 false）"
  }
}
```

**配置优先级说明**：
1. **优先使用免费模型**：若 `use_default_model=true`，则使用 `.env` 中的 `DEFAULT_FREE_MODEL_*` 配置（最高优先级）
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
    "model": "deepseek-chat",
    "use_default_model": false
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
    "use_default_model": true
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
        "url": "/knowledge/guide/map.md"
      },
      {
        "title": "教程-小地图功能",
        "doc_id": "tutorial_map_002",
        "similarity": 0.76,
        "text_snippet": "要使用小地图，需要先在设置中开启...",
        "url": "/knowledge/tutorial/map.md"
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
      model: 'deepseek-chat'
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
        'model': 'deepseek-chat'
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
      "model": "deepseek-chat"
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
      model: 'deepseek-chat'
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
            'model': 'deepseek-chat'
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

