import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const render = JSON.parse(await readFile(new URL("../audits/render.json", import.meta.url), "utf8"));
const zoom = JSON.parse(await readFile(new URL("../audits/zoom.json", import.meta.url), "utf8"));
const status = JSON.parse(await readFile(new URL("../audit-status.json", import.meta.url), "utf8"));

test("Render uses the compacted official Dashboard Web Service first-deploy path", () => {
  assert.equal(render.audit_status, "needs-human-judgment");
  assert.equal(render.starting_state.boundary, "account creation");
  assert.equal(render.required_path.length, 6);
  assert.equal(render.counts, null);
  assert.deepEqual(
    render.required_path.map((step) => step.action),
    [
      "Open Your First Render Deploy and follow the Dashboard deployment path for a Web Service.",
      "Sign up for a free Render account.",
      "Connect a Git provider under Account Settings → Git Deployment Credentials.",
      "Create a Web Service from the connected Git repository.",
      "Click Deploy to create the Web Service and start the first build.",
      "Wait until the deploy is Live, then open the service's onrender.com URL and confirm the app's root content.",
    ],
  );
  assert.ok(render.required_path.every((step) => step.evidence_state !== "unverified"));
  assert.match(render.first_success.outcome, /Live|onrender\.com/i);
});

test("Zoom withholds counts and extends first success through OAuth token exchange and an API call", () => {
  assert.equal(zoom.audit_status, "needs-human-judgment");
  assert.equal(zoom.starting_state.boundary, "account creation");
  assert.equal(zoom.counts, null);
  assert.match(zoom.first_success.outcome, /users\/me|access_token|REST API/i);
  assert.ok(zoom.required_path.some((step) => /oauth\/token/i.test(step.action)));
  assert.ok(zoom.required_path.some((step) => /users\/me/i.test(step.action)));
  assert.ok(zoom.uncertainties.some((item) => /terms-acceptance/.test(item.question)));
  assert.ok(zoom.required_path.some((step) => step.evidence_state === "unverified"));
});

test("every roster record has an explicit audit status", () => {
  assert.ok(status.total >= 205);
  assert.equal(status.records.length, status.total);
  assert.equal(status.verified, 0);
  assert.equal(status.pending, 0);
  assert.equal(
    status.verified + status.needs_human_judgment + status.blocked + status.pending,
    status.total,
  );
  assert.ok(status.records.every((row) => row.status !== "pending"));
  assert.ok(status.records.every((row) => row.audit_url));
});
