import {
  BN,
  type Wallet,
} from "@coral-xyz/anchor";

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";

import {
  ZINGSWAP_PROGRAM_ID,
  createZingSwapProgram,
  getPositionPda,
  getVaultPdas,
} from "../../../lib/anchor/zingswap";

export interface AddLiquidityParams {
  connection: Connection;
  wallet: Wallet;

  pool: PublicKey;

  userTokenA: PublicKey;
  userTokenB: PublicKey;

  amountA: BN;
  amountB: BN;
}

export interface AddLiquidityResult {
  transaction: Transaction;
  position: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
}

export async function buildAddLiquidityTransaction(
  params: AddLiquidityParams
): Promise<AddLiquidityResult> {
  const {
    connection,
    wallet,
    pool,
    userTokenA,
    userTokenB,
    amountA,
    amountB,
  } = params;

  if (!wallet.publicKey) {
    throw new Error(
      "Le wallet utilisateur n'est pas connecté."
    );
  }

  if (amountA.lte(new BN(0))) {
    throw new Error(
      "Le montant du token A doit être supérieur à zéro."
    );
  }

  if (amountB.lte(new BN(0))) {
    throw new Error(
      "Le montant du token B doit être supérieur à zéro."
    );
  }

  const program = createZingSwapProgram(
    connection,
    wallet
  );

  const { vaultA, vaultB } =
    getVaultPdas(
      ZINGSWAP_PROGRAM_ID,
      pool
    );

  const position =
    getPositionPda(
      ZINGSWAP_PROGRAM_ID,
      pool,
      wallet.publicKey
    );

  const transaction =
    await program.methods
      .addLiquidity(
        amountA,
        amountB
      )
      .accountsPartial({
  pool,
  position,
  userTokenA,
  userTokenB,
  vaultA,
  vaultB,
  user: wallet.publicKey,
  systemProgram: SystemProgram.programId,
  tokenProgram: new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  ),
})
      .transaction();

  const latestBlockhash =
    await connection.getLatestBlockhash(
      "confirmed"
    );

  transaction.recentBlockhash =
    latestBlockhash.blockhash;

  transaction.feePayer =
    wallet.publicKey;
console.log(
  "ADD LIQUIDITY ACCOUNTS:",
  transaction.instructions[0]?.keys.map((key) => ({
    pubkey: key.pubkey.toBase58(),
    signer: key.isSigner,
    writable: key.isWritable,
  }))
);
  return {
    transaction,
    position,
    vaultA,
    vaultB,
  };
}