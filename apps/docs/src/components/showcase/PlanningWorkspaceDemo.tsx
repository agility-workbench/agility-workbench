import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ColumnType,
  Grid,
  REJECT,
  type ActionFrameComponentParams,
  type BeforeCellCommitParams,
  type BodyMenuContext,
  type GridEventHistoryChangedParams,
  type IGridAPI,
  type IRowNode,
  type ReactColDef,
  type ReactMenuItem,
  type RowInsertionMenuParams,
  type RowPresentationParams,
} from "@agility-workbench/react-grid";
import { brandTheme } from "../gridTheme";
import { ShowcaseFrame, showcaseButtonClass } from "./ShowcaseFrame";
import styles from "./PlanningWorkspace.module.css";

/** `CellClassArgs` is not exported by the package; a cellClass callback only needs the value. */
type CellClassArgs = { value: unknown };

type PlanRow = {
  id: string;
  parentId: string | null;
  name: string;
  owner: string;
  status: string;
  plan: number;
  actual: number;
  note: string;
};

const STATUSES = ["Approved", "In review", "Draft", "On hold"];

/** A real hierarchy: parent rows carry their own figures rather than being generated buckets. */
const planRows: PlanRow[] = [
  { id: "fy", parentId: null, name: "FY plan", owner: "Ada Fischer", status: "Approved", plan: 4_800_000, actual: 4_512_000, note: "Board approved on 12 Jan." },
  { id: "eng", parentId: "fy", name: "Engineering", owner: "Noah Williams", status: "Approved", plan: 2_400_000, actual: 2_331_000, note: "" },
  { id: "eng-platform", parentId: "eng", name: "Platform", owner: "Maya Patel", status: "Approved", plan: 1_050_000, actual: 1_012_400, note: "Two open reqs deferred to H2." },
  { id: "eng-grid", parentId: "eng", name: "Grid", owner: "Leo Martin", status: "In review", plan: 780_000, actual: 826_500, note: "Contractor overrun." },
  { id: "eng-infra", parentId: "eng", name: "Infrastructure", owner: "Ines Duarte", status: "Approved", plan: 570_000, actual: 492_100, note: "" },
  { id: "gtm", parentId: "fy", name: "Go to market", owner: "Ava Chen", status: "In review", plan: 1_650_000, actual: 1_598_000, note: "" },
  { id: "gtm-field", parentId: "gtm", name: "Field sales", owner: "Tom Okafor", status: "Approved", plan: 890_000, actual: 902_300, note: "Two extra AEs hired in Q2." },
  { id: "gtm-marketing", parentId: "gtm", name: "Marketing", owner: "Ava Chen", status: "Draft", plan: 520_000, actual: 471_200, note: "" },
  { id: "gtm-partners", parentId: "gtm", name: "Partnerships", owner: "Sara Bloom", status: "On hold", plan: 240_000, actual: 224_500, note: "Paused pending reseller contract." },
  { id: "ga", parentId: "fy", name: "G&A", owner: "Ada Fischer", status: "Approved", plan: 750_000, actual: 583_000, note: "" },
  { id: "ga-finance", parentId: "ga", name: "Finance", owner: "Ada Fischer", status: "Approved", plan: 310_000, actual: 288_400, note: "" },
  { id: "ga-people", parentId: "ga", name: "People", owner: "Sara Bloom", status: "In review", plan: 440_000, actual: 294_600, note: "Recruiting spend under plan." },
];

const varianceOf = (row: PlanRow) => row.plan - row.actual;

const varianceClass = ({ value }: CellClassArgs) =>
  typeof value === "number" && value < 0 ? styles.negative : styles.positive;

