// spawn-lane 대조용: 작업 폴더(cwd)의 파일을 경로 순으로 내용까지 찍는다(시각은 <ISO> 로 지움). 정적 입력(bin·화면·설정)은 건너뛴다.
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
import { realpathSync } from 'node:fs';
const root = process.cwd();
const roots = [...new Set([root, realpathSync(root)])];   // 작업 폴더 경로(임시 폴더 이름)는 지운다 — 발사 명령의 cd <폴더> 가 사례마다 다르다
const scrub = (t) => roots.reduce((acc, r) => acc.split(r).join('<WORK>'), t);
const SKIP = [/^bin\//, /^\.coord\.local\.json$/, /^fake\/screens\//, /^fake\/(terms|idle|send|create|worktrees|newsession)$/, /^home\/\.claude\/sessions\//];
const out = [];
const walk = (d) => {
  for (const name of readdirSync(d).sort()) {
    const p = join(d, name), rel = relative(root, p).split(sep).join('/');
    if (SKIP.some((re) => re.test(rel))) continue;
    const st = lstatSync(p);
    if (st.isDirectory()) { out.push(`--- ${rel}/`); walk(p); }
    else out.push(`--- ${rel}\n${scrub(readFileSync(p, 'latin1')).replace(ISO, '<ISO>')}`);
  }
};
walk(root);
let leaked = 0;
try { leaked = readdirSync(process.env.TMPDIR || '/nonexistent').length; } catch { /* 없음 */ }
out.push(`--- TMPDIR 항목 수: ${leaked}`);
process.stdout.write(`${out.join('\n')}\n`);
