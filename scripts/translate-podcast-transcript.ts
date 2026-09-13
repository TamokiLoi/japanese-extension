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
const BATCH_SIZE = 20;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

async function translateBatchRaw(apiKey: string, lines: string[]): Promise<string[]> {
  const prompt =
    `Dịch các câu thoại tiếng Nhật sau (trích từ 1 tập podcast học tiếng Nhật, giọng văn tự nhiên đời thường) sang tiếng Việt tự nhiên, súc tích. ` +
    `Trả lời DUY NHẤT 1 JSON array cùng thứ tự, ĐÚNG ${lines.length} phần tử (1 phần tử cho mỗi câu đánh số bên dưới), mỗi phần tử là 1 chuỗi tiếng Việt.\n\n` +
    lines.map((s, i) => `${i + 1}. ${s}`).join("\n");

  let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } },
    }),
  });
  // Free-tier quota is a low per-minute cap -- retry a 429 once, honoring
  // the server's own suggested retryDelay, instead of failing the whole run.
  if (res.status === 429) {
    const body = await res.text();
    const retryMatch = body.match(/"retryDelay":\s*"(\d+)s"/);
    const waitMs = retryMatch ? (Number(retryMatch[1]) + 2) * 1000 : 15000;
    console.log(`  (rate limited, waiting ${waitMs / 1000}s before retry...)`);
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } },
      }),
    });
  }
  if (!res.ok) throw new Error(`Gemini call failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`No text in response: ${JSON.stringify(data).slice(0, 500)}`);
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error(`Expected array, got ${typeof parsed}`);
  return parsed;
}

// Same recursive-split-on-mismatch safety net as translate-listening-turns.ts.
async function translateBatch(apiKey: string, lines: string[]): Promise<string[]> {
  if (lines.length === 1) {
    const [result] = await translateBatchRaw(apiKey, lines);
    return [result ?? lines[0]];
  }
  const result = await translateBatchRaw(apiKey, lines);
  if (result.length === lines.length) return result;
  const mid = Math.ceil(lines.length / 2);
  const [a, b] = await Promise.all([translateBatch(apiKey, lines.slice(0, mid)), translateBatch(apiKey, lines.slice(mid))]);
  return [...a, ...b];
}

async function main() {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error("Usage: translate-podcast-transcript.ts <videoId>");
    process.exit(1);
  }

  const apiKey = readApiKey();
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
