// pool.mjs — 조정자 스크립트(node). 비-Claude 워커 풀(opencode·GLM) 묶음 제출·상태·취소·실행(설계 2026-10-10 §4).
//   사용법: pool.mjs submit --lane <L> --id <id> --size <S|M> --packet <파일> [--cwd <폴더>] [--kind auto|opencode|glm] [--dry-run]
//           pool.mjs status [--lane <L>] [--id <id>] · pool.mjs cancel <id> · pool.mjs note <id> [--findings n] [--lines n]
//   stdout: POOL started|queued|fallback|refused|cancelled|noted … · POOL <id> <state> kind= lane= result= rc= · POOL slots …
//   submit 의 id = <레인>-<항목번호>. --id 에 <레인>- 접두가 없으면 붙인다(레인끼리 항목번호가 겹쳐 duplicate 가 나지 않게).
//   실행기 = `pool.mjs run <id>` 를 분리된 자식으로 띄운다(토큰을 쓰지 않음). 끝나면 다음 큐 묶음을 띄운다.
// node 18.17 이상, 외부 패키지 없음.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoordDie, Ctx, cfgAll, hasRun, laneGet, lock, runDir, stateFile, unlock } from './lib/common.mjs';
import { runScript, stripNl } from './lib/common-ext.mjs';
import { killTree, pidAlive } from './lib/compat.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';
import { appendLog, classify, coolAfterRatelimit, fillArgs, hasAnyWorker, ID_RE, logEntry, pickKind, promptFor, readCool, readItem, readItems, reapStale, writeCool, writeItem } from './lib/pool-core.mjs';

const SELF = fileURLToPath(import.meta.url);
const HELP = `# 사용법: pool.mjs submit --lane <L> --id <id> --size <S|M> --packet <파일> [--cwd <폴더>] [--kind auto|opencode|glm] [--dry-run]
#         pool.mjs status [--lane <L>] [--id <id>] · cancel <id> · note <id> [--findings n] [--lines n]
#   비-Claude 워커 풀. 묶음 파일을 <작업 폴더>/.pool/<id>.md 로 복사하고 opencode·GLM 단발 실행기로 돌린다.
#   id = <레인>-<항목번호>(예: a1-T3). --id 가 <레인>- 으로 시작하지 않으면 붙인다(출력 줄의 id 가 실제 id).
#   실패·시간 초과·한도 오류 → 레인이 Claude agent 로 이어받는다(fallback). 절차: references/pool.md
`;
const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function poolDir(c) {
  if (c.env.COORD_POOL_DIR) return c.env.COORD_POOL_DIR;
  if (hasRun(c)) return join(runDir(c), 'pool');
  return join(c.env.TMPDIR || tmpdir(), 'coord-pool');
}

function poolCfg(c) {
  const p = JSON.parse(cfgAll(c)).pool || {};
  return {
    order: p.order || ['opencode', 'glm'],
    max: { opencode: Number(p.opencode_max ?? 3), glm: Number(p.glm_max ?? 1) },
    timeoutMin: p.timeout_min || { S: 20, M: 40 },
    cooldownMin: Number(p.cooldown_min ?? 30),
    cmd: { opencode: p.opencode_command, glm: p.glm_command },
    notify: p.notify !== false,
  };
}

/** GLM 슬롯 = 명령이 있고 사전 확인이 ok 일 때만. 아니면 상한 0. */
function glmUsable(c, pc) {
  const cmd = pc.cmd.glm;
  if (!cmd || (Array.isArray(cmd) && cmd.length === 0)) return false;
  if (c.env.COORD_POOL_GLM_OK === '1') return true;
  if (!hasRun(c)) return false;
  try { return (JSON.parse(readFileSync(stateFile(c), 'utf8')).glm || {}).status === 'ok'; } catch { return false; }
}

function cmdOk(cmd) {
  return !!cmd && !(Array.isArray(cmd) && cmd.length === 0) && String(cmd).trim() !== '';
}

