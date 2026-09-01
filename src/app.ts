import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { nanoid } from "nanoid";
import { z, ZodError } from "zod";
import { normalizeNimiqAddress, randomToken, sha256Hex, verifyNimiqMessage } from "./auth/crypto.js";
import type { AppConfig } from "./config/env.js";
import type { Application, Job, JobMessage, Post, PostKind, Session, User } from "./domain/models.js";
import type { PaymentVerifier } from "./ports/payment-verifier.js";
import type { Store } from "./ports/store.js";

const challengeSchema = z.object({ walletAddress: z.string().min(30).max(50) });
const sessionSchema = z.object({
  challengeId: z.string().min(8).max(64), nonce: z.string().min(20).max(128),
  walletAddress: z.string().min(30).max(50), publicKey: z.string().regex(/^[a-fA-F0-9]{64}$/),
  signature: z.string().regex(/^[a-fA-F0-9]{128}$/),
});
const postSchema = z.object({ kind: z.enum(["request","service","update","proof"]), body: z.string().trim().min(1).max(2000), jobId: z.string().min(8).max(64).optional() });
const publishSchema = z.object({ txHash: z.string().regex(/^[a-fA-F0-9]{64}$/) });
const jobSchema = z.object({ title: z.string().trim().min(3).max(120), description: z.string().trim().min(10).max(5000), budgetUsdtMicros: z.string().regex(/^\d{1,18}$/), deadline: z.coerce.date() });
const applicationSchema = z.object({ message: z.string().trim().min(3).max(2000) });
const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const idParams = z.object({ id: z.string().min(8).max(64) });

export interface AppDependencies { config: AppConfig; store: Store; paymentVerifier: PaymentVerifier; now?: () => Date }

