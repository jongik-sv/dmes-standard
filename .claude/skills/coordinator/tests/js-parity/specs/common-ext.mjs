// scripts/lib/common.sh(bash 에 남은 함수) ↔ scripts/lib/common-ext.mjs 대조 명세. 스위치 없음(bash 스크립트는 계속 bash 판).
//   · 외부 명령(sysctl·nproc·awk·find·ps·lsof·git)은 <WORK>/bin 의 가짜 명령으로 돌린다(PATH 앞에 두기). find·awk·git 은 진짜를 그대로.
//   · coord_state_call 은 진짜 coord-state.sh 를 부른다(양쪽 같은 것 — 스크립트 없음·회차 없음·DRY·get·set 경로). 시각이 드는 event 쓰기는 glm-preflight 명세가 담당한다.
//   · coord_default_repo 는 cwd 가 리포가 아닐 때 킷 폴더의 git common dir(=메인 체크아웃)로 채운다 — 두 판이 같은 값(기기 경로)을 내는지로 본다.
const CLEAN = { COORD_REPO: '', COORD_RUN: '', COORD_STATE_ROOT: '', _COORD_CFG: '', _COORD_CFG_MINE: '', _COORD_CFG_SRC: '', COORD_LOCK_STALE_S: '', COORD_DRY: '', COMPAT_FORCE_OS: '', COMPAT_FORCE_USERLAND: '', COORD_SCRIPTS_DIR: '', LC_ALL: 'C' };

const BIN = (name, body) => ({ data: `#!/bin/sh\n${body}\n`, mode: 0o755 });
const SYSCTL = BIN('sysctl', `case "\${FAKE_SYSCTL:-ok}" in ok) printf '%s\\n' "\${FAKE_SYSCTL_OUT:-8}" ;; empty) : ;; *) exit 1 ;; esac`);
const NPROC = BIN('nproc', `printf '%s\\n' "\${FAKE_NPROC_OUT:-16}"; exit "\${FAKE_NPROC_RC:-0}"`);
const PS = BIN('ps', 'cat "$FAKE_PS_TABLE"');
const LSOF = BIN('lsof', `pids=""; mode=""
while [ $# -gt 0 ]; do case "$1" in -p) pids="$2" ;; -Fn) mode=n ;; -Fpn) mode=pn ;; esac; shift; done
oldIFS="$IFS"; IFS=','
for p in $pids; do
  [ "$mode" = pn ] && printf 'p%s\\n' "$p"
  printf 'n%s\\n' "$(awk -F'\\t' -v p="$p" '$1==p{print $2; exit}' "$FAKE_LSOF_MAP")"
done
IFS="$oldIFS"`);
const MYGIT = BIN('mygit', `printf '%s|' "$@" >> "$FAKE_GIT_LOG"; printf '\\n' >> "$FAKE_GIT_LOG"; printf 'MYGIT\\n'; exit "\${FAKE_GIT_RC:-0}"`);
const ECHOARGS = BIN('echoargs', `printf '%s\\n' "$#" ; printf '[%s]\\n' "$@"`);

const withPath = (files, env) => {
  files['bin/sysctl'] = SYSCTL; files['bin/nproc'] = NPROC;
  return { files, env: { PATH: '<WORK>/bin:' + process.env.PATH, ...env } };
};

