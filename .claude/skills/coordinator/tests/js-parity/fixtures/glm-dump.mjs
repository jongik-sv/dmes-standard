// glm-preflight 대조용: 작업 폴더(cwd)의 파일을 경로 순으로 내용까지 찍는다(시각은 <ISO> 로 지운다).
// .coord.local.json(입력)·가짜 명임(bin/)·가짜가 남긴 로그(curl.log)는 결과가 아니라 입력이라 뺀다.
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/g;
const SKIP = new Set(['.coord.local.json', 'curl.log', 'hdr.copy']);
const root = process.cwd();
const out = [];
const walk = (d) => {
  let names;
  try { names = readdirSync(d).sort(); } catch { return; }
  for (const name of names) {
    const p = join(d, name), rel = relative(root, p).split(sep).join('/');
    if (rel === 'bin') continue;
    if (SKIP.has(rel)) continue;
    const st = lstatSync(p);
    if (st.isDirectory()) { out.push(`--- ${rel}/`); walk(p); }
    else out.push(`--- ${rel}\n${readFileSync(p, 'latin1').replace(ISO, '<ISO>')}`);
  }
};
walk(root);
process.stdout.write(`${out.join('\n')}\n`);
