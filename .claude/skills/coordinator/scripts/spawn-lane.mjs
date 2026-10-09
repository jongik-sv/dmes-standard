#!/usr/bin/env node
// spawn-lane.sh 의 node 판(스위치 COORD_JS_SPAWN_LANE — js-bridge.sh 로 exec). 정답은 bash 판이다(계약: tests/js-parity/README.md, 명세 specs/spawn-lane.mjs).
// 이 스크립트는 새 터미널 탭을 만들고 그 셸에 명령 한 줄을 보내 세션을 띄운다. 그래서 확실하지 않으면 띄우지 않는 쪽(fail-closed)으로만 틀린다:
//   · 어떤 내부 오류든(예외) 더 진행하지 않고 종료 코드 70 으로 끝난다(bash 본문으로 되돌아가지 않는다).
//   · 탭을 만든 뒤 실패하면 bash 판이 하던 대로만 정리한다(명령 send 실패 때 탭 닫기, GLM 화면이 Claude Max 면 탭 닫기).
// 맞춘 bash 동작 (읽는 사람이 놀라지 않도록 적어 둔다)
//  · 옵션 값 자리에 인자가 없으면 빈 값이다(`${2:-}`). -h/--help 는 .sh 의 2~19번 줄을 그대로 낸다.
//  · 이름·값 검사의 글자 집합은 ASCII 다. bash 판은 UTF-8 로케일에서 [!A-Za-z0-9…] 글롭이 é 같은 글자를 통과시킨다(의심 후보) — node 판은 거절한다(안전한 쪽).
//  · git 은 설정 .git_bin 이 아니라 PATH 의 `git` 을 직접 부른다(bash 판이 그렇다).
//  · 대기: 셸 프롬프트 확인 최대 10번×2초, 새 세션 확인 최대 30초(2초 간격), tui-idle 60초 + (안 되면) 120초는 orca 에 넘기는 값이다.
//    시험이 줄일 수 있게 main(argv, { timeouts })로 주입한다(운영은 늘 기본값). 환경 변수 훅은 두지 않는다.
//  · 폴더 신뢰 확인은 bash 판처럼 auto-answer.sh 를, 지시 파일은 term-send-safe.sh 를, 기록은 coord-state.sh·office.sh 를 부른다(각 스크립트의 스위치를 따른다).
//  · 윈도우: 새 탭의 셸이 PowerShell·cmd 일 수 있어 `cd … && …` 를 임시 .sh 에 쓰고 `bash -l "<경로>"` 한 줄만 보낸다(bash 판과 같다).
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './lib/compat.mjs';
import { CoordDie, Ctx, cfgSub, expand, hasRun, nowEpoch, q, screenPromptKind, stateFile } from './lib/common.mjs';
import { coordStateCall, runSync, scriptsDir } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';
import * as J from './lib/jq-json.mjs';
import { hasNonSpace, spaceChars } from './lib/sh-space.mjs';
import { sleepSec } from './lib/test-sleep.mjs';
import { functions as T } from './lib/term.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SH_FILE = join(HERE, 'spawn-lane.sh');

/** 시험이 줄일 수 있는 대기 값(운영은 기본값). 단위는 이름에 적었다 */
export const DEFAULT_TIMEOUTS = { shellTries: 10, pollS: 2, newSessionS: 30, idleMs: 60000, idleRetryMs: 120000 };

class Exit extends Error { constructor(rc) { super(`exit ${rc}`); this.rc = rc; } }

const stripNl = (s) => s.replace(/\n+$/, '');
const noNul = (s) => (s.includes('\0') ? s.replaceAll('\0', '') : s);
const tsvEsc = (s) => s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');

function helpText() {
  const lines = readFileSync(SH_FILE, 'latin1').split('\n');
  return Buffer.from(`${lines.slice(1, 22).join('\n')}\n`, 'latin1');
}

