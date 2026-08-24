// Mirrors the React package README quick-start (StrictMode, onGridReady,
// api.on), trimmed to what the smoke asserts.
import { StrictMode, useState } from "react";
import {
  ColumnType,
  Grid,
  type IGridAPI,
  type ReactColDef,
} from "@agility-workbench/react-grid";

const columnDefs: ReactColDef[] = [
  { key: "name", label: "Name", type: ColumnType.STRING },
  { key: "price", label: "Price", type: ColumnType.NUMBER },
];

const rowData = [
  { id: "1", name: "Widget", price: 9.99 },
  { id: "2", name: "Gadget", price: 14.5 },
  { id: "3", name: "Sprocket", price: 3.25 },
];

export function App({ onReady }: { onReady?: (api: IGridAPI) => void }) {
  const [, setApi] = useState<IGridAPI | null>(null);

  return (
    <StrictMode>
      <div style={{ height: 400 }}>
        <Grid
          rowData={rowData}
          columnDefs={columnDefs}
          rowIdKey="id"
          rowSelection
          onGridReady={(readyApi) => {
            setApi(readyApi);
            onReady?.(readyApi);
          }}
        />
      </div>
    </StrictMode>
  );
}
