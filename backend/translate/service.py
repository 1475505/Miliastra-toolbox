"""TermService: SQLite + FTS5 exact search + rapidfuzz fallback."""

import csv
import functools
import logging
import os
import sqlite3
from pathlib import Path
from typing import Any

from rapidfuzz import fuzz, process

logger = logging.getLogger(__name__)

_MAX_CANDIDATES = 10

COLUMNS = [
    "CHS", "CHT", "DE", "EN", "ES", "FR", "ID", "IT",
    "JP", "KR", "PT", "RU", "TH", "TR", "VI",
]


class TermService:
    def __init__(self) -> None:
        self._available = False
        self._db_path: str | None = None
        self._rowid_list: list[int] = []
        # One in-memory term list per language, used by rapidfuzz fallback.
        self._term_lists: dict[str, list[str]] = {}

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def is_available(self) -> bool:
        return self._available

    def initialise(self, csv_path: str, db_path: str | None = None) -> None:
        """Build (if needed) and open the SQLite DB, then load term indexes."""
        try:
            resolved_csv = Path(csv_path).resolve()
            if db_path is None:
                resolved_db = resolved_csv.with_suffix(".db")
            else:
                resolved_db = Path(db_path).resolve()

            if not self._db_is_valid(str(resolved_db)):
                if not resolved_csv.exists():
                    raise FileNotFoundError(f"CSV not found: {resolved_csv}")
                self._build_db(str(resolved_csv), str(resolved_db))

            self._load_term_indexes(str(resolved_db))
            self._db_path = str(resolved_db)
            self._available = True
            logger.info(
                "Term service ready: db=%s rows=%d",
                self._db_path,
                len(self._rowid_list),
            )
        except Exception:
            logger.exception("Term service initialisation failed")
            self._available = False
            self._db_path = None
            self._term_lists = {}
            self._rowid_list = []

    def search(
        self,
        query: str,
        source_lang: str = "chs",
        langs: set[str] | None = None,
    ) -> dict[str, Any]:
        """Search terms. Raises if not available — caller must guard."""
        frozen_langs = frozenset(langs) if langs else None
        return self._cached_search(query, source_lang.lower(), frozen_langs)

    @functools.lru_cache(maxsize=2048)
    def _cached_search(
        self,
        query: str,
        source_lang: str,
        langs: frozenset[str] | None,
    ) -> dict[str, Any]:
        if not self._available or self._db_path is None:
            raise RuntimeError("Term service not available")

        q = query.strip()
        if not q:
            return {"exact_match": True, "query": q, "total": 0, "results": []}

        # Phase 1 — exact containment via FTS5
        exact_results = self._exact_search(q, source_lang)
        exact_rowids = {int(row["rowid"]) for row in exact_results}
        results = exact_results[:_MAX_CANDIDATES]

        # Phase 2 — fuzzy supplement after exact matches
        remaining = _MAX_CANDIDATES - len(results)
        fuzzy_results: list[dict[str, Any]] = []
        if remaining > 0:
            fuzzy_results = self._fuzzy_search(
                q,
                source_lang=source_lang,
                exclude_rowids=exact_rowids,
                limit=remaining,
            )
            results.extend(fuzzy_results)

        if langs:
            results = [
                _filter_row_langs(row, langs, source_lang) for row in results
            ]

        if exact_results:
            payload = {
                "exact_match": True,
                "query": q,
                "total": len(results),
                "results": results,
            }
            if fuzzy_results:
                payload["message"] = "已优先展示精确匹配结果，并补充相似候选"
            return payload

        return {
            "exact_match": False,
            "message": "未找到完全包含该关键词的术语，以下是最相似的 10 条候选",
            "query": q,
            "total": len(results),
            "results": results,
        }

    # ------------------------------------------------------------------ #
    # Phase 1 — Exact
    # ------------------------------------------------------------------ #

    def _exact_search(self, query: str, source_lang: str) -> list[dict[str, Any]]:
        """Exact containment search on the source language column.

        CHS uses the FTS5 index; other languages fall back to a LIKE scan
        because the existing DB only has an FTS5 index on CHS.
        """
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            qlower = query.lower()
            source_col = source_lang.upper()

            if source_lang == "chs":
                # Sanitise for FTS5: escape double quotes, wrap in quotes.
                safe = query.replace('"', '""')
                fts_query = f'"{safe}"'
                cur = conn.execute(
                    f"""
                    SELECT {_column_select()}
                    FROM terms
                    WHERE rowid IN (
                        SELECT rowid FROM terms_fts WHERE chs MATCH ?
                    )
                    """,
                    (fts_query,),
                )
                rows = cur.fetchall()
            else:
                # Fallback for non-CHS languages: substring scan via LIKE.
                # The post-filter below removes LIKE false positives.
                cur = conn.execute(
                    f"""
                    SELECT {_column_select()}
                    FROM terms
                    WHERE {source_col} LIKE ?
                    """,
                    (f"%{query}%",),
                )
                rows = cur.fetchall()

            hits: list[dict[str, Any]] = []
            for row in rows:
                src_val = row[source_col] or ""
                if qlower in src_val.lower():
                    hits.append(_row_to_dict(row))

            # Exact-equal source-lang entries must rank before broader hits.
            hits.sort(
                key=lambda item: (
                    0 if _is_exact_source_match(item, query, source_lang) else 1
                )
            )
            return hits
        finally:
            conn.close()

    # ------------------------------------------------------------------ #
    # Phase 2 — Fuzzy
    # ------------------------------------------------------------------ #

    def _fuzzy_search(
        self,
        query: str,
        source_lang: str,
        exclude_rowids: set[int] | None = None,
        limit: int = _MAX_CANDIDATES,
    ) -> list[dict[str, Any]]:
        """Two-step fallback:
        1. Terms whose source-lang text is contained IN the query (term in query).
        2. If still under limit, supplement with rapidfuzz partial_ratio.
        """
        if limit <= 0:
            return []

        term_list = self._term_lists.get(source_lang, [])
        if not term_list:
            return []

        qlower = query.lower()
        query_len = len(qlower)
        seen = set(exclude_rowids or set())

        # Step 1: collect terms where term is a substring of query.
        # Length pre-filter: a longer term cannot be a substring of the query.
        contained_indices: list[int] = []
        for i, term in enumerate(term_list):
            if not term or len(term) > query_len:
                continue
            if term.lower() not in qlower:
                continue
            rid = self._rowid_list[i]
            if rid in seen:
                continue
            contained_indices.append(i)
            seen.add(rid)
            if len(contained_indices) >= limit:
                break

        # Step 2: supplement with rapidfuzz if we still need more
        supplement_indices: list[int] = []
        current_count = len(contained_indices)
        if current_count < limit:
            for idx in self._fuzzy_top_indices(
                query, source_lang, max(limit * 4, 20)
            ):
                rid = self._rowid_list[idx]
                if rid not in seen:
                    supplement_indices.append(idx)
                    seen.add(rid)
                    if current_count + len(supplement_indices) >= limit:
                        break

        all_indices = contained_indices + supplement_indices
        if not all_indices:
            return []

        rowids = [self._rowid_list[i] for i in all_indices]

        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            placeholders = ",".join("?" * len(rowids))
            cur = conn.execute(
                f"SELECT {_column_select()} FROM terms WHERE rowid IN ({placeholders})",
                tuple(rowids),
            )
            rows = cur.fetchall()
            row_map = {row["rowid"]: _row_to_dict(row) for row in rows}
            return [row_map[r] for r in rowids if r in row_map]
        finally:
            conn.close()

    @functools.lru_cache(maxsize=1024)
    def _fuzzy_top_indices(
        self, query: str, source_lang: str, limit: int
    ) -> tuple[int, ...]:
        """Return top candidate indices from rapidfuzz partial_ratio.

        Cached because the term list is static and this is the hot path
        for miss queries.
        """
        term_list = self._term_lists.get(source_lang, [])
        if not term_list:
            return ()
        matches = process.extract(
            query,
            term_list,
            scorer=fuzz.partial_ratio,
            limit=limit,
            score_cutoff=60,
        )
        return tuple(int(m[2]) for m in matches)

    # ------------------------------------------------------------------ #
    # DB helpers
    # ------------------------------------------------------------------ #

    def _db_is_valid(self, db_path: str) -> bool:
        if not os.path.exists(db_path):
            return False
        if os.path.getsize(db_path) == 0:
            return False
        try:
            conn = sqlite3.connect(db_path, check_same_thread=False)
            cur = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('terms', 'terms_fts')"
            )
            tables = {r[0] for r in cur.fetchall()}
            conn.close()
            return {"terms", "terms_fts"} <= tables
        except Exception:
            return False

    def _build_db(self, csv_path: str, db_path: str) -> None:
        logger.info("Building terms DB from %s → %s", csv_path, db_path)
        if os.path.exists(db_path):
            os.remove(db_path)

        conn = sqlite3.connect(db_path)
        try:
            # Main table
            cols = ", ".join(f"{c} TEXT" for c in COLUMNS)
            conn.execute(f"CREATE TABLE terms ({cols})")

            # FTS5 virtual table with unicode61 tokenizer on CHS.
            conn.execute(
                "CREATE VIRTUAL TABLE terms_fts USING fts5(chs, tokenize='unicode61')"
            )

            insert_sql = f"INSERT INTO terms VALUES ({','.join('?' * len(COLUMNS))})"
            insert_fts = "INSERT INTO terms_fts(rowid, CHS) VALUES (?, ?)"

            with open(csv_path, "r", encoding="utf-8-sig", newline="") as fh:
                reader = csv.DictReader(fh, delimiter="\t")
                batch: list[tuple] = []
                fts_batch: list[tuple] = []
                rowid = 1
                batch_size = 5000
                for row in reader:
                    vals = tuple(row.get(c, "") for c in COLUMNS)
                    batch.append(vals)
                    fts_batch.append((rowid, vals[0]))  # vals[0] is CHS
                    rowid += 1
                    if len(batch) >= batch_size:
                        conn.executemany(insert_sql, batch)
                        conn.executemany(insert_fts, fts_batch)
                        batch.clear()
                        fts_batch.clear()
                if batch:
                    conn.executemany(insert_sql, batch)
                    conn.executemany(insert_fts, fts_batch)

            conn.commit()
            logger.info("Terms DB built: %d rows", rowid - 1)
        finally:
            conn.close()

    def _load_term_indexes(self, db_path: str) -> None:
        conn = sqlite3.connect(db_path, check_same_thread=False)
        try:
            cur = conn.execute(
                f"SELECT rowid, {_column_select_languages()} FROM terms ORDER BY rowid"
            )
            term_lists: dict[str, list[str]] = {c.lower(): [] for c in COLUMNS}
            self._rowid_list = []
            for row in cur:
                self._rowid_list.append(row[0])
                for i, col in enumerate(COLUMNS, start=1):
                    term_lists[col.lower()].append(row[i] or "")
            self._term_lists = term_lists
        finally:
            conn.close()


