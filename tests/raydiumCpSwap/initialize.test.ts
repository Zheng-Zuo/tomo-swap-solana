import { setProvider, Program, BN } from "@coral-xyz/anchor";
import { RaydiumCpSwap, IDL } from "../types/raydium_cp_swap";
import {
    AccountInfoBytes,
    AddedAccount,
    AddedProgram,
    BanksClient,
    BanksTransactionResultWithMeta,
    ProgramTestContext,
    startAnchor,
} from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { assert, expect } from "chai";
import {
    PublicKey,
    Transaction,
    Keypair,
    Connection,
    clusterApiUrl,
    TransactionInstruction,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
    ACCOUNT_SIZE,
    AccountLayout,
    getAssociatedTokenAddressSync,
    MintLayout,
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    NATIVE_MINT,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createAndProcessTransaction, setupATA } from "../bankrunHepler";
import {
    getAuthAddress,
    getPoolAddress,
    getPoolLpMintAddress,
    getPoolVaultAddress,
    getOrcleAccountAddress,
    parseUnits,
} from "./utils";
import dotenv from "dotenv";

dotenv.config();

// Constants
const CPMM_PROGRAM_ID = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
const PROJECT_DIRECTORY = ""; // Leave empty if using default anchor project

const AMM_CONFIG_0 = new PublicKey("D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2");
const POOL_FEE_RECEIVER = new PublicKey("DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8");

const WSOL_DECIMALS = 9;
const USDC_DECIMALS = 6;
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const INITIAL_USDC_BALANCE = 100_000_000_000; // 100k USDC
const INITIAL_WSOL_BALANCE = 100_000_000_000_000; // 100k WSOL

