import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { nanoid } from "nanoid";
import { z, ZodError } from "zod";
import {
  normalizeNimiqAddress,
  randomToken,
  sha256Hex,
  verifyNimiqMessage,
} from "./auth/crypto.js";
import type { AppConfig } from "./config/env.js";
import type {
  Application,
  Conversation,
  DirectMessage,
  Job,
  JobMessage,
  Post,
  PostEngagementType,
  PostKind,
  PostReply,
  Review,
  Session,
  User,
} from "./domain/models.js";
import type { PaymentVerifier } from "./ports/payment-verifier.js";
import type { Store } from "./ports/store.js";

const challengeSchema = z.object({ walletAddress: z.string().min(30).max(50) });
const sessionSchema = z.object({
  challengeId: z.string().min(8).max(64),
  nonce: z.string().min(20).max(128),
  walletAddress: z.string().min(30).max(50),
  publicKey: z.string().regex(/^[a-fA-F0-9]{64}$/),
  signature: z.string().regex(/^[a-fA-F0-9]{128}$/),
});
const postSchema = z.object({
  kind: z.enum(["request", "service", "update", "proof"]),
  body: z.string().trim().min(1).max(2000),
  jobId: z.string().min(8).max(64).optional(),
});
const publishSchema = z.object({
  txHash: z.string().regex(/^[a-fA-F0-9]{64}$/),
});
const jobSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  budgetUsdtMicros: z.string().regex(/^\d{1,18}$/),
  deadline: z.coerce.date(),
});
const applicationSchema = z.object({
  message: z.string().trim().min(3).max(2000),
});
const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const replySchema = z.object({ body: z.string().trim().min(1).max(500) });
const engagementParams = z.object({
  id: z.string().min(8).max(64),
  type: z.enum(["repost", "appreciate", "bookmark"]),
});
const conversationSchema = z.object({
  participantWallet: z.string().min(30).max(50),
  postId: z.string().min(8).max(64).optional(),
});
const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  bio: z.string().trim().max(280).default(""),
  profileRole: z.enum(["worker", "client", "both"]),
  professionalTitle: z.string().trim().min(2).max(80),
  skills: z
    .array(z.string().trim().min(1).max(32))
    .max(12)
    .transform((items) => [
      ...new Set(items.map((item) => item.toLowerCase())),
    ]),
  availability: z.enum(["open", "busy", "not_open"]),
  workPreference: z.enum(["remote", "hybrid", "onsite", "flexible"]),
  location: z.string().trim().max(80).default(""),
});
const profileQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(["worker", "client", "both"]).optional(),
  availability: z.enum(["open", "busy", "not_open"]).optional(),
  skill: z.string().trim().max(32).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});
const reviewSchema = z.object({
  quality: z.number().int().min(1).max(5),
  delivery: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  reliability: z.number().int().min(1).max(5),
  body: z.string().trim().max(500).optional(),
});
const idParams = z.object({ id: z.string().min(8).max(64) });
const walletParams = z.object({ walletAddress: z.string().min(30).max(50) });

export interface AppDependencies {
  config: AppConfig;
  store: Store;
  paymentVerifier: PaymentVerifier;
  now?: () => Date;
}

