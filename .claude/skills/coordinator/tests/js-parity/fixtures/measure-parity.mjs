// measure-window.mjs 를 measure-parity.sh 와 같은 준비·덤프로 돌린다.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const D = dirname(fileURLToPath(import.meta.url));
const run = (f, args = []) => spawnSync(process.execPath, [join(D, f), ...args], { stdio: 'inherit' });
if (run('measure-prep.mjs').status !== 0) process.exit(97);
const r = run(join('..', '..', '..', 'scripts', 'measure-window.mjs'), process.argv.slice(2));
run('measure-dump.mjs');
process.exitCode = r.status ?? 70;
