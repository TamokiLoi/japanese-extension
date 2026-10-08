import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectJlptReading, stableHash } from "../src/lib/jlptReading.ts";
import { splitBodyIntoSentences } from "../src/lib/readingSentences.ts";
import { inferReadingUnderline } from "../src/lib/jlptReadingAnnotations.ts";
import { readingPassageUnderline, readingPassageUnderlineRange } from "../src/lib/jlptReadingAnnotations.ts";
import type { DeThiDataset } from "../src/types/dethi.ts";
import { findMarkdownPipeTables } from "../src/lib/markdownpipetable.ts";

const markdownText = "前置き\n| 種類 | 制限 |\n| --- | --- |\n| A席 | なし |\n後続文";
const [markdownTable] = findMarkdownPipeTables(markdownText);
assert.ok(markdownTable);
assert.ok(markdownTable.header);
assert.deepEqual(markdownTable.header.map(({ start, end }) => markdownText.slice(start, end)), ["種類", "制限"]);
assert.deepEqual(markdownTable.rows.map((row) => row.map(({ start, end }) => markdownText.slice(start, end))), [["A席", "なし"]]);
assert.equal(markdownText.slice(markdownTable.start, markdownTable.end), "| 種類 | 制限 |\n| --- | --- |\n| A席 | なし |\n");
assert.deepEqual(findMarkdownPipeTables("| not a table |\n| just text |"), []);

const unborderedText = "活動の種類 | 活動日・時間 | 活動場所・内容\n花や木の世話 | 毎週火曜日 | 園内で世話をします。\nホームページ作り | 毎週水曜日 | 公園の事務所で記事を書きます。";
const [unborderedTable] = findMarkdownPipeTables(unborderedText);
assert.ok(unborderedTable?.header);
assert.deepEqual(unborderedTable.header.map(({ start, end }) => unborderedText.slice(start, end)), ["活動の種類", "活動日・時間", "活動場所・内容"]);
assert.equal(unborderedTable.rows.length, 2);

const fullwidthText = "クラス名｜曜日｜開始時間｜種類｜料金\nA｜月｜19:00｜初級｜18,000円\nB｜水｜20:00｜上級｜20,000円";
const [fullwidthTable] = findMarkdownPipeTables(fullwidthText);
assert.equal(fullwidthTable?.header?.length, 5);
assert.equal(fullwidthTable?.rows.length, 2);

const fullwidthSlashText = "名前／利用した店の数／レシートの数／レシートの合計\n森田さん：2店／8枚／7,520円\nヨウさん：4店／4枚／9,080円";
const [fullwidthSlashTable] = findMarkdownPipeTables(fullwidthSlashText);
assert.equal(fullwidthSlashTable?.header?.length, 4);
assert.equal(fullwidthSlashTable?.rows.length, 2);
assert.deepEqual(fullwidthSlashTable?.header?.map(({ start, end }) => fullwidthSlashText.slice(start, end)), [
  "名前", "利用した店の数", "レシートの数", "レシートの合計",
]);

const spacedSlashText = "月2回：個人7000円 / グループ6000円\n月3回：個人10000円 / グループ8000円";
const [spacedSlashTable] = findMarkdownPipeTables(spacedSlashText);
assert.equal(spacedSlashTable?.header, undefined);
assert.equal(spacedSlashTable?.rows.length, 2);
assert.equal(spacedSlashTable?.rows[0].length, 3, "schedule labels must stay in their own first column");

const rowLabelTableText = "時間帯：14時～16時／16時～18時／18時～20時\n火曜日：バレーボール／★バスケットボール／×\n水曜日：×／バドミントン／バドミントン";
const [rowLabelTable] = findMarkdownPipeTables(rowLabelTableText);
assert.equal(rowLabelTable?.header?.length, 4);
assert.deepEqual(rowLabelTable?.header?.map(({ start, end }) => rowLabelTableText.slice(start, end)), ["時間帯", "14時～16時", "16時～18時", "18時～20時"]);
assert.equal(rowLabelTable?.rows[0].length, 4, "row labels must not merge into the first data cell");
assert.equal(rowLabelTable?.rows[0][0] && rowLabelTableText.slice(rowLabelTable.rows[0][0].start, rowLabelTable.rows[0][0].end), "火曜日");

const perPersonFees = "◇参加費\n4回コース：3,000円／人\n2回コース：1,000円／人";
assert.deepEqual(findMarkdownPipeTables(perPersonFees), [], "per-person fee lines are prose, not a slash-delimited table");
const translatedPerPersonFees = "◇Phí tham gia\nKhóa 4 lần: 3.000 yên / người\nKhóa 2 lần: 1.000 yên / người";
assert.deepEqual(findMarkdownPipeTables(translatedPerPersonFees), [], "translated per-person fee lines are prose, not a slash-delimited table");

