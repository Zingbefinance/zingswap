import { Token } from "./types";
import { TOKENS } from "./tokens";

const TOKEN_SEARCH_URL = "https://api.jup.ag/tokens/v2/search";

let cache: Token[] | null = null;

function mergeWithLocalTokens(remoteTokens: Token[]): Token[] {
  const tokenMap = new Map<string, Token>();

  // Les tokens locaux ZingSwap sont toujours prioritaires.
  for (const token of TOKENS) {
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
 * SOL et ZTC restent toujours disponibles.
 */
export function getLocalTokenList(): Token[] {
  return TOKENS;
}

/**
 * Recherche des tokens Solana via Jupiter Tokens API V2.
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
    const response = await fetch(
      `${TOKEN_SEARCH_URL}?query=${encodeURIComponent(
        normalizedQuery
      )}`,
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(
        "Format de recherche de tokens invalide."
      );
    }

    const remoteTokens: Token[] = data
      .filter(
        (token) =>
          typeof token.id === "string" &&
          typeof token.symbol === "string" &&
          typeof token.name === "string" &&
          typeof token.decimals === "number"
      )
      .map((token) => ({
        symbol: token.symbol,
        name: token.name,
        mint: token.id,
        decimals: token.decimals,
      }));

    return mergeWithLocalTokens(remoteTokens);
  } catch (error) {
    console.warn(
      "Impossible de rechercher les tokens via Jupiter.",
      error
    );

    // Même si Jupiter est indisponible,
    // SOL et ZTC restent disponibles.
    return TOKENS;
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
    const response = await fetch(
      `${TOKEN_SEARCH_URL}?query=${encodeURIComponent(mint)}`,
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return null;
    }

    const token = data.find(
      (item) =>
        item &&
        item.id === mint &&
        typeof item.symbol === "string" &&
        typeof item.name === "string" &&
        typeof item.decimals === "number"
    );

    if (!token) {
      return null;
    }

    return {
      symbol: token.symbol,
      name: token.name,
      mint: token.id,
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