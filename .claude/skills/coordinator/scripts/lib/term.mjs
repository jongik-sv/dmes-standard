// 터미널 백엔드(orca·tmux). (옛 bash 판은 backup/scripts/lib/term.sh 에 퇴역 보관, 2026-10-09 W4) 공개 6함수만 CLI, _term_*·_orca_*·_tmux_* 는 안에만 둔다.
//   · 설정 .terminal_backend(기본 orca)는 common.mjs cfgSub 로 읽는다. 목록 밖이면 bash 판처럼 rc 127.
//   · orca 호출은 `orca <인자…> --json`, stderr 버림. 네이티브 exe/cmd 면 orca.cmd 로 재시도.
//   · 원문 글자 탐색(stale·turn_started·submitted)은 파싱 전 원문에 그대로 한다.
//   · 전역 _TB 는 호출 사이 캐시일 뿐이라 전달하지 않는다.
import { spawnSync } from 'node:child_process';
import { Ctx, cfgSub } from './common.mjs';
import { cliMain, isMain } from './js-cli.mjs';

// ---------- 백엔드 판별 ----------
function backendOf(env, cwd) {
  const c = new Ctx(env, cwd);
  const b = cfgSub(c, '.terminal_backend');
  return b === '' ? 'orca' : b;
}

// ---------- 외부 명령 한 곳 ----------
function runCmd(cmd, args, env) {
  // env.COORD_TERM_TIMEOUT_MS: 상주 폴러(console-poll.mjs)가 호출 하나의 시간 상한을 줄 때만 쓴다(없으면 제한 없음 — 기존 동작 그대로)
  const ms = Number(env.COORD_TERM_TIMEOUT_MS);
  const r = spawnSync(cmd, args, { env, encoding: 'buffer', windowsHide: true, ...(ms > 0 ? { timeout: ms, killSignal: 'SIGKILL' } : {}) });
  if (r.error && (r.error.code === 'ENOENT' || r.error.code === 'EACCES')) return null;
  if (r.error && r.error.code === 'ETIMEDOUT') return { stdout: Buffer.alloc(0), status: 124 };
  return r;
}
/** orca.exe/.cmd 재시도 헬퍼. stdout Buffer(실패해도 빈 값), status. stderr 는 버린다. */
function orcaJson(args, env) {
  let r = runCmd('orca', [...args, '--json'], env);
  if (r === null) r = runCmd('orca.cmd', [...args, '--json'], env);
  if (r === null) return { out: Buffer.alloc(0), status: 127 };
  return { out: Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.from(r.stdout ?? ''), status: r.status ?? 0 };
}
function tmux(args, env) {
  const r = runCmd('tmux', args, env);
  if (r === null) return { out: Buffer.alloc(0), status: 127 };
  return { out: Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.from(r.stdout ?? ''), status: r.status ?? 0 };
}
const latin = (b) => Buffer.isBuffer(b) ? b.toString('latin1') : String(b ?? '');

