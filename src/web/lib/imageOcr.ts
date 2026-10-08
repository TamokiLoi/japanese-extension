import workerPath from "tesseract.js/dist/worker.min.js?url";

export interface JapaneseTextRegion {
  /** Text recognized inside this region. */
  text: string;
  /** High-confidence Japanese tokens Tesseract found within this line. */
  words?: string[];
  /** Normalized 0..1 bounds relative to the full, displayed image. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface JapaneseImageOcrResult {
  text: string;
  regions: JapaneseTextRegion[];
  /** Dimensions of the decoded image before any OCR downscaling. */
  width: number;
  height: number;
}

type OcrWorker = import("tesseract.js").Worker;
type ProgressListener = ((progress: number) => void) | undefined;

const MAX_OCR_IMAGE_EDGE = 2600;
const CORE_PATH = "https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0";
const JAPANESE_DATA_PATH = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/jpn/4.0.0_best_int";

let worker: OcrWorker | undefined;
let workerPromise: Promise<OcrWorker> | undefined;
let progressListener: ProgressListener;
let jobQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const result = jobQueue.then(job, job);
  jobQueue = result.then(() => undefined, () => undefined);
  return result;
}

function reportProgress(progress: number): void {
  if (!progressListener) return;
  try {
    progressListener(Math.max(0, Math.min(1, progress)));
  } catch {
    // A UI progress callback must not interrupt an OCR job.
  }
}

async function getWorker(): Promise<OcrWorker> {
  if (worker) return worker;
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker }) => createWorker("jpn", undefined, {
      // The worker is same-origin and Vite rewrites this URL for GitHub Pages.
      workerPath,
      // Keep the large WASM core and Japanese model out of the app shell.
      corePath: CORE_PATH,
      langPath: JAPANESE_DATA_PATH,
      workerBlobURL: false,
      logger: ({ status, progress }) => {
        // Worker setup is about a third of the work; recognition uses the rest.
        const normalized = status === "recognizing text"
          ? 0.3 + progress * 0.7
          : progress * 0.3;
        reportProgress(normalized);
      },
    })).then((createdWorker) => {
      worker = createdWorker;
      return createdWorker;
    }).catch((error: unknown) => {
      workerPromise = undefined;
      throw error;
    });
  }
  return workerPromise;
}

/** Load the OCR worker, WASM core, and Japanese model so the next scan starts sooner. */
export async function prepareJapaneseOcr(): Promise<void> {
  if (typeof Worker === "undefined") {
    throw new Error("Trình duyệt này chưa hỗ trợ nhận chữ từ ảnh.");
  }
  await enqueue(async () => { await getWorker(); });
}

/** Release the reusable worker and its memory, for example when leaving image lookup. */
export async function disposeJapaneseOcr(): Promise<void> {
  await enqueue(async () => {
    const currentWorker = worker;
    worker = undefined;
    workerPromise = undefined;
    progressListener = undefined;
    if (currentWorker) await currentWorker.terminate();
  });
}

/**
 * Recognize printed Japanese and return line boxes normalized against the
 * complete displayed image. Boxes remain correctly placed when large images
 * are downscaled for recognition.
 */
export async function recognizeJapaneseImage(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<JapaneseImageOcrResult> {
  if (file.size === 0) {
    throw new Error("Ảnh trống. Hãy chọn ảnh khác.");
  }
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Hãy chọn một tệp ảnh.");
  }
  if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined") {
    throw new Error("Trình duyệt này chưa hỗ trợ nhận chữ từ ảnh.");
  }

  return enqueue(async () => {
    let lastProgress = 0;
    progressListener = (progress) => {
      lastProgress = Math.max(lastProgress, Math.max(0, Math.min(1, progress)));
      onProgress?.(lastProgress);
    };
    reportProgress(0);

    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      const width = bitmap.width;
      const height = bitmap.height;
      const scale = Math.min(1, MAX_OCR_IMAGE_EDGE / Math.max(width, height));
      const ocrWidth = Math.max(1, Math.round(width * scale));
      const ocrHeight = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = ocrWidth;
      canvas.height = ocrHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the image for OCR.");
      context.drawImage(bitmap, 0, 0, ocrWidth, ocrHeight);

      const result = await (await getWorker()).recognize(canvas, {}, {
        text: true,
        blocks: true,
      });
      reportProgress(1);
      const regions = collectRegions(result.data.blocks, ocrWidth, ocrHeight);
      return { text: result.data.text.trim(), regions, width, height };
    } catch (error) {
      throw new Error(
        "Không quét được ảnh. Hãy kiểm tra ảnh và kết nối mạng để tải bộ nhận chữ Nhật, rồi thử lại.",
        { cause: error },
      );
    } finally {
      bitmap?.close();
      progressListener = undefined;
    }
  });
}

