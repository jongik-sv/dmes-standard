// console-poll.mjs 를 돌린 뒤 작업 폴더의 파일 내용을 찍는다(console-poll-parity.sh 와 같은 출력).
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const D = dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [join(D, '..', '..', '..', 'scripts', 'console-poll.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
spawnSync(process.execPath, [join(D, 'console-poll-dump.mjs')], { stdio: 'inherit' });
process.exitCode = r.status ?? 70;
