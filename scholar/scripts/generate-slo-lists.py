#!/usr/bin/env python3
"""Generate canonicalprompts/slo-list-<subject>.md files from the per-subject
taxonomy JSONs in data/. Each output is a drop-in for the SUBJECT CONTEXT >
SLO LIST block of canonicalprompts/extract-questions-{pdf,epub}.md.

Format per file:

    Unit 1: Kinematics
      1.1.A — Describe a scalar or vector quantity using magnitude and direction
        1.1.A.1
        1.1.A.2
        ...

The LO line gives the LLM enough context to pick a parent skill; subtopic IDs
underneath let it commit to a specific sub-skill when warranted. Both LO codes
and subtopic codes appear verbatim, so primary_slo_guess can be either.
"""

from __future__ import annotations
import json, re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "data"
OUT  = REPO / "canonicalprompts"

# (taxonomy filename, output filename, human title, source note)
SUBJECTS = [
    (
        "generated-ap-physics-1-taxonomy.json",
        "slo-list-ap-physics-1.md",
        "AP Physics 1 (Algebra-Based) — CED 2024-25",
        "Source: College Board AP Physics 1 CED. Units 1–8.",
    ),
    (
        "generated-ap-physics-c-mechanics-taxonomy.json",
        "slo-list-ap-physics-c-mechanics.md",
        "AP Physics C: Mechanics — CED 2024-25",
        "Source: College Board AP Physics C: Mechanics CED. Units 1–7. "
        "AP Physics C: E&M is a separate course and is NOT covered here.",
    ),
    (
        "generated-ap-calculus-bc-taxonomy.json",
        "slo-list-ap-calculus-bc.md",
        "AP Calculus AB / BC — CED 2024-25",
        "Source: College Board AP Calculus AB and BC CED. Covers both AB and "
        "BC. BC-only units (9, 10) are tagged in their headings; AB-only "
        "extractions should not pick from those units.",
    ),
    (
        "generated-sc-precalculus-taxonomy.json",
        "slo-list-sc-precalculus.md",
        "South Carolina Precalculus — SCCCR Standards",
        "Source: South Carolina College and Career Ready Standards for "
        "Precalculus. Topic codes (PC.AAPR, PC.AREI, …) are used in place of "
        "numbered units because the SCCCR doesn't sequence by unit.",
    ),
]


def normalize_unit_heading(code: str, name: str) -> str:
    """Return a Unit-style heading. If `name` already starts with 'Unit N:',
    keep as-is. Otherwise derive a unit number from the trailing segment of
    `code` (e.g. APPC.1 -> 'Unit 1', APP1.U1 -> 'Unit 1', APCBC.10 -> 'Unit 10').
    For non-numeric topic codes (PC.AAPR), just emit 'Topic <code>: <name>'."""
    if name.startswith("Unit "):
        return name
    m = re.search(r"\.U?(\d+)$", code)
    if m:
        return f"Unit {m.group(1)}: {name}"
    # non-numeric topic code -> use the topic code as the heading discriminator
    return f"Topic {code}: {name}"


def build_section(subject_node: dict) -> str:
    """Walk one subject's standards/objectives/subtopics and emit the body
    of the SLO LIST.

    Subtopics are re-attributed to their parent LO by ID prefix rather than
    by the source JSON's nesting — some taxonomies have mis-placed subtopics
    (e.g. AP Physics 1 puts `1.4.A.1` under LO `1.4.B`)."""
    lines: list[str] = []
    standards = subject_node.get("standards", [])
    for std in standards:
        heading = normalize_unit_heading(std.get("code", ""), std.get("name", ""))
        # Pool every subtopic in this unit so we can re-attach by ID prefix.
        all_subs: list[str] = []
        for obj in std.get("objectives", []):
            for sub in obj.get("subtopics", []):
                sid = sub.get("id", "")
                if sid:
                    all_subs.append(sid)
        used: set[str] = set()
        lines.append("")
        lines.append(heading)
        for obj in std.get("objectives", []):
            lo_code = obj.get("code", "")
            lo_name = (obj.get("name", "") or "").strip()
            if lo_name.endswith("."):
                lo_name = lo_name[:-1]
            lines.append(f"  {lo_code} — {lo_name}")
            for sid in all_subs:
                if sid in used:
                    continue
                if sid == lo_code or sid.startswith(lo_code + "."):
                    lines.append(f"    {sid}")
                    used.add(sid)
        # Any subtopic whose prefix didn't match any LO in this unit — list
        # at the bottom of the unit so it isn't silently dropped.
        orphans = [s for s in all_subs if s not in used]
        if orphans:
            lines.append("  (unattached subtopics in this unit)")
            for sid in orphans:
                lines.append(f"    {sid}")
    return "\n".join(lines).lstrip("\n")


def build_file(title: str, source_note: str, body: str) -> str:
    header = f"""# SLO LIST — {title}

{source_note}

This file is the canonical SLO list to paste into SUBJECT CONTEXT > SLO LIST
when running canonicalprompts/extract-questions-pdf.md or
canonicalprompts/extract-questions-epub.md against any source for this
subject.

Format:
- Unit headings (e.g. "Unit 1: Kinematics") are the ONLY values allowed for
  `unit_guess`. Copy verbatim.
- LO codes (e.g. "1.1.A") and subtopic codes (e.g. "1.1.A.1") are the ONLY
  values allowed for `primary_slo_guess`. Copy verbatim. Pick the most
  specific code you can defend — subtopic level when the question clearly
  exercises one sub-skill, LO level when the question straddles siblings.
- Whichever code you pick, it MUST live under the unit heading you used for
  `unit_guess`.

————————————————————————————————————————————————————————————————————————

"""
    return header + body + "\n"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    written = []
    skipped = []

    for tax_filename, out_filename, title, note in SUBJECTS:
        tax_path = DATA / tax_filename
        if not tax_path.exists():
            skipped.append((tax_filename, "missing"))
            continue
        d = json.loads(tax_path.read_text(encoding="utf-8"))
        # Top-level: { subject_key: { course_name: { standards: [...] } } }
        top_key = next(iter(d))
        course_key = next(iter(d[top_key]))
        subject_node = d[top_key][course_key]
        body = build_section(subject_node)
        text = build_file(title, note, body)
        out_path = OUT / out_filename
        out_path.write_text(text, encoding="utf-8")
        written.append(out_filename)

    print(f"Wrote {len(written)} SLO lists to {OUT}:")
    for f in written:
        print(f"  {f}")
    if skipped:
        print(f"\nSkipped {len(skipped)}:")
        for name, reason in skipped:
            print(f"  {name} ({reason})")


if __name__ == "__main__":
    main()
