#!/usr/bin/env python3
"""Convert the anxiety methods workbook into app-readable JSON."""

from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

import openpyxl


DEFAULT_INPUT = Path("/Users/skybutu/Downloads/reddit_anxiety_methods_database.xlsx")
DEFAULT_OUTPUT = Path("data/workbook.json")


def clean_value(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if value is None:
        return ""
    return value


def rows_for_sheet(sheet):
    raw_rows = [
        [clean_value(cell) for cell in row]
        for row in sheet.iter_rows(values_only=True)
        if any(cell is not None for cell in row)
    ]

    if not raw_rows:
        return {"headers": [], "rows": [], "raw": []}

    header_index = 0
    for index, row in enumerate(raw_rows):
        filled = [str(cell).strip() for cell in row if str(cell).strip()]
        if len(filled) >= 2:
            header_index = index
            break

    headers = [str(cell).strip() if str(cell).strip() else f"Column {i + 1}" for i, cell in enumerate(raw_rows[header_index])]
    rows = []
    for row in raw_rows[header_index + 1 :]:
        if not any(str(cell).strip() for cell in row):
            continue
        padded = list(row) + [""] * max(0, len(headers) - len(row))
        rows.append({headers[i]: clean_value(padded[i]) for i in range(len(headers))})

    return {
        "headers": headers,
        "rows": rows,
        "raw": raw_rows,
    }


def main() -> int:
    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUTPUT

    if not input_path.exists():
        print(f"Workbook not found: {input_path}", file=sys.stderr)
        return 1

    workbook = openpyxl.load_workbook(input_path, data_only=True)
    payload = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sourceWorkbook": input_path.name,
        "sheets": {sheet.title: rows_for_sheet(sheet) for sheet in workbook.worksheets},
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
