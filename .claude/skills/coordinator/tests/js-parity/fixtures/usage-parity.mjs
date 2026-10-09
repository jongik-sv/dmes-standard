// usage-band.mjs 를 돌리기 전에 usage-parity.sh 와 같은 mtime 준비를 한다.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const D = dirname(fileURLToPath(import.meta.url));
spawnSync(process.execPath, [join(D, 'usage-prep.mjs')], { stdio: 'inherit' });
const r = spawnSync(process.execPath, [join(D, '..', '..', '..', 'scripts', 'usage-band.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exitCode = r.status ?? 70;
