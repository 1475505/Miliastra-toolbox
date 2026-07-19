"""Standalone CLI to build the SQLite + FTS5 DB from TermTable_15Lang.csv."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from translate.service import TermService


def main() -> None:
    parser = argparse.ArgumentParser(description="Build terms.db from CSV")
    parser.add_argument("csv", help="Path to TermTable_15Lang.csv")
    parser.add_argument("--db", help="Output DB path (default: csv_path with .db suffix)")
    args = parser.parse_args()

    svc = TermService()
    try:
        svc.initialise(args.csv, db_path=args.db)
        if svc.is_available():
            print(f"Build succeeded: {svc._db_path} ({len(svc._rowid_list)} rows)")
        else:
            print("Build failed (see logs)", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"Build failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
