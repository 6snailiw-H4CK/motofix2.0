import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveBackupApiBaseUrl, validateBackupSourceProject } from '../src/services/backupEndpoint';

test('usa somente a URL explicitamente configurada para backup', () => {
  assert.equal(resolveBackupApiBaseUrl({
    backupApiUrl: 'https://backup.example.invalid/functions/',
    environment: 'development',
  }), 'https://backup.example.invalid/functions');
  assert.equal(resolveBackupApiBaseUrl({ backupApiUrl: '/', environment: 'development' }), '');
});

test('produção usa as rotas relativas de Hosting quando não há URL específica', () => {
  const baseUrl = resolveBackupApiBaseUrl({ environment: 'production' });
  assert.equal(`${baseUrl}/api/backup/full`, '/api/backup/full');
});

test('desenvolvimento sem URL ou proxy explícito falha de forma segura', () => {
  assert.throws(
    () => resolveBackupApiBaseUrl({ environment: 'development' }),
    /Configure VITE_BACKUP_API_URL/,
  );
});

test('rejeita URLs de endpoint malformadas ou com credenciais', () => {
  for (const backupApiUrl of ['ftp://backup.example.invalid', 'https://user:pass@backup.example.invalid', '//backup.example.invalid', '/api/backup']) {
    assert.throws(() => resolveBackupApiBaseUrl({ backupApiUrl, environment: 'development' }));
  }
});

test('systemBackupApi não contém fallback para URLs de reset, fiscal ou WhatsApp', () => {
  const source = readFileSync(new URL('../src/services/systemBackupApi.ts', import.meta.url), 'utf8');
  assert.match(source, /VITE_BACKUP_API_URL/);
  assert.doesNotMatch(source, /VITE_DATA_RESET_API_URL|VITE_FISCAL_API_URL|VITE_WHATSAPP_API_URL/);
});

test('valida projeto retornado pela API contra o projeto do Firebase configurado', () => {
  assert.equal(validateBackupSourceProject('motofix-source-test', 'motofix-source-test'), 'motofix-source-test');
  assert.throws(() => validateBackupSourceProject('../other', 'motofix-source-test'), /ID de projeto de origem inválido/);
  assert.throws(() => validateBackupSourceProject('motofix-other-test', 'motofix-source-test'), /não corresponde ao projeto Firebase configurado/);
});