// ---------- orca ----------
function orcaStale(raw) {
  return raw.includes('terminal_handle_stale') || raw.includes('not found') || raw.includes('Unknown terminal');
}
const tsvEsc = (s) => s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
const tsvField = (v) => (typeof v === 'string' ? tsvEsc(v) : v == null ? '' : typeof v === 'object' ? tsvEsc(JSON.stringify(v)) : String(v));
function orcaList(env) {
  const { out } = orcaJson(['terminal', 'list'], env);
  const p = parseOrca(out);
  if (p.empty) return { out: '' };
  if (p.invalid) return { out: '', rc: 5 };
  const doc = p.doc;
  if (doc === null) return { out: '' };
  if (typeof doc !== 'object' || Array.isArray(doc)) return { out: '', rc: 5 };
  const r = doc.result;
  if (r === null || r === undefined) return { out: '' };
  if (typeof r !== 'object' || Array.isArray(r)) return { out: '', rc: 5 };
  const terms = r.terminals;
  if (terms === null || terms === undefined) return { out: '' };
  if (!Array.isArray(terms)) return { out: '' };
  // jq 스트리밍과 같게: 행 하나가 @tsv·인덱스에 걸리면 그때까지 낸 뒤 rc 5 로 끝난다.
  const cell = (v) => {
    const n = (v === null || v === undefined || v === false) ? '' : v;
    if (typeof n === 'string') return { s: tsvEsc(n) };
    if (typeof n === 'number' || n === true) return { s: String(n) };
    return null;
  };
  let s = '';
  for (const t of terms) {
    let h, title, wt, lo;
    if (t === null) { h = title = wt = lo = undefined; }
    else if (typeof t === 'object' && !Array.isArray(t)) { h = t.handle; title = t.title; wt = t.worktreePath; lo = t.lastOutputAt; }
    else return { out: s, rc: 5 };
    const row = [];
    for (const v of [h, title, wt]) {
      const c = cell(v);
      if (!c) return { out: s, rc: 5 };
      row.push(c.s);
    }
    let last;
    if (lo === null || lo === undefined || lo === false) last = '-';
    else if (typeof lo === 'number') last = String(Math.floor(lo / 1000));
    else return { out: s, rc: 5 };
    s += `${row.join('\t')}\t${last}\n`;
  }
  return { out: s };
}
function orcaReadScreen(handle, limit, env) {
  const { out } = orcaJson(['terminal', 'read', '--terminal', handle, '--screen', '--limit', limit], env);
  const p = parseOrca(out);
  if (p.empty) return { out: '' };
  if (p.invalid) return { rc: orcaStale(p.raw) ? 3 : 4 };
  const doc = p.doc;
  if (doc && typeof doc === 'object' && (doc.ok ?? false) === true) {
    const tail = doc.result?.terminal?.tail;
    if (tail == null) return { out: '' };
    if (!Array.isArray(tail)) return { out: '' };
    // jq -r: 문자열은 원문, 그 밖(객체·배열)은 pretty JSON(2칸) 그대로 낸다.
    let s = '';
    for (const v of tail) s += `${typeof v === 'string' ? v : v == null ? 'null' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}\n`;
    return { out: s };
  }
  return { rc: orcaStale(p.raw) ? 3 : 4 };
}
function orcaWaitIdle(handle, ms, env) {
  const { out } = orcaJson(['terminal', 'wait', '--terminal', handle, '--for', 'tui-idle', '--timeout-ms', ms], env);
  const p = parseOrca(out);
  if (p.empty || p.invalid) return { out: orcaStale(p.raw) ? 'stale\n' : 'timeout\n' };
  const doc = p.doc;
  if (!doc || typeof doc !== 'object' || (doc.ok ?? false) !== true) {
    return { out: orcaStale(p.raw) ? 'stale\n' : 'timeout\n' };
  }
  const sat = doc.result?.wait?.satisfied ?? false;
  return { out: sat === true ? 'satisfied\n' : 'timeout\n' };
}
function orcaSend(handle, text, rest, env) {
  const args = ['terminal', 'send', '--terminal', handle, '--text', text];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--enter') args.push('--enter');
    else if (rest[i] === '--wait-submit') { args.push('--wait-submit', rest[i + 1] ?? ''); i++; }
  }
  const { out } = orcaJson(args, env);
  const p = parseOrca(out);
  const raw = p.raw;
  // 빈 값·깨진 JSON: jq 필터가 한 번도 돌지 않아 ok 판정이 비어 stale/timeout 분기로 간다.
  // send 의 오류 글도 비어 `"error "` 가 된다(값 있는 문서의 "unknown" 과 다름).
  if (p.empty || p.invalid) {
    if (orcaStale(raw)) return { out: 'stale\n' };
    return { out: 'error \n' };
  }
  const doc = p.doc;
  if (!doc || typeof doc !== 'object' || (doc.ok ?? false) !== true) {
    if (orcaStale(raw)) return { out: 'stale\n' };
    // bash `jq -r '.error.message // .error // "unknown"'` 와 같게:
    // .error 가 문자열·숫자·배열이면 `.message` 인덱스 오류로 출력 없음 → `"error "`.
    // (배열도 객체지만 jq 는 문자열 키로 색인할 수 없어 오류다 — 실측.)
    const e = doc && typeof doc === 'object' ? doc.error : undefined;
    let msg;
    if (e !== null && typeof e === 'object' && !Array.isArray(e)) {
      const m = e.message;
      // jq -r 로 객체를 내면 pretty(2칸)라 head -1 은 `{`·`[` 한 줄이다.
      if (typeof m === 'string') msg = m;
      else if (m === null || m === undefined) { try { msg = JSON.stringify(e, null, 2).split('\n')[0]; } catch { msg = 'unknown'; } }
      else if (typeof m === 'object') { try { msg = JSON.stringify(m, null, 2).split('\n')[0]; } catch { msg = 'unknown'; } }
      else msg = String(m);
    } else if (e === null || e === undefined) {
      msg = 'unknown';
    } else {
      msg = '';
    }
    msg = String(msg).split('\n')[0];
    return { out: `error ${msg}\n` };
  }
  if (raw.includes('turn_started') || raw.includes('turnStarted')) return { out: 'turn_started\n' };
  if (raw.includes('"submitted"') || /submitted[\s\S]*true/.test(raw)) return { out: 'submitted\n' };
  return { out: 'accepted\n' };
}
function keyBytes(k) {
  if (k === 'Up') return '\x1b[A';
  if (k === 'Down') return '\x1b[B';
  if (k === 'Tab') return '\t';
  if (k === 'Enter') return '\r';
  if (k === 'Esc') return '\x1b';
  if (/^[1-9]$/.test(k)) return k;
  return null;
}
/** orca stdout 파싱. jq 와 같게: 입력 문서가 없으면(빈 값) 필터가 한 번도 돌지 않아 출력 없음.
 * EMPTY(빈 값) · {invalid} · {doc} 를 돌려준다. */
