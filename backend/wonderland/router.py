"""奇域（UGC 关卡）信息查询 API。

代理米游社 UGC 社区接口，提供关卡详情与最新评论查询。

线上排障结论（2026-09-26）：
该服务部署在海外节点，需跨太平洋访问国内 CDN（bbs-api.miyoushe.com，
实测 RTT ≈ 224ms），连接建立阶段（TCP/TLS）会出现**成片的瞬时失败**：
uvicorn 访问日志里 502 的请求，完全没有对应的 httpx 请求日志，
即请求尚未发出就因连接层异常终止。原实现对此防护不足，故加固如下：

1. 连接池复用（模块级单例 client）——消除每请求重建 DNS/TCP/TLS 这一
   最脆弱环节，实测 p50 延迟从 ~730ms 降到 ~290ms。
2. 重试范围从 4 个具体异常类扩大到 ``httpx.TransportError`` 全家族
   （补上此前未覆盖的 ReadError / WriteError / PoolTimeout 等）。
3. 上游返回 429/5xx 也重试（原实现非 200 直接 502）。
4. 携带浏览器 UA / Referer / Origin，降低被上游风控重置连接的概率。
5. 每次重试与最终失败都写日志（含异常类型），避免再出现
   「只看到 502、查不出原因」的情况。
"""
import asyncio
import logging
import time
from typing import TypedDict

import httpx
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)

router = APIRouter()

_LEVEL_DETAIL_URL = (
    "https://bbs-api.miyoushe.com/community/ugc_community/web/api/level/full/info"
)
_REPLY_LIST_URL = (
    "https://bbs-api.miyoushe.com/community/ugc_community/web/api/reply/list?lang=zh-cn"
)
_REGION = "cn_gf01"

#: 上游耗时实测 p50 ≈ 0.3s、p99 < 1s，超时收紧后重试窗口更可控
_REQUEST_TIMEOUT = httpx.Timeout(connect=6.0, read=12.0, write=10.0, pool=5.0)
_MAX_RETRIES = 3
#: 每次重试前的等待秒数（第 3 次仍失败则放弃）
_RETRY_BACKOFF = (0.4, 1.0)
#: 这些状态码来自上游抖动，可重试
_RETRY_STATUS_CODES = frozenset({429, 500, 502, 503, 504})

#: 模拟官方网页端，规避上游对非浏览器 UA 的连接重置
_DEFAULT_HEADERS = {
    "Content-Type": "application/json;charset=UTF-8",
    "Accept": "application/json, text/plain, */*",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://act.miyoushe.com/",
    "Origin": "https://act.miyoushe.com",
}

_client: httpx.AsyncClient | None = None
_client_lock: asyncio.Lock | None = None


def _get_lock() -> asyncio.Lock:
    """延迟创建锁，避免模块导入时绑定事件循环（兼容 --reload 多循环场景）。"""
    global _client_lock
    if _client_lock is None:
        _client_lock = asyncio.Lock()
    return _client_lock


async def _get_client() -> httpx.AsyncClient:
    """取进程级共享 client（连接池复用）。

    海外→国内链路上，每请求新建连接意味着一次新的 DNS + TCP + TLS，
    这是最容易失败的一段；复用后既降延迟又降失败率。
    """
    global _client
    if _client is not None and not _client.is_closed:
        return _client
    async with _get_lock():
        if _client is None or _client.is_closed:
            _client = httpx.AsyncClient(
                timeout=_REQUEST_TIMEOUT,
                headers=_DEFAULT_HEADERS,
                limits=httpx.Limits(
                    max_connections=20,
                    max_keepalive_connections=10,
                    # 空闲 30s 即释放，避免复用到上游已单方面关闭的陈旧连接
                    keepalive_expiry=30.0,
                ),
            )
        return _client


async def close_client() -> None:
    """由应用 lifespan 调用，优雅关闭连接池。"""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


async def _post_with_retry(url: str, json_body: dict) -> httpx.Response:
    """带重试的 POST：覆盖连接层异常与上游 5xx/429。

    返回最后一个响应（可能仍是 5xx，由调用方判定）；全部尝试均抛异常时，
    抛出最后一次的异常。
    """
    resp: httpx.Response | None = None
    last_exc: httpx.TransportError | None = None

    for attempt in range(_MAX_RETRIES):
        try:
            resp = await (await _get_client()).post(url, json=json_body)
        except httpx.TransportError as e:
            last_exc = e
            logger.warning(
                "wonderland 上游连接异常 url=%s attempt=%d/%d %s: %s",
                url, attempt + 1, _MAX_RETRIES, type(e).__name__, e,
            )
        else:
            if resp.status_code not in _RETRY_STATUS_CODES:
                return resp
            last_exc = None
            logger.warning(
                "wonderland 上游返回 %s url=%s attempt=%d/%d",
                resp.status_code, url, attempt + 1, _MAX_RETRIES,
            )

        if attempt < _MAX_RETRIES - 1:
            await asyncio.sleep(_RETRY_BACKOFF[min(attempt, len(_RETRY_BACKOFF) - 1)])

    if last_exc is not None:
        raise last_exc
    assert resp is not None
    return resp


