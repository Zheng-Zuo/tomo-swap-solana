import {
    sendAndConfirmTransaction,
    Connection,
    clusterApiUrl,
    Keypair,
    SystemProgram,
    Transaction,
    LAMPORTS_PER_SOL,
    Cluster,
    PublicKey,
    TransactionSignature,
    SignatureStatus,
    TransactionConfirmationStatus,
} from "@solana/web3.js";

import {
    ExtensionType,
    createInitializeMintInstruction,
    mintTo,
    createAccount,
    getMintLen,
    getTransferFeeAmount,
    unpackAccount,
    TOKEN_2022_PROGRAM_ID,
    createInitializeTransferFeeConfigInstruction,
    harvestWithheldTokensToMint,
    transferCheckedWithFee,
    withdrawWithheldTokensFromAccounts,
    withdrawWithheldTokensFromMint,
    getOrCreateAssociatedTokenAccount,
    createAssociatedTokenAccountIdempotent,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { loadKeypairFromFile, explorerURL } from "../utils";
import dotenv from "dotenv";

dotenv.config();

async function main() {
    const network = "devnet";
    const connection = new Connection(clusterApiUrl(network), "confirmed");
    const payer = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;

    // Define the extensions to be used by the mint
    const extensions = [ExtensionType.TransferFeeConfig];
    // Calculate the length of the mint
    const mintLen = getMintLen(extensions);

    // Set the decimals, fee basis points, and maximum fee
    const decimals = 9;
    const feeBasisPoints = 100; // 1%
    const maxFee = new BN(9).mul(new BN(10).pow(new BN(decimals))); // 9 tokens

    // Define the amount to be minted and the amount to be transferred, accounting for decimals
    const mintAmount = new BN(1_000_000).mul(new BN(10).pow(new BN(decimals))); // Mint 1,000,000 tokens
    const transferAmount = new BN(1_000).mul(new BN(10).pow(new BN(decimals))); // Transfer 1,000 tokens

    // Calculate the fee for the transfer
    const calcFee = transferAmount.mul(new BN(feeBasisPoints)).div(new BN(10_000)); // expect 10 fee
    const fee = calcFee.gt(maxFee) ? maxFee : calcFee; // expect 9 fee

    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const mintTransaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: mint,
            space: mintLen,
            lamports: mintLamports,
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeTransferFeeConfigInstruction(
            mint,
            payer.publicKey,
            payer.publicKey,
            feeBasisPoints,
            BigInt(maxFee.toString()),
            TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMintInstruction(mint, decimals, payer.publicKey, null, TOKEN_2022_PROGRAM_ID)
    );

    const tx = await sendAndConfirmTransaction(connection, mintTransaction, [payer, mintKeypair]);
    console.log("New Token Created:", explorerURL({ txSignature: tx, cluster: network }));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// New Token Created: https://explorer.solana.com/tx/5qgguQCvGnbGPHYKtomwEqYBvnyPkX7wHgx1LVkUQKLZsNYewTjZfZehDvzyTpq12tEVqN9U3g2aeYCjUTjN9UiW?cluster=devnet
// https://solscan.io/token/BrzF1WJA25c1n6snbb52g6Vt7BMCzxcrKnjEePGVF5LG?cluster=devnet#extensions
