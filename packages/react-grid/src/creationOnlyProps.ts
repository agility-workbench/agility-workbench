import { CREATION_ONLY_OPTION_KEYS } from "@agility-workbench/grid";
import type { GridProps } from "./interface";

/**
 * Core creation-only options the React binding keeps live anyway: the event callbacks, the
 * value-returning hooks and `multiColumnMenu` are read through stable bridges, so the latest prop is
 * always the one called. Everything else in core's {@link CREATION_ONLY_OPTION_KEYS} is fixed once
 * the grid exists.
 */
const BRIDGED_PROPS: ReadonlySet<string> = new Set([
  "onCellClicked",
  "onRowClicked",
  "onCellDoubleClicked",
  "onRowDoubleClicked",
  "onCellValueChanged",
  "onSelectionChanged",
  "onSortChanged",
  "onFilterChanged",
  "onQuickFilterFindChanged",
  "onHistoryChanged",
  "onBeforeCellCommit",
  "fillOperation",
  "multiColumnMenu",
]);

/** The `<Grid>` props a mounted grid ignores changes to (derived from core's key lists). */
export const CREATION_ONLY_PROPS: readonly (keyof GridProps)[] = CREATION_ONLY_OPTION_KEYS.filter(
  (key) => !BRIDGED_PROPS.has(key),
) as (keyof GridProps)[];

/** The `treeData` members the binding reconciles live (via setTreeDataKeyboardNavigationOptions). */
const LIVE_TREE_DATA_KEYS = ["keyboardNavigationMode", "enableKeyboardNavigationModeSwitch"];

const UNCOMPARABLE = Symbol("uncomparable");

/**
 * A structural fingerprint of a prop value, so an inline object or arrow function re-created on
 * every render with the same contents does not count as a change. Functions compare by source text
 * (a fresh closure with identical source is taken to be the same callback); `treeData` ignores the
 * members that are live. Values that cannot be serialized (cycles) compare by identity.
 */
export function propFingerprint(key: string, value: unknown): string | typeof UNCOMPARABLE {
  let subject = value;
  if (key === "treeData" && value != null && typeof value === "object") {
    const rest = { ...(value as Record<string, unknown>) };
    for (const live of LIVE_TREE_DATA_KEYS) delete rest[live];
    subject = rest;
  }
  try {
    return JSON.stringify(subject, (_k, v: unknown) => {
      if (typeof v === "function") return `ƒ ${String(v)}`;
      if (v === undefined) return "∅undefined";
      return v;
    }) ?? "∅undefined";
  } catch {
    return UNCOMPARABLE;
  }
}

export type CreationSnapshot = Map<string, { value: unknown; fingerprint: string | typeof UNCOMPARABLE }>;

/** Record the creation-only props the grid was created with. */
export function snapshotCreationOnlyProps(props: GridProps): CreationSnapshot {
  const snapshot: CreationSnapshot = new Map();
  for (const key of CREATION_ONLY_PROPS) {
    const value = props[key];
    snapshot.set(key, { value, fingerprint: propFingerprint(key, value) });
  }
  return snapshot;
}

/**
 * Development builds only. Bundlers replace `process.env.NODE_ENV`; where nothing does and there is
 * no `process` at all, the warning stays on (it costs one comparison pass per render).
 */
export function isDevelopment(): boolean {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return true;
  }
}

export function creationOnlyWarning(key: string): string {
  return (
    `[agility-workbench] <Grid> prop "${key}" changed after the grid was created. It is read only ` +
    `at creation, so the change is ignored. Remount the grid to apply it (for example, change the ` +
    `<Grid>'s React key).`
  );
}

/**
 * Warn once per prop (per grid instance) when a creation-only prop differs from the value the grid
 * was created with.
 */
export function warnOnCreationOnlyChanges(
  props: GridProps,
  snapshot: CreationSnapshot,
  warned: Set<string>,
): void {
  for (const [key, created] of snapshot) {
    if (warned.has(key)) continue;
    const value = props[key as keyof GridProps];
    if (Object.is(value, created.value)) continue;
    const fingerprint = propFingerprint(key, value);
    if (fingerprint !== UNCOMPARABLE && fingerprint === created.fingerprint) continue;
    warned.add(key);
    console.warn(creationOnlyWarning(key));
  }
}
