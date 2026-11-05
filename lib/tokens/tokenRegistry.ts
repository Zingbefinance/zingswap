import { Token } from "./types";
import { TOKENS } from "./tokens";

let cache: Token[] | null = null;

function mergeWithLocalTokens(remoteTokens: Token[], localTokens: Token[] = TOKENS): Token[] {
  const tokenMap = new Map<string, Token>();

  // Les tokens locaux ZingSwap sont prioritaires lorsqu'ils correspondent à la recherche.
  for (const token of localTokens) {
    tokenMap.set(token.mint, token);
  }

  // Ajout des tokens Jupiter sans écraser les tokens locaux.
  for (const token of remoteTokens) {
    if (!tokenMap.has(token.mint)) {
      tokenMap.set(token.mint, token);
    }
  }

  return Array.from(tokenMap.values());
}

/**
 * Retourne les tokens locaux de ZingSwap.
 * SOL, ZTC, USDT et USDC restent toujours disponibles.
 */
export function getLocalTokenList(): Token[] {
  return TOKENS;
}

/**
 * Recherche des tokens Solana via notre proxy serveur vers Jupiter Tokens API V2.
 *
 * La recherche peut utiliser :
 * - symbole
 * - nom
 * - adresse mint
 */
export async function searchTokens(
  query: string
): Promise<Token[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return TOKENS;
  }

  try {
    const response = await fetch(`/api/tokens/search?query=${encodeURIComponent(normalizedQuery)}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as { tokens?: (Token & { logoURI?: string; priceUSD?: number })[] };

    if (!Array.isArray(data.tokens)) {
      throw new Error(
        "Format de recherche de tokens invalide."
      );
    }

    const remoteTokens: Token[] = data.tokens
      .filter(
        (token) =>
          typeof token.mint === "string" &&
          typeof token.symbol === "string" &&
          typeof token.name === "string" &&
          Number.isInteger(token.decimals) && token.decimals >= 0 && token.decimals <= 255
      )
      .map((token) => ({
        symbol: token.symbol,
        name: token.name,
        mint: token.mint,
        decimals: token.decimals,
        ...(token.logoURI ? { logoURI: token.logoURI } : {}),
        ...(token.priceUSD ? { priceUSD: token.priceUSD } : {}),
      }));

    const normalized = normalizedQuery.toLocaleLowerCase();
    const localMatches = TOKENS.filter((token) =>
      `${token.symbol} ${token.name} ${token.mint}`.toLocaleLowerCase().includes(normalized),
    );
    return mergeWithLocalTokens(remoteTokens, localMatches);
  } catch (error) {
    console.warn(
      "Impossible de rechercher les tokens via Jupiter.",
      error
    );

    // Les tokens locaux recherchés restent disponibles si Jupiter est momentanément inaccessible.
    const normalized = normalizedQuery.toLocaleLowerCase();
    return TOKENS.filter((token) =>
      `${token.symbol} ${token.name} ${token.mint}`.toLocaleLowerCase().includes(normalized),
    );
  }
}

/**
 * Ancienne fonction conservée pour ne pas casser
 * les composants qui l'utilisent actuellement.
 */
export async function getTokenList(): Promise<Token[]> {
  if (cache) {
    return cache;
  }

  cache = TOKENS;

  return cache;
}
/**
 * Recherche les métadonnées d'un token à partir de son mint.
 *
 * Les tokens locaux sont prioritaires.
 * Pour les autres tokens, Jupiter Tokens API V2 fournit
 * notamment les décimales nécessaires aux calculs du swap.
 */
export async function getTokenByMint(
  mint: string
): Promise<Token | null> {
  const localToken = TOKENS.find(
    (token) => token.mint === mint
  );

  if (localToken) {
    return localToken;
  }

  try {
    const response = await fetch(`/api/tokens/search?query=${encodeURIComponent(mint)}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as { tokens?: (Token & { mint: string })[] };

    if (!Array.isArray(data.tokens)) {
      return null;
    }

    const token = data.tokens.find(
      (item) =>
        item &&
        item.mint === mint &&
        typeof item.symbol === "string" &&
        typeof item.name === "string" &&
        Number.isInteger(item.decimals) && item.decimals >= 0 && item.decimals <= 255
    );

    if (!token) {
      return null;
    }

    return {
      symbol: token.symbol,
      name: token.name,
      mint: token.mint,
      decimals: token.decimals,
    };
  } catch (error) {
    console.warn(
      "Impossible de récupérer les métadonnées du token.",
      error
    );

    return null;
  }
}
