# Developer Journey Atlas naming migration

## Decision

The public product name is Developer Journey Atlas.

## This migration

Use the new name in integration documentation and generated Atlas views. Preserve historical filenames, blocker IDs, repository URLs, package names, storage keys, database identifiers, environment variables, Render resources, telemetry service names, and deployed URLs.

## Later migration

Rename technical identifiers only after the consolidated repository is approved and published. Inventory each identifier, identify readers and writers, provide compatibility aliases, verify rollback, and migrate one boundary at a time.

Do not rename the GitHub repository and Render resources in the same change. Do not change browser storage or exported case schemas without explicit backward-compatibility tests.

Historical source text may continue to use “first mile” when changing it would falsify provenance or break stable references.
