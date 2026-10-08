// idle-check 대조용: 상태 폴더(sr/)의 파일을 경로 순으로 내용까지 찍는다(ISO 시각은 <ISO>, 지금 근처의 epoch 초는 <NOW>).
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z)/g;
const now = Math.floor(Date.now() / 1000);
const EP = /(?<![0-9])1[0-9]{9}(?![0-9])/g;
const clean = (s) => s.replace(ISO, '<ISO>').replace(EP, (m) => (Math.abs(Number(m) - now) < 600 ? '<NOW>' : m));
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
