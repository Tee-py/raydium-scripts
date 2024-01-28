import {Keypair, PublicKey} from "@solana/web3.js";
import fs from "fs";

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
        JSON.stringify(poolKeysJson)
    );
}