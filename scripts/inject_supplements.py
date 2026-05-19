#!/usr/bin/env python3
"""Build the dedicated AnxietyFlow Supplements matrix.

The repo currently serves data/workbook.json. If the original Excel workbook is
not present, this script rebuilds reddit_anxiety_methods_database.xlsx from the
generated JSON projection, removes supplement rows from Methods, and writes a
separate Supplements sheet.
"""

from __future__ import annotations

import json
import re
import zipfile
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr


ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data" / "workbook.json"
WORKBOOK_PATH = ROOT / "reddit_anxiety_methods_database.xlsx"
METHODS_SHEET = "Methods Database"
SUPPLEMENTS_SHEET = "Supplements"
OLD_SUPPLEMENT_COLUMNS = ["Clinical_Evidence", "Reddit_Popularity", "Medication_Interactions"]
SUPPLEMENT_HEADERS = [
    "Supplement_Name",
    "Target_Symptoms",
    "Clinical_Evidence",
    "Reddit_Popularity",
    "Psych_Med_Interactions",
    "Risk_Level",
]

SUPPLEMENTS = [
    {
        "Supplement_Name": "L-Theanine",
        "Target_Symptoms": "Acute anxiety, Caffeine jitters, Panic onset",
        "Clinical_Evidence": "High",
        "Reddit_Popularity": "Extremely High (Highly recommended for rapid onset relaxation and caffeine jitters)",
        "Psych_Med_Interactions": "Benzodiazepines (amplifies sedation), Blood pressure meds",
        "Risk_Level": "Low",
    },
    {
        "Supplement_Name": "Ashwagandha",
        "Target_Symptoms": "Chronic stress, High cortisol, Social anxiety",
        "Clinical_Evidence": "High",
        "Reddit_Popularity": "Very High (Popular for long-term cortisol reduction, though users warn against continuous cycling without breaks)",
        "Psych_Med_Interactions": "SSRIs (Serotonin risk), Thyroid meds",
        "Risk_Level": "Moderate",
    },
    {
        "Supplement_Name": "Magnesium Glycinate",
        "Target_Symptoms": "Physical anxiety, Muscle tension, Insomnia",
        "Clinical_Evidence": "High",
        "Reddit_Popularity": "Massive (The absolute crowd-favorite form of magnesium on Reddit for muscle relaxation and sleep anxiety)",
        "Psych_Med_Interactions": "Antibiotics (space out 2 hours)",
        "Risk_Level": "Low",
    },
    {
        "Supplement_Name": "NAC",
        "Target_Symptoms": "Intrusive thoughts, Rumination, OCD loops",
        "Clinical_Evidence": "Medium-High",
        "Reddit_Popularity": "High (Frequently suggested for intrusive thoughts, rumination, and OCD-like anxiety patterns)",
        "Psych_Med_Interactions": "Blood thinners, Nitroglycerin",
        "Risk_Level": "Low",
    },
    {
        "Supplement_Name": "Saffron",
        "Target_Symptoms": "Depressive anxiety, Low mood, Burnout",
        "Clinical_Evidence": "Medium-High",
        "Reddit_Popularity": "Rising Trend (Gaining popularity as a natural alternative with mild SSRI-like properties)",
        "Psych_Med_Interactions": "SSRIs / SNRIs / MAOIs (High risk of Serotonin Syndrome)",
        "Risk_Level": "High",
    },
]


def normalize_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def clean_xml_text(value: object) -> str:
    text = "" if value is None else str(value)
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)


def load_payload() -> dict:
    if not JSON_PATH.exists():
        raise FileNotFoundError(f"Missing generated workbook JSON: {JSON_PATH}")
    return json.loads(JSON_PATH.read_text(encoding="utf-8"))


def strip_old_supplement_columns(sheet: dict) -> None:
    headers = [header for header in list(sheet.get("headers") or []) if header not in OLD_SUPPLEMENT_COLUMNS]
    sheet["headers"] = headers
    for row in sheet.get("rows", []):
        for column in OLD_SUPPLEMENT_COLUMNS:
            row.pop(column, None)


def rebuild_raw_from_rows(sheet: dict) -> None:
    headers = list(sheet.get("headers") or [])
    sheet["raw"] = [headers] + [[row.get(header, "") for header in headers] for row in sheet.get("rows", [])]


def supplement_row(item: dict) -> dict:
    return {header: item.get(header, "") for header in SUPPLEMENT_HEADERS}


def rebuild_supplements_matrix(payload: dict) -> int:
    sheets = payload.setdefault("sheets", {})
    if METHODS_SHEET not in sheets:
        raise KeyError(f"Missing sheet in workbook JSON: {METHODS_SHEET}")

    methods_sheet = sheets[METHODS_SHEET]
    methods_sheet.setdefault("rows", [])
    supplement_keys = {normalize_key(item["Supplement_Name"]) for item in SUPPLEMENTS}
    supplement_keys.add(normalize_key("NAC (N-Acetylcysteine)"))

    strip_old_supplement_columns(methods_sheet)
    methods_sheet["rows"] = [
        row for row in methods_sheet["rows"] if normalize_key(row.get("Method")) not in supplement_keys
    ]

    for row in methods_sheet["rows"]:
        for column in methods_sheet["headers"]:
            row.setdefault(column, "")
    rebuild_raw_from_rows(methods_sheet)

    supplements_sheet = {
        "headers": SUPPLEMENT_HEADERS,
        "rows": [supplement_row(item) for item in SUPPLEMENTS],
    }
    rebuild_raw_from_rows(supplements_sheet)
    sheets[SUPPLEMENTS_SHEET] = supplements_sheet

    update_dashboard_counts(payload)
    payload["generatedAt"] = datetime.now().isoformat(timespec="seconds")
    payload["sourceWorkbook"] = WORKBOOK_PATH.name
    return len(SUPPLEMENTS)


