import { useCallback, useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

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

function buildColumnDefs(): ReactColDef[] {
  return CASES.map((c) => ({
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

function buildRows(count: number) {
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

export function ColumnGroupExpanderDemo() {
  const rows = useMemo(() => buildRows(12), []);
  const columnDefs = useMemo(buildColumnDefs, []);
  const apiRef = useRef<IGridAPI | null>(null);
  const [statuses, setStatuses] = useState<CaseStatus[]>([]);

  const refresh = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const model = api.getColumnModel();
    setStatuses(CASES.map((def) => {
      const group = model.getByColId(def.colId);
      const expandState = group?.groupExpandState ?? "closed";
      const visible = group?.children
        .filter((ch) => ch.columnGroupVisible && !ch.hidden)
        .map((ch) => ch.label) ?? [];
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
    }));
  }, []);

  const handleReady = (api: IGridAPI) => {
    apiRef.current = api;
    api.on("columnsChanged", refresh);
    refresh();
  };

  const failures = statuses.filter((s) => !s.expanderOk || !s.visibleOk);

  return (
    <div style={{ display: "flex", gap: 12, height: "100%" }}>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <Grid
          data={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          style={{ width: "100%", height: "100%" }}
          onGridReady={handleReady}
        />
      </div>

      <aside style={{ width: 560, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
        <section style={{ border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: 8, padding: 12 }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>
            Case status{" "}
            <span style={{ fontWeight: 400, color: failures.length ? "#b91c1c" : "#15803d" }}>
              — {failures.length ? `${failures.length} case(s) wrong` : "all cases correct"}
            </span>
          </h3>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>
            Rule: expander iff children mix ≥2 distinct <code>columnGroupShow</code> values;
            a uniform non-always group ignores <code>columnGroupShow</code> (children always
            visible). Live from the column model; updates as you toggle groups.
          </p>
          <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280" }}>
                <th style={{ padding: "2px 6px 4px 0" }}>group</th>
                <th style={{ padding: "2px 6px 4px 0" }}>expander exp / act</th>
                <th style={{ padding: "2px 6px 4px 0" }}>state</th>
                <th style={{ padding: "2px 0 4px 0" }}>visible children</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((s) => {
                const wrong = !s.expanderOk || !s.visibleOk;
                return (
                  <tr key={s.def.colId} style={{ background: wrong ? "#fef2f2" : undefined, color: wrong ? "#b91c1c" : undefined, verticalAlign: "top" }}>
                    <td style={{ padding: "3px 6px 3px 0", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {s.def.colId}: {s.def.title}
                    </td>
                    <td style={{ padding: "3px 6px 3px 0", whiteSpace: "nowrap" }}>
                      {expectExpander(s.def) ? "yes" : "no"} / {s.showExpander ? "yes" : "no"} {s.expanderOk ? "✓" : "✗"}
                    </td>
                    <td style={{ padding: "3px 6px 3px 0" }}>{s.expandState}</td>
                    <td style={{ padding: "3px 0" }}>
                      {s.visible.join(", ") || <i>none — group vanished!</i>} {s.visibleOk ? "✓" : "✗"}
                      {!s.visibleOk && (
                        <div style={{ fontStyle: "italic" }}>
                          expected: {s.expectedVisible.join(", ") || "none"}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section style={{ border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: 8, padding: 12 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>What each case demonstrates</h3>
          <ul style={{ fontSize: 12, color: "#6b7280", margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li><b>g1</b> — uniform (all unset): no toggle-controlled children, no expander. This is
              the intended fix.</li>
            <li><b>g2 / g3</b> — the common "summary column + detail on expand" pattern. The expander
              must show; without it g2's "open" child is <b>permanently hidden</b> and g3's "closed"
              child is permanently visible.</li>
            <li><b>g4 / g7</b> — mixed open/closed children; the only shapes the current code still
              shows an expander for.</li>
            <li><b>g5 / g6</b> — uniform ("open"-only / "closed"-only): no expander, and
              <code>columnGroupShow</code> should be ignored so all children stay visible. g5
              currently <b>vanishes from the grid entirely</b> (starts closed, no visible children);
              g6 only looks right by coincidence — its "closed" children happen to match the default
              closed state.</li>
            <li><b>g8</b> — same mix as g2 but starts open: the detail column shows, but without an
              expander it can never be collapsed.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

export default ColumnGroupExpanderDemo;
