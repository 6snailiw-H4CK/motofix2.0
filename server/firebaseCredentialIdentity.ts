import fs from "node:fs/promises";
import type { ServiceAccount } from "firebase-admin/app";
import path from "node:path";

export type FirebaseCredentialIdentity = {
  method: "explicit-service-account";
  principal: string;
};

export type ExplicitServiceAccountCredential = {
  serviceAccount: ServiceAccount;
  identity: FirebaseCredentialIdentity;
  filePath: string;
  projectId: string | null;
};

const isObject = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value)
);

export const explicitServiceAccountIdentity = (
  serviceAccount: unknown,
): FirebaseCredentialIdentity | null => {
  if (!isObject(serviceAccount) || serviceAccount.type !== "service_account") return null;
  const principal = serviceAccount.client_email;
  if (typeof principal !== "string"
    || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(principal)) return null;
  if (typeof serviceAccount.private_key !== "string" || !serviceAccount.private_key.trim()) return null;
  return Object.freeze({ method: "explicit-service-account", principal });
};

export const assertSupportedFirebaseCredentialIdentity = (
  identity: FirebaseCredentialIdentity | null,
) => {
  if (!identity || identity.method !== "explicit-service-account") {
    throw new Error("firebase_credential_identity_unverified");
  }
  return identity;
};

export const readExplicitServiceAccountCredential = async (
  configuredPath: string | undefined,
  cwd = process.cwd(),
): Promise<ExplicitServiceAccountCredential> => {
  if (!configuredPath?.trim()) throw new Error("firebase_credential_identity_unverified");
  const filePath = path.resolve(cwd, configuredPath.trim());
  let serviceAccount: unknown;
  try {
    serviceAccount = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    throw new Error("firebase_credential_identity_unverified");
  }
  const identity = assertSupportedFirebaseCredentialIdentity(explicitServiceAccountIdentity(serviceAccount));
  const projectId = isObject(serviceAccount) && typeof serviceAccount.project_id === "string"
    ? serviceAccount.project_id
    : null;
  return {
    serviceAccount: Object.freeze(serviceAccount) as ServiceAccount,
    identity,
    filePath,
    projectId,
  };
};
