// dflow-lease.mjs — 팀장 lease(wbs-web docs/superpowers/specs/2026-09-23-dflow-lead-lease-design.md §6).
// dflow.mjs 가 ctx(apiRaw·die·slug·hostShort·profileEmail·allowedProjects·tok·cacheDir)를 주입해 쓴다.
// 토큰은 ctx 를 통해서만 넘긴다.
// 사용법: dflow.mjs lease holder|acquire [--takeover]|renew|release|keep --pid <PID> --lost-file <path>. 종료 코드는 dflow.mjs usage 참조.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

function gitBin() { return process.env.DFLOW_GIT || 'git'; }

function gitOk(args) {
  const r = spawnSync(gitBin(), args, { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? (r.stdout ?? '') : null;
}

// POSIX cksum(1) 호환 CRC — 기존 sh 판이 만든 lease holder·캐시 파일명과 같은 값이 나와야 한다.
// 비반전 CRC-32(다항식 0x04C11DB7, 초기값 0, 최종 보수) + 길이를 little-endian 최소 바이트로 부가.
const CK_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n << 24;
    for (let k = 0; k < 8; k++) c = (c & 0x80000000) ? ((c << 1) ^ 0x04c11db7) : (c << 1);
    t[n] = c >>> 0;
  }
  return t;
})();

