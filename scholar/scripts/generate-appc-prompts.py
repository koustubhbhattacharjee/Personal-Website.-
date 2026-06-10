#!/usr/bin/env python3
"""Generate per-source QT-extraction wrapper prompts for AP Physics C (Mechanics).

Reads the generic PDF prompt body and the EPUB prompt body, then writes one
wrapper per source into ~/Downloads/scholar-prompts-ap-physics-c/, plus a
taxonomy copy and a README index with chapter -> AP-C-unit maps.
"""

from __future__ import annotations
import os, shutil, textwrap
from pathlib import Path

HOME = Path.home()
REPO = Path("/home/koustubh/Downloads/website/scholar-main")
OUT  = HOME / "Downloads" / "scholar-prompts-ap-physics-c"

PDF_BASE_PATH  = HOME / "Downloads" / "scholar-qt-extraction-prompt.md"
EPUB_BASE_PATH = REPO / "qt-extraction-prompt-epub.md"
TAXONOMY_SRC   = REPO / "data" / "generated-ap-physics-c-mechanics-taxonomy.json"

SUBJECT_KEY = "ap_physics_c::ap physics c"
UNIT_NS     = "AP Physics C: Mechanics — Units APPC.1 through APPC.7 (CED 2024)"
TAX_FILE    = "ap-physics-c-mechanics-taxonomy.json"


def read_body_pdf() -> str:
    """Return the PDF base body, with the SUBJECT CONTEXT block carved out so
    we can reinsert a pre-filled one."""
    body = PDF_BASE_PATH.read_text(encoding="utf-8")
    # Find the SUBJECT CONTEXT section between its banner and PASS 1 banner.
    pre_marker = "SUBJECT CONTEXT  (fill in per run)"
    post_marker = "PASS 1 — QUESTION + IMAGE EXTRACTION"
    pre_idx  = body.index(pre_marker)
    post_idx = body.index(post_marker)
    # Keep everything before SUBJECT CONTEXT banner line, and everything from PASS 1 onward.
    # We'll rebuild the SUBJECT CONTEXT block per-source.
    head = body[: body.rindex("\n", 0, pre_idx)]   # up through the banner ─── line
    # Walk back to the blank line before banner so spacing is clean
    head_end = body.rfind("\n────", 0, pre_idx)
    head = body[: head_end]
    # Tail starts at the banner above PASS 1
    tail_start = body.rfind("\n────", 0, post_idx)
    tail = body[tail_start:]
    return head, tail


def read_body_epub() -> tuple[str, str]:
    body = EPUB_BASE_PATH.read_text(encoding="utf-8")
    pre_marker  = "SUBJECT CONTEXT"
    post_marker = "PASS 1"
    pre_idx  = body.index(pre_marker)
    post_idx = body.index(post_marker)
    head_end   = body.rfind("\n────", 0, pre_idx)
    tail_start = body.rfind("\n────", 0, post_idx)
    return body[:head_end], body[tail_start:]


def subject_context(source_label_template: str, source_type: str, textbook_key: str) -> str:
    return textwrap.dedent(f"""
        ────────────────────────────────────────────────────
        SUBJECT CONTEXT  (pre-filled for this source — only edit the bracketed parts)
        ────────────────────────────────────────────────────

        SUBJECT KEY:     {SUBJECT_KEY}
        SOURCE LABEL:    {source_label_template}
                         (Edit the bracketed fields for the specific chapter / exam
                         you are extracting. Keep the rest verbatim.)
        SOURCE TYPE:     {source_type}
        TEXTBOOK KEY:    {textbook_key}
                         (Do NOT change. This key namespaces every question's
                         source_reference so future imports from a different
                         book don't silently merge with these.)
        UNIT NAMESPACE:  {UNIT_NS}
        TAXONOMY:
        {{{{ATTACH the file '{TAX_FILE}' (in the same folder as this prompt) as a
        separate attachment alongside the source. Use only SLO codes that appear
        verbatim in that file. Codes look like '1.1.A.3', '5.4.B.1.i', etc. — do
        NOT invent codes, do NOT carry codes over from other subjects.}}}}
        """).strip("\n")


