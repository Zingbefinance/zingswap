import { BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
} from "@solana/web3.js";

import idl from "../../../lib/anchor/zingswap.json";

export interface PositionData {
  address: PublicKey;
  pool: PublicKey;
  owner: PublicKey;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amountADeposited: bigint;
  amountBDeposited: bigint;
}

interface PositionAccount {
  pool: PublicKey;
  owner: PublicKey;
  tickLower: number;
  tickUpper: number;
  liquidity: BN;
  amountADeposited: BN;
  amountBDeposited: BN;
  bump: number;
}

export async function getUserPositions(
  connection: Connection,
  user: PublicKey,
  pool?: PublicKey
): Promise<PositionData[]> {
  const program = new Program(
    idl as any,
    {
      connection,
    } as any
  );

  const accountNamespace =
    program.account as any;

  console.log(
    "[ZingSwap] Recherche des positions...",
    {
      wallet: user.toBase58(),
      pool: pool?.toBase58() ?? "TOUS",
    }
  );

  const accounts =
    await accountNamespace.position.all();

  console.log(
    "[ZingSwap] Positions on-chain trouvées :",
    accounts.length
  );

  const positions: PositionData[] = [];

  for (const account of accounts) {
    const data =
      account.account as PositionAccount;

    console.log(
      "[ZingSwap] Position candidate :",
      {
        address: account.publicKey.toBase58(),
        owner: data.owner.toBase58(),
        pool: data.pool.toBase58(),
        tickLower: data.tickLower,
        tickUpper: data.tickUpper,
        liquidity: data.liquidity.toString(),
      }
    );

    if (!data.owner.equals(user)) {
      console.log(
        "[ZingSwap] Position ignorée : owner différent.",
        {
          positionOwner: data.owner.toBase58(),
          wallet: user.toBase58(),
        }
      );

      continue;
    }

    if (pool && !data.pool.equals(pool)) {
      console.log(
        "[ZingSwap] Position ignorée : pool différent.",
        {
          positionPool: data.pool.toBase58(),
          requestedPool: pool.toBase58(),
        }
      );

      continue;
    }

    positions.push({
      address: account.publicKey,
      pool: data.pool,
      owner: data.owner,
      tickLower: data.tickLower,
      tickUpper: data.tickUpper,
      liquidity: BigInt(
        data.liquidity.toString()
      ),
      amountADeposited: BigInt(
        data.amountADeposited.toString()
      ),
      amountBDeposited: BigInt(
        data.amountBDeposited.toString()
      ),
    });
  }

  console.log(
    "[ZingSwap] Positions correspondant au wallet/pool :",
    positions.length,
    {
      wallet: user.toBase58(),
      pool: pool?.toBase58() ?? "TOUS",
    }
  );

  return positions;
}