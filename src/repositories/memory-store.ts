import type {
  Application,
  Challenge,
  Conversation,
  DirectMessage,
  Job,
  JobMessage,
  Post,
  PostEngagementType,
  PostReply,
  Review,
  Session,
  User,
} from "../domain/models.js";
import type { Store } from "../ports/store.js";

export class MemoryStore implements Store {
  readonly challenges = new Map<string, Challenge>();
  readonly users = new Map<string, User>();
  readonly sessions = new Map<string, Session>();
  readonly posts = new Map<string, Post>();
  readonly postReplies = new Map<string, PostReply>();
  readonly postEngagements = new Set<string>();
  readonly jobs = new Map<string, Job>();
  readonly applications = new Map<string, Application>();
  readonly messages = new Map<string, JobMessage>();
  readonly conversations = new Map<string, Conversation>();
  readonly directMessages = new Map<string, DirectMessage>();
  readonly follows = new Set<string>();
  readonly reviews = new Map<string, Review>();

  async createChallenge(challenge: Challenge) {
    this.challenges.set(challenge.id, challenge);
  }
  async consumeChallenge(id: string, nonceHash: string, now: Date) {
    const value = this.challenges.get(id);
    if (
      !value ||
      value.nonceHash !== nonceHash ||
      value.consumedAt ||
      value.expiresAt <= now
    )
      return null;
    value.consumedAt = now;
    return value;
  }
  async upsertUser(user: User) {
    this.users.set(
      user.walletAddress,
      this.users.get(user.walletAddress) ?? user,
    );
  }
  async findUser(walletAddress: string) {
    return this.users.get(walletAddress) ?? null;
  }
  async updateUserProfile(
    walletAddress: string,
    profile: Pick<
      User,
      | "displayName"
      | "bio"
      | "profileRole"
      | "professionalTitle"
      | "skills"
      | "availability"
      | "workPreference"
      | "location"
      | "onboardingCompletedAt"
    >,
  ) {
    const user = this.users.get(walletAddress);
    if (!user) return null;
    Object.assign(user, profile);
    return user;
  }
  async listProfiles(limit: number) {
    return [...this.users.values()]
      .filter((user) => user.onboardingCompletedAt)
      .slice(0, limit);
  }
  async follow(followerWallet: string, followedWallet: string) {
    this.follows.add(`${followerWallet}:${followedWallet}`);
  }
  async unfollow(followerWallet: string, followedWallet: string) {
    this.follows.delete(`${followerWallet}:${followedWallet}`);
  }
  async isFollowing(followerWallet: string, followedWallet: string) {
    return this.follows.has(`${followerWallet}:${followedWallet}`);
  }
  async countFollowers(walletAddress: string) {
    let followers = 0,
      following = 0;
    for (const edge of this.follows) {
      const [from, to] = edge.split(":");
      if (to === walletAddress) followers++;
      if (from === walletAddress) following++;
    }
    return { followers, following };
  }
  async createSession(session: Session) {
    this.sessions.set(session.tokenHash, session);
  }
  async findSession(tokenHash: string, now: Date) {
    const session = this.sessions.get(tokenHash);
    return session && !session.revokedAt && session.expiresAt > now
      ? session
      : null;
  }
  async revokeSession(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    if (session) session.revokedAt = new Date();
  }
  async createPost(post: Post) {
    this.posts.set(post.id, post);
  }
  async findPost(id: string) {
    return this.posts.get(id) ?? null;
  }
  async publishPost(id: string, txHash: string, publishedAt: Date) {
    if ([...this.posts.values()].some((post) => post.paymentTxHash === txHash))
      throw Object.assign(new Error("Payment transaction already used"), {
        code: "23505",
      });
    const post = this.posts.get(id);
    if (!post || post.state !== "draft") return null;
    Object.assign(post, {
      state: "published" as const,
      paymentTxHash: txHash,
      publishedAt,
    });
    return post;
  }
  async listFeed(cursor: Date | null, limit: number) {
    return [...this.posts.values()]
      .filter(
        (post) =>
          post.state === "published" && (!cursor || post.publishedAt! < cursor),
      )
      .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())
      .slice(0, limit);
  }
  async listPostsByAuthor(walletAddress: string, limit: number) {
    return [...this.posts.values()]
      .filter(
        (post) =>
          post.authorWallet === walletAddress && post.state === "published",
      )
      .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())
      .slice(0, limit);
  }
  async createPostReply(reply: PostReply) {
    this.postReplies.set(reply.id, reply);
  }
  async listPostReplies(postId: string, limit: number) {
    return [...this.postReplies.values()]
      .filter((reply) => reply.postId === postId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
  }
  async setPostEngagement(
    postId: string,
    walletAddress: string,
    type: PostEngagementType,
    active: boolean,
  ) {
    const key = `${postId}:${walletAddress}:${type}`;
    if (active) this.postEngagements.add(key);
    else this.postEngagements.delete(key);
  }
  async getPostEngagement(postId: string, viewerWallet?: string) {
    const count = (type: PostEngagementType) =>
      [...this.postEngagements].filter(
        (key) => key.startsWith(`${postId}:`) && key.endsWith(`:${type}`),
      ).length;
    const has = (type: PostEngagementType) =>
      viewerWallet
        ? this.postEngagements.has(`${postId}:${viewerWallet}:${type}`)
        : false;
    return {
      replies: [...this.postReplies.values()].filter(
        (reply) => reply.postId === postId,
      ).length,
      reposts: count("repost"),
      appreciations: count("appreciate"),
      bookmarks: count("bookmark"),
      viewer: {
        reposted: has("repost"),
        appreciated: has("appreciate"),
        bookmarked: has("bookmark"),
      },
    };
  }
  async createJob(job: Job) {
    this.jobs.set(job.id, job);
  }
  async findJob(id: string) {
    return this.jobs.get(id) ?? null;
  }
  async createApplication(application: Application) {
    if (
      [...this.applications.values()].some(
        (item) =>
          item.jobId === application.jobId &&
          item.applicantWallet === application.applicantWallet,
      )
    )
      throw Object.assign(new Error("Already applied"), { code: "23505" });
    this.applications.set(application.id, application);
  }
  async findApplication(id: string) {
    return this.applications.get(id) ?? null;
  }
  async acceptApplication(jobId: string, applicationId: string) {
    const job = this.jobs.get(jobId);
    const application = this.applications.get(applicationId);
    if (
      !job ||
      job.state !== "open" ||
      !application ||
      application.jobId !== jobId ||
      application.status !== "pending"
    )
      return null;
    job.workerWallet = application.applicantWallet;
    job.state = "funding";
    application.status = "accepted";
    for (const item of this.applications.values())
      if (item.jobId === jobId && item.id !== applicationId)
        item.status = "rejected";
    return job;
  }
  async createMessage(message: JobMessage) {
    this.messages.set(message.id, message);
  }
  async listMessages(jobId: string) {
    return [...this.messages.values()]
      .filter((message) => message.jobId === jobId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async createConversation(conversation: Conversation) {
    this.conversations.set(conversation.id, conversation);
  }
  async findConversation(id: string) {
    return this.conversations.get(id) ?? null;
  }
  async findDirectConversation(
    memberA: string,
    memberB: string,
    contextPostId: string | null,
  ) {
    return (
      [...this.conversations.values()].find(
        (item) =>
          item.memberA === memberA &&
          item.memberB === memberB &&
          item.contextPostId === contextPostId,
      ) ?? null
    );
  }
  async listConversations(walletAddress: string) {
    return [...this.conversations.values()]
      .filter(
        (item) =>
          item.memberA === walletAddress || item.memberB === walletAddress,
      )
      .map((conversation) => ({
        conversation,
        lastMessage:
          [...this.directMessages.values()]
            .filter((message) => message.conversationId === conversation.id)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
          null,
      }))
      .sort(
        (a, b) =>
          (b.lastMessage?.createdAt ?? b.conversation.createdAt).getTime() -
          (a.lastMessage?.createdAt ?? a.conversation.createdAt).getTime(),
      );
  }
  async createDirectMessage(message: DirectMessage) {
    this.directMessages.set(message.id, message);
  }
  async listDirectMessages(conversationId: string) {
    return [...this.directMessages.values()]
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async createReview(review: Review) {
    if (
      [...this.reviews.values()].some(
        (item) =>
          item.jobId === review.jobId &&
          item.reviewerWallet === review.reviewerWallet &&
          item.subjectWallet === review.subjectWallet,
      )
    )
      throw Object.assign(new Error("Already reviewed"), { code: "23505" });
    this.reviews.set(review.id, review);
  }
  async listReviewsForUser(walletAddress: string) {
    return [...this.reviews.values()].filter(
      (review) => review.subjectWallet === walletAddress,
    );
  }
}
