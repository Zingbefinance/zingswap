"use client";

import MainLayout from "@/components/layout/MainLayout";
import LiquidityCard from "@/features/liquidity/components/LiquidityCard";
import { useWallet } from "@solana/wallet-adapter-react";

export default function LiquidityPage() {
  const { connected, publicKey } = useWallet();

  return (
    <MainLayout>
      <div className="space-y-6">

        {/* ==============================================
            EN-TÊTE
        ============================================== */}

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 md:p-6">
  <h1 className="text-2xl font-bold text-white">
    Liquidity
  </h1>

  <p className="mt-1 text-sm text-zinc-400">
    Provide liquidity to ZingSwap pools and earn trading fees.
  </p>
</div>

        {/* ==============================================
            STATISTIQUES
        ============================================== */}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-400">
              Positions
            </p>

            <h2 className="mt-3 text-3xl font-bold text-white">
              0
            </h2>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-400">
              TVL personnel
            </p>

            <h2 className="mt-3 text-3xl font-bold text-white">
              $0
            </h2>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-400">
              Frais gagnés
            </p>

            <h2 className="mt-3 text-3xl font-bold text-white">
              $0
            </h2>
          </div>

        </div>

        {/* ==============================================
            WALLET
        ============================================== */}

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">

          <h2 className="text-xl font-bold text-white">
            Wallet
          </h2>

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

        {/* ==============================================
            MOTEUR DE LIQUIDITÉ ZINGSWAP
        ============================================== */}

        <LiquidityCard />

      </div>
    </MainLayout>
  );
}