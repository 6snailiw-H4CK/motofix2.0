import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createNewReportFile } from "./access-projection-report-file";

const scriptPath = path.resolve("scripts/migrate-access-projections.ts");
const runCli = (args: string[], extraEnv: Record<string, string> = {}) => spawnSync(
  process.execPath,
  ["--import", "tsx", scriptPath, ...args],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      MOTOFIX_ACCESS_REPORT_SALT: "test-only-report-salt-at-least-32",
      MOTOFIX_FIREBASE_PROJECT_ID: "motofix-cli-test",
      ...extraEnv,
    },
  },
);

const authorizationArgs = [
  "--target-environment",
  "isolated-test",
  "--operational-authorization",
  "not-read.json",
];

test("CLI rejects incomplete and mismatched write arguments before Firebase initialization", () => {
  const missingExpectedProject = runCli(["--apply"]);
  assert.notEqual(missingExpectedProject.status, 0);
  assert.match(missingExpectedProject.stderr, /expected_project_required/);

  const missingApproval = runCli([
    "--apply",
    "--expected-project",
    "motofix-cli-test",
    "--confirm-project",
    "motofix-cli-test",
    ...authorizationArgs,
  ]);
  assert.notEqual(missingApproval.status, 0);
  assert.match(missingApproval.stderr, /report_approval_required/);

  const wrongProject = runCli([
    "--apply",
    "--expected-project",
    "wrong-project",
    "--confirm-project",
    "wrong-project",
    "--approval-report",
    "not-read.json",
    "--approve-hash",
    "not-a-hash",
    ...authorizationArgs,
  ]);
  assert.notEqual(wrongProject.status, 0);
  assert.match(wrongProject.stderr, /write_requires_matching_project_confirmation/);
  assert.doesNotMatch(wrongProject.stderr, /firebase_admin_not_initialized/);
});

test("CLI rejects non-approved Firestore endpoints before initializing Firebase", () => {
  const emulator = runCli(
    ["--expected-project", "motofix-cli-test", ...authorizationArgs],
    { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" },
  );
  assert.notEqual(emulator.status, 0);
  assert.match(emulator.stderr, /firestore_endpoint_not_approved/);
  assert.doesNotMatch(emulator.stderr, /firebase_admin_not_initialized/);
});

test("CLI rejects missing approval reports and stops before Admin when approval content is untrusted", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "motofix-access-report-"));
  const reportPath = path.join(directory, "approval.json");
  const privateText = "private-user@example.invalid do-not-print";
  try {
    const commonArgs = [
      "--apply",
      "--expected-project",
      "motofix-cli-test",
      "--confirm-project",
      "motofix-cli-test",
      "--approval-report",
      reportPath,
      "--approve-hash",
      "0".repeat(64),
      ...authorizationArgs,
    ];
    const missing = runCli(commonArgs);
    assert.match(missing.stderr, /report_structure_invalid/);
    assert.doesNotMatch(missing.stderr, /firebase_admin_not_initialized/);

    await writeFile(reportPath, JSON.stringify({
      mode: "dry-run",
      projectId: "motofix-cli-test",
      policyVersion: "access-v1",
      ownerPreflight: "valid",
      ownerDiagnostics: [],
      reportHash: "0".repeat(64),
      private: privateText,
    }), "utf8");
    const tampered = runCli(commonArgs);
    assert.match(tampered.stderr, /operational_authorization_trust_anchor_not_configured/);
    assert.doesNotMatch(tampered.stderr, /private-user@example\.invalid|do-not-print/);
    assert.doesNotMatch(tampered.stderr, /firebase_admin_not_initialized/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI rejects duplicate JSON keys in an approval report", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "motofix-access-report-duplicate-"));
  const reportPath = path.join(directory, "approval.json");
  try {
    await writeFile(reportPath, '{"mode":"dry-run","mode":"apply"}', "utf8");
    const result = runCli([
      "--apply",
      "--expected-project",
      "motofix-cli-test",
      "--confirm-project",
      "motofix-cli-test",
      "--approval-report",
      reportPath,
      "--approve-hash",
      "0".repeat(64),
      ...authorizationArgs,
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /duplicate_json_key/);
    assert.doesNotMatch(result.stderr, /firebase_admin_not_initialized/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI rejects operational authorization before initializing Firebase Admin", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "motofix-operational-authorization-"));
  const authorizationPath = path.join(directory, "authorization.json");
  try {
    await writeFile(authorizationPath, "{}", "utf8");
    const result = runCli([
      "--expected-project",
      "motofix-cli-test",
      "--target-environment",
      "isolated-test",
      "--operational-authorization",
      authorizationPath,
    ], { FIREBASE_SERVICE_ACCOUNT_PATH: "missing-test-credential.json" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /operational_authorization_trust_anchor_not_configured/);
    assert.doesNotMatch(result.stderr, /firebase_admin_not_initialized/);
    assert.doesNotMatch(result.stderr, /firebase_credential_identity_unverified/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("report output reservation refuses to overwrite a pre-existing file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "motofix-access-report-output-"));
  const reportPath = path.join(directory, "existing.json");
  try {
    await writeFile(reportPath, "preserve-existing-report", "utf8");
    await assert.rejects(createNewReportFile(reportPath), { code: "EEXIST" });
    assert.equal(await readFile(reportPath, "utf8"), "preserve-existing-report");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
