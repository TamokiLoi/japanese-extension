#!/usr/bin/env python3
"""Build the compact app Kanji Map component index from a KanjiVG checkout.

Usage:
  python scripts/build-kanji-map-data.py C:/path/to/kanjivg

Only the component labels and their KanjiVG grouping metadata are emitted; the
upstream stroke SVGs are not copied into the app bundle.
"""

from __future__ import annotations

import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KANJI_FILE = ROOT / "src" / "data" / "kanji-all.json"
OUTPUT_FILE = ROOT / "src" / "data" / "kanji-map-components.json"
KVG_NS = "{http://kanjivg.tagaini.net}"


def attr(element: ET.Element, name: str) -> str | None:
    return element.get(f"{KVG_NS}{name}")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def component_groups(path: Path, character: str) -> list[dict[str, object]]:
    root = ET.parse(path).getroot()
    strokes = next(
        (node for node in root if (node.get("id") or "").startswith("kvg:StrokePaths")),
        None,
    )
    if strokes is None:
        return []

    kanji_group = next(
        (
            node
            for node in strokes
            if local_name(node.tag) == "g" and attr(node, "element") == character
        ),
        None,
    )
    if kanji_group is None:
        return []

    components: list[dict[str, object]] = []
    positions: dict[tuple[str, str | None, str | None], int] = {}
    for group in kanji_group:
        if local_name(group.tag) != "g":
            continue
        element = attr(group, "element")
        if not element:
            continue
        original = attr(group, "original")
        position = attr(group, "position")
        key = (element, original, position)
        if key in positions:
            components[positions[key]]["count"] = int(components[positions[key]]["count"]) + 1
            continue
        positions[key] = len(components)
        components.append(
            {
                "character": element,
                "canonical": original or element,
                "position": position,
                "variant": attr(group, "variant") == "true",
                "partial": attr(group, "partial") == "true",
                "count": 1,
            }
        )
    return components


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Pass the root directory of a KanjiVG checkout.")

    kanjivg_root = Path(sys.argv[1]).resolve()
    kanji_dir = kanjivg_root / "kanji"
    if not kanji_dir.is_dir():
        raise SystemExit(f"KanjiVG kanji directory not found: {kanji_dir}")

    try:
        source_revision = subprocess.check_output(
            ["git", "-C", str(kanjivg_root), "rev-parse", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        source_revision = "unknown"

    dataset = json.loads(KANJI_FILE.read_text(encoding="utf-8"))
    records: dict[str, dict[str, object]] = {}
    missing: list[str] = []
    for item in dataset["kanji"]:
        character = item["character"]
        svg_path = kanji_dir / f"{ord(character):05x}.svg"
        if not svg_path.is_file():
            missing.append(character)
            continue
        components = component_groups(svg_path, character)
        radical = (item.get("radical") or {}).get("character")
        records[character] = {
            "components": components,
            "radicalFallback": radical if not components and radical and radical != character else None,
        }

    if missing:
        raise SystemExit(f"Missing KanjiVG files for {len(missing)} app characters: {''.join(missing)}")

    # Keep decompositions for KanjiVG components outside the app's 2,381-card
    # set as well. They let the map open another layer for fragments such as
    # 𠂉 without pretending that every fragment has a standalone Kanji card.
    component_records: dict[str, dict[str, object]] = {}
    pending = [
        component.get("canonical") or component.get("character")
        for record in records.values()
        for component in record["components"]
    ]
    checked: set[str] = set(records)
    while pending:
        character = pending.pop()
        if not isinstance(character, str) or len(character) != 1 or character in checked:
            continue
        checked.add(character)
        svg_path = kanji_dir / f"{ord(character):05x}.svg"
        if not svg_path.is_file():
            continue
        components = component_groups(svg_path, character)
        component_records[character] = {"components": components, "radicalFallback": None}
        pending.extend(
            component.get("canonical") or component.get("character")
            for component in components
        )

    output = {
        "meta": {
            "source": "KanjiVG",
            "sourceUrl": "https://kanjivg.tagaini.net/",
            "sourceRevision": source_revision,
            "license": "CC BY-SA 3.0",
            "recordCount": len(records),
            "recordsWithComponents": sum(bool(item["components"]) for item in records.values()),
            "recordsUsingRadicalFallback": sum(bool(item["radicalFallback"]) for item in records.values()),
            "recordsWithoutDecomposition": sum(not item["components"] and not item["radicalFallback"] for item in records.values()),
            "componentRecordCount": len(component_records),
            "componentRecordsWithDecomposition": sum(bool(item["components"]) for item in component_records.values()),
        },
        "kanji": records,
        "components": component_records,
    }
    OUTPUT_FILE.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(output["meta"], ensure_ascii=False))
    print(f"Wrote {OUTPUT_FILE} ({OUTPUT_FILE.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
