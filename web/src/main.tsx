import "@fontsource-variable/manrope/index.css";
import "@fontsource-variable/newsreader/index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./refinement.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
