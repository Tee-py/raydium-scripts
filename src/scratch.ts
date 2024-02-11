import {
    AddressLookupTableProgram,
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction
} from '@solana/web3.js';
import {MAINNET_RPC_URL} from "./constants";
import {
    LIQUIDITY_STATE_LAYOUT_V4,
    MAINNET_PROGRAM_ID,
    MARKET_STATE_LAYOUT_V3,
} from '@raydium-io/raydium-sdk';
import BN from 'bn.js';


export const getPoolInfo = async (ammId: string, connection: Connection) => {
    const ammAccount = await connection.getAccountInfo(new PublicKey(ammId));
    if (ammAccount) {
        const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(ammAccount.data);
        const marketAccount = await connection.getAccountInfo(poolState.marketId);
        if (marketAccount) {
            const marketState = MARKET_STATE_LAYOUT_V3.decode(marketAccount?.data);
            const addr = PublicKey.createProgramAddressSync(
                [
                    marketState.ownAddress.toBuffer(),
                    marketState.vaultSignerNonce.toArrayLike(Buffer, 'le', 8),
                ],
                MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
            );
            return {
                id: new PublicKey(ammId),
                nonce: poolState.nonce,
                programId: MAINNET_PROGRAM_ID.AmmV4,
                status: poolState.status,
                baseDecimals: poolState.baseDecimal.toNumber(),
                quoteDecimals: poolState.quoteDecimal.toNumber(),
                lpDecimals: new BN(9),
                baseMint: poolState.baseMint,
                quoteMint: poolState.quoteMint,
                version: 4,
                authority: new PublicKey(
                    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
                ),
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
                lookupTableAccount: new PublicKey(
                    '2bSf3akgd3LnnHZXKuvyk3CVycG1JZ6i6LRQLiBGX4Lp',
                ),
            };
        }
    }
    return null;
};

const entryPoint = async () => {
    const connection = new Connection(MAINNET_RPC_URL);
    const poolKeys = await getPoolInfo("58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2", connection);
    const ltaAuth = new PublicKey("RayZuc5vEK174xfgNFdD9YADqbbwbFjVjY4NM8itSF9");
    if (poolKeys) {
        const [pda, seed] = PublicKey.findProgramAddressSync([
            ltaAuth.toBuffer(),
            poolKeys?.nonce.toBuffer("le")
        ], new PublicKey(AddressLookupTableProgram.programId));
        console.log(pda)
    }

//     const lookUpTableAccountPK = new PublicKey("3q8sZGGpPESLxurJjNmr7s7wcKS5RPCCHMagbuHP9U2W");
//     const info = await connection.getAccountInfo(lookUpTableAccountPK);
//     info.
//     const lookUpTableAccount = await connection.getAddressLookupTable(lookUpTableAccountPK);
//     console.log(lookUpTableAccount.value)
//     et derived_table_key = Pubkey::create_program_address(
//         &[
//             authority_key.as_ref(),
//         &derivation_slot.to_le_bytes(),
// &[bump_seed],
// ],
// &id(),
// )?;
}

entryPoint().then()