// fake ps 표(한 줄 `  <pid> <args>`)와 lsof 사상(pid\tcwd) — wt 안팎의 빌드·시험 프로세스
const W = '<WORK>/wt';
function psCase(rng, extraEnv = {}) {
  const rows = [];
  const cand = [
    ['123', '/usr/bin/java org.gradle.wrapper.GradleWrapperMain', `${W}/x`],
    ['124', '/foo/bar/gradlew test', `${W}/y`],
    ['125', 'gradle --no-daemon build', `${W}/y`],
    ['126', 'org.gradle.launcher.GradleMain :app', '/elsewhere'],
    ['127', 'node /x/vitest run', `${W}/z`],
    ['128', 'npx playwright test', `${W}/z`],
    ['129', 'node playwright-mcp-server', `${W}/z`],
    ['130', 'npx tsc -b', `${W}/t`],
    ['131', '/x/typescript/bin/tsc --watch', '/elsewhere'],
    ['132', '/bin/zsh -ic build', `${W}/x`],
    ['133', 'java -Dbe.run.module=aps bootRun', `${W}/x`],
    ['134', 'awk {print}', `${W}/x`],
    ['135', '/bin/ps -axo pid=,args=', `${W}/x`],
    ['136', 'tscfoo tscx', '/elsewhere'],
  ];
  const n = rng.int(1, cand.length);
  for (let i = 0; i < n; i++) { const c = cand[rng.int(0, cand.length - 1)]; if (!rows.some((r) => r[0] === c[0])) rows.push(c); }
  const table = rows.map(([p, a]) => `  ${p} ${a}\n`).join('');
  const map = rows.map(([p, , c]) => `${p}\t${c}\n`).join('');
  return withPath({ 'ps.txt': table, 'lsof.txt': map }, { FAKE_PS_TABLE: '<WORK>/ps.txt', FAKE_LSOF_MAP: '<WORK>/lsof.txt', ...extraEnv });
}

const WT = ['<WORK>/wt', '/nowhere', '<WORK>', '<WORK>/wt/', 'C:/Users/x/wt'];
const snapCase = (rng) => {
  const cwds = [`${W}/a`, '/elsewhere/x', `${W}/.claude/worktrees/w1`, '', `${W}`];
  const mk = (tag, cwd) => `${tag}\t${rng.int(1, 999)}\tstart\tpsdk ${rng.int(1, 9)}\t${cwd}\t00:01`;
  const lines = [];
  for (let i = rng.int(0, 4); i > 0; i--) lines.push(mk(rng.pick(['RUN', 'RUN', 'HOLD', '']), rng.pick(cwds)));
  if (rng.chance(0.2)) lines.push(`RUN\t${rng.int(1, 99)}\t\t\t${rng.pick(cwds)}`);   // 빈 칸(탭 연속) — IFS 읽기처럼 접힌다
  let snap = lines.join('\n');
  if (rng.chance(0.6)) snap += '\n';
  if (rng.chance(0.1)) snap = '';
  return snap;
};

const STATE = '{"schema":1,"run":{"id":"r1","coordinator":{"session_id":"S1","pid":0}},"lanes":{"a1":{"state":"active"}}}';
const runEnv = { COORD_STATE_ROOT: '<WORK>/sr', COORD_RUN: 'r1' };

