import { setProvider, Program } from "@coral-xyz/anchor";
import {
    AccountInfoBytes,
    AddedAccount,
    BanksClient,
    BanksTransactionResultWithMeta,
    ProgramTestContext,
    startAnchor,
} from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { expect } from "chai";
import { PublicKey, Transaction, Keypair, Connection, clusterApiUrl, TransactionInstruction } from "@solana/web3.js";
import {
    ACCOUNT_SIZE,
    AccountLayout,
    getAssociatedTokenAddressSync,
    MintLayout,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import dotenv from "dotenv";

dotenv.config();

// Constants
const PROJECT_DIRECTORY = ""; // Leave empty if using default anchor project
const USDC_DECIMALS = 6;
const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MINIMUM_SLOT = 100;
const MINIMUM_USDC_BALANCE = 100_000_000_000; // 100k USDC

async function createAndProcessTransaction(
    client: BanksClient,
    payer: Keypair,
    instruction: TransactionInstruction,
    additionalSigners: Keypair[] = []
): Promise<BanksTransactionResultWithMeta> {
    const tx = new Transaction();
    const [latestBlockhash] = await client.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash;
    tx.add(instruction);
    tx.feePayer = payer.publicKey;
    tx.sign(payer, ...additionalSigners);
    return await client.tryProcessTransaction(tx);
}

async function setupATA(
    context: ProgramTestContext,
    usdcMint: PublicKey,
    owner: PublicKey,
    amount: number
): Promise<PublicKey> {
    const tokenAccData = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode(
        {
            mint: usdcMint,
            owner,
            amount: BigInt(amount),
            delegateOption: 0,
            delegate: PublicKey.default,
            delegatedAmount: BigInt(0),
            state: 1,
            isNativeOption: 0,
            isNative: BigInt(0),
            closeAuthorityOption: 0,
            closeAuthority: PublicKey.default,
        },
        tokenAccData
    );

    const ata = getAssociatedTokenAddressSync(usdcMint, owner, true);
    const ataAccountInfo = {
        lamports: 1_000_000_000,
        data: tokenAccData,
        owner: TOKEN_PROGRAM_ID,
        executable: false,
    };

    context.setAccount(ata, ataAccountInfo);
    return ata;
}

describe("Bankrun Tests", () => {
    const usdcMint = new PublicKey(USDC_MINT_ADDRESS);
    let context: ProgramTestContext;
    let client: BanksClient;
    let payer: Keypair;
    let provider: BankrunProvider;

    before(async () => {
        const connection = new Connection(process.env.MAINNET_RPC_URL || clusterApiUrl("mainnet-beta"));
        const accountInfo = await connection.getAccountInfo(usdcMint);
        const usdcAccount: AddedAccount = { address: usdcMint, info: accountInfo };

        context = await startAnchor(PROJECT_DIRECTORY, [], [usdcAccount]);
        client = context.banksClient;
        payer = context.payer;
        provider = new BankrunProvider(context);
        setProvider(provider);
    });

    // TODO: Add Time Travel Tests Here
    describe("Time Travel Tests", () => {
        it("should warp to slot 100", async () => {
            provider.context.warpToSlot(BigInt(100));
            const clock = await client.getClock();
            expect(clock.slot).to.equal(BigInt(100));
        });
    });
});