// ---------- 외부 도구 ----------
function termCall(name, args, env, cwd) {
  const r = T[name].run({ args, env, cwd }) || {};
  return { out: typeof r.out === 'string' ? r.out : Buffer.isBuffer(r.out) ? r.out.toString('utf8') : '', rc: r.rc ?? 0 };
}
/** `orca <인자…>` (--json 은 인자에 직접 넣는다). stderr 는 버린다. 없으면 orca.cmd 로 한 번 더. stdout 글 */
function orca(args, env, cwd) {
  let r = runSync('orca', args, { env, cwd });
  if (r.rc === 127) r = runSync('orca.cmd', args, { env, cwd });
  return r.out.toString('utf8');
}
const parseJson = (text) => { try { return JSON.parse(text); } catch { return undefined; } };
/** jq `[.. | objects | .handle? | strings | select(startswith("term_"))][0] // empty` */
function findHandle(v) {
  if (Array.isArray(v)) { for (const x of v) { const r = findHandle(x); if (r) return r; } return ''; }
  if (v && typeof v === 'object') {
    if (typeof v.handle === 'string' && v.handle.startsWith('term_')) return v.handle;
    for (const k of Object.keys(v)) { const r = findHandle(v[k]); if (r) return r; }
  }
  return '';
}

// ---------- main ----------
export async function main(argv, { env: env0 = process.env, cwd = process.cwd(), timeouts = {} } = {}) {
  const env = { ...env0 };
  env.COORD_JS_CALLER_PID = String(process.pid);
  const c = new Ctx(env, cwd);
  const out = (s) => process.stdout.write(s);
  try {
    return await run(argv, env, cwd, c, out, { ...DEFAULT_TIMEOUTS, ...timeouts });
  } catch (e) {
    if (e instanceof Exit) return e.rc;
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc; }
    throw e;
  } finally {
    if (c.err) process.stderr.write(c.err);
  }
}

function die(rc, msg) { throw new CoordDie(rc, msg); }

