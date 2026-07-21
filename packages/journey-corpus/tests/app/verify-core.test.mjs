import test from "node:test";
import assert from "node:assert/strict";

import {
  registrableDomain, sameSite, htmlToText, salientTokens, prepareDoc, findSupportingExcerpt,
} from "../../lib/verify-core.mjs";

test("registrableDomain reduces hosts to eTLD+1, including multi-part suffixes", () => {
  assert.equal(registrableDomain("docs.stripe.com"), "stripe.com");
  assert.equal(registrableDomain("dashboard.render.com"), "render.com");
  assert.equal(registrableDomain("www.example.co.uk"), "example.co.uk");
  assert.equal(registrableDomain("vercel.com"), "vercel.com");
});

test("sameSite treats subdomains of one platform as the same site", () => {
  assert.equal(sameSite("https://docs.stripe.com/get-started", "https://dashboard.stripe.com/register"), true);
  assert.equal(sameSite("https://render.com/docs", "https://dashboard.render.com/register"), true);
  // A third-party doc must not count as the platform's own domain.
  assert.equal(sameSite("https://stackoverflow.com/q/1", "https://render.com/docs"), false);
});

test("htmlToText strips scripts, styles, and tags", () => {
  const html = "<style>a{}</style><h1>Deploy</h1><script>x()</script><p>your first app &amp; more</p>";
  assert.equal(htmlToText(html), "Deploy your first app & more");
});

test("salientTokens drops function words but keeps meaningful terms", () => {
  const toks = salientTokens("Open the Render documentation and follow Deploy my code");
  assert.ok(toks.includes("render"));
  assert.ok(toks.includes("documentation"));
  assert.ok(toks.includes("deploy"));
  assert.ok(!toks.includes("the"));
  assert.ok(!toks.includes("and"));
});

test("findSupportingExcerpt supports a step only on literal co-occurrence", () => {
  const doc = prepareDoc("To deploy your web service, click Create Web Service and wait for the Live status.");
  const ok = findSupportingExcerpt(doc.original, doc.lower, doc.tokens, "Click Create Web Service and confirm the deploy is Live");
  assert.equal(ok.supported, true);
  assert.ok(ok.excerpt.includes("Create Web Service"));
  assert.ok(ok.matchedTokens.includes("live"));

  // Terms that are not in the doc cannot be supported: no paraphrase, no guess.
  const miss = findSupportingExcerpt(doc.original, doc.lower, doc.tokens, "Configure a custom domain and provision a Postgres database");
  assert.equal(miss.supported, false);
});

test("findSupportingExcerpt never passes a single generic term alone", () => {
  const doc = prepareDoc("Dashboard settings appear across many unrelated sentences in the docs.");
  const res = findSupportingExcerpt(doc.original, doc.lower, doc.tokens, "Dashboard");
  assert.equal(res.supported, false);
});
