# Theming and styles

## Refine a preset

```ts
import { themeDark, themeLight } from "@agility-workbench/grid";

const theme = themeLight.withParams({
  accentColor: "#7c3aed",
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#f5f3ff",
  rowHeight: 42,
  spacing: 10,
  fontFamily: "Inter, sans-serif",
});

const options = { theme } satisfies GridOptions;
```

Themes are immutable and apply per grid, so different grids may use different
presets on the same page.

## Override an individual CSS variable

```ts
const theme = themeDark.withParams({
  accentColor: "#22d3ee",
  vars: {
    "--pte-scrollbar-thumb-color": "#475569",
    "--pte-selected-bg-color": "#164e63",
  },
});
```

## Override icons

```ts
const options = {
  icons: {
    filter: "<svg viewBox='0 0 24 24' aria-hidden='true'>…</svg>",
    export: "/icons/download.svg",
  },
} satisfies GridOptions;
```

Icons may also be supplied through `theme.withParams({ icons })`. The grid-level
`icons` map wins when both define the same icon.

## Automatic stylesheet delivery

No CSS import is required. The first attached grid injects the base stylesheet
once per document or shadow root.

```ts
import { areGridStylesInjected, injectGridStyles } from "@agility-workbench/grid";

injectGridStyles(document, { nonce: cspNonce });
console.log(areGridStylesInjected(document));
```

## Strict CSP

```ts
const options = { styleNonce: cspNonce } satisfies GridOptions;
```

Use the same nonce for every grid on the page.

## Import CSS yourself

```ts
import "@agility-workbench/grid/styles.css";

const options = { suppressStyleInjection: true } satisfies GridOptions;
```

This is useful for build-time CSS processing. Opting out avoids two copies of
the stylesheet competing in the cascade.
