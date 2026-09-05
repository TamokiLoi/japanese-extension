// One-off: adds sentencesVi (per-sentence Vietnamese translation) to every
// reading passage across all 6 datasets, so the Reading screen can show
// JP/VI sentence-by-sentence like Listening's turns instead of one dense
// translated block.
//
// Every passage already has a full-block `translationVi` (already
// translated, reviewed, in use as the old fallback block translation) --
// so this does NOT re-translate from scratch. It asks the model to *split/
// rearrange* that existing text into per-sentence pieces aligned to the JP
// sentences, reusing the existing wording as-is wherever possible. Cheaper
// than fresh translation and keeps the wording consistent with what's
// already been reviewed.
//
// Uses the local OpenAI Codex CLI (`codex exec`) instead of a raw API call --
// it's already logged in with a ChatGPT subscription on this machine, so
// this runs against that subscription's usage rather than a separate
// pay-per-token API key.
//
// Sentence boundaries are derived from `body` the exact same way
// splitBodyIntoSentences() in src/popup/readingState.ts does (duplicated
// here, not imported, so this script has no dependency on chrome.storage/
// the extension runtime) -- sentencesVi[i] must line up with that function's
// output at render time, so if you change the splitting regex, change it in
// both places.
//
// Usage: node --experimental-strip-types scripts/translate-reading-sentences.ts

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dirname, "..");
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

// A "\n" only closes the current group when it sits at the very START of a
// body segment's own raw text (segment.text.startsWith("\n")) -- see the
// matching comment in src/popup/readingState.ts for why (mid-segment "\n" is
// PDF line-wrap noise, sometimes falling mid-word, and must not force a
// break or the two halves of one sentence become separate incomplete ones).
const SENTENCE_END = /[。！？]$/;
function splitBodyIntoSentences(body: BodySegment[]): BodySegment[][] {
  const groups: BodySegment[][] = [];
  let current: BodySegment[] = [];
  function addPiece(text: string, furigana: string | null, genuineBreak: boolean) {
    if (genuineBreak && current.length > 0) {
      groups.push(current);
      current = [];
    }
    const cleanText = genuineBreak ? text : text.replace(/^\n+/, "");
    current.push({ text: cleanText, furigana });
    if (SENTENCE_END.test(cleanText)) {
      groups.push(current);
      current = [];
    }
  }
  for (const seg of body) {
    const pieces = splitPlainText(seg.text);
    const segStartsWithNewline = seg.text.startsWith("\n");
    pieces.forEach((piece, i) => addPiece(piece, i === pieces.length - 1 ? seg.furigana : null, i === 0 && segStartsWithNewline));
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

// The VS Code ChatGPT extension and the standalone Codex installer both drop
// a codex.exe under a version-hashed folder, so the exact path shifts on
// every update -- search known install roots for whichever one exists
// rather than hardcoding a path, falling back to `codex` on PATH.
function findCodexBinary(): string {
  const roots = [
    join(process.env.LOCALAPPDATA ?? "", "OpenAI", "Codex", "bin"),
    join(process.env.USERPROFILE ?? "", ".vscode", "extensions"),
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidates = [
        join(root, entry.name, "codex.exe"),
        join(root, entry.name, "bin", "windows-x86_64", "codex.exe"),
      ];
      for (const c of candidates) if (existsSync(c)) return c;
    }
  }
  return "codex"; // rely on PATH
}
const CODEX_BIN = findCodexBinary();

function runCodex(args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(CODEX_BIN, args, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    proc.stdout.on("data", () => {}); // event log -- we read the final answer from --output-last-message instead
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`codex exec exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.stdin.write(stdin);
    proc.stdin.end();
  });
}

async function alignBatchOnce(jpSentences: string[], translationVi: string): Promise<string[]> {
  const prompt =
    `Đây là bản dịch tiếng Việt ĐẦY ĐỦ (đã có sẵn, KHÔNG cần dịch lại) của 1 bài đọc hiểu JLPT:\n"""${translationVi}"""\n\n` +
    `Đây là ${jpSentences.length} câu tiếng Nhật gốc theo đúng thứ tự trong bài:\n` +
    jpSentences.map((s, i) => `${i + 1}. ${s}`).join("\n") +
    `\n\nHãy TÁCH bản dịch tiếng Việt ở trên thành đúng ${jpSentences.length} đoạn, mỗi đoạn khớp với 1 câu tiếng Nhật cùng số thứ tự. ` +
    `Giữ nguyên nguyên văn cách dùng từ của bản dịch đã có, chỉ được chỉnh sửa nhẹ (thêm/bớt dấu câu, tách câu ghép) để mỗi đoạn đọc độc lập vẫn rõ nghĩa -- KHÔNG dịch lại hay đổi nội dung. ` +
    `Trả lời bằng cách gọi kết quả cuối cùng theo đúng schema đã cho (field 'sentences', mảng ${jpSentences.length} chuỗi).`;

  const schemaPath = join(tmpdir(), "codex-reading-align-schema.json");
  const outPath = join(tmpdir(), `codex-reading-align-out-${process.pid}.json`);
  writeFileSync(
    schemaPath,
    JSON.stringify({
      type: "object",
      properties: { sentences: { type: "array", items: { type: "string" }, minItems: jpSentences.length, maxItems: jpSentences.length } },
      required: ["sentences"],
      additionalProperties: false,
    }),
  );

  await runCodex(
    ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--ephemeral", "--output-schema", schemaPath, "--output-last-message", outPath, "-"],
    prompt,
  );
  const text = readFileSync(outPath, "utf8");
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.sentences)) throw new Error(`Expected {sentences: [...]}, got: ${text.slice(0, 300)}`);
  return parsed.sentences;
}

// codex exec occasionally fails outright (session hiccup, subscription usage
// throttling) -- retry with backoff before giving up.
async function alignBatchRaw(jpSentences: string[], translationVi: string): Promise<string[]> {
  const delays = [5000, 15000, 30000, 60000, 120000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await alignBatchOnce(jpSentences, translationVi);
    } catch (err) {
      if (attempt >= delays.length) throw err;
      console.log(`    (retrying in ${delays[attempt]}ms: ${(err as Error).message.slice(0, 150).replace(/\n/g, " ")})`);
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

// One call per passage (needs the whole translationVi as context, so it
// can't be chunked/halved the way fresh per-sentence translation could) --
// on a count mismatch, just ask again a few times.
async function alignPassage(jpSentences: string[], translationVi: string): Promise<string[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await alignBatchRaw(jpSentences, translationVi);
    if (result.length === jpSentences.length) return result;
    console.log(`    (count mismatch: got ${result.length}, expected ${jpSentences.length} -- retrying)`);
  }
  throw new Error(`Alignment kept returning the wrong sentence count after 3 attempts`);
}

async function main() {
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
      passage.sentencesVi = await alignPassage(jpSentences, passage.translationVi);
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