function parseOrca(out) {
  const text = out.toString('utf8');
  if (text.trim() === '') return { empty: true, raw: latin(out) };
  try { return { doc: JSON.parse(text), raw: latin(out) }; }
  catch { return { invalid: true, raw: latin(out) }; }
}
function orcaSendKeys(handle, keys, env) {
  if (!keys.length) return { out: 'error bad-key\n' };
  let b = '';
  for (const k of keys) {
    const v = keyBytes(k);
    if (v == null) return { out: 'error bad-key\n' };
    b += v;
  }
  if (b === '') return { out: 'error bad-key\n' };
  return orcaSend(handle, b, [], env);
}
function orcaClose(handle, env) {
  const { out } = orcaJson(['terminal', 'close', '--terminal', handle, '--tab'], env);
  const p = parseOrca(out);
  if (p.empty || p.invalid) {
    if (orcaStale(p.raw)) return { out: 'stale\n' };
    return { out: 'error\n' };
  }
  const doc = p.doc;
  if (doc && typeof doc === 'object' && (doc.ok ?? false) === true) return { out: 'closed\n' };
  if (orcaStale(p.raw)) return { out: 'stale\n' };
  return { out: 'error\n' };
}

// ---------- tmux ----------
function tmuxList(env) {
  const { out, status } = tmux(['list-panes', '-a', '-F', '#{pane_id}\t#{pane_title}\t#{pane_current_path}\t-'], env);
  if (status !== 0) return { out: '', rc: status };
  return { out: latin(out) };
}
function tmuxReadScreen(handle, limit, env) {
  const lim = limit ?? '';
  const use = lim === '' ? '40' : lim;
  // bash 는 `tmux … | tail` 순서라 인자가 나빠도 tmux 를 먼저 부른다(로그 파일 대조 때문).
  // tmux 실패는 tail 이 빈 입력으로 삼켜 rc 0 이고, tail 인자가 나쁠 때만 rc 3.
  const r = tmux(['capture-pane', '-p', '-t', handle], env);
  if (!/^[0-9]+$/.test(use)) return { rc: 3 };
  const text = r.status === 0 ? latin(r.out) : '';
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const keep = lines.slice(-Math.max(0, Number(use)));
  return { out: keep.map((l) => `${l}\n`).join('') };
}
function tmuxWaitIdle(handle, ms, env) {
  // bash `$2 / 1000` 정수 산술과 같게: 정수 꼴이 아니면 0(빈 변수와 같음)
  const n = /^-?[0-9]+$/.test(ms ?? '') ? Number(ms) : 0;
  const end = Math.floor(Date.now() / 1000) + Math.floor(n / 1000);
  for (;;) {
    if (Math.floor(Date.now() / 1000) > end) break;
    const a = tmux(['capture-pane', '-p', '-t', handle], env);
    if (a.status !== 0) return { out: 'stale\n' };
    runCmd('sleep', ['2'], env);
    const b = tmux(['capture-pane', '-p', '-t', handle], env);
    if (b.status !== 0) return { out: 'stale\n' };
    const bs = latin(b.out);
    if (latin(a.out) === bs && !bs.includes('esc to interrupt')) return { out: 'satisfied\n' };
  }
  return { out: 'timeout\n' };
}
function tmuxSend(handle, text, rest, env) {
  const r = tmux(['send-keys', '-t', handle, '-l', text], env);
  if (r.status !== 0) return { out: 'stale\n' };
  if (rest.includes('--enter')) tmux(['send-keys', '-t', handle, 'Enter'], env);
  return { out: 'accepted\n' };
}
function tmuxClose(handle, env) {
  const r = tmux(['kill-pane', '-t', handle], env);
  return { out: r.status === 0 ? 'closed\n' : 'stale\n' };
}
function tmuxSendKeys(handle, keys, env) {
  if (!keys.length) return { out: 'error bad-key\n' };
  const a = [];
  for (const k of keys) {
    if (k === 'Esc') a.push('Escape');
    else if (k === 'Up' || k === 'Down' || k === 'Tab' || k === 'Enter' || /^[1-9]$/.test(k)) a.push(k);
    else return { out: 'error bad-key\n' };
  }
  if (!a.length) return { out: 'error bad-key\n' };
  const r = tmux(['send-keys', '-t', handle, ...a], env);
  if (r.status !== 0) return { out: 'stale\n' };
  return { out: 'accepted\n' };
}