describe("Raydium CpSwap Initialize Tests", () => {
    let context: ProgramTestContext;
    let client: BanksClient;
    let payer: Keypair;
    let provider: BankrunProvider;
    let program: Program<RaydiumCpSwap>;

    let usdcAta: PublicKey;
    let wsolAta: PublicKey;

    before(async () => {
        const connection = new Connection(process.env.MAINNET_RPC_URL!);

        let accountInfo = await connection.getAccountInfo(USDC_MINT);
        const usdcAccount: AddedAccount = { address: USDC_MINT, info: accountInfo };

        accountInfo = await connection.getAccountInfo(AMM_CONFIG_0);
        const ammConfigAccount: AddedAccount = { address: AMM_CONFIG_0, info: accountInfo };

        accountInfo = await connection.getAccountInfo(POOL_FEE_RECEIVER);
        const poolFeeReceiverAccount: AddedAccount = { address: POOL_FEE_RECEIVER, info: accountInfo };

        const raydiumCpSwapProgram: AddedProgram = { name: "raydium_cp_swap", programId: CPMM_PROGRAM_ID };

        context = await startAnchor(
            PROJECT_DIRECTORY,
            [raydiumCpSwapProgram],
            [usdcAccount, ammConfigAccount, poolFeeReceiverAccount]
        );
        client = context.banksClient;
        payer = context.payer;
        provider = new BankrunProvider(context);
        setProvider(provider);
        usdcAta = await setupATA(context, USDC_MINT, payer.publicKey, INITIAL_USDC_BALANCE);
        wsolAta = await setupATA(context, NATIVE_MINT, payer.publicKey, INITIAL_WSOL_BALANCE, true);

        program = new Program<RaydiumCpSwap>(IDL, CPMM_PROGRAM_ID, provider);
    });

    describe("Check initial states", () => {
        it("should have initialized USDC ATA", async () => {
            const rawAccount = await client.getAccount(usdcAta);
            expect(rawAccount).to.exist;
        });

        it("should have enough wsol", async () => {
            const accountInfo = await client.getAccount(wsolAta);
            const tokenAccountInfo = AccountLayout.decode(accountInfo.data);
            expect(tokenAccountInfo.amount).to.equal(BigInt(INITIAL_WSOL_BALANCE));
        });

        it("should have correct balance in ATA", async () => {
            const accountInfo = await client.getAccount(usdcAta);
            const tokenAccountInfo = AccountLayout.decode(accountInfo.data);
            expect(tokenAccountInfo.amount).to.equal(BigInt(INITIAL_USDC_BALANCE));
        });

        it("should have correct amm config", async () => {
            const ammConfig = await program.account.ammConfig.fetch(AMM_CONFIG_0);
            assert.equal(ammConfig.disableCreatePool, false);
            assert.equal(ammConfig.tradeFeeRate.toString(), "2500");
        });
    });

    describe("Check create pool", () => {
        let auth: PublicKey;
        let token0: PublicKey;
        let token1: PublicKey;
        let poolState: PublicKey;
        let lpMint: PublicKey;
        let vault0: PublicKey;
        let vault1: PublicKey;
        let creatorLpTokenAccount: PublicKey;
        let observationAddress: PublicKey;
        let creatorToken0: PublicKey;
        let creatorToken1: PublicKey;

        const INITIAL_WSOL_RESERVE = parseUnits(10, WSOL_DECIMALS);
        const INITIAL_USDC_RESERVE = parseUnits(2000, USDC_DECIMALS);

        it("should create pool with config 0", async () => {
            [auth] = await getAuthAddress(program.programId);
            // Sort tokens by public key
            [token0, token1] = [USDC_MINT, NATIVE_MINT].sort((a, b) => a.toBuffer().compare(b.toBuffer()));
            // Get accounts
            [poolState] = await getPoolAddress(AMM_CONFIG_0, token0, token1, program.programId);
            [lpMint] = await getPoolLpMintAddress(poolState, program.programId);
            [vault0] = await getPoolVaultAddress(poolState, token0, program.programId);
            [vault1] = await getPoolVaultAddress(poolState, token1, program.programId);
            [creatorLpTokenAccount] = await PublicKey.findProgramAddressSync(
                [payer.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), lpMint.toBuffer()],
                ASSOCIATED_TOKEN_PROGRAM_ID
            );
            [observationAddress] = await getOrcleAccountAddress(poolState, program.programId);
            creatorToken0 = getAssociatedTokenAddressSync(token0, payer.publicKey, false, TOKEN_PROGRAM_ID);
            creatorToken1 = getAssociatedTokenAddressSync(token1, payer.publicKey, false, TOKEN_PROGRAM_ID);

            const initAmount: { initAmount0: BN; initAmount1: BN } = {
                initAmount0: token0.equals(NATIVE_MINT) ? INITIAL_WSOL_RESERVE : INITIAL_USDC_RESERVE,
                initAmount1: token1.equals(NATIVE_MINT) ? INITIAL_WSOL_RESERVE : INITIAL_USDC_RESERVE,
            };

            const ix = await program.methods
                .initialize(initAmount.initAmount0, initAmount.initAmount1, new BN(0))
                .accounts({
                    creator: payer.publicKey,
                    ammConfig: AMM_CONFIG_0,
                    authority: auth,
                    poolState,
                    token0Mint: token0,
                    token1Mint: token1,
                    lpMint,
                    creatorToken0: creatorToken0,
                    creatorToken1: creatorToken1,
                    creatorLpToken: creatorLpTokenAccount,
                    token0Vault: vault0,
                    token1Vault: vault1,
                    createPoolFee: POOL_FEE_RECEIVER,
                    observationState: observationAddress,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    token0Program: TOKEN_PROGRAM_ID,
                    token1Program: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: SYSVAR_RENT_PUBKEY,
                })
                .instruction();

            const txResult = await createAndProcessTransaction(client, payer, ix);
            expect(txResult.result).to.be.null; // transaction should succeed
        });

        it("should have correct pool state", async () => {
            const poolStateAccount = await program.account.poolState.fetch(poolState);
            const status = poolStateAccount.status as number;
            // console.log("Pool Status:", {
            //     isDepositEnabled: getStatusByBit(status, 0), // Deposit is bit 0
            //     isWithdrawEnabled: getStatusByBit(status, 1), // Withdraw is bit 1
            //     isSwapEnabled: getStatusByBit(status, 2), // Swap is bit 2
            // });
            assert.equal(status, 0);
            assert.equal(poolStateAccount.mint0Decimals, token0.equals(NATIVE_MINT) ? WSOL_DECIMALS : USDC_DECIMALS);
            assert.equal(poolStateAccount.mint1Decimals, token1.equals(NATIVE_MINT) ? WSOL_DECIMALS : USDC_DECIMALS);
            // console.log(poolStateAccount.openTime.toString());
        });

        it("should have correct reserves", async () => {
            const vault0Account = await client.getAccount(vault0);
            const vault1Account = await client.getAccount(vault1);
            const vault0Info = AccountLayout.decode(vault0Account.data);
            const vault1Info = AccountLayout.decode(vault1Account.data);

            assert.equal(
                vault0Info.amount.toString(),
                token0.equals(NATIVE_MINT) ? INITIAL_WSOL_RESERVE.toString() : INITIAL_USDC_RESERVE.toString()
            );
            assert.equal(
                vault1Info.amount.toString(),
                token1.equals(NATIVE_MINT) ? INITIAL_WSOL_RESERVE.toString() : INITIAL_USDC_RESERVE.toString()
            );
        });
    });

    describe("Check deposit", () => {
        let auth: PublicKey;
        let poolState: PublicKey;
        let ownerLpToken: PublicKey;
        let token0Account: PublicKey;
        let token1Account: PublicKey;
        let token0Vault: PublicKey;
        let token1Vault: PublicKey;
        let lpMint: PublicKey;

        it("should deposit", async () => {
            [auth] = await getAuthAddress(program.programId);
            const [token0, token1] = [USDC_MINT, NATIVE_MINT].sort((a, b) => a.toBuffer().compare(b.toBuffer()));
            [poolState] = await getPoolAddress(AMM_CONFIG_0, token0, token1, program.programId);
            [lpMint] = await getPoolLpMintAddress(poolState, program.programId);

            [ownerLpToken] = await PublicKey.findProgramAddressSync(
                [payer.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), lpMint.toBuffer()],
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            token0Account = getAssociatedTokenAddressSync(token0, payer.publicKey, false, TOKEN_PROGRAM_ID);
            token1Account = getAssociatedTokenAddressSync(token1, payer.publicKey, false, TOKEN_PROGRAM_ID);

            [token0Vault] = await getPoolVaultAddress(poolState, token0, program.programId);
            [token1Vault] = await getPoolVaultAddress(poolState, token1, program.programId);

            const ix = await program.methods
                .deposit(new BN(1), parseUnits(100, WSOL_DECIMALS), parseUnits(10000, USDC_DECIMALS))
                .accounts({
                    owner: payer.publicKey,
                    authority: auth,
                    poolState,
                    ownerLpToken,
                    token0Account,
                    token1Account,
                    token0Vault,
                    token1Vault,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    tokenProgram2022: TOKEN_2022_PROGRAM_ID,
                    vault0Mint: token0,
                    vault1Mint: token1,
                    lpMint,
                })
                .instruction();
            const txResult = await createAndProcessTransaction(client, payer, ix);
            expect(txResult.result).to.be.null; // transaction should succeed
        });
    });
});

// RUST_LOG= anchor test
