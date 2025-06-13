import dotenv from "dotenv";
import yargs from "yargs/yargs";
import { Keypair, SystemProgram, PublicKey, Connection, clusterApiUrl } from "@solana/web3.js";
import { IDL } from "../../target/types/tomo_swap";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import {
    loadKeypairFromFile,
    explorerURL,
    buildTransaction,
    printConsoleSeparator,
    extractSignatureFromFailedTransaction,
} from "../utils";

dotenv.config();

async function main() {
    // const [calculatedSaAuthority, bump] = PublicKey.findProgramAddressSync(
    //     [Buffer.from("okx_sa")],
    //     new PublicKey("6m2CDdhRgxpH4WjvdzxAYbGxwdGUz5MziiL5jek2kBma")
    // );
    // console.log("calculatedSaAuthority", calculatedSaAuthority.toBase58());
    // console.log("bump", bump);

    const [calculatedSaAuthority, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from("tomo_sa")],
        new PublicKey("Tomo4qKVvw3a6A6Yxrr7XZHVbxR7uXEk5xeR7XqN7Kr")
    );
    console.log("calculatedSaAuthority", calculatedSaAuthority.toBase58());
    console.log("bump", bump);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// calculatedSaAuthority 9j2uoeU3hF9isyCa1NVibfe9bMCc6ss2VT1VZ3aEeY1N
// bump 255
