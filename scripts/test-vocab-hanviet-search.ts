import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildKanjiHanVietReadings, matchesComposedHanViet } from "../src/lib/vocabhanvietsearch.ts";
import type { Kanji } from "../src/types/kanji.ts";

const kanji = JSON.parse(readFileSync(new URL("../src/data/kanji-all.json", import.meta.url), "utf8")).kanji as Kanji[];
const words = JSON.parse(readFileSync(new URL("../src/data/vocab-tango-new.json", import.meta.url), "utf8")).words as {
  word: string;
  hanViet: string[];
}[];
const readings = buildKanjiHanVietReadings(kanji);
const spacetime = words.find((entry) => entry.word === "時空");
assert.ok(spacetime);
assert.deepEqual(spacetime.hanViet, ["THÌ KHÔNG"]);
assert.ok(matchesComposedHanViet(spacetime.word, "Thời Không", readings));
assert.ok(matchesComposedHanViet(spacetime.word, "  THỜI   KHÔNG  ", readings));
assert.ok(matchesComposedHanViet(spacetime.word, "Thì Không", readings));
assert.equal(matchesComposedHanViet(spacetime.word, "Thời", readings), false, "no partial compound match");
assert.equal(matchesComposedHanViet(spacetime.word, "Thời Gian", readings), false);
assert.equal(matchesComposedHanViet("時かな", "Thời Không", readings), false, "kana cannot be guessed as Hán Việt");
console.log("PASS: vocabulary search matches alternate Kanji readings without altering stored Hán Việt or guessing partial words.");
