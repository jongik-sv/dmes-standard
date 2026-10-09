#!/usr/bin/env node
// /dflow-team 감시 루프. 팀장은 팀장 체크아웃 루트에서 부른다. (옛 tick.sh 를 node 로 옮긴 것.)
// 사용: tick.mjs [--new-tick] [--may-skip] [--until '<UNTIL>'] [--wp '<WP 범위>'] --tm '<TM 또는 빈 값>' \
//               --owner '<신원>/<host>/lead' --slots <N> --until-label '<UNTIL_LABEL>' [--pid <LEAD_PID>] \
//               -- ['<워크트리>/<TASKS>/<TSK>/.result|<해시 또는 ->|<pane id 또는 ->' …]
//       tick.mjs --retire      세대만 올려 떠 있는 루프를 STALE 로 끝낸다
// 마지막 줄이 기상 사유다: STALE · STOP_REQUESTED · LEASE_LOST … · RESULT_READY … · PANE_DEAD … · TICK
// 종료 코드: 0 · 2(사용 오류).
// node 18.17 이상, 외부 패키지 없음.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = "사용: tick.mjs [--new-tick] [--may-skip] [--until <UNTIL>] [--wp <WP 범위>] --tm <TM> --owner <신원>/<host>/lead --slots <N> --until-label <표시> [--pid <PID>] -- [<경로|해시|pane> …]";
const HELP = '/dflow-team 감시 루프. 팀장은 팀장 체크아웃 루트에서 부른다.\n'
  + USAGE + '\n'
  + '마지막 줄이 기상 사유: STALE · STOP_REQUESTED · LEASE_LOST … · RESULT_READY … · PANE_DEAD … · TICK\n'
  + '종료 코드: 0 · 2(사용 오류)\n';

const nowSec = () => Math.floor(Date.now() / 1000);
const isUInt = (s) => /^[0-9]+$/.test(s ?? '');

function gitOut(args, cwd) {
  try {
    const r = spawnSync('git', args, { encoding: 'utf8', cwd, windowsHide: true });
    if (r.error || r.status !== 0) return null;
    return (r.stdout ?? '').trim();
  } catch { return null; }
}

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

// POSIX cksum 값(첫 칸). cksum 명령이 있으면 쓰고, 없으면(윈도우) 직접 계산한다.
function posixCksum(buf) {
  const P = 0x04C11DB7;
  let crc = 0;
  for (const b of buf) {
    crc ^= (b << 24) >>> 0;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x80000000) ? (((crc << 1) ^ P) >>> 0) : ((crc << 1) >>> 0);
    }
  }
  let len = buf.length;
  while (len > 0) {
    crc ^= ((len & 0xff) << 24) >>> 0;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x80000000) ? (((crc << 1) ^ P) >>> 0) : ((crc << 1) >>> 0);
    }
    len = Math.floor(len / 256);
  }
  return String((~crc) >>> 0);
}

function cksumFirst(buf) {
  try {
    const r = spawnSync('cksum', [], { input: Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)), windowsHide: true });
    if (!r.error && r.status === 0) {
      const m = /^(\S+)/.exec((r.stdout ?? '').toString('utf8'));
      if (m) return m[1];
    }
  } catch { /* 없음 */ }
  return posixCksum(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)));
}

// 슬롯 항목 '<경로|해시|pane>' 나누기. bash ${} 확장과 같은 규칙(| 가 없으면 전체가 rest 다).
function splitSlot(s) {
  const i = s.indexOf('|');
  const f = i < 0 ? s : s.slice(0, i);
  const rest = i < 0 ? s : s.slice(i + 1);
  const j = rest.indexOf('|');
  const prev = j < 0 ? rest : rest.slice(0, j);
  const pane = j < 0 ? rest : rest.slice(j + 1);
  return { f, prev, pane };
}

function slotRoot(p) {
  const m = /^(\/.*\/dflow-[0-9a-f]{8}(-resolve)?)\//.exec(p);
  return m ? m[1] : '';
}

function slotId8(p) {
  const m = /\/dflow-([0-9a-f]{8})(-resolve)?\//.exec(p);
  return m ? m[1] : '';
}

