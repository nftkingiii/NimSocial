import { UserRound } from "lucide-react";

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function safeImageSource(src?: string | null) {
  if (!src) return null;
  return /^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(src) ? src : null;
}

export function Avatar({ name, src, size = "md" }: { name: string; src?: string | null; size?: "sm" | "md" | "lg" }) {
  const image = safeImageSource(src);
  return <span className={`avatar avatar--${size}`} aria-hidden="true">
    {image ? <img src={image} alt="" /> : <UserRound size={size === "lg" ? 30 : size === "md" ? 22 : 16} />}
  </span>;
}