async function run(argv, env, cwd, c, out0, TO) {
  let name = '', kind = '', sel = '', model = '', effort = '', autoc = '', pfile = '', briefArg = '', dry = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const nx = () => argv[i + 1] ?? '';
    switch (a) {
      case '--name': name = nx(); i++; break;
      case '--kind': kind = nx(); i++; break;
      case '--worktree': sel = nx(); i++; break;
      case '--model': model = nx(); i++; break;
      case '--effort': effort = nx(); i++; break;
      case '--autocompact': autoc = nx(); i++; break;
      case '--prompt-file': pfile = nx(); i++; break;
      case '--brief': briefArg = nx(); i++; break;
      case '--dry-run': dry = 1; break;
      case '-h': case '--help': out0(helpText()); return 0;
      default: die(2, `모르는 인자: ${a}`);
    }
  }
  const log = (m) => c.log(m);
  const echo = (s) => out0(`${s}\n`);
  if (!(name !== '' && kind !== '')) die(2, '--name 과 --kind 가 필요하다');
  if (/[^A-Za-z0-9._-]/.test(name)) die(2, `이름은 영문·숫자·._- 만: ${name}`);
  if (!['claude', 'glm', 'opencode'].includes(kind)) die(2, '--kind 는 claude|glm|opencode');
  for (const v of [model, effort, autoc]) if (/[^A-Za-z0-9._[\]-]/.test(v)) die(2, `값에 쓸 수 없는 글자: ${v}`);
  if (pfile !== '') {
    let isFile = false;
    try { isFile = statSync(pfile).isFile(); } catch { /* 없음 */ }
    if (!isFile) die(2, `지시 파일이 없다: ${pfile}`);
    pfile = absLogical(pfile, env, cwd);
  }
  // 에이전트 오피스 레인 칸에 보일 한 줄(lane-add 의 brief): --brief 가 우선, 없으면 --prompt-file 첫 글줄(「— 」 뒤 제목, 없으면 앞 60자), 경로 토큰은 뺀다
  let BRIEF = makeBrief(env, briefArg, pfile);
  if (BRIEF !== '' && hasRun(c) && existingBrief(c, name) !== '') BRIEF = '';   // 이미 그 레인에 brief 가 있으면 덮어쓰지 않는다
  const be = cfgSub(c, '.terminal_backend') || 'orca';
  if (be !== 'orca') die(4, 'spawn-lane.sh 는 terminal_backend=orca 만 지원한다');
  if (dry === 1) env.COORD_DRY = '1';

  const fail = (why, msg) => { echo(`SPAWN_FAIL ${name} ${why} ${msg}`); throw new Exit(0); };
  const SESS_DIR = expand(cfgSub(c, '.sessions_dir'), env);
  const childEnv = () => { const e = { ...env }; delete e.COORD_JS_CALLER_PID; return e; };
  const runChild = (script, args) => {
    const r = runSync('bash', [join(scriptsDir(), script), ...args], { env: childEnv(), cwd, input: '' });
    if (r.err && r.err.length) c.errs.push(r.err.toString('utf8'));
    return stripNl(r.out.toString('utf8'));
  };

  // name==<n> 이고 살아 있는 세션 pid 들(각 pid 뒤에 공백)
  function liveSessionPids() {
    let files = [];
    try { files = readdirSync(SESS_DIR).filter((n) => n.endsWith('.json') && !n.startsWith('.')).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); } catch { return ''; }
    let res = '';
    for (const n of files) {
      const f = `${SESS_DIR}/${n}`;
      let isFile = false;
      try { isFile = statSync(f).isFile(); } catch { /* 없음 */ }
      if (!isFile) continue;
      let p = '';
      try {
        const outs = [];
        for (const d of J.parseStreamPartial(readFileSync(f, 'utf8')).values) {
          try {
            if (J.index(d, 'name') !== name) continue;
            const v = J.alt(J.index(d, 'pid'), undefined);
            if (v !== undefined) outs.push(J.tostring(v));
          } catch (e) { if (!(e instanceof J.JqError)) throw e; }
        }
        p = stripNl(outs.join('\n'));
      } catch { p = ''; }
      if (p !== '' && C.pidAlive(p, env)) res += `${p} `;
    }
    return res;
  }
  /** 생성 전 목록(pre)에 없던 새 세션을 최대 newSessionS 초 기다린다 → "pid\tsessionId\tsocket" 또는 null */
  function waitNewSession(pre) {
    const end = nowEpoch() + TO.newSessionS;
    while (nowEpoch() <= end) {
      for (const p of liveSessionPids().split(' ').filter(Boolean)) {
        if (` ${pre} `.includes(` ${p} `)) continue;
        const f = `${SESS_DIR}/${p}.json`;
        let isFile = false;
        try { isFile = statSync(f).isFile(); } catch { /* 없음 */ }
        if (!isFile) continue;
        let line = '';
        try {
          const outs = [];
          for (const d of J.parseStreamPartial(readFileSync(f, 'utf8')).values) {
            try {
              const cell = (v) => (v === null || v === undefined || v === false ? '' : typeof v === 'string' ? tsvEsc(v) : J.tostring(v));
              const sid = J.alt(J.index(d, 'sessionId'), '-'), sock = J.alt(J.index(d, 'messagingSocketPath'), '');
              outs.push([cell(J.index(d, 'pid')), cell(sid), cell(sock)].join('\t'));
            } catch (e) { if (!(e instanceof J.JqError)) throw e; }
          }
          line = stripNl(outs.join('\n'));
        } catch { line = ''; }
        return line;   // bash: `[ -f "$f" ] && { jq …; return 0; }` — jq 가 비어도 0
      }
      sleepSec(env, TO.pollS);
    }
    return null;
  }

  // ---------- 탭 위치·폴더 ----------
  let TAB_SEL = '', CD_PATH = '';
  const orcaKnownPath = (p) => {
    const doc = parseJson(orca(['worktree', 'list', '--json'], env, cwd));
    const ws = doc && doc.result && Array.isArray(doc.result.worktrees) ? doc.result.worktrees : [];
    const paths = ws.map((w) => (w && typeof w === 'object' ? (w.path === undefined || w.path === null ? 'null' : typeof w.path === 'string' ? w.path : JSON.stringify(w.path)) : 'null'));
    if (!C.isWin(env)) return paths.some((x) => x.split('\n').includes(p));
    const n = C.normPath(p, env);
    return paths.some((x) => C.normPath(x, env) === n);
  };
  const gitOut = (args) => stripNl(runSync('git', args, { env, cwd }).out.toString('utf8'));
  const physical = (p) => { try { return realpathSync.native(p); } catch { return ''; } };
  function resolveTarget() {
    const top = gitOut(['rev-parse', '--show-toplevel']);
    let main = gitOut(['rev-parse', '--path-format=absolute', '--git-common-dir']);
    if (main.endsWith('/.git')) main = main.slice(0, -5);
    for (const p of [top, main]) {
      if (p !== '' && orcaKnownPath(p)) { TAB_SEL = `path:${C.nativePath(p, env)}`; break; }
    }
    if (TAB_SEL === '') TAB_SEL = 'active';
    const bad = () => die(2, `--worktree 는 절대경로, path:<경로>, Orca 선택자(name:·branch:·id:·current 등)만 받는다: ${sel}`);
    if (sel === '') { CD_PATH = physical(top !== '' ? top : cwd); return; }
    if (sel.startsWith('./') || sel.startsWith('../') || sel.startsWith('~') || sel === '.' || sel === '..') bad();
    if (sel.startsWith('/') || sel.startsWith('path:') || /^[A-Za-z]:[/\\]/.test(sel)) {
      if (/^[A-Za-z]:[/\\]/.test(sel) && !sel.startsWith('path:') && !C.isWin(env)) bad();
      let p = sel.startsWith('path:') ? sel.slice(5) : sel;
      if (!C.isAbsPath(p, env)) die(2, `--worktree path: 값은 절대경로만 받는다: ${sel}`);
      let isDir = false;
      try { isDir = statSync(p).isDirectory(); } catch { /* 없음 */ }
      if (!isDir) die(2, `--worktree 폴더가 없다: ${p}`);
      p = physical(p);
      CD_PATH = p;
      if (orcaKnownPath(p)) TAB_SEL = `path:${C.nativePath(p, env)}`;
      return;
    }
    if (sel === 'current' || sel === 'active' || /^(name|branch|id|identity|issue):/.test(sel)) { TAB_SEL = sel; return; }
    bad();
  }
  const dryCd = () => (CD_PATH !== '' ? CD_PATH : '<그 터미널 worktreePath>');

  // ---------- 탭 만들기·명령 보내기 ----------
  const worktreeOf = (h) => {
    const row = termCall('term_list', [], env, cwd).out.split('\n').map((l) => l.split('\t')).find((f) => f[0] === h);
    return row ? (row[2] ?? '') : '';
  };
  /** orca_create <title> → handle (실패 시 로그 후 '') */
  function orcaCreate(title) {
    const outText = orca(['terminal', 'create', '--worktree', TAB_SEL, '--title', title, '--json'], env, cwd);
    const doc = parseJson(outText);
    if (!(doc && typeof doc === 'object' && (doc.ok === true || doc.ok === 'true'))) {
      log(`terminal create 실패: ${Buffer.from(outText, 'utf8').subarray(0, 300).toString('utf8')}`);
      return '';
    }
    return findHandle(doc);
  }
  function waitShell(h) {
    for (let i = 0; i < TO.shellTries; i++) {
      if (hasNonSpace(env, termCall('term_read_screen', [h, '10'], env, cwd).out)) return;
      sleepSec(env, TO.pollS);
    }
    log(`셸 프롬프트가 20초 안에 보이지 않는다 — 그대로 보낸다: ${h}`);
  }
  /** 탭 셸에 보낼 한 줄(윈도우는 임시 .sh 를 거친다) */
  function tabLine(line) {
    if (!C.isWin(env)) return line;
    if (env.COORD_DRY === '1') return 'bash -l "<임시 스크립트>"';
    const f = join(env.TMPDIR || tmpdir(), `coord-launch.${randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 6)}`);
    try { writeFileSync(f, `${line}\n`, { flag: 'wx', mode: 0o600 }); } catch { return line; }
    return `bash -l "${C.nativePath(f, env)}"`;
  }
  let H = '', LAUNCH_ERR = '';
  /** 0 성공, 1 탭 생성 실패, 2 명령 send 실패(탭은 닫는다) */
  function launchInTab(title, cmd) {
    H = orcaCreate(title);
    if (H === '') { LAUNCH_ERR = 'terminal create 결과에서 handle 을 찾지 못했다'; return 1; }
    waitShell(H);
    let dir = CD_PATH;
    if (dir === '') dir = worktreeOf(H);
    const cmdline = tabLine(`cd ${q([dir !== '' ? dir : '.'])} && ${cmd}`);
    const r = stripNl(termCall('term_send', [H, cmdline, '--enter'], env, cwd).out);
    if (r === 'stale' || r.startsWith('error')) {
      LAUNCH_ERR = `실행 명령 send 실패: ${r} handle=${H}`;
      termCall('term_close', [H], env, cwd);
      return 2;
    }
    if (CD_PATH === '') CD_PATH = dir;
    return 0;
  }
  function waitTui(h) {
    const wait = (ms) => stripNl(termCall('term_wait_idle', [h, String(ms)], env, cwd).out);
    let w = wait(TO.idleMs);
    if (screenPromptKind(Buffer.from(termCall('term_read_screen', [h, '40'], env, cwd).out, 'utf8')) === 'trust') {
      log(`폴더 신뢰 확인: ${runChild('auto-answer.sh', ['--handle', h])}`);
      w = wait(TO.idleMs);
    }
    if (w === 'satisfied') return true;
    log(`tui-idle 60초 안 됨(${w}) — 120초 더 기다린다`);
    w = wait(TO.idleRetryMs);
    return w === 'satisfied';
  }
  const screenTail = (h, n = 20) => termCall('term_read_screen', [h, String(n)], env, cwd).out;
  function sendPromptFile(h) {
    if (pfile === '') return;
    const r = runChild('term-send-safe.sh', ['--handle', h, '--text', `지시 파일을 읽고 진행해 달라: ${pfile}`, '--timeout-ms', '60000']);
    if (r.startsWith('SENT ')) log(`지시 파일 경로를 보냈다: ${r}`);
    else log(`주의: 지시 파일 경로를 보내지 못했다(${r}) — 조정자가 직접 보낼 것`);
  }
  function recordLane(h, pid, sid, addr) {
    const wt = CD_PATH !== '' ? CD_PATH : worktreeOf(h);
    const sess = new Map([
      ['name', name], ['handle', h], ['kind', kind], ['spawned_by', 'coordinator'],
      ['pid', /^-?[0-9]+$/.test(pid) ? Number(pid) : 0], ['session_id', sid === '-' ? '' : sid], ['addr', addr === '' ? '' : `uds:${addr}`],
    ]);
    if (model.includes('[1m]')) sess.set('window', 1000000);
    const lane = new Map([['session', sess], ['worktree', wt], ['state', 'active']]);
    if (BRIEF !== '') lane.set('brief', BRIEF);
    coordStateCall(c, ['lane-add', name, J.stringify(lane, { indent: 0 })]);
    coordStateCall(c, ['event', 'spawned', name, J.stringify(new Map([['handle', h], ['kind', kind]]), { indent: 0 })]);
    const r = runSync('bash', [join(scriptsDir(), 'office.sh'), 'lane-up', name], { env: childEnv(), cwd, input: '' });   // 에이전트 오피스 표시(실패해도 무시)
    void r;
  }
  const claudeFlags = () => {
    let f = ` -n ${name}`;
    if (model !== '') f += ` --model ${q([model])}`;
    if (effort !== '') f += ` --effort ${q([effort])}`;
    if (autoc !== '') f += ` --autocompact ${q([autoc])}`;
    return f;
  };

  resolveTarget();

  const dryCommon = (cmdWord) => {
    log(`DRY ${q(['orca', 'terminal', 'create', '--worktree', TAB_SEL, '--title', name, '--json'])}`);
    log(`DRY term_send <h> ${q([tabLine(`cd ${dryCd()} && ${cmdWord}`)])} --enter (셸 프롬프트가 보인 뒤)`);
  };
  const dryDone = (k) => {
    const dl = new Map([['session', new Map([['kind', k], ['spawned_by', 'coordinator']])], ['state', 'active']]);
    if (BRIEF !== '') dl.set('brief', BRIEF);
    coordStateCall(c, ['lane-add', name, J.stringify(dl, { indent: 0 })]);
    echo(`DRY SPAWNED ${name} handle=- pid=- session_id=-`);
  };
  /** 세션 확인 → 지시 파일 → 기록 (claude·glm 공통). SPAWNED 줄까지 낸다 */
  function finishWithSession(h, pre, glmNote = false) {
    const s = waitNewSession(pre);
    if (s === null) {
      log(`--- 화면 발췌(${h}) ---`); c.errs.push(screenTail(h, 20));
      fail('process', `~/.claude/sessions 에 ${name} 새 세션 없음 handle=${h}`);
    }
    const [pid = '', sid = '', sock = ''] = s.split('\n')[0].split('\t');
    sendPromptFile(h);
    recordLane(h, pid, sid, sock);
    if (glmNote) log('다음: SendMessage 왕복 시험(<브랜치> / glm-ok / <모델>)을 한 번 받을 것(설계 §3.e-4)');
    echo(`SPAWNED ${name} handle=${h} pid=${pid} session_id=${sid}`);
  }
  const launchOrFail = (cmd) => {
    const rc = launchInTab(name, cmd);
    if (rc === 1) die(4, LAUNCH_ERR);
    if (rc !== 0) fail('wait', LAUNCH_ERR);
    const h = H;
    if (!waitTui(h)) fail('wait', `tui-idle 미충족 handle=${h}`);
    return h;
  };

  if (kind === 'claude') {
    const cmd = `${cfgSub(c, '.launch.claude')}${claudeFlags()}`;
    const pre = liveSessionPids();
    if (pre !== '') log(`같은 이름의 세션이 이미 떠 있다(pid ${pre}) — 새 pid 만 인정한다`);
    if (dry === 1) {
      dryCommon(cmd);
      log('DRY orca terminal wait --terminal <h> --for tui-idle --timeout-ms 60000 (아니면 120000)');
      log(`DRY ${SESS_DIR}/*.json 에서 name==${name} 인 새 pid 확인(최대 30초)`);
      if (pfile !== '') log(`DRY term-send-safe.sh --handle <h> --text '지시 파일을 읽고 진행해 달라: ${pfile}'`);
      dryDone('claude'); return 0;
    }
    finishWithSession(launchOrFail(cmd), pre);
    return 0;
  }

  if (kind === 'glm') {
    const pf = runChildQuiet('glm-preflight.sh').split('\n')[0];
    if (pf.startsWith('ok ')) log(`GLM 사전 확인: ${pf}`);
    else fail('preflight', pf.startsWith('fail ') ? pf.slice(5) : pf);
    let max = cfgSub(c, '.glm.max_sessions'); if (max === '') max = '1';
    let cnt = '0';
    if (hasRun(c)) cnt = activeGlm();
    const cntN = cnt === '' ? '0' : cnt;
    if (!/^[+-]?[0-9]+$/.test(cntN) || !/^[+-]?[0-9]+$/.test(max) || !(BigInt(cntN) < BigInt(max))) fail('glm-cap', `active=${cnt} max=${max}`);
    let launch = cfgSub(c, '.launch.glm'); if (launch === '') launch = 'glm';
    const pre = liveSessionPids();
    if (dry === 1) {
      dryCommon(`${launch} -n ${name}`);
      log('DRY tui-idle 대기 → 화면에 glm-5·API Usage Billing 확인(Claude Max 면 닫고 SPAWN_FAIL screen anthropic-account) → 세션 확인');
      if (pfile !== '') log(`DRY term-send-safe.sh --handle <h> --text '지시 파일을 읽고 진행해 달라: ${pfile}'`);
      dryDone('glm'); return 0;
    }
    const h = launchOrFail(`${launch} -n ${name}`);
    const scr = stripNl(noNul(screenTail(h, 60)));
    if (scr.includes('Claude Max')) { termCall('term_close', [h], env, cwd); fail('screen', 'anthropic-account'); }
    const excerpt = () => { log(`--- 화면 발췌(${h}) ---`); c.errs.push(`${scr.split('\n').slice(-20).join('\n')}\n`); };
    if (!scr.includes('glm-5')) { excerpt(); fail('screen', `no-glm-banner handle=${h}`); }
    if (!scr.includes('API Usage Billing')) { excerpt(); fail('screen', `no-api-billing handle=${h}`); }
    finishWithSession(h, pre, true);
    return 0;
  }

  // opencode
  let cmd = cfgSub(c, '.launch.opencode'); if (cmd === '') cmd = 'opencode --standalone';
  if (pfile !== '') log('주의: opencode 는 --prompt-file 을 보내지 않는다 — worker-start --spec 으로 넣을 것');
  if (dry === 1) {
    dryCommon(cmd);
    log('DRY tui-idle 대기 → 화면이 비어 있지 않은지 확인');
    dryDone('opencode'); return 0;
  }
  const h = launchOrFail(cmd);
  const scr = stripNl(noNul(screenTail(h, 40)));
  if (!hasNonSpace(env, scr)) fail('screen', `blank handle=${h}`);
  log(`--- 화면 끝(${h}): 빈 입력창인지 눈으로 확인 ---`); c.errs.push(`${scr.split('\n').slice(-8).join('\n')}\n`);
  log(`지시는 조정자가 넣는다: orca orchestration worker-start --terminal ${h} --worktree current --spec "<지시>" --json (지시문에 ! / @ 금지)`);
  recordLane(h, '-', '-', '');
  echo(`SPAWNED ${name} handle=${h} pid=- session_id=-`);
  return 0;

  /** 자식 스크립트 stdout 만(stderr 는 버린다) */
  function runChildQuiet(script) {
    const r = runSync('bash', [join(scriptsDir(), script)], { env: childEnv(), cwd, input: '' });
    return stripNl(r.out.toString('utf8'));
  }
  /** `coord_state '[.lanes[]? | select(.session.kind == "glm" and .state == "active")] | length'` */
  function activeGlm() {
    try {
      const { values } = J.parseStreamPartial(readFileSync(stateFile(c, ''), 'utf8'));
      const outs = [];
      for (const d of values) {
        try {
          const lanes = J.index(d, 'lanes');
          const it = Array.isArray(lanes) ? lanes : lanes instanceof Map ? [...lanes.values()] : [];
          outs.push(String(it.filter((l) => { try { return J.index(J.index(l, 'session'), 'kind') === 'glm' && J.index(l, 'state') === 'active'; } catch { return false; } }).length));
        } catch (e) { if (!(e instanceof J.JqError)) throw e; }
      }
      return stripNl(outs.join('\n'));
    } catch { return ''; }
  }
}

