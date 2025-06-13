import BN from "bn.js";
import { TickQuery } from "./tickQuery";
import { MAX_TICK, MIN_TICK, TICK_ARRAY_SIZE } from "../constant";

export class TickUtils {
    public static nextInitTick(
        tickArrayCurrent: any,
        currentTickIndex: number,
        tickSpacing: number,
        zeroForOne: boolean,
        t: boolean
    ) {
        const currentTickArrayStartIndex = TickQuery.getArrayStartIndex(currentTickIndex, tickSpacing);
        if (currentTickArrayStartIndex != tickArrayCurrent.startTickIndex) {
            return null;
        }
        let offsetInArray = Math.floor((currentTickIndex - tickArrayCurrent.startTickIndex) / tickSpacing);

        if (zeroForOne) {
            while (offsetInArray >= 0) {
                if (tickArrayCurrent.ticks[offsetInArray].liquidityGross.gtn(0)) {
                    return tickArrayCurrent.ticks[offsetInArray];
                }
                offsetInArray = offsetInArray - 1;
            }
        } else {
            if (!t) offsetInArray = offsetInArray + 1;
            while (offsetInArray < TICK_ARRAY_SIZE) {
                if (tickArrayCurrent.ticks[offsetInArray].liquidityGross.gtn(0)) {
                    return tickArrayCurrent.ticks[offsetInArray];
                }
                offsetInArray = offsetInArray + 1;
            }
        }
        return null;
    }

    public static getTickArrayBitIndex(tickIndex: number, tickSpacing: number): number {
        const ticksInArray = TickQuery.tickCount(tickSpacing);

        let startIndex: number = tickIndex / ticksInArray;
        if (tickIndex < 0 && tickIndex % ticksInArray != 0) {
            startIndex = Math.ceil(startIndex) - 1;
        } else {
            startIndex = Math.floor(startIndex);
        }
        return startIndex;
    }

    public static getTickArrayStartIndexByTick(tickIndex: number, tickSpacing: number): number {
        return this.getTickArrayBitIndex(tickIndex, tickSpacing) * TickQuery.tickCount(tickSpacing);
    }

    public static checkIsOutOfBoundary(tick: number): boolean {
        return tick < MIN_TICK || tick > MAX_TICK;
    }

    public static mergeTickArrayBitmap(bns: BN[]): BN {
        let b = new BN(0);
        for (let i = 0; i < bns.length; i++) {
            b = b.add(bns[i].shln(64 * i));
        }
        return b;
    }

    public static checkTickArrayIsInitialized(
        bitmap: BN,
        tick: number,
        tickSpacing: number
    ): {
        isInitialized: boolean;
        startIndex: number;
    } {
        const multiplier = tickSpacing * TICK_ARRAY_SIZE;
        const compressed = Math.floor(tick / multiplier) + 512;
        const bitPos = Math.abs(compressed);
        return {
            isInitialized: bitmap.testn(bitPos),
            startIndex: (bitPos - 512) * multiplier,
        };
    }

    public static firstInitializedTick(tickArrayCurrent: any, zeroForOne: boolean): any {
        if (zeroForOne) {
            let i = TICK_ARRAY_SIZE - 1;
            while (i >= 0) {
                if (tickArrayCurrent.ticks[i].liquidityGross.gtn(0)) {
                    return tickArrayCurrent.ticks[i];
                }
                i = i - 1;
            }
        } else {
            let i = 0;
            while (i < TICK_ARRAY_SIZE) {
                if (tickArrayCurrent.ticks[i].liquidityGross.gtn(0)) {
                    return tickArrayCurrent.ticks[i];
                }
                i = i + 1;
            }
        }

        throw Error(`firstInitializedTick check error: ${tickArrayCurrent} - ${zeroForOne}`);
    }

    public static searchLowBitFromStart(
        tickArrayBitmap: BN[],
        exTickArrayBitmap: any,
        currentTickArrayBitStartIndex: number,
        expectedCount: number,
        tickSpacing: number
    ): number[] {
        const tickArrayBitmaps = [
            ...[...exTickArrayBitmap.negativeTickArrayBitmap].reverse(),
            tickArrayBitmap.slice(0, 8),
            tickArrayBitmap.slice(8, 16),
            ...exTickArrayBitmap.positiveTickArrayBitmap,
        ].map((i) => TickUtils.mergeTickArrayBitmap(i));
        const result: number[] = [];
        while (currentTickArrayBitStartIndex >= -7680) {
            const arrayIndex = Math.floor((currentTickArrayBitStartIndex + 7680) / 512);
            const searchIndex = (currentTickArrayBitStartIndex + 7680) % 512;

            if (tickArrayBitmaps[arrayIndex].testn(searchIndex)) result.push(currentTickArrayBitStartIndex);

            currentTickArrayBitStartIndex--;
            if (result.length === expectedCount) break;
        }

        const tickCount = TickQuery.tickCount(tickSpacing);
        return result.map((i) => i * tickCount);
    }

    public static searchHightBitFromStart(
        tickArrayBitmap: BN[],
        exTickArrayBitmap: any,
        currentTickArrayBitStartIndex: number,
        expectedCount: number,
        tickSpacing: number
    ): number[] {
        const tickArrayBitmaps = [
            ...[...exTickArrayBitmap.negativeTickArrayBitmap].reverse(),
            tickArrayBitmap.slice(0, 8),
            tickArrayBitmap.slice(8, 16),
            ...exTickArrayBitmap.positiveTickArrayBitmap,
        ].map((i) => TickUtils.mergeTickArrayBitmap(i));
        const result: number[] = [];
        while (currentTickArrayBitStartIndex < 7680) {
            const arrayIndex = Math.floor((currentTickArrayBitStartIndex + 7680) / 512);
            const searchIndex = (currentTickArrayBitStartIndex + 7680) % 512;

            if (tickArrayBitmaps[arrayIndex].testn(searchIndex)) result.push(currentTickArrayBitStartIndex);

            currentTickArrayBitStartIndex++;
            if (result.length === expectedCount) break;
        }

        const tickCount = TickQuery.tickCount(tickSpacing);
        return result.map((i) => i * tickCount);
    }
}
