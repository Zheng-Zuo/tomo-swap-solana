import { ActivationType, computeAmountOut } from "../getAmountOut";
import AmmImpl from "@meteora-ag/dynamic-amm-sdk";
import VaultImpl, { calculateWithdrawableAmount, getVaultPdas } from "@meteora-ag/vault-sdk";
import { Connection, clusterApiUrl, PublicKey, Keypair } from "@solana/web3.js";
import { Wallet, AnchorProvider } from "@coral-xyz/anchor";
import { loadKeypairFromFile } from "../../../utils";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import yargs from "yargs/yargs";
import dotenv from "dotenv";

dotenv.config();

function getOptions() {
    const options = yargs(process.argv.slice(2))
        .option("poolId", {
            type: "string",
            describe: "pool Id",
            default: "2DsGG7FFYBbF4ddYnNc4bZEeyQyN17oya5SdPX2ix9or", // USDC-WSOL
        })
        .option("inputMint", {
            type: "string",
            describe: "input mint",
            default: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        })
        .option("inputAmount", {
            type: "string",
            describe: "input amount",
            default: "500000", // 0.5 USDC
        });
    return options.argv;
}

async function main() {
    let options: any = getOptions();
    const poolAddress = new PublicKey(options.poolId);
    const inputMint = new PublicKey(options.inputMint);
    const inputAmount = new BN(options.inputAmount);

    // const owner = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
    const connection = new Connection(clusterApiUrl("mainnet-beta"));
    const pool = await AmmImpl.create(connection, poolAddress);

    const poolState = pool.poolState;
    const currentTime = pool["accountsInfo"].currentTime.toNumber();
    const currentSlot = pool["accountsInfo"].currentSlot.toNumber();

    if (!poolState.enabled) {
        throw new Error("Pool is not enabled");
    }

    const activationType = poolState.bootstrapping.activationType;
    const currentPoint = activationType == ActivationType.Timestamp ? new BN(currentTime) : new BN(currentSlot);
    if (!currentPoint.gte(poolState.bootstrapping.activationPoint)) {
        throw new Error("Swap is disabled");
    }

    const poolStateInputs = {
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tradeFeeDenominator: poolState.fees.tradeFeeDenominator,
        tradeFeeNumerator: poolState.fees.tradeFeeNumerator,
        protocolTradeFeeDenominator: poolState.fees.protocolTradeFeeDenominator,
        protocolTradeFeeNumerator: poolState.fees.protocolTradeFeeNumerator,
    };

    const vaultA = pool.vaultA.vaultState;
    const vaultB = pool.vaultB.vaultState;

    const vaultAInputs = {
        totalAmount: vaultA.totalAmount,
        lastReport: vaultA.lockedProfitTracker.lastReport,
        lockedProfitDegradation: vaultA.lockedProfitTracker.lockedProfitDegradation,
        lastUpdatedLockedProfit: vaultA.lockedProfitTracker.lastUpdatedLockedProfit,
    };

    const vaultBInputs = {
        totalAmount: vaultB.totalAmount,
        lastReport: vaultB.lockedProfitTracker.lastReport,
        lockedProfitDegradation: vaultB.lockedProfitTracker.lockedProfitDegradation,
        lastUpdatedLockedProfit: vaultB.lockedProfitTracker.lastUpdatedLockedProfit,
    };

    const poolVaultALp = pool["accountsInfo"].poolVaultALp;
    const poolVaultBLp = pool["accountsInfo"].poolVaultBLp;

    const vaultALpSupply = pool["accountsInfo"].vaultALpSupply;
    const vaultBLpSupply = pool["accountsInfo"].vaultBLpSupply;
    const vaultAReserve = pool["accountsInfo"].vaultAReserve;
    const vaultBReserve = pool["accountsInfo"].vaultBReserve;

    const params = {
        currentTime: currentTime,
        poolState: poolStateInputs,
        poolVaultALp: poolVaultALp,
        poolVaultBLp: poolVaultBLp,
        vaultA: vaultAInputs,
        vaultB: vaultBInputs,
        vaultALpSupply: vaultALpSupply,
        vaultBLpSupply: vaultBLpSupply,
        vaultAReserve: vaultAReserve,
        vaultBReserve: vaultBReserve,
    };

    const formatParams = (inputMint: PublicKey, inputAmount: BN, params: any) => {
        const formatValue = (value: any): any => {
            if (value instanceof PublicKey) {
                return value.toBase58();
            }
            if (value instanceof BN) {
                return value.toString();
            }
            if (typeof value === "object" && value !== null) {
                const result: any = {};
                for (const [k, v] of Object.entries(value)) {
                    result[k] = formatValue(v);
                }
                return result;
            }
            return value;
        };

        return {
            inputMint: inputMint.toBase58(),
            inputAmount: inputAmount.toString(),
            params: formatValue(params),
        };
    };

    const formatedParams = formatParams(inputMint, inputAmount, {
        currentTime: currentTime,
        poolState: poolStateInputs,
        poolVaultALp: poolVaultALp,
        poolVaultBLp: poolVaultBLp,
        vaultA: vaultAInputs,
        vaultB: vaultBInputs,
        vaultALpSupply: vaultALpSupply,
        vaultBLpSupply: vaultBLpSupply,
        vaultAReserve: vaultAReserve,
        vaultBReserve: vaultBReserve,
    });

    const InputDataOutputPath = path.join(__dirname, "./inputData.json");
    fs.writeFileSync(InputDataOutputPath, JSON.stringify(formatedParams, null, 2), "utf8");

    const res = computeAmountOut(inputMint, inputAmount, params);
    console.log("res", res.toString());

    const swapQuote = pool.getSwapQuote(inputMint, inputAmount, 100);
    console.log("SwapOutAmount %s", swapQuote.swapOutAmount.toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// res 3476930
// SwapOutAmount 3476930
