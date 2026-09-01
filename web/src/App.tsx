import { useCallback, useEffect, useRef, useState } from "react";
import type { NimiqProvider } from "@nimiq/mini-app-sdk";
import {
  Bell, BriefcaseBusiness, Check, ChevronRight, CircleHelp, Compass, Feather, Home,
  Menu, MessageCircle, Plus, Search, Settings, ShieldCheck, Sparkles, UserRound, WalletCards, X,
} from "lucide-react";
import { Brand } from "./components/Brand";
import { Avatar } from "./components/Avatar";
import { ComposeDialog } from "./components/ComposeDialog";
import { PostCard } from "./components/PostCard";
import { createPostIntent, fetchFeed, publishPost } from "./api";
import { previewPosts } from "./preview-data";
import type { AppSection, FeedPost, PostKind, WalletIdentity } from "./types";
import { connectAndAuthenticate, payPostIntent } from "./wallet";

const navItems: Array<{ id: AppSection; label: string; icon: typeof Home }> = [
  { id: "feed", label: "Feed", icon: Home },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "post", label: "Post", icon: Plus },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "profile", label: "Profile", icon: UserRound },
];

type Notice = { tone: "success" | "error" | "info"; message: string } | null;

export default function App() {
  const [section, setSection] = useState<AppSection>("feed");
  const [composeOpen, setComposeOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletIdentity | null>(null);
  const providerRef = useRef<NimiqProvider | null>(null);
  const [walletPending, setWalletPending] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>(previewPosts);
  const [feedSource, setFeedSource] = useState<"loading" | "live" | "preview" | "error">("loading");
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    fetchFeed()
      .then((items) => { if (items.length) { setPosts(items); setFeedSource("live"); } else { setFeedSource("preview"); } })
      .catch(() => setFeedSource("error"));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const connectWallet = useCallback(async () => {
    if (walletPending) return;
    setWalletPending(true);
    try {
      const connected = await connectAndAuthenticate();
      providerRef.current = connected.provider;
      setWallet(connected.identity);
      setNotice({ tone: "success", message: "Wallet connected. Your NimSocial session is ready." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Nimiq Pay could not connect." });
    } finally {
      setWalletPending(false);
    }
  }, [walletPending]);

  const handleNavigation = (next: AppSection) => {
    setMobileMenuOpen(false);
    if (next === "post") { setComposeOpen(true); return; }
    setSection(next);
  };

  const createPaidPost = async (input: { kind: PostKind; body: string; jobId?: string }) => {
    if (!providerRef.current) { await connectWallet(); return; }
    setPublishing(true);
    try {
      const intent = await createPostIntent(input);
      const txHash = await payPostIntent(providerRef.current, intent);
      const published = await publishPost(intent.post.id, txHash);
      setPosts((current) => [published, ...current.filter((post) => !post.preview)]);
      setFeedSource("live");
      setComposeOpen(false);
      setSection("feed");
      setNotice({ tone: "success", message: "Published. Your NIM payment and post reference are now linked." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "The post was not published." });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="mobile-header">
        <Brand />
        <div className="mobile-header__actions">
          <button className="icon-button" type="button" aria-label="Notifications"><Bell /></button>
          <button className="icon-button" type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="Open menu" aria-expanded={mobileMenuOpen}>{mobileMenuOpen ? <X /> : <Menu />}</button>
        </div>
      </header>

      <aside className={`sidebar ${mobileMenuOpen ? "sidebar--mobile-open" : ""}`}>
        <Brand />
        <nav className="primary-nav" aria-label="Primary">
          {navItems.filter((item) => item.id !== "post").map((item) => <NavButton key={item.id} item={item} active={section === item.id} onClick={() => handleNavigation(item.id)} />)}
        </nav>
        <button className="button button--primary sidebar__post" type="button" onClick={() => setComposeOpen(true)}><Feather size={19} /> Create post</button>
        <div className="sidebar__secondary">
          <button type="button"><CircleHelp size={19} /> How it works</button>
          <button type="button"><Settings size={19} /> Settings</button>
        </div>
        <WalletCard wallet={wallet} pending={walletPending} onConnect={connectWallet} />
      </aside>

      <main id="main-content" className="main-content">
        {section === "feed" && <FeedScreen posts={posts} source={feedSource} onCompose={() => setComposeOpen(true)} />}
        {section === "explore" && <ExploreScreen />}
        {section === "jobs" && <JobsScreen onCompose={() => setComposeOpen(true)} />}
        {section === "profile" && <ProfileScreen wallet={wallet} onConnect={connectWallet} />}
      </main>

      <aside className="right-rail" aria-label="Work overview">
        <RightRail onCompose={() => setComposeOpen(true)} />
      </aside>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = section === item.id && item.id !== "post";
          return <button key={item.id} className={`${active ? "is-active" : ""} ${item.id === "post" ? "bottom-nav__create" : ""}`} type="button" onClick={() => handleNavigation(item.id)} aria-current={active ? "page" : undefined}><Icon /><span>{item.label}</span></button>;
        })}
      </nav>

      <ComposeDialog open={composeOpen} connected={Boolean(wallet)} submitting={publishing || walletPending} onClose={() => setComposeOpen(false)} onConnect={connectWallet} onSubmit={createPaidPost} />
      {notice && <div className={`toast toast--${notice.tone}`} role="status"><span>{notice.tone === "success" ? <Check /> : notice.tone === "error" ? <X /> : <Sparkles />}</span>{notice.message}<button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification"><X /></button></div>}
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button className={active ? "is-active" : ""} type="button" onClick={onClick} aria-current={active ? "page" : undefined}><Icon size={20} /><span>{item.label}</span>{active && <span className="nav-indicator" />}</button>;
}

function WalletCard({ wallet, pending, onConnect }: { wallet: WalletIdentity | null; pending: boolean; onConnect: () => void }) {
  if (wallet) return <div className="wallet-card wallet-card--connected"><Avatar name={wallet.shortAddress} size="sm" /><div><span>Connected</span><strong>{wallet.shortAddress}</strong></div><span className="connection-dot" /></div>;
  return <div className="wallet-card"><div className="wallet-card__icon"><WalletCards size={20} /></div><div><strong>Your wallet, your work</strong><span>Sign in with Nimiq Pay</span></div><button type="button" onClick={onConnect} disabled={pending}>{pending ? "Waiting…" : "Connect"}</button></div>;
}

function FeedScreen({ posts, source, onCompose }: { posts: FeedPost[]; source: string; onCompose: () => void }) {
  return <>
    <header className="screen-header"><div><h1>Work worth following.</h1><p>Find real requests, useful people, and visible progress.</p></div><button className="icon-button screen-header__bell" type="button" aria-label="Notifications"><Bell /></button></header>
    <button className="composer-trigger" type="button" onClick={onCompose}><Avatar name="You" /><span>Share a request, service, or progress update…</span><span className="composer-trigger__action"><Plus size={18} /> Post</span></button>
    <div className="feed-controls"><div role="tablist" aria-label="Feed view"><button className="is-active" type="button" role="tab" aria-selected="true">For you</button><button type="button" role="tab" aria-selected="false">Following</button></div><button type="button"><Sparkles size={16} /> Relevant first</button></div>
    {source !== "live" && <div className={`preview-banner ${source === "error" ? "preview-banner--warning" : ""}`}><Sparkles size={17} /><span><strong>Product preview</strong> — illustrative posts are shown until the live feed has activity.</span></div>}
    <section className="feed-stack" aria-label="Posts">{posts.map((post) => <PostCard key={post.id} post={post} />)}</section>
  </>;
}

function ExploreScreen() {
  const people = [{name:"Kemi O.",role:"Smart contract engineer",tag:"8 proofs"},{name:"Noah B.",role:"Motion & product video",tag:"5 jobs"},{name:"Ari Labs",role:"Nimiq integrations",tag:"12 proofs"}];
  return <><header className="screen-header"><div><h1>Explore the network.</h1><p>Search by outcome, skill, or proof—not follower count.</p></div></header><label className="search-field"><Search size={20} /><span className="sr-only">Search NimSocial</span><input type="search" placeholder="Try “Nimiq developer” or “product video”" /></label><div className="preview-banner"><Sparkles size={17}/><span><strong>Discovery preview</strong> — signals and profiles below are illustrative until the public network has activity.</span></div><section className="section-block"><div className="section-heading"><div><span className="eyebrow">Preview signals</span><h2>Skills in motion</h2></div><button type="button">View all <ChevronRight size={16} /></button></div><div className="skill-grid"><article><span>01</span><strong>Nimiq integrations</strong><small>18 active requests</small></article><article><span>02</span><strong>Product motion</strong><small>12 active requests</small></article><article><span>03</span><strong>Brand systems</strong><small>9 active requests</small></article></div></section><section className="section-block"><div className="section-heading"><div><span className="eyebrow">Illustrative profiles</span><h2>People doing the work</h2></div></div><div className="people-list">{people.map((person)=><article key={person.name}><Avatar name={person.name}/><div><strong>{person.name}</strong><span>{person.role}</span></div><span>{person.tag}</span><button type="button">View</button></article>)}</div></section></>;
}

function JobsScreen({ onCompose }: { onCompose: () => void }) {
  return <><header className="screen-header"><div><h1>Clear work. Clear terms.</h1><p>Move from public request to private delivery without losing the evidence trail.</p></div><button className="button button--primary" type="button" onClick={onCompose}><Plus size={18}/> Post a job</button></header><div className="stage-strip" aria-label="Job workflow"><span className="is-active"><b>1</b> Request</span><span><b>2</b> Choose</span><span><b>3</b> Fund</span><span><b>4</b> Prove</span><span><b>5</b> Settle</span></div><section className="section-block"><div className="section-heading"><div><span className="eyebrow">Preview opportunity</span><h2>Open work</h2></div><button type="button">Filter <ChevronRight size={16}/></button></div><article className="job-card"><div className="job-card__top"><span className="kind kind--request">Open request</span><span>Posted 11m ago</span></div><h3>Motion designer for a wallet onboarding story</h3><p>Turn a five-step mobile onboarding flow into three clean scenes and a 40-second product story.</p><div className="tag-row"><span>Motion</span><span>Product video</span><span>Remote</span></div><footer><div><span>Budget</span><strong>350 USDT</strong></div><div><span>Deadline</span><strong>5 days</strong></div><button className="button button--dark" type="button">View details <ArrowRightIcon /></button></footer></article></section></>;
}

function ArrowRightIcon() { return <ChevronRight size={18}/>; }

function ProfileScreen({ wallet, onConnect }: { wallet: WalletIdentity | null; onConnect: () => void }) {
  return <><section className="profile-hero"><div className="profile-hero__pattern"/><Avatar name={wallet?.shortAddress ?? "NS"} size="lg"/><div className="profile-hero__identity"><h1>{wallet?.shortAddress ?? "Build a portable work story"}</h1><p>{wallet ? "Connected through Nimiq Pay" : "Connect a wallet to publish work, collect proof, and build an evidence-backed profile."}</p></div>{wallet ? <button className="button button--quiet" type="button">Edit profile</button> : <button className="button button--primary" type="button" onClick={onConnect}>Connect wallet</button>}</section><div className="profile-stats"><div><strong>—</strong><span>Completed jobs</span></div><div><strong>—</strong><span>Proof updates</span></div><div><strong>—</strong><span>Earned</span></div></div><section className="empty-state"><div><ShieldCheck size={28}/></div><h2>Your proof trail starts with the first job.</h2><p>Completed work and payment-backed updates will appear here with their evidence links.</p><button className="button button--dark" type="button">Explore open work</button></section></>;
}

function RightRail({ onCompose }: { onCompose: () => void }) {
  return <><div className="rail-header"><span>Work pulse</span><button className="icon-button" type="button" aria-label="Notifications"><Bell size={19}/><span className="notification-dot"/></button></div><section className="rail-card rail-card--pulse"><div className="rail-card__label"><span>Network preview</span><span className="live-pill"><i/> Active</span></div><strong>39</strong><p>requests and proof updates moving today</p><div className="mini-bars" aria-hidden="true">{[42,68,54,82,64,91,73,88,57,78,94,72].map((height,index)=><span key={index} style={{height:`${height}%`}}/>)}</div><small>Illustrative until live activity grows</small></section><section className="rail-card"><div className="section-heading"><div><span className="eyebrow">Popular skills</span><h2>What people need</h2></div></div><ol className="rank-list"><li><span>01</span><div><strong>Nimiq integrations</strong><small>18 requests</small></div><i>+12%</i></li><li><span>02</span><div><strong>Product motion</strong><small>12 requests</small></div><i>+8%</i></li><li><span>03</span><div><strong>Brand systems</strong><small>9 requests</small></div><i>+5%</i></li></ol></section><section className="rail-card rail-card--cta"><div><MessageCircle size={21}/></div><h2>Put useful work in motion.</h2><p>Post a clear request and let the right people find it.</p><button className="button button--dark" type="button" onClick={onCompose}>Create a request</button></section><footer className="rail-footer"><a href="#about">About</a><a href="#safety">Safety</a><a href="#terms">Terms</a><span>© 2026 NimSocial</span></footer></>;
}
