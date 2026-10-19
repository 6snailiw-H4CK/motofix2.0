import assert from "node:assert/strict";
import test from "node:test";
import { auditAccessCatalog } from "./audit-access-catalog";
import { MOTOFIX_OWNER_UID } from "../server/ownerIdentity";

const expiry = new Date("2099-01-01T00:00:00.000Z");
const request = (id: string, data: Record<string, unknown> = {}) => ({
  id,
  data: { uid: id, status: "pending", ...data },
});
const user = (id: string, data: Record<string, unknown> = {}) => ({
  id,
  data: { uid: id, role: "user", isActive: false, ...data },
});

test("catalog coverage joins by document ID and identifies eligible profiles with no visible request", () => {
  const result = auditAccessCatalog(
    [
      user("visible"),
      user("missing"),
      user(MOTOFIX_OWNER_UID, { role: "master_admin", isActive: true }),
      user("operator", { role: "master_admin" }),
      user("unknown-role", { role: "unknown" }),
    ],
    [request("visible")],
  );
  assert.deepEqual(result.profiles, {
    eligibleForManualCatalog: 2,
    matchedVisibleProfiles: 1,
    missingRequestProfiles: 1,
    ignoredDesignatedOwner: 1,
    ignoredOtherMasterAdmins: 1,
    unclassifiedRoles: 1,
  });
  assert.equal(result.issueTotals.eligible_profile_not_visible_in_panel, 1);
});

test("embedded UID mismatches, duplicate request UIDs, orphans, hidden statuses, and divergent grants are reported", () => {
  const result = auditAccessCatalog(
    [user("account", {
      isActive: true,
      manualAccess: { enabled: true, expiresAt: expiry },
      accessProjection: { allowed: true, source: "manual", validUntil: expiry },
    })],
    [
      request("account", { uid: "wrong-uid", status: "approved", manualAccessExpiresAt: expiry }),
      request("duplicate", { uid: "wrong-uid", status: "unknown" }),
      request("orphan"),
    ],
  );
  assert.equal(result.requests.embeddedUidMismatches, 2);
  assert.equal(result.requests.duplicateEmbeddedUidGroups, 1);
  assert.equal(result.requests.hiddenStatusDocuments, 1);
  assert.equal(result.requests.orphanDocuments, 2);
  assert.equal(result.profiles.missingRequestProfiles, 1);
  assert.ok(result.issueTotals.duplicate_request_uid_field > 0);
  assert.ok(result.issueTotals.eligible_profile_not_visible_in_panel > 0);
  assert.ok(result.issueSamples.every((sample) => !sample.reference.includes("account")));
});

test("valid approved catalog entries require synchronized request, profile, and projection expiry", () => {
  const result = auditAccessCatalog(
    [user("approved", {
      isActive: true,
      manualAccess: { enabled: true, expiresAt: expiry },
      accessProjection: { allowed: true, source: "manual", validUntil: expiry },
    })],
    [request("approved", { status: "approved", manualAccessExpiresAt: expiry })],
  );
  assert.equal(result.profiles.matchedVisibleProfiles, 1);
  assert.equal(result.profileRequestStateMismatches, 0);
  assert.equal(result.issueSamples.length, 0);
});
