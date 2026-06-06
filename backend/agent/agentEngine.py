"""AgentEngine - 基于 LlamaIndex FunctionAgent，复用 MCP 工具函数"""
import sys
import os
import asyncio
import json
from pathlib import Path
from functools import lru_cache
from typing import List, Dict, Any, cast
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

from common.llm_config import resolve_llm_config
from agent.prompt import DEFAULT_SYSTEM_PROMPT, NON_STREAM_OUTPUT_INSTRUCTION
from skill.service import get_document_json, get_node_info_json, list_documents_json, rag_search_json
from agent.diagram import generate_diagram, diagram_store

TOOLBOX_DIR = Path(__file__).resolve().parent.parent.parent


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


def _iter_search_results(data: Any) -> list[dict[str, Any]]:
    """统一展开 search_knowledge 的返回结构。"""
    if isinstance(data, list):
        results: list[dict[str, Any]] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            raw_results = item.get("results", [])
            if not isinstance(raw_results, list):
                continue
            results.extend(cast(list[dict[str, Any]], [result for result in raw_results if isinstance(result, dict)]))
        return results
    if isinstance(data, dict):
        raw_results = data.get("results", [])
        if isinstance(raw_results, list):
            return cast(list[dict[str, Any]], [result for result in raw_results if isinstance(result, dict)])
    return []


def _iter_document_entries(data: Any) -> list[dict[str, Any]]:
    """统一展开 get_document 和 list_documents 的文档条目。"""
    if isinstance(data, list):
        documents: list[dict[str, Any]] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            raw_documents = item.get("documents", [])
            if not isinstance(raw_documents, list):
                continue
            documents.extend(cast(list[dict[str, Any]], [doc for doc in raw_documents if isinstance(doc, dict)]))
        return documents
    if isinstance(data, dict):
        raw_documents = data.get("documents", [])
        if isinstance(raw_documents, list):
            return cast(list[dict[str, Any]], [doc for doc in raw_documents if isinstance(doc, dict)])
    return []


# ── 构建文档列表（用于 System Prompt）───────────────
@lru_cache(maxsize=1)
def _build_doc_list_text() -> str:
    result = json.loads(list_documents_json())
    return ", ".join(d["title"] for d in result.get("documents", []))


@lru_cache(maxsize=2)
def _build_default_system_prompt(plain_text_output: bool = False) -> str:
    """用默认模板 + 文档列表构建 system prompt（缓存）"""
    prompt = DEFAULT_SYSTEM_PROMPT.format(
        doc_list=_build_doc_list_text(),
    )
    if plain_text_output:
        prompt += NON_STREAM_OUTPUT_INSTRUCTION
    return prompt


# ── 工具注册 ────────────────────────────────────────────────
AGENT_TOOLS = [
    FunctionTool.from_defaults(fn=get_node_info_json, name="get_node_info",
        description="根据节点名称查询节点说明。支持模糊匹配、批量查询。输入 names: list[str]。"),
    FunctionTool.from_defaults(fn=list_documents_json, name="list_documents",
        description="列出知识库文档标题和路径。输入 keywords: list[str]，为空时返回全部文档。"),
    FunctionTool.from_defaults(fn=get_document_json, name="get_document",
        description="根据文档标题获取完整内容。支持模糊匹配。输入 titles: list[str]。"),
    FunctionTool.from_defaults(fn=rag_search_json, name="search_knowledge",
        description="向量检索知识库。输入 queries: list[str], top_k: int=5。"),
    FunctionTool.from_defaults(fn=generate_diagram, name="generate_diagram",
        description=(
            "当回答涉及节点连接关系、执行流程、实体层级或逻辑结构时，生成 SVG 图表并转为 PNG 供用户查看。"
            "输入 svg_content: str（完整 SVG XML），title: str（图表标题，选填）。"
            "图表文本只允许使用中文、英文、数字和基础标点；不要使用 emoji或其他装饰性 Unicode 字符。"
            "调用成功后，必须将返回 JSON 中的 markdown 字段内容原样嵌入回答正文。"
        )),
]

# ── AgentEngine ─────────────────────────────────────────────
AGENT_MAX_ITERATIONS = int(os.getenv("AGENT_MAX_ITERATIONS", "10"))
AGENT_TIMEOUT = float(os.getenv("AGENT_TIMEOUT", "300"))


