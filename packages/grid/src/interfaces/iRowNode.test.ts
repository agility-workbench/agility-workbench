import { describe, expect, it } from "vitest";
import { groupRowLabel, IRowNode } from "./iRowNode";

const groupNode = (over: Partial<IRowNode> = {}): IRowNode => ({
  id: "g", data: {}, viewIndex: 0, selected: false, type: "group",
  isGroup: true, level: 0, isExpanded: false, ...over,
});

describe("groupRowLabel", () => {
  it("appends the child count when the node carries one", () => {
    expect(groupRowLabel(groupNode({ groupKey: "EMEA", childCount: 2 }))).toBe("EMEA (2)");
    // Zero children is a real answer and says so.
    expect(groupRowLabel(groupNode({ groupKey: "EMEA", childCount: 0 }))).toBe("EMEA (0)");
  });

  it("omits the count entirely when the node has none", () => {
    // A server-side group whose data source supplies no count has no count — "(0)" would state
    // something false about the data.
    expect(groupRowLabel(groupNode({ groupKey: "EMEA" }))).toBe("EMEA");
  });

  it("prefers the raw group value, and a tree row's display key above that", () => {
    expect(groupRowLabel(groupNode({ groupKey: "2024", groupValue: 2024, childCount: 1 }))).toBe("2024 (1)");
    expect(groupRowLabel(groupNode({ groupKey: "eng", treeKey: "Engineering", childCount: 1 })))
      .toBe("Engineering (1)");
    // A blank group falls back to the key, which carries the blank placeholder.
    expect(groupRowLabel(groupNode({ groupKey: "(Blanks)", groupValue: "", childCount: 3 })))
      .toBe("(Blanks) (3)");
  });

  it("takes a caller-supplied count for a caller that computed one", () => {
    expect(groupRowLabel(groupNode({ groupKey: "EMEA" }), 4)).toBe("EMEA (4)");
  });
});
