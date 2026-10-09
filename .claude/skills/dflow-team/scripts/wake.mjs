#!/usr/bin/env node
// /dflow-team 기상 블록. 팀장은 매 기상 맨 처음 이 스크립트를 한 번 부른다. (옛 wake.sh 를 node 로 옮긴 것.)
// 사용: wake.mjs --owner '<신원>/<host>/lead' --slots <N> --busy <M> --until-label '<UNTIL_LABEL>' [--wp '<WP 범위>'] [--pid <LEAD_PID>] [--no-events]
// 출력 줄: LOCK_OK · {"n":…} · WATCH_FAILED · HOLDER_FAILED · LOCK_LOST … · LEASE_KEEP_DEAD … · (기록 명령 본문) · COMPACT_REREAD …
// 늘 exit 0(사용법 오류만 2). 판정은 출력 줄로 한다.
// node 18.17 이상, 외부 패키지 없음.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = '사용: wake.mjs --owner <신원>/<host>/lead --slots <N> --busy <M> --until-label <표시> [--wp <WP 범위>] [--pid <PID>] [--no-events]';
const HELP = '/dflow-team 기상 블록. 팀장은 매 기상 맨 처음 이 스크립트를 한 번 부른다.\n'
  + USAGE + '\n'
  + '출력: LOCK_OK · {"n":…} · WATCH_FAILED · HOLDER_FAILED · LOCK_LOST … · LEASE_KEEP_DEAD … · COMPACT_REREAD …\n'
  + '늘 exit 0(사용법 오류만 2)\n';
const COMPACT_REREAD = 'COMPACT_REREAD 컨텍스트 압축 뒤 첫 기상이면 행동 전에 이것만 돌린다(Skill 도구 재호출 금지): sed -n \'/^\\*\\*참조\\*\\*/,/^## 두 번째 팀장/p;/^## 2\\. 기상과 감시/,/^## 4\\. 승인 스윕/p\' .claude/skills/dflow-team/SKILL.md';

function gitOut(args, cwd) {
  try {
    const r = spawnSync('git', args, { encoding: 'utf8', cwd, windowsHide: true });
    if (r.error || r.status !== 0) return null;
    return (r.stdout ?? '').trim();
  } catch { return null; }
}

// 팀장 세션 PID: --pid, 없으면 CLAUDE_PID, 없으면 이 스크립트를 부른 셸의 부모의 부모(ps), Git Bash 면 /proc
function leadPid(pidArg, env) {
  if (pidArg !== '') return pidArg;
  if (env.CLAUDE_PID) return env.CLAUDE_PID;
  let v = '';
  try {
    const r = spawnSync('ps', ['-o', 'ppid=', '-p', String(process.ppid)], { encoding: 'utf8', windowsHide: true });
    if (!r.error && r.status === 0) v = String(r.stdout ?? '').replace(/ /g, '').replace(/\n+$/, '');
  } catch { v = ''; }
  if (v !== '') return v;
  let lp = '';
  try { lp = String(fs.readFileSync(`/proc/${process.ppid}/ppid`, 'utf8')); } catch { lp = ''; }
  if (/^[0-9]+$/.test(lp) && lp !== '0' && lp !== '1') return lp;
  return '';
}

function dflowBin(env, cwd) {
  if (env.DFLOW_SH) return env.DFLOW_SH;
  return path.join(cwd, '.claude', 'skills', 'dflow-work', 'scripts', 'dflow.mjs');
}

function runDflow(bin, args) {
  try {
    const r = bin.endsWith('.mjs')
      ? spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', windowsHide: true })
      : spawnSync(bin, args, { encoding: 'utf8', windowsHide: true });
    if (r.error || r.status !== 0) return null;
    return String(r.stdout ?? '').replace(/\n+$/, '');
  } catch { return null; }
}

// 오피스 콘솔 폴러 기록·기동(없으면 건너뜀, 실패해도 기상은 그대로). 백그라운드로 떼어 놓는다.
function consolePollAsync(env, cwd, leadPidVal, owner, slots, busy, label) {
  const CP = path.join(HERE, '..', '..', 'coordinator', 'scripts', 'console-poll.mjs');
  try { if (!fs.statSync(CP).isFile()) return; } catch { return; }
  let repo = '';
  try {
    const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', cwd, windowsHide: true });
    if (!r.error && r.status === 0) repo = (r.stdout ?? '').trim();
  } catch { /* 무시 */ }
  const cenv = { ...process.env, CLAUDE_PID: leadPidVal };
  try {
    const c1 = spawn(process.execPath,
      [CP, 'handle-record', 'team', '--agent', owner, '--repo', repo, '--slots', slots, '--busy', busy, '--until-label', label],
      { env: cenv, cwd, stdio: 'ignore', detached: true, windowsHide: true });
    c1.unref();
    const c2 = spawn(process.execPath, [CP, 'start'], { env: cenv, cwd, stdio: 'ignore', detached: true, windowsHide: true });
    c2.unref();
  } catch { /* 무시 */ }
}

