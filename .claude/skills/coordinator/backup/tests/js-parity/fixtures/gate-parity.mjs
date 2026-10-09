// merge-gate.mjs 를 돌리기 전에 gate-parity.sh 와 같은 리포 준비를 한다.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const D = dirname(fileURLToPath(import.meta.url));
const p = spawnSync(process.execPath, [join(D, 'gate-prep.mjs')], { stdio: 'inherit' });
if (p.status !== 0) process.exit(97);
const r = spawnSync(process.execPath, [join(D, '..', '..', '..', 'scripts', 'merge-gate.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exitCode = r.status ?? 70;
