"use client";

import type { PoolPrices } from "../lib/pool";

interface PoolPriceChartProps {
  prices: PoolPrices | null;
}

export default function PoolPriceChart({
  prices,
}: PoolPriceChartProps) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-lg dark:bg-zinc-900">
      <div className="mb-5">
        <h2 className="text-xl font-bold">
          Prix spot du pool ZTC / WSOL
        </h2>

        <p className="mt-1 text-sm text-zinc-500">
          Calculé à partir du ratio des réserves actuelles. Ce prix spot n’est pas une estimation de swap ni un montant garanti reçu.
        </p>
      </div>

      {prices ? <><div className="flex h-64 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
        <div className="text-center">
          <p className="text-sm text-zinc-500">
            1 WSOL
          </p>

          <p className="mt-2 text-4xl font-bold">
            {prices.ztcPerWsol.toFixed(6)}
          </p>

          <p className="mt-2 text-sm text-zinc-500">
            ZTC
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-3">
          <p className="text-xs text-zinc-500">
            Prix spot · 1 ZTC = WSOL
          </p>

          <p className="mt-1 font-semibold">
            {prices.wsolPerZtc.toFixed(9)}
          </p>
        </div>

        <div className="rounded-xl border p-3">
          <p className="text-xs text-zinc-500">
            Prix spot · 1 WSOL = ZTC
          </p>

          <p className="mt-1 font-semibold">
            {prices.ztcPerWsol.toFixed(6)}
          </p>
        </div>
      </div></> : <div className="flex h-64 items-center justify-center rounded-xl bg-zinc-100 text-center text-sm text-zinc-500 dark:bg-zinc-800">
        Prix spot indisponible : réserves nulles, absentes ou mints inattendus.
      </div>}
    </div>
  );
}
