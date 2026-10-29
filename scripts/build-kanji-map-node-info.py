#!/usr/bin/env python3
"""Build sourced lookup metadata for map components without app cards.

Usage:
  python scripts/build-kanji-map-node-info.py --kanjidic2 C:/data/kanjidic2.xml.gz --unihan C:/data/Unihan.zip

Only KANJIDIC2 and Unicode Unihan fields are copied into the generated app
data. KanjiVG is used to find which missing component glyphs are visible.
"""

from __future__ import annotations

import argparse
import gzip
import json
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
KANJI_FILE = ROOT / "src" / "data" / "kanji-all.json"
GRAPH_FILE = ROOT / "src" / "data" / "kanji-map-components.json"
RADICAL_FILE = ROOT / "src" / "data" / "radicals-214.json"
OUTPUT_FILE = ROOT / "src" / "data" / "kanji-map-node-info.json"

# Curated Vietnamese dictionary fallback for important map nodes that do not
# have a kVietnamese/kDefinition entry in Unihan. Keep the source per entry.
CURATED_VIETNAMESE = {
    "苟": {
        "hanViet": ["cẩu"],
        "meaningVi": "cẩu thả; tạm bợ; nếu (văn cổ)",
        "source": "HVDIC",
    }
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def visible_missing_nodes(
    graph: dict[str, Any], kanji_characters: set[str], radical_characters: set[str]
) -> dict[str, dict[str, Any]]:
    records = graph["kanji"]
    component_records = graph.get("components", {})
    missing: dict[str, dict[str, Any]] = {}

    def parts_for(character: str) -> list[dict[str, Any]]:
        record = records.get(character) or component_records.get(character) or {
            "components": [],
            "radicalFallback": None,
        }
        parts = record["components"]
        if parts:
            result = []
            for part in parts:
                canonical = part["canonical"]
                display = part["character"]
                graph_key = (
                    canonical
                    if canonical in records or canonical in component_records
                    else display
                    if display in records or display in component_records
                    else None
                )
                target = (
                    canonical
                    if canonical in kanji_characters
                    else display
                    if display in kanji_characters
                    else None
                )
                result.append(
                    {
                        **part,
                        "graphKey": graph_key,
                        "target": target,
                        "radical": canonical in radical_characters
                        or display in radical_characters,
                    }
                )
            return result

        fallback = record.get("radicalFallback")
        if not fallback:
            return []
        return [
            {
                "character": fallback,
                "canonical": fallback,
                "graphKey": fallback
                if fallback in records or fallback in component_records
                else None,
                "target": fallback if fallback in kanji_characters else None,
                "radical": fallback in radical_characters,
                "variant": False,
                "partial": False,
                "count": 1,
            }
        ]

    for root in sorted(kanji_characters):
        visible: list[dict[str, Any]] = []

        def visit(character: str, depth: int, ancestry: set[str]) -> None:
            if depth >= 8 or len(visible) >= 48:
                return
            for part in parts_for(character):
                if len(visible) >= 48:
                    return
                display = part["character"]
                target = part["target"]
                graph_key = part["graphKey"]
                if (
                    display in ancestry
                    or (target and target in ancestry)
                    or (graph_key and graph_key in ancestry)
                ):
                    continue
                visible.append(part)
                if graph_key and parts_for(graph_key) and depth + 1 < 8:
                    next_ancestry = set(ancestry) | {display, graph_key}
                    if target:
                        next_ancestry.add(target)
                    visit(graph_key, depth + 1, next_ancestry)

        visit(root, 0, {root})
        seen_in_root: set[str] = set()
        for part in visible:
            if part["target"] or part["radical"]:
                continue
            character = part["character"]
            item = missing.setdefault(
                character,
                {
                    "character": character,
                    "aliases": set(),
                    "mapRoots": set(),
                    "appearances": 0,
                },
            )
            item["aliases"].add(part["canonical"])
            item["appearances"] += 1
            seen_in_root.add(character)
        for character in seen_in_root:
            missing[character]["mapRoots"].add(root)

    for character, item in missing.items():
        item["aliases"] = sorted(item["aliases"])
        item["mapRoots"] = len(item["mapRoots"])
        record = records.get(character) or component_records.get(character) or {}
        item["decompositionCount"] = len(record.get("components", []))
    return missing


def read_kanjidic(path: Path, wanted: set[str]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    opener = gzip.open if path.suffix.lower() == ".gz" else open
    with opener(path, "rb") as stream:
        root = ET.parse(stream).getroot()
    for character_node in root.findall("character"):
        character = character_node.findtext("literal")
        if character not in wanted:
            continue
        on_readings: list[str] = []
        kun_readings: list[str] = []
        meanings: list[str] = []
        reading_meaning = character_node.find("reading_meaning")
        if reading_meaning is not None:
            for group in reading_meaning.findall("rmgroup"):
                for child in group:
                    if child.tag == "reading" and child.get("r_type") == "ja_on":
                        on_readings.append(child.text or "")
                    elif child.tag == "reading" and child.get("r_type") == "ja_kun":
                        kun_readings.append(child.text or "")
                    elif child.tag == "meaning" and not child.get("m_lang"):
                        meanings.append(child.text or "")
        misc = character_node.find("misc")
        strokes = misc.findtext("stroke_count") if misc is not None else None
        result[character] = {
            "on": list(dict.fromkeys(filter(None, on_readings))),
            "kun": list(dict.fromkeys(filter(None, kun_readings))),
            "meaningsEn": list(dict.fromkeys(filter(None, meanings))),
            "strokeCount": int(strokes) if strokes and strokes.isdigit() else None,
        }
    return result


def read_unihan(path: Path, wanted: set[str]) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = defaultdict(dict)
    wanted_fields = {"kDefinition", "kVietnamese"}
    with zipfile.ZipFile(path) as archive:
        name = next(
            (item for item in archive.namelist() if item.endswith("Unihan_Readings.txt")),
            None,
        )
        if not name:
            raise SystemExit("Unihan.zip does not contain Unihan_Readings.txt")
        for line in archive.read(name).decode("utf-8").splitlines():
            if not line or line.startswith("#"):
                continue
            fields = line.split("\t", 2)
            if len(fields) != 3 or fields[1] not in wanted_fields:
                continue
            try:
                character = chr(int(fields[0][2:], 16))
            except (ValueError, IndexError):
                continue
            if character in wanted:
                result[character][fields[1]] = fields[2]
    return dict(result)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kanjidic2", required=True, type=Path, help="Path to kanjidic2.xml.gz or XML")
    parser.add_argument("--unihan", required=True, type=Path, help="Path to Unicode Unihan.zip")
    args = parser.parse_args()

    app_data = read_json(KANJI_FILE)
    graph = read_json(GRAPH_FILE)
    radical_data = read_json(RADICAL_FILE)
    kanji_characters = {item["character"] for item in app_data["kanji"]}
    radical_characters = {
        character
        for radical in radical_data["radicals"]
        for character in [radical["character"], *radical.get("variants", [])]
    }
    nodes = visible_missing_nodes(graph, kanji_characters, radical_characters)
    wanted = set(nodes)
    kanjidic = read_kanjidic(args.kanjidic2, wanted)
    unihan = read_unihan(args.unihan, wanted)

    for character, item in nodes.items():
        kd = kanjidic.get(character)
        uh = unihan.get(character, {})
        if kd:
            item["kanjidic2"] = kd
        if uh.get("kVietnamese"):
            item["hanViet"] = list(dict.fromkeys(uh["kVietnamese"].split()))
        if uh.get("kDefinition"):
            item["unihanDefinitionEn"] = uh["kDefinition"]
        curated = CURATED_VIETNAMESE.get(character)
        if curated:
            item["hanViet"] = curated["hanViet"]
            item["meaningVi"] = curated["meaningVi"]
        if kd and (kd["on"] or kd["kun"]):
            item["kind"] = "japanese-kanji"
        elif kd and kd["meaningsEn"]:
            item["kind"] = "dictionary-character"
        elif uh.get("kDefinition") or uh.get("kVietnamese"):
            item["kind"] = "han-character"
        else:
            # Absence from these dictionaries does not prove the glyph is
            # meaningless; keep that uncertainty explicit in the UI.
            item["kind"] = "unverified-character"
        sources = []
        if kd:
            sources.append("KANJIDIC2")
        if uh:
            sources.append("Unihan")
        if curated:
            sources.append(curated["source"])
        item["sources"] = sources

    metadata = {
        "schemaVersion": 1,
        "generatedAt": date.today().isoformat(),
        "visibleNodeCount": len(nodes),
        "visibleNodeAppearances": sum(item["appearances"] for item in nodes.values()),
        "sources": {
            "KANJIDIC2": {
                "url": "https://www.edrdg.org/kanjidic/kanjd2index_legacy.html",
                "license": "CC BY-SA 4.0",
            },
            "Unihan": {
                "url": "https://www.unicode.org/reports/tr38/",
                "license": "Unicode License v3",
            },
            "decomposition": {
                "url": "https://kanjivg.tagaini.net/",
                "license": "CC BY-SA 3.0",
            },
            "HVDIC": {
                "url": "https://hvdic.thivien.net/whv/%E8%8B%9F",
                "attribution": "Từ điển Hán Nôm entry reference",
            },
        },
        "coverage": {
            "kanjidic2Entries": sum("KANJIDIC2" in item["sources"] for item in nodes.values()),
            "japaneseReadings": sum(
                bool(item.get("kanjidic2", {}).get("on") or item.get("kanjidic2", {}).get("kun"))
                for item in nodes.values()
            ),
            "kanjidic2Meanings": sum(bool(item.get("kanjidic2", {}).get("meaningsEn")) for item in nodes.values()),
            "unihanDefinitions": sum(bool(item.get("unihanDefinitionEn")) for item in nodes.values()),
            "hanVietReadings": sum(bool(item.get("hanViet")) for item in nodes.values()),
            "vietnameseMeanings": sum(bool(item.get("meaningVi")) for item in nodes.values()),
            "unverifiedCharacters": sum(item["kind"] == "unverified-character" for item in nodes.values()),
        },
    }
    OUTPUT_FILE.write_text(
        json.dumps({"meta": metadata, "nodes": nodes}, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(metadata, ensure_ascii=True))
    print(f"Wrote {OUTPUT_FILE} ({OUTPUT_FILE.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
