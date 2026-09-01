import type { FeedPost, PaymentIntent, PostKind, ProfessionalProfile, ProfileInput } from "./types";

const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "content-type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new ApiError(payload?.message ?? "The request could not be completed.", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function fetchFeed(): Promise<FeedPost[]> {
  const response = await request<{ items: FeedPost[] }>("/v1/feed?limit=20");
  return response.items;
}

export async function createChallenge(walletAddress: string) {
  return request<{ challengeId: string; nonce: string; message: string; expiresAt: string }>("/v1/auth/challenges", {
    method: "POST",
    body: JSON.stringify({ walletAddress }),
  });
}

export async function createSession(input: {
  challengeId: string;
  nonce: string;
  walletAddress: string;
  publicKey: string;
  signature: string;
}) {
  return request<{ walletAddress: string; expiresAt: string }>("/v1/auth/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createPostIntent(input: { kind: PostKind; body: string; jobId?: string }): Promise<PaymentIntent> {
  return request<PaymentIntent>("/v1/posts/intents", { method: "POST", body: JSON.stringify(input) });
}

export async function publishPost(postId: string, txHash: string): Promise<FeedPost> {
  const response = await request<{ post: FeedPost }>(`/v1/posts/${postId}/publish`, {
    method: "POST",
    body: JSON.stringify({ txHash }),
  });
  return response.post;
}

export async function fetchMyProfile():Promise<ProfessionalProfile> { return (await request<{profile:ProfessionalProfile}>("/v1/me/profile")).profile; }
export async function saveMyProfile(input:ProfileInput):Promise<ProfessionalProfile> { return (await request<{profile:ProfessionalProfile}>("/v1/me/profile",{method:"PATCH",body:JSON.stringify(input)})).profile; }
export async function fetchProfiles():Promise<ProfessionalProfile[]> { return (await request<{items:ProfessionalProfile[]}>("/v1/profiles?limit=24")).items; }
export async function fetchProfile(walletAddress:string):Promise<ProfessionalProfile> { return (await request<{profile:ProfessionalProfile}>(`/v1/profiles/${encodeURIComponent(walletAddress)}`)).profile; }
export async function fetchProfilePosts(walletAddress:string):Promise<FeedPost[]> { return (await request<{items:FeedPost[]}>(`/v1/profiles/${encodeURIComponent(walletAddress)}/posts`)).items; }
export async function setProfileFollow(walletAddress:string,following:boolean):Promise<void> { return request(`/v1/profiles/${encodeURIComponent(walletAddress)}/follow`,{method:following?"POST":"DELETE"}); }
