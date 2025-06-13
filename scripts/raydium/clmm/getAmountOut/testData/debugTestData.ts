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
    const clmmPoolInfoPath = path.join(__dirname, "./clmmPoolInfo.json");
    const clmmPoolInfoRaw = JSON.parse(fs.readFileSync(clmmPoolInfoPath, "utf8"));
    const clmmPoolInfo: ClmmPoolInfo = {
        programId: new PublicKey(clmmPoolInfoRaw.programId),
        poolId: new PublicKey(clmmPoolInfoRaw.poolId),
        mintA: {
            address: clmmPoolInfoRaw.mintA.address,
            decimals: clmmPoolInfoRaw.mintA.decimals,
        },
        mintB: {
            address: clmmPoolInfoRaw.mintB.address,
            decimals: clmmPoolInfoRaw.mintB.decimals,
        },
        tradeFeeRate: clmmPoolInfoRaw.tradeFeeRate,
        tickSpacing: clmmPoolInfoRaw.tickSpacing,
        liquidity: new BN(clmmPoolInfoRaw.liquidity),
        sqrtPriceX64: new BN(clmmPoolInfoRaw.sqrtPriceX64),
        tickCurrent: clmmPoolInfoRaw.tickCurrent,
        tickArrayBitmap: clmmPoolInfoRaw.tickArrayBitmap.map((tick) => new BN(tick)),
        exBitmapInfo: {
            positiveTickArrayBitmap: clmmPoolInfoRaw.exBitmapInfo.positiveTickArrayBitmap.map((arr) =>
                arr.map((strValue) => new BN(strValue))
            ),
            negativeTickArrayBitmap: clmmPoolInfoRaw.exBitmapInfo.negativeTickArrayBitmap.map((arr) =>
                arr.map((strValue) => new BN(strValue))
            ),
        },
    };

    // console.log(clmmPoolInfo);

    const tickArrayDataPath = path.join(__dirname, "./tickArrayData.json");
    const tickArrayDataRaw = JSON.parse(fs.readFileSync(tickArrayDataPath, "utf8"));

    const tickArrayMap: Record<string, any> = {};

    for (let i = 0; i < tickArrayDataRaw.length; i++) {
        const tickArrayDataRawItem = tickArrayDataRaw[i];
        const tickArrayDataItem = {
            address: new PublicKey(tickArrayDataRawItem.address),
            poolId: new PublicKey(tickArrayDataRawItem.poolId),
            startTickIndex: tickArrayDataRawItem.startTickIndex,
            initializedTickCount: tickArrayDataRawItem.initializedTickCount,
            ticks: tickArrayDataRawItem.ticks.map((tick) => ({
                tick: tick.tick,
                liquidityNet: new BN(tick.liquidityNet),
                liquidityGross: new BN(tick.liquidityGross),
            })),
        };

        tickArrayMap[tickArrayDataItem.startTickIndex.toString()] = tickArrayDataItem;
    }

    // console.log(tickArrayMap);

    const inputAmount = new BN(1000000000);
    const { expectedAmountOut, accounts } = computeAmountOut(
        clmmPoolInfo,
        tickArrayMap,
        inputAmount,
        clmmPoolInfo["mintA"]
    );

    console.log(`self calculated amountOut: ${expectedAmountOut}`);
    console.log(accounts);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
