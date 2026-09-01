export type PostKind = "request" | "service" | "update" | "proof";

export interface FeedPost {
  id: string;
  authorWallet: string;
  authorName?: string;
  authorRole?: string;
  kind: PostKind;
  body: string;
  jobId: string | null;
  requiredLuna: string;
  paymentTxHash: string | null;
  publishedAt: string | null;
  createdAt: string;
  budget?: string;
  skills?: string[];
  proofLabel?: string;
  preview?: boolean;
}

export interface PaymentIntent {
  post: FeedPost;
  payment: { recipient: string; valueLuna: string; data: string };
}

export interface WalletIdentity {
  address: string;
  shortAddress: string;
}

export type AppSection = "feed" | "explore" | "post" | "jobs" | "profile";
