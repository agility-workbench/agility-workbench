import { useState } from "react";
import { createRoot } from "react-dom/client";
// The grid stylesheet is no longer auto-injected by the React wrapper; consumers
// (and this demo) import it explicitly. In a published app this would be
// `import "@agility-workbench/grid/styles.css"`.
import "@grid/theme/table.css";
import App from "./App";
import SelectionDemo from "./SelectionDemo";
import GroupingDemo from "./GroupingDemo";
import ColumnStateDemo from "./ColumnStateDemo";
import VisualStatesDemo from "./VisualStatesDemo";
import QuickFilterDemo from "./QuickFilterDemo";
import "./roboto-font.css";
import "./style.css";

const PAGES = [
  { id: "grid", label: "Grid demo", render: () => <App /> },
  { id: "selection", label: "Selection & keyboard nav", render: () => <SelectionDemo /> },
  { id: "visualStates", label: "Hover & visual states", render: () => <VisualStatesDemo /> },
  { id: "grouping", label: "Row grouping", render: () => <GroupingDemo /> },
  { id: "columnState", label: "Column state save/restore", render: () => <ColumnStateDemo /> },
  { id: "quickFilter", label: "Quick filter", render: () => <QuickFilterDemo /> },
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
