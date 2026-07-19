"""Translation lookup API router."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from translate import term_service
from translate.service import COLUMNS, translate_terms_data

router = APIRouter()

_VALID_LANGS = {col.lower() for col in COLUMNS}


class BatchTranslateRequest(BaseModel):
    terms: list[str] = Field(..., min_length=1, description="待翻译术语列表")
    source_lang: str = Field(default="chs", description="术语所属语言码")
    target_lang: str = Field(..., description="目标语言码")


@router.get("/translate/terms")
async def query_terms(
    query: str = Query(..., min_length=1, description="搜索关键词"),
    source_lang: str = Query(
        "chs",
        description="query 所属语言列（如 chs、en、jp），默认中文。",
    ),
    langs: list[str] | None = Query(
        None,
        description="指定返回的语言列（如 en、jp），支持多个；默认返回全部 15 种语言。",
    ),
):
    """按指定语言术语搜索，返回精确匹配或最相似的 10 条结果及其指定语言翻译。"""
    if not term_service.is_available():
        raise HTTPException(
            status_code=503,
            detail={"success": False, "error": "术语表服务暂不可用"},
        )

    source_lang = source_lang.strip().lower()
    if source_lang not in _VALID_LANGS:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": f"无效的 source_lang: {source_lang}",
            },
        )

    requested_langs: set[str] | None = None
    if langs:
        requested: set[str] = set()
        for raw in langs:
            for part in raw.split(","):
                part = part.strip().lower()
                if part:
                    requested.add(part)
        invalid = requested - _VALID_LANGS
        if invalid:
            raise HTTPException(
                status_code=400,
                detail={
                    "success": False,
                    "error": f"无效的语言代码: {', '.join(sorted(invalid))}",
                },
            )
        requested_langs = requested

    try:
        result = term_service.search(
            query, source_lang=source_lang, langs=requested_langs
        )
        return {"success": True, "data": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询术语失败: {e}")


@router.post("/translate/terms/batch")
async def batch_translate_terms(request: BatchTranslateRequest):
    """批量术语翻译：对每条术语查询其在 target_lang 的官方译法。

    仅返回精确等值匹配的译法；无匹配时 translation 为 None，由调用方自行翻译。
    供 Agent translate_terms 工具及 Skill / MCP 调用。
    """
    if not term_service.is_available():
        raise HTTPException(
            status_code=503,
            detail={"success": False, "error": "术语表服务暂不可用"},
        )

    source_lang = request.source_lang.strip().lower()
    target_lang = request.target_lang.strip().lower()
    if source_lang not in _VALID_LANGS:
        raise HTTPException(
            status_code=400,
            detail={"success": False, "error": f"无效的 source_lang: {source_lang}"},
        )
    if target_lang not in _VALID_LANGS:
        raise HTTPException(
            status_code=400,
            detail={"success": False, "error": f"无效的 target_lang: {target_lang}"},
        )

    try:
        result = translate_terms_data(request.terms, source_lang, target_lang)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"success": False, "error": str(e)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"批量翻译术语失败: {e}")
