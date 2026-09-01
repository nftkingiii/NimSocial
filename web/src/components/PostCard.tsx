import { Bookmark, BriefcaseBusiness, CheckCircle2, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { Avatar } from "./Avatar";
import type { FeedPost, PostKind } from "../types";

const labels: Record<PostKind, string> = { request: "Work request", service: "Service", update: "Progress", proof: "Proof of work" };

function relativeTime(value: string | null) {
  if (!value) return "Just now";
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

export function PostCard({ post }: { post: FeedPost }) {
  const name = post.authorName ?? post.authorWallet;
  return (
    <article className="post-card">
      <header className="post-card__header">
        <Avatar name={name} />
        <div className="post-card__identity">
          <div><strong>{name}</strong>{post.kind === "proof" && <CheckCircle2 className="verified-icon" size={15} aria-label="Evidence attached" />}</div>
          <span>{post.authorRole ?? post.authorWallet} · {relativeTime(post.publishedAt)}</span>
        </div>
        <span className={`kind kind--${post.kind}`}>{labels[post.kind]}</span>
      </header>

      <p className="post-card__body">{post.body}</p>

      {(post.budget || post.proofLabel) && (
        <div className={`work-callout work-callout--${post.kind}`}>
          <BriefcaseBusiness size={18} />
          <div>
            <span>{post.proofLabel ? "Work checkpoint" : "Proposed budget"}</span>
            <strong>{post.proofLabel ?? post.budget}</strong>
          </div>
          {post.jobId && <button type="button">View job</button>}
        </div>
      )}

      {post.skills && <div className="tag-row">{post.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>}

      <footer className="post-card__footer">
        <div className="engagement" aria-label="Post actions">
          <button type="button" aria-label="Comment"><MessageCircle size={18} />{post.preview && <span>{post.kind === "request" ? "8" : "3"}</span>}</button>
          <button type="button" aria-label="Repost"><Repeat2 size={18} />{post.preview && <span>{post.kind === "proof" ? "5" : "2"}</span>}</button>
          <button type="button" aria-label="Appreciate"><Heart size={18} />{post.preview && <span>{post.kind === "service" ? "24" : "12"}</span>}</button>
        </div>
        <div className="proof-meta">
          <span className="proof-dot" />
          <span>{Number(post.requiredLuna) / 100_000} NIM published</span>
          <button type="button" aria-label="Save post"><Bookmark size={18} /></button>
        </div>
      </footer>
    </article>
  );
}