def update_dashboard_counts(payload: dict) -> None:
    dashboard = payload.get("sheets", {}).get("Dashboard")
    methods = payload.get("sheets", {}).get(METHODS_SHEET, {}).get("rows", [])
    if not dashboard:
        return

    metrics = {
        "Total methods": len(methods),
        "High evidence methods": sum(1 for row in methods if str(row.get("Clinical evidence grade", "")).strip().lower() == "high"),
        "Safety-sensitive / caution rows": sum(1 for row in methods if numeric(row.get("Safety score (1-5)")) is not None and numeric(row.get("Safety score (1-5)")) <= 2),
    }

    for row in dashboard.get("rows", []):
        metric = str(row.get("Metric", ""))
        if metric in metrics:
            row["Value"] = metrics[metric]

    raw = dashboard.get("raw") or []
    header_index = next((index for index, row in enumerate(raw) if "Metric" in row and "Value" in row), None)
    if header_index is None:
        return
    headers = [str(value) if value else f"Column {index + 1}" for index, value in enumerate(raw[header_index])]
    metric_index = headers.index("Metric")
    value_index = headers.index("Value")
    for raw_row in raw[header_index + 1 :]:
        if len(raw_row) <= max(metric_index, value_index):
            continue
        metric = str(raw_row[metric_index])
        if metric in metrics:
            raw_row[value_index] = metrics[metric]


def numeric(value: object) -> float | None:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def write_json(payload: dict) -> None:
    JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def excel_column(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def cell_xml(value: object, row_index: int, column_index: int) -> str:
    cell_ref = f"{excel_column(column_index)}{row_index}"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f'<c r="{cell_ref}"><v>{value}</v></c>'
    value_text = escape(clean_xml_text(value))
    return f'<c r="{cell_ref}" t="inlineStr"><is><t>{value_text}</t></is></c>'


def sheet_xml(rows: list[list[object]]) -> str:
    row_xml = []
    for row_index, row in enumerate(rows, start=1):
        cells = "".join(cell_xml(value, row_index, column_index) for column_index, value in enumerate(row, start=1))
        row_xml.append(f'<row r="{row_index}">{cells}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(row_xml)}</sheetData>'
        "</worksheet>"
    )


def write_xlsx(payload: dict) -> None:
    sheets = payload.get("sheets", {})
    sheet_names = list(sheets)
    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"

    content_types = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    ]
    for index in range(1, len(sheet_names) + 1):
        content_types.append(
            f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
    content_types.append("</Types>")

    workbook_sheets = "".join(
        f'<sheet name={quoteattr(clean_xml_text(name)[:31])} sheetId="{index}" r:id="rId{index}"/>'
        for index, name in enumerate(sheet_names, start=1)
    )
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<sheets>{workbook_sheets}</sheets>"
        "</workbook>"
    )
    workbook_rels = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ]
    for index in range(1, len(sheet_names) + 1):
        workbook_rels.append(
            f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        )
    workbook_rels.append("</Relationships>")

    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        "</Relationships>"
    )
    core_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" '
        'xmlns:dcterms="http://purl.org/dc/terms/" '
        'xmlns:dcmitype="http://purl.org/dc/dcmitype/" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        "<dc:creator>AnxietyFlow</dc:creator>"
        f"<dcterms:created xsi:type=\"dcterms:W3CDTF\">{now}</dcterms:created>"
        f"<dcterms:modified xsi:type=\"dcterms:W3CDTF\">{now}</dcterms:modified>"
        "</cp:coreProperties>"
    )
    app_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
        "<Application>AnxietyFlow</Application>"
        "</Properties>"
    )

    with zipfile.ZipFile(WORKBOOK_PATH, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "".join(content_types))
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("docProps/core.xml", core_xml)
        archive.writestr("docProps/app.xml", app_xml)
        archive.writestr("xl/workbook.xml", workbook_xml)
        archive.writestr("xl/_rels/workbook.xml.rels", "".join(workbook_rels))
        for index, name in enumerate(sheet_names, start=1):
            rows = sheets[name].get("raw") or [sheets[name].get("headers", [])]
            archive.writestr(f"xl/worksheets/sheet{index}.xml", sheet_xml(rows))


def main() -> int:
    payload = load_payload()
    changed = rebuild_supplements_matrix(payload)
    write_json(payload)
    write_xlsx(payload)
    print(f"Built Supplements sheet with {changed} rows.")
    print(f"Wrote {WORKBOOK_PATH.relative_to(ROOT)}")
    print(f"Wrote {JSON_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
