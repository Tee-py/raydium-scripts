import {Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction,} from "@solana/web3.js";
import {
    Liquidity, LiquidityPoolInfo,
    LiquidityPoolKeys,
    Percent,
    Token,
    TOKEN_PROGRAM_ID,
    TokenAmount, WSOL,
} from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { getKeypair } from "./utils";
import { MAINNET_RPC_URL } from "./constants";
import fs from "fs"
import { createWrappedNativeAccount, getOrCreateAssociatedTokenAccount, createSyncNativeInstruction, NATIVE_MINT } from "@solana/spl-token";

interface ExecuteKeyPair {
    buy: Keypair[],
    liquidity: Keypair
}

const getPoolInfo = async (poolId: string) => {
    const poolKeysJson = JSON.parse(fs.readFileSync(`pool_info/${poolId}.json`) as unknown as string)
    return {
        id: new PublicKey(poolKeysJson.id),
        baseMint: new PublicKey(poolKeysJson.baseMint),
        quoteMint: new PublicKey(poolKeysJson.quoteMint),
        lpMint: new PublicKey(poolKeysJson.lpMint),
        baseDecimals: poolKeysJson.baseDecimals,
        quoteDecimals: poolKeysJson.quoteDecimals,
        lpDecimals: poolKeysJson.lpDecimals,
        version: poolKeysJson.version,
        programId: poolKeysJson.programId,
        authority: new PublicKey(poolKeysJson.authority),
        baseVault: new PublicKey(poolKeysJson.baseVault),
        quoteVault: new PublicKey(poolKeysJson.quoteVault),
        lpVault: new PublicKey(poolKeysJson.lpVault),
        openOrders: new PublicKey(poolKeysJson.openOrders),
        targetOrders: new PublicKey(poolKeysJson.targetOrders),
        withdrawQueue: new PublicKey(poolKeysJson.withdrawQueue),
        marketVersion: poolKeysJson.marketVersion,
        marketProgramId: new PublicKey(poolKeysJson.marketProgramId),
        marketId: new PublicKey(poolKeysJson.marketId),
        marketAuthority: new PublicKey(poolKeysJson.marketAuthority),
        marketBaseVault: new PublicKey(poolKeysJson.marketBaseVault),
        marketQuoteVault: new PublicKey(poolKeysJson.marketQuoteVault),
        marketBids: new PublicKey(poolKeysJson.marketBids),
        marketAsks: new PublicKey(poolKeysJson.marketAsks),
        marketEventQueue: new PublicKey(poolKeysJson.marketEventQueue),
        lookupTableAccount: new PublicKey(poolKeysJson.lookupTableAccount)
    }
}

const calculateAmountOut = async (
    poolKeys: LiquidityPoolKeys,
    poolInfo: LiquidityPoolInfo,
    tokenToBuy: string,
    amountIn: number,
    rawSlippage: number
) => {
    let tokenOutMint = new PublicKey(tokenToBuy);
    let tokenOutDecimals = poolKeys.baseMint == tokenOutMint  ? poolInfo.baseDecimals : poolKeys.quoteDecimals;
    let tokenInMint = poolKeys.baseMint == tokenOutMint ? poolKeys.quoteMint : poolKeys.baseMint;
    let tokenInDecimals = poolKeys.baseMint == tokenOutMint ? poolInfo.quoteDecimals : poolInfo.baseDecimals;

    const tokenIn = new Token(TOKEN_PROGRAM_ID, tokenInMint, tokenInDecimals);
    const tknAmountIn = new TokenAmount(tokenIn, amountIn, false)
    const tokenOut = new Token(TOKEN_PROGRAM_ID, tokenOutMint, tokenOutDecimals);
    const slippage = new Percent(rawSlippage, 100); // 'rawValue/100 %'
    return {
        amountIn: tknAmountIn,
        tokenIn: tokenInMint,
        tokenOut: tokenOutMint,
        ...Liquidity.computeAmountOut(
            { poolKeys, poolInfo, amountIn: tknAmountIn, currencyOut: tokenOut, slippage}
        )
    }
}

