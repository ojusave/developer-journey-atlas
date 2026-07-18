# First Mile diagnostic Workflow

This Workflow runs one bounded diagnostic turn. Its task argument contains only:

```json
{
  "turnId": "019f71fe-d47c-7963-8b86-b59ee39c1ae2",
  "sessionRevision": 1,
  "idempotencyKey": "119f71fe-d47c-4963-8b86-b59ee39c1ae2"
}
```

Both identifiers must be generated UUIDs, and the session revision must be a positive integer. Extra fields are rejected before any network call.

The task calls the web service's protected `/internal/workflow/turn` endpoint. The web service remains responsible for loading the short-lived turn envelope, checking the session revision and idempotency key, executing the diagnostic turn, persisting the result, and expunging transient content.

Required Workflow environment variables:

- `SCANNER_INTERNAL_BASE_URL`: the web service's same-region private URL, such as `http://first-mile-scanner:10000`
- `INTERNAL_WORKFLOW_SECRET`: a shared random secret of at least 32 characters
- `SCANNER_INTERNAL_TIMEOUT_MS`: optional request timeout, default `45000`

Local checks:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Local registration check:

```sh
render workflows dev -- npm run dev
render workflows tasks list --local
```

Blueprints do not create or manage Workflow services. Create the Workflow with the current Render CLI:

```sh
render workflows create --confirm \
  --name first-mile-scanner-workflows \
  --repo https://github.com/ojusave/devrelcon-first-mile-scanner \
  --branch main \
  --root-directory workflows \
  --build-command 'npm ci --include=dev && npm run build' \
  --runtime node \
  --run-command 'npm start' \
  --region oregon
```

Set `SCANNER_INTERNAL_BASE_URL` and the same `INTERNAL_WORKFLOW_SECRET` on both resources during creation. The current Workflow is `wfl-d9dpkutaeets739p4m50`, and `diagnosticTurn` is registered in version `wfv-d9dpp5v41pts73dlmj30`.

Keep the Workflow and web service in the same region. Render currently documents that a Workflow in a network-isolated project environment cannot use that environment's private network, so do not enable network isolation for this pair until that limitation changes.
