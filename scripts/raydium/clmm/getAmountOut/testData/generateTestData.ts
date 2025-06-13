import {
    ApiV3PoolInfoConcentratedItem,
    ClmmKeys,
    ComputeClmmPoolInfo,
    PoolUtils,
    ReturnTypeFetchMultiplePoolTickArrays,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { initSdk, txVersion } from "../../../config";
import { isValidClmm } from "../../utils";
import { PublicKey } from "@solana/web3.js";
import { computeAmountOut } from "../computeAmountOut";
import { ClmmPoolInfo, Token, TickArrayBitmapExtensionType } from "../types";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
dotenv.config();

async function main() {
    const raydium = await initSdk();
    let poolInfo: ApiV3PoolInfoConcentratedItem;

    // WSOL-USDC pool
    const poolId = "7XzVsjqTebULfkUofTDH5gDdZDmxacPmPuTfHa1n9kuh";
    const inputMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // WSOL
    const inputAmount = new BN(2000000); // 1 WSOL
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

    const clmmPoolInfoData = {
        programId: clmmPoolInfo.programId.toBase58(),
        poolId: clmmPoolInfo.poolId.toBase58(),
        mintA: {
            address: clmmPoolInfo.mintA.address,
            decimals: clmmPoolInfo.mintA.decimals,
        },
        mintB: {
            address: clmmPoolInfo.mintB.address,
            decimals: clmmPoolInfo.mintB.decimals,
        },
        tradeFeeRate: clmmPoolInfo.tradeFeeRate,
        tickSpacing: clmmPoolInfo.tickSpacing,
        liquidity: clmmPoolInfo.liquidity.toString(),
        sqrtPriceX64: clmmPoolInfo.sqrtPriceX64.toString(),
        tickCurrent: clmmPoolInfo.tickCurrent,
        tickArrayBitmap: clmmPoolInfo.tickArrayBitmap.map((tick) => tick.toString()),
        exBitmapInfo: {
            positiveTickArrayBitmap: clmmPoolInfo.exBitmapInfo.positiveTickArrayBitmap.map((arr) =>
                arr.map((bnValue) => bnValue.toString())
            ),
            negativeTickArrayBitmap: clmmPoolInfo.exBitmapInfo.negativeTickArrayBitmap.map((arr) =>
                arr.map((bnValue) => bnValue.toString())
            ),
        },
    };

    console.log(clmmPoolInfoData);

    const clmmPoolInfoDataOutputPath = path.join(__dirname, "./clmmPoolInfo.json");
    fs.writeFileSync(clmmPoolInfoDataOutputPath, JSON.stringify(clmmPoolInfoData, null, 2), "utf8");

    const tickArrayData = [];

    for (const key in tickCache[poolId]) {
        const value = tickCache[poolId][key];
        const newData = {
            poolId: value.poolId.toBase58(),
            startTickIndex: value.startTickIndex,
            initializedTickCount: value.initializedTickCount,
            ticks: value.ticks.map((tick) => ({
                tick: tick.tick,
                liquidityNet: tick.liquidityNet.toString(),
                liquidityGross: tick.liquidityGross.toString(),
            })),
            address: value.address.toBase58(),
        };

        tickArrayData.push(newData);
    }

    const tickArrayDataOutputPath = path.join(__dirname, "./tickArrayData.json");
    fs.writeFileSync(tickArrayDataOutputPath, JSON.stringify(tickArrayData, null, 2), "utf8");

    console.log("inputAmount", inputAmount.toString());
    console.log("tokenIn", clmmPoolInfo[baseIn ? "mintA" : "mintB"]);

    const { expectedAmountOut, accounts } = computeAmountOut(
        clmmPoolInfo,
        tickCache[poolId],
        inputAmount,
        clmmPoolInfo[baseIn ? "mintA" : "mintB"]
    );

    console.log(`Calculated amountOut: ${expectedAmountOut}`);
    console.log(accounts);

    // const { amountOut, remainingAccounts } = await PoolUtils.computeAmountOutFormat({
    //     poolInfo: computedClmmPoolInfo,
    //     tickArrayCache: tickCache[poolId],
    //     amountIn: inputAmount,
    //     tokenOut: poolInfo[baseIn ? "mintB" : "mintA"],
    //     slippage: 0,
    //     epochInfo: await raydium.fetchEpochInfo(),
    // });

    // console.log(`sdk calculated amountOut: ${amountOut.amount.raw}`);
    // console.log(remainingAccounts);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

// inputAmount 1000000000
// tokenIn { address: 'So11111111111111111111111111111111111111112', decimals: 9 }
// Calculated amountOut: 109539073
// [
//     PublicKey [PublicKey(BLW1aUynxBasggiFMa6NuTqDrmChY43PCrikVRF4mBEK)] {
//     _bn: <BN: 9993b4cfb83c63d58006082678aee7a3bacc7009053a336e8c6563211997483c>
//     },
//     PublicKey [PublicKey(DZPeUvNoGEwgpxPazTGMGFvBKrawTw7jNReyCFdtc3RN)] {
//     _bn: <BN: ba986f680c0e6e124e7932ce5ec558ef86ff6c706d625a13a1d995d0097324f5>
//     },
//     PublicKey [PublicKey(G21c2xT1yD8MAc3F22ZgEt24sM23Pt6R35Cpo22bFEpZ)] {
//     _bn: <BN: df219153ab86060c6c773c51b89cdb4297c41a18cb0c3aab9cc491dd510e6bca>
//     }
// ]
