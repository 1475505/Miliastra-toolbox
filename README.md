# 千星奇域工具箱

千星奇域工具箱是AI赋能，提升千星沙箱编辑效率的工具集合。

## 接入后端的方式

### 直接接入QQ机器人（目前推荐）

![对话.gif](https://7s-1304005994.cos.ap-singapore.myqcloud.com/对话.gif)

可以加群1030307936，通过nonebot插件进行知识问答。

## 前端知识问答（还在开发中）

![demo](https://7s-1304005994.cos.ap-singapore.myqcloud.com/68cd1a565e1334de448e717cceffcc82.png)

## 开发计划

【1】知识问答系统：通过RAG对奇匠学院的文档进行知识问答。
- **已实现**: 支持多目录（guide + tutorial）的知识库构建和查询。目前：原型版本（效果不佳）、Cli交互。
- **使用方法**: 配置.env后，`cd knowledge/rag_v1 && python3 rag_cli.py init` 初始化知识库
- **查询示例**: `cd knowledge/rag_v1 && python3 rag_cli.py retrieve 小地图`

【2】搭建前后端，需要BYOK。提供限额的openrouter免费模型。
- **已实现**: Fastapi后端（提供免费模型，未限额）、简易对话前端（待实现对话保存）

【3】数据问答系统：集合和统计所有方便的参数，可与AI对话设计。比如：一次冲刺可以移动多少坐标距离

【4】素材寻找系统：通过多模态RAG快速寻找符合描述的素材

## Get Started

### 1. 完成知识库构建

进入`knowledge/rag_v1`目录，配置`.env`为自己的嵌入模型服务后，初始化知识库。

### 2. 部署后端

进入`backend`目录，配置`.env`为自己的大模型chat服务后，则完成后端启动，可参考对应文件夹下的`api.md`进行访问。

目前直接访问可以使用一个简易的前端。
