import BN from "bn.js";
import { TICK_ARRAY_SIZE, TICK_ARRAY_BITMAP_SIZE, MAX_TICK, MIN_TICK } from "../constant";
import { TickQuery } from "./tickQuery";
import { TickUtils } from "./tick";
import { mostSignificantBit, leastSignificantBit, isZero, leadingZeros, trailingZeros } from "./math";

export class TickArrayBitmap {
    public static getBitmapTickBoundary(
        tickarrayStartIndex: number,
        tickSpacing: number
    ): {
        minValue: number;
        maxValue: number;
    } {
        const ticksInOneBitmap = this.maxTickInTickarrayBitmap(tickSpacing);
        let m = Math.floor(Math.abs(tickarrayStartIndex) / ticksInOneBitmap);
        if (tickarrayStartIndex < 0 && Math.abs(tickarrayStartIndex) % ticksInOneBitmap != 0) m += 1;

        const minValue = ticksInOneBitmap * m;

        return tickarrayStartIndex < 0
            ? { minValue: -minValue, maxValue: -minValue + ticksInOneBitmap }
            : { minValue, maxValue: minValue + ticksInOneBitmap };
    }

    public static maxTickInTickarrayBitmap(tickSpacing: number): number {
        return tickSpacing * TICK_ARRAY_SIZE * TICK_ARRAY_BITMAP_SIZE;
    }

    public static nextInitializedTickArrayStartIndex(
        bitMap: BN,
        lastTickArrayStartIndex: number,
        tickSpacing: number,
        zeroForOne: boolean
    ): { isInit: boolean; tickIndex: number } {
        if (!TickQuery.checkIsValidStartIndex(lastTickArrayStartIndex, tickSpacing))
            throw Error("nextInitializedTickArrayStartIndex check error");

        const tickBoundary = this.maxTickInTickarrayBitmap(tickSpacing);
        const nextTickArrayStartIndex = zeroForOne
            ? lastTickArrayStartIndex - TickQuery.tickCount(tickSpacing)
            : lastTickArrayStartIndex + TickQuery.tickCount(tickSpacing);

        if (nextTickArrayStartIndex < -tickBoundary || nextTickArrayStartIndex >= tickBoundary) {
            return { isInit: false, tickIndex: lastTickArrayStartIndex };
        }

        const multiplier = tickSpacing * TICK_ARRAY_SIZE;
        let compressed = nextTickArrayStartIndex / multiplier + 512;

        if (nextTickArrayStartIndex < 0 && nextTickArrayStartIndex % multiplier != 0) {
            compressed--;
        }

        const bitPos = Math.abs(compressed);

        if (zeroForOne) {
            const offsetBitMap = bitMap.shln(1024 - bitPos - 1);
            const nextBit = mostSignificantBit(1024, offsetBitMap);
            if (nextBit !== null) {
                const nextArrayStartIndex = (bitPos - nextBit - 512) * multiplier;
                return { isInit: true, tickIndex: nextArrayStartIndex };
            } else {
                return { isInit: false, tickIndex: -tickBoundary };
            }
        } else {
            const offsetBitMap = bitMap.shrn(bitPos);
            const nextBit = leastSignificantBit(1024, offsetBitMap);
            if (nextBit !== null) {
                const nextArrayStartIndex = (bitPos + nextBit - 512) * multiplier;
                return { isInit: true, tickIndex: nextArrayStartIndex };
            } else {
                return { isInit: false, tickIndex: tickBoundary - TickQuery.tickCount(tickSpacing) };
            }
        }
    }
}

export class TickArrayBitmapExtensionUtils {
    public static getBitmapOffset(tickIndex: number, tickSpacing: number): number {
        if (!TickQuery.checkIsValidStartIndex(tickIndex, tickSpacing)) {
            throw new Error("No enough initialized tickArray");
        }
        this.checkExtensionBoundary(tickIndex, tickSpacing);

        const ticksInOneBitmap = TickArrayBitmap.maxTickInTickarrayBitmap(tickSpacing);
        let offset = Math.floor(Math.abs(tickIndex) / ticksInOneBitmap) - 1;

        if (tickIndex < 0 && Math.abs(tickIndex) % ticksInOneBitmap === 0) offset--;
        return offset;
    }

    public static checkExtensionBoundary(tickIndex: number, tickSpacing: number) {
        const { positiveTickBoundary, negativeTickBoundary } = this.extensionTickBoundary(tickSpacing);

        if (tickIndex >= negativeTickBoundary && tickIndex < positiveTickBoundary) {
            throw Error("checkExtensionBoundary -> InvalidTickArrayBoundary");
        }
    }

    public static extensionTickBoundary(tickSpacing: number): {
        positiveTickBoundary: number;
        negativeTickBoundary: number;
    } {
        const positiveTickBoundary = TickArrayBitmap.maxTickInTickarrayBitmap(tickSpacing);

        const negativeTickBoundary = -positiveTickBoundary;

        if (MAX_TICK <= positiveTickBoundary)
            throw Error(`extensionTickBoundary check error: ${MAX_TICK}, ${positiveTickBoundary}`);
        if (negativeTickBoundary <= MIN_TICK)
            throw Error(`extensionTickBoundary check error: ${negativeTickBoundary}, ${MIN_TICK}`);

        return { positiveTickBoundary, negativeTickBoundary };
    }

