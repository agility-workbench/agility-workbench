// TableReact.jsx
import { useEffect, useRef, useState } from "react";
import Table from "./table";
import "./table.css";
import { Column, FilterDef, getColumnDefs } from "./types";

export interface GridProps {
  data: any[];
  columns: Column[];
  className?: string;
  style?: React.CSSProperties;
  pagination?: boolean;
  paginationPageSize?: number;
  paginationPageSizes?: number[] | boolean;
}

export default function Grid({
  data,
  columns,
  className,
  style,
  pagination,
  paginationPageSize,
  paginationPageSizes,
}: GridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Table>(null);
  const [filter, setFilter] = useState<FilterDef | null>();

  const handleFilterChange = (value: string) => {
    const f: FilterDef | null = value ? { key: 'email', type: 'contains', q: value } : null;
    setFilter(f);
    if (f) {
      engineRef.current?.setFilters([f]);
    } else {
      engineRef.current?.setFilters([]);
    }
  };

  // Create engine once (mount/unmount)
  useEffect(() => {
    if (!containerRef.current) return;

    const engine = new Table(
      containerRef,
      {
        columns: getColumnDefs(columns),
        pagination: pagination || false,
        paginationPageSize: paginationPageSize || 100,
        paginationPageSizes: paginationPageSizes || true,
       },
    );
    engineRef.current = engine;

    // Wire engine events to React callbacks
    // const offSort = engine.on("sortChanged", (sort) => onSortChange?.(sort));
    // const offFilter = engine.on("filterChanged", (f) => onFilterTextChange?.(f));

    // initial data
    engine.setData(data);
    // engine.setColumns(columns);

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  // Sync prop changes → engine
  useEffect(() => {
    engineRef.current?.setData(data);
  }, [data]);

  useEffect(() => {
    engineRef.current?.setColumns(getColumnDefs(columns));
  }, [columns]);

  useEffect(() => {
    engineRef.current?.togglePagination(pagination || false);
  }, [pagination]);

  return (
    <div className={className} style={style}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
