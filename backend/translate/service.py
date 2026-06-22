"""TermService: SQLite + FTS5 exact search + rapidfuzz fallback."""

import csv
import logging
import os
import sqlite3
from pathlib import Path
from typing import Any

from rapidfuzz import fuzz, process

logger = logging.getLogger(__name__)

_MAX_CANDIDATES = 10

_COLUMNS = [
    "CHS", "CHT", "DE", "EN", "ES", "FR", "ID", "IT",
    "JP", "KR", "PT", "RU", "TH", "TR", "VI",
]


class TermService:
    def __init__(self) -> None:
        self._available = False
        self._db_path: str | None = None
        self._chs_list: list[str] = []
        self._rowid_list: list[int] = []

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def is_available(self) -> bool:
        return self._available

    def initialise(self, csv_path: str, db_path: str | None = None) -> None:
        """Build (if needed) and open the SQLite DB, then load CHS index."""
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

            self._load_chs_index(str(resolved_db))
            self._db_path = str(resolved_db)
            self._available = True
            logger.info(
                "Term service ready: db=%s rows=%d", self._db_path, len(self._chs_list)
            )
        except Exception:
            logger.exception("Term service initialisation failed")
            self._available = False
            self._db_path = None
            self._chs_list = []
            self._rowid_list = []

    def search(self, query: str) -> dict[str, Any]:
        """Search terms. Raises if not available — caller must guard."""
        if not self._available or self._db_path is None:
            raise RuntimeError("Term service not available")

        q = query.strip()
        if not q:
            return {"exact_match": True, "query": q, "total": 0, "results": []}

        # Phase 1 — exact containment via FTS5
        exact_results = self._exact_search(q)
        exact_rowids = {int(row["rowid"]) for row in exact_results}
        results = exact_results[:_MAX_CANDIDATES]

        # Phase 2 — fuzzy supplement after exact matches
        remaining = _MAX_CANDIDATES - len(results)
        fuzzy_results: list[dict[str, Any]] = []
        if remaining > 0:
            fuzzy_results = self._fuzzy_search(
                q,
                exclude_rowids=exact_rowids,
                limit=remaining,
            )
            results.extend(fuzzy_results)

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

    def _exact_search(self, query: str) -> list[dict[str, Any]]:
        """FTS5 MATCH + Python 'in' post-filter."""
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            # Sanitise for FTS5: escape double quotes, wrap in quotes
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

            hits: list[dict[str, Any]] = []
            qlower = query.lower()
            for row in rows:
                chs_val = row["CHS"] or ""
                if qlower in chs_val.lower():
                    hits.append(_row_to_dict(row))

            # Exact-equal CHS entries must rank before broader containment hits.
            hits.sort(key=lambda item: 0 if _is_exact_chs_match(item, query) else 1)
            return hits
        finally:
            conn.close()

    # ------------------------------------------------------------------ #
    # Phase 2 — Fuzzy
    # ------------------------------------------------------------------ #

    def _fuzzy_search(
        self,
        query: str,
        exclude_rowids: set[int] | None = None,
        limit: int = _MAX_CANDIDATES,
    ) -> list[dict[str, Any]]:
        """Two-step fallback:
        1. Terms whose CHS is contained IN the query (term in query).
        2. If still under limit, supplement with rapidfuzz partial_ratio.
        """
        if limit <= 0:
            return []

        qlower = query.lower()
        seen = set(exclude_rowids or set())

        # Step 1: collect terms where term.chs is a substring of query
        contained_indices: list[int] = []
        for i, chs in enumerate(self._chs_list):
            if not chs or chs.lower() not in qlower:
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
            matches = process.extract(
                query,
                self._chs_list,
                scorer=fuzz.partial_ratio,
                limit=max(limit * 4, 20),
                score_cutoff=60,
            )
            for m in matches:
                idx = m[2]  # type: ignore[index]
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
            cols = ", ".join(f"{c} TEXT" for c in _COLUMNS)
            conn.execute(f"CREATE TABLE terms ({cols})")

            # FTS5 virtual table with unicode61 tokenizer
            conn.execute(
                "CREATE VIRTUAL TABLE terms_fts USING fts5(chs, tokenize='unicode61')"
            )

            insert_sql = f"INSERT INTO terms VALUES ({','.join('?' * len(_COLUMNS))})"
            insert_fts = "INSERT INTO terms_fts(rowid, CHS) VALUES (?, ?)"

            with open(csv_path, "r", encoding="utf-8-sig", newline="") as fh:
                reader = csv.DictReader(fh, delimiter="\t")
                batch: list[tuple] = []
                fts_batch: list[tuple] = []
                rowid = 1
                batch_size = 5000
                for row in reader:
                    vals = tuple(row.get(c, "") for c in _COLUMNS)
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

    def _load_chs_index(self, db_path: str) -> None:
        conn = sqlite3.connect(db_path, check_same_thread=False)
        try:
            cur = conn.execute("SELECT rowid, chs FROM terms ORDER BY rowid")
            self._rowid_list = []
            self._chs_list = []
            for rowid, chs in cur:
                self._rowid_list.append(rowid)
                self._chs_list.append(chs or "")
        finally:
            conn.close()


# ------------------------------------------------------------------ #
# Module helpers
# ------------------------------------------------------------------ #

def _column_select() -> str:
    return "rowid, " + ", ".join(_COLUMNS)


# Lowercase keys for JSON API consistency
_COL_MAP = {col: col.lower() for col in _COLUMNS}


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    d: dict[str, Any] = {"rowid": row["rowid"]}
    for col in _COLUMNS:
        d[_COL_MAP[col]] = row[col]
    return d


def _is_exact_chs_match(row: dict[str, Any], query: str) -> bool:
    chs_value = row.get("chs")
    if not isinstance(chs_value, str):
        return False
    return chs_value.strip().lower() == query.strip().lower()
