import type { VerifiedOperationalAuthorization } from "./access-projection-operational-authorization";

export type AuthorizationReplayConsumeResult = "reserved" | "already_reserved" | "scope_mismatch";

export type AuthorizationReplayScope = Pick<
  VerifiedOperationalAuthorization,
  | "authorizationId"
  | "projectId"
  | "targetEnvironment"
  | "operation"
  | "credentialPrincipal"
  | "reportHash"
  | "issuedAt"
  | "expiresAt"
>;

export type OperationalAuthorizationReplayRegistry = {
  /**
   * Atomically and durably reserve the complete immutable scope by authorizationId across every
   * process and host. "reserved" must mean this caller won a put-if-absent; "already_reserved"
   * means the same ID was reserved for the same scope; "scope_mismatch" means that ID exists
   * with another scope. Retain reservations through expiry plus clock-skew tolerance, fail
   * closed on storage errors, and never release after partial execution.
   */
  reserve: (scope: AuthorizationReplayScope) => Promise<AuthorizationReplayConsumeResult>;
};

export type OperationalAuthorizationExecution = object;

type LocalReservation = {
  fingerprint: string;
  state: "reserving" | "reserved" | "failed" | "claimed";
};

const localReservations = new Map<string, LocalReservation>();
const executionScopes = new WeakMap<object, AuthorizationReplayScope>();
const stableScope = (scope: AuthorizationReplayScope) => JSON.stringify([
  scope.authorizationId,
  scope.projectId,
  scope.targetEnvironment,
  scope.operation,
  scope.credentialPrincipal,
  scope.reportHash,
  scope.issuedAt,
  scope.expiresAt,
]);

export const reserveOperationalAuthorizationOnce = async (
  registry: OperationalAuthorizationReplayRegistry,
  authorization: VerifiedOperationalAuthorization,
): Promise<OperationalAuthorizationExecution> => {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(authorization.authorizationId)
    || !Number.isFinite(Date.parse(authorization.expiresAt))
    || Date.parse(authorization.expiresAt) <= Date.now()) {
    throw new Error("operational_authorization_invalid");
  }
  const scope: AuthorizationReplayScope = {
    authorizationId: authorization.authorizationId,
    projectId: authorization.projectId,
    targetEnvironment: authorization.targetEnvironment,
    operation: authorization.operation,
    credentialPrincipal: authorization.credentialPrincipal,
    reportHash: authorization.reportHash,
    issuedAt: authorization.issuedAt,
    expiresAt: authorization.expiresAt,
  };
  const fingerprint = stableScope(scope);
  if (localReservations.has(scope.authorizationId)) {
    const existing = localReservations.get(scope.authorizationId)!;
    throw new Error(existing.fingerprint === fingerprint
      ? "operational_authorization_replayed"
      : "operational_authorization_scope_mismatch");
  }
  const reservation: LocalReservation = { fingerprint, state: "reserving" };
  localReservations.set(scope.authorizationId, reservation);
  let result: AuthorizationReplayConsumeResult;
  try {
    result = await registry.reserve(Object.freeze(scope));
  } catch (error) {
    reservation.state = "failed";
    throw error;
  }
  if (result !== "reserved") {
    reservation.state = "failed";
    if (result === "scope_mismatch") throw new Error("operational_authorization_scope_mismatch");
    throw new Error("operational_authorization_replayed");
  }
  reservation.state = "reserved";
  const execution = Object.freeze({});
  executionScopes.set(execution, Object.freeze(scope));
  return execution;
};

export const claimOperationalAuthorizationExecution = (
  execution: OperationalAuthorizationExecution | undefined,
  authorization: VerifiedOperationalAuthorization | undefined,
) => {
  const scope = execution && executionScopes.get(execution);
  const fingerprint = scope && stableScope(scope);
  const local = scope && localReservations.get(scope.authorizationId);
  if (!scope || !authorization || !local || local.state !== "reserved"
    || local.fingerprint !== fingerprint
    || fingerprint !== stableScope({
      authorizationId: authorization.authorizationId,
      projectId: authorization.projectId,
      targetEnvironment: authorization.targetEnvironment,
      operation: authorization.operation,
      credentialPrincipal: authorization.credentialPrincipal,
      reportHash: authorization.reportHash,
      issuedAt: authorization.issuedAt,
      expiresAt: authorization.expiresAt,
    })) {
    throw new Error("operational_authorization_replay_registry_not_configured");
  }
  local.state = "claimed";
  return (now = Date.now()) => {
    if (Date.parse(scope.expiresAt) <= now) {
      throw new Error("operational_authorization_expired");
    }
    if (local.state !== "claimed" || local.fingerprint !== fingerprint) {
      throw new Error("operational_authorization_replay_registry_not_configured");
    }
  };
};

export const getOperationalAuthorizationReplayRegistry = (): OperationalAuthorizationReplayRegistry | null => null;
