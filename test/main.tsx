import { useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import SelectionDemo from "./SelectionDemo";
import GroupingDemo from "./GroupingDemo";
import "./roboto-font.css";
import "./style.css";

const PAGES = [
  { id: "grid", label: "Grid demo", render: () => <App /> },
  { id: "selection", label: "Selection & keyboard nav", render: () => <SelectionDemo /> },
  { id: "grouping", label: "Row grouping", render: () => <GroupingDemo /> },
] as const;

function Root() {
  const [page, setPage] = useState<(typeof PAGES)[number]["id"]>("grid");
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <nav style={{ display: "flex", gap: 8, padding: "8px 8px 0" }}>
        {PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn"
            onClick={() => setPage(p.id)}
            style={{ opacity: p.id === page ? 1 : 0.55 }}
          >
            {p.label}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1, minHeight: 0, padding: 8, boxSizing: "border-box" }}>
        {current.render()}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
