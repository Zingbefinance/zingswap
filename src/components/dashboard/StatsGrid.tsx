"use client";

export default function StatsGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="text-sm text-white/50">TVL</p>
        <p className="mt-2 text-2xl font-semibold text-white">$0</p>
        <p className="mt-1 text-xs text-emerald-400">+0%</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="text-sm text-white/50">24H Volume</p>
        <p className="mt-2 text-2xl font-semibold text-white">$0</p>
        <p className="mt-1 text-xs text-emerald-400">+0%</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="text-sm text-white/50">Swaps</p>
        <p className="mt-2 text-2xl font-semibold text-white">0</p>
        <p className="mt-1 text-xs text-emerald-400">+0%</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="text-sm text-white/50">Fees</p>
        <p className="mt-2 text-2xl font-semibold text-white">$0</p>
        <p className="mt-1 text-xs text-emerald-400">+0%</p>
      </div>
    </div>
  );
}
