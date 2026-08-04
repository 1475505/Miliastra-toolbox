"""奇域（UGC 关卡）信息查询 API。

代理米游社 UGC 社区接口，提供关卡详情与最新评论查询。
"""
import asyncio
import time
from typing import TypedDict

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

_LEVEL_DETAIL_URL = (
    "https://bbs-api.miyoushe.com/community/ugc_community/web/api/level/full/info"
)
_REPLY_LIST_URL = (
    "https://bbs-api.miyoushe.com/community/ugc_community/web/api/reply/list?lang=zh-cn"
)
_REGION = "cn_gf01"
_REQUEST_TIMEOUT = httpx.Timeout(connect=15.0, read=30.0, write=10.0, pool=5.0)
_MAX_RETRIES = 3
_RETRYABLE_ERRORS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.RemoteProtocolError,
)


async def _post_with_retry(
    client: httpx.AsyncClient,
    url: str,
    json_body: dict,
    headers: dict[str, str],
) -> httpx.Response:
    """带重试的 POST 请求，处理瞬时连接/超时错误。"""
    for attempt in range(_MAX_RETRIES):
        try:
            return await client.post(url, json=json_body, headers=headers)
        except _RETRYABLE_ERRORS:
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(1.0 * (attempt + 1))
                continue
            raise


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
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            resp = await _post_with_retry(
                client,
                _LEVEL_DETAIL_URL,
                request_body,
                {"Content-Type": "application/json"},
            )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"上游请求失败: {e}")

    if resp.status_code != 200:
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

    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            for _ in range(max_loops):
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
                resp = await _post_with_retry(
                    client,
                    _REPLY_LIST_URL,
                    body,
                    {"Content-Type": "application/json;charset=UTF-8"},
                )
                if resp.status_code != 200:
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
    except HTTPException:
        raise
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"上游请求失败: {e}")

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
