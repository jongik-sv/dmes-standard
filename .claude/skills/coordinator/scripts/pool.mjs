// pool.mjs — 조정자 스크립트(node). 비-Claude 워커 풀(opencode·GLM) 묶음 제출·상태·취소·실행(설계 2026-10-10 §4).
//   사용법: pool.mjs submit --lane <L> --id <id> --size <S|M> --packet <파일> [--cwd <폴더>] [--kind auto|opencode|glm] [--dry-run]
//           pool.mjs status [--lane <L>] [--id <id>] · pool.mjs cancel <id> · pool.mjs note <id> [--findings n] [--lines n]
//   stdout: POOL started|queued|fallback|refused|cancelled|noted … · POOL <id> <state> kind= lane= result= rc= · POOL slots …
//   실행기 = `pool.mjs run <id>` 를 분리된 자식으로 띄운다(토큰을 쓰지 않음). 끝나면 다음 큐 묶음을 띄운다.
// node 18.17 이상, 외부 패키지 없음.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

function effMaxes(c, pc) {
  return { opencode: pc.max.opencode, glm: glmUsable(c, pc) ? pc.max.glm : 0 };
}

function ensureExclude(cwd) {
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) return;
  const common = resolve(cwd, r.stdout.trim());
  const f = join(common, 'info', 'exclude');
  mkdirSync(join(common, 'info'), { recursive: true });
  const cur = existsSync(f) ? readFileSync(f, 'utf8') : '';
  if (!cur.split('\n').includes('.pool/')) appendFileSync(f, `${cur.endsWith('\n') || cur === '' ? '' : '\n'}.pool/\n`);
}

function notify(c, pc, rec) {
  if (!pc.notify || !rec.lane || rec.lane === '-' || !hasRun(c)) return;
  const h = stripNl(String(laneGet(c, rec.lane, '.session.handle').out || ''));
  if (h === '' || h === 'null') return;
  const tail = rec.fallback ? ' → Claude 로 넘김' : '';
  const text = `[pool] ${rec.id} ${rec.result} rc=${rec.rc ?? '-'}${tail}. 보고 .pool 폴더 ${rec.id}.report.md`;
  try { runScript(c, 'term-send-safe', ['--lane', rec.lane, '--text', text]); } catch { /* 알림 실패는 무시 */ }
}

function finish(c, dir, pc, rec, fields) {
  Object.assign(rec, { state: 'done', ended_at: nowIso(), ...fields });
  rec.fallback = rec.result !== 'ok';
  writeItem(dir, rec);
  appendLog(dir, logEntry(rec));
  notify(c, pc, rec);
}

