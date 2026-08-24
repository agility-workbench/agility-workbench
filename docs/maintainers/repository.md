# Repository Setup & Publishing Guide

> Developer-facing reference for how this repository is organized, how the code is
> split into packages, and what is required to publish the libraries to npm.
> For the grid's *feature* architecture, see
> [`../architecture/current-state.md`](../architecture/current-state.md);
> for consumer-facing usage, see each package's `README.md`.

## 1. Overview

This is an **npm-workspaces monorepo** hosted at
`github.com/agility-workbench/agility-workbench`. It produces three independently
versioned, independently publishable packages:

| Package | npm name | Role |
| --- | --- | --- |
| `packages/grid` | `@agility-workbench/grid` | Framework-agnostic data-grid core (engine, renderer, theming, export). No framework dependency. |
| `packages/react-grid` | `@agility-workbench/react-grid` | Thin React binding (`<Grid />`) built on the core. Depends on `@agility-workbench/grid`. |
| `packages/angular-grid` | `@agility-workbench/angular-grid` | Standalone Angular binding (`<awb-grid>`) built on the core. Depends on `@agility-workbench/grid`; **publishes from its generated `dist/`** (see §5, §6). |

The workspace globs are `packages/*` **and** `apps/docs`. `apps/docs` is the
Docusaurus site (`@agility-workbench/docs`, private, never published); the two
playgrounds under `apps/` are plain Vite apps, not workspaces.

The repository **root is private** (`"private": true`, name `agility-workbench`) and
is never published — it only orchestrates the workspaces, the shared dev tooling, the
docs site, and the demo apps.

