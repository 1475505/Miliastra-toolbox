# RAG API 文档

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

## 请求参数

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
    "api_key": "string - DeepSeek API Key（必填）",
    "api_base_url": "string - API 基础 URL（必填，如 https://api.deepseek.com/v1）",
    "model": "string - 模型名称（必填，如 deepseek-chat）"
  }
}
```

### 请求示例
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
    "model": "deepseek-chat"
  }
}
```

## 响应参数

```json
{
  "success": "boolean - 是否成功",
  "data": {
    "id": "string - 会话ID",
    "question": "string - 用户问题",
    "answer": "string - AI 回答",
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

## 错误码

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | API Key 无效 |
| 422 | 对话历史格式错误 |
| 500 | 服务器内部错误 |

## 客户端调用示例

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
data: {"type": "sources", "data": [{"title": "...", "url": "..."}]}

data: {"type": "token", "data": "文本"}

data: {"type": "token", "data": "片段"}

data: {"type": "done", "data": {"tokens": 123}}
```

### 事件类型

| 类型 | 说明 | 数据格式 |
|------|------|---------|
| `sources` | 引用来源 | `{"data": [{"title", "url", "similarity"}]}` |
| `token` | 文本片段 | `{"data": "文本内容"}` |
| `done` | 完成信号 | `{"data": {"tokens": 123}}` |
| `error` | 错误信息 | `{"data": "错误描述"}` |

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

## 健康检查

### 接口地址
**GET** `/health`

### 响应示例
```json
{
  "status": "ok",
  "index_loaded": true
}
```
