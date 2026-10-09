// office 대조용: 작업 폴더(cwd)의 파일을 경로 순으로 내용까지 찍는다(시각은 <ISO> 로 지움). office.sh·office.mjs 를 돌린 뒤 같은 코드로 부른다.
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/g;
const root = process.cwd();
const SKIP = new Set(['fake-dflow.sh', '.coord.local.json']);
const out = [];
const walk = (d) => {
  for (const name of readdirSync(d).sort()) {
    const p = join(d, name), rel = relative(root, p).split(sep).join('/');
    if (SKIP.has(rel)) continue;
    const st = lstatSync(p);
    if (st.isDirectory()) { out.push(`--- ${rel}/`); walk(p); }
    else out.push(`--- ${rel}\n${readFileSync(p, 'latin1').replace(ISO, '<ISO>')}`);
  }
};
walk(root);
process.stdout.write(`${out.join('\n')}\n`);
