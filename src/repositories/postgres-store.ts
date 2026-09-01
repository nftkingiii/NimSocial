import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { Application, Challenge, Job, JobMessage, Post, Session, User } from "../domain/models.js";
import type { Store } from "../ports/store.js";

export class PostgresStore implements Store {
  constructor(private readonly pool: Pool) {}

  async createChallenge(c: Challenge) {
    await this.pool.query("INSERT INTO auth_challenges(id,wallet_address,nonce_hash,message,expires_at) VALUES($1,$2,$3,$4,$5)", [c.id,c.walletAddress,c.nonceHash,c.message,c.expiresAt]);
  }
  async consumeChallenge(id: string, nonceHash: string, now: Date) {
    const result = await this.pool.query("UPDATE auth_challenges SET consumed_at=$3 WHERE id=$1 AND nonce_hash=$2 AND consumed_at IS NULL AND expires_at>$3 RETURNING *", [id,nonceHash,now]);
    return result.rows[0] ? challengeFrom(result.rows[0]) : null;
  }
  async upsertUser(u: User) {
    await this.pool.query("INSERT INTO users(wallet_address,public_key) VALUES($1,$2) ON CONFLICT(wallet_address) DO UPDATE SET public_key=EXCLUDED.public_key, updated_at=NOW()", [u.walletAddress,u.publicKey]);
  }
  async createSession(s: Session) {
    await this.pool.query("INSERT INTO sessions(id,wallet_address,token_hash,expires_at) VALUES($1,$2,$3,$4)", [s.id,s.walletAddress,s.tokenHash,s.expiresAt]);
  }
  async findSession(tokenHash: string, now: Date) {
    const result = await this.pool.query("SELECT * FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>$2", [tokenHash,now]);
    return result.rows[0] ? sessionFrom(result.rows[0]) : null;
  }
  async revokeSession(tokenHash: string) { await this.pool.query("UPDATE sessions SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL", [tokenHash]); }
  async createPost(p: Post) {
    await this.pool.query("INSERT INTO posts(id,author_wallet,kind,body,job_id,state,payment_reference,required_luna,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [p.id,p.authorWallet,p.kind,p.body,p.jobId,p.state,p.paymentReference,p.requiredLuna.toString(),p.createdAt]);
  }
  async findPost(id: string) { const r=await this.pool.query("SELECT * FROM posts WHERE id=$1",[id]); return r.rows[0]?postFrom(r.rows[0]):null; }
  async publishPost(id: string, txHash: string, publishedAt: Date) {
    const r=await this.pool.query("UPDATE posts SET state='published',payment_tx_hash=$2,published_at=$3 WHERE id=$1 AND state='draft' RETURNING *",[id,txHash,publishedAt]);
    return r.rows[0]?postFrom(r.rows[0]):null;
  }
  async listFeed(cursor: Date|null, limit: number) {
    const r=await this.pool.query("SELECT * FROM posts WHERE state='published' AND ($1::timestamptz IS NULL OR published_at<$1) ORDER BY published_at DESC,id DESC LIMIT $2",[cursor,limit]);
    return r.rows.map(postFrom);
  }
  async createJob(j: Job) {
    await this.pool.query("INSERT INTO jobs(id,client_wallet,title,description,budget_usdt_micros,deadline,state,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[j.id,j.clientWallet,j.title,j.description,j.budgetUsdtMicros.toString(),j.deadline,j.state,j.createdAt]);
  }
  async findJob(id: string) { const r=await this.pool.query("SELECT * FROM jobs WHERE id=$1",[id]); return r.rows[0]?jobFrom(r.rows[0]):null; }
  async createApplication(a: Application) { await this.pool.query("INSERT INTO applications(id,job_id,applicant_wallet,message,status,created_at) VALUES($1,$2,$3,$4,$5,$6)",[a.id,a.jobId,a.applicantWallet,a.message,a.status,a.createdAt]); }
  async findApplication(id: string) { const r=await this.pool.query("SELECT * FROM applications WHERE id=$1",[id]); return r.rows[0]?applicationFrom(r.rows[0]):null; }
  async acceptApplication(jobId: string, applicationId: string) {
    const client=await this.pool.connect();
    try {
      await client.query("BEGIN");
      const a=await client.query("SELECT * FROM applications WHERE id=$1 AND job_id=$2 AND status='pending' FOR UPDATE",[applicationId,jobId]);
      if (!a.rows[0]) { await client.query("ROLLBACK"); return null; }
      const j=await client.query("UPDATE jobs SET worker_wallet=$2,state='funding',updated_at=NOW() WHERE id=$1 AND state='open' RETURNING *",[jobId,a.rows[0].applicant_wallet]);
      if (!j.rows[0]) { await client.query("ROLLBACK"); return null; }
      await client.query("UPDATE applications SET status=CASE WHEN id=$2 THEN 'accepted' ELSE 'rejected' END WHERE job_id=$1",[jobId,applicationId]);
      await client.query("COMMIT");
      return jobFrom(j.rows[0]);
    } catch (error) { await rollback(client); throw error; } finally { client.release(); }
  }
  async createMessage(m: JobMessage) { await this.pool.query("INSERT INTO job_messages(id,job_id,sender_wallet,body,created_at) VALUES($1,$2,$3,$4,$5)",[m.id,m.jobId,m.senderWallet,m.body,m.createdAt]); }
  async listMessages(jobId: string) { const r=await this.pool.query("SELECT * FROM job_messages WHERE job_id=$1 ORDER BY created_at ASC,id ASC",[jobId]); return r.rows.map(messageFrom); }
}

async function rollback(client: PoolClient) { try { await client.query("ROLLBACK"); } catch { /* preserve original error */ } }
function challengeFrom(r: QueryResultRow): Challenge { return {id:r.id,walletAddress:r.wallet_address,nonceHash:r.nonce_hash,message:r.message,expiresAt:new Date(r.expires_at),consumedAt:r.consumed_at?new Date(r.consumed_at):null}; }
function sessionFrom(r: QueryResultRow): Session { return {id:r.id,walletAddress:r.wallet_address,tokenHash:r.token_hash,expiresAt:new Date(r.expires_at),revokedAt:r.revoked_at?new Date(r.revoked_at):null}; }
function postFrom(r: QueryResultRow): Post { return {id:r.id,authorWallet:r.author_wallet,kind:r.kind,body:r.body,jobId:r.job_id,state:r.state,paymentReference:r.payment_reference,requiredLuna:BigInt(r.required_luna),paymentTxHash:r.payment_tx_hash,publishedAt:r.published_at?new Date(r.published_at):null,createdAt:new Date(r.created_at)}; }
function jobFrom(r: QueryResultRow): Job { return {id:r.id,clientWallet:r.client_wallet,workerWallet:r.worker_wallet,title:r.title,description:r.description,budgetUsdtMicros:BigInt(r.budget_usdt_micros),deadline:new Date(r.deadline),arbiterAddress:r.arbiter_address,escrowJobId:r.escrow_job_id,escrowTxHash:r.escrow_tx_hash,state:r.state,createdAt:new Date(r.created_at)}; }
function applicationFrom(r: QueryResultRow): Application { return {id:r.id,jobId:r.job_id,applicantWallet:r.applicant_wallet,message:r.message,status:r.status,createdAt:new Date(r.created_at)}; }
function messageFrom(r: QueryResultRow): JobMessage { return {id:r.id,jobId:r.job_id,senderWallet:r.sender_wallet,body:r.body,createdAt:new Date(r.created_at)}; }
