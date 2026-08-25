import { getTopSolanaBoostedPairs } from "@/lib/dexScreener";

export type ZingHubToken = {
  symbol: string;
  name: string;
  tag: string;
  url: string;
};

const ZTC_MINT =
  "4zihBzwHLx9z7aNmXam181iUd285xbqJNN57M5LhoHpu";

export async function getTrendingTokens(): Promise<ZingHubToken[]> {
  try {
    const pairs = await getTopSolanaBoostedPairs();

    const tokens: ZingHubToken[] = [];

    // ZTC reste toujours prioritaire.
    tokens.push({
      symbol: "ZTC",
      name: "ZING TOKEN (ZTC)",
      tag: "Featured",
      url: `https://dexscreener.com/search?q=${ZTC_MINT}`,
    });

    for (const pair of pairs) {
      const symbol = pair.baseToken.symbol?.trim();

      if (!symbol) {
        continue;
      }

      if (
        symbol.toUpperCase() === "ZTC" ||
        tokens.some(
          (token) =>
            token.symbol.toUpperCase() === symbol.toUpperCase()
        )
      ) {
        continue;
      }

      tokens.push({
        symbol,
        name: pair.baseToken.name || symbol,
        tag: "Solana",
        url: pair.url,
      });

      if (tokens.length >= 6) {
        break;
      }
    }

    return tokens;
  } catch (error) {
    console.error("Zing Hub error:", error);

    // Fallback : ZTC reste disponible même si DexScreener est indisponible.
    return [
      {
        symbol: "ZTC",
        name: "ZING TOKEN (ZTC)",
        tag: "Featured",
        url: `https://dexscreener.com/search?q=${ZTC_MINT}`,
      },
    ];
  }
}

export const zingNews = [
  {
    title: "Nouveau Token",
    description:
      "ZING TOKEN (ZTC) est désormais compatible avec la page Graphique.",
  },
  {
    title: "ZingSwap Frontend Stable",
    description:
      "Le Dashboard, Swap, Portfolio et Graphique sont maintenant intégrés.",
  },
  {
    title: "Wallet Ready",
    description:
      "Connexion Phantom et Solflare opérationnelle.",
  },
];