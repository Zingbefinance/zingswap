"use client";

import { ReactNode, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";

interface Props {
  children: ReactNode;
}

export default function WalletProvider({ children }: Props) {
  const endpoint =
    process.env.NEXT_PUBLIC_ZINGSWAP_RPC ||
    "https://api.devnet.solana.com";

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets}>
        {children}
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}