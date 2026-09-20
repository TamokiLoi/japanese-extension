// Assigns each podcast episode one topic category (PODCAST_CATEGORIES,
// shared across every channel -- see src/types/podcast.ts) based on its
// title + description. This is a much lower-stakes guess than JLPT level
// (see classify-podcast-level.ts), so title/description is fine signal --
// unlike level, a wrong topic guess doesn't teach anyone bad Japanese.
//
// Usage: node --experimental-strip-types scripts/categorize-podcast-episodes.ts [channel]
// (channel defaults to "bitesize" -- the only one fetched so far)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PODCAST_CATEGORIES, type PodcastDataset } from "../src/types/podcast.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const BATCH_SIZE = 25;

// Rotation order across the 6 accounts in .env.gemini (see memory
// reference_gemini_api_keys.md) -- GEMINI_API_KEY_VOTHIHON was removed
// (dead key), don't re-add it here.
const KEY_NAMES = [
  "GEMINI_API_KEY",
  "GEMINI_API_KEY_OLD_LOINGUYENLAMTHANH",
  "GEMINI_API_KEY_LOINLT1991",
  "GEMINI_API_KEY_LAKEMANGA",
  "GEMINI_API_KEY_TAMOKILOIJP",
  "GEMINI_API_KEY_TAMOKINGUYEN",
];

function readAllApiKeys(): string[] {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const keys: string[] = [];
  for (const name of KEY_NAMES) {
    const match = text.match(new RegExp(`^${name}=(\\S+)`, "m"));
    if (match) keys.push(match[1]);
  }
  if (keys.length === 0) throw new Error("No Gemini API keys found in .env.gemini");
  return keys;
}

// True for a daily-quota exhaustion (rotate to the next account and keep
// going) or a dead/disabled key (401/403 -- see the "rotation script gotcha"
// in reference_gemini_api_keys.md: don't just retry the same key forever).
function isRotatableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (/HTTP 429/.test(msg) && /PerDay/.test(msg)) || /HTTP 401/.test(msg) || /HTTP 403/.test(msg);
}

async function classifyBatchRaw(apiKey: string, items: { title: string; description?: string }[]): Promise<string[]> {
  const prompt =
    `Phân loại mỗi tập podcast học tiếng Nhật sau vào ĐÚNG 1 trong các nhãn chủ đề này (chép lại nguyên văn nhãn, không tự đặt nhãn mới):\n` +
    PODCAST_CATEGORIES.map((c) => `- ${c}`).join("\n") +
    `\n\nDanh sách tập (tiêu đề + 1 dòng mô tả đầu nếu có):\n\n` +
    items.map((it, i) => `${i + 1}. ${it.title}${it.description ? ` -- ${it.description.slice(0, 150)}` : ""}`).join("\n") +
    `\n\nTrả lời DUY NHẤT 1 JSON array cùng thứ tự, ĐÚNG ${items.length} phần tử, mỗi phần tử là 1 chuỗi = đúng 1 nhãn ở trên (chép nguyên văn).`;

  let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: "ARRAY", items: { type: "STRING", enum: [...PODCAST_CATEGORIES] } },
      },
    }),
  });
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
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: { type: "ARRAY", items: { type: "STRING", enum: [...PODCAST_CATEGORIES] } },
        },
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

// Same recursive-split-on-count-mismatch safety net as the translate scripts.
async function classifyBatch(apiKey: string, items: { title: string; description?: string }[]): Promise<string[]> {
  if (items.length === 1) {
    const [result] = await classifyBatchRaw(apiKey, items);
    return [result ?? PODCAST_CATEGORIES[0]];
  }
  const result = await classifyBatchRaw(apiKey, items);
  if (result.length === items.length) return result;
  const mid = Math.ceil(items.length / 2);
  const [a, b] = await Promise.all([classifyBatch(apiKey, items.slice(0, mid)), classifyBatch(apiKey, items.slice(mid))]);
  return [...a, ...b];
}

async function main() {
  const channel = process.argv[2] ?? "bitesize";
  const keys = readAllApiKeys();
  let keyIdx = 0;
  const dataPath = join(ROOT, "src/data", `podcast-${channel}.json`);
  const dataset = JSON.parse(readFileSync(dataPath, "utf8")) as PodcastDataset;

  const pending = dataset.episodes.filter((e) => !e.category);
  console.log(`${pending.length}/${dataset.episodes.length} episodes need a category`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    let categories: string[] | undefined;
    while (categories === undefined) {
      try {
        categories = await classifyBatch(
          keys[keyIdx],
          batch.map((e) => ({ title: e.title, description: e.description })),
        );
      } catch (err) {
        if (!isRotatableError(err) || keyIdx >= keys.length - 1) throw err;
        keyIdx++;
        console.log(`  (key ${keyIdx} exhausted/dead, rotating to key ${keyIdx + 1}/${keys.length})`);
      }
    }
    batch.forEach((e, j) => {
      const cat = categories![j];
      e.category = (PODCAST_CATEGORIES as readonly string[]).includes(cat) ? (cat as (typeof PODCAST_CATEGORIES)[number]) : undefined;
    });
    writeFileSync(dataPath, JSON.stringify(dataset, null, 2) + "\n");
    console.log(`  -> categorized ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`Wrote ${dataPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
