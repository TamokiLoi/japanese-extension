// Sets ONE episode's `level` override based on its REAL transcript (never
// from title/description alone -- see the comment on PodcastEpisode.level
// in src/types/podcast.ts for why: level is about how hard the actual
// spoken Japanese is, and a title can't tell you that). Only usable once
// scripts/fetch-podcast-transcript.ts has already produced a transcript
// file for this episode.
//
// Usage: node --experimental-strip-types scripts/classify-podcast-level.ts <videoId> [channel]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { JlptLevel } from "../src/types/kanji.ts";
import type { PodcastDataset, PodcastTranscript } from "../src/types/podcast.ts";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";
const LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

async function classifyLevel(apiKey: string, transcriptText: string): Promise<JlptLevel> {
  // Capped, not the full transcript -- a representative sample is enough to
  // judge vocabulary/grammar difficulty, and keeps this cheap regardless of
  // episode length.
  const sample = transcriptText.slice(0, 4000);
  const prompt =
    `Đây là 1 đoạn trích transcript thật (tiếng Nhật tự nhiên, nói chuyện) của 1 tập podcast học tiếng Nhật:\n\n${sample}\n\n` +
    `Dựa trên độ khó từ vựng và ngữ pháp THỰC SỰ xuất hiện trong đoạn này, đánh giá đoạn này phù hợp nhất với người học ở trình độ JLPT nào ` +
    `(chỉ chọn DUY NHẤT 1 trong: N5, N4, N3, N2, N1 -- N5 dễ nhất, N1 khó nhất). Trả lời DUY NHẤT 1 chuỗi JSON là tên level đó, không giải thích gì thêm.`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: { type: "STRING", enum: LEVELS } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini call failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const level = JSON.parse(text) as string;
  if (!LEVELS.includes(level as JlptLevel)) throw new Error(`Unexpected level response: ${level}`);
  return level as JlptLevel;
}

async function main() {
  const videoId = process.argv[2];
  const channel = process.argv[3] ?? "bitesize";
  if (!videoId) {
    console.error("Usage: classify-podcast-level.ts <videoId> [channel]");
    process.exit(1);
  }

  const transcriptPath = join(ROOT, "src/data/podcast-transcripts", `${videoId}.json`);
  if (!existsSync(transcriptPath)) {
    console.error(`No transcript found at ${transcriptPath} -- run fetch-podcast-transcript.ts first.`);
    process.exit(1);
  }
  const transcript = JSON.parse(readFileSync(transcriptPath, "utf8")) as PodcastTranscript;
  const fullText = transcript.segments.map((s) => s.text).join(" ");

  const apiKey = readApiKey();
  const level = await classifyLevel(apiKey, fullText);
  console.log(`Classified ${videoId} as ${level}`);

  const dataPath = join(ROOT, "src/data", `podcast-${channel}.json`);
  const dataset = JSON.parse(readFileSync(dataPath, "utf8")) as PodcastDataset;
  const episode = dataset.episodes.find((e) => e.id === videoId);
  if (!episode) throw new Error(`Episode ${videoId} not found in ${dataPath}`);
  episode.level = level;
  writeFileSync(dataPath, JSON.stringify(dataset, null, 2) + "\n");
  console.log(`Updated ${dataPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
