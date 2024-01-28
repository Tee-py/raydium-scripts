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
