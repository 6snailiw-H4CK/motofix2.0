import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createNewReportFile, parseJsonRejectDuplicateKeys } from "./access-projection-report-file";
import {
  assertOperationalAuthorizationTrustAnchorConfigured,
  verifyTrustedOperationalAuthorization,
} from "./access-projection-operational-authorization";
import {
  reserveOperationalAuthorizationOnce,
  getOperationalAuthorizationReplayRegistry,
} from "./access-projection-replay-registry";
import { readExplicitServiceAccountCredential } from "../server/firebaseCredentialIdentity";
import {
  isApprovedFirestoreEnvironment,
  isApprovedFirestoreProject,
} from "../server/firestoreProjectIdentity";
import type { ProjectionMigrationReport } from "./access-projection-backfill";

type Arguments = {
  apply: boolean;
  expectedProjectId: string | null;
  confirmProjectId: string | null;
  outputPath: string | null;
  approvalReportPath: string | null;
  approvalHash: string | null;
  targetEnvironment: string | null;
  operationalAuthorizationPath: string | null;
};

const parseArguments = (args: string[]): Arguments => {
  let expectedProjectId: string | null = null;
  let confirmProjectId: string | null = null;
  let outputPath: string | null = null;
  let approvalReportPath: string | null = null;
  let approvalHash: string | null = null;
  let targetEnvironment: string | null = null;
  let operationalAuthorizationPath: string | null = null;
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--expected-project") {
      expectedProjectId = args[++index]?.trim() || null;
    } else if (argument === "--confirm-project") {
      confirmProjectId = args[++index]?.trim() || null;
    } else if (argument === "--output") {
      outputPath = args[++index]?.trim() || null;
    } else if (argument === "--approval-report") {
      approvalReportPath = args[++index]?.trim() || null;
    } else if (argument === "--approve-hash") {
      approvalHash = args[++index]?.trim() || null;
    } else if (argument === "--target-environment") {
      targetEnvironment = args[++index]?.trim() || null;
    } else if (argument === "--operational-authorization") {
      operationalAuthorizationPath = args[++index]?.trim() || null;
    } else if (argument === "--help" || argument === "-h") {
      return {
        apply: false,
        expectedProjectId: "help",
        confirmProjectId: null,
        outputPath: null,
        approvalReportPath: null,
        approvalHash: null,
        targetEnvironment: null,
        operationalAuthorizationPath: null,
      };
    } else {
      throw new Error("unknown_argument");
    }
  }
  return {
    apply,
    expectedProjectId,
    confirmProjectId,
    outputPath,
    approvalReportPath,
    approvalHash,
    targetEnvironment,
    operationalAuthorizationPath,
  };
};

const printUsage = () => {
  console.log("Dry-run (somente leitura):");
  console.log("  $env:MOTOFIX_ACCESS_REPORT_SALT = '<secret-salt-de-pelo-menos-32-caracteres>'");
  console.log("  npm run access:projection:migrate -- --expected-project <firebase-project-id> --target-environment <ambiente-aprovado> --operational-authorization <autorizacao-assinada.json> --output <novo-relatorio.json>");
  console.log("Dry-run com relatório local:");
  console.log("  Requer --target-environment e --operational-authorization assinada.");
  console.log("Backfill opt-in (não executar sem aprovação):");
  console.log("  $env:MOTOFIX_FIREBASE_PROJECT_ID = '<firebase-project-id>'");
  console.log("  npm run access:projection:migrate -- --apply --expected-project <firebase-project-id> --confirm-project <firebase-project-id> --target-environment <ambiente-aprovado> --operational-authorization <autorizacao-assinada.json> --approval-report <relatorio-revisado.json> --approve-hash <sha256-aprovado>");
  console.log("A autorização só é aceita quando a chave pública confiável estiver provisionada no código após aprovação independente.");
};

const safeStartupError = (error: unknown) => {
  const code = typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : null;
  const message = error instanceof Error ? error.message : "";
  const known = new Set([
    "unknown_argument",
    "expected_project_required",
    "write_requires_matching_project_confirmation",
    "confirmation_flag_only_valid_with_apply",
    "target_environment_required",
    "operational_authorization_required",
    "operational_authorization_invalid",
    "operational_authorization_trust_anchor_not_configured",
    "operational_authorization_replayed",
    "operational_authorization_replay_registry_not_configured",
    "operational_authorization_scope_mismatch",
    "operational_authorization_expired",
    "firebase_admin_not_initialized",
    "firebase_admin_app_preexisting",
    "firebase_credential_identity_unverified",
    "firebase_project_mismatch",
    "firestore_endpoint_not_approved",
    "report_file_exists",
    "report_approval_required",
    "report_invalid",
    "report_hash_mismatch",
    "report_project_mismatch",
    "report_policy_mismatch",
    "report_owner_preflight_blocked",
    "report_salt_required",
    "report_schema_invalid",
    "report_mode_invalid",
    "report_interrupted",
    "report_structure_invalid",
    "report_totals_inconsistent",
    "report_structure_invalid",
    "duplicate_json_key",
  ]);
  if (known.has(message)) return message;
  return typeof code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(code)
    ? code
    : "unexpected_error";
};