/** 명령이 없는 종류는 상한 0(실행 불가 → no-worker). GLM 은 사전 확인까지 통과해야 한다. */
function effMaxes(c, pc) {
  return { opencode: cmdOk(pc.cmd.opencode) ? pc.max.opencode : 0, glm: glmUsable(c, pc) ? pc.max.glm : 0 };
}

function ensureExclude(cwd) {
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return;
  const common = resolve(cwd, r.stdout.trim());
  const f = join(common, 'info', 'exclude');
  mkdirSync(join(common, 'info'), { recursive: true });
  const cur = existsSync(f) ? readFileSync(f, 'utf8') : '';
  if (!cur.split('\n').includes('.pool/')) appendFileSync(f, `${cur.endsWith('\n') || cur === '' ? '' : '\n'}.pool/\n`);
}

/** 레인 알림. 기다리지 않는다: term-send-safe 를 분리된 자식으로 띄우고 잊는다. 호출자는 잠금 밖이어야 한다. */
function notifyNow(c, pc, rec) {
  if (!pc.notify || !rec.lane || rec.lane === '-') return;
  const fake = c.env.COORD_POOL_NOTIFY_SCRIPT; // 시험용: 핸들 확인을 건너뛰고 이 스크립트로 보낸다
  if (!fake) {
    if (!hasRun(c)) return;
    const h = stripNl(String(laneGet(c, rec.lane, '.session.handle').out || ''));
    if (h === '' || h === 'null') return;
  }
  const tail = rec.fallback && rec.result !== 'cancel' ? ' → Claude 로 넘김' : '';
  const text = `[pool] ${rec.id} ${rec.result} rc=${rec.rc ?? '-'}${tail}. 보고 .pool 폴더 ${rec.id}.report.md`;
  try {
    const script = fake || join(dirname(SELF), 'term-send-safe.mjs');
    const ch = spawn(process.execPath, [script, '--lane', rec.lane, '--text', text, '--timeout-ms', '300000'], { env: c.env, cwd: c.cwd, detached: true, stdio: 'ignore', windowsHide: true });
    ch.on('error', () => {});
    ch.unref();
  } catch { /* 알림 실패는 무시 */ }
}

/** 잠금 밖에서 할 일을 모은다: 알림·프로세스 종료. */
const newPost = () => ({ notify: [], kill: [] });
function flush(c, pc, post) {
  for (const pid of post.kill) { try { if (pidAlive(pid, c.env)) killTree(pid, c.env); } catch { /* 이미 끝남 */ } }
  for (const r of post.notify) notifyNow(c, pc, r);
}

/** 풀 상태를 바꾸는 모든 읽기-수정-쓰기는 이 잠금 안에서 한다. 잠금 안에서는 파일 읽기·쓰기와 spawn 만 한다. */
function locked(c, dir, fn) {
  mkdirSync(dir, { recursive: true });
  const base = join(dir, 'dispatch');
  if (!lock(c, base)) throw new CoordDie(4, `풀 잠금을 얻지 못했다: ${base}.lock`);
  try { return fn(); } finally { unlock(c, base); }
}

/** 기록을 끝낸다(잠금 안). 알림은 post 에 쌓는다. */
function finishRec(dir, post, rec, fields) {
  Object.assign(rec, { state: 'done', ended_at: nowIso(), ...fields });
  rec.fallback = rec.result !== 'ok';
  writeItem(dir, rec);
  appendLog(dir, logEntry(rec));
  post.notify.push({ ...rec });
}

