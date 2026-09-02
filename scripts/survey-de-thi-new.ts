// Preliminary Gemini-assisted survey of assets/data/de-thi-new/*.pdf -- for
// each book, samples front pages (cover/intro/TOC) + back pages (likely
// answer-key location) and asks Gemini to assess: does it have a real
// printed answer key, what content type/structure, any special value (e.g.
// embedded Vietnamese glosses), and a rough priority recommendation for this
// app's N3 exam-prep goal. Writes assets/data/de-thi-new/EVALUATION.md.
//
// This is a survey only -- no data conversion happens here.
//
// Usage: node --experimental-strip-types scripts/survey-de-thi-new.ts

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.6-flash";
const SRC_DIR = join(ROOT, "assets/data/de-thi-new");
const WORK_DIR = join(ROOT, "_scratch/de-thi-new-survey");
const OUT_FILE = join(SRC_DIR, "EVALUATION.md");
const FRONT_PAGES = 5;
const BACK_PAGES = 15;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

function pdfPageCount(pdfPath: string): number {
  // pdfinfo (poppler, same toolkit as pdftoppm already used elsewhere)
  const out = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  const m = out.match(/Pages:\s+(\d+)/);
  if (!m) throw new Error(`Could not determine page count for ${pdfPath}`);
  return Number(m[1]);
}

function rasterize(pdfPath: string, first: number, last: number, outPrefix: string): string[] {
  execFileSync("pdftoppm", ["-jpeg", "-jpegopt", "quality=70", "-r", "100", "-f", String(first), "-l", String(last), pdfPath, outPrefix]);
  const dir = join(outPrefix, "..");
  const prefixName = basename(outPrefix);
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefixName) && f.endsWith(".jpg"))
    .sort()
    .map((f) => join(dir, f));
}

interface Evaluation {
  hasAnswerKey: boolean;
  contentType: string;
  structureNotes: string;
  specialValue: string;
  priority: "cao" | "trung bình" | "thấp";
  priorityReason: string;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    hasAnswerKey: { type: "BOOLEAN" },
    contentType: { type: "STRING" },
    structureNotes: { type: "STRING" },
    specialValue: { type: "STRING" },
    priority: { type: "STRING", enum: ["cao", "trung bình", "thấp"] },
    priorityReason: { type: "STRING" },
  },
  required: ["hasAnswerKey", "contentType", "structureNotes", "specialValue", "priority", "priorityReason"],
};

const PROMPT = `Đây là các trang ĐẦU (bìa, giới thiệu, mục lục) và trang CUỐI (thường là nơi có đáp án nếu sách có) của 1 cuốn sách luyện thi JLPT N3. Hãy đánh giá:
- hasAnswerKey: true nếu thấy đáp án thật được in ra (bảng đáp án, hoặc đáp án+giải thích kèm từng câu) ở các trang cuối; false nếu không thấy đáp án nào (chỉ có câu hỏi, hoặc trang cuối là lời tựa/thông tin nhà xuất bản không liên quan).
- contentType: mô tả ngắn loại nội dung (vd "đọc hiểu", "từ vựng/hán tự trắc nghiệm", "ngữ pháp trắc nghiệm", "đề thi mô phỏng đầy đủ 3 phần", "sổ tay ngữ pháp có giải thích+bài tập"...).
- structureNotes: mô tả ngắn cấu trúc sách (chia theo回/ngày/chương thế nào, có phần nghe không, v.v.).
- specialValue: điểm đặc biệt nếu có (vd có chú thích tiếng Việt sẵn, có giải thích chi tiết, là bộ đề thi thật...) -- để trống "" nếu không có gì đặc biệt.
- priority: đánh giá độ ưu tiên convert cho app luyện thi N3 tiếng Việt ("cao"/"trung bình"/"thấp") dựa trên: có đáp án tin cậy hay không, nội dung có trùng lặp nhiều với dữ liệu N3 đã có (Kanji/Từ vựng/Ngữ pháp/Đọc hiểu/Luyện đề/Nghe đã khá đầy đủ) hay không, độ hữu ích thực tế.
- priorityReason: giải thích ngắn 1-2 câu vì sao chọn mức độ ưu tiên đó.

Trả lời DUY NHẤT 1 JSON object theo schema.`;

async function evaluateBook(apiKey: string, images: string[]): Promise<Evaluation> {
  const parts: object[] = [{ text: PROMPT }];
  for (const imgPath of images) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: readFileSync(imgPath).toString("base64") } });
  }
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error(`No text in response: ${JSON.stringify(data).slice(0, 500)}`);
      return JSON.parse(text);
    } catch (err) {
      lastErr = err;
      console.warn(`  attempt ${attempt} failed: ${err}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  throw new Error(`Gemini call failed after retries: ${lastErr}`);
}

async function main() {
  const apiKey = readApiKey();
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".pdf"));
  mkdirSync(WORK_DIR, { recursive: true });

  const rows: { file: string; pages: number; evalResult: Evaluation }[] = [];

  for (const file of files) {
    console.log(`Surveying ${file}...`);
    const pdfPath = join(SRC_DIR, file);
    const pages = pdfPageCount(pdfPath);
    const bookDir = join(WORK_DIR, file.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40));
    mkdirSync(bookDir, { recursive: true });

    const frontImgs = rasterize(pdfPath, 1, Math.min(FRONT_PAGES, pages), join(bookDir, "front"));
    const backStart = Math.max(1, pages - BACK_PAGES + 1);
    const backImgs = rasterize(pdfPath, backStart, pages, join(bookDir, "back"));

    const evalResult = await evaluateBook(apiKey, [...frontImgs, ...backImgs]);
    rows.push({ file, pages, evalResult });
    console.log(`  -> hasAnswerKey=${evalResult.hasAnswerKey}, priority=${evalResult.priority}`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  const priorityOrder = { cao: 0, "trung bình": 1, "thấp": 2 };
  rows.sort((a, b) => priorityOrder[a.evalResult.priority] - priorityOrder[b.evalResult.priority]);

  const lines: string[] = [
    "# Đánh giá sơ bộ các file trong de-thi-new/",
    "",
    `Cập nhật: ${new Date().toISOString().slice(0, 10)}. Đánh giá tự động bằng Gemini (trang đầu + ${BACK_PAGES} trang cuối mỗi sách) -- chỉ mang tính sơ bộ, cần xem lại kỹ trước khi convert thật.`,
    "",
    "Sắp theo thứ tự ưu tiên đề xuất (cao -> thấp).",
    "",
  ];

  for (const { file, pages, evalResult } of rows) {
    lines.push(`## ${file}`);
    lines.push("");
    lines.push(`- **Số trang:** ${pages}`);
    lines.push(`- **Loại nội dung:** ${evalResult.contentType}`);
    lines.push(`- **Cấu trúc:** ${evalResult.structureNotes}`);
    lines.push(`- **Có đáp án in sẵn:** ${evalResult.hasAnswerKey ? "✅ Có" : "❌ Không thấy"}`);
    if (evalResult.specialValue) lines.push(`- **Điểm đặc biệt:** ${evalResult.specialValue}`);
    lines.push(`- **Ưu tiên:** ${evalResult.priority.toUpperCase()} -- ${evalResult.priorityReason}`);
    lines.push("");
  }

  writeFileSync(OUT_FILE, lines.join("\n") + "\n");
  console.log(`Wrote evaluation -> ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
