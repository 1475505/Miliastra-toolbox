---
slug: miliastra-toolbox-lua
displayName: 千星沙箱客户端脚本知识库
version: 1.0.0
summary: 千星奇域 2D + lua 脚本游戏制作专用：查询客户端控件与客户端脚本文档，覆盖控件配置与客户端控件 API。
license: Proprietary
name: miliastra-knowledge-lua
description: 千星奇域 2D + lua 脚本游戏制作（客户端 UI 编程）专用：查询客户端控件与客户端脚本文档——客户端控件容器、文本视窗控件、预设按钮控件、按键提示控件、光标检测区域控件、网格视窗控件、模板引用控件、容器节点控件，以及客户端控件 API 与 lua 脚本接口。仅当用户进行客户端脚本（lua）编程、制作 2D 界面/HUD 或配置客户端控件时使用；服务端节点图与玩法逻辑问题改用 miliastra-knowledge。
---

# 千星沙箱客户端脚本知识库查询

仅覆盖千星奇域 **2D + lua 脚本游戏制作**（客户端 UI 编程）语料：客户端控件与客户端脚本文档，共 10 篇。

服务端节点图、玩法逻辑、系统配置与排障问题不在本技能范围，改用 `miliastra-knowledge`。

服务地址：`https://ugc.070077.xyz`

## 调用方式与工具选择

通过 HTTP Skill API 调用，JSON 请求体：

```
POST https://ugc.070077.xyz/api/v1/skills/miliastra-knowledge/tools/<工具名>
```

工具端点与主知识库共用一个 Skill 地址，但下列两个工具只服务客户端 lua 场景。各工具的参数、返回结构与 curl 示例详见 [references/tools.md](references/tools.md)。

首次调用前阅读该参考文件。所有请求使用 `Content-Type: application/json`，请求体必须是包含具名字段的 JSON 对象。

| 工具 | JSON 请求体示例 |
|------|----------------|
| `list_client_documents` | `{"keywords": ["控件"]}` |
| `get_client_document` | `{"titles": ["客户端控件容器"]}` |

先检查 HTTP 状态和响应中的 `success`、`error`，成功后从 `data.result` 读取工具结果。

## 什么时候用

- 用户进行千星奇域 2D + lua 脚本游戏制作（客户端界面/控件编程）
- 询问客户端控件的功能与配置：客户端控件容器、文本视窗控件、预设按钮控件、按键提示控件、光标检测区域控件、网格视窗控件、模板引用控件、容器节点控件
- 询问客户端脚本（lua）如何挂载到控件、如何调用、与控件如何交互
- 需要查客户端控件 API 文档中的脚本接口与参数

## 工具一览

| 工具 | 职责 |
|------|------|
| `list_client_documents` | 按关键词列出客户端控件/脚本文档标题（不含正文）；用于不知道精确文档名时先看有哪些 |
| `get_client_document` | 按标题获取客户端控件/脚本文档全文；支持批量，一次获取多篇相关文档 |

客户端语料仅 10 篇，结构化工具即可覆盖，**不提供也不需要使用 `rag_search`**。

**独立语料**：这批文档不在 `official/` 下，`list_documents`、`get_document`、`rag_search`、`get_node_info` 都查不到它们，必须用上述两个工具。这批文档无节点关联，返回中不含 `related_nodes`。

## 选择工具

1. **不确定文档名 / 想浏览有哪些客户端文档** → `list_client_documents(keywords=[关键词])`（`keywords` 传空列表可浏览全部 10 篇）
2. **已知控件/文档名，要完整内容** → `get_client_document(["控件名"])`

**批量原则：多个独立查询合并为一次调用**。两个工具均支持列表入参，不要拆成多轮单条调用，也不要重复相同调用。

## 常见调用顺序

**调研某个客户端控件**（如预设按钮怎么做）：
```
list_client_documents(["预设按钮"]) → get_client_document(["预设按钮控件"])
```

**写 lua 脚本查 API**：
```
get_client_document(["客户端控件API文档"]) → 按其中的接口说明作答
```

**从零搭建 2D 界面**：
```
get_client_document(["客户端控件容器"]) → list_client_documents(["控件"]) → get_client_document([具体控件名])
```

**客户端脚本与控件的配合**：
```
get_client_document(["客户端控件和客户端脚本", "客户端控件API文档"])
```

## 异常处理

- `list_client_documents` 返回 `total=0` → 说明该部署未包含分流语料，如实告知；不要改用 `rag_search` 反复尝试
- `get_client_document` 返回 `status="not_found"` → 先 `list_client_documents` 找候选标题再重查
- `get_client_document` 返回 `status="too_many"` → 用更精确的关键词重查
- `list_client_documents` 无结果 → 换更短/更通用的关键词（如「控件」「脚本」「API」）
- HTTP 失败、`success=false` 或结果内出现 `error` → 明确说明查询失败，不将其解释为知识库没有资料
- 工具调用报错（HTTP 错误、超时等）→ 换等价关键词重试一次；仍失败则明确告知用户知识库不可用

## 输出要求

- 控件类回答：说明功能、关键配置项、可挂载的客户端脚本调用方式，并注明来源文档
- API 类回答：给出接口名、参数与用法，必要时直接引用原文片段
- **严格区分"文档原文已说明"与"基于资料的推测建议"**
- 不得编造控件名、接口名或官方结论；查不到就明确说查不到，并建议用户换个问法