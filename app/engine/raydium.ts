import { Connection, PublicKey } from "@solana/web3.js";

export const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

export const POOL_ID = new PublicKey(
  "2NQAkcVvK4pBXRHZN9V4Lg1cuHzbPYL1REowHpVJzUHn"
);

export async function loadPoolAccount() {
  const account = await connection.getAccountInfo(POOL_ID);

  if (!account) {
    throw new Error("Pool introuvable.");
  }

  console.log("Pool :", account);

  return account;
}