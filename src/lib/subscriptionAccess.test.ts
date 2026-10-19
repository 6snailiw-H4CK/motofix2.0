import assert from "node:assert/strict";
import test from "node:test";
import { mapAccountAccess } from "./subscriptionAccess";

test("frontend honors an affirmative owner entitlement decision from the authenticated backend", () => {
  const result = mapAccountAccess({
    allowed: true,
    status: "canceled",
    reason: "owner_entitlement",
    accountState: "active",
    entitlementSource: "owner",
    expiresAt: null,
    evaluatedAt: "2026-10-10T00:00:00.000Z",
  });

  assert.deepEqual(result, {
    subscriptionActive: true,
    isExpired: false,
    shouldBlock: false,
    reason: "owner_entitlement",
  });
});
