#!/usr/bin/env python3
import base64
import io
import json
import sys

import fitz


def norm_bbox(rect, width, height):
    if width <= 0 or height <= 0:
        return {"x": 0, "y": 0, "w": 1, "h": 1}
    x0 = max(0.0, min(1.0, rect.x0 / width))
    y0 = max(0.0, min(1.0, rect.y0 / height))
    x1 = max(0.0, min(1.0, rect.x1 / width))
    y1 = max(0.0, min(1.0, rect.y1 / height))
    return {
        "x": x0,
        "y": y0,
        "w": max(0.001, x1 - x0),
        "h": max(0.001, y1 - y0),
    }


def main():
    payload = json.load(sys.stdin)
    pdf_b64 = payload.get("fileBase64", "")
    if not pdf_b64:
      raise ValueError("fileBase64 is required")

    pdf_bytes = base64.b64decode(pdf_b64)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    blocks = []
    page_images = []
    block_index = 0

    for page_no in range(doc.page_count):
        page = doc.load_page(page_no)
        pix = page.get_pixmap(alpha=False)
        page_png = pix.tobytes("png")
        page_width = float(page.rect.width or 1)
        page_height = float(page.rect.height or 1)
        page_images.append({
            "page": page_no + 1,
            "imageBase64": base64.b64encode(page_png).decode("utf-8"),
            "width": pix.width,
            "height": pix.height,
        })

        text_dict = page.get_text("dict")
        for block in text_dict.get("blocks", []):
            block_type = block.get("type", 0)
            bbox = fitz.Rect(block.get("bbox", [0, 0, 0, 0]))
            if block_type == 0:
                lines = []
                for line in block.get("lines", []):
                    spans = [span.get("text", "") for span in line.get("spans", [])]
                    joined = "".join(spans).strip()
                    if joined:
                        lines.append(joined)
                text = "\n".join(lines).strip()
                if not text:
                    continue
                block_index += 1
                blocks.append({
                    "id": f"b{block_index}",
                    "page": page_no + 1,
                    "order": len(blocks) + 1,
                    "kind": "text",
                    "role": "unassigned",
                    "groupKey": "",
                    "text": text,
                    "bbox": norm_bbox(bbox, page_width, page_height),
                })

        # Some PDFs contain real embedded images that do not appear as block_type == 1
        # in page.get_text("dict"). Enumerate placed page images directly so the admin
        # OCR panel can surface them as image blocks.
        seen_image_instances = set()
        for image in page.get_images(full=True):
            xref = image[0]
            if not xref:
                continue
            try:
                image_info = doc.extract_image(xref)
                image_bytes = image_info.get("image")
                if not image_bytes:
                    continue
                rects = page.get_image_rects(xref)
                if not rects:
                    continue
                for rect in rects:
                    key = (
                        xref,
                        round(rect.x0, 2),
                        round(rect.y0, 2),
                        round(rect.x1, 2),
                        round(rect.y1, 2),
                    )
                    if key in seen_image_instances:
                        continue
                    seen_image_instances.add(key)
                    block_index += 1
                    blocks.append({
                        "id": f"b{block_index}",
                        "page": page_no + 1,
                        "order": len(blocks) + 1,
                        "kind": "image",
                        "role": "unassigned",
                        "groupKey": "",
                        "imageBase64": base64.b64encode(image_bytes).decode("utf-8"),
                        "imageExt": image_info.get("ext", "png"),
                        "bbox": norm_bbox(rect, page_width, page_height),
                    })
            except Exception:
                continue

    print(json.dumps({
        "ok": True,
        "pages": doc.page_count,
        "blocks": blocks,
        "pageImages": page_images,
    }))


if __name__ == "__main__":
    main()