// 종료 시각(epoch) 해석. BSD date -j 형식(엄격) 먼저, 없으면 Date 로 유연하게. 못 읽으면 null.
function parseUntilEpoch(until) {
  let u = until;
  if (u.length === 5 && u[2] === ':') {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    u = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${u}`;
  }
  const ex = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(`${u}:00`);
  if (ex) {
    const dt = new Date(Number(ex[1]), Number(ex[2]) - 1, Number(ex[3]), Number(ex[4]), Number(ex[5]), Number(ex[6]));
    if (dt.getFullYear() === Number(ex[1]) && dt.getMonth() === Number(ex[2]) - 1 && dt.getDate() === Number(ex[3])
      && dt.getHours() === Number(ex[4]) && dt.getMinutes() === Number(ex[5]) && dt.getSeconds() === Number(ex[6])) {
      return Math.floor(dt.getTime() / 1000);
    }
  }
  let t = Date.parse(u);
  if (Number.isNaN(t)) {
    const alt = u.replace(' ', 'T');
    if (alt !== u) t = Date.parse(alt);
  }
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

async function main(argv, env = process.env, cwd = process.cwd()) {
  let NEW_TICK = false; let MAY_SKIP = false;
  let UNTIL = ''; let WP = ''; let TM = ''; let TM_SET = false;
  let OWNER = ''; let SLOTS = ''; let LABEL = ''; let PID_ARG = ''; let RETIRE = false;
  const slots = [];
  let i = 0;
  let dashdash = false;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (dashdash) { slots.push(a); continue; }
    if (a === '--retire') RETIRE = true;
    else if (a === '--new-tick') NEW_TICK = true;
    else if (a === '--may-skip') MAY_SKIP = true;
    else if (a === '--until' || a === '--wp' || a === '--tm' || a === '--owner' || a === '--slots' || a === '--until-label' || a === '--pid') {
      if (i + 1 >= argv.length) { process.stderr.write(USAGE + '\n'); return 2; }
      const v = argv[i + 1] ?? ''; i += 1;
      if (a === '--until') UNTIL = v;
      else if (a === '--wp') WP = v;
      else if (a === '--tm') { TM = v; TM_SET = true; }
      else if (a === '--owner') OWNER = v;
      else if (a === '--slots') SLOTS = v;
      else if (a === '--until-label') LABEL = v;
      else PID_ARG = v;
    } else if (a === '--') dashdash = true;
    else if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
    else { process.stderr.write(USAGE + '\n'); return 2; }
  }
  if (!RETIRE && !(TM_SET && OWNER !== '' && SLOTS !== '' && LABEL !== '')) {
    process.stderr.write(USAGE + '\n');
    return 2;
  }

  const DFLOW = env.DFLOW_SH ?? path.join(cwd, '.claude', 'skills', 'dflow-work', 'scripts', 'dflow.mjs');
  const SWEEP = env.DFLOW_SWEEP_CHECK ?? path.join(HERE, '..', '..', 'dflow-merge', 'scripts', 'sweep-check.mjs');
  const WAKE = path.join(HERE, 'wake.mjs');
  const LEADSTATE = path.join(HERE, 'lead-state.mjs');
  const INTERVAL = Number(env.DFLOW_TICK_SEC ?? '1800');
  const POLL = Number(env.DFLOW_TICK_POLL ?? '20');
  const LEAD_PID = leadPid(PID_ARG, env);

  const GEN_FILE = gitOut(['rev-parse', '--path-format=absolute', '--git-path', 'dflow-team.gen'], cwd);
  if (GEN_FILE === null) { process.stderr.write('FAIL NOT_GIT\n'); return 2; }
  const STOP_FILE = gitOut(['rev-parse', '--path-format=absolute', '--git-path', 'dflow-team.stop'], cwd) ?? 'dflow-team.stop';
  const LEASE_FILE = gitOut(['rev-parse', '--path-format=absolute', '--git-path', 'dflow-team.lease-lost'], cwd) ?? 'dflow-team.lease-lost';

  const runDflow = (args) => {
    try {
      const r = DFLOW.endsWith('.mjs')
        ? spawnSync(process.execPath, [DFLOW, ...args], { encoding: 'utf8', windowsHide: true })
        : spawnSync(DFLOW, args, { encoding: 'utf8', windowsHide: true });
      if (r.error || r.status !== 0) return null;
      return String(r.stdout ?? '').replace(/\n+$/, '');
    } catch { return null; }
  };
  const runNode = (script, args) => {
    try {
      const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', windowsHide: true });
      if (r.error || r.status !== 0) return null;
      return String(r.stdout ?? '').replace(/\n+$/, '');
    } catch { return null; }
  };
  const gitIn = (dir, args) => {
    try {
      const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', windowsHide: true });
      if (r.error || r.status !== 0) return null;
      return r.stdout ?? '';
    } catch { return null; }
  };

  let oldGen = ''; let oldTick = ''; let oldSkip = '';
  try {
    const parts = String(fs.readFileSync(GEN_FILE, 'utf8').split('\n')[0] ?? '').trim().split(/\s+/);
    oldGen = parts[0] ?? ''; oldTick = parts[1] ?? ''; oldSkip = parts.slice(2).join(' ');
  } catch { /* 없음 */ }
  if (!isUInt(oldGen)) oldGen = '0';
  const MY_GEN = String(Number(oldGen) + 1);
  if (!isUInt(oldTick)) NEW_TICK = true;
  if (!isUInt(oldSkip)) oldSkip = '0';
  if (RETIRE) {
    try { fs.writeFileSync(GEN_FILE, `${MY_GEN} ${oldTick === '' ? '0' : oldTick} ${oldSkip}\n`, 'utf8'); }
    catch { /* 무시 */ }
    process.stdout.write(`GEN_RETIRED gen=${MY_GEN}\n`);
    return 0;
  }
  let TICK_AT; let SKIPPED;
  if (NEW_TICK) { TICK_AT = nowSec() + (Number.isFinite(INTERVAL) ? INTERVAL : 1800); SKIPPED = 0; }
  else { TICK_AT = Number(oldTick); SKIPPED = Number(oldSkip); }
  try { fs.writeFileSync(GEN_FILE, `${MY_GEN} ${TICK_AT} ${SKIPPED}\n`, 'utf8'); } catch { /* 무시 */ }

  let UNTIL_E = ''; let UNTIL_BAD = false;
  if (UNTIL !== '' && UNTIL !== 'none') {
    const e = parseUntilEpoch(UNTIL);
    if (e === null) UNTIL_BAD = true;
    else UNTIL_E = e;
  }

  // 한 슬롯의 증거 한 줄(재지 못하면 null)
  const evidence = (fp) => {
    const w = slotRoot(fp); const id = slotId8(fp);
    if (w === '' || id === '') return null;
    try { if (!fs.statSync(w).isDirectory()) return null; } catch { return null; }
    const lg = gitIn(w, ['log', '-1', '--format=%ct']);
    const e1 = lg === null ? '' : lg.replace(/\n+$/, '');
    const show = runDflow(['show', id]);
    if (show === null) return null;
    let j;
    try { j = JSON.parse(show); } catch { return null; }
    const order = (j !== null && typeof j === 'object' && !Array.isArray(j) && j.order !== null && typeof j.order === 'object' && !Array.isArray(j.order)) ? j.order : {};
    if ((order.id ?? '') === '') return null;
    const reports = Array.isArray(j.reports) ? j.reports : [];
    const lr = reports.length ? reports[reports.length - 1] : {};
    const mid = `report=${(lr !== null && typeof lr === 'object' ? lr.created_at : null) ?? '-'} heartbeat=${order.last_heartbeat_at ?? '-'} phase=${order.heartbeat_phase ?? '-'}`;
    const st = gitIn(w, ['status', '--porcelain']);
    const e3 = cksumFirst(Buffer.from(st ?? '', 'utf8'));
    return `${id} ct=${e1 === '' ? '-' : e1} ${mid} dirty=${e3} status=${order.status ?? '-'}`;
  };

  // 진행 중(결과 줄이 blocked 가 아닌) 슬롯인가
  const active = (fp) => {
    let first;
    try { first = String(fs.readFileSync(fp, 'utf8').split('\n')[0] ?? ''); } catch { return true; }
    return (first.split(' ')[5] ?? '') !== 'blocked';
  };

  // 승인 후보와 그 서버 status. 판정하지 못하면 'UNKNOWN'
  const approvals = () => {
    try { fs.accessSync(SWEEP, fs.constants.X_OK); } catch { return 'UNKNOWN'; }
    let out;
    try {
      const r = SWEEP.endsWith('.mjs')
        ? spawnSync(process.execPath, [SWEEP], { encoding: 'utf8', windowsHide: true })
        : spawnSync(SWEEP, [], { encoding: 'utf8', windowsHide: true });
      if (r.error || r.status !== 0) return 'UNKNOWN';
      out = r.stdout ?? '';
    } catch { return 'UNKNOWN'; }
    const rawLines = String(out).split('\n');
    if (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop();
    const keep = rawLines.filter((l) => l.startsWith('SWEEP_DIALECT_PENDING'));
    const last = rawLines.length ? rawLines[rawLines.length - 1] : '';
    if (last === 'SWEEP_NONE') return [...keep, 'NONE'].join('\n');
    if (last.startsWith('SWEEP_CANDIDATES ')) {
      const ids = last.split(/\s+/).slice(2).filter((x) => x !== '');
      const rows = [];
      for (const id of ids) {
        const s = runDflow(['show', id]);
        if (s === null) return 'UNKNOWN';
        let st = '';
        try {
          const j = JSON.parse(s);
          st = (j !== null && typeof j === 'object' && !Array.isArray(j) && j.order !== null && typeof j.order === 'object') ? (j.order.status ?? '') : '';
        } catch { return 'UNKNOWN'; }
        if (st === '') return 'UNKNOWN';
        rows.push(`${id} ${st}`);
      }
      return [...keep, ...rows].join('\n');
    }
    return 'UNKNOWN';
  };

  let BASE_EV = ''; let BASE_AP = '';
  if (MAY_SKIP) {
    const rows = [];
    for (const s of slots) {
      const { f } = splitSlot(s);
      if (!active(f)) continue;
      rows.push(evidence(f) ?? `UNMEASURED ${f}`);
    }
    BASE_EV = rows.join('\n');
    BASE_AP = approvals();
  }

  const maySkipNow = () => {
    if (!MAY_SKIP) return null;
    if (!(SKIPPED < 1)) return null;
    if (UNTIL_BAD) return null;
    if (UNTIL_E !== '' && !(nowSec() < UNTIL_E)) return null;
    let ev = '';
    for (const s of slots) {
      const { f } = splitSlot(s);
      if (!active(f)) continue;
      const nowEv = evidence(f);
      if (nowEv === null) return null;
      const id = nowEv.split(' ')[0];
      const prev = BASE_EV.split('\n').find((l) => l.startsWith(`${id} `));
      if (!prev) return null;
      const prevStatus = prev.split('status=').pop();
      const nowStatus = nowEv.split('status=').pop();
      if (prevStatus !== nowStatus) return null;
      if (prev.split(' status=')[0] === nowEv.split(' status=')[0]) return null;
      ev += `EVIDENCE ${nowEv}\n`;
    }
    if (BASE_AP.includes('UNKNOWN')) return null;
    if (approvals() !== BASE_AP) return null;
    const wargs = ['--owner', OWNER, '--slots', SLOTS, '--busy', String(slots.length), '--until-label', LABEL, '--pid', LEAD_PID, '--no-events'];
    if (WP !== '') wargs.push('--wp', WP);
    // --wp 는 wake 의 끝 옵션이라 뒤에 둬도 된다(원본 ${WP:+--wp "$WP"} 자리와 같다)
    let wk = '';
    try {
      const r = spawnSync(process.execPath, [WAKE, ...wargs], { encoding: 'utf8', windowsHide: true });
      if (!r.error && r.status === 0) wk = r.stdout ?? '';
    } catch { wk = ''; }
    const wkLines = wk.split('\n');
    if (!wkLines.includes('LOCK_OK')) return null;
    if (wkLines.some((l) => /^(LOCK_LOST|WATCH_FAILED|HOLDER_FAILED|LEASE_KEEP_DEAD)/.test(l))) return null;
    const j = wkLines.find((l) => l.startsWith('{'));
    if (!j) return null;
    let jo;
    try { jo = JSON.parse(j); } catch { return null; }
    if (!(jo.n !== 'NULL' && (jo.reqs ?? []).length === 0 && jo.build !== 'NULL')) return null;
    const b = jo.build ?? [];
    const cl = Array.isArray(b) ? b.filter((x) => x !== null && typeof x === 'object' && x.status === 'claimed').map((x) => x.id8) : [];
    if (cl.length === 0) return { ev };
    const lst = runNode(LEADSTATE, ['--agent', OWNER]);
    if (lst === null) return null;
    let ign = ',' + lst.split('\n')
      .filter((l) => l.startsWith('EXCLUDE_PERM ') || l.startsWith('EXCLUDE_TEMP '))
      .map((l) => (l.split(/\s+/)[1] ?? '')).join(',') + ',';
    for (const s of slots) ign += `${slotId8(splitSlot(s).f)},`;
    for (const l of lst.split('\n')) {
      if (l.startsWith('RETRY_DUE ') || l.startsWith('BUILD_RETRY_DUE ')) {
        const rd = l.split(/\s+/)[1] ?? '';
        if (rd !== '') ign = ign.split(`,${rd},`).join(',');
      }
    }
    for (const id of cl) {
      if (!ign.includes(`,${id},`)) return null;
    }
    return { ev };
  };

  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const pollMs = Number.isFinite(POLL) && POLL > 0 ? POLL * 1000 : 20000;

  for (;;) {
    let gen1 = '';
    try { gen1 = String(fs.readFileSync(GEN_FILE, 'utf8').split('\n')[0] ?? '').trim().split(/\s+/)[0] ?? ''; } catch { gen1 = ''; }
    if (gen1 !== MY_GEN) { process.stdout.write('STALE\n'); return 0; }
    if (fs.existsSync(STOP_FILE)) { process.stdout.write('STOP_REQUESTED\n'); return 0; }
    if (fs.existsSync(LEASE_FILE)) {
      let lr = '';
      try { lr = String(fs.readFileSync(LEASE_FILE, 'utf8').split('\n')[0] ?? ''); } catch { lr = ''; }
      process.stdout.write(`LEASE_LOST ${lr}\n`);
      return 0;
    }
    let hit = ''; let dead = '';
    for (const s of slots) {
      const { f, prev, pane } = splitSlot(s);
      try {
        if (fs.statSync(f).isFile()) {
          const cur = String(fs.readFileSync(f, 'utf8').split('\n')[0] ?? '');
          if (cksumFirst(Buffer.from(cur + '\n', 'utf8')) !== prev) hit += ` ${f}`;
        }
      } catch { /* 없음 */ }
      if (pane !== '-' && TM !== '') {
        let d = '';
        try {
          const r = spawnSync(TM, ['-L', 'dflow', 'list-panes', '-t', pane, '-F', '#{pane_dead}'], { encoding: 'utf8', windowsHide: true });
          if (!r.error && r.status === 0) d = String(r.stdout ?? '').split('\n')[0] ?? '';
        } catch { d = ''; }
        if (d !== '0') dead += ` ${f}`;
      }
    }
    if (hit !== '') { process.stdout.write(`RESULT_READY${hit}\n`); return 0; }
    if (dead !== '') { process.stdout.write(`PANE_DEAD${dead}\n`); return 0; }
    if (nowSec() >= TICK_AT) {
      const sk = maySkipNow();
      if (sk === null) { process.stdout.write('TICK\n'); return 0; }
      let gen2 = '';
      try { gen2 = String(fs.readFileSync(GEN_FILE, 'utf8').split('\n')[0] ?? '').trim().split(/\s+/)[0] ?? ''; } catch { gen2 = ''; }
      if (gen2 !== MY_GEN) { process.stdout.write('STALE\n'); return 0; }
      SKIPPED += 1;
      const at = nowSec();
      TICK_AT += (Number.isFinite(INTERVAL) ? INTERVAL : 1800);
      if (!(TICK_AT > at)) TICK_AT = at + (Number.isFinite(INTERVAL) ? INTERVAL : 1800);
      try { fs.writeFileSync(GEN_FILE, `${MY_GEN} ${TICK_AT} ${SKIPPED}\n`, 'utf8'); } catch { /* 무시 */ }
      process.stdout.write(`TICK_SKIPPED at=${at} next=${TICK_AT}\n`);
      if (sk.ev !== '') process.stdout.write(sk.ev);
    }
    await sleep(pollMs);
  }
}

function isMainEntry() {
  try {
    if (!process.argv[1]) return false;
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch { return false; }
}
if (isMainEntry()) {
  Promise.resolve()
    .then(() => main(process.argv.slice(2), process.env, process.cwd()))
    .then((rc) => { process.exitCode = rc ?? 0; })
    .catch((e) => {
      try { process.stderr.write(`내부 오류: ${(e && e.stack) || e}\n`); } catch { /* 무시 */ }
      process.exitCode = 70;
    });
}

