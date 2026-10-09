/**
 * Tree layout for the set filter (`filter: "tree"`). The value universe `setFilterCore` builds is
 * regrouped under synthetic GROUP rows along a path per value — a date under its year and month, a
 * product under its category — and rendered as an indented, collapsible list.
 *
 * The universe stays FLAT: the option array remains one pre-order list, a group immediately followed
 * by its subtree, so the controller's index-addressed toggles, the renderer's row loop, and the
 * stored filter model are untouched. Groups are never stored. Checking one checks its descendant
 * leaves, and the def still holds leaf raws, so the client filter, the server-side contract, and the
 * Set Filter API see exactly what they see for a flat set filter.
 *
 * Two flags on each option drive what is on screen, and they are independent:
 *  - `hidden` — the mini filter's verdict (a leaf matches by its own label or an ancestor's; a group
 *    stays while any descendant leaf does);
 *  - `expanded` — the user's expansion state on a group, defaulted from `treeDefaultExpanded`.
 * `visibleSetOptions` combines them. While a mini filter is typed, every surviving group renders
 * expanded so the matches are in view; clearing it restores the user's expansion state untouched.
 *
 * Blanks keep their own row above the tree: a blank has no value to take a path from, and the row
 * is the grid's, exactly as in the flat layout.
 */
import { FilterDef, FilterType } from "../interfaces/filter";
import { SetFilterOptions } from "./types";
import {
  checkedKeySet,
  defaultValueKey,
  defFromCheckedKeys,
  isValueChecked,
  isValueOption,
  SetFilterComparable,
  SetFilterComparator,
  ValueKeyFn,
} from "./setFilterCore";

export interface SetFilterTreeSpec {
  /**
   * The path of a value in the tree, root first, leaf last; null/empty puts the value at the root
   * with its ordinary label. All but the last segment become groups.
   */
  pathOf: (value: any) => any[] | null | undefined;
  /** Formats one path segment for display. */
  formatSegment: (segment: any, level: number, parentPath: any[]) => string;
  /** Mirrors `groupDefaultExpanded`: 0 = all collapsed, N = first N levels open, -1 = all open. */
  defaultExpanded: number;
  /** Orders siblings at every level in place of the built-in rule; sees segment, level, path, and a leaf's value. */
  compare?: SetFilterComparator;
}

/** Group keys live in their own namespace, beside the "v:" value keys and the synthetic rows. */
const GROUP_KEY_PREFIX = "g:";
const SEGMENT_SEPARATOR = "\u001f";

function segmentKey(segment: any): string {
  if (segment instanceof Date) return "d" + segment.getTime();
  if (segment !== null && typeof segment === "object") return "o" + JSON.stringify(segment);
  return typeof segment + ":" + String(segment);
}

/** Identity of a path: segments compare by type and value, as the tree built them. */
export function pathKey(path: any[]): string {
  return path.map(segmentKey).join(SEGMENT_SEPARATOR);
}

function groupKey(path: any[]): string {
  return GROUP_KEY_PREFIX + pathKey(path);
}

/** Siblings sort by their segment when both are numbers or dates, else by label — as the flat list does. */
function compareSiblings(a: { segment: any; label: string }, b: { segment: any; label: string }): number {
  if (typeof a.segment === "number" && typeof b.segment === "number") return a.segment - b.segment;
  if (a.segment instanceof Date && b.segment instanceof Date) return a.segment.getTime() - b.segment.getTime();
  return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
}

interface GroupNode {
  kind: "group";
  segment: any;
  label: string;
  key: string;
  path: any[];
  level: number;
  children: Map<string, GroupNode>;
  items: TreeItem[];
}

interface LeafNode {
  kind: "leaf";
  segment: any;
  label: string;
  /** The value's full path, or undefined for a value placed at the root without one. */
  path?: any[];
  option: SetFilterOptions;
}

type TreeItem = GroupNode | LeafNode;

/**
 * Regroup a flat universe (select_all, blanks?, values) into the tree layout. Returns a new array:
 * the synthetic rows first, then the tree in pre-order with `level`/`parentKey` on every row and
 * `expanded` on each group. Counts, when the leaves carry them, roll up into their groups.
 */
