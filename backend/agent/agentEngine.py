"""AgentEngine - 基于 LlamaIndex FunctionAgent，复用 MCP 工具函数"""
import sys
import os
import json
import importlib.util
from pathlib import Path
from functools import lru_cache
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from collections import defaultdict

from dotenv import load_dotenv

load_dotenv()
_rag_v1_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "knowledge", "rag_v1", ".env"))
if os.path.exists(_rag_v1_env):
    load_dotenv(_rag_v1_env, override=True)

for p in [os.path.abspath(os.path.join(os.path.dirname(__file__), "..")),
          os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "knowledge", "rag_v1"))]:
    if p not in sys.path:
        sys.path.insert(0, p)

from llama_index.core.agent import FunctionAgent
from llama_index.core.tools import FunctionTool
from llama_index.core.llms import ChatMessage, MessageRole
from llama_index.llms.openai_like import OpenAILike
from llama_index.core.agent.workflow.workflow_events import AgentStream, ToolCall, ToolCallResult

from common.pg_client import model_usage_manager
from agent.prompt import DEFAULT_SYSTEM_PROMPT, NON_STREAM_OUTPUT_INSTRUCTION

# ── 从 MCP Server 导入工具函数 ──────────────────────────────
TOOLBOX_DIR = Path(__file__).resolve().parent.parent.parent
_mcp_path = str(TOOLBOX_DIR / "mcp" / "mcp_server.py")
_spec = importlib.util.spec_from_file_location("_mcp_srv", _mcp_path, submodule_search_locations=[])
_mcp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mcp)

# 直接复用 MCP 的 4 个工具函数（均返回 JSON 字符串）
_mcp_get_node_info = _mcp.get_node_info
_mcp_list_documents = _mcp.list_documents
_mcp_get_document = _mcp.get_document
_mcp_rag_search = _mcp.rag_search


# ── 官方文档 URL 映射（local_path → url）────────────────────
@lru_cache(maxsize=1)
def _build_url_map() -> tuple[dict[str, str], dict[str, str]]:
    """从 knowledge/config/urls-*.json 构建 URL 映射。
    返回 (local_path → url, filename → url) 两个映射。
    """
    config_dir = TOOLBOX_DIR / "knowledge" / "config"
    path_map: dict[str, str] = {}
    name_map: dict[str, str] = {}
    for json_file in config_dir.glob("urls-*.json"):
        try:
            data = json.loads(json_file.read_text(encoding="utf-8"))
            for entry in data.get("entries", []):
                local_path = entry.get("localPath", "")
                url = entry.get("url", "")
                if local_path and url:
                    # localPath 格式: Miliastra-knowledge/official/guide/xxx.md
                    # index local_path 格式: official/guide/xxx.md
                    normalized = local_path.removeprefix("Miliastra-knowledge/")
                    path_map[normalized] = url
                    # filename 格式: mh277t9fl4tm_执行节点.md (用于 search_knowledge 结果)
                    name_map[Path(local_path).name] = url
        except (json.JSONDecodeError, OSError):
            continue
    return path_map, name_map


def _resolve_url(local_path: str) -> str:
    """根据 local_path 或 filename 查找官方文档 URL"""
    path_map, name_map = _build_url_map()
    # 先尝试完整路径匹配
    url = path_map.get(local_path, "")
    if not url:
        # 再尝试纯文件名匹配
        filename = Path(local_path).name
        url = name_map.get(filename, "")
    return url


# ── 构建节点列表与文档列表（用于 System Prompt）───────────────
@lru_cache(maxsize=1)
def _build_node_list_text() -> str:
    entries = _mcp._load_index()
    groups: dict[str, set[str]] = defaultdict(set)
    for e in entries:
        if "node/" in e.get("output_file", ""):
            groups[e["source_doc_title"]].add(e["title"])
    lines = []
    for name in ["事件节点", "执行节点", "查询节点", "流程控制节点", "运算节点", "其它节点"]:
        nodes = sorted(groups.get(name, set()))
        if nodes:
            lines.append(f"- {name}({len(nodes)}个): {', '.join(nodes)}")
    return "\n".join(lines)


