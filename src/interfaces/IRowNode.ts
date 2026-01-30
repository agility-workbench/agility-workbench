type RowId = string;

export interface IRowNode<Row = any> {
  id: RowId;
  data: Row;

  // current position in the "view" (optional, can compute on fly)
  viewIndex: number;

  // state
  selected: boolean;

  // future: group/tree
  type: "leaf" | "group";
  level: number;
  isGroup: boolean;
  isExpanded: boolean;
  children?: IRowNode<Row>[];
  childCount?: number;
  groupKey?: string;
  groupValue?: any;
  aggregateValues?: { [key: string]: any };
}
