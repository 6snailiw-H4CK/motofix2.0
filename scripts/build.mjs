import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const env = {
  ...process.env,
  GOMAXPROCS: process.env.GOMAXPROCS || '1',
};

const run = (args) => {
  const command = process.platform === 'win32' ? [npmCommand, ...args].join(' ') : npmCommand;
  const commandArgs = process.platform === 'win32' ? [] : args;
  const result = spawnSync(command, commandArgs, {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const waitForWindowsProcessCleanup = async () => {
  if (process.platform !== 'win32') {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });
};

run(['run', 'build:client']);
await waitForWindowsProcessCleanup();
run(['run', 'build:server']);
