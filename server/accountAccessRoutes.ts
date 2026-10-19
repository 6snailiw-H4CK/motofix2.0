import type { Auth, DecodedIdToken } from "firebase-admin/auth";
import { FieldPath, FieldValue, Timestamp, type CollectionReference, type Firestore, type Query } from "firebase-admin/firestore";
import type { Express, Request, Response } from "express";
import { canAccessApplication, calculateApplicationAccess, type AccountAccessProfile } from "./accountAccess";
import { getOwnerUid, getOwnerUidFromSnapshot, isDesignatedOwnerUid } from "./ownerIdentity";
import {
  decodeAdminUsersCursor,
  encodeAdminUsersCursor,
  mapAdminUser,
  mapAdminUserDocument,
  type AdminUserMetrics,
  type AdminUserFilters,
} from "./adminUsers";
import { hasActiveMasterAdminAccess } from "./userAccess";

type AuthenticatedRequest = Request & { decodedToken?: DecodedIdToken };

type AdminProfile = AccountAccessProfile & {
  uid?: string;
  role?: "user" | "admin" | "master_admin";
  isActive?: boolean;
  subscriptionExpiresAt?: string | null;
  updatedAt?: unknown;
};

const verifyBearerToken = async (auth: Auth, request: Request) => {
  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Error("missing_token");
  try {
    return await auth.verifyIdToken(token);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "";
    if (code === "auth/argument-error" || code.startsWith("auth/invalid-") || code.startsWith("auth/id-token-")) {
      throw new Error("invalid_token");
    }
    throw error;
  }
};

const validRole = (role: unknown): role is NonNullable<AdminProfile["role"]> => (
  role === "user" || role === "admin" || role === "master_admin"
);

const parseAdminUserFilters = (request: Request): AdminUserFilters | null => {
  const search = typeof request.query.search === "string" ? request.query.search.trim().slice(0, 120) : "";
  const status = request.query.status ?? "all";
  const role = request.query.role ?? "all";
  if (request.query.sort !== undefined && request.query.sort !== "uid") return null;
  if (request.query.entitlement !== undefined) return null;
  if (!["all", "active", "blocked"].includes(String(status))) return null;
  if (!["all", "user", "admin", "master_admin"].includes(String(role))) return null;
  return {
    search,
    status: String(status) as AdminUserFilters["status"],
    role: String(role) as AdminUserFilters["role"],
  };
};

const applyAdminUserFilters = (query: Query, filters: AdminUserFilters) => {
  let filteredQuery = query;
  if (filters.status !== "all") {
    filteredQuery = filteredQuery.where("isActive", "==", filters.status === "active");
  }
  if (filters.role !== "all") filteredQuery = filteredQuery.where("role", "==", filters.role);
  return filteredQuery;
};

const countQuery = async (query: Query) => (await query.count().get()).data().count;

const loadAdminUserMetrics = async (users: CollectionReference, now: Date): Promise<AdminUserMetrics> => {
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const [total, active, expiringSoon, newThisMonth] = await Promise.all([
    countQuery(users),
    countQuery(users.where("isActive", "==", true)),
    countQuery(users
      .where("isActive", "==", true)
      .where("accessProjection.allowed", "==", true)
      .where("accessProjection.validUntil", ">=", Timestamp.fromDate(now))
      .where("accessProjection.validUntil", "<=", Timestamp.fromDate(nextWeek))),
    countQuery(users
      .where("createdAt", ">=", monthStart)
      .where("createdAt", "<", nextMonthStart)),
  ]);
  const blocked = total - active;
  return { total, active, blocked, expiringSoon, newThisMonth };
};

const stringifyTimestamp = (value: unknown): string | null => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = (value.toDate as () => Date)();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return null;
};

const profileAuditState = (profile: AdminProfile) => ({
  role: profile.role ?? null,
  isActive: profile.isActive === true,
  manualAccess: {
    enabled: typeof profile.manualAccess?.enabled === "boolean" ? profile.manualAccess.enabled : null,
    expiresAt: stringifyTimestamp(profile.manualAccess?.expiresAt),
  },
  ownerAccess: {
    enabled: profile.ownerAccess?.enabled === true,
    permanent: profile.ownerAccess?.permanent === true,
  },
  accessProjection: {
    allowed: typeof profile.accessProjection?.allowed === "boolean" ? profile.accessProjection.allowed : null,
    source: typeof profile.accessProjection?.source === "string" ? profile.accessProjection.source : null,
    validUntil: stringifyTimestamp(profile.accessProjection?.validUntil),
  },
  subscriptionExpiresAt: Object.prototype.hasOwnProperty.call(profile, "subscriptionExpiresAt")
    ? stringifyTimestamp(profile.subscriptionExpiresAt)
    : null,
});

