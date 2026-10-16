import React, { useMemo, useState } from "react";
import { DEFAULT_LOCALE_TEXT, type GridLocaleKey } from "@agility-workbench/react-grid";

/**
 * Every `GridLocaleText` key with its English default, read from `DEFAULT_LOCALE_TEXT` itself so the
 * table cannot drift from the grid. Keys appear in declaration order, which groups them by surface.
 */
export function LocaleKeyTable() {
  const [query, setQuery] = useState("");
  const entries = useMemo(
    () => Object.entries(DEFAULT_LOCALE_TEXT) as Array<[GridLocaleKey, string]>,
    [],
  );
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? entries.filter(([key, text]) => key.toLowerCase().includes(needle) || text.toLowerCase().includes(needle))
    : entries;
  return (
    <div>
      <input
        type="search"
        placeholder={`Filter ${entries.length} keys…`}
        aria-label="Filter locale keys"
        value={query}
        onChange={event => setQuery(event.target.value)}
        style={{ width: "100%", maxWidth: 360, padding: "6px 8px", marginBottom: 12 }}
      />
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>English default</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(([key, text]) => (
            <tr key={key}>
              <td><code>{key}</code></td>
              <td>{text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
