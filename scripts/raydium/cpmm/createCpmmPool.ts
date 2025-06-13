import {
    CREATE_CPMM_POOL_PROGRAM,
    CREATE_CPMM_POOL_FEE_ACC,
    DEVNET_PROGRAM_ID,
    getCpmmPdaAmmConfigId,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { initSdk, txVersion } from "../config";

export const createPool = async () => {
    const raydium = await initSdk({ loadToken: true });

    // check token list here: https://api-v3.raydium.io/mint/list
    // RAY
    const mintA = await raydium.token.getTokenInfo("5RW6VG7iQ1UswfpAHceGD36UyU14i4dsiphSBqHL3hct");
    // USDC
    const mintB = await raydium.token.getTokenInfo("DNqbR2wLMRaFwhq6o5LQr7LLgpgYVcngEC3zFxdpdSbC");

    /**
     * you also can provide mint info directly like below, then don't have to call token info api
     *  {
        address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        decimals: 6,
      } 
     */

    const feeConfigs = await raydium.api.getCpmmConfigs();

    if (raydium.cluster === "devnet") {
        feeConfigs.forEach((config) => {
            config.id = getCpmmPdaAmmConfigId(
                DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
                config.index
            ).publicKey.toBase58();
        });
    }

    const { execute, extInfo } = await raydium.cpmm.createPool({
        // poolId: // your custom publicKey, default sdk will automatically calculate pda pool id
        // programId: CREATE_CPMM_POOL_PROGRAM, // mainnet
        programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, // devnet
        // poolFeeAccount: CREATE_CPMM_POOL_FEE_ACC, // mainnet
        poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC, // devnet
        mintA,
        mintB,
        mintAAmount: new BN(1000000000000000),
        mintBAmount: new BN(1000000000000000),
        startTime: new BN(0),
        feeConfig: feeConfigs[0],
        associatedOnly: false,
        ownerInfo: {
            useSOLBalance: true,
        },
        txVersion,
        // optional: set up priority fee here
        // computeBudgetConfig: {
        //   units: 600000,
        //   microLamports: 46591500,
        // },
    });

    // don't want to wait confirm, set sendAndConfirm to false or don't pass any params to execute
    const { txId } = await execute({ sendAndConfirm: true });
    console.log("pool created", {
        txId,
        poolKeys: Object.keys(extInfo.address).reduce(
            (acc, cur) => ({
                ...acc,
                [cur]: extInfo.address[cur as keyof typeof extInfo.address].toString(),
            }),
            {}
        ),
    });
    process.exit(); // if you don't want to end up node execution, comment this line
};

/** uncomment code below to execute */
createPool();

// pool created {
// txId: 'ag8yaGuMVnads65qbFvQ4t1KTFx2iPRrB9ThLsJ1SGC7U3hq3Bbzd4qQRru7pT6K7iEUmCWTmj1g8fUj1zf753M',
// poolKeys: {
//     poolId: '5JLTwsJcn1BmGTv4xXSD48M4FT9zNm5z6nXN1hpesCsE',
//     configId: '9zSzfkYy6awexsHvmggeH36pfVUdDGyCcwmjT3AQPBj6',
//     authority: '7rQ1QFNosMkUCuh7Z7fPbTHvh73b68sQYdirycEzJVuw',
//     lpMint: 'GBffd6u18mD548RRfqCreSxHe4TebRkNAPJDK7vG8Gbz',
//     vaultA: 'BN5nzgucviLtPuG3MjPxGVwEiiRTnJ19NHdxiic3ibs6',
//     vaultB: 'C1CycVscz2ZeKHmwo853j8XMfNQfzHkm3bGXtZWkLLdP',
//     observationId: '2ar8AD8Uf7mQRtoLZLB9iKyR7oPgUT1QgP5XHHA2JyPV',
//     mintA: '[object Object]',
//     mintB: '[object Object]',
//     programId: 'CPMDWBwJDtYax9qW7AyRuVC19Cc4L4Vcy4n2BHAbHkCW',
//     poolFeeAccount: 'G11FKBRaAkHAKuLCgLM6K6NUc9rTjPAznRCjZifrTQe2',
//     feeConfig: '[object Object]'
//     }
// }
