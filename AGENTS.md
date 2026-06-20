# AGENTS.md

## Cursor Cloud specific instructions

### Repository layout
- The original deliverable shipped as `lucrom_fonte.tar.gz` (a Replit export). The runnable app has been extracted into `lucrom/` and is the source of truth for development. The tarball and `Lucrom_Auditoria_Completa.docx` / `Banco Digital` files are reference artifacts only.
- `lucrom/` is a Vite + React 18 + TypeScript + Tailwind v4 single-page app (a Brazilian digital-bank UI). The entire app lives in one large file: `lucrom/src/LucromUnificado.jsx` (~12.5k lines, marked `@ts-nocheck`). `src/components/ui/*` are shadcn/ui components.

### Running / building (all commands run from `lucrom/`)
- The Vite config (`lucrom/vite.config.ts`) REQUIRES two env vars or it throws on startup: `PORT` and `BASE_PATH`. Always set them, e.g. `PORT=5000 BASE_PATH=/ pnpm dev`.
- Dev server: `PORT=5000 BASE_PATH=/ pnpm dev` (serves on `0.0.0.0:5000`).
- Build: `PORT=5000 BASE_PATH=/ pnpm build` (output `dist/public`). The `PORT`/`BASE_PATH` vars are required even for build.
- Preview built output: `PORT=5000 BASE_PATH=/ pnpm serve`.
- Typecheck (the only "lint"-style check; there is no ESLint config): `pnpm typecheck`.

### Notes / gotchas
- The original `package.json` used pnpm `catalog:` / `workspace:*` references from a larger monorepo that was NOT included in the export. These were pinned to concrete versions so the package installs standalone. The `@workspace/api-client-react` workspace dependency was removed because nothing in `src/` imports it.
- `typescript` was added to devDependencies so the `typecheck` script works (the original relied on the monorepo root).
- `index.html` references `/favicon.svg`, which is not included; the resulting 404 is harmless.
- The app loads FingerprintJS from a remote CDN at runtime; it fails open (no network = no crash).
