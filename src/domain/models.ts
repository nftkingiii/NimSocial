export type PostKind = "request" | "service" | "update" | "proof";
export type PostState = "draft" | "published" | "rejected";
export type ProfileRole = "worker" | "client" | "both";
export type Availability = "open" | "busy" | "not_open";
export type WorkPreference = "remote" | "hybrid" | "onsite" | "flexible";

export interface User {
  walletAddress: string;
  publicKey: string;
  displayName: string | null;
  bio: string | null;
  profileRole: ProfileRole | null;
  professionalTitle: string | null;
  skills: string[];
  availability: Availability;
  workPreference: WorkPreference | null;
  location: string | null;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
}

export interface Review {
  id: string;
  jobId: string;
  reviewerWallet: string;
  subjectWallet: string;
  quality: number;
  delivery: number;
  communication: number;
  reliability: number;
  body: string | null;
  createdAt: Date;
}

export interface Challenge {
  id: string;
  walletAddress: string;
  nonceHash: string;
  message: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface Session {
  id: string;
  walletAddress: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface Post {
  id: string;
  authorWallet: string;
  kind: PostKind;
  body: string;
  jobId: string | null;
  state: PostState;
  paymentReference: string;
  requiredLuna: bigint;
  paymentTxHash: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

export interface Job {
  id: string;
  clientWallet: string;
  workerWallet: string | null;
  title: string;
  description: string;
  budgetUsdtMicros: bigint;
  deadline: Date;
  arbiterAddress: string | null;
  escrowJobId: string | null;
  escrowTxHash: string | null;
  state: "open" | "funding" | "funded" | "submitted" | "approved" | "disputed" | "settled" | "refunded" | "cancelled";
  createdAt: Date;
}

export interface Application {
  id: string;
  jobId: string;
  applicantWallet: string;
  message: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: Date;
}

export interface JobMessage {
  id: string;
  jobId: string;
  senderWallet: string;
  body: string;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  memberA: string;
  memberB: string;
  contextPostId: string | null;
  createdAt: Date;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderWallet: string;
  body: string;
  createdAt: Date;
}
