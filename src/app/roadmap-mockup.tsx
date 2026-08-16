function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

// Chapter states for the John node: done (gold), next (gold ring), todo (gray)
const johnChapters: Array<{ n: number; state: "done" | "next" | "todo" }> = [
  { n: 1, state: "done" },
  { n: 2, state: "done" },
  { n: 3, state: "next" },
  { n: 4, state: "todo" },
  { n: 5, state: "todo" },
  { n: 6, state: "todo" },
  { n: 7, state: "todo" },
  { n: 8, state: "todo" },
];

function ChapterSquare({ n, state }: { n: number; state: "done" | "next" | "todo" }) {
  const base =
    "relative flex h-11 min-w-[2.25rem] flex-col items-center justify-center gap-0.5 rounded px-1 text-xs tabular-nums";

  if (state === "next") {
    return (
      <div className={`${base} bg-amber-500 font-bold text-white ring-2 ring-amber-400 shadow-md shadow-amber-500/25 dark:bg-amber-400 dark:text-amber-950 dark:ring-amber-300`}>
        <span className="leading-none">{n}</span>
        <span className="flex items-center gap-1">
          <BookIcon className="h-3 w-3 text-amber-200 dark:text-amber-700" />
          <PencilIcon className="h-3 w-3 text-amber-200 dark:text-amber-700" />
        </span>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className={`${base} bg-amber-100 font-semibold text-amber-700 ring-1 ring-inset ring-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:ring-amber-700`}>
        <span className="leading-none">{n}</span>
        <span className="flex items-center gap-1">
          <BookIcon className="h-3 w-3 text-amber-500 dark:text-amber-400" />
          <PencilIcon className="h-3 w-3 text-amber-500 dark:text-amber-400" />
        </span>
      </div>
    );
  }

  return (
    <div className={`${base} bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400`}>
      <span className="leading-none">{n}</span>
      <span className="flex items-center gap-1">
        <BookIcon className="h-3 w-3 text-neutral-300 dark:text-neutral-600" />
        <PencilIcon className="h-3 w-3 text-neutral-300 dark:text-neutral-600" />
      </span>
    </div>
  );
}

export function RoadmapMockup() {
  return (
    <div className="w-full max-w-md">
      {/* Timeline */}
      <div className="relative ml-3">
        {/* Vertical line starts at the first dot (John), not above it */}
        <div className="absolute left-0 top-[22px] bottom-0 w-0.5 bg-neutral-200 dark:bg-neutral-700" />
        {/* John — up next, expanded */}
        <div className="relative py-2.5 pl-8">
          <div className="absolute -left-[9px] top-3.5 h-4 w-4 rounded-full border-2 border-amber-500 bg-amber-500" />
          <div className="flex items-center gap-2">
            <svg className="h-3.5 w-3.5 flex-shrink-0 rotate-90 text-neutral-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">John</h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
              Up next
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {johnChapters.map((ch) => (
              <ChapterSquare key={ch.n} n={ch.n} state={ch.state} />
            ))}
          </div>
        </div>

        {/* Matthew — not started */}
        <div className="relative py-2.5 pl-8">
          <div className="absolute -left-[9px] top-3.5 h-4 w-4 rounded-full border-2 border-neutral-300 bg-paper dark:border-neutral-600 dark:bg-neutral-900" />
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Matthew</h3>
            <span className="text-[0.65rem] text-neutral-400 dark:text-neutral-500">28 ch.</span>
          </div>
        </div>

        {/* Mark — not started */}
        <div className="relative py-2.5 pl-8">
          <div className="absolute -left-[9px] top-3.5 h-4 w-4 rounded-full border-2 border-neutral-300 bg-paper dark:border-neutral-600 dark:bg-neutral-900" />
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Mark</h3>
            <span className="text-[0.65rem] text-neutral-400 dark:text-neutral-500">16 ch.</span>
          </div>
        </div>

        {/* Luke — not started */}
        <div className="relative py-2.5 pl-8">
          <div className="absolute -left-[9px] top-3.5 h-4 w-4 rounded-full border-2 border-neutral-300 bg-paper dark:border-neutral-600 dark:bg-neutral-900" />
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Luke</h3>
            <span className="text-[0.65rem] text-neutral-400 dark:text-neutral-500">24 ch.</span>
          </div>
        </div>

        {/* Acts — not started */}
        <div className="relative py-2.5 pl-8">
          <div className="absolute -left-[9px] top-3.5 h-4 w-4 rounded-full border-2 border-neutral-300 bg-paper dark:border-neutral-600 dark:bg-neutral-900" />
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Acts</h3>
            <span className="text-[0.65rem] text-neutral-400 dark:text-neutral-500">28 ch.</span>
          </div>
        </div>

        {/* Romans — not started */}
        <div className="relative py-2.5 pl-8">
          <div className="absolute -left-[9px] top-3.5 h-4 w-4 rounded-full border-2 border-neutral-300 bg-paper dark:border-neutral-600 dark:bg-neutral-900" />
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Romans</h3>
            <span className="text-[0.65rem] text-neutral-400 dark:text-neutral-500">16 ch.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
