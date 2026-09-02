import type {
  Application,
  Challenge,
  Conversation,
  DirectMessage,
  Job,
  JobMessage,
  Post,
  PostEngagementSummary,
  PostEngagementType,
  PostReply,
  Review,
  Session,
  User,
} from "../domain/models.js";

export interface Store {
  createChallenge(challenge: Challenge): Promise<void>;
  consumeChallenge(
    id: string,
    nonceHash: string,
    now: Date,
  ): Promise<Challenge | null>;
  upsertUser(user: User): Promise<void>;
  findUser(walletAddress: string): Promise<User | null>;
  updateUserProfile(
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
  ): Promise<User | null>;
  listProfiles(limit: number): Promise<User[]>;
  follow(followerWallet: string, followedWallet: string): Promise<void>;
  unfollow(followerWallet: string, followedWallet: string): Promise<void>;
  isFollowing(followerWallet: string, followedWallet: string): Promise<boolean>;
  countFollowers(
    walletAddress: string,
  ): Promise<{ followers: number; following: number }>;
  createSession(session: Session): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<Session | null>;
  revokeSession(tokenHash: string): Promise<void>;
  createPost(post: Post): Promise<void>;
  findPost(id: string): Promise<Post | null>;
  publishPost(
    id: string,
    txHash: string,
    publishedAt: Date,
  ): Promise<Post | null>;
  listFeed(cursor: Date | null, limit: number): Promise<Post[]>;
  listPostsByAuthor(walletAddress: string, limit: number): Promise<Post[]>;
  createPostReply(reply: PostReply): Promise<void>;
  listPostReplies(postId: string, limit: number): Promise<PostReply[]>;
  setPostEngagement(
    postId: string,
    walletAddress: string,
    type: PostEngagementType,
    active: boolean,
  ): Promise<void>;
  getPostEngagement(
    postId: string,
    viewerWallet?: string,
  ): Promise<PostEngagementSummary>;
  createJob(job: Job): Promise<void>;
  findJob(id: string): Promise<Job | null>;
  createApplication(application: Application): Promise<void>;
  findApplication(id: string): Promise<Application | null>;
  acceptApplication(jobId: string, applicationId: string): Promise<Job | null>;
  createMessage(message: JobMessage): Promise<void>;
  listMessages(jobId: string): Promise<JobMessage[]>;
  createConversation(conversation: Conversation): Promise<void>;
  findConversation(id: string): Promise<Conversation | null>;
  findDirectConversation(
    memberA: string,
    memberB: string,
    contextPostId: string | null,
  ): Promise<Conversation | null>;
  listConversations(
    walletAddress: string,
  ): Promise<
    Array<{ conversation: Conversation; lastMessage: DirectMessage | null }>
  >;
  createDirectMessage(message: DirectMessage): Promise<void>;
  listDirectMessages(conversationId: string): Promise<DirectMessage[]>;
  createReview(review: Review): Promise<void>;
  listReviewsForUser(walletAddress: string): Promise<Review[]>;
}
