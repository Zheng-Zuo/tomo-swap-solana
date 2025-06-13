import { setProvider, Program, BN } from "@coral-xyz/anchor";
import { RaydiumCpSwap, IDL } from "../types/raydium_cp_swap";
import { AddedAccount, AddedProgram, BanksClient, ProgramTestContext, startAnchor } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { assert, expect } from "chai";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import {
    AccountLayout,
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    NATIVE_MINT,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getTransferFeeConfig,
} from "@solana/spl-token";
import { createAndProcessTransaction, setupATA } from "../bankrunHepler";
import { getAuthAddress, getPoolAddress, getPoolVaultAddress, getOrcleAccountAddress, parseUnits } from "./utils";
import dotenv from "dotenv";

dotenv.config();

// Constants
const CPMM_PROGRAM_ID = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
const PROJECT_DIRECTORY = "";

const AMM_CONFIG_0 = new PublicKey("D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2");

const WSOL_DECIMALS = 9;
const TRUMP_DECIMALS = 6;
const TRUMP_MINT = new PublicKey("6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN");
const POOL_STATE = new PublicKey("HKuJrP5tYQLbEUdjKwjgnHs2957QKjR2iWhJKTtMa1xs");
const WSOL_VAULT = new PublicKey("7wMM5Tg7igkefH1T2TKqJBpYp5bQKPQjz7yTgvCUZY6Z");
const TRUMP_VAULT = new PublicKey("Gy2JYhV9gAZUBrjq35St78VMrXiufU72Que26pmhMYob");
const OBSERVATION_STATE = new PublicKey("HSYeHzVCyb2GmVqhug9jP2BgZj5jswgrpU5P8GtfA5M3");

const INITIAL_TRUMP_BALANCE = 0; // 0 TRUMP
const INITIAL_WSOL_BALANCE = 100_000_000_000_000; // 100k WSOL

const FEE_RATE_DENOMINATOR_VALUE = 1_000_000;

function ceilDiv(tokenAmount: BN, feeNumerator: BN, feeDenominator: BN): BN | null {
    try {
        const numerator = tokenAmount.mul(feeNumerator);
        const result = numerator.add(feeDenominator).sub(new BN(1)).div(feeDenominator);
        return result;
    } catch {
        return null;
    }
}

function tradingFee(amount: BN, tradeFeeRate: BN): BN | null {
    return ceilDiv(amount, tradeFeeRate, new BN(FEE_RATE_DENOMINATOR_VALUE));
}

function swapBaseInputWithoutFees(sourceAmount: BN, swapSourceAmount: BN, swapDestinationAmount: BN): BN | null {
    try {
        // (x + delta_x) * (y - delta_y) = x * y
        // delta_y = (delta_x * y) / (x + delta_x)
        const numerator = sourceAmount.mul(swapDestinationAmount);
        const denominator = swapSourceAmount.add(sourceAmount);
        const destinationAmountSwapped = numerator.div(denominator);

        return destinationAmountSwapped;
    } catch {
        return null;
    }
}

