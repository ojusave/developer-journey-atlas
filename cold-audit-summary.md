# Independent cold-audit summary

Audit date: 2026-07-18

The three batch researchers rotated across batches and re-read current official
documentation without editing the records they were auditing. Every reported
discrepancy was returned to an owner for correction and then narrowly rechecked
against the same official source.

## Batch 1 high-risk records

Final result: 12 of 12 pass.

- Passed on first cold read: Cloudflare, Supabase, Replicate, Resend, Stream,
  1Password Developer, Sentry, and New Relic.
- Corrected and rechecked: Google Cloud Platform made Free Trial optional;
  Auth0 restored the exact `npm init -y` command; WorkOS stopped at the
  installer's documented terminal; Plaid stopped citing conflicting
  `npm install` and `npm ci` sources as if they agreed.

## Batch 2 reworked records

Final result: 9 of 9 pass.

- Passed on first cold read: IBM Cloud, Elastic, Microsoft Entra ID, and
  Coinbase Developer Platform.
- Corrected and rechecked: Mistral AI and SAP BTP restored explicit vendor time
  claims; Twilio restored ngrok, Flask, and the exact install command; Okta
  restored omitted Dashboard and authorization-server actions; Workday restored
  App Builder selection and removed inferred sign-in and MFA actions.

## Batch 3 reworked records

Final result: 15 of 15 pass.

- Passed on first cold read: AWS, Heroku, MongoDB, Hugging Face, Vonage, Pulumi,
  and Mapbox.
- Corrected and rechecked: Grafana Cloud restored the outbound HTTPS firewall
  requirement; OCI split contact and payment-verification screens; Clerk was
  rebuilt from the current CLI-first quickstart; Snyk separated alternative
  commands; Stripe restored the public callback constraint and exact test card
  values; Wise gained an executable personal-token route and version-drift
  uncertainty; Atlassian restored the Forge environment prompt; Apple expanded
  all 32 live Hello SwiftUI tutorial actions atomically.

## Final state

- 36 of 36 independently cold-audited records pass.
- `cold-audit-open.json` is empty.
- Official URLs and exact evidence remain in each canonical JSON record.
