import BN from "bn.js";
import AmmImpl from "@meteora-ag/dynamic-amm-sdk";
import {
    Connection,
    clusterApiUrl,
    PublicKey,
    SystemProgram,
    ComputeBudgetProgram,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import { loadKeypairFromFile } from "../utils";
import { IDL } from "../../target/types/tomo_swap";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
    NATIVE_MINT,
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddress,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createInitializeAccountInstruction,
    createSyncNativeInstruction,
    createCloseAccountInstruction,
} from "@solana/spl-token";
import { calSolAmountOut } from "../pumpFun/getAmountOut";
import { PumpFunSDK } from "pumpdotfun-sdk";
import yargs from "yargs/yargs";
import dotenv from "dotenv";

dotenv.config();

function getOptions() {
    const options = yargs(process.argv.slice(2))
        .option("tokenMint", {
            type: "string",
            describe: "token mint",
            default: "7en49n4riBnBX58wt7AhJXzEWPU1D4y2vYxjw3YZpump", //
        })
        .option("inputAmount", {
            type: "string",
            describe: "input amount",
            default: "10000000000", // 10000 tokens
        });
    return options.argv;
}

const TOMO_SWAP_PROGRAM_ID = new PublicKey("Tomo4qKVvw3a6A6Yxrr7XZHVbxR7uXEk5xeR7XqN7Kr");

async function main() {
    let options: any = getOptions();
    const tokenMint = new PublicKey(options.tokenMint);
    const inputAmount = new BN(options.inputAmount);

    const connection = new Connection(clusterApiUrl("mainnet-beta"));
    const owner = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const wallet = new Wallet(owner);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const program = new Program(IDL, TOMO_SWAP_PROGRAM_ID, provider);
    const pumpFunSdk = new PumpFunSDK(provider);

    const base = owner.publicKey; // The base public key (usually your wallet)
    const seed = Date.now().toString(); // Any string, must be unique for each account
    const destinationTokenAccount = await PublicKey.createWithSeed(base, seed, TOKEN_PROGRAM_ID);
    const rentExemption = await connection.getMinimumBalanceForRentExemption(165);

    // 1. Create the account with seed
    const createAccountIx = SystemProgram.createAccountWithSeed({
        fromPubkey: owner.publicKey,
        basePubkey: owner.publicKey,
        seed,
        newAccountPubkey: destinationTokenAccount,
        lamports: rentExemption, // fund with rent
        space: 165,
        programId: TOKEN_PROGRAM_ID,
    });

    // 2. Initialize as WSOL account
    const initAccountIx = createInitializeAccountInstruction(destinationTokenAccount, NATIVE_MINT, owner.publicKey);

    let bondingCurveInfo = await pumpFunSdk.getBondingCurveAccount(tokenMint);
    const solAmountOut = calSolAmountOut(
        inputAmount,
        new BN(bondingCurveInfo.virtualTokenReserves.toString()),
        new BN(bondingCurveInfo.virtualSolReserves.toString()),
        new BN(bondingCurveInfo.realSolReserves.toString())
    );

    const minAmountOut = new BN(1);

    const swapArgs: any = {
        amountIn: inputAmount,
        expectAmountOut: solAmountOut,
        minReturn: minAmountOut,
        amounts: [inputAmount],
        routes: [
            [
                {
                    dexes: [{ pumpfunSell: {} }],
                    weights: Buffer.from([100]),
                },
            ],
        ],
    };

    const [saAuthority] = PublicKey.findProgramAddressSync([Buffer.from("tomo_sa")], TOMO_SWAP_PROGRAM_ID);

    const pumpFunProgramId = pumpFunSdk.program.programId;

    const sourceTokenAccount = await getAssociatedTokenAddress(tokenMint, wallet.publicKey);

    const [golbalAccount] = PublicKey.findProgramAddressSync([Buffer.from("global")], pumpFunProgramId);
    const [bondingCurveAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("bonding-curve"), tokenMint.toBuffer()],
        pumpFunProgramId
    );
    const associatedBondingCurve = await getAssociatedTokenAddress(tokenMint, bondingCurveAccount, true);

    const globalAccountInfo = await pumpFunSdk.getGlobalAccount();
    const feeRecipient = globalAccountInfo.feeRecipient;

    const [creatorVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("creator-vault"), owner.publicKey.toBuffer()],
        pumpFunProgramId
    );
    const eventAuthority = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");

    const keys = [
        { pubkey: pumpFunProgramId, isWritable: false, isSigner: false }, // dex program id
        { pubkey: owner.publicKey, isWritable: true, isSigner: true }, // payer
        { pubkey: sourceTokenAccount, isWritable: true, isSigner: false }, // token ata
        { pubkey: destinationTokenAccount, isWritable: true, isSigner: false }, // temp wsol account
        { pubkey: golbalAccount, isWritable: true, isSigner: false }, // global account
        { pubkey: feeRecipient, isWritable: true, isSigner: false }, // fee recipient
        { pubkey: tokenMint, isWritable: false, isSigner: false }, // token mint
        { pubkey: bondingCurveAccount, isWritable: true, isSigner: false },
        { pubkey: associatedBondingCurve, isWritable: true, isSigner: false },
        { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
        { pubkey: creatorVault, isWritable: true, isSigner: false },
        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: eventAuthority, isWritable: false, isSigner: false },
    ];

    // 3. Sell
    const sellTx = await program.methods
        .proxySwap(swapArgs, new BN(0))
        .accounts({
            payer: owner.publicKey,
            sourceTokenAccount,
            destinationTokenAccount,
            sourceMint: tokenMint,
            destinationMint: NATIVE_MINT,
            saAuthority,
            sourceTokenSa: null, //
            destinationTokenSa: null, //
            sourceTokenProgram: TOKEN_PROGRAM_ID,
            destinationTokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(keys)
        .instruction();

    // 4. Close the temp WSOL account and reclaim SOL
    const closeAccountIx = createCloseAccountInstruction(destinationTokenAccount, owner.publicKey, owner.publicKey);

    const instructions = [createAccountIx, initAccountIx, sellTx, closeAccountIx];

    const { blockhash } = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
        payerKey: owner.publicKey,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    // Create a versioned transaction
    const versionedTx = new VersionedTransaction(messageV0);
    versionedTx.sign([owner]);

    // const fee = await connection.getFeeForMessage(messageV0);
    // console.log("Estimated fee (lamports):", fee.value);

    // Send the transaction
    const txHash = await connection.sendTransaction(versionedTx);
    console.log("Transaction hash:", txHash);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
