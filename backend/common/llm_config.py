"""公用 LLM 配置解析

提供 resolve_llm_config() 供 chatEngine 和 agentEngine 统一使用。
"""
import os
from typing import Dict, Any

from .pg_client import model_usage_manager

# ── 渠道配置表 ──────────────────────────────────────────────
_CHANNEL_ENV: dict[int, tuple[str, str, str]] = {
    2: ("DEFAULT_FREE_MODEL_KEY2", "DEFAULT_FREE_MODEL_URL2", "DEFAULT_FREE_MODEL_NAME2"),
    3: ("DEFAULT_FREE_MODEL_KEY3", "DEFAULT_FREE_MODEL_URL3", "DEFAULT_FREE_MODEL_NAME3"),
    4: ("DEFAULT_FREE_MODEL_KEY3", "DEFAULT_FREE_MODEL_URL3", "DEFAULT_FREE_MODEL_NAME4"),
    5: ("DEFAULT_FREE_MODEL_KEY2", "DEFAULT_FREE_MODEL_URL2", "DEFAULT_FREE_MODEL_NAME5"),
}


def resolve_llm_config(config: Dict[str, Any]) -> Dict[str, str | int]:
    """解析 LLM 配置，返回 {api_key, api_base_url, model, channel_id}

    所有渠道 1-5 均记录用量（渠道 1/2/5 同时强制每日限额）。
    """
    ch = config.get("use_default_model", 0)

    if ch in (1, 2, 3, 4, 5):
        quota = model_usage_manager.check_and_increment(ch)
        if not quota["allowed"]:
            raise ValueError(
                f"渠道 {ch} 已达每日限额 {quota['limit']} 次，"
                f"当前使用 {quota['usage']} 次，请明天再试或使用其他渠道"
            )
        if quota["limit"] != -1:
            print(f"[LLMConfig] 渠道 {ch} 用量: {quota['usage']}/{quota['limit']}，"
                  f"剩余 {quota['remaining']} 次")

        if ch == 1:
            return {"api_key": os.getenv("DEFAULT_FREE_MODEL_KEY", ""),
                    "api_base_url": os.getenv("DEFAULT_FREE_MODEL_URL", ""),
                    "model": os.getenv("DEFAULT_FREE_MODEL_NAME", ""), "channel_id": ch}

        key_env, url_env, model_env = _CHANNEL_ENV[ch]

        return {"api_key": os.getenv(key_env, ""), "api_base_url": os.getenv(url_env, ""),
                "model": os.getenv(model_env, ""), "channel_id": ch}

    if all(config.get(k, "").strip() for k in ("api_key", "api_base_url", "model")):
        return {"api_key": config["api_key"], "api_base_url": config["api_base_url"],
                "model": config["model"], "channel_id": 0}

    raise ValueError("未提供有效的 API 配置，请完整配置 API Key、Base URL、Model，或启用默认免费模型")
