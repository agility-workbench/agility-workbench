import { Column } from "./column";
import { ColumnHierarchy } from "./columnHierarchy";
import { ColumnModel } from "./columnModel";

export class ColumnMove {
  private hierarchy: ColumnHierarchy;
  constructor(private model: ColumnModel) {
    this.hierarchy = new ColumnHierarchy(model);
  }

  applyColumnReorder(col: Column, targetIndex: number, section: "left" | "center" | "right"): Column[] {
    if (targetIndex < 0) return [];

    const newLeft = this.model.getLeftColumns().slice();
    const newCenter = this.model.getCenterColumns().slice();
    const newRight = this.model.getRightColumns().slice();

    const targetSection = section === "left" ? newLeft : section === "right" ? newRight : newCenter;
    let targetArr = (section === "left" ? this.model.getLeftLeaves() : section === "right" ? this.model.getRightLeaves() : this.model.getCenterLeaves()).slice();
    const appendAtEnd = targetIndex >= targetArr.length;
    const firstRight = targetArr[targetIndex];

    const ancestors = this.model.getAncestors(col.instanceID);
    let topLevelDrag = col;
    if (ancestors.length > 1) {
      // Find the top-level ancestor that is reorderable
      for (const c of ancestors.slice(0, -1).reverse()) {
        if (c.getVisibleChildren().length > 1) {
          break;
        }
        topLevelDrag = c;
      }
    }
    const splitParent = ancestors.length > 1 && ancestors[0].instanceID != topLevelDrag.instanceID;

    if (splitParent) {
      topLevelDrag = this.hierarchy.newColumnHierarchy(ancestors, topLevelDrag);
    } else {
      const source = col.pinned === "left" ? newLeft : col.pinned === "right" ? newRight : newCenter;
      const idx = source.findIndex(c => c.instanceID === topLevelDrag.instanceID);
      if (idx >= 0) source.splice(idx, 1);
    }

    targetArr = targetSection.map(c => c.getVisibleLeaves()).flat();
    let moveTo = 0;
    if (firstRight) {
      const firstRightAncestors = this.model.getAncestors(firstRight.instanceID);
      moveTo = targetSection.findIndex(c => c.instanceID === firstRightAncestors[0].instanceID);
      if (firstRightAncestors.length > 1) {
        const [leftTree, rightTree] = this.hierarchy.splitTreeAtColumn(firstRightAncestors[0], firstRight);
        if (leftTree) {
          targetSection[moveTo] = leftTree;
          moveTo++;
        }
        if (rightTree) {
          targetSection.splice(moveTo, 0, rightTree);
        } else {
          moveTo--;
        }
      }
    } else if (appendAtEnd) {
      moveTo = targetSection.length;
    }

    // The relocated node is a duplicate, but it is the SAME column: `duplicate()` mints a fresh
    // instanceID for split copies (two nodes from one, so they cannot share one), and here the
    // source node is spliced out of its section above / detached by newColumnHierarchy, so nothing
    // else claims the id. Carrying it over keeps every instanceID-keyed piece of state — row-group
    // and pivot roles, aggregate entries, sorts, filters — pointing at the column the user moved.
    // Without this a top-level leaf silently became a different column on every move, which is why
    // its Group/Pivot/Value chips vanished the moment the move landed.
    const movedCol: Column = topLevelDrag.duplicate();
    movedCol.instanceID = topLevelDrag.instanceID;
    movedCol.pinned = section === "center" ? null : section;
    if (topLevelDrag.pinned !== movedCol.pinned && movedCol.children.length > 0) {
      // If moving between sections, and has children, we need to adjust the pinned state of children
      const newPinned = section === "center" ? null : section;
      this.hierarchy.adjustPinned(movedCol.children, newPinned);
    }
    targetSection.splice(moveTo, 0, movedCol);

    return [
      ...this.hierarchy.mergeColumns(newLeft),
      ...this.hierarchy.mergeColumns(newCenter),
      ...this.hierarchy.mergeColumns(newRight),
    ];
  }

}
