// stall-check 대조 래퍼 공통: 작업 폴더의 `.wt.json` 대로 워크트리용 git 리포를 만든다(커밋 시각 고정, 파일 mtime 을 절대 시각으로 맞춤).
//   { "wts": { "wt/a1": { "commitTs": 1790000000, "files": {경로: 내용}, "untracked": {경로: 내용}, "mtimes": {경로: epoch} } } }
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

if (existsSync('.wt.json')) {
  const r = JSON.parse(readFileSync('.wt.json', 'utf8'));
  for (const [dir, w] of Object.entries(r.wts ?? {})) {
    mkdirSync(dir, { recursive: true });
    const date = `${w.commitTs ?? 1700000000} +0000`;
    const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, LC_ALL: 'C' };
    const git = (...a) => {
      const x = spawnSync('git', ['-C', dir, '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'commit.gpgsign=false', ...a], { env, encoding: 'utf8' });
      if (x.status !== 0) throw new Error(`git ${a.join(' ')}: ${x.stderr}`);
    };
    git('init', '-q', '-b', 'main');
    for (const [p, v] of Object.entries(w.files ?? {})) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), v); git('add', '--', p); }
    git('commit', '-q', '--allow-empty', '-m', 'c');
    for (const [p, v] of Object.entries(w.untracked ?? {})) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), v); }
    for (const [p, e] of Object.entries(w.mtimes ?? {})) { try { utimesSync(join(dir, p), e, e); } catch { /* 없는 파일 */ } }
  }
}
