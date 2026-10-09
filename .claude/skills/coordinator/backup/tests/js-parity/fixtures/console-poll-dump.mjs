// console-poll 대조용: 작업 폴더(cwd)의 파일을 경로 순으로 권한·내용까지 찍는다. 시각·pid·밀리초 값은 지운다(형식은 정규식으로 남긴다).
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g;
const root = process.cwd();
const SKIP = new Set(['.coord.local.json']);
const out = [];
const scrub = (rel, s) => {
  const b = basename(rel);
  if (b === 'pid' || b === 'pstart' || b === 'tmpd' || b === 'since') return '<VOLATILE>\n';
  return s.replace(ISO, '<ISO>').replace(/"read_at_ms":\d+/g, '"read_at_ms":N').replace(/pid=\d+/g, 'pid=<P>').replace(/\.tmp\.\d+/g, '.tmp.<P>');
};
const walk = (d) => {
  for (const name of readdirSync(d).sort()) {
    const p = join(d, name), rel = relative(root, p).split(sep).join('/');
    if (SKIP.has(rel) || rel === 'bin' || rel.startsWith('bin/')) continue;
    const st = lstatSync(p);
    const mode = (st.mode & 0o777).toString(8);
    if (st.isDirectory()) { out.push(`--- ${rel}/ ${mode}`); walk(p); }
    else out.push(`--- ${rel} ${mode}\n${scrub(rel, readFileSync(p, 'utf8'))}`);
  }
};
walk(root);
process.stdout.write(`${out.join('\n')}\n`);
