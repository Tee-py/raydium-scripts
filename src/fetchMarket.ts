import { fetchAndSavePoolInfo } from "./utils"

const MARKET_ID = "AdrYYii5M4j3C3LCSswkBFT8BxrwqsC9mktk1r75fLLM"
const JSON_URL = "https://api.raydium.io/v2/sdk/liquidity/mainnet.json"
fetchAndSavePoolInfo(
    MARKET_ID,
    JSON_URL
).then((val) => console.log(val))