function watchSummary(wr, ps) {
  const w = JSON.parse(wr);
  const ok = String(ps).split('\n');
  const rr = w.resume_requests;
  const n = (rr === null || rr === undefined) ? 'NULL' : (Array.isArray(rr) ? rr.length : 'NULL');
  const err = (w.resume_requests_error === null || w.resume_requests_error === undefined) ? '-' : w.resume_requests_error;
  const list = Array.isArray(rr) ? rr : [];
  const reqs = [];
  const other = [];
  for (const q of list) {
    if (q !== null && typeof q === 'object' && !Array.isArray(q) && ok.includes(q.project_id)) {
      const o = { id8: q.id8, code: q.code, host: q.host, requested_at: q.requested_at };
      if (Object.prototype.hasOwnProperty.call(q, 'mine')) o.mine = q.mine;
      if (Object.prototype.hasOwnProperty.call(q, 'design_state')) o.design_state = q.design_state;
      reqs.push(o);
    } else if (q !== null && typeof q === 'object' && !Array.isArray(q)) {
      other.push(q.id8);
    }
  }
  const o = { n, err, reqs, other_project: other };
  if (Object.prototype.hasOwnProperty.call(w, 'build_ready')) {
    o.build = w.build_ready === null ? 'NULL'
      : (Array.isArray(w.build_ready) ? w.build_ready.map((b) => ({ id8: b.id8, code: b.code, status: b.status })) : 'NULL');
    o.build_err = (w.build_ready_error === null || w.build_ready_error === undefined) ? '-' : w.build_ready_error;
  }
  return JSON.stringify(o);
}

function main(argv, env = process.env, cwd = process.cwd()) {
  let OWNER = ''; let SLOTS = ''; let BUSY = ''; let LABEL = '';
  let PID_ARG = ''; let EVENTS = 1; let WP = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
    else if (a === '--owner' || a === '--slots' || a === '--busy' || a === '--until-label' || a === '--wp' || a === '--pid') {
      if (i + 1 >= argv.length) { process.stderr.write(USAGE + '\n'); return 2; }
      const v = argv[i + 1] ?? ''; i += 1;
      if (a === '--owner') OWNER = v;
      else if (a === '--slots') SLOTS = v;
      else if (a === '--busy') BUSY = v;
      else if (a === '--until-label') LABEL = v;
      else if (a === '--wp') WP = v;
      else PID_ARG = v;
    } else if (a === '--no-events') EVENTS = 0;
    else { process.stderr.write(USAGE + '\n'); return 2; }
  }
  if (OWNER === '' || SLOTS === '' || BUSY === '' || LABEL === '') { process.stderr.write(USAGE + '\n'); return 2; }
  if (WP === '-') WP = '';

  const DFLOW = dflowBin(env, cwd);
  const EVENTS_MD = path.join(HERE, '..', 'references', 'events.md');
  const LEAD_PID = leadPid(PID_ARG, env);

  const lockRel = gitOut(['rev-parse', '--git-path', 'dflow-team.lock'], cwd) ?? 'dflow-team.lock';
  const lockAbs = path.isAbsolute(lockRel) ? lockRel : path.join(cwd, lockRel);
  let firstLine = '';
  try { firstLine = String(fs.readFileSync(path.join(lockAbs, 'owner'), 'utf8').split('\n')[0] ?? ''); } catch { firstLine = ''; }
  const parts = firstLine.trim().split(/\s+/).filter((s, i, a) => !(i === 0 && s === '' && a.length > 1));
  const o_who = parts[0] ?? '';
  const o_ts = parts[1] ?? '';
  const o_pid = parts.slice(2).join(' ');

  if (o_who === OWNER && LEAD_PID !== '' && o_pid === LEAD_PID) {
    let beatOk = false;
    try {
      fs.mkdirSync(lockAbs, { recursive: true });
      fs.writeFileSync(path.join(lockAbs, 'beat'), `${Math.floor(Date.now() / 1000)}\n`, 'utf8');
      beatOk = true;
    } catch { beatOk = false; }
    if (!beatOk) {
      process.stdout.write('LOCK_LOST beat 쓰기 실패\n');
    } else {
      process.stdout.write('LOCK_OK\n');
      consolePollAsync(env, cwd, LEAD_PID, o_who, SLOTS, BUSY, LABEL);
      const h = runDflow(DFLOW, ['lease', 'holder']);
      if (h !== null && h !== '') {
        const wargs = ['watch', '--agent', o_who, '--slots', SLOTS, '--busy', BUSY, '--until', LABEL, '--json', '--holder', h, '--require-tag', 'agent'];
        if (WP !== '') wargs.push('--wp', WP);
        const wr = runDflow(DFLOW, wargs);
        const ps = runDflow(DFLOW, ['config', 'projects']);
        if (wr !== null && ps !== null) {
          try { process.stdout.write(watchSummary(wr, ps) + '\n'); }
          catch { process.stdout.write('WATCH_FAILED\n'); }
        } else process.stdout.write('WATCH_FAILED\n');
      } else {
        process.stdout.write('HOLDER_FAILED\n');
      }
    }
  } else {
    process.stdout.write(`LOCK_LOST owner=${o_who} ${o_ts} ${o_pid} 내 PID=${LEAD_PID}\n`);
  }

  const leaseRel = gitOut(['rev-parse', '--git-path', 'dflow-team.lease'], cwd) ?? 'dflow-team.lease';
  const leaseAbs = (path.isAbsolute(leaseRel) ? leaseRel : path.join(cwd, leaseRel)) + '.beat';
  let lb = '';
  try { lb = String(fs.readFileSync(leaseAbs, 'utf8')).replace(/\n+$/, ''); } catch { lb = ''; }
  if (lb === '') lb = '0';
  const now = Math.floor(Date.now() / 1000);
  const age = /^[0-9]+$/.test(lb) ? now - Number(lb) : now;
  if (!(age < 180)) process.stdout.write(`LEASE_KEEP_DEAD 마지막 갱신 ${lb}\n`);

  if (EVENTS === 1) {
    try {
      const t = fs.readFileSync(EVENTS_MD, 'utf8');
      const m = /^## 기록 명령/m.exec(t);
      if (m) process.stdout.write(t.slice(m.index));
    } catch { /* 없음 */ }
    process.stdout.write(COMPACT_REREAD + '\n');
  }
  return 0;
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

