export type LoadingVariant =
  | "home"
  | "study"
  | "reading"
  | "listening"
  | "exam"
  | "stats"
  | "guide"
  | "quiz"
  | "roadmap"
  | "match";

const DEFAULT_TITLES: Record<LoadingVariant, string> = {
  home: "Trang chủ",
  study: "nội dung học",
  reading: "Luyện đọc",
  listening: "Luyện nghe",
  exam: "Đề thi JLPT",
  stats: "Thống kê",
  guide: "Hướng dẫn",
  quiz: "Quiz",
  roadmap: "Lộ trình N3",
  match: "Ghép cặp",
};

function SkeletonBar({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span style={style} className={`block rounded-full bg-neutral-200 ${className}`} />;
}

function SkeletonCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>{children}</div>;
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <SkeletonBar className="h-11 w-11 shrink-0 rounded-[14px]" />
      <div className="min-w-0 flex-1">
        <SkeletonBar className="h-5 w-36 max-w-[65%]" />
        <SkeletonBar className="mt-2 h-3 w-56 max-w-[85%]" />
      </div>
    </div>
  );
}

function ToolbarSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonBar key={index} className={`h-9 ${index === 0 ? "w-28" : "w-20"}`} />
      ))}
    </div>
  );
}

function TextLines({ count = 5 }: { count?: number }) {
  const widths = ["w-full", "w-[94%]", "w-[98%]", "w-[86%]", "w-[72%]"];
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonBar key={index} className={`h-3 ${widths[index % widths.length]}`} />
      ))}
    </div>
  );
}

function AnswerOptions({ count = 4 }: { count?: number }) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} className="flex min-h-14 items-center gap-3 p-3">
          <SkeletonBar className="h-7 w-7 shrink-0 rounded-full" />
          <SkeletonBar className={`h-3 ${index % 2 === 0 ? "w-3/4" : "w-2/3"}`} />
        </SkeletonCard>
      ))}
    </div>
  );
}

