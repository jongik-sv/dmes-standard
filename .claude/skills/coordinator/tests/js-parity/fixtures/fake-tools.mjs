// 대조 명세들이 같이 쓰는 가짜 도구. term-send-safe·auto-answer 명세가 PATH 앞(<WORK>/bin)에 둔다.
//   가짜 orca: 받은 인자를 JSON 한 줄로 fake/orca.log 에 덧붙이고 fake/ 의 파일대로 답한다.
//     terms  공백 구분 `핸들` 또는 `핸들=경로`(경로의 @REPO 는 환경 변수 COORD_REPO 로 바뀐다)   screens/<h>.txt  화면(<h>.<n>.txt 는 n 번째 읽기용)
//     idle  true|false|stale|invalid    send  turn_started|submitted|accepted|stale|error|empty
//     (spawn-lane 용) worktrees  `worktree list` 가 낼 글(@REPO 치환)   create  ok|fail|nohandle   newsession  `-n <이름>` 이 든 글을 send 하면 만들 세션 파일(@PID 는 FAKE_LIVE_PID, @NAME 은 `-n <이름>` 의 이름)
export const exe = (data) => ({ data, mode: 0o755 });
export const FAKE_ORCA = `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
const F = process.env.FAKE_DIR;
fs.appendFileSync(F + '/orca.log', JSON.stringify(a) + '\\n');
const rd = (n) => { try { return fs.readFileSync(F + '/' + n, 'utf8'); } catch { return null; } };
const out = (o) => process.stdout.write(typeof o === 'string' ? o : JSON.stringify(o));
const opt = (k) => { const i = a.indexOf(k); return i < 0 ? '' : a[i + 1]; };
const h = opt('--terminal');
const stale = () => out({ ok: false, error: { message: 'terminal_handle_stale' } });
if (a[0] === 'worktree' && a[1] === 'list') {
  const w = rd('worktrees');
  if (w === null) out({ ok: false, error: { message: 'no worktrees' } }); else out(w.replace(/@REPO/g, process.env.COORD_REPO || ''));
  process.exit(0);
}
if (a[0] !== 'terminal') { out({ ok: false, error: { message: 'unknown' } }); process.exit(0); }
if (a[1] === 'create') {
  const m = (rd('create') || 'ok').trim();
  if (m === 'fail') out({ ok: false, error: { message: 'Timed out waiting for terminal handle' } });
  else if (m === 'nohandle') out({ ok: true, result: { terminal: {} } });
  else out({ ok: true, result: { terminal: { handle: 'term_new1', title: opt('--title') } } });
  process.exit(0);
}
if (a[1] === 'close') { out({ ok: true, result: {} }); process.exit(0); }
if (a[1] === 'list') {
  const t = (rd('terms') || '').split(/\\s+/).filter(Boolean);
  const repo = process.env.COORD_REPO || '';
  out({ ok: true, result: { terminals: t.map((x) => { const i = x.indexOf('='); return { handle: i < 0 ? x : x.slice(0, i), title: '', worktreePath: i < 0 ? '' : x.slice(i + 1).replace('@REPO', repo) }; }) } });
} else if (a[1] === 'read') {
  let n = Number(rd('reads/' + h) || 0) + 1;
  fs.mkdirSync(F + '/reads', { recursive: true });
  fs.writeFileSync(F + '/reads/' + h, String(n));
  let t = rd('screens/' + h + '.' + n + '.txt');
  if (t === null) t = rd('screens/' + h + '.txt');
  if (t === null) stale();
  else {
    const lines = t.split('\\n'); if (lines[lines.length - 1] === '') lines.pop();
    const lim = Number(opt('--limit'));
    out({ ok: true, result: { terminal: { tail: lim > 0 ? lines.slice(-lim) : lines } } });
  }
} else if (a[1] === 'wait') {
  const m = (rd('idle') || 'true').trim();
  if (m === 'stale') stale(); else if (m === 'invalid') out('garbage'); else out({ ok: true, result: { wait: { satisfied: m === 'true' } } });
} else if (a[1] === 'send') {
  const text = opt('--text');
  const ns = rd('newsession');
  const nm = /(^| )-n ([A-Za-z0-9._-]+)/.exec(text);
  if (ns !== null && nm && process.env.FAKE_LIVE_PID) {
    const d = process.env.HOME + '/.claude/sessions';
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(d + '/' + process.env.FAKE_LIVE_PID + '.json', ns.replace(/@PID/g, process.env.FAKE_LIVE_PID).replace(/@NAME/g, nm[2]));
  }
  const m = (rd('send') || 'turn_started').trim();
  if (m === 'stale') stale();
  else if (m === 'error') out({ ok: false, error: { message: 'boom' } });
  else if (m === 'empty') out('');
  else if (m === 'submitted') out({ ok: true, result: { submitted: true } });
  else if (m === 'accepted') out({ ok: true, result: {} });
  else out({ ok: true, result: { phase: 'turn_started' } });
} else out({ ok: false, error: { message: 'unknown' } });
`;
export const FAKE_DATE = '#!/bin/sh\ncase "$*" in\n  "+%s") echo "$FAKE_NOW_S" ;;\n  "-u +%Y-%m-%dT%H:%M:%S.%N") echo "$FAKE_ISO_NS" ;;\n  "+%Y-%m-%dT%H:%M:%S%z") echo "$FAKE_ISO_TZ" ;;\n  *) exec /bin/date "$@" ;;\nesac\n';
export const FAKE_SLEEP = '#!/bin/sh\n# 가짜 sleep: 기다리지 않는다. 정수 초(1 이상)만 fake/sleep.log 에 `sleep <초>` 로 남긴다(0.2초 폴링은 console-input 소관이라 남기지 않는다)\ncase "$1" in \'\'|*[!0-9]*|0) ;; *) [ -z "$FAKE_DIR" ] || echo "sleep $1" >> "$FAKE_DIR/sleep.log" ;; esac\nexit 0\n';
/** 고정 시각(초 단위 + 123ms)과 그것을 내는 환경 변수 */
export function clock() {
  const ms = Math.floor(Date.now() / 1000) * 1000 + 123;
  const iso = new Date(ms).toISOString().replace('Z', '');
  const sec = new Date(ms).toISOString().slice(0, 19);
  return { ms, env: { COORD_JS_NOW_MS: String(ms), FAKE_NOW_S: String(Math.floor(ms / 1000)), FAKE_ISO_NS: `${iso}000000`, FAKE_ISO_TZ: `${sec}+0000` } };
}
