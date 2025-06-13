import {
    ApiV3PoolInfoConcentratedItem,
    ClmmKeys,
    ComputeClmmPoolInfo,
    PoolUtils,
    ReturnTypeFetchMultiplePoolTickArrays,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import {
    Connection,
    clusterApiUrl,
    PublicKey,
    SystemProgram,
    ComputeBudgetProgram,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import { loadKeypairFromFile, MEMO_PROGRAM_ID, getPdaExBitmapAccount } from "../utils";
import { IDL } from "../../target/types/tomo_swap";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddress,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import yargs from "yargs/yargs";
import dotenv from "dotenv";

dotenv.config();

function getOptions() {
    const options = yargs(process.argv.slice(2))
        .option("poolId", {
            type: "string",
            describe: "pool Id",
            default: "Grub1v4mcDtkBmTmsUPJ1dNbELt3ayB4PkFwFBxmqu74", // TRUMP-WSOL
        })
        .option("inputMint", {
            type: "string",
            describe: "input mint",
            default: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        })
        .option("inputAmount", {
            type: "string",
            describe: "input amount",
            default: "100000", // 0.1 USDC
        });
    return options.argv;
}

const TOMO_SWAP_PROGRAM_ID = new PublicKey("Tomo4qKVvw3a6A6Yxrr7XZHVbxR7uXEk5xeR7XqN7Kr");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TRUMP_MINT = new PublicKey("6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN");
const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");

async function main() {
    let options: any = getOptions();
    const network = options.network;
    const connection = new Connection(clusterApiUrl("mainnet-beta"));
    const payer = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const wallet = new Wallet(payer);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const inputAmount = options.inputAmount;

    const program = new Program(IDL, TOMO_SWAP_PROGRAM_ID, provider);
    const sourceTokenAccount = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    const destinationTokenAccount = await getAssociatedTokenAddress(TRUMP_MINT, wallet.publicKey);

    // sa authority
    const [saAuthority] = PublicKey.findProgramAddressSync([Buffer.from("tomo_sa")], TOMO_SWAP_PROGRAM_ID);

    const trumpAtaSa = await getAssociatedTokenAddress(
        TRUMP_MINT, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );

    const usdcAtaSa = await getAssociatedTokenAddress(
        USDC_MINT, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );

    const swapArgs: any = {
        amountIn: new BN(inputAmount),
        expectAmountOut: new BN(8898),
        minReturn: new BN(8898),
        amounts: [new BN(inputAmount)],
        routes: [
            [
                {
                    dexes: [{ raydiumCpmmSwap: {} }],
                    weights: Buffer.from([100]),
                },
            ],
        ],
    };

    const cpSwapAuthority = new PublicKey("GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL");
    const ammConfig = new PublicKey("D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2");
    const poolState = new PublicKey("Grub1v4mcDtkBmTmsUPJ1dNbELt3ayB4PkFwFBxmqu74");
    const inputVault = new PublicKey("DzC9LLGx7k3tvtrvt773ZL1J8SpQWrrFEG1kcLpDgpVD");
    const outputVault = new PublicKey("5s35HpCmrNvQbi6eGd8AUwHZvrh56DJJARHzFrDAwngu");
    const observationState = new PublicKey("CcrRb8PT4B4BMVvs3uDE2XrMdRo8j1dFmRaG4pAAr2Xf");


    const keys = [
        { pubkey: RAYDIUM_CPMM_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: saAuthority, isWritable: true, isSigner: false },
        { pubkey: usdcAtaSa, isWritable: true, isSigner: false },
        { pubkey: trumpAtaSa, isWritable: true, isSigner: false },
        { pubkey: cpSwapAuthority, isWritable: false, isSigner: false },
        { pubkey: ammConfig, isWritable: false, isSigner: false },
        { pubkey: poolState, isWritable: true, isSigner: false },
        { pubkey: inputVault, isWritable: true, isSigner: false },
        { pubkey: outputVault, isWritable: true, isSigner: false },
        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: USDC_MINT, isWritable: false, isSigner: false },
        { pubkey: TRUMP_MINT, isWritable: false, isSigner: false },
        { pubkey: observationState, isWritable: true, isSigner: false },
    ];

    const tx = await program.methods
        .proxySwap(swapArgs, new BN(0))
        .accounts({
            payer: payer.publicKey,
            sourceTokenAccount,
            destinationTokenAccount,
            sourceMint: USDC_MINT,
            destinationMint: TRUMP_MINT,
            saAuthority,
            sourceTokenSa: usdcAtaSa,
            destinationTokenSa: trumpAtaSa,
            sourceTokenProgram: TOKEN_PROGRAM_ID,
            destinationTokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(keys)
        .instruction();

    // Get the lookup table account
    const lookupTableAddress = new PublicKey("fyitLuAPMKBYHEJ6kSLKCyfaZUnLYJW6m1BtK25MDts");
    const lookupTableAccount = await connection.getAddressLookupTable(lookupTableAddress).then((res) => res.value);

    if (!lookupTableAccount) {
        throw new Error("Lookup table not found");
    }

    // Create a v0 compatible message
    const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: [
            ComputeBudgetProgram.setComputeUnitLimit({
                units: 400_000,
            }),
            // ComputeBudgetProgram.setComputeUnitPrice({
            //     microLamports: 1,
            // }),
            tx,
        ],
    }).compileToV0Message([lookupTableAccount]);

    // Create a versioned transaction
    const versionedTx = new VersionedTransaction(messageV0);
    versionedTx.sign([payer]);

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