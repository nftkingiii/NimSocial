import { useCallback, useEffect, useRef, useState } from "react";
import type { NimiqProvider } from "@nimiq/mini-app-sdk";
import {
  Award,
  Bell,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Compass,
  Feather,
  Grid2X2,
  Home,
  MapPin,
  Menu,
  MessageCircle,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Send,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { Brand } from "./components/Brand";
import { Avatar } from "./components/Avatar";
import { ComposeDialog } from "./components/ComposeDialog";
import { OnboardingDialog } from "./components/OnboardingDialog";
import { PostCard } from "./components/PostCard";
import { ProfileCard } from "./components/ProfileCard";
import {
  createConversation,
  createPostReply,
  createPostIntent,
  fetchConversations,
  fetchDirectMessages,
  fetchFeed,
  fetchMyProfile,
  fetchProfile,
  fetchProfilePosts,
  fetchProfiles,
  fetchPostReplies,
  publishPost,
  saveMyProfile,
  sendDirectMessage,
  setPostEngagement,
  setProfileFollow,
} from "./api";
import { previewPosts, previewProfiles } from "./preview-data";
import type {
  AppSection,
  Conversation,
  DirectMessage,
  FeedPost,
  PostKind,
  PostReply,
  ProfessionalProfile,
  ProfileInput,
  WalletIdentity,
} from "./types";
import { connectAndAuthenticate, payPostIntent } from "./wallet";

const navItems: Array<{ id: AppSection; label: string; icon: typeof Home }> = [
  { id: "feed", label: "Feed", icon: Home },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "post", label: "Post", icon: Plus },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "profile", label: "Profile", icon: UserRound },
];
type Notice = { tone: "success" | "error" | "info"; message: string } | null;

