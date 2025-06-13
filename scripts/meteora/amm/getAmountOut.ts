import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

type VaultStateInputs = {
    totalAmount: BN;
    lastReport: BN;
    lockedProfitDegradation: BN;
    lastUpdatedLockedProfit: BN;
};

type PoolStateInputs = {
    tokenAMint: PublicKey;
    tokenBMint: PublicKey;
    tradeFeeDenominator: BN;
    tradeFeeNumerator: BN;
    protocolTradeFeeDenominator: BN;
    protocolTradeFeeNumerator: BN;
};

export type SwapQuoteParam = {
    poolState: PoolStateInputs;
    vaultA: VaultStateInputs;
    vaultB: VaultStateInputs;
    poolVaultALp: BN;
    poolVaultBLp: BN;
    vaultALpSupply: BN;
    vaultBLpSupply: BN;
    vaultAReserve: BN;
    vaultBReserve: BN;
    currentTime: number;
};

export enum ActivationType {
    Slot,
    Timestamp,
}

export const computeAmountOut = (tokenIn: PublicKey, amountIn: BN, params: SwapQuoteParam) => {
    const {
        vaultA,
        vaultB,
        vaultALpSupply,
        vaultBLpSupply,
        poolState,
        poolVaultALp,
        poolVaultBLp,
        currentTime,
        vaultAReserve,
        vaultBReserve,
    } = params;

    const { tokenAMint, tokenBMint } = poolState;

    const vaultAWithdrawableAmount = calculateWithdrawableAmount(currentTime, vaultA);
    const vaultBWithdrawableAmount = calculateWithdrawableAmount(currentTime, vaultB);

    const tokenAAmount = getAmountByShare(poolVaultALp, vaultAWithdrawableAmount, vaultALpSupply);
    const tokenBAmount = getAmountByShare(poolVaultBLp, vaultBWithdrawableAmount, vaultBLpSupply);

    const zeroForOne = tokenIn.equals(tokenAMint);

    const [
        sourceAmount,
        swapSourceVaultLpAmount,
        swapSourceAmount,
        swapDestinationAmount,
        swapSourceVault,
        swapDestinationVault,
        swapSourceVaultLpSupply,
        swapDestinationVaultLpSupply,
    ] = zeroForOne
        ? [amountIn, poolVaultALp, tokenAAmount, tokenBAmount, vaultA, vaultB, vaultALpSupply, vaultBLpSupply]
        : [amountIn, poolVaultBLp, tokenBAmount, tokenAAmount, vaultB, vaultA, vaultBLpSupply, vaultALpSupply];

    const tradeFee = calculateTradingFee(sourceAmount, poolState);
    const protocolFee = calculateProtocolTradingFee(tradeFee, poolState);
    const tradeFeeAfterProtocolFee = tradeFee.sub(protocolFee);

    const sourceVaultWithdrawableAmount = calculateWithdrawableAmount(currentTime, swapSourceVault);
    const beforeSwapSourceAmount = swapSourceAmount;
    const sourceAmountLessProtocolFee = sourceAmount.sub(protocolFee);

    const sourceVaultLp = getUnmintAmount(
        sourceAmountLessProtocolFee,
        sourceVaultWithdrawableAmount,
        swapSourceVaultLpSupply
    );

    const sourceVaultTotalAmount = sourceVaultWithdrawableAmount.add(sourceAmountLessProtocolFee);

    const afterSwapSourceAmount = getAmountByShare(
        sourceVaultLp.add(swapSourceVaultLpAmount),
        sourceVaultTotalAmount,
        swapSourceVaultLpSupply.add(sourceVaultLp)
    );

    const actualSourceAmount = afterSwapSourceAmount.sub(beforeSwapSourceAmount);
    let sourceAmountWithFee = actualSourceAmount.sub(tradeFeeAfterProtocolFee);

    // constant product curve: X*Y = K
    const destinationAmount = constantProductCurveComupteAmountOut(
        sourceAmountWithFee,
        swapSourceAmount,
        swapDestinationAmount
    );

    const destinationVaultWithdrawableAmount = calculateWithdrawableAmount(currentTime, swapDestinationVault);
    const destinationVaultLp = getUnmintAmount(
        destinationAmount,
        destinationVaultWithdrawableAmount,
        swapDestinationVaultLpSupply
    );

    let actualDestinationAmount = getAmountByShare(
        destinationVaultLp,
        destinationVaultWithdrawableAmount,
        swapDestinationVaultLpSupply
    );

    const maxSwapOutAmount = calculateMaxSwapOutAmount(
        zeroForOne ? tokenBMint : tokenAMint,
        tokenAMint,
        tokenBMint,
        tokenAAmount,
        tokenBAmount,
        vaultAReserve,
        vaultBReserve
    );

    if (actualDestinationAmount.gt(maxSwapOutAmount)) {
        throw new Error("Out amount > vault reserve");
    }

    return actualDestinationAmount;
};