const makeSwapInstruction = async (
    connection: Connection,
    tokenToBuy: string,
    rawAmountIn: number,
    slippage: number,
    poolKeys: LiquidityPoolKeys,
    poolInfo: LiquidityPoolInfo,
    ownerKeyPair: Keypair
) => {
    const {
        amountIn,
        tokenIn,
        tokenOut,
        minAmountOut
    } = await calculateAmountOut(
        poolKeys,
        poolInfo,
        tokenToBuy,
        rawAmountIn,
        slippage
    );
    let tokenInAccount: PublicKey;
    let tokenOutAccount: PublicKey;

    if (tokenIn.toString() == WSOL.mint) {
        tokenInAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            NATIVE_MINT,
            ownerKeyPair.publicKey,
        )).address;
        console.log('Created Wrapped SOL Token Account')
        tokenOutAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            tokenOut,
            ownerKeyPair.publicKey
        )).address;
        console.log('Created USDC Token Account')
    } else if (tokenOut.toString() == WSOL.mint) {
        tokenOutAccount = await createWrappedNativeAccount(
            connection,
            ownerKeyPair,
            ownerKeyPair.publicKey,
            0
        );
        tokenInAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            tokenOut,
            ownerKeyPair.publicKey
        )).address;
    } else {
        tokenInAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            tokenOut,
            ownerKeyPair.publicKey
        )).address;
        tokenOutAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            tokenOut,
            ownerKeyPair.publicKey
        )).address;
    }
    const ix = new TransactionInstruction({
        programId: new PublicKey(poolKeys.programId),
        keys: [
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: poolKeys.id, isSigner: false, isWritable: true },
            { pubkey: poolKeys.authority, isSigner: false, isWritable: false },
            { pubkey: poolKeys.openOrders, isSigner: false, isWritable: true },
            { pubkey: poolKeys.baseVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.quoteVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketProgramId, isSigner: false, isWritable: false },
            { pubkey: poolKeys.marketId, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketBids, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketAsks, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketEventQueue, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketBaseVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketQuoteVault, isSigner: false, isWritable: true },
            { pubkey: poolKeys.marketAuthority, isSigner: false, isWritable: false },
            { pubkey: tokenInAccount, isSigner: false, isWritable: true },
            { pubkey: tokenOutAccount, isSigner: false, isWritable: true },
            { pubkey: ownerKeyPair.publicKey, isSigner: true, isWritable: false }
        ],
        data: Buffer.from(
            Uint8Array.of(
                9,
                ...new BN(amountIn.raw).toArray("le", 8),
                ...new BN(minAmountOut.raw).toArray("le", 8)
            )
        )
    });
    return {
        swapIX: ix,
        tokenInAccount: tokenInAccount,
        tokenOutAccount: tokenOutAccount,
        tokenIn, tokenOut,
        amountIn, minAmountOut
    }
}

const makeAddLiquidityInstruction = async (
    connection: Connection,
    poolKey: LiquidityPoolKeys,
    poolInfo: LiquidityPoolInfo,
    inputTokenMint: string,
    inputTokenAmount: number,
    rawSlippage: number,
    ownerKeyPair: Keypair
) => {
    const tokenADecimals = poolKey.baseMint.toString() == inputTokenMint ? poolInfo.baseDecimals : poolInfo.quoteDecimals;
    const tokenA = new Token(TOKEN_PROGRAM_ID, new PublicKey(inputTokenMint), tokenADecimals);
    const amountA = new TokenAmount(tokenA, inputTokenAmount, false);
    const tokenBDecimals = poolKey.baseMint.toString() != inputTokenMint ? poolInfo.baseDecimals : poolInfo.quoteDecimals;
    const tokenBMint = poolKey.baseMint.toString() != inputTokenMint ? poolKey.baseMint : poolKey.quoteMint;
    const tokenB = new Token(TOKEN_PROGRAM_ID, tokenBMint, tokenBDecimals);
    const slippage = new Percent(rawSlippage, 100); // 'rawValue/100 %'
    const {
        maxAnotherAmount,
    } = Liquidity.computeAnotherAmount({
        poolKeys: poolKey,
        poolInfo,
        amount: amountA,
        anotherCurrency: tokenB,
        slippage
    });
    const lpTokenAccount = (await getOrCreateAssociatedTokenAccount(
        connection,
        ownerKeyPair,
        poolKey.lpMint,
        ownerKeyPair.publicKey
    )).address;
    console.log("Create LP Token Account")
    let tokenAAccount;
    let tokenBAccount;
    if (inputTokenMint == WSOL.mint) {
        console.log("About to create WSOL Account")
        tokenAAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            NATIVE_MINT,
            ownerKeyPair.publicKey
        )).address
        console.log('Created Wrapped SOL Token Account')
        tokenBAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            tokenB.mint,
            ownerKeyPair.publicKey
        )).address;
        console.log('Created USDC Token Account')
    } else if (tokenB.mint.toString() == WSOL.mint) {
        tokenBAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            NATIVE_MINT,
            ownerKeyPair.publicKey
        )).address;
        tokenAAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            tokenA.mint,
            ownerKeyPair.publicKey
        )).address;
    } else {
        tokenAAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            tokenA.mint,
            ownerKeyPair.publicKey
        )).address;
        tokenBAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            tokenB.mint,
            ownerKeyPair.publicKey
        )).address;
    }
    let baseSide = poolKey.baseMint != tokenA.mint ? 0 : 1;
    const ix = new TransactionInstruction(
        {
            programId: new PublicKey(poolKey.programId),
            keys: [
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                { pubkey: poolKey.id, isSigner: false, isWritable: true },
                { pubkey: poolKey.authority, isSigner: false, isWritable: false },
                { pubkey: poolKey.openOrders, isSigner: false, isWritable: false },
                { pubkey: poolKey.targetOrders, isSigner: false, isWritable: true },
                { pubkey: poolKey.lpMint, isSigner: false, isWritable: true },
                { pubkey: poolKey.baseVault, isSigner: false, isWritable: true },
                { pubkey: poolKey.quoteVault, isSigner: false, isWritable: true },
                { pubkey: poolKey.marketId, isSigner: false, isWritable: false },
                { pubkey: tokenAAccount, isSigner: false, isWritable: true },
                { pubkey: tokenBAccount, isSigner: false, isWritable: true },
                { pubkey: lpTokenAccount, isSigner: false, isWritable: true },
                { pubkey: ownerKeyPair.publicKey, isSigner: true, isWritable: false },
                { pubkey: poolKey.marketEventQueue, isSigner: false, isWritable: false }
            ],
            data: Buffer.from(
                Uint8Array.of(
                    3,
                    ...new BN(amountA.raw).toArray("le", 8),
                    ...new BN(maxAnotherAmount.raw).toArray("le", 8),
                    ...new BN(baseSide).toArray("le", 8)
                )
            )
        }
    )
    return { addLiqIX: ix, amountA, amountB: maxAnotherAmount, tokenA, tokenB, tokenAAccount, tokenBAccount}
}

