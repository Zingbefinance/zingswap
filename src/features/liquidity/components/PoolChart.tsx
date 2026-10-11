"use client";

import type { PoolData } from "../lib/pool";

interface PoolChartProps {
  pool: PoolData;
}

function formatTokenAmount(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

export default function PoolChart({
  pool,
}: PoolChartProps) {
  const ztcReserve =
    formatTokenAmount(pool.reserveA, 6);

  const wsolReserve =
    formatTokenAmount(pool.reserveB, 9);

  const maxReserve = Math.max(
    ztcReserve,
    wsolReserve
  );

  const ztcWidth =
    maxReserve > 0
      ? (ztcReserve / maxReserve) * 100
      : 0;

  const wsolWidth =
    maxReserve > 0
      ? (wsolReserve / maxReserve) * 100
      : 0;

  return (
    <div className="min-w-0 rounded-2xl border bg-white p-4 shadow-lg dark:bg-zinc-900 sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-bold">
          État du pool
        </h2>

        <p className="mt-1 text-sm text-zinc-500">
          Réserves actuelles ZTC / WSOL
        </p>
      </div>

      <div className="space-y-5">

        <div>
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2 text-sm">
            <span className="font-medium">
              ZTC
            </span>

            <span className="break-words text-right font-mono">
              {ztcReserve.toLocaleString("fr-FR", { maximumFractionDigits: 6 })}
            </span>
          </div>

          <div className="h-4 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-cyan-500 transition-all"
              style={{
                width: `${ztcWidth}%`,
              }}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2 text-sm">
            <span className="font-medium">
              WSOL
            </span>

            <span className="break-words text-right font-mono">
              {wsolReserve.toLocaleString("fr-FR", { maximumFractionDigits: 9 })}
            </span>
          </div>

          <div className="h-4 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-purple-500 transition-all"
              style={{
                width: `${wsolWidth}%`,
              }}
            />
          </div>
        </div>

      </div>

      <div className="mt-6 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">

        <div className="rounded-xl border p-3">
          <p className="text-xs text-zinc-500">
            Réserve ZTC
          </p>

          <p className="mt-1 break-words font-semibold">
            {ztcReserve.toLocaleString("fr-FR", { maximumFractionDigits: 6 })}
          </p>
        </div>

        <div className="rounded-xl border p-3">
          <p className="text-xs text-zinc-500">
            Réserve WSOL
          </p>

          <p className="mt-1 break-words font-semibold">
            {wsolReserve.toLocaleString("fr-FR", { maximumFractionDigits: 9 })}
          </p>
        </div>

      </div>
    </div>
  );
}
