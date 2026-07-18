# Repository Setup & Publishing Guide

> Developer-facing reference for how this repository is organized, how the code is
> split into packages, and what is required to publish the libraries to npm.
> For the grid's *feature* architecture, see
> [`../architecture/current-state.md`](../architecture/current-state.md);
> for consumer-facing usage, see each package's `README.md`.

## 1. Overview

This is an **npm-workspaces monorepo** hosted at
`github.com/agility-workbench/agility-workbench`. It produces two independently
versioned, independently publishable packages:

| Package | npm name | Role |
| --- | --- | --- |
| `packages/grid` | `@agility-workbench/grid` | Framework-agnostic data-grid core (engine, renderer, theming, export). No React dependency. |
| `packages/react-grid` | `@agility-workbench/react-grid` | Thin React binding (`<Grid />`) built on the core. Depends on `@agility-workbench/grid`. |

The repository **root is private** (`"private": true`, name `agility-workbench`) and
is never published — it only orchestrates the workspaces, the shared dev tooling, and
the demo app.

**Toolchain:** Node ≥ 18 (developed on Node 22), npm workspaces (npm 11),
[tsup](https://tsup.egoist.dev/) for bundling, [Vite](https://vite.dev/) for the demo,
[Vitest](https://vitest.dev/) for tests, TypeScript 5.

## 2. Directory layout

```
agility-workbench/                 ← private workspace root
├── package.json                   workspaces:["packages/*"], shared devDeps, orchestration scripts
├── tsconfig.base.json             shared compiler options (extended by every package)
├── tsconfig.json                  root config for the playground app + editor (path aliases)
├── vite.config.ts                 playground dev server; aliases → packages/*/src
├── vitest.config.ts               test discovery + aliases
├── docs/
│   ├── maintainers/repository.md  ← this document
│   └── architecture/current-state.md   feature/architecture reference
│
├── apps/
│   └── playground/                demo app (NOT published; consumes packages via aliases)
│       ├── App.tsx, *Demo.tsx, main.tsx, index.html, *.css
│
└── packages/
    ├── grid/                      @agility-workbench/grid
    │   ├── package.json           exports map, files allowlist, build/publish scripts
    │   ├── tsconfig.json          extends base; internal "@grid/*" aliases
    │   ├── tsup.config.ts          single entry (src/index.ts) → ESM+CJS+d.ts
    │   ├── scripts/build-css.mjs   inlines SVG icons → dist/index.css + generated TS
    │   ├── LICENSE, README.md
    │   └── src/
    │       ├── index.ts            ← the ONLY public entry (what consumers import)
    │       ├── core/               GridCore, options resolution, state
    │       ├── renderer/           DOM renderer, cell/row/header renderers, themeRenderer
    │       ├── interfaces/         public + internal TypeScript contracts
    │       ├── column/ filter/ selection/ menu/ aggregate/ export/
    │       ├── csrm/ ssrm/          client-side & server-side row models
    │       ├── cellRenderers/       built-in renderers (e.g. ChangeFlash)
    │       └── theme/               theme.ts, icons.ts, inject.ts, table.css, icons/*.svg
    │                                + *.generated.ts (build artifacts, gitignored)
    └── react-grid/                @agility-workbench/react-grid
        ├── package.json           depends on @agility-workbench/grid; react as peer
        ├── tsconfig.json          typechecks against grid's built dist/*.d.ts
        ├── tsup.config.ts          single entry; externalizes grid + react
        ├── LICENSE, README.md
        └── src/
            ├── index.ts            public entry: Grid + `export * from grid`
            ├── grid.tsx            the <Grid /> component
            ├── factory.ts          maps React props → GridOptions, builds core
            ├── cellRenderer.ts cellEditor.ts   React↔core adapters
            ├── MenuAdapter.ts BodyMenuAdapter.ts menu.ts interface.ts
            └── *.test.tsx          co-located smoke tests
```

## 3. The package boundary (important)

The React package is a **separate bundle** from the core. At build time, tsup marks
`@agility-workbench/grid`, `react`, and `react-dom` as *external* — they are not bundled
into the React output (its dist is ~7.5 KB). This means:

- **React source may only import the core through its public entry** — the bare
  specifier `@agility-workbench/grid`. Deep imports like `@agility-workbench/grid/renderer/...`
  would not resolve against the core's bundled `dist/`, which has no such subpaths.
- Everything the React layer needs is therefore **re-exported from
  [`packages/grid/src/index.ts`](packages/grid/src/index.ts)** (e.g. `IGridAPI`, cell-renderer
  types, `isClassRenderer`, menu adapter/context types, `initDomRenderer`, `CanvasMeasurer`,
  `isFalse`). When the React layer needs a new core symbol, **add it to the core's
  `index.ts` first.**
- `packages/react-grid/src/index.ts` does `export * from "@agility-workbench/grid"`, so consumers
  can import the whole API (grid + React) from `@agility-workbench/react-grid` alone.

### Dependency direction

```
@agility-workbench/react-grid ──depends on──▶ @agility-workbench/grid
        │                                             │
   peer: react, react-dom                   devDep: exceljs (test-only verifier)
```

The core has **zero runtime dependencies**. `exceljs` is a dev-only dependency used to
verify the hand-rolled `.xlsx` writer in tests; it is never bundled or shipped.

## 4. Path aliases: two worlds

There are two distinct resolution contexts, and they intentionally differ:

**A. Dev/test (root configs)** — `vite.config.ts`, `vitest.config.ts`, root `tsconfig.json`
alias package names *and* the legacy internal names straight to source, so the demo and the
test runner never need a build:

| Alias | Resolves to |
| --- | --- |
| `@agility-workbench/grid` | `packages/grid/src` |
| `@agility-workbench/react-grid` | `packages/react-grid/src` |
| `@grid`, `@grid/*` | `packages/grid/src` (used inside core source + co-located tests) |
| `@react-grid`, `@react-grid/*` | `packages/react-grid/src` |

**B. Build/publish (per-package configs)** —
- `packages/grid/tsconfig.json` keeps the internal `@grid`/`@grid/*` aliases (core source
  uses them in a handful of files).
- `packages/react-grid/tsconfig.json` aliases `@agility-workbench/grid` → **`../grid/dist/index.d.ts`**
  (the *built* declarations, not source). This validates the React layer against the exact
  surface consumers see and keeps the core's internal aliases out of the React compile.
  **Consequence: the grid package must be built before the react-grid package typechecks** — the
  root `build` and `typecheck` scripts already enforce this order.

> The `@grid` / `@react-grid` aliases are a legacy of the pre-split layout. They are
> dev-only (never in published output). A future cleanup could rewrite core source to use
> relative imports and drop them, but it is not required for publishing.

## 5. Build pipeline

### Core (`@agility-workbench/grid`)

`npm run build` in `packages/grid` runs: `clean` → `generate` → `tsup`.

1. **`clean`** — removes `dist/`.
2. **`generate`** (`scripts/build-css.mjs`) — reads `src/theme/table.css`, inlines all 24 SVG
   icons as `data:` URIs, and writes:
   - `dist/index.css` — the single, portable, publishable stylesheet.
   - `src/theme/styles.generated.ts` — `GRID_STYLES` string, consumed by `injectGridStyles()`.
   - `src/theme/cssVars.generated.ts` — the `PteVarName` union (typed theme escape hatch).
   The two `*.generated.ts` files are **build artifacts** and are gitignored.
3. **`tsup`** — bundles `src/index.ts` to ESM (`dist/index.js`), CJS (`dist/index.cjs`), and
   type declarations (`dist/index.d.ts` / `.d.cts`). `clean: false` in tsup config is
   deliberate — it must not wipe the `dist/index.css` that `generate` just produced.

### React (`@agility-workbench/react-grid`)

`npm run build` runs `clean` → `tsup` (single entry, grid + react externalized).

### From the repo root

| Command | Effect |
| --- | --- |
| `npm install` | Installs all deps and symlinks the workspaces into `node_modules/@agility-workbench/`. |
| `npm run build` | Builds **grid, then react** (order matters — see §4B). |
| `npm run typecheck` | Generates CSS, typechecks the demo, then each package. |
| `npm test` | Runs the full Vitest suite (279 tests across both packages). |
| `npm run dev` | Starts the Vite demo at `http://localhost:5176`. |
| `npm run clean` | Cleans every package's `dist/` plus root `dist-demo/`. |

## 6. Publishing to npm

Both packages are publish-ready. Current state of the manifests:

- `@agility-workbench/grid` — `"private"` is absent (publishable), `publishConfig.access: "public"`,
  `provenance: true`, `exports` map (`.`, `./styles.css`, `./package.json`), `files: ["dist","README.md","LICENSE"]`,
  `prepublishOnly: "npm run build"`, `sideEffects: ["**/*.css"]`.
- `@agility-workbench/react-grid` — same publish config; `dependencies: { "@agility-workbench/grid": "^0.1.0" }`,
  `peerDependencies: { react, react-dom }` (optional in practice — provided by the host app),
  `sideEffects: false`.

### What is achievable today

- ✅ **Publish the core standalone.** `@agility-workbench/grid` has no runtime deps and works
  in any framework (or none). `npm publish` from `packages/grid` produces a tarball with
  `dist/{index.js,index.cjs,index.d.ts,index.css}` + LICENSE + README.
- ✅ **Publish the React binding.** `@agility-workbench/react-grid` resolves the core from the
  registry via its `^0.1.0` range. Its tarball is tiny because the core is not bundled in.
- ✅ **Dual module formats.** Both ship ESM + CJS + type declarations, resolved through the
  `exports` map for modern bundlers and `main`/`module`/`types` for legacy resolution.
- ✅ **CSS delivered two ways** from the core: `import "@agility-workbench/grid/styles.css"`
  or the zero-import `injectGridStyles()`.
- ✅ **Provenance** attestation is enabled (`publishConfig.provenance`), giving consumers a
  verifiable supply-chain link when published from CI with `id-token: write`.

### Release order & version coupling

Because react-grid depends on grid by semver range, **publish `@agility-workbench/grid` first**,
then `@agility-workbench/react-grid`. If a react-grid release requires a new core symbol, bump
and publish the core, then bump the react-grid dependency range to match.

### Manual publish (first release)

```bash
# from repo root
npm run build                                   # build both, in order
npm test                                        # 279 tests must pass
cd packages/grid       && npm publish           # prepublishOnly re-builds
cd ../react-grid       && npm publish
```

npm workspaces also allow `npm publish --workspace @agility-workbench/grid` from the root.

### Pre-publish checklist

- [ ] `npm run build && npm test` clean.
- [ ] `npm pack --dry-run --workspace <pkg>` shows only `dist/` + LICENSE + README + package.json.
- [ ] Versions bumped (core before dependent, if coupled).
- [ ] `@agility-workbench/react-grid`'s dependency range on the core matches the version being released.
- [ ] Logged in to npm with access to the `@agility-workbench` scope.

## 7. Not yet set up (recommended follow-ups)

These are **not** in place today and are needed for a smooth, repeatable release process:

- **Automated versioning/changelogs** — e.g. [changesets](https://github.com/changesets/changesets),
  which understands workspaces and the inter-package dependency bump.
- **CI release workflow** — GitHub Actions that runs `build` + `test`, then
  `npm publish --provenance` for each package on a tag/release (requires `id-token: write`).
- **Documentation website** — the examples site referenced by `homepage`
  (`https://agilityworkbench.dev`) is not part of this repo yet.
- **Alias cleanup** — optionally remove the dev-only `@grid`/`@react-grid` aliases (§4) by
  converting core/test imports to relative or package-name specifiers.
