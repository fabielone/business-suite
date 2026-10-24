import { spawn, spawnSync } from 'node:child_process';

const build = spawnSync('npm', ['run', 'build', '--workspace', '@suite/core'], {
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

// Explicit local fixtures only. Never call this entry point in a deployed service.
console.log(
  'Business Suite LOCAL DEMO: fictional data, resets when stopped. No real receipts or payments.',
);
const children = [
  spawn('npm', ['run', 'dev:demo', '--workspace', '@suite/api'], {
    stdio: 'inherit',
    env: process.env,
    detached: process.platform !== 'win32',
  }),
  spawn('npm', ['run', 'dev', '--workspace', '@suite/web', '--', '--mode', 'demo'], {
    stdio: 'inherit',
    env: process.env,
    detached: process.platform !== 'win32',
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM');
      else child.kill('SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') console.error(error.message);
    }
  }
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
