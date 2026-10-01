import { describe, expect, it } from "vitest";
import { groupRowLabel, IRowNode, isExpandableNode } from "./iRowNode";

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

describe("isExpandableNode", () => {
  const dataNode = (over: Partial<IRowNode> = {}): IRowNode => ({
    id: "d", data: {}, viewIndex: 0, selected: false, type: "leaf",
    isGroup: false, level: 0, isExpanded: false, ...over,
  });

  it("opens group rows, including server-side ones with no children array", () => {
    expect(isExpandableNode(groupNode())).toBe(true);
    expect(isExpandableNode(groupNode({ children: [dataNode()] }))).toBe(true);
  });

  it("opens a data row that owns children, or one flagged expandable", () => {
    // Client-side tree data materializes children…
    expect(isExpandableNode(dataNode({ isTreeData: true, children: [dataNode()] }))).toBe(true);
    // …a server-side tree parent cannot, so it says so instead.
    expect(isExpandableNode(dataNode({ isTreeData: true, expandable: true }))).toBe(true);
    expect(isExpandableNode(dataNode({ isTreeData: true }))).toBe(false);
    expect(isExpandableNode(dataNode())).toBe(false);
  });

  it("lets expandable: false overrule every other shape", () => {
    // Pivot mode's deepest level and its grand-total row can never open.
    expect(isExpandableNode(groupNode({ expandable: false }))).toBe(false);
    expect(isExpandableNode(groupNode({ expandable: false, children: [dataNode()] }))).toBe(false);
  });
});
