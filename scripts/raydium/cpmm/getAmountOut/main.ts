import { ApiV3PoolInfoStandardItemCpmm, CpmmKeys, CpmmRpcData, CurveCalculator } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { initSdk, txVersion } from "../../config";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

async function main() {
    const raydium = await initSdk();

    // SOL - USDC pool
    const poolId = "7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny";
    const inputAmount = new BN(10000000);
    const inputMint = NATIVE_MINT.toBase58();

    let poolInfo: ApiV3PoolInfoStandardItemCpmm;
    let poolKeys: CpmmKeys | undefined;
    let rpcData: CpmmRpcData;

    const data = await raydium.api.fetchPoolById({ ids: poolId });
    poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;
    rpcData = await raydium.cpmm.getRpcPoolInfo(poolInfo.id, true);

    const baseIn = inputMint === poolInfo.mintA.address;

    const swapResult = CurveCalculator.swap(
        inputAmount,
        baseIn ? rpcData.baseReserve : rpcData.quoteReserve,
        baseIn ? rpcData.quoteReserve : rpcData.baseReserve,
        rpcData.configInfo!.tradeFeeRate
    );

    console.log(inputAmount.toString());
    console.log((baseIn ? rpcData.baseReserve : rpcData.quoteReserve).toString());
    console.log((baseIn ? rpcData.quoteReserve : rpcData.baseReserve).toString());
    console.log(rpcData.configInfo!.tradeFeeRate.toString());

    console.log(swapResult.destinationAmountSwapped.toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
