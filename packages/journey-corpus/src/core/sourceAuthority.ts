import { createHash } from "node:crypto";

export interface PlatformIdentity {
  slug: string;
  canonicalName: string;
  organization: string;
  aliases: string[];
  officialRootDomain: string;
  documentationDomains: string[];
  applicationDomains: string[];
  approvedGithubOrganizations: string[];
}

export interface SourceAuthorityResult {
  accepted: boolean;
  authority: "official-domain" | "approved-organization-repository" | "rejected";
  reason: string;
  canonicalUrl: string | null;
}

export interface FetchMetadata {
  canonicalUrl: string;
  redirectChain: string[];
  httpStatus: number;
  contentType: string | null;
  retrievedAt: string;
  contentPresent: boolean;
  contentHash: string | null;
  contentTruncated: boolean;
  retrievedContentChars: number;
  visibleTitle: string | null;
  discoveredLinks: string[];
}

function normalizedHost(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function isDomainOrSubdomain(host: string, acceptedDomain: string): boolean {
  const accepted = acceptedDomain.toLowerCase().replace(/^\./, "").replace(/\.$/, "");
  return host === accepted || host.endsWith(`.${accepted}`);
}

function githubOwner(url: URL): string | null {
  if (url.hostname.toLowerCase() !== "github.com") return null;
  const owner = url.pathname.split("/").filter(Boolean)[0];
  return owner ? owner.toLowerCase() : null;
}

export function normalizeIdentityKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolvePlatformIdentity(
  requestedName: string,
  identities: PlatformIdentity[],
):
  | { outcome: "resolved"; identity: PlatformIdentity }
  | { outcome: "identity_ambiguous"; candidates: PlatformIdentity[] }
  | { outcome: "identity_unresolved"; candidates: PlatformIdentity[] } {
  const key = normalizeIdentityKey(requestedName);
  const candidates = identities.filter((identity) => {
    const keys = [
      identity.slug,
      identity.canonicalName,
      identity.organization,
      ...identity.aliases,
    ].map(normalizeIdentityKey);
    return keys.includes(key);
  });
  if (candidates.length === 1) return { outcome: "resolved", identity: candidates[0] };
  return {
    outcome: candidates.length > 1 ? "identity_ambiguous" : "identity_unresolved",
    candidates,
  };
}

export function validateSourceAuthority(
  rawUrl: string,
  identity: PlatformIdentity,
): SourceAuthorityResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      accepted: false,
      authority: "rejected",
      reason: "invalid_url",
      canonicalUrl: null,
    };
  }
  if (url.protocol !== "https:") {
    return {
      accepted: false,
      authority: "rejected",
      reason: "https_required",
      canonicalUrl: url.toString(),
    };
  }

  const owner = githubOwner(url);
  if (owner) {
    const approved = identity.approvedGithubOrganizations.map((item) => item.toLowerCase());
    return approved.includes(owner)
      ? {
          accepted: true,
          authority: "approved-organization-repository",
          reason: "approved_github_organization",
          canonicalUrl: url.toString(),
        }
      : {
          accepted: false,
          authority: "rejected",
          reason: "github_organization_not_approved",
          canonicalUrl: url.toString(),
        };
  }

  const host = normalizedHost(url.toString());
  const acceptedDomains = [
    identity.officialRootDomain,
    ...identity.documentationDomains,
    ...identity.applicationDomains,
  ];
  if (host && acceptedDomains.some((domain) => isDomainOrSubdomain(host, domain))) {
    return {
      accepted: true,
      authority: "official-domain",
      reason: "domain_allowlist_match",
      canonicalUrl: url.toString(),
    };
  }

  return {
    accepted: false,
    authority: "rejected",
    reason: "domain_not_allowlisted",
    canonicalUrl: url.toString(),
  };
}

export function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function sourceCanSupportClaims(
  authority: SourceAuthorityResult,
  metadata: FetchMetadata | null | undefined,
): boolean {
  return Boolean(
    authority.accepted &&
      metadata &&
      metadata.httpStatus >= 200 &&
      metadata.httpStatus < 300 &&
      metadata.contentPresent &&
      metadata.contentHash,
  );
}
