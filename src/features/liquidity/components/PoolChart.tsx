"use client";

import type { PoolData } from "../lib/pool";

interface PoolChartProps {
  pool: PoolData;
}

function formatAmount(amount: bigint): string {
  return (
    Number(amount) / 1_000_000_000
  ).toLocaleString("fr-FR", {
    maximumFractionDigits: 6,
  });
}

export default function PoolChart({
  pool,
}: PoolChartProps) {
  const ztcReserve =
    Number(pool.reserveA) / 1_000_000_000;

  const wsolReserve =
    Number(pool.reserveB) / 1_000_000_000;

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
    <div className="rounded-2xl border bg-white p-6 shadow-lg dark:bg-zinc-900">
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
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">
              ZTC
            </span>

            <span className="font-mono">
              {formatAmount(pool.reserveA)}
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
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">
              WSOL
            </span>

            <span className="font-mono">
              {formatAmount(pool.reserveB)}
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

      <div className="mt-6 grid grid-cols-2 gap-3">

        <div className="rounded-xl border p-3">
          <p className="text-xs text-zinc-500">
            Réserve ZTC
          </p>

          <p className="mt-1 font-semibold">
            {formatAmount(pool.reserveA)}
          </p>
        </div>

        <div className="rounded-xl border p-3">
          <p className="text-xs text-zinc-500">
            Réserve WSOL
          </p>

          <p className="mt-1 font-semibold">
            {formatAmount(pool.reserveB)}
          </p>
        </div>

      </div>
    </div>
  );
}
