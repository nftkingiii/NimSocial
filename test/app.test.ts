import { Hash, KeyPair } from "@nimiq/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
import type { PaymentProof, PaymentVerifier } from "../src/ports/payment-verifier.js";
import { MemoryStore } from "../src/repositories/memory-store.js";

class FakePayments implements PaymentVerifier {
  fail = false;
  async verifyPostPayment(input: {txHash:string;expectedSender:string;expectedRecipient:string;minimumLuna:bigint;expectedReference:string}): Promise<PaymentProof> {
    if (this.fail) throw new Error("invalid");
    return {txHash:input.txHash,sender:input.expectedSender,recipient:input.expectedRecipient,valueLuna:input.minimumLuna,data:input.expectedReference,confirmed:true};
  }
}

const config: AppConfig = {
  NODE_ENV:"test",PORT:3000,HOST:"127.0.0.1",DATABASE_URL:"postgres://unused",ALLOWED_ORIGINS:"http://localhost:5173",
  SESSION_TTL_SECONDS:3600,CHALLENGE_TTL_SECONDS:300,NIMIQ_RPC_URL:"https://rpc.invalid",NIMIQ_NETWORK:"testnet",
  NIMIQ_POST_TREASURY:"NQ07 EXAMPLE TREASURY",NIMIQ_POST_FEE_LUNA:10_000n,NIMIQ_UPDATE_FEE_LUNA:1_000n,
  POLYGON_CHAIN_ID:80002,POLYGON_RPC_URL:"https://polygon.invalid",REVISION:"test",allowedOrigins:new Set(["http://localhost:5173"]),
};

