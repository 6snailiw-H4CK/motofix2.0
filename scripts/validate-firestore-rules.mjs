/** Static security assertions for the Firestore rules. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const checks = [
  ['custom claim admin is required', rules.includes('function hasAdminClaim()')
    && rules.includes("request.auth.token.keys().hasAny(['admin'])")
    && rules.includes('request.auth.token.admin == true')],
  ['profile role cannot grant admin access', !rules.includes('get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role')],
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
