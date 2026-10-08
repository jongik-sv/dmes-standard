// scripts/lib/compat.sh ↔ compat.mjs 대조 명세(스위치 COORD_JS_COMPAT).
// 정답은 bash 판. 형식: tests/js-parity/README.md.
// epoch_fmt: 실제 쓰이는 지시자(Y m d H M S z + s)만 대조한다. 목록 밖 지시자(%Q 등)는
//   bash 판(date)이 그대로 출력하고 JS 판은 rc 1 + 빈 출력이므로 대조하지 않는다(brief 8.1).
// pid_alive: -1 같은 음수는 bash kill -0 이 「모든 프로세스」 신호가 되어 성공하므로 입력에서 뺀다.
// 신호 계열(kill/pkill)은 pid 검증(2 이상 정수만)만 하니스로 하고 실제 종료 순서는 node --test 별도 시험으로 한다.
import { gen } from '../gen.mjs';

const SH = 'scripts/lib/compat.sh';
const MJS = 'scripts/lib/compat.mjs';

// ---------- epoch_fmt: 실제 사용 집합 ----------
const FMTS = [
  '%Y-%m-%dT%H:%M:%S',
  '%Y-%m-%dT%H:%M:%SZ',
  '%Y-%m-%dT%H:%M:%S.000Z',
  '%Y%m%d%H%M.%S',
  '%H:%M',
  '%Y-%m-%dT%H:%M:%S%z',
  '%Y-%m-%d',
  '%s',
];
const EPOCHS = ['0', '1', '86400', '86399', '1791507600', '1700000000', '4102444800', '9999999999',
  '00012', '007', '1.5', 'abc', '', 'null', '-1', '0x10', '+5', ' 7', '99999999999', '123456789012'];

// ---------- 가짜 /proc 트리(윈도우 모드 결정적 대조용) ----------
function procFiles(rng) {
  const files = {};
  const pids = ['100', '200', '300', '400'];
  const ppids = { 100: '1', 200: '100', 300: '200', 400: '100' };
  const cmds = {
    100: ['init'],
    200: ['bash', '-c', 'echo hi'],
    300: ['sleep', '99'],
    400: ['node', 'server.js'],
  };
  if (rng.chance(0.3)) {
    ppids['500'] = '100';
    cmds['500'] = ['bash', '-c', `echo a\n5 MARK_${rng.int(10, 99)}`];
    pids.push('500');
  }
  for (const p of pids) {
    files[`proc/${p}/ppid`] = `${ppids[p]}\n`;
    const parts = cmds[p].map((s) => Buffer.from(s, 'latin1'));
    files[`proc/${p}/cmdline`] = Buffer.concat(parts.map((b) => Buffer.concat([b, Buffer.from([0])])));
  }
  files['proc/self/cwd'] = 'x';
  files['bin/lsof'] = { data: '#!/bin/sh\nexit 1\n', mode: 0o755 };
  return files;
}
const WIN_ENV = { COMPAT_FORCE_OS: 'windows', COMPAT_PROC_ROOT: '<WORK>/proc', COORD_JS_CALLER_PID: '999997' };
function winCase(rng) {
  return { files: procFiles(rng), env: { ...WIN_ENV, PATH: `<WORK>/bin:${process.env.PATH}` } };
}

const PIDS_INVALID = ['', '0', '1', 'abc', '1.5', '1 2', '999999', '99999999999', '00x', ' 7'];
const KILL_PIDS = ['', '0', '1', '-1', 'abc', '', '999999', '99999999999', '2x', '0x10'];