export default {
  module: 'common-ext',
  sh: 'scripts/lib/common.sh',
  mjs: 'scripts/lib/common-ext.mjs',
  source: ['scripts/lib/compat.sh'],
  env: CLEAN,
  functions: {
    coord_log: {
      js: ['coord_log'],
      gen: (rng) => ({ args: Array.from({ length: rng.int(0, 3) }, () => rng.pick(['한 줄', 'a b', '', 'x=y', '경로 /a/b c'])), stdin: '' }),
    },
    coord_die: {
      js: ['coord_die'],
      fixed: [
        { label: '숫자 아님 rc → 255', args: ['abc', '메시지'], stdin: '' },
        { label: 'rc 3', args: ['3', '설정 파일 JSON 오류: x'], stdin: '' },
      ],
      gen: (rng) => ({ args: [String(rng.pick([0, 1, 2, 3, 4, 5, 70, 127, 255])), rng.pick(['사유', 'a b', '', '한글 사유'])], stdin: '' }),
    },

    coord_do: {
      js: ['coord_do'],
      gen: (rng) => {
        const c = withPath({ 'git.log': '' }, {});
        const cmd = rng.pick(['echoargs', 'echoargs', 'fail7', 'missing-tool-xyz', '/bin/echo']);
        return { args: [cmd, ...Array.from({ length: rng.int(0, 3) }, () => rng.pick(['a', 'b c', '한글', '', 'x=y']))], files: { ...c.files, 'bin/echoargs': ECHOARGS, 'bin/fail7': BIN('fail7', 'echo oops; exit 7') }, env: { ...c.env, ...(rng.chance(0.4) ? { COORD_DRY: '1' } : {}), FAKE_GIT_LOG: '<WORK>/git.log' }, stdin: '' };
      },
    },

    coord_state_call: {
      js: ['coord_state_call'],
      fixed: [
        { label: 'DRY: DRY 만 찍고 부르지 않는다', args: ['set', '.glm', '{"a":1}'], env: { COORD_DRY: '1', ...runEnv }, files: { 'sr/r1/state.json': STATE }, stdin: '' },
        { label: '회차 없음: 건너뛴다', args: ['set', '.glm', '{"a":1}'], files: {}, env: {}, stdin: '' },
        { label: 'get: 읽기만(rc 0)', args: ['get', '.run.id'], env: runEnv, files: { 'sr/r1/state.json': STATE }, stdin: '' },
        { label: 'set: state.json 에 쓴다', args: ['set', '.glm', '{"status":"ok"}'], env: runEnv, files: { 'sr/r1/state.json': STATE }, stdin: '' },
        { label: '잘못된 사용법(rc 2)', args: ['set', '.x'], env: runEnv, files: { 'sr/r1/state.json': STATE }, stdin: '' },
      ],
      gen: (rng) => {
        const kind = rng.int(0, 4);
        if (kind === 0) return { args: ['get', rng.pick(['.run.id', '.nope', '.lanes|keys[]', '.['])], env: runEnv, files: { 'sr/r1/state.json': STATE }, stdin: '' };
        if (kind === 1) return { args: ['set', rng.pick(['.glm', '.note', '.run.goal']), rng.pick(['{"a":1}', '3', '"글"', 'null', '{}'])], env: runEnv, files: { 'sr/r1/state.json': STATE }, stdin: '' };
        if (kind === 2) return { args: ['set', '.glm', '{"a":1}'], env: { ...runEnv, COORD_DRY: '1' }, files: { 'sr/r1/state.json': STATE }, stdin: '' };
        if (kind === 3) return { args: ['bogus-subcommand', 'x'], env: runEnv, files: { 'sr/r1/state.json': STATE }, stdin: '' };
        return { args: ['set', '.glm', '{"a":1}'], files: {}, env: {}, stdin: '' };   // 회차 없음
      },
    },

    coord_git: {
      js: ['coord_git'],
      gen: (rng) => {
        const c = withPath({ 'git.log': '', 'bin/mygit': MYGIT }, { FAKE_GIT_LOG: '<WORK>/git.log' });
        const cfg = rng.pick([{}, {}, { git_bin: 'mygit' }, { git_bin: 'mygit' }, { git_bin: 'missing-tool-xyz' }, { git_bin: '' }]);
        if (Object.keys(cfg).length) c.files['.coord.local.json'] = JSON.stringify(cfg);
        return { args: [rng.pick(['rev-parse', 'status', 'log']), ...Array.from({ length: rng.int(0, 2) }, () => rng.pick(['HEAD', '--short', '-1', 'x']))], files: c.files, env: { ...c.env, ...(rng.chance(0.3) ? { FAKE_GIT_RC: '7' } : {}) }, stdin: '' };
      },
    },

    coord_default_repo: {
      js: ['coord_default_repo'],
      globals: ['COORD_REPO'],
      fixed: [
        { label: '이미 있으면 그대로', args: [], env: { COORD_REPO: '/preset' }, stdin: '' },
        { label: 'cwd 가 리포면 채우지 않는다', args: [], files: { '.git/HEAD': 'ref: refs/heads/main\n', '.git/objects/x': '', '.git/refs/x': '' }, env: {}, stdin: '' },
      ],
      gen: (rng) => {
        if (rng.chance(0.3)) return { args: [], files: { '.git/HEAD': 'ref: refs/heads/main\n', '.git/objects/x': '', '.git/refs/x': '' }, env: {}, stdin: '' };
        return { args: [], files: {}, env: {}, stdin: '' };
      },
    },

    coord_cpus: {
      js: ['coord_cpus'],
      gen: (rng) => {
        const c = withPath({}, {});
        return { args: [], files: c.files, env: { ...c.env, FAKE_SYSCTL: rng.pick(['ok', 'ok', 'ok', 'empty', 'fail']), FAKE_SYSCTL_OUT: rng.pick(['8', '16', '', '4\nextra' ]), FAKE_NPROC_RC: rng.pick(['0', '1']), FAKE_NPROC_OUT: rng.pick(['12', '']) }, stdin: '' };
      },
    },
    coord_load1: {
      js: ['coord_load1'],
      gen: (rng) => {
        const c = withPath({}, {});
        return { args: [], files: c.files, env: { ...c.env, FAKE_SYSCTL: rng.pick(['ok', 'ok', 'ok', 'ok', 'empty', 'fail']), FAKE_SYSCTL_OUT: rng.pick(['{ 1.23 2.34 3.45 }', '{  1.5 2 3 }', '1.23', 'a 1\nb 2', '{ 0.00 0.00 0.00 }', '']) }, stdin: '' };
      },
    },

    coord_heavy_script: {
      js: ['coord_heavy_script'],
      gen: (rng) => {
        const files = { 'heavy/h.sh': '#!/bin/sh\necho x\n' };
        const p = rng.pick(['heavy/h.sh', 'heavy/missing.sh', '', '~/heavy.sh', '/abs/heavy.sh', 'heavy']);
        if (p === '~/heavy.sh') files['home/heavy.sh'] = '';
        return { args: [], files: { ...files, '.coord.local.json': JSON.stringify({ heavy: { script: p } }) }, env: { COORD_REPO: '<WORK>' }, stdin: '' };
      },
    },

    coord_heavy_run_in_wt: {
      js: ['coord_heavy_run_in_wt'],
      gen: (rng) => ({ args: [rng.pick(WT), snapCase(rng)], env: { COORD_REPO: '<WORK>', COMPAT_FORCE_OS: rng.pick(['', '', '', 'windows']) }, stdin: '' }),
    },

    coord_wt_procs: {
      js: ['coord_wt_procs'],
      gen: (rng) => {
        const c = psCase(rng);
        return { args: [rng.pick(['<WORK>/wt', '/nowhere', '<WORK>'])], files: c.files, env: c.env, stdin: '' };
      },
    },

    coord_bg_signals: {
      js: ['coord_bg_signals'],
      gen: (rng) => {
        const c = psCase(rng, { FAKE_SYSCTL: 'ok', FAKE_SYSCTL_OUT: '8', FAKE_NPROC_RC: '0' });
        const files = { ...c.files };
        const cfg = {};
        if (rng.chance(0.7)) cfg.tasks_root = 'tasks';
        if (rng.chance(0.25)) cfg.idle = { bg_recent_min: rng.pick(['0', 'x', '1', '']) };
        if (Object.keys(cfg).length) files['.coord.local.json'] = JSON.stringify(cfg);
        const sid = rng.pick(['sid-1', 'sid-1', 'null', '']);
        if (rng.chance(0.7)) files[`tasks/proj-a/${sid === 'null' || sid === '' ? 'sid-1' : sid}/tasks/run.output`] = 'x\n';   // 방금 만들어 -mmin 안에 든다
        return { args: [rng.pick(['<WORK>/wt', '/nowhere']), sid, snapCase(rng)], files, env: { ...c.env, COORD_REPO: '<WORK>' }, stdin: '' };
      },
    },

    coord_read1: {
      js: ['coord_read1'],
      globals: ['V'],
      gen: (rng) => ({ args: ['V', rng.pick(['f.txt', 'empty.txt', 'nonl.txt', 'crlf.txt', 'multi.txt', 'missing.txt', ''])], files: { 'f.txt': '첫 줄\n둘째\n', 'empty.txt': '', 'nonl.txt': '줄 없음', 'crlf.txt': '줄\r\n둘째\r\n', 'multi.txt': '\n\nx\n' }, stdin: '' }),
    },
    coord_mkdirp: {
      js: ['coord_mkdirp'],
      gen: (rng) => ({ args: [rng.pick(['d', 'd/sub/deep', 'f.txt', 'd/sub', 'd2', ''])], files: { 'd/x': 'y', 'f.txt': 'z', 'd2/.keep': '' }, stdin: '' }),
    },
  },
};