function collectRegions(
  blocks: OcrBlock[] | null,
  imageWidth: number,
  imageHeight: number,
): JapaneseTextRegion[] {
  if (!blocks?.length) return [];

  const candidates: Array<{ region: JapaneseTextRegion; confidence: number }> = [];
  for (const block of blocks) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        // Keep one target for each printed line. Japanese OCR often segments
        // kana/kanji into many tiny word boxes, which makes tapping unusable.
        const lineText = line.text.trim() || (line.words ?? []).map((word) => word.text).join("");
        const region = toNormalizedRegion(lineText, line.bbox, imageWidth, imageHeight);
        if (isUsefulJapaneseLine(region, line.confidence, imageWidth, imageHeight)) {
          const words = collectJapaneseWords(line.words);
          candidates.push({
            region: words.length ? { ...region, words } : region,
            confidence: line.confidence,
          });
        }
      }
    }
  }

  // Tesseract can report the same line twice when a phone photo has screen
  // glare, shadows, or patterned pixels. Retain the more confident duplicate.
  const retained: typeof candidates = [];
  for (const candidate of candidates.sort((a, b) => b.confidence - a.confidence)) {
    if (retained.some((existing) => overlapOfSmaller(candidate.region, existing.region) >= 0.58)) {
      continue;
    }
    retained.push(candidate);
  }
  return retained
    .map(({ region }) => region)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

type OcrBbox = { x0: number; y0: number; x1: number; y1: number };
type OcrWord = { text: string; confidence: number };
type OcrLine = { text: string; confidence: number; bbox: OcrBbox; words?: OcrWord[] };
type OcrBlock = { paragraphs?: Array<{ lines?: OcrLine[] }> };

const JAPANESE_CHAR = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u;
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

function collectJapaneseWords(words: OcrWord[] | undefined): string[] {
  if (!words?.length) return [];
  const unique = new Set<string>();
  for (const word of words) {
    const text = word.text.trim();
    const japaneseCount = [...text].filter((char) => JAPANESE_CHAR.test(char)).length;
    const hasKanji = [...text].some((char) => /[\u3400-\u9fff\uf900-\ufaff]/u.test(char));
    if (word.confidence < 70 || japaneseCount === 0) continue;
    // Avoid offering isolated kana as lookup candidates; retain single kanji.
    if (japaneseCount === 1 && !hasKanji) continue;
    unique.add(text);
  }
  return [...unique];
}

function isUsefulJapaneseLine(
  region: JapaneseTextRegion,
  confidence: number,
  imageWidth: number,
  imageHeight: number,
): boolean {
  const chars = [...region.text];
  const japaneseCount = chars.filter((char) => JAPANESE_CHAR.test(char)).length;
  const meaningfulCount = chars.filter((char) => LETTER_OR_NUMBER.test(char)).length;
  const normalizedHeight = region.y1 - region.y0;
  const normalizedWidth = region.x1 - region.x0;

  if (japaneseCount === 0 || meaningfulCount === 0) return false;
  // Single-character headings are useful (for example, a large kanji), but
  // demand higher confidence so image texture is less likely to become a tap.
  if (japaneseCount === 1 ? confidence < 68 : confidence < 45) return false;
  if (japaneseCount / meaningfulCount < 0.5) return false;
  if (normalizedHeight < Math.max(0.007, 10 / imageHeight)) return false;
  if (normalizedWidth < Math.max(0.012, 10 / imageWidth)) return false;
  // A low-confidence box covering a large part of a photo is usually glare or
  // screen texture mistaken for one enormous text line.
  if (normalizedWidth * normalizedHeight > 0.25 && confidence < 75) return false;
  return true;
}

function overlapOfSmaller(a: JapaneseTextRegion, b: JapaneseTextRegion): number {
  const intersectionWidth = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const intersectionHeight = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const intersection = intersectionWidth * intersectionHeight;
  const areaA = Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0);
  const areaB = Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  const smallerArea = Math.min(areaA, areaB);
  return smallerArea > 0 ? intersection / smallerArea : 0;
}

function toNormalizedRegion(
  text: string,
  box: OcrBbox,
  imageWidth: number,
  imageHeight: number,
): JapaneseTextRegion {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return {
    text: text.trim(),
    x0: clamp(box.x0 / imageWidth),
    y0: clamp(box.y0 / imageHeight),
    x1: clamp(box.x1 / imageWidth),
    y1: clamp(box.y1 / imageHeight),
  };
}
