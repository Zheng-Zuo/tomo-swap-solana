import { TickUtils } from "./tick";
import { MAX_TICK, MIN_TICK } from "../constant";
import { TickArrayBitmap } from "./tickArrayBitmap";
import { TickQuery } from "./tickQuery";
import { TickArrayBitmapExtensionUtils } from "./tickArrayBitmap";
import { getPdaTickArrayAddress } from "./pda";

export class PoolUtils {
    public static getFirstInitializedTickArray(poolInfo: any, zeroForOne: boolean) {
        const { isInitialized, startIndex } = this.isOverflowDefaultTickarrayBitmap(poolInfo.tickSpacing, [
            poolInfo.tickCurrent,
        ])
            ? TickArrayBitmapExtensionUtils.checkTickArrayIsInit(
                  TickQuery.getArrayStartIndex(poolInfo.tickCurrent, poolInfo.tickSpacing),
                  poolInfo.tickSpacing,
                  poolInfo.exBitmapInfo
              )
            : TickUtils.checkTickArrayIsInitialized(
                  TickUtils.mergeTickArrayBitmap(poolInfo.tickArrayBitmap),
                  poolInfo.tickCurrent,
                  poolInfo.tickSpacing
              );

        if (isInitialized) {
            const { publicKey: address } = getPdaTickArrayAddress(poolInfo.programId, poolInfo.poolId, startIndex);
            return {
                isExist: true,
                startIndex,
                nextAccountMeta: address,
            };
        }
        const { isExist, nextStartIndex } = this.nextInitializedTickArrayStartIndex(
            poolInfo,
            TickQuery.getArrayStartIndex(poolInfo.tickCurrent, poolInfo.tickSpacing),
            zeroForOne
        );
        if (isExist) {
            const { publicKey: address } = getPdaTickArrayAddress(poolInfo.programId, poolInfo.poolId, nextStartIndex);
            return {
                isExist: true,
                startIndex: nextStartIndex,
                nextAccountMeta: address,
            };
        }
        return { isExist: false, nextAccountMeta: undefined, startIndex: undefined };
    }

    public static isOverflowDefaultTickarrayBitmap(tickSpacing: number, tickarrayStartIndexs: number[]): boolean {
        const { maxTickBoundary, minTickBoundary } = this.tickRange(tickSpacing);

        for (const tickIndex of tickarrayStartIndexs) {
            const tickarrayStartIndex = TickUtils.getTickArrayStartIndexByTick(tickIndex, tickSpacing);

            if (tickarrayStartIndex >= maxTickBoundary || tickarrayStartIndex < minTickBoundary) {
                return true;
            }
        }

        return false;
    }

    public static tickRange(tickSpacing: number): {
        maxTickBoundary: number;
        minTickBoundary: number;
    } {
        let maxTickBoundary = TickArrayBitmap.maxTickInTickarrayBitmap(tickSpacing);
        let minTickBoundary = -maxTickBoundary;

        if (maxTickBoundary > MAX_TICK) {
            maxTickBoundary = TickQuery.getArrayStartIndex(MAX_TICK, tickSpacing) + TickQuery.tickCount(tickSpacing);
        }
        if (minTickBoundary < MIN_TICK) {
            minTickBoundary = TickQuery.getArrayStartIndex(MIN_TICK, tickSpacing);
        }
        return { maxTickBoundary, minTickBoundary };
    }

    public static nextInitializedTickArrayStartIndex(
        poolInfo: any,
        lastTickArrayStartIndex: number,
        zeroForOne: boolean
    ): { isExist: boolean; nextStartIndex: number } {
        lastTickArrayStartIndex = TickQuery.getArrayStartIndex(poolInfo.tickCurrent, poolInfo.tickSpacing);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { isInit: startIsInit, tickIndex: startIndex } = TickArrayBitmap.nextInitializedTickArrayStartIndex(
                TickUtils.mergeTickArrayBitmap(poolInfo.tickArrayBitmap),
                lastTickArrayStartIndex,
                poolInfo.tickSpacing,
                zeroForOne
            );
            if (startIsInit) {
                return { isExist: true, nextStartIndex: startIndex };
            }
            lastTickArrayStartIndex = startIndex;

            const { isInit, tickIndex } = TickArrayBitmapExtensionUtils.nextInitializedTickArrayFromOneBitmap(
                lastTickArrayStartIndex,
                poolInfo.tickSpacing,
                zeroForOne,
                poolInfo.exBitmapInfo
            );
            if (isInit) return { isExist: true, nextStartIndex: tickIndex };

            lastTickArrayStartIndex = tickIndex;

            if (lastTickArrayStartIndex < MIN_TICK || lastTickArrayStartIndex > MAX_TICK)
                return { isExist: false, nextStartIndex: 0 };
        }
    }
}
