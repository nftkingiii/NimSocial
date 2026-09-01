import type { Application, Challenge, Job, JobMessage, Post, Session, User } from "../domain/models.js";

export interface Store {
  createChallenge(challenge: Challenge): Promise<void>;
  consumeChallenge(id: string, nonceHash: string, now: Date): Promise<Challenge | null>;
  upsertUser(user: User): Promise<void>;
  createSession(session: Session): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<Session | null>;
  revokeSession(tokenHash: string): Promise<void>;
  createPost(post: Post): Promise<void>;
  findPost(id: string): Promise<Post | null>;
  publishPost(id: string, txHash: string, publishedAt: Date): Promise<Post | null>;
  listFeed(cursor: Date | null, limit: number): Promise<Post[]>;
  createJob(job: Job): Promise<void>;
  findJob(id: string): Promise<Job | null>;
  createApplication(application: Application): Promise<void>;
  findApplication(id: string): Promise<Application | null>;
  acceptApplication(jobId: string, applicationId: string): Promise<Job | null>;
  createMessage(message: JobMessage): Promise<void>;
  listMessages(jobId: string): Promise<JobMessage[]>;
}