**Toolchain:** Node ≥ 18 for the core/React packages, but the Angular toolchain
requires `^20.19.0 || ^22.12.0 || >=24` — develop on Node 22. npm workspaces
(developed on npm 10.9.2), [tsup](https://tsup.egoist.dev/) for core/React bundling,
[ng-packagr](https://github.com/ng-packagr/ng-packagr) 20.3 for the Angular package,
[Vite](https://vite.dev/) for the demos, [Vitest](https://vitest.dev/) for tests,
[Docusaurus](https://docusaurus.io/) for the docs site, TypeScript 5.

There is **no lint setup** in this repository today. Non-publishing CI runs on every push/PR
(`.github/workflows/ci.yml`); there is **no publishing automation** yet (see §7).

## 2. Directory layout

```
agility-workbench/                 ← private workspace root
├── package.json                   workspaces:["packages/*","apps/docs"], shared devDeps, orchestration scripts
├── LICENSE                        MIT (same text each package ships)
├── tsconfig.base.json             shared compiler options (extended by every package)
├── tsconfig.json                  root config for the react-playground app + editor (path aliases)
├── vite.config.ts                 react-playground dev server; aliases → packages/*/src
├── vite.angular.config.ts         angular-playground dev server (analog Angular plugin; port 5180)
├── vitest.config.ts               test discovery + aliases (grid + react-grid)
├── scripts/
│   └── check-export-parity.mjs    release gate: built .d.ts/.d.cts vs ESM/CJS runtime exports (§6)
├── examples/                      documentation fragments (not built, not published)
├── docs/
│   ├── maintainers/repository.md  ← this document
│   └── architecture/current-state.md   feature/architecture reference
│
├── apps/
│   ├── docs/                      Docusaurus site — a workspace, private, never published
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
        ├── package.json           depends on grid (semver); @angular/core as peer (^20.3.0 || ^21 || ^22); publish from dist/
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

**The Angular package obeys the identical boundary.** `packages/angular-grid` externalizes the
core, imports it only through the bare `@agility-workbench/grid` specifier, and re-exports it with
`export * from "@agility-workbench/grid"` in `src/public-api.ts`. So the rule above is general: when
either binding needs a new core symbol, **add it to the core's `index.ts` first**.

Because both bindings re-export the core wholesale, a defect in the core's public surface
propagates to both — which is why `npm run check:exports` (§6) validates the core and React
declaration/runtime parity as a release gate.

### Dependency direction

```
@agility-workbench/react-grid  ──depends on──▶ ┐
                                               ├──▶ @agility-workbench/grid
@agility-workbench/angular-grid ──depends on──▶ ┘            │
        │                     │                              │
   peer: react,          peer: @angular/core        devDep: exceljs (test-only verifier)
   react-dom             dep:  tslib
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
consumable by Angular 20.3 **and newer**. The peer range lists each major we have verified against
the packed artifact (`peerDependencies: { "@angular/core": "^20.3.0 || ^21.0.0 || ^22.0.0" }`);
when a new Angular major ships, add a `ci/consumers/angular-<major>` fixture (copy the nearest
one, bump its toolchain, verify locally), add the major to the `consumer-angular` matrix in
`.github/workflows/ci.yml`, and only then widen the peer range — see `ci/consumers/README.md`.

### From the repo root

| Command | Effect |
| --- | --- |
| `npm install` | Installs all deps and symlinks the workspaces into `node_modules/@agility-workbench/`. The plain `^1.0.0` semver range in react-grid's `dependencies` links to the local `packages/grid` automatically. |
| `npm run build` | `build:grid` → `build:react` → `build:angular` — explicit order (both bindings' builds need grid's `dist/*.d.ts`; see §4B). |
| `npm run typecheck` | `build:grid` (so grid declarations exist on a clean checkout) → typecheck grid → `typecheck:react` → `typecheck:angular` → `typecheck:react-playground` → `typecheck:angular-playground`. Explicit, not workspace-traversal order. |
| `npm test` | Runs the root Vitest suite (grid + react-grid, including the package-resolution regression guard), then `test:angular`. |
| `npm run test:angular` | Runs the Angular binding's suite via its own vitest config (`packages/angular-grid/vitest.config.mts`) — Angular components in tests are compiled by `@analogjs/vite-plugin-angular`, so they can't join the root suite's include list. |
| `npm run check:exports` | Release gate: asserts every value export in the built `.d.ts`/`.d.cts` exists in the ESM/CJS runtime (and vice versa) for core and React. Requires a prior `npm run build`. |
| `npm run pack:packages` | `build` → `check:exports` → `npm pack` all three into `artifacts/npm`, with Angular correctly targeting `packages/angular-grid/dist`. |
| `npm run docs:build` | Builds grid + react, then the Docusaurus site in `apps/docs`. |
| `npm run dev` | Starts the React demo at `http://localhost:5176`. |
| `npm run dev:angular` | Starts the Angular demo at `http://localhost:5180` (vite.angular.config.ts + analog Angular plugin). |
| `npm run clean` | Cleans every package's `dist/` plus root `dist-demo/`. |

The root scripts are deliberately explicit (`build:grid`/`build:react`/`build:angular`,
`typecheck:react`/`typecheck:angular`/`typecheck:react-playground`) rather than relying on
unspecified `--workspaces` traversal order, because both bindings' typechecks consume grid's
**generated** declarations.

## 6. Publishing to npm

All three packages are publish-ready. Current state of the manifests:

- `@agility-workbench/grid` — `"private"` is absent (publishable), `publishConfig.access: "public"`,
  `provenance: true`, `exports` map (`.`, `./styles.css`, `./package.json`), `files: ["dist","README.md","LICENSE"]`,
  `prepublishOnly: "npm run build"`, `sideEffects: ["**/*.css"]`.
- `@agility-workbench/react-grid` — same publish config; `dependencies: { "@agility-workbench/grid": "^1.0.0" }`,
  `peerDependencies: { react, react-dom }` (optional in practice — provided by the host app),
  `sideEffects: false`.
- `@agility-workbench/angular-grid` — same publish config plus `publishConfig.directory: "dist"`
  (ng-packagr generates the real manifest there — publish the `dist/` folder, see §5);
  `dependencies: { "@agility-workbench/grid": "^1.0.0", tslib }`,
  `peerDependencies: { "@angular/core": "^20.3.0 || ^21.0.0 || ^22.0.0" }`.

### What is achievable today

- ✅ **Publish the core standalone.** `@agility-workbench/grid` has no runtime deps and works
  in any framework (or none). `npm publish` from `packages/grid` produces a tarball with
  `dist/{index.js,index.cjs,index.d.ts,index.css}` + LICENSE + README.
- ✅ **Publish the React binding.** `@agility-workbench/react-grid` resolves the core from the
  registry via its `^1.0.0` range. Its tarball is tiny because the core is not bundled in.
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

Because **both** bindings depend on grid by semver range, **publish
`@agility-workbench/grid` first**, then `@agility-workbench/react-grid` and
`@agility-workbench/angular-grid` in either order. If a binding release requires a new core
symbol, bump and publish the core, then bump that binding's dependency range to match.

### Manual publish (first release)

```bash
# from repo root
npm run build                                   # all three, in order
npm test                                        # root suite (grid + react) then test:angular — all must pass
npm run check:exports                           # declaration/runtime parity gate

cd packages/grid          && npm publish        # prepublishOnly re-builds
cd ../react-grid          && npm publish
cd ../angular-grid/dist   && npm publish        # NOTE: publish from dist/, not the package root
```

npm workspaces also allow `npm publish --workspace @agility-workbench/grid` from the root —
**but not for the Angular package.** `publishConfig.directory` does *not* redirect npm's packing:
`npm publish --workspace @agility-workbench/angular-grid` (or packing its root) ships ~52 internal
files — source, tests, tsconfigs, a nested `dist/` — under a root manifest with no runtime entry
fields. The Angular package must always be published/packed from `packages/angular-grid/dist`.

### Pre-publish checklist

- [ ] `npm run build && npm test` clean.
- [ ] `npm run check:exports` passes.
- [ ] `npm pack --dry-run ./packages/grid ./packages/react-grid ./packages/angular-grid/dist` shows
      only `dist/` + LICENSE + README + package.json per package (8, 7, and 5 files respectively).
      Note the explicit `angular-grid/dist` path — do **not** use `--workspace` for Angular.
- [ ] Versions bumped (core before dependents, if coupled).
- [ ] Both bindings' dependency ranges on the core match the version being released.
- [ ] Logged in to npm with access to the `@agility-workbench` scope.

## 7. Not yet set up (recommended follow-ups)

These are **not** in place today and are needed for a smooth, repeatable release process:

- **Automated versioning/changelogs** — e.g. [changesets](https://github.com/changesets/changesets),
  which understands workspaces and the inter-package dependency bump.
- **Publishing automation** — non-publishing CI exists (`.github/workflows/ci.yml`: locked
  install, builds, typecheck, all tests, docs and playground production builds, `check:exports`,
  `check:pack`, checksummed tarball artifacts, and standalone consumer jobs — core, React 18/19,
  Angular 20/21/22 — that install those tarballs like external npm users, see
  `ci/consumers/README.md`), but there is no release workflow yet. When one is added it must
  consume the CI-produced `npm-tarballs` artifact — never rebuild — and run
  `npm publish --provenance` per package on a tag/release (requires `id-token: write`).
- **Lint** — no lint script, dependency, or configuration exists.
- **Documentation *deployment*** — the Docusaurus source **is** in this repo (`apps/docs`, built
  with `npm run docs:build`), but its deployment to the `homepage`
  (`https://agilityworkbench.dev`) is not automated here.
- **Alias cleanup** — optionally remove the dev-only `@grid`/`@react-grid` aliases (§4) by
  converting core/test imports to relative or package-name specifiers.
