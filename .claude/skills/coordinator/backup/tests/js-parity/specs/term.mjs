// scripts/lib/term.sh ↔ term.mjs 대조 명세(스위치 COORD_JS_TERM).
// 가짜 orca/tmux(PATH 앞 bin)가 받은 인자 줄을 로그 파일에 남겨 인자 배열 일치까지 파일 비교로 본다(brief 8.2).
// 원문 글자 탐색(stale·turn_started·submitted)은 파싱 전 원문 기준이므로 응답 변형을 생성기로 만든다.
const SH = 'scripts/lib/term.sh';
const MJS = 'scripts/lib/term.mjs';

const ORCA_BIN = '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$ORCA_LOG"\ncat "$ORCA_RESP"\n';
const TMUX_BIN = '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$TMUX_LOG"\nif [ "$TMUX_FAIL" = 1 ]; then exit 1; fi\ncase "$1" in capture-pane|list-panes) cat "$TMUX_RESP" ;; *) exit 0 ;; esac\n';

const HANDLES = ['h1', 'term-001', 'abc.XYZ:_-9', '', '한글', 'h x', 'a/b', '%1'];
const TEXTS = ['', 'hello', 'git status', '한글 입력', 'a  b', "it's", 'x\ty', '--enter', 'a'.repeat(300)];
const BACKENDS = ['"orca"', '"orca"', '"orca"', '"tmux"', '"bogus"', '""', 'null'];

function cfg(rng) {
  const b = rng.pick(BACKENDS);
  if (b === '"orca"' && rng.chance(0.3)) return {};
  return { '.coord.json': `{"terminal_backend":${b}}` };
}
function orcaFiles(resp) {
  return {
    'bin/orca': { data: ORCA_BIN, mode: 0o755 },
    'resp.json': resp,
  };
}
function orcaEnv() {
  return {
    COORD_REPO: '<WORK>',
    PATH: `<WORK>/bin:${process.env.PATH}`,
    ORCA_LOG: '<WORK>/orca.log',
    ORCA_RESP: '<WORK>/resp.json',
  };
}
function tmuxFiles(resp) {
  return {
    'bin/tmux': { data: TMUX_BIN, mode: 0o755 },
    'resp.txt': resp,
  };
}
function tmuxEnv(fail) {
  return {
    COORD_REPO: '<WORK>',
    PATH: `<WORK>/bin:${process.env.PATH}`,
    TMUX_LOG: '<WORK>/tmux.log',
    TMUX_RESP: '<WORK>/resp.txt',
    TMUX_FAIL: fail ? '1' : '0',
  };
}
const J = (v) => JSON.stringify(v);

