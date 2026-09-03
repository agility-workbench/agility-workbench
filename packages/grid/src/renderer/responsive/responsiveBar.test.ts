// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ResponsiveBar,
  type BarItemStage,
  type ResponsiveBarFit,
  type ResponsiveBarItem,
  type ResponsiveBarMode,
  type ResponsiveBarStep,
} from "./responsiveBar";

/**
 * happy-dom has no layout engine, so the fit check is fed by a model: each item declares what it
 * would occupy at each stage, and the harness sums the visible ones. The engine's job is the ladder
 * walk, so that is what these tests pin — stages and depth, never pixels.
 */
const WIDTHS: Record<string, Partial<Record<BarItemStage, number>>> = {
  views: { full: 120, compact: 42, overflow: 0 },
  group: { full: 260, compact: 170, summary: 110, overflow: 0 },
  sort: { full: 220, compact: 150, summary: 100, overflow: 0 },
  search: { full: 200, compact: 130, summary: 42 },
  export: { full: 100, compact: 42, overflow: 0 },
  columns: { full: 110, compact: 42, overflow: 0 },
};

const LADDER: ResponsiveBarStep[] = [
  { id: "captions", barClass: "compact-captions" },
  { id: "group:compact", itemId: "group", stage: "compact" },
  { id: "sort:compact", itemId: "sort", stage: "compact" },
  { id: "search:compact", itemId: "search", stage: "compact" },
  { id: "sort:summary", itemId: "sort", stage: "summary" },
  { id: "group:summary", itemId: "group", stage: "summary" },
  { id: "export:overflow", itemId: "export", stage: "overflow" },
  { id: "views:overflow", itemId: "views", stage: "overflow" },
  { id: "sort:overflow", itemId: "sort", stage: "overflow" },
  { id: "group:overflow", itemId: "group", stage: "overflow" },
  { id: "search:summary", itemId: "search", stage: "summary" },
  { id: "columns:overflow", itemId: "columns", stage: "overflow" },
];

/** Applying the "captions" rung shaves a fixed amount off every item that has a caption. */
const CAPTION_SAVING = 30;

/** What one more chip costs a list, so a stage's degree changes the modelled width. */
const LEVEL_STEP = 40;

type Harness = {
  bar: HTMLElement;
  responsive: ResponsiveBar;
  items: ResponsiveBarItem[];
  stageOf: (id: string) => BarItemStage;
  levelOf: (id: string) => number | undefined;
  setWidth: (width: number) => void;
  /** Overrides a single stage width, standing in for a content change (a longer view name). */
  setItemWidth: (id: string, stage: BarItemStage, width: number) => void;
  pin: (id: string, pinned: boolean) => void;
};