def _mask_tool_args(tool_name: str, kwargs: dict[str, Any]) -> dict[str, Any]:
    """过滤工具参数中的冗长内容，避免 SVG 源码出现在 trace/SSE 中。"""
    if tool_name == "generate_diagram" and "svg_content" in kwargs:
        svg = kwargs["svg_content"]
        length = len(svg) if isinstance(svg, str) else 0
        return {**kwargs, "svg_content": f"<SVG {length} chars>"}
    return kwargs


class AgentEngine:
    """基于 LlamaIndex FunctionAgent 的对话引擎。

    迭代上限兜底策略（AGENT_MAX_ITERATIONS）:
    当工具调用轮次达到上限时，不直接报错，而是将之前所有工具调用
    结果摘要（tool_trace）+ 已生成的部分回答一并交给同一模型，以
    is_function_calling_model=False 禁用工具，生成最终答复。
    """

    @staticmethod
    def _is_max_iter_error(err: Exception) -> bool:
        return "max iterations" in str(err).lower()

    async def _fallback_answer(
        self,
        config: Dict[str, Any],
        message: str,
        conversation: List[Dict[str, str]],
        tool_trace: list[dict[str, str | dict[str, str] | list[dict[str, str]]]],
        partial_answer: str,
    ) -> dict[str, Any]:
        """迭代上限兜底：禁用工具，将已有 tool_trace 作为上下文生成最终回答，并返回整理后的 sources。"""
        rc = resolve_llm_config(config)
        llm = OpenAILike(
            api_key=str(rc["api_key"]), api_base=str(rc["api_base_url"]),
            model=str(rc["model"]), is_chat_model=True,
            is_function_calling_model=False,
        )

        ctx_len = int(config.get("context_length", 3))
        limited = [] if ctx_len == 0 else conversation[-(ctx_len * 2):]
        history = [ChatMessage(role=MessageRole(m["role"]), content=m["content"]) for m in limited]

        tool_ctx = "\n".join(
            f"{i}. {t.get('tool','')} [{t.get('status','')}]: {t.get('summary','')}"
            for i, t in enumerate(tool_trace, 1)
        ) or "（无）"

        # 从 tool_trace 聚合 sources
        fallback_sources: list[dict[str, str]] = []
        seen_urls: set[str] = set()
        for t in tool_trace:
            for s in t.get("sources", []):
                url = s.get("url", "")
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    fallback_sources.append({"title": s.get("title", ""), "url": url})

        system = (
            "你是千星沙箱知识助手。当前处于最终收敛阶段，禁止调用任何工具。"
            "基于已有工具结果摘要和对话上下文直接作答。"
            "不要输出思考过程或过程话术，直接给最终答案；信息不足时明确说明。"
        )
        user_msg = (
            f"用户问题:\n{message}\n\n"
            f"已收集的工具结果:\n{tool_ctx}\n\n"
            f"已输出的片段:\n{partial_answer or '（无）'}\n\n"
            "请基于以上信息直接产出最终答复。"
        )

        try:
            resp = await llm.achat([
                ChatMessage(role=MessageRole.SYSTEM, content=system),
                *history,
                ChatMessage(role=MessageRole.USER, content=user_msg),
            ])
            return {
                "answer": (resp.message.content or "").strip(),
                "sources": fallback_sources,
            }
        except Exception as e:
            print(f"[AgentEngine] 兜底回答失败: {e}")
            return {
                "answer": partial_answer.strip() or "已达工具调用上限，当前信息不足以给出完整结论。",
                "sources": fallback_sources,
            }

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
                docs = _iter_document_entries(data)
                if isinstance(data, dict):
                    total = int(data.get("total", len(docs)))
                elif isinstance(data, list):
                    total = sum(int(item.get("total", 0)) for item in data if isinstance(item, dict))
                else:
                    total = len(docs)
                titles = [str(d.get("title", "")) for d in docs[:5] if d.get("title")]
                summary = f"共 {total} 篇文档"
                if titles:
                    summary += f": {', '.join(titles)}"
                    if total > 5:
                        summary += " 等"
                seen_urls: set[str] = set()
                for doc in docs:
                    file_path = str(doc.get("file", ""))
                    if not file_path:
                        continue
                    url = _resolve_url(file_path)
                    title = str(doc.get("title", file_path))
                    if url and url not in seen_urls:
                        seen_urls.add(url)
                        sources.append({"title": title, "url": url})

            elif ev.tool_name == "get_document":
                if isinstance(data, list):
                    doc_titles: list[str] = []
                    seen_urls: set[str] = set()
                    for d in _iter_document_entries(data):
                        t = str(d.get("title", ""))
                        doc_titles.append(t)
                        file_path = str(d.get("file", ""))
                        url = _resolve_url(file_path)
                        if url and url not in seen_urls:
                            seen_urls.add(url)
                            sources.append({"title": t, "url": url})
                    if doc_titles:
                        summary = f"获取到: {', '.join(doc_titles)}"
                    else:
                        messages = [str(d.get("message", "")) for d in data if isinstance(d, dict) and d.get("message")]
                        summary = "; ".join(messages)
                elif isinstance(data, dict):
                    summary = data.get("message", "")

            elif ev.tool_name == "search_knowledge":
                results = _iter_search_results(data)
                if results:
                    items = [f"「{r.get('title', '')}」({round(float(r.get('similarity', 0)) * 100)}%)" for r in results[:5]]
                    summary = f"检索到 {len(results)} 条: " + ", ".join(items)
                    seen_urls: set[str] = set()
                    for r in results:
                        fn = str(r.get("file_name", ""))
                        if not fn:
                            continue
                        url = _resolve_url(fn)
                        title = str(r.get("title", fn))
                        if url and url not in seen_urls:
                            seen_urls.add(url)
                            sources.append({"title": title, "url": url})
                else:
                    summary = "未检索到相关内容"

            elif ev.tool_name == "generate_diagram":
                if isinstance(data, dict) and "diagram_id" in data:
                    title = str(data.get("title", "图表"))
                    png_url = str(data.get("png_url", ""))
                    summary = f"已生成图表「{title}」"
                    if png_url:
                        sources.append({"title": title, "url": png_url})
                elif isinstance(data, dict) and "error" in data:
                    summary = f"图表生成失败: {data['error']}"

        except (json.JSONDecodeError, TypeError, AttributeError):
            pass

        if not summary:
            summary = (str(raw)[:200] + "...") if isinstance(raw, str) and len(raw) > 200 else str(raw)[:200]

        result: dict[str, str | dict[str, str] | list[dict[str, str]]] = {
            "tool": ev.tool_name, "args": _mask_tool_args(ev.tool_name, ev.tool_kwargs),
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
            results = _iter_search_results(data)
            return [
                {
                    "title": str(r.get("title", "")),
                    "doc_id": str(r.get("file_name", "")),
                    "similarity": float(r.get("similarity", 0.0)),
                    "text_snippet": str(r.get("text_snippet", "")),
                    "url": _resolve_url(str(r.get("file_name", ""))),
                }
                for r in results
            ]
        except (json.JSONDecodeError, AttributeError):
            return []

    async def chat(self, message: str, conversation: List[Dict[str, str]],
                   config: Dict[str, Any]) -> Dict[str, Any]:
        agent, chat_history = self._run_agent(config, conversation, plain_text_output=True)
        tool_trace, sources = [], []
        tool_calls_count = retrieval_calls_count = 0
        last_response = ""

        try:
            handler = agent.run(user_msg=message, chat_history=chat_history,
                                max_iterations=AGENT_MAX_ITERATIONS)
            async for ev in handler.stream_events():
                if isinstance(ev, ToolCallResult):
                    tool_calls_count += 1
                    if ev.tool_name == "search_knowledge":
                        retrieval_calls_count += 1
                    tool_trace.append(self._extract_trace(ev))
                    sources.extend(self._extract_sources(ev))
                elif isinstance(ev, AgentStream) and ev.delta:
                    last_response += ev.delta

            result = await handler
            diagrams = _collect_diagrams(tool_trace)
            return {"answer": result.response.content or "", "sources": sources,
                    "stats": {"tokens": 0, "tool_calls": tool_calls_count, "retrieval_calls": retrieval_calls_count},
                    "tool_trace": tool_trace, "diagrams": diagrams}
        except Exception as e:
            if self._is_max_iter_error(e):  # 迭代上限兜底：携带 tool_trace 生成最终回答
                print("[AgentEngine] 达到迭代上限，携带工具结果兜底作答")
                fallback = await self._fallback_answer(
                    config, message, conversation, tool_trace, last_response)
                return {"answer": fallback["answer"], "sources": fallback["sources"],
                        "stats": {"tokens": 0, "tool_calls": tool_calls_count,
                                   "retrieval_calls": retrieval_calls_count},
                        "tool_trace": tool_trace}
            raise

    async def chat_stream(self, message: str, conversation: List[Dict[str, str]],
                          config: Dict[str, Any]):
        agent, chat_history = self._run_agent(config, conversation, plain_text_output=False)
        yield ": connected\n\n"

        tool_calls_count = retrieval_calls_count = 0
        tool_trace: list[dict[str, str | dict[str, str] | list[dict[str, str]]]] = []
        partial_answer = ""
        sources: list[dict[str, str | float]] = []
        try:
            handler = agent.run(user_msg=message, chat_history=chat_history,
                                max_iterations=AGENT_MAX_ITERATIONS)
            async for ev in handler.stream_events():
                if isinstance(ev, ToolCall):
                    yield f"data: {json.dumps({'type': 'tool_call', 'data': {'tool': ev.tool_name, 'args': _mask_tool_args(ev.tool_name, ev.tool_kwargs)}}, ensure_ascii=False)}\n\n"
                elif isinstance(ev, ToolCallResult):
                    tool_calls_count += 1
                    if ev.tool_name == "search_knowledge":
                        retrieval_calls_count += 1
                    trace = self._extract_trace(ev)
                    tool_trace.append(trace)
                    yield f"data: {json.dumps({'type': 'tool_result', 'data': trace}, ensure_ascii=False)}\n\n"
                    sources.extend(self._extract_sources(ev))
                elif isinstance(ev, AgentStream) and ev.delta:
                    partial_answer += ev.delta
                    yield f"data: {json.dumps({'type': 'token', 'data': ev.delta}, ensure_ascii=False)}\n\n"

            if sources:
                yield f"data: {json.dumps({'type': 'sources', 'data': sources}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'data': {'stats': {'tokens': 0, 'tool_calls': tool_calls_count, 'retrieval_calls': retrieval_calls_count}}}, ensure_ascii=False)}\n\n"
        except Exception as e:
            if self._is_max_iter_error(e):  # 迭代上限兜底：携带 tool_trace 生成最终回答
                print("[AgentEngine] 流式迭代上限，携带工具结果兜底作答")
                fallback = await self._fallback_answer(
                    config, message, conversation, tool_trace, partial_answer)
                answer = fallback["answer"]
                fallback_sources = fallback["sources"]
                if answer:
                    payload = json.dumps({'type': 'token', 'data': '\n\n' + answer}, ensure_ascii=False)
                    yield f"data: {payload}\n\n"
                if fallback_sources:
                    yield f"data: {json.dumps({'type': 'sources', 'data': fallback_sources}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'data': {'stats': {'tokens': 0, 'tool_calls': tool_calls_count, 'retrieval_calls': retrieval_calls_count}}}, ensure_ascii=False)}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'error', 'data': str(e)}, ensure_ascii=False)}\n\n"


def _collect_diagrams(tool_trace: list[dict]) -> list[dict[str, str]]:
    """从 tool_trace 中收集 generate_diagram 的结果，附加 png_data_uri。"""
    import base64
    diagrams: list[dict[str, str]] = []
    for t in tool_trace:
        if t.get("tool") != "generate_diagram" or t.get("status") != "success":
            continue
        for src in t.get("sources", []):
            url = src.get("url", "")
            if not url.startswith("/api/v1/agent/diagram/"):
                continue
            diagram_id = url.rsplit("/", 1)[-1]
            entry = diagram_store.get(diagram_id)
            if entry is None:
                continue
            png_bytes, title = entry
            b64_str = base64.b64encode(png_bytes).decode("ascii")
            diagrams.append({
                "diagram_id": diagram_id,
                "title": title,
                "png_data_uri": f"data:image/png;base64,{b64_str}",
            })
    return diagrams
