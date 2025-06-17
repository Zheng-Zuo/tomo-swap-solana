import { setProvider, Program, Wallet } from "@coral-xyz/anchor";
import { TomoSwap, IDL } from "../../target/types/tomo_swap";
import { AddedAccount, AddedProgram, BanksClient, ProgramTestContext, startAnchor } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { assert, expect } from "chai";
import { PublicKey, Keypair, Connection, clusterApiUrl, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import {
    AccountLayout,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    NATIVE_MINT,
    createInitializeAccountInstruction,
    createSyncNativeInstruction,
    createCloseAccountInstruction,
} from "@solana/spl-token";
import { createAndProcessVersionedTransaction } from "../bankrunHepler";
import { loadKeypairFromFile } from "../../scripts/utils";
import BN from "bn.js";
import dotenv from "dotenv";

dotenv.config();

const tomoSwapProgramId = new PublicKey("Tomo4qKVvw3a6A6Yxrr7XZHVbxR7uXEk5xeR7XqN7Kr");
const projectDirectory = "";

const pumpFunProgramId = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const tokenMint = new PublicKey("7en49n4riBnBX58wt7AhJXzEWPU1D4y2vYxjw3YZpump");
const payerAta = new PublicKey("9wBaLGg4LihA9bYJ7Qrprc6JtzKnY1GBCMkLMc7uUfvX");
const global = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
const protocolFeeRecipient = new PublicKey("62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV");
const bondingCurve = new PublicKey("ARPciSfxEJXyRjNWuzpebAv5EAkgY2eguDfizPNV8UZx");
const associatedBondingCurve = new PublicKey("GtbgE87Lu8dT4tro5chyjYNyAt8tBvJ8Y1uRBuUX6WWL");
const creatorVault = new PublicKey("BxE6X4JgY2xN8arBYBCMmagMfXSbQSEWFRFufExJwvE3");
const eventAuthority = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");

async function forkAccounts(connection: Connection, addresses: PublicKey[]): Promise<AddedAccount[]> {
    const accounts: AddedAccount[] = [];

    for (const address of addresses) {
        const accountInfo = await connection.getAccountInfo(address);
        if (accountInfo) {
            accounts.push({ address, info: accountInfo });
        } else {
            console.warn(`Account ${address.toBase58()} not found on mainnet`);
        }
    }

    return accounts;
}

describe("Pumpfun Buy Tests", () => {
    let context: ProgramTestContext;
    let client: BanksClient;
    let payer: Keypair;
    let provider: BankrunProvider;
    let tomoSwapProgram: Program<TomoSwap>;
    let connection: Connection;

    before(async () => {
        connection = new Connection(clusterApiUrl("mainnet-beta"));
        // const connection = new Connection(process.env.MAINNET_RPC_URL!);

        payer = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);

        const accountsToFork = [
            payer.publicKey,
            tokenMint,
            payerAta,
            global,
            protocolFeeRecipient,
            bondingCurve,
            associatedBondingCurve,
            creatorVault,
            eventAuthority,
        ];

        const forkedAccounts = await forkAccounts(connection, accountsToFork);

        const programsToFork: AddedProgram[] = [
            {
                name: "pump_fun",
                programId: pumpFunProgramId,
            },
        ];

        context = await startAnchor(projectDirectory, programsToFork, forkedAccounts);
        client = context.banksClient;

        provider = new BankrunProvider(context);
        provider.wallet = new Wallet(payer);
        setProvider(provider);
        tomoSwapProgram = new Program<TomoSwap>(IDL, tomoSwapProgramId, provider);
    });

    describe("Check initial states", () => {
        it("check payer's sol balance", async () => {
            const payerAccount = await client.getAccount(payer.publicKey);
            console.log(`payer's sol balance: ${payerAccount.lamports / LAMPORTS_PER_SOL}`);
        });

        it("check payer's token balance", async () => {
            const accountInfo = await client.getAccount(payerAta);
            const tokenAccountInfo = AccountLayout.decode(accountInfo.data);
            console.log(`payer's token balance before: ${tokenAccountInfo.amount}`);
        });
    });

    describe("Pumpfun swap test", () => {
        it("pumpfun buy with tomo swap", async () => {
            const inputAmount = new BN(10000);

            // Create temp WSOL account
            const seed = Date.now().toString();
            const sourceTokenAccount = await PublicKey.createWithSeed(payer.publicKey, seed, TOKEN_PROGRAM_ID);
            const rentExemption = await connection.getMinimumBalanceForRentExemption(165);

            // 1. Create account with seed
            const createAccountIx = SystemProgram.createAccountWithSeed({
                fromPubkey: payer.publicKey,
                basePubkey: payer.publicKey,
                seed,
                newAccountPubkey: sourceTokenAccount,
                lamports: rentExemption,
                space: 165,
                programId: TOKEN_PROGRAM_ID,
            });

            // 2. Transfer SOL to the account
            const transferIx = SystemProgram.transfer({
                fromPubkey: payer.publicKey,
                toPubkey: sourceTokenAccount,
                lamports: BigInt(inputAmount.toString()),
            });

            // 3. Initialize as WSOL account
            const initAccountIx = createInitializeAccountInstruction(sourceTokenAccount, NATIVE_MINT, payer.publicKey);

            // 4. Sync native
            const syncNativeIx = createSyncNativeInstruction(sourceTokenAccount);

            const minAmountOut = new BN(1);

            const swapArgs: any = {
                amountIn: inputAmount,
                expectAmountOut: minAmountOut,
                minReturn: minAmountOut,
                amounts: [inputAmount],
                routes: [
                    [
                        {
                            dexes: [{ pumpfunBuy: {} }],
                            weights: Buffer.from([100]),
                        },
                    ],
                ],
            };

            const [saAuthority] = PublicKey.findProgramAddressSync([Buffer.from("tomo_sa")], tomoSwapProgramId);

            const keys = [
                { pubkey: pumpFunProgramId, isWritable: false, isSigner: false }, // dex program id
                { pubkey: payer.publicKey, isWritable: true, isSigner: true }, // payer
                { pubkey: sourceTokenAccount, isWritable: true, isSigner: false }, // temp wsol account
                { pubkey: payerAta, isWritable: true, isSigner: false }, // destination token account
                { pubkey: global, isWritable: true, isSigner: false }, // global account
                { pubkey: protocolFeeRecipient, isWritable: true, isSigner: false }, // fee recipient
                { pubkey: tokenMint, isWritable: false, isSigner: false }, // token mint
                { pubkey: bondingCurve, isWritable: true, isSigner: false },
                { pubkey: associatedBondingCurve, isWritable: true, isSigner: false },
                { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
                { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
                { pubkey: creatorVault, isWritable: true, isSigner: false },
                { pubkey: eventAuthority, isWritable: false, isSigner: false },
            ];

            // 5. Create the swap instruction
            const buyTx = await tomoSwapProgram.methods
                .proxySwap(swapArgs, new BN(0))
                .accounts({
                    payer: payer.publicKey,
                    sourceTokenAccount,
                    destinationTokenAccount: payerAta,
                    sourceMint: NATIVE_MINT,
                    destinationMint: tokenMint,
                    saAuthority,
                    sourceTokenSa: null,
                    destinationTokenSa: null,
                    sourceTokenProgram: TOKEN_PROGRAM_ID,
                    destinationTokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .remainingAccounts(keys)
                .instruction();

            // All instructions in order
            const instructions = [createAccountIx, transferIx, initAccountIx, syncNativeIx, buyTx];

            // Execute the versioned transaction
            console.log("Executing pump.fun buy swap...");
            const txResult = await createAndProcessVersionedTransaction(client, payer, instructions);

            // Check if transaction succeeded
            expect(txResult.result).to.be.null;
            console.log("✅ Pump.fun buy swap executed successfully!");

            const accountInfo = await client.getAccount(payerAta);
            const tokenAccountInfo = AccountLayout.decode(accountInfo.data);
            console.log(`payer's token balance after: ${tokenAccountInfo.amount}`);
        });

        it("pumpfun sell with tomo swap", async () => {
            let payerAccount = await client.getAccount(payer.publicKey);
            console.log(`payer's sol balance before: ${payerAccount.lamports}`);

            const inputAmount = new BN(100000000000);

            // Create temp WSOL account
            const seed = Date.now().toString();
            const destinationTokenAccount = await PublicKey.createWithSeed(payer.publicKey, seed, TOKEN_PROGRAM_ID);
            const rentExemption = await connection.getMinimumBalanceForRentExemption(165);

            // 1. Create account with seed
            const createAccountIx = SystemProgram.createAccountWithSeed({
                fromPubkey: payer.publicKey,
                basePubkey: payer.publicKey,
                seed,
                newAccountPubkey: destinationTokenAccount,
                lamports: rentExemption,
                space: 165,
                programId: TOKEN_PROGRAM_ID,
            });

            // 2. Initialize as WSOL account
            const initAccountIx = createInitializeAccountInstruction(
                destinationTokenAccount,
                NATIVE_MINT,
                payer.publicKey
            );

            const minAmountOut = new BN(1);

            const swapArgs: any = {
                amountIn: inputAmount,
                expectAmountOut: minAmountOut,
                minReturn: minAmountOut,
                amounts: [inputAmount],
                routes: [
                    [
                        {
                            dexes: [{ pumpfunSell: {} }],
                            weights: Buffer.from([100]),
                        },
                    ],
                ],
            };

            const [saAuthority] = PublicKey.findProgramAddressSync([Buffer.from("tomo_sa")], tomoSwapProgramId);

            const keys = [
                { pubkey: pumpFunProgramId, isWritable: false, isSigner: false }, // dex program id
                { pubkey: payer.publicKey, isWritable: true, isSigner: true }, // payer
                { pubkey: payerAta, isWritable: true, isSigner: false }, // token ata
                { pubkey: destinationTokenAccount, isWritable: true, isSigner: false }, // temp wsol account
                { pubkey: global, isWritable: true, isSigner: false }, // global account
                { pubkey: protocolFeeRecipient, isWritable: true, isSigner: false }, // fee recipient
                { pubkey: tokenMint, isWritable: false, isSigner: false }, // token mint
                { pubkey: bondingCurve, isWritable: true, isSigner: false },
                { pubkey: associatedBondingCurve, isWritable: true, isSigner: false },
                { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
                { pubkey: creatorVault, isWritable: true, isSigner: false },
                { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
                { pubkey: eventAuthority, isWritable: false, isSigner: false },
            ];

            // 3. Sell
            const sellTx = await tomoSwapProgram.methods
                .proxySwap(swapArgs, new BN(0))
                .accounts({
                    payer: payer.publicKey,
                    sourceTokenAccount: payerAta,
                    destinationTokenAccount,
                    sourceMint: tokenMint,
                    destinationMint: NATIVE_MINT,
                    saAuthority,
                    sourceTokenSa: null, //
                    destinationTokenSa: null, //
                    sourceTokenProgram: TOKEN_PROGRAM_ID,
                    destinationTokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .remainingAccounts(keys)
                .instruction();

            // 4. Close the temp WSOL account and reclaim SOL
            const closeAccountIx = createCloseAccountInstruction(
                destinationTokenAccount,
                payer.publicKey,
                payer.publicKey
            );

            const instructions = [createAccountIx, initAccountIx, sellTx, closeAccountIx];

            // Execute the versioned transaction
            console.log("Executing pump.fun buy swap...");
            const txResult = await createAndProcessVersionedTransaction(client, payer, instructions);

            // Check if transaction succeeded
            expect(txResult.result).to.be.null;
            console.log("✅ Pump.fun buy swap executed successfully!");

            const accountInfo = await client.getAccount(payerAta);
            const tokenAccountInfo = AccountLayout.decode(accountInfo.data);
            console.log(`payer's token balance after: ${tokenAccountInfo.amount}`);

            payerAccount = await client.getAccount(payer.publicKey);
            console.log(`payer's sol balance after: ${payerAccount.lamports}`);
        });
    });
});
