import type { Application, Challenge, Job, JobMessage, Post, Session, User } from "../domain/models.js";
import type { Store } from "../ports/store.js";

export class MemoryStore implements Store {
  readonly challenges = new Map<string, Challenge>();
  readonly users = new Map<string, User>();
  readonly sessions = new Map<string, Session>();
  readonly posts = new Map<string, Post>();
  readonly jobs = new Map<string, Job>();
  readonly applications = new Map<string, Application>();
  readonly messages = new Map<string, JobMessage>();

  async createChallenge(challenge: Challenge) { this.challenges.set(challenge.id, challenge); }
  async consumeChallenge(id: string, nonceHash: string, now: Date) {
    const value = this.challenges.get(id);
    if (!value || value.nonceHash !== nonceHash || value.consumedAt || value.expiresAt <= now) return null;
    value.consumedAt = now;
    return value;
  }
  async upsertUser(user: User) { this.users.set(user.walletAddress, this.users.get(user.walletAddress) ?? user); }
  async createSession(session: Session) { this.sessions.set(session.tokenHash, session); }
  async findSession(tokenHash: string, now: Date) {
    const session = this.sessions.get(tokenHash);
    return session && !session.revokedAt && session.expiresAt > now ? session : null;
  }
  async revokeSession(tokenHash: string) { const session = this.sessions.get(tokenHash); if (session) session.revokedAt = new Date(); }
  async createPost(post: Post) { this.posts.set(post.id, post); }
  async findPost(id: string) { return this.posts.get(id) ?? null; }
  async publishPost(id: string, txHash: string, publishedAt: Date) {
    if ([...this.posts.values()].some((post) => post.paymentTxHash === txHash)) throw Object.assign(new Error("Payment transaction already used"), { code: "23505" });
    const post = this.posts.get(id);
    if (!post || post.state !== "draft") return null;
    Object.assign(post, { state: "published" as const, paymentTxHash: txHash, publishedAt });
    return post;
  }
  async listFeed(cursor: Date | null, limit: number) {
    return [...this.posts.values()]
      .filter((post) => post.state === "published" && (!cursor || post.publishedAt! < cursor))
      .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())
      .slice(0, limit);
  }
  async createJob(job: Job) { this.jobs.set(job.id, job); }
  async findJob(id: string) { return this.jobs.get(id) ?? null; }
  async createApplication(application: Application) {
    if ([...this.applications.values()].some((item) => item.jobId === application.jobId && item.applicantWallet === application.applicantWallet)) throw Object.assign(new Error("Already applied"), { code: "23505" });
    this.applications.set(application.id, application);
  }
  async findApplication(id: string) { return this.applications.get(id) ?? null; }
  async acceptApplication(jobId: string, applicationId: string) {
    const job = this.jobs.get(jobId);
    const application = this.applications.get(applicationId);
    if (!job || job.state !== "open" || !application || application.jobId !== jobId || application.status !== "pending") return null;
    job.workerWallet = application.applicantWallet;
    job.state = "funding";
    application.status = "accepted";
    for (const item of this.applications.values()) if (item.jobId === jobId && item.id !== applicationId) item.status = "rejected";
    return job;
  }
  async createMessage(message: JobMessage) { this.messages.set(message.id, message); }
  async listMessages(jobId: string) { return [...this.messages.values()].filter((message) => message.jobId === jobId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()); }
}
