// One-off enrichment pass: tags every Reading question with a `questionType`
// (detail / main-idea / inference / reference-vocab / info-search) so the
// Stats screen can show "which question type do I keep missing" instead of
// just a flat right/wrong count. Not part of the app's runtime -- run by
// hand whenever a new reading book is added, then commit the updated JSON.
//
// Usage: node --experimental-strip-types scripts/classify-reading-question-types.ts
//
// info-search passages are tagged deterministically (no model call needed --
// the length category already tells us the type). Everything else is
// classified in batches via the Gemini API (key read from
// _scratch/.env.gemini, same key used interactively this session).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DATA_FILES = [
  "src/data/reading-n3-shinkanzen.json",
  "src/data/reading-n3-speedmaster.json",
  "src/data/reading-n3-taisaku.json",
  "src/data/mocktest-n3-shinkanzen.json",
  "src/data/reading-n3-dokkai55.json",
  "src/data/reading-n3-dokkai115.json",
];

const QUESTION_TYPES = ["detail", "main-idea", "inference", "reference-vocab", "info-search"] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];

const BATCH_SIZE = 60;
const MODEL = "gemini-flash-lite-latest";

function readApiKey(): string {
  const envPath = join(ROOT, "_scratch/.env.gemini");
  const text = readFileSync(envPath, "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error(`No GEMINI_API_KEY found in ${envPath}`);
  return match[1];
}

interface Question {
  question: string;
  questionVi: string;
  [key: string]: unknown;
}
interface Passage {
  id: string;
  title: string;
  length: string;
  questions: Question[];
  [key: string]: unknown;
}
interface Dataset {
  passages: Passage[];
  [key: string]: unknown;
}

interface WorkItem {
  id: string; // `${passageId}::q${questionIndex}`
  passageTitle: string;
  questionVi: string;
}

const PROMPT_HEADER = `Bạn đang phân loại các câu hỏi đọc hiểu JLPT N3 theo DẠNG câu hỏi (không phải độ khó). Có đúng 4 dạng khả dĩ cho danh sách dưới đây (đã lọc bỏ dạng tìm-kiếm-thông-tin, xử lý riêng):

- "detail": Hỏi về một chi tiết/sự kiện/lý do cụ thể được nêu rõ (hoặc gần như rõ) trong bài — trả lời bằng cách tìm đúng câu chứa thông tin đó.
- "main-idea": Hỏi về ý chính/chủ đề toàn bài, hoặc tác giả muốn nói/nhấn mạnh điều gì qua cả đoạn văn.
- "inference": Hỏi điều KHÔNG được nói thẳng ra — phải suy luận từ ngữ cảnh, thái độ, hàm ý của tác giả.
- "reference-vocab": Hỏi nghĩa của một từ/cụm từ được gạch dưới hoặc chỉ định cụ thể trong bài (kiểu "từ X trong bài nghĩa là gì" / "chỉ từ này đang nói tới cái gì" / "AとBの違いは").

Trả lời DUY NHẤT một JSON array, mỗi phần tử {"id": "<id đầu vào>", "type": "<1 trong 4 giá trị trên>"}, đúng thứ tự đầu vào, không giải thích thêm.

Danh sách câu hỏi (mỗi dòng: id | tên bài | câu hỏi tiếng Việt):
`;

async function classifyBatch(apiKey: string, items: WorkItem[]): Promise<Map<string, QuestionType>> {
  const body = items.map((it) => `${it.id} | ${it.passageTitle} | ${it.questionVi}`).join("\n");
  const prompt = PROMPT_HEADER + body;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              type: { type: "STRING", enum: ["detail", "main-idea", "inference", "reference-vocab"] },
            },
            required: ["id", "type"],
          },
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini call failed: HTTP ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`No text in Gemini response: ${JSON.stringify(data).slice(0, 500)}`);
  const parsed: { id: string; type: QuestionType }[] = JSON.parse(text);

  const map = new Map<string, QuestionType>();
  for (const { id, type } of parsed) map.set(id, type);
  return map;
}

async function main() {
  const apiKey = readApiKey();
  const toClassify: WorkItem[] = [];
  const datasets: { file: string; dataset: Dataset }[] = [];

  for (const file of DATA_FILES) {
    const path = join(ROOT, file);
    const dataset: Dataset = JSON.parse(readFileSync(path, "utf8"));
    datasets.push({ file, dataset });
    for (const passage of dataset.passages) {
      passage.questions.forEach((q, qi) => {
        const id = `${passage.id}::q${qi}`;
        if (passage.length === "info-search") {
          q.questionType = "info-search";
        } else {
          toClassify.push({ id, passageTitle: passage.title, questionVi: q.questionVi });
        }
      });
    }
  }

  console.log(`${toClassify.length} questions need classification (info-search tagged deterministically).`);

  const results = new Map<string, QuestionType>();
  for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
    const batch = toClassify.slice(i, i + BATCH_SIZE);
    console.log(`Classifying batch ${i / BATCH_SIZE + 1} (${batch.length} questions)...`);
    const batchResult = await classifyBatch(apiKey, batch);
    for (const [id, type] of batchResult) results.set(id, type);
    // Free-tier daily quota is shared per model across this session's earlier
    // calls -- a short pause between batches avoids tripping the per-minute
    // limit on top of that.
    await new Promise((r) => setTimeout(r, 5000));
  }

  let missing = 0;
  for (const { file, dataset } of datasets) {
    for (const passage of dataset.passages) {
      passage.questions.forEach((q, qi) => {
        if (q.questionType) return; // info-search, already set above
        const id = `${passage.id}::q${qi}`;
        const type = results.get(id);
        if (!type) {
          missing++;
          console.warn(`Missing classification for ${id}`);
          return;
        }
        q.questionType = type;
      });
    }
    writeFileSync(join(ROOT, file), JSON.stringify(dataset, null, 2) + "\n");
    console.log(`Wrote ${file}`);
  }

  if (missing > 0) console.warn(`${missing} questions left unclassified -- rerun to retry.`);
  else console.log("All questions classified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
