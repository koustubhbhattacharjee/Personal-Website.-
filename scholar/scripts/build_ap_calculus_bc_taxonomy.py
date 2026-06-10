#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from collections import OrderedDict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_MD = Path("/home/koustubh/Downloads/ap-calculus-ab-and-bc-course-and-exam-description.md")
OUTPUT_JSON = ROOT / "data" / "generated-ap-calculus-bc-taxonomy.json"
DISTRICT_TAXONOMY = ROOT / "lib" / "district-taxonomy.js"


UNIT_NAMES = {
    1: "Limits and Continuity",
    2: "Differentiation: Definition and Fundamental Properties",
    3: "Differentiation: Composite, Implicit, and Inverse Functions",
    4: "Contextual Applications of Differentiation",
    5: "Analytical Applications of Differentiation",
    6: "Integration and Accumulation of Change",
    7: "Differential Equations",
    8: "Applications of Integration",
    9: "Parametric Equations, Polar Coordinates, and Vector-Valued Functions (BC)",
    10: "Infinite Sequences and Series (BC)",
}


TOPIC_RE = re.compile(r"(?m)^##+\s+\*{0,2}TOPIC\s+(\d+\.\d+)\b")
LO_RE = re.compile(r"\b([A-Z]{3}-\d\.[A-Z])\b")
EK_RE = re.compile(r"\b([A-Z]{3}-\d\.[A-Z]\.\d+(?:\.[ivx]+)?)\b", re.I)


def clean_line(line: str) -> str:
    s = line.strip()
    s = re.sub(r"^#+\s*", "", s)
    s = s.replace("**", "")
    s = s.replace("*", "")
    s = s.replace("\\(", "(").replace("\\)", ")")
    s = s.replace("\u00a0", " ")
    s = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def clean_text(lines: list[str]) -> str:
    parts: list[str] = []
    for raw in lines:
        s = clean_line(raw)
        if not s:
            continue
        upper = s.upper()
        if upper.startswith("SUGGESTED SKILL"):
            break
        if upper.startswith("AVAILABLE RESOURCE"):
            break
        if upper.startswith("ILLUSTRATIVE EXAMPLES"):
            break
        if upper.startswith("EXCLUSION STATEMENT"):
            break
        if upper.startswith("BOUNDARY STATEMENT"):
            break
        if upper.startswith("RETURN TO TABLE OF CONTENTS"):
            break
        if upper.startswith("TOPIC "):
            break
        if upper.startswith("AP CALCULUS AB AND BC"):
            continue
        if re.fullmatch(r"\d+", s):
            continue
        parts.append(s)
    text = " ".join(parts)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def is_heading(line: str, label: str) -> bool:
    return clean_line(line).upper() == label


def should_stop_block(line: str) -> bool:
    upper = clean_line(line).upper()
    return (
        upper.startswith("SUGGESTED SKILL")
        or upper.startswith("AVAILABLE RESOURCE")
        or upper.startswith("ILLUSTRATIVE EXAMPLES")
        or upper.startswith("EXCLUSION STATEMENT")
        or upper.startswith("BOUNDARY STATEMENT")
        or upper.startswith("TOPIC ")
        or upper.startswith("UNIT ")
        or upper.startswith("AP CALCULUS AB AND BC")
    )


def find_lo_token(line: str) -> str | None:
    s = clean_line(line)
    matches = LO_RE.findall(s)
    return matches[0] if matches else None


def find_ek_token(line: str) -> str | None:
    s = clean_line(line)
    s = s.replace(" .", ".")
    matches = EK_RE.findall(s)
    return matches[0] if matches else None


def ek_parent(ek_id: str) -> str:
    return ".".join(ek_id.split(".")[:2])


def infer_next_ek_id(lo_id: str, obj: dict) -> str:
    nums = []
    for sub in obj["subtopics"]:
        m = re.fullmatch(re.escape(lo_id) + r"\.(\d+)", sub["id"])
        if m:
            nums.append(int(m.group(1)))
    return f"{lo_id}.{max(nums, default=0) + 1}"


