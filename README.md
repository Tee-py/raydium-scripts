# Raydium Script: Swapping and Adding Liquidity

## Overview

This script facilitates the swapping of tokens and adding liquidity to markets on the Raydium.io decentralized exchange. It's designed to work with the Raydium pools and liquidity markets.

## Prerequisites

- Node.js installed on your machine
- ts-node installed
- A valid JavaScript environment

## Setup

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Generate Keys for buying and adding liquidity to the `keys/` folder in this repository

4. Edit the `MARKET_ID` constant in of the `src/fetchMarketInfo.ts` file with the appropriate market ID for the pool on raydium

5. run `npm run fetchMarket` to download the market data at `pool_info/<market_id>.json` 

6. Configure your script by editing the script file (`src/main.ts`). Update the following variables at the beginning of the script:

   ```javascript
   const TOKEN_TO_BUY_MINT = "<TOKEN MINT ADDRESS TO BUY>";
   const SWAP_AMOUNT = "<AMOUNT OF TOKEN TO SWAP>";
   const SWAP_SLIPPAGE = "SLIPPAGE TOLERANCE FOR SWAP";
   const LIQUIDITY_INPUT_TOKEN_MINT = "<INPUT TOKEN MINT ADDRESS FOR LIQUIDITY>";
   const LIQUIDITY_INPUT_TOKEN_AMOUNT = "<LIQUIDITY TOKEN INPUT AMOUNT>";
   const LIQUIDITY_SLIPPAGE = "<LIQUIDITY SLIPPAGE>";
   const POOL_MARKET_ID = "<MARKET ID OF THE POOL ON RAYDIUM>";
   ```
## Usage

To execute the script:

```bash
npm run script
```

The script will connect to the Raydium mainnet RPC, perform the specified swap and liquidity addition, and log the result.

## Important Note

- Ensure that your wallet and necessary private keys are securely configured in the environment where the script is run.
- Be cautious when adjusting slippage values, as they affect the likelihood of transaction success.
- Double-check token mints and market IDs to match your specific use case.

Happy Hacking 🇳🇬🚀🤖
