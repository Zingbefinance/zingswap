"use client";
import { useSelectedToken } from "@/components/providers/TokenContext";
import { useSettings } from "@/components/providers/SettingsContext";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import TokenButton from "./TokenButton";

import { TOKENS } from "../../../../lib/tokens/tokens";
import { Token } from "../../../../lib/tokens/types";
import { useSwap, type JupiterQuoteResult } from "../hooks/useSwap";

const ZTC_MINT = "4zihBzwHLx9z7aNmXam181iUd285xbqJNN57M5LhoHpu";
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const amountFormat = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 8 });

function formatAmount(value: number) {
  return Number.isFinite(value) && value > 0 ? amountFormat.format(value) : "indisponible";
}

function formatAtomicAmount(raw: bigint, decimals: number) {
  const value = raw.toString().padStart(decimals + 1, "0");
  if (decimals === 0) return value;
  const whole = value.slice(0, -decimals);
  const fraction = value.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function parseAtomicAmount(value: string, decimals: number): bigint | null {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) return null;
  return BigInt(`${whole}${fraction.padEnd(decimals, "0")}`);
}

function formatQuoteTime(timestamp: number) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

type QuoteSnapshot<T> = {
  requestKey: string;
  requestedAt: number;
  receivedAt: number;
  quote: T;
};

