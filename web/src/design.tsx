// Local design review only. Vite's production entry remains index.html.
import "@fontsource-variable/manrope/index.css";
import "@fontsource-variable/newsreader/index.css";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { FeedScreen, ExploreScreen } from "./App";
import { Brand } from "./components/Brand";
import { previewPosts, previewProfiles } from "./preview-data";
import "./styles.css";
import "./refinement.css";
function DesignReview() {
  const [screen, setScreen] = useState("feed");
  const [notice, setNotice] = useState("");
  const explain = () => setNotice("Design preview only — no account or transaction connected.");
  return <div style={{maxWidth:720,margin:"auto",background:"white",minHeight:"100dvh"}}>
    <header style={{padding:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}><Brand /><select aria-label="Preview screen" value={screen} onChange={e=>setScreen(e.target.value)}><option value="feed">Feed</option><option value="explore">Explore</option></select></header>
    <p className="preview-banner" style={{margin:16}}>Local design review · illustrative content</p>
    <main style={{padding:"0 16px 80px"}}>
      {screen==="feed" ? <FeedScreen posts={previewPosts} source="preview" onCompose={explain} onOpenProfile={explain} onOpenThread={explain} onViewJob={explain} onAction={explain}/> : <ExploreScreen profiles={previewProfiles} source="preview" onOpenProfile={explain} onFollow={explain}/>}
      {notice && <p role="status">{notice}</p>}
    </main>
  </div>;
}
if (import.meta.env.DEV) createRoot(document.getElementById("root")!).render(<DesignReview />);
