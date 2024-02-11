import {Connection, Keypair, PublicKey} from "@solana/web3.js";
import fs from "fs";
import BN from "bn.js";
import {
    LIQUIDITY_STATE_LAYOUT_V4,
    MAINNET_PROGRAM_ID,
    MARKET_STATE_LAYOUT_V3,
} from "@raydium-io/raydium-sdk";

export interface ExecuteKeyPair {
    buy: Keypair[],
    liquidity: Keypair
}

export const getPublicKey = (name: string) =>
    new PublicKey(
        JSON.parse(fs.readFileSync(`./keys/${name}_pub.json`) as unknown as string)
    );

export const getPrivateKey = (name: string) =>
    Uint8Array.from(
        JSON.parse(fs.readFileSync(`./keys/${name}.json`) as unknown as string)
    );

export const getKeypair = (name: string) =>
    new Keypair({
        publicKey: getPublicKey(name).toBytes(),
        secretKey: getPrivateKey(name),
    });

export const fetchAndSavePoolInfo = async (marketId: string, jsonUrl: string) => {
    const liquidityJsonResp = await fetch(jsonUrl);
    const liquidityJson = await liquidityJsonResp.json();
    const allPoolKeysJson = [...(liquidityJson?.official ?? []), ...(liquidityJson?.unOfficial ?? [])]
    const poolKeysJson = allPoolKeysJson.filter((item) => item.marketId === marketId)?.[0] || null;
    fs.writeFileSync(
        `pool_info/${marketId}.json`,
        JSON.stringify(poolKeysJson, null, 4)
    );
}

export const getExecuteKeyPairInfo = (buyFiles: string[], liquidityFile: string): ExecuteKeyPair => {
    const buyKeyPairs = [];
    for (const file of buyFiles) {
        buyKeyPairs.push(getKeypair(file))
    }
    return {
        buy: buyKeyPairs,
        liquidity: getKeypair(liquidityFile)
    }
}

export const getPoolInfo = async (ammId: string, connection: Connection) => {
    const ammAccount = await connection.getAccountInfo(
        new PublicKey(ammId)
    );
    if (ammAccount) {
        const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(ammAccount.data);
        const marketAccount = await connection.getAccountInfo(
            poolState.marketId
        );
        if (marketAccount) {
            const marketState = MARKET_STATE_LAYOUT_V3.decode(marketAccount?.data);
            const addr = PublicKey.createProgramAddressSync(
                [marketState.ownAddress.toBuffer(), marketState.vaultSignerNonce.toArrayLike(Buffer, 'le', 8)],
                MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
            )
            return {
                id: new PublicKey(ammId),
                programId: MAINNET_PROGRAM_ID.AmmV4,
                status: poolState.status,
                baseDecimals: poolState.baseDecimal.toNumber(),
                quoteDecimals: poolState.quoteDecimal.toNumber(),
                lpDecimals: new BN(9),
                baseMint: poolState.baseMint,
                quoteMint: poolState.quoteMint,
                version: 4,
                authority: new PublicKey("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"),
                openOrders: poolState.openOrders,
                baseVault: poolState.baseVault,
                quoteVault: poolState.quoteVault,
                marketProgramId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
                marketId: marketState.ownAddress,
                marketBids: marketState.bids,
                marketAsks: marketState.asks,
                marketEventQueue: marketState.eventQueue,
                marketBaseVault: marketState.baseVault,
                marketQuoteVault: marketState.quoteVault,
                marketAuthority: addr,
                targetOrders: poolState.targetOrders,
                lpMint: poolState.lpMint,
                lookupTableAccount: new PublicKey("2bSf3akgd3LnnHZXKuvyk3CVycG1JZ6i6LRQLiBGX4Lp")
            }
        }
    }
    return null
}

