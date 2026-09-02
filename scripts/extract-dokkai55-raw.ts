// Stage 1 of converting "N3読解問題55+" (assets/data/de-thi-new/n3 dokkai 55+.pdf)
// into Reading data: rasterizes the content pages (1-93) and the answer-key
// page (95), has Gemini vision read the Japanese content (body w/ furigana
// runs + questions/options, JP only) batched in overlapping windows so a
// passage+reference-table pair never gets split across a batch boundary,
// then has Gemini vision read the answer-key page and merges correctIndex
// in. Output is JP-only (no Vietnamese yet) -- see translate-dokkai55.ts for
// stage 2. Checkpointed per batch to _scratch/dokkai55/raw-batches/ so a
// crash/quota-limit mid-run doesn't lose earlier batches.
//
// Usage: node --experimental-strip-types scripts/extract-dokkai55-raw.ts

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.6-flash";
const PDF_PATH = join(ROOT, "assets/data/de-thi-new/n3 dokkai 55+.pdf");
const WORK_DIR = join(ROOT, "_scratch/dokkai55");
const PAGES_DIR = join(WORK_DIR, "pages");
const BATCHES_DIR = join(WORK_DIR, "raw-batches");
const CONTENT_FIRST_PAGE = 1;
const CONTENT_LAST_PAGE = 93;
const ANSWER_PAGE = 95;
const WINDOW = 8;
const STRIDE = 6;

function readApiKey(): string {
  const text = readFileSync(join(ROOT, "_scratch/.env.gemini"), "utf8");
  const match = text.match(/GEMINI_API_KEY=(\S+)/);
  if (!match) throw new Error("No GEMINI_API_KEY found");
  return match[1];
}

function rasterizeIfNeeded() {
  mkdirSync(PAGES_DIR, { recursive: true });
  const last = CONTENT_LAST_PAGE;
  const already = readdirSync(PAGES_DIR).filter((f) => f.endsWith(".jpg")).length;
  if (already >= last) return;
  execFileSync("pdftoppm", [
    "-jpeg", "-jpegopt", "quality=75", "-r", "130",
    "-f", String(CONTENT_FIRST_PAGE), "-l", String(last),
    PDF_PATH, join(PAGES_DIR, "page"),
  ]);
  // Answer page rendered separately (higher res -- dense digit grid).
  execFileSync("pdftoppm", [
    "-jpeg", "-jpegopt", "quality=85", "-r", "150",
    "-f", String(ANSWER_PAGE), "-l", String(ANSWER_PAGE),
    PDF_PATH, join(PAGES_DIR, "answer"),
  ]);
}

function pageFile(n: number): string {
  const files = readdirSync(PAGES_DIR).filter((f) => f.startsWith("page-") && f.endsWith(`-${String(n).padStart(2, "0")}.jpg`));
  // pdftoppm names as page-NN.jpg or page-N.jpg depending on total count width; just glob by numeric suffix instead.
  return "";
}

function findPageFiles(): Map<number, string> {
  const files = readdirSync(PAGES_DIR).filter((f) => f.startsWith("page-") && f.endsWith(".jpg"));
  const map = new Map<number, string>();
  for (const f of files) {
    const m = f.match(/page-(\d+)\.jpg$/);
    if (m) map.set(Number(m[1]), join(PAGES_DIR, f));
  }
  return map;
}

interface RawQuestion {
  questionJa: string;
  optionsJa: string[];
}
interface RawBodySegment {
  text: string;
  furigana: string;
}
interface RawPassage {
  section: string;
  passageNumber: number;
  titleJa: string;
  body: RawBodySegment[];
  questions: RawQuestion[];
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    passages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          section: { type: "STRING", enum: ["I", "II", "III", "IV"] },
          passageNumber: { type: "INTEGER" },
          titleJa: { type: "STRING" },
          body: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { text: { type: "STRING" }, furigana: { type: "STRING" } },
              required: ["text", "furigana"],
            },
          },
          questions: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                questionJa: { type: "STRING" },
                optionsJa: { type: "ARRAY", items: { type: "STRING" } },
              },
              required: ["questionJa", "optionsJa"],
            },
          },
        },
        required: ["section", "passageNumber", "titleJa", "body", "questions"],
      },
    },
  },
  required: ["passages"],
};

