"use client";

import type { PoolPrices } from "../lib/pool";

interface PoolPriceChartProps {
  prices: PoolPrices;
}

export default function PoolPriceChart({
  prices,
}: PoolPriceChartProps) {
  const price = prices.ztcPerWsol;

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-lg dark:bg-zinc-900">
      <div className="mb-5">
        <h2 className="text-xl font-bold">
          Prix ZTC / WSOL
        </h2>

        <p className="mt-1 text-sm text-zinc-500">
          Prix actuel calculé à partir des réserves
          du pool.
        </p>
      </div>

      <div className="flex h-64 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
        <div className="text-center">
          <p className="text-sm text-zinc-500">
            1 WSOL
          </p>

          <p className="mt-2 text-4xl font-bold">
            {price.toFixed(6)}
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            ZTC
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-3">
          <p className="text-xs text-zinc-500">
            ZTC → WSOL
          </p>

          <p className="mt-1 font-semibold">
            {prices.wsolPerZtc.toFixed(9)}
          </p>
        </div>

        <div className="rounded-xl border p-3">
          <p className="text-xs text-zinc-500">
            WSOL → ZTC
          </p>

          <p className="mt-1 font-semibold">
            {prices.ztcPerWsol.toFixed(6)}
          </p>
        </div>
      </div>
    </div>
  );
}
