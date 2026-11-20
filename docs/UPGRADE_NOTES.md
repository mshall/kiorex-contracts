# Upgrade notes (kiorex-contracts)

Toolchain and dependency refresh of 20 Nov 2026. Runtime: **Node 26.13.1 (Lithium, Active LTS)**.

## Versions

| Tool | Before | After |
|---|---|---|
| Node.js (`.nvmrc`, CI, `engines`) | 22 (`>=22`) | 26.13.1 (`>=26.13.0`) |
| npm (bundled with Node 26.13.1) | 11.12 | 11.20 |
| TypeScript | 5.9.3 | 5.9.3 (**pinned**, see below) |
| @types/node | 22.20.5 | 26.6.6 |
| Vitest | 2.1.9 | 5.1.1 (+ explicit `vite` 8.3.8, required peer) |
| tsup (esbuild) | 8.5.1 | 9.0.0, `target: node26` |
| openapi-typescript | 7.13.0 | 7.13.0 (latest) |
| ajv / ajv-formats | 8.x / 3.x | 8.x / 3.x (latest within major) |
| actions/checkout, actions/setup-node | v4 | v7 (`node-version-file: .nvmrc`) |

## Pinned / blocked

- **TypeScript stays on 5.9.x (`~5.9.3`).** TypeScript 7 (native compiler) has no JS compiler API: `openapi-typescript` (used by `npm run generate`) crashes at import (`ts.factory` undefined) and declares `peerDependencies: typescript ^5.x`, and `tsup` builds `.d.ts` through the compiler API. TypeScript 6.0 satisfies neither the peer range nor tsup's dts step cleanly (`baseUrl` deprecation error inside tsup). Unblocks when `openapi-typescript` ships a release supporting TS 6/7 and `tsup` builds declarations without the JS API; then bump `typescript` and rerun the verify steps.

## Breaking changes handled

- Vitest 5 requires `vite` as an explicit peer: added as devDependency (`^8.3.8`). No config or test changes were needed.
- Node 26: `tsup` target moved to `node26`; CI uses `.nvmrc` as the single source of the Node version.

## Verify

```bash
nvm use            # reads .nvmrc (26.13.1)
rm -rf node_modules && npm ci
npm run lint && npm test && npm run build
npm run pack:local # vendored tarball recipe: dist-pack/kiorex-contracts-<version>.tgz
npm audit          # 0 vulnerabilities at upgrade time
```

Results at upgrade time: typecheck clean, 116/116 tests, build (ESM, CJS, d.ts) and tarball OK, generated files unchanged, `npm audit` clean.
