"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import MainLayout from "@/components/layout/MainLayout";
import { TOKENS } from "@/lib/tokens/tokens";

export default function PortfolioPage() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();

  const [solBalance, setSolBalance] = useState("0.0000");
  const [ztcBalance, setZtcBalance] = useState("0.0000");

  useEffect(() => {
    let cancelled = false;

    const loadBalances = async () => {
      if (!connected || !publicKey) {
        setSolBalance("0.0000");
        setZtcBalance("0.0000");
        return;
      }

      try {
        // SOL
        const lamports = await connection.getBalance(publicKey);

        if (!cancelled) {
          setSolBalance((lamports / 1_000_000_000).toFixed(4));
        }

        // ZTC
        const ztcToken = TOKENS.find((token) => token.symbol === "ZTC");

        if (!ztcToken) {
          return;
        }

        try {
          const ata = getAssociatedTokenAddressSync(
            new PublicKey(ztcToken.mint),
            publicKey
          );

          const balance = await connection.getTokenAccountBalance(ata);

          if (!cancelled) {
            setZtcBalance(
              Number(balance.value.uiAmount ?? 0).toFixed(4)
            );
          }
        } catch {
          if (!cancelled) {
            setZtcBalance("0.0000");
          }
        }
      } catch (error) {
        console.error("Erreur lecture balances :", error);
      }
    };

    loadBalances();

    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, connected]);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <h1 className="text-3xl font-bold text-white">Portfolio</h1>

          <p className="mt-2 text-zinc-400">
            Soldes réels du wallet connecté.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-400">SOL</p>

            <h2 className="mt-3 text-3xl font-bold text-white">
              {solBalance}
            </h2>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-400">ZTC</p>

            <h2 className="mt-3 text-3xl font-bold text-white">
              {ztcBalance}
            </h2>
          </div>
        </div>

        {connected && publicKey && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-400">Adresse du wallet</p>

            <p className="mt-2 break-all text-white">
              {publicKey.toBase58()}
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}