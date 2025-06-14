import BN from "bn.js";
import Decimal from "decimal.js";
import {
    ZERO,
    ONE,
    Q128,
    MIN_SQRT_PRICE_X64,
    MAX_SQRT_PRICE_X64,
    MIN_TICK,
    MAX_TICK,
    MaxUint128,
    NEGATIVE_ONE,
    BIT_PRECISION,
    LOG_B_2_X32,
    LOG_B_P_ERR_MARGIN_LOWER_X64,
    LOG_B_P_ERR_MARGIN_UPPER_X64,
    FEE_RATE_DENOMINATOR,
    U64Resolution,
    Q64,
} from "../constant";
import { TickQuery } from "./tickQuery";
import { TickUtils } from "./tick";
import { PoolUtils } from "./pool";
import { PublicKey } from "@solana/web3.js";
import { getPdaTickArrayAddress } from "./pda";

export class SwapMath {
    public static swapCompute(
        programId: PublicKey,
        poolId: PublicKey,
        tickArrayCache: any,
        tickArrayBitmap: BN[],
        tickarrayBitmapExtension: any,
        zeroForOne: boolean,
        fee: number,
        liquidity: BN,
        currentTick: number,
        tickSpacing: number,
        currentSqrtPriceX64: BN,
        amountSpecified: BN,
        lastSavedTickArrayStartIndex: number,
        sqrtPriceLimitX64?: BN,
        catchLiquidityInsufficient = false
    ): {
        allTrade: boolean;
        amountSpecifiedRemaining: BN;
        amountCalculated: BN;
        feeAmount: BN;
        sqrtPriceX64: BN;
        liquidity: BN;
        tickCurrent: number;
        accounts: PublicKey[];
    } {
        if (amountSpecified.eq(ZERO)) {
            throw new Error("amountSpecified must not be 0");
        }
        if (!sqrtPriceLimitX64)
            sqrtPriceLimitX64 = zeroForOne ? MIN_SQRT_PRICE_X64.add(ONE) : MAX_SQRT_PRICE_X64.sub(ONE);

        if (zeroForOne) {
            if (sqrtPriceLimitX64.lt(MIN_SQRT_PRICE_X64)) {
                throw new Error("sqrtPriceX64 must greater than MIN_SQRT_PRICE_X64");
            }

            if (sqrtPriceLimitX64.gte(currentSqrtPriceX64)) {
                throw new Error("sqrtPriceX64 must smaller than current");
            }
        } else {
            if (sqrtPriceLimitX64.gt(MAX_SQRT_PRICE_X64)) {
                throw new Error("sqrtPriceX64 must smaller than MAX_SQRT_PRICE_X64");
            }

            if (sqrtPriceLimitX64.lte(currentSqrtPriceX64)) {
                throw new Error("sqrtPriceX64 must greater than current");
            }
        }
        const baseInput = amountSpecified.gt(ZERO);

        const state = {
            amountSpecifiedRemaining: amountSpecified,
            amountCalculated: ZERO,
            sqrtPriceX64: currentSqrtPriceX64,
            tick:
                currentTick > lastSavedTickArrayStartIndex
                    ? Math.min(lastSavedTickArrayStartIndex + TickQuery.tickCount(tickSpacing) - 1, currentTick)
                    : lastSavedTickArrayStartIndex,
            accounts: [] as PublicKey[],
            liquidity,
            feeAmount: new BN(0),
        };
        let tickAarrayStartIndex = lastSavedTickArrayStartIndex;
        let tickArrayCurrent = tickArrayCache[lastSavedTickArrayStartIndex];
        let loopCount = 0;
        let t = !zeroForOne && tickArrayCurrent.startTickIndex === state.tick;
        while (
            !state.amountSpecifiedRemaining.eq(ZERO) &&
            !state.sqrtPriceX64.eq(sqrtPriceLimitX64)
            // state.tick < MAX_TICK &&
            // state.tick > MIN_TICK
        ) {
            if (loopCount > 10) {
                // throw Error('liquidity limit')
            }
            const step: any = {};
            step.sqrtPriceStartX64 = state.sqrtPriceX64;

            const tickState: any = TickUtils.nextInitTick(tickArrayCurrent, state.tick, tickSpacing, zeroForOne, t);

            let nextInitTick: any = tickState ? tickState : null; // TickUtils.firstInitializedTick(tickArrayCurrent, zeroForOne)
            let tickArrayAddress: any = null;

            if (!nextInitTick?.liquidityGross.gtn(0)) {
                const nextInitTickArrayIndex = PoolUtils.nextInitializedTickArrayStartIndex(
                    {
                        tickCurrent: state.tick,
                        tickSpacing,
                        tickArrayBitmap,
                        exBitmapInfo: tickarrayBitmapExtension,
                    },
                    tickAarrayStartIndex,
                    zeroForOne
                );
                if (!nextInitTickArrayIndex.isExist) {
                    if (catchLiquidityInsufficient) {
                        return {
                            allTrade: false,
                            amountSpecifiedRemaining: state.amountSpecifiedRemaining,
                            amountCalculated: state.amountCalculated,
                            feeAmount: state.feeAmount,
                            sqrtPriceX64: state.sqrtPriceX64,
                            liquidity: state.liquidity,
                            tickCurrent: state.tick,
                            accounts: state.accounts,
                        };
                    }
                    throw Error("swapCompute LiquidityInsufficient");
                }
                tickAarrayStartIndex = nextInitTickArrayIndex.nextStartIndex;

                const { publicKey: expectedNextTickArrayAddress } = getPdaTickArrayAddress(
                    programId,
                    poolId,
                    tickAarrayStartIndex
                );
                tickArrayAddress = expectedNextTickArrayAddress;
                tickArrayCurrent = tickArrayCache[tickAarrayStartIndex];

                try {
                    nextInitTick = TickUtils.firstInitializedTick(tickArrayCurrent, zeroForOne);
                } catch (e) {
                    throw Error("not found next tick info");
                }
            }

            step.tickNext = nextInitTick.tick;
            step.initialized = nextInitTick.liquidityGross.gtn(0);
            if (lastSavedTickArrayStartIndex !== tickAarrayStartIndex && tickArrayAddress) {
                state.accounts.push(tickArrayAddress);
                lastSavedTickArrayStartIndex = tickAarrayStartIndex;
            }
            if (step.tickNext < MIN_TICK) {
                step.tickNext = MIN_TICK;
            } else if (step.tickNext > MAX_TICK) {
                step.tickNext = MAX_TICK;
            }

            step.sqrtPriceNextX64 = SqrtPriceMath.getSqrtPriceX64FromTick(step.tickNext);
            let targetPrice: BN;
            if (
                (zeroForOne && step.sqrtPriceNextX64.lt(sqrtPriceLimitX64)) ||
                (!zeroForOne && step.sqrtPriceNextX64.gt(sqrtPriceLimitX64))
            ) {
                targetPrice = sqrtPriceLimitX64;
            } else {
                targetPrice = step.sqrtPriceNextX64;
            }
            [state.sqrtPriceX64, step.amountIn, step.amountOut, step.feeAmount] = this.swapStepCompute(
                state.sqrtPriceX64,
                targetPrice,
                state.liquidity,
                state.amountSpecifiedRemaining,
                fee,
                zeroForOne
            );

            state.feeAmount = state.feeAmount.add(step.feeAmount);

            if (baseInput) {
                state.amountSpecifiedRemaining = state.amountSpecifiedRemaining.sub(step.amountIn.add(step.feeAmount));
                state.amountCalculated = state.amountCalculated.sub(step.amountOut);
            } else {
                state.amountSpecifiedRemaining = state.amountSpecifiedRemaining.add(step.amountOut);
                state.amountCalculated = state.amountCalculated.add(step.amountIn.add(step.feeAmount));
            }
            if (state.sqrtPriceX64.eq(step.sqrtPriceNextX64)) {
                if (step.initialized) {
                    let liquidityNet = nextInitTick.liquidityNet;
                    if (zeroForOne) liquidityNet = liquidityNet.mul(NEGATIVE_ONE);
                    state.liquidity = LiquidityMath.addDelta(state.liquidity, liquidityNet);
                }

                t = step.tickNext != state.tick && !zeroForOne && tickArrayCurrent.startTickIndex === step.tickNext;
                state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext; //
            } else if (state.sqrtPriceX64 != step.sqrtPriceStartX64) {
                const _T = SqrtPriceMath.getTickFromSqrtPriceX64(state.sqrtPriceX64);
                t = _T != state.tick && !zeroForOne && tickArrayCurrent.startTickIndex === _T;
                state.tick = _T;
            }
            ++loopCount;
        }

        try {
            const { nextStartIndex: tickAarrayStartIndex, isExist } = TickQuery.nextInitializedTickArray(
                state.tick,
                tickSpacing,
                zeroForOne,
                tickArrayBitmap,
                tickarrayBitmapExtension
            );
            if (isExist && lastSavedTickArrayStartIndex !== tickAarrayStartIndex) {
                state.accounts.push(getPdaTickArrayAddress(programId, poolId, tickAarrayStartIndex).publicKey);
                lastSavedTickArrayStartIndex = tickAarrayStartIndex;
            }
        } catch (e) {
            /* empty */
        }

        return {
            allTrade: true,
            amountSpecifiedRemaining: ZERO,
            amountCalculated: state.amountCalculated,
            feeAmount: state.feeAmount,
            sqrtPriceX64: state.sqrtPriceX64,
            liquidity: state.liquidity,
            tickCurrent: state.tick,
            accounts: state.accounts,
        };
    }

