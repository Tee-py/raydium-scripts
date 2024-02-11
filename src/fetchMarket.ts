import { fetchAndSavePoolInfo } from "./utils"

const MARKET_ID = "8BnEgHoWFysVcuFFX7QztDmzuH8r5ZFvyP3sYwn1XTh6"
const JSON_URL = "https://api.raydium.io/v2/sdk/liquidity/mainnet.json"
fetchAndSavePoolInfo(
    MARKET_ID,
    JSON_URL
).then((val) => console.log(val))