# ------------------------------------------------------------------ #
# Module helpers
# ------------------------------------------------------------------ #

def _column_select() -> str:
    return "rowid, " + ", ".join(COLUMNS)


def _column_select_languages() -> str:
    return ", ".join(COLUMNS)


# Lowercase keys for JSON API consistency
_COL_MAP = {col: col.lower() for col in COLUMNS}


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    d: dict[str, Any] = {"rowid": row["rowid"]}
    for col in COLUMNS:
        d[_COL_MAP[col]] = row[col]
    return d


def _is_exact_source_match(
    row: dict[str, Any], query: str, source_lang: str
) -> bool:
    src_value = row.get(source_lang)
    if not isinstance(src_value, str):
        return False
    return src_value.strip().lower() == query.strip().lower()


def _filter_row_langs(
    row: dict[str, Any], langs: frozenset[str], source_lang: str
) -> dict[str, Any]:
    """Keep requested language columns plus rowid and source_lang column."""
    kept: dict[str, Any] = {"rowid": row["rowid"], source_lang: row.get(source_lang)}
    for lang in langs:
        if lang in row:
            kept[lang] = row[lang]
    return kept


# ------------------------------------------------------------------ #
# 术语翻译（供 Agent / Skill / MCP 调用）
# ------------------------------------------------------------------ #

