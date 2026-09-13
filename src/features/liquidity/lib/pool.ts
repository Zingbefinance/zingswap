
import {
  Connection,
  PublicKey,
} from "@solana/web3.js";

import {
  ZINGSWAP_PROGRAM_ID,

  getPoolPda,
  getVaultPdas,
} from "../../../lib/anchor/zingswap";

export interface PoolData {
  address: PublicKey;
  authority: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  feeBps: number;
  currentTick: number;
  sqrtPrice: bigint;
  liquidity: bigint;
  bump: number;
  reserveA: bigint;
  reserveB: bigint;
}

function readU128LE(
  data: Buffer,
  offset: number
): bigint {
  const low = data.readBigUInt64LE(offset);
  const high = data.readBigUInt64LE(offset + 8);

  return low + (high << BigInt(64));
}

export async function getPoolData(
  connection: Connection,
  tokenAMint: PublicKey,
  tokenBMint: PublicKey
): Promise<PoolData> {
  const poolAddress = getPoolPda(
    ZINGSWAP_PROGRAM_ID,
    tokenAMint,
    tokenBMint
  );

  const poolInfo =
    await connection.getAccountInfo(poolAddress);

  if (!poolInfo) {
  throw new Error(
  `Pool ${tokenAMint.toBase58()} / ${tokenBMint.toBase58()} introuvable.`
);
  }

  const data = poolInfo.data;

  const expectedLength = 207;

  if (data.length < expectedLength) {
    throw new Error(
      `Compte Pool invalide : ${data.length} octets reçus, ${expectedLength} attendus.`
    );
  }

  const authority = new PublicKey(
    data.subarray(8, 40)
  );

  const poolTokenAMint = new PublicKey(
  data.subarray(40, 72)
);

const poolTokenBMint = new PublicKey(
  data.subarray(72, 104)
);

  const vaultA = new PublicKey(
    data.subarray(104, 136)
  );

  const vaultB = new PublicKey(
    data.subarray(136, 168)
  );

  const feeBps = data.readUInt16LE(168);

  const currentTick = data.readInt32LE(170);

  const sqrtPrice = readU128LE(data, 174);

  const liquidity = readU128LE(data, 190);

  const bump = data.readUInt8(206);

  const expectedVaults = getVaultPdas(
    ZINGSWAP_PROGRAM_ID,
    poolAddress
  );

  if (!vaultA.equals(expectedVaults.vaultA)) {
    throw new Error(
      "Le vault A enregistré dans le Pool est invalide."
    );
  }

  if (!vaultB.equals(expectedVaults.vaultB)) {
    throw new Error(
      "Le vault B enregistré dans le Pool est invalide."
    );
  }

  const vaultAInfo =
    await connection.getTokenAccountBalance(vaultA);

  const vaultBInfo =
    await connection.getTokenAccountBalance(vaultB);

  return {
    address: poolAddress,
    authority,
    tokenAMint: poolTokenAMint,
tokenBMint: poolTokenBMint,
    
    vaultA,
    vaultB,
    feeBps,
    currentTick,
    sqrtPrice,
    liquidity,
    bump,
    reserveA: BigInt(vaultAInfo.value.amount),
    reserveB: BigInt(vaultBInfo.value.amount),
  };
  }
 export interface PoolPrices {
  ztcPerWsol: number;
  wsolPerZtc: number;
}

export function calculatePoolPrices(
  pool: PoolData
): PoolPrices {
  if (
    pool.reserveA <= BigInt(0) ||
    pool.reserveB <= BigInt(0)
  ) {
    throw new Error(
      "Impossible de calculer le prix : réserves insuffisantes."
    );
  }

  const tokenAPerTokenB =
    Number(pool.reserveA) /
    Number(pool.reserveB);

  const tokenBPerTokenA =
    Number(pool.reserveB) /
    Number(pool.reserveA);

  return {
  ztcPerWsol: tokenAPerTokenB,
  wsolPerZtc: tokenBPerTokenA,
};
}
