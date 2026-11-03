#!/usr/bin/env node

/**
 * Build one continuous, web-ready MP3 per N3 mock exam from the supplied
 * question clips. It also writes a question-to-audio-offset manifest used by
 * the exam and Listening practice datasets.
 *
 * Usage:
 *   node scripts/build-de-n3-10-audio.mjs --ffmpeg <path> --output <dir> [--sets 10]
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_SOURCE = path.join(REPO_ROOT, "assets", "FPT-N3", "file-nghe-10de-n3", "N3");
const EXPECTED_GROUP_COUNTS = [6, 6, 3, 4, 9];
const RELEASE_TAG = "de-n3-10sets-audio-v1";
const RELEASE_BASE = `https://github.com/TamokiLoi/japanese-extension/releases/download/${RELEASE_TAG}`;

// Set 10's Mondai 5 was supplied as one 5:12 recording. The first audio block
// is the Mondai instructions; long response silences separate the nine items.
// These boundaries were derived with ffmpeg silencedetect and visually
// cross-checked against the printed item count.
const SET_10_MONDAI_5_SEGMENTS = [
  [33.009, 55.758],
  [64.016, 85.843],
  [94.087, 119.660],
  [127.890, 151.885],
  [160.171, 184.161],
  [192.409, 216.088],
  [224.328, 250.379],
  [258.623, 283.767],
  [291.970, 312.660],
];

function parseArgs(argv) {
  const result = { sets: Array.from({ length: 10 }, (_, i) => i + 1), source: DEFAULT_SOURCE, output: "", ffmpeg: process.env.FFMPEG_PATH || "ffmpeg" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--sets") result.sets = argv[++i].split(",").map(Number);
    else if (argv[i] === "--source") result.source = path.resolve(argv[++i]);
    else if (argv[i] === "--output") result.output = path.resolve(argv[++i]);
    else if (argv[i] === "--ffmpeg") result.ffmpeg = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!result.sets.length || result.sets.some((n) => !Number.isInteger(n) || n < 1 || n > 10)) throw new Error("--sets must contain set numbers 1–10.");
  if (!result.output) throw new Error("Pass --output <directory>.");
  return result;
}

function run(ffmpeg, args, { allowFailure = false } = {}) {
  const result = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(ffmpeg)} failed (${result.status}):\n${result.stderr || result.stdout}`);
  }
  return result;
}

function getDurationSeconds(ffmpeg, filePath) {
  const result = run(ffmpeg, ["-hide_banner", "-i", filePath], { allowFailure: true });
  const match = /Duration:\s*(\d+):(\d+):([\d.]+)/u.exec(result.stderr || "");
  if (!match) throw new Error(`Could not read audio duration: ${filePath}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function findMondaiDirectory(examDir, mondaiNumber) {
  const queue = [examDir];
  while (queue.length) {
    const current = queue.shift();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(current, entry.name);
      const match = /^mondai\s*(\d+)$/iu.exec(entry.name.trim());
      if (match && Number(match[1]) === mondaiNumber) return fullPath;
      queue.push(fullPath);
    }
  }
  throw new Error(`Could not find Mondai ${mondaiNumber} under ${examDir}`);
}

function questionNumber(fileName) {
  const base = path.parse(fileName).name.trim();
  if (/\bfull\b/iu.test(base)) return null;
  const pair = /(?:mondai|md)?\s*\d+\s*[-–]\s*(\d+)\s*$/iu.exec(base);
  if (pair) return Number(pair[1]);
  const trailing = /(?:^|[-\s])(\d+)\s*$/u.exec(base);
  if (trailing) return Number(trailing[1]);
  if (/^\d+$/u.test(base)) return Number(base);
  return null;
}

function getQuestionSources(examDir, setNumber, mondaiNumber, expectedCount) {
  const directory = findMondaiDirectory(examDir, mondaiNumber);
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:mp3|wma)$/iu.test(entry.name))
    .map((entry) => path.join(directory, entry.name));

  if (setNumber === 10 && mondaiNumber === 5) {
    const fullFile = files.find((file) => /\bfull\b/iu.test(path.parse(file).name));
    if (!fullFile || files.length !== 1) throw new Error(`Expected exactly one full Mondai 5 file in ${directory}`);
    return [fullFile];
  }

  const numbered = files.map((file) => ({ file, number: questionNumber(path.basename(file)) }));
  if (numbered.some((item) => item.number === null)) {
    throw new Error(`Unrecognized question filename in ${directory}: ${numbered.filter((item) => item.number === null).map((item) => path.basename(item.file)).join(", ")}`);
  }
  numbered.sort((left, right) => left.number - right.number);
  const numbers = numbered.map((item) => item.number);
  const expected = Array.from({ length: expectedCount }, (_, index) => index + 1);
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
    throw new Error(`Expected Mondai ${mondaiNumber} files ${expected.join(",")}, found ${numbers.join(",")}`);
  }
  return numbered.map((item) => item.file);
}

function paperForSet(setNumber) {
  const jsonPath = path.join(REPO_ROOT, "src", "data", `de-n3-set-${String(setNumber).padStart(2, "0")}.json`);
  const dataset = JSON.parse(readFileSync(jsonPath, "utf8"));
  const exam = dataset.exams?.[0];
  const paper = exam?.papers?.find((candidate) => candidate.id === "choukai");
  if (!paper) throw new Error(`No choukai paper in ${jsonPath}`);
  return { exam, paper };
}

function buildTrack(ffmpeg, inputFiles, outputPath) {
  if (!inputFiles.length) throw new Error(`No audio inputs for ${outputPath}`);
  const inputArgs = inputFiles.flatMap((file) => ["-i", file]);
  const filters = inputFiles.map((_, index) => `[${index}:a]aresample=24000,aformat=channel_layouts=mono[a${index}]`);
  const concatInputs = inputFiles.map((_, index) => `[a${index}]`).join("");
  filters.push(`${concatInputs}concat=n=${inputFiles.length}:v=0:a=1[out]`);
  run(ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error",
    ...inputArgs,
    "-filter_complex", filters.join(";"),
    "-map", "[out]",
    "-c:a", "libmp3lame", "-b:a", "96k", "-ar", "24000", "-ac", "1",
    "-write_xing", "1", outputPath,
  ]);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.source)) throw new Error(`Audio source directory not found: ${args.source}`);
  mkdirSync(args.output, { recursive: true });

  const tracks = {};
  for (const setNumber of args.sets) {
    const examDir = path.join(args.source, `Đề ${setNumber}`);
    const { exam, paper } = paperForSet(setNumber);
    const groups = [];
    const inputFiles = [];
    const questionSegments = [];
    let cursor = 0;

    for (let mondaiNumber = 1; mondaiNumber <= 5; mondaiNumber += 1) {
      const groupLabel = `問題${mondaiNumber}`;
      const paperQuestions = paper.questions.filter((question) => question.problemGroup === groupLabel).sort((a, b) => a.number - b.number);
      const expectedCount = EXPECTED_GROUP_COUNTS[mondaiNumber - 1];
      if (paperQuestions.length !== expectedCount) {
        throw new Error(`Set ${setNumber} ${groupLabel}: expected ${expectedCount} data questions, found ${paperQuestions.length}`);
      }

      const files = getQuestionSources(examDir, setNumber, mondaiNumber, expectedCount);
      const groupStart = cursor;
      if (setNumber === 10 && mondaiNumber === 5) {
        // Q28 in the supplied full recording omits response 3. Set 2 Q28
        // has the same dialogue and a complete recording; replace the entire item.
        const replacement = getQuestionSources(path.join(args.source, "Đề 2"), 2, 5, 9)[8];
        const originalQ28 = paperForSet(2).paper.questions.find((q) => q.number === 28);
        if (originalQ28.transcript !== paperQuestions[8].transcript) {
          throw new Error("Set 2 and Set 10 Q28 transcripts differ; review the replacement source.");
        }
        const replacementStart = SET_10_MONDAI_5_SEGMENTS[8][0];
        const fullFile = path.join(args.output, "set-10-mondai-5-repaired.wav");
        run(args.ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", files[0], "-i", replacement,
          "-filter_complex", `[0:a]atrim=end=${replacementStart},asetpts=PTS-STARTPTS,aresample=24000,aformat=channel_layouts=mono[prefix];[1:a]asetpts=PTS-STARTPTS,aresample=24000,aformat=channel_layouts=mono[item];[prefix][item]concat=n=2:v=0:a=1[out]`,
          "-map", "[out]", "-c:a", "pcm_s16le", fullFile]);
        const duration = getDurationSeconds(args.ffmpeg, fullFile);
        for (let index = 0; index < paperQuestions.length; index += 1) {
          const [localStart, oldEnd] = SET_10_MONDAI_5_SEGMENTS[index];
          const localEnd = index === 8 ? duration : oldEnd;
          if (localEnd > duration + 0.1) throw new Error(`Set 10 M5 q${index + 1} offset exceeds file duration ${duration}`);
          questionSegments.push({
            number: paperQuestions[index].number,
            problemGroup: groupLabel,
            questionInGroup: index + 1,
            audioStartSec: Number((groupStart + localStart).toFixed(3)),
            audioEndSec: Number((groupStart + localEnd).toFixed(3)),
            localAudioStartSec: localStart,
            localAudioEndSec: localEnd,
            sourceFiles: [index === 8 ? replacement : files[0]].map((f) => path.relative(args.source, f).split(path.sep).join("/")),
          });
        }
        inputFiles.push(fullFile);
        cursor += duration;
        groups.push({ problemGroup: groupLabel, questionCount: paperQuestions.length, audioStartSec: groupStart, audioEndSec: cursor, sourceFiles: [files[0], replacement].map((f) => path.relative(args.source, f).split(path.sep).join("/")) });
        continue;
      }

      for (let index = 0; index < paperQuestions.length; index += 1) {
        const file = files[index];
        const duration = getDurationSeconds(args.ffmpeg, file);
        questionSegments.push({
          number: paperQuestions[index].number,
          problemGroup: groupLabel,
          questionInGroup: index + 1,
          audioStartSec: Number(cursor.toFixed(3)),
          audioEndSec: Number((cursor + duration).toFixed(3)),
          sourceFiles: [path.relative(args.source, file).split(path.sep).join("/")],
        });
        inputFiles.push(file);
        cursor += duration;
      }
      groups.push({
        problemGroup: groupLabel,
        questionCount: paperQuestions.length,
        audioStartSec: Number(groupStart.toFixed(3)),
        audioEndSec: Number(cursor.toFixed(3)),
        sourceFiles: files.map((file) => path.relative(args.source, file).split(path.sep).join("/")),
      });
    }

    const fileName = `de-n3-set-${String(setNumber).padStart(2, "0")}${setNumber === 10 ? "-v2" : ""}.mp3`;
    const outputPath = path.join(args.output, fileName);
    console.log(`Building ${exam.examLabel}: ${inputFiles.length} source audio file(s) ...`);
    buildTrack(args.ffmpeg, inputFiles, outputPath);
    tracks[exam.id] = {
      examId: exam.id,
      examLabel: exam.examLabel,
      audioUrl: `${RELEASE_BASE}/${fileName}`,
      fileName,
      durationSeconds: Number(cursor.toFixed(3)),
      sourceCount: inputFiles.length,
      groups,
      questions: questionSegments,
    };
    console.log(`  ${fileName}: ${cursor.toFixed(1)} sec, ${questionSegments.length} question segments`);
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    releaseTag: RELEASE_TAG,
    audioFormat: { codec: "MP3", bitrate: "96 kbps mono", sampleRateHz: 24000 },
    sourceDirectory: path.relative(REPO_ROOT, args.source).split(path.sep).join("/"),
    notes: [
      "Question audio offsets are for question-level practice and review only; timed exam playback uses each full continuous track.",
      "Set 10 Q28 uses the complete, identical dialogue from Set 2 Q28 because the supplied recording omits response 3. Set 10 問題5 comes from one full recording. The first M5 instructions block is intentionally excluded from question 1's replay segment but retained in the continuous exam audio.",
    ],
    tracks,
  };
  const manifestPath = path.join(args.output, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Manifest: ${manifestPath}`);
}

main();
