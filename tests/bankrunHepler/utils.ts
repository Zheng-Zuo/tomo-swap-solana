import { PublicKey, Transaction, Keypair, TransactionInstruction } from "@solana/web3.js";
import { BanksClient, BanksTransactionResultWithMeta, ProgramTestContext } from "solana-bankrun";
import { ACCOUNT_SIZE, AccountLayout, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export async function createAndProcessTransaction(
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

export async function setupATA(
    context: ProgramTestContext,
    tokenMint: PublicKey,
    owner: PublicKey,
    amount: number,
    isNative: boolean = false
): Promise<PublicKey> {
    const tokenAccData = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode(
        {
            mint: tokenMint,
            owner,
            amount: BigInt(amount),
            delegateOption: 0,
            delegate: PublicKey.default,
            delegatedAmount: BigInt(0),
            state: 1,
            isNativeOption: isNative ? 1 : 0,
            isNative: isNative ? BigInt(1) : BigInt(0),
            closeAuthorityOption: 0,
            closeAuthority: PublicKey.default,
        },
        tokenAccData
    );

    const ata = getAssociatedTokenAddressSync(tokenMint, owner, true);
    const ataAccountInfo = {
        lamports: isNative ? amount : 1_000_000_000,
        data: tokenAccData,
        owner: TOKEN_PROGRAM_ID,
        executable: false,
    };

    context.setAccount(ata, ataAccountInfo);
    return ata;
}
