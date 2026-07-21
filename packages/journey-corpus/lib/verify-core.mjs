// Pure verification helpers for `npm run verify`.
//
// This module holds only deterministic, side-effect-free logic: domain checks,
// HTML-to-text extraction, and literal-excerpt matching. Fetching, caching, and
// filesystem writes live in verify.mjs so this file stays testable in isolation.
//
// The matcher never "agrees" with a doc. A field is supported only when enough
// of its key terms literally co-occur in a single window of the fetched text.
// The returned excerpt is verbatim from the document, so a human can check it.

// A small set of multi-part public suffixes so registrableDomain() does not
// mistake "co.uk" for the registrable domain. Dev platforms are mostly simple
// TLDs, so this list is intentionally short and easy to audit.
const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk",
  "com.au", "net.au", "org.au", "co.nz", "co.za",
  "co.jp", "co.kr", "co.in", "com.br", "com.mx",
  "com.sg", "com.tr", "com.cn", "com.hk",
]);

/** Registrable domain (eTLD+1) of a host, e.g. "docs.stripe.com" -> "stripe.com". */
export function registrableDomain(host) {
  const clean = String(host || "").toLowerCase().replace(/\.$/, "");
  const labels = clean.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

/** Host of a URL, or null when it cannot be parsed. */
export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** True when both URLs share the same registrable domain (same site). */
export function sameSite(urlA, urlB) {
  const a = hostOf(urlA);
  const b = hostOf(urlB);
  if (!a || !b) return false;
  return registrableDomain(a) === registrableDomain(b);
}

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&#039;": "'", "&apos;": "'", "&nbsp;": " ", "&mdash;": "-", "&ndash;": "-",
  "&hellip;": "...", "&rsquo;": "'", "&lsquo;": "'", "&rdquo;": '"', "&ldquo;": '"',
};

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&[a-z]+\d*;/gi, (m) => ENTITIES[m.toLowerCase()] ?? " ");
}

function safeCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
}

/** Strip HTML to readable text. Removes script/style/comments, then tags. */
export function htmlToText(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

// Function words only. Instructional verbs (click, select, deploy, create) are
// kept because they are genuine content of a documented step.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "you", "this", "that", "from", "into",
  "are", "was", "were", "its", "has", "have", "had", "will", "would", "can",
  "could", "should", "not", "but", "any", "all", "our", "their", "them", "then",
  "than", "there", "here", "when", "where", "which", "who", "what", "how", "why",
  "onto", "over", "under", "out", "off", "per", "via", "such", "also", "each",
  "both", "either", "neither", "about", "after", "before", "between", "during",
  "while", "these", "those", "they", "she", "him", "her", "his", "hers",
]);

const TOKEN_RE = /[a-z0-9][a-z0-9+#.]*[a-z0-9]|[a-z0-9]/g;

/** Tokens with their character offsets into the (lowercased) text. */
export function tokenizeWithPositions(lowerText) {
  const tokens = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(lowerText)) !== null) {
    tokens.push({ tok: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** Unique, meaningful terms from a field of the record (lowercased). */
export function salientTokens(fieldText) {
  const seen = new Set();
  const out = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  const lower = String(fieldText || "").toLowerCase();
  while ((m = TOKEN_RE.exec(lower)) !== null) {
    const tok = m[0];
    if (tok.length < 3) continue;
    if (STOPWORDS.has(tok)) continue;
    if (seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

function cleanExcerpt(text, cap = 400) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= cap) return trimmed;
  return `${trimmed.slice(0, cap).trim()}…`;
}

/**
 * Find the single best window of the fetched doc that literally contains the
 * field's key terms. Returns whether it clears the support threshold, the
 * verbatim excerpt, and exactly which terms matched, so the verdict is auditable.
 *
 * Threshold: at least max(2, ceil(0.5 * salientCount)) distinct key terms must
 * co-occur within a window of `window` tokens. Single-term fields cannot pass
 * on their own, which keeps generic words from counting as evidence.
 */
export function findSupportingExcerpt(docOriginal, docLower, tokens, fieldText, opts = {}) {
  const window = opts.window ?? 60;
  const salient = salientTokens(fieldText);
  if (salient.length === 0) {
    return { supported: false, coverage: 0, salientCount: 0, matchedTokens: [], missingTokens: [], excerpt: null, reason: "no key terms in field text" };
  }
  const salientSet = new Set(salient);
  const occ = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (salientSet.has(tokens[i].tok)) occ.push(i);
  }
  if (occ.length === 0) {
    return { supported: false, coverage: 0, salientCount: salient.length, matchedTokens: [], missingTokens: salient, excerpt: null, reason: "none of the field's key terms appear in the fetched doc" };
  }

  const count = new Map();
  let left = 0;
  let distinct = 0;
  let best = { distinct: 0, l: occ[0], r: occ[0], toks: [] };
  for (let right = 0; right < occ.length; right += 1) {
    const t = tokens[occ[right]].tok;
    count.set(t, (count.get(t) || 0) + 1);
    if (count.get(t) === 1) distinct += 1;
    while (occ[right] - occ[left] > window) {
      const lt = tokens[occ[left]].tok;
      count.set(lt, count.get(lt) - 1);
      if (count.get(lt) === 0) {
        count.delete(lt);
        distinct -= 1;
      }
      left += 1;
    }
    if (distinct > best.distinct) {
      best = { distinct, l: occ[left], r: occ[right], toks: [...count.keys()] };
    }
  }

  const threshold = Math.max(2, Math.ceil(0.5 * salient.length));
  const supported = best.distinct >= threshold && salient.length >= 2;
  const excerpt = cleanExcerpt(docOriginal.slice(tokens[best.l].start, tokens[best.r].end));
  const matchedSet = new Set(best.toks);
  return {
    supported,
    coverage: Math.round((best.distinct / salient.length) * 100) / 100,
    salientCount: salient.length,
    threshold,
    matchedTokens: salient.filter((t) => matchedSet.has(t)),
    missingTokens: salient.filter((t) => !matchedSet.has(t)),
    excerpt,
  };
}

/** Prepare a fetched doc once for repeated matching. */
export function prepareDoc(html) {
  const original = htmlToText(html);
  const lower = original.toLowerCase();
  return { original, lower, tokens: tokenizeWithPositions(lower) };
}
