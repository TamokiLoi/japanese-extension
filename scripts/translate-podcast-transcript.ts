// Adds textVi (Vietnamese translation) to every segment of one podcast
// transcript already fetched by fetch-podcast-transcript.ts. Same
// model/batching approach as translate-listening-turns.ts.
//
// Usage: node --experimental-strip-types scripts/translate-podcast-transcript.ts <videoId>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PodcastTranscript } from "../src/types/podcast.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
// Free-tier quota bites on REQUESTS/day, not tokens -- so the real lever is
// fewer, bigger requests, not smaller "safer" ones. Tested by hand
// (_scratch/test_batch_indexed.mjs) against real transcript text: a plain
// "return N strings positionally" schema (the old approach, BATCH_SIZE=20)
// silently drops/merges a line every so often even at 60-80, because a
// dropped/merged line silently shifts every later index -- the model has no
// way to signal "I skipped one" in a bare string array. Asking for {n, vi}
// pairs instead (n = the line's own number, echoed back) fixes this: 100
// and 150 both came back 100% complete across several real transcripts;
// 300 started truncating (missing the last few -- output-budget limit, not
// scrambling). 150 is the tested-safe ceiling, ~7.5x fewer requests than 20.
const BATCH_SIZE = 150;

const KEY_NAMES: Record<string, string> = {
  key2: "GEMINI_API_KEY_OLD_LOINGUYENLAMTHANH",
  key3: "GEMINI_API_KEY_LOINLT1991",
  key4: "GEMINI_API_KEY_LAKEMANGA",
  key5: "GEMINI_API_KEY_TAMOKILOIJP",
  key6: "GEMINI_API_KEY_VOTHIHON",
  key7: "GEMINI_API_KEY_TAMOKINGUYEN",
};

function readApiKey(keyFlag: string | undefined): string {
  const keyName = keyFlag ? KEY_NAMES[keyFlag] : "GEMINI_API_KEY";
  if (keyFlag && !keyName) throw new Error(`Unknown key flag: ${keyFlag}`);
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(new RegExp(`${keyName}=(\\S+)`));
  if (!match) throw new Error(`No ${keyName} found`);
  return match[1];
}

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: { type: "OBJECT", properties: { n: { type: "INTEGER" }, vi: { type: "STRING" } }, required: ["n", "vi"] },
};

// Returns a Map from a line's 1-based position in `lines` to its
// translation -- ONLY for lines the model actually returned. A bare
// positional string array (the old approach) has no way to signal "I
// merged/skipped line 7", which silently shifts every later index and
// mistranslates the rest of the batch. Asking the model to echo back each
// line's own number instead means a dropped/merged line just leaves a gap
// in the map, which the caller (translateBatch) can detect and retry
// precisely instead of discarding the whole batch.
async function translateBatchRaw(apiKey: string, lines: string[]): Promise<Map<number, string>> {
  const prompt =
    `Dịch các câu thoại tiếng Nhật sau (trích từ 1 tập podcast học tiếng Nhật, giọng văn tự nhiên đời thường) sang tiếng Việt tự nhiên, súc tích. ` +
    `Mỗi câu đã có số thứ tự (n) ở đầu. Trả lời DUY NHẤT 1 JSON array, mỗi phần tử là {"n": <số thứ tự tương ứng>, "vi": "<bản dịch>"}. ` +
    `PHẢI trả đủ ${lines.length} phần tử, mỗi n xuất hiện đúng 1 lần, không gộp/bỏ sót câu nào dù ngắn hay giống nhau.\n\n` +
    lines.map((s, i) => `${i + 1}. ${s}`).join("\n");

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  });
  let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body,
  });
  // Free-tier quota is a low per-minute cap -- retry a 429 once, honoring
  // the server's own suggested retryDelay, instead of failing the whole run.
  if (res.status === 429) {
    const errBody = await res.text();
    const retryMatch = errBody.match(/"retryDelay":\s*"(\d+)s"/);
    const waitMs = retryMatch ? (Number(retryMatch[1]) + 2) * 1000 : 15000;
    console.log(`  (rate limited, waiting ${waitMs / 1000}s before retry...)`);
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body,
    });
  }
  if (!res.ok) throw new Error(`Gemini call failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`No text in response: ${JSON.stringify(data).slice(0, 500)}`);
  const parsed = JSON.parse(text) as { n: number; vi: string }[];
  if (!Array.isArray(parsed)) throw new Error(`Expected array, got ${typeof parsed}`);
  const map = new Map<number, string>();
  for (const { n, vi } of parsed) map.set(n, vi);
  return map;
}

// Retries ONLY the lines actually missing from the response (dropped/merged
// by the model), re-numbered 1..k for that smaller follow-up call -- not a
// blind bisection of the whole batch like the old positional approach
// needed. Recursion depth is bounded by construction: each retry strictly
// shrinks to just the missing subset, bottoming out at "use the original
// Japanese text as its own translation" for a single line that still won't
// come back (better than losing it entirely; rare in practice).
async function translateBatch(apiKey: string, lines: string[]): Promise<string[]> {
  const map = await translateBatchRaw(apiKey, lines);
  const missingIdx = lines.map((_, i) => i).filter((i) => !map.has(i + 1));
  if (missingIdx.length > 0) {
    if (lines.length === 1) {
      return [lines[0]];
    }
    const retryLines = missingIdx.map((i) => lines[i]);
    const retryResult = await translateBatch(apiKey, retryLines);
    missingIdx.forEach((origI, k) => map.set(origI + 1, retryResult[k]));
  }
  return lines.map((_, i) => map.get(i + 1)!);
}

async function main() {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error("Usage: translate-podcast-transcript.ts <videoId> [--key2|--key3|--key4|--key5|--key6|--key7]");
    process.exit(1);
  }
  const keyFlag = process.argv.slice(3).find((a) => a.startsWith("--key"))?.slice(2);

  const apiKey = readApiKey(keyFlag);
  const dataPath = join(ROOT, "src/data/podcast-transcripts", `${videoId}.json`);
  const transcript = JSON.parse(readFileSync(dataPath, "utf8")) as PodcastTranscript;

  const pending = transcript.segments.filter((s) => !s.textVi);
  console.log(`${pending.length}/${transcript.segments.length} segments need translation`);

  // Saves after every batch (not just at the end) -- a rate-limit error
  // (free-tier quota is easy to hit over 300+ segments) would otherwise
  // throw away every already-translated batch since the last save. Segments
  // with textVi already set are skipped on the next run, so re-running
  // after a failure just picks up where it left off.
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const translations = await translateBatch(apiKey, batch.map((s) => s.text));
    batch.forEach((s, j) => {
      s.textVi = translations[j];
    });
    writeFileSync(dataPath, JSON.stringify(transcript, null, 2) + "\n");
    console.log(`  -> translated ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`Wrote ${dataPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
