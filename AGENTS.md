# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is

The product is **Lucrom**, a Brazilian fintech SPA for micro-entrepreneurs (MEIs).
It is a **frontend-only React 18 + Vite + TypeScript** app that runs in **demo
mode**: there is no backend, no database, and no real external API in this repo.
All business logic (score engine, ledger, auth, role switching between
MEI/Parceiro/Admin) runs in the browser, and state lives in memory +
`sessionStorage`/`localStorage`.

The app source originally shipped only inside `lucrom_fonte.tar.gz`. It has been
extracted and committed to `artifacts/lucrom/` (with `catalog:`/`workspace:*`
dependency protocols from the original pnpm monorepo resolved to concrete npm
versions, and the unused `@workspace/api-client-react` workspace dependency
removed). Work in `artifacts/lucrom/`; the tarball is just the original archive.

### Running the app (the only service)

All commands run from `artifacts/lucrom/`. Scripts are defined in
`artifacts/lucrom/package.json`.

- **Dev server:** `PORT=5000 BASE_PATH=/ npm run dev` (serves on `0.0.0.0:5000`).
- **Build:** `PORT=5000 BASE_PATH=/ npm run build` (outputs to `dist/public`).
- **Preview built app:** `PORT=5000 BASE_PATH=/ npm run serve`.

**Gotcha:** `vite.config.ts` throws on startup unless **both** `PORT` and
`BASE_PATH` environment variables are set. Every vite command (dev/build/serve)
requires them.

### Testing / lint

There are **no automated tests and no lint config** in this repo. The
`typecheck` script in `package.json` references a `tsconfig.json` that is not
shipped, so it is not runnable as-is. Validate changes by running the dev server
and exercising the UI.

### Demo-mode behavior (not a bug)

State is in-memory only. Newly created records (e.g. a "Lançamento") show a
success toast but do not persist across a page refresh, and the app resets to
its seeded demo data on reload. This is expected demo behavior, not a defect.
The app loads already authenticated as a demo MEI user.