export const LOCKED_PROFIT_DEGRADATION_DENOMINATOR = new BN(1_000_000_000_000);

export function calculateWithdrawableAmount(onChainTime: number, vaultState: VaultStateInputs) {
    const { totalAmount, lastReport, lockedProfitDegradation, lastUpdatedLockedProfit } = vaultState;

    const duration = new BN(onChainTime).sub(lastReport);

    const lockedFundRatio = duration.mul(lockedProfitDegradation);
    if (lockedFundRatio.gt(LOCKED_PROFIT_DEGRADATION_DENOMINATOR)) {
        return totalAmount;
    }

    const lockedProfit = lastUpdatedLockedProfit
        .mul(LOCKED_PROFIT_DEGRADATION_DENOMINATOR.sub(lockedFundRatio))
        .div(LOCKED_PROFIT_DEGRADATION_DENOMINATOR);

    return totalAmount.sub(lockedProfit);
}

export function getAmountByShare(share: BN, withdrawableAmount: BN, totalSupply: BN): BN {
    return totalSupply.isZero() ? new BN(0) : share.mul(withdrawableAmount).div(totalSupply);
}

export const calculateTradingFee = (amount: BN, poolState: PoolStateInputs): BN => {
    const { tradeFeeDenominator, tradeFeeNumerator } = poolState;
    return amount.mul(tradeFeeNumerator).div(tradeFeeDenominator);
};

export const calculateProtocolTradingFee = (amount: BN, poolState: PoolStateInputs): BN => {
    const { protocolTradeFeeDenominator, protocolTradeFeeNumerator } = poolState;
    return amount.mul(protocolTradeFeeNumerator).div(protocolTradeFeeDenominator);
};

export function getUnmintAmount(amount: BN, withdrawableAmount: BN, totalSupply: BN) {
    return amount.mul(totalSupply).div(withdrawableAmount);
}

export function constantProductCurveComupteAmountOut(amountIn: BN, reserveIn: BN, reserveOut: BN) {
    // (reserveIn + amountIn) * newReserveOut = reserveIn * reserveOut
    // amountOut = reserveOut - newReserveOut
    const numerator = reserveIn.mul(reserveOut);
    const denominator = reserveIn.add(amountIn);
    const [newReserveOut, _] = ceilDiv(numerator, denominator);
    const amountOut = reserveOut.sub(newReserveOut);
    if (amountOut.eq(new BN(0))) {
        throw new Error("Swap result in zero");
    }
    return amountOut;
}

// Typescript implementation of https://github.com/solana-labs/solana-program-library/blob/master/libraries/math/src/checked_ceil_div.rs#L29
function ceilDiv(lhs: BN, rhs: BN) {
    let quotient = lhs.div(rhs);
    // Avoid dividing a small number by a big one and returning 1, and instead
    // fail.
    if (quotient.eq(new BN(0))) {
        throw new Error("ceilDiv result in zero");
    }

    let remainder = lhs.mod(rhs);

    if (remainder.gt(new BN(0))) {
        quotient = quotient.add(new BN(1));
        rhs = lhs.div(quotient);
        remainder = lhs.mod(quotient);
        if (remainder.gt(new BN(0))) {
            rhs = rhs.add(new BN(1));
        }
    }

    return [quotient, rhs];
}

export const calculateMaxSwapOutAmount = (
    tokenOutMint: PublicKey,
    tokenAMint: PublicKey,
    tokenBMint: PublicKey,
    tokenAAmount: BN,
    tokenBAmount: BN,
    vaultAReserve: BN,
    vaultBReserve: BN
) => {
    if (!tokenOutMint.equals(tokenAMint) && !tokenOutMint.equals(tokenBMint)) {
        throw new Error("Invalid mint");
    }

    const [outTotalAmount, outReserveBalance] = tokenOutMint.equals(tokenAMint)
        ? [tokenAAmount, vaultAReserve]
        : [tokenBAmount, vaultBReserve];

    return outTotalAmount.gt(outReserveBalance) ? outReserveBalance : outTotalAmount;
};
