export type TradingVerificationStatus =
  | "issuer-confirmed"
  | "ecosystem-source"
  | "unverified";

export type AllowedTradingToken = {
  name: string;
  symbol: string;
  mint: string;
  network: "solana";
  authorizationStatus: "trading-allowlist";
  verificationStatus: TradingVerificationStatus;
  /** Stablecoins are quote-only until inverse market pricing is implemented. */
  canBeBase: boolean;
};

export const ALLOWED_TRADING_TOKENS = [
  {
    name: "Solana",
    symbol: "SOL",
    mint: "So11111111111111111111111111111111111111112",
    network: "solana",
    authorizationStatus: "trading-allowlist",
    verificationStatus: "ecosystem-source",
    canBeBase: true,
  },
  {
    name: "Zing Token",
    symbol: "ZTC",
    mint: "4zihBzwHLx9z7aNmXam181iUd285xbqJNN57M5LhoHpu",
    network: "solana",
    authorizationStatus: "trading-allowlist",
    verificationStatus: "unverified",
    canBeBase: true,
  },
  {
    name: "Jupiter",
    symbol: "JUP",
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    network: "solana",
    authorizationStatus: "trading-allowlist",
    verificationStatus: "issuer-confirmed",
    canBeBase: true,
  },
  {
    name: "Raydium",
    symbol: "RAY",
    mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    network: "solana",
    authorizationStatus: "trading-allowlist",
    verificationStatus: "ecosystem-source",
    canBeBase: true,
  },
  {
    name: "Bonk",
    symbol: "BONK",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    network: "solana",
    authorizationStatus: "trading-allowlist",
    verificationStatus: "ecosystem-source",
    canBeBase: true,
  },
  {
    name: "USD Coin",
    symbol: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    network: "solana",
    authorizationStatus: "trading-allowlist",
    verificationStatus: "issuer-confirmed",
    canBeBase: false,
  },
  {
    name: "Tether USD",
    symbol: "USDT",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    network: "solana",
    authorizationStatus: "trading-allowlist",
    verificationStatus: "issuer-confirmed",
    canBeBase: false,
  },
  {
    name: "Coinbase Wrapped Bitcoin",
    symbol: "cbBTC",
    mint: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
    network: "solana",
    authorizationStatus: "trading-allowlist",
    verificationStatus: "issuer-confirmed",
    canBeBase: true,
  },
  {
    name: "Wrapped Ether (Wormhole)",
    symbol: "WETH",
    mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    network: "solana",
    authorizationStatus: "trading-allowlist",
    verificationStatus: "ecosystem-source",
    canBeBase: true,
  },
] as const satisfies readonly AllowedTradingToken[];

export type AllowedTradingMint = (typeof ALLOWED_TRADING_TOKENS)[number]["mint"];

export const ALLOWED_TRADING_QUOTE_MINTS = [
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  "So11111111111111111111111111111111111111112",
] as const satisfies readonly AllowedTradingMint[];

const tokensByMint = new Map<string, (typeof ALLOWED_TRADING_TOKENS)[number]>(
  ALLOWED_TRADING_TOKENS.map((token) => [token.mint, token]),
);
const quoteMints = new Set<string>(ALLOWED_TRADING_QUOTE_MINTS);

export function findAllowedTradingTokenByMint(mint: string) {
  return tokensByMint.get(mint);
}

export function isAllowedTradingMint(mint: string): mint is AllowedTradingMint {
  return tokensByMint.has(mint);
}

export function isAllowedTradingQuoteMint(mint: string): boolean {
  return quoteMints.has(mint);
}

/**
 * Checks exact mint orientation: the selected asset must be the pool's base
 * token, and the quote token must be one of the explicitly allowed mints.
 */
export function isEligibleTradingPair(baseMint: string, quoteMint: string): boolean {
  const baseToken = findAllowedTradingTokenByMint(baseMint);
  return Boolean(
    baseToken?.canBeBase &&
      baseMint !== quoteMint &&
      isAllowedTradingQuoteMint(quoteMint),
  );
}
