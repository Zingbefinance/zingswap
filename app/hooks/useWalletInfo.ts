"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

// Mint du ZING TOKEN
const ZING_MINT = new PublicKey(
  "4zihBzwHLx9z7aNmXam181iUd285xbqJNN57M5LhoHpu"
);

export default function useWalletInfo() {
  const { publicKey, connected } = useWallet();
useEffect(() => {
  console.log("Wallet connecté :", publicKey?.toBase58());
}, [publicKey]);

  const [address, setAddress] = useState("");
  const [solBalance, setSolBalance] = useState(0);
  const [zingBalance, setZingBalance] = useState(0);

  useEffect(() => {
    async function loadWallet() {
      if (!connected || !publicKey) {
        setAddress("");
        setSolBalance(0);
        setZingBalance(0);
        return;
      }

      try {
        // Adresse
        setAddress(publicKey.toBase58());

        // SOL
console.log("Lecture du wallet :", publicKey.toBase58());
        const lamports = await connection.getBalance(publicKey);
        setSolBalance(lamports / LAMPORTS_PER_SOL);

        // Recherche de tous les comptes SPL du wallet
        const tokenAccounts =
          await connection.getParsedTokenAccountsByOwner(
            publicKey,
            {
              programId: TOKEN_PROGRAM_ID,
            }
          );
console.log("Wallet :", publicKey.toBase58());
console.log("Token accounts :", tokenAccounts.value);

        let balance = 0;

        tokenAccounts.value.forEach((account) => {
          const info: any =
            account.account.data.parsed.info;

          if (info.mint === ZING_MINT.toBase58()) {
            balance =
              Number(info.tokenAmount.amount) /
              Math.pow(
                10,
                info.tokenAmount.decimals
              );
          }
        });

        setZingBalance(balance);

      } catch (err) {
        console.error(err);
      }
    }

    loadWallet();
  }, [connected, publicKey]);

  return {
    connected,
    address,
    solBalance,
    zingBalance,
  };
}