/** 큐 묶음을 빈 슬롯에 띄운다. 잠금 안에서. 돌려줌 = 이번에 시작한 기록들. 잠금을 못 얻으면 빈 배열. */
function dispatch(c, dir, pc) {
  const base = join(dir, 'dispatch');
  mkdirSync(dir, { recursive: true });
  if (!lock(c, base)) return [];
  try {
    const items = readItems(dir);
    for (const r of reapStale(items, (pid) => pidAlive(pid, c.env), nowIso())) { writeItem(dir, r); appendLog(dir, logEntry(r)); notify(c, pc, r); }
    const cool = readCool(dir);
    const max = effMaxes(c, pc);
    const running = {};
    for (const r of items) if (r.state === 'running') running[r.kind] = (running[r.kind] || 0) + 1;
    const started = [];
    for (const r of items) {
      if (r.state !== 'queued') continue;
      const k = pickKind({ order: pc.order, max, running, cool, nowMs: Date.now(), want: r.want });
      if (!k) continue;
      running[k] = (running[k] || 0) + 1;
      const child = spawn(process.execPath, [SELF, 'run', r.id], { cwd: r.cwd, env: { ...c.env, COORD_POOL_DIR: dir }, detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      Object.assign(r, { state: 'running', kind: k, pid: child.pid, started_at: nowIso() });
      writeItem(dir, r);
      started.push(r);
    }
    return started;
  } finally {
    unlock(c, base);
  }
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
  const id = o.id || '';
  const out = (s) => process.stdout.write(`${o['dry-run'] ? 'DRY ' : ''}${s}\n`);
  if (!ID_RE.test(id)) { process.stdout.write(`POOL refused ${id} bad-id\n`); return 0; }
  if (o.size === 'L') { process.stdout.write(`POOL refused ${id} size-L\n`); return 0; }
  if (o.size !== 'S' && o.size !== 'M') { process.stdout.write(`POOL refused ${id} bad-size\n`); return 0; }
  if (!o.packet || !existsSync(o.packet)) { process.stdout.write(`POOL refused ${id} no-packet\n`); return 0; }
  const want = o.kind || 'auto';
  if (!['auto', 'opencode', 'glm'].includes(want)) throw new CoordDie(2, `--kind 는 auto·opencode·glm: ${want}`);
  const cwd = resolve(c.cwd, o.cwd || '.');
  const pc = poolCfg(c);
  const dir = poolDir(c);
  if (readItem(dir, id)) { process.stdout.write(`POOL refused ${id} duplicate\n`); return 0; }
  const max = effMaxes(c, pc);
  const cool = readCool(dir);
  if (!hasAnyWorker({ order: pc.order, max, cool, nowMs: Date.now(), want })) {
    if (o['dry-run']) { out(`POOL fallback ${id} reason=no-worker`); return 0; }
    const rec = { id, lane: o.lane || '-', size: o.size, want, kind: null, cwd, state: 'done', submitted_at: nowIso() };
    finish(c, dir, pc, rec, { result: 'no-worker', reason: 'no-worker', rc: null });
    process.stdout.write(`POOL fallback ${id} reason=no-worker\n`);
    return 0;
  }
  if (o['dry-run']) {
    const running = {};
    for (const r of readItems(dir)) if (r.state === 'running') running[r.kind] = (running[r.kind] || 0) + 1;
    const k = pickKind({ order: pc.order, max, running, cool, nowMs: Date.now(), want });
    process.stderr.write(`DRY 묶음 ${id} 을 ${cwd}/.pool 에 복사하지 않음\n`);
    out(k ? `POOL started ${id} kind=${k}` : `POOL queued ${id} position=?`);
    return 0;
  }
  mkdirSync(join(cwd, '.pool'), { recursive: true });
  ensureExclude(cwd);
  const dest = join(cwd, '.pool', `${id}.md`);
  if (resolve(o.packet) !== dest) copyFileSync(o.packet, dest);
  writeItem(dir, { id, lane: o.lane || '-', size: o.size, want, kind: null, cwd, state: 'queued', pid: null, submitted_at: nowIso() });
  const started = dispatch(c, dir, pc);
  const me = started.find((r) => r.id === id);
  if (me) { process.stdout.write(`POOL started ${id} kind=${me.kind}\n`); return 0; }
  const queued = readItems(dir).filter((r) => r.state === 'queued');
  process.stdout.write(`POOL queued ${id} position=${queued.findIndex((r) => r.id === id) + 1}\n`);
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
  // dispatch 가 자식을 띄운 뒤 running 기록을 쓰므로, 그 사이에 먼저 읽을 수 있다. 잠깐 기다린다.
  let rec = readItem(dir, id);
  for (let i = 0; i < 100 && rec && rec.state === 'queued'; i += 1) { await sleep(50); rec = readItem(dir, id); }
  if (!rec || rec.state !== 'running') return 0;
  const tmpl = pc.cmd[rec.kind];
  const args = fillArgs(tmpl, promptFor(id));
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
  writeFileSync(join(rec.cwd, '.pool', `${id}.done`), `${rc}\n${result}\n`);
  const fresh = readItem(dir, id) || rec;
  if (fresh.state === 'done') return 0; // cancel 됨
  if (result === 'ratelimit') writeCool(dir, coolAfterRatelimit(readCool(dir), rec.kind, Date.now(), pc.cooldownMin));
  finish(c, dir, pc, fresh, { rc, result, reason: result === 'ok' ? null : result });
  dispatch(c, dir, pc);
  return 0;
}

function cmdStatus(c, argv) {
  const o = parseFlags(argv, { lane: 's', id: 's' });
  const dir = poolDir(c);
  const pc = poolCfg(c);
  if (existsSync(dir)) dispatch(c, dir, pc); // 죽은 실행기 정리 + 빈 슬롯 채우기
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
  const rec = readItem(dir, id);
  if (!rec) { process.stdout.write(`POOL refused ${id} not-found\n`); return 0; }
  if (rec.state === 'done') { process.stdout.write(`POOL refused ${id} already-done\n`); return 0; }
  if (rec.state === 'running' && rec.pid) { try { killTree(rec.pid, c.env); } catch { /* 이미 끝남 */ } }
  finish(c, dir, pc, rec, { result: 'cancel', reason: 'cancel', rc: null });
  dispatch(c, dir, pc);
  process.stdout.write(`POOL cancelled ${id}\n`);
  return 0;
}

function cmdNote(c, argv) {
  const id = argv[0] || '';
  const o = parseFlags(argv.slice(1), { findings: 's', lines: 's' });
  const dir = poolDir(c);
  const rec = readItem(dir, id);
  if (!rec) { process.stdout.write(`POOL refused ${id} not-found\n`); return 0; }
  if (o.findings !== undefined) rec.findings = Number(o.findings) || 0;
  if (o.lines !== undefined) rec.lines = Number(o.lines) || 0;
  writeItem(dir, rec);
  appendLog(dir, logEntry(rec));
  process.stdout.write(`POOL noted ${id}\n`);
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
