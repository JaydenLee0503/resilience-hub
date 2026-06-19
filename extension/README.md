# Beacon Atlas PDF Sender

This is a basic unpacked Chrome extension for the hackathon demo.

## Load it

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select this `extension` folder.

## Use it

1. Open a PDF or page with selectable text in Chrome.
2. Click the Beacon Atlas extension.
3. Click Send current tab.
4. The local app opens at `http://localhost:5173` with the extracted text ready on the dashboard.

Scanned image-only PDFs do not contain selectable text, so this extension cannot OCR them yet.