def infer_missing_orphans(lo_id: str, obj: dict, orphan_texts: list[list[str]], upcoming_ek: str | None) -> None:
    if not orphan_texts:
        return
    start_num = 1
    if upcoming_ek:
        m = re.fullmatch(re.escape(lo_id) + r"\.(\d+)", upcoming_ek)
        if m:
            n = int(m.group(1))
            if len(orphan_texts) < n:
                start_num = max(1, n - len(orphan_texts))
    seen = {s["id"] for s in obj["subtopics"]}
    for orphan in orphan_texts:
        text = clean_text(orphan)
        if not text:
            start_num += 1
            continue
        sid = f"{lo_id}.{start_num}"
        while sid in seen:
            start_num += 1
            sid = f"{lo_id}.{start_num}"
        obj["subtopics"].append({"id": sid, "text": text})
        seen.add(sid)
        start_num += 1


def parse_topic(topic_id: str, block: str) -> list[dict]:
    lines = block.splitlines()
    topic_name_lines: list[str] = []
    i = 0
    while i < len(lines):
        s = clean_line(lines[i])
        if not s:
            i += 1
            continue
        if (
            s.upper().startswith("REQUIRED COURSE CONTENT")
            or s.upper().startswith("ENDURING UNDERSTANDING")
            or s.upper().startswith("LEARNING OBJECTIVE")
            or find_lo_token(lines[i])
            or find_ek_token(lines[i])
        ):
            break
        topic_name_lines.append(lines[i])
        i += 1
    topic_name = clean_text(topic_name_lines)

    objectives: "OrderedDict[str, dict]" = OrderedDict()
    current_lo: str | None = None
    current_ek: str | None = None
    mode: str | None = None
    lo_text_lines: list[str] = []
    ek_text_lines: list[str] = []
    orphan_ek_texts: list[list[str]] = []

    def get_obj(lo_id: str) -> dict:
        if lo_id not in objectives:
            objectives[lo_id] = {"code": lo_id, "name": "", "subtopics": []}
        return objectives[lo_id]

    def flush_lo() -> None:
        nonlocal lo_text_lines
        if current_lo:
            text = clean_text(lo_text_lines)
            if text:
                obj = get_obj(current_lo)
                if not obj["name"]:
                    obj["name"] = text
        lo_text_lines = []

    def flush_current_ek() -> None:
        nonlocal current_ek, ek_text_lines
        if current_lo and current_ek:
            text = clean_text(ek_text_lines)
            if text:
                obj = get_obj(current_lo)
                if not any(s["id"] == current_ek for s in obj["subtopics"]):
                    obj["subtopics"].append({"id": current_ek, "text": text})
        current_ek = None
        ek_text_lines = []

    while i < len(lines):
        raw = lines[i]
        s = clean_line(raw)
        if not s:
            i += 1
            continue
        if should_stop_block(raw):
            break
        if is_heading(raw, "LEARNING OBJECTIVE") or is_heading(raw, "LEARNING OBJECTIVE ESSENTIAL KNOWLEDGE"):
            flush_current_ek()
            if current_lo and orphan_ek_texts:
                infer_missing_orphans(current_lo, get_obj(current_lo), orphan_ek_texts, None)
                orphan_ek_texts = []
            flush_lo()
            mode = "lo"
            i += 1
            continue
        if is_heading(raw, "ESSENTIAL KNOWLEDGE"):
            flush_lo()
            mode = "ek"
            i += 1
            continue

        ek_token = find_ek_token(raw)
        lo_token = find_lo_token(raw)

        if ek_token:
            target_lo = ek_parent(ek_token)
            if current_ek:
                flush_current_ek()
            if current_lo and orphan_ek_texts:
                infer_missing_orphans(current_lo, get_obj(current_lo), orphan_ek_texts, ek_token)
                orphan_ek_texts = []
            current_lo = target_lo
            get_obj(current_lo)
            current_ek = ek_token
            mode = "ek"
            i += 1
            continue

        if lo_token:
            if current_ek:
                flush_current_ek()
            if current_lo and orphan_ek_texts:
                infer_missing_orphans(current_lo, get_obj(current_lo), orphan_ek_texts, None)
                orphan_ek_texts = []
            flush_lo()
            current_lo = lo_token
            get_obj(current_lo)
            mode = "lo"
            i += 1
            continue

        if mode == "ek" and current_lo:
            if orphan_ek_texts and clean_text(orphan_ek_texts[-1]).endswith((".", ")", '"')):
                orphan_ek_texts.append([raw])
            elif current_ek:
                ek_text_lines.append(raw)
            else:
                if orphan_ek_texts:
                    orphan_ek_texts[-1].append(raw)
                else:
                    orphan_ek_texts.append([raw])
            i += 1
            continue

        if mode == "lo" and current_lo:
            lo_text_lines.append(raw)
            i += 1
            continue

        # Sometimes the block starts with orphan EK prose before the first explicit id.
        if current_lo:
            lo_text_lines.append(raw)
        i += 1

    if current_ek:
        flush_current_ek()
    if current_lo and orphan_ek_texts:
        infer_missing_orphans(current_lo, get_obj(current_lo), orphan_ek_texts, None)
    flush_lo()

    cleaned: list[dict] = []
    for obj in objectives.values():
        if not obj["name"]:
            obj["name"] = topic_name
        if obj["subtopics"]:
            cleaned.append(obj)
    return cleaned


