import { LIFI_SOLANA_CHAIN_ID } from "./chains";

export const SOLANA_USDT_ADDRESS = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
export const BSC_USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

export type PinnedUsdtToken = {
  address: string;
  mint: string;
  chainId: number;
  symbol: "USDT";
  name: string;
  decimals: number;
};

const PINNED_USDT_TOKENS: PinnedUsdtToken[] = [
  {
    address: SOLANA_USDT_ADDRESS,
    mint: SOLANA_USDT_ADDRESS,
    chainId: LIFI_SOLANA_CHAIN_ID,
    symbol: "USDT",
    name: "Tether USD (Solana)",
    decimals: 6,
  },
  {
    address: BSC_USDT_ADDRESS,
    mint: BSC_USDT_ADDRESS,
    chainId: 56,
    symbol: "USDT",
    name: "Binance-Peg USDT (BEP-20)",
    decimals: 18,
  },
];

export function getPinnedUsdtToken(chainId: number) {
  return PINNED_USDT_TOKENS.find((token) => token.chainId === chainId);
}