@lru_cache(maxsize=1)
def _build_doc_list_text() -> str:
    result = json.loads(_mcp_list_documents())
    return ", ".join(d["title"] for d in result.get("documents", []))


@lru_cache(maxsize=2)
def _build_default_system_prompt(plain_text_output: bool = False) -> str:
    """用默认模板 + 节点/文档列表构建 system prompt（缓存）"""
    prompt = DEFAULT_SYSTEM_PROMPT.format(
        node_list=_build_node_list_text(),
        doc_list=_build_doc_list_text(),
    )
    if plain_text_output:
        prompt += NON_STREAM_OUTPUT_INSTRUCTION
    return prompt


# ── 工具注册 ────────────────────────────────────────────────
AGENT_TOOLS = [
    FunctionTool.from_defaults(fn=_mcp_get_node_info, name="get_node_info",
        description="根据节点名称查询节点说明。支持模糊匹配、批量查询。输入 names: list[str]。"),
    FunctionTool.from_defaults(fn=_mcp_list_documents, name="list_documents",
        description="列出知识库文档标题和路径。可选 keyword 过滤。"),
    FunctionTool.from_defaults(fn=_mcp_get_document, name="get_document",
        description="根据文档标题获取完整内容。支持模糊匹配。输入 title: str。"),
    FunctionTool.from_defaults(fn=_mcp_rag_search, name="search_knowledge",
        description="向量检索知识库。输入 query: str, top_k: int=5。"),
]

# ── 渠道配置表 ──────────────────────────────────────────────
_CHANNEL_ENV = {
    2: ("DEFAULT_FREE_MODEL_KEY2", "DEFAULT_FREE_MODEL_URL2", "DEFAULT_FREE_MODEL_NAME2"),
    3: ("DEFAULT_FREE_MODEL_KEY2", "DEFAULT_FREE_MODEL_URL2", "DEFAULT_FREE_MODEL_NAME3"),
    4: ("DEFAULT_FREE_MODEL_KEY2", "DEFAULT_FREE_MODEL_URL2", "DEFAULT_FREE_MODEL_NAME4"),
    5: ("DEFAULT_FREE_MODEL_KEY2", "DEFAULT_FREE_MODEL_URL2", "DEFAULT_FREE_MODEL_NAME5"),
}


def resolve_llm_config(config: Dict[str, Any]) -> Dict[str, str | int]:
    """解析 LLM 配置，返回 {api_key, api_base_url, model, channel_id}"""
    ch = config.get("use_default_model", 0)

    if ch in (1, 2, 3, 4, 5):
        if ch in (1, 2, 5):
            quota = model_usage_manager.check_and_increment(ch)
            if not quota["allowed"]:
                raise ValueError(f"渠道 {ch} 已达每日限额 {quota['limit']} 次")

        if ch == 1:
            hour = datetime.now(timezone(timedelta(hours=8))).hour
            model_env = "DEFAULT_FREE_MODEL_NAME_PEAK" if 16 <= hour < 24 else "DEFAULT_FREE_MODEL_NAME"
            return {"api_key": os.getenv("DEFAULT_FREE_MODEL_KEY", ""),
                    "api_base_url": os.getenv("DEFAULT_FREE_MODEL_URL", ""),
                    "model": os.getenv(model_env, ""), "channel_id": ch}

        key_env, url_env, model_env = _CHANNEL_ENV[ch]
        return {"api_key": os.getenv(key_env, ""), "api_base_url": os.getenv(url_env, ""),
                "model": os.getenv(model_env, ""), "channel_id": ch}

    if all(config.get(k, "").strip() for k in ("api_key", "api_base_url", "model")):
        return {"api_key": config["api_key"], "api_base_url": config["api_base_url"],
                "model": config["model"], "channel_id": 0}

    raise ValueError("未提供有效的 API 配置")


