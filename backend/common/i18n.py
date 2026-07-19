"""多语言（i18n）公共工具。

规范语言码与术语表列名一致（见 translate/service.py 的 COLUMNS）。
chs 为默认基准语言，零注入、零回归；其余语言在 prompt 末尾追加多语言回答指令。
"""

DEFAULT_ANSWER_LANGUAGE = "chs"

LANGUAGE_NAMES: dict[str, str] = {
    "chs": "简体中文",
    "cht": "繁體中文",
    "de": "Deutsch",
    "en": "English",
    "es": "Español",
    "fr": "Français",
    "id": "Bahasa Indonesia",
    "it": "Italiano",
    "jp": "日本語",
    "kr": "한국어",
    "pt": "Português",
    "ru": "Русский",
    "th": "ไทย",
    "tr": "Türkçe",
    "vi": "Tiếng Việt",
}

# 合法语言码集合，用于校验请求中的 answer_language。
VALID_ANSWER_LANGUAGES: frozenset[str] = frozenset(LANGUAGE_NAMES.keys())

# 常见 ISO 别名 -> 术语表列名
_ALIAS_MAP: dict[str, str] = {
    "zh-cn": "chs",
    "zh-tw": "cht",
    "zh": "chs",
    "ja": "jp",
    "ko": "kr",
}


def normalize_answer_language(lang: str | None) -> str:
    """归一化 answer_language：非法或缺失时回落 chs。"""
    if not lang:
        return DEFAULT_ANSWER_LANGUAGE
    normalized = lang.strip().lower()
    normalized = _ALIAS_MAP.get(normalized, normalized)
    return normalized if normalized in VALID_ANSWER_LANGUAGES else DEFAULT_ANSWER_LANGUAGE


def build_non_chinese_instruction(answer_language: str) -> str:
    """非中文时返回多语言回答指令；chs 返回空串。

    该指令同时约束：
      1. 工具调用时把非中文术语映射为中文术语
      2. 最终回答用目标语言生成
      3. 术语可用 translate_terms 确认（仅 Agent 链路有此工具）
    """
    lang = normalize_answer_language(answer_language)
    if lang == DEFAULT_ANSWER_LANGUAGE:
        return ""
    lang_name = LANGUAGE_NAMES[lang]
    return (
        f"\n## 多语言回答规则（目标语言：{lang_name}）\n"
        "- 用户输入可能是任意语言，按原文语义理解，不要先把原文翻译成中文再处理。\n"
        "- 调用 get_node_info / get_document / search_knowledge / list_documents 时，"
        "把用户问题中的非中文术语映射为对应中文术语再传入"
        "（如 \"buff\"/\"バフ\" -> \"单位状态\"）。"
        "映射不确定时，可调用 translate_terms 用任意语言术语反查中文与其他语言译法。\n"
        f"- 完成工具查询后，用「{lang_name}」生成最终回答。"
        "涉及专有术语时优先调用 translate_terms 确认官方译法；"
        "查不到的术语自行翻译并保持全篇一致。\n"
        "- 图表（generate_diagram）内文本仍使用中文、英文、数字（与 SVG 规范一致）；"
        "引用来源标题保持中文原文，不翻译。\n"
    )


def build_rag_non_chinese_instruction(answer_language: str) -> str:
    """RAG 模式回答阶段（context_prompt）的非中文指令：约束最终回答语言。

    RAG 无工具调用，仅约束输出语言与术语一致性。
    """
    lang = normalize_answer_language(answer_language)
    if lang == DEFAULT_ANSWER_LANGUAGE:
        return ""
    lang_name = LANGUAGE_NAMES[lang]
    return (
        f"\n## 多语言回答规则（目标语言：{lang_name}）\n"
        f"- 用「{lang_name}」生成最终回答，术语翻译保持全篇一致。\n"
        "- 引用来源标题保持中文原文，不翻译。\n"
    )


def build_rag_retrieval_instruction(answer_language: str) -> str:
    """RAG 模式检索阶段（query_extraction）的非中文指令：约束检索词中文化。

    知识库为中文，非中文输入需先映射为中文术语以保证召回率。
    """
    lang = normalize_answer_language(answer_language)
    if lang == DEFAULT_ANSWER_LANGUAGE:
        return ""
    return (
        "\n## 检索词语言规则\n"
        "- 用户输入可能是任意语言。生成的检索词必须是中文术语，"
        "把非中文术语映射为对应中文（如 \"buff\"/\"バフ\" -> \"单位状态\"），"
        "以确保中文知识库的召回率。\n"
    )