/** 잠금 안: 죽은 실행기 정리, 못 돌리는 큐 묶음은 no-worker, 빈 슬롯에 큐 묶음을 띄운다. 돌려줌 = 이번에 시작한 기록들. */
function dispatchBody(c, dir, pc, post) {
  const items = readItems(dir);
  for (const r of reapStale(items, (pid) => pidAlive(pid, c.env), nowIso())) {
    writeItem(dir, r); appendLog(dir, logEntry(r)); post.notify.push({ ...r });
  }
  const cool = readCool(dir);
  const max = effMaxes(c, pc);
  const running = {};
  for (const r of items) if (r.state === 'running') running[r.kind] = (running[r.kind] || 0) + 1;
  const started = [];
  for (const r of items) {
    if (r.state !== 'queued') continue;
    const nowMs = Date.now();
    if (!hasAnyWorker({ order: pc.order, max, cool, nowMs, want: r.want })) {
      finishRec(dir, post, r, { result: 'no-worker', reason: 'no-worker', rc: null });
      continue;
    }
    const k = pickKind({ order: pc.order, max, running, cool, nowMs, want: r.want });
    if (!k) continue;
    running[k] = (running[k] || 0) + 1;
    const child = spawn(process.execPath, [SELF, 'run', r.id], { cwd: r.cwd, env: { ...c.env, COORD_POOL_DIR: dir }, detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
    if (child.pid === undefined) { finishRec(dir, post, r, { kind: k, result: 'fail', reason: 'spawn', rc: null }); continue; }
    Object.assign(r, { state: 'running', kind: k, pid: child.pid, started_at: nowIso() });
    writeItem(dir, r);
    started.push(r);
  }
  return started;
}

function parseFlags(argv, spec) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new CoordDie(2, `알 수 없는 인자: ${a}`);
    const k = a.slice(2);
    if (!(k in spec)) throw new CoordDie(2, `알 수 없는 인자: ${a}`);
    if (spec[k] === 'bool') o[k] = true; else o[k] = argv[++i] ?? '';
  }
  return o;
}

function cmdSubmit(c, argv) {
  const o = parseFlags(argv, { lane: 's', id: 's', size: 's', packet: 's', cwd: 's', kind: 's', 'dry-run': 'bool' });
  let id = o.id || '';
  let rawId = '';
  const out = (s) => process.stdout.write(`${o['dry-run'] ? 'DRY ' : ''}${s}\n`);
  if (!ID_RE.test(id)) { process.stdout.write(`POOL refused ${id} bad-id\n`); return 0; }
  // 풀은 회차에 하나라 레인마다 항목번호(T1·T2…)가 겹친다 → id = <레인>-<항목번호>. 접두가 없으면 붙이고, 출력 줄의 id 가 실제 id 다.
  if (o.lane && o.lane !== '-' && !id.startsWith(`${o.lane}-`)) {
    rawId = id;
    id = `${o.lane}-${id}`;
    if (!ID_RE.test(id)) { process.stdout.write(`POOL refused ${id} bad-id\n`); return 0; }
  }
  if (o.size === 'L') { process.stdout.write(`POOL refused ${id} size-L\n`); return 0; }
  if (o.size !== 'S' && o.size !== 'M') { process.stdout.write(`POOL refused ${id} bad-size\n`); return 0; }
  if (!o.packet || !existsSync(o.packet)) { process.stdout.write(`POOL refused ${id} no-packet\n`); return 0; }
  const want = o.kind || 'auto';
  if (!['auto', 'opencode', 'glm'].includes(want)) throw new CoordDie(2, `--kind 는 auto·opencode·glm: ${want}`);
  const cwd = resolve(c.cwd, o.cwd || '.');
  const pc = poolCfg(c);
  const dir = poolDir(c);
  const lane = o.lane || '-';
  if (o['dry-run']) {
    if (readItem(dir, id)) { process.stdout.write(`POOL refused ${id} duplicate\n`); return 0; }
    const max = effMaxes(c, pc);
    const cool = readCool(dir);
    if (!hasAnyWorker({ order: pc.order, max, cool, nowMs: Date.now(), want })) { out(`POOL fallback ${id} reason=no-worker`); return 0; }
    const running = {};
    for (const r of readItems(dir)) if (r.state === 'running') running[r.kind] = (running[r.kind] || 0) + 1;
    const k = pickKind({ order: pc.order, max, running, cool, nowMs: Date.now(), want });
    process.stderr.write(`DRY 묶음 ${id} 을 ${cwd}/.pool 에 복사하지 않음\n`);
    out(k ? `POOL started ${id} kind=${k}` : `POOL queued ${id} position=?`);
    return 0;
  }
  const post = newPost();
  const line = locked(c, dir, () => {
    if (readItem(dir, id)) return `POOL refused ${id} duplicate`;
    const max = effMaxes(c, pc);
    if (!hasAnyWorker({ order: pc.order, max, cool: readCool(dir), nowMs: Date.now(), want })) {
      finishRec(dir, post, { id, lane, size: o.size, want, kind: null, cwd, state: 'done', submitted_at: nowIso() }, { result: 'no-worker', reason: 'no-worker', rc: null });
      return `POOL fallback ${id} reason=no-worker`;
    }
    mkdirSync(join(cwd, '.pool'), { recursive: true });
    ensureExclude(cwd);
    const dest = join(cwd, '.pool', `${id}.md`);
    if (rawId !== '') {
      // 접두를 붙였으면 묶음 안의 옛 id(제목·보고 경로 .pool/<옛 id>.)를 실제 id 로 바꿔 쓴다. 워커가 옛 경로에 보고를 쓰면 실행기가 못 찾는다.
      const esc = rawId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const txt = readFileSync(o.packet, 'utf8')
        .split(`.pool/${rawId}.`).join(`.pool/${id}.`)
        .replace(new RegExp(`^(# 작업 묶음 )${esc}[ \\t]*$`, 'm'), `$1${id}`);
      writeFileSync(dest, txt);
    } else if (resolve(o.packet) !== dest) copyFileSync(o.packet, dest);
    writeItem(dir, { id, lane, size: o.size, want, kind: null, cwd, state: 'queued', pid: null, submitted_at: nowIso() });
    const started = dispatchBody(c, dir, pc, post);
    const me = started.find((r) => r.id === id);
    if (me) return `POOL started ${id} kind=${me.kind}`;
    const mine = readItem(dir, id);
    if (mine && mine.state === 'done') return `POOL fallback ${id} reason=${mine.reason || mine.result}`;
    const queued = readItems(dir).filter((r) => r.state === 'queued');
    return `POOL queued ${id} position=${queued.findIndex((r) => r.id === id) + 1}`;
  });
  flush(c, pc, post);
  process.stdout.write(`${line}\n`);
  return 0;
}

