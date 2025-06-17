import BN from "bn.js";

export function calTokenAmountOut(
    amountIn: BN,
    virtualTokenReserves: BN,
    virtualSolReserves: BN,
    realTokenReserves: BN
): BN {
    // real_amount_in = amount_in * 980009 / 1000000
    const realAmountIn = amountIn.mul(new BN(990000)).div(new BN(1000000));
    const numerator = virtualTokenReserves.mul(virtualSolReserves);
    const denominator = virtualSolReserves.add(realAmountIn);
    let amountOut = virtualTokenReserves.sub(numerator.div(denominator));
    if (amountOut.gt(realTokenReserves)) {
        amountOut = realTokenReserves;
    }
    return amountOut;
}

export function calSolAmountOut(
    tokenAmountIn: BN,
    virtualTokenReserves: BN,
    virtualSolReserves: BN,
    realSolReserves: BN
): BN {
    const numerator = virtualTokenReserves.mul(virtualSolReserves);
    const denominator = virtualTokenReserves.sub(tokenAmountIn);
    let solAmountOut = numerator.div(denominator).sub(virtualSolReserves);
    if (solAmountOut.gt(realSolReserves)) {
        solAmountOut = realSolReserves;
    }
    // sol_amount_out.checked_mul(980009).unwrap().checked_div(1000000).unwrap();
    const solAmountOutAfterFee = solAmountOut.mul(new BN(990000)).div(new BN(1000000));
    return solAmountOutAfterFee;
}