export function buildSetFilterTree(options: SetFilterOptions[], spec: SetFilterTreeSpec): SetFilterOptions[] {
  const root: GroupNode = { kind: "group", segment: undefined, label: "", key: "", path: [], level: -1, children: new Map(), items: [] };
  const counted = options.some(o => o.type === "value" && o.count !== undefined);

  for (const option of options) {
    if (option.type !== "value") continue;
    const path = spec.pathOf(option.raw) ?? [];
    let parent = root;
    for (let depth = 0; depth < path.length - 1; depth++) {
      const key = segmentKey(path[depth]);
      let group = parent.children.get(key);
      if (!group) {
        const groupPath = path.slice(0, depth + 1);
        group = {
          kind: "group",
          segment: path[depth],
          label: spec.formatSegment(path[depth], depth, path.slice(0, depth)),
          key: groupKey(groupPath),
          path: groupPath,
          level: depth,
          children: new Map(),
          items: [],
        };
        parent.children.set(key, group);
        parent.items.push(group);
      }
      parent = group;
    }
    const last = path.length - 1;
    parent.items.push({
      kind: "leaf",
      segment: last >= 0 ? path[last] : undefined,
      // A value without a path keeps the label the flat layout gave it.
      label: last >= 0 ? spec.formatSegment(path[last], last, path.slice(0, last)) : option.label,
      path: last >= 0 ? path : undefined,
      option,
    });
  }

  const comparable = (item: TreeItem, parentLevel: number): SetFilterComparable => item.kind === "group"
    ? { label: item.label, segment: item.segment, level: item.level, path: item.path }
    : { value: item.option.raw, label: item.label, segment: item.segment, level: parentLevel + 1, path: item.path };

  const out: SetFilterOptions[] = options.filter(o => o.type === "select_all" || o.type === "blanks");
  const flatten = (node: GroupNode, parentKey: string | undefined): number => {
    const compare = spec.compare;
    node.items.sort(compare
      ? (a, b) => compare(comparable(a, node.level), comparable(b, node.level))
      : compareSiblings);
    let count = 0;
    for (const item of node.items) {
      if (item.kind === "leaf") {
        out.push({ ...item.option, label: item.label, level: node.level + 1, parentKey, path: item.path });
        count += item.option.count ?? 0;
        continue;
      }
      const row: SetFilterOptions = {
        type: "group",
        key: item.key,
        label: item.label,
        raw: item.key,
        hidden: false,
        level: item.level,
        parentKey,
        expanded: spec.defaultExpanded === -1 || item.level < spec.defaultExpanded,
        path: item.path,
      };
      out.push(row);
      const subtotal = flatten(item, item.key);
      if (counted) row.count = subtotal;
      count += subtotal;
    }
    return count;
  };
  flatten(root, undefined);
  return out;
}

/**
 * Index of the row a path names: the group with that path, else the leaf whose full path it is
 * (a ragged tree can hold both — the group wins, since the path means "all of it"); -1 if none.
 * Values placed at the root without a path are not addressable this way — use their value.
 */
export function findSetFilterPath(options: SetFilterOptions[], path: any[]): number {
  const key = pathKey(path);
  let leaf = -1;
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    if (!o.path || pathKey(o.path) !== key) continue;
    if (o.type === "group") return i;
    if (leaf < 0) leaf = i;
  }
  return leaf;
}

/** One node of the value tree as the API reports it (`IGridAPI.getSetFilterTree`). */
export interface SetFilterTreeNode {
  /** Path segments from the root to this node; empty for the blanks bucket and for a root value without a path. */
  path: unknown[];
  /** The label the menu shows. */
  label: string;
  /** Loaded-row count when `showValueCounts` is on; a group's is its leaves' sum. */
  count?: number;
  /** Whether the leaf is checked (visible), or every leaf beneath the group is; "mixed" for a partly checked group. */
  checked: boolean | "mixed";
  /** Group: the nodes beneath it. Absent on a leaf. */
  children?: SetFilterTreeNode[];
  /** Leaf: the raw value (null for the blanks bucket). Absent on a group. */
  value?: unknown;
}

/** Nest the pre-order option list into tree nodes, with each row's state folded in; select_all is not a node. */
export function setFilterTreeNodes(options: SetFilterOptions[], states: SetOptionState[]): SetFilterTreeNode[] {
  const roots: SetFilterTreeNode[] = [];
  const open: { node: SetFilterTreeNode; level: number }[] = [];
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    if (o.type === "select_all") continue;
    const level = o.level ?? 0;
    while (open.length > 0 && open[open.length - 1].level >= level) open.pop();
    const state = states[i];
    const node: SetFilterTreeNode = {
      path: o.path ? [...o.path] : [],
      label: o.label,
      checked: state.indeterminate ? "mixed" : state.selected,
    };
    if (o.count !== undefined) node.count = o.count;
    if (o.type === "group") node.children = [];
    else node.value = o.raw;
    (open.length > 0 ? open[open.length - 1].node.children! : roots).push(node);
    if (o.type === "group") open.push({ node, level });
  }
  return roots;
}

