import dotenv from "dotenv";
import yargs from "yargs/yargs";
import {
    Keypair,
    SystemProgram,
    PublicKey,
    Connection,
    clusterApiUrl,
    ComputeBudgetProgram,
    AddressLookupTableProgram,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
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

function getOptions() {
    const options = yargs(process.argv.slice(2)).option("network", {
        type: "string",
        describe: "network",
        default: "devnet",
    });
    return options.argv;
}

const TOMO_SWAP_PROGRAM_ID = new PublicKey("2wBwrUoe2Jw4EL4WU26VwGkjFJ52SSPT1dGxcV1YyTmj");
const RAYDIUM_AMM_PROGRAM_ID = new PublicKey("HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8");
const TOKEN_A_MINT = new PublicKey("zzTXH9dZyEsNRjcD6t6ksW7oepJ4Wz4f36G9uWt3hb4");
const TOKEN_B_MINT = new PublicKey("5RW6VG7iQ1UswfpAHceGD36UyU14i4dsiphSBqHL3hct");
const TOKEN_C_MINT = new PublicKey("DNqbR2wLMRaFwhq6o5LQr7LLgpgYVcngEC3zFxdpdSbC");

const ammId = new PublicKey("3L4M4ZuTxmUtCLjoQF5QJM3yNLrfAC6HrAgBDSTmBSos");
const ammAuthority = new PublicKey("DbQqP6ehDYmeYjcBaMRuA8tAJY1EjDUz9DpwSLjaQqfC");
const ammOpenOrders = new PublicKey("7DcsaAqcFx8DSS5mfEwCuNbbG7sUa7yDozubtaMRiuLK");
const ammTargetOrders = new PublicKey("B7HQjFLkKwva7ej6KHDbqQU5NzgVcnbk57k8f6g7MSi1");
const poolCoinTokenAccount = new PublicKey("ELGRMuTGQvFPwSLzKowEXnmz2DsGdQmmb2aAfC3qsQwz");
const poolPcTokenAccount = new PublicKey("GTDpUXuLxdjZaaGYMsXnRKYnPnsbAJSy1eZpjHAwmat2");
const serumProgramId = new PublicKey("EoTcMgcDRTJVZDMZWBoU6rhYHZfkNTVEAfz3uUJRcYGj");
const serumMarket = new PublicKey("95cfkXtsybmCJt6ExB9umWgpWis8xtkQX1dqooczVwp3");

const serumBids = new PublicKey("D6rw9ykQhM5bqGXRVqcXJxBSg2mx7YLBVF1bBQH7Nqv1");
const serumAsks = new PublicKey("EnGUeKJvirDJPCUX1Ehh8yRst2k8Lo5WeqRqnACusVJq");
const serumEventQueue = new PublicKey("7cw5h7sD5pZ3B1cxUfCoA15pxiUbGZRJ3xCM7hVgBNdD");
const serumCoinVaultAccount = new PublicKey("HyrDBShyVLrvq9DkDXVa7R1WhXmJpaQms52GkQu1vHJH");
const serumPcVaultAccount = new PublicKey("Ek6vHGwrnd5j1GZjBYPzuETJ4KDGUgn4AavMGLJQNZZ7");

const RAYDIUM_CPMM_PROGRAM_ID = new PublicKey("CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW");
const cpSwapAuthority = new PublicKey("7rQ1QFNosMkUCuh7Z7fPbTHvh73b68sQYdirycEzJVuw");
const ammConfig = new PublicKey("9zSzfkYy6awexsHvmggeH36pfVUdDGyCcwmjT3AQPBj6");
const poolState = new PublicKey("5JLTwsJcn1BmGTv4xXSD48M4FT9zNm5z6nXN1hpesCsE");
const inputVault = new PublicKey("BN5nzgucviLtPuG3MjPxGVwEiiRTnJ19NHdxiic3ibs6");
const outputVault = new PublicKey("C1CycVscz2ZeKHmwo853j8XMfNQfzHkm3bGXtZWkLLdP");
const observationState = new PublicKey("2ar8AD8Uf7mQRtoLZLB9iKyR7oPgUT1QgP5XHHA2JyPV");

// const saAuthority = new PublicKey("4kuEgnKNptMVvXiVSfeZqqHg4imeL3hRgU2DViCpN5vY");
// TokenA：zzTXH9dZyEsNRjcD6t6ksW7oepJ4Wz4f36G9uWt3hb4
// TokenB：5RW6VG7iQ1UswfpAHceGD36UyU14i4dsiphSBqHL3hct
// TokenC: DNqbR2wLMRaFwhq6o5LQr7LLgpgYVcngEC3zFxdpdSbC
// TokenD: DaNj4ydkshkWHP94xGv7W6c1MuVRUvoHPjCcibUSagke

// amm pool created! txId:  4hJUC8vTujvZj3SnEXUsev3bSdG6BMLyWnkBKfmyi1pDtScAoZLf3pLxeAdn6TaqNPEnEnaPeAmE6shQtzZ9X8h9 , poolKeys: {
//     programId: 'HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8',
//     ammId: '3L4M4ZuTxmUtCLjoQF5QJM3yNLrfAC6HrAgBDSTmBSos',
//     ammAuthority: 'DbQqP6ehDYmeYjcBaMRuA8tAJY1EjDUz9DpwSLjaQqfC',
//     ammOpenOrders: '7DcsaAqcFx8DSS5mfEwCuNbbG7sUa7yDozubtaMRiuLK',
//     lpMint: 'Ha33RT6QLLozmi3HuBgMjskma9bXyMR2Rxy77pbxwozg',
//     coinMint: 'zzTXH9dZyEsNRjcD6t6ksW7oepJ4Wz4f36G9uWt3hb4',
//     pcMint: '5RW6VG7iQ1UswfpAHceGD36UyU14i4dsiphSBqHL3hct',
//     coinVault: 'ELGRMuTGQvFPwSLzKowEXnmz2DsGdQmmb2aAfC3qsQwz',
//     pcVault: 'GTDpUXuLxdjZaaGYMsXnRKYnPnsbAJSy1eZpjHAwmat2',
//     withdrawQueue: 'F2gAvtsdkF1jgBr6g2zCzmWmxL9JzYxTVRpCJ3pWkq6w',
//     ammTargetOrders: 'B7HQjFLkKwva7ej6KHDbqQU5NzgVcnbk57k8f6g7MSi1',
//     poolTempLp: 'CYWCnwfZSiN2yiJWaJtBnBXvohvEMkzY1WegSZELMQju',
//     marketProgramId: 'EoTcMgcDRTJVZDMZWBoU6rhYHZfkNTVEAfz3uUJRcYGj',
//     marketId: '95cfkXtsybmCJt6ExB9umWgpWis8xtkQX1dqooczVwp3',
//     ammConfigId: '8QN9yfKqWDoKjvZmqFsgCzAqwZBQuzVVnC388dN5RCPo',
//     feeDestinationId: '3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR'
// }

// create market total 2 txs, market info:  {
//     marketId: '95cfkXtsybmCJt6ExB9umWgpWis8xtkQX1dqooczVwp3',
//     requestQueue: 'Cqg4RhrL9YnNB8rsaqfsxYfEjKHotYvnvgi7wr9VMgoR',
//     eventQueue: '7cw5h7sD5pZ3B1cxUfCoA15pxiUbGZRJ3xCM7hVgBNdD',
//     bids: 'D6rw9ykQhM5bqGXRVqcXJxBSg2mx7YLBVF1bBQH7Nqv1',
//     asks: 'EnGUeKJvirDJPCUX1Ehh8yRst2k8Lo5WeqRqnACusVJq',
//     baseVault: 'HyrDBShyVLrvq9DkDXVa7R1WhXmJpaQms52GkQu1vHJH',
//     quoteVault: 'Ek6vHGwrnd5j1GZjBYPzuETJ4KDGUgn4AavMGLJQNZZ7',
//     baseMint: 'zzTXH9dZyEsNRjcD6t6ksW7oepJ4Wz4f36G9uWt3hb4',
//     quoteMint: '5RW6VG7iQ1UswfpAHceGD36UyU14i4dsiphSBqHL3hct'
// }

// pool created {
// txId: 'ag8yaGuMVnads65qbFvQ4t1KTFx2iPRrB9ThLsJ1SGC7U3hq3Bbzd4qQRru7pT6K7iEUmCWTmj1g8fUj1zf753M',
// poolKeys: {
//     poolId: '5JLTwsJcn1BmGTv4xXSD48M4FT9zNm5z6nXN1hpesCsE',
//     configId: '9zSzfkYy6awexsHvmggeH36pfVUdDGyCcwmjT3AQPBj6',
//     authority: '7rQ1QFNosMkUCuh7Z7fPbTHvh73b68sQYdirycEzJVuw',
//     lpMint: 'GBffd6u18mD548RRfqCreSxHe4TebRkNAPJDK7vG8Gbz',
//     vaultA: 'BN5nzgucviLtPuG3MjPxGVwEiiRTnJ19NHdxiic3ibs6',
//     vaultB: 'C1CycVscz2ZeKHmwo853j8XMfNQfzHkm3bGXtZWkLLdP',
//     observationId: '2ar8AD8Uf7mQRtoLZLB9iKyR7oPgUT1QgP5XHHA2JyPV',
//     mintA: '[object Object]',
//     mintB: '[object Object]',
//     programId: 'CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW',
//     poolFeeAccount: 'G11FKBRaAkHAKuLCgLM6K6NUc9rTjPAznRCjZifrTQe2',
//     feeConfig: '[object Object]'
//     }
// }

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
    const destinationTokenAccount = await getAssociatedTokenAddress(TOKEN_C_MINT, wallet.publicKey);

    // Update the PDA derivation
    const [saAuthority] = PublicKey.findProgramAddressSync([Buffer.from("tomo_sa")], TOMO_SWAP_PROGRAM_ID);

    console.log("calculatedSaAuthority", saAuthority.toBase58());

    const tokenASa = await getAssociatedTokenAddress(
        TOKEN_A_MINT, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );
    console.log("tokenASa", tokenASa.toBase58());

    const tokenBSa = await getAssociatedTokenAddress(
        TOKEN_B_MINT, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );
    console.log("tokenBSa", tokenBSa.toBase58());

    const tokenCSa = await getAssociatedTokenAddress(
        TOKEN_C_MINT, // mint
        saAuthority, // owner
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID // programId
    );
    console.log("tokenCSa", tokenCSa.toBase58());

    // const sourceTokenSa = new PublicKey("HZzRDXu3AbjrSQ9593pvKaGzTGfDp1uiKLkhiQuaxYcU");
    // const destinationTokenSa = new PublicKey("FnuFXAd7dJ5gQQnm1ubGMxp9CMDfvvZMPTi2UxfTZUfg");

    const swapArgs: any = {
        amountIn: new BN(10000000000),
        expectAmountOut: new BN(1),
        minReturn: new BN(1),
        amounts: [new BN(10000000000)],
        routes: [
            [
                {
                    dexes: [{ raydiumSwap: {} }],
                    weights: Buffer.from([100]),
                },
                {
                    dexes: [{ raydiumCpmmSwap: {} }],
                    weights: Buffer.from([100]),
                },
            ],
        ],
    };

    // console.log(JSON.stringify(IDL.types, null, 2));

    const tx = await program.methods
        .proxySwap(swapArgs, new BN(0))
        .accounts({
            payer: payer.publicKey,
            sourceTokenAccount,
            destinationTokenAccount,
            sourceMint: TOKEN_A_MINT,
            destinationMint: TOKEN_C_MINT,
            saAuthority,
            sourceTokenSa: tokenASa,
            destinationTokenSa: tokenCSa,
            sourceTokenProgram: TOKEN_PROGRAM_ID,
            destinationTokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
            // First hop: Raydium AMM
            { pubkey: RAYDIUM_AMM_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: saAuthority, isWritable: true, isSigner: false },
            { pubkey: tokenASa, isWritable: true, isSigner: false },
            { pubkey: tokenBSa, isWritable: true, isSigner: false },
            { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: ammId, isWritable: true, isSigner: false },
            { pubkey: ammAuthority, isWritable: false, isSigner: false },
            { pubkey: ammId, isWritable: true, isSigner: false },
            { pubkey: ammId, isWritable: true, isSigner: false },
            { pubkey: poolCoinTokenAccount, isWritable: true, isSigner: false },
            { pubkey: poolPcTokenAccount, isWritable: true, isSigner: false },
            { pubkey: ammId, isWritable: false, isSigner: false },
            { pubkey: ammId, isWritable: true, isSigner: false },
            { pubkey: ammId, isWritable: true, isSigner: false },
            { pubkey: ammId, isWritable: true, isSigner: false },
            { pubkey: ammId, isWritable: true, isSigner: false },
            { pubkey: tokenASa, isWritable: true, isSigner: false },
            { pubkey: tokenBSa, isWritable: true, isSigner: false },
            { pubkey: saAuthority, isWritable: true, isSigner: false },

            // Second hop: Raydium CPMM
            { pubkey: RAYDIUM_CPMM_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: saAuthority, isWritable: true, isSigner: false },
            { pubkey: tokenBSa, isWritable: true, isSigner: false },
            { pubkey: tokenCSa, isWritable: true, isSigner: false },
            { pubkey: cpSwapAuthority, isWritable: false, isSigner: false },
            { pubkey: ammConfig, isWritable: false, isSigner: false },
            { pubkey: poolState, isWritable: true, isSigner: false },
            { pubkey: inputVault, isWritable: true, isSigner: false },
            { pubkey: outputVault, isWritable: true, isSigner: false },
            { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
            { pubkey: TOKEN_B_MINT, isWritable: false, isSigner: false },
            { pubkey: TOKEN_C_MINT, isWritable: false, isSigner: false },
            { pubkey: observationState, isWritable: true, isSigner: false },
        ])
        .instruction();

    // Get the lookup table account
    const lookupTableAddress = new PublicKey("8PVRoj4iYgzM9URgmhBRzonvtH274v8UvEUNZjso6uQP");
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

// Transaction hash: 6wnmwjdngtEa7ArwbfiW9hBhJhDy4VfdTdnvsTfDeWx2tz6SJojVGtgzaS5mC6PNkYHkkoa2ERT1jG6tkPEdxkU
