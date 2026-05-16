# Anxiety Methods Database

A static single-page web app built from `reddit_anxiety_methods_database.xlsx`.

The app is for educational and self-management support only. It is not medical advice, diagnosis, psychotherapy, crisis support, or a replacement for a licensed clinician.

## Structure

- `index.html` - app shell
- `styles.css` - dark clinical dashboard styling
- `app.js` - workbook mapping, filters, tabs, charts, and modal detail view
- `data/workbook.json` - generated from the Excel workbook
- `scripts/convert_workbook.py` - regenerates JSON from the workbook

## Run locally

From this folder:

```bash
python3 -m http.server 8000
```

Then open on Mac:

```text
http://localhost:8000
```

For iPhone on the same Wi-Fi:

```text
http://192.168.7.8:8000
```

## Refresh data from the workbook

If the workbook changes, regenerate the JSON:

```bash
python3 scripts/convert_workbook.py /Users/skybutu/Downloads/reddit_anxiety_methods_database.xlsx data/workbook.json
```

The app hides optional fields when matching columns are missing and logs a clear warning in the browser console.
