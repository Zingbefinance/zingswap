import { NextRequest, NextResponse } from "next/server";

const TOKEN_SEARCH_URL = "https://api.jup.ag/tokens/v2/search";
const MAX_QUERY_LENGTH = 100;

type JupiterToken = {
  id?: unknown;
  symbol?: unknown;
  name?: unknown;
  decimals?: unknown;
  icon?: unknown;
  usdPrice?: unknown;
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";

  if (!query || query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      { error: "La recherche doit contenir entre 1 et 100 caractères." },
      { status: 400 },
    );
  }

  const apiKey = process.env.JUPITER_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "La recherche de tokens est momentanément indisponible." },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(
      `${TOKEN_SEARCH_URL}?query=${encodeURIComponent(query)}`,
      { headers: { "x-api-key": apiKey }, cache: "no-store" },
    );

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Jupiter ne peut pas effectuer la recherche pour le moment." },
        { status: upstream.status === 429 ? 503 : 502 },
      );
    }

    const payload: unknown = await upstream.json();
    if (!Array.isArray(payload)) {
      return NextResponse.json(
        { error: "La réponse de recherche Jupiter est invalide." },
        { status: 502 },
      );
    }

    const tokens = (payload as JupiterToken[])
      .filter((token) =>
        typeof token.id === "string" &&
        typeof token.symbol === "string" &&
        typeof token.name === "string" &&
        Number.isInteger(token.decimals) &&
        Number(token.decimals) >= 0 &&
        Number(token.decimals) <= 255,
      )
      .map((token) => ({
        mint: token.id as string,
        symbol: token.symbol as string,
        name: token.name as string,
        decimals: Number(token.decimals),
        ...(typeof token.icon === "string" ? { logoURI: token.icon } : {}),
        ...(typeof token.usdPrice === "number" ? { priceUSD: token.usdPrice } : {}),
      }));

    return NextResponse.json(
      { tokens },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Jupiter ne peut pas effectuer la recherche pour le moment." },
      { status: 502 },
    );
  }
}