    public static swapStepCompute(
        sqrtPriceX64Current: BN,
        sqrtPriceX64Target: BN,
        liquidity: BN,
        amountRemaining: BN,
        feeRate: any,
        zeroForOne: boolean
    ): [BN, BN, BN, BN] {
        const swapStep: any = {
            sqrtPriceX64Next: new BN(0),
            amountIn: new BN(0),
            amountOut: new BN(0),
            feeAmount: new BN(0),
        };

        const baseInput = amountRemaining.gte(ZERO);

        if (baseInput) {
            const amountRemainingSubtractFee = MathUtil.mulDivFloor(
                amountRemaining,
                FEE_RATE_DENOMINATOR.sub(new BN(feeRate.toString())),
                FEE_RATE_DENOMINATOR
            );
            swapStep.amountIn = zeroForOne
                ? LiquidityMath.getTokenAmountAFromLiquidity(sqrtPriceX64Target, sqrtPriceX64Current, liquidity, true)
                : LiquidityMath.getTokenAmountBFromLiquidity(sqrtPriceX64Current, sqrtPriceX64Target, liquidity, true);
            if (amountRemainingSubtractFee.gte(swapStep.amountIn)) {
                swapStep.sqrtPriceX64Next = sqrtPriceX64Target;
            } else {
                swapStep.sqrtPriceX64Next = SqrtPriceMath.getNextSqrtPriceX64FromInput(
                    sqrtPriceX64Current,
                    liquidity,
                    amountRemainingSubtractFee,
                    zeroForOne
                );
            }
        } else {
            swapStep.amountOut = zeroForOne
                ? LiquidityMath.getTokenAmountBFromLiquidity(sqrtPriceX64Target, sqrtPriceX64Current, liquidity, false)
                : LiquidityMath.getTokenAmountAFromLiquidity(sqrtPriceX64Current, sqrtPriceX64Target, liquidity, false);
            if (amountRemaining.mul(NEGATIVE_ONE).gte(swapStep.amountOut)) {
                swapStep.sqrtPriceX64Next = sqrtPriceX64Target;
            } else {
                swapStep.sqrtPriceX64Next = SqrtPriceMath.getNextSqrtPriceX64FromOutput(
                    sqrtPriceX64Current,
                    liquidity,
                    amountRemaining.mul(NEGATIVE_ONE),
                    zeroForOne
                );
            }
        }

        const reachTargetPrice = sqrtPriceX64Target.eq(swapStep.sqrtPriceX64Next);

        if (zeroForOne) {
            if (!(reachTargetPrice && baseInput)) {
                swapStep.amountIn = LiquidityMath.getTokenAmountAFromLiquidity(
                    swapStep.sqrtPriceX64Next,
                    sqrtPriceX64Current,
                    liquidity,
                    true
                );
            }

            if (!(reachTargetPrice && !baseInput)) {
                swapStep.amountOut = LiquidityMath.getTokenAmountBFromLiquidity(
                    swapStep.sqrtPriceX64Next,
                    sqrtPriceX64Current,
                    liquidity,
                    false
                );
            }
        } else {
            swapStep.amountIn =
                reachTargetPrice && baseInput
                    ? swapStep.amountIn
                    : LiquidityMath.getTokenAmountBFromLiquidity(
                          sqrtPriceX64Current,
                          swapStep.sqrtPriceX64Next,
                          liquidity,
                          true
                      );
            swapStep.amountOut =
                reachTargetPrice && !baseInput
                    ? swapStep.amountOut
                    : LiquidityMath.getTokenAmountAFromLiquidity(
                          sqrtPriceX64Current,
                          swapStep.sqrtPriceX64Next,
                          liquidity,
                          false
                      );
        }

        if (!baseInput && swapStep.amountOut.gt(amountRemaining.mul(NEGATIVE_ONE))) {
            swapStep.amountOut = amountRemaining.mul(NEGATIVE_ONE);
        }
        if (baseInput && !swapStep.sqrtPriceX64Next.eq(sqrtPriceX64Target)) {
            swapStep.feeAmount = amountRemaining.sub(swapStep.amountIn);
        } else {
            swapStep.feeAmount = MathUtil.mulDivCeil(
                swapStep.amountIn,
                new BN(feeRate),
                FEE_RATE_DENOMINATOR.sub(new BN(feeRate))
            );
        }
        return [swapStep.sqrtPriceX64Next, swapStep.amountIn, swapStep.amountOut, swapStep.feeAmount];
    }
}

