"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";
import type { ReactNode } from "react";

export function TonWalletProvider({ children }: { children: ReactNode }) {
  return (
    <TonConnectUIProvider manifestUrl="https://www.zingswap.org/tonconnect-manifest.json">
      {children}
    </TonConnectUIProvider>
  );
}
