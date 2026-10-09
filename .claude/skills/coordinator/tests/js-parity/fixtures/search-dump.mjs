// search 대조용 덤프: 상태 폴더(sr/)와 $TMPDIR/coord-searches 의 파일을 경로 순으로 내용까지 찍고 sent.log(가짜 orca 가 받은 줄)도 찍는다.
// 시각·pid 가 든 답 파일 이름은 <TS>-<PID> 로, 지금 근처의 epoch·ISO 는 지운다.
import { existsSync, readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
const now = Math.floor(Date.now() / 1000);
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z)/g;
const NAME = /\d{8}-\d{6}-\d+-/g;
const clean = (s) => s.replace(ISO, '<ISO>').replace(NAME, '<TS>-<PID>-');
const entries = [];
const walk = (d, tag) => {
  let names;
  try { names = readdirSync(d).sort(); } catch { return; }
  for (const name of names) {
    const p = join(d, name);
    const st = lstatSync(p);
    const rel = clean(`${tag}${p.slice(tag === 'S:' ? process.cwd().length : (process.env.TMPDIR ?? '').length)}`);
    if (st.isDirectory()) { entries.push([rel, `--- ${rel}/`]); walk(p, tag); }
    else entries.push([rel, `--- ${rel}\n${clean(readFileSync(p, 'latin1'))}`]);
  }
};
walk(join(process.cwd(), 'sr'), 'S:');
walk(join(process.env.TMPDIR ?? '', 'coord-searches'), 'T:');
const out = entries.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)).map((e) => e[1]);
if (existsSync('sent.log')) out.push(`--- sent.log\n${clean(readFileSync('sent.log', 'latin1'))}`);
process.stdout.write(`${out.join('\n')}\n`);