export class MathUtil {
    public static mulDivRoundingUp(a: BN, b: BN, denominator: BN): BN {
        const numerator = a.mul(b);
        let result = numerator.div(denominator);
        if (!numerator.mod(denominator).eq(ZERO)) {
            result = result.add(ONE);
        }
        return result;
    }

    public static mulDivFloor(a: BN, b: BN, denominator: BN): BN {
        if (denominator.eq(ZERO)) {
            throw new Error("division by 0");
        }
        return a.mul(b).div(denominator);
    }

    public static mulDivCeil(a: BN, b: BN, denominator: BN): BN {
        if (denominator.eq(ZERO)) {
            throw new Error("division by 0");
        }
        const numerator = a.mul(b).add(denominator.sub(ONE));
        return numerator.div(denominator);
    }

    public static x64ToDecimal(num: BN, decimalPlaces?: number): Decimal {
        return new Decimal(num.toString()).div(Decimal.pow(2, 64)).toDecimalPlaces(decimalPlaces);
    }

    public static decimalToX64(num: Decimal): BN {
        return new BN(num.mul(Decimal.pow(2, 64)).floor().toFixed());
    }

    public static wrappingSubU128(n0: BN, n1: BN): BN {
        return n0.add(Q128).sub(n1).mod(Q128);
    }
}

