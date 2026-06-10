#!/usr/bin/env python3
"""
Extract raw text from AP CED PDFs with PyMuPDF and optionally run a strict
Anthropic pass that only returns verbatim LO / EK text as JSON.

Examples:
  python scripts/ap_ced_verbatim_pipeline.py extract --preset ap-physics-c-mechanics --out /tmp/mech.txt
  python scripts/ap_ced_verbatim_pipeline.py ai --preset ap-physics-c-mechanics --out /tmp/mech.json
  python scripts/ap_ced_verbatim_pipeline.py ai --pdf /path/to/file.pdf --course "AP Physics C: Mechanics" --units 1 2
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import textwrap
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Tuple

import fitz


PRESETS: Dict[str, Dict[str, object]] = {
    "ap-physics-1": {
        "course": "AP Physics 1: Algebra-Based",
        "pdf": "/home/koustubh/Downloads/AP Physics/AP® Physics 1_ Algebra-Based Course and Exam Description.pdf",
        "units": [1, 2, 3, 4, 5, 6, 7, 8],
    },
    "ap-physics-c-mechanics": {
        "course": "AP Physics C: Mechanics",
        "pdf": "/home/koustubh/Downloads/AP Physics/AP Physics C(Mechanics)/ap-physics-c-mechanics-course-and-exam-description.pdf",
        "units": [1, 2, 3, 4, 5, 6, 7],
    },
    "ap-physics-c-em": {
        "course": "AP Physics C: Electricity and Magnetism",
        "pdf": "/home/koustubh/Downloads/AP® Physics C_ Electricity and Magnetism Course and Exam Description - ap-physics-c-electricity-and-magnetism-course-and-exam-description.pdf",
        "units": [8, 9, 10, 11, 12, 13],
    },
    "ap-calculus-ab-bc": {
        "course": "AP Calculus AB and BC",
        "pdf": "/home/koustubh/Downloads/AP Calculus BC/ap-calculus-ab-and-bc-course-and-exam-description.pdf",
        "units": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    for name in ("extract", "ai"):
        p = sub.add_parser(name)
        p.add_argument("--preset", choices=sorted(PRESETS))
        p.add_argument("--pdf", help="Path to the CED PDF")
        p.add_argument("--course", help="Course name for prompt/output")
        p.add_argument("--units", nargs="*", type=int, help="Limit AI pass to these unit numbers")
        p.add_argument("--out", help="Write output to this file instead of stdout")
        p.add_argument("--keep-page-markers", action="store_true")
        if name == "ai":
            p.add_argument("--model", default="claude-sonnet-4-20250514")
            p.add_argument("--api-key-env", default="ANTHROPIC_API_KEY")
            p.add_argument("--max-tokens", type=int, default=6000)
            p.add_argument("--temperature", type=float, default=0.0)

    return parser.parse_args()


def resolve_subject(args: argparse.Namespace) -> Tuple[str, Path, List[int]]:
    if args.preset:
        preset = PRESETS[args.preset]
        course = str(args.course or preset["course"])
        pdf = Path(str(args.pdf or preset["pdf"]))
        units = list(args.units or preset["units"])
    else:
        if not args.pdf or not args.course:
            raise SystemExit("--pdf and --course are required when --preset is not used")
        course = str(args.course)
        pdf = Path(args.pdf)
        units = list(args.units or [])
    if not pdf.exists():
        raise SystemExit(f"PDF not found: {pdf}")
    return course, pdf, units


def extract_page_text(pdf_path: Path, keep_page_markers: bool = False) -> str:
    doc = fitz.open(pdf_path)
    chunks: List[str] = []
    for idx, page in enumerate(doc):
        text = page.get_text("text")
        if not text:
            continue
        if keep_page_markers:
            chunks.append(f"\n=== PAGE {idx + 1} ===\n{text.strip()}\n")
        else:
            chunks.append(text.strip())
    return "\n\n".join(chunks).strip() + "\n"


def sanitize_text(raw: str) -> str:
    lines = []
    for line in raw.splitlines():
        compact = " ".join(line.replace("\u2002", " ").replace("\u2003", " ").split())
        if not compact:
            lines.append("")
            continue
        if compact.startswith("Return to Table of Contents"):
            continue
        if compact.startswith("© 2024 College Board") or compact.startswith("© 2020 College Board"):
            continue
        if compact == "THIS PAGE IS INTENTIONALLY LEFT BLANK.":
            continue
        if re.match(r"^Course Framework.*\|\s*\d+$", compact):
            continue
        lines.append(compact)
    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip() + "\n"


def split_units(raw_text: str, unit_numbers: List[int]) -> Dict[int, str]:
    if not unit_numbers:
        return {}
    unit_positions: List[Tuple[int, int]] = []
    for unit in unit_numbers:
        patterns = [
            re.compile(rf"\bUNIT\s+{unit}\b"),
            re.compile(rf"\bUnit\s+{unit}:\b"),
        ]
        best = None
        for pattern in patterns:
            match = pattern.search(raw_text)
            if match and (best is None or match.start() < best):
                best = match.start()
        if best is not None:
            unit_positions.append((unit, best))
    unit_positions.sort(key=lambda item: item[1])
    chunks: Dict[int, str] = {}
    for idx, (unit, start) in enumerate(unit_positions):
        end = unit_positions[idx + 1][1] if idx + 1 < len(unit_positions) else len(raw_text)
        chunks[unit] = raw_text[start:end].strip()
    return chunks


def strict_prompt(course: str, unit_number: int | None, unit_text: str) -> str:
    scope = f"{course} unit {unit_number}" if unit_number is not None else course
    return textwrap.dedent(
        f"""
        You are extracting official curriculum taxonomy from a College Board Course and Exam Description.

        Scope: {scope}

        Rules:
        - Only return objectives that appear verbatim in the provided text.
        - Do not infer, summarize, paraphrase, normalize, simplify, or add anything.
        - If a topic title, LO text, or EK text cannot be recovered verbatim from the text, omit it.
        - Do not repair or improve wording.
        - Do not include boundary statements, exclusion statements, suggested skills, examples, or commentary unless they are literally part of the LO or EK statement.
        - Return only valid JSON. No markdown fences. No explanation.

        JSON schema:
        {{
          "course": "{course}",
          "unit": {json.dumps(unit_number)},
          "topics": [
            {{
              "id": "1.1",
              "title": "verbatim topic title",
              "learning_objectives": [
                {{
                  "id": "1.1.A",
                  "text": "verbatim LO text",
                  "essential_knowledge": [
                    {{
                      "id": "1.1.A.1",
                      "text": "verbatim EK text"
                    }}
                  ]
                }}
              ]
            }}
          ]
        }}

        Source text:
        {unit_text}
        """
    ).strip()


def anthropic_messages(prompt: str, model: str, max_tokens: int, temperature: float, api_key: str) -> str:
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [{"role": "user", "content": prompt}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    parts = payload.get("content") or []
    text = "".join(part.get("text", "") for part in parts if isinstance(part, dict))
    return text.strip()


def parse_json_response(text: str) -> dict:
    raw = text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?", "", raw).strip()
        raw = re.sub(r"```$", "", raw).strip()
    return json.loads(raw)


def run_ai(course: str, raw_text: str, units: List[int], args: argparse.Namespace) -> dict:
    api_key = os.environ.get(args.api_key_env, "")
    if not api_key:
        raise SystemExit(f"Missing API key env: {args.api_key_env}")

    unit_chunks = split_units(raw_text, units)
    if units and not unit_chunks:
        raise SystemExit("Could not identify unit chunks in extracted text. Try running extract first and inspect the text.")

    if unit_chunks:
        outputs = []
        for unit in units:
            chunk = unit_chunks.get(unit)
            if not chunk:
                continue
            prompt = strict_prompt(course, unit, chunk)
            response_text = anthropic_messages(prompt, args.model, args.max_tokens, args.temperature, api_key)
            outputs.append(parse_json_response(response_text))
        return {
            "course": course,
            "source": "College Board Course and Exam Description",
            "units": outputs,
        }

    prompt = strict_prompt(course, None, raw_text)
    response_text = anthropic_messages(prompt, args.model, args.max_tokens, args.temperature, api_key)
    return parse_json_response(response_text)


def write_output(content: str, out_path: str | None) -> None:
    if out_path:
        Path(out_path).write_text(content, encoding="utf-8")
    else:
        sys.stdout.write(content)


def main() -> None:
    args = parse_args()
    course, pdf_path, units = resolve_subject(args)
    raw = extract_page_text(pdf_path, keep_page_markers=args.keep_page_markers)
    cleaned = sanitize_text(raw)

    if args.command == "extract":
        write_output(cleaned, args.out)
        return

    result = run_ai(course, cleaned, units, args)
    write_output(json.dumps(result, indent=2, ensure_ascii=False) + "\n", args.out)


if __name__ == "__main__":
    main()
