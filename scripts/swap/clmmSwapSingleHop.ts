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
            default: "7XzVsjqTebULfkUofTDH5gDdZDmxacPmPuTfHa1n9kuh", // WSOL-USDC
        })
        .option("inputMint", {
            type: "string",
            describe: "input mint",
            default: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        })
        .option("inputAmount", {
            type: "string",
            describe: "input amount",
            default: "100000", // 0.5 USDC
        });
    return options.argv;
}

const TOMO_SWAP_PROGRAM_ID = new PublicKey("Tomo4qKVvw3a6A6Yxrr7XZHVbxR7uXEk5xeR7XqN7Kr");

async function main() {
    let options: any = getOptions();
    const poolId = options.poolId;
    const inputMint = options.inputMint;
    const inputAmount = new BN(options.inputAmount);

    const owner = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const connection = new Connection(clusterApiUrl("mainnet-beta"));
    const cluster = "mainnet";
    const raydium = await Raydium.load({
        owner,
        connection,
        cluster,
        disableFeatureCheck: true,
        disableLoadToken: true,
        blockhashCommitment: "finalized",
    });

    const data = await raydium.api.fetchPoolById({ ids: poolId });
    const poolInfo = data[0] as ApiV3PoolInfoConcentratedItem;
    const clmmPoolInfo = (await PoolUtils.fetchComputeClmmInfo({
        connection: raydium.connection,
        poolInfo,
    })) as ComputeClmmPoolInfo;

    const tickCache = (await PoolUtils.fetchMultiplePoolTickArrays({
        connection: raydium.connection,
        poolKeys: [clmmPoolInfo],
    })) as ReturnTypeFetchMultiplePoolTickArrays;

    const baseIn = inputMint === poolInfo.mintA.address;
    // console.log(`base in: ${baseIn}`);

    const { amountOut, minAmountOut, remainingAccounts } = await PoolUtils.computeAmountOutFormat({
        poolInfo: clmmPoolInfo,
        tickArrayCache: tickCache[poolId],
        amountIn: inputAmount,
        tokenOut: poolInfo[baseIn ? "mintB" : "mintA"],
        slippage: 0.1,
        epochInfo: await raydium.fetchEpochInfo(),
    });

    const minAmountReceived = new BN(minAmountOut.amount.raw.toString());

    // create swap transaction
    const wallet = new Wallet(owner);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const program = new Program(IDL, TOMO_SWAP_PROGRAM_ID, provider);
    const tokenAMint = new PublicKey(poolInfo.mintA.address);
    const tokenBMint = new PublicKey(poolInfo.mintB.address);

    const sourceTokenAccount = await getAssociatedTokenAddress(tokenBMint, wallet.publicKey);
    const destinationTokenAccount = await getAssociatedTokenAddress(tokenAMint, wallet.publicKey);

    const clmmProgramId = clmmPoolInfo.programId;
    const ammConfigId = clmmPoolInfo.ammConfig.id;
    const vaultA = clmmPoolInfo["vaultA"];
    const vaultB = clmmPoolInfo["vaultB"];
    const observationId = clmmPoolInfo["observationId"];
    const { publicKey: exBitmapAccount } = getPdaExBitmapAccount(clmmProgramId, new PublicKey(poolId));

    const [saAuthority] = PublicKey.findProgramAddressSync([Buffer.from("tomo_sa")], TOMO_SWAP_PROGRAM_ID);

    const tokenASa = await getAssociatedTokenAddress(
        tokenAMint, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );

    const tokenBSa = await getAssociatedTokenAddress(
        tokenBMint, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );

    const swapArgs: any = {
        amountIn: inputAmount,
        expectAmountOut: minAmountReceived,
        minReturn: minAmountReceived,
        amounts: [inputAmount],
        routes: [
            [
                {
                    dexes: [{ raydiumClmmSwapV2: {} }],
                    weights: Buffer.from([100]),
                },
            ],
        ],
    };

    // console.log(`dex program id: ${clmmProgramId.toBase58()}`);
    // console.log(`amm config id: ${ammConfigId.toBase58()}`);
    // console.log(`pool id: ${poolId}`);
    // console.log(`tokenA vault: ${vaultA}`);
    // console.log(`tokenB vault: ${vaultB}`);
    // console.log(`observation id: ${observationId}`);
    // console.log(`token program: ${TOKEN_PROGRAM_ID.toBase58()}`);
    // console.log(`token program 2022: ${TOKEN_2022_PROGRAM_ID.toBase58()}`);
    // console.log(`memo program: ${MEMO_PROGRAM_ID.toBase58()}`);
    // console.log(`tokenA mint: ${tokenAMint.toBase58()}`);
    // console.log(`tokenB mint: ${tokenBMint.toBase58()}`);
    // console.log(`ex bitmap account: ${exBitmapAccount.toBase58()}`);

    const ZERO_ADDRESS = new PublicKey(new Uint8Array(32));
    const tickArray = [];
    for (let i = 0; i < 3; i++) {
        if (i < remainingAccounts.length) {
            // Use the existing account if available
            tickArray.push({ pubkey: remainingAccounts[i], isSigner: false, isWritable: true });
        } else {
            // Use zero address for missing tick arrays
            tickArray.push({ pubkey: ZERO_ADDRESS, isSigner: false, isWritable: true });
        }
    }

    const keys = [
        { pubkey: clmmProgramId, isWritable: false, isSigner: false }, // dex program id
        { pubkey: saAuthority, isWritable: true, isSigner: false }, // sa authority
        baseIn
            ? { pubkey: tokenASa, isWritable: true, isSigner: false }
            : { pubkey: tokenBSa, isWritable: true, isSigner: false }, // input token sa
        baseIn
            ? { pubkey: tokenBSa, isWritable: true, isSigner: false }
            : { pubkey: tokenASa, isWritable: true, isSigner: false }, // output token sa

        { pubkey: ammConfigId, isWritable: false, isSigner: false }, // amm config id
        { pubkey: new PublicKey(poolId), isWritable: true, isSigner: false }, // pool id

        baseIn
            ? { pubkey: vaultA, isWritable: true, isSigner: false }
            : { pubkey: vaultB, isWritable: true, isSigner: false }, // input vault
        baseIn
            ? { pubkey: vaultB, isWritable: true, isSigner: false }
            : { pubkey: vaultA, isWritable: true, isSigner: false }, // output vault

        { pubkey: observationId, isWritable: true, isSigner: false }, // observation id

        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false }, // token program id
        { pubkey: TOKEN_2022_PROGRAM_ID, isWritable: false, isSigner: false }, // token 2022 program id
        { pubkey: MEMO_PROGRAM_ID, isWritable: false, isSigner: false }, // memo program id

        baseIn
            ? { pubkey: tokenAMint, isWritable: false, isSigner: false }
            : { pubkey: tokenBMint, isWritable: false, isSigner: false }, // input mint
        baseIn
            ? { pubkey: tokenBMint, isWritable: false, isSigner: false }
            : { pubkey: tokenAMint, isWritable: false, isSigner: false }, // output mint

        { pubkey: exBitmapAccount, isWritable: true, isSigner: false }, // ex bitmap account

        ...tickArray,
    ];

    const tx = await program.methods
        .proxySwap(swapArgs, new BN(0))
        .accounts({
            payer: owner.publicKey,
            sourceTokenAccount,
            destinationTokenAccount,
            sourceMint: baseIn ? tokenAMint : tokenBMint,
            destinationMint: baseIn ? tokenBMint : tokenAMint,
            saAuthority,
            sourceTokenSa: baseIn ? tokenASa : tokenBSa,
            destinationTokenSa: baseIn ? tokenBSa : tokenASa,
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
    versionedTx.sign([owner]);

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

// https://solscan.io/tx/3XU5xvrYfnuReqwq26ASjfGDqWJ49sZLbiajahDTCfGDSvdkySk58VqjR9qkTfugSuRuwtTZ2SBSK7pH2oVpymtQ
