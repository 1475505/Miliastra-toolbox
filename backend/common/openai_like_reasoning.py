"""OpenAI 兼容推理内容（reasoning_content / thinking）支持

背景：升级到 llama-index-llms-openai>=0.7 后，上游返回的 reasoning_content 会被解析成
ThinkingBlock，但 Chat Completions 序列化路径（to_openai_message_dict）会直接丢弃
ThinkingBlock，也不会把 additional_kwargs 中非 tool_calls 的键写回请求。这导致多轮对话
或 Agent 工具循环中，assistant 历史消息缺少 reasoning_content，触发上游 400：

  "The `reasoning_content` in the thinking mode must be passed back to the API."

本模块通过轻量补丁在序列化时把 reasoning_content 写回 assistant 消息，并提供
对话历史构造 / 推理内容提取等辅助函数。补丁在模块导入时自动生效（幂等）。
"""
import logging
from typing import Any, Dict, List, Optional, Sequence

from llama_index.core.llms import ChatMessage, MessageRole, TextBlock

logger = logging.getLogger(__name__)

try:
    from llama_index.core.base.llms.types import ThinkingBlock
except (ImportError, ModuleNotFoundError):  # 老版本 core 无 ThinkingBlock
    ThinkingBlock = None

_patched = False


def apply_reasoning_roundtrip_patch() -> None:
    """将 reasoning_content 回传支持注入 llama-index openai 序列化路径（幂等）。"""
    global _patched
    if _patched:
        return

    import llama_index.llms.openai.utils as openai_utils

    target_name = (
        "to_openai_message_dict"
        if hasattr(openai_utils, "to_openai_message_dict")
        else "message_to_openai_message"
    )
    original = getattr(openai_utils, target_name, None)
    if original is None:
        logger.warning("[openai_like_reasoning] 未找到消息序列化函数，跳过补丁")
        return

    def patched(message: ChatMessage, *args: Any, **kwargs: Any) -> Any:
        result = original(message, *args, **kwargs)
        if not isinstance(result, dict) or result.get("role") != "assistant":
            return result
        if "reasoning_content" in result:
            return result
        reasoning = _extract_reasoning_content(message)
        if reasoning:
            result["reasoning_content"] = reasoning
        return result

    patched.__name__ = original.__name__
    patched.__doc__ = original.__doc__
    setattr(openai_utils, target_name, patched)
    _patch_async_first_chunk_filter()
    _patched = True
    logger.info("[openai_like_reasoning] 已注入 reasoning_content 回传补丁")


def _patch_async_first_chunk_filter() -> None:
    """修复 llama-index-llms-openai 0.7.x 丢弃首个仅含 reasoning_content 分片的问题。

    ``_astream_chat`` 在首分片既无 content 又无 tool_calls 时直接 ``continue``，
    未考虑 thinking 模型首分片只有 reasoning_content 的情况，导致推理首段丢失、
    回传的 reasoning_content 不完整（上游可能校验不一致而报错）。
    通过源码级替换条件并重新应用原装饰器实现；版本变化无法匹配时跳过。
    """
    try:
        import inspect
        import textwrap
        import llama_index.llms.openai.base as openai_base
        from llama_index.llms.openai.utils import get_openai_reasoning_content

        old_cond = "and response.choices[0].delta.tool_calls is None"
        new_cond = (
            "and response.choices[0].delta.tool_calls is None\n"
            "                        and get_openai_reasoning_content(response.choices[0].delta) is None"
        )
        wrapped = openai_base.OpenAI.__dict__.get("_astream_chat")
        if wrapped is None:
            return
        original_fn = getattr(wrapped, "__wrapped__", wrapped)
        source = inspect.getsource(original_fn)
        if old_cond not in source or new_cond in source:
            return
        patched_source = source.replace(old_cond, new_cond, 1)
        namespace = dict(openai_base.__dict__)
        namespace["get_openai_reasoning_content"] = get_openai_reasoning_content
        exec(compile(textwrap.dedent(patched_source), "<patched _astream_chat>", "exec"), namespace)
        setattr(openai_base.OpenAI, "_astream_chat",
                openai_base.llm_retry_decorator(namespace["_astream_chat"]))
        logger.info("[openai_like_reasoning] 已修复首个 reasoning 分片被丢弃问题")
    except Exception as exc:
        logger.warning("[openai_like_reasoning] 首个 reasoning 分片补丁跳过（不影响主功能）: %s", exc)


def _extract_reasoning_content(message: ChatMessage) -> Optional[str]:
    """从 ChatMessage 的 additional_kwargs 或 ThinkingBlock 中提取推理内容。"""
    raw = message.additional_kwargs.get("reasoning_content")
    if isinstance(raw, str) and raw:
        return raw
    if ThinkingBlock is not None:
        for block in message.blocks:
            if isinstance(block, ThinkingBlock) and block.content:
                return block.content
    return None


def to_chat_messages(conversation: Sequence[Dict[str, Any]]) -> List[ChatMessage]:
    """将对话历史（含 reasoning 字段）转换为 ChatMessage 列表。

    assistant 消息的推理内容会放入 additional_kwargs["reasoning_content"]，
    序列化补丁会将其写回请求，满足思考模式模型必须回传 reasoning_content 的要求。
    """
    messages: List[ChatMessage] = []
    for item in conversation:
        role = item.get("role")
        if role not in ("user", "assistant"):
            continue
        content = str(item.get("content", ""))
        additional_kwargs: Dict[str, Any] = {}
        if role == "assistant":
            reasoning = item.get("reasoning") or item.get("reasoning_content")
            if isinstance(reasoning, str) and reasoning:
                additional_kwargs["reasoning_content"] = reasoning
        messages.append(
            ChatMessage(
                role=MessageRole(role),
                blocks=[TextBlock(text=content)],
                additional_kwargs=additional_kwargs,
            )
        )
    return messages


def extract_reasoning(message: Optional[ChatMessage]) -> Optional[str]:
    """从响应 ChatMessage 中提取推理内容（ThinkingBlock / additional_kwargs）。"""
    if message is None:
        return None
    return _extract_reasoning_content(message)


def reasoning_delta_from_chunk(chunk: Any) -> Optional[str]:
    """从流式响应块中提取本次增量推理内容（thinking_delta）。"""
    if chunk is None:
        return None
    additional_kwargs = getattr(chunk, "additional_kwargs", None) or {}
    thinking = additional_kwargs.get("thinking_delta")
    return thinking if isinstance(thinking, str) and thinking else None


apply_reasoning_roundtrip_patch()
