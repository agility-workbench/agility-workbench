import {
  getIconClassName,
  getIconCssVarName,
  GridIconMap,
  normalizeIconSource,
} from "../theme/icons";

const BUILT_IN_ICON_NAMES = new Set([
  "first-page",
  "previous-page",
  "next-page",
  "last-page",
  "sort-asc",
  "sort-desc",
  "sort-clear",
  "submenu",
  "check",
  "group",
  "column-hide",
  "count",
  "sum",
  "avg",
  "min-string",
  "min-number",
  "max-string",
  "max-number",
  "median",
  "drag",
  "plus-frame",
  "minus-frame",
  "not-allowed",
  "filter",
  "menu",
]);

export class IconRenderer {
  private iconStyleEl: HTMLStyleElement | null = null;
  private appliedIconNames = new Set<string>();

  constructor(
    private root: HTMLDivElement,
    private gridId: string,
  ) {}

  setIcons(icons?: GridIconMap) {
    const iconEntries: [string, string][] = Object.entries(icons ?? {}).flatMap(([name, source]) => {
      return source ? [[name, source]] : [];
    });
    const nextIconNames = new Set(iconEntries.map(([name]) => name));
    for (const name of this.appliedIconNames) {
      if (!nextIconNames.has(name)) {
        this.root.style.removeProperty(getIconCssVarName(name));
      }
    }
    for (const [name, source] of iconEntries) {
      this.root.style.setProperty(getIconCssVarName(name), normalizeIconSource(source));
    }
    this.appliedIconNames = nextIconNames;

    if (this.iconStyleEl) {
      this.iconStyleEl.remove();
      this.iconStyleEl = null;
    }

    const customIconRules = iconEntries
      .filter(([name]) => !BUILT_IN_ICON_NAMES.has(name))
      .map(([name]) => this.getCustomIconRule(name));

    if (customIconRules.length === 0) return;

    this.iconStyleEl = document.createElement("style");
    this.iconStyleEl.textContent = customIconRules.join("\n");
    this.root.appendChild(this.iconStyleEl);
  }

  private getCustomIconRule(name: string) {
    const className = getIconClassName(name);
    const selector = `.pte-root[data-pte-grid-id="${this.gridId}"] .${cssEscape(className)}`;
    const cssVar = getIconCssVarName(name);
    return `${selector}{-webkit-mask-image:var(${cssVar});mask-image:var(${cssVar});background-color:var(--pte-icon-color);}`;
  }
}

function cssEscape(value: string): string {
  const escapeFn = globalThis.CSS?.escape;
  if (escapeFn) return escapeFn(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
