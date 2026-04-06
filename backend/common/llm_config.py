"""公用 LLM 配置解析 + OpenRouter 渠道可用性检查

提供 resolve_llm_config() 供 chatEngine 和 agentEngine 统一使用。
可用性 loop 由 main.py lifespan 驱动，启动时立即检查，之后每 3 小时重复。
"""
import os
import asyncio
import httpx
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from .pg_client import model_usage_manager

# ── 渠道配置表 ──────────────────────────────────────────────
_CHANNEL_ENV: dict[int, tuple[str, str, str]] = {
    2: ("DEFAULT_FREE_MODEL_KEY2", "DEFAULT_FREE_MODEL_URL2", "DEFAULT_FREE_MODEL_NAME2"),
    3: ("DEFAULT_FREE_MODEL_KEY2", "DEFAULT_FREE_MODEL_URL2", "DEFAULT_FREE_MODEL_NAME3"),
    4: ("DEFAULT_FREE_MODEL_KEY2", "DEFAULT_FREE_MODEL_URL2", "DEFAULT_FREE_MODEL_NAME4"),
    5: ("DEFAULT_FREE_MODEL_KEY2", "DEFAULT_FREE_MODEL_URL2", "DEFAULT_FREE_MODEL_NAME5"),
}

# ── OpenRouter 渠道可用性状态（3、4 固定为 OpenRouter 渠道）────
_OPENROUTER_CHANNELS = (3, 4)
_openrouter_available: dict[int, bool] = {3: True, 4: True}
_OPENROUTER_CHECK_INTERVAL = 3 * 3600  # 3 小时


def _openrouter_model_id(model_name: str) -> str:
    """去掉 :free 等后缀，得到 OpenRouter endpoints 接口所需的 model id"""
    return model_name.split(":")[0] if ":" in model_name else model_name


async def _check_one_openrouter_channel(ch: int) -> bool:
    """向 OpenRouter 查询指定渠道的模型是否有可用 endpoint"""
    _, _, model_env = _CHANNEL_ENV[ch]
    model_name = os.getenv(model_env, "")
    if not model_name:
        return False
    model_id = _openrouter_model_id(model_name)
    api_key = os.getenv("DEFAULT_FREE_MODEL_KEY2", "")
    url = f"https://openrouter.ai/api/v1/models/{model_id}/endpoints"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
        if resp.status_code != 200:
            return False
        endpoints = resp.json().get("data", {}).get("endpoints", [])
        return len(endpoints) > 0
    except Exception as exc:
        print(f"[OpenRouter] 渠道 {ch} 检查异常: {exc}")
        return False


async def check_openrouter_availability() -> None:
    """并发检查渠道 3、4 的可用性并更新全局状态"""
    results = await asyncio.gather(
        _check_one_openrouter_channel(3),
        _check_one_openrouter_channel(4),
    )
    for ch, available in zip(_OPENROUTER_CHANNELS, results):
        _openrouter_available[ch] = available
        model = os.getenv(_CHANNEL_ENV[ch][2], "")
        status = "✓ 可用" if available else "✗ 不可用"
        print(f"[OpenRouter] 渠道 {ch} ({model}): {status}")


async def openrouter_availability_loop() -> None:
    """后台任务：启动时立即检查，之后每 3 小时检查一次"""
    while True:
        await check_openrouter_availability()
        await asyncio.sleep(_OPENROUTER_CHECK_INTERVAL)


def resolve_llm_config(config: Dict[str, Any]) -> Dict[str, str | int]:
    """解析 LLM 配置，返回 {api_key, api_base_url, model, channel_id}

    所有渠道 1-5 均记录用量（渠道 1/2/5 同时强制每日限额）。
    渠道 3/4 若不可用则互相 fallback（model_name 切换，channel_id 不变）。
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
            hour = datetime.now(timezone(timedelta(hours=8))).hour
            model_env = "DEFAULT_FREE_MODEL_NAME_PEAK" if 16 <= hour < 24 else "DEFAULT_FREE_MODEL_NAME"
            return {"api_key": os.getenv("DEFAULT_FREE_MODEL_KEY", ""),
                    "api_base_url": os.getenv("DEFAULT_FREE_MODEL_URL", ""),
                    "model": os.getenv(model_env, ""), "channel_id": ch}

        key_env, url_env, model_env = _CHANNEL_ENV[ch]
        if ch in _OPENROUTER_CHANNELS:
            effective_ch = ch
            if not _openrouter_available.get(ch, True):
                other = 4 if ch == 3 else 3
                if _openrouter_available.get(other, True):
                    effective_ch = other
                    print(f"[LLMConfig] 渠道 {ch} 不可用，切换到渠道 {other}")
                else:
                    print(f"[LLMConfig] 渠道 {ch} 和渠道 {other} 均不可用，尝试继续使用渠道 {ch}")
            key_env, url_env, model_env = _CHANNEL_ENV[effective_ch]

        return {"api_key": os.getenv(key_env, ""), "api_base_url": os.getenv(url_env, ""),
                "model": os.getenv(model_env, ""), "channel_id": ch}

    if all(config.get(k, "").strip() for k in ("api_key", "api_base_url", "model")):
        return {"api_key": config["api_key"], "api_base_url": config["api_base_url"],
                "model": config["model"], "channel_id": 0}

    raise ValueError("未提供有效的 API 配置，请完整配置 API Key、Base URL、Model，或启用默认免费模型")
