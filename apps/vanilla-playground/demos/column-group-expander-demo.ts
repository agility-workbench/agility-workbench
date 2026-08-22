import { createGrid, type ColDef } from "@grid";

import { code, h } from "../dom";

/**
 * Exercises every combination of `columnGroupShow` across a group's children, to pin down when
 * the group-expander control should render. The rules under test:
 *
 *   1. A group shows its expander iff its visible children have a MIX of at least two distinct
 *      effective `columnGroupShow` values ("always" [= unset] / "open" / "closed"). A group whose
 *      children all share one value — all unset, all "open", all "closed" — never gets an
 *      expander, because toggling it could only ever swap between "everything" and "nothing".
 *   2. When all children share the same non-"always" value, `columnGroupShow` is ignored for
 *      visibility: the children are simply always visible. (Otherwise an all-"open" group that
 *      starts closed vanishes from the grid with no control to bring it back.)
 *
 * The side panel reads the column model live and compares both the expander flag and the set of
 * visible children against those rules — red rows are cases where the current implementation
 * disagrees with the expected behavior.
 */

type Mix = null | "open" | "closed";

type CaseDef = {
  colId: string;
  title: string;
  /** columnGroupShow per child; null = unset (effective "always"). */
  mix: Mix[];
  openByDefault?: boolean;
};

const CASES: CaseDef[] = [
  { colId: "g1", title: "all unset", mix: [null, null] },
  { colId: "g2", title: "unset + open", mix: [null, "open"] },
  { colId: "g3", title: "unset + closed", mix: [null, "closed"] },
  { colId: "g4", title: "open + closed", mix: ["open", "closed"] },
  { colId: "g5", title: "all open", mix: ["open", "open"] },
  { colId: "g6", title: "all closed", mix: ["closed", "closed"] },
  { colId: "g7", title: "unset + open + closed", mix: [null, "open", "closed"] },
  { colId: "g8", title: "unset + open (openByDefault)", mix: [null, "open"], openByDefault: true },
];

const effective = (m: Mix) => m ?? "always";
const mixLabel = (m: Mix) => (m === null ? "unset" : m);
const childLabel = (m: Mix, i: number) => `${mixLabel(m)} (${i + 1})`;

/** Rule 1: expander iff the children carry at least two distinct effective values. */
const expectExpander = (c: CaseDef) => new Set(c.mix.map(effective)).size >= 2;

/**
 * Rule 2: children a group should currently display. Uniform groups ignore `columnGroupShow`
 * (all children visible); mixed groups show "always" children plus the ones matching the
 * group's expand state.
 */
function expectedVisible(c: CaseDef, expandState: string): string[] {
  const uniform = new Set(c.mix.map(effective)).size === 1;
  return c.mix
    .map((m, i) => ({ m: effective(m), label: childLabel(m, i) }))
    .filter(({ m }) => uniform || m === "always" || m === expandState)
    .map(({ label }) => label);
}

function buildColumnDefs(): ColDef[] {
  return CASES.map(c => ({
    colId: c.colId,
    label: `${c.colId}: ${c.title}`,
    openByDefault: c.openByDefault,
    children: c.mix.map((m, i) => ({
      colId: `${c.colId}c${i}`,
      key: `${c.colId}c${i}`,
      label: childLabel(m, i),
      width: 96,
      ...(m ? { columnGroupShow: m } : {}),
    })),
  }));
}

function buildRows(count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, r) => {
    const row: Record<string, unknown> = { id: r + 1 };
    for (const c of CASES) {
      c.mix.forEach((m, i) => {
        row[`${c.colId}c${i}`] = `${mixLabel(m)} r${r + 1}`;
      });
    }
    return row;
  });
}

type CaseStatus = {
  def: CaseDef;
  showExpander: boolean;
  expanderOk: boolean;
  expandState: string;
  visible: string[];
  expectedVisible: string[];
  visibleOk: boolean;
};

