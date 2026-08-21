"use client";

import { useState } from "react";
import { ArrowDown } from "lucide-react";
import useSwap from "../hooks/useSwap";

export default function SwapCard() {
  const { swapSolToZing } = useSwap();

  const [fromAmount, setFromAmount] = useState("");

  return (
    <div className="max-w-md rounded-3xl border border-zinc-800 bg-[#11131B] p-6 shadow-2xl">
      <h2 className="text-2xl font-bold text-white mb-6">
        Swap
      </h2>

      {/* FROM */}
      <div className="rounded-2xl bg-zinc-900 p-4">
        <div className="flex justify-between text-sm text-gray-400 mb-2">
          <span>From</span>
          <span>Balance : 0.0000</span>
        </div>

        <div className="flex items-center justify-between">
          <input
            type="number"
            placeholder="0.0"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
            className="bg-transparent text-3xl font-bold text-white outline-none w-40"
          />

          <button className="bg-zinc-800 px-4 py-2 rounded-xl text-white">
            SOL
          </button>
        </div>
      </div>

      <div className="flex justify-center my-5">
        <div className="rounded-full bg-violet-600 p-3">
          <ArrowDown className="text-white" />
        </div>
      </div>

      {/* TO */}
      <div className="rounded-2xl bg-zinc-900 p-4">
        <div className="flex justify-between text-sm text-gray-400 mb-2">
          <span>To</span>
          <span>Balance : 0</span>
        </div>

        <div className="flex items-center justify-between">
          <input
            type="text"
            placeholder="Le prix apparaîtra..."
            readOnly
            className="bg-transparent text-3xl font-bold text-white outline-none w-40"
          />

          <button className="bg-zinc-800 px-4 py-2 rounded-xl text-white">
            ZING
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-2 text-sm text-gray-400">
        <div className="flex justify-between">
          <span>Price Impact</span>
          <span>0.00%</span>
        </div>

        <div className="flex justify-between">
          <span>Slippage</span>
          <span>0.50%</span>
        </div>

        <div className="flex justify-between">
          <span>Network Fee</span>
          <span>~0.000005 SOL</span>
        </div>
      </div>

      <button
        onClick={() => swapSolToZing(Number(fromAmount))}
        className="mt-6 w-full rounded-2xl bg-violet-600 py-4 text-lg font-bold text-white hover:bg-violet-700"
      >
        Swap
      </button>
    </div>
  );
}