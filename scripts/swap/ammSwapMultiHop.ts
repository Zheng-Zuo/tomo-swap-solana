import dotenv from "dotenv";
import yargs from "yargs/yargs";
import {
    SystemProgram,
    PublicKey,
    Connection,
    clusterApiUrl,
    ComputeBudgetProgram,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import { IDL } from "../../target/types/tomo_swap";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { loadKeypairFromFile } from "../utils";

dotenv.config();

function getOptions() {
    const options = yargs(process.argv.slice(2)).option("network", {
        type: "string",
        describe: "network",
        default: "mainnet-beta",
    });
    return options.argv;
}

const TOMO_SWAP_PROGRAM_ID = new PublicKey("Tomo4qKVvw3a6A6Yxrr7XZHVbxR7uXEk5xeR7XqN7Kr");
const RAYDIUM_AMM_PROGRAM_ID = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const RAY_MINT = new PublicKey("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R");
const ammAuthority = new PublicKey("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1");
const wsolUsdcPool = new PublicKey("58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"); // WSOL-USDC
const rayWsolPool = new PublicKey("AVs9TA4nWDzfPJE9gGVNJMVhcQy3V9PGazuz33BfG2RA"); // RAY-WSOL
const poolAWsolVault = new PublicKey("DQyrAcCrDXQ7NeoqGgDCZwBvWDcYmFCjSb9JtteuvPpz");
const poolAUsdcVault = new PublicKey("HLmqeL62xR1QoZ1HKKbXRrdN1p3phKpxRMb2VVopvBBz");
const poolBRayVault = new PublicKey("Em6rHi68trYgBFyJ5261A2nhwuQWfLcirgzZZYoRcrkX");
const poolBWsolVault = new PublicKey("3mEFzHsJyu2Cpjrz6zPmTzP7uoLFj9SbbecGVzzkL1mJ");

async function main() {
    let options: any = getOptions();
    const network = options.network;

    const connection = new Connection(clusterApiUrl(network), "confirmed");
    const payer = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const wallet = new Wallet(payer);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

    const program = new Program(IDL, TOMO_SWAP_PROGRAM_ID, provider);

    // Get token accounts
    const userUsdcAta = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    const userWsolAta = await getAssociatedTokenAddress(WSOL_MINT, wallet.publicKey);
    const userRayAta = await getAssociatedTokenAddress(RAY_MINT, wallet.publicKey);

    // Update the PDA derivation
    const [saAuthority] = PublicKey.findProgramAddressSync([Buffer.from("tomo_sa")], TOMO_SWAP_PROGRAM_ID);

    console.log("calculatedSaAuthority", saAuthority.toBase58());

    const usdcTokenSa = await getAssociatedTokenAddress(
        USDC_MINT, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );
    console.log("usdcTokenSa", usdcTokenSa.toBase58());

    const wsolTokenSa = await getAssociatedTokenAddress(
        WSOL_MINT, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );
    console.log("wsolTokenSa", wsolTokenSa.toBase58());

    const rayTokenSa = await getAssociatedTokenAddress(
        RAY_MINT, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );
    console.log("rayTokenSa", rayTokenSa.toBase58());

    const swapArgs: any = {
        amountIn: new BN(500000),
        expectAmountOut: new BN(100),
        minReturn: new BN(100),
        amounts: [new BN(500000)],
        routes: [
            [
                {
                    dexes: [{ raydiumSwap: {} }],
                    weights: Buffer.from([100]),
                },
                {
                    dexes: [{ raydiumSwap: {} }],
                    weights: Buffer.from([100]),
                },
            ],
        ],
    };

    const tx = await program.methods
        .proxySwap(swapArgs, new BN(0))
        .accounts({
            payer: payer.publicKey,
            sourceTokenAccount: userUsdcAta,
            destinationTokenAccount: userRayAta,
            sourceMint: USDC_MINT,
            destinationMint: RAY_MINT,
            saAuthority,
            sourceTokenSa: usdcTokenSa,
            destinationTokenSa: rayTokenSa,
            sourceTokenProgram: TOKEN_PROGRAM_ID,
            destinationTokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
            { pubkey: RAYDIUM_AMM_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: saAuthority, isWritable: false, isSigner: false },
            { pubkey: usdcTokenSa, isWritable: true, isSigner: false },
            { pubkey: wsolTokenSa, isWritable: true, isSigner: false },
            { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: wsolUsdcPool, isWritable: false, isSigner: false },
            { pubkey: ammAuthority, isWritable: false, isSigner: false },
            { pubkey: wsolUsdcPool, isWritable: true, isSigner: false },
            { pubkey: wsolUsdcPool, isWritable: true, isSigner: false },
            { pubkey: poolAWsolVault, isWritable: true, isSigner: false },
            { pubkey: poolAUsdcVault, isWritable: true, isSigner: false },
            { pubkey: wsolUsdcPool, isWritable: false, isSigner: false },
            { pubkey: wsolUsdcPool, isWritable: false, isSigner: false },
            { pubkey: wsolUsdcPool, isWritable: false, isSigner: false },
            { pubkey: wsolUsdcPool, isWritable: false, isSigner: false },
            { pubkey: wsolUsdcPool, isWritable: false, isSigner: false },
            { pubkey: usdcTokenSa, isWritable: true, isSigner: false },
            { pubkey: wsolTokenSa, isWritable: true, isSigner: false },
            { pubkey: saAuthority, isWritable: false, isSigner: false },
            // Second hop
            { pubkey: RAYDIUM_AMM_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: saAuthority, isWritable: false, isSigner: false },
            { pubkey: wsolTokenSa, isWritable: true, isSigner: false },
            { pubkey: rayTokenSa, isWritable: true, isSigner: false },
            { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: rayWsolPool, isWritable: false, isSigner: false },
            { pubkey: ammAuthority, isWritable: false, isSigner: false },
            { pubkey: rayWsolPool, isWritable: true, isSigner: false },
            { pubkey: rayWsolPool, isWritable: true, isSigner: false },
            { pubkey: poolBRayVault, isWritable: true, isSigner: false },
            { pubkey: poolBWsolVault, isWritable: true, isSigner: false },
            { pubkey: rayWsolPool, isWritable: false, isSigner: false },
            { pubkey: rayWsolPool, isWritable: false, isSigner: false },
            { pubkey: rayWsolPool, isWritable: false, isSigner: false },
            { pubkey: rayWsolPool, isWritable: false, isSigner: false },
            { pubkey: rayWsolPool, isWritable: false, isSigner: false },
            { pubkey: wsolTokenSa, isWritable: true, isSigner: false },
            { pubkey: rayTokenSa, isWritable: true, isSigner: false },
            { pubkey: saAuthority, isWritable: false, isSigner: false },
        ])
        .instruction();

    // Get the lookup table account
    const lookupTableAddress = new PublicKey("H552XofEfDwi9HrmmWQnHe9Aqpoo6BvuU7U6nwsMxU2c");
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