export function priceToSqrtPriceX64(price: Decimal, decimalsA: number, decimalsB: number): BN {
    return MathUtil.decimalToX64(price.mul(Decimal.pow(10, decimalsB - decimalsA)).sqrt());
}

export function leadingZeros(bitNum: number, data: BN): number {
    let i = 0;
    for (let j = bitNum - 1; j >= 0; j--) {
        if (!data.testn(j)) {
            i++;
        } else {
            break;
        }
    }
    return i;
}

export function trailingZeros(bitNum: number, data: BN) {
    let i = 0;
    for (let j = 0; j < bitNum; j++) {
        if (!data.testn(j)) {
            i++;
        } else {
            break;
        }
    }
    return i;
}

export function isZero(bitNum: number, data: BN): boolean {
    for (let i = 0; i < bitNum; i++) {
        if (data.testn(i)) return false;
    }
    return true;
}

export function mostSignificantBit(bitNum: number, data: BN): number | null {
    if (isZero(bitNum, data)) return null;
    else return leadingZeros(bitNum, data);
}

export function leastSignificantBit(bitNum: number, data: BN): number | null {
    if (isZero(bitNum, data)) return null;
    else return trailingZeros(bitNum, data);
}

// sqrt price math
function mulRightShift(val: BN, mulBy: BN): BN {
    return signedRightShift(val.mul(mulBy), 64, 256);
}

