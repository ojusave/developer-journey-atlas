# Journey corpus and public wrapper

This package contains the canonical platform records, generated data interfaces, public Developer Journey Atlas wrapper, and optional missing-platform research pipeline.

Start with the [repository README](../../README.md), then use:

```sh
npm ci
npm run build:data
npm run build:app
npm run test:app
npm start
```

Canonical records live in `records/`. Do not edit generated files directly. The public comparison is documentation-derived and never claims observed drop-off.

Software is Apache-2.0. Original research is licensed under Creative Commons Attribution 4.0 International. See the repository [`LICENSE_SCOPE.md`](../../LICENSE_SCOPE.md) for controlling path boundaries.
