// One-off: adds sentencesVi (per-sentence Vietnamese translation) to every
// reading passage across all 6 datasets, so the Reading screen can show
// JP/VI sentence-by-sentence like Listening's turns instead of one dense
// translated block.
//
// Every passage already has a full-block `translationVi` (already
// translated, reviewed, in use as the old fallback block translation) --
// so this does NOT re-translate from scratch. It asks Gemini to *split/
// rearrange* that existing text into per-sentence pieces aligned to the JP
// sentences, reusing the existing wording as-is wherever possible. Cheaper
// than fresh translation and keeps the wording consistent with what's
// already been reviewed.
//
// Sentence boundaries are derived from `body` the exact same way
// splitBodyIntoSentences() in src/popup/readingState.ts does (duplicated
// here, not imported, so this script has no dependency on chrome.storage/
// the extension runtime) -- sentencesVi[i] must line up with that function's
// output at render time, so if you change the splitting regex, change it in
// both places.
//
// Usage: node --experimental-strip-types scripts/translate-reading-sentences.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const DATA_FILES = [
  "reading-n3-shinkanzen.json",
  "reading-n3-speedmaster.json",
  "reading-n3-taisaku.json",
  "mocktest-n3-shinkanzen.json",
  "reading-n3-dokkai55.json",
  "reading-n3-dokkai115.json",
];
interface BodySegment {
  text: string;
  furigana: string | null;
}
interface Passage {
  id: string;
  title: string;
  body: BodySegment[];
  translationVi: string;
  sentencesVi?: string[];
}

const CLOSING_PUNCT = /[」』）)]/;
function splitPlainText(text: string): string[] {
  const pieces: string[] = [];
  let buf = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\n" && buf.length > 0) {
      pieces.push(buf);
      buf = "";
    }
    buf += ch;
    if (ch === "。" || ch === "！" || ch === "？") {
      while (i + 1 < text.length && CLOSING_PUNCT.test(text[i + 1])) {
        i++;
        buf += text[i];
      }
      pieces.push(buf);
      buf = "";
    }
    i++;
  }
  if (buf) pieces.push(buf);
  return pieces;
}

const SENTENCE_END = /[。！？]$/;
function splitBodyIntoSentences(body: BodySegment[]): BodySegment[][] {
  const groups: BodySegment[][] = [];
  let current: BodySegment[] = [];
  function addPiece(text: string, furigana: string | null) {
    if (text.startsWith("\n") && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push({ text, furigana });
    if (SENTENCE_END.test(text)) {
      groups.push(current);
      current = [];
    }
  }
  for (const seg of body) {
    const pieces = splitPlainText(seg.text);
    pieces.forEach((piece, i) => addPiece(piece, i === pieces.length - 1 ? seg.furigana : null));
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

async function alignBatchOnce(apiKey: string, jpSentences: string[], translationVi: string): Promise<string[]> {
  const prompt =
    `Đây là bản dịch tiếng Việt ĐẦY ĐỦ (đã có sẵn, KHÔNG cần dịch lại) của 1 bài đọc hiểu JLPT:\n"""${translationVi}"""\n\n` +
    `Đây là ${jpSentences.length} câu tiếng Nhật gốc theo đúng thứ tự trong bài:\n` +
    jpSentences.map((s, i) => `${i + 1}. ${s}`).join("\n") +
    `\n\nHãy TÁCH bản dịch tiếng Việt ở trên thành đúng ${jpSentences.length} đoạn, mỗi đoạn khớp với 1 câu tiếng Nhật cùng số thứ tự. ` +
    `Giữ nguyên nguyên văn cách dùng từ của bản dịch đã có, chỉ được chỉnh sửa nhẹ (thêm/bớt dấu câu, tách câu ghép) để mỗi đoạn đọc độc lập vẫn rõ nghĩa -- KHÔNG dịch lại hay đổi nội dung. ` +
    `Trả lời DUY NHẤT 1 JSON array cùng thứ tự, ĐÚNG ${jpSentences.length} phần tử, mỗi phần tử là 1 chuỗi tiếng Việt.`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini call failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`No text in response: ${JSON.stringify(data).slice(0, 500)}`);
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error(`Expected array, got ${typeof parsed}`);
  return parsed;
}

// The API intermittently 503s under load ("high demand"), and the
// connection itself occasionally times out/resets (plain network flakiness,
// not an HTTP response at all -- e.g. "TypeError: fetch failed" wrapping a
// UND_ERR_HEADERS_TIMEOUT) -- neither is our fault, so retry with backoff
// before giving up. Only a clearly permanent failure (bad API key, bad
// request) skips the retry.
async function alignBatchRaw(apiKey: string, jpSentences: string[], translationVi: string): Promise<string[]> {
  const delays = [3000, 8000, 20000, 45000, 90000, 90000, 90000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await alignBatchOnce(apiKey, jpSentences, translationVi);
    } catch (err) {
      const permanent = err instanceof Error && /HTTP (400|401|403)/.test(err.message);
      if (permanent || attempt >= delays.length) throw err;
      console.log(`    (retrying in ${delays[attempt]}ms: ${(err as Error).message.slice(0, 100).replace(/\n/g, " ")})`);
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

// The split is one call per passage (needs the whole translationVi as
// context, so it can't be chunked/halved the way fresh per-sentence
// translation could) -- on a count mismatch, just ask again a few times.
async function alignPassage(apiKey: string, jpSentences: string[], translationVi: string): Promise<string[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await alignBatchRaw(apiKey, jpSentences, translationVi);
    if (result.length === jpSentences.length) return result;
    console.log(`    (count mismatch: got ${result.length}, expected ${jpSentences.length} -- retrying)`);
  }
  throw new Error(`Alignment kept returning the wrong sentence count after 3 attempts`);
}

async function main() {
  const apiKey = readApiKey();
  const onlyFirst = process.argv.includes("--sample");

  for (const file of DATA_FILES) {
    const dataPath = join(ROOT, "src/data", file);
    const dataset = JSON.parse(readFileSync(dataPath, "utf8")) as { passages: Passage[] };

    const passages = onlyFirst ? dataset.passages.slice(0, 2) : dataset.passages;

    const pending: { passage: Passage; jpSentences: string[] }[] = [];
    for (const p of passages) {
      if (p.sentencesVi && p.sentencesVi.length > 0) continue; // already done, idempotent re-run
      const groups = splitBodyIntoSentences(p.body);
      const jpSentences = groups.map((g) => g.map((s) => s.text).join(""));
      pending.push({ passage: p, jpSentences });
    }
    const totalSentences = pending.reduce((sum, p) => sum + p.jpSentences.length, 0);
    console.log(`${file}: ${pending.length} passages / ${totalSentences} sentences need translation`);
    if (pending.length === 0) continue;

    // Translate passage-by-passage (not one giant cross-passage flat list),
    // writing the file after each -- so a crash/interruption partway through
    // a file still leaves every already-finished passage saved with a
    // complete, correctly-ordered sentencesVi array, and re-running the
    // script (idempotent -- see the `continue` above) just picks up where
    // it left off instead of redoing already-billed API calls.
    let done = 0;
    for (const { passage, jpSentences } of pending) {
      passage.sentencesVi = await alignPassage(apiKey, jpSentences, passage.translationVi);
      done++;
      console.log(`  -> ${done}/${pending.length} passages (${passage.id})`);
      writeFileSync(dataPath, JSON.stringify(dataset, null, 2) + "\n");
      await new Promise((r) => setTimeout(r, 1200));
    }
    console.log(`Wrote ${dataPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
