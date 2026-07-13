"use client";

import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";

export default function useWallet() {
  const wallet = useSolanaWallet();

  return {
    connected: wallet.connected,
    publicKey: wallet.publicKey,
    connect: wallet.connect,
    disconnect: wallet.disconnect,
  };
}