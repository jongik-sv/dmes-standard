// stall-check 대조용: 상태 폴더(sr/)의 tick 파일을 찍는다. 시각은 <NOW>/<ISO>, cpu= 줄의 항목은 정렬한다
// (bash 판은 awk 해시 순서로 나열하므로 순서는 구현마다 다르다 — 읽을 때 키로만 본다).
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
const now = Math.floor(Date.now() / 1000);
const EP = /(?<![0-9])1[0-9]{9}(?![0-9])/g;
const clean = (s) => s.replace(EP, (m) => (Math.abs(Number(m) - now) < 600 ? '<NOW>' : m))
  .split('\n').map((l) => (l.startsWith('cpu=') ? `cpu=${l.slice(4).split(',').sort().join(',')}` : l)).join('\n');
const root = process.cwd();
const out = [];
const walk = (d) => {
  let names;
  try { names = readdirSync(d).sort(); } catch { return; }
  for (const name of names) {
    const p = join(d, name), rel = relative(root, p).split(sep).join('/');
    const st = lstatSync(p);
    if (st.isDirectory()) { out.push(`--- ${rel}/`); walk(p); }
    else out.push(`--- ${rel}\n${clean(readFileSync(p, 'latin1'))}`);
  }
};
walk(join(root, 'sr'));
process.stdout.write(`${out.join('\n')}\n`);