def merge_unit_objectives(objs: list[dict]) -> list[dict]:
    merged: "OrderedDict[str, dict]" = OrderedDict()
    for obj in objs:
        if obj["code"] not in merged:
            merged[obj["code"]] = {
                "code": obj["code"],
                "name": obj["name"],
                "subtopics": list(obj["subtopics"]),
            }
            continue
        existing = merged[obj["code"]]
        if not existing["name"] and obj["name"]:
            existing["name"] = obj["name"]
        seen = {s["id"] for s in existing["subtopics"]}
        for sub in obj["subtopics"]:
            if sub["id"] not in seen:
                existing["subtopics"].append(sub)
                seen.add(sub["id"])
    return list(merged.values())


def build_taxonomy() -> dict:
    text = SOURCE_MD.read_text()
    standards: list[dict] = []
    by_unit: dict[int, list[dict]] = {n: [] for n in UNIT_NAMES}
    matches = list(TOPIC_RE.finditer(text))
    for idx, match in enumerate(matches):
        topic_id = match.group(1)
        unit_num = int(topic_id.split(".")[0])
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        block = text[start:end]
        by_unit[unit_num].extend(parse_topic(topic_id, block))
    for unit_num, unit_name in UNIT_NAMES.items():
        standards.append({
            "code": f"APCBC.{unit_num}",
            "name": unit_name,
            "objectives": merge_unit_objectives(by_unit[unit_num]),
        })
    taxonomy = {"ap_calculus": {"ap calc": {"standards": standards}}}
    postprocess_calculus_taxonomy(taxonomy)
    return taxonomy


