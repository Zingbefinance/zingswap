"use client";

import MainLayout from "@/components/layout/MainLayout";
import { Wallet, Coins, RefreshCw } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import useWalletInfo from "../hooks/useWalletInfo";
export default function PortfolioPage() {
  const { connected, publicKey } = useWallet();

const {
  solBalance,
  zingBalance,
  tokens,
} = useWalletInfo();

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* En-tête */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center gap-3">
            <Wallet className="text-cyan-400" size={28} />

            <div>
              <h1 className="text-3xl font-bold text-white">
                Portfolio
              </h1>

              <p className="mt-2 text-zinc-400">
                Aperçu de votre wallet Solana.
              </p>
            </div>
          </div>
        </div>

        {/* Wallet */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">

          {connected ? (
            <>
              <p className="text-zinc-400">Wallet connecté</p>

              <p className="mt-2 break-all font-mono text-sm text-white">
                {publicKey?.toBase58()}
              </p>
            </>
          ) : (
            <div className="text-center py-8">
              <Wallet size={48} className="mx-auto text-zinc-500" />

              <p className="mt-4 text-zinc-300">
                Connectez votre wallet pour afficher votre portefeuille.
              </p>
            </div>
          )}
        </div>

        {/* Actifs */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">

          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">
                Vos actifs
              </h2>

              <p className="text-sm text-zinc-400">
                Les tokens détectés apparaîtront ici.
              </p>
            </div>

            <button className="rounded-xl bg-zinc-900 p-2 hover:bg-zinc-800 transition">
              <RefreshCw size={18} className="text-cyan-400" />
            </button>
          </div>

          <div className="space-y-3">

            <div className="flex items-center justify-between rounded-xl bg-zinc-900 p-4">
              <div className="flex items-center gap-3">
                <Coins className="text-cyan-400" />

                <div>
                  <p className="font-semibold text-white">SOL</p>
                  <p className="text-sm text-zinc-400">
                    Solana
                  </p>
                </div>
              </div>

              <p className="text-white">
  {solBalance.toFixed(4)}
</p>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-zinc-900 p-4">
              <div className="flex items-center gap-3">
                <Coins className="text-cyan-400" />

                <div>
                  <p className="font-semibold text-white">ZTC</p>
                  <p className="text-sm text-zinc-400">
                    Zing Token
                  </p>
                </div>
              </div>

              <p className="text-white">
  {zingBalance.toLocaleString()}
</p>
{tokens
  .filter((token) => token.symbol !== "ZTC")
  .map((token) => (
    <div
      key={token.mint}
      className="flex items-center justify-between rounded-xl bg-zinc-900 p-4"
    >
      <div className="flex items-center gap-3">
        <Coins className="text-cyan-400" />

        <div>
          <p className="font-semibold text-white">
            {token.symbol}
          </p>

          <p className="text-sm text-zinc-400">
            SPL Token
          </p>
        </div>
      </div>

      <p className="text-white">
        {token.amount.toLocaleString()}
      </p>
    </div>
  ))}
            </div>

            <div className="rounded-xl border border-dashed border-cyan-500/30 bg-zinc-900 p-4 text-center">
              <p className="text-zinc-400">
                Les tokens SPL seront récupérés automatiquement à l'étape suivante.
              </p>
            </div>

          </div>
        </div>

      </div>
    </MainLayout>
  );
}