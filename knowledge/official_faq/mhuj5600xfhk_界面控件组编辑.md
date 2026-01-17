---
id: mhuj5600xfhk
title: 界面控件组编辑
url: https://act.mihoyo.com/ys/ugc/tutorial/faq/detail/mhuj5600xfhk
sourceURL: https://act.mihoyo.com/ys/ugc/tutorial/faq/detail/mhuj5600xfhk
description: undefined
language: zh
scope: official_faq
crawledAt: 2026-01-16T03:37:52.697Z
---

# Q：文本框内容是否支持换色？文本怎么换行？

A：可以使用在文本框设置中通过“\\n”命令进行换行；![](https://act-webstatic.mihoyo.com/ugc-tutorial/faq/cn/zh-cn/mhuj5600xfhk/377504b3-446f-423f-ae30-1da063e1e8e5.png)

可以使用"<color=颜色英文>正文</color>"命令制作出不同颜色的文本，如下：![](https://act-webstatic.mihoyo.com/ugc-tutorial/faq/cn/zh-cn/mhuj5600xfhk/f0819202-877e-49ed-8690-765e20e94890.png)

# Q：能否单独获取到弹窗控件/其他控件被开启和关闭的事件？

现在暂时没有弹窗控件/其他控件被开启和关闭的单独事件。

# Q：我在元件上挂载了全局计时器，想通过计时器控件来获取计时器时间，为什么获取不到？

界面控件里的计时器控件，只能读取关卡实体（LevelEntity）以及玩家身上的计时器组件信息，无法读取到实体摆放界面其他实体上的全局计时器数据的，因此如果有读取全局计时器时间需求，请将其挂载在关卡实体（LevelEntity）或玩家身上。

# Q：为什么我已经点击按钮了，但是没有触发【界面控件组触发时】事件？

由于此节点只监听特定玩家的点击情况，因此请确认【界面控件组触发时】这一节点的节点图挂载在【玩家】身上且应用给目标玩家。

# Q：为什么我点击了我的“卡牌选择器”组件的“重置”按钮，直接关闭了我的卡牌选择器窗口？

A：界面控件组编辑器的“卡牌选择器”组件的“重置”按钮，需要挂载节点图来实现卡牌选择器功能，如果没有相应的节点图，则默认会直接关闭卡牌选择器弹窗。

# Q：为什么我找不到“卡牌选择器”的界面？

A：界面控件组管理的“卡牌选择器”目前只可添加到界面控件组库中，不支持添加到界面布局上。