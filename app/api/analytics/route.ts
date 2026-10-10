import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEX_SEARCH_URL = "https://api.dexscreener.com/latest/dex/search";
const GECKO_BASE_URL = "https://api.geckoterminal.com/api/v2";

type MarketPair = {
  chainId: string;
  baseToken: { address?: string; name: string; symbol: string };
  quoteToken: { address?: string; symbol: string };
  pairAddress: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
};

const intervals = {
  "24H": { timeframe: "minute", aggregate: "15", limit: "96" },
  "7D": { timeframe: "hour", aggregate: "1", limit: "168" },
  "30D": { timeframe: "hour", aggregate: "4", limit: "180" },
  "180D": { timeframe: "day", aggregate: "1", limit: "180" },
} as const;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");

  if (action === "search") {
    const query = searchParams.get("query")?.trim();
    if (!query || query.length > 120) {
      return NextResponse.json({ error: "Saisis un symbole ou une adresse valide." }, { status: 400 });
    }

    try {
      const upstream = await fetch(`${DEX_SEARCH_URL}?q=${encodeURIComponent(query)}`, {
        next: { revalidate: 30 },
      });
      if (!upstream.ok) throw new Error(`Recherche indisponible (${upstream.status}).`);
      const payload = (await upstream.json()) as { pairs?: MarketPair[] };
      const isMintAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(query);
      const pairs = (payload.pairs ?? [])
        .filter((pair) => pair.chainId === "solana" && pair.pairAddress)
        .filter((pair) => !isMintAddress || pair.baseToken.address === query || pair.quoteToken.address === query)
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
        .slice(0, 12)
        .map((pair) => {
          const normalizedQuery = query.toLowerCase();
          const matchingToken = isMintAddress
            ? [pair.baseToken, pair.quoteToken].find((token) => token.address === query)
            : [pair.baseToken, pair.quoteToken].find((token) => token.symbol.toLowerCase() === normalizedQuery) ?? pair.baseToken;
          return {
            address: pair.pairAddress,
            tokenAddress: matchingToken?.address ?? pair.baseToken.address ?? "",
            base: pair.baseToken.symbol,
            quote: pair.quoteToken.symbol,
            priceUsd: matchingToken && matchingToken.address !== pair.baseToken.address ? null : pair.priceUsd ?? null,
            liquidityUsd: pair.liquidity?.usd ?? null,
          };
        });

      return NextResponse.json({ pairs });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Recherche indisponible." },
        { status: 502 },
      );
    }
  }

  if (action === "candles") {
    const address = searchParams.get("pair") ?? "";
    const tokenAddress = searchParams.get("token") ?? "";
    const period = searchParams.get("period") as keyof typeof intervals | null;
    if (!/^[1-9A-HJ-NP-Za-km-z]{20,64}$/.test(address) || !/^[1-9A-HJ-NP-Za-km-z]{20,64}$/.test(tokenAddress) || !period || !(period in intervals)) {
      return NextResponse.json({ error: "Paire ou période invalide." }, { status: 400 });
    }

    const interval = intervals[period];
    const url = new URL(`${GECKO_BASE_URL}/networks/solana/pools/${encodeURIComponent(address)}/ohlcv/${interval.timeframe}`);
    url.searchParams.set("aggregate", interval.aggregate);
    url.searchParams.set("limit", interval.limit);
    url.searchParams.set("currency", "usd");
    url.searchParams.set("token", tokenAddress);
    try {
      const upstream = await fetch(url, {
        headers: { accept: "application/json" },
        next: { revalidate: 60 },
      });
      if (!upstream.ok) {
        return NextResponse.json({ error: "Historique indisponible pour cette paire." }, { status: 200 });
      }
      const payload = (await upstream.json()) as {
        data?: { attributes?: { ohlcv_list?: unknown[][] } };
      };
      const rows = payload.data?.attributes?.ohlcv_list ?? [];
      const candles = rows
        .filter((row) => row.length >= 5 && row.slice(0, 5).every((value) => Number.isFinite(Number(value))))
        .map((row) => ({ time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]) }))
        .filter((candle) => candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0)
        .sort((a, b) => a.time - b.time);

      return NextResponse.json({ candles });
    } catch {
      return NextResponse.json({ error: "Impossible de récupérer l’historique actuellement." }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Action invalide." }, { status: 400 });
}
