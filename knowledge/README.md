# 知识库脚本

---

## 📋 概述

本模块负责管理文档爬取，实现从网页抓取到 markdown 文件生成的完整流程。

> TODO: 测试json版文档解析

### 核心功能

- ✅ **自动URL提取** - 使用Firecrawl crawl模式自动发现所有文档链接
- ✅ **批量爬取** - 支持并发爬取（默认并发度=2），带进度报告和错误处理
- ✅ **Markdown生成** - 自动生成带前置元数据的 markdown 文件
- ✅ **测试模式** - 支持小批量测试，避免大量API消耗
- ✅ **并发控制** - 可调节并发度，平衡速度和稳定性

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────┐
│  源网站 (act.mihoyo.com)                                  │
│  ├─ 综合指南首页                                          │
│  └─ 教程首页                                              │
└─────────────────────────────────────────────────────────┘
                    ↓ Firecrawl crawl 模式
┌─────────────────────────────────────────────────────────┐
│  自动提取所有链接 → config/urls-*.json                    │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│  批量爬取 (Firecrawl scrape)                              │
│  ├─ HTML → Markdown 转换                                 │
│  └─ 添加前置元数据                                        │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│  本地存储                                                 │
│  └─ Markdown 文件 (data/ 目录)                           │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 项目结构

```
knowledge/
├── README.md                     # 本文档
├── package.json                  # 依赖配置
├── tsconfig.json                 # TypeScript 配置
├── .env.local                    # 环境变量配置
│
├── scripts/                      # 核心脚本
│   ├── crawl.ts                 # 自动爬取 URL 列表
│   ├── scrape.ts                 # 主爬虫脚本
│   ├── types.ts                  # 类型定义
│   └── utils/                    # 工具模块
│       └── firecrawl.ts          # Firecrawl 集成
│
├── config/                       # 配置文件
│   ├── urls-group.json           # 综合指南 URL 列表
│   └── urls-tutorial.json        # 教程 URL 列表
│
└── data/                         # 输出目录
    ├── group-*.md               # 综合指南文档
    └── tutorial-*.md            # 教程文档
```

---

## 🚀 快速开始

### 1. 安装依赖

```bash
cd knowledge
npm install
```

### 2. 配置环境变量

```bash
# 创建环境变量文件
cp .env.example .env.local
```

编辑 `.env.local`：

```bash
# Firecrawl API
FIRECRAWL_API_KEY=your-firecrawl-key
```

### 3. 生成 URL 列表

使用 Firecrawl crawl 模式自动发现所有文档链接：

```bash
# 爬取综合指南 URL
npm run crawl -- --type=group

# 爬取教程 URL
npm run crawl -- --type=tutorial

# 爬取所有 URL（默认）
npm run crawl
```

这会自动爬取首页，提取所有文档链接，生成 `config/urls-*.json` 文件。

### 4. 执行爬取

```bash
# 完整爬取（默认并发度=2）
npm run scrape

# 测试模式（只处理前 5 个文档）
npm run scrape -- --test

# 指定测试数量
npm run scrape -- --test --limit=10

# 自定义并发度（并发度=3）
npm run scrape -- --concurrency=3

# 测试模式 + 并发控制
npm run scrape -- --test --concurrency=4

# 强制重新爬取
npm run scrape -- --force
```

---

## 🚀 并发控制

支持可配置的并发爬取，默认并发度为2，可在保证稳定性的同时提升处理速度。

### 并发控制特性

- ✅ **可配置并发度** - 支持 `--concurrency` 参数调节并发数量
- ✅ **默认安全值** - 默认并发度=2，平衡速度和稳定性
- ✅ **分批处理** - 按批次执行并发，控制资源使用
- ✅ **错误容错** - 单个任务失败不影响其他任务
- ✅ **限流保护** - 批次间自动延迟，避免API限流

### 使用方法

```bash
# 默认并发度=2
npm run scrape

# 低并发度（稳定优先）
npm run scrape -- --concurrency=1

# 高并发度（速度优先）
npm run scrape -- --concurrency=4

# 测试模式 + 高并发
npm run scrape -- --test --concurrency=3

# 完整爬取 + 自定义并发
npm run scrape -- --concurrency=5
```

### 并发度建议

| 并发度 | 适用场景 | 优势 | 注意事项 |
|--------|----------|------|----------|
| **1** | 生产环境、网络不稳定 | 稳定性最佳 | 处理速度较慢 |
| **2** | 默认设置、通用场景 | 平衡速度和稳定性 | 推荐日常使用 |
| **3** | 稳定网络、测试环境 | 速度提升明显 | 需监控API限流 |
| **4-5** | 高性能环境、开发测试 | 处理速度最快 | 可能触发限流 |

---

## 🧪 测试模式

为了避免在开发和测试阶段消耗大量 API 额度，提供了测试模式：

### 测试模式特性

- ✅ **限制数量** - 只处理指定数量的 URL（默认 5 个）
- ✅ **完整流程** - 执行完整的爬取→markdown生成流程
- ✅ **快速验证** - 快速验证配置和功能是否正常
- ✅ **成本控制** - 避免大量 API 调用产生不必要的费用
- ✅ **并发适配** - 测试模式下同样支持并发控制

### 使用方法

```bash
# 测试前 5 个文档（默认并发度=2）
npm run scrape -- --test

# 测试前 10 个文档，指定并发度
npm run scrape -- --test --limit=10 --concurrency=3

# 测试特定范围
npm run scrape -- --test --limit=20
```

