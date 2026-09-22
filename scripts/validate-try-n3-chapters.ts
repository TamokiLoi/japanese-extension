/**
 * Validate the book-unit index used by the TRY! N3 grammar filter.
 *
 * Usage:
 *   npm run data:validate:try-n3
 *
 * The 15-chapter "Lộ trình N3" is intentionally not checked here: it is a
 * separate in-app curriculum. This validator only protects the 11 units from
 * the TRY! N3 book and their links to the merged grammar data.
 */
import fs from "node:fs";
import path from "node:path";

type GrammarCard = {
  id: string;
  level?: string;
  sources?: string[];
};

type TryUnit = {
  chapter: number;
  titleJa: string;
  titleVi: string;
  quizCount: number;
  grammarIds?: string[];
};

const root = process.cwd();
const dataDir = path.join(root, "src", "data");
const indexPath = path.join(dataDir, "try-n3-chapters.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as { book?: string; chapters?: TryUnit[] };
const chapters = index.chapters ?? [];
const errors: string[] = [];

if (index.book !== "try-n3") errors.push(`Expected book=try-n3, got ${String(index.book)}`);
if (chapters.length !== 11) errors.push(`Expected 11 book units, got ${chapters.length}`);

const expectedChapters = Array.from({ length: 11 }, (_, i) => i + 1);
const actualChapters = chapters.map((unit) => unit.chapter);
if (actualChapters.some((chapter, i) => chapter !== expectedChapters[i])) {
  errors.push(`Chapter numbers must be exactly 1..11 in order, got ${actualChapters.join(", ")}`);
}

const cards = new Map<string, GrammarCard>();
for (const fileName of fs.readdirSync(dataDir).filter((name) => /^bunpo-.*\.json$/.test(name))) {
  const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, fileName), "utf8")) as { grammarPoints?: GrammarCard[] };
  for (const card of parsed.grammarPoints ?? []) {
    if (!card.id) continue;
    const previous = cards.get(card.id);
    if (!previous) {
      cards.set(card.id, { ...card, sources: [...(card.sources ?? [])] });
    } else {
      previous.sources = [...new Set([...(previous.sources ?? []), ...(card.sources ?? [])])];
      previous.level ??= card.level;
    }
  }
}

const mappedIds = new Set<string>();
for (const unit of chapters) {
  if (!unit.titleJa || !unit.titleVi) errors.push(`Bài ${unit.chapter} is missing a title`);
  if (!Number.isInteger(unit.quizCount) || unit.quizCount <= 0) errors.push(`Bài ${unit.chapter} has an invalid quizCount`);

  const ids = unit.grammarIds ?? [];
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) errors.push(`Bài ${unit.chapter} contains duplicate grammar IDs: ${[...new Set(duplicates)].join(", ")}`);

  for (const id of ids) {
    mappedIds.add(id);
    const card = cards.get(id);
    if (!card) errors.push(`Bài ${unit.chapter} references missing grammar card ${id}`);
    else {
      if (!card.sources?.includes("try-n3")) errors.push(`${id} is linked to TRY! N3 but has no try-n3 source tag`);
      if (card.level !== "N3") errors.push(`${id} is linked to TRY! N3 but has level ${String(card.level)}`);
    }
  }
}

// TRY! N3 is an N3 book. Ignore lower/upper-level cards that may share a
// pattern in another source; they must not leak into the book-unit filter.
const tryIds = new Set(
  [...cards.values()]
    .filter((card) => card.sources?.includes("try-n3") && card.level === "N3")
    .map((card) => card.id),
);
for (const id of tryIds) {
  if (!mappedIds.has(id)) errors.push(`TRY! N3 grammar card is not mapped to any book unit: ${id}`);
}

if (errors.length > 0) {
  console.error(`TRY! N3 data validation failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`TRY! N3 data valid: ${chapters.length} units, ${tryIds.size} linked grammar cards, ${chapters.reduce((sum, unit) => sum + (unit.grammarIds?.length ?? 0), 0)} unit links.`);
}