export async function buildApp(deps: AppDependencies) {
  const app = Fastify({
    logger: deps.config.NODE_ENV !== "test",
    bodyLimit: 64 * 1024,
    trustProxy: false,
  });
  const now = deps.now ?? (() => new Date());
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || deps.config.allowedOrigins.has(origin))
        callback(null, true);
      else callback(new Error("Origin is not allowed"), false);
    },
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({
          error: "invalid_request",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
    if ((error as { code?: string }).code === "23505")
      return reply.code(409).send({ error: "conflict" });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500)
      return reply
        .code(status)
        .send({ error: "request_failed", message: (error as Error).message });
    app.log.error(error);
    return reply.code(500).send({ error: "internal_error" });
  });

  async function authenticate(request: FastifyRequest): Promise<string> {
    const bearer = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7)
      : undefined;
    const token = bearer ?? request.cookies.nimsocial_session;
    if (!token) throw httpError(401, "Authentication required");
    const session = await deps.store.findSession(sha256Hex(token), now());
    if (!session) throw httpError(401, "Session is invalid or expired");
    return session.walletAddress;
  }
  async function optionalViewer(
    request: FastifyRequest,
  ): Promise<string | undefined> {
    const bearer = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7)
      : undefined;
    const token = bearer ?? request.cookies.nimsocial_session;
    if (!token) return undefined;
    return (await deps.store.findSession(sha256Hex(token), now()))
      ?.walletAddress;
  }

  app.get("/healthz", async () => ({
    status: "ok",
    service: "nimsocial-api",
    revision: deps.config.REVISION,
  }));
  app.get("/v1/config", async () => ({
    nimiq: {
      network: deps.config.NIMIQ_NETWORK,
      treasury: deps.config.NIMIQ_POST_TREASURY,
      postFeeLuna: deps.config.NIMIQ_POST_FEE_LUNA.toString(),
      updateFeeLuna: deps.config.NIMIQ_UPDATE_FEE_LUNA.toString(),
    },
    escrow: {
      chainId: deps.config.POLYGON_CHAIN_ID,
      contractAddress: deps.config.ESCROW_CONTRACT_ADDRESS ?? null,
      tokenAddress: deps.config.USDT_CONTRACT_ADDRESS ?? null,
      deployed: Boolean(
        deps.config.ESCROW_CONTRACT_ADDRESS &&
        deps.config.USDT_CONTRACT_ADDRESS,
      ),
    },
  }));

  app.post(
    "/v1/auth/challenges",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { walletAddress: rawAddress } = challengeSchema.parse(request.body);
      const walletAddress = parseNimiqAddress(rawAddress);
      const nonce = randomToken(24);
      const challengeId = nanoid();
      const expiresAt = new Date(
        now().getTime() + deps.config.CHALLENGE_TTL_SECONDS * 1000,
      );
      const message = `NimSocial login\nAddress: ${walletAddress}\nNonce: ${nonce}\nExpires: ${expiresAt.toISOString()}`;
      await deps.store.createChallenge({
        id: challengeId,
        walletAddress,
        nonceHash: sha256Hex(nonce),
        message,
        expiresAt,
        consumedAt: null,
      });
      return reply
        .code(201)
        .send({
          challengeId,
          nonce,
          message,
          expiresAt: expiresAt.toISOString(),
        });
    },
  );

  app.post(
    "/v1/auth/sessions",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = sessionSchema.parse(request.body);
      const walletAddress = parseNimiqAddress(input.walletAddress);
      const challenge = await deps.store.consumeChallenge(
        input.challengeId,
        sha256Hex(input.nonce),
        now(),
      );
      if (!challenge || challenge.walletAddress !== walletAddress)
        throw httpError(401, "Challenge is invalid or expired");
      if (
        !verifyNimiqMessage({
          walletAddress,
          publicKeyHex: input.publicKey,
          signatureHex: input.signature,
          message: challenge.message,
        })
      )
        throw httpError(401, "Signature is invalid");
      const createdAt = now();
      const user: User = {
        walletAddress,
        publicKey: input.publicKey.toLowerCase(),
        displayName: null,
        bio: null,
        profileRole: null,
        professionalTitle: null,
        skills: [],
        availability: "not_open",
        workPreference: null,
        location: null,
        onboardingCompletedAt: null,
        createdAt,
      };
      await deps.store.upsertUser(user);
      const token = randomToken();
      const expiresAt = new Date(
        createdAt.getTime() + deps.config.SESSION_TTL_SECONDS * 1000,
      );
      const session: Session = {
        id: nanoid(),
        walletAddress,
        tokenHash: sha256Hex(token),
        expiresAt,
        revokedAt: null,
      };
      await deps.store.createSession(session);
      reply.setCookie("nimsocial_session", token, {
        httpOnly: true,
        secure: deps.config.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        expires: expiresAt,
      });
      return reply
        .code(201)
        .send({ token, walletAddress, expiresAt: expiresAt.toISOString() });
    },
  );

  app.delete("/v1/auth/session", async (request, reply) => {
    await authenticate(request);
    const bearer = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7)
      : undefined;
    const token = bearer ?? request.cookies.nimsocial_session!;
    await deps.store.revokeSession(sha256Hex(token));
    reply.clearCookie("nimsocial_session", { path: "/" });
    return reply.code(204).send();
  });

  app.get("/v1/me/profile", async (request) => {
    const wallet = await authenticate(request);
    const user = await deps.store.findUser(wallet);
    if (!user) throw httpError(404, "Profile not found");
    return { profile: await profilePayload(deps.store, user, wallet) };
  });

  app.patch("/v1/me/profile", async (request) => {
    const wallet = await authenticate(request);
    const input = profileSchema.parse(request.body);
    const user = await deps.store.updateUserProfile(wallet, {
      displayName: input.displayName,
      bio: input.bio || null,
      profileRole: input.profileRole,
      professionalTitle: input.professionalTitle,
      skills: input.skills,
      availability: input.availability,
      workPreference: input.workPreference,
      location: input.location || null,
      onboardingCompletedAt: now(),
    });
    if (!user) throw httpError(404, "Profile not found");
    return { profile: await profilePayload(deps.store, user, wallet) };
  });

  app.get("/v1/profiles", async (request) => {
    const query = profileQuerySchema.parse(request.query);
    const profiles = await deps.store.listProfiles(query.limit);
    const needle = query.q?.toLowerCase();
    const filtered = profiles.filter((profile) => {
      if (
        query.role &&
        profile.profileRole !== query.role &&
        profile.profileRole !== "both"
      )
        return false;
      if (query.availability && profile.availability !== query.availability)
        return false;
      if (query.skill && !profile.skills.includes(query.skill.toLowerCase()))
        return false;
      return (
        !needle ||
        [
          profile.displayName,
          profile.professionalTitle,
          profile.bio,
          profile.location,
          ...profile.skills,
        ].some((value) => value?.toLowerCase().includes(needle))
      );
    });
    return {
      items: await Promise.all(
        filtered.map((profile) => profilePayload(deps.store, profile)),
      ),
    };
  });

  app.get("/v1/profiles/:walletAddress", async (request) => {
    const wallet = parseNimiqAddress(
      walletParams.parse(request.params).walletAddress,
    );
    const user = await deps.store.findUser(wallet);
    if (!user || !user.onboardingCompletedAt)
      throw httpError(404, "Profile not found");
    return { profile: await profilePayload(deps.store, user) };
  });

  app.get("/v1/profiles/:walletAddress/posts", async (request) => {
    const wallet = parseNimiqAddress(
      walletParams.parse(request.params).walletAddress,
    );
    const posts = await deps.store.listPostsByAuthor(wallet, 30);
    const viewer = await optionalViewer(request);
    return {
      items: await Promise.all(
        posts.map((post) => postPayload(deps.store, post, viewer)),
      ),
    };
  });

  app.post("/v1/profiles/:walletAddress/follow", async (request, reply) => {
    const follower = await authenticate(request);
    const followed = parseNimiqAddress(
      walletParams.parse(request.params).walletAddress,
    );
    if (follower === followed)
      throw httpError(400, "You cannot follow yourself");
    if (!(await deps.store.findUser(followed)))
      throw httpError(404, "Profile not found");
    await deps.store.follow(follower, followed);
    return reply.code(204).send();
  });

  app.delete("/v1/profiles/:walletAddress/follow", async (request, reply) => {
    const follower = await authenticate(request);
    const followed = parseNimiqAddress(
      walletParams.parse(request.params).walletAddress,
    );
    await deps.store.unfollow(follower, followed);
    return reply.code(204).send();
  });

  app.get("/v1/feed", async (request) => {
    const query = z
      .object({
        cursor: z.coerce.date().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(request.query);
    const posts = await deps.store.listFeed(query.cursor ?? null, query.limit);
    const viewer = await optionalViewer(request);
    return {
      items: await Promise.all(
        posts.map((post) => postPayload(deps.store, post, viewer)),
      ),
      nextCursor:
        posts.length === query.limit
          ? posts.at(-1)!.publishedAt!.toISOString()
          : null,
    };
  });

  app.post("/v1/posts/intents", async (request, reply) => {
    const wallet = await authenticate(request);
    const input = postSchema.parse(request.body);
    if (input.kind === "proof" && !input.jobId)
      throw httpError(400, "Proof posts require a jobId");
    if (input.jobId) {
      const job = await deps.store.findJob(input.jobId);
      if (!job) throw httpError(404, "Job not found");
      if (input.kind === "proof" && job.workerWallet !== wallet)
        throw httpError(403, "Only the accepted worker can post proof");
    }
    const createdAt = now();
    const post: Post = {
      id: nanoid(),
      authorWallet: wallet,
      kind: input.kind,
      body: input.body,
      jobId: input.jobId ?? null,
      state: "draft",
      paymentReference: `NSP:${nanoid(16)}`,
      requiredLuna: feeFor(input.kind, deps.config),
      paymentTxHash: null,
      publishedAt: null,
      createdAt,
    };
    await deps.store.createPost(post);
    return reply
      .code(201)
      .send({
        post: await postPayload(deps.store, post, wallet),
        payment: {
          recipient: deps.config.NIMIQ_POST_TREASURY,
          valueLuna: post.requiredLuna.toString(),
          data: post.paymentReference,
        },
      });
  });

  app.post("/v1/posts/:id/publish", async (request) => {
    const wallet = await authenticate(request);
    const { id } = idParams.parse(request.params);
    const { txHash } = publishSchema.parse(request.body);
    const post = await deps.store.findPost(id);
    if (!post) throw httpError(404, "Post not found");
    if (post.authorWallet !== wallet)
      throw httpError(403, "Not the post author");
    if (post.state !== "draft")
      throw httpError(409, "Post is not awaiting payment");
    try {
      await deps.paymentVerifier.verifyPostPayment({
        txHash,
        expectedSender: wallet,
        expectedRecipient: deps.config.NIMIQ_POST_TREASURY,
        minimumLuna: post.requiredLuna,
        expectedReference: post.paymentReference,
      });
    } catch {
      throw httpError(422, "Payment proof did not match the post intent");
    }
    const published = await deps.store.publishPost(id, txHash, now());
    if (!published) throw httpError(409, "Post could not be published");
    return { post: await postPayload(deps.store, published, wallet) };
  });

  app.get("/v1/posts/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const post = await deps.store.findPost(id);
    if (!post || post.state !== "published")
      throw httpError(404, "Post not found");
    return {
      post: await postPayload(deps.store, post, await optionalViewer(request)),
    };
  });

  app.get("/v1/posts/:id/replies", async (request) => {
    const { id } = idParams.parse(request.params);
    const post = await deps.store.findPost(id);
    if (!post || post.state !== "published")
      throw httpError(404, "Post not found");
    return {
      items: (await deps.store.listPostReplies(id, 100)).map(publicPostReply),
    };
  });
  app.post(
    "/v1/posts/:id/replies",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const wallet = await authenticate(request);
      const { id } = idParams.parse(request.params);
      const input = replySchema.parse(request.body);
      const post = await deps.store.findPost(id);
      if (!post || post.state !== "published")
        throw httpError(404, "Post not found");
      const postReply: PostReply = {
        id: nanoid(),
        postId: id,
        authorWallet: wallet,
        body: input.body,
        createdAt: now(),
      };
      await deps.store.createPostReply(postReply);
      return reply
        .code(201)
        .send({
          reply: publicPostReply(postReply),
          engagement: await deps.store.getPostEngagement(id, wallet),
        });
    },
  );
  app.put(
    "/v1/posts/:id/engagement/:type",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request) => {
      const wallet = await authenticate(request);
      const params = engagementParams.parse(request.params);
      await assertPublishedPost(deps.store, params.id);
      await deps.store.setPostEngagement(
        params.id,
        wallet,
        params.type as PostEngagementType,
        true,
      );
      return {
        engagement: await deps.store.getPostEngagement(params.id, wallet),
      };
    },
  );
  app.delete(
    "/v1/posts/:id/engagement/:type",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request) => {
      const wallet = await authenticate(request);
      const params = engagementParams.parse(request.params);
      await assertPublishedPost(deps.store, params.id);
      await deps.store.setPostEngagement(
        params.id,
        wallet,
        params.type as PostEngagementType,
        false,
      );
      return {
        engagement: await deps.store.getPostEngagement(params.id, wallet),
      };
    },
  );

  app.post("/v1/jobs", async (request, reply) => {
    const wallet = await authenticate(request);
    const input = jobSchema.parse(request.body);
    if (input.deadline <= now())
      throw httpError(400, "Deadline must be in the future");
    const job: Job = {
      id: nanoid(),
      clientWallet: wallet,
      workerWallet: null,
      title: input.title,
      description: input.description,
      budgetUsdtMicros: BigInt(input.budgetUsdtMicros),
      deadline: input.deadline,
      arbiterAddress: null,
      escrowJobId: null,
      escrowTxHash: null,
      state: "open",
      createdAt: now(),
    };
    await deps.store.createJob(job);
    return reply.code(201).send({ job: publicJob(job) });
  });

  app.get("/v1/jobs/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const job = await deps.store.findJob(id);
    if (!job) throw httpError(404, "Job not found");
    return { job: publicJob(job) };
  });

  app.post("/v1/jobs/:id/applications", async (request, reply) => {
    const wallet = await authenticate(request);
    const { id } = idParams.parse(request.params);
    const input = applicationSchema.parse(request.body);
    const job = await deps.store.findJob(id);
    if (!job) throw httpError(404, "Job not found");
    if (job.state !== "open")
      throw httpError(409, "Job is not accepting applications");
    if (job.clientWallet === wallet)
      throw httpError(400, "Clients cannot apply to their own job");
    const application: Application = {
      id: nanoid(),
      jobId: id,
      applicantWallet: wallet,
      message: input.message,
      status: "pending",
      createdAt: now(),
    };
    await deps.store.createApplication(application);
    return reply.code(201).send({ application });
  });

  app.post(
    "/v1/jobs/:id/applications/:applicationId/accept",
    async (request) => {
      const wallet = await authenticate(request);
      const params = z
        .object({ id: z.string(), applicationId: z.string() })
        .parse(request.params);
      const job = await deps.store.findJob(params.id);
      if (!job) throw httpError(404, "Job not found");
      if (job.clientWallet !== wallet)
        throw httpError(403, "Only the client can accept an application");
      const accepted = await deps.store.acceptApplication(
        params.id,
        params.applicationId,
      );
      if (!accepted) throw httpError(409, "Application could not be accepted");
      return { job: publicJob(accepted) };
    },
  );

  app.get("/v1/jobs/:id/messages", async (request) => {
    const wallet = await authenticate(request);
    const { id } = idParams.parse(request.params);
    await assertJobParty(deps.store, id, wallet);
    return { items: await deps.store.listMessages(id) };
  });
  app.post("/v1/jobs/:id/messages", async (request, reply) => {
    const wallet = await authenticate(request);
    const { id } = idParams.parse(request.params);
    await assertJobParty(deps.store, id, wallet);
    const input = messageSchema.parse(request.body);
    const message: JobMessage = {
      id: nanoid(),
      jobId: id,
      senderWallet: wallet,
      body: input.body,
      createdAt: now(),
    };
    await deps.store.createMessage(message);
    return reply.code(201).send({ message });
  });

  app.get("/v1/conversations", async (request) => {
    const wallet = await authenticate(request);
    const items = await deps.store.listConversations(wallet);
    return {
      items: items.map(({ conversation, lastMessage }) =>
        conversationPayload(conversation, wallet, lastMessage),
      ),
    };
  });

  app.post(
    "/v1/conversations",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const wallet = await authenticate(request);
      const input = conversationSchema.parse(request.body);
      const participant = parseNimiqAddress(input.participantWallet);
      if (participant === wallet)
        throw httpError(400, "You cannot message yourself");
      if (!(await deps.store.findUser(participant)))
        throw httpError(404, "Profile not found");
      if (input.postId) {
        const post = await deps.store.findPost(input.postId);
        if (!post || post.state !== "published")
          throw httpError(404, "Post not found");
        if (post.authorWallet !== wallet && post.authorWallet !== participant)
          throw httpError(
            403,
            "The post must belong to a conversation participant",
          );
      }
      const [memberA, memberB] = [wallet, participant].sort() as [
        string,
        string,
      ];
      const existing = await deps.store.findDirectConversation(
        memberA,
        memberB,
        input.postId ?? null,
      );
      const conversation: Conversation = existing ?? {
        id: nanoid(),
        memberA,
        memberB,
        contextPostId: input.postId ?? null,
        createdAt: now(),
      };
      if (!existing) await deps.store.createConversation(conversation);
      return reply
        .code(201)
        .send({
          conversation: conversationPayload(conversation, wallet, null),
        });
    },
  );

  app.get("/v1/conversations/:id/messages", async (request) => {
    const wallet = await authenticate(request);
    const { id } = idParams.parse(request.params);
    const conversation = await assertConversationParty(deps.store, id, wallet);
    return {
      conversation: conversationPayload(conversation, wallet, null),
      items: (await deps.store.listDirectMessages(id)).map(publicDirectMessage),
    };
  });
  app.post(
    "/v1/conversations/:id/messages",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const wallet = await authenticate(request);
      const { id } = idParams.parse(request.params);
      await assertConversationParty(deps.store, id, wallet);
      const input = messageSchema.parse(request.body);
      const message: DirectMessage = {
        id: nanoid(),
        conversationId: id,
        senderWallet: wallet,
        body: input.body,
        createdAt: now(),
      };
      await deps.store.createDirectMessage(message);
      return reply.code(201).send({ message: publicDirectMessage(message) });
    },
  );

  app.post("/v1/jobs/:id/reviews", async (request, reply) => {
    const wallet = await authenticate(request);
    const { id } = idParams.parse(request.params);
    const input = reviewSchema.parse(request.body);
    const job = await deps.store.findJob(id);
    if (!job) throw httpError(404, "Job not found");
    if (job.clientWallet !== wallet)
      throw httpError(403, "Only the client can review the worker");
    if (job.state !== "settled")
      throw httpError(409, "Reviews unlock after settlement");
    if (!job.workerWallet) throw httpError(409, "Job has no accepted worker");
    const review: Review = {
      id: nanoid(),
      jobId: id,
      reviewerWallet: wallet,
      subjectWallet: job.workerWallet,
      quality: input.quality,
      delivery: input.delivery,
      communication: input.communication,
      reliability: input.reliability,
      body: input.body ?? null,
      createdAt: now(),
    };
    await deps.store.createReview(review);
    return reply.code(201).send({ review: publicReview(review) });
  });

  return app;
}

