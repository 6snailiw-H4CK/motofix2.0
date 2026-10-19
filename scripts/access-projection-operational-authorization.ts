import { createPublicKey, verify } from "node:crypto";

export type OperationalAuthorizationOperation = "dry-run" | "apply";

type AuthorizationPayload = {
  schemaVersion: 1;
  projectId: string;
  targetEnvironment: string;
  operation: OperationalAuthorizationOperation;
  credentialPrincipal: string;
  reportHash: string | null;
  issuedAt: string;
  expiresAt: string;
  authorizationId: string;
};

export type OperationalAuthorizationDocument = AuthorizationPayload & {
  signature: string;
};

export type VerifiedOperationalAuthorization = AuthorizationPayload;

const MAX_AUTHORIZATION_LIFETIME_MS = 30 * 60 * 1000;
const AUTHORIZATION_CLOCK_SKEW_MS = 60 * 1000;

// Provision only after the external approval procedure and its trust anchor are independently approved.
const TRUSTED_OPERATIONAL_AUTHORIZATION_PUBLIC_KEY: string | null = null;
const verifiedAuthorizations = new WeakSet<object>();

const isObject = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value)
);

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
};

const exactKeys = (value: Record<string, unknown>, keys: string[]) => (
  Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
);

const payloadKeys = [
  "schemaVersion",
  "projectId",
  "targetEnvironment",
  "operation",
  "credentialPrincipal",
  "reportHash",
  "issuedAt",
  "expiresAt",
  "authorizationId",
];

const isCanonicalIsoTimestamp = (value: unknown): value is string => (
  typeof value === "string"
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value
);

const isDigest = (value: unknown): value is string => (
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
);

const payloadIsValid = (
  value: Record<string, unknown>,
  expected: {
    projectId: string;
    targetEnvironment: string;
    operation: OperationalAuthorizationOperation;
    reportHash: string | null;
    credentialPrincipal: string;
  },
  now: number,
): value is Record<string, unknown> & AuthorizationPayload => {
  if (!exactKeys(value, [...payloadKeys, "signature"])
    || value.schemaVersion !== 1
    || value.projectId !== expected.projectId
    || value.targetEnvironment !== expected.targetEnvironment
    || value.operation !== expected.operation
    || value.reportHash !== expected.reportHash
    || value.credentialPrincipal !== expected.credentialPrincipal
    || typeof value.projectId !== "string"
    || typeof value.targetEnvironment !== "string"
    || !value.targetEnvironment.trim()
    || typeof value.credentialPrincipal !== "string"
    || !value.credentialPrincipal.trim()
    || typeof value.authorizationId !== "string"
    || !/^[A-Za-z0-9_-]{16,128}$/.test(value.authorizationId)
    || !isCanonicalIsoTimestamp(value.issuedAt)
    || !isCanonicalIsoTimestamp(value.expiresAt)
    || typeof value.signature !== "string") return false;
  if (expected.reportHash === null ? value.reportHash !== null : !isDigest(value.reportHash)) return false;
  const issuedAt = Date.parse(value.issuedAt);
  const expiresAt = Date.parse(value.expiresAt);
  return issuedAt <= now + AUTHORIZATION_CLOCK_SKEW_MS
    && expiresAt > now
    && expiresAt > issuedAt
    && expiresAt - issuedAt <= MAX_AUTHORIZATION_LIFETIME_MS;
};

export const canonicalizeOperationalAuthorizationPayload = (value: AuthorizationPayload) => stableJson({
  schemaVersion: value.schemaVersion,
  projectId: value.projectId,
  targetEnvironment: value.targetEnvironment,
  operation: value.operation,
  credentialPrincipal: value.credentialPrincipal,
  reportHash: value.reportHash,
  issuedAt: value.issuedAt,
  expiresAt: value.expiresAt,
  authorizationId: value.authorizationId,
});

export const verifyOperationalAuthorizationSignature = (
  value: unknown,
  trustedPublicKey: string,
  expected: {
    projectId: string;
    targetEnvironment: string;
    operation: OperationalAuthorizationOperation;
    reportHash: string | null;
    credentialPrincipal: string;
  },
  now = Date.now(),
) => {
  if (!isObject(value) || !payloadIsValid(value, expected, now)) return false;
  try {
    if (typeof value.signature !== "string") return false;
    const signature = Buffer.from(value.signature, "base64");
    if (signature.length === 0 || signature.toString("base64") !== value.signature) return false;
    return verify(
      null,
      Buffer.from(canonicalizeOperationalAuthorizationPayload(value)),
      createPublicKey(trustedPublicKey),
      signature,
    );
  } catch {
    return false;
  }
};

export const verifyTrustedOperationalAuthorization = (
  value: unknown,
  expected: {
    projectId: string;
    targetEnvironment: string;
    operation: OperationalAuthorizationOperation;
    reportHash: string | null;
    credentialPrincipal: string;
  },
  now = Date.now(),
): VerifiedOperationalAuthorization => {
  if (!TRUSTED_OPERATIONAL_AUTHORIZATION_PUBLIC_KEY) {
    throw new Error("operational_authorization_trust_anchor_not_configured");
  }
  if (!verifyOperationalAuthorizationSignature(
    value,
    TRUSTED_OPERATIONAL_AUTHORIZATION_PUBLIC_KEY,
    expected,
    now,
  )) {
    throw new Error("operational_authorization_invalid");
  }
  const document = value as OperationalAuthorizationDocument;
  const authorization: VerifiedOperationalAuthorization = {
    schemaVersion: document.schemaVersion,
    projectId: document.projectId,
    targetEnvironment: document.targetEnvironment,
    operation: document.operation,
    credentialPrincipal: document.credentialPrincipal,
    reportHash: document.reportHash,
    issuedAt: document.issuedAt,
    expiresAt: document.expiresAt,
    authorizationId: document.authorizationId,
  };
  Object.freeze(authorization);
  verifiedAuthorizations.add(authorization);
  return authorization;
};

export const assertOperationalAuthorizationTrustAnchorConfigured = () => {
  if (!TRUSTED_OPERATIONAL_AUTHORIZATION_PUBLIC_KEY) {
    throw new Error("operational_authorization_trust_anchor_not_configured");
  }
};

export const assertVerifiedOperationalAuthorization = (
  authorization: VerifiedOperationalAuthorization | undefined,
  expected: {
    projectId: string;
    targetEnvironment: string;
    operation: OperationalAuthorizationOperation;
    reportHash: string | null;
    credentialPrincipal: string;
  },
) => {
  if (!authorization || !verifiedAuthorizations.has(authorization)
    || authorization.projectId !== expected.projectId
    || authorization.targetEnvironment !== expected.targetEnvironment
    || authorization.operation !== expected.operation
    || authorization.reportHash !== expected.reportHash
    || authorization.credentialPrincipal !== expected.credentialPrincipal
    || !isCanonicalIsoTimestamp(authorization.issuedAt)
    || !isCanonicalIsoTimestamp(authorization.expiresAt)
    || Date.parse(authorization.issuedAt) > Date.now() + AUTHORIZATION_CLOCK_SKEW_MS) {
    throw new Error("operational_authorization_required");
  }
  if (Date.parse(authorization.expiresAt) <= Date.now()) {
    throw new Error("operational_authorization_expired");
  }
};
