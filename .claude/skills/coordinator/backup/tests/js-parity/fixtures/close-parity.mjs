// close-lane.mjs 를 돌린 뒤 idle-parity.sh 와 같은 덤프를 찍는다.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const D = dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [join(D, '..', '..', '..', 'scripts', 'close-lane.mjs'), ...process.argv.slice(2)], { stdio: ['inherit', 'inherit', 'inherit'] });
spawnSync(process.execPath, [join(D, 'idle-dump.mjs')], { stdio: 'inherit' });
process.exitCode = r.status ?? 70;
