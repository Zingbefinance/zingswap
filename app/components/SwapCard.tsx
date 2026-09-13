"use client";

import { useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import useSwap from "../hooks/useSwap";

const ZTC_MINT = new PublicKey(
  "4zihBzwHLx9z7aNmXam181iUd285xbqJNN57M5LhoHpu",
);


const WSOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112",
);

const PROGRAM_ID = new PublicKey(
  "EfPqnPQ5wzdV4Uv7SRKQVUGDjBna2YrLKWUDZLAz9Lna",
);

const FEE_BPS = 30;

export default function SwapCard() {
  const { swapSolToZing } = useSwap();
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();

  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [ztcBalance, setZtcBalance] = useState<number | null>(null);
  const [priceImpact, setPriceImpact] = useState<number | null>(null);

  const [poolZtcReserve, setPoolZtcReserve] = useState<number | null>(null);
  const [poolWsolReserve, setPoolWsolReserve] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBalances() {
      if (!connected || !publicKey) {
        setSolBalance(null);
        setZtcBalance(null);
        return;
      }

      try {
        const solLamports = await connection.getBalance(publicKey);

        const ztcAta = getAssociatedTokenAddressSync(
          ZTC_MINT,
          publicKey,
        );

        let ztcAmount = 0;

        try {
          const tokenBalance =
            await connection.getTokenAccountBalance(ztcAta);

          ztcAmount = Number(tokenBalance.value.uiAmount ?? 0);
        } catch {
          ztcAmount = 0;
        }

        if (!cancelled) {
          setSolBalance(solLamports / 1_000_000_000);
          setZtcBalance(ztcAmount);
        }
      } catch (error) {
        console.error("Erreur récupération soldes :", error);
      }
    }

    loadBalances();

    return () => {
      cancelled = true;
    };
  }, [connected, publicKey, connection]);

  useEffect(() => {
    let cancelled = false;

    async function loadPoolReserves() {
      try {
        const pool = PublicKey.findProgramAddressSync(
          [
            Buffer.from("pool"),
            ZTC_MINT.toBuffer(),
            WSOL_MINT.toBuffer(),
          ],
          PROGRAM_ID,
        )[0];

        const vaultA = PublicKey.findProgramAddressSync(
          [Buffer.from("vault_a"), pool.toBuffer()],
          PROGRAM_ID,
        )[0];

        const vaultB = PublicKey.findProgramAddressSync(
          [Buffer.from("vault_b"), pool.toBuffer()],
          PROGRAM_ID,
        )[0];

        const [ztcAccount, wsolAccount] = await Promise.all([
          connection.getTokenAccountBalance(vaultA),
          connection.getTokenAccountBalance(vaultB),
        ]);

        if (!cancelled) {
          setPoolZtcReserve(
            Number(ztcAccount.value.uiAmount ?? 0),
          );

          setPoolWsolReserve(
            Number(wsolAccount.value.uiAmount ?? 0),
          );
        }
      } catch (error) {
        console.error(
          "Erreur récupération réserves du pool :",
          error,
        );

        if (!cancelled) {
          setPoolZtcReserve(null);
          setPoolWsolReserve(null);
        }
      }
    }

    loadPoolReserves();

    return () => {
      cancelled = true;
    };
  }, [connection]);

  useEffect(() => {
  const amountIn = Number(fromAmount);

  if (
    !Number.isFinite(amountIn) ||
    amountIn <= 0 ||
    poolZtcReserve === null ||
    poolWsolReserve === null ||
    poolWsolReserve <= 0 ||
    poolZtcReserve <= 0
  ) {
    setToAmount("");
    setPriceImpact(null);
    return;
  }

  // Prix spot avant le swap.
  // 1 SOL = quantité théorique de ZTC au prix actuel du pool.
  const spotPrice = poolZtcReserve / poolWsolReserve;

  // Frais ZingSwap : 0,30 %.
  const fee = amountIn * (FEE_BPS / 10_000);

  // Montant réellement injecté dans la courbe après les frais.
  const amountAfterFee = amountIn - fee;

  // Formule constant-product utilisée actuellement par le programme.
  const amountOut =
    (poolZtcReserve * amountAfterFee) /
    (poolWsolReserve + amountAfterFee);

  if (!Number.isFinite(amountOut) || amountOut <= 0) {
    setToAmount("");
    setPriceImpact(null);
    return;
  }

  // Prix obtenu par la courbe, hors effet du fee.
  const executionPrice =
    amountOut / amountAfterFee;

  // Price Impact = perte de prix due uniquement
  // au déplacement sur la courbe de liquidité.
  const impact =
    ((spotPrice - executionPrice) / spotPrice) * 100;

  setPriceImpact(Math.max(0, impact));

  setToAmount(
    amountOut.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }),
  );
}, [fromAmount, poolZtcReserve, poolWsolReserve]);

  function formatBalance(
    value: number | null,
    decimals: number,
  ) {
    if (value === null) {
      return "—";
    }

    return value.toLocaleString("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#11131B] p-4 shadow-2xl">
      <h2 className="mb-4 text-xl font-bold text-white">
        Swap
      </h2>

      {/* FROM */}
      <div className="rounded-xl bg-zinc-900 p-3">
        <div className="mb-1.5 flex justify-between text-xs text-gray-400">
          <span>From</span>

          <span>
            Balance : {formatBalance(solBalance, 4)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <input
            type="number"
            placeholder="0.0"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
            className="w-full min-w-0 bg-transparent text-2xl font-bold text-white outline-none"
          />

          <button className="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-white">
            SOL
          </button>
        </div>
      </div>

      <div className="my-3 flex justify-center">
        <div className="rounded-full bg-violet-600 p-2">
          <ArrowDown className="h-4 w-4 text-white" />
        </div>
      </div>

      {/* TO */}
      <div className="rounded-xl bg-zinc-900 p-3">
        <div className="mb-1.5 flex justify-between text-xs text-gray-400">
          <span>To</span>

          <span>
            Balance : {formatBalance(ztcBalance, 2)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <input
            type="text"
            placeholder="0.0"
            value={toAmount}
            readOnly
            className="w-full min-w-0 bg-transparent text-2xl font-bold text-white outline-none"
          />

          <button className="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-white">
            ZING
          </button>
        </div>
      </div>

      {/* SWAP DETAILS */}
      <div className="mt-4 space-y-1.5 text-xs text-gray-400">
  <div className="flex justify-between">
    <span>Price Impact</span>

    <span>
      {priceImpact === null
        ? "—"
        : `${priceImpact.toFixed(2)}%`}
    </span>
  </div>

  <div className="flex justify-between">
    <span>Fee</span>
    <span>0.30%</span>
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
        className="mt-4 w-full rounded-xl bg-violet-600 py-3 text-base font-bold text-white hover:bg-violet-700"
      >
        Swap
      </button>
    </div>
  );
}