const pairedPriceTableText = "一般（大人）：380円（体育館）、200円（卓球室）\n高校生：190円（体育館）、150円（卓球室）\n小学生・中学生：130円（体育館）、100円（卓球室）";
const [pairedPriceTable] = findMarkdownPipeTables(pairedPriceTableText);
assert.deepEqual(pairedPriceTable?.header?.map(({ start, end }) => pairedPriceTableText.slice(start, end)), ["", "体育館", "卓球室"]);
assert.equal(pairedPriceTable?.rows.length, 3);
assert.deepEqual(pairedPriceTable?.rows[0].map(({ start, end }) => pairedPriceTableText.slice(start, end)), ["一般（大人）", "380円", "200円"]);

const pairedPriceTranslation = "Phổ thông (Người lớn): 380 yên (Nhà thi đấu), 200 yên (Phòng bóng bàn)\nHọc sinh trung học phổ thông: 190 yên (Nhà thi đấu), 150 yên (Phòng bóng bàn)\nHọc sinh tiểu học và trung học cơ sở: 130 yên (Nhà thi đấu), 100 yên (Phòng bóng bàn)";
const [pairedPriceTranslationTable] = findMarkdownPipeTables(pairedPriceTranslation);
assert.equal(pairedPriceTranslationTable?.header?.length, 3);
assert.equal(pairedPriceTranslationTable?.rows.length, 3);

const raggedText = "| 種類 | 会場A | 会場B |\n| --- | --- | --- |\n| 日時 | 10月24日 |\n| 会場 | 公園 | 大通り |";
const [raggedTable] = findMarkdownPipeTables(raggedText);
assert.equal(raggedTable?.header?.length, 3);
assert.equal(raggedTable?.rows[0][1].colSpan, 2);
assert.equal(raggedTable?.rows[1].length, 3);

const headerlessText = "| コート | 2,500円 | セーター | 800円 |\n| ジャケット | 1,300円 | ワイシャツ | 400円 |";
const [headerlessTable] = findMarkdownPipeTables(headerlessText);
assert.equal(headerlessTable?.header, undefined);
assert.equal(headerlessTable?.rows.length, 2);
assert.equal(headerlessTable?.rows[0].length, 4);

const membershipText = "| 特別会員 | クリーニング基本料金の合計が3,000円以上の場合は無料 |\n| 普通会員 | クリーニング基本料金の合計が8,000円以上の場合は無料 |";
const [membershipTable] = findMarkdownPipeTables(membershipText);
assert.equal(membershipTable?.header, undefined, "long data cells containing header-like terms must not become headers");
assert.equal(membershipTable?.rows.length, 2);

const blankHeaderText = "| | 16時まで | 16時以降 |\n| 特別会員 | 3日後 | 4日後 |\n| 普通会員 | 6日後 | 7日後 |";
const [blankHeaderTable] = findMarkdownPipeTables(blankHeaderText);
assert.equal(blankHeaderTable?.header?.length, 3);
assert.equal(blankHeaderTable?.rows.length, 2);


const body = [{ text: "題名\n本文です。次の文です。", furigana: null }];
assert.equal(
  inferReadingUnderline("やってみようと思ったとあるが、何をしようと思ったのか。", "今度、私もやってみようと思った。"),
  "やってみようと思った",
);
assert.equal(inferReadingUnderline("この言葉とあるが、何を意味するか。", "この言葉が大切だ。この言葉を学ぶ。"), undefined,
  "ambiguous or non-matching phrases must not be guessed");
assert.equal(inferReadingUnderline("①例とあるが、何についての例か。", "例えば、この例があります。"), undefined,
  "a circled reference marker must not make a repeated target look unique");
assert.equal(inferReadingUnderline("②オートバイの部品が壊れていたとあるが、どういうことか。", "②オートバイの部品が壊れていた。"), "オートバイの部品が壊れていた",
  "a circled reference marker outside the source underline must be omitted");
assert.equal(readingPassageUnderline("質問側の表現とあるが、何を意味するか。", "質問側の表現", "本文側の表現", "本文側の表現です。"), "本文側の表現");
assert.equal(readingPassageUnderline("質問側の表現とあるが、何を意味するか。", "質問側の表現", null, "本文側の表現です。"), undefined,
  "a source-verified prompt-only mark must not also mark the passage");
assert.equal(readingPassageUnderlineRange("①子どもの要求について、親はどうすればいいか。", "子どもの要求", "子どもの要求", "子どもの要求はここです。子どもの要求は別の箇所です。", 0)?.start, 0,
  "a repeated phrase must support targeting the source-marked occurrence");