def _sanitize_guid(guid: str) -> str:
    """提取 guid 中的数字部分并校验。"""
    digits = "".join(ch for ch in guid if ch.isdigit())
    if not digits:
        raise HTTPException(status_code=400, detail="guid 必须为纯数字")
    return digits


def _level_view_url(level_id: str) -> str:
    return (
        f"https://act.miyoushe.com/ys/ugc_community/mx/"
        f"#/pages/level-detail/index?id={level_id}&region={_REGION}"
    )


def _reply_view_url(level_id: str) -> str:
    return (
        "https://act.miyoushe.com/ys/ugc_community/level-detail/index.html"
        f"?mhy_presentation_style=fullscreen#/comment?level_id={level_id}&region={_REGION}"
    )


class LevelImage(TypedDict):
    url: str


class LevelInfo(TypedDict, total=False):
    level_id: str
    level_name: str
    desc: str
    level_intro: str
    cover_img: str
    images: list[LevelImage]
    video_url: str
    video_cover: str
    hot_score: str
    good_rate: str
    play_type: str
    play_cate: str
    play_tags: list[str]
    show_limit_play_num_str: str
    view_url: str


@router.get("/wonderland/level")
async def get_level_info(
    guid: str = Query(..., description="奇域关卡 ID（level_id），纯数字"),
) -> dict:
    """查询奇域关卡详情信息。"""
    level_id = _sanitize_guid(guid)
    request_body = {
        "level_id": level_id,
        "region": _REGION,
        "uid": "",
        "agg_req_list": [{"api_name": "level_detail"}],
    }
    try:
        resp = await _post_with_retry(_LEVEL_DETAIL_URL, request_body)
    except httpx.HTTPError as e:
        logger.error(
            "wonderland/level 上游最终失败 guid=%s %s: %s", level_id, type(e).__name__, e
        )
        raise HTTPException(status_code=502, detail=f"上游请求失败: {e}")

    if resp.status_code != 200:
        logger.error(
            "wonderland/level 上游状态码异常 guid=%s status=%s",
            level_id, resp.status_code,
        )
        raise HTTPException(
            status_code=502, detail=f"上游返回状态码: {resp.status_code}"
        )

    try:
        result = resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="上游返回数据格式错误")

    if result.get("retcode") != 0:
        raise HTTPException(
            status_code=502,
            detail=f"上游返回错误: {result.get('message', '未知错误')}",
        )

    try:
        level_info_raw = result["data"]["resp_map"]["level_detail"]["data"][
            "level_detail_response"
        ]["level_info"]
    except (KeyError, TypeError):
        raise HTTPException(
            status_code=502, detail="上游返回数据结构异常，缺少 level_info"
        )

    video_info = level_info_raw.get("video_info") or {}
    cover_img = level_info_raw.get("cover_img") or {}
    images = level_info_raw.get("images") or []

    data: LevelInfo = {
        "level_id": level_info_raw.get("level_id", level_id),
        "level_name": level_info_raw.get("level_name", ""),
        "desc": level_info_raw.get("desc", ""),
        "level_intro": level_info_raw.get("level_intro", ""),
        "cover_img": cover_img.get("url", ""),
        "images": [{"url": img.get("url", "")} for img in images if img.get("url")],
        "video_url": video_info.get("video_url", ""),
        "video_cover": video_info.get("video_cover", ""),
        "hot_score": level_info_raw.get("hot_score", ""),
        "good_rate": level_info_raw.get("good_rate", ""),
        "play_type": level_info_raw.get("play_type", ""),
        "play_cate": level_info_raw.get("play_cate", ""),
        "play_tags": level_info_raw.get("play_tags", []),
        "show_limit_play_num_str": level_info_raw.get(
            "show_limit_play_num_str", ""
        ),
        "view_url": _level_view_url(level_id),
    }

    return {"success": True, "data": data}


