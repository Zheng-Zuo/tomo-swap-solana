import { TICK_ARRAY_SIZE, MAX_TICK, MIN_TICK } from "../constant";
import { TickUtils } from "./tick";

export class TickQuery {
    public static tickCount(tickSpacing: number): number {
        return TICK_ARRAY_SIZE * tickSpacing;
    }

    public static getArrayStartIndex(tickIndex: number, tickSpacing: number): number {
        const ticksInArray = this.tickCount(tickSpacing);
        const start = Math.floor(tickIndex / ticksInArray);

        return start * ticksInArray;
    }

    public static checkIsValidStartIndex(tickIndex: number, tickSpacing: number): boolean {
        if (TickUtils.checkIsOutOfBoundary(tickIndex)) {
            if (tickIndex > MAX_TICK) {
                return false;
            }
            const minStartIndex = TickUtils.getTickArrayStartIndexByTick(MIN_TICK, tickSpacing);
            return tickIndex == minStartIndex;
        }
        return tickIndex % this.tickCount(tickSpacing) == 0;
    }

    public static nextInitializedTickArray(
        tickIndex: number,
        tickSpacing: number,
        zeroForOne: boolean,
        tickArrayBitmap: any,
        exBitmapInfo: any
    ): {
        isExist: boolean;
        nextStartIndex: number;
    } {
        const currentOffset = Math.floor(tickIndex / TickQuery.tickCount(tickSpacing));
        const result: number[] = zeroForOne
            ? TickUtils.searchLowBitFromStart(tickArrayBitmap, exBitmapInfo, currentOffset - 1, 1, tickSpacing)
            : TickUtils.searchHightBitFromStart(tickArrayBitmap, exBitmapInfo, currentOffset + 1, 1, tickSpacing);

        return result.length > 0 ? { isExist: true, nextStartIndex: result[0] } : { isExist: false, nextStartIndex: 0 };
    }
}