export async function buildApp(deps: AppDependencies) {
  const app = Fastify({ logger: deps.config.NODE_ENV !== "test", bodyLimit: 64 * 1024, trustProxy: false });
  const now = deps.now ?? (() => new Date());
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || deps.config.allowedOrigins.has(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed"), false);
    },
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: "invalid_request", details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
    if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "conflict" });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: "request_failed", message: (error as Error).message });
    app.log.error(error);
    return reply.code(500).send({ error: "internal_error" });
  });

  async function authenticate(request: FastifyRequest): Promise<string> {
    const bearer = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : undefined;
    const token = bearer ?? request.cookies.nimsocial_session;
    if (!token) throw httpError(401, "Authentication required");
    const session = await deps.store.findSession(sha256Hex(token), now());
    if (!session) throw httpError(401, "Session is invalid or expired");
    return session.walletAddress;
  }

  app.get("/healthz", async () => ({ status: "ok", service: "nimsocial-api" }));
  app.get("/v1/config", async () => ({
    nimiq: { network: deps.config.NIMIQ_NETWORK, treasury: deps.config.NIMIQ_POST_TREASURY, postFeeLuna: deps.config.NIMIQ_POST_FEE_LUNA.toString(), updateFeeLuna: deps.config.NIMIQ_UPDATE_FEE_LUNA.toString() },
    escrow: { chainId: deps.config.POLYGON_CHAIN_ID, contractAddress: deps.config.ESCROW_CONTRACT_ADDRESS ?? null, tokenAddress: deps.config.USDT_CONTRACT_ADDRESS ?? null, deployed: Boolean(deps.config.ESCROW_CONTRACT_ADDRESS && deps.config.USDT_CONTRACT_ADDRESS) },
  }));

  app.post("/v1/auth/challenges", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { walletAddress: rawAddress } = challengeSchema.parse(request.body);
    const walletAddress = parseNimiqAddress(rawAddress);
    const nonce = randomToken(24);
    const challengeId = nanoid();
    const expiresAt = new Date(now().getTime() + deps.config.CHALLENGE_TTL_SECONDS * 1000);
    const message = `NimSocial login\nAddress: ${walletAddress}\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}`;
    await deps.store.createChallenge({ id: challengeId, walletAddress, nonceHash: sha256Hex(nonce), message, expiresAt, consumedAt: null });
    return reply.code(201).send({ challengeId, nonce, message, expiresAt: expiresAt.toISOString() });
  });

  app.post("/v1/auth/sessions", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const input = sessionSchema.parse(request.body);
    const walletAddress = parseNimiqAddress(input.walletAddress);
    const challenge = await deps.store.consumeChallenge(input.challengeId, sha256Hex(input.nonce), now());
    if (!challenge || challenge.walletAddress !== walletAddress) throw httpError(401, "Challenge is invalid or expired");
    if (!verifyNimiqMessage({ walletAddress, publicKeyHex: input.publicKey, signatureHex: input.signature, message: challenge.message })) throw httpError(401, "Signature is invalid");
    const createdAt = now();
    const user: User = { walletAddress, publicKey: input.publicKey.toLowerCase(), displayName: null, bio: null, createdAt };
    await deps.store.upsertUser(user);
    const token = randomToken();
    const expiresAt = new Date(createdAt.getTime() + deps.config.SESSION_TTL_SECONDS * 1000);
    const session: Session = { id: nanoid(), walletAddress, tokenHash: sha256Hex(token), expiresAt, revokedAt: null };
    await deps.store.createSession(session);
    reply.setCookie("nimsocial_session", token, { httpOnly: true, secure: deps.config.NODE_ENV === "production", sameSite: "strict", path: "/", expires: expiresAt });
    return reply.code(201).send({ token, walletAddress, expiresAt: expiresAt.toISOString() });
  });

  app.delete("/v1/auth/session", async (request, reply) => {
    await authenticate(request);
    const bearer = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : undefined;
    const token = bearer ?? request.cookies.nimsocial_session!;
    await deps.store.revokeSession(sha256Hex(token));
    reply.clearCookie("nimsocial_session", { path: "/" });
    return reply.code(204).send();
  });

  app.get("/v1/feed", async (request) => {
    const query = z.object({ cursor: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(request.query);
    const posts = await deps.store.listFeed(query.cursor ?? null, query.limit);
    return { items: posts.map(publicPost), nextCursor: posts.length === query.limit ? posts.at(-1)!.publishedAt!.toISOString() : null };
  });

  app.post("/v1/posts/intents", async (request, reply) => {
    const wallet = await authenticate(request);
    const input = postSchema.parse(request.body);
    if (input.kind === "proof" && !input.jobId) throw httpError(400, "Proof posts require a jobId");
    if (input.jobId) {
      const job = await deps.store.findJob(input.jobId);
      if (!job) throw httpError(404, "Job not found");
      if (input.kind === "proof" && job.workerWallet !== wallet) throw httpError(403, "Only the accepted worker can post proof");
    }
    const createdAt = now();
    const post: Post = { id: nanoid(), authorWallet: wallet, kind: input.kind, body: input.body, jobId: input.jobId ?? null, state: "draft", paymentReference: `NSP:${nanoid(16)}`, requiredLuna: feeFor(input.kind, deps.config), paymentTxHash: null, publishedAt: null, createdAt };
    await deps.store.createPost(post);
    return reply.code(201).send({ post: publicPost(post), payment: { recipient: deps.config.NIMIQ_POST_TREASURY, valueLuna: post.requiredLuna.toString(), data: post.paymentReference } });
  });

  app.post("/v1/posts/:id/publish", async (request) => {
    const wallet = await authenticate(request);
    const { id } = idParams.parse(request.params);
    const { txHash } = publishSchema.parse(request.body);
    const post = await deps.store.findPost(id);
    if (!post) throw httpError(404, "Post not found");
    if (post.authorWallet !== wallet) throw httpError(403, "Not the post author");
    if (post.state !== "draft") throw httpError(409, "Post is not awaiting payment");
    try {
      await deps.paymentVerifier.verifyPostPayment({ txHash, expectedSender: wallet, expectedRecipient: deps.config.NIMIQ_POST_TREASURY, minimumLuna: post.requiredLuna, expectedReference: post.paymentReference });
    } catch { throw httpError(422, "Payment proof did not match the post intent"); }
    const published = await deps.store.publishPost(id, txHash, now());
    if (!published) throw httpError(409, "Post could not be published");
    return { post: publicPost(published) };
  });

  app.get("/v1/posts/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const post = await deps.store.findPost(id);
    if (!post || post.state !== "published") throw httpError(404, "Post not found");
    return { post: publicPost(post) };
  });

  app.post("/v1/jobs", async (request, reply) => {
    const wallet = await authenticate(request);
    const input = jobSchema.parse(request.body);
    if (input.deadline <= now()) throw httpError(400, "Deadline must be in the future");
    const job: Job = { id:nanoid(),clientWallet:wallet,workerWallet:null,title:input.title,description:input.description,budgetUsdtMicros:BigInt(input.budgetUsdtMicros),deadline:input.deadline,arbiterAddress:null,escrowJobId:null,escrowTxHash:null,state:"open",createdAt:now() };
    await deps.store.createJob(job);
    return reply.code(201).send({ job: publicJob(job) });
  });

  app.get("/v1/jobs/:id", async (request) => { const {id}=idParams.parse(request.params); const job=await deps.store.findJob(id); if(!job) throw httpError(404,"Job not found"); return {job:publicJob(job)}; });

  app.post("/v1/jobs/:id/applications", async (request, reply) => {
    const wallet=await authenticate(request); const {id}=idParams.parse(request.params); const input=applicationSchema.parse(request.body); const job=await deps.store.findJob(id);
    if(!job) throw httpError(404,"Job not found"); if(job.state!=="open") throw httpError(409,"Job is not accepting applications"); if(job.clientWallet===wallet) throw httpError(400,"Clients cannot apply to their own job");
    const application: Application={id:nanoid(),jobId:id,applicantWallet:wallet,message:input.message,status:"pending",createdAt:now()}; await deps.store.createApplication(application); return reply.code(201).send({application});
  });

  app.post("/v1/jobs/:id/applications/:applicationId/accept", async (request) => {
    const wallet=await authenticate(request); const params=z.object({id:z.string(),applicationId:z.string()}).parse(request.params); const job=await deps.store.findJob(params.id);
    if(!job) throw httpError(404,"Job not found"); if(job.clientWallet!==wallet) throw httpError(403,"Only the client can accept an application");
    const accepted=await deps.store.acceptApplication(params.id,params.applicationId); if(!accepted) throw httpError(409,"Application could not be accepted"); return {job:publicJob(accepted)};
  });

  app.get("/v1/jobs/:id/messages", async (request) => { const wallet=await authenticate(request); const {id}=idParams.parse(request.params); await assertJobParty(deps.store,id,wallet); return {items:await deps.store.listMessages(id)}; });
  app.post("/v1/jobs/:id/messages", async (request, reply) => { const wallet=await authenticate(request); const {id}=idParams.parse(request.params); await assertJobParty(deps.store,id,wallet); const input=messageSchema.parse(request.body); const message:JobMessage={id:nanoid(),jobId:id,senderWallet:wallet,body:input.body,createdAt:now()}; await deps.store.createMessage(message); return reply.code(201).send({message}); });

  return app;
}

function feeFor(kind: PostKind, config: AppConfig) { return kind === "update" || kind === "proof" ? config.NIMIQ_UPDATE_FEE_LUNA : config.NIMIQ_POST_FEE_LUNA; }
function publicPost(post: Post) { return {...post,requiredLuna:post.requiredLuna.toString(),createdAt:post.createdAt.toISOString(),publishedAt:post.publishedAt?.toISOString()??null}; }
function publicJob(job: Job) { return {...job,budgetUsdtMicros:job.budgetUsdtMicros.toString(),deadline:job.deadline.toISOString(),createdAt:job.createdAt.toISOString()}; }
async function assertJobParty(store:Store,id:string,wallet:string) { const job=await store.findJob(id); if(!job) throw httpError(404,"Job not found"); if(job.clientWallet!==wallet&&job.workerWallet!==wallet) throw httpError(403,"Only job participants can access messages"); }
function httpError(statusCode:number,message:string) { return Object.assign(new Error(message),{statusCode}); }
function parseNimiqAddress(value:string) { try { return normalizeNimiqAddress(value); } catch { throw httpError(400,"Invalid Nimiq address"); } }
