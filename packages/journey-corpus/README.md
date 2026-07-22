# Journey corpus and public wrapper

This package contains the preserved platform evidence records, shortest-required-path audits, generated data interfaces, public Developer Journey Atlas wrapper, and optional missing-platform research pipeline.

Start with the [repository README](../../README.md), then use:

```sh
npm ci
npm run audit:paths:check
npm run build:data
npm run build:app
npm run test:app
npm start
```

Preserved source records live in `records/`. Reviewed account-creation-to-first-success paths live in `audits/`. Only verified audits may expose counts or peer comparison. Do not edit generated files directly.

Software is Apache-2.0. Original research is licensed under Creative Commons Attribution 4.0 International. See the repository [`LICENSE_SCOPE.md`](../../LICENSE_SCOPE.md) for controlling path boundaries.
