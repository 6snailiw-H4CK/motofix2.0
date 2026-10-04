/** Static security assertions for the Firestore rules. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const customClaimsFunction = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const userAccessHelper = fs.readFileSync(path.join(root, 'server/userAccess.ts'), 'utf8');
const fiscalRoutes = fs.readFileSync(path.join(root, 'server/fiscal/fiscalRoutes.ts'), 'utf8');
const adminFunctionBody = rules.match(/function isAdmin\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
const ownerFunctionBody = rules.match(/function isActiveOwner\(userId\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
const checks = [
  ['custom claim admin is required', rules.includes('function hasAdminClaim()')
    && rules.includes("request.auth.token.keys().hasAny(['admin'])")
    && rules.includes('request.auth.token.admin == true')],
  ['admin requires custom claim and active profile', adminFunctionBody.includes('hasAdminClaim()')
    && adminFunctionBody.includes('userProfileIsActive(request.auth.uid)')
    && adminFunctionBody.includes(".data.role == 'admin'")],
  ['owner reads and writes require active profile', ownerFunctionBody.includes('isOwner(userId)')
    && ownerFunctionBody.includes('userProfileIsActive(userId)')
    && rules.includes('return isActiveOwner(userId) || isAdmin();')],
  ['managed custom claims are removed before resync', customClaimsFunction.includes('delete merged.admin;')
    && customClaimsFunction.includes('delete merged.isActive;')
    && customClaimsFunction.includes("after.role === 'admin' && after.isActive === true")],
  ['backend admin requires active profile and admin role', userAccessHelper.includes('decoded.admin !== true')
    && userAccessHelper.includes("profile?.role === 'admin'")
    && userAccessHelper.includes('profile?.isActive === true')],
  ['fiscal API requires server feature flag and beta/admin authorization', fiscalRoutes.includes('process.env.FISCAL_MODULE_ENABLED')
    && fiscalRoutes.includes('process.env.FISCAL_BETA_EMAILS')
    && fiscalRoutes.includes('getActiveUserProfile(options.db, decoded.uid)')],
  ['new regular profiles start inactive', rules.includes("request.resource.data.role == 'user' && request.resource.data.isActive == false")],
  ['common user cannot write billing or subscription', rules.includes('isOwner(userId) && validOwnerAutoDeactivate()')
    && !rules.includes('validOwnerBilling')],
  ['manual admin migration cannot write billing or subscription', rules.includes('function validAdminManualActivation()')
    && rules.includes(".hasOnly(['isActive', 'subscriptionExpiresAt', 'updatedAt'])")],
  ['user list is limited to custom-claim admins', rules.includes('match /users/{userId}') && rules.includes('allow list: if isAdmin();')],
  ['nested user collections are deny-by-default', rules.includes('match /users/{userId}/{document=**}') && rules.includes('allow read, write: if false;')],
  ['physical deletes are denied', !rules.split(/\r?\n/).some(line => line.trim().startsWith('allow delete:') && line.trim() !== 'allow delete: if false;')],
];

let failed = false;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  failed ||= !pass;
}
process.exit(failed ? 1 : 0);
