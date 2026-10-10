"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export type PortfolioAsset = {
  mint: string;
  symbol: string;
  name: string;
  amount: number;
  decimals: number;
};

type AssetPrice = { usd: number; change24h: number | null };
type PortfolioState =
  | { status: "idle" | "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; assets: PortfolioAsset[]; prices: Record<string, AssetPrice>; pricesUnavailable: boolean; updatedAt: number };

const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_REGISTRY: Record<string, { symbol: string; name: string }> = {
  "4zihBzwHLx9z7aNmXam181iUd285xbqJNN57M5LhoHpu": { symbol: "ZTC", name: "Zing Token" },
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6YaB1pPB263PB263": { symbol: "BONK", name: "Bonk" },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: "JUP", name: "Jupiter" },
  EKpQGSJtjMFqKZ6uJ3iM3Y6L6i9n9M2J7sKnzGWxZMF: { symbol: "WIF", name: "dogwifhat" },
  Es9vMFrzaCERmJfrF4H2t6wQBaLtgBoQxGc1dQc5sK7: { symbol: "USDT", name: "Tether" },
};

export default function useWalletInfo() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [state, setState] = useState<PortfolioState>({ status: "idle" });
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!connected || !publicKey) return;
    const currentRequest = ++requestId.current;
    setState({ status: "loading" });

    try {
      const [lamports, legacyAccounts, token2022Accounts] = await Promise.all([
        connection.getBalance(publicKey, "confirmed"),
        connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID }, "confirmed"),
        connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_2022_PROGRAM_ID }, "confirmed"),
      ]);
      if (requestId.current !== currentRequest) return;

      const assets: PortfolioAsset[] = [{
        mint: SOL_MINT,
        symbol: "SOL",
        name: "Solana",
        amount: lamports / LAMPORTS_PER_SOL,
        decimals: 9,
      }];

      for (const account of [...legacyAccounts.value, ...token2022Accounts.value]) {
        const info = account.account.data.parsed.info;
        const tokenAmount = info.tokenAmount;
        const amount = Number(tokenAmount.uiAmountString ?? tokenAmount.uiAmount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const metadata = TOKEN_REGISTRY[info.mint];
        assets.push({
          mint: info.mint,
          symbol: metadata?.symbol ?? "SPL",
          name: metadata?.name ?? "Token SPL",
          amount,
          decimals: tokenAmount.decimals,
        });
      }

      let prices: Record<string, AssetPrice> = {};
      let pricesUnavailable = false;
      try {
        const response = await fetch(`/api/tokens/prices?mints=${assets.map((asset) => asset.mint).join(",")}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Price lookup failed");
        const payload = (await response.json()) as { prices?: Record<string, AssetPrice> };
        prices = payload.prices ?? {};
      } catch {
        pricesUnavailable = true;
      }

      if (requestId.current === currentRequest) {
        setState({ status: "ready", assets, prices, pricesUnavailable, updatedAt: Date.now() });
      }
    } catch (error) {
      if (requestId.current === currentRequest) {
        setState({ status: "error", error: error instanceof Error ? error.message : "Impossible de lire les soldes du portefeuille." });
      }
    }
  }, [connected, connection, publicKey]);

  useEffect(() => {
    if (!connected || !publicKey) {
      requestId.current += 1;
      setState({ status: "idle" });
      return;
    }
    void refresh();
  }, [connected, publicKey, refresh]);

  return { connected, address: publicKey?.toBase58() ?? "", state, refresh };
}
