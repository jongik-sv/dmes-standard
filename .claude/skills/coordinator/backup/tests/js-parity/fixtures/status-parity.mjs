// coord-status.mjs 를 status-parity.sh 와 같은 준비로 돌린다.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const D = dirname(fileURLToPath(import.meta.url));
const p = spawnSync(process.execPath, [join(D, 'status-prep.mjs')], { stdio: 'inherit' });
if (p.status !== 0) process.exit(97);
const r = spawnSync(process.execPath, [join(D, '..', '..', '..', 'scripts', 'coord-status.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exitCode = r.status ?? 70;
