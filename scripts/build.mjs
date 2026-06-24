import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const baseEnv = {
  ...process.env,
  GOMAXPROCS: process.env.GOMAXPROCS || '1',
};

const run = (args, options = {}) => {
  const command = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : npmCommand;
  const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', npmCommand, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    env: {
      ...baseEnv,
      ...options.env,
    },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (options.allowFailure) {
      return false;
    }

    process.exit(result.status ?? 1);
  }

  return true;
};

const waitForWindowsProcessCleanup = async () => {
  if (process.platform !== 'win32') {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
};

const runLowMemoryClientBuild = () => {
  run(['run', 'build:client'], {
    env: {
      MOTOFIX_LOW_MEMORY_BUILD: '1',
    },
  });
};

const buildClient = async () => {
  if (process.platform === 'win32' || process.env.MOTOFIX_LOW_MEMORY_BUILD === '1') {
    runLowMemoryClientBuild();
    return;
  }

  const clientBuilt = run(['run', 'build:client'], { allowFailure: process.platform === 'win32' });

  if (clientBuilt) {
    return;
  }

  console.warn('\nBuild padrão falhou no Windows. Tentando novamente em modo de baixa memória...\n');
  await waitForWindowsProcessCleanup();

  run(['run', 'build:client'], {
    env: {
      MOTOFIX_LOW_MEMORY_BUILD: '1',
    },
  });
};

await buildClient();
await waitForWindowsProcessCleanup();
run(['run', 'build:server']);
