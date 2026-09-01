import { normalizeNimiqAddress } from "../auth/crypto.js";
import type { PaymentProof, PaymentVerifier } from "../ports/payment-verifier.js";

type RpcTransaction = {
  hash?: string;
  from?: string;
  sender?: string;
  to?: string;
  recipient?: string;
  value?: number | string;
  data?: string;
  blockNumber?: number | null;
  blockHeight?: number | null;
};

export class NimiqRpcPaymentVerifier implements PaymentVerifier {
  constructor(private readonly rpcUrl: string) {}

  async verifyPostPayment(input: {
    txHash: string;
    expectedSender: string;
    expectedRecipient: string;
    minimumLuna: bigint;
    expectedReference: string;
  }): Promise<PaymentProof> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransactionByHash", params: [input.txHash] }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error("Nimiq RPC request failed");
    const payload = await response.json() as { result?: RpcTransaction; error?: unknown };
    if (!payload.result || payload.error) throw new Error("Transaction was not found");

    const tx = payload.result;
    const sender = tx.from ?? tx.sender ?? "";
    const recipient = tx.to ?? tx.recipient ?? "";
    const valueLuna = BigInt(tx.value ?? 0);
    const data = decodeData(tx.data ?? "");
    const confirmed = (tx.blockNumber ?? tx.blockHeight ?? null) !== null;

    if (!confirmed) throw new Error("Transaction is not confirmed");
    if (normalizeNimiqAddress(sender) !== normalizeNimiqAddress(input.expectedSender)) throw new Error("Payment sender mismatch");
    if (normalizeNimiqAddress(recipient) !== normalizeNimiqAddress(input.expectedRecipient)) throw new Error("Payment recipient mismatch");
    if (valueLuna < input.minimumLuna) throw new Error("Payment amount is too low");
    if (data !== input.expectedReference) throw new Error("Payment reference mismatch");

    return { txHash: tx.hash ?? input.txHash, sender, recipient, valueLuna, data, confirmed };
  }
}

function decodeData(value: string): string {
  if (!value) return "";
  if (value.startsWith("0x")) return Buffer.from(value.slice(2), "hex").toString("utf8");
  try { return Buffer.from(value, "base64").toString("utf8"); } catch { return value; }
}
