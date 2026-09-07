import { describe, expect, it } from "vitest";
import { OcclusionAxis, planOcclusionEscape } from "./findOcclusion";

// A 260px-wide widget inset 8px from the right edge of an 800px viewport, which is where the
// quick-filter widget sits by default, and a 24px row strip under the header where it floats.
const WIDGET_X = { occluderStart: 532, occluderEnd: 792 };
const WIDGET_Y = { occluderStart: 6, occluderEnd: 42 };

function vertical(over: Partial<OcclusionAxis> = {}): OcclusionAxis {
  return {
    targetStart: 0,
    targetSize: 24,
    viewportSize: 400,
    ...WIDGET_Y,
    scroll: { current: 0, max: 1000 },
    ...over,
  };
}

function horizontal(over: Partial<OcclusionAxis> = {}): OcclusionAxis {
  return {
    targetStart: 600,
    targetSize: 120,
    viewportSize: 800,
    ...WIDGET_X,
    scroll: { current: 400, max: 1200 },
    ...over,
  };
}

describe("planOcclusionEscape", () => {
  it("does nothing when the match clears the widget on either axis", () => {
    // Same row as the widget, but far to its left.
    expect(planOcclusionEscape(vertical(), horizontal({ targetStart: 100 }))).toBeNull();
    // Same columns as the widget, but well below it.
    expect(planOcclusionEscape(vertical({ targetStart: 200 }), horizontal())).toBeNull();
  });

  it("does nothing when an axis could not be established", () => {
    expect(planOcclusionEscape(null, horizontal())).toBeNull();
    expect(planOcclusionEscape(vertical(), null)).toBeNull();
  });

  it("ignores a sub-pixel overlap", () => {
    // The match's trailing edge grazes the widget's leading edge.
    expect(planOcclusionEscape(vertical(), horizontal({ targetStart: 532 - 120 + 0.25 }))).toBeNull();
  });

  it("scrolls the match out sideways, keeping the row it is on", () => {
    // 600..720 overlaps the widget at 532..792. Parking it before the widget needs 720-532 = 188.
    const plan = planOcclusionEscape(vertical(), horizontal());
    expect(plan).toEqual({ scroll: { axis: "horizontal", offset: 400 + 188 }, dodge: false });
  });

  it("prefers whichever axis moves the grid least", () => {
    // The row is 8px into the widget's strip, so 8px of vertical scroll clears it against 188px of
    // horizontal — but only while the body has that much scrolled already to give back.
    const plan = planOcclusionEscape(
      vertical({ targetStart: 34, scroll: { current: 300, max: 1000 } }),
      horizontal(),
    );
    expect(plan).toEqual({ scroll: { axis: "vertical", offset: 300 - 8 }, dodge: false });
  });

  it("scrolls vertically when the column has nowhere left to go", () => {
    const plan = planOcclusionEscape(
      vertical({ targetStart: 30, scroll: { current: 300, max: 1000 } }),
      // Last column, scrolled fully right: it cannot move either way.
      horizontal({ targetStart: 680, targetSize: 120, scroll: { current: 1200, max: 1200 } }),
    );
    expect(plan).toEqual({ scroll: { axis: "vertical", offset: 300 - 12 }, dodge: false });
  });

  it("dodges for the first row's last cell — the case neither axis can scroll", () => {
    const plan = planOcclusionEscape(
      // Top row, body at the top of its range: the content cannot move down.
      vertical({ targetStart: 0, scroll: { current: 0, max: 1000 } }),
      // Last column, centre section scrolled fully right.
      horizontal({ targetStart: 680, targetSize: 120, scroll: { current: 1200, max: 1200 } }),
    );
    expect(plan).toEqual({ dodge: true });
  });

  it("dodges for a pinned column, which no scroll can move", () => {
    const plan = planOcclusionEscape(
      vertical({ targetStart: 0, scroll: { current: 0, max: 1000 } }),
      // A right-pinned section is its own 160px box, and the widget covers its right end.
      { targetStart: 40, targetSize: 120, viewportSize: 160, occluderStart: 20, occluderEnd: 150, scroll: null },
    );
    expect(plan).toEqual({ dodge: true });
  });

  it("dodges for a row frozen into a band, which no scroll can move", () => {
    const plan = planOcclusionEscape(
      vertical({ targetStart: 10, scroll: null }),
      horizontal({ targetStart: 680, targetSize: 120, scroll: { current: 1200, max: 1200 } }),
    );
    expect(plan).toEqual({ dodge: true });
  });

  it("will not squeeze the match into the gutter beside an edge-anchored widget", () => {
    // Scrolling back far enough to put the cell right of the widget would hang it off the viewport:
    // only 8px of the 800px viewport is left there, and the cell is 120px wide.
    const plan = planOcclusionEscape(
      vertical({ targetStart: 0, scroll: { current: 0, max: 1000 } }),
      horizontal({ targetStart: 660, scroll: { current: 300, max: 1200 } }),
    );
    // So it goes the other way, to the widget's left: 660 + 120 - 532 = 248.
    expect(plan).toEqual({ scroll: { axis: "horizontal", offset: 300 + 248 }, dodge: false });
  });

  it("escapes to the trailing side of a left-anchored widget", () => {
    const leftWidget = { occluderStart: 8, occluderEnd: 268 };
    const plan = planOcclusionEscape(
      vertical({ targetStart: 0, scroll: { current: 0, max: 1000 } }),
      horizontal({ targetStart: 200, ...leftWidget, scroll: { current: 400, max: 1200 } }),
    );
    // Leading edge to 268 means scrolling back 68; the cell ends at 388, well inside the viewport.
    expect(plan).toEqual({ scroll: { axis: "horizontal", offset: 400 - 68 }, dodge: false });
  });

  it("never scrolls outside the scroller's range", () => {
    const plan = planOcclusionEscape(
      vertical(),
      // 4px of range left, and 188px wanted: infeasible, so this must not clamp its way to a plan.
      horizontal({ scroll: { current: 1196, max: 1200 } }),
    );
    expect(plan).toEqual({ dodge: true });
  });

  it("takes the match wholly clear of a widget grown by its options popover", () => {
    // The popover makes the widget 160px tall, covering several rows; the escape has to clear all
    // of it, not just the row's own overlap.
    const plan = planOcclusionEscape(
      vertical({ targetStart: 40, occluderStart: 6, occluderEnd: 166, scroll: { current: 500, max: 1000 } }),
      horizontal({ scroll: { current: 1200, max: 1200 } }),
    );
    expect(plan).toEqual({ scroll: { axis: "vertical", offset: 500 - 126 }, dodge: false });
  });
});