export function mountColumnGroupExpanderDemo(container: HTMLElement): () => void {
  const host = h("div", { style: { flex: "1", minWidth: "0", minHeight: "0" } });
  const heading = h("h3", { style: { fontSize: "14px", marginBottom: "4px" } });
  const table = h("div");

  container.appendChild(h("div", { style: { display: "flex", gap: "12px", height: "100%" } },
    host,
    h("aside", {
      style: {
        width: "560px", flexShrink: "0", display: "flex", flexDirection: "column",
        gap: "12px", overflow: "auto",
      },
    },
      h("section", {
        style: { border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: "8px", padding: "12px" },
      },
        heading,
        h("p", { style: { fontSize: "12px", color: "#6b7280", margin: "0 0 8px" } },
          "Rule: expander iff children mix ≥2 distinct ", code("columnGroupShow"),
          " values; a uniform non-always group ignores ", code("columnGroupShow"),
          " (children always visible). Live from the column model; updates as you toggle groups."),
        table,
      ),
      h("section", {
        style: { border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: "8px", padding: "12px" },
      },
        h("h3", { text: "What each case demonstrates", style: { fontSize: "14px", marginBottom: "8px" } }),
        h("ul", {
          style: { fontSize: "12px", color: "#6b7280", margin: "0", paddingLeft: "18px", lineHeight: "1.6" },
        },
          h("li", null, h("b", { text: "g1" }),
            " — uniform (all unset): no toggle-controlled children, no expander. This is the intended fix."),
          h("li", null, h("b", { text: "g2 / g3" }),
            " — the common \"summary column + detail on expand\" pattern. The expander must show;"
            + " without it g2's \"open\" child is ", h("b", { text: "permanently hidden" }),
            " and g3's \"closed\" child is permanently visible."),
          h("li", null, h("b", { text: "g4 / g7" }),
            " — mixed open/closed children; the only shapes the current code still shows an expander for."),
          h("li", null, h("b", { text: "g5 / g6" }),
            " — uniform (\"open\"-only / \"closed\"-only): no expander, and ", code("columnGroupShow"),
            " should be ignored so all children stay visible. g5 currently ",
            h("b", { text: "vanishes from the grid entirely" }),
            " (starts closed, no visible children); g6 only looks right by coincidence — its"
            + " \"closed\" children happen to match the default closed state."),
          h("li", null, h("b", { text: "g8" }),
            " — same mix as g2 but starts open: the detail column shows, but without an expander it"
            + " can never be collapsed."),
        ),
      ),
    ),
  ));

  const api = createGrid(host, {
    rowData: buildRows(12),
    columnDefs: buildColumnDefs(),
    rowIdKey: "id",
  });

  const off = api.on("columnsChanged", () => refresh());
  refresh();

  function refresh(): void {
    const model = api.getColumnModel();
    const statuses: CaseStatus[] = CASES.map(def => {
      const group = model.getByColId(def.colId);
      const expandState = group?.groupExpandState ?? "closed";
      const visible = group?.children
        .filter(child => child.columnGroupVisible && !child.hidden)
        .map(child => child.label) ?? [];
      const expected = expectedVisible(def, expandState);
      return {
        def,
        showExpander: group?.showExpander ?? false,
        expanderOk: (group?.showExpander ?? false) === expectExpander(def),
        expandState,
        visible,
        expectedVisible: expected,
        visibleOk: visible.join("|") === expected.join("|"),
      };
    });

    const failures = statuses.filter(status => !status.expanderOk || !status.visibleOk);
    heading.replaceChildren(
      "Case status ",
      h("span", {
        text: ` — ${failures.length ? `${failures.length} case(s) wrong` : "all cases correct"}`,
        style: { fontWeight: "400", color: failures.length ? "#b91c1c" : "#15803d" },
      }),
    );

    const headerCell = (text: string) => h("th", { text, style: { padding: "2px 6px 4px 0" } });
    table.replaceChildren(
      h("table", { style: { fontSize: "12px", borderCollapse: "collapse", width: "100%" } },
        h("thead", null, h("tr", { style: { textAlign: "left", color: "#6b7280" } },
          headerCell("group"), headerCell("expander exp / act"), headerCell("state"),
          headerCell("visible children"),
        )),
        h("tbody", null, ...statuses.map(status => {
          const wrong = !status.expanderOk || !status.visibleOk;
          return h("tr", {
            style: {
              background: wrong ? "#fef2f2" : "",
              color: wrong ? "#b91c1c" : "",
              verticalAlign: "top",
            },
          },
            h("td", {
              text: `${status.def.colId}: ${status.def.title}`,
              style: { padding: "3px 6px 3px 0", fontWeight: "600", whiteSpace: "nowrap" },
            }),
            h("td", {
              text: `${expectExpander(status.def) ? "yes" : "no"} / ${status.showExpander ? "yes" : "no"} `
                + `${status.expanderOk ? "✓" : "✗"}`,
              style: { padding: "3px 6px 3px 0", whiteSpace: "nowrap" },
            }),
            h("td", { text: status.expandState, style: { padding: "3px 6px 3px 0" } }),
            h("td", { style: { padding: "3px 0" } },
              status.visible.length
                ? `${status.visible.join(", ")} `
                : h("i", { text: "none — group vanished! " }),
              status.visibleOk ? "✓" : "✗",
              !status.visibleOk
                ? h("div", {
                  text: `expected: ${status.expectedVisible.join(", ") || "none"}`,
                  style: { fontStyle: "italic" },
                })
                : null,
            ),
          );
        })),
      ),
    );
  }

  return () => {
    off();
    api.destroy();
  };
}
