import type { BunpoGrammarPoint, BunpoSense, BunpoSenseSource, BunpoSource } from "../types/bunpo.ts";
import type { JlptLevel } from "../types/kanji.ts";

export interface BunpoLegacyReference {
  grammarId: string;
  senseId: string;
}

export interface BunpoStudyItem {
  /** Progress key. Each canonical meaning has independent study state. */
  id: string;
  grammarId: string;
  senseId: string;
  level: JlptLevel;
  levels: JlptLevel[];
  pattern: string;
  patternVariants: string[];
  meaningVi: string;
  sources: BunpoSource[];
  chapters: BunpoSense["chapters"];
  sense: BunpoSense;
}

interface SameMeaningGroup {
  key: string;
  oldIds: string[];
}

interface FamilyDefinition {
  key: string;
  pattern: string;
  oldIds: string[];
  sameMeaningGroups: SameMeaningGroup[];
}

// Curated cross-book aliases and same-meaning groups. The source datasets are
// intentionally left untouched; this manifest only describes their canonical
// presentation. IDs here are migration inputs, never exposed by the catalog.
const FAMILIES: FamilyDefinition[] = [
  { key: "te-miru", pattern: "〜てみる", oldIds: ["bunpo-400-58", "bunpo-kaiwa-16", "bunpo-n4-infographic-74", "bunpo-jlpt-9", "bunpo-chuong3-10"], sameMeaningGroups: [{ key: "try-doing", oldIds: ["bunpo-400-58", "bunpo-kaiwa-16", "bunpo-n4-infographic-74", "bunpo-jlpt-9", "bunpo-chuong3-10"] }] },
  { key: "okagede", pattern: "〜おかげで", oldIds: ["bunpo-jlpt-16", "bunpo-chuong5-3", "bunpo-chuong7-6", "bunpo-chuong10-5", "bunpo-chuong11-5", "bunpo-chuong12-5"], sameMeaningGroups: [{ key: "positive-cause", oldIds: ["bunpo-jlpt-16", "bunpo-chuong5-3", "bunpo-chuong7-6", "bunpo-chuong10-5", "bunpo-chuong11-5", "bunpo-chuong12-5"] }] },
  { key: "osorega-aru", pattern: "〜おそれがある", oldIds: ["bunpo-400-327", "bunpo-jlpt-41", "bunpo-chuong10-8", "bunpo-chuong11-8"], sameMeaningGroups: [{ key: "risk", oldIds: ["bunpo-400-327", "bunpo-jlpt-41", "bunpo-chuong10-8", "bunpo-chuong11-8"] }] },
  { key: "kadouka", pattern: "〜かどうか", oldIds: ["bunpo-400-57", "bunpo-kaiwa-35", "bunpo-n4-infographic-73"], sameMeaningGroups: [{ key: "whether", oldIds: ["bunpo-400-57", "bunpo-kaiwa-35", "bunpo-n4-infographic-73"] }] },
  { key: "kotonisuru", pattern: "〜ことにする", oldIds: ["bunpo-jlpt-27", "bunpo-chuong1-6"], sameMeaningGroups: [{ key: "speaker-decision", oldIds: ["bunpo-jlpt-27", "bunpo-chuong1-6"] }] },
  { key: "kotoninaru", pattern: "〜ことになる", oldIds: ["bunpo-jlpt-3", "bunpo-jlpt-28", "bunpo-chuong1-5"], sameMeaningGroups: [{ key: "decision-arrangement", oldIds: ["bunpo-jlpt-3", "bunpo-jlpt-28", "bunpo-chuong1-5"] }] },
  { key: "kotoni-yotte", pattern: "〜ことによって", oldIds: ["bunpo-chuong10-9", "bunpo-chuong11-9", "bunpo-chuong12-9"], sameMeaningGroups: [{ key: "means-result", oldIds: ["bunpo-chuong10-9", "bunpo-chuong11-9", "bunpo-chuong12-9"] }] },
  { key: "seide", pattern: "〜せいで", oldIds: ["bunpo-jlpt-17", "bunpo-chuong5-4", "bunpo-chuong7-5", "bunpo-chuong10-6", "bunpo-chuong11-6", "bunpo-chuong12-6"], sameMeaningGroups: [{ key: "negative-cause", oldIds: ["bunpo-jlpt-17", "bunpo-chuong5-4", "bunpo-chuong7-5", "bunpo-chuong10-6", "bunpo-chuong11-6", "bunpo-chuong12-6"] }] },
  { key: "tabini", pattern: "〜たびに", oldIds: ["bunpo-jlpt-36", "bunpo-chuong8-10", "bunpo-chuong14-6", "bunpo-tryn3-38"], sameMeaningGroups: [{ key: "each-time", oldIds: ["bunpo-jlpt-36", "bunpo-chuong8-10", "bunpo-chuong14-6", "bunpo-tryn3-38"] }] },
  { key: "tameni", pattern: "〜ために", oldIds: ["bunpo-400-62", "bunpo-jlpt-15", "bunpo-chuong1-4", "bunpo-chuong7-1", "bunpo-chuong10-1", "bunpo-chuong11-1", "bunpo-chuong12-1", "bunpo-chuong13-3", "bunpo-n4-infographic-81", "bunpo-jlpt-33", "bunpo-400-128", "bunpo-400-129"], sameMeaningGroups: [{ key: "purpose", oldIds: ["bunpo-400-62", "bunpo-jlpt-15", "bunpo-chuong1-4", "bunpo-chuong7-1", "bunpo-chuong10-1", "bunpo-chuong11-1", "bunpo-chuong12-1", "bunpo-chuong13-3", "bunpo-n4-infographic-81", "bunpo-400-128"] }, { key: "cause", oldIds: ["bunpo-jlpt-33", "bunpo-400-129"] }] },
  { key: "soudesu", pattern: "〜そうです", oldIds: ["bunpo-400-67", "bunpo-n4-infographic-85", "bunpo-400-82", "bunpo-n4-infographic-100"], sameMeaningGroups: [{ key: "appearance", oldIds: ["bunpo-400-67", "bunpo-n4-infographic-85"] }, { key: "hearsay", oldIds: ["bunpo-400-82", "bunpo-n4-infographic-100"] }] },
  { key: "uchini", pattern: "〜うちに", oldIds: ["bunpo-jlpt-1", "bunpo-chuong2-6", "bunpo-chuong8-8", "bunpo-chuong14-10", "bunpo-shinkanzen-1"], sameMeaningGroups: [{ key: "within-a-period", oldIds: ["bunpo-jlpt-1", "bunpo-chuong2-6", "bunpo-chuong8-8", "bunpo-chuong14-10", "bunpo-shinkanzen-1"] }] },
  { key: "koto-ga-aru", pattern: "〜ことがある", oldIds: ["bunpo-jlpt-19", "bunpo-chuong2-1", "bunpo-400-172", "bunpo-tryn3-11"], sameMeaningGroups: [{ key: "experience", oldIds: ["bunpo-jlpt-19", "bunpo-chuong2-1"] }, { key: "occasional-event", oldIds: ["bunpo-400-172", "bunpo-tryn3-11"] }] },
  { key: "shikanai", pattern: "〜しかない", oldIds: ["bunpo-jlpt-39", "bunpo-400-335", "bunpo-n4-infographic-10"], sameMeaningGroups: [{ key: "no-choice", oldIds: ["bunpo-jlpt-39", "bunpo-400-335"] }, { key: "only", oldIds: ["bunpo-n4-infographic-10"] }] },
  { key: "noni", pattern: "〜のに", oldIds: ["bunpo-400-63", "bunpo-400-75", "bunpo-shinkanzen-39", "bunpo-n4-infographic-82", "bunpo-n4-infographic-93", "bunpo-kaiwa-30"], sameMeaningGroups: [{ key: "purpose", oldIds: ["bunpo-400-63", "bunpo-shinkanzen-39", "bunpo-n4-infographic-82", "bunpo-kaiwa-30"] }, { key: "concession", oldIds: ["bunpo-400-75", "bunpo-n4-infographic-93"] }] },
  { key: "youni", pattern: "〜ように", oldIds: ["bunpo-chuong1-1", "bunpo-chuong9-6", "bunpo-400-39", "bunpo-400-178", "bunpo-400-179", "bunpo-400-180", "bunpo-shinkanzen-45", "bunpo-shinkanzen-46", "bunpo-shinkanzen-47", "bunpo-shinkanzen-48", "bunpo-shinkanzen-49", "bunpo-tryn3-17", "bunpo-tryn3-27", "bunpo-n4-infographic-50", "bunpo-jlpt-26", "bunpo-shinkanzen-73"], sameMeaningGroups: [{ key: "purpose", oldIds: ["bunpo-chuong1-1", "bunpo-400-39", "bunpo-shinkanzen-48", "bunpo-n4-infographic-50"] }, { key: "resemblance", oldIds: ["bunpo-chuong9-6", "bunpo-400-178", "bunpo-400-179", "bunpo-shinkanzen-45", "bunpo-shinkanzen-46", "bunpo-shinkanzen-47", "bunpo-tryn3-17", "bunpo-tryn3-27"] }, { key: "request-or-wish", oldIds: ["bunpo-400-180", "bunpo-shinkanzen-49", "bunpo-jlpt-26", "bunpo-shinkanzen-73"] }] },
  { key: "younisuru", pattern: "〜ようにする", oldIds: ["bunpo-jlpt-18", "bunpo-chuong1-3", "bunpo-n4-infographic-51"], sameMeaningGroups: [{ key: "make-habit", oldIds: ["bunpo-jlpt-18", "bunpo-chuong1-3", "bunpo-n4-infographic-51"] }] },
  { key: "youninaru", pattern: "〜ようになる", oldIds: ["bunpo-jlpt-2", "bunpo-chuong1-2"], sameMeaningGroups: [{ key: "change-state", oldIds: ["bunpo-jlpt-2", "bunpo-chuong1-2"] }] },
  { key: "yoteida", pattern: "〜予定だ", oldIds: ["bunpo-jlpt-59", "bunpo-chuong1-10"], sameMeaningGroups: [{ key: "planned", oldIds: ["bunpo-jlpt-59", "bunpo-chuong1-10"] }] },
  { key: "saichuni", pattern: "〜最中に", oldIds: ["bunpo-400-235", "bunpo-jlpt-38", "bunpo-chuong2-8"], sameMeaningGroups: [{ key: "in-middle", oldIds: ["bunpo-400-235", "bunpo-jlpt-38", "bunpo-chuong2-8"] }] },
  { key: "tochude", pattern: "〜途中で", oldIds: ["bunpo-400-55", "bunpo-jlpt-37", "bunpo-n4-infographic-71"], sameMeaningGroups: [{ key: "midway", oldIds: ["bunpo-400-55", "bunpo-jlpt-37", "bunpo-n4-infographic-71"] }] },
  { key: "tabakari", pattern: "〜たばかり", oldIds: ["bunpo-400-80", "bunpo-n4-infographic-98"], sameMeaningGroups: [{ key: "just-did", oldIds: ["bunpo-400-80", "bunpo-n4-infographic-98"] }] },
  { key: "teiru-tokoro", pattern: "〜ているところ", oldIds: ["bunpo-400-77", "bunpo-n4-infographic-96"], sameMeaningGroups: [{ key: "in-progress", oldIds: ["bunpo-400-77", "bunpo-n4-infographic-96"] }] },
  { key: "ru-tokoro", pattern: "〜るところ", oldIds: ["bunpo-400-76", "bunpo-n4-infographic-95"], sameMeaningGroups: [{ key: "about-to-do", oldIds: ["bunpo-400-76", "bunpo-n4-infographic-95"] }] },
  { key: "teoku", pattern: "〜ておく", oldIds: ["bunpo-400-15", "bunpo-n4-infographic-22"], sameMeaningGroups: [{ key: "prepare-in-advance", oldIds: ["bunpo-400-15", "bunpo-n4-infographic-22"] }] },
  { key: "teshimau", pattern: "〜てしまう", oldIds: ["bunpo-400-13", "bunpo-n4-infographic-17"], sameMeaningGroups: [{ key: "completion-regret", oldIds: ["bunpo-400-13", "bunpo-n4-infographic-17"] }] },
  { key: "sugiru", pattern: "〜すぎる", oldIds: ["bunpo-400-69", "bunpo-n4-infographic-88"], sameMeaningGroups: [{ key: "excess", oldIds: ["bunpo-400-69", "bunpo-n4-infographic-88"] }] },
  { key: "teitadakemasenka", pattern: "〜ていただけませんか", oldIds: ["bunpo-400-3", "bunpo-n4-infographic-2"], sameMeaningGroups: [{ key: "polite-request", oldIds: ["bunpo-400-3", "bunpo-n4-infographic-2"] }] },
  { key: "kara", pattern: "〜から", oldIds: ["bunpo-chuong7-3", "bunpo-chuong10-3", "bunpo-chuong11-3", "bunpo-chuong12-3", "bunpo-chuong13-1"], sameMeaningGroups: [{ key: "reason", oldIds: ["bunpo-chuong7-3", "bunpo-chuong10-3", "bunpo-chuong11-3", "bunpo-chuong12-3"] }] },
  { key: "node", pattern: "〜ので", oldIds: ["bunpo-chuong5-1", "bunpo-chuong7-2", "bunpo-chuong10-2", "bunpo-chuong11-2", "bunpo-chuong12-2", "bunpo-chuong13-2", "bunpo-400-54", "bunpo-n4-infographic-70"], sameMeaningGroups: [{ key: "objective-reason", oldIds: ["bunpo-chuong5-1", "bunpo-chuong7-2", "bunpo-chuong10-2", "bunpo-chuong11-2", "bunpo-chuong12-2", "bunpo-400-54", "bunpo-n4-infographic-70"] }] },
  { key: "riyude", pattern: "〜理由で", oldIds: ["bunpo-chuong10-4", "bunpo-chuong11-4"], sameMeaningGroups: [{ key: "stated-reason", oldIds: ["bunpo-chuong10-4", "bunpo-chuong11-4"] }] },
  { key: "karaniha", pattern: "〜からには", oldIds: ["bunpo-chuong7-4", "bunpo-chuong10-7", "bunpo-chuong11-7", "bunpo-chuong12-8"], sameMeaningGroups: [{ key: "commitment", oldIds: ["bunpo-chuong7-4", "bunpo-chuong10-7", "bunpo-chuong11-7", "bunpo-chuong12-8"] }] },
];

