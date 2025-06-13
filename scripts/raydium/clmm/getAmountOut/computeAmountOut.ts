import Decimal from "decimal.js";
import BN from "bn.js";
import { MIN_SQRT_PRICE_X64, MAX_SQRT_PRICE_X64, NEGATIVE_ONE } from "./constant";
import { priceToSqrtPriceX64 } from "./utils/math";
import { PoolUtils } from "./utils/pool";
import { SwapMath } from "./utils/math";
import { ClmmPoolInfo, TickArrayCache, Token } from "./types";
import { PublicKey } from "@solana/web3.js";

export function computeAmountOut(
    poolInfo: ClmmPoolInfo,
    tickArrayCache: TickArrayCache,
    amountIn: BN,
    tokenIn: Token,
    priceLimit = new Decimal(0),
    catchLiquidityInsufficient = false
) {
    const zeroForOne = tokenIn.address === poolInfo.mintA.address;
    // const [inputMint, outMint] = zeroForOne ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA];

    let sqrtPriceLimitX64: BN;
    if (priceLimit.equals(new Decimal(0))) {
        sqrtPriceLimitX64 = zeroForOne ? MIN_SQRT_PRICE_X64.add(new BN(1)) : MAX_SQRT_PRICE_X64.sub(new BN(1));
    } else {
        sqrtPriceLimitX64 = priceToSqrtPriceX64(priceLimit, poolInfo.mintA.decimals, poolInfo.mintB.decimals);
    }

    const allNeededAccounts: PublicKey[] = [];

    const {
        isExist,
        startIndex: firstTickArrayStartIndex,
        nextAccountMeta,
    } = PoolUtils.getFirstInitializedTickArray(poolInfo, zeroForOne);

    if (!isExist || firstTickArrayStartIndex === undefined || !nextAccountMeta) throw new Error("Invalid tick array");

    allNeededAccounts.push(nextAccountMeta);
    const {
        allTrade,
        amountCalculated: outputAmount,
        sqrtPriceX64: executionPrice,
        feeAmount,
        accounts: remainAccounts,
    } = SwapMath.swapCompute(
        poolInfo.programId,
        poolInfo.poolId,
        tickArrayCache,
        poolInfo.tickArrayBitmap,
        poolInfo.exBitmapInfo,
        zeroForOne,
        poolInfo.tradeFeeRate,
        poolInfo.liquidity,
        poolInfo.tickCurrent,
        poolInfo.tickSpacing,
        poolInfo.sqrtPriceX64,
        amountIn,
        firstTickArrayStartIndex,
        sqrtPriceLimitX64,
        catchLiquidityInsufficient
    );
    allNeededAccounts.push(...remainAccounts);
    return {
        allTrade,
        expectedAmountOut: outputAmount.mul(NEGATIVE_ONE),
        accounts: allNeededAccounts,
        executionPrice,
        feeAmount,
    };
}
