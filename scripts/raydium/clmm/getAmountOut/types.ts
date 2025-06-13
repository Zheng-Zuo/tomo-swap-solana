import BN__default from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { TickArray } from "@raydium-io/raydium-sdk-v2";

export declare type Token = {
    address: string;
    decimals: number;
};

export interface TickArrayBitmapExtensionType {
    positiveTickArrayBitmap: BN__default[][];
    negativeTickArrayBitmap: BN__default[][];
}

export interface ClmmPoolInfo {
    programId: PublicKey;
    poolId: PublicKey;
    mintA: Token;
    mintB: Token;
    tradeFeeRate: number;
    tickSpacing: number;
    liquidity: BN__default;
    sqrtPriceX64: BN__default;
    tickCurrent: number;
    tickArrayBitmap: BN__default[];
    exBitmapInfo: TickArrayBitmapExtensionType;
}

export interface TickArrayCache {
    [key: string]: TickArray;
}

// The SDK does return the following types, but we don't need feeGrowthOutsideX64A, feeGrowthOutsideX64B and rewardGrowthsOutsideX64
// declare type Tick = {
//     tick: number;
//     liquidityNet: BN__default;
//     liquidityGross: BN__default;
//     feeGrowthOutsideX64A: BN__default;         // not used
//     feeGrowthOutsideX64B: BN__default;         // not used
//     rewardGrowthsOutsideX64: BN__default[];    // not used
// };
// declare type TickArray = {
//     address: PublicKey;
//     poolId: PublicKey;
//     startTickIndex: number;
//     ticks: Tick[];
//     initializedTickCount: number;
// };