const run = async () => {
  const args = parseArguments(process.argv.slice(2));
  if (args.expectedProjectId === "help") {
    printUsage();
    return;
  }
  if (!args.expectedProjectId) throw new Error("expected_project_required");
  if (!args.targetEnvironment) throw new Error("target_environment_required");
  if (!args.operationalAuthorizationPath) throw new Error("operational_authorization_required");
  if (!process.env.MOTOFIX_ACCESS_REPORT_SALT || process.env.MOTOFIX_ACCESS_REPORT_SALT.length < 32) {
    throw new Error("report_salt_required");
  }
  if (!isApprovedFirestoreEnvironment()) throw new Error("firestore_endpoint_not_approved");
  if (args.apply && (
    !args.confirmProjectId
    || args.confirmProjectId !== args.expectedProjectId
    || process.env.MOTOFIX_FIREBASE_PROJECT_ID?.trim() !== args.expectedProjectId
  )) {
    throw new Error("write_requires_matching_project_confirmation");
  }
  if (args.apply && (!args.approvalReportPath || !args.approvalHash)) throw new Error("report_approval_required");
  if (!args.apply && (args.confirmProjectId || args.approvalReportPath || args.approvalHash)) {
    throw new Error("confirmation_flag_only_valid_with_apply");
  }

  let approvedReport: ProjectionMigrationReport | undefined;
  let approvedReportValue: unknown;
  if (args.apply) {
    try {
      approvedReportValue = parseJsonRejectDuplicateKeys(
        await fs.readFile(path.resolve(process.cwd(), args.approvalReportPath!), "utf8"),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "duplicate_json_key") {
        throw new Error("duplicate_json_key");
      }
      throw new Error("report_structure_invalid");
    }
  }

  assertOperationalAuthorizationTrustAnchorConfigured();

  let authorizationDocument: unknown;
  try {
    authorizationDocument = parseJsonRejectDuplicateKeys(
      await fs.readFile(path.resolve(process.cwd(), args.operationalAuthorizationPath), "utf8"),
    );
  } catch {
    throw new Error("operational_authorization_invalid");
  }

  const localCredential = await readExplicitServiceAccountCredential(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  );
  const operationalAuthorization = verifyTrustedOperationalAuthorization(authorizationDocument, {
    projectId: args.expectedProjectId,
    targetEnvironment: args.targetEnvironment,
    operation: args.apply ? "apply" : "dry-run",
    reportHash: args.apply ? args.approvalHash : null,
    credentialPrincipal: localCredential.identity.principal,
  });
  const replayRegistry = getOperationalAuthorizationReplayRegistry();
  if (!replayRegistry) throw new Error("operational_authorization_replay_registry_not_configured");

  if (args.apply) {
    const { approvedReportValidationError } = await import("./access-projection-backfill");
    const validationError = approvedReportValidationError(
      approvedReportValue,
      args.approvalHash!,
      args.expectedProjectId,
    );
    if (validationError) throw new Error(validationError);
    approvedReport = approvedReportValue as ProjectionMigrationReport;
  }

  const authorizationExecution = await reserveOperationalAuthorizationOnce(
    replayRegistry,
    operationalAuthorization,
  );

  const { initializeFirebaseAdminForAccessProjectionMigration } = await import(
    "../server/firebaseAdminMigration"
  );
  const { createAccessProjectionFirestoreAdapter } = await import("./access-projection-firestore-adapter");
  const { runAccessProjectionMigration } = await import("./access-projection-backfill");
  const {
    auth: adminAuth,
    db: adminDb,
    credentialIdentity,
  } = initializeFirebaseAdminForAccessProjectionMigration(localCredential.serviceAccount);
  if (credentialIdentity.principal !== localCredential.identity.principal) {
    throw new Error("firebase_credential_identity_unverified");
  }
  if (!isApprovedFirestoreProject(adminDb, args.expectedProjectId)) {
    throw new Error("firebase_project_mismatch");
  }

  let interrupted = false;
  const onInterrupt = () => { interrupted = true; };
  process.once("SIGINT", onInterrupt);
  process.once("SIGTERM", onInterrupt);
  try {
    const outputFile = args.outputPath ? path.resolve(process.cwd(), args.outputPath) : null;
    if (outputFile) {
      try {
        await createNewReportFile(outputFile);
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error
          && (error as { code?: unknown }).code === "EEXIST") {
          throw new Error("report_file_exists");
        }
        throw error;
      }
    }
    let processedRecords = 0;
    const report = await runAccessProjectionMigration(
      createAccessProjectionFirestoreAdapter(
        adminDb,
        adminAuth,
        args.expectedProjectId,
        args.apply ? "apply" : "dry-run",
        args.targetEnvironment,
        args.approvalHash,
        operationalAuthorization,
        credentialIdentity,
        process.env,
        authorizationExecution,
      ),
      {
        mode: args.apply ? "apply" : "dry-run",
        expectedProjectId: args.expectedProjectId,
        reportSalt: process.env.MOTOFIX_ACCESS_REPORT_SALT,
        approvedReport,
        shouldStop: () => interrupted,
        onRecord: async (_record, currentReport) => {
          processedRecords += 1;
          if (outputFile && processedRecords % 100 === 0) {
            await fs.writeFile(outputFile, `${JSON.stringify(currentReport, null, 2)}\n`, "utf8");
          }
        },
      },
    );
    report.interrupted ||= interrupted;
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (outputFile) await fs.writeFile(outputFile, serialized, "utf8");
    else process.stdout.write(serialized);
    if (report.totals.failed > 0) process.exitCode = 2;
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onInterrupt);
  }
};

void run().catch((error) => {
  console.error(`Access projection migration stopped safely: ${safeStartupError(error)}`);
  printUsage();
  process.exitCode = 1;
});