const nullableString = (value: unknown): string | null => typeof value === "string" ? value : null;

const mapAccessProjection = (value: unknown) => {
  const projection = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    allowed: typeof projection.allowed === "boolean" ? projection.allowed : null,
    source: nullableString(projection.source),
    validUntil: stringifyTimestamp(projection.validUntil),
    reason: nullableString(projection.reason),
    evaluatedAt: stringifyTimestamp(projection.evaluatedAt),
    policyVersion: nullableString(projection.policyVersion),
  };
};

const mapManualAccess = (value: unknown) => {
  const manualAccess = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    enabled: typeof manualAccess.enabled === "boolean" ? manualAccess.enabled : null,
    expiresAt: stringifyTimestamp(manualAccess.expiresAt),
    updatedBy: nullableString(manualAccess.updatedBy),
    updatedAt: stringifyTimestamp(manualAccess.updatedAt),
  };
};

const safeAuditEvent = (id: string, data: Record<string, unknown>) => ({
  id,
  actor: typeof data.actor === "string" ? data.actor : null,
  action: typeof data.action === "string" ? data.action : null,
  target: typeof data.target === "string" ? data.target : null,
  before: safeAuditState(data.before),
  after: safeAuditState(data.after),
  source: typeof data.source === "string" ? data.source : null,
  reason: typeof data.reason === "string" ? data.reason : null,
  timestamp: stringifyTimestamp(data.timestamp),
  claimsSyncStatus: typeof data.claimsSyncStatus === "string" ? data.claimsSyncStatus : null,
  claimsSyncAttempts: typeof data.claimsSyncAttempts === "number" ? data.claimsSyncAttempts : null,
  claimsSyncError: typeof data.claimsSyncError === "string" ? data.claimsSyncError : null,
  claimsSyncUpdatedAt: stringifyTimestamp(data.claimsSyncUpdatedAt),
  claimsSyncFailureAt: stringifyTimestamp(data.claimsSyncFailureAt),
  claimsSyncedAt: stringifyTimestamp(data.claimsSyncedAt),
});

const safeAuditState = (value: unknown) => {
  if (!value || typeof value !== "object") return null;
  const state = value as Record<string, unknown>;
  return {
    ...(typeof state.role === "string" ? { role: state.role } : {}),
    ...(typeof state.isActive === "boolean" ? { isActive: state.isActive } : {}),
    ...(typeof state.subscriptionExpiresAt === "string" || state.subscriptionExpiresAt === null
      ? { subscriptionExpiresAt: state.subscriptionExpiresAt }
      : {}),
    ...(state.manualAccess && typeof state.manualAccess === "object" ? {
      manualAccess: {
        enabled: typeof (state.manualAccess as Record<string, unknown>).enabled === "boolean"
          ? (state.manualAccess as Record<string, unknown>).enabled
          : null,
        expiresAt: stringifyTimestamp((state.manualAccess as Record<string, unknown>).expiresAt),
      },
    } : {}),
    ...(state.ownerAccess && typeof state.ownerAccess === "object" ? {
      ownerAccess: {
        enabled: typeof (state.ownerAccess as Record<string, unknown>).enabled === "boolean"
          ? (state.ownerAccess as Record<string, unknown>).enabled
          : false,
        permanent: (state.ownerAccess as Record<string, unknown>).permanent === true,
      },
    } : {}),
    ...(state.accessProjection && typeof state.accessProjection === "object" ? {
      accessProjection: {
        allowed: typeof (state.accessProjection as Record<string, unknown>).allowed === "boolean"
          ? (state.accessProjection as Record<string, unknown>).allowed
          : null,
        source: nullableString((state.accessProjection as Record<string, unknown>).source),
        validUntil: stringifyTimestamp((state.accessProjection as Record<string, unknown>).validUntil),
      },
    } : {}),
  };
};

