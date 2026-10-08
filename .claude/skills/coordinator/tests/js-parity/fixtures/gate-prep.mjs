// merge-gate 대조 래퍼 공통: 작업 폴더(cwd)의 `.repo.json` 대로 git 리포를 만든다(커밋 시각·작성자 고정 → 같은 입력이면 같은 객체).
//   { "integ": "dev", "base": {경로: 내용}, "branches": {이름: {from?: 이름, changes: {경로: 내용|null}}}, "integChanges": {경로: 내용|null} }
//   null 은 삭제. 리포에는 recipe 에 적힌 경로만 추가한다(.coord.local.json·sr/·.repo.json 같은 하니스 파일은 추적하지 않는다).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

if (existsSync('.repo.json')) {
  const r = JSON.parse(readFileSync('.repo.json', 'utf8'));
  const env = {
    ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z', LC_ALL: 'C',
  };
  const git = (...a) => {
    const x = spawnSync('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-c', 'core.quotepath=true', ...a], { env, encoding: 'utf8' });
    if (x.status !== 0) throw new Error(`git ${a.join(' ')}: ${x.stderr}`);
    return x.stdout;
  };
  const apply = (changes) => {
    for (const [p, v] of Object.entries(changes)) {
      if (v === null) rmSync(p, { force: true });
      else { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, v); }
      git('add', '-A', '--', p);
    }
  };
  git('init', '-q', '-b', r.integ);
  apply(r.base ?? {});
  git('commit', '-q', '--allow-empty', '-m', 'base');
  const baseSha = git('rev-parse', 'HEAD').trim();
  for (const [name, b] of Object.entries(r.branches ?? {})) {
    git('checkout', '-q', '-b', name, b.from ?? baseSha);
    apply(b.changes ?? {});
    git('commit', '-q', '--allow-empty', '-m', `b ${name}`);
  }
  git('checkout', '-q', r.integ);
  if (r.integChanges && Object.keys(r.integChanges).length) {
    apply(r.integChanges);
    git('commit', '-q', '--allow-empty', '-m', 'integ');
  }
}