function signedLeftShift(n0: BN, shiftBy: number, bitWidth: number): BN {
    const twosN0 = n0.toTwos(bitWidth).shln(shiftBy);
    twosN0.imaskn(bitWidth + 1);
    return twosN0.fromTwos(bitWidth);
}

function signedRightShift(n0: BN, shiftBy: number, bitWidth: number): BN {
    const twoN0 = n0.toTwos(bitWidth).shrn(shiftBy);
    twoN0.imaskn(bitWidth - shiftBy + 1);
    return twoN0.fromTwos(bitWidth - shiftBy);
}

export class SqrtPriceMath {
    public static getNextSqrtPriceX64FromOutput(
        sqrtPriceX64: BN,
        liquidity: BN,
        amountOut: BN,
        zeroForOne: boolean
    ): BN {
        if (!sqrtPriceX64.gt(ZERO)) {
            throw new Error("sqrtPriceX64 must greater than 0");
        }
        if (!liquidity.gt(ZERO)) {
            throw new Error("liquidity must greater than 0");
        }

        return zeroForOne
            ? this.getNextSqrtPriceFromTokenAmountBRoundingDown(sqrtPriceX64, liquidity, amountOut, false)
            : this.getNextSqrtPriceFromTokenAmountARoundingUp(sqrtPriceX64, liquidity, amountOut, false);
    }

    public static getNextSqrtPriceX64FromInput(sqrtPriceX64: BN, liquidity: BN, amountIn: BN, zeroForOne: boolean): BN {
        if (!sqrtPriceX64.gt(ZERO)) {
            throw new Error("sqrtPriceX64 must greater than 0");
        }
        if (!liquidity.gt(ZERO)) {
            throw new Error("liquidity must greater than 0");
        }

        return zeroForOne
            ? this.getNextSqrtPriceFromTokenAmountARoundingUp(sqrtPriceX64, liquidity, amountIn, true)
            : this.getNextSqrtPriceFromTokenAmountBRoundingDown(sqrtPriceX64, liquidity, amountIn, true);
    }

    public static getNextSqrtPriceFromTokenAmountARoundingUp(
        sqrtPriceX64: BN,
        liquidity: BN,
        amount: BN,
        add: boolean
    ): BN {
        if (amount.eq(ZERO)) return sqrtPriceX64;
        const liquidityLeftShift = liquidity.shln(U64Resolution);

        if (add) {
            const numerator1 = liquidityLeftShift;
            const denominator = liquidityLeftShift.add(amount.mul(sqrtPriceX64));
            if (denominator.gte(numerator1)) {
                return MathUtil.mulDivCeil(numerator1, sqrtPriceX64, denominator);
            }
            return MathUtil.mulDivRoundingUp(numerator1, ONE, numerator1.div(sqrtPriceX64).add(amount));
        } else {
            const amountMulSqrtPrice = amount.mul(sqrtPriceX64);
            if (!liquidityLeftShift.gt(amountMulSqrtPrice)) {
                throw new Error(
                    "getNextSqrtPriceFromTokenAmountARoundingUp,liquidityLeftShift must gt amountMulSqrtPrice"
                );
            }
            const denominator = liquidityLeftShift.sub(amountMulSqrtPrice);
            return MathUtil.mulDivCeil(liquidityLeftShift, sqrtPriceX64, denominator);
        }
    }

