#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from collections import OrderedDict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_MD = Path("/home/koustubh/Downloads/ap-physics-c-mechanics-course-and-exam-description(1).md")
OUTPUT_JSON = ROOT / "data" / "generated-ap-physics-c-mechanics-taxonomy.json"
DISTRICT_TAXONOMY = ROOT / "lib" / "district-taxonomy.js"


UNIT_NAMES = {
    1: "Kinematics",
    2: "Force and Translational Dynamics",
    3: "Work, Energy, and Power",
    4: "Linear Momentum",
    5: "Torque and Rotational Dynamics",
    6: "Energy and Momentum of Rotating Systems",
    7: "Oscillations",
}


TOPIC_RE = re.compile(r"(?m)^# \*\*TOPIC (\d+\.\d+)\*\*\s*$")
HEADING_RE = re.compile(r"^#+\s*")
RAW_LO_RE = re.compile(r"^\d+\.\d+\.[A-Z]\.?$")
RAW_EK_RE = re.compile(r"^\d+\.\d+\.[A-Z]\.\d+(?:\.[ivx]+)?\.?$", re.I)


def clean_line(line: str) -> str:
    line = line.strip()
    line = HEADING_RE.sub("", line)
    line = line.replace("**", "")
    line = line.replace("*", "")
    line = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", line)
    line = re.sub(r"\s+", " ", line)
    return line.strip()


