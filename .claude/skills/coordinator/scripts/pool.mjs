// pool.mjs — 조정자 스크립트(node). 비-Claude 워커 풀(opencode·GLM) 묶음 제출·상태·취소·실행(설계 2026-10-10 §4).
//   사용법: pool.mjs submit --lane <L> --id <id> --size <S|M> --packet <파일> [--cwd <폴더>] [--kind auto|opencode|glm] [--dry-run]
//           pool.mjs status [--lane <L>] [--id <id>] · pool.mjs cancel <id> · pool.mjs note <id> [--findings n] [--lines n]
//   stdout: POOL started|queued|fallback|refused|cancelled|noted … · POOL <id> <state> kind= lane= result= rc= · POOL slots …
//   submit 의 id = <레인>-<항목번호>. --id 에 <레인>- 접두가 없으면 붙인다(레인끼리 항목번호가 겹쳐 duplicate 가 나지 않게).
//   실행기 = `pool.mjs run <id>` 를 분리된 자식으로 띄운다(토큰을 쓰지 않음). 실행기는 워커를 보이는 TUI 탭으로 띄우고(pool-tab.mjs),
//   지시를 보낸 뒤 화면·보고 파일을 폴링해 판정하고, 어느 경로로 끝나든 탭을 닫는다. 끝나면 다음 큐 묶음을 띄운다.
// node 18.17 이상, 외부 패키지 없음.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoordDie, Ctx, cfgAll, hasRun, laneGet, lock, runDir, stateFile, unlock } from './lib/common.mjs';
import { runScript, stripNl } from './lib/common-ext.mjs';
import { pidAlive } from './lib/compat.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';
import { appendLog, coolAfterRatelimit, hasAnyWorker, ID_RE, judgeTui, logEntry, pickKind, promptFor, readCool, readItem, readItems, reapStale, writeCool, writeItem } from './lib/pool-core.mjs';