assert.equal(readingPassageUnderlineRange("①子どもの要求について、親はどうすればいいか。", "子どもの要求", "子どもの要求", "子どもの要求はここです。子どもの要求は別の箇所です。"), undefined,
  "an ambiguous phrase must not be marked without an occurrence annotation");
const question = { number: 23, problemGroup: "問題4", question: "質問", underline: "質問", options: ["A", "B"], correctIndex: 1, points: 1,
  passage: body[0].text, passageFurigana: body, passageVi: "Bản dịch", questionVi: "Câu hỏi", optionsVi: ["Một", "Hai"], explanation: "Lý do",
  readingPresentation: { bodySignature: stableHash(JSON.stringify(body)), sentencesVi: ["Tiêu đề và câu đầu.", "Câu tiếp."] },
};
const dataset = { meta: { level: "N3" }, exams: [{ id: "cacnam-n3-2099-12", source: "cac-nam", examLabel: "N3 T12/2099", papers: [
  { id: "reading", label: "読解", questions: [question, { ...question, number: 24, passage: "（上記と同じ）", readingPresentation: undefined }] },
  { id: "listening", label: "聴解", questions: [question] },
] }] } as unknown as DeThiDataset;
const [p] = collectJlptReading([dataset]);
assert.equal(collectJlptReading([dataset]).length, 1);
assert.equal(p.questions.length, 2);
assert.equal(p.examId, "cacnam-n3-2099-12");
assert.equal(p.examLabel, "N3 T12/2099");
assert.deepEqual(p.questions.map(q => q.sourceNumber), [23, 24]);
assert.equal(p.questions[0].correctIndex, 1);
assert.equal(p.questions[0].underline, "質問");
assert.deepEqual(p.body, body);
assert.equal(p.sentencesVi?.length, splitBodyIntoSentences(body).length);
const originalId = p.id;
question.questionVi = "Đổi trong nguồn";
question.optionsVi[0] = "Đổi đáp án dịch";
question.explanation = "Đổi giải thích";
const updated = collectJlptReading([dataset])[0];
assert.equal(updated.id, originalId);
assert.equal(updated.questions[0].questionVi, "Đổi trong nguồn");
assert.equal(updated.questions[0].optionsVi[0], "Đổi đáp án dịch");
assert.equal(updated.questions[0].explanation, "Đổi giải thích");
updated.questions[0].options[0] = "View mutation";
assert.equal(question.options[0], "A");
body[0].text += "追加。";
assert.equal(collectJlptReading([dataset])[0].sentencesVi, undefined, "stale translations must not pair with a changed body");
dataset.exams[0].papers[0].questions[0].passage = "（同上）";
assert.throws(() => collectJlptReading([dataset]), /Unresolved shared-passage/);
const officialDatasets = ["n3", "n1"].map((level) =>
  JSON.parse(readFileSync(new URL(`../src/data/dethi-${level}-cac-nam.json`, import.meta.url), "utf8")) as DeThiDataset,
);
const officialPassages = collectJlptReading(officialDatasets);
const registrySource = readFileSync(new URL("../src/popup/dethiCatalog.ts", import.meta.url), "utf8");
const mockSetPaths = [...registrySource.matchAll(/import\s+\w+\s+from\s+["']\.\.\/data\/(de-n3-set-\d+\.json)["']/gu)].map((match) => match[1]);
const mockSetDatasets = mockSetPaths.map((path) =>
  JSON.parse(readFileSync(new URL(`../src/data/${path}`, import.meta.url), "utf8")) as DeThiDataset,
);
const mockSetPassages = collectJlptReading(mockSetDatasets);
assert.equal(mockSetPassages.length > 0, true, "registered N3 practice sets must be available in Reading practice");
let mockSetTableCount = 0;
for (const passage of mockSetPassages) {
  const passageText = passage.body.map((segment) => segment.text).join("");
  const tables = findMarkdownPipeTables(passageText);
  const translatedTables = findMarkdownPipeTables(passage.translationVi);
  mockSetTableCount += tables.length;
  assert.equal(translatedTables.length, tables.length, `mock Japanese/Vietnamese table counts must match for ${passage.examLabel}/${passage.title}`);
  tables.forEach((table, index) => assert.equal(
    tableShape(translatedTables[index]),
    tableShape(table),
    `mock Japanese/Vietnamese table shapes must match for ${passage.examLabel}/${passage.title} table ${index + 1}`,
  ));
  // Table translations are intentionally rendered as a complete table instead
  // of sentence-by-sentence units, so their auxiliary sentence arrays are not
  // required to match the prose splitter.
  if (passage.sentencesVi && tables.length === 0) {
    assert.equal(passage.sentencesVi.length, splitBodyIntoSentences(passage.body).length, `mock translation units must align for ${passage.id}`);
  }
  for (const question of passage.questions) {
    assert.ok(question.correctIndex >= 0 && question.correctIndex < question.options.length, `mock answer must be present for ${passage.id}/q${question.sourceNumber}`);
  }
}
const set09Passages = mockSetPassages.filter((passage) => passage.examId === "de-n3-09");
assert.ok(set09Passages.length > 0, "Set09 must be present in Reading practice");
assert.ok(set09Passages.some((passage) => passage.length === "info-search" && passage.body.some((segment) => segment.text.includes("10キロ"))), "Set09 table passage must be classified and retained as information search");
let detectedTableCount = 0;
let translatedTableCount = 0;
const unparsedDelimiterLines: string[] = [];
function tableShape(table: ReturnType<typeof findMarkdownPipeTables>[number]): string {
  const columns = table.header?.length ?? Math.max(...table.rows.map((row) => row.reduce((count, cell) => count + (cell.colSpan ?? 1), 0)));
  return `${columns}:${table.rows.map((row) => row.reduce((count, cell) => count + (cell.colSpan ?? 1), 0)).join(",")}`;
}
for (const passage of officialPassages) {
  const passageText = passage.body.map((segment) => segment.text).join("");
  const tables = findMarkdownPipeTables(passageText);
  detectedTableCount += tables.length;
  const translatedTables = findMarkdownPipeTables(passage.translationVi);
  translatedTableCount += translatedTables.length;
  assert.equal(
    translatedTables.length,
    tables.length,
    `Japanese and Vietnamese table counts must match for ${passage.examLabel}/${passage.title}`,
  );
  tables.forEach((table, index) => assert.equal(
    tableShape(translatedTables[index]),
    tableShape(table),
    `Japanese and Vietnamese table shapes must match for ${passage.examLabel}/${passage.title} table ${index + 1}`,
  ));
  let lineStart = 0;
  for (const [lineIndex, line] of passageText.split("\n").entries()) {
    const lineEnd = lineStart + line.length;
    if (/[|｜│]/u.test(line) && !tables.some((table) => lineStart >= table.start && lineEnd <= table.end)) {
      unparsedDelimiterLines.push(`${passage.title}:${lineIndex + 1}:${line}`);
    }
    lineStart = lineEnd + 1;
  }
}
assert.equal(detectedTableCount, 14, "review the JLPT table inventory when source tables are added or changed");
assert.equal(translatedTableCount, 14, "every encoded source table must have a matching translatable table");

const readingBookNames = [
  "reading-n3-shinkanzen.json",
  "reading-n3-speedmaster.json",
  "reading-n3-taisaku.json",
  "mocktest-n3-shinkanzen.json",
  "reading-n3-dokkai55.json",
  "reading-n3-dokkai115.json",
];
const readingBookPassages = readingBookNames.flatMap((name) => {
  const dataset = JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), "utf8")) as { passages: typeof officialPassages };
  return dataset.passages;
});
let readingBookTableCount = 0;
for (const passage of readingBookPassages) {
  const passageText = passage.body.map((segment) => segment.text).join("");
  const tables = findMarkdownPipeTables(passageText);
  const translatedTables = findMarkdownPipeTables(passage.translationVi);
  readingBookTableCount += tables.length;
  assert.equal(translatedTables.length, tables.length, `Japanese and Vietnamese table counts must match for ${passage.id}`);
  tables.forEach((table, index) => assert.equal(
    tableShape(translatedTables[index]),
    tableShape(table),
    `Japanese and Vietnamese table shapes must match for ${passage.id} table ${index + 1}`,
  ));
  let lineStart = 0;
  for (const [lineIndex, line] of passageText.split("\n").entries()) {
    const lineEnd = lineStart + line.length;
    if (/[|｜│]/u.test(line) && !tables.some((table) => lineStart >= table.start && lineEnd <= table.end)) {
      unparsedDelimiterLines.push(`${passage.id}:${lineIndex + 1}:${line}`);
    }
    lineStart = lineEnd + 1;
  }
}
assert.equal(readingBookTableCount, 9, "review registered reading-book tables when sources are added or changed");
assert.equal(detectedTableCount + readingBookTableCount, 23, "review the combined JLPT and reading-book table inventory");
assert.deepEqual(unparsedDelimiterLines, [], "all pipe-like lines in registered JLPT and Reading passages must belong to a rendered table");
console.log(`PASS: shared passages, source propagation, stable progress IDs, translation grouping/staleness, table parsing and Japanese/Vietnamese table shape parity across ${officialPassages.length} annual JLPT + ${mockSetPassages.length} N3 practice-set + ${readingBookPassages.length} Reading passages (${detectedTableCount + mockSetTableCount + readingBookTableCount} source + ${translatedTableCount + mockSetTableCount + readingBookTableCount} translated tables).`);
