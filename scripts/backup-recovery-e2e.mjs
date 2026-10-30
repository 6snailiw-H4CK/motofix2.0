import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'motofix-backup-cross-project-e2e-'));
const workspace = process.cwd();
const firebaseCli = join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
if (!process.env.APPDATA || !process.env.PATH) throw new Error('Firebase CLI environment is unavailable.');
const runPhase = (projectId, config, script) => {
  const command = `node --import tsx ${script}`;
  console.log(`\n=== Firebase Emulator phase: ${projectId} ===`);
  return spawnSync(process.execPath, [firebaseCli,
    'emulators:exec', '--project', projectId,
    '--config', config, '--only', 'auth,firestore,functions', command,
  ], {
    cwd: workspace,
    env: { ...process.env, MOTOFIX_BACKUP_E2E_DIR: root, FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' },
    shell: false,
    stdio: 'inherit',
  });
};

let succeeded = false;
try {
  const origin = runPhase('motofix-backup-origin-e2e', 'firebase.backup-import-test.json', 'scripts/backup-recovery-e2e-origin.mjs');
  if (origin.error) throw origin.error;
  if (origin.status !== 0) throw new Error(`Origem/emulador terminou com código ${origin.status}.`);

  // The first emulators:exec has fully stopped before this second, independent project starts.
  const destination = runPhase('motofix-backup-dest-e2e', 'firebase.backup-import-test.json', 'scripts/backup-recovery-e2e-destination.mjs');
  if (destination.error) throw destination.error;
  if (destination.status !== 0) throw new Error(`Destino/emulador terminou com código ${destination.status}.`);
  succeeded = true;
  console.log('PASS E2E: arquivo .motofix restaurado entre dois projetos de emulador independentes. Nenhum Firebase remoto foi alterado.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(`Artefatos sintéticos mantidos para diagnóstico em: ${resolve(root)}`);
  process.exitCode = 1;
} finally {
  if (succeeded) await rm(root, { recursive: true, force: true });
}