const LEVEL_ORDER: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

export function normalizeBunpoPattern(pattern: string): string {
  return pattern.normalize("NFKC").replace(/[〜～~]/gu, "〜").replace(/[・･]/gu, "・").replace(/\s+/gu, "").trim();
}

function normalizeMeaning(meaning: string): string {
  return meaning
    .normalize("NFKC")
    .toLocaleLowerCase("vi")
    .replace(/[“”‘’"'.,!?;:…()（）「」『』]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (const char of value) {
    result ^= char.codePointAt(0) ?? 0;
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

function recordScore(record: BunpoGrammarPoint): number {
  return (record.meaningVi.trim() ? 1 : 0) + (record.usage?.trim() ? 2 : 0) +
    (record.formula?.trim() ? 2 : 0) + (record.examTip?.trim() ? 1 : 0) +
    (record.example?.trim() ? 1 : 0) + (record.exampleVi.trim() ? 1 : 0) +
    (record.moreExamples?.length ?? 0);
}

function unique<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeExampleText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/gu, "").trim();
}

function uniqueExamples(items: { jp: string; vi: string }[]): { jp: string; vi: string }[] {
  const examples: { jp: string; vi: string }[] = [];
  const indexByKey = new Map<string, number>();
  for (const item of items) {
    const jp = normalizeExampleText(item.jp);
    const vi = normalizeExampleText(item.vi);
    const key = jp ? `jp:${jp}` : vi ? `vi:${vi}` : "";
    if (!key) continue;

    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, examples.length);
      examples.push(item);
      continue;
    }

    // Keep one rendering per Japanese sentence, but recover a translation if
    // an earlier source supplied the same sentence without one.
    if (!examples[existingIndex]!.vi.trim() && item.vi.trim()) {
      examples[existingIndex] = { ...examples[existingIndex]!, vi: item.vi };
    }
  }
  return examples;
}