export default function App() {
  const [section, setSection] = useState<AppSection>("feed");
  const [composeOpen, setComposeOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [wallet, setWallet] = useState<WalletIdentity | null>(null);
  const providerRef = useRef<NimiqProvider | null>(null);
  const [walletPending, setWalletPending] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>(previewPosts);
  const [feedSource, setFeedSource] = useState<
    "loading" | "live" | "preview" | "error"
  >("loading");
  const [profiles, setProfiles] =
    useState<ProfessionalProfile[]>(previewProfiles);
  const [profileSource, setProfileSource] = useState<"live" | "preview">(
    "preview",
  );
  const [activeProfile, setActiveProfile] =
    useState<ProfessionalProfile | null>(null);
  const [profilePosts, setProfilePosts] = useState<FeedPost[]>([]);
  const [activePost, setActivePost] = useState<FeedPost | null>(null);
  const [replies, setReplies] = useState<Record<string, PostReply[]>>({});
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [directMessages, setDirectMessages] = useState<
    Record<string, DirectMessage[]>
  >({});
  const [notice, setNotice] = useState<Notice>(null);
  const feedScrollPosition = useRef(0);

  useEffect(() => {
    fetchFeed()
      .then((items) => {
        if (items.length) {
          setPosts(items);
          setFeedSource("live");
        } else setFeedSource("preview");
      })
      .catch(() => setFeedSource("error"));
    fetchProfiles()
      .then((items) => {
        if (items.length) {
          setProfiles(items);
          setProfileSource("live");
        }
      })
      .catch(() => undefined);
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
      const profile = await fetchMyProfile();
      const inbox = await fetchConversations();
      setConversations(inbox);
      setActiveProfile(profile);
      if (!profile.onboardingCompletedAt) setOnboardingOpen(true);
      setNotice({
        tone: "success",
        message: "Wallet connected. Your NimSocial session is ready.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Nimiq Pay could not connect.",
      });
    } finally {
      setWalletPending(false);
    }
  }, [walletPending]);

  const handleNavigation = (next: AppSection) => {
    setMobileMenuOpen(false);
    if (next === "feed" && section === "feed") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (next === "post") {
      setComposeOpen(true);
      return;
    }
    if (next === "profile") {
      const mine = wallet
        ? (profiles.find(
            (profile) => profile.walletAddress === wallet.address,
          ) ?? activeProfile)
        : null;
      setActiveProfile(mine);
      setProfilePosts(
        mine
          ? posts.filter((post) => post.authorWallet === mine.walletAddress)
          : [],
      );
    }
    setSection(next);
  };

  const openThread = async (post: FeedPost) => {
    feedScrollPosition.current = window.scrollY;
    setActivePost(post);
    setSection("thread");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!post.preview && !replies[post.id]) {
      try {
        const items = await fetchPostReplies(post.id);
        setReplies((current) => ({ ...current, [post.id]: items }));
      } catch (error) {
        setNotice({
          tone: "error",
          message:
            error instanceof Error
              ? error.message
              : "Replies could not be loaded.",
        });
      }
    }
  };
  const closeThread = () => {
    setSection("feed");
    window.requestAnimationFrame(() =>
      window.scrollTo({ top: feedScrollPosition.current, behavior: "instant" }),
    );
  };
  const updatePost = (postId: string, engagement: FeedPost["engagement"]) => {
    setPosts((items) =>
      items.map((item) =>
        item.id === postId ? { ...item, engagement } : item,
      ),
    );
    setActivePost((item) =>
      item?.id === postId ? { ...item, engagement } : item,
    );
  };
  const addReply = async (post: FeedPost, body: string) => {
    if (!post.preview && !wallet) {
      setNotice({ tone: "info", message: "Connect Nimiq Pay to reply." });
      return;
    }
    const optimistic: PostReply = {
      id: crypto.randomUUID(),
      postId: post.id,
      authorWallet: wallet?.address ?? "PREVIEW-YOU",
      authorName: wallet?.shortAddress ?? "You",
      authorRole: wallet ? "Nimiq member" : "Preview member",
      body,
      createdAt: new Date().toISOString(),
      preview: post.preview,
    };
    setReplies((current) => ({
      ...current,
      [post.id]: [...(current[post.id] ?? []), optimistic],
    }));
    updatePost(post.id, {
      ...post.engagement,
      replies: post.engagement.replies + 1,
    });
    if (post.preview) return;
    try {
      const result = await createPostReply(post.id, body);
      setReplies((current) => ({
        ...current,
        [post.id]: (current[post.id] ?? []).map((item) =>
          item.id === optimistic.id ? result.reply : item,
        ),
      }));
      updatePost(post.id, result.engagement);
    } catch (error) {
      setReplies((current) => ({
        ...current,
        [post.id]: (current[post.id] ?? []).filter(
          (item) => item.id !== optimistic.id,
        ),
      }));
      updatePost(post.id, post.engagement);
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Reply not sent.",
      });
    }
  };

  const handlePostAction = async (
    action: "comment" | "repost" | "appreciate" | "save",
    post: FeedPost,
    detail?: string,
  ) => {
    if (action === "comment" && detail) {
      await addReply(post, detail);
      return;
    }
    if (action === "comment") return;
    if (!post.preview && !wallet) {
      setNotice({
        tone: "info",
        message: "Connect Nimiq Pay to save this interaction.",
      });
      return;
    }
    const type = action === "save" ? "bookmark" : action;
    const viewerKey =
      type === "repost"
        ? "reposted"
        : type === "appreciate"
          ? "appreciated"
          : "bookmarked";
    const countKey =
      type === "repost"
        ? "reposts"
        : type === "appreciate"
          ? "appreciations"
          : "bookmarks";
    const active = !post.engagement.viewer[viewerKey];
    const optimistic = {
      ...post.engagement,
      [countKey]: Math.max(0, post.engagement[countKey] + (active ? 1 : -1)),
      viewer: { ...post.engagement.viewer, [viewerKey]: active },
    };
    updatePost(post.id, optimistic);
    if (post.preview) return;
    try {
      updatePost(post.id, await setPostEngagement(post.id, type, active));
    } catch (error) {
      updatePost(post.id, post.engagement);
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Interaction could not be saved.",
      });
    }
  };

  const createPaidPost = async (input: {
    kind: PostKind;
    body: string;
    jobId?: string;
  }) => {
    if (!providerRef.current) {
      await connectWallet();
      return;
    }
    setPublishing(true);
    try {
      const intent = await createPostIntent(input);
      const txHash = await payPostIntent(providerRef.current, intent);
      const published = await publishPost(intent.post.id, txHash);
      setPosts((current) => [
        published,
        ...current.filter((post) => !post.preview),
      ]);
      setFeedSource("live");
      setComposeOpen(false);
      setSection("feed");
      setNotice({
        tone: "success",
        message:
          "Published. Your NIM payment and post reference are now linked.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The post was not published.",
      });
    } finally {
      setPublishing(false);
    }
  };

  const openProfile = async (walletAddress: string) => {
    const known = profiles.find(
      (profile) => profile.walletAddress === walletAddress,
    );
    setSection("profile");
    setActiveProfile(known ?? null);
    setProfilePosts(
      posts.filter((post) => post.authorWallet === walletAddress),
    );
    if (known?.preview) return;
    try {
      const [profile, items] = await Promise.all([
        fetchProfile(walletAddress),
        fetchProfilePosts(walletAddress),
      ]);
      setActiveProfile(profile);
      setProfilePosts(items);
    } catch {
      if (!known)
        setNotice({
          tone: "error",
          message: "That profile is not available yet.",
        });
    }
  };

  const toggleFollow = async (profile: ProfessionalProfile) => {
    const next = !profile.isFollowing;
    const update = (item: ProfessionalProfile) =>
      item.walletAddress === profile.walletAddress
        ? {
            ...item,
            isFollowing: next,
            followers: Math.max(0, item.followers + (next ? 1 : -1)),
          }
        : item;
    setProfiles((current) => current.map(update));
    setActiveProfile((current) => (current ? update(current) : current));
    if (wallet && !profile.preview) {
      try {
        await setProfileFollow(profile.walletAddress, next);
      } catch {
        setProfiles((current) =>
          current.map((item) =>
            item.walletAddress === profile.walletAddress ? profile : item,
          ),
        );
        setActiveProfile(profile);
        setNotice({
          tone: "error",
          message: "The follow change could not be saved.",
        });
        return;
      }
    } else
      setNotice({
        tone: "info",
        message: wallet
          ? "Preview profile follow is shown locally."
          : "Preview follow shown locally. Connect to save follows.",
      });
  };

  const completeOnboarding = async (input: ProfileInput) => {
    setSavingProfile(true);
    try {
      let profile: ProfessionalProfile;
      if (wallet) profile = await saveMyProfile(input);
      else
        profile = {
          walletAddress: "PREVIEW-YOU",
          ...input,
          onboardingCompletedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          followers: 0,
          following: 0,
          isFollowing: false,
          reputation: {
            score: null,
            reviewCount: 0,
            confidence: 0,
            dimensions: {
              quality: null,
              delivery: null,
              communication: null,
              reliability: null,
            },
            credentialTxHash: null,
          },
          preview: true,
          completedJobs: 0,
          earned: "0 USDT",
          workSamples: [],
        };
      setProfiles((current) => [
        profile,
        ...current.filter(
          (item) => item.walletAddress !== profile.walletAddress,
        ),
      ]);
      setActiveProfile(profile);
      setOnboardingOpen(false);
      setSection("profile");
      setNotice({
        tone: "success",
        message: wallet
          ? "Profile saved. Your feed can now adapt to your goals."
          : "Onboarding preview complete. Connect a wallet to save it.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Your profile could not be saved.",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const openConversation = async (conversation: Conversation) => {
    setActiveConversationId(conversation.id);
    setSection("messages");
    if (conversation.preview || directMessages[conversation.id]) return;
    try {
      setDirectMessages((current) => ({ ...current, [conversation.id]: [] }));
      const items = await fetchDirectMessages(conversation.id);
      setDirectMessages((current) => ({
        ...current,
        [conversation.id]: items,
      }));
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The conversation could not be opened.",
      });
    }
  };

  const startConversation = async (
    participantWallet: string,
    post?: FeedPost,
    opening?: string,
  ) => {
    if (post?.preview) {
      const id = `preview-${post.id}`;
      const existing = conversations.find((item) => item.id === id);
      const conversation = existing ?? {
        id,
        participantWallet,
        contextPostId: post.id,
        createdAt: new Date().toISOString(),
        lastMessage: null,
        preview: true,
      };
      if (!existing) setConversations((items) => [conversation, ...items]);
      if (opening)
        setDirectMessages((current) => ({
          ...current,
          [id]: [
            ...(current[id] ?? []),
            {
              id: crypto.randomUUID(),
              conversationId: id,
              senderWallet: "PREVIEW-YOU",
              body: opening,
              createdAt: new Date().toISOString(),
              preview: true,
            },
          ],
        }));
      await openConversation(conversation);
      setNotice({
        tone: "info",
        message:
          "Preview conversation opened. Connect a wallet to message a live profile.",
      });
      return;
    }
    if (!wallet) {
      setNotice({
        tone: "info",
        message: "Connect Nimiq Pay before starting a private conversation.",
      });
      return;
    }
    try {
      const conversation = await createConversation(
        participantWallet,
        post?.id,
      );
      setConversations((items) => [
        conversation,
        ...items.filter((item) => item.id !== conversation.id),
      ]);
      if (opening) {
        const message = await sendDirectMessage(conversation.id, opening);
        setDirectMessages((current) => ({
          ...current,
          [conversation.id]: [...(current[conversation.id] ?? []), message],
        }));
      }
      await openConversation(conversation);
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The conversation could not be started.",
      });
    }
  };

  const sendMessage = async (conversation: Conversation, body: string) => {
    try {
      const message = conversation.preview
        ? {
            id: crypto.randomUUID(),
            conversationId: conversation.id,
            senderWallet: "PREVIEW-YOU",
            body,
            createdAt: new Date().toISOString(),
            preview: true,
          }
        : await sendDirectMessage(conversation.id, body);
      setDirectMessages((current) => ({
        ...current,
        [conversation.id]: [...(current[conversation.id] ?? []), message],
      }));
      setConversations((items) =>
        items.map((item) =>
          item.id === conversation.id
            ? { ...item, lastMessage: message }
            : item,
        ),
      );
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Message not sent.",
      });
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="mobile-header">
        <Brand />
        <div className="mobile-header__actions">
          <button
            className="icon-button"
            type="button"
            aria-label="Notifications"
            onClick={() => handleNavigation("notifications")}
          >
            <Bell />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <aside
        className={`sidebar ${mobileMenuOpen ? "sidebar--mobile-open" : ""}`}
      >
        <Brand />
        <nav className="primary-nav" aria-label="Primary">
          {navItems
            .filter((item) => item.id !== "post")
            .map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={section === item.id}
                onClick={() => handleNavigation(item.id)}
              />
            ))}
        </nav>
        <button
          className="button button--primary sidebar__post"
          type="button"
          onClick={() => setComposeOpen(true)}
        >
          <Feather size={19} />
          Create post
        </button>
        <div className="sidebar__secondary">
          <button
            type="button"
            onClick={() =>
              setNotice({
                tone: "info",
                message:
                  "Publish work, agree terms, fund escrow, share proof, then settle and review.",
              })
            }
          >
            <CircleHelp size={19} />
            How it works
          </button>
          <button
            type="button"
            onClick={() =>
              setNotice({
                tone: "info",
                message: "Profile and notification preferences will live here.",
              })
            }
          >
            <Settings size={19} />
            Settings
          </button>
        </div>
        <WalletCard
          wallet={wallet}
          pending={walletPending}
          onConnect={connectWallet}
        />
      </aside>
      <main id="main-content" className="main-content">
        {section === "feed" && (
          <FeedScreen
            posts={posts}
            source={feedSource}
            onCompose={() => setComposeOpen(true)}
            onOpenProfile={openProfile}
            onOpenThread={openThread}
            onAction={handlePostAction}
            onViewJob={(jobId) => {
              setSection("jobs");
              setNotice({
                tone: "info",
                message: `Opened ${jobId.replaceAll("_", " ")}.`,
              });
            }}
          />
        )}
        {section === "thread" && activePost && (
          <ThreadScreen
            post={activePost}
            replies={replies[activePost.id] ?? []}
            onBack={closeThread}
            onOpenProfile={openProfile}
            onViewJob={(jobId) => {
              setSection("jobs");
              setNotice({
                tone: "info",
                message: `Opened ${jobId.replaceAll("_", " ")}.`,
              });
            }}
            onReply={(body) => addReply(activePost, body)}
            onAction={handlePostAction}
            onMessage={(opening) =>
              startConversation(activePost.authorWallet, activePost, opening)
            }
            onNotice={setNotice}
          />
        )}
        {section === "explore" && (
          <ExploreScreen
            profiles={profiles}
            source={profileSource}
            onOpenProfile={openProfile}
            onFollow={toggleFollow}
          />
        )}
        {section === "jobs" && (
          <JobsScreen
            onCompose={() => setComposeOpen(true)}
            onNotice={setNotice}
          />
        )}
        {section === "messages" && (
          <MessagesScreen
            conversations={conversations}
            activeId={activeConversationId}
            messages={directMessages}
            posts={posts}
            profiles={profiles}
            wallet={wallet}
            onOpen={openConversation}
            onBack={() => setActiveConversationId(null)}
            onSend={sendMessage}
            onConnect={connectWallet}
          />
        )}
        {section === "wallet" && (
          <WalletScreen
            wallet={wallet}
            pending={walletPending}
            onConnect={connectWallet}
            onProfile={() => handleNavigation("profile")}
            onCompose={() => setComposeOpen(true)}
          />
        )}
        {section === "notifications" && (
          <NotificationsScreen onNotice={setNotice} />
        )}
        {section === "profile" && (
          <ProfileScreen
            profile={activeProfile}
            posts={profilePosts}
            wallet={wallet}
            onConnect={connectWallet}
            onOnboard={() => setOnboardingOpen(true)}
            onExplore={() => setSection("explore")}
            onFollow={toggleFollow}
            onMessage={(profile) => startConversation(profile.walletAddress)}
          />
        )}
      </main>
      <aside className="right-rail" aria-label="Work overview">
        <RightRail
          profiles={profiles}
          onOpenProfile={openProfile}
          onFollow={toggleFollow}
        />
      </aside>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        <MobileNavButton
          label="Home"
          active={section === "feed"}
          onClick={() => handleNavigation("feed")}
        >
          <Home />
        </MobileNavButton>
        <MobileNavButton
          label="Search"
          active={section === "explore"}
          onClick={() => handleNavigation("explore")}
        >
          <Search />
        </MobileNavButton>
        <MobileNavButton
          label="Work"
          active={section === "jobs"}
          onClick={() => handleNavigation("jobs")}
        >
          <Grid2X2 />
        </MobileNavButton>
        <MobileNavButton
          label="Messages"
          active={section === "messages"}
          onClick={() => handleNavigation("messages")}
        >
          <MessageSquare />
        </MobileNavButton>
        <MobileNavButton
          label="Wallet"
          active={section === "wallet"}
          onClick={() => handleNavigation("wallet")}
        >
          <WalletCards />
        </MobileNavButton>
        <MobileNavButton
          label="Profile"
          active={section === "profile"}
          badge="1"
          onClick={() => handleNavigation("profile")}
        >
          <UserRound />
        </MobileNavButton>
      </nav>
      <ComposeDialog
        open={composeOpen}
        connected={Boolean(wallet)}
        submitting={publishing || walletPending}
        onClose={() => setComposeOpen(false)}
        onConnect={connectWallet}
        onSubmit={createPaidPost}
      />
      <OnboardingDialog
        open={onboardingOpen}
        saving={savingProfile}
        onClose={() => setOnboardingOpen(false)}
        onSubmit={completeOnboarding}
      />
      {notice && (
        <div className={`toast toast--${notice.tone}`} role="status">
          <span>
            {notice.tone === "success" ? (
              <Check />
            ) : notice.tone === "error" ? (
              <X />
            ) : (
              <Sparkles />
            )}
          </span>
          {notice.message}
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
          >
            <X />
          </button>
        </div>
      )}
    </div>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: (typeof navItems)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      className={active ? "is-active" : ""}
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={20} />
      <span>{item.label}</span>
      {active && <span className="nav-indicator" />}
    </button>
  );
}
function MobileNavButton({
  label,
  active,
  badge,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  badge?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={active ? "is-active" : ""}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      {children}
      {badge && <span className="bottom-nav__badge">{badge}</span>}
    </button>
  );
}
function WalletCard({
  wallet,
  pending,
  onConnect,
}: {
  wallet: WalletIdentity | null;
  pending: boolean;
  onConnect: () => void;
}) {
  if (wallet)
    return (
      <div className="wallet-card wallet-card--connected">
        <Avatar name={wallet.shortAddress} size="sm" />
        <div>
          <span>Connected</span>
          <strong>{wallet.shortAddress}</strong>
        </div>
        <span className="connection-dot" />
      </div>
    );
  return (
    <div className="wallet-card">
      <div className="wallet-card__icon">
        <WalletCards size={20} />
      </div>
      <div>
        <strong>Your wallet, your work</strong>
        <span>Sign in with Nimiq Pay</span>
      </div>
      <button type="button" onClick={onConnect} disabled={pending}>
        {pending ? "Waiting…" : "Connect"}
      </button>
    </div>
  );
}