def usage_block(title: str, description: str, save_filename: str, source_note: str, kind: str) -> str:
    attach_b = (
        "ap-physics-c-mechanics-taxonomy.json (in this same folder)."
        if kind == "pdf" else
        "ap-physics-c-mechanics-taxonomy.json (in this same folder)."
    )
    pdf_or_epub = "EPUB chapter (extract one chapter at a time)" if kind == "epub" else "worksheet PDF — the chapter / exam whose questions you want extracted"
    return textwrap.dedent(f"""\
        <!--
        USAGE — Scholar AP Physics C (Mechanics) extraction prompt
        ==========================================================
        Source: {title}

        {description}

        How to run this prompt:
        1. Open your external chatbot (Claude / GPT / NotebookLM).
        2. Attach TWO files:
             a) The {pdf_or_epub}.
             b) {attach_b}
        3. Edit the SOURCE LABEL line below — replace the bracketed fields for
           the specific chapter / unit you are extracting. Keep TEXTBOOK KEY
           untouched.
        4. Paste THIS ENTIRE FILE (from the SYSTEM line down to the bottom) into the chat.
        5. The chatbot will run Pass 1, Pass 2, and Pass 3 and emit one JSON tree.
        6. Save the FINAL JSON tree (not Pass 1 or Pass 2 output) as
           scripts/{save_filename} in the Scholar repo.
        7. Tell me "import this" and I'll run the importer + image hydration.

        Source-specific note:
        {source_note}
        -->
        """)


# ----------------------------------------------------------------------
# Source configs
# ----------------------------------------------------------------------

SOURCES = [
    # 5 Steps — McGraw-Hill, mechanics chapters 9-15 + practice exams
    dict(
        slug="5steps",
        kind="pdf",
        title="5 Steps to a 5 — AP Physics C (2024 ed., McGraw-Hill, Greg Jacobs)",
        description="Mechanics-only chapters are 9–15 plus the back-of-book Practice Exams 1 & 2. Skip chapters 16–18 (E&M).",
        source_label="5 Steps AP Physics C (2024) — Chapter <N> <CHAPTER TITLE> (pages <P1>–<P2>) — extracted 2026-05",
        source_type="external",
        textbook_key="5steps_appc_2024",
        save_filename="import-tree-uX-5steps_appc_2024.json",
        source_note="5 Steps has per-chapter Practice Problems (mostly MCQ with printed A–D) plus full MCQ + FRQ practice exams at the back. Apply the format rule per question — MCQ if choices are printed, FRQ otherwise.",
    ),
    # Princeton Review — mechanics chapters 4-11
    dict(
        slug="princeton-review",
        kind="pdf",
        title="The Princeton Review — AP Physics C Mechanics Prep (2020 ed.)",
        description="Mechanics content is in chapters 4–11 plus Practice Tests 1 & 2 at the front and back. Skip chapters 12–16 (E&M).",
        source_label="Princeton Review AP Physics C Mechanics (2020) — Chapter <N> <CHAPTER TITLE> (pages <P1>–<P2>) — extracted 2026-05",
        source_type="external",
        textbook_key="princeton_review_appc_mech_2020",
        save_filename="import-tree-uX-princeton_review_appc_mech_2020.json",
        source_note="Princeton Review has Chapter Drills at the end of each content chapter plus two full Practice Tests. Drills are mostly MCQ; Practice Tests have an MCQ section + FRQ section. Apply the format rule per question.",
    ),
    # Barron's Practice Tests 2024 (Pelcovits/Farkas, PDF) — mechanics chapters 1-9
    dict(
        slug="barrons-practice",
        kind="pdf",
        title="Barron's AP Physics C Practice Tests (2024 ed., Pelcovits & Farkas) — PDF",
        description="Mechanics content is in chapters 1–9 plus the Diagnostic Test at the front and Practice Tests at the back. Skip chapters 10+ (E&M).",
        source_label="Barron's AP Physics C Practice Tests (2024) — Chapter <N> <CHAPTER TITLE> (pages <P1>–<P2>) — extracted 2026-05",
        source_type="external",
        textbook_key="barrons_appc_practice_2024",
        save_filename="import-tree-uX-barrons_appc_practice_2024.json",
        source_note="Barron's has Practice Exercises at the end of each content chapter plus full diagnostic and practice tests. Mix of MCQ (with printed A–D) and FRQ. Apply the format rule per question.",
    ),
    # Barron's 5e Pelcovits — EPUB
    dict(
        slug="barrons-pelcovits-5e",
        kind="epub",
        title="Barron's AP Physics C, 5th Edition (Pelcovits & Farkas, 2021) — EPUB",
        description="Reflowable EPUB; no fixed page numbers, no bboxes. Image refs are EPUB-internal '<img src>' filenames. Use the EPUB-variant pass instructions (no `page` field, use `spine_path` instead).",
        source_label="Barron's AP Physics C 5e (Pelcovits & Farkas, 2021) — Chapter <N> <CHAPTER TITLE> (spine: <FILENAME.xhtml>) — extracted 2026-05",
        source_type="external",
        textbook_key="barrons_appc_pelcovits_5e_2021",
        save_filename="import-tree-uX-barrons_appc_pelcovits_5e_2021.json",
        source_note="EPUB content; covers Mechanics + E&M. For Mechanics import, restrict to the Mechanics chapters only. Mostly Practice Exercises (MCQ + FRQ).",
    ),
]

