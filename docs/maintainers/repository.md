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
├── tsconfig.json                  root config for the react-playground app + editor (path aliases)
├── vite.config.ts                 react-playground dev server; aliases → packages/*/src
├── vite.angular.config.ts         angular-playground dev server (analog Angular plugin; port 5180)
├── vitest.config.ts               test discovery + aliases (grid + react-grid)
├── docs/
│   ├── maintainers/repository.md  ← this document
│   └── architecture/current-state.md   feature/architecture reference
│
├── apps/
│   ├── react-playground/          demo app (NOT published; consumes packages via aliases)
│   │   ├── App.tsx, *Demo.tsx, main.tsx, index.html, *.css
│   └── angular-playground/        Angular demo app (zoneless bootstrap; own tsconfig for the analog plugin)
│       ├── app.component.ts, *-demo.component.ts, main.ts, index.html, style.css
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
    │       ├── renderer/           DOM renderer: body, header, tooltip, actionFrame, floating,
    │       │                        quickFilter, editing, filter, clipboard, aggregate, overlay, …
    │       ├── interfaces/         public + internal TypeScript contracts
    │       ├── column/ filter/ selection/ menu/ aggregate/ export/
    │       ├── csrm/ ssrm/          client-side & server-side row models
    │       ├── cellRenderers/       built-in renderers (ChangeFlash, Sparkline)
    │       └── theme/               theme.ts, icons.ts, inject.ts, table.css, icons/*.svg
    │                                + *.generated.ts (build artifacts, gitignored)
    ├── react-grid/                @agility-workbench/react-grid
    │   ├── package.json           depends on @agility-workbench/grid (semver); react as peer
    │   ├── tsconfig.json          NO grid alias — resolves grid as a normal workspace dep
    │   ├── tsup.config.ts          single entry; externalizes grid + react
    │   ├── LICENSE, README.md
    │   └── src/
    │       ├── index.ts            public entry: Grid + `export * from grid`
    │       ├── grid.tsx            the <Grid /> component (StrictMode-safe)
    │       ├── factory.ts          maps React props → GridOptions, builds core
    │       ├── cellRenderer.ts cellEditor.ts   React↔core adapters (cell/tooltip/actionFrame/header + defaultColDef)
    │       ├── MenuAdapter.ts BodyMenuAdapter.ts menu.ts interface.ts
    │       └── *.smoke.test.tsx *.test.tsx   co-located smoke/integration tests
    └── angular-grid/              @agility-workbench/angular-grid (Angular ≥ 20.3, built with ng-packagr)
        ├── package.json           depends on grid (semver); @angular/core as peer (>=20.3.0); publish from dist/
        ├── ng-package.json         ng-packagr config (APF output: FESM2022 + partial-Ivy d.ts)
        ├── tsconfig.lib.json       compilationMode: "partial" (consumers' linkers finish compilation)
        ├── tsconfig.spec.json      test program: package src + ../grid/src (vitest aliases core to source)
        ├── vitest.config.mts       analog vite plugin rig (see §5); run via root `npm run test:angular`
        └── src/
            ├── public-api.ts       public entry: AwbGrid + `export * from grid`
            ├── grid.component.ts   the <awb-grid> component (signal inputs, zone-isolated core)
            ├── factory.ts          maps inputs → GridOptions, builds core
            ├── adapters.ts         Angular↔core adapters (cell/tooltip/actionFrame/editor + defaultColDef)
            ├── menuAdapters.ts menu.ts interface.ts
            └── *.test.ts           co-located smoke tests (vitest + analog + TestBed)
```

## 3. The package boundary (important)

The React package is a **separate bundle** from the core. At build time, tsup marks
`@agility-workbench/grid`, `react`, and `react-dom` as *external* — they are not bundled
into the React output (its dist is ~12 KB ESM / ~13 KB CJS). This means:

- **React source *and its tests* may only import the core through its public entry** — the bare
  specifier `@agility-workbench/grid`. Deep imports like `@agility-workbench/grid/renderer/...`
  (or the dev-only `@grid/...` alias) would not resolve against the core's bundled `dist/`, which
  has no such subpaths, so they are not used anywhere under `packages/react-grid/src`. The
  package-resolution regression test (`src/packageResolution.test.ts`) guards this by failing if the
  React tsconfig ever re-aliases `@agility-workbench/grid` to grid source or `dist`.
- Everything the React layer needs is therefore **re-exported from
  [`packages/grid/src/index.ts`](packages/grid/src/index.ts)** (e.g. `IGridAPI`, cell-renderer
  types, `isClassRenderer`, the header / tooltip / ActionFrame component contracts and their
  `isClass…` guards, menu adapter/context types, `initDomRenderer`, `CanvasMeasurer`, `isFalse`).
  When the React layer needs a new core symbol, **add it to the core's `index.ts` first** — the
  React adapters (`adaptTooltip`, `adaptActionFrame`, header/cell adapters) all depend on these
  re-exports.
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

## 4. Package resolution: three contexts

The React package resolves the core exactly the way a published consumer does — as a normal
npm workspace dependency, through `packages/grid/package.json`. There is **no TypeScript path
alias** mapping `@agility-workbench/grid` to grid source or built declarations. Three distinct
resolution contexts exist; keep them separate:

**A. Playground / test source (root configs)** — `vite.config.ts`, `vitest.config.ts`, and root
`tsconfig.json` alias package names *and* the legacy internal names straight to source, so the demo
and the test runner never need a build:

| Alias | Resolves to |
| --- | --- |
| `@agility-workbench/grid` | `packages/grid/src` |
| `@agility-workbench/react-grid` | `packages/react-grid/src` |
| `@grid`, `@grid/*` | `packages/grid/src` (used inside core source + co-located tests) |
| `@react-grid`, `@react-grid/*` | `packages/react-grid/src` |

This is a convenience for the dev loop only. It must **not** be relied on to make a package
boundary look valid: the React *package* typecheck (context B) does not see these aliases, so an
invalid deep import into grid internals fails there even though the playground/tests would resolve
it against source.

**B. React package build/typecheck (`packages/react-grid/tsconfig.json`)** — carries **no path
aliases at all**. `@agility-workbench/grid` resolves through the workspace symlink
`node_modules/@agility-workbench/grid → packages/grid` and that package's
`package.json` (`exports` → `types` → `dist/index.d.ts`). This is byte-for-byte the surface a
registry consumer resolves, it validates the complete `exports`/`types`/`main`/`module` map, and it
keeps the core's internal `@grid/*` aliases out of the React compile — without depending on a
specific generated filename.
  **Consequence: the grid package's declarations must exist before react-grid typechecks.** The
  root `typecheck` script builds grid first (`build:grid`), so it works from a clean checkout where
  `dist/` does not yet exist; `build` builds grid before react for the same reason (see §5).

**C. Grid package build/typecheck (`packages/grid/tsconfig.json`)** — keeps the internal
`@grid`/`@grid/*` aliases (core source uses them in a handful of files). These never appear in the
built `dist/*.d.ts` (tsup bundles them away), so they never leak to a consumer.

> The `@grid` / `@react-grid` aliases are a legacy of the pre-split layout. They are
> dev-only (never in published output). A future cleanup could rewrite core source to use
> relative imports and drop them, but it is not required for publishing.

> **Why not alias `@agility-workbench/grid` → `../grid/dist/index.d.ts` in the React tsconfig?**
> That was the previous mechanism. It was removed: it hard-coded a generated filename and output
> layout, bypassed `packages/grid/package.json` entirely (so `exports`/`main`/`module`/CSS-subpath
> were never validated), and forced maintainers to understand a resolution path no consumer uses.
> Resolving through the manifest (context B) fixes all four. A regression test
> (`packages/react-grid/src/packageResolution.test.ts`) fails if any such alias reappears.

## 5. Build pipeline

### Core (`@agility-workbench/grid`)

`npm run build` in `packages/grid` runs: `clean` → `generate` → `tsup`.

1. **`clean`** — removes `dist/`.
2. **`generate`** (`scripts/build-css.mjs`) — reads `src/theme/table.css`, inlines all 29 SVG
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

### Angular (`@agility-workbench/angular-grid`)

`npm run build` runs `clean` → `ng-packagr` (entry `src/public-api.ts`). Angular libraries cannot
be shipped as plain tsup output: consumers' Angular compilers must finish the compilation, so
ng-packagr emits the Angular Package Format — `dist/fesm2022/*.mjs` compiled in **partial-Ivy**
mode (`compilationMode: "partial"` in `tsconfig.lib.json`), flattened `index.d.ts`, and a
generated `dist/package.json` with the `exports` map. Because the manifest is generated into
`dist/`, **publishing happens from `dist/`** (`publishConfig.directory: "dist"`), not the package
root. Building against Angular `~20.3` with partial compilation is what makes the package
consumable by Angular 20.3 **and newer** (`peerDependencies: { "@angular/core": ">=20.3.0" }`).

### From the repo root

| Command | Effect |
| --- | --- |
| `npm install` | Installs all deps and symlinks the workspaces into `node_modules/@agility-workbench/`. The plain `^0.2.0` semver range in react-grid's `dependencies` links to the local `packages/grid` automatically. |
| `npm run build` | `build:grid` → `build:react` → `build:angular` — explicit order (both bindings' builds need grid's `dist/*.d.ts`; see §4B). |
| `npm run typecheck` | `build:grid` (so grid declarations exist on a clean checkout) → typecheck grid → `typecheck:react` → `typecheck:angular` → `typecheck:react-playground` → `typecheck:angular-playground`. Explicit, not workspace-traversal order. |
| `npm test` | Runs the root Vitest suite (grid + react-grid, including the package-resolution regression guard), then `test:angular`. |
| `npm run test:angular` | Runs the Angular binding's suite via its own vitest config (`packages/angular-grid/vitest.config.mts`) — Angular components in tests are compiled by `@analogjs/vite-plugin-angular`, so they can't join the root suite's include list. |
| `npm run dev` | Starts the React demo at `http://localhost:5176`. |
| `npm run dev:angular` | Starts the Angular demo at `http://localhost:5180` (vite.angular.config.ts + analog Angular plugin). |
| `npm run clean` | Cleans every package's `dist/` plus root `dist-demo/`. |

The root scripts are deliberately explicit (`build:grid`/`build:react`/`build:angular`,
`typecheck:react`/`typecheck:angular`/`typecheck:react-playground`) rather than relying on
unspecified `--workspaces` traversal order, because both bindings' typechecks consume grid's
**generated** declarations.

## 6. Publishing to npm

Both packages are publish-ready. Current state of the manifests:

- `@agility-workbench/grid` — `"private"` is absent (publishable), `publishConfig.access: "public"`,
  `provenance: true`, `exports` map (`.`, `./styles.css`, `./package.json`), `files: ["dist","README.md","LICENSE"]`,
  `prepublishOnly: "npm run build"`, `sideEffects: ["**/*.css"]`.