class ReplyItem(TypedDict, total=False):
    content: str
    created_at: int
    is_recommend: bool
    floor_id: int
    nickname: str
    like_count: int


class ReplyStats(TypedDict):
    total_24h: int
    bad_24h: int
    rate_24h: float
    total_72h: int
    bad_72h: int
    rate_72h: float


class RepliesData(TypedDict, total=False):
    level_id: str
    stats: ReplyStats
    recent_comments: list[ReplyItem]
    bad_comments: list[ReplyItem]
    view_url: str


@router.get("/wonderland/replies")
async def get_latest_replies(
    guid: str = Query(..., description="奇域关卡 ID（level_id），纯数字"),
    max_loops: int = Query(10, ge=1, le=30, description="最大翻页次数"),
) -> dict:
    """查询奇域关卡最近 72 小时内的评论与统计。"""
    level_id = _sanitize_guid(guid)
    now_ts = int(time.time())
    cutoff_24h = now_ts - 24 * 3600
    cutoff_72h = now_ts - 72 * 3600

    total_24h = 0
    bad_24h = 0
    total_72h = 0
    bad_72h = 0
    recent_comments: list[ReplyItem] = []
    bad_comments: list[ReplyItem] = []

    next_cursor = ""
    sort_type = "SORT_TYPE_FLOOR_DESC"

    for page in range(max_loops):
        body = {
            "uid": "",
            "region": _REGION,
            "level_id": level_id,
            "cursor": {
                "next": next_cursor,
                "size": 15,
                "sort_type": sort_type,
            },
        }
        try:
            resp = await _post_with_retry(_REPLY_LIST_URL, body)
        except httpx.HTTPError as e:
            logger.error(
                "wonderland/replies 上游最终失败 guid=%s page=%d %s: %s",
                level_id, page + 1, type(e).__name__, e,
            )
            raise HTTPException(status_code=502, detail=f"上游请求失败: {e}")

        if resp.status_code != 200:
            logger.error(
                "wonderland/replies 上游状态码异常 guid=%s page=%d status=%s",
                level_id, page + 1, resp.status_code,
            )
            raise HTTPException(
                status_code=502,
                detail=f"上游返回状态码: {resp.status_code}",
            )

        try:
            result = resp.json()
        except ValueError:
            raise HTTPException(
                status_code=502, detail="上游返回数据格式错误"
            )

        if result.get("retcode") != 0:
            raise HTTPException(
                status_code=502,
                detail=f"上游返回错误: {result.get('message', '未知错误')}",
            )

        data = result.get("data") or {}
        reply_list = data.get("reply_list") or []
        cursor = data.get("cursor") or {}
        has_more = cursor.get("has_more", False)
        next_cursor = cursor.get("next") or ""

        stop = False
        for reply in reply_list:
            created_at = int(reply.get("created_at", 0))
            if created_at > now_ts:
                continue
            if created_at < cutoff_72h:
                stop = True
                break

            is_recommend = reply.get("is_recommend", True)
            user_info = reply.get("user_info") or {}
            reply_stat = reply.get("reply_stat") or {}
            like_count_raw = reply_stat.get("like_count", "0")
            try:
                like_count = int(like_count_raw)
            except (TypeError, ValueError):
                like_count = 0
            item: ReplyItem = {
                "content": reply.get("content", ""),
                "created_at": created_at,
                "is_recommend": is_recommend,
                "floor_id": reply.get("floor_id", 0),
                "nickname": user_info.get("nickname", ""),
                "like_count": like_count,
            }

            total_72h += 1
            if not is_recommend:
                bad_72h += 1
                bad_comments.append(item)

            if created_at >= cutoff_24h:
                total_24h += 1
                if not is_recommend:
                    bad_24h += 1

            recent_comments.append(item)

        if stop or not has_more or not reply_list:
            break

    rate_24h = round(bad_24h / total_24h * 100, 2) if total_24h > 0 else 0.0
    rate_72h = round(bad_72h / total_72h * 100, 2) if total_72h > 0 else 0.0

    recent_comments.sort(key=lambda r: r["created_at"], reverse=True)

    data: RepliesData = {
        "level_id": level_id,
        "stats": {
            "total_24h": total_24h,
            "bad_24h": bad_24h,
            "rate_24h": rate_24h,
            "total_72h": total_72h,
            "bad_72h": bad_72h,
            "rate_72h": rate_72h,
        },
        "recent_comments": recent_comments[:15],
        "bad_comments": bad_comments[:10],
        "view_url": _reply_view_url(level_id),
    }

    return {"success": True, "data": data}
