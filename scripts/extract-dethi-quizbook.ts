// One-off: extracts standalone 文字・語彙 (moji/goi) and 文法 (bunpou) questions
// from scanned real-JLPT-N3 exam page images into quizbook JSON, via Gemini
// vision. Deliberately SKIPS 読解 (reading-passage) problems -- those belong
// in the Reading dataset's passage model (ReadingPassage/ReadingQuestion),
// not QuizBook's standalone-question model, which has no `passage` field.
//
// IMPORTANT CAVEAT baked into every extracted item's `notes`: these are real
// leaked exam papers with NO printed answer key (see assets/data/CHUA-CONVERT.md
// discussion) -- `correctIndex` is Gemini's best inference from its own
// Japanese knowledge, not a verified official answer. Flagged per-item so the
// UI can show it, and confidence varies by category (moji/goi objective
// language facts vs. bunpou/nuance judgment calls).
//
// Usage: node --experimental-strip-types scripts/extract-dethi-quizbook.ts

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-flash-lite-latest";

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

interface ExtractedQuestion {
  category: "moji" | "goi" | "bunpou";
  questionNumber: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  confidence: "high" | "medium";
}

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      category: { type: "STRING", enum: ["moji", "goi", "bunpou"] },
      questionNumber: { type: "INTEGER" },
      question: { type: "STRING" },
      options: { type: "ARRAY", items: { type: "STRING" }, minItems: 4, maxItems: 4 },
      correctIndex: { type: "INTEGER" },
      explanation: { type: "STRING" },
      confidence: { type: "STRING", enum: ["high", "medium"] },
    },
    required: ["category", "questionNumber", "question", "options", "correctIndex", "explanation", "confidence"],
  },
};

const PROMPT = `Đây là các trang scan của một đề thi JLPT N3 thật (問題用紙), gồm nhiều phần: 文字・語彙 (chữ Hán/từ vựng), 文法 (ngữ pháp), 読解 (đọc hiểu đoạn văn dài), và có thể cả 聴解 (nghe) ở cuối.

QUAN TRỌNG -- CHỈ trích xuất các câu hỏi trắc nghiệm ĐỘC LẬP (mỗi câu tự đủ nghĩa, không cần đoạn văn dài đi kèm) thuộc 2 loại:
1. 文字・語彙 (đọc âm Hán tự, viết Hán tự, điền từ vào chỗ trống theo ngữ cảnh, từ đồng nghĩa, cách dùng từ) -- category "moji" cho câu hỏi về CHỮ HÁN/CÁCH ĐỌC, "goi" cho câu hỏi về TỪ VỰNG/NGỮ NGHĨA.
2. 文法 (chọn từ/mẫu ngữ pháp điền vào chỗ trống, sắp xếp câu, ngữ pháp trong đoạn văn ngắn) -- category "bunpou".

TUYỆT ĐỐI BỎ QUA (không trích xuất):
- Mọi câu hỏi thuộc phần 読解 (問題 có đoạn văn dài kèm theo, dù ngắn hay dài, kể cả dạng tìm kiếm thông tin/bảng biểu/thông báo).
- Mọi câu hỏi thuộc phần 聴解 (nghe).
- Câu hỏi mẫu ("れい") không phải câu hỏi thật.

Với mỗi câu hỏi hợp lệ trích xuất được, cung cấp:
- category: "moji" | "goi" | "bunpou" theo đúng định nghĩa trên.
- questionNumber: số thứ tự câu hỏi in trên đề (ô số ở đầu câu).
- question: nguyên văn câu hỏi tiếng Nhật (giữ nguyên chỗ trống ＿＿＿ hoặc （　　）nếu có).
- options: đúng 4 phương án trả lời, theo thứ tự 1-2-3-4 trong đề.
- correctIndex: chỉ số (0-3) của đáp án bạn cho là ĐÚNG dựa trên kiến thức tiếng Nhật của bạn -- đề gốc này không có đáp án in kèm, đây là suy luận, hãy suy nghĩ kỹ.
- explanation: giải thích ngắn gọn bằng tiếng Việt vì sao đáp án đó đúng.
- confidence: "high" nếu bạn chắc chắn cao (thường là câu văn vựng/Hán tự khách quan), "medium" nếu là câu ngữ pháp/từ vựng có thể có nhiều cách hiểu.

Trả lời DUY NHẤT một JSON array theo đúng schema, không giải thích thêm ngoài JSON.`;

function loadImages(dir: string): { mimeType: string; data: string }[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".jpg") || f.endsWith(".jpeg"))
    .sort();
  return files.map((f) => ({
    mimeType: "image/jpeg",
    data: readFileSync(join(dir, f)).toString("base64"),
  }));
}

async function extract(apiKey: string, imagesDir: string): Promise<ExtractedQuestion[]> {
  const images = loadImages(imagesDir);
  console.log(`  ${images.length} page images loaded from ${imagesDir}`);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: PROMPT }, ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini call failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`No text in response: ${JSON.stringify(data).slice(0, 500)}`);
  return JSON.parse(text);
}

interface QuizBookQuestionOut {
  id: string;
  level: "N3";
  book: string;
  category: "moji" | "goi" | "bunpou";
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  explanationEn: string;
  notes: string[];
}

function toQuizBookQuestions(extracted: ExtractedQuestion[], bookId: string): QuizBookQuestionOut[] {
  return extracted.map((q, i) => ({
    id: `${bookId}-q${String(i + 1).padStart(3, "0")}`,
    level: "N3",
    book: bookId,
    category: q.category,
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    explanationEn: "",
    notes: [
      q.confidence === "high"
        ? "⚠️ Đề thi thật không kèm đáp án gốc — đáp án do Gemini suy luận (độ tin cậy cao, câu khách quan)."
        : "⚠️ Đề thi thật không kèm đáp án gốc — đáp án do Gemini suy luận (độ tin cậy trung bình, nên tự kiểm tra lại).",
    ],
  }));
}

async function main() {
  const apiKey = readApiKey();
  const targets = [
    {
      dir: join(ROOT, "_scratch/dethi-2023-12-pages"),
      bookId: "dethi-n3-2023-12",
      bookLabel: "Đề thi thật N3 12/2023 (moji/goi/bunpou)",
      outFile: join(ROOT, "src/data/quizbook-dethi-n3-2023-12.json"),
    },
    {
      dir: join(ROOT, "_scratch/dethi-2025-12-pages"),
      bookId: "dethi-n3-2025-12",
      bookLabel: "Đề thi thật N3 12/2025 (moji/goi/bunpou)",
      outFile: join(ROOT, "src/data/quizbook-dethi-n3-2025-12.json"),
    },
  ];

  for (const t of targets) {
    console.log(`Extracting ${t.bookId}...`);
    const extracted = await extract(apiKey, t.dir);
    const questions = toQuizBookQuestions(extracted, t.bookId);
    const dataset = {
      meta: {
        schemaVersion: "1",
        bookLabel: t.bookLabel,
        level: "N3",
        count: questions.length,
        droppedUnresolved: 0,
      },
      questions,
    };
    writeFileSync(t.outFile, JSON.stringify(dataset, null, 2) + "\n");
    console.log(`  wrote ${questions.length} questions -> ${t.outFile}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
