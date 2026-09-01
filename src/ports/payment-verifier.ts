export interface PaymentProof {
  txHash: string;
  sender: string;
  recipient: string;
  valueLuna: bigint;
  data: string;
  confirmed: boolean;
}

export interface PaymentVerifier {
  verifyPostPayment(input: {
    txHash: string;
    expectedSender: string;
    expectedRecipient: string;
    minimumLuna: bigint;
    expectedReference: string;
  }): Promise<PaymentProof>;
}