- `@agility-workbench/react-grid` — same publish config; `dependencies: { "@agility-workbench/grid": "^0.2.0" }`,
  `peerDependencies: { react, react-dom }` (optional in practice — provided by the host app),
  `sideEffects: false`.
- `@agility-workbench/angular-grid` — same publish config plus `publishConfig.directory: "dist"`
  (ng-packagr generates the real manifest there — publish the `dist/` folder, see §5);
  `dependencies: { "@agility-workbench/grid": "^0.2.0", tslib }`,
  `peerDependencies: { "@angular/core": ">=20.3.0" }`.

### What is achievable today

- ✅ **Publish the core standalone.** `@agility-workbench/grid` has no runtime deps and works
  in any framework (or none). `npm publish` from `packages/grid` produces a tarball with
  `dist/{index.js,index.cjs,index.d.ts,index.css}` + LICENSE + README.
- ✅ **Publish the React binding.** `@agility-workbench/react-grid` resolves the core from the
  registry via its `^0.2.0` range. Its tarball is tiny because the core is not bundled in.
- ✅ **Dual module formats.** Both ship ESM + CJS + type declarations, resolved through the
  `exports` map for modern bundlers and `main`/`module`/`types` for legacy resolution.
- ✅ **CSS needs no setup.** The grid injects its own stylesheet on attach — a `<style>` first
  in `<head>` for documents (so author CSS still wins at equal specificity; `styleNonce` covers
  strict CSP), and `adoptedStyleSheets` for shadow roots (CSP-exempt, and document styles do not
  cross the boundary). `import "@agility-workbench/grid/styles.css"` remains available as an
  escape hatch for CSP-restricted apps and build-time CSS tooling; pair it with
  `suppressStyleInjection` so the two copies do not fight in the cascade.
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
npm test                                        # 458 tests must pass
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