    public static getBitmap(
        tickIndex: number,
        tickSpacing: number,
        tickArrayBitmapExtension: any
    ): { offset: number; tickarrayBitmap: BN[] } {
        const offset = this.getBitmapOffset(tickIndex, tickSpacing);
        if (tickIndex < 0) {
            return { offset, tickarrayBitmap: tickArrayBitmapExtension.negativeTickArrayBitmap[offset] };
        } else {
            return { offset, tickarrayBitmap: tickArrayBitmapExtension.positiveTickArrayBitmap[offset] };
        }
    }

    public static checkTickArrayIsInit(
        tickArrayStartIndex: number,
        tickSpacing: number,
        tickArrayBitmapExtension: any
    ): { isInitialized: boolean; startIndex: number } {
        const { tickarrayBitmap } = this.getBitmap(tickArrayStartIndex, tickSpacing, tickArrayBitmapExtension);

        const tickArrayOffsetInBitmap = this.tickArrayOffsetInBitmap(tickArrayStartIndex, tickSpacing);

        return {
            isInitialized: TickUtils.mergeTickArrayBitmap(tickarrayBitmap).testn(tickArrayOffsetInBitmap),
            startIndex: tickArrayStartIndex,
        };
    }

    public static tickArrayOffsetInBitmap(tickArrayStartIndex: number, tickSpacing: number): number {
        const m = Math.abs(tickArrayStartIndex) % TickArrayBitmap.maxTickInTickarrayBitmap(tickSpacing);
        let tickArrayOffsetInBitmap = Math.floor(m / TickQuery.tickCount(tickSpacing));
        if (tickArrayStartIndex < 0 && m != 0) {
            tickArrayOffsetInBitmap = TICK_ARRAY_BITMAP_SIZE - tickArrayOffsetInBitmap;
        }
        return tickArrayOffsetInBitmap;
    }

    public static nextInitializedTickArrayFromOneBitmap(
        lastTickArrayStartIndex: number,
        tickSpacing: number,
        zeroForOne: boolean,
        tickArrayBitmapExtension: any
    ): {
        isInit: boolean;
        tickIndex: number;
    } {
        const multiplier = TickQuery.tickCount(tickSpacing);
        const nextTickArrayStartIndex = zeroForOne
            ? lastTickArrayStartIndex - multiplier
            : lastTickArrayStartIndex + multiplier;
        const { tickarrayBitmap } = this.getBitmap(nextTickArrayStartIndex, tickSpacing, tickArrayBitmapExtension);

        return this.nextInitializedTickArrayInBitmap(tickarrayBitmap, nextTickArrayStartIndex, tickSpacing, zeroForOne);
    }

    public static nextInitializedTickArrayInBitmap(
        tickarrayBitmap: BN[],
        nextTickArrayStartIndex: number,
        tickSpacing: number,
        zeroForOne: boolean
    ): {
        isInit: boolean;
        tickIndex: number;
    } {
        const { minValue: bitmapMinTickBoundary, maxValue: bitmapMaxTickBoundary } =
            TickArrayBitmap.getBitmapTickBoundary(nextTickArrayStartIndex, tickSpacing);

        const tickArrayOffsetInBitmap = this.tickArrayOffsetInBitmap(nextTickArrayStartIndex, tickSpacing);
        if (zeroForOne) {
            // tick from upper to lower
            // find from highter bits to lower bits
            const offsetBitMap = TickUtils.mergeTickArrayBitmap(tickarrayBitmap).shln(
                TICK_ARRAY_BITMAP_SIZE - 1 - tickArrayOffsetInBitmap
            );

            const nextBit = isZero(512, offsetBitMap) ? null : leadingZeros(512, offsetBitMap);

            if (nextBit !== null) {
                const nextArrayStartIndex = nextTickArrayStartIndex - nextBit * TickQuery.tickCount(tickSpacing);
                return { isInit: true, tickIndex: nextArrayStartIndex };
            } else {
                // not found til to the end
                return { isInit: false, tickIndex: bitmapMinTickBoundary };
            }
        } else {
            // tick from lower to upper
            // find from lower bits to highter bits
            const offsetBitMap = TickUtils.mergeTickArrayBitmap(tickarrayBitmap).shrn(tickArrayOffsetInBitmap);

            const nextBit = isZero(512, offsetBitMap) ? null : trailingZeros(512, offsetBitMap);

            if (nextBit !== null) {
                const nextArrayStartIndex = nextTickArrayStartIndex + nextBit * TickQuery.tickCount(tickSpacing);
                return { isInit: true, tickIndex: nextArrayStartIndex };
            } else {
                // not found til to the end
                return { isInit: false, tickIndex: bitmapMaxTickBoundary - TickQuery.tickCount(tickSpacing) };
            }
        }
    }
}
