import {
    MARKET_STATE_LAYOUT_V3,
    AMM_V4,
    OPEN_BOOK_PROGRAM,
    FEE_DESTINATION_ID,
    DEVNET_PROGRAM_ID,
} from "@raydium-io/raydium-sdk-v2";
import { initSdk, txVersion } from "../config";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";

export const createAmmPool = async () => {
    const raydium = await initSdk();
    const marketId = new PublicKey("95cfkXtsybmCJt6ExB9umWgpWis8xtkQX1dqooczVwp3");

    // if you are confirmed your market info, don't have to get market info from rpc below
    const marketBufferInfo = await raydium.connection.getAccountInfo(new PublicKey(marketId));
    const { baseMint, quoteMint } = MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo!.data);

    // check mint info here: https://api-v3.raydium.io/mint/list
    // or get mint info by api: await raydium.token.getTokenInfo('mint address')

    // amm pool doesn't support token 2022
    const baseMintInfo = await raydium.token.getTokenInfo(baseMint);
    const quoteMintInfo = await raydium.token.getTokenInfo(quoteMint);
    const baseAmount = new BN(1000000000000000);
    const quoteAmount = new BN(1000000000000000);

    if (
        baseMintInfo.programId !== TOKEN_PROGRAM_ID.toBase58() ||
        quoteMintInfo.programId !== TOKEN_PROGRAM_ID.toBase58()
    ) {
        throw new Error(
            "amm pools with openbook market only support TOKEN_PROGRAM_ID mints, if you want to create pool with token-2022, please create cpmm pool instead"
        );
    }

    if (baseAmount.mul(quoteAmount).lte(new BN(1).mul(new BN(10 ** baseMintInfo.decimals)).pow(new BN(2)))) {
        throw new Error("initial liquidity too low, try adding more baseAmount/quoteAmount");
    }

    const { execute, extInfo } = await raydium.liquidity.createPoolV4({
        // programId: AMM_V4,
        programId: DEVNET_PROGRAM_ID.AmmV4, // devnet
        marketInfo: {
            marketId,
            // programId: OPEN_BOOK_PROGRAM,
            programId: DEVNET_PROGRAM_ID.OPENBOOK_MARKET, // devent
        },
        baseMintInfo: {
            mint: baseMint,
            decimals: baseMintInfo.decimals, // if you know mint decimals here, can pass number directly
        },
        quoteMintInfo: {
            mint: quoteMint,
            decimals: quoteMintInfo.decimals, // if you know mint decimals here, can pass number directly
        },
        baseAmount,
        quoteAmount,

        // sol devnet faucet: https://faucet.solana.com/
        // baseAmount: new BN(4 * 10 ** 9), // if devent pool with sol/wsol, better use amount >= 4*10**9
        // quoteAmount: new BN(4 * 10 ** 9), // if devent pool with sol/wsol, better use amount >= 4*10**9

        startTime: new BN(0), // unit in seconds
        ownerInfo: {
            useSOLBalance: true,
        },
        associatedOnly: false,
        txVersion,
        // feeDestinationId: FEE_DESTINATION_ID,
        feeDestinationId: DEVNET_PROGRAM_ID.FEE_DESTINATION_ID, // devnet
        // optional: set up priority fee here
        // computeBudgetConfig: {
        //   units: 600000,
        //   microLamports: 4659150,
        // },
    });

    // don't want to wait confirm, set sendAndConfirm to false or don't pass any params to execute
    const { txId } = await execute({ sendAndConfirm: true });
    console.log(
        "amm pool created! txId: ",
        txId,
        ", poolKeys:",
        Object.keys(extInfo.address).reduce(
            (acc, cur) => ({
                ...acc,
                [cur]: extInfo.address[cur as keyof typeof extInfo.address].toBase58(),
            }),
            {}
        )
    );
    process.exit(); // if you don't want to end up node execution, comment this line
};

createAmmPool();

// amm pool created! txId:  4hJUC8vTujvZj3SnEXUsev3bSdG6BMLyWnkBKfmyi1pDtScAoZLf3pLxeAdn6TaqNPEnEnaPeAmE6shQtzZ9X8h9 , poolKeys: {
//     programId: 'HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8',
//     ammId: '3L4M4ZuTxmUtCLjoQF5QJM3yNLrfAC6HrAgBDSTmBSos',
//     ammAuthority: 'DbQqP6ehDYmeYjcBaMRuA8tAJY1EjDUz9DpwSLjaQqfC',
//     ammOpenOrders: '7DcsaAqcFx8DSS5mfEwCuNbbG7sUa7yDozubtaMRiuLK',
//     lpMint: 'Ha33RT6QLLozmi3HuBgMjskma9bXyMR2Rxy77pbxwozg',
//     coinMint: 'zzTXH9dZyEsNRjcD6t6ksW7oepJ4Wz4f36G9uWt3hb4',
//     pcMint: '5RW6VG7iQ1UswfpAHceGD36UyU14i4dsiphSBqHL3hct',
//     coinVault: 'ELGRMuTGQvFPwSLzKowEXnmz2DsGdQmmb2aAfC3qsQwz',
//     pcVault: 'GTDpUXuLxdjZaaGYMsXnRKYnPnsbAJSy1eZpjHAwmat2',
//     withdrawQueue: 'F2gAvtsdkF1jgBr6g2zCzmWmxL9JzYxTVRpCJ3pWkq6w',
//     ammTargetOrders: 'B7HQjFLkKwva7ej6KHDbqQU5NzgVcnbk57k8f6g7MSi1',
//     poolTempLp: 'CYWCnwfZSiN2yiJWaJtBnBXvohvEMkzY1WegSZELMQju',
//     marketProgramId: 'EoTcMgcDRTJVZDMZWBoU6rhYHZfkNTVEAfz3uUJRcYGj',
//     marketId: '95cfkXtsybmCJt6ExB9umWgpWis8xtkQX1dqooczVwp3',
//     ammConfigId: '8QN9yfKqWDoKjvZmqFsgCzAqwZBQuzVVnC388dN5RCPo',
//     feeDestinationId: '3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR'
// }