const PROMPT = `Đây là các trang liên tiếp từ sách luyện đọc hiểu JLPT N3 "N3読解問題55+". Mỗi trang thường chứa 1 bài đọc (thông báo/mẩu tin/đoạn văn ngắn) kèm 1-4 câu hỏi trắc nghiệm (問1, 問2...), được đánh số ở góc trên trái theo từng 問題 (I, II, III, hoặc IV) + số thứ tự bài (vd "問題Ⅳ－９" nghĩa là section IV, passageNumber 9). Một số bài của 問題IV có thêm 1 trang bảng biểu riêng ngay sau đó mà câu hỏi tham chiếu tới (vd "下の表を見ながら") -- nếu thấy trang bảng đó thuộc về 1 bài đã thấy ở trang trước, HÃY GỘP nó vào bài đó (thêm vào cuối body dưới dạng text mô tả) thay vì tạo bài mới.

CHỈ trích xuất những bài ĐẦY ĐỦ (thấy trọn vẹn cả đoạn văn/bảng + toàn bộ câu hỏi) trong các trang được cung cấp. Nếu 1 bài bị cắt ở đầu hoặc cuối batch trang (không thấy trọn vẹn), BỎ QUA bài đó (sẽ được xử lý ở batch khác).

Với mỗi bài lấy được:
- section, passageNumber: lấy từ số in ở đầu bài (ví dụ "問題Ⅲ－５" -> section="III", passageNumber=5). Nếu 1 trang không có số 問題 mới (vd trang bảng nối tiếp từ bài trước), đừng tạo bài mới cho nó.
- titleJa: tự đặt 1 tiêu đề ngắn tiếng Nhật (3-8 chữ) tóm tắt nội dung bài (vì sách không có tiêu đề sẵn).
- body: chia toàn bộ đoạn văn/thông báo/bảng thành các đoạn nhỏ (chunks), MỖI đoạn là 1 object {text, furigana}. furigana là cách đọc hiragana nếu đoạn đó có phần chữ Hán VÀ sách có ghi phiên âm nhỏ (ruby) phía trên/bên cạnh nó trong ảnh gốc -- nếu đoạn không có phiên âm ruby trong ảnh (kể cả khi có Hán tự), furigana = "" (chuỗi rỗng). Giữ nguyên xuống dòng của văn bản gốc bằng cách bắt đầu 1 đoạn text bằng ký tự "\\n" khi đó là điểm xuống dòng trong bản gốc. Nếu bài có bảng biểu, chuyển bảng thành text mô tả dạng gạch đầu dòng dễ đọc (giữ đủ thông tin số liệu), furigana = "".
- questions: mỗi câu hỏi gồm questionJa (nguyên văn câu hỏi tiếng Nhật) và optionsJa (mảng 4 phương án tiếng Nhật nguyên văn, ĐÚNG thứ tự 1,2,3,4 như in trong sách).

Trả lời DUY NHẤT 1 JSON object theo schema.`;

async function extractBatch(apiKey: string, images: { path: string; page: number }[]): Promise<RawPassage[]> {
  const parts: object[] = [{ text: PROMPT }];
  for (const { path } of images) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: readFileSync(path).toString("base64") } });
  }
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
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
      const parsed = JSON.parse(text);
      return parsed.passages ?? [];
    } catch (err) {
      lastErr = err;
      console.warn(`  attempt ${attempt} failed: ${err}`);
      await new Promise((r) => setTimeout(r, 8000 * attempt));
    }
  }
  throw new Error(`Gemini call failed after retries: ${lastErr}`);
}

