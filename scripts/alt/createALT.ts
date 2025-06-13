import dotenv from "dotenv";
import yargs from "yargs/yargs";
import {
    SystemProgram,
    PublicKey,
    Connection,
    clusterApiUrl,
    AddressLookupTableProgram,
    Transaction,
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    NATIVE_MINT,
    NATIVE_MINT_2022,
    getAssociatedTokenAddress,
} from "@solana/spl-token";
import { loadKeypairFromFile, MEMO_PROGRAM_ID } from "../utils";

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
const RAYDIUM_CLMM_PROGRAM_ID = new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
const AMM_CONFIG = new PublicKey("3h2e43PunVA5K34vwKCLHWhZF4aZpyaC9RmxvshGAQpL");
const POOL_ID = new PublicKey("3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv"); // WSOL-USDC CLMM Pool
const A_VAULT = new PublicKey("4ct7br2vTPzfdmY3S5HLtTxcGSBfn6pnw98hsS6v359A"); // Token A Vault
const B_VAULT = new PublicKey("5it83u57VRrVgc51oNV19TTmAJuffPx5GtGwQr7gQNUo"); // Token B Vault
const OBSERVATION_ID = new PublicKey("3Y695CuQ8AP4anbwAqiEBeQF9KxqHFr8piEwvw3UePnQ"); // Observation ID
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Token A
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // Token B
const EX_BITMAP_ACCOUNT = new PublicKey("4NFvUKqknMpoe6CWTzK758B8ojVLzURL5pC6MtiaJ8TQ"); // Ex Bitmap Account

async function main() {
    let options: any = getOptions();
    const network = options.network;
    const connection = new Connection(clusterApiUrl(network), "confirmed");
    const payer = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const slot = await connection.getSlot();

    const [lookupTableInst, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
        authority: payer.publicKey,
        payer: payer.publicKey,
        recentSlot: slot,
    });

    console.log("lookup table address:", lookupTableAddress.toBase58());
    const tx = new Transaction().add(lookupTableInst);

    // Update the PDA derivation
    const [saAuthority] = PublicKey.findProgramAddressSync([Buffer.from("tomo_sa")], TOMO_SWAP_PROGRAM_ID);
    const wsolSa = await getAssociatedTokenAddress(
        WSOL_MINT, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );
    const usdcSa = await getAssociatedTokenAddress(
        USDC_MINT, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );

    // add addresses to the `lookupTableAddress` table via an `extend` instruction
    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: payer.publicKey,
        authority: payer.publicKey,
        lookupTable: lookupTableAddress,
        addresses: [
            // system and token programs
            SystemProgram.programId,
            TOKEN_PROGRAM_ID,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
            NATIVE_MINT,
            NATIVE_MINT_2022,
            // Raydium
            RAYDIUM_CLMM_PROGRAM_ID,
            // TomoSwap
            TOMO_SWAP_PROGRAM_ID,
            // TokenA
            WSOL_MINT,
            // TokenB
            USDC_MINT,
            // Tomo swap
            saAuthority,
            wsolSa,
            usdcSa,
            // CLMM
            AMM_CONFIG,
            POOL_ID,
            A_VAULT,
            B_VAULT,
            OBSERVATION_ID,
            EX_BITMAP_ACCOUNT,
        ],
    });

    tx.add(extendInstruction);

    const txHash = await connection.sendTransaction(tx, [payer]);
    console.log("txHash", txHash);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// lookup table address: fyitLuAPMKBYHEJ6kSLKCyfaZUnLYJW6m1BtK25MDts
// txHash 2AV2eCALs4E5Q3mxGMr6EtN9Tm8ygAByvjjDHjcR6j7XjSw3kiA7YwUz9BYySRifzaBcHq6txV2DHq2hPUk8YLBs