// ---------- orca 응답 변형 ----------
function listResp(rng) {
  const r = rng.next();
  if (r < 0.08) return rng.pick(['{bad', 'not json', '', '"abc"', '5', 'null']);
  if (r < 0.11) return J({ ok: true, result: { terminals: [{ handle: 'h1' }, 5, 'x', null, [1], { handle: 'h2', title: { a: 1 } }] } });
  if (r < 0.13) return J({ ok: true, result: { terminals: [{ handle: 'h1', title: 't', worktreePath: '/w', lastOutputAt: 'soon' }] } });
  const n = rng.int(0, 3);
  const terms = [];
  for (let i = 0; i < n; i++) {
    const t = { handle: rng.pick(HANDLES.filter((h) => h !== '')) || 'h' };
    if (rng.chance(0.8)) t.title = rng.pick(['', 'main', '한글 제목', 'a\tb', 'x\ny', 't"q', 'back\\slash']);
    if (rng.chance(0.8)) t.worktreePath = rng.pick(['/w', '/Users/x/wt', '', 'C:/x']);
    const l = rng.next();
    if (l < 0.7) t.lastOutputAt = rng.int(0, 9999999999999);
    else if (l < 0.8) t.lastOutputAt = null;
    else if (l < 0.85) t.lastOutputAt = 0;
    terms.push(t);
  }
  return J({ ok: true, result: { terminals: terms } });
}
function readResp(rng) {
  const r = rng.next();
  if (r < 0.5) {
    const n = rng.int(0, 5);
    const tail = Array.from({ length: n }, () => rng.pick(['$', 'ok', '한글 줄', 'a\tb', '', '  indented  ', 'x'.repeat(200)]));
    if (rng.chance(0.06)) tail.push(rng.pick([{ a: 1 }, [1, 2], 5, null, true]));
    const doc = { ok: true, result: { terminal: { tail } } };
    if (rng.chance(0.05)) delete doc.result.terminal.tail;
    return J(doc);
  }
  if (r < 0.62) return J({ ok: false, error: 'terminal_handle_stale: gone' });
  if (r < 0.68) return J({ ok: false, error: 'thing "not found" here' });
  if (r < 0.72) return J({ ok: false, error: 'Unknown terminal h' });
  if (r < 0.8) return J({ ok: false, error: 'plain boom' });
  if (r < 0.86) return rng.pick(['{bad', 'oops terminal_handle_stale', 'oops plain', '']);
  return J({ ok: false });
}
function waitResp(rng) {
  const r = rng.next();
  if (r < 0.4) return J({ ok: true, result: { wait: { satisfied: rng.chance(0.5) } } });
  if (r < 0.45) return J({ ok: true, result: { wait: {} } });
  if (r < 0.55) return J({ ok: false, error: 'terminal_handle_stale' });
  if (r < 0.65) return J({ ok: false, error: 'busy' });
  if (r < 0.72) return rng.pick(['{bad', 'stale Unknown terminal', 'plain', '']);
  return J({ ok: false });
}
function sendResp(rng) {
  const r = rng.next();
  if (r < 0.2) return J({ ok: true, result: { turn: 'turn_started' } });
  if (r < 0.28) return J({ ok: true, result: { turnStarted: true } });
  if (r < 0.36) return J({ ok: true, result: { submitted: true } });
  if (r < 0.42) return '{"ok":true,"result":{"status":"\\"submitted\\""}}';
  if (r < 0.55) return J({ ok: true, result: {} });
  if (r < 0.62) return J({ ok: false, error: 'terminal_handle_stale now' });
  if (r < 0.7) return J({ ok: false, error: { message: rng.pick(['boom', 'line1\nline2', '한글 오류']) } });
  if (r < 0.76) return J({ ok: false, error: 'plain string' });
  if (r < 0.79) return J({ ok: false, error: { code: 5 } });
  if (r < 0.81) return J({ ok: false, error: [1, 'x'] });
  if (r < 0.84) return J({ ok: false });
  if (r < 0.88) return rng.pick(['{bad', '', 'broken "not found"']);
  return J({ ok: true, result: {}, note: 'turn_started later' });
}
function closeResp(rng) {
  const r = rng.next();
  if (r < 0.4) return J({ ok: true });
  if (r < 0.55) return J({ ok: false, error: 'Unknown terminal' });
  if (r < 0.7) return J({ ok: false, error: 'busy' });
  if (r < 0.78) return rng.pick(['{bad', '', 'x terminal_handle_stale y']);
  return J({ ok: false });
}

const KEYS_OK = ['Up', 'Down', 'Tab', 'Enter', 'Esc', '1', '5', '9'];
const KEYS_BAD = ['bad-key', '', 'F1', 'up', 'ENTER', '0', '10', 'a b'];
function keysArgs(rng) {
  const r = rng.next();
  if (r < 0.55) return Array.from({ length: rng.int(1, 4) }, () => rng.pick(KEYS_OK));
  if (r < 0.7) { const a = [rng.pick(KEYS_OK)]; a.splice(rng.int(0, 1), 0, rng.pick(KEYS_BAD)); return a; }
  if (r < 0.78) return [];
  return [rng.pick(KEYS_BAD)];
}