function asSourceDetails(record: BunpoGrammarPoint): BunpoSenseSource[] {
  const examples = uniqueExamples(
    [
      ...(record.example.trim() || record.exampleVi.trim() ? [{ jp: record.example, vi: record.exampleVi }] : []),
      ...(record.moreExamples ?? []),
    ],
  );
  return (record.sources ?? []).map((source) => ({
    source,
    level: record.level,
    ...(source === "theo-chuong" && record.chapter !== undefined ? { chapter: record.chapter } : {}),
    ...(source === "theo-chuong" && record.chapterTitle ? { chapterTitle: record.chapterTitle } : {}),
    ...(record.formula ? { formula: record.formula } : {}),
    ...(record.usage ? { usage: record.usage } : {}),
    ...(record.examTip ? { examTip: record.examTip } : {}),
    examples,
  }));
}

function makeSense(id: string, records: BunpoGrammarPoint[]): BunpoSense {
  const ranked = [...records].sort((a, b) => recordScore(b) - recordScore(a));
  const best = ranked[0]!;
  const sourceDetails = records.flatMap(asSourceDetails);
  const examples = uniqueExamples(sourceDetails.flatMap((detail) => detail.examples));
  const levels = unique(records.map((record) => record.level), (level) => level).sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
  const sources = unique(sourceDetails.map((detail) => detail.source), (source) => source);
  const chapters = unique(
    sourceDetails.filter((detail) => detail.source === "theo-chuong" && detail.chapter !== undefined).map((detail) => ({
      source: "theo-chuong" as const,
      chapter: detail.chapter!,
      ...(detail.chapterTitle ? { chapterTitle: detail.chapterTitle } : {}),
    })),
    (chapter) => `${chapter.chapter}:${chapter.chapterTitle ?? ""}`,
  );
  const compareWith = unique(records.flatMap((record) => record.compareWith ?? []), (item) => `${item.pattern}\u0000${item.note}`);
  return {
    id,
    meaningVi: ranked.find((record) => record.meaningVi.trim())?.meaningVi ?? "",
    levels,
    sources,
    chapters,
    ...(best.formula ? { formula: best.formula } : {}),
    ...(best.usage ? { usage: best.usage } : {}),
    ...(best.examTip ? { examTip: best.examTip } : {}),
    examples,
    ...(compareWith.length ? { compareWith } : {}),
    sourceDetails,
  };
}