# ── AgentEngine ─────────────────────────────────────────────
AGENT_MAX_ITERATIONS = int(os.getenv("AGENT_MAX_ITERATIONS", "5"))
AGENT_TIMEOUT = float(os.getenv("AGENT_TIMEOUT", "300"))


class AgentEngine:

    def _run_agent(self, config: Dict[str, Any], conversation: List[Dict[str, str]],
                   plain_text_output: bool = False):
        """创建 LLM + Agent + chat_history"""
        rc = resolve_llm_config(config)
        llm = OpenAILike(api_key=str(rc["api_key"]), api_base=str(rc["api_base_url"]),
                         model=str(rc["model"]), is_chat_model=True,
                         is_function_calling_model=True)
        print(f"[AgentEngine] 模型: {rc['model']}")

        ctx_len = int(config.get("context_length", 3))
        limited = [] if ctx_len == 0 else conversation[-(ctx_len * 2):]
        chat_history = [ChatMessage(role=MessageRole(m["role"]), content=m["content"]) for m in limited]

        agent = FunctionAgent(name="MiliastraAgent",
                      system_prompt=_build_default_system_prompt(plain_text_output=plain_text_output),
                              tools=AGENT_TOOLS, llm=llm, verbose=True,
                              timeout=AGENT_TIMEOUT)
        return agent, chat_history

    @staticmethod
    def _extract_trace(ev: ToolCallResult) -> dict[str, str | dict[str, str] | list[dict[str, str]]]:
        """提取工具调用跟踪信息，返回用户友好的摘要和来源链接"""
        raw = ev.tool_output.raw_output
        status = "error" if ev.tool_output.is_error else "success"

        # 为每种工具生成用户可读的摘要
        summary = ""
        sources: list[dict[str, str]] = []  # [{title, url}]
        try:
            data = json.loads(raw) if isinstance(raw, str) else raw

            if ev.tool_name == "get_node_info":
                if isinstance(data, list):
                    parts: list[str] = []
                    for item in data:
                        matches = item.get("matches", [])
                        query = item.get("query", "")
                        if matches:
                            titles = [m.get("title", "") for m in matches]
                            parts.append(f"「{query}」→ {', '.join(titles)}")
                            for m in matches:
                                url = _resolve_url(m.get("local_path", ""))
                                doc_title = m.get("source_doc_title", m.get("title", ""))
                                if url and not any(s["url"] == url for s in sources):
                                    sources.append({"title": doc_title, "url": url})
                        else:
                            parts.append(f"「{query}」未找到")
                    summary = "; ".join(parts)

            elif ev.tool_name == "list_documents":
                if isinstance(data, dict):
                    total = data.get("total", 0)
                    docs = data.get("documents", [])
                    titles = [d.get("title", "") for d in docs[:5]]
                    summary = f"共 {total} 篇文档"
                    if titles:
                        summary += f": {', '.join(titles)}"
                        if total > 5:
                            summary += " 等"

            elif ev.tool_name == "get_document":
                if isinstance(data, list):
                    doc_titles: list[str] = []
                    for d in data:
                        t = d.get("title", "")
                        doc_titles.append(t)
                        file_path = d.get("file", "")
                        url = _resolve_url(file_path)
                        if url:
                            sources.append({"title": t, "url": url})
                    summary = f"获取到: {', '.join(doc_titles)}"
                elif isinstance(data, dict):
                    summary = data.get("message", "")

            elif ev.tool_name == "search_knowledge":
                if isinstance(data, dict):
                    results = data.get("results", [])
                    if results:
                        items = [f"「{r.get('title', '')}」({round(r.get('similarity', 0) * 100)}%)" for r in results[:5]]
                        summary = f"检索到 {len(results)} 条: " + ", ".join(items)
                        # 映射 file_name 到 URL
                        seen_urls: set[str] = set()
                        for r in results:
                            fn = r.get("file_name", "")
                            if fn:
                                url = _resolve_url(fn)
                                title = r.get("title", fn)
                                if url and url not in seen_urls:
                                    seen_urls.add(url)
                                    sources.append({"title": title, "url": url})
                    else:
                        summary = "未检索到相关内容"

        except (json.JSONDecodeError, TypeError, AttributeError):
            pass

        if not summary:
            summary = (str(raw)[:200] + "...") if isinstance(raw, str) and len(raw) > 200 else str(raw)[:200]

        result: dict[str, str | dict[str, str] | list[dict[str, str]]] = {
            "tool": ev.tool_name, "args": ev.tool_kwargs,
            "status": status, "summary": summary,
        }
        if sources:
            result["sources"] = sources
        return result

    @staticmethod
    def _extract_sources(ev: ToolCallResult) -> list[dict[str, str | float]]:
        if ev.tool_name != "search_knowledge" or ev.tool_output.is_error:
            return []
        try:
            data = json.loads(ev.tool_output.raw_output) if isinstance(ev.tool_output.raw_output, str) else ev.tool_output.raw_output
            return [{"title": r.get("title", ""), "doc_id": r.get("file_name", ""),
                      "similarity": r.get("similarity", 0.0),
                      "text_snippet": r.get("text_snippet", ""), "url": ""} for r in data.get("results", [])]
        except (json.JSONDecodeError, AttributeError):
            return []

    async def chat(self, message: str, conversation: List[Dict[str, str]],
                   config: Dict[str, Any]) -> Dict[str, Any]:
        agent, chat_history = self._run_agent(config, conversation, plain_text_output=True)
        tool_trace, sources = [], []
        tool_calls_count = retrieval_calls_count = 0

        handler = agent.run(user_msg=message, chat_history=chat_history,
                            max_iterations=AGENT_MAX_ITERATIONS)
        async for ev in handler.stream_events():
            if isinstance(ev, ToolCallResult):
                tool_calls_count += 1
                if ev.tool_name == "search_knowledge":
                    retrieval_calls_count += 1
                tool_trace.append(self._extract_trace(ev))
                sources.extend(self._extract_sources(ev))

        result = await handler
        return {"answer": result.response.content or "", "sources": sources,
                "stats": {"tokens": 0, "tool_calls": tool_calls_count, "retrieval_calls": retrieval_calls_count},
                "tool_trace": tool_trace}

    async def chat_stream(self, message: str, conversation: List[Dict[str, str]],
                          config: Dict[str, Any]):
        agent, chat_history = self._run_agent(config, conversation, plain_text_output=False)
        yield ": connected\n\n"

        tool_calls_count = retrieval_calls_count = 0
        sources: list[dict[str, str | float]] = []
        try:
            handler = agent.run(user_msg=message, chat_history=chat_history,
                                max_iterations=AGENT_MAX_ITERATIONS)
            async for ev in handler.stream_events():
                if isinstance(ev, ToolCall):
                    yield f"data: {json.dumps({'type': 'tool_call', 'data': {'tool': ev.tool_name, 'args': ev.tool_kwargs}}, ensure_ascii=False)}\n\n"
                elif isinstance(ev, ToolCallResult):
                    tool_calls_count += 1
                    if ev.tool_name == "search_knowledge":
                        retrieval_calls_count += 1
                    trace = self._extract_trace(ev)
                    yield f"data: {json.dumps({'type': 'tool_result', 'data': trace}, ensure_ascii=False)}\n\n"
                    sources.extend(self._extract_sources(ev))
                elif isinstance(ev, AgentStream) and ev.delta:
                    yield f"data: {json.dumps({'type': 'token', 'data': ev.delta}, ensure_ascii=False)}\n\n"

            if sources:
                yield f"data: {json.dumps({'type': 'sources', 'data': sources}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'data': {'stats': {'tokens': 0, 'tool_calls': tool_calls_count, 'retrieval_calls': retrieval_calls_count}}}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)}, ensure_ascii=False)}\n\n"
