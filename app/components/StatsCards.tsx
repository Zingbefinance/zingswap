"use client";

import useWalletInfo from "../hooks/useWalletInfo";

export default function StatsCards() {
  const {
    connected,
    solBalance,
    zingBalance,
  } = useWalletInfo();

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
          {solBalance.toFixed(4)}
        </h2>
      </div>

      {/* ZING */}
      <div className="bg-zinc-900 rounded-2xl p-5">
        <p className="text-gray-400 text-sm">ZING Balance</p>
        <h2 className="text-2xl font-bold">
          {zingBalance.toFixed(6)}
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