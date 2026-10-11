"use client";

import useWalletInfo from "../hooks/useWalletInfo";
import { TOKENS } from "../config/tokens";

export default function StatsCards() {
  const { connected, state } = useWalletInfo();
  const solBalance = state.status === "ready"
    ? state.assets.find((asset) => asset.mint === TOKENS.SOL.mint)?.amount ?? 0
    : null;
  const zingBalance = state.status === "ready"
    ? state.assets.find((asset) => asset.mint === TOKENS.ZING.mint)?.amount ?? 0
    : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

      {/* Wallet */}
      <div className="bg-zinc-900 rounded-2xl p-5">
        <p className="text-gray-400 text-sm">Wallet Status</p>
        <h2 className="text-2xl font-bold">
          {connected ? "Connected" : "Disconnected"}
        </h2>
      </div>

      {/* SOL */}
      <div className="bg-zinc-900 rounded-2xl p-5">
        <p className="text-gray-400 text-sm">SOL Balance</p>
        <h2 className="text-2xl font-bold">
          {solBalance == null ? "—" : solBalance.toFixed(4)}
        </h2>
      </div>

      {/* ZING */}
      <div className="bg-zinc-900 rounded-2xl p-5">
        <p className="text-gray-400 text-sm">ZING Balance</p>
        <h2 className="text-2xl font-bold">
          {zingBalance == null ? "—" : zingBalance.toFixed(6)}
        </h2>
      </div>

      {/* Prix */}
      <div className="bg-zinc-900 rounded-2xl p-5">
        <p className="text-gray-400 text-sm">ZING Price</p>
        <h2 className="text-2xl font-bold text-green-400">
          Soon
        </h2>
      </div>

    </div>
  );
}
