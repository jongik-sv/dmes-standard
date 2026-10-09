#!/usr/bin/env node
// 같은 리포의 다른 워크트리에서 살아 있는 /dflow-team 팀장을 찾는다. (옛 live-leads.sh 를 node 로 옮긴 것.)
// 사용: live-leads.mjs          한 줄에 하나: <신원 슬러그><TAB><워크트리 경로>
//       live-leads.mjs --mark   stdin 의 `dflow profiles` 행(JSON)에 in_use 를 더해 낸다. JSON 이 아닌 줄은 그대로 낸다.
// 종료 코드: 0 · 2(사용 오류).
// node 18.17 이상, 외부 패키지 없음.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const USAGE = '사용: live-leads.mjs [--mark]';
const HELP = '같은 리포의 다른 워크트리에서 살아 있는 /dflow-team 팀장을 찾는다.\n'
  + USAGE + '\n'
  + '출력: 한 줄에 하나 `<신원 슬러그><TAB><워크트리 경로>` (--mark 면 stdin JSON 행에 in_use 를 더해 낸다)\n'
  + '종료 코드: 0 · 2(사용 오류)\n';

function hostName() {
  let h = '';
  try { h = os.hostname(); } catch { h = ''; }
  h = String(h).split('.')[0] ?? '';
  return h.replace(/[A-Z]/g, (c) => c.toLowerCase()).replace(/[^a-z0-9-]/g, '-');
}

function gitOut(args, cwd) {
  try {
    const r = spawnSync('git', args, { encoding: 'utf8', cwd, windowsHide: true });
    if (r.error || r.status !== 0) return null;
    return (r.stdout ?? '').trim();
  } catch { return null; }
}

// $1: 잠금 디렉터리. beat(trim 뒤 숫자)가 70분 안이면 살아 있음. beat 가 없으면(빈 값)
// 잠금 디렉터리 수정 시각이 10분 안. beat 가 비숫자면 stale(죽은 잠금으로 본다).
function isStale(lockDir, nowSec) {
  let b = '';
  try { b = String(fs.readFileSync(lockDir + '/beat', 'utf8')); } catch { b = ''; }
  const t = b.trim();
  if (t === '') {
    try {
      const mt = Math.floor(fs.statSync(lockDir).mtimeMs / 1000);
      return (nowSec - mt) > 600;
    } catch { return false; }
  }
  if (/^[-+]?[0-9]+$/.test(t)) return (nowSec - Number(t)) >= 4200;
  return true;
}

function leads(env, cwd) {
  const MAIN = gitOut(['rev-parse', '--show-toplevel'], cwd);
  if (MAIN === null) return { fail: 'FAIL NOT_GIT' };
  const host = hostName();
  const nowSec = Math.floor(Date.now() / 1000);
  let wt = '';
  try {
    const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8', cwd, windowsHide: true });
    if (!r.error && r.status === 0) wt = r.stdout ?? '';
  } catch { /* 없음 */ }
  const out = [];
  for (const ln of wt.split('\n')) {
    if (!ln.startsWith('worktree ')) continue;
    const w = ln.slice('worktree '.length);
    if (w === '' || w === MAIN) continue;
    const l = gitOut(['-C', w, 'rev-parse', '--path-format=absolute', '--git-path', 'dflow-team.lock'], cwd);
    if (l === null) continue;
    try { if (!fs.statSync(l).isDirectory()) continue; } catch { continue; }
    let o = '';
    try { o = String(fs.readFileSync(l + '/owner', 'utf8').split('\n')[0] ?? '').split(' ')[0] ?? ''; } catch { o = ''; }
    if (o === '' || !o.endsWith(`/${host}/lead`)) continue;
    if (isStale(l, nowSec)) continue;
    const si = o.indexOf('/');
    out.push(`${si < 0 ? o : o.slice(0, si)}\t${w}`);
  }
  return { lines: out };
}

function markLines(text, map) {
  if (text === '') return '';
  let rows = text.split('\n');
  if (text.endsWith('\n')) rows.pop();
  // 끝 줄바꿈 없는 마지막 줄·빈 줄도 그대로 처리한다(빈 줄은 빈 줄로 낸다).
  return rows.map((line) => {
    if (!line.startsWith('{')) return line;
    try {
      const v = JSON.parse(line);
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return line;
      const who = v.who;
      // jq `($m[.who] // null)` 는 who 가 수가 불리언 등이면 조회 오류 → 원문을 그대로 낸다
      if (who !== undefined && who !== null && typeof who !== 'string') return line;
      const use = (typeof who === 'string' && who !== '') ? (map[who] ?? null) : null;
      return JSON.stringify({ ...v, in_use: use });
    } catch { return line; }
  }).join('\n') + '\n';
}

function main(argv, env = process.env, cwd = process.cwd()) {
  for (const a of argv) {
    if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
  }
  if (argv.length === 0) {
    const r = leads(env, cwd);
    if (r.fail) { process.stderr.write(r.fail + '\n'); return 2; }
    if (r.lines.length) process.stdout.write(r.lines.join('\n') + '\n');
    return 0;
  }
  if (argv.length === 1 && argv[0] === '--mark') {
    const r = leads(env, cwd);
    if (r.fail) { process.stderr.write(r.fail + '\n'); return 2; }
    const map = {};
    for (const ln of r.lines) {
      const t = ln.indexOf('\t');
      if (t >= 0) map[ln.slice(0, t)] = ln.slice(t + 1);
    }
    let text = '';
    try { text = fs.readFileSync(0, 'utf8'); } catch { text = ''; }
    if (text !== '') process.stdout.write(markLines(text, map));
    return 0;
  }
  process.stderr.write(USAGE + '\n');
  return 2;
}

// 직접 실행·심링크 경로에서도 늘 main 을 실행한다(진입 가드 없음).
{
  let rc = 70;
  try { rc = main(process.argv.slice(2)); } catch (e) {
    try { process.stderr.write(`내부 오류: ${(e && e.stack) || e}\n`); } catch { /* 무시 */ }
    rc = 70;
  }
  process.exitCode = rc ?? 0;
}

