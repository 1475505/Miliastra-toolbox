"""Data 数据查询 API 路由。"""

from typing import Callable

from fastapi import APIRouter, HTTPException, Query

from common.pg_client import pg_client

router = APIRouter()


def _validate_query(id_value: int | None, name: str | None) -> None:
    if id_value is None and (name is None or not name.strip()):
        raise HTTPException(status_code=400, detail="id 和 name 至少提供一个")


def _build_paginated_response(items: list[dict], total: int):
    return {
        "success": True,
        "data": {
            "total": total,
            "items": items,
        },
    }


def _query_records(
    *,
    id_value: int | None,
    name: str | None,
    limit: int,
    offset: int,
    select_clause: str,
    table_name: str,
    id_column: str,
    order_column: str,
    not_found_detail: str,
    map_row: Callable[[tuple], dict],
):
    with pg_client.cursor() as cur:
        if id_value is not None:
            query = f"""
                SELECT {select_clause}
                FROM {table_name}
                WHERE {id_column} = %s
                LIMIT 1
            """
            cur.execute(query, (id_value,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=not_found_detail)
            return _build_paginated_response([map_row(row)], 1)

        search_name = f"%{name.strip()}%" if name else "%%"
        query = f"""
            SELECT {select_clause}
            FROM {table_name}
            WHERE name ILIKE %s
            ORDER BY {order_column} ASC
            LIMIT %s OFFSET %s
        """
        cur.execute(query, (search_name, limit, offset))
        rows = cur.fetchall()

        count_query = f"""
            SELECT COUNT(*)
            FROM {table_name}
            WHERE name ILIKE %s
        """
        cur.execute(count_query, (search_name,))
        total = cur.fetchone()[0]

    return _build_paginated_response([map_row(row) for row in rows], total)


def _map_gadget_row(row: tuple) -> dict:
    return {
        "list_id": row[0],
        "name": row[1],
        "size_x": row[2],
        "size_y": row[3],
        "size_z": row[4],
    }


def _map_effect_row(row: tuple) -> dict:
    return {
        "id": row[0],
        "name": row[1],
        "duration": row[2],
        "is_loop": row[3],
        "radius": row[4],
    }


def _map_bgm_row(row: tuple) -> dict:
    return {
        "bgm_id": row[0],
        "name": row[1],
        "duration_sec": row[2],
        "category_name": row[3],
    }


@router.get("/data/gadgets")
async def query_gadgets(
    id: int | None = Query(None, description="物件目录 ID（ugc_gadgets.list_id）"),
    name: str | None = Query(None, description="物件中文名（模糊匹配）"),
    limit: int = Query(20, ge=1, le=100, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
):
    """查询实体（物件）信息：ID、中文名、X/Y/Z 轴大小。"""
    _validate_query(id, name)

    try:
        return _query_records(
            id_value=id,
            name=name,
            limit=limit,
            offset=offset,
            select_clause="list_id, name, size_x, size_y, size_z",
            table_name="public.ugc_gadgets",
            id_column="list_id",
            order_column="list_id",
            not_found_detail="未找到对应实体",
            map_row=_map_gadget_row,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询实体失败: {e}")


@router.get("/data/effects")
async def query_effects(
    id: int | None = Query(None, description="特效 ID（ugc_effects.id）"),
    name: str | None = Query(None, description="特效中文名（模糊匹配）"),
    limit: int = Query(20, ge=1, le=100, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
):
    """查询特效信息：ID、中文名、持续时长、半径。"""
    _validate_query(id, name)

    try:
        return _query_records(
            id_value=id,
            name=name,
            limit=limit,
            offset=offset,
            select_clause="id, name, duration, is_loop, radius",
            table_name="public.ugc_effects",
            id_column="id",
            order_column="id",
            not_found_detail="未找到对应特效",
            map_row=_map_effect_row,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询特效失败: {e}")


@router.get("/data/bgm")
async def query_bgm(
    id: int | None = Query(None, description="音乐 ID（ugc_bgm.bgm_id）"),
    name: str | None = Query(None, description="音乐中文名（模糊匹配）"),
    limit: int = Query(20, ge=1, le=100, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
):
    """查询音乐信息：ID、中文名、持续时长、类别。"""
    _validate_query(id, name)

    try:
        return _query_records(
            id_value=id,
            name=name,
            limit=limit,
            offset=offset,
            select_clause="""
                bgm_id,
                name,
                duration_ms / 1000.0 AS duration_sec,
                CASE category_id
                    WHEN 101 THEN '探索'
                    WHEN 102 THEN '战斗'
                    WHEN 103 THEN '任务'
                    WHEN 104 THEN '其他'
                    ELSE '未知'
                END AS category_name
            """,
            table_name="public.ugc_bgm",
            id_column="bgm_id",
            order_column="bgm_id",
            not_found_detail="未找到对应音乐",
            map_row=_map_bgm_row,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询音乐失败: {e}")
