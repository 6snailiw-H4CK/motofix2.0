/** Static security assertions for the Firestore rules. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const customClaimsFunction = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const profileAccessFunction = fs.readFileSync(path.join(root, 'functions/profileAccess.js'), 'utf8');
const adminClaimScript = fs.readFileSync(path.join(root, 'scripts/set-admin-claim.mjs'), 'utf8');
const accountAccessRoutes = fs.readFileSync(path.join(root, 'server/accountAccessRoutes.ts'), 'utf8');
const ownerIdentity = fs.readFileSync(path.join(root, 'server/ownerIdentity.ts'), 'utf8');
const userAccessHelper = fs.readFileSync(path.join(root, 'server/userAccess.ts'), 'utf8');
const fiscalRoutes = fs.readFileSync(path.join(root, 'server/fiscal/fiscalRoutes.ts'), 'utf8');
const ownerFunctionBody = rules.match(/function isActiveOwner\(userId\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
const userDataReadFunctionBody = rules.match(/function canReadUserData\(userId\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
const projectionFunctionBody = rules.match(/function accessProjectionValid\(userId\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
const profileCreateFunctionBody = rules.match(/function validUserProfileCreate\(userId\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
const entitlementFunctionBody = rules.match(/function userProfileHasAllowedBillingStatus\(userId\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
const operationalRules = rules.slice(
  rules.indexOf('match /users/{userId}/clients/'),
  rules.indexOf('match /users/{userId}/{document=**}'),
);
const userRootRules = rules.match(/match \/users\/\{userId\}\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
const checks = [
  ['custom claim admin is required', rules.includes('function hasAdminClaim()')
    && rules.includes('function hasMasterAdminClaim()')
    && rules.includes("request.auth.token.keys().hasAny(['admin'])")
    && rules.includes("request.auth.token.keys().hasAny(['master_admin'])")
    && rules.includes('request.auth.token.admin == true')
    && rules.includes('request.auth.token.master_admin == true')],
  ['admin requires custom claim and active profile', rules.includes('function isWorkshopAdmin()')
    && rules.includes('userProfileIsActive(request.auth.uid)')
    && rules.includes(".data.role == 'admin'")
    && rules.includes('function hasMasterAdminClaim()')
    && !rules.includes('function isMasterAdmin()')],
  ['operational authorization requires own active profile and a trusted entitlement', ownerFunctionBody.includes('isOwner(userId)')
    && ownerFunctionBody.includes('userProfileIsActive(userId)')
    && ownerFunctionBody.includes('userProfileHasAllowedBillingStatus(userId)')
    && !ownerFunctionBody.includes('isWorkshopAdmin()')
    && projectionFunctionBody.includes("profile.keys().hasAny(['accessProjection'])")
    && projectionFunctionBody.includes('profile.accessProjection.allowed == true')
    && projectionFunctionBody.includes('profile.accessProjection.validUntil is timestamp')
    && projectionFunctionBody.includes('request.time < profile.accessProjection.validUntil')
    && projectionFunctionBody.includes("profile.accessProjection.source == 'manual'")
    && projectionFunctionBody.includes("profile.accessProjection.source == 'owner'")
    && projectionFunctionBody.includes('profile.accessProjection.validUntil == null')
    && projectionFunctionBody.includes('hasPermanentOwnerEntitlement(userId)')
    && rules.includes("userId == 'o5XNtNFwKMQzZj28WfTEiGSFN0A3'")
    && entitlementFunctionBody.includes('hasPermanentOwnerEntitlement(userId)')
    && entitlementFunctionBody.includes('accessProjectionValid(userId)')
    && !entitlementFunctionBody.includes('billing')
    && !entitlementFunctionBody.includes('subscription')
    && !rules.includes("profile.billing.status in ['active', 'trialing']")
    && userDataReadFunctionBody.includes('return isActiveOwner(userId);')],
  ['managed custom claims are removed before resync', customClaimsFunction.includes('delete claims.admin;')
    && customClaimsFunction.includes('delete claims.master_admin;')
    && customClaimsFunction.includes('delete claims.isActive;')
    && customClaimsFunction.includes('delete claims.motofix_owner;')
    && customClaimsFunction.includes("collection('system').doc('access_config')")
    && customClaimsFunction.includes('ownerUid === uid')
    && customClaimsFunction.includes("profile.role === 'admin' && profile.isActive === true")
    && customClaimsFunction.includes("profile.role === 'master_admin' && profile.isActive === true")],
  ['owner projection uses the pinned Auth UID without config or claims as access gates', profileAccessFunction.includes("uid === MOTOFIX_OWNER_UID")
    && profileAccessFunction.includes('uid !== MOTOFIX_OWNER_UID')
    && ownerIdentity.includes('MOTOFIX_OWNER_UID = "o5XNtNFwKMQzZj28WfTEiGSFN0A3"')
    && rules.includes("userId == 'o5XNtNFwKMQzZj28WfTEiGSFN0A3'")
    && customClaimsFunction.includes('calculateProfileAccess(nextProfile, uid, currentOwnerUid)')
    && profileAccessFunction.includes("profile.ownerAccess?.permanent === true")
    && profileAccessFunction.includes("denied('account_inactive')")
    && ownerIdentity.includes('OWNER_IDENTITY_DOCUMENT = "access_config"')
    && ownerIdentity.includes('getOwnerUidInTransaction')
    && adminClaimScript.includes('calculateProfileAccess(')
    && adminClaimScript.includes('ownerIdentityRef')
    && adminClaimScript.includes('after.ownerAccess?.permanent === true')
    && customClaimsFunction.includes('isStaleOwnerEntitlement(currentProfile, uid, currentOwnerUid)')
    && customClaimsFunction.includes("action: 'owner_identity_changed'")
    && customClaimsFunction.includes("doc(`owner-identity-${context.eventId}`)")
    && customClaimsFunction.includes('exports.reconcilePendingOwnerIdentitySync')
    && customClaimsFunction.includes("audit.action !== 'owner_identity_changed'")
    && accountAccessRoutes.includes('delete claims.motofix_owner;')
    && accountAccessRoutes.includes('isDesignatedOwnerUid(targetUid)')
    && accountAccessRoutes.includes('configuredOwnerUid === targetUid')],
  ['backend admin requires matching claim, active profile and role', userAccessHelper.includes('decoded.admin === true')
    && userAccessHelper.includes('decoded.master_admin === true')
    && userAccessHelper.includes("profile?.role === 'admin'")
    && userAccessHelper.includes("profile?.role === 'master_admin'")
    && userAccessHelper.includes('profile?.isActive === true')],
  ['fiscal API requires server feature flag and beta/admin authorization', fiscalRoutes.includes('process.env.FISCAL_MODULE_ENABLED')
    && fiscalRoutes.includes('process.env.FISCAL_BETA_EMAILS')
    && fiscalRoutes.includes('getActiveUserProfile(options.db, decoded.uid)')],
  ['new regular profiles start inactive without client billing state', rules.includes("request.resource.data.role == 'user'")
    && !profileCreateFunctionBody.includes("request.resource.data.role in ['user', 'admin', 'master_admin']")
    && rules.includes("request.resource.data.isActive == false")
    && rules.includes("request.resource.data.subscription.status == 'inactive'")
    && rules.includes("request.resource.data.subscription.plan == 'free'")
    && rules.includes("!request.resource.data.keys().hasAny(['billing'])")],
  ['client profile creation cannot supply backend-owned entitlement fields', profileCreateFunctionBody.includes("!request.resource.data.keys().hasAny(['accessProjection', 'manualAccess', 'ownerAccess'])")
    && !profileCreateFunctionBody.includes("\n          'accessProjection',")
    && !profileCreateFunctionBody.includes("\n          'manualAccess',")
    && !profileCreateFunctionBody.includes("\n          'ownerAccess',")],
  ['owner entitlement is UID-bound, permanent, active, and role-bound', rules.includes('function hasPermanentOwnerEntitlement(userId)')
    && rules.includes("get(profilePath).data.role == 'master_admin'")
    && rules.includes('get(profilePath).data.ownerAccess.enabled == true')
    && rules.includes('get(profilePath).data.ownerAccess.permanent == true')
    && rules.includes("profile.accessProjection.source == 'owner'")
    && projectionFunctionBody.includes('hasPermanentOwnerEntitlement(userId)')
    && !projectionFunctionBody.includes("request.auth.token.motofix_owner == true")
    && !ownerFunctionBody.includes("profile.role == 'master_admin'")],
  ['manual access decisions require an active claimed Master Admin and atomic audit', rules.includes('function isActiveMasterAdmin()')
    && rules.includes('function validAccessDecisionBundle(userId, auditId)')
    && userRootRules.includes('allow update: if isActiveMasterAdmin() && validAccessProfileDecision(userId);')
    && rules.includes("match /access_requests/{userId}")
    && rules.includes('allow list: if isActiveMasterAdmin();')
    && rules.includes("match /access_decisions/{auditId}")
    && rules.includes('allow get, list: if isActiveMasterAdmin();')
    && rules.includes("requestAfter.status == 'approved'")
    && rules.includes("auditAfter.createdAt == request.time")
    && !rules.includes('validOwnerAutoDeactivate')
    && !rules.includes('validAdminManualActivation')],
  ['owner identity config cannot be read or written by clients', rules.includes('match /system/{document=**}')
    && rules.includes('allow read, write: if false;')],
  ['client-side user collection listing is disabled', rules.includes('match /users/{userId}') && userRootRules.includes('allow list: if false;')],
  ['Master Admin can read one profile but cannot enumerate profiles or operational data', userRootRules.includes('allow get: if isOwner(userId) || isActiveMasterAdmin();')
    && userRootRules.includes('allow list: if false;')
    && !rules.includes('function isMasterAdmin()')
    && !operationalRules.includes('master_admin')],
  ['claim synchronization retries and records recoverable audit state', customClaimsFunction.includes('functions.runWith({ failurePolicy: true })')
    && customClaimsFunction.includes(".schedule('every 5 minutes')")
    && customClaimsFunction.includes("where('claimsSyncStatus', 'in', ['pending', 'failed'])")
    && customClaimsFunction.includes("claimsSyncStatus: 'synced'")
    && customClaimsFunction.includes("claimsSyncStatus: 'failed'")
    && customClaimsFunction.includes('claimsSyncAttempts')
    && customClaimsFunction.includes('claimsSyncError')],
  ['nested user collections are deny-by-default', rules.includes('match /users/{userId}/{document=**}') && rules.includes('allow read, write: if false;')],
  ['product stock changes require a matching atomic stock operation', rules.includes("'stockMovementId'")
    && rules.includes('function validStockOperationPair(userId, productId, productData, isCreate)')
    && rules.includes('stockOperationDataPair(userId, productId, productData, isCreate)')
    && rules.includes('validOwnerStockMovementCreate(userId, movementId)')
    && rules.includes('product.stockMovementId == movementId')
    && rules.includes('function validOwnerProductDataUpdate(userId)')],
  ['physical deletes are denied', !rules.split(/\r?\n/).some(line => line.trim().startsWith('allow delete:') && line.trim() !== 'allow delete: if false;')],
];

let failed = false;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  failed ||= !pass;
}
process.exit(failed ? 1 : 0);