export const registerAccountAccessRoutes = (
  app: Express,
  options: { auth: Auth | null; db: Firestore; firebaseInitialized: boolean },
) => {
  app.get("/api/account/access", async (request: Request, response: Response) => {
    if (!options.firebaseInitialized || !options.auth) {
      return response.status(503).json({ error: "Firebase Admin nao inicializado." });
    }
    try {
      const decoded = await verifyBearerToken(options.auth, request);
      const userSnapshot = await options.db.collection("users").doc(decoded.uid).get();
      const profile = userSnapshot.exists ? userSnapshot.data() as AccountAccessProfile : null;
      const decision = canAccessApplication(decoded, profile);
      return response.json({
        allowed: decision.allowed,
        status: decision.status,
        reason: decision.reason,
        accountState: decision.accountState,
        entitlementSource: decision.entitlementSource,
        expiresAt: decision.expiresAt,
        evaluatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && (error.message === "missing_token" || error.message === "invalid_token")) {
        return response.status(401).json({ error: "Token Firebase inválido ou ausente." });
      }
      console.error("[ACCESS][ERROR] Access decision failed", error);
      return response.status(503).json({ error: "Nao foi possivel validar o acesso da conta." });
    }
  });

  app.get("/api/admin/users", async (request: Request, response: Response) => {
    if (!options.firebaseInitialized || !options.auth) {
      return response.status(503).json({ error: "Firebase Admin nao inicializado." });
    }
    try {
      const decoded = await verifyBearerToken(options.auth, request);
      if (!(await hasActiveMasterAdminAccess(options.db, decoded))) {
        return response.status(403).json({ error: "Apenas um Master Admin ativo pode consultar contas." });
      }

      const filters = parseAdminUserFilters(request);
      if (!filters) return response.status(400).json({ error: "Filtros ou ordenação inválidos." });
      const rawPageSize = request.query.pageSize === undefined ? 10 : Number(request.query.pageSize);
      if (!Number.isInteger(rawPageSize) || rawPageSize < 1 || rawPageSize > 50) {
        return response.status(400).json({ error: "pageSize deve estar entre 1 e 50." });
      }
      const queryKey = JSON.stringify({ ...filters, pageSize: rawPageSize });
      const cursor = typeof request.query.cursor === "string" ? request.query.cursor : "";
      const cursorUid = cursor ? decodeAdminUsersCursor(cursor, queryKey) : null;
      if (cursor && !cursorUid) return response.status(400).json({ error: "Cursor inválido para os filtros informados." });
      const usersCollection = options.db.collection("users");
      let baseQuery: Query;
      if (filters.search.includes("@")) {
        baseQuery = applyAdminUserFilters(usersCollection.where("email", "==", filters.search.toLocaleLowerCase()), filters);
      } else if (filters.search) {
        const exactUser = await usersCollection.doc(filters.search).get();
        const data = exactUser.exists ? exactUser.data() as Record<string, unknown> : null;
        const matchesFilters = data !== null
          && (filters.status === "all" || data.isActive === (filters.status === "active"))
          && (filters.role === "all" || data.role === filters.role);
        const account = matchesFilters && data ? mapAdminUser(exactUser.id, data) : null;
        const metrics = await loadAdminUserMetrics(usersCollection, new Date());
        return response.json({
          users: account ? [account] : [],
          total: account ? 1 : 0,
          pageSize: rawPageSize,
          nextCursor: null,
          hasMore: false,
          metrics,
        });
      } else {
        baseQuery = applyAdminUserFilters(usersCollection, filters);
      }

      let pageQuery = baseQuery.select(
          "displayName",
          "email",
          "role",
          "isActive",
          "createdAt",
          "subscription.plan",
          "subscription.autoRenew",
          "subscription.stripeSubscriptionId",
          "billing.status",
          "billing.currentPeriodEnd",
          "billing.stripeCustomerId",
          "billing.stripeSubscriptionId",
          "manualAccess.enabled",
          "manualAccess.expiresAt",
          "ownerAccess.enabled",
          "accessProjection.allowed",
          "accessProjection.source",
          "accessProjection.validUntil",
        )
        .orderBy(FieldPath.documentId());
      if (cursorUid) pageQuery = pageQuery.startAfter(cursorUid);
      pageQuery = pageQuery.limit(rawPageSize + 1);
      const now = new Date();
      const [snapshot, total, metrics] = await Promise.all([
        pageQuery.get(),
        countQuery(baseQuery),
        loadAdminUserMetrics(usersCollection, now),
      ]);
      const hasMore = snapshot.docs.length > rawPageSize;
      const pageDocs = hasMore ? snapshot.docs.slice(0, rawPageSize) : snapshot.docs;
      const pageUsers = pageDocs.map((document) => mapAdminUserDocument(document, now.getTime()));
      return response.json({
        users: pageUsers,
        total,
        pageSize: rawPageSize,
        nextCursor: hasMore ? encodeAdminUsersCursor(pageUsers[pageUsers.length - 1].uid, queryKey) : null,
        hasMore,
        metrics,
      });
    } catch (error) {
      if (error instanceof Error && (error.message === "missing_token" || error.message === "invalid_token")) {
        return response.status(401).json({ error: "Token Firebase inválido ou ausente." });
      }
      console.error("[ADMIN][ERROR] Account listing failed", error);
      return response.status(500).json({ error: "Nao foi possivel consultar as contas." });
    }
  });

  app.get("/api/admin/users/:uid", async (request: Request, response: Response) => {
    if (!options.firebaseInitialized || !options.auth) {
      return response.status(503).json({ error: "Firebase Admin nao inicializado." });
    }
    try {
      const decoded = await verifyBearerToken(options.auth, request);
      if (!(await hasActiveMasterAdminAccess(options.db, decoded))) {
        return response.status(403).json({ error: "Apenas um Master Admin ativo pode consultar contas." });
      }
      const targetUid = request.params.uid;
      if (!targetUid) return response.status(400).json({ error: "UID da conta inválido." });
      const userSnapshot = await options.db.collection("users").doc(targetUid).get();
      if (!userSnapshot.exists) return response.status(404).json({ error: "Conta não encontrada." });
      const profile = userSnapshot.data() as AdminProfile;
      let targetClaims: Record<string, unknown> = {};
      try {
        const userRecord = await options.auth.getUser(targetUid);
        targetClaims = userRecord.customClaims ?? {};
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
          ? error.code
          : "";
        if (code !== "auth/user-not-found") throw error;
      }
      const decision = canAccessApplication({ uid: targetUid, ...targetClaims }, profile);
      const auditSnapshot = await options.db.collection("audit_events")
        .where("target", "==", targetUid)
        .orderBy("timestamp", "desc")
        .limit(10)
        .get();
      const subscription = profile.subscription && typeof profile.subscription === "object"
        ? profile.subscription as Record<string, unknown>
        : {};
      const billing = profile.billing && typeof profile.billing === "object"
        ? profile.billing as Record<string, unknown>
        : {};
      const accessProjection = mapAccessProjection(profile.accessProjection);
      const manualAccess = mapManualAccess(profile.manualAccess);
      const account = mapAdminUser(targetUid, profile as Record<string, unknown>);
      return response.json({
        account: {
          ...account,
          accessDecision: { ...decision, evaluatedAt: new Date().toISOString() },
          accessProjection,
          manualAccess,
          ownerAccess: {
            enabled: profile.ownerAccess?.enabled === true,
            permanent: profile.ownerAccess?.permanent === true,
          },
          billing: {
            status: typeof billing.status === "string" ? billing.status : null,
            customerId: nullableString(billing.stripeCustomerId),
            subscriptionId: nullableString(billing.stripeSubscriptionId),
            priceId: nullableString(billing.priceId),
            planId: nullableString(billing.planId),
            currentPeriodStart: stringifyTimestamp(billing.currentPeriodStart),
            currentPeriodEnd: stringifyTimestamp(billing.currentPeriodEnd),
            cancelAtPeriodEnd: typeof billing.cancelAtPeriodEnd === "boolean" ? billing.cancelAtPeriodEnd : null,
            cancelAt: stringifyTimestamp(billing.cancelAt),
            trialStart: stringifyTimestamp(billing.trialStart),
            trialEnd: stringifyTimestamp(billing.trialEnd),
          },
          legacySubscription: {
            plan: typeof subscription.plan === "string" ? subscription.plan : null,
            autoRenew: typeof subscription.autoRenew === "boolean" ? subscription.autoRenew : null,
            stripeSubscriptionId: typeof subscription.stripeSubscriptionId === "string"
              ? subscription.stripeSubscriptionId
              : null,
          },
        },
        auditEvents: auditSnapshot.docs.map((document) => safeAuditEvent(document.id, document.data())),
      });
    } catch (error) {
      if (error instanceof Error && (error.message === "missing_token" || error.message === "invalid_token")) {
        return response.status(401).json({ error: "Token Firebase inválido ou ausente." });
      }
      console.error("[ADMIN][ERROR] Account detail failed", error);
      return response.status(500).json({ error: "Nao foi possivel consultar os detalhes da conta." });
    }
  });

  app.patch("/api/admin/users/:uid/access", async (request: AuthenticatedRequest, response: Response) => {
    if (!options.firebaseInitialized || !options.auth) {
      return response.status(503).json({ error: "Firebase Admin nao inicializado." });
    }
    try {
      const decoded = await verifyBearerToken(options.auth, request);
      if (!(await hasActiveMasterAdminAccess(options.db, decoded))) {
        return response.status(403).json({ error: "Apenas um Master Admin ativo pode alterar acessos." });
      }

      const targetUid = request.params.uid;
      if (!targetUid || targetUid === decoded.uid) {
        return response.status(400).json({ error: "O alvo da alteração é inválido." });
      }

      const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
      const allowedKeys = new Set(["isActive", "subscriptionExpiresAt", "manualAccess", "role", "reason", "days"]);
      const hasDays = Object.prototype.hasOwnProperty.call(body, "days");
      const hasManualAccess = Object.prototype.hasOwnProperty.call(body, "manualAccess");
      const hasLegacyExpiry = Object.prototype.hasOwnProperty.call(body, "subscriptionExpiresAt");
      if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
        return response.status(400).json({ error: "A solicitação contém campos não permitidos." });
      }
      if ([hasDays, hasManualAccess, hasLegacyExpiry].filter(Boolean).length > 1) {
        return response.status(400).json({ error: "Informe apenas uma representação de acesso manual por solicitação." });
      }
      if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
        return response.status(400).json({ error: "isActive deve ser booleano." });
      }
      if (body.role !== undefined && !validRole(body.role)) {
        return response.status(400).json({ error: "Role inválida." });
      }
      if (body.subscriptionExpiresAt !== undefined
        && body.subscriptionExpiresAt !== null
        && (typeof body.subscriptionExpiresAt !== "string" || !Number.isFinite(Date.parse(body.subscriptionExpiresAt)))) {
        return response.status(400).json({ error: "A data de expiração é inválida." });
      }
      if (hasManualAccess) {
        const manualAccess = body.manualAccess;
        if (!manualAccess || typeof manualAccess !== "object" || Array.isArray(manualAccess)) {
          return response.status(400).json({ error: "manualAccess deve ser um objeto." });
        }
        const manualAccessInput = manualAccess as Record<string, unknown>;
        if (Object.keys(manualAccessInput).some((key) => !["enabled", "expiresAt"].includes(key))) {
          return response.status(400).json({ error: "manualAccess contém campos não permitidos." });
        }
        if (typeof manualAccessInput.enabled !== "boolean") {
          return response.status(400).json({ error: "manualAccess.enabled deve ser booleano." });
        }
        if (manualAccessInput.expiresAt !== undefined && manualAccessInput.expiresAt !== null
          && (typeof manualAccessInput.expiresAt !== "string" || !Number.isFinite(Date.parse(manualAccessInput.expiresAt)))) {
          return response.status(400).json({ error: "manualAccess.expiresAt é inválido." });
        }
        if (manualAccessInput.enabled && !manualAccessInput.expiresAt) {
          return response.status(400).json({ error: "manualAccess ativo exige uma data de expiração válida." });
        }
        if (!manualAccessInput.enabled && manualAccessInput.expiresAt != null) {
          return response.status(400).json({ error: "manualAccess desativado deve ter expiresAt nulo ou ausente." });
        }
      }
      if (hasDays && (!Number.isInteger(body.days) || Math.abs(body.days as number) > 3650)) {
        return response.status(400).json({ error: "O ajuste de dias é inválido." });
      }
      const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
      const profileChanges: Record<string, unknown> = {};
      if (body.isActive !== undefined) profileChanges.isActive = body.isActive;
      if (body.role !== undefined) profileChanges.role = body.role;
      if (Object.keys(profileChanges).length === 0 && !hasDays && !hasManualAccess && !hasLegacyExpiry) {
        return response.status(400).json({ error: "Nenhuma alteração de acesso foi informada." });
      }

      const targetRef = options.db.collection("users").doc(targetUid);
      const ownerIdentityRef = options.db.collection("system").doc("access_config");
      const auditRef = options.db.collection("audit_events").doc();
      const evaluatedAt = Date.now();
      let previousProfile: AdminProfile | null = null;
      let nextProfile: AdminProfile | null = null;
      let configuredOwnerUid: string | null = null;
      let action = "access_changed";
      await options.db.runTransaction(async (transaction) => {
        const targetSnapshot = await transaction.get(targetRef);
        const ownerIdentitySnapshot = await transaction.get(ownerIdentityRef);
        const ownerUid = getOwnerUidFromSnapshot(ownerIdentitySnapshot);
        configuredOwnerUid = ownerUid;
        if (!targetSnapshot.exists) throw new Error("target_not_found");
        previousProfile = targetSnapshot.data() as AdminProfile;
        if (isDesignatedOwnerUid(targetUid)
          && ((body.role !== undefined && body.role !== "master_admin")
            || body.isActive === false)) {
          throw new Error("owner_identity_change_forbidden");
        }
        let manualAccessChanged = false;
        if (hasDays || hasManualAccess || hasLegacyExpiry) {
          let enabled = false;
          let expiresAt: Timestamp | null = null;
          if (hasDays) {
            const days = body.days as number;
            if (days !== 0) {
              enabled = true;
              expiresAt = Timestamp.fromMillis(evaluatedAt + days * 24 * 60 * 60 * 1000);
            }
          } else if (hasManualAccess) {
            const manualAccess = body.manualAccess as Record<string, unknown>;
            enabled = manualAccess.enabled === true;
            expiresAt = enabled && typeof manualAccess.expiresAt === "string"
              ? Timestamp.fromDate(new Date(manualAccess.expiresAt))
              : null;
          } else if (typeof body.subscriptionExpiresAt === "string") {
            enabled = true;
            expiresAt = Timestamp.fromDate(new Date(body.subscriptionExpiresAt));
          }
          profileChanges.manualAccess = { enabled, expiresAt };
          profileChanges.subscriptionExpiresAt = enabled && expiresAt
            ? expiresAt.toDate().toISOString()
            : null;
          manualAccessChanged = true;
        }
        nextProfile = { ...previousProfile, ...profileChanges } as AdminProfile;
        if (manualAccessChanged || body.isActive !== undefined || body.role !== undefined) {
          nextProfile.accessProjection = calculateApplicationAccess(nextProfile, evaluatedAt, targetUid, ownerUid);
        }
        const claimsChangeRequired = nextProfile.role !== previousProfile.role
          || nextProfile.isActive !== previousProfile.isActive;
        if (body.role !== undefined && body.role !== previousProfile.role) {
          action = "role_changed";
        } else if (body.isActive !== undefined
          && nextProfile.isActive === true
          && previousProfile.isActive !== true) {
          action = "account_activated";
        } else if (body.isActive !== undefined
          && nextProfile.isActive === false
          && previousProfile.isActive === true) {
          action = "account_deactivated";
        } else if (hasDays) {
          action = (body.days as number) <= 0 ? "manual_access_days_removed" : "manual_access_days_added";
        } else if (hasManualAccess) {
          action = nextProfile.manualAccess?.enabled === true ? "manual_access_changed" : "manual_access_removed";
        } else if (hasLegacyExpiry) {
          action = "manual_access_expiry_changed";
        } else if (nextProfile.isActive === true && previousProfile.isActive !== true) {
          action = "account_activated";
        } else if (nextProfile.isActive === false && previousProfile.isActive === true) {
          action = "account_deactivated";
        }
        const persistedAccessProjection = nextProfile.accessProjection ? {
          allowed: nextProfile.accessProjection.allowed,
          source: nextProfile.accessProjection.source,
          validUntil: nextProfile.accessProjection.validUntil instanceof Timestamp ? nextProfile.accessProjection.validUntil : nextProfile.accessProjection.validUntil ? Timestamp.fromDate(new Date(nextProfile.accessProjection.validUntil as unknown as string)) : null,
          evaluatedAt: nextProfile.accessProjection.evaluatedAt instanceof Timestamp ? nextProfile.accessProjection.evaluatedAt : Timestamp.fromDate(new Date(nextProfile.accessProjection.evaluatedAt as unknown as string)),
          policyVersion: nextProfile.accessProjection.policyVersion,
          reason: nextProfile.accessProjection.reason,
        } : undefined;
        const persistedManualAccess = nextProfile.manualAccess ? {
          enabled: nextProfile.manualAccess.enabled === true,
          expiresAt: nextProfile.manualAccess.expiresAt instanceof Timestamp
            ? nextProfile.manualAccess.expiresAt
            : nextProfile.manualAccess.expiresAt
              ? Timestamp.fromDate(new Date(String(nextProfile.manualAccess.expiresAt)))
              : null,
        } : undefined;
        transaction.update(targetRef, {
          ...profileChanges,
          ...(persistedAccessProjection ? { accessProjection: persistedAccessProjection } : {}),
          ...(persistedManualAccess ? { manualAccess: persistedManualAccess } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(auditRef, {
          actor: decoded.uid,
          action,
          target: targetUid,
          before: profileAuditState(previousProfile),
          after: profileAuditState(nextProfile),
          source: "admin",
          reason: reason || null,
          timestamp: FieldValue.serverTimestamp(),
          claimsSyncStatus: claimsChangeRequired ? "pending" : "not_required",
          claimsSyncAttempts: 0,
          ...(claimsChangeRequired ? { claimsSyncUpdatedAt: FieldValue.serverTimestamp() } : {}),
        });
      });

      const claimsChanged = nextProfile!.role !== previousProfile!.role
        || nextProfile!.isActive !== previousProfile!.isActive;
      if (claimsChanged) {
        const updatedProfile = nextProfile!;
        let claimsSyncError: unknown;
        let claimsSyncAttempts = 0;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          claimsSyncAttempts += 1;
          try {
            const userRecord = await options.auth.getUser(targetUid);
            const claims = { ...(userRecord.customClaims ?? {}) };
            delete claims.admin;
            delete claims.master_admin;
            delete claims.isActive;
            delete claims.motofix_owner;
            if (updatedProfile.role === "admin" && updatedProfile.isActive === true) claims.admin = true;
            if (updatedProfile.role === "master_admin" && updatedProfile.isActive === true) {
              claims.admin = true;
              claims.master_admin = true;
            }
            if (updatedProfile.isActive === true) claims.isActive = true;
            if (configuredOwnerUid === targetUid
              && updatedProfile.role === "master_admin"
              && updatedProfile.isActive === true
              && updatedProfile.ownerAccess?.enabled === true
              && updatedProfile.ownerAccess?.permanent === true) {
              claims.motofix_owner = true;
            }
            await options.auth.setCustomUserClaims(targetUid, claims);
            claimsSyncError = null;
            break;
          } catch (error) {
            claimsSyncError = error;
          }
        }
        if (claimsSyncError) {
          console.error("[ADMIN][ERROR] Claims synchronization failed after retry", claimsSyncError);
          try {
            await auditRef.update({
              claimsSyncStatus: "failed",
              claimsSyncAttempts,
              claimsSyncError: claimsSyncError instanceof Error ? claimsSyncError.message.slice(0, 500) : String(claimsSyncError).slice(0, 500),
              claimsSyncUpdatedAt: FieldValue.serverTimestamp(),
              claimsSyncFailureAt: FieldValue.serverTimestamp(),
            });
          } catch (auditError) {
            console.error("[ADMIN][ERROR] Could not mark audit event as claims-sync failed", auditError);
          }
          return response.status(503).json({
            error: "A alteração foi salva, mas a sincronização de permissões falhou. O estado foi registrado para reconciliação.",
            claimsSyncStatus: "failed",
          });
        }
        await auditRef.update({
          claimsSyncStatus: "synced",
          claimsSyncAttempts,
          claimsSyncUpdatedAt: FieldValue.serverTimestamp(),
          claimsSyncedAt: FieldValue.serverTimestamp(),
          claimsSyncError: FieldValue.delete(),
        });
      } else {
        await auditRef.update({ claimsSyncStatus: "not_required" });
      }

      return response.json({ success: true, action, target: targetUid });
    } catch (error) {
      if (error instanceof Error && (error.message === "missing_token" || error.message === "invalid_token")) {
        return response.status(401).json({ error: "Token Firebase inválido ou ausente." });
      }
      if (error instanceof Error && error.message === "target_not_found") {
        return response.status(404).json({ error: "Usuário alvo não encontrado." });
      }
      if (error instanceof Error && error.message === "owner_identity_change_forbidden") {
        return response.status(409).json({ error: "A identidade proprietária deve permanecer ativa e Master Admin." });
      }
      console.error("[ADMIN][ERROR] Access change failed", error);
      return response.status(500).json({ error: "Nao foi possivel aplicar a alteração administrativa." });
    }
  });
};
