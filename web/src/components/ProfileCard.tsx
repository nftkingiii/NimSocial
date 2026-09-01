import { BriefcaseBusiness, Check, MapPin, Plus } from "lucide-react";
import { Avatar } from "./Avatar";
import type { ProfessionalProfile } from "../types";

const availabilityLabel={open:"Open to work",busy:"Limited availability",not_open:"Not open"} as const;

export function ProfileCard({profile,onOpen,onFollow}:{profile:ProfessionalProfile;onOpen:()=>void;onFollow:()=>void}) {
  const name=profile.displayName??profile.walletAddress;
  return <article className="talent-card">
    <div className="talent-card__top">
      <button className="avatar-button" type="button" onClick={onOpen} aria-label={`Open ${name}'s profile`}><Avatar name={name}/></button>
      <button className={`follow-button ${profile.isFollowing?"is-following":""}`} type="button" onClick={onFollow} aria-label={profile.isFollowing?`Unfollow ${name}`:`Follow ${name}`}>{profile.isFollowing?<Check size={16}/>:<Plus size={16}/>}<span>{profile.isFollowing?"Following":"Follow"}</span></button>
    </div>
    <button className="talent-card__identity" type="button" onClick={onOpen}><strong>{name}</strong><span>{profile.professionalTitle}</span></button>
    <p>{profile.bio}</p>
    <div className="talent-card__meta"><span className={`availability availability--${profile.availability}`}><i/>{availabilityLabel[profile.availability]}</span>{profile.location&&<span><MapPin size={13}/>{profile.location}</span>}</div>
    <div className="tag-row">{profile.skills.slice(0,3).map((skill)=><span key={skill}>{skill}</span>)}</div>
    <footer><span><BriefcaseBusiness size={15}/>{profile.completedJobs??0} completed</span><strong>{profile.reputation.score??"New"}<small>{profile.reputation.score?" reputation":" profile"}</small></strong></footer>
  </article>;
}
