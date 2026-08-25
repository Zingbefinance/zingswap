import {
  type Wallet,
} from "@coral-xyz/anchor";

import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";

import {
  ZINGSWAP_PROGRAM_ID,
  createZingSwapProgram,
  getPositionPda,
  getVaultPdas,
} from "../../../lib/anchor/zingswap";

export interface RemoveLiquidityParams {
  connection: Connection;
  wallet: Wallet;

  pool: PublicKey;

  userTokenA: PublicKey;
  userTokenB: PublicKey;

  tickLower: number;
  tickUpper: number;
}

export interface RemoveLiquidityResult {
  transaction: Transaction;
  position: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
}

export async function buildRemoveLiquidityTransaction(
  params: RemoveLiquidityParams
): Promise<RemoveLiquidityResult> {
  const {
    connection,
    wallet,
    pool,
    userTokenA,
    userTokenB,
    tickLower,
    tickUpper,
  } = params;

  if (!wallet.publicKey) {
    throw new Error(
      "Le wallet utilisateur n'est pas connecté."
    );
  }

  const program = createZingSwapProgram(
    connection,
    wallet
  );

  // --------------------------------------------------
  // PDA des vaults
  // --------------------------------------------------

  const { vaultA, vaultB } =
    getVaultPdas(
      ZINGSWAP_PROGRAM_ID,
      pool
    );

  // --------------------------------------------------
  // PDA de la position utilisateur
  // --------------------------------------------------

  const position =
    getPositionPda(
      ZINGSWAP_PROGRAM_ID,
      pool,
      wallet.publicKey,
      tickLower,
      tickUpper
    );

  console.log(
    "REMOVE LIQUIDITY ACCOUNTS:",
    {
      pool: pool.toBase58(),
      position: position.toBase58(),
      userTokenA: userTokenA.toBase58(),
      userTokenB: userTokenB.toBase58(),
      vaultA: vaultA.toBase58(),
      vaultB: vaultB.toBase58(),
      user: wallet.publicKey.toBase58(),
      tickLower,
      tickUpper,
    }
  );

  // --------------------------------------------------
  // Construction de l'instruction Anchor
  // --------------------------------------------------

  const transaction =
    await program.methods
      .removeLiquidity(
        tickLower,
        tickUpper
      )
      .accountsPartial({
        pool,
        position,
        userTokenA,
        userTokenB,
        vaultA,
        vaultB,
        user: wallet.publicKey,
        tokenProgram:
          new PublicKey(
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
          ),
      })
      .transaction();

  // --------------------------------------------------
  // Blockhash + fee payer
  // --------------------------------------------------

  const latestBlockhash =
    await connection.getLatestBlockhash(
      "confirmed"
    );

  transaction.recentBlockhash =
    latestBlockhash.blockhash;

  transaction.feePayer =
    wallet.publicKey;

  return {
    transaction,
    position,
    vaultA,
    vaultB,
  };
}