function FeedScreen({
  posts,
  source,
  onCompose,
  onOpenProfile,
  onOpenThread,
  onViewJob,
  onAction,
}: {
  posts: FeedPost[];
  source: string;
  onCompose: () => void;
  onOpenProfile: (wallet: string) => void;
  onOpenThread: (post: FeedPost) => void;
  onViewJob: (jobId: string) => void;
  onAction: (
    action: "comment" | "repost" | "appreciate" | "save",
    post: FeedPost,
    detail?: string,
  ) => void;
}) {
  const [tab, setTab] = useState<"home" | "following" | PostKind>(() => {
    const saved = window.sessionStorage.getItem("nimsocial-feed-tab");
    return saved === "following" ||
      saved === "request" ||
      saved === "service" ||
      saved === "proof"
      ? saved
      : "home";
  });
  const selectTab = (value: typeof tab) => {
    setTab(value);
    window.sessionStorage.setItem("nimsocial-feed-tab", value);
  };
  const [relevant, setRelevant] = useState(true);
  const filtered =
    tab === "home" || tab === "following"
      ? posts
      : posts.filter((post) => post.kind === tab);
  const visible = relevant ? filtered : [...filtered].reverse();
  return (
    <section className="feed-screen">
      <header className="screen-header">
        <div>
          <h1>Work worth following.</h1>
          <p>Find real requests, useful people, and visible progress.</p>
        </div>
        <button
          className="icon-button screen-header__bell"
          type="button"
          aria-label="Notifications"
        >
          <Bell />
        </button>
      </header>
      <button className="composer-trigger" type="button" onClick={onCompose}>
        <Avatar name="You" />
        <span>Share a request, service, or progress update…</span>
        <span className="composer-trigger__action">
          <Plus size={18} />
          Post
        </span>
      </button>
      <div className="feed-controls">
        <div role="tablist" aria-label="Feed view">
          {[
            ["home", "Home"],
            ["following", "Following"],
            ["request", "Requests"],
            ["service", "Services"],
            ["proof", "Proof"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? "is-active" : ""}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => selectTab(value as typeof tab)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={relevant}
          onClick={() => setRelevant((value) => !value)}
        >
          <Sparkles size={16} />
          {relevant ? "Relevant first" : "Latest first"}
        </button>
      </div>
      {source !== "live" && source !== "loading" && (
        <div
          className={`preview-banner ${source === "error" ? "preview-banner--warning" : ""}`}
        >
          <Sparkles size={17} />
          <span>
            <strong>Product preview</strong> — illustrative posts are shown
            until the live feed has activity.
          </span>
        </div>
      )}
      <section
        className="feed-stack"
        aria-label="Posts"
        aria-busy={source === "loading"}
      >
        {source === "loading"
          ? [0, 1, 2].map((item) => (
              <div className="post-skeleton" key={item} aria-hidden="true">
                <span />
                <div>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            ))
          : visible.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onOpenProfile={onOpenProfile}
                onOpenThread={onOpenThread}
                onViewJob={onViewJob}
                onAction={onAction}
              />
            ))}
      </section>
    </section>
  );
}

