#!/usr/bin/env python3
"""Crop rectangular regions from a PDF and return them as base64 PNGs.

Stdin JSON:
  {
    "pdfBase64": "<base64 bytes>",
    "dpi": 200,
    "crops": [
      { "id": "c0", "page": 74, "bbox": [x0, y0, x1, y1] }   // normalized 0..1, 1-indexed page
    ]
  }

Stdout JSON:
  {
    "crops":  [ { "id": "c0", "pngBase64": "...", "width": W, "height": H } ],
    "errors": [ { "id": "c0", "error": "..." } ]
  }
"""

import base64
import json
import sys

import fitz


def main():
    payload = json.load(sys.stdin)
    pdf_b64 = payload.get("pdfBase64", "")
    crops = payload.get("crops", [])
    dpi = int(payload.get("dpi", 200))
    if not pdf_b64:
        raise ValueError("pdfBase64 is required")

    pdf_bytes = base64.b64decode(pdf_b64)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_count = doc.page_count
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    results = []
    errors = []

    for crop in crops:
        cid = crop.get("id", "")
        try:
            page_1based = int(crop.get("page", 0))
            bbox = crop.get("bbox", [])
            if len(bbox) != 4:
                raise ValueError(f"bbox must have 4 values, got {len(bbox)}")
            x0, y0, x1, y1 = [max(0.0, min(1.0, float(v))) for v in bbox]
            if x1 <= x0 or y1 <= y0:
                raise ValueError(f"bbox has zero or negative area: {bbox}")
            idx = page_1based - 1
            if idx < 0 or idx >= page_count:
                raise ValueError(f"page {page_1based} out of range (1..{page_count})")
            page = doc.load_page(idx)
            rect = page.rect
            clip = fitz.Rect(
                rect.x0 + x0 * rect.width,
                rect.y0 + y0 * rect.height,
                rect.x0 + x1 * rect.width,
                rect.y0 + y1 * rect.height,
            )
            pix = page.get_pixmap(matrix=matrix, alpha=False, clip=clip)
            png_bytes = pix.tobytes("png")
            results.append({
                "id": cid,
                "pngBase64": base64.b64encode(png_bytes).decode("ascii"),
                "width": pix.width,
                "height": pix.height,
            })
        except Exception as err:
            errors.append({"id": cid, "error": str(err)})

    json.dump({"crops": results, "errors": errors}, sys.stdout)


if __name__ == "__main__":
    main()
