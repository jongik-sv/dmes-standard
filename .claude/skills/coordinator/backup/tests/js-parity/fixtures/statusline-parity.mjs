// statusline-dump.mjs 를 돌린 뒤 같은 덤프를 찍는다(statusline-parity.sh 와 같은 출력).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const D = dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [join(D, '..', '..', '..', 'scripts', 'statusline-dump.mjs')], { stdio: ['inherit', 'inherit', 'inherit'] });
spawnSync(process.execPath, [join(D, 'statusline-dump-dump.mjs')], { stdio: 'inherit' });
process.exitCode = r.status ?? 70;