function MainSkeleton({ variant }: { variant: LoadingVariant }) {
  if (variant === "home") {
    return (
      <>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <SkeletonCard className="min-h-36 bg-rose-50/60">
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="mt-4 h-6 w-40" />
            <SkeletonBar className="mt-3 h-3 w-3/4" />
            <SkeletonBar className="mt-5 h-2 w-full" />
          </SkeletonCard>
          <SkeletonCard className="min-h-36 bg-emerald-50/60">
            <SkeletonBar className="h-4 w-36" />
            <div className="mt-5 grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }, (_, index) => <SkeletonBar key={index} className="aspect-square rounded-full" />)}
            </div>
          </SkeletonCard>
        </div>
        <SkeletonCard className="mt-4">
          <SkeletonBar className="h-4 w-40" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="rounded-xl bg-neutral-50 p-3">
                <SkeletonBar className="h-3 w-24" />
                <SkeletonBar className="mt-3 h-3 w-full" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </>
    );
  }

  if (variant === "reading") {
    return (
      <>
        <ToolbarSkeleton count={2} />
        <SkeletonCard className="mt-4">
          <TextLines count={9} />
        </SkeletonCard>
        <div className="mt-5">
          <SkeletonBar className="h-4 w-2/3" />
          <AnswerOptions />
        </div>
      </>
    );
  }

  if (variant === "listening") {
    return (
      <>
        <SkeletonCard className="mt-5">
          <SkeletonBar className="h-4 w-28" />
          <SkeletonBar className="mt-4 h-2 w-full" />
          <div className="mt-4 flex items-center gap-3">
            <SkeletonBar className="h-10 w-10 rounded-full" />
            <SkeletonBar className="h-9 w-28 rounded-full" />
            <SkeletonBar className="h-3 w-16" />
          </div>
        </SkeletonCard>
        <SkeletonCard className="mt-4">
          <SkeletonBar className="h-4 w-24" />
          <div className="mt-4"><TextLines count={3} /></div>
        </SkeletonCard>
        <AnswerOptions count={3} />
      </>
    );
  }

  if (variant === "exam") {
    return (
      <>
        <ToolbarSkeleton count={4} />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonCard key={index} className="h-20 p-3">
              <SkeletonBar className="h-3 w-14" />
              <SkeletonBar className="mt-3 h-5 w-10" />
            </SkeletonCard>
          ))}
        </div>
        <div className="mt-5 space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonCard key={index}>
              <div className="flex items-center justify-between gap-4">
                <SkeletonBar className="h-4 w-44 max-w-[65%]" />
                <SkeletonBar className="h-8 w-16 rounded-full" />
              </div>
              <SkeletonBar className="mt-4 h-3 w-2/3" />
              <SkeletonBar className="mt-5 h-2 w-full" />
            </SkeletonCard>
          ))}
        </div>
      </>
    );
  }

  if (variant === "stats") {
    return (
      <>
        <ToolbarSkeleton count={2} />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonCard key={index} className="h-24 p-3">
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="mt-4 h-6 w-12" />
            </SkeletonCard>
          ))}
        </div>
        <SkeletonCard className="mt-4">
          <SkeletonBar className="h-4 w-40" />
          <div className="mt-5 flex h-40 items-end gap-2 border-b border-neutral-100 px-2">
            {[45, 72, 54, 88, 64, 78, 40].map((height, index) => (
              <SkeletonBar key={index} style={{ height: `${height}%` }} className="flex-1 rounded-t-lg rounded-b-none" />
            ))}
          </div>
        </SkeletonCard>
      </>
    );
  }

  if (variant === "guide") {
    return (
      <>
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-2 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }, (_, index) => <SkeletonBar key={index} className="h-9 rounded-lg" />)}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonCard key={index}>
              <SkeletonBar className="h-4 w-36" />
              <SkeletonBar className="mt-3 h-3 w-full" />
              <div className="mt-5 flex gap-2">
                {["w-1/3", "w-1/4", "w-1/3"].map((width, step) => <SkeletonBar key={step} className={`h-8 ${width}`} />)}
              </div>
            </SkeletonCard>
          ))}
        </div>
      </>
    );
  }

  if (variant === "quiz") {
    return (
      <>
        <ToolbarSkeleton count={2} />
        <SkeletonCard className="mt-4">
          <SkeletonBar className="h-3 w-20" />
          <SkeletonBar className="mt-5 h-5 w-5/6" />
          <SkeletonBar className="mt-3 h-5 w-2/3" />
        </SkeletonCard>
        <AnswerOptions />
      </>
    );
  }

  if (variant === "roadmap") {
    return (
      <>
        <SkeletonCard className="mt-5">
          <SkeletonBar className="h-3 w-28" />
          <SkeletonBar className="mt-3 h-10 w-full rounded-xl" />
          <SkeletonBar className="mt-3 h-9 w-32 rounded-full" />
        </SkeletonCard>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonCard key={index} className="flex gap-3">
              <SkeletonBar className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1">
                <SkeletonBar className="h-4 w-36" />
                <SkeletonBar className="mt-3 h-3 w-full" />
                <SkeletonBar className="mt-2 h-3 w-2/3" />
              </div>
            </SkeletonCard>
          ))}
        </div>
      </>
    );
  }

  if (variant === "match") {
    return (
      <>
        <ToolbarSkeleton count={2} />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 8 }, (_, index) => (
            <SkeletonCard key={index} className="flex min-h-16 items-center p-3">
              <SkeletonBar className={`h-3 ${index % 2 ? "w-3/4" : "w-2/3"}`} />
            </SkeletonCard>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <ToolbarSkeleton />
      <SkeletonCard className="mt-4">
        <SkeletonBar className="h-4 w-40" />
        <div className="mt-5"><TextLines count={6} /></div>
      </SkeletonCard>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <SkeletonCard key={index}>
            <SkeletonBar className="h-4 w-32" />
            <SkeletonBar className="mt-4 h-3 w-full" />
            <SkeletonBar className="mt-2 h-3 w-3/4" />
          </SkeletonCard>
        ))}
      </div>
    </>
  );
}

export function LoadingScreen({ variant = "study", title }: { variant?: LoadingVariant; title?: string }) {
  const loadingTitle = title ?? DEFAULT_TITLES[variant];
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto min-h-[60vh] max-w-6xl px-2.5 py-4 md:px-8 md:py-6"
    >
      <span className="sr-only">Đang tải {loadingTitle}...</span>
      <div aria-hidden="true" className="motion-reduce:animate-none animate-pulse">
        <HeaderSkeleton />
        <MainSkeleton variant={variant} />
      </div>
    </div>
  );
}