const SELF = fileURLToPath(import.meta.url);
const HELP = `# 사용법: pool.mjs submit --lane <L> --id <id> --size <S|M> --packet <파일> [--cwd <폴더>] [--kind auto|opencode|glm] [--dry-run]
#         pool.mjs status [--lane <L>] [--id <id>] · cancel <id> · note <id> [--findings n] [--lines n]
#   비-Claude 워커 풀. 묶음 파일을 <작업 폴더>/.pool/<id>.md 로 복사하고 opencode·GLM 을 보이는 TUI 탭으로 띄워 돌린다(끝나면 탭을 닫음).
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
  const all = JSON.parse(cfgAll(c));
  const p = all.pool || {};
  const launch = all.launch || {};
  return {
    order: p.order || ['opencode', 'glm'],
    max: { opencode: Number(p.opencode_max ?? 3), glm: Number(p.glm_max ?? 1) },
    timeoutMin: p.timeout_min || { S: 20, M: 40 },
    cooldownMin: Number(p.cooldown_min ?? 30),
    launch: { opencode: launch.opencode, glm: launch.glm },
    pollS: Number(p.poll_s ?? 10),
    stuckMin: Number(p.stuck_min ?? 10),
    notify: p.notify !== false,
  };
}

/** GLM 슬롯 = 실행 명령(launch.glm)이 있고 사전 확인이 ok 일 때만. 아니면 상한 0. GLM = 모델만 GLM 인 Claude Code. */
function glmUsable(c, pc) {
  if (!cmdOk(pc.launch.glm)) return false;
  if (c.env.COORD_POOL_GLM_OK === '1') return true;
  if (!hasRun(c)) return false;
  try { return (JSON.parse(readFileSync(stateFile(c), 'utf8')).glm || {}).status === 'ok'; } catch { return false; }
}

function cmdOk(cmd) {
  return !!cmd && String(cmd).trim() !== '';
}

/** 명령이 없는 종류는 상한 0(실행 불가 → no-worker). GLM 은 사전 확인까지 통과해야 한다. */
function effMaxes(c, pc) {
  return { opencode: cmdOk(pc.launch.opencode) ? pc.max.opencode : 0, glm: glmUsable(c, pc) ? pc.max.glm : 0 };
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

/** 탭 드라이버(pool-tab.mjs). 시험은 COORD_POOL_TAB 으로 가짜를 쓴다. 돌려줌 = { out, status } */
function tab(c, args, cwd) {
  const drv = c.env.COORD_POOL_TAB || join(dirname(SELF), 'pool-tab.mjs');
  const r = spawnSync(process.execPath, [drv, ...args], { env: c.env, cwd, encoding: 'utf8', windowsHide: true, timeout: 330000 });
  return { out: r.stdout || '', err: r.stderr || '', status: r.status };
}

/** 잠금 밖에서 할 일을 모은다: 알림·탭 닫기. */
const newPost = () => ({ notify: [], close: [] });
function flush(c, pc, post) {
  // 핸들이 있으면 그 탭을, 없으면(핸들 기록 전에 실행기가 죽음) 제목으로 찾아 닫는다
  for (const t of post.close) { try { tab(c, t.handle ? ['close', t.handle] : ['close-id', t.id], t.cwd); } catch { /* 이미 닫힘 */ } }
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
    post.close.push({ handle: r.handle || '', id: r.id, cwd: r.cwd }); // 죽은 실행기가 남긴 탭
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
  const mine = () => { const f = readItem(dir, id); return !!f && f.state === 'running' && f.pid === process.pid; };
  const outFile = join(rec.cwd, '.pool', `${id}.out`);
  const limitS = Number(c.env.COORD_POOL_TIMEOUT_S) || Number(pc.timeoutMin[rec.size] || 40) * 60;
  const pollMs = (Number(c.env.COORD_POOL_POLL_S) || pc.pollS) * 1000;
  const stuckS = Number(c.env.COORD_POOL_STUCK_S) || pc.stuckMin * 60;
  const t0 = Date.now();
  let handle = '';
  let result = null;
  let reason = null;
  // 어느 경로로 끝나든 탭을 닫는다: 정상 끝·예외(finally)·종료 신호(SIGTERM·SIGHUP·SIGINT).
  const closeMine = () => { if (handle) { const h = handle; handle = ''; tab(c, ['close', h], rec.cwd); } };
  const onSignal = (sig) => { try { closeMine(); } finally { process.exit(sig === 'SIGINT' ? 130 : 143); } };
  for (const sig of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.once(sig, onSignal);
  try {
    const o = tab(c, ['open', '--kind', rec.kind, '--cwd', rec.cwd, '--name', `pool-${id}`, '--id', id], rec.cwd);
    const m = o.out.match(/^TAB (\S+)/m);
    if (!m) {
      result = 'fail'; reason = 'open';
      try { writeFileSync(outFile, `${o.out}${o.err}`); } catch { /* 진단용 */ }
      tab(c, ['close-id', id], rec.cwd); // 드라이버가 시간 초과로 죽었으면 만든 탭이 남을 수 있다
    } else {
      handle = m[1];
      // 핸들을 기록한다(잠금 안). 취소·정리가 이 탭을 닫을 수 있게. 그사이 취소됐으면 탭만 닫고 끝낸다.
      let still = false;
      withLock(c, dir, () => {
        const f = readItem(dir, id);
        if (!f || f.state !== 'running' || f.pid !== process.pid) return;
        f.handle = handle; writeItem(dir, f); still = true;
      });
      if (!still) return 0; // finally 가 닫는다
      const s = tab(c, ['send', handle, '--kind', rec.kind, '--text', promptFor(id)], rec.cwd);
      if (!/^SENT/m.test(s.out)) { result = 'fail'; reason = 'send'; }
      let prev = null;
      let lastChange = Date.now();
      while (result === null) {
        await sleep(pollMs);
        if (!mine()) return 0; // 취소·정리됨: 덮어쓰지 않는다(finally 가 닫는다)
        const sc = tab(c, ['screen', handle], rec.cwd);
        if (sc.status === 3) { result = 'fail'; reason = 'tab-gone'; handle = ''; break; }
        try { writeFileSync(outFile, sc.out); } catch { /* 진단용 */ }
        const now = Date.now();
        if (sc.out !== prev) { prev = sc.out; lastChange = now; }
        // 조용함 = 화면이 두 폴링 동안 그대로 또는 tui-idle(Claude Code·GLM). opencode 2.x 는 tui-idle 이 안 나와 화면으로만 본다.
        const quiet = now - lastChange >= pollMs * 2 || /^idle/.test(tab(c, ['idle', handle], rec.cwd).out);
        const report = existsSync(join(rec.cwd, '.pool', `${id}.report.md`));
        const j = judgeTui({ report, quiet, quietS: (now - lastChange) / 1000, stuckS, screen: sc.out, elapsedS: (now - t0) / 1000, limitS });
        if (j) { result = j; reason = j === 'ok' ? null : j === 'fail' ? 'stuck' : j; }
      }
    }
  } finally {
    closeMine();
  }
  const post = newPost();
  withLock(c, dir, () => {
    const fresh = readItem(dir, id);
    if (!fresh || fresh.state !== 'running' || fresh.pid !== process.pid) return; // 취소·정리됨: 덮어쓰지 않는다
    writeFileSync(join(rec.cwd, '.pool', `${id}.done`), `-\n${result}\n`);
    if (result === 'ratelimit') writeCool(dir, coolAfterRatelimit(readCool(dir), rec.kind, Date.now(), pc.cooldownMin));
    finishRec(dir, post, fresh, { rc: null, result, reason });
    dispatchBody(c, dir, pc, post);
  });
  flush(c, pc, post);
  return 0;
}

/** 잠금 재시도(최대 5번). 실행기는 오래 살아 잠금 경합을 만날 수 있다. */
function withLock(c, dir, fn) {
  for (let attempt = 1; ; attempt += 1) {
    try { return locked(c, dir, fn); } catch (e) { if (!(e instanceof CoordDie) || attempt >= 5) throw e; }
  }
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
    // 실행기는 죽이지 않는다: 탭을 띄우는 중일 수 있어 핸들을 아직 모른다. 실행기가 다음 확인에서 취소를 보고 자기 탭을 닫고 끝난다.
    // 여기서도 닫는다: 핸들이 있으면 그 탭, 없으면 제목 검색(워커를 바로 멈춤, 두 번 닫아도 무해).
    // 띄우는 중에 취소하면 슬롯이 바로 비어 잠깐 상한보다 탭이 하나 많을 수 있다(실행기가 곧 닫음).
    if (rec.state === 'running') post.close.push({ handle: rec.handle || '', id: rec.id, cwd: rec.cwd });
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
