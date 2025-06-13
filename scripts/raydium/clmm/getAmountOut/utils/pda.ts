import { PublicKey } from "@solana/web3.js";

export const TICK_ARRAY_SEED = Buffer.from("tick_array", "utf8");

export function getPdaTickArrayAddress(
    programId: PublicKey,
    poolId: PublicKey,
    startIndex: number
): {
    publicKey: PublicKey;
    nonce: number;
} {
    return findProgramAddress([TICK_ARRAY_SEED, poolId.toBuffer(), i32ToBytes(startIndex)], programId);
}

export function findProgramAddress(
    seeds: Array<Buffer | Uint8Array>,
    programId: PublicKey
): {
    publicKey: PublicKey;
    nonce: number;
} {
    const [publicKey, nonce] = PublicKey.findProgramAddressSync(seeds, programId);
    return { publicKey, nonce };
}

export function i32ToBytes(num: number): Uint8Array {
    const arr = new ArrayBuffer(4);
    const view = new DataView(arr);
    view.setInt32(0, num, false);
    return new Uint8Array(arr);
}