def translate_terms_data(
    terms: list[str], source_lang: str, target_lang: str
) -> list[dict[str, Any]]:
    """对每条术语查询其在 target_lang 的官方译法。

    仅接受精确等值匹配，避免 containment/fuzzy 命中导致误译。
    返回结构：
      [{source_term, source_lang, target_lang, translation, chs, matched}]
    translation 为 None 表示术语表无精确匹配，由调用方自行翻译。
    """
    from translate import term_service  # lazy：避免循环导入

    src = source_lang.strip().lower()
    tgt = target_lang.strip().lower()
    if src not in {c.lower() for c in COLUMNS}:
        raise ValueError(f"无效的 source_lang: {source_lang}")
    if tgt not in {c.lower() for c in COLUMNS}:
        raise ValueError(f"无效的 target_lang: {target_lang}")

    # 始终带回 chs 作为中文参考（与 source/target 重复时 _filter_row_langs 自动去重）
    request_langs: set[str] = {tgt, "chs"}

    results: list[dict[str, Any]] = []
    for term in terms:
        q = term.strip()
        entry: dict[str, Any] = {
            "source_term": term,
            "source_lang": src,
            "target_lang": tgt,
            "translation": None,
            "chs": None,
            "matched": False,
        }
        if not q:
            results.append(entry)
            continue

        search_result = term_service.search(
            q, source_lang=src, langs=request_langs
        )
        candidates = search_result.get("results", [])
        if candidates:
            best = candidates[0]  # 精确等值匹配已排在最前
            src_val = best.get(src)
            if isinstance(src_val, str) and src_val.strip().lower() == q.lower():
                entry["matched"] = True
                translation = (best.get(tgt) or "").strip()
                entry["translation"] = translation or None
                chs_val = (best.get("chs") or "").strip()
                entry["chs"] = chs_val or None
        results.append(entry)
    return results


def translate_terms_json(
    terms: list[str], source_lang: str, target_lang: str
) -> str:
    import json

    return json.dumps(
        translate_terms_data(terms, source_lang, target_lang),
        ensure_ascii=False,
        indent=2,
    )
