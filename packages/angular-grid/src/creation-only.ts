import { CREATION_ONLY_OPTION_KEYS } from "@agility-workbench/grid";

/**
 * Core creation-only options the Angular binding keeps live anyway: the value-returning hooks and
 * `multiColumnMenu` are read through their input signals on every call. (The event callbacks are
 * outputs, not inputs, so they never reach this list.) Everything else in core's
 * {@link CREATION_ONLY_OPTION_KEYS} that `<awb-grid>` declares as an input is fixed once the grid
 * exists.
 */
const BRIDGED_INPUTS: ReadonlySet<string> = new Set([
  "onBeforeCellCommit",
  "fillOperation",
  "multiColumnMenu",
]);

/** Core creation-only option names minus the inputs the binding bridges (derived from core). */
export const CREATION_ONLY_INPUT_CANDIDATES: readonly string[] = CREATION_ONLY_OPTION_KEYS.filter(
  (key) => !BRIDGED_INPUTS.has(key),
);

/** The `treeData` members the binding reconciles live (via setTreeDataKeyboardNavigationOptions). */
const LIVE_TREE_DATA_KEYS = ["keyboardNavigationMode", "enableKeyboardNavigationModeSwitch"];

export const UNCOMPARABLE = Symbol("uncomparable");

/**
 * A structural fingerprint of an input value, so a template literal object or a function re-created
 * with the same contents does not count as a change. Functions (and component classes) compare by
 * source text; `treeData` ignores the members that are live. Values that cannot be serialized
 * (cycles) compare by identity.
 */
export function inputFingerprint(key: string, value: unknown): string | typeof UNCOMPARABLE {
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

export function creationOnlyWarning(key: string): string {
  return (
    `[agility-workbench] <awb-grid> input "${key}" changed after the grid was created. It is read ` +
    `only at creation, so the change is ignored. Re-create the grid to apply it (for example, ` +
    `render it under an @if or a keyed @for so Angular destroys and creates a new <awb-grid>).`
  );
}