describe("Raydium CpSwap Swap Tests", () => {
    let context: ProgramTestContext;
    let client: BanksClient;
    let payer: Keypair;
    let provider: BankrunProvider;
    let program: Program<RaydiumCpSwap>;

    let trumpAta: PublicKey;
    let wsolAta: PublicKey;

    before(async () => {
        const connection = new Connection(process.env.MAINNET_RPC_URL!);

        let accountInfo = await connection.getAccountInfo(TRUMP_MINT);
        const trumpMintAccount: AddedAccount = { address: TRUMP_MINT, info: accountInfo };

        accountInfo = await connection.getAccountInfo(AMM_CONFIG_0);
        const ammConfigAccount: AddedAccount = { address: AMM_CONFIG_0, info: accountInfo };

        accountInfo = await connection.getAccountInfo(POOL_STATE);
        const poolStateAccount: AddedAccount = { address: POOL_STATE, info: accountInfo };

        accountInfo = await connection.getAccountInfo(WSOL_VAULT);
        const wsolVaultAccount: AddedAccount = { address: WSOL_VAULT, info: accountInfo };

        accountInfo = await connection.getAccountInfo(TRUMP_VAULT);
        const trumpVaultAccount: AddedAccount = { address: TRUMP_VAULT, info: accountInfo };

        accountInfo = await connection.getAccountInfo(OBSERVATION_STATE);
        const observationStateAccount: AddedAccount = { address: OBSERVATION_STATE, info: accountInfo };

        const raydiumCpSwapProgram: AddedProgram = { name: "raydium_cp_swap", programId: CPMM_PROGRAM_ID };

        context = await startAnchor(
            PROJECT_DIRECTORY,
            [raydiumCpSwapProgram],
            [
                trumpMintAccount,
                ammConfigAccount,
                poolStateAccount,
                wsolVaultAccount,
                trumpVaultAccount,
                observationStateAccount,
            ]
        );
        client = context.banksClient;
        payer = context.payer;
        provider = new BankrunProvider(context);
        setProvider(provider);
        trumpAta = await setupATA(context, TRUMP_MINT, payer.publicKey, INITIAL_TRUMP_BALANCE);
        wsolAta = await setupATA(context, NATIVE_MINT, payer.publicKey, INITIAL_WSOL_BALANCE, true);

        program = new Program<RaydiumCpSwap>(IDL, CPMM_PROGRAM_ID, provider);
    });

    describe("Check initial states", () => {
        it("should have initialized TRUMP ATA", async () => {
            const rawAccount = await client.getAccount(trumpAta);
            expect(rawAccount).to.exist;
        });

        it("should have enough wsol", async () => {
            const accountInfo = await client.getAccount(wsolAta);
            const tokenAccountInfo = AccountLayout.decode(accountInfo.data);
            expect(tokenAccountInfo.amount).to.equal(BigInt(INITIAL_WSOL_BALANCE));
        });

        it("should have correct balance in ATA", async () => {
            const accountInfo = await client.getAccount(trumpAta);
            const tokenAccountInfo = AccountLayout.decode(accountInfo.data);
            expect(tokenAccountInfo.amount).to.equal(BigInt(INITIAL_TRUMP_BALANCE));
        });

        it("should have correct amm config", async () => {
            const ammConfig = await program.account.ammConfig.fetch(AMM_CONFIG_0);
            assert.equal(ammConfig.disableCreatePool, false);
            assert.equal(ammConfig.tradeFeeRate.toString(), "2500");
        });
    });

    describe("Check swap exact in", () => {
        let authority: PublicKey;

        const INPUT_WSOL_AMOUNT = parseUnits(1, WSOL_DECIMALS);

        it("should swap trump with the correct amount", async () => {
            [authority] = await getAuthAddress(program.programId);

            const poolStateAccount = await program.account.poolState.fetch(POOL_STATE);

            const token0 = poolStateAccount.token0Mint;

            const token0Vault = poolStateAccount.token0Vault;
            const token1Vault = poolStateAccount.token1Vault;

            const protocolFeesToken0 = poolStateAccount.protocolFeesToken0;
            const protocolFeesToken1 = poolStateAccount.protocolFeesToken1;
            const fundFeesToken0 = poolStateAccount.fundFeesToken0;
            const fundFeesToken1 = poolStateAccount.fundFeesToken1;

            let accountInfo = await client.getAccount(token0Vault);
            let tokenAccountInfo = AccountLayout.decode(accountInfo.data);
            const token0ReserveBeforeFee = new BN(tokenAccountInfo.amount.toString());

            accountInfo = await client.getAccount(token1Vault);
            tokenAccountInfo = AccountLayout.decode(accountInfo.data);
            const token1ReserveBeforeFee = new BN(tokenAccountInfo.amount.toString());

            const token0ReserveAfterFee = token0ReserveBeforeFee.sub(protocolFeesToken0).sub(fundFeesToken0);
            const token1ReserveAfterFee = token1ReserveBeforeFee.sub(protocolFeesToken1).sub(fundFeesToken1);

            const reserveIn = token0.equals(NATIVE_MINT) ? token0ReserveAfterFee : token1ReserveAfterFee;
            const reserveOut = token0.equals(NATIVE_MINT) ? token1ReserveAfterFee : token0ReserveAfterFee;

            const tradeFee = tradingFee(INPUT_WSOL_AMOUNT, new BN(2500));
            const amountAfterTradeFee = INPUT_WSOL_AMOUNT.sub(tradeFee);

            const amountOut = swapBaseInputWithoutFees(amountAfterTradeFee, reserveIn, reserveOut);
            // console.log("amountOut", amountOut?.toString());

            const ix = await program.methods
                .swapBaseInput(INPUT_WSOL_AMOUNT, new BN(1))
                .accounts({
                    payer: payer.publicKey,
                    authority,
                    ammConfig: AMM_CONFIG_0,
                    poolState: POOL_STATE,
                    inputTokenAccount: wsolAta,
                    outputTokenAccount: trumpAta,
                    inputVault: WSOL_VAULT,
                    outputVault: TRUMP_VAULT,
                    inputTokenProgram: TOKEN_PROGRAM_ID,
                    outputTokenProgram: TOKEN_PROGRAM_ID,
                    inputTokenMint: NATIVE_MINT,
                    outputTokenMint: TRUMP_MINT,
                    observationState: OBSERVATION_STATE,
                })
                .instruction();

            const txResult = await createAndProcessTransaction(client, payer, ix);
            expect(txResult.result).to.be.null; // transaction should succeed

            accountInfo = await client.getAccount(trumpAta);
            tokenAccountInfo = AccountLayout.decode(accountInfo.data);
            const actualAmountOut = tokenAccountInfo.amount;

            // console.log("expectedAmountOut", amountOut?.toString());
            // console.log("actualAmountOut", actualAmountOut.toString());

            expect(actualAmountOut.toString()).to.equal(amountOut?.toString());
        });
    });
});