interface AnswerKey {
  // "I-1" -> [answerIndex1based], "II-3" -> [q1,q2,q3], etc.
  [key: string]: number[];
}

async function extractAnswerKey(apiKey: string, imagePath: string): Promise<AnswerKey> {
  const parts: object[] = [
    {
      text:
        `Đây là trang đáp án (答え) của sách luyện đọc hiểu JLPT N3. Định dạng mỗi dòng thuộc 1 問題 (I/II/III/IV), các mục cách nhau bởi khoảng trắng, dạng "SỐBÀI-SỐCÂU-ĐÁPÁN" (vd "3-2-4" nghĩa là bài số 3, câu hỏi số 2, đáp án là phương án số 4) hoặc với 問題I chỉ có "SỐBÀI-ĐÁPÁN" (vì mỗi bài chỉ có 1 câu, vd "5-2" nghĩa là bài 5 đáp án 2).\n\n` +
        `Đọc kỹ toàn bộ trang, xuất ra 1 JSON object với key là "SECTION-SOBAI" (vd "I-5", "III-3") và value là mảng đáp án theo đúng thứ tự câu hỏi trong bài đó (mảng 1 phần tử nếu chỉ có 1 câu). Ví dụ 1 phần: {"I-5": [2], "III-3": [4,2,1,3]}. Bao gồm ĐẦY ĐỦ mọi bài xuất hiện trên trang, cả 4 section I, II, III, IV.`,
    },
    { inlineData: { mimeType: "image/jpeg", data: readFileSync(imagePath).toString("base64") } },
  ];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json" } }),
  });
  if (!res.ok) throw new Error(`Answer key extraction failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(text);
}

async function main() {
  const apiKey = readApiKey();
  mkdirSync(BATCHES_DIR, { recursive: true });
  rasterizeIfNeeded();
  const pageFiles = findPageFiles();

  // Answer key (single call, checkpointed).
  const answerKeyPath = join(WORK_DIR, "answers.json");
  if (!existsSync(answerKeyPath)) {
    console.log("Extracting answer key...");
    const answerImg = readdirSync(PAGES_DIR).find((f) => f.startsWith("answer-"));
    if (!answerImg) throw new Error("Answer page image not found");
    const answers = await extractAnswerKey(apiKey, join(PAGES_DIR, answerImg));
    writeFileSync(answerKeyPath, JSON.stringify(answers, null, 2) + "\n");
    console.log(`  -> ${Object.keys(answers).length} passage answer entries`);
  } else {
    console.log("Answer key already extracted, skipping.");
  }

  // Content batches.
  for (let start = CONTENT_FIRST_PAGE; start <= CONTENT_LAST_PAGE; start += STRIDE) {
    const end = Math.min(start + WINDOW - 1, CONTENT_LAST_PAGE);
    const batchFile = join(BATCHES_DIR, `batch-${String(start).padStart(3, "0")}-${String(end).padStart(3, "0")}.json`);
    if (existsSync(batchFile)) {
      console.log(`Batch ${start}-${end} already done, skipping.`);
      continue;
    }
    const images: { path: string; page: number }[] = [];
    for (let p = start; p <= end; p++) {
      const path = pageFiles.get(p);
      if (path) images.push({ path, page: p });
    }
    console.log(`Extracting pages ${start}-${end} (${images.length} images)...`);
    const passages = await extractBatch(apiKey, images);
    console.log(`  -> ${passages.length} passages found: ${passages.map((p) => `${p.section}-${p.passageNumber}`).join(", ")}`);
    writeFileSync(batchFile, JSON.stringify(passages, null, 2) + "\n");
    await new Promise((r) => setTimeout(r, 4000));
    if (end === CONTENT_LAST_PAGE) break;
  }

  console.log("Done. Run merge step (in translate-dokkai55.ts) next.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