export default {
  module: 'compat',
  sh: SH,
  mjs: MJS,
  switchEnv: 'COORD_JS_COMPAT',
  functions: {
    compat_stat_mtime: {
      js: ['compat_stat_mtime'],
      fixed: [{ label: 'compat.sh: 방금 만든 파일은 숫자', args: ['f.txt'], files: { 'f.txt': 'x' }, stdin: '' }],
      gen: (rng) => ({ args: [rng.pick(['f.txt', 'missing', 'd', 'd/g', ''])], files: { 'f.txt': 'x', 'd/g': 'y' }, stdin: '' }),
    },
    compat_stat_mode: {
      js: ['compat_stat_mode'],
      fixed: [{ label: 'compat.sh: 권한 640', args: ['f.txt'], files: { 'f.txt': { data: 'x', mode: 0o640 } }, stdin: '' }],
      gen: (rng) => ({
        args: [rng.pick(['f.txt', 'missing', 'd', ''])],
        files: { 'f.txt': { data: 'x', mode: rng.pick([0o640, 0o600, 0o755]) }, 'd/g': 'y' },
        stdin: '',
      }),
    },
    compat_stat_info: {
      js: ['compat_stat_info'],
      fixed: [
        { label: 'compat.sh: 없는 파일은 rc 1', args: ['nofile'], stdin: '' },
        { label: 'compat.sh: uid 권한 mtime 크기', args: ['f.txt'], files: { 'f.txt': 'x' }, stdin: '' },
      ],
      gen: (rng) => ({ args: [rng.pick(['f.txt', 'missing', 'd', 'd/g', ''])], files: { 'f.txt': 'x', 'd/g': 'y' }, stdin: '' }),
    },
    compat_epoch_fmt: {
      js: ['compat_epoch_fmt'],
      fixed: [
        { label: 'compat.sh: epoch 형식(UTC)', args: ['86400', '%Y-%m-%dT%H:%M:%S', '-u'], stdin: '' },
        { label: 'compat.sh: 앞에 0이 붙은 epoch는 BSD date와 같게(00012→10)', args: ['00012', '%Y-%m-%dT%H:%M:%S', '-u'], stdin: '' },
        { label: 'compat.sh: 1.5는 실패(rc 1)', args: ['1.5', '%Y-%m-%dT%H:%M:%S', '-u'], stdin: '' },
        { label: 'console-input.sh: 밀리초 UTC', args: ['1700000000', '%Y-%m-%dT%H:%M:%S', '-u'], stdin: '' },
        { label: 'common.sh: %H:%M', args: ['1700000000', '%H:%M'], stdin: '' },
        { label: 'touch_ago 형식', args: ['1700000000', '%Y%m%d%H%M.%S'], stdin: '' },
      ],
      gen: (rng) => ({
        args: [rng.pick(EPOCHS), rng.pick(FMTS), ...(rng.chance(0.4) ? ['-u'] : [])],
        stdin: '',
      }),
    },
    compat_touch_ago: {
      js: ['compat_touch_ago'],
      fixed: [{ label: 'compat.sh: 2시간 전', args: ['7200', '<WORK>/f.txt'], files: { 'f.txt': 'x' }, stdin: '' }],
      gen: (rng) => ({
        args: [String(rng.int(0, 100000)), rng.pick(['<WORK>/f.txt', '<WORK>/d/g'])],
        files: { 'f.txt': 'x', 'd/g': 'y' },
        stdin: '',
      }),
    },
    compat_ps_table: {
      js: ['compat_ps_table'],
      fixed: [
        { label: 'compat.sh Win: ps 표는 /proc에서', args: [], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' },
      ],
      gen: (rng) => ({ args: [], ...winCase(rng), stdin: '' }),
    },
    compat_ps_pairs: {
      js: ['compat_ps_pairs'],
      fixed: [{ label: 'compat.sh Win: 후손 없는 pid', args: [], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' }],
      gen: (rng) => ({ args: [], ...winCase(rng), stdin: '' }),
    },
    compat_ps_pidargs: {
      js: ['compat_ps_pidargs'],
      fixed: [{ label: 'compat.sh Win: ppid를 뺀다', args: [], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' }],
      gen: (rng) => ({ args: [], ...winCase(rng), stdin: '' }),
    },
    compat_proc_cwds: {
      js: ['compat_proc_cwds'],
      fixed: [{ label: 'compat.sh Win: cwd 없는 pid는 빈 출력', args: ['400'], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' }],
      gen: (rng) => ({ args: [rng.pick(['', '999999', '999998,999999', '100,400', 'abc'])], ...winCase(rng), stdin: '' }),
    },
    compat_pid_cwd: {
      js: ['compat_pid_cwd'],
      fixed: [{ label: 'compat.sh Win: cwd 없는 pid는 빈 출력', args: ['400'], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' }],
      gen: (rng) => ({ args: [rng.pick(['', '999999', '400', '100', 'abc', '0'])], ...winCase(rng), stdin: '' }),
    },
    compat_pid_alive: {
      js: ['compat_pid_alive'],
      fixed: [
        { label: 'compat.sh: 죽은 pid', args: ['999999999'], stdin: '' },
        { label: 'compat.sh: 0/null은 거짓', args: ['0'], stdin: '' },
      ],
      gen: (rng) => ({ args: [rng.pick(PIDS_INVALID)], stdin: '' }),
    },
    compat_descendants: {
      js: ['compat_descendants'],
      fixed: [
        { label: 'compat.sh Win: 후손 순서(깊은 쪽부터)', args: ['100'], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' },
        { label: 'compat.sh Win: 후손 없는 pid', args: ['300'], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' },
        { label: 'compat.sh: 빈 인자는 빈 출력', args: [''], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' },
      ],
      gen: (rng) => ({ args: [rng.pick(['100', '200', '300', '400', '999999', ''])], ...winCase(rng), stdin: '' }),
    },
    compat_kill_pgroup: {
      js: ['compat_kill_pgroup'],
      fixed: [{ label: 'compat.sh: 0·1은 신호를 보내지 않는다', args: ['1'], stdin: '' }],
      gen: (rng) => ({ args: [rng.pick(KILL_PIDS)], ...winCase(rng), stdin: '' }),
    },
    compat_pgroup_alive: {
      js: ['compat_pgroup_alive'],
      fixed: [{ label: 'compat.sh: 0·1은 거짓', args: ['1'], stdin: '' }],
      gen: (rng) => ({ args: [rng.pick(KILL_PIDS)], ...winCase(rng), stdin: '' }),
    },
    compat_kill_tree: {
      js: ['compat_kill_tree'],
      compareFiles: false,
      fixed: [
        { label: 'compat.sh: 없는 pid도 rc 0', args: ['999999'], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' },
        { label: 'compat.sh: 빈 인자는 빈 출력', args: [''], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' },
      ],
      gen: (rng) => ({ args: [rng.pick(['100', '999999', '', 'abc', '0', '1'])], ...winCase(rng), stdin: '' }),
    },
    compat_pgrep_f: {
      js: ['compat_pgrep_f'],
      fixed: [
        { label: 'compat.sh Win: pgrep_f node server', args: ['node server'], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' },
        { label: 'compat.sh: 빈 패턴은 빈 출력', args: [''], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' },
      ],
      gen: (rng) => ({
        args: [rng.pick(['node server', '^sleep 99$', 'bash', 'MARK_', 'sleep', 'init', 'zzz-no-match', 'server\\.js', 'bash -c', '^$'])],
        ...winCase(rng),
        stdin: '',
      }),
    },
    compat_pgrep_s: {
      js: ['compat_pgrep_s'],
      fixed: [
        { label: 'compat.sh Win: 고정 문자열', args: ['node server'], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' },
        { label: 'compat.sh: 빈 패턴은 빈 출력', args: [''], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' },
      ],
      gen: (rng) => ({
        args: [rng.pick(['node server', 'sleep 99', 'bash', 'MARK_', 'zzz-no-match', 'server.js', '(', '+', 'echo hi'])],
        ...winCase(rng),
        stdin: '',
      }),
    },
    compat_pkill_f: {
      js: ['compat_pkill_f'],
      compareFiles: false,
      fixed: [{ label: 'compat.sh: 빈 패턴은 rc 0', args: [''], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' }],
      gen: (rng) => ({ args: [rng.pick(['zzz-no-match-1', 'zzz-no-match-2', '', 'node server'])], ...winCase(rng), stdin: '' }),
    },
    compat_pkill_s: {
      js: ['compat_pkill_s'],
      compareFiles: false,
      fixed: [{ label: 'compat.sh: 빈 패턴은 rc 0', args: [''], ...winCase({ chance: () => false, int: (a) => a, pick: (arr) => arr[0] }), stdin: '' }],
      gen: (rng) => ({ args: [rng.pick(['zzz-no-match-1', 'zzz-no-match-2', '', 'node server'])], ...winCase(rng), stdin: '' }),
    },
    compat_posix_path: {
      js: ['compat_posix_path'],
      fixed: [
        { label: 'compat.sh Unix: 그대로', args: ['C:/Users/x/wt'], env: { COMPAT_FORCE_OS: 'unix' }, stdin: '' },
        { label: 'compat.sh Win cygpath 없음: 그대로', args: ['C:/Users/x/wt'], env: { COMPAT_FORCE_OS: 'windows' }, stdin: '' },
      ],
      gen: (rng) => ({
        args: [rng.pick(['C:/Users/x/wt', '/c/x', '/a/b', 'rel/x', '', 'C:\\x\\y', '\\\\srv\\sh', '한글/경로'])],
        env: { COMPAT_FORCE_OS: rng.pick(['', 'windows', 'unix']) },
        stdin: '',
      }),
    },
    compat_norm_path: {
      js: ['compat_norm_path'],
      fixed: [
        { label: 'compat.sh Win: C:\\x\\wt\\ → /c/x/wt', args: ['C:\\Users\\x\\wt\\'], env: { COMPAT_FORCE_OS: 'windows' }, stdin: '' },
        { label: 'compat.sh Win: /cygdrive/E/z → /e/z', args: ['/cygdrive/E/z'], env: { COMPAT_FORCE_OS: 'windows' }, stdin: '' },
        { label: 'compat.sh Unix: 그대로', args: ['C:\\x/'], env: { COMPAT_FORCE_OS: 'unix' }, stdin: '' },
      ],
      gen: (rng) => ({
        args: [rng.pick(['C:\\Users\\x\\wt\\', 'C:/Users/x/', '/c/Users/x', 'D:/y', '/cygdrive/E/z', 'C:', '/Users/x/wt/', 'C:\\x/', 'rel/x', '', '/'])],
        env: { COMPAT_FORCE_OS: rng.pick(['', 'windows', 'unix']) },
        stdin: '',
      }),
    },
    compat_native_path: {
      js: ['compat_native_path'],
      fixed: [
        { label: 'compat.sh Unix: 그대로', args: ['/w'], env: { COMPAT_FORCE_OS: 'unix' }, stdin: '' },
        { label: 'compat.sh Win cygpath 없음: 그대로', args: ['/w'], env: { COMPAT_FORCE_OS: 'windows' }, stdin: '' },
      ],
      gen: (rng) => ({
        args: [rng.pick(['/w', '/c/x', 'C:/x', 'rel', '', '한글'])],
        env: { COMPAT_FORCE_OS: rng.pick(['', 'windows', 'unix']) },
        stdin: '',
      }),
    },
    compat_is_abs_path: {
      js: ['compat_is_abs_path'],
      fixed: [
        { label: 'compat.sh Win: C:/x는 절대', args: ['C:/x'], env: { COMPAT_FORCE_OS: 'windows' }, stdin: '' },
        { label: 'compat.sh Unix: C:/x는 절대가 아니다', args: ['C:/x'], env: { COMPAT_FORCE_OS: 'unix' }, stdin: '' },
        { label: 'compat.sh: /x는 절대', args: ['/x'], stdin: '' },
      ],
      gen: (rng) => ({
        args: [rng.pick(['/x', 'C:/x', 'C:\\x', '\\\\srv\\sh', 'rel/x', 'C:x', '', '/'])],
        env: { COMPAT_FORCE_OS: rng.pick(['', 'windows', 'unix']) },
        stdin: '',
      }),
    },
    compat_sha256: {
      js: ['compat_sha256'],
      fixed: [
        { label: 'compat.sh: abc', args: [], stdin: Buffer.from('abc') },
        { label: 'compat.sh: 빈 입력도 64자', args: [], stdin: Buffer.alloc(0) },
      ],
      gen: (rng, i) => ({ args: [], stdin: gen('text')(rng, i).stdin }),
    },
  },
};
