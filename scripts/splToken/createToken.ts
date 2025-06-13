import dotenv from "dotenv";
import yargs from "yargs/yargs";
import { Keypair, SystemProgram, PublicKey, Connection, clusterApiUrl } from "@solana/web3.js";
import {
    MINT_SIZE,
    TOKEN_PROGRAM_ID,
    createInitializeMint2Instruction,
    createAssociatedTokenAccountInstruction,
    AuthorityType,
    createMintToInstruction,
    createSetAuthorityInstruction,
    getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
    PROGRAM_ID as METADATA_PROGRAM_ID,
    createCreateMetadataAccountV3Instruction,
} from "@metaplex-foundation/mpl-token-metadata";
import {
    loadKeypairFromFile,
    explorerURL,
    buildTransaction,
    printConsoleSeparator,
    extractSignatureFromFailedTransaction,
} from "../utils";

dotenv.config();

function getOptions() {
    const options = yargs(process.argv.slice(2))
        .option("network", {
            type: "string",
            describe: "network",
            default: "devnet",
        })
        .option("tokenName", {
            type: "string",
            describe: "token name",
            default: "TokenA",
        })
        .option("tokenSymbol", {
            type: "string",
            describe: "A",
            default: "A",
        })
        .option("tokenMaxSupply", {
            type: "number",
            describe: "max supply",
            default: 1_000_000_000,
        })
        .option("tokenUri", {
            type: "string",
            describe: "token uri",
            default: "https://www.tomoswaptest.com",
        });

    return options.argv;
}

