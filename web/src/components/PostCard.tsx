import { useState } from "react";
import { Bookmark, BriefcaseBusiness, Check, CheckCircle2, Heart, MessageCircle, Repeat2, Send } from "lucide-react";
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

type Action = "comment" | "repost" | "appreciate" | "save";

export function PostCard({ post, onOpenProfile, onViewJob, onAction }: { post: FeedPost; onOpenProfile?: (walletAddress:string)=>void; onViewJob?: (jobId:string)=>void; onAction?: (action:Action, post:FeedPost, detail?:string)=>void }) {
  const name = post.authorName ?? post.authorWallet;
  const [commenting,setCommenting]=useState(false);
  const [comment,setComment]=useState("");
  const [commentCount,setCommentCount]=useState(post.preview ? post.kind === "request" ? 8 : 3 : 0);
  const [reposted,setReposted]=useState(false);
  const [appreciated,setAppreciated]=useState(false);
  const [saved,setSaved]=useState(false);
  const repostBase=post.preview ? post.kind === "proof" ? 5 : 2 : 0;
  const appreciationBase=post.preview ? post.kind === "service" ? 24 : 12 : 0;
  const toggle=(action:Exclude<Action,"comment">,active:boolean,setActive:(value:boolean)=>void)=>{setActive(!active);onAction?.(action,post);};
  const submitComment=(event:React.FormEvent)=>{event.preventDefault();const value=comment.trim();if(!value)return;setCommentCount((count)=>count+1);setComment("");setCommenting(false);onAction?.("comment",post,value);};
  return (
    <article className="post-card">
      <header className="post-card__header">
        <button className="avatar-button" type="button" onClick={()=>onOpenProfile?.(post.authorWallet)} aria-label={`Open ${name}'s profile`}><Avatar name={name} /></button>
        <button className="post-card__identity" type="button" onClick={()=>onOpenProfile?.(post.authorWallet)}>
          <div><strong>{name}</strong>{post.kind === "proof" && <CheckCircle2 className="verified-icon" size={15} aria-label="Evidence attached" />}</div>
          <span>{post.authorRole ?? post.authorWallet} · {relativeTime(post.publishedAt)}</span>
        </button>
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
          {post.jobId && <button type="button" onClick={()=>onViewJob?.(post.jobId!)}>View job</button>}
        </div>
      )}

      {post.skills && <div className="tag-row">{post.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>}

      <footer className="post-card__footer">
        <div className="engagement" aria-label="Post actions">
          <button className={commenting?"is-active":""} type="button" aria-label="Comment" aria-expanded={commenting} onClick={()=>setCommenting((open)=>!open)}><MessageCircle size={18} /><span>{commentCount}</span></button>
          <button className={reposted?"is-active":""} type="button" aria-label={reposted?"Undo repost":"Repost"} aria-pressed={reposted} onClick={()=>toggle("repost",reposted,setReposted)}><Repeat2 size={18} /><span>{repostBase+(reposted?1:0)}</span></button>
          <button className={appreciated?"is-active is-appreciated":""} type="button" aria-label={appreciated?"Remove appreciation":"Appreciate"} aria-pressed={appreciated} onClick={()=>toggle("appreciate",appreciated,setAppreciated)}><Heart size={18} /><span>{appreciationBase+(appreciated?1:0)}</span></button>
        </div>
        <div className="proof-meta">
          <span className="proof-dot" />
          <span>{Number(post.requiredLuna) / 100_000} NIM published</span>
          <button className={saved?"is-active":""} type="button" aria-label={saved?"Remove saved post":"Save post"} aria-pressed={saved} onClick={()=>toggle("save",saved,setSaved)}>{saved?<Check size={18}/>:<Bookmark size={18}/>}</button>
        </div>
      </footer>
      {commenting&&<form className="comment-composer" onSubmit={submitComment}><label><span className="sr-only">Write a comment</span><input autoFocus value={comment} onChange={(event)=>setComment(event.target.value)} maxLength={280} placeholder="Add a useful comment…" /></label><button type="submit" disabled={!comment.trim()} aria-label="Post comment"><Send size={17}/></button></form>}
    </article>
  );
}
