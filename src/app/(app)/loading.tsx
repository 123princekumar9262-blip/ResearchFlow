/**
 * While a page loads: shimmering cards shaped like the real layout (spec §4.2),
 * so navigation feels immediate and the layout doesn't jump when data arrives.
 */
export default function Loading() {
  const bar = "rf-shimmer rounded-md";
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="space-y-2 max-md:hidden">
        <div className={`${bar} h-7 w-64`} />
        <div className={`${bar} h-3.5 w-40`} />
      </div>
      <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className={`${bar} h-3 w-24`} />
        <div className={`${bar} mt-3 h-5 w-3/4`} />
        <div className={`${bar} mt-2 h-3.5 w-1/2`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_344px]">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-4">
            {[0, 1].map((card) => (
              <div key={card} className="overflow-hidden rounded-[10px] border bg-card shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-2 border-b bg-surface-2/60 px-3.5 py-2.5">
                  <div className={`${bar} size-6`} />
                  <div className={`${bar} h-3.5 w-32`} />
                </div>
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex items-center gap-3 border-b px-3.5 py-3 last:border-0">
                    <div className={`${bar} size-3.5 rounded-full`} />
                    <div className={`${bar} h-3.5 flex-1`} />
                    <div className={`${bar} h-5 w-16`} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
