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

export interface PostReply {
  id: string;
  postId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
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

export type ProfileRole = "worker" | "client" | "both";
export type Availability = "open" | "busy" | "not_open";
export type WorkPreference = "remote" | "hybrid" | "onsite" | "flexible";

export interface ReputationSummary {
  score: number | null;
  reviewCount: number;
  confidence: number;
  dimensions: {
    quality: number | null;
    delivery: number | null;
    communication: number | null;
    reliability: number | null;
  };
  credentialTxHash: string | null;
}

export interface ProfessionalProfile {
  walletAddress: string;
  displayName: string | null;
  bio: string | null;
  profileRole: ProfileRole | null;
  professionalTitle: string | null;
  skills: string[];
  availability: Availability;
  workPreference: WorkPreference | null;
  location: string | null;
  onboardingCompletedAt: string | null;
  createdAt: string;
  followers: number;
  following: number;
  isFollowing: boolean;
  reputation: ReputationSummary;
  preview?: boolean;
  completedJobs?: number;
  earned?: string;
  workSamples?: Array<{ title: string; outcome: string; skills: string[] }>;
}

export interface ProfileInput {
  displayName: string;
  bio: string;
  profileRole: ProfileRole;
  professionalTitle: string;
  skills: string[];
  availability: Availability;
  workPreference: WorkPreference;
  location: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderWallet: string;
  body: string;
  createdAt: string;
  preview?: boolean;
}

export interface Conversation {
  id: string;
  participantWallet: string;
  contextPostId: string | null;
  createdAt: string;
  lastMessage: DirectMessage | null;
  preview?: boolean;
}

export type AppSection =
  | "feed"
  | "thread"
  | "explore"
  | "post"
  | "jobs"
  | "messages"
  | "wallet"
  | "notifications"
  | "profile";