/** Whether the universe has any group rows (a tree column whose values have no paths renders flat). */
export function hasSetFilterGroups(options: SetFilterOptions[]): boolean {
  return options.some(o => o.type === "group");
}

/** How much of the tree is open: the state the root's chevron paints. */
export type GroupExpansion = "all" | "none" | "some";

/**
 * The select_all row doubles as the tree's root: its chevron reports whether every group is open,
 * none is, or only some are, and toggling it opens or closes them all. A universe without groups
 * is trivially all open.
 */
export function groupExpansion(options: SetFilterOptions[]): GroupExpansion {
  let open = 0;
  let closed = 0;
  for (const o of options) {
    if (o.type !== "group") continue;
    if (o.expanded) open++;
    else closed++;
  }
  if (closed === 0) return "all";
  return open === 0 ? "none" : "some";
}

export function setAllGroupsExpanded(options: SetFilterOptions[], expanded: boolean): void {
  for (const o of options) {
    if (o.type === "group") o.expanded = expanded;
  }
}

/** Exclusive end index of the subtree rooted at `groupIdx` (the group itself plus every descendant). */
export function subtreeEnd(options: SetFilterOptions[], groupIdx: number): number {
  const level = options[groupIdx].level ?? 0;
  let end = groupIdx + 1;
  while (end < options.length && (options[end].level ?? 0) > level) end++;
  return end;
}

/** Index of the group enclosing the option at `idx`, or -1 at the root. */
export function parentIndex(options: SetFilterOptions[], idx: number): number {
  const parentKey = options[idx]?.parentKey;
  if (parentKey === undefined) return -1;
  for (let i = idx - 1; i >= 0; i--) {
    if (options[i].type === "group" && options[i].key === parentKey) return i;
  }
  return -1;
}

/**
 * The leaves a group stands for when checked or read: its descendant value/blanks rows that the
 * mini filter has not hidden. Without a mini filter nothing is hidden, so that is every descendant.
 */
export function groupLeafOptions(options: SetFilterOptions[], groupIdx: number): SetFilterOptions[] {
  const out: SetFilterOptions[] = [];
  const end = subtreeEnd(options, groupIdx);
  for (let i = groupIdx + 1; i < end; i++) {
    const o = options[i];
    if (isValueOption(o) && !o.hidden) out.push(o);
  }
  return out;
}

export interface SetOptionState {
  selected: boolean;
  indeterminate: boolean;
}

/**
 * The checkbox state of EVERY option, aligned with `options`, in one pass: the checked key set is
 * built once, each leaf answers from it, each group tallies the leaves beneath it that the mini
 * filter shows, and select_all tallies every leaf — or only the shown ones while a mini filter is
 * typed. A render asks for this once instead of once per row, which kept rescanning the option
 * list and the stored values for every row painted.
 *
 * Group and select_all rules, unchanged: all tallied leaves checked → checked (a group with none
 * is unchecked; select_all over an empty scope is checked), some → indeterminate.
 */
export function setOptionStates(
  def: Pick<FilterDef, "type" | "values"> | null,
  options: SetFilterOptions[],
  keyFn: ValueKeyFn = defaultValueKey,
  miniFilterActive = false,
): SetOptionState[] {
  const checked = checkedKeySet(def, options, keyFn);
  const states: SetOptionState[] = new Array(options.length);
  const tri = (checkedCount: number, total: number, emptyIsChecked: boolean): SetOptionState => ({
    selected: total === 0 ? emptyIsChecked : checkedCount === total,
    indeterminate: checkedCount > 0 && checkedCount < total,
  });

  // Groups whose subtree is being walked, outermost first, each with its running tally.
  const open: { idx: number; level: number; checked: number; total: number }[] = [];
  const close = () => {
    const frame = open.pop()!;
    states[frame.idx] = tri(frame.checked, frame.total, false);
  };
  let selectAllIdx = -1;
  let allChecked = 0;
  let allTotal = 0;

  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const level = o.level ?? 0;
    while (open.length > 0 && open[open.length - 1].level >= level) close();
    if (o.type === "select_all") {
      selectAllIdx = i;
      continue;
    }
    if (o.type === "group") {
      open.push({ idx: i, level, checked: 0, total: 0 });
      continue;
    }
    const isChecked = checked.has(o.key);
    states[i] = { selected: isChecked, indeterminate: false };
    if (!o.hidden) {
      for (const frame of open) {
        frame.total++;
        if (isChecked) frame.checked++;
      }
    }
    if (!miniFilterActive || !o.hidden) {
      allTotal++;
      if (isChecked) allChecked++;
    }
  }
  while (open.length > 0) close();
  if (selectAllIdx >= 0) states[selectAllIdx] = tri(allChecked, allTotal, true);
  return states;
}

