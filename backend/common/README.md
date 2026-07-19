# common 模块

本目录存放后端多个子模块共享的通用工具，避免业务模块之间互相依赖。

## i18n.py

提供多语言（i18n）相关的公共函数与常量，当前主要用于 Agent 与 RAG 链路的回答语言注入。

### 常量

- `DEFAULT_ANSWER_LANGUAGE = "chs"`：默认回答语言码。
- `LANGUAGE_NAMES: dict[str, str]`：语言码到语言名的映射（用于 prompt 中的可读展示）。
- `VALID_ANSWER_LANGUAGES: frozenset[str]`：合法语言码集合，用于校验请求参数。

### 函数

- `normalize_answer_language(lang: str | None) -> str`
  - 归一化 `answer_language`。支持 ISO 别名（如 `zh-CN` → `chs`、`ja` → `jp`）。
  - 非法或缺失时回落到 `chs`。

- `build_non_chinese_instruction(answer_language: str) -> str`
  - 非中文时返回 Agent system prompt 末尾追加的多语言指令；`chs` 时返回空串。
  - 指令同时约束：工具调用时术语中文化、最终回答目标语言化、可用 `translate_terms` 校准术语。

- `build_rag_non_chinese_instruction(answer_language: str) -> str`
  - RAG 模式（无工具调用）的最终回答语言指令。

- `build_rag_retrieval_instruction(answer_language: str) -> str`
  - RAG 模式检索词生成阶段的指令，要求把非中文术语映射为中文以提高中文知识库召回率。

### 语言码规范

采用术语表列名作为系统语言码：

```text
chs, cht, de, en, es, fr, id, it, jp, kr, pt, ru, th, tr, vi
```

其中 `chs` 为默认基准语言，`jp`/`kr` 分别对应日语/韩语（与 ISO 的 `ja`/`ko` 略有不同，以保持与 `translate.service.COLUMNS` 一致）。
