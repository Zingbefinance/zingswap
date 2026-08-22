"use client";

import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { useWallet } from "@solana/wallet-adapter-react";

export default function LiquidityPage() {
  const { connected, publicKey } = useWallet();
  const [showForm, setShowForm] = useState(false);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* En-tête */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <h1 className="text-3xl font-bold text-white">Liquidity</h1>

          <p className="mt-2 text-zinc-400">
            Gère tes positions de liquidité ZingSwap.
          </p>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-400">Positions</p>
            <h2 className="mt-3 text-3xl font-bold text-white">0</h2>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-400">TVL personnel</p>
            <h2 className="mt-3 text-3xl font-bold text-white">$0</h2>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-400">Frais gagnés</p>
            <h2 className="mt-3 text-3xl font-bold text-white">$0</h2>
          </div>
        </div>

        {/* Wallet */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-xl font-bold text-white">Wallet</h2>

          {connected && publicKey ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-zinc-400">
                Wallet connecté
              </p>

              <p className="break-all text-white">
                {publicKey.toBase58()}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-zinc-400">
              Connecte ton wallet pour afficher tes positions.
            </p>
          )}
        </div>

        {/* Positions */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              Mes positions
            </h2>

            <button
              onClick={() => setShowForm(!showForm)}
              className="rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-black transition hover:bg-cyan-400"
            >
              {showForm ? "Close" : "Add Liquidity"}
            </button>
          </div>

          {showForm && (
            <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="text-lg font-bold text-white">
                Nouvelle position
              </h3>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Token A
                  </label>

                  <input
                    placeholder="SOL"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Token B
                  </label>

                  <input
                    placeholder="ZTC"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Montant Token A
                  </label>

                  <input
                    type="number"
                    placeholder="0.0"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-400">
                    Montant Token B
                  </label>

                  <input
                    type="number"
                    placeholder="0.0"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white outline-none"
                  />
                </div>

                <button
                  disabled
                  className="w-full rounded-xl bg-cyan-500 py-3 font-bold text-black opacity-60"
                >
                  Create Position (CLMM bientôt)
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 rounded-xl border border-dashed border-zinc-700 p-8 text-center">
            <p className="text-zinc-400">
              Aucune position de liquidité détectée.
            </p>

            <p className="mt-2 text-sm text-zinc-500">
              Cette section affichera les positions CLMM dès que le moteur de
              liquidité ZingSwap sera branché.
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}