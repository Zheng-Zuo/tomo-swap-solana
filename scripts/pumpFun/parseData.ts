import dotenv from "dotenv";
import {
    Connection,
    clusterApiUrl,
    PublicKey,
    SystemProgram,
    ComputeBudgetProgram,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { loadKeypairFromFile } from "../utils";
import { DEFAULT_DECIMALS, PumpFunSDK } from "pumpdotfun-sdk";

dotenv.config();

async function main() {
    const connection = new Connection(clusterApiUrl("mainnet-beta"));
    const owner = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const wallet = new Wallet(owner);
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const pumpFunSdk = new PumpFunSDK(provider);

    // const globalAccount = await pumpFunSdk.getGlobalAccount();
    // console.log(globalAccount);
    const tokenMint = new PublicKey("7en49n4riBnBX58wt7AhJXzEWPU1D4y2vYxjw3YZpump");
    let bondingCurveAccount = await pumpFunSdk.getBondingCurveAccount(tokenMint);
    console.log(bondingCurveAccount);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// Global Account
// initialVirtualTokenReserves: 1073000000000000n,
// initialVirtualSolReserves: 30000000000n,
// initialRealTokenReserves: 793100000000000n,
// tokenTotalSupply: 1000000000000000n,
// feeBasisPoints: 95n