def postprocess_calculus_taxonomy(taxonomy: dict) -> None:
    standards = taxonomy["ap_calculus"]["ap calc"]["standards"]
    by_code: dict[str, dict] = {}
    for std in standards:
        for obj in std["objectives"]:
            by_code[obj["code"]] = obj

    def ensure_obj(unit_code: str, code: str, name: str, subtopics: list[tuple[str, str]]) -> None:
        obj = by_code.get(code)
        if not obj:
            std = next(s for s in standards if s["code"] == unit_code)
            obj = {"code": code, "name": name, "subtopics": []}
            std["objectives"].append(obj)
            by_code[code] = obj
        obj["name"] = name
        existing = {s["id"]: s for s in obj["subtopics"]}
        for sid, text in subtopics:
            existing[sid] = {"id": sid, "text": text}
        obj["subtopics"] = sorted(existing.values(), key=lambda s: s["id"])

    ensure_obj(
        "APCBC.1",
        "LIM-1.B",
        "Interpret limits expressed in analytic notation.",
        [
            ("LIM-1.B.1", "A limit can be expressed in multiple ways, including graphically, numerically, and analytically."),
        ],
    )
    ensure_obj(
        "APCBC.1",
        "LIM-1.C",
        "Estimate limits of functions.",
        [
            ("LIM-1.C.1", "The concept of a limit includes one sided limits."),
            ("LIM-1.C.2", "Graphical information about a function can be used to estimate limits."),
            ("LIM-1.C.3", "Because of issues of scale, graphical representations of functions may miss important function behavior."),
            ("LIM-1.C.4", "A limit might not exist for some functions at particular values of x. Some ways that the limit might not exist are if the function is unbounded, if the function is oscillating near this value, or if the limit from the left does not equal the limit from the right."),
            ("LIM-1.C.5", "Numerical information can be used to estimate limits."),
        ],
    )
    ensure_obj(
        "APCBC.3",
        "FUN-3.E",
        "Calculate derivatives of inverse and inverse trigonometric functions.",
        [
            ("FUN-3.E.1", "The chain rule and definition of an inverse function can be used to find the derivative of an inverse function, provided the derivative exists."),
            ("FUN-3.E.2", "The chain rule applied with the definition of an inverse function, or the formula for the derivative of an inverse function, can be used to find the derivatives of inverse trigonometric functions."),
        ],
    )
    ensure_obj(
        "APCBC.4",
        "CHA-3.B",
        "Calculate rates of change in applied contexts.",
        [
            ("CHA-3.B.1", "The derivative can be used to solve rectilinear motion problems involving position, speed, velocity, and acceleration."),
        ],
    )
    ensure_obj(
        "APCBC.4",
        "CHA-3.D",
        "Calculate related rates in applied contexts.",
        [
            ("CHA-3.D.1", "The chain rule is the basis for differentiating variables in a related rates problem with respect to the same independent variable."),
            ("CHA-3.D.2", "Other differentiation rules, such as the product rule and the quotient rule, may also be necessary to differentiate all variables with respect to the same independent variable."),
        ],
    )
    ensure_obj(
        "APCBC.4",
        "LIM-4.A",
        "Determine limits of functions that result in indeterminate forms.",
        [
            ("LIM-4.A.1", "When the ratio of two functions tends to $\\frac{0}{0}$ or $\\frac{\\infty}{\\infty}$ in the limit, such forms are said to be indeterminate."),
            ("LIM-4.A.2", "Limits of the indeterminate forms $\\frac{0}{0}$ or $\\frac{\\infty}{\\infty}$ may be evaluated using L'Hospital's Rule."),
        ],
    )
    ensure_obj(
        "APCBC.5",
        "FUN-4.B",
        "Calculate minimum and maximum values in applied contexts or analysis of functions.",
        [
            ("FUN-4.B.1", "The derivative can be used to solve optimization problems; that is, finding a minimum or maximum value of a function on a given interval."),
        ],
    )
    ensure_obj(
        "APCBC.6",
        "LIM-6.A",
        "Evaluate an improper integral or determine that the integral diverges. BC ONLY",
        [
            ("LIM-6.A.1", "An improper integral is an integral that has one or both limits infinite or has an integrand that is unbounded in the interval of integration. BC ONLY"),
            ("LIM-6.A.2", "Improper integrals can be determined using limits of definite integrals. BC ONLY"),
        ],
    )
    ensure_obj(
        "APCBC.8",
        "CHA-5.B",
        "Calculate volumes of solids with known cross sections using definite integrals.",
        [
            ("CHA-5.B.1", "Volumes of solids with square and rectangular cross sections can be found using definite integrals and the area formulas for these shapes."),
            ("CHA-5.B.2", "Volumes of solids with triangular cross sections can be found using definite integrals and the area formulas for these shapes."),
            ("CHA-5.B.3", "Volumes of solids with semicircular and other geometrically defined cross sections can be found using definite integrals and the area formulas for these shapes."),
        ],
    )
    ensure_obj(
        "APCBC.8",
        "CHA-5.C",
        "Calculate volumes of solids of revolution using definite integrals.",
        [
            ("CHA-5.C.1", "Volumes of solids of revolution around the x- or y-axis may be found by using definite integrals with the disc method."),
            ("CHA-5.C.2", "Volumes of solids of revolution around any horizontal or vertical line in the plane may be found by using definite integrals with the disc method."),
            ("CHA-5.C.3", "Volumes of solids of revolution around the x- or y-axis whose cross sections are ring shaped may be found using definite integrals with the washer method."),
            ("CHA-5.C.4", "Volumes of solids of revolution around any horizontal or vertical line whose cross sections are ring shaped may be found using definite integrals with the washer method."),
        ],
    )
    ensure_obj(
        "APCBC.8",
        "CHA-6.A",
        "Determine the length of a curve in the plane defined by a function, using a definite integral. BC ONLY",
        [
            ("CHA-6.A.1", "The length of a planar curve defined by a function can be calculated using a definite integral. BC ONLY"),
        ],
    )
    ensure_obj(
        "APCBC.10",
        "LIM-8.B",
        "Approximate function values using a Taylor polynomial. BC ONLY",
        [
            ("LIM-8.B.1", "Taylor polynomials for a function f centered at x = a can be used to approximate function values of f near x = a. BC ONLY"),
        ],
    )

    for std in standards:
        std["objectives"] = sorted(std["objectives"], key=lambda o: o["code"])


