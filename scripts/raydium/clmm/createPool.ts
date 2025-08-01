import { CLMM_PROGRAM_ID, DEVNET_PROGRAM_ID } from "@raydium-io/raydium-sdk-v2";
import { PublicKey } from "@solana/web3.js";
import { initSdk, txVersion } from "../config";
import Decimal from "decimal.js";
import BN from "bn.js";
import { devConfigs } from "./utils";

export const createPool = async () => {
    const raydium = await initSdk({ loadToken: true });

    // you can call sdk api to get mint info or paste mint info from api: https://api-v3.raydium.io/mint/list
    // RAY
    const mint1 = await raydium.token.getTokenInfo("DNqbR2wLMRaFwhq6o5LQr7LLgpgYVcngEC3zFxdpdSbC");
    // USDT
    const mint2 = await raydium.token.getTokenInfo("DaNj4ydkshkWHP94xGv7W6c1MuVRUvoHPjCcibUSagke");
    // const clmmConfigs = await raydium.api.getClmmConfigs();
    const clmmConfigs = devConfigs; // devnet configs

    const { execute } = await raydium.clmm.createPool({
        // programId: CLMM_PROGRAM_ID,
        programId: DEVNET_PROGRAM_ID.CLMM,
        mint1,
        mint2,
        ammConfig: { ...clmmConfigs[0], id: new PublicKey(clmmConfigs[0].id), fundOwner: "", description: "" },
        initialPrice: new Decimal(1),
        txVersion,
        // optional: set up priority fee here
        // computeBudgetConfig: {
        //   units: 600000,
        //   microLamports: 46591500,
        // },
    });
    // don't want to wait confirm, set sendAndConfirm to false or don't pass any params to execute
    const { txId } = await execute({ sendAndConfirm: true });
    console.log("clmm pool created:", { txId: `https://explorer.solana.com/tx/${txId}` });
    process.exit(); // if you don't want to end up node execution, comment this line
};

/** uncomment code below to execute */
createPool();

// clmm pool created: {
//     txId: 'https://explorer.solana.com/tx/5joXmUFoiHVoyVwwoxP7Saa2thtRmJXxvhAeKnCTmE2uTEph8yteJ5tJzsepexHzxeYLazdNGZbgUCENwQtzBC4K?cluster=devnet'
// }
// pool_state: 3UAPNZbpmyq3XfR8vACuyZwaFGy1HifkJZWeh6CALWTZ