const executeTransaction = async (
    connection: Connection,
    tokenToBuy: string,
    rawAmountIn: number,
    slippage: number,
    rawPoolKey: string,
    keyPairInfo: ExecuteKeyPair
) => {
    const poolKeys = await getPoolInfo(rawPoolKey);
    const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });
    const txn = new Transaction();
    for (const keypair of keyPairInfo.buy) {
        const {
            swapIX,
            tokenInAccount,
            tokenOutAccount,
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut
        } = await makeSwapInstruction(
            connection,
            tokenToBuy,
            rawAmountIn,
            slippage,
            poolKeys,
            poolInfo,
            keypair
        )
        if (tokenIn.toString() == WSOL.mint) {
            console.log("adding native sol account to tokenin")
            txn.add(
                SystemProgram.transfer({
                    fromPubkey: keypair.publicKey,
                    toPubkey: tokenInAccount,
                    lamports: amountIn.raw.toNumber(),
                }),
                createSyncNativeInstruction(tokenInAccount, TOKEN_PROGRAM_ID),
            )
        }

        if (tokenOut.toString() == WSOL.mint) {
            txn.add(
                SystemProgram.transfer({
                    fromPubkey: keypair.publicKey,
                    toPubkey: tokenOutAccount,
                    lamports: minAmountOut.raw.toNumber(),
                }),
                createSyncNativeInstruction(tokenOutAccount, TOKEN_PROGRAM_ID),
            )
        }
        txn.add(swapIX);
    }
    const {
        addLiqIX,
        amountA,
        amountB,
        tokenA,
        tokenB,
        tokenAAccount,
        tokenBAccount
    } = await makeAddLiquidityInstruction(
        connection,
        poolKeys,
        poolInfo,
        WSOL.mint,
        0.022,
        2,
        keyPairInfo.liquidity
    )
    console.log("About to Add Liquidity")
    if (tokenA.mint.toString() == WSOL.mint) {
        txn.add(
            SystemProgram.transfer({
                fromPubkey: keyPairInfo.liquidity.publicKey,
                toPubkey: tokenAAccount,
                lamports: amountA.raw.toNumber(),
            }),
            createSyncNativeInstruction(tokenAAccount, TOKEN_PROGRAM_ID),
        )
    }
    if (tokenB.mint.toString() == WSOL.mint) {
        txn.add(
            SystemProgram.transfer({
                fromPubkey: keyPairInfo.liquidity.publicKey,
                toPubkey: tokenBAccount,
                lamports: amountB.raw.toNumber(),
            }),
            createSyncNativeInstruction(tokenBAccount, TOKEN_PROGRAM_ID),
        )
    }
    txn.add(addLiqIX)
    await connection.sendTransaction(
        txn,
        [...keyPairInfo.buy, keyPairInfo.liquidity],
        { skipPreflight: false, preflightCommitment: "confirmed"}
    )
}

// executeTransaction(
//     new Connection(MAINNET_RPC_URL, "confirmed"),
//     "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
//     0.025,
//     5,
//     "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
//     ["w
//     //getKeypair("wallet")
// ).then((val) => console.log(val))
