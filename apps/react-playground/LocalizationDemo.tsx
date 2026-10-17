import { useMemo, useState } from "react";

import { Grid } from "@react-grid";
import type { GetLocaleText, GridLocaleText, IGridAPI, ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";

type OrderRow = { id: number; customer: string; region: string; units: number; revenue: number; paid: boolean };

const CUSTOMERS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne"];
const REGIONS = ["Nord", "Süd", "Ost", "West", ""];

function buildRows(): OrderRow[] {
  return Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    customer: CUSTOMERS[index % CUSTOMERS.length],
    region: REGIONS[index % REGIONS.length],
    units: 2 + ((index * 7) % 19),
    revenue: 250 + ((index * 137) % 2400),
    paid: index % 3 !== 0,
  }));
}

const COLUMN_DEFS: ReactColDef[] = [
  { colId: "id", key: "id", label: "Nr.", width: 90, type: ColumnType.NUMBER },
  { colId: "customer", key: "customer", label: "Kunde", width: 160, filter: "set" },
  { colId: "region", key: "region", label: "Region", width: 130, filter: "set" },
  { colId: "units", key: "units", label: "Stück", width: 110, type: ColumnType.NUMBER },
  {
    colId: "revenue", key: "revenue", label: "Umsatz", width: 150, type: ColumnType.CURRENCY,
    formatterOptions: { locale: "de-DE", currency: "EUR" },
  },
  { colId: "paid", key: "paid", label: "Bezahlt", width: 110, type: ColumnType.BOOLEAN },
];

