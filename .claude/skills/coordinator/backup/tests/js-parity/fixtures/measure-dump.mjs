// measure-window 대조용 덤프: 상태 폴더(sr/)의 파일 + heavy.log + 시험이 띄운 sleep 의 생존 여부(남은 것은 여기서 정리한다).
import { existsSync, readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
const now = Math.floor(Date.now() / 1000);
const ISO = /2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z)/g;
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
if (existsSync('heavy.log')) out.push(`--- heavy.log\n${readFileSync('heavy.log', 'latin1')}`);
if (existsSync('.spawned.json')) {
  const sp = JSON.parse(readFileSync('.spawned.json', 'utf8'));
  const alive = (p) => { try { process.kill(p, 0); return spawnSync('ps', ['-p', String(p), '-o', 'stat='], { encoding: 'utf8' }).stdout.trim() !== '' && !/^Z/.test(spawnSync('ps', ['-p', String(p), '-o', 'stat='], { encoding: 'utf8' }).stdout.trim()); } catch { return false; } };
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
  for (const [k, p] of Object.entries(sp).sort()) {
    out.push(`--- sleeper ${k} alive=${alive(p)}`);
    const comm = spawnSync('ps', ['-p', String(p), '-o', 'comm='], { encoding: 'utf8' }).stdout.trim();
    if (alive(p) && /sleep$/.test(comm)) { try { process.kill(p, 'SIGKILL'); } catch { /* 무시 */ } }
  }
}
process.stdout.write(`${out.join('\n')}\n`);
