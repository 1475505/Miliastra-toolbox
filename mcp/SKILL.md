---
name: miliastra-knowledge
description: 千星沙箱（原神千星奇域）知识库查询。当用户询问千星沙箱的节点用法、编辑器功能、FAQ、教程文档，或需要把玩法需求拆解为具体节点与文档时，使用本skill。
---

# 千星沙箱知识库查询 Skill

API端点：https://ugc.070077.xyz/

> 工具参数、返回结构与关键词详见 [references/tools.md](references/tools.md)。  
> 服务连接配置也在同一文件。
> 通过 HTTP Skill API 调用：`GET /api/v1/skills` 与 `POST /api/v1/skills/miliastra-knowledge/tools/*`。

## 什么时候用

- 用户询问千星沙箱某个节点的用法、参数、触发条件
- 用户询问系统/组件功能（战斗、仇恨、商店、背包、运动器、触发器……）
- 用户遇到"为什么不触发/不生效"等排障问题
- 用户想了解某系统的整体设计或配置步骤
- 需要把玩法需求拆解为具体节点名和参考文档

## 4 个工具分别负责什么

| 工具 | 职责 |
|------|------|
| `get_node_info` | 按节点名查说明、参数表、所属分类与来源文档；支持模糊匹配和批量查询 |
| `list_documents` | 浏览或过滤知识库文档列表；用于不知道精确文档名时先看有哪些 |
| `get_document` | 获取官方文档全文；支持批量，一次获取多篇相关文档 |
| `rag_search` | 自然语言语义检索；支持批量，多个独立问题可一次查完 |

## 怎么选工具

1. **用户说了具体节点名** → `get_node_info`（批量传入效率更高）
2. **用户说"有没有关于 X 的文档"** → `list_documents(keywords=[X])` 先看列表；多个主题可批量传入
3. **用户提到功能名/系统名** → `get_document(["系统名"])`；涉及多个系统可批量传入
4. **用户用自然语言描述功能或问题** → `rag_search`；多个独立问题可批量传入
5. **查节点后需要看完整配置说明** → 取 `source_doc_title`，再调 `get_document`
6. **不确定文档精确名称** → 先 `list_documents`，再 `get_document`

## 常见调用顺序

**开放玩法需求**（不知道节点名）：
```
rag_search(["需求描述"]) → get_node_info([命中的节点名]) → get_document([文档名])
```

**已知节点名**：
```
get_node_info([节点名]) → 若需深入 → get_document([source_doc_title])
```

**学习某个系统**（如商店、仇恨、背包）：
```
list_documents(["关键词"]) → get_document("精确文档名")
```
**同时探索多个系统**：
```
list_documents(["关键词A", "关键词B"]) → get_document(各结果中的文档名)
```

**排障类**（"为什么不触发/不生效"）：
```
rag_search(["描述问题A", "描述问题B"]) → get_document(["相关系统文档"])
```

**造物/技能专项**：
```
list_documents(["造物状态"]) → get_document(["造物状态决策节点图", "复杂造物技能"])
  → get_node_info(["复杂造物定点位移", "造物转向指定朝向"])
```

**仇恨系统批量查询**：
```
rag_search(["嘲讽和仇恨系统配置", "怪物追击玩家行为"])
  → get_node_info(["嘲讽目标", "增加指定实体的仇恨值", "获取指定实体的仇恨目标"])
  → get_document(["仇恨配置"])
```

## 输出时怎么整理给用户

- 来自 `get_node_info`：说明节点用途和关键参数，注意引用字段名
- 来自 `get_document`：总结文档要点，必要时直接引用原文片段
- 来自 `rag_search`：优先引用 similarity 最高的结果，注明来源文档
- **始终区分"文档原文已说明"和"基于资料的推测建议"**
- 不要编造节点名、参数名或官方结论；查不到就说查不到
