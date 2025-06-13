import dotenv from "dotenv";
import yargs from "yargs/yargs";
import { PublicKey, Connection, clusterApiUrl, AddressLookupTableProgram, Transaction } from "@solana/web3.js";
import { loadKeypairFromFile } from "../utils";

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
            describe: "alt",
            default: "H552XofEfDwi9HrmmWQnHe9Aqpoo6BvuU7U6nwsMxU2c",
        });
    return options.argv;
}

async function main() {
    let options: any = getOptions();
    const network = options.network;
    const alt = new PublicKey(options.alt);
    const connection = new Connection(clusterApiUrl(network), "confirmed");
    const payer = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);

    // const deactiveTx = AddressLookupTableProgram.deactivateLookupTable({
    //     lookupTable: alt,
    //     authority: payer.publicKey,
    // });

    // const tx = new Transaction().add(deactiveTx);

    const closeTx = AddressLookupTableProgram.closeLookupTable({
        lookupTable: alt,
        authority: payer.publicKey,
        recipient: payer.publicKey,
    });

    const tx = new Transaction().add(closeTx);

    const txHash = await connection.sendTransaction(tx, [payer]);
    console.log("txHash", txHash);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// https://solscan.io/account/52U6tSCei6YErcRLjM7myuXA6X54M2ecUuayc8o6d6L9
// https://solscan.io/account/H552XofEfDwi9HrmmWQnHe9Aqpoo6BvuU7U6nwsMxU2c
