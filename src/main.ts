import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
    Liquidity,
    LiquidityPoolInfo,
    LiquidityPoolKeys, LOOKUP_TABLE_CACHE,
    Percent,
    Token,
    TOKEN_PROGRAM_ID,
    TokenAmount, WSOL,
    //MarketV2
} from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { ExecuteKeyPair, getExecuteKeyPairInfo } from "./utils";
import { MAINNET_RPC_URL } from "./constants";
//import fs from "fs"
import { createWrappedNativeAccount, getOrCreateAssociatedTokenAccount, createSyncNativeInstruction, NATIVE_MINT } from "@solana/spl-token";
import {OpenOrders} from "@project-serum/serum";
import { getPoolInfo } from "./utils";


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
        tokenOutAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            tokenOut,
            ownerKeyPair.publicKey
        )).address;
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
    let tokenAAccount;
    let tokenBAccount;
    if (inputTokenMint == WSOL.mint) {
        tokenAAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            NATIVE_MINT,
            ownerKeyPair.publicKey
        )).address
        tokenBAccount = (await getOrCreateAssociatedTokenAccount(
            connection,
            ownerKeyPair,
            tokenB.mint,
            ownerKeyPair.publicKey
        )).address;
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
    rawSwapAmountIn: number,
    swapSlippage: number,
    liquidityInputToken: string,
    liquidityInputTokenAmount: number,
    liquiditySlippage: number,
    ammId: string,
    keyPairInfo: ExecuteKeyPair
) => {
    const ammAccountInfo = await connection.getAccountInfo(
        new PublicKey(ammId)
    );
    if (ammAccountInfo) {
        const poolKeys = (await getPoolInfo(ammId, connection)) as unknown as LiquidityPoolKeys;
        const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });
        const txn = new Transaction();
        for (const keypair of keyPairInfo.buy) {
            console.log(`Creating swap Instruction For Address ${keypair.publicKey}`)
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
                rawSwapAmountIn,
                swapSlippage,
                poolKeys,
                poolInfo,
                keypair
            )
            if (tokenIn.toString() == WSOL.mint) {
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
            console.log(`Added swap Instruction For Address ${keypair.publicKey} into transaction`)
        }

        console.log(`Creating Add Liquidity Instruction For Address ${keyPairInfo.liquidity.publicKey}`)
        // const {
        //     addLiqIX,
        //     amountA,
        //     amountB,
        //     tokenA,
        //     tokenB,
        //     tokenAAccount,
        //     tokenBAccount
        // } = await makeAddLiquidityInstruction(
        //     connection,
        //     poolKeys,
        //     poolInfo,
        //     liquidityInputToken,
        //     liquidityInputTokenAmount,
        //     liquiditySlippage,
        //     keyPairInfo.liquidity
        // )
        // if (tokenA.mint.toString() == WSOL.mint) {
        //     txn.add(
        //         SystemProgram.transfer({
        //             fromPubkey: keyPairInfo.liquidity.publicKey,
        //             toPubkey: tokenAAccount,
        //             lamports: amountA.raw.toNumber(),
        //         }),
        //         createSyncNativeInstruction(tokenAAccount, TOKEN_PROGRAM_ID),
        //     )
        // }
        // if (tokenB.mint.toString() == WSOL.mint) {
        //     txn.add(
        //         SystemProgram.transfer({
        //             fromPubkey: keyPairInfo.liquidity.publicKey,
        //             toPubkey: tokenBAccount,
        //             lamports: amountB.raw.toNumber(),
        //         }),
        //         createSyncNativeInstruction(tokenBAccount, TOKEN_PROGRAM_ID),
        //     )
        // }
        //txn.add(addLiqIX)
        //console.log(`Add Liquidity Instruction Added to Transaction For Address ${keyPairInfo.liquidity.publicKey}`)
        console.log("Executing Transactions...")
        const hash = await connection.sendTransaction(
            txn,
            [...keyPairInfo.buy, keyPairInfo.liquidity],
            { skipPreflight: false, preflightCommitment: "confirmed"}
        )
        console.log("Transaction Completed Successfully 🎉🚀.")
        console.log(`Transaction Hash ${hash}`)
    } else {
        console.log(`Could not get PoolInfo for AMM: ${ammId}`)
    }
}

const keypairInfo = getExecuteKeyPairInfo(["wallet"], "wallet");
const TOKEN_TO_BUY_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
const SWAP_AMOUNT = 0.04
const SWAP_SLIPPAGE = 5
const LIQUIDITY_INPUT_TOKEN_MINT = WSOL.mint
const LIQUIDITY_INPUT_TOKEN_AMOUNT = 0.02
const LIQUIDITY_SLIPPAGE = 2
const AMM_ID = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";
executeTransaction(
    new Connection(MAINNET_RPC_URL, "confirmed"),
    TOKEN_TO_BUY_MINT,
    SWAP_AMOUNT,
    SWAP_SLIPPAGE,
    LIQUIDITY_INPUT_TOKEN_MINT,
    LIQUIDITY_INPUT_TOKEN_AMOUNT,
    LIQUIDITY_SLIPPAGE,
    AMM_ID,
    keypairInfo
).then((val) => console.log(val))