function projectLegacyFields(point: Omit<BunpoGrammarPoint, "meaningVi" | "example" | "exampleVi" | "sources" | "chapter" | "chapterTitle" | "formula" | "usage" | "examTip" | "moreExamples" | "compareWith"> & { senses: BunpoSense[]; levels: JlptLevel[]; patternVariants: string[] }): BunpoGrammarPoint {
  const first = point.senses[0];
  const primaryExample = first?.examples[0];
  const sources = unique(point.senses.flatMap((sense) => sense.sources), (source) => source);
  const allChapters = unique(point.senses.flatMap((sense) => sense.chapters), (chapter) => `${chapter.chapter}:${chapter.chapterTitle ?? ""}`);
  return {
    ...point,
    level: point.levels[0] ?? "N3",
    levels: point.levels,
    sources,
    ...(allChapters.length === 1 ? { chapter: allChapters[0]!.chapter, chapterTitle: allChapters[0]!.chapterTitle } : {}),
    meaningVi: first?.meaningVi ?? "",
    ...(first?.formula ? { formula: first.formula } : {}),
    ...(first?.usage ? { usage: first.usage } : {}),
    ...(first?.examTip ? { examTip: first.examTip } : {}),
    example: primaryExample?.jp ?? "",
    exampleVi: primaryExample?.vi ?? "",
    ...(first && first.examples.length > 1 ? { moreExamples: first.examples.slice(1) } : {}),
    ...(first?.compareWith?.length ? { compareWith: first.compareWith } : {}),
  };
}

