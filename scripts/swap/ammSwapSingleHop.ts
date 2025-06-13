import dotenv from "dotenv";
import yargs from "yargs/yargs";
import { Keypair, SystemProgram, PublicKey, Connection, clusterApiUrl, ComputeBudgetProgram } from "@solana/web3.js";
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
const TOKEN_A_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const TOKEN_B_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const ammId = new PublicKey("58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"); // SOL-USDC
const ammAuthority = new PublicKey("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1");
const poolCoinTokenAccount = new PublicKey("DQyrAcCrDXQ7NeoqGgDCZwBvWDcYmFCjSb9JtteuvPpz");
const poolPcTokenAccount = new PublicKey("HLmqeL62xR1QoZ1HKKbXRrdN1p3phKpxRMb2VVopvBBz");

async function main() {
    let options: any = getOptions();
    const network = options.network;

    const connection = new Connection(clusterApiUrl(network), "confirmed");
    const payer = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const wallet = new Wallet(payer);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

    const program = new Program(IDL, TOMO_SWAP_PROGRAM_ID, provider);

    // Get token accounts
    const sourceTokenAccount = await getAssociatedTokenAddress(TOKEN_A_MINT, wallet.publicKey);
    const destinationTokenAccount = await getAssociatedTokenAddress(TOKEN_B_MINT, wallet.publicKey);

    // Update the PDA derivation
    const [saAuthority] = PublicKey.findProgramAddressSync([Buffer.from("tomo_sa")], TOMO_SWAP_PROGRAM_ID);

    console.log("calculatedSaAuthority", saAuthority.toBase58());

    const sourceTokenSa = await getAssociatedTokenAddress(
        TOKEN_A_MINT, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );
    console.log("sourceTokenSa", sourceTokenSa.toBase58());

    const destinationTokenSa = await getAssociatedTokenAddress(
        TOKEN_B_MINT, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );
    console.log("destinationTokenSa", destinationTokenSa.toBase58());

    const swapArgs: any = {
        amountIn: new BN(10000000),
        expectAmountOut: new BN(100),
        minReturn: new BN(100),
        amounts: [new BN(10000000)],
        routes: [
            [
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
            sourceTokenAccount,
            destinationTokenAccount,
            sourceMint: TOKEN_A_MINT,
            destinationMint: TOKEN_B_MINT,
            saAuthority,
            sourceTokenSa,
            destinationTokenSa,
            sourceTokenProgram: TOKEN_PROGRAM_ID,
            destinationTokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
            { pubkey: RAYDIUM_AMM_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: saAuthority, isWritable: false, isSigner: false },
            { pubkey: sourceTokenSa, isWritable: true, isSigner: false },
            { pubkey: destinationTokenSa, isWritable: true, isSigner: false },
            { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: ammId, isWritable: false, isSigner: false },
            { pubkey: ammAuthority, isWritable: false, isSigner: false },
            { pubkey: ammId, isWritable: true, isSigner: false },
            { pubkey: ammId, isWritable: true, isSigner: false },
            { pubkey: poolCoinTokenAccount, isWritable: true, isSigner: false },
            { pubkey: poolPcTokenAccount, isWritable: true, isSigner: false },
            { pubkey: ammId, isWritable: false, isSigner: false },
            { pubkey: ammId, isWritable: false, isSigner: false },
            { pubkey: ammId, isWritable: false, isSigner: false },
            { pubkey: ammId, isWritable: false, isSigner: false },
            { pubkey: ammId, isWritable: false, isSigner: false },
            { pubkey: sourceTokenSa, isWritable: true, isSigner: false },
            { pubkey: destinationTokenSa, isWritable: true, isSigner: false },
            { pubkey: saAuthority, isWritable: false, isSigner: false },
        ])
        .preInstructions([
            ComputeBudgetProgram.setComputeUnitLimit({
                units: 400_000, // Increase compute unit limit
            }),
        ])
        .rpc();

    console.log("Swap transaction:", tx);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