// ---------- 공개 디스패치 ----------
function call(be, name, args, env, cwd) {
  if (be === 'orca') {
    if (name === 'list') return orcaList(env);
    if (name === 'read') return orcaReadScreen(args[0] ?? '', args[1] ?? '40', env);
    if (name === 'wait') return orcaWaitIdle(args[0] ?? '', args[1] ?? '', env);
    if (name === 'send') return orcaSend(args[0] ?? '', args[1] ?? '', args.slice(2), env);
    if (name === 'close') return orcaClose(args[0] ?? '', env);
    if (name === 'keys') return orcaSendKeys(args[0] ?? '', args.slice(1), env);
  } else if (be === 'tmux') {
    if (name === 'list') return tmuxList(env);
    if (name === 'read') return tmuxReadScreen(args[0] ?? '', args[1] ?? '40', env);
    if (name === 'wait') return tmuxWaitIdle(args[0] ?? '', args[1] ?? '', env);
    if (name === 'send') return tmuxSend(args[0] ?? '', args[1] ?? '', args.slice(2), env);
    if (name === 'close') return tmuxClose(args[0] ?? '', env);
    if (name === 'keys') return tmuxSendKeys(args[0] ?? '', args.slice(1), env);
  }
  return { rc: 127 };
}

const mk = (name) => ({
  run: ({ args, env, cwd }) => {
    const be = backendOf(env, cwd);
    if (be !== 'orca' && be !== 'tmux') return { rc: 127 };
    return call(be, name, args, env, cwd);
  },
});

export const functions = {
  term_list: mk('list'),
  term_read_screen: mk('read'),
  term_wait_idle: mk('wait'),
  term_send: mk('send'),
  term_close: mk('close'),
  term_send_keys: mk('keys'),
};
if (isMain(import.meta.url)) cliMain(functions);
