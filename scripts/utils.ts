import {
    Connection,
    Keypair,
    TransactionSignature,
    SignatureStatus,
    TransactionConfirmationStatus,
    TransactionInstruction,
    VersionedTransaction,
    TransactionMessage,
    PublicKey,
} from "@solana/web3.js";
import fs from "fs";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const POOL_TICK_ARRAY_BITMAP_SEED = Buffer.from("pool_tick_array_bitmap_extension", "utf8");

export function getPdaExBitmapAccount(
    programId: PublicKey,
    poolId: PublicKey
): {
    publicKey: PublicKey;
    nonce: number;
} {
    const [publicKey, nonce] = PublicKey.findProgramAddressSync(
        [POOL_TICK_ARRAY_BITMAP_SEED, poolId.toBuffer()],
        programId
    );
    return { publicKey, nonce };
}

export async function confirmTransaction(
    connection: Connection,
    signature: TransactionSignature,
    desiredConfirmationStatus: TransactionConfirmationStatus = "confirmed",
    timeout: number = 30000,
    pollInterval: number = 1000,
    searchTransactionHistory: boolean = false
): Promise<SignatureStatus> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const { value: statuses } = await connection.getSignatureStatuses([signature], { searchTransactionHistory });

        if (!statuses || statuses.length === 0) {
            throw new Error("Failed to get signature status");
        }

        const status = statuses[0];

        if (status === null) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
            continue;
        }

        if (status.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }

        if (status.confirmationStatus && status.confirmationStatus === desiredConfirmationStatus) {
            return status;
        }

        if (status.confirmationStatus === "finalized") {
            return status;
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
}

export function explorerURL({
    address,
    txSignature,
    cluster,
}: {
    address?: string;
    txSignature?: string;
    cluster?: "devnet" | "testnet" | "mainnet" | "mainnet-beta";
}) {
    let baseUrl: string;
    //
    if (address) baseUrl = `https://explorer.solana.com/address/${address}`;
    else if (txSignature) baseUrl = `https://explorer.solana.com/tx/${txSignature}`;
    else return "[unknown]";

    // auto append the desired search params
    const url = new URL(baseUrl);
    url.searchParams.append("cluster", cluster || "devnet");
    return url.toString() + "\n";
}

export function loadKeypairFromFile(absPath: string) {
    try {
        if (!absPath) throw Error("No path provided");
        if (!fs.existsSync(absPath)) throw Error("File does not exist.");

        // load the keypair from the file
        const keyfileBytes = JSON.parse(fs.readFileSync(absPath, { encoding: "utf-8" }));
        // parse the loaded secretKey into a valid keypair
        const keypair = Keypair.fromSecretKey(new Uint8Array(keyfileBytes));
        return keypair;
    } catch (err) {
        // return false;
        throw err;
    }
}

export async function buildTransaction({
    connection,
    payer,
    signers,
    instructions,
}: {
    connection: Connection;
    payer: PublicKey;
    signers: Keypair[];
    instructions: TransactionInstruction[];
}): Promise<VersionedTransaction> {
    let blockhash = await connection.getLatestBlockhash().then((res) => res.blockhash);

    const messageV0 = new TransactionMessage({
        payerKey: payer,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);

    signers.forEach((s) => tx.sign([s]));

    return tx;
}

export function printConsoleSeparator(message?: string) {
    console.log("\n===============================================");
    console.log("===============================================\n");
    if (message) console.log(message);
}

export async function extractSignatureFromFailedTransaction(connection: Connection, err: any, fetchLogs?: boolean) {
    if (err?.signature) return err.signature;

    // extract the failed transaction's signature
    const failedSig = new RegExp(/^((.*)?Error: )?(Transaction|Signature) ([A-Z0-9]{32,}) /gim).exec(
        err?.message?.toString()
    )?.[4];

    // ensure a signature was found
    if (failedSig) {
        // when desired, attempt to fetch the program logs from the cluster
        if (fetchLogs)
            await connection
                .getTransaction(failedSig, {
                    maxSupportedTransactionVersion: 0,
                })
                .then((tx) => {
                    console.log(`\n==== Transaction logs for ${failedSig} ====`);
                    console.log(explorerURL({ txSignature: failedSig }), "");
                    console.log(tx?.meta?.logMessages ?? "No log messages provided by RPC");
                    console.log(`==== END LOGS ====\n`);
                });
        else {
            console.log("\n========================================");
            console.log(explorerURL({ txSignature: failedSig }));
            console.log("========================================\n");
        }
    }

    // always return the failed signature value
    return failedSig;
}