/** make_brief: --brief(최대 200자) 또는 --prompt-file 첫 글줄(최대 60자)에서 경로 토큰을 뺀 한 줄. 없으면 '' */
function makeBrief(env, briefArg, pfile) {
  const sp = spaceChars(env);
  let cap = 60, t;
  if (briefArg !== '') { cap = 200; t = briefArg; }
  else if (pfile !== '') {
    let text = '';
    try { text = readFileSync(pfile, 'utf8'); } catch { text = ''; }
    const first = text.split('\n').find((l) => hasNonSpace(env, l)) ?? '';
    let line = first.replaceAll('\r', '');
    line = line.replace(new RegExp(`^[${sp}#]+`), '');
    const i = line.indexOf('— ');
    t = i >= 0 ? line.slice(i + 2) : line;
  } else return '';
  const out = t.split(/[ \t\n]+/).filter((x) => x !== '' && !/^(?:\/|~\/|\.\/|\.\.\/|[A-Za-z]:[/\\])/.test(x)).join(' ');
  return out === '' ? '' : Array.from(out).slice(0, cap).join('');
}
/** `coord_state '.lanes["<n>"].brief // "" | tostring'` — 못 읽거나 오류면 '' */
function existingBrief(c, name) {
  try {
    const { values } = J.parseStreamPartial(readFileSync(stateFile(c, ''), 'utf8'));
    const outs = [];
    for (const d of values) {
      try { outs.push(J.tostring(J.alt(J.index(J.index(J.index(d, 'lanes'), name), 'brief'), ''))); } catch (e) { if (!(e instanceof J.JqError)) throw e; }
    }
    return stripNl(outs.join('\n'));
  } catch { return ''; }
}

/** `$(cd "$(dirname "$p")" && pwd)/$(basename "$p")` — 논리 경로(심볼릭 링크를 풀지 않는다) */
function absLogical(p, env, cwd) {
  let base = cwd;
  if (env.PWD && resolve(env.PWD) === env.PWD) { try { if (realpathSync(env.PWD) === realpathSync(cwd)) base = env.PWD; } catch { /* cwd 사용 */ } }
  const dir = resolve(base, dirname(p));
  return `${dir}/${basename(p)}`;
}

if (isMain(import.meta.url)) scriptMain(main);
