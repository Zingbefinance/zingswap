export type DexScreenerPair = {
  chainId: string;
  baseToken: {
    symbol: string;
    name: string;
  };
  quoteToken: {
    symbol: string;
  };
  pairAddress: string;
  dexId: string;
  priceUsd?: string;
  liquidity?: {
    usd?: number;
  };
  volume?: {
    h24?: number;
  };
  url: string;
};

type DexScreenerSearchResponse = {
  pairs?: DexScreenerPair[];
};

type DexScreenerBoost = {
  chainId: string;
  tokenAddress: string;
  url: string;
  totalAmount?: number;
};

type DexScreenerBoostResponse = DexScreenerBoost[];

export async function searchSolanaPairs(
  query: string
): Promise<DexScreenerPair[]> {
  const value = query.trim();

  if (!value) {
    return [];
  }

  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(value)}`
  );

  if (!response.ok) {
    throw new Error(
      `DexScreener API error: ${response.status}`
    );
  }

  const data =
    (await response.json()) as DexScreenerSearchResponse;

  return (
    data.pairs?.filter(
      (pair) => pair.chainId === "solana"
    ) ?? []
  );
}

export async function searchFirstSolanaPair(
  query: string
): Promise<DexScreenerPair | null> {
  const pairs = await searchSolanaPairs(query);

  return pairs[0] ?? null;
}

export async function getSolanaTokenPairs(
  query: string
): Promise<DexScreenerPair[]> {
  return searchSolanaPairs(query);
}

export async function getTopSolanaBoostedPairs(): Promise<
  DexScreenerPair[]
> {
  const boostsResponse = await fetch(
    "https://api.dexscreener.com/token-boosts/top/v1"
  );

  if (!boostsResponse.ok) {
    throw new Error(
      `DexScreener boosts API error: ${boostsResponse.status}`
    );
  }

  const boosts =
    (await boostsResponse.json()) as DexScreenerBoostResponse;

  const solanaBoosts = boosts
    .filter((item) => item.chainId === "solana")
    .slice(0, 20);

  if (solanaBoosts.length === 0) {
    return [];
  }

  const addresses = solanaBoosts.map(
    (item) => item.tokenAddress
  );

  const pairsResponse = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${addresses.join(",")}`
  );

  if (!pairsResponse.ok) {
    throw new Error(
      `DexScreener token API error: ${pairsResponse.status}`
    );
  }

  const data =
    (await pairsResponse.json()) as DexScreenerSearchResponse;

  const pairs = data.pairs ?? [];

  const bestPairs = new Map<string, DexScreenerPair>();

  for (const pair of pairs) {
    if (pair.chainId !== "solana") {
      continue;
    }

    const tokenAddress = pair.baseToken
      ? pair.pairAddress
      : "";

    if (!bestPairs.has(tokenAddress)) {
      bestPairs.set(tokenAddress, pair);
    }
  }

  return Array.from(bestPairs.values()).slice(0, 10);
}