function tail(file, n) {
  if (!existsSync(file)) return '';
  const size = statSync(file).size;
  const fd = openSync(file, 'r');
  try {
    const len = Math.min(size, n);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } finally { closeSync(fd); }
}

async function cmdRun(c, argv) {
  const id = argv[0];
  const dir = poolDir(c);
  const pc = poolCfg(c);
  // dispatch 가 자식을 띄운 뒤 pid 를 기록하므로, 그 사이에 먼저 읽을 수 있다. 내 pid 가 보일 때까지 잠깐 기다린다.
  let rec = null;
  for (let i = 0; i < 100; i += 1) {
    rec = readItem(dir, id);
    if (!rec || rec.state === 'done' || (rec.state === 'running' && rec.pid === process.pid)) break;
    await sleep(50);
  }
  if (!rec || rec.state !== 'running' || rec.pid !== process.pid) return 0; // 내 묶음이 아니다(취소·정리·중복)
  const args = fillArgs(pc.cmd[rec.kind], promptFor(id));
  const outFile = join(rec.cwd, '.pool', `${id}.out`);
  const fd = openSync(outFile, 'a');
  const limitS = Number(c.env.COORD_POOL_TIMEOUT_S) || Number(pc.timeoutMin[rec.size] || 40) * 60;
  let timedOut = false;
  const rc = await new Promise((res) => {
    let child;
    try { child = spawn(args[0], args.slice(1), { cwd: rec.cwd, env: c.env, stdio: ['ignore', fd, fd], windowsHide: true }); } catch { res(127); return; }
    const t = setTimeout(() => { timedOut = true; killTree(child.pid, c.env); }, limitS * 1000);
    child.on('error', () => { clearTimeout(t); res(127); });
    child.on('exit', (code) => { clearTimeout(t); res(code === null ? 137 : code); });
  });
  closeSync(fd);
  const report = existsSync(join(rec.cwd, '.pool', `${id}.report.md`));
  const result = classify({ rc, timedOut, outTail: tail(outFile, 4096), reportExists: report });
  const post = newPost();
  let attempt = 0;
  for (;;) {
    try {
      locked(c, dir, () => {
        const fresh = readItem(dir, id);
        if (!fresh || fresh.state !== 'running' || fresh.pid !== process.pid) return; // 취소·정리됨: 덮어쓰지 않는다
        writeFileSync(join(rec.cwd, '.pool', `${id}.done`), `${rc}\n${result}\n`);
        if (result === 'ratelimit') writeCool(dir, coolAfterRatelimit(readCool(dir), rec.kind, Date.now(), pc.cooldownMin));
        finishRec(dir, post, fresh, { rc, result, reason: result === 'ok' ? null : result });
        dispatchBody(c, dir, pc, post);
      });
      break;
    } catch (e) {
      if (!(e instanceof CoordDie) || (attempt += 1) >= 5) throw e;
    }
  }
  flush(c, pc, post);
  return 0;
}