export function canonicalizeBunpo(records: BunpoGrammarPoint[]): {
  grammarPoints: BunpoGrammarPoint[];
  legacyIdMap: Record<string, BunpoLegacyReference>;
} {
  const recordById = new Map(records.map((record) => [record.id, record]));
  const manualFamilyByPattern = new Map<string, FamilyDefinition>();
  const manualFamilyById = new Map<string, FamilyDefinition>();
  const manualSenseById = new Map<string, string>();

  for (const family of FAMILIES) {
    for (const oldId of family.oldIds) {
      const record = recordById.get(oldId);
      if (!record) continue;
      const patternKey = normalizeBunpoPattern(record.pattern);
      const existing = manualFamilyByPattern.get(patternKey);
      if (!existing || existing.key === family.key) manualFamilyByPattern.set(patternKey, family);
      manualFamilyById.set(oldId, family);
    }
    for (const group of family.sameMeaningGroups) {
      for (const oldId of group.oldIds) manualSenseById.set(oldId, group.key);
    }
  }

  const families = new Map<string, { pattern: string; records: BunpoGrammarPoint[] }>();
  for (const record of records) {
    const manualFamily = manualFamilyById.get(record.id) ?? manualFamilyByPattern.get(normalizeBunpoPattern(record.pattern));
    const key = manualFamily ? `manual:${manualFamily.key}` : `pattern:${normalizeBunpoPattern(record.pattern)}`;
    const group = families.get(key) ?? { pattern: manualFamily?.pattern ?? record.pattern, records: [] };
    group.records.push(record);
    families.set(key, group);
  }

  const legacyIdMap: Record<string, BunpoLegacyReference> = {};
  const grammarPoints = [...families.entries()].map(([familyKey, group]) => {
    const id = `bunpo-${hash(familyKey)}`;
    const senseRecords = new Map<string, BunpoGrammarPoint[]>();
    for (const record of group.records) {
      const explicitSense = manualSenseById.get(record.id);
      const normalizedMeaning = normalizeMeaning(record.meaningVi);
      const senseKey = explicitSense ? `manual:${explicitSense}` : normalizedMeaning ? `meaning:${normalizedMeaning}` : `record:${record.id}`;
      const sameSense = senseRecords.get(senseKey) ?? [];
      sameSense.push(record);
      senseRecords.set(senseKey, sameSense);
    }

    const senses = [...senseRecords.entries()].map(([senseKey, sourceRecords]) => makeSense(`sense-${hash(`${familyKey}|${senseKey}`)}`, sourceRecords));
    const levels = unique(senses.flatMap((sense) => sense.levels), (level) => level).sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
    const patternVariants = unique(group.records.map((record) => record.pattern.trim()), (pattern) => normalizeBunpoPattern(pattern));
    const point = projectLegacyFields({
      id,
      level: levels[0] ?? "N3",
      levels,
      pattern: group.pattern,
      patternVariants,
      senses,
    });
    for (const [senseKey, sourceRecords] of senseRecords.entries()) {
      const sense = senses.find((entry) => entry.id === `sense-${hash(`${familyKey}|${senseKey}`)}`)!;
      for (const sourceRecord of sourceRecords) legacyIdMap[sourceRecord.id] = { grammarId: id, senseId: sense.id };
    }
    return point;
  });

  if (new Set(grammarPoints.map((point) => point.id)).size !== grammarPoints.length) {
    throw new Error("Canonical grammar id hash collision detected.");
  }
  return { grammarPoints, legacyIdMap };
}

export function bunpoProgressId(grammarId: string, senseId: string): string {
  return `bunpo:${grammarId}:${senseId}`;
}

export function toBunpoStudyItem(grammarId: string, sense: BunpoSense, pattern: string, patternVariants: string[]): BunpoStudyItem {
  return {
    id: bunpoProgressId(grammarId, sense.id),
    grammarId,
    senseId: sense.id,
    level: sense.levels[0] ?? "N3",
    levels: sense.levels,
    pattern,
    patternVariants,
    meaningVi: sense.meaningVi,
    sources: sense.sources,
    chapters: sense.chapters,
    sense,
  };
}
