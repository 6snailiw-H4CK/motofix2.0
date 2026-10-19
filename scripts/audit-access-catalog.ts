import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { cert, deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { readExplicitServiceAccountCredential } from "../server/firebaseCredentialIdentity";
import { MOTOFIX_OWNER_UID } from "../server/ownerIdentity";

const EXPECTED_PROJECT_ID = "appmotofix";
const PAGE_SIZE = 250;
const SAMPLE_LIMIT = 100;
const VISIBLE_REQUEST_STATUSES = new Set(["pending", "approved", "blocked"]);
const PANEL_ACCOUNT_ROLES = new Set(["user", "admin"]);

export type CatalogDocument = { id: string; data: Record<string, unknown> };
type CatalogIssue = { reference: string; issue: string };

const redactedReference = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 16);
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === "object" && !Array.isArray(value)
);

const timestampMillis = (value: unknown): number | null => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    const parsed = value.toMillis();
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const sameTimestamp = (left: unknown, right: unknown) => {
  const leftMillis = timestampMillis(left);
  const rightMillis = timestampMillis(right);
  return leftMillis !== null && rightMillis !== null && leftMillis === rightMillis;
};

export const auditAccessCatalog = (
  users: CatalogDocument[],
  requests: CatalogDocument[],
) => {
  const usersById = new Map(users.map((document) => [document.id, document.data]));
  const requestsById = new Map(requests.map((document) => [document.id, document.data]));
  const issues: CatalogIssue[] = [];
  const addIssue = (id: string, issue: string) => issues.push({ reference: redactedReference(id), issue });

  const eligibleProfiles = users.filter(({ id, data }) => (
    id !== MOTOFIX_OWNER_UID && PANEL_ACCOUNT_ROLES.has(String(data.role))
  ));
  const ignoredOwnerCount = users.filter(({ id }) => id === MOTOFIX_OWNER_UID).length;
  const ignoredMasterAdminCount = users.filter(({ id, data }) => (
    id !== MOTOFIX_OWNER_UID && data.role === "master_admin"
  )).length;
  const unclassifiedProfiles = users.filter(({ id, data }) => (
    id !== MOTOFIX_OWNER_UID && data.role !== "master_admin" && !PANEL_ACCOUNT_ROLES.has(String(data.role))
  ));

  let matchedVisibleProfiles = 0;
  let missingRequestProfiles = 0;
  let profileEmbeddedIdMismatches = 0;
  let requestEmbeddedIdMismatches = 0;
  let requestStatusesHiddenByPanel = 0;
  let orphanRequests = 0;
  let profileRequestStateMismatches = 0;

  for (const { id, data } of users) {
    if (data.uid !== undefined && data.uid !== id) {
      profileEmbeddedIdMismatches += 1;
      addIssue(id, "profile_uid_differs_from_document_id");
    }
  }

  const requestsByEmbeddedUid = new Map<string, string[]>();
  for (const { id, data } of requests) {
    const embeddedUid = typeof data.uid === "string" ? data.uid : "";
    if (embeddedUid !== id) {
      requestEmbeddedIdMismatches += 1;
      addIssue(id, "request_uid_differs_from_document_id");
    }
    if (embeddedUid) {
      const ids = requestsByEmbeddedUid.get(embeddedUid) ?? [];
      ids.push(id);
      requestsByEmbeddedUid.set(embeddedUid, ids);
    }
    if (!VISIBLE_REQUEST_STATUSES.has(String(data.status))) {
      requestStatusesHiddenByPanel += 1;
      addIssue(id, "request_status_not_queried_by_panel");
    }
    if (!usersById.has(id)) {
      orphanRequests += 1;
      addIssue(id, "request_has_no_profile_with_same_document_id");
    }
  }

  let duplicateEmbeddedUidGroups = 0;
  for (const ids of requestsByEmbeddedUid.values()) {
    if (ids.length < 2) continue;
    duplicateEmbeddedUidGroups += 1;
    for (const id of ids) addIssue(id, "duplicate_request_uid_field");
  }

  for (const { id, data } of eligibleProfiles) {
    const request = requestsById.get(id);
    if (!request || request.uid !== id || !VISIBLE_REQUEST_STATUSES.has(String(request.status))) {
      missingRequestProfiles += 1;
      addIssue(id, "eligible_profile_not_visible_in_panel");
      continue;
    }
    matchedVisibleProfiles += 1;
    const manualAccess = isRecord(data.manualAccess) ? data.manualAccess : {};
    const projection = isRecord(data.accessProjection) ? data.accessProjection : {};
    const status = request.status;
    const hasMismatch = status === "approved"
      ? data.isActive !== true
        || manualAccess.enabled !== true
        || !sameTimestamp(request.manualAccessExpiresAt, manualAccess.expiresAt)
        || projection.allowed !== true
        || projection.source !== "manual"
        || !sameTimestamp(projection.validUntil, manualAccess.expiresAt)
      : status === "blocked"
        ? data.isActive !== false || manualAccess.enabled !== false
        : data.isActive !== false || manualAccess.enabled === true || projection.allowed === true;
    if (hasMismatch) {
      profileRequestStateMismatches += 1;
      addIssue(id, "request_and_profile_access_state_diverge");
    }
  }

  const issueTotals = Object.fromEntries(
    [...new Set(issues.map(({ issue }) => issue))].sort().map((issue) => [
      issue,
      issues.filter((entry) => entry.issue === issue).length,
    ]),
  );
  return {
    scanned: { users: users.length, accessRequests: requests.length },
    profiles: {
      eligibleForManualCatalog: eligibleProfiles.length,
      matchedVisibleProfiles,
      missingRequestProfiles,
      ignoredDesignatedOwner: ignoredOwnerCount,
      ignoredOtherMasterAdmins: ignoredMasterAdminCount,
      unclassifiedRoles: unclassifiedProfiles.length,
    },
    requests: {
      hiddenStatusDocuments: requestStatusesHiddenByPanel,
      orphanDocuments: orphanRequests,
      embeddedUidMismatches: requestEmbeddedIdMismatches,
      duplicateEmbeddedUidGroups,
    },
    profileRequestStateMismatches,
    profileEmbeddedIdMismatches,
    issueTotals,
    issueSamples: issues
      .sort((left, right) => left.issue.localeCompare(right.issue) || left.reference.localeCompare(right.reference))
      .slice(0, SAMPLE_LIMIT),
    omittedIssueSamples: Math.max(0, issues.length - SAMPLE_LIMIT),
  };
};

