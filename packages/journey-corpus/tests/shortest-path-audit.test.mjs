import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const render = JSON.parse(await readFile(new URL("../audits/render.json", import.meta.url), "utf8"));
const zoom = JSON.parse(await readFile(new URL("../audits/zoom.json", import.meta.url), "utf8"));
const status = JSON.parse(await readFile(new URL("../audit-status.json", import.meta.url), "utf8"));

test("Render uses the verified shortest Dashboard route", () => {
  assert.equal(render.audit_status, "verified");
  assert.equal(render.starting_state.boundary, "account creation");
  assert.equal(render.required_path.length, 8);
  assert.equal(render.counts.required_actions, 8);
  assert.equal(render.counts.required_fields, 13);
  assert.deepEqual(
    render.required_path.map((step) => step.action),
    [
      "Create a Render account with the email and password route.",
      "In the Render Dashboard, choose New > Web Service.",
      "Select Git Provider and choose GitHub from the service creation flow.",
      "Authorize Render's GitHub integration to access the repository used for the deployment.",
      "Select the application repository and choose Connect.",
      "Complete the required Web Service configuration.",
      "Select Deploy or Create Web Service to submit the service configuration.",
      "After the deploy reaches Live, open the service's onrender.com URL.",
    ],
  );
  assert.ok(render.required_path.every((step) => step.evidence_state !== "unverified"));
  assert.ok(render.required_path.every((step) => !["documentation"].includes(step.interface)));
});

test("Zoom withholds counts until the app route and hidden terms transition are resolved", () => {
  assert.equal(zoom.audit_status, "needs-human-judgment");
  assert.equal(zoom.starting_state.boundary, "account creation");
  assert.equal(zoom.counts, null);
  assert.ok(zoom.uncertainties.some((item) => /terms-acceptance/.test(item.question)));
  assert.ok(zoom.required_path.some((step) => step.evidence_state === "unverified"));
});

test("every roster record has an explicit audit status", () => {
  assert.ok(status.total >= 205);
  assert.equal(status.records.length, status.total);
  assert.equal(status.verified, 1);
  assert.equal(status.pending, 0);
  assert.equal(
    status.verified + status.needs_human_judgment + status.blocked + status.pending,
    status.total,
  );
  assert.ok(status.records.every((row) => row.status !== "pending"));
  assert.ok(status.records.every((row) => row.audit_url));
});
