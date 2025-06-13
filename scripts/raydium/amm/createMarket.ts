import { PublicKey } from "@solana/web3.js";
import { OPEN_BOOK_PROGRAM, DEVNET_PROGRAM_ID } from "@raydium-io/raydium-sdk-v2";
import { initSdk, txVersion } from "../config";
import dotenv from "dotenv";
import yargs from "yargs/yargs";

dotenv.config();

function getOptions() {
    const options = yargs(process.argv.slice(2))
        .option("baseMint", {
            type: "string",
            describe: "base mint",
            default: "zzTXH9dZyEsNRjcD6t6ksW7oepJ4Wz4f36G9uWt3hb4",
        })
        .option("quoteMint", {
            type: "string",
            describe: "quote mint",
            default: "5RW6VG7iQ1UswfpAHceGD36UyU14i4dsiphSBqHL3hct",
        });

    return options.argv;
}

export const createMarket = async () => {
    let options: any = getOptions();
    const baseMint = new PublicKey(options.baseMint);
    const quoteMint = new PublicKey(options.quoteMint);
    console.log("Creating market...");
    console.log("baseMint", baseMint.toBase58());
    console.log("quoteMint", quoteMint.toBase58());

    const raydium = await initSdk();

    const { execute, extInfo, transactions } = await raydium.marketV2.create({
        baseInfo: {
            // create market doesn't support token 2022
            mint: baseMint,
            decimals: 9,
        },
        quoteInfo: {
            // create market doesn't support token 2022
            mint: quoteMint,
            decimals: 9,
        },
        lotSize: 1,
        tickSize: 0.01,
        // dexProgramId: OPEN_BOOK_PROGRAM,
        dexProgramId: DEVNET_PROGRAM_ID.OPENBOOK_MARKET, // devnet

        // requestQueueSpace: 5120 + 12, // optional
        // eventQueueSpace: 262144 + 12, // optional
        // orderbookQueueSpace: 65536 + 12, // optional

        txVersion,
        // optional: set up priority fee here
        // computeBudgetConfig: {
        //   units: 600000,
        //   microLamports: 46591500,
        // },
    });

    console.log(
        `create market total ${transactions.length} txs, market info: `,
        Object.keys(extInfo.address).reduce(
            (acc, cur) => ({
                ...acc,
                [cur]: extInfo.address[cur as keyof typeof extInfo.address].toBase58(),
            }),
            {}
        )
    );

    const txIds = await execute({
        // set sequentially to true means tx will be sent when previous one confirmed
        sequentially: true,
    });

    console.log("create market txIds:", txIds);
    process.exit();
};

createMarket();

// create market total 2 txs, market info:  {
//     marketId: '95cfkXtsybmCJt6ExB9umWgpWis8xtkQX1dqooczVwp3',
//     requestQueue: 'Cqg4RhrL9YnNB8rsaqfsxYfEjKHotYvnvgi7wr9VMgoR',
//     eventQueue: '7cw5h7sD5pZ3B1cxUfCoA15pxiUbGZRJ3xCM7hVgBNdD',
//     bids: 'D6rw9ykQhM5bqGXRVqcXJxBSg2mx7YLBVF1bBQH7Nqv1',
//     asks: 'EnGUeKJvirDJPCUX1Ehh8yRst2k8Lo5WeqRqnACusVJq',
//     baseVault: 'HyrDBShyVLrvq9DkDXVa7R1WhXmJpaQms52GkQu1vHJH',
//     quoteVault: 'Ek6vHGwrnd5j1GZjBYPzuETJ4KDGUgn4AavMGLJQNZZ7',
//     baseMint: 'zzTXH9dZyEsNRjcD6t6ksW7oepJ4Wz4f36G9uWt3hb4',
//     quoteMint: '5RW6VG7iQ1UswfpAHceGD36UyU14i4dsiphSBqHL3hct'
// }
