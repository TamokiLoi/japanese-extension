#!/usr/bin/env node

/**
 * Apply the source-audited answer keys and continuous listening tracks for
 * the ten FPT N3 practice papers. Audio itself is kept in a GitHub Release;
 * this script only updates the small JSON datasets.
 *
 * Usage:
 *   node scripts/apply-de-n3-reconciliation.mjs --manifest <manifest.json>
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Zero-based answer indexes for questions 1–28. Values were read from the
// marked answer key in the supplied PDF; the 15 unmarked entries were checked
// against the printed dialogues and/or answer illustrations (see INFERRED).
const LISTENING_KEYS = [
  [2, 1, 2, 2, 3, 1, 1, 3, 2, 0, 1, 3, 0, 1, 3, 0, 1, 0, 1, 0, 0, 1, 1, 1, 2, 1, 1, 2],
  [0, 1, 3, 3, 3, 2, 2, 1, 2, 2, 0, 2, 1, 1, 2, 1, 0, 1, 1, 1, 2, 0, 1, 0, 0, 1, 0, 0],
  [0, 2, 3, 0, 2, 3, 1, 2, 3, 2, 0, 2, 2, 0, 1, 1, 0, 2, 2, 1, 0, 2, 0, 1, 2, 0, 1, 1],
  [2, 0, 2, 2, 2, 2, 0, 1, 0, 2, 3, 3, 2, 1, 3, 0, 1, 1, 2, 1, 0, 0, 2, 1, 1, 0, 1, 0],
  [0, 1, 0, 1, 3, 3, 3, 2, 1, 2, 3, 1, 3, 1, 2, 1, 2, 0, 0, 2, 0, 1, 0, 0, 0, 1, 1, 0],
  [3, 1, 3, 1, 2, 0, 2, 0, 1, 0, 3, 2, 2, 3, 1, 0, 1, 2, 1, 0, 1, 2, 1, 1, 1, 0, 2, 0],
  [0, 3, 1, 2, 2, 1, 1, 2, 0, 0, 3, 1, 0, 2, 2, 1, 0, 2, 0, 2, 0, 2, 0, 1, 0, 1, 2, 0],
  [3, 1, 3, 2, 0, 0, 2, 1, 2, 1, 1, 3, 1, 3, 1, 0, 0, 2, 1, 1, 1, 2, 2, 0, 2, 1, 2, 0],
  [1, 1, 3, 3, 1, 3, 1, 0, 2, 2, 1, 3, 3, 0, 0, 1, 2, 0, 1, 0, 1, 2, 1, 2, 2, 0, 2, 0],
  [2, 3, 1, 1, 1, 1, 3, 2, 2, 1, 0, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

// Questions with no visible answer mark in the PDF. The wording below records
// the source-based reason and confidence instead of implying a printed key.
const INFERRED = {
  "03-04": {
    confidence: "cao",
    explanation: "Lời thoại yêu cầu bát có hai quai cho súp, đĩa tròn bằng thủy tinh cho salad và đĩa vuông trắng cho pasta; hình số 1 khớp đủ ba món.",
  },
  "03-20": { confidence: "cao", explanation: "Người nói nhờ đối phương giải thích với mọi người thay mình; đáp lại tự nhiên là đồng ý sẽ làm việc đó." },
  "03-21": { confidence: "cao", explanation: "Người nam đề nghị thử mời Sato; người nữ đồng ý sẽ hỏi thử." },
  "03-22": { confidence: "cao", explanation: "Được hỏi cách tắt đèn flash, người nam chỉ nút cần bấm." },
  "03-23": { confidence: "cao", explanation: "Bố gọi yêu cầu đến sớm; người nam đáp sẽ đi ngay." },
  "03-24": { confidence: "trung bình-cao", explanation: "Vì sắp đến giờ xe buýt, lời đáp phù hợp nhất là đồng ý nên rời cửa hàng sớm." },
  "03-25": { confidence: "cao", explanation: "Người nữ xin được phụ trách dự án; người nam chấp thuận và giao việc cho cô ấy." },
  "03-26": { confidence: "cao", explanation: "Người nữ lo không kịp 9 giờ; người nam đáp rằng anh không nghĩ sẽ trễ." },
  "03-27": { confidence: "cao", explanation: "Người nam xin phép về sớm vì cảm lạnh nặng; người nữ đồng ý và chúc anh giữ gìn sức khỏe." },
  "03-28": { confidence: "cao", explanation: "Khi được mời ăn, lời đáp phù hợp là hỏi lại cho chắc rồi nhận lời lịch sự." },
  "04-02": { confidence: "trung bình", explanation: "Người phụ nữ chọn một món ngọt gồm nhiều chiếc nhỏ và một món mặn có xúc xích; hình số 1 có vẻ khớp cả hai yêu cầu." },
  "04-04": { confidence: "cao", explanation: "Trời đã bắt đầu mưa nên người mẹ bảo con đưa quần áo vào ngay, trước các việc khác." },
  "04-06": { confidence: "cao", explanation: "Chỉ dẫn đầu tiên là sang phòng bên để thay yukata; sau đó mới cất quần áo và túi." },
  "04-09": { confidence: "cao", explanation: "Cô gái nói mình dậy sớm để học bài; chuẩn bị bento là việc cô làm thêm sau đó." },
  "04-11": { confidence: "cao", explanation: "Cô giáo chọn nghề này vì trước đây không có giáo viên để trao đổi về những lo lắng và định hướng." },
};

// Confirmed conflicts where the PDF's marked answer and its explanation agree
// against the app key. Keep this list intentionally small and evidence-based.
const WRITTEN_KEY_FIXES = [
  {
    set: 3, paperId: "bunpou-dokkai", number: 30, correctIndex: 3,
    answerSourceNote: "Đối chiếu tài liệu đáp án PDF, tr. 158: đáp án được đánh dấu là lựa chọn 4; phần giải thích cũng khớp với nội dung đoạn văn.",
    explanation: "Sau khi nghỉ hưu, người cha có thời gian nhưng không có sở thích hay hoạt động mình muốn làm; đây là lý do ông không muốn ra ngoài.",
  },
  {
    set: 5, paperId: "bunpou-dokkai", number: 37, correctIndex: 2,
    answerSourceNote: "Đối chiếu tài liệu đáp án PDF, tr. 279: đáp án là 2 người; phần giải thích của app cũ đã bỏ sót người A.",
    explanation: "A và D đều đáp ứng điều kiện. A có thể tham gia cùng người bạn đang đi làm vì thông báo cho phép rủ bạn bè; D là học sinh cấp ba, muốn giao lưu đa văn hóa và mức phí đúng 30.000 yên. Tổng cộng 2 người.",
  },
  {
    set: 8, paperId: "bunpou-dokkai", number: 35, correctIndex: 1,
    answerSourceNote: "Đối chiếu tài liệu đáp án PDF, tr. 490: đáp án được đánh dấu là lựa chọn 2; phần giải thích nêu các lễ hội đôi khi dẫn đến kết quả xấu ngoài dự đoán.",
    explanation: "Đoạn văn nói có nơi kết quả trái dự đoán và chỉ lan truyền tiếng xấu; điều đó khiến một số người đề nghị dừng lễ hội.",
  },
  {
    set: 9, paperId: "bunpou-dokkai", number: 22, correctIndex: 3,
    answerSourceNote: "Đối chiếu tài liệu đáp án PDF, tr. 544: lựa chọn 4 được giải thích là lời nhờ lịch sự phù hợp khi hỏi giáo viên về địa điểm tham quan ở Kyoto.",
    explanation: "Người viết muốn nhờ giáo viên giới thiệu địa điểm ở Kyoto. 「教えてくださいませんか」 là lời nhờ lịch sự; lựa chọn xin phép mình làm việc gì không phù hợp ngữ cảnh.",
  },
];

const WRITTEN_SOURCE_CONFLICTS = [
  {
    set: 4, paperId: "bunpou-dokkai", number: 15,
    answerSourceNote: "PDF có dấu màu ở phương án 1 nhưng phần giải thích cùng nguồn và dữ liệu app đều chỉ ra phương án 2; giữ phương án 2, không dùng dấu màu đơn lẻ.",
  },
  {
    set: 5, paperId: "bunpou-dokkai", number: 18,
    answerSourceNote: "Dấu màu trong PDF xung đột với trật tự câu và phần giải thích; giữ đáp án app hiện tại vì câu 「からこそ」 yêu cầu 「その国の→すばらしさを→発見できる」.",
  },
  {
    set: 5, paperId: "bunpou-dokkai", number: 20,
    answerSourceNote: "PDF đánh dấu đồng thời hai lựa chọn nhưng phần giải thích và câu hoàn chỉnh trong app ủng hộ đáp án app; không đổi theo dấu màu mơ hồ.",
  },
  {
    set: 9, paperId: "bunpou-dokkai", number: 20,
    answerSourceNote: "PDF tr. 543 có nội dung/đáp án không khớp câu trong app: app dùng 「それほど国の大学とは違いませんでした」, nên giữ đáp án それほど; cần đối chiếu lại bản đề gốc trước khi thay.",
  },
];

function parseArgs(argv) {
  const result = { manifest: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--manifest") result.manifest = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!result.manifest) throw new Error("Pass --manifest <manifest.json>.");
  return result;
}

function findClosing(text, start, open, close) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === open) depth += 1;
    else if (character === close && --depth === 0) return index + 1;
  }
  throw new Error(`No matching ${close} for offset ${start}`);
}

function findObjectRange(text, key, value, withinStart = 0, withinEnd = text.length) {
  const needle = `"${key}": ${JSON.stringify(value)}`;
  let position = withinStart;
  while ((position = text.indexOf(needle, position)) >= 0 && position < withinEnd) {
    const start = text.lastIndexOf("{", position);
    const end = findClosing(text, start, "{", "}");
    if (end <= withinEnd) {
      const object = JSON.parse(text.slice(start, end));
      if (object[key] === value) return { start, end, object };
    }
    position += needle.length;
  }
  throw new Error(`Could not find ${key}=${JSON.stringify(value)}`);
}

function setObjectField(objectText, key, value) {
  const pattern = new RegExp(`(^[ \\t]*"${key}": ).*$`, "m");
  const match = pattern.exec(objectText);
  if (match) {
    const line = match[0];
    const comma = line.endsWith(",") ? "," : "";
    const replacement = `${match[1]}${JSON.stringify(value)}${comma}`;
    return objectText.slice(0, match.index) + replacement + objectText.slice(match.index + line.length);
  }

  const close = objectText.lastIndexOf("}");
  const lineStart = objectText.lastIndexOf("\n", close) + 1;
  const closingIndent = objectText.slice(lineStart, close);
  const propertyIndent = `${closingIndent}  `;
  const body = objectText.slice(0, lineStart).trimEnd();
  return `${body},\n${propertyIndent}"${key}": ${JSON.stringify(value)}\n${closingIndent}}`;
}

function patchObject(text, range, edit) {
  const current = text.slice(range.start, range.end);
  const updated = edit(current, range.object);
  return text.slice(0, range.start) + updated + text.slice(range.end);
}

function updateObject(text, key, value, changes, withinStart = 0, withinEnd = text.length) {
  const range = findObjectRange(text, key, value, withinStart, withinEnd);
  return patchObject(text, range, (objectText) =>
    Object.entries(changes).reduce((updated, [field, fieldValue]) => setObjectField(updated, field, fieldValue), objectText));
}

function updateQuestion(text, examId, paperId, number, changes) {
  const exam = findObjectRange(text, "id", examId);
  const paper = findObjectRange(text, "id", paperId, exam.start, exam.end);
  return updateObject(text, "number", number, changes, paper.start, paper.end);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(args.manifest, "utf8"));
  if (manifest.releaseTag !== "de-n3-10sets-audio-v1") throw new Error(`Unexpected release tag: ${manifest.releaseTag}`);

  for (let setNumber = 1; setNumber <= 10; setNumber += 1) {
    const setKey = String(setNumber).padStart(2, "0");
    const jsonPath = path.join(ROOT, "src", "data", `de-n3-set-${setKey}.json`);
    let source = readFileSync(jsonPath, "utf8");
    const exam = findObjectRange(source, "id", `de-n3-${setKey}`).object;
    const track = manifest.tracks?.[exam?.id];
    const answers = LISTENING_KEYS[setNumber - 1];
    const examRange = findObjectRange(source, "id", exam.id);
    const paperRange = findObjectRange(source, "id", "choukai", examRange.start, examRange.end);
    const paper = paperRange.object;
    if (!track || answers.length !== 28 || paper.questions.length !== 28) {
      throw new Error(`Unexpected data shape for Set ${setKey}`);
    }

    source = updateObject(source, "id", exam.id, { listeningBook: exam.id });
    const freshExam = findObjectRange(source, "id", exam.id);
    const freshPaper = findObjectRange(source, "id", "choukai", freshExam.start, freshExam.end);
    source = patchObject(source, freshPaper, (objectText) =>
      Object.entries({ audioUrl: track.audioUrl, totalPoints: 28, gradingAvailable: true })
        .reduce((updated, [field, value]) => setObjectField(updated, field, value), objectText));

    for (const question of paper.questions) {
      const answerIndex = answers[question.number - 1];
      const segment = track.questions.find((item) => item.number === question.number);
      // Set 5's 問題4 contains the printed situation pictures, while the four
      // response choices are spoken in the recording and therefore have no
      // text/image options in the source JSON. Keep those choices audio-only,
      // but provide numbered buttons so the item remains answerable.
      const needsAudioChoices = question.problemGroup === "問題4" && question.options.length === 0 && !question.optionsImage;
      if (needsAudioChoices) {
        question.options = ["1", "2", "3", "4"];
        question.optionCount = 4;
        question.optionsInAudio = true;
      }
      const answerCount = question.optionsImage ? (question.optionCount ?? 4) : question.options.length;
      if (!segment || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= answerCount) {
        throw new Error(`Invalid answer/audio mapping: Set ${setKey} Q${question.number}`);
      }

      const inferred = INFERRED[`${setKey}-${String(question.number).padStart(2, "0")}`];
      const changes = {
        correctIndex: answerIndex,
        points: 1,
        audioStartSec: segment.audioStartSec,
        audioEndSec: segment.audioEndSec,
        listeningQuestionId: `${exam.id}-q${String(question.number).padStart(2, "0")}`,
        listeningAudioUrl: track.audioUrl,
        answerSourceNote: inferred
          ? `PDF không đánh dấu đáp án; đã đối chiếu với lời thoại/hình trong PDF (${inferred.confidence} tin cậy).`
          : "Đáp án đối chiếu với lựa chọn được đánh dấu trong tài liệu PDF.",
      };
      if (question.questionVi?.startsWith("Chưa có MP3")) changes.questionVi = "";
      if (needsAudioChoices) {
        changes.options = question.options;
        changes.optionCount = question.optionCount;
        changes.optionsInAudio = true;
      }
      if (inferred) {
        changes.explanation = inferred.explanation;
      }
      if (setNumber === 5 && question.number === 9) {
        const examNow = findObjectRange(source, "id", exam.id);
        const paperNow = findObjectRange(source, "id", "choukai", examNow.start, examNow.end);
        const qRange = findObjectRange(source, "number", question.number, paperNow.start, paperNow.end);
        const qText = source.slice(qRange.start, qRange.end);
        if (!qText.includes('"チケットが2取れないから"')) throw new Error("Set 05 Q9 expected option text was not found");
        source = source.slice(0, qRange.start) + qText.replace('"チケットが2取れないから"', '"チケットが取れないから"') + source.slice(qRange.end);
      }
      if (setNumber === 7 && question.number === 2) {
        const examNow = findObjectRange(source, "id", exam.id);
        const paperNow = findObjectRange(source, "id", "choukai", examNow.start, examNow.end);
        const qRange = findObjectRange(source, "number", question.number, paperNow.start, paperNow.end);
        const qText = source.slice(qRange.start, qRange.end);
        if (!qText.includes('"お金をしてもらう"')) throw new Error("Set 07 Q2 expected option text was not found");
        source = source.slice(0, qRange.start) + qText.replace('"お金をしてもらう"', '"お金を返してもらう"') + source.slice(qRange.end);
      }
      source = updateQuestion(source, exam.id, "choukai", question.number, changes);
    }

    const metaRange = findObjectRange(source, "schemaVersion", "1.0");
    source = patchObject(source, metaRange, (objectText) => setObjectField(objectText, "notes", "Đã bổ sung audio liên tục và đáp án cho 28 câu nghe; đáp án đối chiếu với PDF, trong đó 15 câu không đánh dấu được suy ra từ lời thoại/hình."));
    JSON.parse(source);
    writeFileSync(jsonPath, source, "utf8");
    console.log(`Updated Set ${setKey}: 28 answer keys, audio URL and 28 offsets`);
  }

  for (const fix of WRITTEN_KEY_FIXES) {
    const jsonPath = path.join(ROOT, "src", "data", `de-n3-set-${String(fix.set).padStart(2, "0")}.json`);
    let source = readFileSync(jsonPath, "utf8");
    const exam = findObjectRange(source, "id", `de-n3-${String(fix.set).padStart(2, "0")}`).object;
    source = updateQuestion(source, exam.id, fix.paperId, fix.number, {
      correctIndex: fix.correctIndex,
      answerSourceNote: fix.answerSourceNote,
      explanation: fix.explanation,
    });
    JSON.parse(source);
    writeFileSync(jsonPath, source, "utf8");
    console.log(`Corrected Set ${String(fix.set).padStart(2, "0")} ${fix.paperId} Q${fix.number}`);
  }

  for (const note of WRITTEN_SOURCE_CONFLICTS) {
    const jsonPath = path.join(ROOT, "src", "data", `de-n3-set-${String(note.set).padStart(2, "0")}.json`);
    let source = readFileSync(jsonPath, "utf8");
    const exam = findObjectRange(source, "id", `de-n3-${String(note.set).padStart(2, "0")}`).object;
    source = updateQuestion(source, exam.id, note.paperId, note.number, { answerSourceNote: note.answerSourceNote });
    JSON.parse(source);
    writeFileSync(jsonPath, source, "utf8");
    console.log(`Recorded unresolved source conflict: Set ${String(note.set).padStart(2, "0")} Q${note.number}`);
  }
}

main();