    public static getNextSqrtPriceFromTokenAmountBRoundingDown(
        sqrtPriceX64: BN,
        liquidity: BN,
        amount: BN,
        add: boolean
    ): BN {
        const deltaY = amount.shln(U64Resolution);
        if (add) {
            return sqrtPriceX64.add(deltaY.div(liquidity));
        } else {
            const amountDivLiquidity = MathUtil.mulDivRoundingUp(deltaY, ONE, liquidity);
            if (!sqrtPriceX64.gt(amountDivLiquidity)) {
                throw new Error("getNextSqrtPriceFromTokenAmountBRoundingDown sqrtPriceX64 must gt amountDivLiquidity");
            }
            return sqrtPriceX64.sub(amountDivLiquidity);
        }
    }

    public static getSqrtPriceX64FromTick(tick: number): BN {
        if (!Number.isInteger(tick)) {
            throw new Error("tick must be integer");
        }
        if (tick < MIN_TICK || tick > MAX_TICK) {
            throw new Error("tick must be in MIN_TICK and MAX_TICK");
        }
        const tickAbs: number = tick < 0 ? tick * -1 : tick;

        let ratio: BN = (tickAbs & 0x1) != 0 ? new BN("18445821805675395072") : new BN("18446744073709551616");
        if ((tickAbs & 0x2) != 0) ratio = mulRightShift(ratio, new BN("18444899583751176192"));
        if ((tickAbs & 0x4) != 0) ratio = mulRightShift(ratio, new BN("18443055278223355904"));
        if ((tickAbs & 0x8) != 0) ratio = mulRightShift(ratio, new BN("18439367220385607680"));
        if ((tickAbs & 0x10) != 0) ratio = mulRightShift(ratio, new BN("18431993317065453568"));
        if ((tickAbs & 0x20) != 0) ratio = mulRightShift(ratio, new BN("18417254355718170624"));
        if ((tickAbs & 0x40) != 0) ratio = mulRightShift(ratio, new BN("18387811781193609216"));
        if ((tickAbs & 0x80) != 0) ratio = mulRightShift(ratio, new BN("18329067761203558400"));
        if ((tickAbs & 0x100) != 0) ratio = mulRightShift(ratio, new BN("18212142134806163456"));
        if ((tickAbs & 0x200) != 0) ratio = mulRightShift(ratio, new BN("17980523815641700352"));
        if ((tickAbs & 0x400) != 0) ratio = mulRightShift(ratio, new BN("17526086738831433728"));
        if ((tickAbs & 0x800) != 0) ratio = mulRightShift(ratio, new BN("16651378430235570176"));
        if ((tickAbs & 0x1000) != 0) ratio = mulRightShift(ratio, new BN("15030750278694412288"));
        if ((tickAbs & 0x2000) != 0) ratio = mulRightShift(ratio, new BN("12247334978884435968"));
        if ((tickAbs & 0x4000) != 0) ratio = mulRightShift(ratio, new BN("8131365268886854656"));
        if ((tickAbs & 0x8000) != 0) ratio = mulRightShift(ratio, new BN("3584323654725218816"));
        if ((tickAbs & 0x10000) != 0) ratio = mulRightShift(ratio, new BN("696457651848324352"));
        if ((tickAbs & 0x20000) != 0) ratio = mulRightShift(ratio, new BN("26294789957507116"));
        if ((tickAbs & 0x40000) != 0) ratio = mulRightShift(ratio, new BN("37481735321082"));

        if (tick > 0) ratio = MaxUint128.div(ratio);
        return ratio;
    }

