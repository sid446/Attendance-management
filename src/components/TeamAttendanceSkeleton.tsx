"use client";

function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-surface ${className}`}
      aria-hidden
    />
  );
}

/**
 * Placeholder layout while team list / per-member attendance for the selected month loads.
 */
export function TeamAttendanceSkeleton() {
  return (
    <section className="space-y-6" aria-busy="true" aria-label="Loading team attendance">
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-[inset_0_0_0_1px_rgba(147,197,253,0.18)]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Bar className="h-5 w-36" />
              <Bar className="h-3 w-52" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Bar className="h-7 w-24" />
              <Bar className="h-7 w-24" />
              <Bar className="h-7 w-20" />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <Bar className="h-4 w-28" />
                <Bar className="h-9 w-full max-w-[220px] sm:w-52" />
              </div>
              <Bar className="mb-3 h-8 w-full" />
              <ul className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <li key={i}>
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                      <Bar className="h-7 w-7 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Bar className="h-3.5 w-3/5 max-w-[12rem]" />
                        <Bar className="h-2.5 w-2/5 max-w-[8rem]" />
                      </div>
                      <Bar className="hidden h-3 w-16 shrink-0 sm:block" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center gap-2">
                <Bar className="h-4 w-40" />
              </div>
              <ul className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <li key={i}>
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                      <Bar className="h-3.5 flex-1 max-w-[10rem]" />
                      <Bar className="h-3 w-20 shrink-0" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="flex max-w-md flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-[inset_0_0_0_1px_rgba(147,197,253,0.18)]">
        <Bar className="h-3 w-28" />
        <Bar className="h-10 w-full" />
        <Bar className="h-10 w-full" />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-[inset_0_0_0_1px_rgba(147,197,253,0.18)]">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Bar className="h-6 w-14 rounded-md" />
          <Bar className="h-5 w-40" />
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Bar key={`h-${i}`} className="h-4 w-full" />
          ))}
          {Array.from({ length: 35 }).map((_, i) => (
            <Bar key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      </div>
    </section>
  );
}
