export type GridIconSource = string;

export type GridIconName =
  | "first-page"
  | "previous-page"
  | "next-page"
  | "last-page"
  | "sort-asc"
  | "sort-desc"
  | "sort-clear"
  | "submenu"
  | "check"
  | "group"
  | "column-hide"
  | "count"
  | "sum"
  | "avg"
  | "min-string"
  | "min-number"
  | "max-string"
  | "max-number"
  | "median"
  | "drag"
  | "plus-frame"
  | "minus-frame"
  | "not-allowed"
  | "filter"
  | "menu"
  | "pin"
  | "export"
  | "copy"
  | "cut"
  | "paste"
  | (string & {});

export type GridIconMap = Partial<Record<GridIconName, GridIconSource>>;

export function getIconCssVarName(name: string): string {
  return `--pte-icon-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function getIconClassName(name: string): string {
  return name.startsWith("icon-") ? name : `icon-${name}`;
}

export function normalizeIconSource(source: GridIconSource): string {
  const value = source.trim();
  if (!value) return value;
  if (/^(url|var|image|cross-fade|linear-gradient|radial-gradient)\(/i.test(value)) {
    return value;
  }
  if (value.startsWith("<svg")) {
    return `url("${svgToDataUrl(value)}")`;
  }
  return `url("${value.replace(/"/g, '\\"')}")`;
}

function svgToDataUrl(svg: string): string {
  const encoded = svg
    .replace(/\s+/g, " ")
    .replace(/"/g, "'")
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/{/g, "%7B")
    .replace(/}/g, "%7D")
    .trim();
  return `data:image/svg+xml,${encoded}`;
}
