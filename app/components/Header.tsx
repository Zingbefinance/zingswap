"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Sun, Bell } from "lucide-react";

export default function Header() {
  return (
    <header className="h-20 border-b border-zinc-800 bg-[#0B0D14] flex items-center justify-between px-8">

      {/* Logo */}
      <div className="flex items-center gap-4">

        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 via-violet-500 to-blue-500 flex items-center justify-center shadow-lg">
          <span className="text-white text-2xl font-bold">
            Z
          </span>
        </div>

        <div>
          <h1 className="text-white text-2xl font-bold">
            ZING
            <span className="text-purple-500">SWAP</span>
          </h1>

          <p className="text-xs text-gray-400">
            Powered by Solana
          </p>
        </div>

      </div>

      {/* Right */}
      <div className="flex items-center gap-4">

        <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2 flex items-center gap-2">

          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>

          <span className="text-green-400 text-sm">
            Solana Mainnet
          </span>

        </div>

        <button className="w-12 h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <Bell size={20} className="text-gray-300" />
        </button>

        <button className="w-12 h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <Sun size={20} className="text-gray-300" />
        </button>

        <WalletMultiButton />

      </div>

    </header>
  );
}