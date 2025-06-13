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
    const options = yargs(process.argv.slice(2))
        .option("network", {
            type: "string",
            describe: "network",
            default: "mainnet-beta",
        })
        .option("alt", {
            type: "string",
            describe: "alt address",
            default: "fyitLuAPMKBYHEJ6kSLKCyfaZUnLYJW6m1BtK25MDts",
        });
    return options.argv;
}

const poolAddress = new PublicKey("5yuefgbJJpmFNK2iiYbLSpv1aZXq7F9AUKkZKErTYCvs");
const aVault = new PublicKey("3ESUFCnRNgZ7Mn2mPPUMmXYaKU8jpnV9VtA17M7t2mHQ");
const bVault = new PublicKey("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT");

const aTokenVault = new PublicKey("C2QoQ111jGHEy5918XkNXQro7gGwC9PKLXd1LqBiYNwA");
const bTokenVault = new PublicKey("HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG");

const aVaultLpMint = new PublicKey("3RpEekjLE5cdcG15YcXJUpxSepemvq2FpmMcgo342BwC");
const bVaultLpMint = new PublicKey("FZN7QZ8ZUUAxMPfxYEYkH3cXUASzH8EqA6B4tyCL8f1j");

const aVaultLp = new PublicKey("CNc2A5yjKUa9Rp3CVYXF9By1qvRHXMncK9S254MS9JeV");
const bVaultLp = new PublicKey("7LHUMZd12RuanSXhXjQWPSXS6QEVQimgwxde6xYTJuA7");

const protocolTokenAFee = new PublicKey("3YWmQzX9gm6EWLx72f7EUVWiVsWm1y8JzfJvTdRJe8v6");
const protocolTokenBFee = new PublicKey("5YMJwb6z56NJh4QxgXULJsoUZLb4mFHwpUMfNxJ5KhaZ");

const vaultProgram = new PublicKey("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi");

async function main() {
    let options: any = getOptions();
    const network = options.network;
    const lookupTableAddress = new PublicKey(options.alt);
    const connection = new Connection(clusterApiUrl(network), "confirmed");
    const payer = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const slot = await connection.getSlot();

    const inputVault = new PublicKey("DzC9LLGx7k3tvtrvt773ZL1J8SpQWrrFEG1kcLpDgpVD");
    const outputVault = new PublicKey("5s35HpCmrNvQbi6eGd8AUwHZvrh56DJJARHzFrDAwngu");

    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: payer.publicKey,
        authority: payer.publicKey,
        lookupTable: lookupTableAddress,
        addresses: [
            // poolAddress,
            // aVault,
            // bVault,
            // aTokenVault,
            // bTokenVault,
            // aVaultLpMint,
            // bVaultLpMint,
            // aVaultLp,
            // bVaultLp,
            // protocolTokenAFee,
            // protocolTokenBFee,
            // vaultProgram,
            inputVault,
            outputVault
        ],
    });

    const tx = new Transaction().add(extendInstruction);
    const txHash = await connection.sendTransaction(tx, [payer]);
    console.log("txHash", txHash);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// txHash 2gmMmFUHFDhbDkpCXvEeC2DqyzXDk9GhLxqZT1NEBpmNt6joGPt9Q2MvxVYXjzRHbmYUhjDgKUi8eUXTpywfMDoq