function cmdStatus(c, argv) {
  const o = parseFlags(argv, { lane: 's', id: 's' });
  const dir = poolDir(c);
  const pc = poolCfg(c);
  const post = newPost();
  if (existsSync(dir)) locked(c, dir, () => { dispatchBody(c, dir, pc, post); }); // 죽은 실행기 정리 + 빈 슬롯 채우기
  flush(c, pc, post);
  const items = readItems(dir).filter((r) => (!o.lane || r.lane === o.lane) && (!o.id || r.id === o.id));
  for (const r of items) process.stdout.write(`POOL ${r.id} ${r.state} kind=${r.kind || '-'} lane=${r.lane} result=${r.result || '-'} rc=${r.rc ?? '-'}\n`);
  const all = readItems(dir);
  const max = effMaxes(c, pc);
  const cnt = (k) => all.filter((r) => r.state === 'running' && r.kind === k).length;
  process.stdout.write(`POOL slots opencode=${cnt('opencode')}/${max.opencode} glm=${cnt('glm')}/${max.glm} queued=${all.filter((r) => r.state === 'queued').length}\n`);
  return 0;
}

function cmdCancel(c, argv) {
  const id = argv[0] || '';
  const dir = poolDir(c);
  const pc = poolCfg(c);
  const post = newPost();
  const line = locked(c, dir, () => {
    const rec = readItem(dir, id);
    if (!rec) return `POOL refused ${id} not-found`;
    if (rec.state === 'done') return `POOL refused ${id} already-done`;
    if (rec.state === 'running' && rec.pid) post.kill.push(rec.pid);
    finishRec(dir, post, rec, { result: 'cancel', reason: 'cancel', rc: null });
    dispatchBody(c, dir, pc, post);
    return `POOL cancelled ${id}`;
  });
  flush(c, pc, post);
  process.stdout.write(`${line}\n`);
  return 0;
}

function cmdNote(c, argv) {
  const id = argv[0] || '';
  const o = parseFlags(argv.slice(1), { findings: 's', lines: 's' });
  const dir = poolDir(c);
  const line = locked(c, dir, () => {
    const rec = readItem(dir, id);
    if (!rec) return `POOL refused ${id} not-found`;
    if (o.findings !== undefined) rec.findings = Number(o.findings) || 0;
    if (o.lines !== undefined) rec.lines = Number(o.lines) || 0;
    writeItem(dir, rec);
    appendLog(dir, logEntry(rec));
    return `POOL noted ${id}`;
  });
  process.stdout.write(`${line}\n`);
  return 0;
}

export async function main(argv, { env, cwd }) {
  const c = new Ctx(env, cwd);
  const [sub, ...rest] = argv;
  try {
    switch (sub) {
      case 'submit': return cmdSubmit(c, rest);
      case 'status': return cmdStatus(c, rest);
      case 'cancel': return cmdCancel(c, rest);
      case 'note': return cmdNote(c, rest);
      case 'run': return await cmdRun(c, rest);
      case '-h': case '--help': case 'help': process.stdout.write(HELP); return 0;
      default: process.stderr.write(HELP); return 2;
    }
  } catch (e) {
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc ?? 2; }
    throw e;
  }
}

if (isMain(import.meta.url)) scriptMain(main);