def clean_text(lines: list[str]) -> str:
    parts = []
    for raw in lines:
        s = clean_line(raw)
        if not s:
            continue
        if s.startswith("© "):
            continue
        if s.startswith("| "):
            continue
        if s in {"LEARNING OBJECTIVE", "ESSENTIAL KNOWLEDGE", "BOUNDARY STATEMENT", "EXCLUSION STATEMENT", "SUGGESTED SKILLS", "Required Course Content", "REQUIRED COURSE CONTENT"}:
            continue
        if s.startswith("AP PHYSICS C: MECHANICS") or s.startswith("AP Physics C: Mechanics"):
            continue
        if s.startswith("UNIT AT A GLANCE") or s.startswith("Progress Check"):
            continue
        parts.append(s)
    text = " ".join(parts)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\bcontinued on next page\b", "", text, flags=re.I)
    text = re.sub(r"\bAP PHYSICS C.*$", "", text, flags=re.I)
    text = re.sub(r"\bUNIT AT A GLANCE.*$", "", text, flags=re.I)
    text = re.sub(r"\bProgress Check.*$", "", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def is_section_heading(line: str, label: str) -> bool:
    return clean_line(line).upper() == label


def is_hard_stop(line: str) -> bool:
    s = clean_line(line)
    upper = s.upper()
    if not s:
        return False
    if upper in {"BOUNDARY STATEMENT", "EXCLUSION STATEMENT", "SUGGESTED SKILLS"}:
        return True
    if s.startswith("TOPIC ") or s.startswith("UNIT AT A GLANCE") or s.startswith("Progress Check") or s.startswith("AP PHYSICS C: MECHANICS"):
        return True
    return False


def normalize_lo_token(token: str, topic_id: str, known_letters: list[str], used_letters: set[str]) -> str | None:
    t = clean_line(token)
    if not t:
        return None
    if RAW_LO_RE.match(t):
        return t.rstrip(".")
    # malformed like 2.2. or 7.5.4
    if re.fullmatch(re.escape(topic_id) + r"\.?", t):
        pass
    elif re.fullmatch(re.escape(topic_id) + r"\.\d+\.?", t):
        pass
    else:
        return None
    for letter in known_letters:
        if letter not in used_letters:
            return f"{topic_id}.{letter}"
    return f"{topic_id}.A"


def normalize_ek_token(token: str, current_lo: str | None, current_obj: dict | None) -> str | None:
    t = clean_line(token)
    if not t:
        return None
    if RAW_EK_RE.match(t):
        return t.rstrip(".")
    if current_lo and re.fullmatch(re.escape(current_lo) + r"\.?", t):
        existing = [s["id"] for s in (current_obj or {}).get("subtopics", [])]
        nums = []
        for eid in existing:
            m = re.fullmatch(re.escape(current_lo) + r"\.(\d+)", eid)
            if m:
                nums.append(int(m.group(1)))
        return f"{current_lo}.{max(nums, default=0)+1}"
    return None


def collect_topic_letters(block: str, topic_id: str) -> list[str]:
    letters = []
    for m in re.finditer(re.escape(topic_id) + r"\.([A-Z])(?:\.|\b)", block):
        letter = m.group(1)
        if letter not in letters:
            letters.append(letter)
    if letters and letters[0] != "A":
        letters = ["A"] + letters
    if not letters:
        letters = ["A"]
    return letters


def topic_title(lines: list[str]) -> str:
    out = []
    for line in lines:
        s = clean_line(line)
        if not s:
            continue
        if is_section_heading(line, "REQUIRED COURSE CONTENT") or is_section_heading(line, "LEARNING OBJECTIVE"):
            break
        out.append(line)
    return clean_text(out)


def parse_topic(topic_id: str, block: str) -> list[dict]:
    lines = block.splitlines()
    known_letters = collect_topic_letters(block, topic_id)
    objectives: "OrderedDict[str, dict]" = OrderedDict()
    mode = None
    current_lo = None
    current_ek = None
    pending_lo_text: list[str] = []
    pending_ek_text: list[str] = []
    orphan_ek_texts: list[list[str]] = []
    orphan_target_lo = None

    def get_obj(lo_code: str) -> dict:
        if lo_code not in objectives:
            objectives[lo_code] = {"code": lo_code, "name": "", "subtopics": []}
        return objectives[lo_code]

    def used_letters() -> set[str]:
        return {code.split(".")[-1] for code in objectives}

    def flush_lo_text() -> None:
        nonlocal pending_lo_text
        if current_lo and pending_lo_text:
            text = clean_text(pending_lo_text)
            if text:
                obj = get_obj(current_lo)
                if not obj["name"]:
                    obj["name"] = text
            pending_lo_text = []

    def flush_current_ek() -> None:
        nonlocal current_ek, pending_ek_text
        if current_lo and current_ek and pending_ek_text:
            text = clean_text(pending_ek_text)
            if text:
                obj = get_obj(current_lo)
                if not any(s["id"] == current_ek for s in obj["subtopics"]):
                    obj["subtopics"].append({"id": current_ek, "text": text})
        current_ek = None
        pending_ek_text = []

    def flush_orphans() -> None:
        nonlocal orphan_ek_texts, orphan_target_lo
        target_lo = orphan_target_lo or current_lo
        if target_lo and orphan_ek_texts:
            obj = get_obj(target_lo)
            existing = [s["id"] for s in obj["subtopics"]]
            next_num = 1
            while f"{target_lo}.{next_num}" in existing:
                next_num += 1
            for orphan in orphan_ek_texts:
                text = clean_text(orphan)
                if text:
                    eid = f"{target_lo}.{next_num}"
                    obj["subtopics"].append({"id": eid, "text": text})
                    next_num += 1
        orphan_ek_texts = []
        orphan_target_lo = None

    for raw in lines:
        s = clean_line(raw)
        if not s:
            continue
        if is_hard_stop(raw):
            break
        if is_section_heading(raw, "LEARNING OBJECTIVE"):
            flush_current_ek()
            flush_orphans()
            flush_lo_text()
            mode = "lo"
            continue
        if is_section_heading(raw, "ESSENTIAL KNOWLEDGE"):
            flush_lo_text()
            mode = "ek"
            if current_lo is None:
                current_lo = normalize_lo_token(topic_id, topic_id, known_letters, used_letters())
                get_obj(current_lo)
            keys = list(objectives.keys())
            orphan_target_lo = current_lo
            if current_lo in keys:
                idx = keys.index(current_lo)
                if idx > 0 and not objectives[keys[idx - 1]]["subtopics"]:
                    orphan_target_lo = keys[idx - 1]
            continue

        lo_token = normalize_lo_token(s, topic_id, known_letters, used_letters())
        if mode == "lo" and lo_token:
            flush_current_ek()
            flush_orphans()
            if pending_lo_text and current_lo is None:
                inferred = normalize_lo_token(topic_id, topic_id, known_letters, used_letters())
                current_lo = inferred
                get_obj(current_lo)
            flush_lo_text()
            current_lo = lo_token
            get_obj(current_lo)
            continue

        if mode == "ek":
            # A new LO can start inline inside the EK block.
            inline_lo = None
            if RAW_LO_RE.match(s):
                inline_lo = s.rstrip(".")
            elif re.fullmatch(re.escape(topic_id) + r"\.?", s) or re.fullmatch(re.escape(topic_id) + r"\.\d+\.?", s):
                inline_lo = normalize_lo_token(s, topic_id, known_letters, used_letters())
            if inline_lo and not RAW_EK_RE.match(s):
                flush_current_ek()
                flush_orphans()
                flush_lo_text()
                current_lo = inline_lo
                get_obj(current_lo)
                mode = "lo"
                continue

            current_obj = get_obj(current_lo) if current_lo else None
            ek_token = normalize_ek_token(s, current_lo, current_obj)
            if ek_token:
                flush_current_ek()
                flush_orphans()
                current_ek = ek_token
                continue

            if current_ek:
                pending_ek_text.append(raw)
            else:
                if (
                    orphan_ek_texts and
                    clean_text(orphan_ek_texts[-1]).endswith((".", ")", "\"")) and
                    not s.startswith("Relevant equation") and
                    not s.startswith("Derived equation") and
                    not s.startswith("$$") and
                    not s.startswith("$")
                ):
                    orphan_ek_texts.append([raw])
                elif orphan_ek_texts:
                    orphan_ek_texts[-1].append(raw)
                else:
                    orphan_ek_texts.append([raw])
            continue

        # Plain text handling
        if mode == "lo":
            pending_lo_text.append(raw)
        elif mode == "ek":
            if current_ek:
                pending_ek_text.append(raw)
            else:
                orphan_ek_texts.append([raw])

    flush_current_ek()
    flush_orphans()
    flush_lo_text()

    # Backfill empty LO names with topic title if needed, but avoid blank entries.
    title = topic_title(lines)
    cleaned = []
    for obj in objectives.values():
        if not obj["name"]:
            obj["name"] = title
        if obj["code"].startswith(topic_id + "."):
            cleaned.append(obj)
    return cleaned


def build_taxonomy() -> dict:
    text = SOURCE_MD.read_text()
    standards = []
    topic_matches = list(TOPIC_RE.finditer(text))
    by_unit = {unit: [] for unit in UNIT_NAMES}
    for idx, match in enumerate(topic_matches):
        topic_id = match.group(1)
        start = match.end()
        end = topic_matches[idx + 1].start() if idx + 1 < len(topic_matches) else len(text)
        block = text[start:end]
        unit_num = int(topic_id.split(".")[0])
        by_unit[unit_num].extend(parse_topic(topic_id, block))
    for unit_num, name in UNIT_NAMES.items():
        standards.append({
            "code": f"APPC.{unit_num}",
            "name": name,
            "objectives": by_unit[unit_num],
        })
    taxonomy = {"ap_physics_c": {"ap physics c": {"standards": standards}}}
    postprocess_mechanics_taxonomy(taxonomy)
    return taxonomy


def postprocess_mechanics_taxonomy(taxonomy: dict) -> None:
    standards = taxonomy["ap_physics_c"]["ap physics c"]["standards"]
    by_code = {}
    for std in standards:
        for obj in std["objectives"]:
            by_code[obj["code"]] = obj

    def set_obj(code: str, name: str, subtopics: list[tuple[str, str]]) -> None:
        obj = by_code.get(code)
        if not obj:
            return
        obj["name"] = name
        obj["subtopics"] = [{"id": sid, "text": text} for sid, text in subtopics]

    # Topic 1.1 continuation block
    obj = by_code.get("1.1.A")
    if obj:
        ids = {s["id"] for s in obj["subtopics"]}
        additions = [
            ("1.1.A.4.iii", "A resultant vector is the vector sum of the addend vectors' components. Relevant equations: $$\\vec{C} = \\vec{A} + \\vec{B}$$ $$\\vec{C} = (A_x + B_x)\\hat{i} + (A_y + B_y)\\hat{j}$$"),
            ("1.1.A.5", "In a given one-dimensional coordinate system, opposite directions are denoted by opposite signs."),
        ]
        for sid, text in additions:
            if sid not in ids:
                obj["subtopics"].append({"id": sid, "text": text})

    set_obj(
        "1.2.A",
        "Describe a change in an object's position.",
        [
            ("1.2.A.1", "When using the object model, the size, shape, and internal configuration are ignored. The object may be treated as a single point with extensive properties such as mass and charge."),
            ("1.2.A.2", "Displacement is the change in an object's position. Relevant equation: $$\\Delta x = x - x_0$$"),
        ],
    )
    set_obj(
        "1.2.B",
        "Describe the average velocity and acceleration of an object.",
        [
            ("1.2.B.1", "Averages of velocity and acceleration are calculated considering the initial and final states of an object over an interval of time."),
            ("1.2.B.2", "Average velocity is the displacement of an object divided by the interval of time in which that displacement occurs. Relevant equation: $$\\vec{v}_{\\text{avg}} = \\frac{\\Delta \\vec{x}}{\\Delta t}$$"),
            ("1.2.B.3", "Average acceleration is the change in velocity divided by the interval of time in which that change in velocity occurs. Relevant equation: $$\\vec{a}_{\\rm avg} = \\frac{\\Delta \\vec{v}}{\\Delta t}$$"),
            ("1.2.B.4", "An object is accelerating if either the magnitude and/or direction of the object's velocity are changing."),
        ],
    )
    set_obj(
        "1.4.A",
        "Describe the reference frame of a given observer.",
        [
            ("1.4.A.1", "The choice of reference frame will determine the direction and magnitude of quantities measured by an observer in that reference frame."),
        ],
    )
    set_obj(
        "2.2.A",
        "Describe a force as an interaction between two objects or systems.",
        [
            ("2.2.A.1", "Forces are vector quantities that describe the interactions between objects or systems."),
            ("2.2.A.1.i", "A force exerted on an object or system is always due to the interaction of that object or system with another object or system."),
            ("2.2.A.1.ii", "An object or system cannot exert a net force on itself."),
            ("2.2.A.2", "Contact forces describe the interaction of an object or system touching another object or system and are macroscopic effects of interatomic electric forces."),
        ],
    )
    set_obj(
        "2.2.B",
        "Describe the forces exerted on an object or system using a free-body diagram.",
        [
            ("2.2.B.1", "Free-body diagrams are useful tools for visualizing forces being exerted on a single object or system and for determining the equations that represent a physical situation."),
            ("2.2.B.2", "The free-body diagram of an object or system shows each of the forces exerted on the object or system by the environment."),
            ("2.2.B.3", "Forces exerted on an object or system are represented as vectors originating from the representation of the center of mass, such as a dot. A system is treated as though all of its mass is located at the center of mass."),
            ("2.2.B.4", "A coordinate system with one axis parallel to the direction of acceleration of the object or system simplifies the translation from freebody diagram to algebraic representation. For example, in a free-body diagram of an object on an inclined plane, it is useful to set one axis parallel to the surface of the incline."),
        ],
    )
    set_obj(
        "3.4.A",
        "Describe the energies present in a system.",
        [
            ("3.4.A.1", "A system composed of only a single object can only have kinetic energy."),
            ("3.4.A.2", "A system that contains objects that interact via conservative forces or that can change its shape reversibly may have both kinetic and potential energies."),
        ],
    )
    set_obj(
        "5.2.A",
        "Describe the linear motion of a point on a rotating rigid system that corresponds to the rotational motion of that point, and vice versa.",
        [
            ("5.2.A.1", "For a point at a distance r from a fixed axis of rotation, the linear distance s traveled by the point as the system rotates through an angle $\\Delta\\theta$ is given by the equation $\\Delta s = r\\Delta\\theta$."),
            ("5.2.A.2", "Derived relationships of linear velocity and of the tangential component of acceleration to their respective angular quantities are given by the following equations: $s = r\\theta$ $v = r\\omega$ $a_T = r\\alpha$"),
            ("5.2.A.3", "For a rigid system, all points within that system have the same angular velocity and angular acceleration."),
        ],
    )
    set_obj(
        "5.4.A",
        "Describe the rotational inertia of a rigid system relative to a given axis of rotation.",
        [
            ("5.4.A.1", "Rotational inertia measures a rigid system's resistance to changes in rotation and is related to the mass of the system and the distribution of that mass relative to the axis of rotation."),
            ("5.4.A.2", "The rotational inertia of an object rotating a perpendicular distance r from an axis is described by the equation $$I = mr^2$$."),
            ("5.4.A.3", "The total rotational inertia of a collection of objects about an axis is the sum of the rotational inertias of each object about that axis. $$I_{\\text{tot}} = \\sum I_i = \\sum m_i r_i^2$$"),
            ("5.4.A.4", "For a solid that can be considered as a collection of differential masses, dm, the solid's rotational inertia can be calculated using the equation $$I = \\int r^2 dm.$$ where r is the perpendicular distance from dm to the axis of rotation."),
        ],
    )
    set_obj(
        "6.2.A",
        "Describe the work done on a rigid system by a given torque or collection of torques.",
        [
            ("6.2.A.1", "A torque can transfer energy into or out of an object or rigid system if the torque is exerted over an angular displacement."),
            ("6.2.A.2", "The amount of work done on a rigid system by a torque is related to the magnitude of that torque and the angular displacement through which the rigid system rotates during the interval in which that torque is exerted. Relevant equation: $$W = \\int_{\\theta_1}^{\\theta_2} \\tau \\, d\\theta$$"),
            ("6.2.A.3", "Work done on a rigid system by a given torque can be found from the area under the curve of a graph of the torque as a function of angular position."),
        ],
    )
    set_obj(
        "6.3.B",
        "Describe the angular impulse delivered to an object or rigid system by a torque.",
        [
            ("6.3.B.1", "Angular impulse is defined as the product of the torque exerted on an object or rigid system and the time interval during which the torque is exerted. Relevant equation: angular impluse = $\\int \\tau dt$"),
            ("6.3.B.2", "Angular impulse has the same direction as the torque imparting it."),
            ("6.3.B.3", "The angular impulse delivered to an object or rigid system by a torque can be found from the area under the curve of a graph of the torque as a function of time."),
        ],
    )


def render_js_entry(key: str, value: dict) -> str:
    dumped = json.dumps(value, indent=2, ensure_ascii=False)
    lines = dumped.splitlines()
    rendered = [f'  "{key}": {lines[0]}']
    rendered.extend(f"  {line}" for line in lines[1:])
    rendered[-1] += ","
    return "\n".join(rendered)


def replace_ap_physics_c_section(js_text: str, entry_text: str) -> str:
    start_marker = '  //  AP Physics C: Mechanics'
    end_marker = '  // ─────────────────────────────────────────────\n  //  AP Calculus AB and BC'
    start = js_text.index(start_marker)
    end = js_text.index(end_marker)
    comment = (
        "  // ─────────────────────────────────────────────\n"
        "  //  AP Physics C: Mechanics (Marker markdown extracted from official CED)\n"
        "  //  Unit codes remain APPC.* for compatibility with pacing defaults.\n"
        "  //  Objectives are LO-level and subtopics are EK-level.\n"
        "  // ─────────────────────────────────────────────\n"
    )
    return js_text[:start] + comment + entry_text + "\n\n" + js_text[end:]


def main() -> None:
    taxonomy = build_taxonomy()
    OUTPUT_JSON.write_text(json.dumps(taxonomy, indent=2, ensure_ascii=False) + "\n")
    district_text = DISTRICT_TAXONOMY.read_text()
    entry_text = render_js_entry("ap_physics_c", taxonomy["ap_physics_c"])
    DISTRICT_TAXONOMY.write_text(replace_ap_physics_c_section(district_text, entry_text))
    standards = taxonomy["ap_physics_c"]["ap physics c"]["standards"]
    objective_count = sum(len(s["objectives"]) for s in standards)
    subtopic_count = sum(len(o["subtopics"]) for s in standards for o in s["objectives"])
    print(f"Wrote {OUTPUT_JSON}")
    print(f"Updated {DISTRICT_TAXONOMY}")
    print(f"Units: {len(standards)} | LOs: {objective_count} | SLOs: {subtopic_count}")


if __name__ == "__main__":
    main()
