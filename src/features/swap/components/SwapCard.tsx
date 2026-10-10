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

export default function SwapCard() {
  const router = useRouter();

  const [fromToken, setFromToken] = useState<Token>(TOKENS[0]);
  const [toToken, setToToken] = useState<Token>(TOKENS[1]);

  const [fromAmount, setFromAmount] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<"zing" | "jupiter">("zing");
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
  const [toAmount, setToAmount] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [jupiterQuote, setJupiterQuote] = useState<JupiterQuoteResult | null>(null);
  const [jupiterError, setJupiterError] = useState("");
  const [jupiterErrorKey, setJupiterErrorKey] = useState("");
  const [zingFeeBps, setZingFeeBps] = useState<number | null>(null);
  const [quoteKey, setQuoteKey] = useState("");
  const currentQuoteKey = JSON.stringify([
    fromAmount,
    fromToken.mint,
    toToken.mint,
    slippageBps,
  ]);
  const quoteMatchesInput = quoteKey === currentQuoteKey;
  const currentJupiterQuote = quoteMatchesInput ? jupiterQuote : null;
  const activeQuoteLoading = quoteLoading || (
    Boolean(fromAmount.trim()) && Number(fromAmount) > 0 &&
    selectedRoute === "jupiter" && !currentJupiterQuote
  );
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
  ): Promise<string> => {
    if (!publicKey) {
      return "0.0000";
    }

    try {
      if (token.symbol === "SOL") {
        const lamports = await connection.getBalance(publicKey);

        return (lamports / 1_000_000_000).toFixed(4);
      }

      const mint = new PublicKey(token.mint);

      const tokenAccount = getAssociatedTokenAddressSync(
        mint,
        publicKey
      );

      const accountInfo =
        await connection.getTokenAccountBalance(tokenAccount);

      return Number(
        accountInfo.value.uiAmount ?? 0
      ).toFixed(4);
    } catch (error) {
      console.error(
        `Erreur lecture balance ${token.symbol} :`,
        error
      );

      return "0.0000";
    }
  };

  const refreshBalances = async () => {
    if (!publicKey || !connected) {
      setFromBalance("0.0000");
      setToBalance("0.0000");
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

      setFromBalance(nextFromBalance);
      setToBalance(nextToBalance);
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
        return;
      }

      const [
        nextFromBalance,
        nextToBalance,
      ] = await Promise.all([
        getTokenBalance(fromToken),
        getTokenBalance(toToken),
      ]);

      if (cancelled) {
        return;
      }

      setFromBalance(nextFromBalance);
      setToBalance(nextToBalance);
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
      setToAmount("");
      setJupiterQuote(null);
      setJupiterError("");
      setJupiterErrorKey("");
      setZingFeeBps(null);
      setQuoteKey("");
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
          slippageBps,
      };

      const timer = window.setTimeout(() => {
        let zingFailed = false;
        let jupiterFailed = false;
        let latestZingQuote: Awaited<ReturnType<typeof getQuote>> | null = null;
        let latestJupiterQuote: JupiterQuoteResult | null = null;

        getQuote(params).then((quote) => {
          if (cancelled) return;
          latestZingQuote = quote;
          setToAmount(quote.amountOut);
          setZingFeeBps(quote.feeBps);
          setQuoteKey(requestKey);
          if (selectedRouteRef.current === "zing" || jupiterFailed) {
            if (jupiterFailed) updateSelectedRoute("zing");
            setQuoteLoading(false);
          }
        }).catch((error: unknown) => {
          if (cancelled) return;
          zingFailed = true;
          if (latestJupiterQuote) {
            updateSelectedRoute("jupiter");
            setToAmount(latestJupiterQuote.amountOut);
            setQuoteLoading(false);
          } else if (selectedRouteRef.current === "zing") {
            setQuoteLoading(true);
          }
          console.warn("Échec de la cotation ZingSwap :", error);
        });

        getJupiterQuote({ ...params, signal: controller.signal }).then((quote) => {
          if (cancelled) return;
          latestJupiterQuote = quote;
          setJupiterQuote(quote);
          setQuoteKey(requestKey);
          if (zingFailed) {
            updateSelectedRoute("jupiter");
            setToAmount(quote.amountOut);
            setQuoteLoading(false);
          } else if (selectedRouteRef.current === "jupiter") {
            setToAmount(quote.amountOut);
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
            : "Estimation du pool ZingSwap affichée si disponible."}`);
          if (selectedRouteRef.current === "jupiter" && latestZingQuote) {
            updateSelectedRoute("zing");
            setToAmount(latestZingQuote.amountOut);
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

  const handleSwap = async () => {
    setMessage("");

    if (!connected) {
      setVisible(true);
      return;
    }

    if (!fromAmount.trim()) {
      setMessage("Entre un montant à échanger.");
      return;
    }

    setLoading(true);

    try {
      if (selectedRoute === "jupiter") {
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
    <div>
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

          <div className="mt-2 flex justify-between">
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

          <div className="mt-2 flex justify-between">
            <input
              type="text"
              value={
                (activeQuoteLoading || (!quoteMatchesInput && Boolean(fromAmount.trim())))
                  ? "..."
                  : selectedRoute === "jupiter"
                    ? currentJupiterQuote?.amountOut || "0.0"
                    : toAmount || "0.0"
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
          {quoteMatchesInput && toAmount && !quoteLoading && (
            <p className="mt-1 text-right text-[11px] text-zinc-500">
              {selectedRoute === "jupiter"
                ? "Estimation externe · ordre actualisé avant signature"
                : zingFeeBps != null
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
            aria-checked={selectedRoute === "zing"}
            disabled={loading || (Boolean(fromAmount.trim()) && zingFeeBps === null)}
            onClick={() => updateSelectedRoute("zing")}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              selectedRoute === "zing"
                ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            Pool ZingSwap
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={selectedRoute === "jupiter"}
            disabled={loading || !currentJupiterQuote}
            onClick={() => updateSelectedRoute("jupiter")}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              selectedRoute === "jupiter"
                ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            Route externe
          </button>
        </div>

        {/* DETAILS */}
        <div className="space-y-1.5 rounded-xl bg-zinc-900 p-3 text-xs">

          <div className="flex justify-between text-zinc-400">
            <span>Slippage</span>
            <span>0.50%</span>
          </div>

          <div className="flex justify-between text-zinc-400">
            <span>Price Impact</span>
            <span>
              {currentJupiterQuote?.priceImpact != null
                ? `${currentJupiterQuote.priceImpact.toFixed(3)}%`
                : "--"}
            </span>
          </div>

          <div className="flex justify-between text-zinc-400">
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

          <div className="flex justify-between gap-3 text-zinc-400">
            <span>Route</span>
            <span className="text-right">
              {currentJupiterQuote
                ? currentJupiterQuote.route.length > 0
                  ? currentJupiterQuote.route.map(() => "Route externe").join(" → ")
                  : "Route externe"
                : "Indisponible"}
            </span>
          </div>

          <div className="flex justify-between text-zinc-400">
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

          <div className="flex justify-between text-zinc-400">
            <span>Frais des pools</span>
            <span>Non fournis séparément</span>
          </div>

          {currentJupiterQuote && (
            <div className="flex justify-between text-cyan-300">
              <span>Estimation route externe</span>
              <span>{currentJupiterQuote.amountOut} {toToken.symbol}</span>
            </div>
          )}

          <div className="flex justify-between font-semibold text-cyan-400">
            <span>Frais ZingSwap</span>
            <span>
              {zingFeeBps != null
                ? `${(zingFeeBps / 100).toFixed(2)}%`
                : "Pool indisponible"}
            </span>
          </div>

        </div>

        {((jupiterError && jupiterErrorKey === currentQuoteKey) || currentJupiterQuote) && (
          <p className="text-xs text-zinc-500">
            {jupiterError ||
              (selectedRoute === "jupiter"
                ? "La transaction via la route externe sera demandée puis signée par le portefeuille connecté avant son exécution."
                : "Cotation externe indicative. Le swap sélectionné sera exécuté par le pool ZingSwap.")}
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
            (connected && Boolean(fromAmount.trim()) &&
              (selectedRoute === "zing" ? !quoteMatchesInput || zingFeeBps === null : !currentJupiterQuote))
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
            : !connected
              ? "Connect Wallet"
              : fromAmount.trim() && !activeQuoteLoading &&
                (selectedRoute === "zing" ? (!quoteMatchesInput || zingFeeBps === null) : !currentJupiterQuote)
                ? selectedRoute === "zing"
                  ? "Pool ZingSwap indisponible"
                  : "Route externe indisponible"
                : selectedRoute === "jupiter"
                  ? "Swap via route externe"
                  : "Swap via ZingSwap"}
        </button>

      </div>
    </div>
  );
}
