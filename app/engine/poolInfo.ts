import { Connection, PublicKey } from "@solana/web3.js";

export const connection = new Connection(
  "https://api.mainnet-beta.solana.com"
);

export const POOL_ID = new PublicKey(
  "2NQAkcVvK4pBXRHZN9V4Lg1cuHzbPYL1REowHpVJzUHn"
);

export async function getPoolInfo() {
  const info = await connection.getAccountInfo(POOL_ID);

  console.log("Pool :", info);

  return {
    reserveA: 5,
    reserveB: 500000,
  };
}