import { Raydium, TxVersion, parseTokenAccountResp } from "@raydium-io/raydium-sdk-v2";
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { loadKeypairFromFile } from "../utils";
import dotenv from "dotenv";

dotenv.config();

export const owner: Keypair = loadKeypairFromFile(process.env.LOCAL_PAYER_JSON_PATH);
// export const connection = new Connection(process.env.DEVNET_RPC_URL); // devnet
export const connection = new Connection(clusterApiUrl("mainnet-beta")); //<YOUR_RPC_URL>

export const txVersion = TxVersion.V0; // or TxVersion.LEGACY
const cluster = "mainnet"; // 'mainnet' | 'devnet'

let raydium: Raydium | undefined;
export const initSdk = async (params?: { loadToken?: boolean }) => {
    if (raydium) return raydium;
    if (connection.rpcEndpoint === clusterApiUrl("mainnet-beta"))
        console.warn("using free rpc node might cause unexpected error, strongly suggest uses paid rpc node");
    console.log(`connect to rpc ${connection.rpcEndpoint} in ${cluster}`);
    raydium = await Raydium.load({
        owner,
        connection,
        cluster,
        disableFeatureCheck: true,
        disableLoadToken: !params?.loadToken,
        blockhashCommitment: "finalized",
        // urlConfigs: {
        //   BASE_HOST: '<API_HOST>', // api url configs, currently api doesn't support devnet
        // },
    });
    return raydium;
};

export const fetchTokenAccountData = async () => {
    const solAccountResp = await connection.getAccountInfo(owner.publicKey);
    const tokenAccountResp = await connection.getTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_PROGRAM_ID });
    const token2022Req = await connection.getTokenAccountsByOwner(owner.publicKey, {
        programId: TOKEN_2022_PROGRAM_ID,
    });
    const tokenAccountData = parseTokenAccountResp({
        owner: owner.publicKey,
        solAccountResp,
        tokenAccountResp: {
            context: tokenAccountResp.context,
            value: [...tokenAccountResp.value, ...token2022Req.value],
        },
    });
    return tokenAccountData;
};
