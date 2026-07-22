import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { applyBackupRetention } from '../server/automaticBackup';

test('aplica retenção removendo arquivos antigos além do limite', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'motofix-backup-test-'));

  try {
    await mkdir(path.join(tempDir, 'snapshots'), { recursive: true });
    const snapshotDir = path.join(tempDir, 'snapshots');

    await writeFile(path.join(snapshotDir, 'motofix-backup-20240101.json'), '{}');
    await writeFile(path.join(snapshotDir, 'motofix-backup-20240102.json'), '{}');
    await writeFile(path.join(snapshotDir, 'motofix-backup-20240103.json'), '{}');

    const removedFiles = await applyBackupRetention(snapshotDir, 2);

    assert.deepEqual(removedFiles.sort(), [
      path.join(snapshotDir, 'motofix-backup-20240101.json'),
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('preserva os backups mais recentes quando a retenção é maior que o total', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'motofix-backup-test-'));

  try {
    await mkdir(path.join(tempDir, 'snapshots'), { recursive: true });
    const snapshotDir = path.join(tempDir, 'snapshots');

    await writeFile(path.join(snapshotDir, 'motofix-backup-20240101.json'), '{}');
    await writeFile(path.join(snapshotDir, 'motofix-backup-20240102.json'), '{}');

    const removedFiles = await applyBackupRetention(snapshotDir, 10);

    assert.deepEqual(removedFiles, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
