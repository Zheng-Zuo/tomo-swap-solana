import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { IDL } from "../../../tests/types/raydium_cp_swap";
import dotenv from "dotenv";

dotenv.config();

const PROGRAM_ID = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");

async function main() {
    const connection = new Connection(process.env.MAINNET_RPC_URL!, "confirmed");

    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(anchor.web3.Keypair.generate()), {
        commitment: "confirmed",
    });

    const program = new Program(IDL, PROGRAM_ID, provider);
    const ammConfigs = await program.account.ammConfig.all();

    console.log(`Found ${ammConfigs.length} AMM configs`);

    // Sort by index
    ammConfigs.sort((a, b) => a.account.index - b.account.index);

    for (const config of ammConfigs) {
        const {
            disableCreatePool,
            index,
            tradeFeeRate,
            protocolFeeRate,
            fundFeeRate,
            createPoolFee,
            protocolOwner,
            fundOwner,
        } = config.account;

        console.log("\n=== AMM Config ===");
        console.log(`Address: ${config.publicKey.toString()}`);
        console.log(`Index: ${index}`);
        console.log(`Disable Create Pool: ${disableCreatePool}`);
        console.log(`Trade Fee Rate: ${tradeFeeRate.toString()}`);
        console.log(`Protocol Fee Rate: ${protocolFeeRate.toString()}`);
        console.log(`Fund Fee Rate: ${fundFeeRate.toString()}`);
        console.log(`Create Pool Fee: ${createPoolFee.toString()}`);
        console.log(`Protocol Owner: ${protocolOwner.toString()}`);
        console.log(`Fund Owner: ${fundOwner.toString()}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

// Found 4 AMM configs

// === AMM Config ===
// Address: D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2
// Index: 0
// Disable Create Pool: false
// Trade Fee Rate: 2500
// Protocol Fee Rate: 120000
// Fund Fee Rate: 40000
// Create Pool Fee: 150000000
// Protocol Owner: ProCXqRcXJjoUd1RNoo28bSizAA6EEqt9wURZYPDc5u
// Fund Owner: FUNDduJTA7XcckKHKfAoEnnhuSud2JUCUZv6opWEjrBU

// === AMM Config ===
// Address: G95xxie3XbkCqtE39GgQ9Ggc7xBC8Uceve7HFDEFApkc
// Index: 1
// Disable Create Pool: false
// Trade Fee Rate: 10000
// Protocol Fee Rate: 120000
// Fund Fee Rate: 40000
// Create Pool Fee: 150000000
// Protocol Owner: ProCXqRcXJjoUd1RNoo28bSizAA6EEqt9wURZYPDc5u
// Fund Owner: FUNDduJTA7XcckKHKfAoEnnhuSud2JUCUZv6opWEjrBU

// === AMM Config ===
// Address: 2fGXL8uhqxJ4tpgtosHZXT4zcQap6j62z3bMDxdkMvy5
// Index: 2
// Disable Create Pool: false
// Trade Fee Rate: 20000
// Protocol Fee Rate: 120000
// Fund Fee Rate: 40000
// Create Pool Fee: 150000000
// Protocol Owner: ProCXqRcXJjoUd1RNoo28bSizAA6EEqt9wURZYPDc5u
// Fund Owner: FUNDduJTA7XcckKHKfAoEnnhuSud2JUCUZv6opWEjrBU

// === AMM Config ===
// Address: C7Cx2pMLtjybS3mDKSfsBj4zQ3PRZGkKt7RCYTTbCSx2
// Index: 3
// Disable Create Pool: false
// Trade Fee Rate: 40000
// Protocol Fee Rate: 120000
// Fund Fee Rate: 40000
// Create Pool Fee: 150000000
// Protocol Owner: ProCXqRcXJjoUd1RNoo28bSizAA6EEqt9wURZYPDc5u
// Fund Owner: FUNDduJTA7XcckKHKfAoEnnhuSud2JUCUZv6opWEjrBU
