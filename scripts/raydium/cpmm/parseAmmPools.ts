import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { IDL } from "../../../tests/types/raydium_cp_swap";
import { getPoolAddress } from "../../../tests/raydiumCpSwap/utils/pda";
import dotenv from "dotenv";

dotenv.config();

const PROGRAM_ID = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");

async function main() {
    const connection = new Connection(process.env.MAINNET_RPC_URL!, "confirmed");

    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(anchor.web3.Keypair.generate()), {
        commitment: "confirmed",
    });

    const program = new Program(IDL, PROGRAM_ID, provider);
    const ammPools = await program.account.poolState.all();
    console.log(`Found ${ammPools.length} AMM pools`);

    let mismatches = 0;
    // Compare addresses
    for (let i = 0; i < ammPools.length; i++) {
        const pool = ammPools[i];
        const [expectedAddress] = await getPoolAddress(
            pool.account.ammConfig,
            pool.account.token0Mint,
            pool.account.token1Mint,
            program.programId
        );

        if (!pool.publicKey.equals(expectedAddress)) {
            mismatches++;
            console.log("\nMismatch found:");
            console.log("Actual:", pool.publicKey.toBase58());
            console.log("Expected:", expectedAddress.toBase58());
        }
    }

    console.log(`Mismatches: ${mismatches}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

// Found 60443 AMM pools

// Mismatch found:
// Actual: FpNKecnb3Pqu69PZmBeUxNTKQaXHhBE89S27sa4dBMDo
// Expected: 3S14J74mmrsETd5bBzqsDTHTSPwQFGXcM1TYY9G2Fu3d

// Mismatch found:
// Actual: DPkxwyiX3gwpy5gTbw2CgvYs2U38UkNrvUWNxSaGFqvP
// Expected: 9pWBQ5ahbAeRxvDuwdadWvGsdBXGAHTqerwXLXbWnjUW

// Mismatch found:
// Actual: 5tqaBo98wdguZuCwwgD66Wv17ZyuNUvEyVYxfoWm5st
// Expected: 7tbCJ8zcyvSqM9Njhkv1b6z9wTF3m9VTSpUd4C7rjHmq

// Mismatch found:
// Actual: EyXB6vbcEjRv7wBLrHUbzr5mvSiHkrhafMxGYyWmsaCc
// Expected: AervcJuCrtwVbpu9SpLBdwGj8TM4BtZUvfgrbLakZDDk

// Mismatch found:
// Actual: EiZnfD9uknL771YYoXyKTYRtbTtr3FsjKBYvVtn6N9Y4
// Expected: F1C3Ki7TLhB3CDZmz3BWtmYkNKkc31AUMxVTnPgiDjh6

// Mismatch found:
// Actual: 7Nmdsew9UAoawrBMh3pwwaBtx4PCLSYchp4srRhXH6e6
// Expected: dFFt5RvBe7tCg5muzYjjcFARH6pYfXZEXXX8jvZEfsm

// Mismatch found:
// Actual: HvJDfZoyTLTobAbP16zXddQfnEM3icwUzLd31K7C8cs7
// Expected: DBYZFxNpopzY13CaA833SLoM5m8bZ4piZdVqTJgvF5ai

// Mismatch found:
// Actual: CMsLUHELQotkVEYFr1u2BbyDchPnu98xSHKuaaF9hx4f
// Expected: 3nphXmM6NntajnW2TAzfrU9JHCAGKc5kCZ6Wgoup4U3P

// Mismatch found:
// Actual: 62s11EgJocy36CFpMZyvbe5X7DY5m1FtNDZrgWC8NZHy
// Expected: HrRSj7ToTznWSWJpMm5GGbtdGKapMcck3rh4GqoDYFzq

// Mismatch found:
// Actual: AZC5ZzhjC8m7k9N6TWvPahtewvdGfXCDTgQErzt7xTeE
// Expected: CiAtfHfzhyDMKva14TAHKaNUmbpsZBMxuWyA6bxD7BLc

// Mismatch found:
// Actual: 44mwiuSA68x67AZyzd6UunLjKeseiUVEsUhYWkr6SeXU
// Expected: 4SkR6J4Gbvj3ffr4HFePX8SPGUhp9nicuEeoN2XHF8Fr

// Mismatch found:
// Actual: D1zsx6dty4i9FhUusWGZeXaKw4dUbZZyXS4H759nECzZ
// Expected: 6y3cRF5EBWdVHx4axBQUvQRW35ts8XQs7nWD1fbS7EXj

// Mismatch found:
// Actual: GLA6Pa3nFB6sxuubJian9Bv2hXAFzHZ7VRsTLA2LfZ52
// Expected: 8zdg4Vvc5wZfvUvm5tz3FR1iAbSvzEjDdZzdRn8xLTcb

// Mismatch found:
// Actual: DATMu96cq6vwJXJMPxgpiLQQLge5kaggJAGttAEZoW26
// Expected: GFRXs1ZX6uAwMyeTR23zQ76xwJnJ97y4tECCeFNXRAnj

// Mismatch found:
// Actual: u8GkUAgn9cgtLQeNtkXQTj8ZeTdnkh9mbTet1t5QMQC
// Expected: 5U1tL2WRrhesPhZFSdqQYR7YVFPeVB48o1bxf5hCXfM8

// Mismatch found:
// Actual: 5W8M5AbJYM3CaHmw3oKYPVH7PRp4DD5CZZifrcHNpix
// Expected: BzZTfRmDgsoqDPR8e29cEdXQZVonXbaJ3QxXiMad7xku

// Mismatch found:
// Actual: 3dAMUeqaTUprqEwcDZTKsjyB9PFqQSf9KXFTRuNkpe29
// Expected: s54hpQ1CN1SVtBHVUQbwJzz7CHwUzRUkNP3Sqgw5FjM

// Mismatch found:
// Actual: 99PyLpWKTVhDrzjLv43R9fSp2iELFzdkK5eCnuxGEjZC
// Expected: BQyq1u5R8qLLzHjq67Pu8SCrwW4XC1yaJ38wPj7UA69v

// Mismatch found:
// Actual: EDbSwNYZjLAwPdw97xgDhy9xBjPNYjNLvGHW8Xh8pix
// Expected: 4oXQT2BZanouuXtvcKDWeMp92UotA9BWzTiky5XsUi4q

// Mismatch found:
// Actual: HG7nzhNJ4xg4HMm4uYajd1sybf9vZtZCUxW22EZCYsg7
// Expected: BBSFfV8BRW83opdg19evovKbRWDjdFhKzNzJ3qSinz3U

// Mismatch found:
// Actual: 9g2Es4PxGS4D7fxbC8fHmVq9wNMHHwiMp7LHSwGSnEYq
// Expected: 8sYUstx7VoYchwgNpYzeLwCzYVhN8Nk2jLGy6xEGXLAM

// Mismatch found:
// Actual: 9cLtrHZP29Cw8hQc7ibr5zv6LwpYyXWRzuYccSbq2UJD
// Expected: BP6ztbKBcswwJ8AUAWXcT3VrVagRqiJt6xq6eCVjhAJj

// Mismatch found:
// Actual: ehgfikPJpkqBjCZmpuPzwpqbEa5wLEG3JHM1ALkQtvZ
// Expected: Ab5Kvyy6TCdjttoMW1rW8aoT3CZ5Q68nSuqUjSpds6dp

// Mismatch found:
// Actual: GAZmSHeGTKXp1yhemFpooT52ckoZaG156K89BkE1naWS
// Expected: 8BNvTEiNo4rYa7iCwJ9L2GbFZ58eL77oXFQqpySMnwVW

// Mismatch found:
// Actual: 7i2jpGEVd9Ls35PLrgWm873xq4F4EQZzKLh8o55u6ZFJ
// Expected: Gfx9UvxHyJieaFUZpLXYB3TRq4U8knq4uvP2AjdM12UE

// Mismatch found:
// Actual: AywoNsby9xrTu8JYbkqV1hp1vg7dGxhDREGpT913Lb5K
// Expected: 8RuzCRCzvriBmkgbdkDyvAmhE1dAuagdNFc6iCTZZ9Pp

// Mismatch found:
// Actual: F4QvZY4R1DDBQF3L7qAw3i2QPLNG9kxneWcAbvm6LmuC
// Expected: 3kushxtxVmam4x527rjN3WtkgXdWPNFivc74z4mJWfZg

// Mismatch found:
// Actual: He5qdkYmBB4hYDYRwYwv8zxZvFPbCuP9Yx9s8wBZgbEK
// Expected: 3yn22pTYPv9jfZc2AkknTSMNM81R6BzYyPxKUiUQK3Tx

// Mismatch found:
// Actual: 6d2E51iVPfFDPXrmgUTDTGG2vYUfemxk6i1qfgxwpix
// Expected: CgNrgKhMGP5MpXxhAXYuMkzxLmHrL9SVkWSG3RwS6zT8

// Mismatch found:
// Actual: 3rQnACHefG44SsSpyMycd5miQgXP1CmxVBFHTgBy5yyL
// Expected: 2iw5pFx8j2oUSPdCbJLGmzTtpELhdZNNcNSWxSQaboby

// Mismatch found:
// Actual: 57VZD4sToAJ3kTopJdfXLE5PY6YL2BkhayMK8SY2pix
// Expected: 9vi9RUU92zCt1PXG4UYN8DvzFtV9uwtcL8PmcpFar17d

// Mismatch found:
// Actual: 148Dj7bLCtDRVFfXG5jzWyKPSZAjWHoYmQ2CWrGq7pix
// Expected: E6RB9riz1K2w4foBPa87gHV4sHTa3g6y3eMySK9Xkmdu

// Mismatch found:
// Actual: 6w4mMW5uaQt3Yq3gxhcp3gpH4GXwveZHMZoiXD1bwA3o
// Expected: HXhFjAcSGorqxPMEVMgJeWth8vLGYEKyT1awRt2MR38i

// Mismatch found:
// Actual: FL7dAeyWdgs9NZJa6BaCuSmQJxBmXwfuVyRAG1g5pm51
// Expected: BBSFfV8BRW83opdg19evovKbRWDjdFhKzNzJ3qSinz3U
// Mismatches: 34

// HKuJrP5tYQLbEUdjKwjgnHs2957QKjR2iWhJKTtMa1xs // WSOL - TRUMP