async function main() {
    let options: any = getOptions();
    const network = options.network;
    const tokenName = options.tokenName;
    const tokenSymbol = options.tokenSymbol;
    const tokenUri = options.tokenUri;
    const tokenMaxSupply = options.tokenMaxSupply;
    console.log(
        `→ Creating Token │ Network: ${network} │ Name: ${tokenName} │ Symbol: ${tokenSymbol} | Max Supply: ${
            tokenMaxSupply / 1e6
        }M │ URI: ${tokenUri}`
    );

    const connection = new Connection(clusterApiUrl(network), "confirmed");
    const payer = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const mintKeypair = Keypair.generate();
    const decimals = 9;
    const mint = mintKeypair.publicKey;
    console.log("Mint public key:", mint.toBase58());

    // create instruction for the token mint account
    const createMintAccountInstruction = SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports: await connection.getMinimumBalanceForRentExemption(MINT_SIZE),
        programId: TOKEN_PROGRAM_ID,
    });

    // Initialize that account as a Mint
    const initializeMintInstruction = createInitializeMint2Instruction(mint, decimals, payer.publicKey, null);

    const [metadataAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mintKeypair.publicKey.toBuffer()],
        METADATA_PROGRAM_ID
    );

    const createMetadataInstruction = createCreateMetadataAccountV3Instruction(
        {
            metadata: metadataAccount,
            mint,
            mintAuthority: payer.publicKey,
            payer: payer.publicKey,
            updateAuthority: payer.publicKey,
        },
        {
            createMetadataAccountArgsV3: {
                data: {
                    creators: null,
                    name: tokenName,
                    symbol: tokenSymbol,
                    uri: tokenUri,
                    sellerFeeBasisPoints: 0,
                    collection: null,
                    uses: null,
                },
                // `collectionDetails` - for non-nft type tokens, normally set to `null` to not have a value set
                collectionDetails: null,
                // should the metadata be updatable?
                isMutable: true,
            },
        }
    );

    // Create associated token account for the payer
    const associatedTokenAccount = await getAssociatedTokenAddress(mintKeypair.publicKey, payer.publicKey);

    console.log("Associated token account address:", associatedTokenAccount.toBase58());

    const createATAInstruction = createAssociatedTokenAccountInstruction(
        payer.publicKey,
        associatedTokenAccount,
        payer.publicKey,
        mintKeypair.publicKey
    );

    // Create instruction to mint 10 billion tokens to the payer
    const mintAmount = BigInt(tokenMaxSupply) * BigInt(10 ** decimals);
    const mintToInstruction = createMintToInstruction(mint, associatedTokenAccount, payer.publicKey, mintAmount);

    // Create instruction to renounce mint authority
    const revokeMintAuthorityInstruction = createSetAuthorityInstruction(
        mint,
        payer.publicKey,
        AuthorityType.MintTokens,
        null
    );

    const tx = await buildTransaction({
        connection,
        payer: payer.publicKey,
        signers: [payer, mintKeypair],
        instructions: [
            createMintAccountInstruction,
            initializeMintInstruction,
            createMetadataInstruction,
            createATAInstruction,
            mintToInstruction,
            revokeMintAuthorityInstruction,
        ],
    });

    printConsoleSeparator();

    try {
        // actually send the transaction
        const sig = await connection.sendTransaction(tx);

        // print the explorer url
        console.log("Transaction completed.");
        console.log(explorerURL({ txSignature: sig, cluster: network }));

        // // locally save our addresses for the demo
        // savePublicKeyToFile("funTokenMint", mintKeypair.publicKey);
    } catch (err) {
        console.error("Failed to send transaction:");
        console.log(tx);

        // attempt to extract the signature from the failed transaction
        const failedSig = await extractSignatureFromFailedTransaction(connection, err);
        if (failedSig) console.log("Failed signature:", explorerURL({ txSignature: failedSig, cluster: network }));

        throw err;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// → Creating Token │ Network: devnet │ Name: TokenA │ Symbol: A | Max Supply: 1000M │ URI: https://www.tomoswaptest.com
// Mint public key: zzTXH9dZyEsNRjcD6t6ksW7oepJ4Wz4f36G9uWt3hb4
// Associated token account address: HZzRDXu3AbjrSQ9593pvKaGzTGfDp1uiKLkhiQuaxYcU

// ===============================================
// ===============================================

// Transaction completed.
// https://explorer.solana.com/tx/2V8eq6x69L69hoce4C2QVHV3KxZFMV9RcL1AnVFqrsJU5TNvhAyV8YVJfUofh3PkVxQqrzUVt5hRjSwvszeeu8rT?cluster=devnet

// → Creating Token │ Network: devnet │ Name: TokenB │ Symbol: B | Max Supply: 1000M │ URI: https://www.tomoswaptest.com
// Mint public key: 5RW6VG7iQ1UswfpAHceGD36UyU14i4dsiphSBqHL3hct
// Associated token account address: FnuFXAd7dJ5gQQnm1ubGMxp9CMDfvvZMPTi2UxfTZUfg

// ===============================================
// ===============================================

// Transaction completed.
// https://explorer.solana.com/tx/3BsXqT4T9MLy14KnHbahZ5tP9cwb3DhUpDgJBuhTLSw4gifVo1FP9fgQTxidJKUm1UrTbmWiguE539r5rhME7ULr?cluster=devnet

// → Creating Token │ Network: devnet │ Name: TokenC │ Symbol: C | Max Supply: 1000M │ URI: https://www.tomoswaptest.com
// Mint public key: DNqbR2wLMRaFwhq6o5LQr7LLgpgYVcngEC3zFxdpdSbC
// Associated token account address: GysaPJQCiL1k4RUsshtWHSPUfSht1LSeQsfU5LXsLoNt

// ===============================================
// ===============================================

// Transaction completed.
// https://explorer.solana.com/tx/59sey8E7NUdQMd5NrdrqVfyZ8zEPigkH6GCpXnEn9UnSpVHjoKRKq9EG4LaT3cVssusiAjHjAeyU6fH31zkaCk5o?cluster=devnet

// → Creating Token │ Network: devnet │ Name: TokenD │ Symbol: D | Max Supply: 1000M │ URI: https://www.tomoswaptest.com
// Mint public key: DaNj4ydkshkWHP94xGv7W6c1MuVRUvoHPjCcibUSagke
// Associated token account address: GH2tKDHCAGRUYs8rLBkjDedCXbmaPSBCu8tm2oeg9dt5

// ===============================================
// ===============================================

// Transaction completed.
// https://explorer.solana.com/tx/4LpoN12ysnPKHrBDn7FkFedAgFaRF9tXTQBiJhajqSSQHGuAwBpGQRwdEcB83ndUavYiYszP1NvcgjXT3mrW566V?cluster=devnet