export default function SwapCard() {
  const router = useRouter();

  const [fromToken, setFromToken] = useState<Token>(TOKENS[0]);
  const [toToken, setToToken] = useState<Token>(TOKENS[1]);
  const isZtcSolPair =
    (fromToken.mint === ZTC_MINT && toToken.mint === WSOL_MINT) ||
    (fromToken.mint === WSOL_MINT && toToken.mint === ZTC_MINT);
  const [selectedRoute, setSelectedRoute] = useState<"zing" | "jupiter">("zing");
  const activeRoute = isZtcSolPair ? "jupiter" : selectedRoute;

  const [fromAmount, setFromAmount] = useState("");
  const selectedRouteRef = useRef(selectedRoute);
  const updateSelectedRoute = (route: "zing" | "jupiter") => {
    selectedRouteRef.current = route;
    setSelectedRoute(route);
  };
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const { connected, publicKey } = useWallet();
  const {
  selectedToken,
  setSelectedToken,
  selectedSide,
  setSelectedSide,
} = useSelectedToken();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const { slippageBps } = useSettings();
  const { swap, getQuote, getJupiterQuote, swapOnJupiter } = useSwap();

  const [fromBalance, setFromBalance] = useState("0.0000");
  const [toBalance, setToBalance] = useState("0.0000");
  const [fromBalanceSnapshot, setFromBalanceSnapshot] = useState<{ key: string; exact: string | null } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [jupiterQuoteSnapshot, setJupiterQuoteSnapshot] = useState<QuoteSnapshot<JupiterQuoteResult> | null>(null);
  const [zingQuoteSnapshot, setZingQuoteSnapshot] = useState<QuoteSnapshot<Awaited<ReturnType<typeof getQuote>>> | null>(null);
  const [jupiterError, setJupiterError] = useState("");
  const [jupiterErrorKey, setJupiterErrorKey] = useState("");
  const [solUsdPrice, setSolUsdPrice] = useState<number | null>(null);
  const currentQuoteKey = JSON.stringify([
    fromAmount,
    fromToken.mint,
    toToken.mint,
    slippageBps,
  ]);
  const currentJupiterQuote = jupiterQuoteSnapshot?.requestKey === currentQuoteKey
    ? jupiterQuoteSnapshot.quote
    : null;
  const currentZingQuote = zingQuoteSnapshot?.requestKey === currentQuoteKey
    ? zingQuoteSnapshot.quote
    : null;
  const validJupiterQuote = (() => {
    if (!currentJupiterQuote) return null;
    try {
      return currentJupiterQuote.inputMint === fromToken.mint &&
        currentJupiterQuote.outputMint === toToken.mint &&
        currentJupiterQuote.inputDecimals === fromToken.decimals &&
        currentJupiterQuote.outputDecimals === toToken.decimals &&
        currentJupiterQuote.amountInRaw === parseAtomicAmount(fromAmount, fromToken.decimals)?.toString() &&
        /^\d+$/.test(currentJupiterQuote.amountOutRaw) && BigInt(currentJupiterQuote.amountOutRaw) > BigInt(0)
        ? currentJupiterQuote
        : null;
    } catch {
      return null;
    }
  })();
  const quoteMatchesInput = activeRoute === "jupiter" || isZtcSolPair
    ? isZtcSolPair ? validJupiterQuote !== null : currentJupiterQuote !== null
    : currentZingQuote !== null;
  const currentBalanceKey = publicKey ? `${publicKey.toBase58()}:${fromToken.mint}` : "";
  const currentFromBalanceExact = fromBalanceSnapshot?.key === currentBalanceKey
    ? fromBalanceSnapshot.exact
    : null;
  const inputRawAmount = parseAtomicAmount(fromAmount, fromToken.decimals);
  const currentBalanceRaw = currentFromBalanceExact == null
    ? null
    : parseAtomicAmount(currentFromBalanceExact, fromToken.decimals);
  const balanceCheckApplies = connected && fromToken.mint === WSOL_MINT && fromAmount.trim() !== "" && Number(fromAmount) > 0;
  const balanceUnavailable = balanceCheckApplies && (balanceLoading || inputRawAmount === null || currentBalanceRaw === null);
  const insufficientSol = balanceCheckApplies && !balanceUnavailable && inputRawAmount !== null && currentBalanceRaw !== null && inputRawAmount > currentBalanceRaw;
  const missingSolAmount = insufficientSol && inputRawAmount !== null && currentBalanceRaw !== null
    ? formatAtomicAmount(inputRawAmount - currentBalanceRaw, fromToken.decimals)
    : null;
  const activeQuoteLoading = quoteLoading || (
    Boolean(fromAmount.trim()) && Number(fromAmount) > 0 &&
    activeRoute === "jupiter" && !currentJupiterQuote && jupiterErrorKey !== currentQuoteKey
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tokens/prices?mints=${WSOL_MINT}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Prix SOL indisponible");
        return response.json() as Promise<{ prices?: Record<string, { usd?: number }> }>;
      })
      .then((payload) => {
        const price = payload.prices?.[WSOL_MINT]?.usd;
        if (!cancelled) setSolUsdPrice(typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null);
      })
      .catch(() => { if (!cancelled) setSolUsdPrice(null); });
    return () => { cancelled = true; };
  }, []);
      useEffect(() => {
    if (!selectedSide || !selectedToken?.mint) {
      return;
    }

    const token: Token = {
      symbol: selectedToken.symbol,
      name: selectedToken.name,
      mint: selectedToken.mint,
      decimals: selectedToken.decimals,
    };

    if (selectedSide === "from") {
      setFromToken(token);
      if (token.mint === toToken.mint) {
        setToToken(fromToken);
      }
    }

    if (selectedSide === "to") {
      setToToken(token);
      if (token.mint === fromToken.mint) {
        setFromToken(toToken);
      }
    }

    setSelectedSide(null);
  }, [
    selectedToken,
    selectedSide,
    setSelectedSide,
    fromToken,
    toToken,
  ]);

  const getTokenBalance = async (
    token: Token
  ): Promise<{ display: string; exact: string | null }> => {
    if (!publicKey) {
      return { display: "0.0000", exact: null };
    }

    try {
      if (token.mint === WSOL_MINT) {
        const lamports = await connection.getBalance(publicKey, "confirmed");
        return {
          display: (lamports / 1_000_000_000).toFixed(4),
          exact: formatAtomicAmount(BigInt(lamports), 9),
        };
      }

      const mint = new PublicKey(token.mint);

      const tokenAccount = getAssociatedTokenAddressSync(
        mint,
        publicKey
      );

      const accountInfo =
        await connection.getTokenAccountBalance(tokenAccount, "confirmed");

      return {
        display: Number(accountInfo.value.uiAmount ?? 0).toFixed(4),
        exact: formatAtomicAmount(BigInt(accountInfo.value.amount), accountInfo.value.decimals),
      };
    } catch (error) {
      console.error(
        `Erreur lecture balance ${token.symbol} :`,
        error
      );

      return { display: "0.0000", exact: null };
    }
  };

  const refreshBalances = async () => {
    if (!publicKey || !connected) {
      setFromBalance("0.0000");
      setToBalance("0.0000");
      setFromBalanceSnapshot(null);
      return;
    }

    try {
      const [
        nextFromBalance,
        nextToBalance,
      ] = await Promise.all([
        getTokenBalance(fromToken),
        getTokenBalance(toToken),
      ]);

      setFromBalance(nextFromBalance.display);
      setToBalance(nextToBalance.display);
      if (publicKey) setFromBalanceSnapshot({ key: `${publicKey.toBase58()}:${fromToken.mint}`, exact: nextFromBalance.exact });
    } catch (error) {
      console.error(
        "Erreur actualisation des balances :",
        error
      );
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadBalances = async () => {
      if (!publicKey || !connected) {
        setFromBalance("0.0000");
        setToBalance("0.0000");
        setFromBalanceSnapshot(null);
        setBalanceLoading(false);
        return;
      }

      setBalanceLoading(true);
      try {
        const [nextFromBalance, nextToBalance] = await Promise.all([
          getTokenBalance(fromToken),
          getTokenBalance(toToken),
        ]);
        if (cancelled) return;
        setFromBalance(nextFromBalance.display);
        setToBalance(nextToBalance.display);
        setFromBalanceSnapshot({ key: `${publicKey.toBase58()}:${fromToken.mint}`, exact: nextFromBalance.exact });
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    };

    loadBalances();

    return () => {
      cancelled = true;
    };
  }, [
    publicKey,
    connected,
    fromToken,
    toToken,
    connection,
  ]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const requestKey = JSON.stringify([
      fromAmount,
      fromToken.mint,
      toToken.mint,
      slippageBps,
    ]);

    const loadQuote = () => {
      setJupiterQuoteSnapshot(null);
      setZingQuoteSnapshot(null);
      setJupiterError("");
      setJupiterErrorKey("");
      setQuoteLoading(false);

      if (
        !fromAmount.trim() ||
        Number(fromAmount) <= 0
      ) {
        return;
      }

      setQuoteLoading(true);
      const params = {
          amount: fromAmount,
          fromMint: new PublicKey(fromToken.mint),
          toMint: new PublicKey(toToken.mint),
          inputDecimals: fromToken.decimals,
          outputDecimals: toToken.decimals,
          slippageBps,
      };

      const timer = window.setTimeout(() => {
        const requestedAt = Date.now();
        let zingFailed = false;
        let jupiterFailed = false;
        let latestZingQuote: Awaited<ReturnType<typeof getQuote>> | null = null;
        let latestJupiterQuote: JupiterQuoteResult | null = null;

        getQuote(params).then((quote) => {
          if (cancelled) return;
          latestZingQuote = quote;
          setZingQuoteSnapshot({ requestKey, requestedAt, receivedAt: Date.now(), quote });
          if (selectedRouteRef.current === "zing" || jupiterFailed) {
            if (jupiterFailed) updateSelectedRoute("zing");
            setQuoteLoading(false);
          }
        }).catch((error: unknown) => {
          if (cancelled) return;
          zingFailed = true;
          if (latestJupiterQuote) {
            updateSelectedRoute("jupiter");
            setQuoteLoading(false);
          } else if (selectedRouteRef.current === "zing") {
            setQuoteLoading(true);
          }
          console.warn("Échec de la cotation ZingSwap :", error);
        });

        getJupiterQuote({ ...params, signal: controller.signal }).then((quote) => {
          if (cancelled) return;
          latestJupiterQuote = quote;
          setJupiterQuoteSnapshot({ requestKey, requestedAt, receivedAt: Date.now(), quote });
          if (zingFailed) {
            updateSelectedRoute("jupiter");
            setQuoteLoading(false);
          } else if (selectedRouteRef.current === "jupiter" || !latestZingQuote) {
            updateSelectedRoute("jupiter");
            setQuoteLoading(false);
          }
        }).catch((reason: unknown) => {
          if (cancelled || controller.signal.aborted) return;
          jupiterFailed = true;
          const fallbackMessage = reason instanceof Error
            ? reason.message
            : "Aucune route externe disponible pour cette paire.";
          setJupiterErrorKey(requestKey);
          setJupiterError(`${fallbackMessage} ${zingFailed
            ? "Aucune cotation disponible pour cette paire."
            : "Swap externe indisponible ; aucun swap ne peut être exécuté."}`);
          if (selectedRouteRef.current === "jupiter" && latestZingQuote) {
            updateSelectedRoute("zing");
            setQuoteLoading(false);
          } else if (selectedRouteRef.current === "jupiter" && !zingFailed) {
            setQuoteLoading(true);
          }
          if (zingFailed) setQuoteLoading(false);
        });
      }, 250);

      return () => {
        window.clearTimeout(timer);
      };
    };

    const clearTimer = loadQuote();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimer?.();
    };
  }, [
    fromAmount,
    fromToken,
    toToken,
    getQuote,
    getJupiterQuote,
    slippageBps,
  ]);

  const reserveIn = currentZingQuote
    ? Number(BigInt(currentZingQuote.reserveInRaw)) / 10 ** currentZingQuote.inputDecimals
    : null;
  const reserveOut = currentZingQuote
    ? Number(BigInt(currentZingQuote.reserveOutRaw)) / 10 ** currentZingQuote.outputDecimals
    : null;
  const spotOutputPerInput = reserveIn && reserveOut ? reserveOut / reserveIn : null;
  const spotZtcPerSol = currentZingQuote && isZtcSolPair
    ? fromToken.mint === WSOL_MINT
      ? spotOutputPerInput
      : spotOutputPerInput && spotOutputPerInput > 0 ? 1 / spotOutputPerInput : null
    : null;
  const spotZtcUsd = spotZtcPerSol && solUsdPrice ? solUsdPrice / spotZtcPerSol : null;
  const inputAmountNumber = Number(fromAmount);
  const inputSolEquivalent = isZtcSolPair && Number.isFinite(inputAmountNumber) && inputAmountNumber > 0
    ? fromToken.mint === WSOL_MINT
      ? inputAmountNumber
      : spotZtcPerSol ? inputAmountNumber / spotZtcPerSol : null
    : null;
  const wsolReserve = currentZingQuote && isZtcSolPair
    ? fromToken.mint === WSOL_MINT
      ? reserveIn
      : reserveOut
    : null;
  const wsolReserveShare = inputSolEquivalent && wsolReserve ? inputSolEquivalent / wsolReserve : null;
  const zingFeeAmount = currentZingQuote
    ? Number(BigInt(currentZingQuote.feeRaw)) / 10 ** currentZingQuote.inputDecimals
    : null;
  const zingEstimatedOutput = currentZingQuote
    ? Number(BigInt(currentZingQuote.amountOutRaw)) / 10 ** currentZingQuote.outputDecimals
    : null;
  const zingPriceImpact = currentZingQuote && spotOutputPerInput && zingFeeAmount != null && Number(fromAmount) > zingFeeAmount
    ? Math.max(0, (1 - (zingEstimatedOutput ?? 0) / ((Number(fromAmount) - zingFeeAmount) * spotOutputPerInput)) * 100)
    : null;
  const quotesComparable = Boolean(
    currentZingQuote && currentJupiterQuote &&
    zingQuoteSnapshot?.requestKey === currentQuoteKey &&
    jupiterQuoteSnapshot?.requestKey === currentQuoteKey &&
    zingQuoteSnapshot?.requestKey === jupiterQuoteSnapshot?.requestKey &&
    zingQuoteSnapshot?.requestedAt === jupiterQuoteSnapshot?.requestedAt &&
    currentZingQuote.amountInRaw === currentJupiterQuote.amountInRaw &&
    currentZingQuote.inputDecimals === currentJupiterQuote.inputDecimals &&
    currentZingQuote.outputDecimals === currentJupiterQuote.outputDecimals &&
    currentZingQuote.inputMint === currentJupiterQuote.inputMint &&
    currentZingQuote.outputMint === currentJupiterQuote.outputMint &&
    currentZingQuote.inputMint === fromToken.mint &&
    currentZingQuote.outputMint === toToken.mint &&
    currentJupiterQuote.inputMint === fromToken.mint &&
    currentJupiterQuote.outputMint === toToken.mint,
  );

  const handleSwap = async () => {
    setMessage("");

    if (!connected) {
      setVisible(true);
      return;
    }

    if (isZtcSolPair && !validJupiterQuote) {
      setMessage("Swap externe indisponible pour cette paire : aucune cotation Jupiter valide. Le swap est désactivé.");
      return;
    }

    if (!fromAmount.trim()) {
      setMessage("Entre un montant à échanger.");
      return;
    }

    if (balanceUnavailable) {
      setMessage("Solde SOL indisponible ou en cours de vérification. Le swap reste bloqué.");
      return;
    }

    if (insufficientSol && missingSolAmount) {
      setMessage(`Solde SOL insuffisant : il manque ${missingSolAmount} SOL.`);
      return;
    }

    setLoading(true);

    try {
      if (activeRoute === "jupiter") {
        const result = await swapOnJupiter({
          amount: fromAmount,
          fromMint: new PublicKey(fromToken.mint),
          toMint: new PublicKey(toToken.mint),
          slippageBps,
        });

        setMessage(`Swap confirmé via la route externe : ${result.signature}`);
        setFromAmount("");
        await refreshBalances();
        return;
      }

      // Nouveau quote juste avant l'exécution du swap
      const quote = await getQuote({
        amount: fromAmount,
        fromMint: new PublicKey(fromToken.mint),
        toMint: new PublicKey(toToken.mint),
        slippageBps,
      });

      const result = await swap({
        amount: fromAmount,
        fromMint: new PublicKey(fromToken.mint),
        toMint: new PublicKey(toToken.mint),
        minAmountOutRaw: quote.minAmountOutRaw,
      });

      console.log(
        "Swap exécuté :",
        result.signature
      );

      setMessage(`Swap ZingSwap confirmé : ${result.signature}`);

      setFromAmount("");

      await refreshBalances();
    } catch (error) {
      console.error("Erreur swap :", error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : "Erreur inconnue pendant le swap.";

      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-w-0">
      <h2 className="text-lg md:text-xl font-bold text-white">
        Swap
      </h2>

      <div className="mt-3 space-y-2">

        {/* FROM */}
        <div className="rounded-xl bg-zinc-900 p-3">
          <p className="text-zinc-400">
            From
          </p>

          <div className="mt-2">
            <TokenButton
              token={fromToken}
              onClick={() => {
                router.push("/tokens?side=from");
              }}
            />
          </div>

          <div className="mt-2 flex min-w-0 justify-between">
            <input
              type="number"
              min="0"
              step="any"
              value={fromAmount}
              onChange={(event) => {
                setFromAmount(event.target.value);
                setMessage("");
              }}
              placeholder="0.0"
              disabled={loading}
              className="
                w-full
                bg-transparent
                text-right
                text-lg md:text-xl
                text-white
                outline-none
                disabled:opacity-50
              "
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
            <span>
              Balance : {fromBalance}{" "}
              {fromToken.symbol}
            </span>

            <button
              type="button"
              onClick={() => {
                setFromAmount(fromBalance);
                setMessage("");
              }}
              disabled={
                loading ||
                !connected ||
                Number(fromBalance) <= 0
              }
              className="
                font-semibold
                text-cyan-400
                transition
                hover:text-cyan-300
                disabled:cursor-not-allowed
                disabled:opacity-40
              "
            >
              MAX
            </button>
          </div>
          {balanceCheckApplies && balanceUnavailable && (
            <p role="status" className="mt-2 text-xs text-amber-300">
              {balanceLoading ? "Vérification du solde SOL…" : "Solde SOL indisponible ; le swap est bloqué."}
            </p>
          )}
          {insufficientSol && missingSolAmount && (
            <p role="alert" className="mt-2 text-xs text-amber-300">
              Solde SOL insuffisant : il manque {missingSolAmount} SOL. Le swap est bloqué.
            </p>
          )}
        </div>

        {/* SWITCH */}
        <div className="-my-1 relative z-10 flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              const oldFrom = fromToken;

              setFromToken(toToken);
              setToToken(oldFrom);
              setFromAmount("");
              setMessage("");
            }}
            className="
              rounded-full
              bg-zinc-800
              p-1.5 md:p-2
              text-white
              transition
              hover:bg-cyan-500
              hover:text-black
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            ⇅
          </button>
        </div>

        {/* TO */}
        <div className="rounded-xl bg-zinc-900 p-3">
          <p className="text-zinc-400">
            To
          </p>

          <div className="mt-2">
            <TokenButton
              token={toToken}
              onClick={() => {
                router.push("/tokens?side=to");
              }}
            />
          </div>

          <div className="mt-2 flex min-w-0 justify-between">
            <input
              type="text"
              value={
                activeQuoteLoading
                  ? "..."
                  : activeRoute === "jupiter"
                    ? isZtcSolPair
                      ? validJupiterQuote?.amountOut || (fromAmount.trim() ? "Route externe indisponible" : "0.0")
                      : currentJupiterQuote?.amountOut || "0.0"
                    : currentZingQuote?.amountOut || "0.0"
              }
              readOnly
              className="
                w-full
                bg-transparent
                text-right
                text-lg md:text-xl
                text-zinc-500
                outline-none
              "
            />
          </div>

          <p className="mt-2 text-xs text-zinc-500">
            Balance : {toBalance}{" "}
            {toToken.symbol}
          </p>
          {quoteMatchesInput && (activeRoute === "jupiter" ? currentJupiterQuote : currentZingQuote) && !quoteLoading && (
            <p className="mt-1 text-right text-[11px] text-zinc-500">
              {activeRoute === "jupiter"
                ? "Estimation externe · ordre actualisé avant signature"
                : currentZingQuote != null
                  ? "Estimation du pool ZingSwap"
                  : "Estimation externe indicative · aucun pool ZingSwap disponible"}
            </p>
          )}
        </div>

        {/* ROUTE */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Route du swap">
          <button
            type="button"
            role="radio"
            aria-checked={activeRoute === "zing"}
            disabled={loading || isZtcSolPair || (Boolean(fromAmount.trim()) && !currentZingQuote)}
            onClick={() => updateSelectedRoute("zing")}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              activeRoute === "zing"
                ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            Pool ZingSwap
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={activeRoute === "jupiter"}
            disabled={loading || !(isZtcSolPair ? validJupiterQuote : currentJupiterQuote)}
            onClick={() => updateSelectedRoute("jupiter")}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              activeRoute === "jupiter"
                ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            Route externe
          </button>
        </div>

        {/* DETAILS */}
        <div className="space-y-1.5 rounded-xl bg-zinc-900 p-3 text-xs">

          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-zinc-400">
            <span>Slippage</span>
            <span>0.50%</span>
          </div>

          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-zinc-400">
            <span>Impact de prix · {activeRoute === "jupiter" ? "route externe" : "pool ZingSwap"}</span>
            <span>
              {activeRoute === "jupiter"
                ? currentJupiterQuote?.priceImpact != null ? `${currentJupiterQuote.priceImpact.toFixed(3)}%` : "--"
                : zingPriceImpact != null ? `${zingPriceImpact.toFixed(3)}% · hors frais de swap` : "--"}
            </span>
          </div>

          {isZtcSolPair && currentZingQuote && (
            <>
              <div className="mt-2 border-t border-zinc-800 pt-2">
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-zinc-300">
                  <span>Prix spot indicatif du pool ZTC/SOL</span>
                  <span>{spotZtcPerSol ? `1 SOL ≈ ${formatAmount(spotZtcPerSol)} ZTC` : "prix indisponible"}</span>
                </div>
                <p className="mt-1 text-right text-[11px] text-zinc-500">Propre au pool ZingSwap · indicatif, pas un prix de marché universel</p>
                <div className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-1 text-zinc-400">
                  <span>Prix USD indicatif ZTC · pool ZingSwap</span>
                  <span>{spotZtcUsd ? `$${formatAmount(spotZtcUsd)}` : "prix indisponible"}</span>
                </div>
                <p className="mt-1 text-right text-[11px] text-zinc-500">Calcul : prix SOL/USD de DexScreener ÷ ZTC par SOL · paire retenue par l’API avec liquidité affichée ≥ 50 000 $</p>
              </div>

              {activeRoute === "zing" && (
                <>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-cyan-300">
                    <span>Sortie estimée sélectionnée · pool ZingSwap</span>
                    <span>{currentZingQuote ? `${currentZingQuote.amountOut} ${toToken.symbol}` : "indisponible"}</span>
                  </div>
                  <p className="text-right text-[11px] text-zinc-500">Le pool est recoté au lancement du swap ; l’exécution applique le montant minimum selon le slippage.</p>
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-zinc-400">
                    <span>Frais du pool ZingSwap</span>
                    <span>{zingFeeAmount != null && currentZingQuote ? `${formatAmount(zingFeeAmount)} ${fromToken.symbol} · ${(currentZingQuote.feeBps / 100).toFixed(2)}%` : "indisponibles"}</span>
                  </div>
                </>
              )}

              {wsolReserveShare != null && Number.isFinite(wsolReserveShare) && (
                <p className={`rounded-lg px-2 py-1.5 ${wsolReserveShare >= 1 ? "bg-amber-500/10 text-amber-300" : "text-zinc-500"}`}>
                  Saisie équivalente à {formatAmount(wsolReserveShare * 100)}% de la réserve WSOL du pool.
                  {wsolReserveShare >= 1 ? " Avertissement : le montant atteint ou dépasse toute la réserve WSOL." : ""}
                </p>
              )}
            </>
          )}

          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-zinc-400">
            <span>Coût réseau estimé</span>
            <span>
              {currentJupiterQuote?.signatureFeeLamports != null ||
              currentJupiterQuote?.prioritizationFeeLamports != null ||
              currentJupiterQuote?.rentFeeLamports != null
                ? `${(((currentJupiterQuote.signatureFeeLamports ?? 0) +
                    (currentJupiterQuote.prioritizationFeeLamports ?? 0)) /
                    1_000_000_000).toFixed(6)} SOL${currentJupiterQuote.rentFeeLamports != null ? ` · loyer ${ (currentJupiterQuote.rentFeeLamports / 1_000_000_000).toFixed(6)} SOL` : ""}`
                : "Indisponibles"}
            </span>
          </div>

          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-zinc-400">
            <span>Route</span>
            <span className="text-right">
              {currentJupiterQuote
                ? currentJupiterQuote.route.length > 0
                  ? currentJupiterQuote.route.map(() => "Route externe").join(" → ")
                  : "Route externe"
                : "Indisponible"}
            </span>
          </div>

          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-zinc-400">
            <span>Frais de swap</span>
            <span>
              {currentJupiterQuote?.feeBps != null
                ? `${(currentJupiterQuote.feeBps / 100).toFixed(2)}%${
                    currentJupiterQuote.feeMint
                      ? ` (${currentJupiterQuote.feeMint === fromToken.mint ? fromToken.symbol : currentJupiterQuote.feeMint === toToken.mint ? toToken.symbol : `${currentJupiterQuote.feeMint.slice(0, 4)}…`})`
                      : ""
                  }${currentJupiterQuote.feeAmount ? ` · montant associé ${currentJupiterQuote.feeAmount} ${currentJupiterQuote.feeMint === fromToken.mint ? fromToken.symbol : currentJupiterQuote.feeMint === toToken.mint ? toToken.symbol : "unités min."}` : ""}`
                : "Non disponibles"}
            </span>
          </div>

          {activeRoute === "jupiter" && <div className="flex justify-between text-zinc-400">
            <span>Frais des pools</span>
            <span>Non fournis séparément</span>
          </div>}

          {currentZingQuote && activeRoute === "jupiter" && (
            <div className="flex justify-between text-zinc-400">
              <span>Cotation ZingSwap · comparaison uniquement</span>
              <span>{currentZingQuote.amountOut} {toToken.symbol}</span>
            </div>
          )}

          {currentJupiterQuote && (
            <div className={`flex justify-between ${activeRoute === "jupiter" ? "text-cyan-300" : "text-zinc-400"}`}>
              <span>{activeRoute === "jupiter" ? "Sortie estimée sélectionnée · route externe" : "Cotation externe · comparaison uniquement, non exécutée"}</span>
              <span>{currentJupiterQuote.amountOut} {toToken.symbol}</span>
            </div>
          )}

          {activeRoute === "zing" && currentZingQuote && currentJupiterQuote && (
            <div className="text-right text-[11px] text-zinc-500">
              <p>
                {quotesComparable
                  ? `Mêmes mints, décimales et montant brut (${currentZingQuote.amountInRaw} unités d’entrée) ; l’écart est entre les cotations reçues, pas une conversion d’affichage.`
                  : "Montants bruts ou décimales différents : ces cotations ne sont pas directement comparables."}
              </p>
              {quotesComparable && zingQuoteSnapshot && jupiterQuoteSnapshot && (
                <>
                  <p className="mt-1">Demandes à {formatQuoteTime(zingQuoteSnapshot.requestedAt)} ; réponses reçues à {formatQuoteTime(zingQuoteSnapshot.receivedAt)} (ZingSwap) et {formatQuoteTime(jupiterQuoteSnapshot.receivedAt)} (route externe).</p>
                  <details className="mt-1 text-left">
                    <summary className="cursor-pointer">Montants bruts et décimales</summary>
                    <p className="mt-1 break-all">Entrée {currentZingQuote.amountInRaw} ({currentZingQuote.inputDecimals} déc.) · sortie ZingSwap {currentZingQuote.amountOutRaw} ({currentZingQuote.outputDecimals} déc.) · sortie externe {currentJupiterQuote.amountOutRaw} ({currentJupiterQuote.outputDecimals} déc.)</p>
                    <p className="break-all">Mint entrée {currentZingQuote.inputMint} · mint sortie {currentZingQuote.outputMint}</p>
                  </details>
                </>
              )}
            </div>
          )}

          {activeRoute === "zing" && !isZtcSolPair && <div className="flex justify-between font-semibold text-cyan-400">
            <span>Frais ZingSwap</span>
            <span>{currentZingQuote ? `${(currentZingQuote.feeBps / 100).toFixed(2)}%` : "Pool indisponible"}</span>
          </div>}

        </div>

        {((jupiterError && jupiterErrorKey === currentQuoteKey) || currentJupiterQuote || (isZtcSolPair && Boolean(fromAmount.trim()) && !activeQuoteLoading && !validJupiterQuote)) && (
          <p className="text-xs text-zinc-500">
            {jupiterErrorKey === currentQuoteKey && jupiterError
              ? jupiterError
              : isZtcSolPair && currentJupiterQuote && !validJupiterQuote
                ? "Réponse externe écartée : montant, mints ou décimales différents de la saisie actuelle."
              : isZtcSolPair && !validJupiterQuote
                ? "Swap externe indisponible : aucune cotation Jupiter valide. L’action est désactivée."
                : activeRoute === "jupiter"
                ? "La transaction via la route externe sera demandée puis signée par le portefeuille connecté avant son exécution."
                : "Cotation externe indicative. Le swap sélectionné sera exécuté par le pool ZingSwap."}
          </p>
        )}

        {/* MESSAGE */}
        {message && (
          <div className="break-all rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
            {message}
          </div>
        )}

        {/* ACTION */}
        <button
          type="button"
          onClick={handleSwap}
          disabled={
            loading ||
            activeQuoteLoading ||
            balanceUnavailable ||
            insufficientSol ||
            (Boolean(fromAmount.trim()) && (isZtcSolPair
              ? !validJupiterQuote
              : activeRoute === "zing" ? !currentZingQuote : !currentJupiterQuote))
          }
          className="
            w-full
            rounded-xl
            bg-cyan-500
            py-3
            font-bold
            text-black
            transition
            hover:bg-cyan-400
            disabled:cursor-not-allowed
            disabled:opacity-50
          "
        >
          {loading
            ? "Swap en cours..."
            : insufficientSol
              ? "Solde SOL insuffisant"
              : balanceUnavailable
                ? "Vérification du solde SOL…"
            : !connected
              ? "Connect Wallet"
              : fromAmount.trim() && !activeQuoteLoading &&
                (isZtcSolPair ? !validJupiterQuote : activeRoute === "zing" ? !currentZingQuote : !currentJupiterQuote)
                ? isZtcSolPair ? "Swap externe indisponible" : activeRoute === "zing"
                  ? "Pool ZingSwap indisponible"
                  : "Route externe indisponible"
                : activeRoute === "jupiter"
                  ? "Swap via route externe"
                  : "Swap via ZingSwap"}
        </button>

      </div>
    </div>
  );
}