    public static getTickFromSqrtPriceX64(sqrtPriceX64: BN): number {
        if (sqrtPriceX64.gt(MAX_SQRT_PRICE_X64) || sqrtPriceX64.lt(MIN_SQRT_PRICE_X64)) {
            throw new Error("Provided sqrtPrice is not within the supported sqrtPrice range.");
        }

        const msb = sqrtPriceX64.bitLength() - 1;
        const adjustedMsb = new BN(msb - 64);
        const log2pIntegerX32 = signedLeftShift(adjustedMsb, 32, 128);

        let bit = new BN("8000000000000000", "hex");
        let precision = 0;
        let log2pFractionX64 = new BN(0);

        let r = msb >= 64 ? sqrtPriceX64.shrn(msb - 63) : sqrtPriceX64.shln(63 - msb);

        while (bit.gt(new BN(0)) && precision < BIT_PRECISION) {
            r = r.mul(r);
            const rMoreThanTwo = r.shrn(127);
            r = r.shrn(63 + rMoreThanTwo.toNumber());
            log2pFractionX64 = log2pFractionX64.add(bit.mul(rMoreThanTwo));
            bit = bit.shrn(1);
            precision += 1;
        }

        const log2pFractionX32 = log2pFractionX64.shrn(32);

        const log2pX32 = log2pIntegerX32.add(log2pFractionX32);
        const logbpX64 = log2pX32.mul(new BN(LOG_B_2_X32));

        const tickLow = signedRightShift(logbpX64.sub(new BN(LOG_B_P_ERR_MARGIN_LOWER_X64)), 64, 128).toNumber();
        const tickHigh = signedRightShift(logbpX64.add(new BN(LOG_B_P_ERR_MARGIN_UPPER_X64)), 64, 128).toNumber();

        if (tickLow == tickHigh) {
            return tickLow;
        } else {
            const derivedTickHighSqrtPriceX64 = SqrtPriceMath.getSqrtPriceX64FromTick(tickHigh);
            return derivedTickHighSqrtPriceX64.lte(sqrtPriceX64) ? tickHigh : tickLow;
        }
    }
}

export class LiquidityMath {
    public static addDelta(x: BN, y: BN): BN {
        return x.add(y);
    }

    public static getTokenAmountAFromLiquidity(
        sqrtPriceX64A: BN,
        sqrtPriceX64B: BN,
        liquidity: BN,
        roundUp: boolean
    ): BN {
        if (sqrtPriceX64A.gt(sqrtPriceX64B)) {
            [sqrtPriceX64A, sqrtPriceX64B] = [sqrtPriceX64B, sqrtPriceX64A];
        }

        if (!sqrtPriceX64A.gt(ZERO)) {
            throw new Error("sqrtPriceX64A must greater than 0");
        }

        const numerator1 = liquidity.ushln(U64Resolution);
        const numerator2 = sqrtPriceX64B.sub(sqrtPriceX64A);

        return roundUp
            ? MathUtil.mulDivRoundingUp(MathUtil.mulDivCeil(numerator1, numerator2, sqrtPriceX64B), ONE, sqrtPriceX64A)
            : MathUtil.mulDivFloor(numerator1, numerator2, sqrtPriceX64B).div(sqrtPriceX64A);
    }

    public static getTokenAmountBFromLiquidity(
        sqrtPriceX64A: BN,
        sqrtPriceX64B: BN,
        liquidity: BN,
        roundUp: boolean
    ): BN {
        if (sqrtPriceX64A.gt(sqrtPriceX64B)) {
            [sqrtPriceX64A, sqrtPriceX64B] = [sqrtPriceX64B, sqrtPriceX64A];
        }
        if (!sqrtPriceX64A.gt(ZERO)) {
            throw new Error("sqrtPriceX64A must greater than 0");
        }

        return roundUp
            ? MathUtil.mulDivCeil(liquidity, sqrtPriceX64B.sub(sqrtPriceX64A), Q64)
            : MathUtil.mulDivFloor(liquidity, sqrtPriceX64B.sub(sqrtPriceX64A), Q64);
    }
}
