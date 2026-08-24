# Standalone consumer fixtures

Each directory is a minimal, self-contained application that consumes the **packed
`.tgz` artifacts** exactly like an external npm user — no workspace links, no
monorepo aliases, no source imports. CI's consumer jobs (`.github/workflows/ci.yml`)
download the tarballs produced by the `package` job and run each fixture's gates
against them. These are release gates 12–14 of the V1 readiness report.

| Fixture | Framework | Gates |
| ------- | --------- | ----- |
| `core` | Vanilla Vite + strict TypeScript | typecheck, production build (root + `styles.css` subpath imports), happy-dom runtime smoke |
| `react` | React 19 (CI also runs a React 18 matrix leg) | typecheck, production build, duplicate-React check, StrictMode mount/filter/select smoke |
| `angular-20` | Angular 20.3 — the peer floor, zone-based | production AOT build (Ivy linker over the partial-Ivy FESM), `ng test` mount/filter/sort/select smoke |
| `angular-21` | Angular 21, zoneless | same |
| `angular-22` | Angular 22, zoneless | same |

## Rules

- The committed `package.json` files must **never** contain `@agility-workbench/*`
  dependencies — the tarballs are installed at run time (`npm install <path to .tgz>`),
  so the fixtures always test the artifacts just built, whatever their version.
- Install order matters: fixture dependencies first, matrix version overrides second,
  tarballs **last**. An `npm install` after the tarballs prunes them, and module
  resolution then silently walks up into the monorepo root — exactly the assistance
  these fixtures exist to rule out.
- Lockfiles, `dist/`, `out-tsc/`, and `.angular/` are gitignored; each CI run resolves
  fresh so the fixtures honestly track the latest patch of each framework major.
- When a new framework major must be supported, copy the nearest fixture, bump its
  toolchain, verify locally, then add it to the CI matrix and widen the peer range —
  in that order (see `docs/maintainers/repository.md`).

## Running locally

```bash
npm run pack:packages   # from the repo root; tarballs land in artifacts/npm
cd ci/consumers/<fixture>
npm install
npm install ../../../artifacts/npm/agility-workbench-grid-<version>.tgz \
            [../../../artifacts/npm/agility-workbench-<binding>-<version>.tgz]
npm run build && npm test    # plus `npm run typecheck` for core/react
git checkout -- package.json # discard the run-time tarball dependency entries
```

Note for `angular-22`: its CLI requires Node >= 22.22.3.