describe("NimSocial API", () => {
  let store: MemoryStore;
  let payments: FakePayments;
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => { store=new MemoryStore(); payments=new FakePayments(); app=await buildApp({config,store,paymentVerifier:payments}); });
  afterEach(async () => { await app.close(); });

  async function login(keyPair=KeyPair.generate()) {
    const walletAddress=keyPair.toAddress().toUserFriendlyAddress();
    const challengeResponse=await app.inject({method:"POST",url:"/v1/auth/challenges",payload:{walletAddress}});
    const challenge=challengeResponse.json();
    const bytes=new TextEncoder().encode(challenge.message);
    const signedBytes=new TextEncoder().encode(`\x16Nimiq Signed Message:\n${bytes.length}${challenge.message}`);
    const signature=keyPair.sign(Hash.computeSha256(signedBytes)).toHex();
    const sessionResponse=await app.inject({method:"POST",url:"/v1/auth/sessions",payload:{challengeId:challenge.challengeId,nonce:challenge.nonce,walletAddress,publicKey:keyPair.publicKey.toHex(),signature}});
    expect(sessionResponse.statusCode).toBe(201);
    return { token:sessionResponse.json().token as string,walletAddress:walletAddress.replaceAll(" ","").toUpperCase(),keyPair };
  }

  it("reports health", async () => { const response=await app.inject({method:"GET",url:"/healthz"}); expect(response.statusCode).toBe(200); expect(response.json().status).toBe("ok"); });

  it("rejects a malformed Nimiq address without an internal error", async () => {
    const response=await app.inject({method:"POST",url:"/v1/auth/challenges",payload:{walletAddress:"X".repeat(32)}});
    expect(response.statusCode).toBe(400);
  });

  it("authenticates a valid Nimiq message and rejects challenge replay", async () => {
    const keyPair=KeyPair.generate(); const walletAddress=keyPair.toAddress().toUserFriendlyAddress();
    const challenge=(await app.inject({method:"POST",url:"/v1/auth/challenges",payload:{walletAddress}})).json();
    const bytes=new TextEncoder().encode(challenge.message); const signature=keyPair.sign(Hash.computeSha256(new TextEncoder().encode(`\x16Nimiq Signed Message:\n${bytes.length}${challenge.message}`))).toHex();
    const payload={challengeId:challenge.challengeId,nonce:challenge.nonce,walletAddress,publicKey:keyPair.publicKey.toHex(),signature};
    expect((await app.inject({method:"POST",url:"/v1/auth/sessions",payload})).statusCode).toBe(201);
    expect((await app.inject({method:"POST",url:"/v1/auth/sessions",payload})).statusCode).toBe(401);
  });

  it("requires authentication for mutations", async () => { const response=await app.inject({method:"POST",url:"/v1/posts/intents",payload:{kind:"request",body:"Need a designer"}}); expect(response.statusCode).toBe(401); });

  it("publishes a paid post into the public feed", async () => {
    const user=await login();
    const intent=await app.inject({method:"POST",url:"/v1/posts/intents",headers:{authorization:`Bearer ${user.token}`},payload:{kind:"request",body:"Need a Nimiq designer"}});
    expect(intent.statusCode).toBe(201); const body=intent.json(); expect(body.payment.valueLuna).toBe("10000");
    const publish=await app.inject({method:"POST",url:`/v1/posts/${body.post.id}/publish`,headers:{authorization:`Bearer ${user.token}`},payload:{txHash:"a".repeat(64)}});
    expect(publish.statusCode).toBe(200);
    const feed=await app.inject({method:"GET",url:"/v1/feed"}); expect(feed.json().items).toHaveLength(1); expect(feed.json().items[0].body).toBe("Need a Nimiq designer");
  });

  it("does not publish when the payment proof mismatches", async () => {
    const user=await login(); const intent=(await app.inject({method:"POST",url:"/v1/posts/intents",headers:{authorization:`Bearer ${user.token}`},payload:{kind:"update",body:"Work has started"}})).json(); payments.fail=true;
    const response=await app.inject({method:"POST",url:`/v1/posts/${intent.post.id}/publish`,headers:{authorization:`Bearer ${user.token}`},payload:{txHash:"b".repeat(64)}});
    expect(response.statusCode).toBe(422); expect((await app.inject({method:"GET",url:"/v1/feed"})).json().items).toHaveLength(0);
  });

  it("prevents a payment transaction from being reused", async () => {
    const user=await login(); const headers={authorization:`Bearer ${user.token}`};
    const one=(await app.inject({method:"POST",url:"/v1/posts/intents",headers,payload:{kind:"service",body:"I build APIs"}})).json();
    const two=(await app.inject({method:"POST",url:"/v1/posts/intents",headers,payload:{kind:"service",body:"I audit APIs"}})).json();
    const txHash="c".repeat(64); expect((await app.inject({method:"POST",url:`/v1/posts/${one.post.id}/publish`,headers,payload:{txHash}})).statusCode).toBe(200);
    expect((await app.inject({method:"POST",url:`/v1/posts/${two.post.id}/publish`,headers,payload:{txHash}})).statusCode).toBe(409);
  });

  it("moves a job to funding when its client accepts an applicant", async () => {
    const client=await login(); const worker=await login(); const clientHeaders={authorization:`Bearer ${client.token}`}; const workerHeaders={authorization:`Bearer ${worker.token}`};
    const created=(await app.inject({method:"POST",url:"/v1/jobs",headers:clientHeaders,payload:{title:"Build an API",description:"Implement the complete backend API",budgetUsdtMicros:"250000000",deadline:"2030-01-01T00:00:00.000Z"}})).json();
    const application=(await app.inject({method:"POST",url:`/v1/jobs/${created.job.id}/applications`,headers:workerHeaders,payload:{message:"I can ship this safely"}})).json();
    const accepted=await app.inject({method:"POST",url:`/v1/jobs/${created.job.id}/applications/${application.application.id}/accept`,headers:clientHeaders});
    expect(accepted.statusCode).toBe(200); expect(accepted.json().job.state).toBe("funding"); expect(accepted.json().job.workerWallet).toBe(worker.walletAddress);
  });

  it("keeps job messages private to client and accepted worker", async () => {
    const client=await login(); const worker=await login(); const stranger=await login(); const auth=(token:string)=>({authorization:`Bearer ${token}`});
    const job=(await app.inject({method:"POST",url:"/v1/jobs",headers:auth(client.token),payload:{title:"Write a guide",description:"Write a detailed integration guide",budgetUsdtMicros:"1000000",deadline:"2030-01-01T00:00:00.000Z"}})).json().job;
    const application=(await app.inject({method:"POST",url:`/v1/jobs/${job.id}/applications`,headers:auth(worker.token),payload:{message:"Ready"}})).json().application;
    await app.inject({method:"POST",url:`/v1/jobs/${job.id}/applications/${application.id}/accept`,headers:auth(client.token)});
    expect((await app.inject({method:"POST",url:`/v1/jobs/${job.id}/messages`,headers:auth(worker.token),payload:{body:"First draft attached"}})).statusCode).toBe(201);
    expect((await app.inject({method:"GET",url:`/v1/jobs/${job.id}/messages`,headers:auth(stranger.token)})).statusCode).toBe(403);
  });

  it("keeps request-linked direct messages private to both participants", async () => {
    const hirer=await login(); const worker=await login(); const stranger=await login(); const auth=(token:string)=>({authorization:`Bearer ${token}`});
    const intent=(await app.inject({method:"POST",url:"/v1/posts/intents",headers:auth(hirer.token),payload:{kind:"request",body:"Need a mobile product designer"}})).json();
    await app.inject({method:"POST",url:`/v1/posts/${intent.post.id}/publish`,headers:auth(hirer.token),payload:{txHash:"d".repeat(64)}});
    const created=await app.inject({method:"POST",url:"/v1/conversations",headers:auth(worker.token),payload:{participantWallet:hirer.walletAddress,postId:intent.post.id}});
    expect(created.statusCode).toBe(201); const conversation=created.json().conversation;
    expect(conversation).toMatchObject({participantWallet:hirer.walletAddress,contextPostId:intent.post.id});
    expect((await app.inject({method:"POST",url:`/v1/conversations/${conversation.id}/messages`,headers:auth(worker.token),payload:{body:"Interested — I can share relevant work."}})).statusCode).toBe(201);
    expect((await app.inject({method:"GET",url:`/v1/conversations/${conversation.id}/messages`,headers:auth(hirer.token)})).json().items).toHaveLength(1);
    expect((await app.inject({method:"GET",url:`/v1/conversations/${conversation.id}/messages`,headers:auth(stranger.token)})).statusCode).toBe(403);
  });

  it("reuses a direct conversation and blocks self-messaging", async () => {
    const one=await login(); const two=await login(); const headers={authorization:`Bearer ${one.token}`};
    const first=(await app.inject({method:"POST",url:"/v1/conversations",headers,payload:{participantWallet:two.walletAddress}})).json().conversation;
    const second=(await app.inject({method:"POST",url:"/v1/conversations",headers,payload:{participantWallet:two.walletAddress}})).json().conversation;
    expect(second.id).toBe(first.id);
    expect((await app.inject({method:"POST",url:"/v1/conversations",headers,payload:{participantWallet:one.walletAddress}})).statusCode).toBe(400);
  });

  it("creates a discoverable role-based profile with bounded preferences", async () => {
    const user=await login(); const headers={authorization:`Bearer ${user.token}`};
    const updated=await app.inject({method:"PATCH",url:"/v1/me/profile",headers,payload:{displayName:"Tomi Ade",bio:"I build wallet-native interfaces.",profileRole:"worker",professionalTitle:"Frontend engineer",skills:["React","Nimiq","react"],availability:"open",workPreference:"remote",location:"Lagos"}});
    expect(updated.statusCode).toBe(200); expect(updated.json().profile.skills).toEqual(["react","nimiq"]); expect(updated.json().profile.reputation.score).toBeNull();
    const discovery=await app.inject({method:"GET",url:"/v1/profiles?availability=open&skill=react"}); expect(discovery.statusCode).toBe(200); expect(discovery.json().items).toHaveLength(1);
    const invalid=await app.inject({method:"PATCH",url:"/v1/me/profile",headers,payload:{displayName:"X",profileRole:"worker",professionalTitle:"Dev",skills:[],availability:"open",workPreference:"remote"}}); expect(invalid.statusCode).toBe(400);
  });

  it("supports following without allowing self-follows", async () => {
    const one=await login(); const two=await login(); const auth={authorization:`Bearer ${one.token}`};
    expect((await app.inject({method:"POST",url:`/v1/profiles/${two.walletAddress}/follow`,headers:auth})).statusCode).toBe(204);
    await store.updateUserProfile(two.walletAddress,{displayName:"Worker",bio:null,profileRole:"worker",professionalTitle:"Designer",skills:["design"],availability:"open",workPreference:"remote",location:null,onboardingCompletedAt:new Date()});
    const profile=await app.inject({method:"GET",url:`/v1/profiles/${two.walletAddress}`}); expect(profile.json().profile.followers).toBe(1);
    expect((await app.inject({method:"POST",url:`/v1/profiles/${one.walletAddress}/follow`,headers:auth})).statusCode).toBe(400);
  });

  it("derives reputation only from a settled job review", async () => {
    const client=await login(); const worker=await login(); const auth=(token:string)=>({authorization:`Bearer ${token}`});
    const job=(await app.inject({method:"POST",url:"/v1/jobs",headers:auth(client.token),payload:{title:"Design a flow",description:"Design the complete onboarding workflow",budgetUsdtMicros:"500000000",deadline:"2030-01-01T00:00:00.000Z"}})).json().job;
    const application=(await app.inject({method:"POST",url:`/v1/jobs/${job.id}/applications`,headers:auth(worker.token),payload:{message:"Ready to design it"}})).json().application;
    await app.inject({method:"POST",url:`/v1/jobs/${job.id}/applications/${application.id}/accept`,headers:auth(client.token)});
    const before=await app.inject({method:"POST",url:`/v1/jobs/${job.id}/reviews`,headers:auth(client.token),payload:{quality:5,delivery:5,communication:4,reliability:5}}); expect(before.statusCode).toBe(409);
    store.jobs.get(job.id)!.state="settled";
    expect((await app.inject({method:"POST",url:`/v1/jobs/${job.id}/reviews`,headers:auth(client.token),payload:{quality:5,delivery:5,communication:4,reliability:5,body:"Clear delivery"}})).statusCode).toBe(201);
    await store.updateUserProfile(worker.walletAddress,{displayName:"Worker",bio:null,profileRole:"worker",professionalTitle:"Designer",skills:["design"],availability:"open",workPreference:"remote",location:null,onboardingCompletedAt:new Date()});
    const profile=await app.inject({method:"GET",url:`/v1/profiles/${worker.walletAddress}`}); expect(profile.json().profile.reputation).toMatchObject({score:95,reviewCount:1,confidence:20});
  });
});
