# Atlas Postgres serving (hybrid)

Date checked: 2026-07-22 (Render Blueprint `databases` + `fromDatabase.connectionString`; Prisma 6.19.3).

## Decision

Runtime serving moves to **Render Managed PostgreSQL**. Git-committed `records/`, `audits/`, and the blocker catalog remain the **import and review** source. The app selects the store via `DATA_STORE` (`postgres` | `local`). Rollback: set `DATA_STORE=local`.

## Why hybrid

Evidence archives need PR review and SHA checks. Postgres is for queryable joins: journey steps, friction gates, and the 790 stable blocker IDs (`U00.01`, `P01.05`).

## Schema (join path)

`Platform` → `JourneyStep` / `FrictionGate` → soft map `GateTypeFamilyMap` → `CatalogNode` families → reason children (`kind=reason`). Optional `GateBlockerLink` for curated overlays.

## Seed / migrate on Render

- `preDeployCommand`: `npm run db:setup` (`prisma migrate deploy` + `node dist/db/seed.js`) on a paid web instance (`starter` or larger; do not use free)
- Seed is idempotent (upsert by slug / catalog id)
- `blocker-catalog.json` is copied into the package during `build:data`

## Honesty

Friction gates are documented requirements. Blocker reasons are hypotheses (`not_diagnosis_eligible` by default). Not drop-off telemetry.

## Local

```bash
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/atlas
npm run prisma:generate
npx prisma migrate dev --name init
npm run build:app && npm run db:seed
DATA_STORE=postgres npm start
```

Probe: `GET /api/platforms/resend/journey` and `GET /api/blockers/meta`.
