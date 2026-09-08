import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyPair } from "@nimiq/core";
import { NimiqRpcPaymentVerifier } from "../src/infra/nimiq-rpc.js";

describe("NimiqRpcPaymentVerifier", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("verifies the PoS recipientData field returned by current Nimiq RPC", async () => {
    const sender = KeyPair.generate().toAddress().toUserFriendlyAddress();
    const treasury = KeyPair.generate().toAddress().toUserFriendlyAddress();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      result: { data: {
          hash: "a".repeat(64),
          from: sender,
          to: treasury,
          value: "10000",
          recipientData: "NSP:reference123",
          blockNumber: 42,
        }, metadata: null },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const proof = await new NimiqRpcPaymentVerifier("https://rpc.example").verifyPostPayment({
      txHash: "a".repeat(64),
      expectedSender: sender,
      expectedRecipient: treasury,
      minimumLuna: 10_000n,
      expectedReference: "NSP:reference123",
    });

    expect(proof.data).toBe("NSP:reference123");
  });
});