function ThreadScreen({
  post,
  replies,
  onBack,
  onOpenProfile,
  onViewJob,
  onReply,
  onMessage,
  onAction,
  onNotice,
}: {
  post: FeedPost;
  replies: PostReply[];
  onBack: () => void;
  onOpenProfile: (wallet: string) => void;
  onViewJob: (jobId: string) => void;
  onReply: (body: string) => void;
  onMessage: (opening?: string) => void;
  onAction: (
    action: "comment" | "repost" | "appreciate" | "save",
    post: FeedPost,
    detail?: string,
  ) => void;
  onNotice: (notice: Notice) => void;
}) {
  const [body, setBody] = useState("");
  const starterReplies: PostReply[] = post.preview
    ? [
        {
          id: `${post.id}-r1`,
          postId: post.id,
          authorWallet: "NQ-PREVIEW-KOFI",
          authorName: "Kofi Mensah",
          authorRole: "Nimiq developer",
          body: "The scope is clear. Is the handoff expected in Figma or as production-ready components?",
          createdAt: new Date(Date.now() - 42 * 60_000).toISOString(),
          preview: true,
        },
        {
          id: `${post.id}-r2`,
          postId: post.id,
          authorWallet: "NQ-PREVIEW-LINA",
          authorName: "Lina Okafor",
          authorRole: "Product designer",
          body: "I’d structure the first milestone around the wallet connection and paid-post confirmation states.",
          createdAt: new Date(Date.now() - 18 * 60_000).toISOString(),
          preview: true,
        },
      ]
    : [];
  const visible = [...starterReplies, ...replies];
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = body.trim();
    if (!value) return;
    onReply(value);
    setBody("");
  };
  return (
    <section className="thread-screen">
      <header className="thread-header">
        <button type="button" onClick={onBack} aria-label="Back to feed">
          <ChevronLeft />
        </button>
        <div>
          <strong>Post</strong>
          <span>
            {visible.length} {visible.length === 1 ? "reply" : "replies"}
          </span>
        </div>
      </header>
      <PostCard
        post={post}
        detail
        commentCount={visible.length}
        onOpenProfile={onOpenProfile}
        onViewJob={onViewJob}
        onAction={onAction}
      />
      {post.kind === "request" && (
        <div className="work-actions">
          <div>
            <strong>Interested in this work?</strong>
            <span>Start privately with the request attached.</span>
          </div>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => onMessage()}
          >
            <MessageSquare size={17} /> Message
          </button>
          <button
            className="button button--primary"
            type="button"
            onClick={() =>
              onMessage(
                "I’m interested in this request. Can we discuss the scope and next step?",
              )
            }
          >
            <Send size={17} /> I’m interested
          </button>
        </div>
      )}
      <form className="thread-composer" onSubmit={submit}>
        <Avatar name="You" />
        <label>
          <span className="sr-only">Post your reply</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={500}
            placeholder="Post your reply"
            rows={2}
          />
        </label>
        <button type="submit" disabled={!body.trim()}>
          <Send size={17} />
          Reply
        </button>
      </form>
      <div className="thread-divider">
        <span>Replies</span>
        {post.preview && <small>Preview conversation</small>}
      </div>
      <section className="reply-list" aria-label="Replies">
        {visible.map((reply) => (
          <article className="reply-card" key={reply.id}>
            <Avatar name={reply.authorName ?? reply.authorWallet} />
            <div>
              <header>
                <strong>
                  {reply.authorName ?? reply.authorWallet.slice(0, 14)}
                </strong>
                <span>
                  {reply.authorRole ?? "Nimiq member"} ·{" "}
                  {new Intl.RelativeTimeFormat("en", {
                    numeric: "auto",
                  }).format(
                    -Math.max(
                      1,
                      Math.round(
                        (Date.now() - new Date(reply.createdAt).getTime()) /
                          60_000,
                      ),
                    ),
                    "minute",
                  )}
                </span>
              </header>
              <p>{reply.body}</p>
              <button
                type="button"
                onClick={() =>
                  onNotice({
                    tone: "info",
                    message: `Replying to ${reply.authorName ?? reply.authorWallet.slice(0, 14)}.`,
                  })
                }
              >
                <MessageCircle size={16} />
                Reply
              </button>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}

function ExploreScreen({
  profiles,
  source,
  onOpenProfile,
  onFollow,
}: {
  profiles: ProfessionalProfile[];
  source: string;
  onOpenProfile: (wallet: string) => void;
  onFollow: (profile: ProfessionalProfile) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "worker" | "client">(
    "all",
  );
  const needle = query.toLowerCase();
  const visible = profiles.filter(
    (profile) =>
      (filter === "all" ||
        (filter === "open" && profile.availability === "open") ||
        (filter === "worker" &&
          (profile.profileRole === "worker" ||
            profile.profileRole === "both")) ||
        (filter === "client" &&
          (profile.profileRole === "client" ||
            profile.profileRole === "both"))) &&
      (!needle ||
        [
          profile.displayName,
          profile.professionalTitle,
          profile.location,
          ...profile.skills,
        ].some((value) => value?.toLowerCase().includes(needle))),
  );
  return (
    <>
      <header className="screen-header">
        <div>
          <h1>Find people in motion.</h1>
          <p>
            Discover professionals through availability, relevant skills, and
            evidence from completed work.
          </p>
        </div>
      </header>
      <label className="search-field">
        <Search size={20} />
        <span className="sr-only">Search profiles</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try “Nimiq developer” or “product video”"
        />
      </label>
      <div className="filter-row" aria-label="Profile filters">
        {[
          ["all", "All profiles"],
          ["open", "Open to work"],
          ["worker", "Professionals"],
          ["client", "Hiring"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? "is-active" : ""}
            type="button"
            onClick={() => setFilter(value as typeof filter)}
          >
            {label}
          </button>
        ))}
      </div>
      {source !== "live" && (
        <div className="preview-banner">
          <Sparkles size={17} />
          <span>
            <strong>Discovery preview</strong> — these profiles demonstrate the
            information architecture until people onboard.
          </span>
        </div>
      )}
      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Active profiles</span>
            <h2>{visible.length} people match</h2>
          </div>
        </div>
        <div className="talent-grid">
          {visible.map((profile) => (
            <ProfileCard
              key={profile.walletAddress}
              profile={profile}
              onOpen={() => onOpenProfile(profile.walletAddress)}
              onFollow={() => onFollow(profile)}
            />
          ))}
        </div>
        {!visible.length && (
          <div className="compact-empty">
            <Search />
            <strong>No profile matches yet.</strong>
            <span>Try a broader skill or availability filter.</span>
          </div>
        )}
      </section>
    </>
  );
}

function JobsScreen({
  onCompose,
  onNotice,
}: {
  onCompose: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [filtered, setFiltered] = useState(false);
  return (
    <>
      <header className="screen-header">
        <div>
          <h1>Clear work. Clear terms.</h1>
          <p>
            Move from public request to private delivery without losing the
            evidence trail.
          </p>
        </div>
        <button
          className="button button--primary"
          type="button"
          onClick={onCompose}
        >
          <Plus size={18} />
          Post a job
        </button>
      </header>
      <div className="stage-strip" aria-label="Job workflow">
        <span className="is-active">
          <b>1</b>Request
        </span>
        <span>
          <b>2</b>Choose
        </span>
        <span>
          <b>3</b>Fund
        </span>
        <span>
          <b>4</b>Prove
        </span>
        <span>
          <b>5</b>Settle
        </span>
      </div>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Preview opportunity</span>
            <h2>Open work</h2>
          </div>
          <button
            className={filtered ? "is-active" : ""}
            type="button"
            aria-pressed={filtered}
            onClick={() => {
              const next = !filtered;
              setFiltered(next);
              onNotice({
                tone: "info",
                message: next
                  ? "Showing remote work."
                  : "Showing all open work.",
              });
            }}
          >
            {filtered ? "Remote" : "Filter"}
            <ChevronRight size={16} />
          </button>
        </div>
        <article className="job-card">
          <div className="job-card__top">
            <span className="kind kind--request">Open request</span>
            <span>Posted 11m ago</span>
          </div>
          <h3>Motion designer for a wallet onboarding story</h3>
          <p>
            Turn a five-step mobile onboarding flow into three clean scenes and
            a 40-second product story.
          </p>
          <div className="tag-row">
            <span>Motion</span>
            <span>Product video</span>
            <span>Remote</span>
          </div>
          <footer>
            <div>
              <span>Budget</span>
              <strong>350 USDT</strong>
            </div>
            <div>
              <span>Deadline</span>
              <strong>5 days</strong>
            </div>
            <button
              className="button button--dark"
              type="button"
              onClick={() =>
                onNotice({
                  tone: "info",
                  message:
                    "Job details opened. Applications will connect here next.",
                })
              }
            >
              View details
              <ChevronRight size={18} />
            </button>
          </footer>
        </article>
      </section>
    </>
  );
}

function WalletScreen({
  wallet,
  pending,
  onConnect,
  onProfile,
  onCompose,
}: {
  wallet: WalletIdentity | null;
  pending: boolean;
  onConnect: () => void;
  onProfile: () => void;
  onCompose: () => void;
}) {
  return (
    <>
      <header className="screen-header">
        <div>
          <h1>Your work wallet.</h1>
          <p>
            Connect through Nimiq Pay to sign in, publish with NIM, and approve
            wallet actions natively.
          </p>
        </div>
      </header>
      <section className="wallet-screen-card">
        <div className="wallet-screen-card__icon">
          <WalletCards />
        </div>
        <span className="eyebrow">Nimiq Pay</span>
        <h2>{wallet ? "Wallet connected" : "Connect your wallet"}</h2>
        <p>
          {wallet
            ? wallet.address
            : "NimSocial never receives your private keys. Every signature and payment is approved inside Nimiq Pay."}
        </p>
        {wallet ? (
          <div className="wallet-screen-actions">
            <button
              className="button button--primary"
              type="button"
              onClick={onCompose}
            >
              Create paid post
            </button>
            <button
              className="button button--quiet"
              type="button"
              onClick={onProfile}
            >
              View profile
            </button>
          </div>
        ) : (
          <button
            className="button button--primary"
            type="button"
            disabled={pending}
            onClick={onConnect}
          >
            {pending ? "Waiting for Nimiq Pay…" : "Connect with Nimiq Pay"}
          </button>
        )}
      </section>
    </>
  );
}

function MessagesScreen({
  conversations,
  activeId,
  messages,
  posts,
  profiles,
  wallet,
  onOpen,
  onBack,
  onSend,
  onConnect,
}: {
  conversations: Conversation[];
  activeId: string | null;
  messages: Record<string, DirectMessage[]>;
  posts: FeedPost[];
  profiles: ProfessionalProfile[];
  wallet: WalletIdentity | null;
  onOpen: (conversation: Conversation) => void;
  onBack: () => void;
  onSend: (conversation: Conversation, body: string) => void;
  onConnect: () => void;
}) {
  const [body, setBody] = useState("");
  const active = conversations.find((item) => item.id === activeId) ?? null;
  const participant = active
    ? profiles.find((item) => item.walletAddress === active.participantWallet)
    : null;
  const context = active
    ? posts.find((item) => item.id === active.contextPostId)
    : null;
  if (active) {
    const items = messages[active.id] ?? [];
    const submit = (event: React.FormEvent) => {
      event.preventDefault();
      const value = body.trim();
      if (!value) return;
      onSend(active, value);
      setBody("");
    };
    return (
      <section className="messages-screen">
        <header className="conversation-header">
          <button type="button" onClick={onBack} aria-label="Back to messages">
            <ChevronLeft />
          </button>
          <Avatar name={participant?.displayName ?? active.participantWallet} />
          <div>
            <strong>
              {participant?.displayName ??
                active.participantWallet.slice(0, 14)}
            </strong>
            <span>
              {participant?.availability === "open"
                ? "Open to work"
                : "Private conversation"}
            </span>
          </div>
        </header>
        {context && (
          <div className="message-context">
            <BriefcaseBusiness />
            <span>
              <small>Attached request</small>
              <strong>{context.body}</strong>
            </span>
          </div>
        )}
        <div className="message-list" aria-live="polite">
          {!items.length && (
            <div className="message-empty">
              <MessageSquare />
              <strong>Start the conversation</strong>
              <span>
                Discuss scope and fit here. Put final terms and escrow in the
                job flow.
              </span>
            </div>
          )}
          {items.map((message) => (
            <div
              key={message.id}
              className={`message-bubble ${message.senderWallet === wallet?.address || message.senderWallet === "PREVIEW-YOU" ? "is-mine" : ""}`}
            >
              <p>{message.body}</p>
              <span>
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {message.preview ? " · Preview" : ""}
              </span>
            </div>
          ))}
        </div>
        <form className="message-composer" onSubmit={submit}>
          <label>
            <span className="sr-only">Write a private message</span>
            <textarea
              rows={1}
              maxLength={2000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write a message…"
            />
          </label>
          <button
            type="submit"
            disabled={!body.trim()}
            aria-label="Send message"
          >
            <Send />
          </button>
        </form>
      </section>
    );
  }
  return (
    <section className="messages-screen">
      <header className="screen-header">
        <div>
          <h1>Work conversations.</h1>
          <p>
            Move from public interest to private scope, terms, and delivery.
          </p>
        </div>
      </header>
      {!wallet && !conversations.length ? (
        <div className="empty-state">
          <div>
            <MessageSquare />
          </div>
          <h2>Your inbox starts with a connection.</h2>
          <p>
            Connect Nimiq Pay, then message a hirer or worker from their request
            or profile.
          </p>
          <button
            className="button button--primary"
            type="button"
            onClick={onConnect}
          >
            Connect Nimiq Pay
          </button>
        </div>
      ) : (
        <div className="conversation-list">
          {conversations.map((conversation) => {
            const profile = profiles.find(
              (item) => item.walletAddress === conversation.participantWallet,
            );
            const attached = posts.find(
              (item) => item.id === conversation.contextPostId,
            );
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onOpen(conversation)}
              >
                <Avatar
                  name={profile?.displayName ?? conversation.participantWallet}
                />
                <span>
                  <strong>
                    {profile?.displayName ??
                      conversation.participantWallet.slice(0, 14)}
                  </strong>
                  <small>
                    {conversation.lastMessage?.body ??
                      attached?.body ??
                      "Start a private conversation"}
                  </small>
                </span>
                <ChevronRight />
              </button>
            );
          })}
          {wallet && !conversations.length && (
            <div className="compact-empty">
              <MessageSquare />
              <strong>No conversations yet.</strong>
              <span>Open a request or profile and tap Message.</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function NotificationsScreen({
  onNotice,
}: {
  onNotice: (notice: Notice) => void;
}) {
  const [read, setRead] = useState(false);
  return (
    <>
      <header className="screen-header">
        <div>
          <h1>Work activity.</h1>
          <p>
            Follows, applications, proof updates, and settlements collect here.
          </p>
        </div>
        <button
          className="button button--quiet"
          type="button"
          onClick={() => {
            setRead(true);
            onNotice({
              tone: "success",
              message: "Notifications marked as read.",
            });
          }}
        >
          Mark all read
        </button>
      </header>
      <section className="notification-list" aria-label="Notifications">
        <article className={read ? "" : "is-unread"}>
          <Avatar name="Tomi A." />
          <div>
            <strong>Tomi posted proof of work</strong>
            <span>Milestone 2 of 3 · 47m</span>
          </div>
        </article>
        <article className={read ? "" : "is-unread"}>
          <Avatar name="Amara K." />
          <div>
            <strong>New motion design request</strong>
            <span>350 USDT · 1h</span>
          </div>
        </article>
      </section>
    </>
  );
}

function ProfileScreen({
  profile,
  posts,
  wallet,
  onConnect,
  onOnboard,
  onExplore,
  onFollow,
  onMessage,
}: {
  profile: ProfessionalProfile | null;
  posts: FeedPost[];
  wallet: WalletIdentity | null;
  onConnect: () => void;
  onOnboard: () => void;
  onExplore: () => void;
  onFollow: (profile: ProfessionalProfile) => void;
  onMessage: (profile: ProfessionalProfile) => void;
}) {
  const [tab, setTab] = useState<"posts" | "work" | "proof">("posts");
  if (!profile)
    return (
      <>
        <section className="profile-hero profile-hero--empty">
          <div className="profile-hero__pattern" />
          <Avatar name={wallet?.shortAddress ?? "NS"} size="lg" />
          <div className="profile-hero__identity">
            <h1>Build a portable work story</h1>
            <p>
              Tell NimSocial what you do so requests, people, and proof become
              more relevant.
            </p>
          </div>
          <div className="profile-actions">
            {!wallet && (
              <button
                className="button button--quiet"
                type="button"
                onClick={onConnect}
              >
                Connect wallet
              </button>
            )}
            <button
              className="button button--primary"
              type="button"
              onClick={onOnboard}
            >
              Preview setup
            </button>
          </div>
        </section>
        <section className="empty-state">
          <div>
            <ShieldCheck size={28} />
          </div>
          <h2>Your proof trail starts with the first job.</h2>
          <p>
            Completed work and payment-backed ratings will appear here with
            their evidence links.
          </p>
          <button
            className="button button--dark"
            type="button"
            onClick={onExplore}
          >
            Explore active profiles
          </button>
        </section>
      </>
    );
  const isOwn =
    wallet?.address === profile.walletAddress ||
    profile.walletAddress === "PREVIEW-YOU";
  const name = profile.displayName ?? profile.walletAddress;
  const proofPosts = posts.filter((post) => post.kind === "proof");
  return (
    <>
      <button className="profile-back" type="button" onClick={onExplore}>
        <ChevronLeft />
        Back to Explore
      </button>
      <section className="profile-hero profile-hero--public">
        <div className="profile-hero__pattern">
          <span className="profile-availability">
            <i />
            {profile.availability === "open"
              ? "Open to work"
              : profile.availability === "busy"
                ? "Limited availability"
                : "Not open"}
          </span>
        </div>
        <Avatar name={name} size="lg" />
        <div className="profile-hero__identity">
          <h1>{name}</h1>
          <strong>{profile.professionalTitle}</strong>
          <p>{profile.bio}</p>
          <div className="profile-location">
            {profile.location && (
              <span>
                <MapPin />
                {profile.location}
              </span>
            )}
            <span>{profile.followers} followers</span>
            <span>{profile.following} following</span>
          </div>
        </div>
        <div className="profile-actions">
          {isOwn ? (
            <button
              className="button button--quiet"
              type="button"
              onClick={onOnboard}
            >
              Edit profile
            </button>
          ) : (
            <>
              <button
                className="button button--quiet"
                type="button"
                onClick={() => onMessage(profile)}
              >
                <MessageSquare />
                Message
              </button>
              <button
                className={`button ${profile.isFollowing ? "button--quiet" : "button--primary"}`}
                type="button"
                onClick={() => onFollow(profile)}
              >
                {profile.isFollowing ? <Check /> : <Plus />}
                {profile.isFollowing ? "Following" : "Follow"}
              </button>
            </>
          )}
        </div>
      </section>
      <div className="profile-stats">
        <div>
          <strong>{profile.completedJobs ?? 0}</strong>
          <span>Completed jobs</span>
        </div>
        <div>
          <strong>{profile.reputation.score ?? "New"}</strong>
          <span>Reputation score</span>
        </div>
        <div>
          <strong>{profile.earned ?? "—"}</strong>
          <span>{profile.profileRole === "client" ? "Funded" : "Earned"}</span>
        </div>
      </div>
      <section className="reputation-card">
        <div className="reputation-score">
          <Award />
          <span>
            <strong>{profile.reputation.score ?? "—"}</strong>
            <small>Work reputation</small>
          </span>
        </div>
        <div className="reputation-breakdown">
          {Object.entries(profile.reputation.dimensions).map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <strong>{value ?? "—"}/5</strong>
              <i style={{ width: `${value ? (value / 5) * 100 : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="credential-state">
          <CheckCircle2 />
          <div>
            <strong>
              {profile.preview ? "Credential preview" : "Credential not minted"}
            </strong>
            <span>
              {profile.reputation.reviewCount} verified job{" "}
              {profile.reputation.reviewCount === 1 ? "review" : "reviews"} ·
              on-chain mint requires a deployed attestation flow
            </span>
          </div>
        </div>
      </section>
      <div className="profile-tabs" role="tablist" aria-label="Profile content">
        {(["posts", "work", "proof"] as const).map((item) => (
          <button
            key={item}
            className={tab === item ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === "posts" && (
        <section className="feed-stack">
          {posts.length ? (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <ProfileEmpty label="No posts here yet." />
          )}
        </section>
      )}
      {tab === "proof" && (
        <section className="feed-stack">
          {proofPosts.length ? (
            proofPosts.map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <ProfileEmpty label="Verified proof will appear after job milestones." />
          )}
        </section>
      )}
      {tab === "work" && (
        <section className="work-grid">
          {profile.workSamples?.length ? (
            profile.workSamples.map((work) => (
              <article key={work.title}>
                <span className="eyebrow">Completed work</span>
                <h3>{work.title}</h3>
                <p>{work.outcome}</p>
                <div className="tag-row">
                  {work.skills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <ProfileEmpty label="Past work will appear after completed jobs." />
          )}
        </section>
      )}
    </>
  );
}
function ProfileEmpty({ label }: { label: string }) {
  return (
    <div className="compact-empty">
      <ShieldCheck />
      <strong>{label}</strong>
      <span>Evidence is added through the job workflow.</span>
    </div>
  );
}

function RightRail({
  profiles,
  onOpenProfile,
  onFollow,
}: {
  profiles: ProfessionalProfile[];
  onOpenProfile: (wallet: string) => void;
  onFollow: (profile: ProfessionalProfile) => void;
}) {
  return (
    <>
      <div className="rail-header">
        <span>Work pulse</span>
        <button
          className="icon-button"
          type="button"
          aria-label="Notifications"
        >
          <Bell size={19} />
          <span className="notification-dot" />
        </button>
      </div>
      <div className="right-rail__scroll">
        <section className="rail-card rail-card--pulse">
          <div className="rail-card__label">
            <span>Network preview</span>
            <span className="live-pill">
              <i />
              Active
            </span>
          </div>
          <strong>39</strong>
          <p>requests and proof updates moving today</p>
          <div className="mini-bars" aria-hidden="true">
            {[42, 68, 54, 82, 64, 91, 73, 88, 57, 78, 94, 72].map(
              (height, index) => (
                <span key={index} style={{ height: `${height}%` }} />
              ),
            )}
          </div>
          <small>Illustrative until live activity grows</small>
        </section>
        <section className="rail-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Popular skills</span>
              <h2>What people need</h2>
            </div>
          </div>
          <ol className="rank-list">
            <li>
              <span>01</span>
              <div>
                <strong>Nimiq integrations</strong>
                <small>18 requests</small>
              </div>
              <i>+12%</i>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Product motion</strong>
                <small>12 requests</small>
              </div>
              <i>+8%</i>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Brand systems</strong>
                <small>9 requests</small>
              </div>
              <i>+5%</i>
            </li>
          </ol>
        </section>
        <section className="rail-card rail-card--people">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Available now</span>
              <h2>People to watch</h2>
            </div>
          </div>
          {profiles
            .filter((profile) => profile.availability === "open")
            .slice(0, 3)
            .map((profile) => (
              <article key={profile.walletAddress}>
                <button
                  className="avatar-button"
                  type="button"
                  onClick={() => onOpenProfile(profile.walletAddress)}
                >
                  <Avatar
                    name={profile.displayName ?? profile.walletAddress}
                    size="sm"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenProfile(profile.walletAddress)}
                >
                  <strong>{profile.displayName}</strong>
                  <span>{profile.professionalTitle}</span>
                </button>
                <button
                  className="mini-follow"
                  type="button"
                  onClick={() => onFollow(profile)}
                  aria-label={
                    profile.isFollowing
                      ? `Unfollow ${profile.displayName}`
                      : `Follow ${profile.displayName}`
                  }
                >
                  {profile.isFollowing ? <Check /> : <Plus />}
                </button>
              </article>
            ))}
        </section>
        <footer className="rail-footer">
          <a href="#about">About</a>
          <a href="#safety">Safety</a>
          <a href="#terms">Terms</a>
          <span>© 2026 NimSocial</span>
        </footer>
      </div>
    </>
  );
}
