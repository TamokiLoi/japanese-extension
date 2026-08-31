// Generates a full JLPT-style listening audio clip (narrator intro -> 2-speaker
// dialogue -> narrator repeats the question) from a listening item's JSON, via
// Gemini TTS. Real N3 聴解 items always open with a narrator line setting the
// scene + asking the question, and usually repeat the question once more at
// the end -- our first POC pass skipped that and just TTS'd the raw dialogue,
// which sounded wrong. This fixes that.
//
// IMPORTANT: Gemini's multiSpeakerVoiceConfig hard-caps at exactly 2 speakers
// per call (verified empirically -- a 3rd speaker fails with
// "the number of speaker_voice_configs must equal 2"). So the narrator can't
// share a call with 男/女 -- generate it as 2 separate single-voice calls
// (intro, outro) plus 1 two-speaker call (dialogue), then concatenate the raw
// PCM buffers with short silence gaps and wrap in one WAV header.
//
// Usage: node --experimental-strip-types scripts/generate-listening-audio.ts <item.json> <output.wav>
// where <item.json> has the shape { scenario, turns: [{speaker, text}], question, ... }
// (see _scratch/listening-poc-item.json for an example, or src/types/listening.ts).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-2.5-flash-preview-tts";
const SAMPLE_RATE = 24000;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTE_RATE = (SAMPLE_RATE * NUM_CHANNELS * BITS_PER_SAMPLE) / 8;
const GAP_SECONDS = 1.0;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface DialogueTurn {
  speaker: "男" | "女";
  text: string;
}
interface ListeningItem {
  scenario: string;
  turns: DialogueTurn[];
  question: string;
}

async function ttsCall(apiKey: string, body: object): Promise<Buffer> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini TTS call failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.[0];
  if (!part?.inlineData) throw new Error(`No audio in response: ${JSON.stringify(data).slice(0, 500)}`);
  return Buffer.from(part.inlineData.data, "base64");
}

async function ttsNarrator(apiKey: string, text: string): Promise<Buffer> {
  return ttsCall(apiKey, {
    contents: [{ parts: [{ text: `TTS the following as a clear, neutral JLPT listening test exam narrator voice in Japanese: ${text}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } },
    },
  });
}

async function ttsDialogue(apiKey: string, turns: DialogueTurn[]): Promise<Buffer> {
  const speakerMap = { 男: "Otoko", 女: "Onna" } as const;
  const script = turns.map((t) => `Speaker ${speakerMap[t.speaker]}: ${t.text}`).join("\n");
  return ttsCall(apiKey, {
    contents: [
      {
        parts: [
          {
            text: `TTS the following conversation naturally in Japanese, natural pacing, JLPT N3 listening test style:\n${script}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            { speaker: "Onna", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
            { speaker: "Otoko", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } },
          ],
        },
      },
    },
  });
}

function silence(seconds: number): Buffer {
  return Buffer.alloc(Math.round(BYTE_RATE * seconds));
}

function wrapWav(pcm: Buffer): Buffer {
  const blockAlign = (NUM_CHANNELS * BITS_PER_SAMPLE) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(NUM_CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(BYTE_RATE, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function main() {
  const [itemPath, outPath] = process.argv.slice(2);
  if (!itemPath || !outPath) {
    console.error("Usage: generate-listening-audio.ts <item.json> <output.wav>");
    process.exit(1);
  }
  const apiKey = readApiKey();
  const item: ListeningItem = JSON.parse(readFileSync(itemPath, "utf8"));

  console.log("Generating narrator intro...");
  const intro = await ttsNarrator(apiKey, item.scenario);
  console.log("Generating dialogue...");
  const dialogue = await ttsDialogue(apiKey, item.turns);
  console.log("Generating narrator outro (question repeated)...");
  const outro = await ttsNarrator(apiKey, item.question);

  const pcm = Buffer.concat([intro, silence(GAP_SECONDS), dialogue, silence(GAP_SECONDS), outro]);
  const wav = wrapWav(pcm);
  writeFileSync(outPath, wav);
  console.log(`Wrote ${outPath} (${wav.length} bytes, ~${(pcm.length / BYTE_RATE).toFixed(1)}s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
