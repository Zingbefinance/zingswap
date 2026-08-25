"use client";
import { useSelectedToken } from "@/components/providers/TokenContext";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

import TokenButton from "./TokenButton";
import TokenSelector from "./TokenSelector";

import { TOKENS } from "../../../../lib/tokens/tokens";
import { Token } from "../../../../lib/tokens/types";
import { useSwap } from "../hooks/useSwap";

export default function SwapCard() {
  const [fromToken, setFromToken] = useState<Token>(TOKENS[0]);
  const [toToken, setToToken] = useState<Token>(TOKENS[1]);

  const [fromAmount, setFromAmount] = useState("");
  const [selecting, setSelecting] = useState<"from" | "to" | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const { connected, connect, publicKey } = useWallet();
  
  const { setSelectedToken } = useSelectedToken();
  const { setVisible } = useWalletModal();
const { connection } = useConnection();
const { swap, getQuote } = useSwap();
const [fromBalance, setFromBalance] = useState("0.0000");
const [toBalance, setToBalance] = useState("0.0000");
const [toAmount, setToAmount] = useState("");
const [quoteLoading, setQuoteLoading] = useState(false);
const getTokenBalance = async (token: Token): Promise<string> => {
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

    return Number(accountInfo.value.uiAmount ?? 0).toFixed(4);
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
    const [nextFromBalance, nextToBalance] =
      await Promise.all([
        getTokenBalance(fromToken),
        getTokenBalance(toToken),
      ]);

    setFromBalance(nextFromBalance);
    setToBalance(nextToBalance);
  } catch (error) {
    console.error("Erreur actualisation des balances :", error);
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

    const [nextFromBalance, nextToBalance] =
      await Promise.all([
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

  const loadQuote = async () => {
    setToAmount("");

    if (
  !fromAmount.trim() ||
  Number(fromAmount) <= 0
) {
  return;
}

    if (!connected) {
      return;
    }

    try {
      setQuoteLoading(true);

      const quote = await getQuote({
        amount: fromAmount,
        fromMint: new PublicKey(fromToken.mint),
        toMint: new PublicKey(toToken.mint),
      });

      if (cancelled) {
        return;
      }

      setToAmount(quote.amountOut);
    } catch (error) {
      if (cancelled) {
        return;
      }

      console.error("Erreur quote :", error);
      setToAmount("");
    } finally {
      if (!cancelled) {
        setQuoteLoading(false);
      }
    }
  };

  loadQuote();

  return () => {
    cancelled = true;
  };
}, [
  fromAmount,
  fromToken,
  toToken,
  connected,
  getQuote,
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
    // Nouveau quote juste avant l'exécution du swap
    const quote = await getQuote({
      amount: fromAmount,
      fromMint: new PublicKey(fromToken.mint),
      toMint: new PublicKey(toToken.mint),
    });

    // Slippage : 0,50 %
    const slippageBps = 50;

    const quoteAmountOutRaw = BigInt(
      quote.amountOutRaw
    );

    // Montant minimum accepté après slippage
    const minAmountOutRaw =
      (quoteAmountOutRaw *
        BigInt(10_000 - slippageBps)) /
      BigInt(10_000);

    const result = await swap({
      amount: fromAmount,
      fromMint: new PublicKey(fromToken.mint),
      toMint: new PublicKey(toToken.mint),
      minAmountOutRaw: minAmountOutRaw.toString(),
    });

    console.log("Swap exécuté :", result.signature);

    setMessage(
      `Swap confirmé : ${result.signature}`
    );

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
    <h2 className="text-xl md:text-2xl font-bold text-white">  
        Swap
      </h2>

      <div className="mt-6 md:mt-8 space-y-4 md:space-y-5">

        {/* FROM */}
        <div className="rounded-xl bg-zinc-900 p-4 md:p-5">

          <p className="text-zinc-400">
            From
          </p>

          <div className="mt-4">

            <TokenButton
              token={fromToken}
              onClick={() => setSelecting("from")}
            />

            {selecting === "from" && (
              <div className="mt-3">
                <TokenSelector
                  tokens={TOKENS}
                  onSelect={(token) => {
                    if (token.symbol === toToken.symbol) {
                      setFromToken(token);

setSelectedToken({
  symbol: token.symbol,
  name: token.name,
  mint: token.mint,
});

setToToken(fromToken);
                    } else {
                      setFromToken(token);
                    }

                    setSelecting(null);
                  }}
                />
              </div>
            )}

          </div>

          <div className="mt-4 flex justify-between">

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
  text-xl md:text-2xl
  text-white
  outline-none
  disabled:opacity-50
"
            />

          </div>

          <p className="mt-3 text-sm text-zinc-500">
  Balance : {fromBalance} {fromToken.symbol}
</p>

        </div>

        {/* SWITCH */}
        <div className="flex justify-center">

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
  p-2 md:p-3
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
        <div className="rounded-xl bg-zinc-900 p-4 md:p-5">

          <p className="text-zinc-400">
            To
          </p>

          <div className="mt-4">

            <TokenButton
              token={toToken}
              onClick={() => setSelecting("to")}
            />

            {selecting === "to" && (
              <div className="mt-3">
                <TokenSelector
                  tokens={TOKENS}
                  onSelect={(token) => {
                    if (token.symbol === fromToken.symbol) {
                     setToToken(token);

setSelectedToken({
  symbol: token.symbol,
  name: token.name,
  mint: token.mint,
});

setFromToken(toToken); 
                    } else {
                      setToToken(token);
                    }

                    setSelecting(null);
                  }}
                />
              </div>
            )}

          </div>

          <div className="mt-4 flex justify-between">

            <input
  type="text"
  value={
    quoteLoading
      ? "..."
      : toAmount || "0.0"
  }
  readOnly
  className="
  w-full
  bg-transparent
  text-right
  text-xl md:text-2xl
  text-zinc-500
  outline-none
"
/>

          </div>

          <p className="mt-3 text-sm text-zinc-500">
  Balance : {toBalance} {toToken.symbol}
</p>

        </div>

        {/* DETAILS */}
        <div className="space-y-2 rounded-xl bg-zinc-900 p-4 text-sm">

          <div className="flex justify-between text-zinc-400">
            <span>Slippage</span>
            <span>0.50%</span>
          </div>

          <div className="flex justify-between text-zinc-400">
            <span>Price Impact</span>
            <span>--</span>
          </div>

          <div className="flex justify-between text-zinc-400">
            <span>Network Fee</span>
            <span>--</span>
          </div>

          <div className="flex justify-between font-semibold text-cyan-400">
            <span>ZingSwap Fee</span>
            <span>0.30%</span>
          </div>

        </div>

        {/* MESSAGE */}
        {message && (
          <div className="break-all rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
            {message}
          </div>
        )}

        {/* ACTION */}
        <button
          type="button"
          onClick={handleSwap}
          disabled={loading}
          className="
            w-full
            rounded-xl
            bg-cyan-500
            py-4
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
            : connected
              ? "Swap"
              : "Connect Wallet"}
        </button>

      </div>
    </div>
  );
}