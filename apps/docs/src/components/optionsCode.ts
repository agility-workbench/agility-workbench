import type { KnobOptions } from "./knobs";

/**
 * Prints knob-derived grid options in each framework's idiom, for the code tabs.
 *
 * The snippets in `snippets.ts` carry an `{{options}}` marker where the configurable options go;
 * `fillOptions` replaces it with the current options, indented to the marker's column. The marker
 * line disappears entirely when there is nothing to print, so `<Grid rowData={rows} />` never gains
 * a blank line. A string value that starts with `$` is a reference to a variable the surrounding
 * snippet declares (`"$pinnedTop"` → `pinnedTopRowData={pinnedTop}`), not a string literal.
 */
export type Framework = "react" | "angular" | "core";

const isRef = (value: unknown): value is string => typeof value === "string" && value.startsWith("$");

/**
 * A JS/TS literal for `value`, using double quotes (or `quote`) for strings. Objects wrap onto
 * several lines past `width` columns; `Infinity` keeps them on one line.
 */
function literal(value: unknown, quote = '"', indent = "", width = 72): string {
  if (isRef(value)) return value.slice(1);
  if (value === null) return "null";
  if (typeof value === "string") return `${quote}${value}${quote}`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => literal(item, quote, indent, width)).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    const inline = `{ ${entries.map(([k, v]) => `${k}: ${literal(v, quote, indent, width)}`).join(", ")} }`;
    if (inline.length <= width - indent.length) return inline;
    const inner = indent + "  ";
    return `{\n${entries.map(([k, v]) => `${inner}${k}: ${literal(v, quote, inner, width)},`).join("\n")}\n${indent}}`;
  }
  return String(value);
}

function reactLine(key: string, value: unknown, indent: string): string {
  if (value === true) return key;
  if (typeof value === "string" && !isRef(value)) return `${key}="${value}"`;
  return `${key}={${literal(value, '"', indent)}}`;
}

function angularLine(key: string, value: unknown): string {
  if (typeof value === "string" && !isRef(value)) return `${key}="${value}"`;
  // Angular bindings sit inside a double-quoted attribute, so nested strings use single quotes and
  // objects stay on one line.
  return `[${key}]="${literal(value, "'", "", Infinity)}"`;
}

function coreLine(key: string, value: unknown, indent: string): string {
  return `${key}: ${literal(value, '"', indent)},`;
}

export function optionLines(options: KnobOptions, framework: Framework, indent: string): string[] {
  return Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      switch (framework) {
        case "react": return reactLine(key, value, indent);
        case "angular": return angularLine(key, value);
        case "core": return coreLine(key, value, indent);
      }
    });
}

const MARKER = /^([ \t]*)\{\{options\}\}[ \t]*\n?/m;

/** Replace the snippet's `{{options}}` marker line with the given options. */
export function fillOptions(snippet: string, options: KnobOptions, framework: Framework): string {
  const match = MARKER.exec(snippet);
  if (!match) return snippet;
  const indent = match[1];
  const lines = optionLines(options, framework, indent);
  const block = lines.length ? lines.map((line) => indent + line).join("\n") + "\n" : "";
  return snippet.slice(0, match.index) + block + snippet.slice(match.index + match[0].length);
}