function makeBar(options: {
  mode?: ResponsiveBarMode;
  fallbackFocus?: () => HTMLElement | null;
  ladder?: ResponsiveBarStep[];
  itemIds?: string[];
  onFit?: (fit: ResponsiveBarFit) => void;
} = {}): Harness {
  const bar = document.createElement("div");
  document.body.appendChild(bar);
  const widths: Record<string, Partial<Record<BarItemStage, number>>> =
    JSON.parse(JSON.stringify(WIDTHS));
  const stages = new Map<string, BarItemStage>();
  const levels = new Map<string, number | undefined>();
  const pinned = new Set<string>();
  let available = 1200;

  const ids = options.itemIds ?? Object.keys(WIDTHS);
  const items: ResponsiveBarItem[] = ids.map(id => {
    const el = document.createElement("div");
    el.dataset.itemId = id;
    bar.appendChild(el);
    const supported = Object.keys(widths[id]) as BarItemStage[];
    return {
      id,
      el,
      stages: supported,
      applyStage: (stage, level) => {
        stages.set(id, stage);
        levels.set(id, level);
        el.dataset.stage = stage;
        el.dataset.level = level == null ? "" : String(level);
      },
      isPinned: (stage) => pinned.has(id) || pinned.has(`${id}:${stage}`),
    };
  });

  const contentWidth = () => {
    const captionsOff = bar.classList.contains("compact-captions");
    let total = 0;
    for (const item of items) {
      const stage = stages.get(item.id) ?? "full";
      const base = widths[item.id][stage] ?? 0;
      if (base === 0) continue;
      const width = base + (levels.get(item.id) ?? 0) * LEVEL_STEP;
      total += captionsOff ? Math.max(width - CAPTION_SAVING, 24) : width;
    }
    return total;
  };

  const responsive = new ResponsiveBar({
    bar,
    scrollClass: "bar-scrolling",
    items: () => items,
    ladder: () => options.ladder ?? LADDER,
    mode: () => options.mode ?? "collapse",
    fallbackFocus: options.fallbackFocus,
    onFit: options.onFit,
    measureContentWidth: contentWidth,
    measureAvailableWidth: () => available,
  });

  return {
    bar,
    responsive,
    items,
    stageOf: (id) => stages.get(id) ?? "full",
    levelOf: (id) => levels.get(id),
    setWidth: (width) => {
      available = width;
      responsive.refresh();
    },
    setItemWidth: (id, stage, width) => {
      widths[id][stage] = width;
      responsive.refresh();
    },
    pin: (id, value) => {
      if (value) pinned.add(id);
      else pinned.delete(id);
      responsive.refresh();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("responsive bar ladder", () => {
  it("leaves everything at its richest stage when the bar is wide enough", () => {
    const bar = makeBar();
    bar.setWidth(1200);

    expect(bar.responsive.getDepth()).toBe(0);
    expect(bar.responsive.isScrolling()).toBe(false);
    expect(bar.bar.classList.contains("compact-captions")).toBe(false);
    for (const item of bar.items) expect(bar.stageOf(item.id)).toBe("full");
  });

  it("walks the ladder one rung at a time as the bar narrows", () => {
    const bar = makeBar();
    const seen: Array<[number, number]> = [];
    for (const width of [1200, 900, 750, 600, 460, 300, 150]) {
      bar.setWidth(width);
      seen.push([width, bar.responsive.getDepth()]);
    }

    // Depth never decreases as the bar narrows: the ladder is a total order.
    const depths = seen.map(([, depth]) => depth);
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    expect(depths[0]).toBe(0);
    expect(depths[depths.length - 1]).toBeGreaterThan(depths[0]);
  });

  it("hides captions before it degrades any single control", () => {
    const bar = makeBar();
    bar.setWidth(1200);
    expect(bar.bar.classList.contains("compact-captions")).toBe(false);

    // 1010 is the full width (1010px) minus a little: the cheapest rung alone should cover it.
    bar.setWidth(1000);
    expect(bar.bar.classList.contains("compact-captions")).toBe(true);
    expect(bar.responsive.getDepth()).toBe(1);
    for (const item of bar.items) expect(bar.stageOf(item.id)).toBe("full");
  });

  it("displaces the lowest-priority controls into the overflow menu first", () => {
    const bar = makeBar();
    bar.setWidth(420);

    expect(bar.responsive.getOverflowedItemIds()).toContain("export");
    expect(bar.stageOf("columns")).not.toBe("overflow");
  });

  it("keeps Columns in the bar the longest, and reports the overflow set in ladder order", () => {
    const bar = makeBar();
    // 120px still fits the collapsed set (a summary search box and an icon Columns), which is the
    // point: Columns is only displaced by the very last rung.
    bar.setWidth(120);
    expect(bar.stageOf("columns")).not.toBe("overflow");
    expect(bar.stageOf("search")).toBe("summary");

    bar.setWidth(20);
    expect(bar.responsive.getOverflowedItemIds())
      .toEqual(["export", "views", "sort", "group", "columns"]);
  });

  it("scrolls only once the last rung still does not fit", () => {
    const bar = makeBar();
    bar.setWidth(400);
    expect(bar.responsive.isScrolling()).toBe(false);
    expect(bar.bar.classList.contains("bar-scrolling")).toBe(false);

    // Every rung applied and the collapsed set still does not fit: the bar has to scroll.
    bar.setWidth(10);
    expect(bar.responsive.isScrolling()).toBe(true);
    expect(bar.bar.classList.contains("bar-scrolling")).toBe(true);
  });

  it("restores richer stages as the bar grows back, and never flaps at a threshold", () => {
    const bar = makeBar();
    const snapshot = () => bar.items.map(item => `${item.id}:${bar.stageOf(item.id)}`).join(" ");

    const widths = [1200, 900, 700, 500, 380, 500, 700, 900, 1200];
    const byWidth = new Map<number, string>();
    for (const width of widths) {
      bar.setWidth(width);
      const state = snapshot();
      // Same width, same layout — whichever direction the resize arrived from.
      if (byWidth.has(width)) expect(state).toBe(byWidth.get(width));
      byWidth.set(width, state);
    }
    bar.setWidth(1200);
    expect(bar.responsive.getDepth()).toBe(0);

    // And a width crossed repeatedly settles on one answer rather than oscillating.
    const repeats = new Set<string>();
    for (let i = 0; i < 5; i++) {
      bar.setWidth(640);
      repeats.add(snapshot());
      bar.setWidth(641);
      bar.setWidth(640);
      repeats.add(snapshot());
    }
    expect(repeats.size).toBe(1);
  });
});

describe("responsive bar pinning", () => {
  it("passes over a pinned item and takes the ladder's next rung instead", () => {
    const bar = makeBar();
    bar.setWidth(460);
    const unpinnedSort = bar.stageOf("sort");
    expect(unpinnedSort).not.toBe("full");

    bar.pin("sort", true);
    bar.setWidth(460);
    expect(bar.stageOf("sort")).toBe("full");
    // Something else had to give for the same width.
    expect(bar.stageOf("group")).not.toBe("full");
  });

  it("does not stall on a pinned item: the pass still reaches the rungs below it", () => {
    const bar = makeBar();
    for (const id of ["group", "sort", "search"]) bar.pin(id, true);
    bar.setWidth(300);

    expect(bar.stageOf("group")).toBe("full");
    expect(bar.stageOf("sort")).toBe("full");
    expect(bar.responsive.getOverflowedItemIds()).toContain("export");
  });
});

describe("responsive bar focus", () => {
  it("moves focus to the fallback when the focused control is displaced", () => {
    const fallback = document.createElement("button");
    document.body.appendChild(fallback);
    const bar = makeBar({ fallbackFocus: () => fallback });

    const exportEl = bar.items.find(item => item.id === "export")!.el as HTMLElement;
    const focusable = document.createElement("button");
    exportEl.appendChild(focusable);
    focusable.focus();
    expect(document.activeElement).toBe(focusable);

    bar.setWidth(420);
    expect(bar.stageOf("export")).toBe("overflow");
    expect(document.activeElement).toBe(fallback);
  });

  it("prefers the item's own refocus target over the bar fallback", () => {
    const fallback = document.createElement("button");
    const summaryButton = document.createElement("button");
    document.body.append(fallback, summaryButton);
    const bar = makeBar({ fallbackFocus: () => fallback });
    const sort = bar.items.find(item => item.id === "sort")!;
    sort.refocusTarget = (stage) => (stage === "summary" ? summaryButton : null);

    const focusable = document.createElement("button");
    (sort.el as HTMLElement).appendChild(focusable);
    focusable.focus();

    bar.setWidth(460);
    expect(bar.stageOf("sort")).toBe("summary");
    expect(document.activeElement).toBe(summaryButton);
  });

  it("leaves focus alone when the focused control keeps its place", () => {
    const fallback = document.createElement("button");
    document.body.appendChild(fallback);
    const bar = makeBar({ fallbackFocus: () => fallback });

    const columnsEl = bar.items.find(item => item.id === "columns")!.el as HTMLElement;
    const focusable = document.createElement("button");
    columnsEl.appendChild(focusable);
    focusable.focus();

    bar.setWidth(1000);
    expect(document.activeElement).toBe(focusable);
  });
});

describe("responsive bar modes", () => {
  it("scroll mode never degrades a control — it only marks the bar scrollable", () => {
    const bar = makeBar({ mode: "scroll" });
    bar.setWidth(300);

    expect(bar.responsive.getDepth()).toBe(0);
    expect(bar.responsive.isScrolling()).toBe(true);
    for (const item of bar.items) expect(bar.stageOf(item.id)).toBe("full");
  });

  it("false lays the bar out and lets it clip", () => {
    const bar = makeBar({ mode: false });
    bar.setWidth(120);

    expect(bar.responsive.getDepth()).toBe(0);
    expect(bar.responsive.isScrolling()).toBe(false);
    expect(bar.bar.classList.contains("bar-scrolling")).toBe(false);
    for (const item of bar.items) expect(bar.stageOf(item.id)).toBe("full");
  });
});

describe("responsive bar re-decisions", () => {
  it("re-fits when the contents change at an unchanged width", () => {
    const bar = makeBar();
    bar.setWidth(1000);
    const before = bar.responsive.getDepth();

    // A saved view with a long name, or a page picker that grew to four digits.
    bar.setItemWidth("views", "full", 420);
    expect(bar.responsive.getDepth()).toBeGreaterThan(before);
  });

  it("treats a bar with no width as fitting, so a hidden bar is not collapsed", () => {
    const bar = makeBar();
    bar.setWidth(0);

    expect(bar.responsive.getDepth()).toBe(0);
    expect(bar.responsive.isScrolling()).toBe(false);
  });

  it("falls back to an item's poorest stage when the ladder asks for one it lacks", () => {
    const bar = makeBar({
      itemIds: ["search"],
      ladder: [{ id: "search:overflow", itemId: "search", stage: "overflow" }],
    });
    // The quick filter has no `overflow` stage: it collapses to `summary` and stays reachable.
    bar.setWidth(10);
    expect(bar.stageOf("search")).toBe("summary");
  });

  it("reports a fit only when the outcome changed", () => {
    const onFit = vi.fn();
    const bar = makeBar({ onFit });

    bar.setWidth(1200);
    bar.setWidth(1200);
    bar.setWidth(1199);
    // Three refreshes, one settled layout: a resize that changes nothing reports nothing.
    expect(onFit).toHaveBeenCalledTimes(0);

    bar.setWidth(300);
    expect(onFit).toHaveBeenCalledTimes(1);
    expect(onFit.mock.calls[0][0].depth).toBeGreaterThan(0);
    expect(onFit.mock.calls[0][0].stages.get("export")).toBe("overflow");
  });
});

describe("responsive bar stages with degrees", () => {
  it("gives a chip list up one chip at a time before collapsing the section", () => {
    // A three-chip list: `compact` at level k shows k chips and folds the rest into a `+N`.
    const bar = makeBar({
      itemIds: ["group", "columns"],
      ladder: [
        { id: "group:compact:2", itemId: "group", stage: "compact", level: 2 },
        { id: "group:compact:1", itemId: "group", stage: "compact", level: 1 },
        { id: "group:compact:0", itemId: "group", stage: "compact", level: 0 },
        { id: "group:summary", itemId: "group", stage: "summary" },
      ],
    });

    // Modelled: full 260, compact 170 + 40/chip, summary 110, beside a 110px Columns.
    bar.setWidth(400);
    expect(bar.stageOf("group")).toBe("full");

    bar.setWidth(365);
    expect(bar.stageOf("group")).toBe("compact");
    expect(bar.levelOf("group")).toBe(2);

    bar.setWidth(325);
    expect(bar.levelOf("group")).toBe(1);

    bar.setWidth(285);
    expect(bar.levelOf("group")).toBe(0);

    bar.setWidth(230);
    expect(bar.stageOf("group")).toBe("summary");
    expect(bar.levelOf("group")).toBeUndefined();
  });

  it("re-applies the resting stage on reset even when only the level differed", () => {
    const applied: Array<string> = [];
    const bar = makeBar({
      itemIds: ["group"],
      ladder: [
        { id: "group:compact:1", itemId: "group", stage: "compact", level: 1 },
        { id: "group:compact:0", itemId: "group", stage: "compact", level: 0 },
      ],
    });
    const group = bar.items[0];
    const inner = group.applyStage;
    group.applyStage = (stage, level) => {
      applied.push(`${stage}:${level ?? "-"}`);
      inner(stage, level);
    };

    bar.setWidth(200);
    // Two degrees of one stage are two distinct presentations, not a no-op the dedupe swallows.
    expect(applied).toContain("compact:1");
    expect(applied).toContain("compact:0");

    applied.length = 0;
    bar.setWidth(1200);
    expect(applied).toEqual(["full:-"]);
  });
});

describe("responsive bar pinning by stage", () => {
  it("pins against one stage while still allowing a narrower one", () => {
    const bar = makeBar();
    // The quick filter may narrow, but must not become an icon while it is in use.
    bar.pin("search:summary", true);

    bar.setWidth(640);
    expect(bar.stageOf("search")).toBe("compact");

    bar.setWidth(20);
    expect(bar.stageOf("search")).toBe("compact");
    expect(bar.responsive.isScrolling()).toBe(true);
  });
});

describe("responsive bar furniture", () => {
  /**
   * A bar's overflow button is shown only while it holds something, so it enters the layout in the
   * middle of a ladder — and until `syncFurniture` existed it entered *after* the pass had decided,
   * leaving the bar overflowing by exactly the button's width with no scroll fallback and nothing
   * to trigger another pass.
   */
  function makeFurnishedBar(): {
    bar: HTMLElement;
    responsive: ResponsiveBar;
    content: () => number;
    setWidth: (width: number) => void;
  } {
    const bar = document.createElement("div");
    document.body.appendChild(bar);
    const BUTTON = 42;
    const stages = new Map<string, BarItemStage>();
    let available = 400;
    const ids = ["a", "b", "c"];
    const items: ResponsiveBarItem[] = ids.map(id => ({
      id,
      stages: ["full", "overflow"],
      applyStage: stage => stages.set(id, stage),
    }));
    const content = () => ids.reduce(
      (total, id) => total + (stages.get(id) === "overflow" ? 0 : 100),
      // The furniture is measured the way the real one is: from the class, so it counts only once
      // the bar has been told to show it.
      bar.classList.contains("has-overflow") ? BUTTON : 0,
    );
    const responsive = new ResponsiveBar({
      bar,
      scrollClass: "bar-scrolling",
      items: () => items,
      ladder: () => ids.map(id => ({ id: `${id}:overflow`, itemId: id, stage: "overflow" as const })),
      syncFurniture: () => {
        const displaced = responsive.getOverflowedItemIds().length > 0;
        bar.classList.toggle("has-overflow", displaced);
      },
      measureContentWidth: content,
      measureAvailableWidth: () => available,
    });
    return {
      bar,
      responsive,
      content,
      setWidth: width => { available = width; responsive.refresh(); },
    };
  }

  it("counts the overflow button from the rung that fills it, so a pass cannot end too wide", () => {
    const bar = makeFurnishedBar();

    // 300 of controls into 210: displacing one leaves 200, which fits — until the button the rung
    // just revealed takes it back to 242. The next rung is the one that actually fits.
    bar.setWidth(210);
    expect(bar.bar.classList.contains("has-overflow")).toBe(true);
    expect(bar.content()).toBeLessThanOrEqual(210);
    expect(bar.responsive.getDepth()).toBe(2);
    expect(bar.responsive.isScrolling()).toBe(false);
  });

  it("takes the button back out of the layout when the bar grows again", () => {
    const bar = makeFurnishedBar();
    bar.setWidth(210);
    expect(bar.bar.classList.contains("has-overflow")).toBe(true);

    // The reset at the top of the pass has to un-furnish the bar too, or the first fit check
    // measures a button that the state it is judging does not have.
    bar.setWidth(400);
    expect(bar.bar.classList.contains("has-overflow")).toBe(false);
    expect(bar.content()).toBe(300);
    expect(bar.responsive.getDepth()).toBe(0);
  });
});
