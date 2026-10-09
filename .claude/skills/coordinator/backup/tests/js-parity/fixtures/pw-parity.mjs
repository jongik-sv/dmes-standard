// prompt-watch.mjs 를 pw-parity.sh 와 같은 준비·덧붙임으로 돌린다.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const D = dirname(fileURLToPath(import.meta.url));
const p = spawnSync(process.execPath, [join(D, 'pw-prep.mjs')], { stdio: 'inherit' });
if (p.status !== 0) process.exit(97);
const r = spawnSync(process.execPath, [join(D, '..', '..', '..', 'scripts', 'prompt-watch.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
if (existsSync('orca.log')) process.stdout.write(Buffer.concat([Buffer.from('--- orca.log\n'), readFileSync('orca.log')]));
process.exitCode = r.status ?? 70;