export default {
  module: 'term',
  sh: SH,
  mjs: MJS,
  source: ['scripts/lib/compat.sh', 'scripts/lib/common.sh'],
  switchEnv: 'COORD_JS_TERM',
  env: { COORD_REPO: '<WORK>' },
  functions: {
    term_list: {
      js: ['term_list'],
      fixed: [
        { label: 'orca: 빈 목록', args: [], files: { ...cfg({ pick: () => '"orca"', chance: () => false }), ...orcaFiles(J({ ok: true, result: { terminals: [] } })) }, env: orcaEnv(), stdin: '' },
        { label: 'backend 목록 밖이면 rc 127', args: [], files: { '.coord.json': '{"terminal_backend":"bogus"}' }, env: { COORD_REPO: '<WORK>' }, stdin: '' },
        { label: 'tmux: 고정 표', args: [], files: { '.coord.json': '{"terminal_backend":"tmux"}', ...tmuxFiles('%1\ttitle\t/path\t-\n') }, env: tmuxEnv(false), stdin: '' },
      ],
      gen: (rng) => {
        const c = cfg(rng);
        const be = (c['.coord.json'] || '').includes('tmux') ? 'tmux' : 'orca';
        if (be === 'tmux' || (c['.coord.json'] || '').includes('bogus')) {
          // 목록 밖 이름(bogus)은 양쪽 rc 127 로 orca 를 부르지 않는다.
          // JSON null·""·없음은 빈 값 → orca 기본값이므로 아래 가짜 orca 분기로 간다.
          if (be !== 'tmux') return { args: [], files: c, env: { COORD_REPO: '<WORK>' }, stdin: '' };
          return { args: [], files: { ...c, ...tmuxFiles('%1\ttitle\t/path\t-\n%2\tt2\t/p2\t-\n') }, env: tmuxEnv(rng.chance(0.05)), stdin: '' };
        }
        return { args: [], files: { ...c, ...orcaFiles(listResp(rng)) }, env: orcaEnv(), stdin: '' };
      },
    },
    term_read_screen: {
      js: ['term_read_screen'],
      fixed: [
        { label: 'orca: ok면 줄을 낸다', args: ['h1'], files: { ...orcaFiles(J({ ok: true, result: { terminal: { tail: ['a', 'b'] } } })) }, env: orcaEnv(), stdin: '' },
        { label: 'orca: stale면 rc 3', args: ['h1'], files: { ...orcaFiles(J({ ok: false, error: 'terminal_handle_stale' })) }, env: orcaEnv(), stdin: '' },
        { label: 'orca: 일반 오류면 rc 4', args: ['h1'], files: { ...orcaFiles(J({ ok: false, error: 'boom' })) }, env: orcaEnv(), stdin: '' },
      ],
      gen: (rng) => {
        const c = cfg(rng);
        if ((c['.coord.json'] || '').includes('tmux')) {
          const lines = Array.from({ length: rng.int(0, 60) }, (_, i) => `line${i}`);
          return {
            args: [rng.pick(HANDLES), ...(rng.chance(0.5) ? [String(rng.pick([1, 5, 40, 100, '', 'abc']))] : [])],
            files: { ...c, ...tmuxFiles(lines.map((l) => `${l}\n`).join('')) },
            env: tmuxEnv(rng.chance(0.05)),
            stdin: '',
          };
        }
        if ((c['.coord.json'] || '').includes('bogus')) return { args: ['h'], files: c, env: { COORD_REPO: '<WORK>' }, stdin: '' };
        return {
          args: [rng.pick(HANDLES), ...(rng.chance(0.4) ? [String(rng.int(1, 60))] : [])],
          files: { ...c, ...orcaFiles(readResp(rng)) },
          env: orcaEnv(),
          stdin: '',
        };
      },
    },
    term_wait_idle: {
      js: ['term_wait_idle'],
      fixed: [
        { label: 'orca: satisfied', args: ['h', '1000'], files: { ...orcaFiles(J({ ok: true, result: { wait: { satisfied: true } } })) }, env: orcaEnv(), stdin: '' },
        { label: 'orca: ok 아니면 timeout', args: ['h', '1000'], files: { ...orcaFiles(J({ ok: false })) }, env: orcaEnv(), stdin: '' },
      ],
      gen: (rng) => {
        const c = cfg(rng);
        if ((c['.coord.json'] || '').includes('tmux') && rng.chance(0.15)) {
          const r = rng.next();
          const screen = r < 0.6 ? 'same screen\n' : 'work esc to interrupt now\n';
          return { args: [rng.pick(HANDLES), rng.pick(['500', '1000', '0'])], files: { ...c, ...tmuxFiles(screen) }, env: tmuxEnv(r < 0.75 ? false : true), stdin: '' };
        }
        if ((c['.coord.json'] || '').includes('bogus')) return { args: ['h', '1'], files: c, env: { COORD_REPO: '<WORK>' }, stdin: '' };
        return { args: [rng.pick(HANDLES), rng.pick(['1000', '0', '5000'])], files: { ...c, ...orcaFiles(waitResp(rng)) }, env: orcaEnv(), stdin: '' };
      },
    },
    term_send: {
      js: ['term_send'],
      fixed: [
        { label: 'orca: accepted', args: ['h', 'hi'], files: { ...orcaFiles(J({ ok: true, result: {} })) }, env: orcaEnv(), stdin: '' },
        { label: 'orca: stale', args: ['h', 'hi'], files: { ...orcaFiles(J({ ok: false, error: 'not found' })) }, env: orcaEnv(), stdin: '' },
        { label: 'orca: --enter 전달', args: ['h', 'hi', '--enter'], files: { ...orcaFiles(J({ ok: true })) }, env: orcaEnv(), stdin: '' },
      ],
      gen: (rng) => {
        const c = cfg(rng);
        const rest = rng.pick([[], ['--enter'], ['--wait-submit', '5'], ['--enter', '--wait-submit', '3']]);
        if ((c['.coord.json'] || '').includes('tmux')) {
          return { args: [rng.pick(HANDLES), rng.pick(TEXTS), ...rest], files: { ...c, ...tmuxFiles('') }, env: tmuxEnv(rng.chance(0.06)), stdin: '' };
        }
        if ((c['.coord.json'] || '').includes('bogus')) return { args: ['h', 'x'], files: c, env: { COORD_REPO: '<WORK>' }, stdin: '' };
        return { args: [rng.pick(HANDLES), rng.pick(TEXTS), ...rest], files: { ...c, ...orcaFiles(sendResp(rng)) }, env: orcaEnv(), stdin: '' };
      },
    },
    term_close: {
      js: ['term_close'],
      fixed: [
        { label: 'orca: closed', args: ['h'], files: { ...orcaFiles(J({ ok: true })) }, env: orcaEnv(), stdin: '' },
        { label: 'orca: stale', args: ['h'], files: { ...orcaFiles(J({ ok: false, error: 'Unknown terminal' })) }, env: orcaEnv(), stdin: '' },
      ],
      gen: (rng) => {
        const c = cfg(rng);
        if ((c['.coord.json'] || '').includes('tmux')) {
          return { args: [rng.pick(HANDLES)], files: { ...c, ...tmuxFiles('') }, env: tmuxEnv(rng.chance(0.06)), stdin: '' };
        }
        if ((c['.coord.json'] || '').includes('bogus')) return { args: ['h'], files: c, env: { COORD_REPO: '<WORK>' }, stdin: '' };
        return { args: [rng.pick(HANDLES)], files: { ...c, ...orcaFiles(closeResp(rng)) }, env: orcaEnv(), stdin: '' };
      },
    },
    term_send_keys: {
      js: ['term_send_keys'],
      fixed: [
        { label: 'orca: bad-key는 보내지 않는다', args: ['h', 'F1'], files: { ...orcaFiles(J({ ok: true })) }, env: orcaEnv(), stdin: '' },
        { label: 'orca: Up+Enter', args: ['h', 'Up', 'Enter'], files: { ...orcaFiles(J({ ok: true })) }, env: orcaEnv(), stdin: '' },
        { label: 'console-keys.sh: 빈 키는 bad-key', args: ['h'], files: { ...orcaFiles(J({ ok: true })) }, env: orcaEnv(), stdin: '' },
      ],
      gen: (rng) => {
        const c = cfg(rng);
        const keys = keysArgs(rng);
        if ((c['.coord.json'] || '').includes('tmux')) {
          return { args: [rng.pick(HANDLES), ...keys], files: { ...c, ...tmuxFiles('') }, env: tmuxEnv(rng.chance(0.06)), stdin: '' };
        }
        if ((c['.coord.json'] || '').includes('bogus')) return { args: ['h', 'Up'], files: c, env: { COORD_REPO: '<WORK>' }, stdin: '' };
        return { args: [rng.pick(HANDLES), ...keys], files: { ...c, ...orcaFiles(sendResp(rng)) }, env: orcaEnv(), stdin: '' };
      },
    },
  },
};
