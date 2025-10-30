---
id: mh3pgiraqkiu
title: 关卡
url: https://act.mihoyo.com/ys/ugc/tutorial/detail/mh3pgiraqkiu
sourceURL: https://act.mihoyo.com/ys/ugc/tutorial/detail/mh3pgiraqkiu
description: undefined
language: zh
scope: guide
crawledAt: 2025-10-30T19:30:48.570Z
---

_关卡_是一种特殊的实体，被推荐用于承载关卡逻辑

# 一、创建关卡实体

关卡实体在新建一个关卡后会自动创建在场景当中，并且在场景中会用一个特殊图标进行表示

# 二、编辑关卡实体

切换到实体编辑页签

关卡实体的编辑和其他类型的实体类似，但实际可配置的_基础信息_和_组件_会有所区别

## 1.基础信息

基础信息页签，可配置关卡实体的所有可用属性

## 2.通用组件

通用组件页签，可给关卡实体添加通用组件配置

关卡实体的可用组件概览：

[自定义变量](https://act.mihoyo.com/ys/ugc/tutorial//detail/mhso1b9wjica)

[全局计时器](https://act.mihoyo.com/ys/ugc/tutorial//detail/mhawd6rl5kpy)

## 3.节点图

节点图配置页签，可给关卡实体添加节点图或查看已添加的节点图

# 三、关卡的特性

区别于其他的实体类型，关卡实体拥有以下特性

## **1.可接收特殊事件**

部分特殊事件只有关卡类型的实体可以接收，其中包括：

_物件_和_造物_类型的实体在移除/销毁时，实体本身无法收到对应事件，事件会转发到关卡实体上，

并由关卡实体处理后续的逻辑

## **2.无物理实体**

关卡实体是一个纯逻辑实体

## **3.布设信息不全**

关卡实体只有_位置信息_，没有_旋转、缩放信息_

## **4.生命周期**

关卡实体的生命周期随关卡初始化创建，随关卡销毁而销毁