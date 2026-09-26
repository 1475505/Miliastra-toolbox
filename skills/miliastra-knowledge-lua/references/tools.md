# 客户端控件/脚本文档工具参考

本文档只覆盖 `miliastra-knowledge-lua` 技能使用的两个工具，仅用于千星奇域 2D + lua 脚本游戏制作场景。

## 服务连接

- API Base URL：`/api/v1/skills/miliastra-knowledge/tools`
- 例子：`https://ugc.070077.xyz/api/v1/skills/miliastra-knowledge/tools`
- 调用方式：HTTP `POST` + JSON 请求体

工具端点与主知识库共用同一 Skill 地址；数据来源为 `knowledge/Miliastra-knowledge/client/`（7.1 客户端控件/客户端脚本文档，10 篇），与 `official/` 语料相互独立。

**curl 调用示例**（Windows PowerShell 请对应调整引号与转义语法）：

```bash
curl -X POST https://ugc.070077.xyz/api/v1/skills/miliastra-knowledge/tools/get_client_document \
  -H "Content-Type: application/json" \
  -d '{
    "titles": ["客户端控件容器"]
  }'
```

```javascript
const response = await fetch('https://ugc.070077.xyz/api/v1/skills/miliastra-knowledge/tools/get_client_document', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    titles: ['客户端控件容器']
  })
})

const payload = await response.json()
if (!response.ok || !payload.success) {
  throw new Error(`Knowledge API request failed (HTTP ${response.status})`)
}
const result = payload.data.result
```

**通用响应包裹结构**：

```json
{
  "success": true,
  "data": {
    "skill": "miliastra-knowledge",
    "tool": "get_client_document",
    "result": []
  },
  "error": null
}
```

---

## `list_client_documents`

### 参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `keywords` | `list[str]` | 否 | 过滤关键词列表，支持模糊匹配；空列表时返回全部客户端控件文档 |

### 行为

- 数据来源：`knowledge/Miliastra-knowledge/client/`，即 7.1 客户端控件/客户端脚本文档（10 篇）
- **独立语料**：这批文档不在 `official/` 下，`list_documents`、`get_document`、`rag_search`、`get_node_info` 都查不到，必须用本工具
- 匹配规则与返回结构跟 `list_documents` 完全一致（单关键词返回数组，空关键词返回 `{total, documents}`）
- 返回结果只含 `title` 和 `file`，不含正文（正文需用 `get_client_document`）
- 部署中未包含分流语料时 `total` 为 0，此时应如实告知用户

### 返回结构

**单关键词**（`keywords=["控件"]`）：
```json
[
  {
    "keyword": "控件",
    "total": 10,
    "documents": [
      {"title": "客户端控件容器", "file": "client/mhlz2lrly3dq_客户端控件容器.md"}
    ]
  }
]
```

**无关键词**（`keywords=[]` 或不传）：
```json
{
  "total": 10,
  "documents": [{"title": "客户端控件容器", "file": "..."}]
}
```

### 示例

```json
{"keywords": ["控件"]}
```

```json
{"keywords": ["控件", "脚本"]}
```

---

## `get_client_document`

### 参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `titles` | `list[str]` | 是 | 文档标题或关键词列表，支持模糊匹配，可批量传入 |

### 行为

- 在 `client/` 目录内匹配，规则与 `get_document` 一致：`ok`（1–5 篇，返回全文）/ `too_many`（>5 篇，只返回标题列表）/ `not_found`（返回可用标题样本）
- **不返回节点关联**：这批文档没有 `derived/` 节点产物，`related_nodes` 恒为空数组
- 不经向量库，`rag_search` 不覆盖这批内容

### 返回结构

```json
[
  {
    "query": "客户端控件容器",
    "status": "ok",
    "documents": [
      {
        "title": "客户端控件容器",
        "file": "client/mhlz2lrly3dq_客户端控件容器.md",
        "content": "---\ntitle: 客户端控件容器\n...",
        "related_nodes": []
      }
    ]
  }
]
```

### 示例

```json
{"titles": ["客户端控件容器"]}
```

批量取多篇（推荐）：
```json
{"titles": ["客户端控件容器", "客户端控件API文档", "客户端控件和客户端脚本"]}
```