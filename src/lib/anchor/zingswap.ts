import {
  AnchorProvider,
  Program,
  type Idl,
  type Wallet,
} from "@coral-xyz/anchor";

import {
  Connection,
  PublicKey,
  type Signer,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";

import idl from "./zingswap.json";

export const ZINGSWAP_PROGRAM_ID = new PublicKey(
  "EfPqnPQ5wzdV4Uv7SRKQVUGDjBna2YrLKWUDZLAz9Lna"
);

export const ZTC_MINT = new PublicKey(
  "6p2PU4mW3oTnZnc3ZiY4vbRgzfHJNhRpLJNx9PxV7MuW"
);

export const WSOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112"
);

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

export type ZingSwapWallet = Wallet;

export function createZingSwapProgram(
  connection: Connection,
  wallet: ZingSwapWallet
) {
  const provider = new AnchorProvider(
    connection,
    wallet,
    {
      commitment: "confirmed",
    }
  );

  return new Program(
    idl as Idl,
    provider
  );
}

export function getPoolPda(
  programId: PublicKey = ZINGSWAP_PROGRAM_ID,
  tokenAMint: PublicKey = ZTC_MINT,
  tokenBMint: PublicKey = WSOL_MINT
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      tokenAMint.toBuffer(),
      tokenBMint.toBuffer(),
    ],
    programId
  )[0];
}

export function getVaultPdas(
  programId: PublicKey = ZINGSWAP_PROGRAM_ID,
  poolPda: PublicKey
) {
  const [vaultA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("vault_a"),
      poolPda.toBuffer(),
    ],
    programId
  );

  const [vaultB] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("vault_b"),
      poolPda.toBuffer(),
    ],
    programId
  );

  return {
    vaultA,
    vaultB,
  };
}

export function getPositionPda(
  programId: PublicKey = ZINGSWAP_PROGRAM_ID,
  poolPda: PublicKey,
  user: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      poolPda.toBuffer(),
      user.toBuffer(),
    ],
    programId
  )[0];
}