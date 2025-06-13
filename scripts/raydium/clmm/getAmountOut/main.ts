import {
    ApiV3PoolInfoConcentratedItem,
    ClmmKeys,
    ComputeClmmPoolInfo,
    PoolUtils,
    ReturnTypeFetchMultiplePoolTickArrays,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { initSdk, txVersion } from "../../config";
import { isValidClmm } from "../utils";
import { PublicKey } from "@solana/web3.js";
import { computeAmountOut } from "./computeAmountOut";
import { ClmmPoolInfo, Token, TickArrayBitmapExtensionType } from "./types";
import dotenv from "dotenv";
dotenv.config();

async function main() {
    const raydium = await initSdk();
    let poolInfo: ApiV3PoolInfoConcentratedItem;

    // WSOL-USDC pool
    const poolId = "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv";
    const inputMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC
    const inputAmount = new BN(100000000); // 100 USDC
    let poolKeys: ClmmKeys | undefined;
    let computedClmmPoolInfo: ComputeClmmPoolInfo;
    let tickCache: ReturnTypeFetchMultiplePoolTickArrays;

    const data = await raydium.api.fetchPoolById({ ids: poolId });
    poolInfo = data[0] as ApiV3PoolInfoConcentratedItem;
    if (!isValidClmm(poolInfo.programId)) throw new Error("target pool is not CLMM pool");

    computedClmmPoolInfo = await PoolUtils.fetchComputeClmmInfo({
        connection: raydium.connection,
        poolInfo,
    });
    tickCache = await PoolUtils.fetchMultiplePoolTickArrays({
        connection: raydium.connection,
        poolKeys: [computedClmmPoolInfo],
    });

    const baseIn = inputMint.toBase58() === poolInfo.mintA.address;

    // mannually re-construct input data
    let exBitmapInfo: TickArrayBitmapExtensionType;
    let clmmPoolInfo: ClmmPoolInfo;

    const mintA: Token = {
        address: computedClmmPoolInfo.mintA.address,
        decimals: computedClmmPoolInfo.mintA.decimals,
    };

    const mintB: Token = {
        address: computedClmmPoolInfo.mintB.address,
        decimals: computedClmmPoolInfo.mintB.decimals,
    };

    exBitmapInfo = {
        positiveTickArrayBitmap: computedClmmPoolInfo.exBitmapInfo.positiveTickArrayBitmap,
        negativeTickArrayBitmap: computedClmmPoolInfo.exBitmapInfo.negativeTickArrayBitmap,
    };

    // first input parameter
    clmmPoolInfo = {
        programId: computedClmmPoolInfo.programId,
        poolId: new PublicKey(poolId),
        mintA,
        mintB,
        tradeFeeRate: computedClmmPoolInfo.ammConfig.tradeFeeRate,
        tickSpacing: computedClmmPoolInfo.tickSpacing,
        liquidity: computedClmmPoolInfo.liquidity,
        sqrtPriceX64: computedClmmPoolInfo.sqrtPriceX64,
        tickCurrent: computedClmmPoolInfo.tickCurrent,
        tickArrayBitmap: computedClmmPoolInfo.tickArrayBitmap,
        exBitmapInfo,
    };

    const { expectedAmountOut, accounts } = computeAmountOut(
        clmmPoolInfo,
        tickCache[poolId],
        inputAmount,
        clmmPoolInfo[baseIn ? "mintA" : "mintB"]
    );

    console.log(`self calculated amountOut: ${expectedAmountOut}`);
    console.log(accounts);

    const { amountOut, remainingAccounts } = await PoolUtils.computeAmountOutFormat({
        poolInfo: computedClmmPoolInfo,
        tickArrayCache: tickCache[poolId],
        amountIn: inputAmount,
        tokenOut: poolInfo[baseIn ? "mintB" : "mintA"],
        slippage: 0,
        epochInfo: await raydium.fetchEpochInfo(),
    });

    console.log(`sdk calculated amountOut: ${amountOut.amount.raw}`);
    console.log(remainingAccounts);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
