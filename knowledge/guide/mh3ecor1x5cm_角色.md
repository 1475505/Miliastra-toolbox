---
id: mh3ecor1x5cm
title: 角色
url: https://act.mihoyo.com/ys/ugc/tutorial/detail/mh3ecor1x5cm
sourceURL: https://act.mihoyo.com/ys/ugc/tutorial/detail/mh3ecor1x5cm
description: undefined
language: zh
scope: guide
crawledAt: 2025-10-30T19:44:44.125Z
---

区别于_玩家实体_，_角色实体_指代的是游戏过程中玩家实际控制的走跑爬飞单位，有物理实体

# 一、角色模板

在超限模式中，玩家和角色是一一对应的，因此角色的_模板配置_作为_玩家模板_的一部分存在，入口在玩家模板的角色编辑页签下：

页签概述：

：基础信息页签，角色这里对比其它实体仅有音效相关信息

：特化配置页签，角色这里对比其它实体仅有战斗设置相关参数

：通用组件页签，可在此页签给角色实体添加组件，或查看已添加的组件

：节点图配置页签，可在此页签给角色实体添加节点图，或查看已添加的节点图

# 二、角色实体的可用组件概览

[碰撞触发器](https://act.mihoyo.com/ys/ugc/tutorial//detail/mh8w69rzuc3i)

[自定义变量](https://act.mihoyo.com/ys/ugc/tutorial//detail/mhso1b9wjica)

[全局计时器](https://act.mihoyo.com/ys/ugc/tutorial//detail/mhawd6rl5kpy)

[单位状态](https://act.mihoyo.com/ys/ugc/tutorial//detail/mhd7nxrfa8im)

[特效播放](https://act.mihoyo.com/ys/ugc/tutorial//detail/mh4ppo02m1o8)

[自定义挂接点](https://act.mihoyo.com/ys/ugc/tutorial//detail/mhmshmimtegs)

[碰撞触发源](https://act.mihoyo.com/ys/ugc/tutorial//detail/mhn95di01j84)

[音效播放器](https://act.mihoyo.com/ys/ugc/tutorial//detail/mhwiv89yra02)

[背包组件](https://act.mihoyo.com/ys/ugc/tutorial//detail/mh5y5001vqd4)

[战利品](https://act.mihoyo.com/ys/ugc/tutorial//detail/mh63ox06afy8)

[铭牌](https://act.mihoyo.com/ys/ugc/tutorial//detail/mh5n160t2b6w)

[文本气泡](https://act.mihoyo.com/ys/ugc/tutorial//detail/mhwtz297kp6a)

[扫描标签](https://act.mihoyo.com/ys/ugc/tutorial//detail/mhfc0lr1tcke)

[小地图标识](https://act.mihoyo.com/ys/ugc/tutorial//detail/mh0pppib5eyc)

此外还有仅角色可以添加的装备栏组件

详情可见[装备](https://act.mihoyo.com/ys/ugc/tutorial//detail/mhkl2yin0cxo)

# 三、运行时特性



角色在游戏过程中，会根据模板配置动态进行初始化，因此角色实体不具有对应的_GUID_



特殊的，当角色生命值归零时，角色实体上的节点图可以收到角色的_实体销毁时事件_以及_实体移除/销毁时事件_，而物件销毁时，事件会被推送到关卡实体上



在联机游玩过程中，如果玩家主动返回大厅，则关卡会收到角色的移除事件