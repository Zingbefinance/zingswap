"use client";

import { useWallet } from "@solana/wallet-adapter-react";

export default function useSwap() {
  const { connected } = useWallet();

  async function swapSolToZing(amount: number) {
    if (!connected) {
      alert("Connectez votre portefeuille.");
      return;
    }

    try {
      const response = await fetch("/api/raydium", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
        }),
      });

      const quote = await response.json();

      console.log("Quote Raydium :", quote);

      if (!response.ok) {
        alert(quote.message ?? "Erreur Raydium");
        return;
      }

      alert("Quote reçue avec succès !");
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la récupération du quote.");
    }
  }

  async function swapZingToSol(amount: number) {
    if (!connected) {
      alert("Connectez votre portefeuille.");
      return;
    }

    alert("Fonction ZING → SOL bientôt disponible.");
  }

  return {
    swapSolToZing,
    swapZingToSol,
  };
}