/** A German translation of the strings this page shows (the rest stay English). */
const DE: Partial<GridLocaleText> = {
  // Overlays and grid messages
  loading: "Daten werden geladen…",
  noRows: "Keine Zeilen vorhanden",
  noRowsMatchSearch: "Keine Zeilen passen zu „{text}“",
  noRowsMatchFilters: "Keine Zeilen passen zu den aktuellen Filtern",
  // Pagination footer
  rowsPerPage: "Zeilen pro Seite",
  page: "Seite",
  firstPage: "Erste Seite",
  previousPage: "Vorherige Seite",
  nextPage: "Nächste Seite",
  lastPage: "Letzte Seite",
  pageOfTotalOption: "{page} von {total}",
  pageOfTotal: "Seite {page} von {total}",
  pageOfAtLeastTotal: "Seite {page} von mindestens {total}",
  aggregate: "Aggregat",
  aggregateScopeNone: "Keins",
  aggregateScopeCurrentPage: "Aktuelle Seite",
  aggregateScopeEntireDataset: "Gesamter Datenbestand",
  hideAggregateRow: "Aggregatzeile ausblenden",
  moreFooterControls: "Weitere Fußzeilen-Steuerelemente",
  // Aggregates
  aggCount: "Anzahl",
  aggDistinctCount: "Eindeutige Anzahl",
  aggSum: "Summe",
  aggAvg: "Durchschnitt",
  aggAvgShort: "Mittel",
  aggMin: "Min",
  aggMax: "Max",
  aggMedian: "Median",
  aggFirst: "Erster",
  aggLast: "Letzter",
  // Toolbar
  views: "Ansichten",
  savedViews: "Gespeicherte Ansichten",
  noSavedViews: "Keine gespeicherten Ansichten",
  export: "Exportieren",
  exportTable: "Tabelle exportieren",
  exportSelection: "Auswahl",
  exportEntireTable: "Gesamte Tabelle",
  exportTableAsCsv: "Tabelle als CSV",
  exportTableAsExcel: "Tabelle als Excel",
  togglePivotMode: "Pivot-Modus umschalten",
  pivot: "Pivot",
  pivotMode: "Pivot-Modus",
  pivotModeOn: "Pivot-Modus an",
  pivotModeOff: "Pivot-Modus aus",
  moreToolbarActions: "Weitere Aktionen",
  moreActions: "Weitere Aktionen",
  search: "Suchen",
  groupedBy: "Gruppiert nach",
  sortBy: "Sortiert nach",
  addGroup: "Gruppe hinzufügen",
  addSort: "Sortierung hinzufügen",
  addGroupEditor: "+ Gruppe hinzufügen",
  addSortEditor: "+ Sortierung hinzufügen",
  clearRowGrouping: "Zeilengruppierung entfernen",
  clearGrouping: "Gruppierung entfernen",
  clearAllSorting: "Alle Sortierungen entfernen",
  clearSorting: "Sortierung entfernen",
  removeFromRowGrouping: "{column} aus der Gruppierung entfernen",
  removeFromSorting: "{column} aus der Sortierung entfernen",
  sortColumnAscending: "{column} aufsteigend sortieren",
  sortColumnDescending: "{column} absteigend sortieren",
  // Quick filter
  searchPlaceholder: "Suchen…",
  findPlaceholder: "Finden…",
  searchAllColumns: "Alle Spalten durchsuchen",
  clearSearch: "Suche löschen",
  closeSearch: "Suche schließen",
  // Column panel
  columns: "Spalten",
  columnManagement: "Spaltenverwaltung",
  openColumnPanel: "Spaltenbereich öffnen",
  closeColumnPanel: "Spaltenbereich schließen",
  searchColumns: "Spalten suchen",
  searchColumnsPlaceholder: "Spalten suchen…",
  allColumns: "Alle Spalten",
  resetLayout: "Layout zurücksetzen",
  pinnedLeft: "Links fixiert",
  pinnedRight: "Rechts fixiert",
  // Column menu
  sortAscending: "Aufsteigend sortieren",
  sortDescending: "Absteigend sortieren",
  clearSort: "Sortierung entfernen",
  clearSorts: "Sortierungen entfernen",
  hideColumnMenu: "Spalte ausblenden",
  hideColumnsMenu: "Spalten ausblenden",
  pinColumnMenu: "Spalte fixieren",
  pinColumnsMenu: "Spalten fixieren",
  pinLeft: "Links fixieren",
  pinRight: "Rechts fixieren",
  unpinColumn: "Fixierung lösen",
  unpinColumns: "Fixierung lösen",
  manageColumns: "Spalten verwalten…",
  aggregateNumeric: "Aggregat (numerisch)",
  aggregateString: "Aggregat (Text)",
  clearAggregation: "Aggregation entfernen",
  exportAsCsv: "Als CSV exportieren",
  exportAsExcel: "Als Excel exportieren",
  groupByColumn: "Nach Spalte gruppieren",
  groupByColumns: "Nach Spalten gruppieren",
  ungroup: "Gruppierung aufheben",
  ungroupAll: "Alle Gruppierungen aufheben",
  pivotOnColumn: "Nach Spalte pivotieren",
  exitPivotMode: "Pivot-Modus beenden",
  // Body menu
  cut: "Ausschneiden",
  copy: "Kopieren",
  copyWithHeaders: "Mit Überschriften kopieren",
  paste: "Einfügen",
  fillDown: "Nach unten füllen",
  fillRight: "Nach rechts füllen",
  exportCsv: "CSV",
  exportExcel: "Excel",
  menu: "Menü",
  cellMenu: "Zellenmenü",
  columnMenu: "Spaltenmenü",
  // Header
  rowNumber: "Zeilennummer",
  selectAllRows: "Alle Zeilen auswählen",
  deselectAllRows: "Alle Zeilen abwählen",
  groupColumn: "Gruppe",
  // Filters
  filterDialog: "{column} filtern",
  filterEqual: "Gleich",
  filterNotEqual: "Ungleich",
  filterGreaterThan: "Größer als",
  filterGreaterThanOrEqual: "Größer oder gleich",
  filterLessThan: "Kleiner als",
  filterLessThanOrEqual: "Kleiner oder gleich",
  filterBetween: "Zwischen",
  filterNotBetween: "Nicht zwischen",
  filterContains: "Enthält",
  filterExcludes: "Enthält nicht",
  filterStartsWith: "Beginnt mit",
  filterEndsWith: "Endet mit",
  filterIsBlank: "Ist leer",
  filterIsNotBlank: "Ist nicht leer",
  filterJoinAnd: "UND",
  filterJoinOr: "ODER",
  filterValue: "Filterwert",
  filterAny: "Beliebig",
  filterTrue: "Wahr",
  filterFalse: "Falsch",
  clearFilterValue: "Löschen",
  selectAll: "(Alle auswählen)",
  blanks: "(Leer)",
  selectAllValues: "Alle Werte auswählen",
  includeBlankValues: "Leere Werte einschließen",
  filterValues: "Filterwerte",
  setFilterSearchPlaceholder: "Werte filtern",
  setFilterRowCountUnitOne: "Zeile",
  setFilterRowCountUnitOther: "Zeilen",
  // Announcements
  rowsSelectedOne: "{count} Zeile ausgewählt",
  rowsSelectedOther: "{count} Zeilen ausgewählt",
  columnsSelectedOne: "{count} Spalte ausgewählt",
  columnsSelectedOther: "{count} Spalten ausgewählt",
  selectionCleared: "Auswahl aufgehoben",
  sortingCleared: "Sortierung aufgehoben",
  sortedBy: "Sortiert nach {columns}",
  sortedBySeparator: ", dann ",
  sortedColumnAscending: "{column} aufsteigend",
  sortedColumnDescending: "{column} absteigend",
  rowsLoadedOne: "{count} Zeile geladen",
  rowsLoadedOther: "{count} Zeilen geladen",
};