/** A group's checkbox state: all leaves checked, none, or some (indeterminate). */
export function groupCheckState(
  def: Pick<FilterDef, "type" | "values"> | null,
  options: SetFilterOptions[],
  groupIdx: number,
  keyFn: ValueKeyFn = defaultValueKey,
): SetOptionState {
  return setOptionStates(def, options, keyFn)[groupIdx];
}

/** Check or uncheck every leaf under a group, in the same representation rules as a single toggle. */
export function toggleGroup(
  def: FilterDef | null,
  options: SetFilterOptions[],
  groupIdx: number,
  selected: boolean,
  keyFn: ValueKeyFn = defaultValueKey,
): FilterDef | null {
  const keys = checkedKeySet(def, options, keyFn);
  for (const leaf of groupLeafOptions(options, groupIdx)) {
    if (selected) keys.add(leaf.key);
    else keys.delete(leaf.key);
  }
  return defFromCheckedKeys(keys, options, {
    mode: def?.mode,
    preferType: def?.type === FilterType.IN ? FilterType.IN : FilterType.NOT_IN,
  });
}

/**
 * Apply the mini filter: sets `hidden` on every option. A leaf stays visible when its own label or
 * any ancestor group's label contains the text, so typing a year keeps the whole year in view; a
 * group stays visible while any of its leaves does. With no groups this is the flat rule — a row is
 * hidden unless its label matches — and select_all is never hidden.
 */
export function applySetMiniFilter(options: SetFilterOptions[], filter: string): void {
  const filterLc = filter.toLowerCase();
  // Enclosing groups of the row being visited, innermost last, each with its own match verdict.
  const ancestors: { group: SetFilterOptions; matches: boolean }[] = [];
  let matchingAncestors = 0;

  for (const o of options) {
    if (o.type === "select_all") {
      o.hidden = false;
      continue;
    }
    const level = o.level ?? 0;
    while (ancestors.length > level) {
      if (ancestors.pop()!.matches) matchingAncestors--;
    }
    const selfMatch = filterLc.length === 0 || o.label.toLowerCase().includes(filterLc);
    if (o.type === "group") {
      // Provisionally hidden; the first visible leaf beneath reveals it (and its ancestors).
      o.hidden = true;
      ancestors.push({ group: o, matches: selfMatch });
      if (selfMatch) matchingAncestors++;
      continue;
    }
    o.hidden = !(selfMatch || matchingAncestors > 0);
    if (!o.hidden) {
      for (const ancestor of ancestors) ancestor.group.hidden = false;
    }
  }
}

/**
 * Indices of the rows to render, in order: not hidden, and inside no collapsed group. `expandAll`
 * (set while a mini filter is active) treats every group as expanded without touching its state.
 */
export function visibleSetOptions(options: SetFilterOptions[], expandAll = false): number[] {
  const out: number[] = [];
  // Level of the nearest collapsed ancestor of the row being visited, or Infinity outside one.
  let collapsedAt = Infinity;
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const level = o.level ?? 0;
    if (level <= collapsedAt) collapsedAt = Infinity;
    if (collapsedAt !== Infinity || o.hidden) continue;
    out.push(i);
    if (o.type === "group" && !(expandAll || o.expanded)) collapsedAt = level;
  }
  return out;
}

const MONTH_NAMES = new Map<string, string[]>();

function monthNames(locale: string): string[] {
  let names = MONTH_NAMES.get(locale);
  if (!names) {
    const format = new Intl.DateTimeFormat(locale, { month: "long" });
    names = Array.from({ length: 12 }, (_, month) => format.format(new Date(2000, month, 1)));
    MONTH_NAMES.set(locale, names);
  }
  return names;
}

/**
 * The built-in path for dates: year › month › day, month as a number so siblings sort
 * chronologically; `defaultDateSegmentFormatter` turns the month into a name. `parse` is applied to
 * non-Date values (a date column holding ISO text); anything it rejects stays at the root.
 */
export function dateTreePath(parse: (value: any) => Date | null): (value: any) => any[] | null {
  return value => {
    const date = value instanceof Date ? value : parse(value);
    if (!date || Number.isNaN(date.getTime())) return null;
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  };
}

export function dateSegmentFormatter(locale = "en-US"): SetFilterTreeSpec["formatSegment"] {
  return (segment, level) => (level === 1 && typeof segment === "number" && segment >= 1 && segment <= 12)
    ? monthNames(locale)[segment - 1]
    : String(segment);
}

export const defaultSegmentFormatter: SetFilterTreeSpec["formatSegment"] = segment => String(segment);
