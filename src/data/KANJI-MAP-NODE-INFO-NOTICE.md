# Kanji Map node information attribution

`kanji-map-node-info.json` adds dictionary and reading data for map components
that do not have one of the app's study cards. The visible component list is
derived from the app's KanjiVG component map.

- Japanese on/kun readings, English meanings, and stroke counts: KANJIDIC2,
  © Electronic Dictionary Research and Development Group (EDRDG), licensed
  under CC BY-SA 4.0. See the [KANJIDIC2 project](https://www.edrdg.org/kanjidic/kanjd2index_legacy.html)
  and [EDRDG licence](https://www.edrdg.org/edrdg/newlic.html).
- Vietnamese readings and English Han-character definitions, where present:
  Unicode Unihan Database, Unicode License v3. See the [Unihan documentation](https://www.unicode.org/reports/tr38/)
  and [data licence](https://github.com/unicode-org/unihan-database/blob/main/LICENSE).
- A Vietnamese Hán-Việt reading and short Vietnamese gloss for 苟 are curated
  from its [Từ điển Hán Nôm entry](https://hvdic.thivien.net/whv/%E8%8B%9F).
- Component glyphs and decomposition: KanjiVG, © Ulrich Apel, CC BY-SA 3.0.
  See the [KanjiVG project](https://kanjivg.tagaini.net/).

The generated JSON records its source datasets and coverage. Unihan definitions
are cross-lingual character glosses, not verified Japanese vocabulary senses.
The data is for map lookup and does not add these rare characters to the JLPT
study-card deck.
