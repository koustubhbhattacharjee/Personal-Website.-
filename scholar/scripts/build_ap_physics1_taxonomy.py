#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_MD = Path("/home/koustubh/Downloads/AP® Physics 1_ Algebra-Based Course and Exam Description(1).md")
OUTPUT_JSON = ROOT / "data" / "generated-ap-physics-1-taxonomy.json"
DISTRICT_TAXONOMY = ROOT / "lib" / "district-taxonomy.js"


UNIT_NAMES = {
    1: "Unit 1: Kinematics",
    2: "Unit 2: Force and Translational Dynamics",
    3: "Unit 3: Work, Energy, and Power",
    4: "Unit 4: Linear Momentum",
    5: "Unit 5: Torque and Rotational Dynamics",
    6: "Unit 6: Energy and Momentum of Rotating Systems",
    7: "Unit 7: Oscillations",
    8: "Unit 8: Fluids",
}


TOPIC_RE = re.compile(r"(?m)^# \*\*TOPIC (\d+\.\d+)\*\*\s*$")
LO_RE = re.compile(r"^\d+\.\d+\.[A-Z]\.?$")
EK_RE = re.compile(r"^\d+\.\d+\.[A-Z]\.\d+(?:\.[ivx]+)?\.?$", re.IGNORECASE)


def clean_line(line: str) -> str:
    line = line.strip()
    line = re.sub(r"^#+\s*", "", line)
    line = line.replace("**", "")
    line = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", line)
    line = re.sub(r"\s+", " ", line)
    return line.strip()


def clean_text(lines: list[str]) -> str:
    out: list[str] = []
    for raw in lines:
        s = clean_line(raw)
        if not s:
            continue
        if s.startswith("© "):
            continue
        out.append(s)
    text = " ".join(out)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\bUNIT\s+[A-Z][A-Za-z\s&-]*(?=(?:\s+\d+\.\d+\.[A-Z])|$)", "", text).strip()
    unit_suffixes = [name.split(": ", 1)[1] for name in UNIT_NAMES.values()]
    for suffix in unit_suffixes:
        text = re.sub(rf"\b{re.escape(suffix)}$", "", text).strip()
    return text.strip()


def is_section_heading(line: str, label: str) -> bool:
    return clean_line(line).upper() == label


def is_stop_heading(line: str) -> bool:
    heading = clean_line(line).upper()
    return heading in {
        "LEARNING OBJECTIVE",
        "ESSENTIAL KNOWLEDGE",
        "BOUNDARY STATEMENT",
        "EXCLUSION STATEMENT",
        "SUGGESTED SKILLS",
        "REQUIRED COURSE CONTENT",
    } or heading.startswith("TOPIC ") or heading.startswith("UNIT ")


def canonical_lo_id(line: str) -> str | None:
    cleaned = clean_line(line)
    if LO_RE.match(cleaned):
        return cleaned.rstrip(".")
    return None


def canonical_ek_id(line: str) -> str | None:
    cleaned = clean_line(line)
    if EK_RE.match(cleaned):
        return cleaned.rstrip(".")
    return None


def infer_next_ek_id(lo_id: str, subtopics: list[dict], current_id: str | None) -> str:
    max_num = 0
    for item in subtopics:
        m = re.match(re.escape(lo_id) + r"\.(\d+)$", item["id"])
        if m:
            max_num = max(max_num, int(m.group(1)))
    if current_id:
        m = re.match(re.escape(lo_id) + r"\.(\d+)$", current_id)
        if m:
            max_num = max(max_num, int(m.group(1)))
    return f"{lo_id}.{max_num + 1}"


