// TableReact.jsx
import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import Table from "./table";
import "./table.css";
import { ColDef, getColumnDefs } from "./types";
import { ClientSideRowModel } from "./row_model/client_side";
import { ServerSideAggregationSource, ServerSideDataSource, ServerSideRowModel } from "./row_model/server_side";
import { RowModelType } from "./interfaces/IRowModel";

export interface GridProps {
  data: any[];
  columns: ColDef[];
  className?: string;
  style?: React.CSSProperties;
  pagination?: boolean;
  paginationPageSize?: number;
  paginationPageSizes?: number[] | boolean;
  rowModelType?: RowModelType;
  serverSideDataSource?: ServerSideDataSource;
  serverSideAggregation?: ServerSideAggregationSource;
  allowExportAsCSV?: boolean;
  allowExportAsExcel?: boolean;
  loading?: boolean;
  getRowId?: (row: any) => string;
  rowIdKey?: string;
}

export default function Grid({
  data,
  columns,
  className,
  style,
  pagination,
  paginationPageSize,
  paginationPageSizes,
  rowModelType,
  serverSideDataSource,
  serverSideAggregation,
  allowExportAsCSV = true,
  allowExportAsExcel = true,
  loading = false,
  getRowId,
  rowIdKey,
}: GridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef: MutableRefObject<Table | null> = useRef<Table>(null);

  const rowModel = useCallback(() => {
    if (rowModelType === "serverSide") {
      return new ServerSideRowModel({ getRowId, rowIdKey }, serverSideDataSource, serverSideAggregation);
    }
    return new ClientSideRowModel({ getRowId, rowIdKey });
  }, [rowModelType, getRowId, rowIdKey, serverSideDataSource, serverSideAggregation]);

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
        rowModel: rowModel(),
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
    if (!(rowModelType === "serverSide" && serverSideDataSource)) {
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
    engineRef.current!.gridAPI.columns = getColumnDefs(columns);
  }, [columns]);

  useEffect(() => {
    const setRowModel = async () => {
      await engineRef.current!.gridAPI.setRowModel(rowModel());
    };
    setRowModel();
  }, [rowModelType]);

  useEffect(() => {
    if (rowModelType === "serverSide" && serverSideDataSource) return;
    engineRef.current!.gridAPI.data = data;
  }, [data, rowModelType, serverSideDataSource]);

  useEffect(() => {
    const currRowModel = engineRef.current?.rowModel;
    if (currRowModel?.getType() !== "serverSide") return;
    const serverRowModel = currRowModel as ServerSideRowModel;
    serverRowModel.serverDataSource = serverSideDataSource;
    engineRef.current?.refreshServerSideData();
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