### 测试建议

1. **首次运行**: 使用 `--test --limit=1` 测试单个文档
2. **配置验证**: 使用 `--test --limit=5 --concurrency=1` 验证完整流程
3. **性能评估**: 使用 `--test --limit=20 --concurrency=3` 评估处理速度
4. **正式爬取**: 确认无误后，运行完整爬取

---

## 📊 预期结果

### 数据规模

| 指标 | 预估值 |
|------|-------|
| URL 总数 | ~287 个 |
| 平均文档长度 | 2000-5000 字符 |
| 总文件数 | ~287 个 |
| 存储空间 | ~5-10 MB |

### 处理时间

| 模式 | 数量 | 预计时间 |
|-----|------|---------|
| 测试模式 | 5 个 | ~15-30 秒 |
| 测试模式 | 20 个 | ~1-2 分钟 |
| 完整爬取 | 287 个 | ~8-15 分钟 |

---

## 🔧 核心模块说明

### 1. URL 爬取器 (`crawl.ts`)

**功能**: 使用 Firecrawl crawl 模式自动提取所有文档链接

**命令**:
```bash
npm run crawl           # 爬取所有
npm run crawl -- --type=group    # 只爬取指南
npm run crawl -- --type=tutorial # 只爬取教程
```

**源页面**:
- 综合指南: https://act.mihoyo.com/ys/ugc/tutorial/detail/mh29wpicgvh0
- 教程: https://act.mihoyo.com/ys/ugc/tutorial/course/detail/mhhw2l08o6qo

### 2. 爬虫脚本 (`scrape.ts`)

**功能**: 批量爬取文档，生成 markdown 文件，支持并发控制

**参数**:
- `--test` - 启用测试模式
- `--limit=<n>` - 测试模式下的处理数量（默认: 5）
- `--concurrency=<n>` - 并发度设置（默认: 2）
- `--force` - 强制重新爬取已存在的文档

**示例**:
```bash
# 基础使用
npm run scrape

# 测试模式
npm run scrape -- --test --limit=10

# 并发控制
npm run scrape -- --concurrency=3

# 组合使用
npm run scrape -- --test --limit=5 --concurrency=2

# 强制重新爬取
npm run scrape -- --force
```

### 3. Firecrawl 集成 (`utils/firecrawl.ts`)

**功能**: 
- `scrape` 模式 - 爬取单个页面
- `crawl` 模式 - 自动发现并爬取所有链接

### 4. 生成的 Markdown 格式

```markdown
---
id: doc-xxx
title: 文档标题
url: https://...
sourceURL: https://...
description: 描述
language: zh
scope: tutorial
crawledAt: 2025-10-28T...
---

# 文档内容...
```

---

## 💡 最佳实践

### 开发流程

1. **首次测试**
   ```bash
   npm run crawl -- --type=group
   npm run scrape -- --test --limit=1
   ```

2. **配置调整**
   - 检查生成的 markdown 质量
   - 验证文档内容完整性

3. **小批量测试**
   ```bash
   npm run scrape -- --test --limit=10
   ```

4. **完整爬取**
   ```bash
   npm run scrape
   ```

### 性能优化

- **并发控制**: 使用 `--concurrency` 参数调节并发度，平衡速度和稳定性
- **分批处理**: 按批次执行并发，避免资源过载
- **进度保存**: 已爬取的文档会自动跳过
- **错误处理**: 失败请求会记录日志并继续处理
- **限流保护**: 批次间自动延迟，避免API限流

### 成本控制

- **使用测试模式**: 开发阶段使用 `--test` 模式
- **增量更新**: 使用默认模式自动跳过已爬取文档
- **按需爬取**: 可以只爬取特定类型的文档

---

## 🔍 故障排除

### 问题 1: Firecrawl API 超时

**解决方案**:
```bash
# 检查 API Key
echo $FIRECRAWL_API_KEY

# 重试失败的任务
npm run scrape -- --force
```

### 问题 2: 测试模式不生效

**确认命令**:
```bash
# 正确的命令格式
npm run scrape -- --test --limit=5

# 查看日志确认
# 应该显示: "测试模式: 是 (限制: 5)"
```

### 问题 3: 生成的文件质量问题

**检查方法**:
```bash
# 查看生成的 markdown 文件
cat data/tutorial-xxx.md

# 检查文件内容是否完整
grep -A 10 "^---$" data/tutorial-xxx.md
```

---

## 📚 相关文档

- [项目实现计划](../specs/001-doc-qa/IMPL_PLAN.md)
- [数据模型设计](../specs/001-doc-qa/data-model.md)
- [技术研究文档](../specs/001-doc-qa/research.md)
- [快速开始指南](../specs/001-doc-qa/quickstart.md)

---

## 🎯 技术栈

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| **爬虫** | Firecrawl API | scrape + crawl 模式 |
| **文档格式** | Markdown + YAML | 本地文件系统 |
| **运行时** | Node.js 18+ | TypeScript |

---

**版本**: 3.1.0
**最后更新**: 2025-10-29
**维护者**: Miliastra-toolbox Team

## 🆕 更新日志

### v3.1.0 (2025-10-29)
- ✨ **新增并发控制**: 支持 `--concurrency` 参数，调节爬取并发度
- 🔧 **性能优化**: 默认并发度=2，平衡速度和稳定性
- 📖 **文档更新**: 更新使用说明和最佳实践指南
- 🛡️ **稳定性增强**: 分批处理和限流保护机制