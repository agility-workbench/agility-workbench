import { useEffect, useState } from "react";
import "./roboto-font.css";

import { Grid } from "@grid"; // React Data Grid Component
import { ColumnDef } from "@grid/types";

function App() {
  const [rowData, setRowData] = useState<any[]>([]);
  const [colDefs, setColDefs] = useState<ColumnDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("http://localhost:8080/dept_loc_exp");
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (cancelled) return;

        for (const col of payload.columns) {
          if (col.type === "currency") {
            col.valueFormatter = (value: any, row: any) => {
              if (typeof value === "number") {
                return value.toLocaleString("en-US", {
                  style: "currency",
                  currency: row.currency || "USD",
                });
              }
              return value;
            };
          }
        }

        setColDefs(payload.columns ?? []);
        setRowData(payload.data ?? []);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{ height: "100vh", width: "100%" }} // the grid will fill the size of the parent container
    >
      {loading && <div>Loading data…</div>}
      {error && <div style={{ color: "red" }}>Error: {error}</div>}
      <Grid
        data={rowData}
        columns={colDefs}
      />
    </div>
  );
}

export default App;