def parse_physics1_markdown(text: str) -> dict:
    standards: list[dict] = []
    by_unit: dict[int, list[dict]] = {k: [] for k in UNIT_NAMES}
    matches = list(TOPIC_RE.finditer(text))
    for idx, match in enumerate(matches):
        topic_id = match.group(1)
        unit_num = int(topic_id.split(".")[0])
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        block = text[start:end]
        lines = block.splitlines()

        topic_title_lines: list[str] = []
        i = 0
        while i < len(lines):
            line = lines[i]
            cleaned = clean_line(line)
            if not cleaned:
                i += 1
                continue
            if is_stop_heading(line):
                break
            topic_title_lines.append(line)
            i += 1
        topic_title = clean_text(topic_title_lines)

        objectives: list[dict] = []
        while i < len(lines):
            line = lines[i]
            direct_lo = canonical_lo_id(line)
            if not is_section_heading(line, "LEARNING OBJECTIVE") and not direct_lo:
                i += 1
                continue
            if is_section_heading(line, "LEARNING OBJECTIVE"):
                i += 1
                while i < len(lines) and not clean_line(lines[i]):
                    i += 1
                if i >= len(lines):
                    continue
                direct_lo = canonical_lo_id(lines[i])
                if not direct_lo:
                    continue
                lo_id = direct_lo
                i += 1
            else:
                lo_id = direct_lo
                i += 1

            lo_text_lines: list[str] = []
            while i < len(lines):
                if is_stop_heading(lines[i]) or canonical_lo_id(lines[i]) or canonical_ek_id(lines[i]):
                    break
                lo_text_lines.append(lines[i])
                i += 1
            lo_text = clean_text(lo_text_lines)

            while i < len(lines) and not is_section_heading(lines[i], "ESSENTIAL KNOWLEDGE"):
                cleaned = clean_line(lines[i])
                if (
                    canonical_lo_id(lines[i]) or
                    canonical_ek_id(lines[i]) or
                    cleaned == f"{lo_id}." or
                    is_section_heading(lines[i], "LEARNING OBJECTIVE") or
                    cleaned.startswith("TOPIC ")
                ):
                    break
                i += 1

            subtopics: list[dict] = []
            if i < len(lines):
                if is_section_heading(lines[i], "ESSENTIAL KNOWLEDGE"):
                    i += 1
                can_parse_eks = i < len(lines) and not (
                    canonical_lo_id(lines[i]) or
                    is_section_heading(lines[i], "LEARNING OBJECTIVE") or
                    clean_line(lines[i]).startswith("TOPIC ") or
                    clean_line(lines[i]) in {"BOUNDARY STATEMENT", "EXCLUSION STATEMENT", "SUGGESTED SKILLS", "UNIT"}
                )
            else:
                can_parse_eks = False

            if can_parse_eks:
                current_id: str | None = None
                current_lines: list[str] = []
                orphan_lines: list[str] = []

                def flush_current() -> None:
                    nonlocal current_id, current_lines
                    if current_id and clean_text(current_lines):
                        subtopics.append({"id": current_id, "text": clean_text(current_lines)})
                    current_id = None
                    current_lines = []

                def flush_orphan() -> None:
                    nonlocal orphan_lines
                    orphan_text = clean_text(orphan_lines)
                    if orphan_text:
                        subtopics.append({"id": f"{lo_id}.1", "text": orphan_text})
                    orphan_lines = []

                while i < len(lines):
                    cleaned = clean_line(lines[i])
                    if not cleaned:
                        i += 1
                        continue
                    if (
                        cleaned != f"{lo_id}." and canonical_lo_id(lines[i])
                    ) or is_section_heading(lines[i], "LEARNING OBJECTIVE") or cleaned.startswith("TOPIC "):
                        break
                    if cleaned in {"BOUNDARY STATEMENT", "EXCLUSION STATEMENT", "SUGGESTED SKILLS"}:
                        break
                    ek_id = canonical_ek_id(lines[i])
                    if not ek_id and cleaned == f"{lo_id}.":
                        ek_id = infer_next_ek_id(lo_id, subtopics, current_id)
                    if ek_id:
                        if current_id is None and orphan_lines:
                            flush_orphan()
                        else:
                            flush_current()
                        current_id = ek_id
                        i += 1
                        continue
                    if current_id is None:
                        orphan_lines.append(lines[i])
                    else:
                        current_lines.append(lines[i])
                    i += 1
                if current_id is None and orphan_lines:
                    flush_orphan()
                else:
                    flush_current()

            objective_name = lo_text if lo_text else f"{topic_id} {topic_title}".strip()
            existing = next((obj for obj in objectives if obj["code"] == lo_id), None)
            if existing:
                seen = {s["id"] for s in existing["subtopics"]}
                for subtopic in subtopics:
                    if subtopic["id"] not in seen:
                        existing["subtopics"].append(subtopic)
                        seen.add(subtopic["id"])
                if not existing["name"] and objective_name:
                    existing["name"] = objective_name
            else:
                objectives.append({
                    "code": lo_id,
                    "name": objective_name,
                    "subtopics": subtopics,
                })

        by_unit[unit_num].extend(objectives)

    for unit_num, unit_name in UNIT_NAMES.items():
        standards.append({
            "code": f"APP1.U{unit_num}",
            "name": unit_name,
            "objectives": by_unit.get(unit_num, []),
        })

    return {
        "ap_physics_1": {
            "ap physics 1": {
                "standards": standards
            }
        }
    }


def render_js_entry(key: str, value: dict) -> str:
    dumped = json.dumps(value, indent=2, ensure_ascii=False)
    lines = dumped.splitlines()
    rendered = [f'  "{key}": {lines[0]}']
    rendered.extend(f"  {line}" for line in lines[1:])
    rendered[-1] += ","
    return "\n".join(rendered)


def replace_ap_physics1_section(js_text: str, entry_text: str) -> str:
    start_marker = '  //  AP Physics 1: Algebra-Based'
    end_marker = '  // ─────────────────────────────────────────────\n  //  AP Physics C: Mechanics'
    start = js_text.index(start_marker)
    end = js_text.index(end_marker)
    comment = (
        "  // ─────────────────────────────────────────────\n"
        "  //  AP Physics 1: Algebra-Based (Marker markdown extracted from official CED)\n"
        "  //  Objectives are official Learning Objectives.\n"
        "  //  Subtopics are official Essential Knowledge statements.\n"
        "  // ─────────────────────────────────────────────\n"
    )
    return js_text[:start] + comment + entry_text + "\n\n" + js_text[end:]


def main() -> None:
    md_text = SOURCE_MD.read_text()
    taxonomy = parse_physics1_markdown(md_text)
    OUTPUT_JSON.write_text(json.dumps(taxonomy, indent=2, ensure_ascii=False) + "\n")

    district_text = DISTRICT_TAXONOMY.read_text()
    entry_text = render_js_entry("ap_physics_1", taxonomy["ap_physics_1"])
    updated = replace_ap_physics1_section(district_text, entry_text)
    DISTRICT_TAXONOMY.write_text(updated)

    standards = taxonomy["ap_physics_1"]["ap physics 1"]["standards"]
    objective_count = sum(len(s["objectives"]) for s in standards)
    subtopic_count = sum(len(o["subtopics"]) for s in standards for o in s["objectives"])
    print(f"Wrote {OUTPUT_JSON}")
    print(f"Updated {DISTRICT_TAXONOMY}")
    print(f"Units: {len(standards)} | LOs: {objective_count} | SLOs: {subtopic_count}")


if __name__ == "__main__":
    main()