export function posixCksum(s) {
  const buf = Buffer.from(s, 'utf8');
  let crc = 0;
  const feed = (b) => { crc = ((crc << 8) ^ CK_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0; };
  for (const b of buf) feed(b);
  let n = buf.length;
  while (n > 0) { feed(n & 0xff); n = Math.floor(n / 256); }
  return String(~crc >>> 0);
}

// PC ID — hostname 은 겹칠 수 있어 쓰지 않는다. 처음 쓸 때 무작위로 만든다(uuid 형식).
function leaseMachineId() {
  const mf = process.env.DFLOW_MACHINE_ID_FILE || path.join(os.homedir(), '.dflow', 'machine-id');
  try {
    if (!fs.existsSync(mf) || fs.statSync(mf).size === 0) {
      const dir = path.dirname(mf);
      fs.mkdirSync(dir, { recursive: true });
      fs.chmodSync(dir, 0o700);
      const hex = crypto.randomBytes(16).toString('hex'); // 32칸
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      fs.writeFileSync(mf, id + '\n', { mode: 0o600 });
      fs.chmodSync(mf, 0o600);
    }
    return (fs.readFileSync(mf, 'utf8').split('\n')[0] || '').replace(/\r/g, '');
  } catch {
    return null;
  }
}

// holder = <PC ID>:<리포 경로 cksum>. 홈 경로를 서버에 보내지 않으려고 경로는 해시로만 싣는다.
export function leaseHolder() {
  const mid = leaseMachineId();
  if (!mid) return null;
  const top = gitOk(['rev-parse', '--show-toplevel']);
  if (top === null) return null;
  return `${mid}:${posixCksum(top.replace(/\n+$/, ''))}`; // 뒤의 줄바꿈만 떼고 공백은 보존 — cksum 입력이 종전과 같아야 한다
}

function leaseStateFile() {
  const out = gitOk(['rev-parse', '--path-format=absolute', '--git-path', 'dflow-team.lease']);
  return out === null ? null : out.trim();
}

// PID 생존 확인. node 의 process.kill(pid, 0) 은 윈도우에서도 존재 검사로 쓸 수 있어
// sh 판의 MSYS ps -W 폴백이 필요 없다. EPERM 은 존재하지만 권한이 없는 경우다.
function leasePidAlive(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

// 상태 파일 → [{project_id, generation}] — 깨진 줄의 generation 은 null(종전 jq tonumber 실패와 같다).
function leaseRefs(file) {
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map((l) => {
      const [project_id, g] = l.split(/\s+/);
      const gen = Number(g);
      return { project_id, generation: Number.isFinite(gen) ? gen : null };
    });
}

function writePrivate(file, text) {
  fs.writeFileSync(file, text, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function writeBeat(sf) {
  fs.writeFileSync(`${sf}.beat`, `${Math.floor(Date.now() / 1000)}\n`);
}

// ---- 무거운 작업 표시(wbs-web docs/superpowers/specs/2026-09-26-heavy-work-office-bubble-design.md §2)
// heavy snapshot 을 renew 의 heavy({pc, orders})로 바꾼다. 팀원 워크트리(.claude/worktrees/dflow-<id8>[-resolve]) 의 슬롯만 주문에 싣는다.
// 명령은 허용 목록으로 가린다(홈 경로·비밀 값을 서버에 보내지 않는다): 경로는 마지막 조각만, `a=b` 는 `a=***`, URL 은 `<url>`,
// 비밀 류 플래그(--token·-H·Bearer …) 바로 뒤 토큰은 `***`, 영숫자·`_.:+,-` 밖의 글자가 든 토큰은 `***`.
// 무엇이 실패해도 null 이다 — heavy 쪽 실패가 renew 를 실패시키면 lease_keep 이 3회 만에 팀장을 멈춘다.
// snapshot 분기가 없는 옛 heavy.sh 는 부르지 않는다 — 모르는 인자를 무거운 명령으로 보고 슬롯을 대기 상한(DFLOW_HEAVY_WAIT)만큼 기다린다.

const SECRET_FLAG = /^-{1,2}[A-Za-z0-9_-]*(token|secret|key|pass|pwd|auth|header|cookie|cred)[A-Za-z0-9_-]*$/i;
const SECRET_WORD = /^(-h|-u|bearer|basic)$/i;

function maskToken(t) {
  if (t.includes('://')) return '<url>';
  if (t.includes('=')) {
    const key = t.split('=')[0];
    return /^-{0,2}[A-Za-z_][A-Za-z0-9_.-]*$/.test(key) ? `${key}=***` : '***';
  }
  const last = t.split('/').pop().split('\\').pop();
  if (last === '') return null;
  return /^[A-Za-z0-9_.:+,-]+$/.test(last) ? last : '***';
}

function maskCmd(cmd) {
  let s = cmd.replace(/=("[^"]*"|'[^']*')/g, '=***').replace(/["'`]/g, ' ');
  const tokens = s.split(/\s+/).filter((t) => t !== '');
  const out = [];
  let hide = false;
  for (const t of tokens) {
    const v = hide ? '***' : maskToken(t);
    if (v !== null) out.push(v);
    hide = SECRET_FLAG.test(t) || SECRET_WORD.test(t);
  }
  return Array.from(out.join(' ')).slice(0, 190).join('');
}

const WT_RE = /^.*\/\.claude\/worktrees\/dflow-([0-9a-f]{8})(-resolve)?(\/|$)/;

function heavyNum(v) {
  if (v === null || v === undefined || v === '-') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function leaseHeavyJson() {
  // heavy.mjs(node 판, dn-heavy 레인)가 있으면 그것을, 아니면 종전 heavy.sh 를 쓴다.
  // DFLOW_HEAVY_SH 는 종전 env 이름을 유지한다(파일 확장자로 실행기를 가른다).
  let hv = process.env.DFLOW_HEAVY_SH || null;
  let runner = null;
  if (hv) {
    if (!fs.existsSync(hv)) return null;
    if (hv.endsWith('.mjs')) runner = 'node';
    else if (process.platform === 'win32') return null; // 윈도우에는 bash 가 없을 수 있다 — heavy.mjs 만 쓴다
    else runner = 'bash';
  } else {
    // 기본 후보: heavy.mjs(node) 우선, 없으면 heavy.sh(bash). 윈도우는 heavy.mjs 만 본다.
    const mjs = path.join(SCRIPTS_DIR, '..', '..', 'dflow-dev', 'scripts', 'heavy.mjs');
    const sh = path.join(SCRIPTS_DIR, '..', '..', 'dflow-dev', 'scripts', 'heavy.sh');
    if (fs.existsSync(mjs)) { hv = mjs; runner = 'node'; }
    else if (process.platform !== 'win32' && fs.existsSync(sh)) { hv = sh; runner = 'bash'; }
    else return null;
  }
  try {
    if (runner === 'bash' && !/snapshot\)/.test(fs.readFileSync(hv, 'utf8'))) return null; // 옛 heavy.sh — 부르지 않는다
    const snap = spawnSync(runner === 'node' ? process.execPath : 'bash', [hv, 'snapshot'],
      { encoding: 'utf8', windowsHide: true });
    if (snap.status !== 0) return null;
    const rows = (snap.stdout ?? '').split('\n').filter((l) => l !== '').map((l) => l.split('\t'));
    const pcRow = rows.find((r) => r[0] === 'PC');
    if (!pcRow) return null;
    const ws = rows.filter((r) => r[0] === 'WAIT' && r[2] === 'general').map((r) => heavyNum(r[1])).filter((n) => n !== null);
    let orders = [];
    for (const r of rows) {
      if (r[0] === 'RUN') orders.push({ state: 'run', since: heavyNum(r[1]), kind: r[2], pool: r[3], cwd: r[4], cmd: r[5] });
      else if (r[0] === 'WAIT') orders.push({ state: 'wait', since: heavyNum(r[1]), kind: 'run', pool: r[2], cwd: r[3], cmd: r[4] });
    }
    const matched = [];
    for (const o of orders) {
      const m = (o.cwd ?? '').match(WT_RE);
      if (!m) continue;
      const pos = o.state === 'wait' && o.pool === 'general' && o.since !== null
        ? ws.filter((w) => w < o.since).length + 1 : null;
      matched.push({ state: o.state, since: o.since, kind: o.kind, pool: o.pool, cmd: maskCmd(o.cmd ?? ''), id8: m[1], pos });
    }
    const groups = new Map();
    for (const o of matched) {
      if (!groups.has(o.id8)) groups.set(o.id8, []);
      groups.get(o.id8).push(o);
    }
    const grouped = [...groups.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, g]) => {
        const sorted = [...g].sort((a, b) => ((a.state === 'run' ? 0 : 1) - (b.state === 'run' ? 0 : 1)) || ((a.since ?? 0) - (b.since ?? 0)));
        return { ...sorted[0], n: g.length };
      })
      .slice(0, 50);
    return {
      pc: { k: heavyNum(pcRow[1]), held: heavyNum(pcRow[2]), waiting: heavyNum(pcRow[3]), load: heavyNum(pcRow[4]), cpus: heavyNum(pcRow[5]) },
      orders: grouped,
    };
  } catch {
    return null;
  }
}

// ---- 동사 ------------------------------------------------------------------
// 공통: 실패는 ctx.die(사유 stderr + 프로세스 종료). apiRaw 는 {rc, body, err} 를 돌려준다.

async function leaseAcquire(argv, ctx) {
  let takeover = false;
  if (argv[0] === '--takeover') takeover = true;
  else if (argv.length > 0) ctx.usage();
  const allowed = ctx.allowedProjects();
  if (!allowed) ctx.die(2, 'NO_PROJECT .dflow 의 project_id 또는 .dflow.local 의 project_map 을 넣어라');
  const h = leaseHolder() || ctx.die(6, 'LEASE_HOLDER PC ID 나 리포 경로를 정하지 못했다');
  const sf = leaseStateFile() || ctx.die(2, 'LEASE_STATE git 리포 안에서 실행하라');
  const em = await ctx.profileEmail(ctx.tok()) || ctx.die(3, '신원 확인 실패(/me)');
  const hs = ctx.slug(ctx.hostShort());
  const json = JSON.stringify({
    op: 'acquire',
    projects: allowed.split('\n').filter((p) => p !== ''),
    holder: h,
    host: hs,
    agent: `${ctx.slug(em.split('@')[0])}/${hs}/lead`,
    takeover,
  });
  fs.mkdirSync(ctx.cacheDir, { recursive: true });
  const r = await ctx.apiRaw({ token: ctx.tok(), method: 'POST', p: '/api/v1/agent/lead/lease', body: json });
  if (r.rc === 4) {
    let held = null;
    try { held = JSON.parse(r.body); } catch { /* 본문이 JSON이 아니면 아래 공통 실패 경로로 */ }
    if (held && held.code === 'lead_lease_held') {
      for (const l of held.held ?? []) {
        console.log(`LEAD_LEASE_HELD ${l.project_id} ${l.host ?? '-'} ${l.agent ?? '-'} ${l.expires_at ?? '-'}`);
      }
      process.exit(4);
    }
  }
  if (r.rc !== 0) { process.stderr.write(r.err); process.exit(r.rc); }
  let body;
  try { body = JSON.parse(r.body); } catch { ctx.die(6, 'LEASE_STATE lease 응답을 해석하지 못했다'); }
  const leases = body?.leases ?? [];
  try {
    writePrivate(sf, leases.map((l) => `${l.project_id} ${l.generation}`).join('\n') + (leases.length ? '\n' : ''));
    writeBeat(sf); // 첫 기상의 LEASE_KEEP_DEAD 오경보를 막는다(keep 이 첫 갱신을 하기 전)
  } catch { ctx.die(6, 'LEASE_STATE 상태 파일을 쓰지 못했다'); }
  console.log(`LEASE_OK ${leases.length}`);
}

// keep 이 쓰는 갱신 본체 — 프로세스를 끝내지 않고 {rc, out, err} 를 돌려준다(keep 은 rc 를 실패 카운터에 흡수한다).
async function leaseRenewCore(ctx) {
  const sf = leaseStateFile();
  if (sf === null) return { rc: 2, out: '', err: 'LEASE_STATE git 리포 안에서 실행하라\n' };
  if (!fs.existsSync(sf) || fs.statSync(sf).size === 0) return { rc: 2, out: 'LEASE_NONE\n', err: '' };
  const h = leaseHolder();
  if (!h) return { rc: 6, out: '', err: 'LEASE_HOLDER PC ID 나 리포 경로를 정하지 못했다\n' };
  const heavy = leaseHeavyJson();
  let json = { op: 'renew', holder: h, leases: leaseRefs(sf) };
  if (heavy) json = { ...json, heavy };
  const r = await ctx.apiRaw({ token: ctx.tok(), method: 'POST', p: '/api/v1/agent/lead/lease', body: JSON.stringify(json) });
  if (r.rc !== 0) return { rc: r.rc, out: '', err: r.err };
  let body;
  try { body = JSON.parse(r.body); } catch { return { rc: 6, out: '', err: '' }; }
  const lost = (body?.lost ?? []).join(' ');
  if (lost !== '') return { rc: 4, out: `LEASE_LOST ${lost}\n`, err: '' };
  writeBeat(sf);
  return { rc: 0, out: 'LEASE_OK\n', err: '' };
}

async function leaseRenew(ctx) {
  const r = await leaseRenewCore(ctx);
  if (r.out) process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  if (r.rc !== 0) process.exit(r.rc);
}

// keep·trap 이 조용히 부르는 반납. 프로세스를 끝내지 않고 {rc, out, err} 를 돌려준다.
async function leaseReleaseCore(ctx) {
  const sf = leaseStateFile();
  if (sf === null) return { rc: 2, out: '', err: 'LEASE_STATE git 리포 안에서 실행하라\n' };
  if (!fs.existsSync(sf) || fs.statSync(sf).size === 0) {
    try { fs.rmSync(sf, { force: true }); fs.rmSync(`${sf}.beat`, { force: true }); } catch { /* 이미 없음 */ }
    return { rc: 0, out: 'LEASE_NONE\n', err: '' };
  }
  const h = leaseHolder();
  if (!h) return { rc: 6, out: '', err: 'LEASE_HOLDER PC ID 나 리포 경로를 정하지 못했다\n' };
  const json = JSON.stringify({ op: 'release', holder: h, leases: leaseRefs(sf) });
  const r = await ctx.apiRaw({ token: ctx.tok(), method: 'POST', p: '/api/v1/agent/lead/lease', body: json });
  if (r.rc !== 0) return { rc: r.rc, out: '', err: r.err };
  try { fs.rmSync(sf, { force: true }); fs.rmSync(`${sf}.beat`, { force: true }); } catch { /* 이미 없음 */ }
  let released = '';
  try { released = String(JSON.parse(r.body)?.released ?? ''); } catch { /* 본문 해석 실패는 빈 값 */ }
  return { rc: 0, out: `LEASE_RELEASED ${released}\n`, err: '' };
}

async function leaseRelease(ctx) {
  const r = await leaseReleaseCore(ctx);
  if (r.out) process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  if (r.rc !== 0) process.exit(r.rc);
}

// 팀장 PID 에 묶인 갱신 루프. 백그라운드로 띄운다.
async function leaseKeep(argv, ctx) {
  let pid = '';
  let lf = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pid' && argv[i + 1] !== undefined) { pid = argv[++i]; }
    else if (argv[i] === '--lost-file' && argv[i + 1] !== undefined) { lf = argv[++i]; }
    else ctx.usage();
  }
  if (pid === '' || lf === '') ctx.usage();
  const ivRaw = Number(process.env.DFLOW_LEASE_INTERVAL || 60);
  const stRaw = Number(process.env.DFLOW_LEASE_STEP || 5);
  const iv = Number.isFinite(ivRaw) && ivRaw > 0 ? ivRaw : 60; // 유한 양수가 아니면 기본값
  const st = Number.isFinite(stRaw) && stRaw > 0 ? stRaw : 5;
  const sf = leaseStateFile() || ctx.die(2, 'LEASE_STATE git 리포 안에서 실행하라');
  // 세션이 끝나며 백그라운드 태스크를 신호로 거두면 kill -0 분기에 닿지 못한다. 그때도 바로 반납한다.
  let signaled = false;
  const onSignal = () => { signaled = true; };
  process.on('SIGTERM', onSignal);
  process.on('SIGHUP', onSignal);
  process.on('SIGINT', onSignal);
  let fails = 0;
  for (;;) {
    if (signaled) { await leaseReleaseCore(ctx).catch(() => {}); process.exit(0); }
    // 팀장이 죽었으면 바로 반납한다 — TTL 을 기다리면 같은 신원이 다른 곳에서 3분간 시작하지 못한다.
    if (!leasePidAlive(pid)) { await leaseReleaseCore(ctx).catch(() => {}); process.exit(0); }
    // 정상 마감이 release 로 상태 파일을 지웠다.
    if (!fs.existsSync(sf) || fs.statSync(sf).size === 0) process.exit(0);
    const r = await leaseRenewCore(ctx).catch((e) => ({ rc: 6, out: '', err: `${e.message ?? e}\n` }));
    if (r.rc === 0) {
      fails = 0;
    } else if (r.rc === 4) {
      fs.writeFileSync(lf, r.out || 'LEASE_LOST rc=4\n');
      process.exit(4);
    } else {
      if (!fs.existsSync(sf) || fs.statSync(sf).size === 0) process.exit(0);
      fails += 1;
      // 3분 넘게 서버에 닿지 못하면 이미 만료돼 다른 곳이 가져갔을 수 있다. 소유를 장담할 수 없으니 잃은 것으로 다룬다.
      if (fails >= 3) {
        fs.writeFileSync(lf, `LEASE_UNREACHABLE rc=${r.rc}\n`);
        process.exit(6);
      }
    }
    let t = 0;
    while (t < iv) {
      await new Promise((res) => setTimeout(res, st * 1000));
      t += st;
      if (signaled || !leasePidAlive(pid)) break;
      if (!fs.existsSync(sf) || fs.statSync(sf).size === 0) break;
    }
  }
}

export async function cmdLease(argv, ctx) {
  const sub = argv[0] ?? '';
  const rest = argv.slice(1);
  switch (sub) {
    case 'holder': {
      const h = leaseHolder();
      if (!h) ctx.die(6, 'LEASE_HOLDER PC ID 나 리포 경로를 정하지 못했다');
      console.log(h);
      break;
    }
    case 'acquire': await leaseAcquire(rest, ctx); break;
    case 'renew': await leaseRenew(ctx); break;
    case 'release': await leaseRelease(ctx); break;
    case 'keep': await leaseKeep(rest, ctx); break;
    default: ctx.usage();
  }
}