function NoteFrame({ value, rowId, colDef, api, close }: ActionFrameComponentParams) {
  const [draft, setDraft] = useState(String(value ?? ""));
  return (
    <form
      className={styles.frameForm}
      onSubmit={(event) => {
        event.preventDefault();
        api.setCellValue({ rowId, colId: colDef.colId }, draft);
        close();
      }}
    >
      <textarea value={draft} rows={3} onChange={(event) => setDraft(event.target.value)} aria-label="Note" />
      <div className={styles.frameRow}>
        <button type="button" onClick={close}>Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}

const columnDefs: ReactColDef[] = [
  { colId: "owner", key: "owner", label: "Owner", width: 150 },
  {
    colId: "status", key: "status", label: "Status", width: 130, editable: true,
    cellEditor: "select", cellEditorParams: { values: STATUSES },
  },
  {
    colId: "plan", key: "plan", label: "Plan", width: 140, type: ColumnType.CURRENCY, editable: true,
  },
  {
    colId: "actual", key: "actual", label: "Actual", width: 140, type: ColumnType.CURRENCY, editable: true,
  },
  {
    colId: "variance", label: "Variance", width: 140, type: ColumnType.CURRENCY,
    // Computed, so it is never edited and never pasted into.
    valueGetter: (node: IRowNode) => varianceOf(node.data as PlanRow),
    cellClass: varianceClass,
    headerTooltip: "Plan minus actual. Recomputed as either figure is edited.",
  },
  {
    colId: "note", key: "note", label: "Note", width: 220,
    actionFrameTrigger: "click",
    actionFrameComponent: NoteFrame,
    actionFrameIndicator: "comment",
    actionFrameOptions: { placement: "left", offset: 10 },
  },
];

const MAX_LINE_ITEM = 5_000_000;

export function PlanningWorkspaceDemo() {
  const apiRef = useRef<IGridAPI | null>(null);
  const insertedRef = useRef(0);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false, undoDepth: 0 });
  const [lastEdit, setLastEdit] = useState("No edits yet.");

  /**
   * Pre-commit validation. Runs after the column's `valueParser` on every user-initiated write —
   * editor commits, `setCellValue`, and each cell of a paste — and never on undo/redo replay.
   */
  const onBeforeCellCommit = useCallback((params: BeforeCellCommitParams) => {
    if (params.colId !== "plan" && params.colId !== "actual") return undefined;
    const value = Number(params.value);
    if (!Number.isFinite(value)) {
      setLastEdit(`Rejected "${String(params.value)}" — not a number.`);
      return REJECT;
    }
    if (value < 0) {
      setLastEdit("Rejected a negative amount.");
      return REJECT;
    }
    if (value > MAX_LINE_ITEM) {
      setLastEdit(`Clamped to the $${(MAX_LINE_ITEM / 1_000_000).toFixed(0)}M line-item ceiling.`);
      return MAX_LINE_ITEM;
    }
    setLastEdit(`${params.colId} → $${Math.round(value).toLocaleString("en-US")}`);
    // Return the coerced number rather than `undefined`: a pasted cell arrives as a string, and
    // accepting the proposal unchanged would store text in a currency column.
    return value;
  }, []);

  /** One row-level rule instead of the same callback repeated on every column. */
  const getRowPresentation = useCallback(({ data }: RowPresentationParams) => {
    const row = data as PlanRow | undefined;
    if (!row || row.actual <= row.plan) return undefined;
    return {
      cellClass: styles.overspent,
      tooltip: { content: `Over plan by $${(row.actual - row.plan).toLocaleString("en-US")}` },
      accessibility: { description: "Line item is over plan" },
      metadata: { state: "overspent" },
    };
  }, []);

  const onHistoryChanged = useCallback((params: GridEventHistoryChangedParams) => {
    setHistory({ canUndo: params.canUndo, canRedo: params.canRedo, undoDepth: params.undoDepth });
  }, []);

  const rowInsertionMenu = useMemo(() => ({
    createRow: ({ data, position }: RowInsertionMenuParams) => {
      const sequence = ++insertedRef.current;
      const sibling = data as PlanRow;
      return {
        id: `line-${sequence}`,
        // A new row joins the hierarchy as a sibling of the row it was inserted next to.
        parentId: sibling.parentId,
        name: `New line item ${sequence}`,
        owner: sibling.owner,
        status: "Draft",
        plan: 0,
        actual: 0,
        note: `Inserted ${position} ${sibling.name}.`,
      } satisfies PlanRow;
    },
  }), []);

  const bodyContextMenu = useCallback(({ ctx, items }: { ctx: BodyMenuContext; items: ReactMenuItem[] }) => [
    ...items,
    { isSeparator: true },
    {
      id: "zero-actual",
      label: "Reset actual to zero",
      onClick: () => apiRef.current?.setCellValue({ rowId: ctx.rowId, colId: "actual" }, 0),
    },
  ], []);

  return (
    <ShowcaseFrame
      kicker="Tree data · editing · validation · undo"
      title="Planning workspace"
      hint="A real budget hierarchy whose parent rows hold their own figures. Double-click Plan or Actual to edit, paste a block of numbers over a range, click a Note cell for its form, and right-click a row number to insert a sibling."
      stats={[
        { label: "undo depth", value: String(history.undoDepth) },
        { label: "line items", value: String(planRows.length + insertedRef.current) },
      ]}
      controls={
        <>
          <button
            className={showcaseButtonClass}
            type="button"
            disabled={!history.canUndo}
            onClick={() => apiRef.current?.undo()}
          >
            Undo
          </button>
          <button
            className={showcaseButtonClass}
            type="button"
            disabled={!history.canRedo}
            onClick={() => apiRef.current?.redo()}
          >
            Redo
          </button>
          <button
            className={showcaseButtonClass}
            type="button"
            onClick={() => apiRef.current?.setAllGroupsExpanded(true)}
          >
            Expand all
          </button>
          <code className={styles.log}>{lastEdit}</code>
        </>
      }
      note="Rows over plan are tinted by one getRowPresentation rule; amounts above $5M are clamped and negatives rejected before they ever reach the row data."
    >
      <Grid
        apiRef={apiRef}
        rowData={planRows}
        columnDefs={columnDefs}
        rowIdKey="id"
        theme={brandTheme}
        defaultColDef={{ sortable: true, resizable: true, movable: true }}
        treeData={{
          mode: "parent",
          getParentId: (row: PlanRow) => row.parentId,
          getLabel: (row: PlanRow) => row.name,
          columnDef: { label: "Cost centre", width: 250, pinned: "left" },
          keyboardNavigationMode: "hierarchy",
          enableKeyboardNavigationModeSwitch: true,
        }}
        groupDefaultExpanded={2}
        editTrigger="doubleClick"
        undoLimit={50}
        onBeforeCellCommit={onBeforeCellCommit}
        onHistoryChanged={onHistoryChanged}
        getRowPresentation={getRowPresentation}
        rowInsertionMenu={rowInsertionMenu}
        bodyContextMenu={bodyContextMenu}
        rowNumbers
        rowPinningMenu
        rangeSelection
        highlightActiveCell
        groupRowsSticky
        ariaLabel="Budget plan"
        tooltip={{ showDelay: 150, hideDelay: 75 }}
        style={{ width: "100%", height: "100%" }}
      />
    </ShowcaseFrame>
  );
}
