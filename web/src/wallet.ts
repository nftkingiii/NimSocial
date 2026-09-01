import { init, type ErrorResponse, type NimiqProvider } from "@nimiq/mini-app-sdk";
import { createChallenge, createSession } from "./api";
import type { PaymentIntent, WalletIdentity } from "./types";

function isProviderError(value: unknown): value is ErrorResponse {
  return Boolean(value && typeof value === "object" && "error" in value);
}

function providerResult<T>(value: T | ErrorResponse): T {
  if (isProviderError(value)) throw new Error(value.error.message || "The wallet request was declined.");
  return value;
}

export async function connectAndAuthenticate(): Promise<{ identity: WalletIdentity; provider: NimiqProvider }> {
  const provider = await init({ timeout: 4_000 });
  const accounts = providerResult(await provider.listAccounts());
  const address = accounts[0];
  if (!address) throw new Error("No Nimiq account is available in Nimiq Pay.");

  const challenge = await createChallenge(address);
  const signed = providerResult(await provider.sign(challenge.message));
  await createSession({
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    walletAddress: address,
    publicKey: signed.publicKey,
    signature: signed.signature,
  });

  return { identity: { address, shortAddress: compactAddress(address) }, provider };
}

export async function payPostIntent(provider: NimiqProvider, intent: PaymentIntent): Promise<string> {
  const result = providerResult(await provider.sendBasicTransactionWithData({
    recipient: intent.payment.recipient,
    value: Number(intent.payment.valueLuna),
    data: intent.payment.data,
  }));
  return result;
}

export function compactAddress(address: string) {
  const plain = address.replaceAll(" ", "");
  return `${plain.slice(0, 6)}…${plain.slice(-4)}`;
}
