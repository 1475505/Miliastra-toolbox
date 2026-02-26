## 爬取url
https://bbs-api.miyoushe.com/post/wapi/getPostReplies?gids=2&is_hot=false&order_type=2&post_id=69834163&size=20

提取其中返回的last_id，这里示例是611，填入下面构造的url

https://bbs-api.miyoushe.com/post/wapi/getPostReplies?gids=2&is_hot=false&last_id=611&order_type=2&post_id=69834163&size=20

直到"is_last": true

## 输出格式

一个markdown文件，开头是
```
---
id: bbs-faq-20251130 
title: 米游社【问答集中楼】开发问题互助专区
force: true
url: https://www.miyoushe.com/ys/article/69834163
---
```

然后对于每个爬取到的reply，写入（`-----------------------`分割）：

- 问题：reply.content
- 回答（列表）:reply.sub_replies.reply.content（作者：reply.sub_replies.user.nickname）
- 来自：米游社问答楼reply.floor_id


```
## Q. 问题
A. 回答
回答者：


来自：米游社问答楼floor_id

-----------------------
```
如果有多个回答，都写上。

## 说明
- 测试时使用demo.json
- 只需要实现我上方爬取说明的功能，不需要额外配置
- 中间爬取时下载的json可以存储在inter_data文件夹内，下次运行就不需要重复拉取了

## 使用说明
- 测试模式：`python crawler.py --test`，输出`bbs-faq-test.md`
- 实际爬取：`python crawler.py`，输出`bbs-faq.md`。如果`inter_data`中已有对应URL的数据，则不重复爬取。
- 新增内容爬取：`python crawler.py --since-id 630`，输出`bbs-faq-since630.md`。只保留晚于第630楼的数据。