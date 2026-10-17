import { Connection, PublicKey, type AccountInfo } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { RPC_ENDPOINT } from "../../../config/network";
import {
  ZINGSWAP_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ZTC_MINT,
  WSOL_MINT,
  getPoolPda,
  getVaultPdas,
} from "../../../../src/lib/anchor/zingswap";

export const runtime = "nodejs";

const MIN_PRICE_LIQUIDITY_USD = 50_000;
const POOL_ACCOUNT_LENGTH = 207;
const TOKEN_ACCOUNT_LENGTH = 165;

type DexScreenerPair = {
  chainId?: string;
  pairAddress?: string;
  baseToken?: { address?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
};

type DexScreenerResponse = { pairs?: Array<DexScreenerPair | null> };

async function getUsdPrice(mint: PublicKey, tokenName: string) {
  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${mint.toBase58()}`,
    { next: { revalidate: 30 } },
  );
  if (!response.ok) throw new Error(`Prix USD ${tokenName} indisponible (DexScreener HTTP ${response.status}).`);

  const data = await response.json() as DexScreenerResponse;
  const candidates = (data.pairs ?? []).filter((pair): pair is DexScreenerPair =>
    pair !== null &&
    pair.chainId === "solana" &&
    pair.baseToken?.address === mint.toBase58() &&
    Number.isFinite(Number(pair.priceUsd)) &&
    Number(pair.priceUsd) > 0 &&
    Number.isFinite(pair.liquidity?.usd) &&
    (pair.liquidity?.usd ?? 0) > 0,
  );
  const reliablePair = candidates
    .filter((pair) => (pair.liquidity?.usd ?? 0) >= MIN_PRICE_LIQUIDITY_USD)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

  if (reliablePair) return Number(reliablePair.priceUsd);
  if (candidates.length > 0) {
    throw new Error(`Prix USD ${tokenName} indisponible : aucune paire n’atteint ${MIN_PRICE_LIQUIDITY_USD.toLocaleString("fr-FR")} $ de liquidité.`);
  }
  throw new Error(`Prix USD ${tokenName} indisponible : aucune paire Solana fiable n’est référencée sur DexScreener.`);
}

function readTokenVault(account: AccountInfo<Buffer>, expectedMint: PublicKey) {
  if (!account.owner.equals(TOKEN_PROGRAM_ID) || account.data.length < TOKEN_ACCOUNT_LENGTH) {
    throw new Error("Compte de réserve du pool invalide ou non lisible.");
  }
  if (!new PublicKey(account.data.subarray(0, 32)).equals(expectedMint)) {
    throw new Error("Le mint du compte de réserve ne correspond pas aux tokens du pool.");
  }
  return account.data.readBigUInt64LE(64);
}

export async function GET() {
  const poolAddress = getPoolPda(ZINGSWAP_PROGRAM_ID, ZTC_MINT, WSOL_MINT);
  const connection = new Connection(RPC_ENDPOINT, "confirmed");

  const [marketResult, poolResult, zingPriceResult, solPriceResult] = await Promise.allSettled([
    fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${poolAddress.toBase58()}`, {
      next: { revalidate: 60 },
    }).then(async (response) => {
      if (!response.ok) throw new Error("DexScreener indisponible");
      return response.json() as Promise<DexScreenerResponse>;
    }),
    connection.getAccountInfo(poolAddress),
    getUsdPrice(ZTC_MINT, "ZING"),
    getUsdPrice(WSOL_MINT, "WSOL"),
  ]);

  let volume24hUsd: number | null = null;
  if (marketResult.status === "fulfilled") {
    const pair = marketResult.value.pairs?.find(
      (candidate) => candidate?.pairAddress?.toLowerCase() === poolAddress.toBase58().toLowerCase(),
    );
    const volume = pair?.volume?.h24;
    if (typeof volume === "number" && Number.isFinite(volume)) volume24hUsd = volume;
  }

  let feePercent: number | null = null;
  let tvlUsd: number | null = null;
  try {
    if (poolResult.status === "rejected") throw new Error("Lecture du pool impossible sur le RPC Solana.");
    const pool = poolResult.value;
    if (!pool) throw new Error("Compte du pool ZING/WSOL introuvable sur le RPC Solana.");
    const bytes = pool.data;
    if (
      !pool.owner.equals(ZINGSWAP_PROGRAM_ID) ||
      bytes.length < POOL_ACCOUNT_LENGTH ||
      !new PublicKey(bytes.subarray(40, 72)).equals(ZTC_MINT) ||
      !new PublicKey(bytes.subarray(72, 104)).equals(WSOL_MINT)
    ) {
      throw new Error("Compte du pool ZING/WSOL invalide ou incompatible.");
    }

    const feeBps = bytes.readUInt16LE(168);
    if (feeBps <= 10_000) feePercent = feeBps / 100;

    const vaultA = new PublicKey(bytes.subarray(104, 136));
    const vaultB = new PublicKey(bytes.subarray(136, 168));
    const expectedVaults = getVaultPdas(ZINGSWAP_PROGRAM_ID, poolAddress);
    if (!vaultA.equals(expectedVaults.vaultA) || !vaultB.equals(expectedVaults.vaultB)) {
      throw new Error("Les comptes de réserve enregistrés dans le pool sont invalides.");
    }

    const [vaultAAccount, vaultBAccount] = await connection.getMultipleAccountsInfo([vaultA, vaultB]);
    if (!vaultAAccount || !vaultBAccount) throw new Error("Une réserve du pool est introuvable sur le RPC Solana.");
    const zingReserveRaw = readTokenVault(vaultAAccount, ZTC_MINT);
    const wsolReserveRaw = readTokenVault(vaultBAccount, WSOL_MINT);
    const zingReserve = Number(zingReserveRaw) / 10 ** 6;
    const wsolReserve = Number(wsolReserveRaw) / 10 ** 9;
    if (!Number.isFinite(zingReserve) || !Number.isFinite(wsolReserve) || zingReserve <= 0 || wsolReserve <= 0) {
      throw new Error("Les réserves ZING et WSOL sont vides ou invalides.");
    }

    if (zingPriceResult.status === "rejected") throw zingPriceResult.reason;
    if (solPriceResult.status === "rejected") throw solPriceResult.reason;
    tvlUsd = zingReserve * zingPriceResult.value + wsolReserve * solPriceResult.value;
    if (!Number.isFinite(tvlUsd) || tvlUsd <= 0) {
      tvlUsd = null;
      throw new Error("Le calcul du TVL ZING/WSOL a produit une valeur invalide.");
    }
  } catch {
    tvlUsd = null;
  }

  return NextResponse.json({
    tvlUsd,
    volume24hUsd,
    swapPercent: null,
    feePercent,
    updatedAt: new Date().toISOString(),
  });
}