const parseArguments = (argv: string[]) => {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") return { help: true, expectedProject: "", confirmedProject: "" };
    if (argument !== "--expected-project" && argument !== "--confirm-project") {
      throw new Error("unknown_argument");
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--") || values.has(argument)) throw new Error("invalid_arguments");
    values.set(argument, value);
    index += 1;
  }
  return {
    help: false,
    expectedProject: values.get("--expected-project") ?? "",
    confirmedProject: values.get("--confirm-project") ?? "",
  };
};

const printUsage = () => {
  console.log("Auditoria somente leitura do catálogo Master Admin; não altera Firestore.");
  console.log("PowerShell (use os valores autorizados locais, sem imprimir o arquivo de credenciais):");
  console.log('$env:MOTOFIX_FIREBASE_PROJECT_ID = "appmotofix"');
  console.log('$env:MOTOFIX_FIREBASE_EXECUTION_PRINCIPAL = "<principal esperado, obtido de fonte autorizada>"');
  console.log('$env:MOTOFIX_FIREBASE_SERVICE_ACCOUNT_PATH = "<caminho local protegido da service account autorizada>"');
  console.log("npm run admin:audit-access-catalog -- --expected-project appmotofix --confirm-project appmotofix");
  console.log("A saída contém contagens e referências SHA-256 truncadas; não contém UID, e-mail ou claims.");
};

const assertSafeEnvironment = () => {
  const expectedPrincipal = process.env.MOTOFIX_FIREBASE_EXECUTION_PRINCIPAL?.trim();
  if (process.env.MOTOFIX_FIREBASE_PROJECT_ID?.trim() !== EXPECTED_PROJECT_ID || !expectedPrincipal) {
    throw new Error("explicit_project_and_principal_required");
  }
  for (const name of [
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "FIREBASE_STORAGE_EMULATOR_HOST",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "FIREBASE_CONFIG",
    "FIREBASE_SERVICE_ACCOUNT_PATH",
  ]) {
    if (process.env[name]?.trim()) throw new Error("ambiguous_firebase_configuration");
  }
  for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
    if (process.env[name]?.trim() && process.env[name]?.trim() !== EXPECTED_PROJECT_ID) {
      throw new Error("conflicting_firebase_project");
    }
  }
  return expectedPrincipal;
};

const listCollection = async (db: ReturnType<typeof getFirestore>, name: string) => {
  const documents: CatalogDocument[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  while (true) {
    let query = db.collection(name).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    documents.push(...page.docs.map((snapshot) => ({
      id: snapshot.id,
      data: snapshot.data() as DocumentData,
    })));
    if (page.size < PAGE_SIZE) return documents;
    cursor = page.docs[page.docs.length - 1];
  }
};

export const runAccessCatalogAudit = async (argv = process.argv.slice(2)) => {
  const args = parseArguments(argv);
  if (args.help) {
    printUsage();
    return;
  }
  if (args.expectedProject !== EXPECTED_PROJECT_ID || args.confirmedProject !== EXPECTED_PROJECT_ID) {
    throw new Error("project_confirmation_mismatch");
  }
  const expectedPrincipal = assertSafeEnvironment();
  if (getApps().length > 0) throw new Error("firebase_admin_app_preexisting");

  const configuredCredentialPath = process.env.MOTOFIX_FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  const credential = await readExplicitServiceAccountCredential(configuredCredentialPath);
  if (credential.projectId !== EXPECTED_PROJECT_ID) throw new Error("credential_project_mismatch");
  if (credential.identity.principal !== expectedPrincipal) throw new Error("credential_principal_mismatch");

  const app = initializeApp({
    credential: cert(credential.serviceAccount),
    projectId: EXPECTED_PROJECT_ID,
  }, "readonly-access-catalog-audit");
  try {
    const db = getFirestore(app);
    db.settings({ ignoreUndefinedProperties: true });
    const [users, requests] = await Promise.all([
      listCollection(db, "users"),
      listCollection(db, "access_requests"),
    ]);
    console.log(JSON.stringify({
      project: EXPECTED_PROJECT_ID,
      operation: "read_only_catalog_coverage_audit",
      result: auditAccessCatalog(users, requests),
    }, null, 2));
  } finally {
    await deleteApp(app);
  }
};

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  runAccessCatalogAudit().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    const safeCodes = new Set([
      "unknown_argument",
      "invalid_arguments",
      "project_confirmation_mismatch",
      "explicit_project_and_principal_required",
      "ambiguous_firebase_configuration",
      "conflicting_firebase_project",
      "firebase_admin_app_preexisting",
      "credential_project_mismatch",
      "credential_principal_mismatch",
      "firebase_credential_identity_unverified",
    ]);
    console.error(safeCodes.has(message) ? message : "readonly_audit_failed; verify authorized credentials and project access");
    process.exitCode = 1;
  });
}
