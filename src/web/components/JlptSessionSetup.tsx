import { Play, RotateCcw } from "lucide-react";

export type SessionSize = number | "all";

const SESSION_SIZES: SessionSize[] = [10, 20, 30, 50, 100, "all"];

function SizeOptions({
  value,
  limit,
  onChange,
  label,
}: {
  value: SessionSize;
  limit: number;
  onChange: (size: SessionSize) => void;
  label: string;
}) {
  const effectiveValue = value !== "all" && value > limit ? "all" : value;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {SESSION_SIZES.map((size) => {
        const selected = effectiveValue === size;
        const disabled = size !== "all" && size > limit;
        return (
          <button
            key={size}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(size)}
            className={`min-w-12 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
              selected
                ? "border-rose-500 bg-rose-500 text-white shadow-sm"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-rose-200 hover:bg-rose-50"
            } disabled:cursor-not-allowed disabled:border-neutral-100 disabled:bg-neutral-50 disabled:text-neutral-300 disabled:shadow-none`}
          >
            {size === "all" ? `Tất cả (${limit})` : `${size} câu`}
          </button>
        );
      })}
    </div>
  );
}

export function JlptSessionSetup({
  total,
  correct,
  size,
  reviewSize,
  shuffleQuestions,
  shuffleOptions,
  shuffleOptionsNote,
  keepReadingGroups,
  preserveOptionOrder,
  requireAnswer,
  onSizeChange,
  onReviewSizeChange,
  onShuffleQuestionsChange,
  onShuffleOptionsChange,
  onRequireAnswerChange,
  onStart,
  onStartReview,
}: {
  total: number;
  correct: number;
  size: SessionSize;
  reviewSize: SessionSize;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  shuffleOptionsNote?: string;
  keepReadingGroups?: boolean;
  preserveOptionOrder?: boolean;
  requireAnswer: boolean;
  onSizeChange: (size: SessionSize) => void;
  onReviewSizeChange: (size: SessionSize) => void;
  onShuffleQuestionsChange: (value: boolean) => void;
  onShuffleOptionsChange: (value: boolean) => void;
  onRequireAnswerChange: (value: boolean) => void;
  onStart: () => void;
  onStartReview: () => void;
}) {
  const safeTotal = Math.max(0, total);
  const safeCorrect = Math.min(safeTotal, Math.max(0, correct));
  const remaining = safeTotal - safeCorrect;

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-neutral-800">Thiết lập lượt ôn</h2>

        <div>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-neutral-700">Số câu mỗi lượt</span>
            <span className="text-xs text-neutral-400">{safeTotal} câu có sẵn</span>
          </div>
          <SizeOptions value={size} limit={safeTotal} onChange={onSizeChange} label="Số câu luyện tập" />
          {keepReadingGroups ? <p className="mt-2 text-xs text-neutral-500">Số câu có thể tăng nhẹ để làm trọn bài đọc cuối.</p> : null}
        </div>

        <div className="my-5 h-px bg-neutral-100" />

        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-semibold text-neutral-700">Tuỳ chọn lượt học</legend>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={shuffleQuestions}
              onChange={(event) => onShuffleQuestionsChange(event.target.checked)}
              className="size-4 rounded border-neutral-300 accent-rose-500"
            />
            <span>{keepReadingGroups ? "Đảo thứ tự các bài đọc" : "Đảo thứ tự câu hỏi"}</span>
          </label>
          {preserveOptionOrder ? <p className="text-sm text-neutral-500">Phương án giữ thứ tự đọc trong audio.</p> : (
          <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={shuffleOptions}
              onChange={(event) => onShuffleOptionsChange(event.target.checked)}
              className="size-4 rounded border-neutral-300 accent-rose-500"
            />
            <span>Đảo thứ tự đáp án{shuffleOptionsNote ? <span className="block text-xs text-neutral-500">{shuffleOptionsNote}</span> : null}</span>
          </label>
          )}
          <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={requireAnswer}
              onChange={(event) => onRequireAnswerChange(event.target.checked)}
              className="size-4 rounded border-neutral-300 accent-rose-500"
            />
            <span>Trả lời trước khi sang câu tiếp theo</span>
          </label>
        </fieldset>

        <button
          type="button"
          disabled={safeTotal === 0}
          onClick={onStart}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none"
        >
          <Play size={16} fill="currentColor" />
          Bắt đầu luyện tập
        </button>
      </section>

      <section className="rounded-3xl border border-rose-100 bg-rose-50/40 p-5 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-rose-500 shadow-sm ring-1 ring-rose-100">
            <RotateCcw size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-neutral-800">Ôn câu sai hoặc chưa làm</h3>
            <p className="mt-1 text-sm leading-relaxed text-neutral-500">{keepReadingGroups ? "Làm lại trọn bài nếu còn câu sai hoặc chưa làm." : "Bỏ qua các câu có lần trả lời gần nhất là đúng."}</p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold text-neutral-700">{safeCorrect}/{safeTotal} câu đúng</span>
          <span className="text-neutral-300">·</span>
          <span className={remaining > 0 ? "font-medium text-rose-600" : "text-neutral-500"}>
            {remaining} câu cần ôn
          </span>
        </div>

        <div className="mb-4">
          <div className="mb-2.5 text-sm font-semibold text-neutral-700">Số câu ôn</div>
          <SizeOptions value={reviewSize} limit={remaining} onChange={onReviewSizeChange} label="Số câu ôn tập" />
        </div>

        <button
          type="button"
          disabled={remaining === 0}
          onClick={onStartReview}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-5 py-3 text-sm font-bold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400"
        >
          <RotateCcw size={16} />
          {remaining > 0 ? "Bắt đầu ôn lại" : safeTotal > 0 ? "Đã làm đúng hết" : "Không có câu phù hợp"}
        </button>
      </section>
    </div>
  );
}