function feeFor(kind: PostKind, config: AppConfig) {
  return kind === "update" || kind === "proof"
    ? config.NIMIQ_UPDATE_FEE_LUNA
    : config.NIMIQ_POST_FEE_LUNA;
}
function publicPost(post: Post) {
  return {
    ...post,
    requiredLuna: post.requiredLuna.toString(),
    createdAt: post.createdAt.toISOString(),
    publishedAt: post.publishedAt?.toISOString() ?? null,
  };
}
async function postPayload(store: Store, post: Post, viewer?: string) {
  return {
    ...publicPost(post),
    engagement: await store.getPostEngagement(post.id, viewer),
  };
}
function publicPostReply(reply: PostReply) {
  return { ...reply, createdAt: reply.createdAt.toISOString() };
}
function publicJob(job: Job) {
  return {
    ...job,
    budgetUsdtMicros: job.budgetUsdtMicros.toString(),
    deadline: job.deadline.toISOString(),
    createdAt: job.createdAt.toISOString(),
  };
}
function publicReview(review: Review) {
  return { ...review, createdAt: review.createdAt.toISOString() };
}
function publicDirectMessage(message: DirectMessage) {
  return { ...message, createdAt: message.createdAt.toISOString() };
}
function conversationPayload(
  conversation: Conversation,
  viewer: string,
  lastMessage: DirectMessage | null,
) {
  return {
    id: conversation.id,
    participantWallet:
      conversation.memberA === viewer
        ? conversation.memberB
        : conversation.memberA,
    contextPostId: conversation.contextPostId,
    createdAt: conversation.createdAt.toISOString(),
    lastMessage: lastMessage ? publicDirectMessage(lastMessage) : null,
  };
}
async function profilePayload(store: Store, user: User, viewer?: string) {
  const [counts, reviews, following] = await Promise.all([
    store.countFollowers(user.walletAddress),
    store.listReviewsForUser(user.walletAddress),
    viewer ? store.isFollowing(viewer, user.walletAddress) : false,
  ]);
  const average = (
    key: "quality" | "delivery" | "communication" | "reliability",
  ) =>
    reviews.length
      ? Number(
          (
            reviews.reduce((sum, review) => sum + review[key], 0) /
            reviews.length
          ).toFixed(1),
        )
      : null;
  const dimensions = {
    quality: average("quality"),
    delivery: average("delivery"),
    communication: average("communication"),
    reliability: average("reliability"),
  };
  const values = Object.values(dimensions).filter(
    (value): value is number => value !== null,
  );
  const score = values.length
    ? Math.round(
        (values.reduce((sum, value) => sum + value, 0) / values.length) * 20,
      )
    : null;
  return {
    ...user,
    publicKey: undefined,
    createdAt: user.createdAt.toISOString(),
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    ...counts,
    isFollowing: following,
    reputation: {
      score,
      reviewCount: reviews.length,
      confidence: Math.min(100, Math.round((reviews.length / 5) * 100)),
      dimensions,
      credentialTxHash: null,
    },
  };
}
async function assertJobParty(store: Store, id: string, wallet: string) {
  const job = await store.findJob(id);
  if (!job) throw httpError(404, "Job not found");
  if (job.clientWallet !== wallet && job.workerWallet !== wallet)
    throw httpError(403, "Only job participants can access messages");
}
async function assertConversationParty(
  store: Store,
  id: string,
  wallet: string,
) {
  const conversation = await store.findConversation(id);
  if (!conversation) throw httpError(404, "Conversation not found");
  if (conversation.memberA !== wallet && conversation.memberB !== wallet)
    throw httpError(403, "Only conversation participants can access messages");
  return conversation;
}
async function assertPublishedPost(store: Store, id: string) {
  const post = await store.findPost(id);
  if (!post || post.state !== "published")
    throw httpError(404, "Post not found");
  return post;
}
function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}
function parseNimiqAddress(value: string) {
  try {
    return normalizeNimiqAddress(value);
  } catch {
    throw httpError(400, "Invalid Nimiq address");
  }
}
