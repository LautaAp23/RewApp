import { card } from "./ui";

/** Keeps the home layout in place without presenting placeholder balances as real data. */
export function HomeBalanceSkeleton() {
  return <div aria-hidden="true" className="flex w-full flex-col items-center gap-1">
    <div className="shimmer h-12 w-44 rounded-card bg-elevated" />
    <div className="shimmer my-3 h-11 w-40 rounded-full bg-elevated" />
  </div>;
}

export function HomeMerchantsSkeleton() {
  return <div aria-hidden="true" className="flex flex-col gap-3">
    {[0, 1].map((row) => <div key={row} className={`${card} flex items-center gap-3`}>
      <div className="shimmer h-12 w-12 shrink-0 rounded-full bg-elevated" />
      <div className="flex flex-1 flex-col gap-3">
        <div className="shimmer h-5 w-3/4 rounded-full bg-elevated" />
        <div className="shimmer h-4 w-1/2 rounded-full bg-elevated" />
      </div>
    </div>)}
  </div>;
}

export function HomeHistorySkeleton() {
  return <div aria-hidden="true" className="flex flex-col divide-y divide-elevated">
    {[0, 1, 2].map((row) => <div key={row} className="flex min-h-16 items-center gap-4 px-2 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="shimmer h-5 w-3/4 rounded-full bg-elevated" />
        <div className="shimmer h-3 w-1/2 rounded-full bg-elevated" />
      </div>
      <div className="shimmer h-5 w-20 shrink-0 rounded-full bg-elevated" />
    </div>)}
  </div>;
}
