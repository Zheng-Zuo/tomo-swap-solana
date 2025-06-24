import BN from "bn.js";
import DLMM from "@meteora-ag/dlmm";
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
            default: "HTvjzsfX3yU6BUodCjZ5vZkUrAxMDTrBs3CJaq43ashR", // WSOL - USDC
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

async function main() {
    let options: any = getOptions();
    const poolAddress = new PublicKey(options.poolId);
    const inputMint = new PublicKey(options.inputMint);
    const inputAmount = new BN(options.inputAmount);

    const connection = new Connection(clusterApiUrl("mainnet-beta"));
    const dlmmPool = await DLMM.create(connection as any, poolAddress, {
        cluster: "mainnet-beta",
    });

    const tokenAMint = dlmmPool.tokenX.publicKey;
    const tokenBMint = dlmmPool.tokenY.publicKey;

    const zeroForOne = inputMint.equals(tokenAMint);
    const swapYtoX = !zeroForOne;
    const binArrays = await dlmmPool.getBinArrayForSwap(swapYtoX);

    // console.log(binArrays);

    const swapQuote = await dlmmPool.swapQuote(inputAmount, swapYtoX, new BN(3), binArrays);
    const minAmountReceived = swapQuote.minOutAmount;

    // console.log(swapQuote.binArraysPubkey);

    const owner = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const wallet = new Wallet(owner);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const program = new Program(IDL, TOMO_SWAP_PROGRAM_ID, provider);

    const sourceTokenAccount = zeroForOne
        ? await getAssociatedTokenAddress(tokenAMint, wallet.publicKey)
        : await getAssociatedTokenAddress(tokenBMint, wallet.publicKey);

    const destinationTokenAccount = zeroForOne
        ? await getAssociatedTokenAddress(tokenBMint, wallet.publicKey)
        : await getAssociatedTokenAddress(tokenAMint, wallet.publicKey);

    const dlmmProgramId = dlmmPool["program"]["_programId"];
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
                    dexes: [{ meteoraDlmm: {} }],
                    weights: Buffer.from([100]),
                },
            ],
        ],
    };

    const eventAuthority = new PublicKey("D1ZN9Wj1fRSUQfCjhvnu1hqDMT7hzjzBBpi12nVniYD6");

    const ZERO_ADDRESS = new PublicKey(new Uint8Array(32));
    const tickArray = [];
    for (let i = 0; i < 3; i++) {
        if (i < swapQuote.binArraysPubkey.length) {
            // Use the existing account if available
            tickArray.push({ pubkey: swapQuote.binArraysPubkey[i], isSigner: false, isWritable: true });
        } else {
            // Use zero address for missing tick arrays
            tickArray.push({ pubkey: ZERO_ADDRESS, isSigner: false, isWritable: true });
        }
    }

    console.log(tickArray);

    const keys = [
        { pubkey: dlmmProgramId, isWritable: false, isSigner: false }, // dex program id
        { pubkey: saAuthority, isWritable: true, isSigner: false }, // sa authority
        zeroForOne
            ? { pubkey: tokenASa, isWritable: true, isSigner: false }
            : { pubkey: tokenBSa, isWritable: true, isSigner: false }, // input token sa
        zeroForOne
            ? { pubkey: tokenBSa, isWritable: true, isSigner: false }
            : { pubkey: tokenASa, isWritable: true, isSigner: false }, // output token sa

        { pubkey: poolAddress, isWritable: true, isSigner: false }, // lb_pair
        { pubkey: dlmmProgramId, isWritable: true, isSigner: false }, // bin_array_bitmap_extension
        { pubkey: dlmmPool.lbPair.reserveX, isWritable: true, isSigner: false }, // reserve_x
        { pubkey: dlmmPool.lbPair.reserveY, isWritable: true, isSigner: false }, // reserve_y
        { pubkey: dlmmPool.lbPair.tokenXMint, isWritable: true, isSigner: false }, // token_x_mint
        { pubkey: dlmmPool.lbPair.tokenYMint, isWritable: true, isSigner: false }, // token_y_mint
        { pubkey: dlmmPool.lbPair.oracle, isWritable: true, isSigner: false }, // oracle
        { pubkey: dlmmProgramId, isWritable: true, isSigner: false }, // host_fee_in
        { pubkey: TOKEN_PROGRAM_ID, isWritable: true, isSigner: false }, // token_x_program
        { pubkey: TOKEN_PROGRAM_ID, isWritable: true, isSigner: false }, // token_y_program
        { pubkey: eventAuthority, isWritable: true, isSigner: false }, // event_authority
        ...tickArray,
    ];

    const tx = await program.methods
        .proxySwap(swapArgs, new BN(0))
        .accounts({
            payer: owner.publicKey,
            sourceTokenAccount,
            destinationTokenAccount,
            sourceMint: zeroForOne ? tokenAMint : tokenBMint,
            destinationMint: zeroForOne ? tokenBMint : tokenAMint,
            saAuthority,
            sourceTokenSa: zeroForOne ? tokenASa : tokenBSa,
            destinationTokenSa: zeroForOne ? tokenBSa : tokenASa,
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
