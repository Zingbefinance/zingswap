import { NextRequest, NextResponse } from "next/server";

type DexScreenerPair = {
  chainId?: string;
  baseToken?: { address?: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
};

const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_MINTS = 120;
const MINTS_PER_REQUEST = 30;

export async function GET(request: NextRequest) {
  const mints = Array.from(
    new Set(
      (request.nextUrl.searchParams.get("mints") ?? "")
        .split(",")
        .filter((mint) => MINT_PATTERN.test(mint))
    )
  ).slice(0, MAX_MINTS);

  if (mints.length === 0) {
    return NextResponse.json({ prices: {} });
  }

  try {
    const batches = Array.from(
      { length: Math.ceil(mints.length / MINTS_PER_REQUEST) },
      (_, index) => mints.slice(
        index * MINTS_PER_REQUEST,
        (index + 1) * MINTS_PER_REQUEST
      )
    );
    const responses = await Promise.all(
      batches.map((batch) =>
        fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`,
          { next: { revalidate: 30 } }
        )
      )
    );

    if (responses.some((response) => !response.ok)) {
      return NextResponse.json(
        { error: "Les prix sont temporairement indisponibles." },
        { status: 502 }
      );
    }

    const pairGroups = await Promise.all(
      responses.map(async (response) => {
        const data = (await response.json()) as {
          pairs?: DexScreenerPair[] | null;
        };
        return data.pairs ?? [];
      })
    );
    const pairs = pairGroups.flat();

    const prices: Record<
      string,
      { usd: number; change24h: number | null }
    > = {};

    for (const mint of mints) {
      const pair = pairs
        .filter(
          (candidate) =>
            candidate.chainId === "solana" &&
            candidate.baseToken?.address === mint &&
            Number.isFinite(Number(candidate.priceUsd)) &&
            Number(candidate.priceUsd) > 0 &&
            Number.isFinite(candidate.liquidity?.usd) &&
            (candidate.liquidity?.usd ?? 0) > 0
        )
        .sort(
          (a, b) =>
            (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
        )[0];

      if (!pair?.priceUsd) continue;

      prices[mint] = {
        usd: Number(pair.priceUsd),
        change24h: Number.isFinite(pair.priceChange?.h24)
          ? pair.priceChange!.h24!
          : null,
      };
    }

    return NextResponse.json(
      { prices },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Les prix sont temporairement indisponibles." },
      { status: 502 }
    );
  }
}
