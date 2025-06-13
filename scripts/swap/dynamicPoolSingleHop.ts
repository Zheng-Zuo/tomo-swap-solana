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
            default: "5yuefgbJJpmFNK2iiYbLSpv1aZXq7F9AUKkZKErTYCvs", // USDC-WSOL
        })
        .option("inputMint", {
            type: "string",
            describe: "input mint",
            default: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        })
        .option("inputAmount", {
            type: "string",
            describe: "input amount",
            default: "500000", // 0.5 USDC
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
    const pool = await AmmImpl.create(connection, poolAddress);

    const swapQuote = pool.getSwapQuote(inputMint, inputAmount, 90);
    const minAmountReceived = swapQuote.minSwapOutAmount;

    const owner = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const wallet = new Wallet(owner);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const program = new Program(IDL, TOMO_SWAP_PROGRAM_ID, provider);

    const vaultA = pool.vaultA.vaultState;
    const vaultB = pool.vaultB.vaultState;
    const poolState = pool.poolState;
    const { tokenAMint, tokenBMint } = poolState;
    const zeroForOne = inputMint.equals(tokenAMint);
    const protocolTokenFee = zeroForOne ? poolState.protocolTokenAFee : poolState.protocolTokenBFee;
    // console.log("protocolTokenAFee", poolState.protocolTokenAFee.toBase58());
    // console.log("protocolTokenBFee", poolState.protocolTokenBFee.toBase58());

    const vaultProgramId = pool["vaultProgram"]._programId;

    const sourceTokenAccount = zeroForOne
        ? await getAssociatedTokenAddress(tokenAMint, wallet.publicKey)
        : await getAssociatedTokenAddress(tokenBMint, wallet.publicKey);

    const destinationTokenAccount = zeroForOne
        ? await getAssociatedTokenAddress(tokenBMint, wallet.publicKey)
        : await getAssociatedTokenAddress(tokenAMint, wallet.publicKey);

    const dynamicPoolProgramId = pool["program"]._programId;
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
                    dexes: [{ meteoraDynamicpool: {} }],
                    weights: Buffer.from([100]),
                },
            ],
        ],
    };

    const keys = [
        { pubkey: dynamicPoolProgramId, isWritable: false, isSigner: false }, // dex program id
        { pubkey: saAuthority, isWritable: true, isSigner: false }, // sa authority
        zeroForOne
            ? { pubkey: tokenASa, isWritable: true, isSigner: false }
            : { pubkey: tokenBSa, isWritable: true, isSigner: false }, // input token sa
        zeroForOne
            ? { pubkey: tokenBSa, isWritable: true, isSigner: false }
            : { pubkey: tokenASa, isWritable: true, isSigner: false }, // output token sa

        { pubkey: poolAddress, isWritable: true, isSigner: false }, // pool id
        { pubkey: pool.poolState.aVault, isWritable: true, isSigner: false }, // a_vault
        { pubkey: pool.poolState.bVault, isWritable: true, isSigner: false }, // b_vault
        { pubkey: vaultA.tokenVault, isWritable: true, isSigner: false }, // a_token_vault
        { pubkey: vaultB.tokenVault, isWritable: true, isSigner: false }, // b_token_vault
        { pubkey: vaultA.lpMint, isWritable: true, isSigner: false }, // a_vault_lp_mint
        { pubkey: vaultB.lpMint, isWritable: true, isSigner: false }, // b_vault_lp_mint
        { pubkey: poolState.aVaultLp, isWritable: true, isSigner: false }, // a_vault_lp
        { pubkey: poolState.bVaultLp, isWritable: true, isSigner: false }, // b_vault_lp
        { pubkey: protocolTokenFee, isWritable: true, isSigner: false }, // admin_token_fee
        { pubkey: vaultProgramId, isWritable: true, isSigner: false }, // vault_program
        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false }, // token_program
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

// Transaction hash: 4gQyNpk7gYRareS6JNjPwb6FQwmqNFK3ocRTcDqm87C9NdbhVqcDYzwRiLtJm6AZwzY1AufH2MPiyuUcV7oa7fLe