def render_js_entry(key: str, value: dict) -> str:
    dumped = json.dumps(value, indent=2, ensure_ascii=False)
    lines = dumped.splitlines()
    rendered = [f'  "{key}": {lines[0]}']
    rendered.extend(f"  {line}" for line in lines[1:])
    rendered[-1] += ","
    return "\n".join(rendered)


def replace_ap_calculus_section(js_text: str, entry_text: str) -> str:
    start_marker = '  //  AP Calculus AB and BC'
    end_marker = '  // ─────────────────────────────────────────────\n  //  SAT Math'
    start = js_text.index(start_marker)
    end = js_text.index(end_marker)
    comment = (
        "  // ─────────────────────────────────────────────\n"
        "  //  AP Calculus AB and BC (Marker markdown extracted from official CED)\n"
        "  //  Unit codes remain APCBC.* for compatibility.\n"
        "  //  Objectives are LO-level and subtopics are EK-level.\n"
        "  // ─────────────────────────────────────────────\n"
    )
    return js_text[:start] + comment + entry_text + "\n\n" + js_text[end:]


def main() -> None:
    taxonomy = build_taxonomy()
    OUTPUT_JSON.write_text(json.dumps(taxonomy, indent=2, ensure_ascii=False) + "\n")
    district_text = DISTRICT_TAXONOMY.read_text()
    entry_text = render_js_entry("ap_calculus", taxonomy["ap_calculus"])
    DISTRICT_TAXONOMY.write_text(replace_ap_calculus_section(district_text, entry_text))
    standards = taxonomy["ap_calculus"]["ap calc"]["standards"]
    objective_count = sum(len(s["objectives"]) for s in standards)
    subtopic_count = sum(len(o["subtopics"]) for s in standards for o in s["objectives"])
    print(f"Wrote {OUTPUT_JSON}")
    print(f"Updated {DISTRICT_TAXONOMY}")
    print(f"Units: {len(standards)} | LOs: {objective_count} | SLOs: {subtopic_count}")


if __name__ == "__main__":
    main()
