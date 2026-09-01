import { createHash, randomBytes } from "node:crypto";
import { Address, Hash, PublicKey, Signature } from "@nimiq/core";

const SIGNED_MESSAGE_PREFIX = "\x16Nimiq Signed Message:\n";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeNimiqAddress(address: string): string {
  return Address.fromString(address).toUserFriendlyAddress().replaceAll(" ", "").toUpperCase();
}

export function verifyNimiqMessage(input: {
  walletAddress: string;
  publicKeyHex: string;
  signatureHex: string;
  message: string;
}): boolean {
  try {
    const publicKey = PublicKey.fromHex(input.publicKeyHex);
    const signature = Signature.fromHex(input.signatureHex);
    const derivedAddress = normalizeNimiqAddress(publicKey.toAddress().toUserFriendlyAddress());
    if (derivedAddress !== normalizeNimiqAddress(input.walletAddress)) return false;

    const messageBytes = new TextEncoder().encode(input.message);
    const prefixed = new TextEncoder().encode(`${SIGNED_MESSAGE_PREFIX}${messageBytes.length}${input.message}`);
    const digest = Hash.computeSha256(prefixed);
    return publicKey.verify(signature, digest);
  } catch {
    return false;
  }
}