/** `getLocaleText` example: shows every string's key instead of its text. */
const SHOW_KEYS: GetLocaleText = ({ key }) => `⟨${key}⟩`;

type Mode = "en" | "de" | "keys";

export function LocalizationDemo() {
  const rows = useMemo(() => buildRows(), []);
  const [mode, setMode] = useState<Mode>("de");
  const [sample, setSample] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label htmlFor="localization-mode" style={{ fontSize: "13px" }}>Language</label>
          <select id="localization-mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="en">English (defaults)</option>
            <option value="de">Deutsch (localeText)</option>
            <option value="keys">Keys (getLocaleText)</option>
          </select>
        </div>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          <code>api.getLocaleText("pageOfTotal", {"{ page: 2, total: 9 }"})</code> → <strong>{sample}</strong>
        </span>
      </div>
      <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        Open a column menu, a set filter (Kunde, Region) or the Bezahlt filter, the body context menu,
        the toolbar and the pagination footer: every built-in string follows <code>localeText</code>.
        The Keys mode passes a <code>getLocaleText</code> callback that returns each string's key, which
        is how to find the key for a string you see. Number formatting is separate: Umsatz uses
        <code> formatterOptions: {"{ locale: \"de-DE\", currency: \"EUR\" }"}</code>.
      </p>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        {/* Locale options are creation-only: a new key creates the grid again in the new language. */}
        <Grid
          key={mode}
          rowData={rows}
          columnDefs={COLUMN_DEFS}
          rowIdKey="id"
          pagination
          pageSize={10}
          pageSizes={[10, 20, 50]}
          rowNumbers
          rowSelection={{ mode: "multiple", checkboxes: true, headerCheckbox: true }}
          cellSelection
          toolbar={{ grouping: true, sorting: true, export: true }}
          quickFilter
          columnPanel={{ trigger: "rail" }}
          localeText={mode === "de" ? DE : undefined}
          getLocaleText={mode === "keys" ? SHOW_KEYS : undefined}
          onGridReady={(api: IGridAPI) => setSample(api.getLocaleText("pageOfTotal", { page: 2, total: 9 }))}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default LocalizationDemo;
