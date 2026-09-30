// Validate enriched scratch datasets against the canonical exam questions, then
// write the two July 2026 listening-learning datasets into src/data.
// Usage: node --experimental-strip-types scripts/finalize-jlpt-listening-july.ts

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

const configs = [
  {
    level: "N1",
    examId: "cacnam-n1-2026-07",
    paperId: "choukai",
    draft: "_scratch/listening-dethi-n1-2026-07-draft.json",
    examData: "src/data/dethi-n1-cac-nam.json",
    target: "src/data/listening-dethi-n1-2026-07.json",
    total: 30,
    duration: 2898,
    release: "https://github.com/TamokiLoi/japanese-extension/releases/download/audio-choukai-cacnam-n1-2026-07-v1/N1-2026-07.mp3",
    counts: { kadai: 5, point: 6, gaiyou: 5, sokuji: 11, sougou: 3 },
    notes: "Đáp án/lựa chọn lấy từ đề JLPT và đối chiếu answer key; transcript tiếng Nhật lấy từ trường transcript đã được rà với Script PDF và audio của đề gốc. Mốc phát là thời gian tuyệt đối trên audio nguyên đề, dùng riêng ở Luyện nghe và xem lại sau nộp; bài thi gốc vẫn phát liên tục.",
  },
  {
    level: "N3",
    examId: "cacnam-n3-2026-07",
    paperId: "choukai",
    draft: "_scratch/listening-dethi-n3-2026-07-draft.json",
    examData: "src/data/dethi-n3-cac-nam.json",
    target: "src/data/listening-dethi-n3-2026-07.json",
    total: 28,
    duration: 2498,
    release: "https://github.com/TamokiLoi/japanese-extension/releases/download/audio-choukai-cacnam-2026-07-v1/N3-2026-07.mp3",
    counts: { kadai: 6, point: 6, gaiyou: 3, hatsugen: 4, sokuji: 9 },
    notes: "Đáp án/lựa chọn lấy từ đề JLPT và đối chiếu answer key. Transcript tạo từ audio gốc bằng Gemini 3.5 Transcribe rồi được rà theo Script PDF và audio; khác biệt giữa văn bản in và lời đọc được ghi chú riêng ở câu tương ứng. Mốc phát là thời gian tuyệt đối trên audio nguyên đề, dùng riêng ở Luyện nghe và xem lại sau nộp; bài thi gốc vẫn phát liên tục.",
    questionNotes: {
      11: "Lưu ý nguồn không thống nhất: Script PDF in 「買い物のデザイン」, còn transcript nhận dạng theo audio là 「袋のデザイン」. Bản transcript giữ lời nghe được trong audio; cần ưu tiên audio khi luyện nghe.",
    },
  },
];

function readJson(relativePath: string): any {
  return JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));
}

function writeJsonAtomic(path: string, value: unknown): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

for (const config of configs) {
  const draft = readJson(config.draft) as { questions: any[] };
  const sourceData = readJson(config.examData);
  const exam = sourceData.exams.find((item: any) => item.id === config.examId);
  const paper = exam?.papers.find((item: any) => item.id === config.paperId);
  if (!paper) throw new Error(`${config.examId}: canonical 聴解 paper missing`);
  if (draft.questions.length !== config.total || paper.questions.length !== config.total) {
    throw new Error(`${config.examId}: expected ${config.total} source and practice questions`);
  }
  if (existsSync(join(ROOT, config.target))) {
    const existing = readJson(config.target) as { questions?: any[] };
    const expectedIds = Array.from({ length: config.total }, (_, index) =>
      `listening-dethi-${config.level.toLowerCase()}-2026-07-q${String(index + 1).padStart(2, "0")}`,
    );
    if (JSON.stringify(existing.questions?.map((question) => question.id)) !== JSON.stringify(expectedIds)) {
      throw new Error(`Refusing to overwrite unexpected contents in ${config.target}`);
    }
  }

  const ids = new Set<string>();
  const counts: Record<string, number> = {};
  for (let index = 0; index < config.total; index++) {
    const question = draft.questions[index];
    const source = paper.questions[index];
    if (question.id !== `listening-dethi-${config.level.toLowerCase()}-2026-07-q${String(index + 1).padStart(2, "0")}`) {
      throw new Error(`${config.examId} Q${index + 1}: unstable/incorrect id`);
    }
    if (ids.has(question.id)) throw new Error(`${config.examId}: duplicate id ${question.id}`);
    ids.add(question.id);
    if (question.level !== config.level || question.correctIndex !== source.correctIndex) {
      throw new Error(`${config.examId} Q${index + 1}: level/answer differs from canonical exam data`);
    }
    if (JSON.stringify(question.options) !== JSON.stringify(source.options ?? [])) {
      throw new Error(`${config.examId} Q${index + 1}: options differ from canonical exam data`);
    }
    if ((question.questionImage ?? "") !== (source.questionImage ?? "")) {
      throw new Error(`${config.examId} Q${index + 1}: question image differs from canonical exam data`);
    }
    if (question.audioUrl !== config.release) throw new Error(`${config.examId} Q${index + 1}: unexpected audio release URL`);
    if (!(0 <= question.audioStartSec && question.audioStartSec < question.audioEndSec && question.audioEndSec <= config.duration)) {
      throw new Error(`${config.examId} Q${index + 1}: invalid audio range ${question.audioStartSec}-${question.audioEndSec}`);
    }
    if (index > 0 && !(question.audioStartSec >= draft.questions[index - 1].audioStartSec)) {
      throw new Error(`${config.examId} Q${index + 1}: audio start order moved backwards`);
    }
    if (!Array.isArray(question.turns) || !question.turns.length || question.turns.some((turn: any) => !turn.text?.trim() || !turn.textVi?.trim())) {
      throw new Error(`${config.examId} Q${index + 1}: missing Japanese or Vietnamese transcript turn`);
    }
    if (!question.questionVi?.trim() || !question.explanation?.trim()) throw new Error(`${config.examId} Q${index + 1}: missing question translation/explanation`);
    if (question.options.length !== question.optionsVi.length || question.options.length !== question.optionExplanations.length) {
      throw new Error(`${config.examId} Q${index + 1}: options/translations/explanations length mismatch`);
    }
    if (question.optionsVi.some((text: string) => !text.trim()) || question.optionExplanations.some((text: string) => !text.trim())) {
      throw new Error(`${config.examId} Q${index + 1}: empty option translation/explanation`);
    }
    question.notes = config.questionNotes?.[index + 1] ?? config.notes;
    counts[question.taskType] = (counts[question.taskType] ?? 0) + 1;
  }
  if (JSON.stringify(counts) !== JSON.stringify(config.counts)) {
    throw new Error(`${config.examId}: unexpected task counts ${JSON.stringify(counts)}`);
  }
  if (config.level === "N1" && draft.questions[28].audioStartSec !== draft.questions[29].audioStartSec) {
    throw new Error("N1 Q29/Q30 must share the same dialogue start.");
  }
  for (const question of draft.questions) {
    if (question.questionImage && !existsSync(join(ROOT, question.questionImage))) {
      throw new Error(`${question.id}: missing question image ${question.questionImage}`);
    }
    if (question.optionsImage && !existsSync(join(ROOT, question.optionsImage))) {
      throw new Error(`${question.id}: missing option image ${question.optionsImage}`);
    }
  }

  writeJsonAtomic(join(ROOT, config.target), draft);
  console.log(`${config.target}: ${draft.questions.length} questions, ${JSON.stringify(counts)}`);
}
