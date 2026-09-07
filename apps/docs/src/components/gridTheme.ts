import { themeDark } from "@agility-workbench/react-grid";

/**
 * The one grid theme every live example on this site uses, so a reader moving between pages sees
 * the same grid. Built from semantic theme parameters rather than raw CSS variables — the
 * Theming page documents the full parameter set.
 */
export const brandTheme = themeDark.withParams({
  accentColor: "#2fd2e2",
  backgroundColor: "#0a172b",
  headerBackgroundColor: "#0f2140",
  borderColor: "#243b62",
  rowHoverColor: "#122b50",
  selectedBackgroundColor: "#123f63",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  rowHeight: 39,
  sparklineStrokeColor: "#2fd2e2",
  sparklineBarColor: "#7c9cff",
});
