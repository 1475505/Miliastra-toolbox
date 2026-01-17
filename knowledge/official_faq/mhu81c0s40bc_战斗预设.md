---
id: mhu81c0s40bc
title: 战斗预设
url: https://act.mihoyo.com/ys/ugc/tutorial/faq/detail/mhu81c0s40bc
sourceURL: https://act.mihoyo.com/ys/ugc/tutorial/faq/detail/mhu81c0s40bc
description: undefined
language: zh
scope: official_faq
crawledAt: 2026-01-16T03:37:40.066Z
---

## Q：我怎么获取不到角色的GUID？

角色本身没有GUID，因此请注意在节点图GUID参数获取中，不要获取角色的GUID，这会导致功能不运行。

![](https://act-webstatic.mihoyo.com/ugc-tutorial/faq/cn/zh-cn/mhu81c0s40bc/ff08ccdd-e24b-4d17-be6d-98919d087460.png)

## Q：玩家和角色之间是什么关系？

在局内编辑器中，【玩家】是服务器概念上的独立个体，即每个进入游戏的玩家，每名玩家的变量存储也都独立存在；【角色】是由玩家进行操作控制的特殊实体，在关卡中与各类组件进行交互的实体都是【角色】；不过需要注意，【玩家】有GUID，但是【角色】没有GUID。

## Q：我怎么让角色手持武器？

现阶段武器是通过特效来配置的，在角色的【特效】组件上挂载【循环特效】，在资产中选择“模型-单手剑/大剑”后，在挂接点上根据自身需求选择挂接点。

## Q：为什么我的角色复苏之后又立马被击败了？

关卡内角色的复苏逻辑是：先在原地复苏，再传送到复苏点；因此，在特定情况下，角色复苏后可能会被立即击败。

## Q：为什么我的技能命中目标数量变多之后，后面的目标无法被正常命中了？

技能同时命中的目标超过20个时，基于技能选中目标的逻辑，超过20个以外的目标将无法受到任何伤害。

## Q：在技能节点图的预览中，为什么只能预览到部分技能节点图中的执行效果？

在“千星沙箱”中，编辑技能相关节点时，仅支持预览部分“执行节点”的执行效果。