/**
 * Validação de regras Firestore sem emulator
 * Simula os cenários de permissão e soft-delete
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('📋 Analisando firestore.rules...\n');

// Ler o arquivo de regras
const rulesPath = path.resolve(__dirname, '..', 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

// Verificações
const checks = [];

// 1. Verificar que isAdmin() foi atualizado
console.log('🔍 Verificações de Regras:\n');

if (
  rulesContent.includes('hasAdminClaim()')
  && rulesContent.includes("request.auth.token.keys().hasAny(['admin'])")
  && rulesContent.includes('request.auth.token.admin == true')
) {
  checks.push({ pass: true, msg: '✅ isAdmin() valida custom claim admin' });
} else {
  checks.push({ pass: false, msg: '❌ isAdmin() sem validacao real de custom claim admin' });
}

if (rulesContent.includes("get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'")) {
  checks.push({ pass: true, msg: "✅ isAdmin() verifica documento role == 'admin'" });
} else {
  checks.push({ pass: false, msg: "❌ isAdmin() não valida role no documento" });
}

if (rulesContent.includes('isActive == true') || rulesContent.includes('isActive==true')) {
  checks.push({ pass: true, msg: '✅ isAdmin() verifica isActive == true' });
} else {
  checks.push({ pass: false, msg: '❌ isAdmin() não valida isActive' });
}

// 2. Verificar que cash_launches permite soft delete
if (rulesContent.includes('deletedAt') && rulesContent.includes('deletedBy')) {
  checks.push({ pass: true, msg: '✅ Soft-delete fields (deletedAt, deletedBy) permitidos' });
} else {
  checks.push({ pass: false, msg: '❌ Soft-delete fields não encontrados nas regras' });
}

// 3. Verificar que isActiveOwner valida role e isActive
if (rulesContent.includes('isActiveOwner') && rulesContent.includes('isActive')) {
  checks.push({ pass: true, msg: '✅ isActiveOwner() valida isActive' });
} else {
  checks.push({ pass: false, msg: '❌ isActiveOwner() não tem validação de isActive' });
}

// 4. Verificar regra update para cash_launches
if (rulesContent.includes('match /users/{userId}/cash_launches/{launchId}')) {
  checks.push({ pass: true, msg: '✅ Regra para /users/{userId}/cash_launches/{launchId} existe' });
} else {
  checks.push({ pass: false, msg: '❌ Regra para cash_launches não encontrada' });
}

// 5. Verificar que admin pode fazer update (soft-delete)
if (rulesContent.includes('allow update: if isAdmin()') && rulesContent.includes('validOwnerUpdate(userId, cashLaunchKeys())')) {
  checks.push({ pass: true, msg: '✅ Admins e owners têm permissão para update (soft-delete)' });
} else {
  checks.push({ pass: false, msg: '❌ Admin/owner update permission não clara' });
}

// 6. Verificar regra de leitura para /users (admin only)
if (rulesContent.includes('allow list: if isAdmin();') && rulesContent.includes('match /users/{userId}')) {
  checks.push({ pass: true, msg: '✅ Regra para /users collection existe com list: admin only' });
} else {
  checks.push({ pass: false, msg: '❌ Regra para /users collection não encontrada ou incorrect' });
}

// 7. Verificar que delete fisico esta bloqueado
const unsafeDeleteRules = rulesContent
  .split(/\r?\n/)
  .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
  .filter(({ line }) => line.startsWith('allow delete:') && line !== 'allow delete: if false;');

if (unsafeDeleteRules.length === 0) {
  checks.push({ pass: true, msg: 'Delete fisico direto esta bloqueado nas regras' });
} else {
  checks.push({
    pass: false,
    msg: `Delete fisico permitido em: ${unsafeDeleteRules.map((rule) => `L${rule.lineNumber}`).join(', ')}`,
  });
}

// Exibir resultados
console.log('Resultados:');
checks.forEach(check => {
  console.log(`  ${check.msg}`);
});

const allPass = checks.every(c => c.pass);
const passCount = checks.filter(c => c.pass).length;

console.log(`\n📊 ${passCount}/${checks.length} verificações passaram\n`);

if (allPass) {
  console.log('✅ Todas as verificações passaram!');
  console.log('\n🚀 Regras parecem estar configuradas corretamente para:');
  console.log('   - Admin via custom claim');
  console.log('   - Admin via documento role field');
  console.log('   - Soft delete com metadados');
  console.log('   - Validação de isActive');
  process.exit(0);
} else {
  console.log('❌ Algumas verificações falharam. Verifique o firestore.rules');
  process.exit(1);
}