# Released exam years — each is a self-contained external source
RELEASED_YEARS = list(range(2012, 2020))   # 2012..2019
for year in RELEASED_YEARS:
    SOURCES.append(dict(
        slug=f"cb-released-{year}",
        kind="pdf",
        title=f"College Board — AP Physics C: Mechanics Released Exam {year}",
        description=f"Officially released exam materials from {year}. Typically the FRQ section (3 questions, multipart). MCQ section released only on certain years (look at the PDF to confirm).",
        source_label=f"CB AP Physics C: Mechanics Released Exam {year} — <SECTION e.g. FRQ / MCQ> (pages <P1>–<P2>) — extracted 2026-05",
        source_type="external",
        textbook_key=f"cb_appc_mech_released_{year}",
        save_filename=f"import-tree-cb_appc_mech_released_{year}.json",
        source_note=(
            "CB-released FRQs are free-response only — no printed answer choices, so format=free_response per the rule. "
            "If the file additionally contains a multiple-choice section (only some years release MCQ), apply the format rule per question."
        ),
    ))


def build_wrapper(cfg: dict, head: str, tail: str) -> str:
    usage = usage_block(
        title=cfg["title"],
        description=cfg["description"],
        save_filename=cfg["save_filename"],
        source_note=cfg["source_note"],
        kind=cfg["kind"],
    )
    ctx = subject_context(cfg["source_label"], cfg["source_type"], cfg["textbook_key"])
    return f"{usage}\n{head.lstrip()}\n\n{ctx}\n{tail}"


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # 1. taxonomy copy
    shutil.copy2(TAXONOMY_SRC, OUT / TAX_FILE)

    # 2. read base bodies
    pdf_head,  pdf_tail  = read_body_pdf()
    epub_head, epub_tail = read_body_epub()

    written = []
    for cfg in SOURCES:
        head, tail = (epub_head, epub_tail) if cfg["kind"] == "epub" else (pdf_head, pdf_tail)
        text = build_wrapper(cfg, head, tail)
        fname = f"scholar-prompt-appc-{cfg['slug']}.md"
        (OUT / fname).write_text(text, encoding="utf-8")
        written.append((fname, cfg))

    # 3. README with index + chapter→unit maps
    readme = "# Scholar — AP Physics C (Mechanics) extraction prompts\n\n"
    readme += "Drop-in wrappers around the generic Scholar QT-extraction prompt, one per source. Each wrapper has the SUBJECT KEY / SOURCE TYPE / TEXTBOOK KEY pre-filled — only the SOURCE LABEL needs editing per chapter / per exam. The taxonomy file `ap-physics-c-mechanics-taxonomy.json` is included alongside; attach it whenever you run a prompt.\n\n"
    readme += "## Workflow\n\n"
    readme += "1. Pick the wrapper that matches your source (textbook chapter or released exam).\n"
    readme += "2. Read the `<!-- USAGE -->` header at the top of the wrapper.\n"
    readme += "3. Edit `SOURCE LABEL` for the specific chapter / exam you're extracting.\n"
    readme += "4. Paste from the `SYSTEM:` line down into your chatbot, attached with the source PDF/EPUB and the taxonomy JSON.\n"
    readme += "5. Save the final tree JSON under `scripts/import-tree-...json` in the Scholar repo.\n"
    readme += "6. Tell me `import this` and I'll run `node scripts/import-extracted-tree.cjs ...` (dry-run, then `--apply`).\n\n"
    readme += "## Sources\n\n"
    readme += "| Wrapper | Source | textbook_key | Source type |\n"
    readme += "|---|---|---|---|\n"
    for fname, cfg in written:
        readme += f"| `{fname}` | {cfg['title']} | `{cfg['textbook_key']}` | {cfg['source_type']} |\n"

    readme += "\n## Chapter → AP-C unit map (Mechanics-only chapters)\n\n"
    readme += "Skip chapters covering Electricity & Magnetism in textbooks — those belong to AP Physics C: E&M, not Mechanics.\n\n"
    readme += "### 5 Steps to a 5 — AP Physics C (2024)\n\n"
    readme += "| Ch | Title | Maps to |\n|---|---|---|\n"
    readme += "| 9 | Kinematics | APPC.1 |\n"
    readme += "| 10 | Forces and Newton's Laws | APPC.2 |\n"
    readme += "| 11 | Momentum | APPC.4 |\n"
    readme += "| 12 | Energy Conservation | APPC.3 |\n"
    readme += "| 13 | Gravitation and Circular Motion | APPC.2 (circular motion) + APPC.2 (gravitation falls under Force/Translational Dynamics in CED 2024) |\n"
    readme += "| 14 | Rotational Motion | APPC.5 + APPC.6 |\n"
    readme += "| 15 | Simple Harmonic Motion | APPC.7 |\n"
    readme += "| Step 5 | Mechanics Practice Exam 1 (MCQ + FRQ) | mixed (assign per QT) |\n"
    readme += "| Step 5 | Mechanics Practice Exam 2 (MCQ + FRQ) | mixed (assign per QT) |\n"
    readme += "| 16–18 | Electrostatics, Circuits, Magnetism | **skip — E&M, not Mechanics** |\n\n"

    readme += "### Princeton Review — AP Physics C Mechanics Prep (2020)\n\n"
    readme += "| Ch | Title | Maps to |\n|---|---|---|\n"
    readme += "| 4 | Vectors | APPC.1 |\n"
    readme += "| 5 | Kinematics | APPC.1 |\n"
    readme += "| 6 | Newton's Laws | APPC.2 |\n"
    readme += "| 7 | Work, Energy, and Power | APPC.3 |\n"
    readme += "| 8 | Linear Momentum | APPC.4 |\n"
    readme += "| 9 | Rotational Motion | APPC.5 + APPC.6 |\n"
    readme += "| 10 | Laws of Gravitation | APPC.2 |\n"
    readme += "| 11 | Oscillations | APPC.7 |\n"
    readme += "| Practice Test 1 / 2 | (front + back) | mixed (assign per QT) |\n"
    readme += "| 12–16 | E&M chapters | **skip** |\n\n"

    readme += "### Barron's AP Physics C Practice Tests (2024) — Pelcovits & Farkas\n\n"
    readme += "| Ch | Title | Maps to |\n|---|---|---|\n"
    readme += "| 1 | Background (Vectors, Units, Problem-Solving) | APPC.1 |\n"
    readme += "| 2 | Kinematics | APPC.1 |\n"
    readme += "| 3 | Newton's Laws | APPC.2 |\n"
    readme += "| 4 | Work, Energy, and Power | APPC.3 |\n"
    readme += "| 5 | Linear Momentum and Center of Mass | APPC.4 |\n"
    readme += "| 6 | Rotation I: Kinematics, Force, Work, and Energy | APPC.5 + APPC.6 |\n"
    readme += "| 7 | Rotation II: Inertia, Equilibrium, and Combined Rotation/Translation | APPC.5 + APPC.6 |\n"
    readme += "| 8 | Simple Harmonic Motion | APPC.7 |\n"
    readme += "| 9 | Universal Gravitation | APPC.2 |\n"
    readme += "| Diagnostic + Practice Tests (Mechanics) | front + back | mixed (assign per QT) |\n"
    readme += "| 10+ | E&M | **skip** |\n\n"

    readme += "### Barron's AP Physics C, 5th Edition (Pelcovits & Farkas, 2021) — EPUB\n\n"
    readme += "EPUB; chapter titles match the Practice Tests companion above. Mechanics chapters are 1–9 by spine order. Use the `barrons-pelcovits-5e` wrapper, which uses the EPUB-variant pass instructions (`spine_path`, no `page`, no `bbox`).\n\n"

    readme += "### CB-released exams 2012–2019\n\n"
    readme += "Each year is a small standalone PDF (50–95 pp). Most years are FRQ-only (3 multipart problems → free_response per the format rule). Some years also include the released MCQ section. Each exam = one wrapper run.\n\n"

    readme += "## Notes on the EPUB variant\n\n"
    readme += "The Barron's 5e wrapper uses the EPUB pass — no `page` numbers, no `bbox` measurements. Image references are the EPUB-internal `<img src>` filenames. The downstream importer hydrates images from the EPUB's images/ directory.\n\n"

    readme += "## Re-generating this folder\n\n"
    readme += "Source: `scripts/generate-appc-prompts.py` in the Scholar repo. Re-run it any time the base prompt or taxonomy changes:\n\n"
    readme += "```\npython3 scripts/generate-appc-prompts.py\n```\n"

    (OUT / "README.md").write_text(readme, encoding="utf-8")

    print(f"Wrote {len(written)} wrappers + README + taxonomy to {OUT}")
    for fname, _ in written:
        print(f"  {fname}")


if __name__ == "__main__":
    main()
