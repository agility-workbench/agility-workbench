// TableReact.jsx
import { useEffect, useRef } from "react";
import Table from "./table";
import "./table.css";
import { Column, getColumnDefs, RowModelType, ServerSideAggregation, ServerSideDataSource } from "./types";

export interface GridProps {
  data: any[];
  columns: Column[];
  className?: string;
  style?: React.CSSProperties;
  pagination?: boolean;
  paginationPageSize?: number;
  paginationPageSizes?: number[] | boolean;
  rowModel?: RowModelType;
  serverSideDataSource?: ServerSideDataSource;
  serverSideAggregation?: ServerSideAggregation;
  allowExportAsCSV?: boolean;
  allowExportAsExcel?: boolean;
  loading?: boolean;
}

export default function Grid({
  data,
  columns,
  className,
  style,
  pagination,
  paginationPageSize,
  paginationPageSizes,
  rowModel,
  serverSideDataSource,
  serverSideAggregation,
  allowExportAsCSV = true,
  allowExportAsExcel = true,
  loading = false,
}: GridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Table>(null);

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
        rowModel: rowModel || "clientSide",
        serverSideDataSource,
        serverSideAggregation,
        exportAsCSV: allowExportAsCSV,
        exportAsExcel: allowExportAsExcel,
        loading,
       },
    );
    engineRef.current = engine;

    // Wire engine events to React callbacks
    // const offSort = engine.on("sortChanged", (sort) => onSortChange?.(sort));
    // const offFilter = engine.on("filterChanged", (f) => onFilterTextChange?.(f));

    // initial data
    if (!(rowModel === "serverSide" && serverSideDataSource)) {
      engine.setData(data);
    }
    // engine.setColumns(columns);

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  // Sync prop changes → engine
  useEffect(() => {
    if (rowModel === "serverSide" && serverSideDataSource) return;
    engineRef.current?.setData(data);
  }, [data, rowModel, serverSideDataSource]);

  useEffect(() => {
    engineRef.current?.setColumns(getColumnDefs(columns));
  }, [columns]);

  useEffect(() => {
    engineRef.current?.setRowModel(rowModel || "clientSide");
  }, [rowModel]);

  useEffect(() => {
    engineRef.current?.setServerSideDataSource(serverSideDataSource);
  }, [serverSideDataSource]);

  useEffect(() => {
    engineRef.current?.setServerSideAggregation(serverSideAggregation);
  }, [serverSideAggregation]);

  useEffect(() => {
    engineRef.current?.togglePagination(pagination || false);
  }, [pagination]);

  useEffect(() => {
    engineRef.current?.setLoading(loading);
  }, [loading]);

  return (
    <div className={className} style={style}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
