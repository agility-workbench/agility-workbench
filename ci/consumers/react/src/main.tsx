import { createRoot } from "react-dom/client";
import { App } from "./App";

const host = document.getElementById("root");
if (host) createRoot(host).render(<App />);
