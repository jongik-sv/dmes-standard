// coord-status 대조 래퍼 준비: (1) `.repo.json` 이 있으면 gate-prep.mjs 로 작업 폴더에 git 리포를 만들고
// (2) `.sess.json`([{file, pid: 'LIVE'|'DEAD'|숫자, cwd: '@WORK@…', …나머지 필드}])대로 세션 파일을 $HOME/.claude/sessions 에 쓴다.
//     LIVE 는 이 준비 프로세스의 부모(래퍼; 스크립트가 도는 동안 살아 있음), @WORK@ 는 작업 폴더의 실경로(git worktree list 가 실경로를 내므로).
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const D = dirname(fileURLToPath(import.meta.url));
if (existsSync('.repo.json')) {
  const r = spawnSync(process.execPath, [join(D, 'gate-prep.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (existsSync('.sess.json')) {
  const real = realpathSync(process.cwd());
  const dir = join(process.env.HOME ?? '', '.claude', 'sessions');
  mkdirSync(dir, { recursive: true });
  for (const s of JSON.parse(readFileSync('.sess.json', 'utf8'))) {
    const { file, ...rest } = s;
    const o = {};
    for (const [k, v] of Object.entries(rest)) {
      if (k === 'pid') o.pid = v === 'LIVE' ? process.ppid : v === 'DEAD' ? 999999 : v;
      else if (k === 'cwd' && typeof v === 'string') o.cwd = v.split('@WORK@').join(real);
      else if (v !== null || k === 'name') o[k] = v;
    }
    writeFileSync(join(dir, file), JSON.stringify(o));
  }
}
