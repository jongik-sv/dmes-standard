// scripts/coord-status.sh ↔ coord-status.mjs 대조 명세(kind 'script', 스위치 COORD_JS_COORD_STATUS).
//   · sh·mjs 는 fixtures/status-parity.{sh,mjs} 래퍼다: 작업 폴더의 `.repo.json`(git 리포 레시피)과 `.sess.json`(세션 파일 목록; pid 는 LIVE/DEAD)을 준비한 뒤 스크립트를 돌린다.
//     읽기 전용 스크립트라 남긴 파일 비교는 하지 않는다(stdout·종료 코드만).
//   · 외부 입력은 모두 가짜로 고정한다: sysctl(hw.ncpu·vm.loadavg·vm.swapusage), ps(`-axo pid=,args=` 표만 가짜, 나머지는 진짜), lsof(-Fpn), heavy.sh(snapshot), usage cache.
//   · 시간은 gen 시점 상대값이고 경과 분은 분 중간(+30초)이다. 모든 사례에 COORD_REPO=<WORK>, usage.sources 는 항상 덮어쓴다.
const NOW = () => Math.floor(Date.now() / 1000);
const GIT_ENV = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LC_ALL: 'C' };
const pad = (n) => String(n).padStart(2, '0');
function iso(e, tzMin = 0, z = false) {
  const d = new Date((e + tzMin * 60) * 1000);
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  if (z) return `${base}Z`;
  const a = Math.abs(tzMin);
  return `${base}${tzMin < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

const FAKE_SYSCTL = { data: `#!/bin/sh
case "$2" in
  hw.ncpu) [ -n "$FAKE_NCPU" ] || exit 1; printf '%s\\n' "$FAKE_NCPU" ;;
  vm.loadavg) [ -n "$FAKE_LOAD" ] || exit 1; printf '%s\\n' "$FAKE_LOAD" ;;
  vm.swapusage) [ -n "$FAKE_SWAP" ] || exit 1; printf '%s\\n' "$FAKE_SWAP" ;;
  *) exit 1 ;;
esac
`, mode: 0o755 };
const FAKE_PS = { data: `#!/bin/sh
if [ "$1" = -axo ] && [ "$2" = "pid=,args=" ]; then [ -f "$FAKE_PS_TABLE" ] && cat "$FAKE_PS_TABLE"; exit 0; fi
exec /bin/ps "$@"
`, mode: 0o755 };
const FAKE_LSOF = { data: `#!/bin/sh
pids=""; while [ $# -gt 0 ]; do case "$1" in -p) pids="$2" ;; esac; shift; done
oldIFS="$IFS"; IFS=','
for p in $pids; do
  c=$(awk -F'\\t' -v p="$p" '$1==p{print $2; exit}' "$FAKE_LSOF_MAP" | sed "s#<WORK>#$FAKE_WORK#")
  [ -n "$c" ] && { printf 'p%s\\n' "$p"; printf 'n%s\\n' "$c"; }
done
IFS="$oldIFS"
exit 0
`, mode: 0o755 };
const heavyScript = (body) => ({ data: `#!/bin/sh\nif [ "$1" = snapshot ]; then\n${body}\nfi\nexit 0\n`, mode: 0o755 });

const LANES = ['la', 'lb', 'lc'];
const LOADS = ['{ 1.23 2.34 3.45 }', '{ 0.00 0.10 0.20 }', '{ 12.5 3.0 2.0 }', '{ 1.00 2 3 }', '{ 007 1 1 }', '{ 1e3 1 1 }', '{ .5 1 1 }', '{ nan 1 1 }', '{ inf 1 1 }', '{ -inf 1 1 }', '{ 3 }', ''];
const NCPUS = ['8', '10', '1', '0', 'x', '4.5', '', '008', 'nan', 'inf'];
const SWAPS = ['total = 2048.00M  used = 1024.50M  free = 1023.50M  (encrypted)', 'total = 4.00G  used = 1.25G  free = 2.75G  (encrypted)', 'total = 0.00M  used = 0.00M  free = 0.00M  (encrypted)',
  'garbage', '', 'total = 1M used = M free = 1M'];

function sessionFor(rng, now, name, sid, lane) {
  const age = rng.pick([30, 90, 210, 330, 630, 5430, 400000]);
  const s = { file: `s-${name}.json`, pid: rng.pick(['LIVE', 'LIVE', 'LIVE', 'DEAD']), kind: 'interactive' };
  if (rng.chance(0.85)) s.sessionId = sid;
  if (rng.chance(0.7)) s.name = rng.pick(['claude 세션', 'a b\tc', '', name]);
  s.status = rng.pick(['idle', 'idle', 'busy', 'waiting', undefined, 5]);
  if (s.status === undefined) delete s.status;
  const tk = rng.pick(['statusUpdatedAt', 'statusUpdatedAt', 'updatedAt', 'both', 'none', 'str', 'float']);
  if (tk === 'statusUpdatedAt') s.statusUpdatedAt = (now - age) * 1000;
  else if (tk === 'updatedAt') s.updatedAt = (now - age) * 1000;
  else if (tk === 'both') { s.statusUpdatedAt = (now - age) * 1000; s.updatedAt = (now - 99999) * 1000; }
  else if (tk === 'str') s.statusUpdatedAt = 'x';
  else if (tk === 'float') s.statusUpdatedAt = (now - age) * 1000 + 0.5;
  s.cwd = '@WORK@/wt/' + name;
  void lane;
  return s;
}

function build(rng) {
  const now = NOW();
  const files = {};
  const sess = [];
  const lanes = {};
  const n = rng.pick([0, 1, 2, 3]);
  const names = LANES.slice(0, n);
  for (const nm of names) {
    const sid = `sid-${nm}`;
    const l = { state: rng.pick(['active', 'active', 'active', 'closed', undefined, 'done']), worktree: `wt/${nm}`, session: { session_id: rng.chance(0.9) ? sid : '', pid: 0 } };
    if (rng.chance(0.4)) l.session.name = rng.pick(['레인 세션', 'x y', '', nm]);
    if (rng.chance(0.8)) l.branch = rng.pick([`feat/${nm}`, `feat/${nm}`, `feat/${nm}`, 'nope', '']);
    if (rng.chance(0.6)) l.last_report_at = rng.pick([iso(now - 900, 0), iso(now - 4000, 540), iso(now - 4000, -300, false), iso(now - 800, 0, true), 'garbage', '', 5]);
    if (rng.chance(0.3)) l.hold = { reason: rng.pick(['사용자 보류', 'plan a', 'x\ty', '', null]) };
    if (rng.chance(0.15)) l.worktree = rng.pick(['', '/abs/x', 'wt/../wt/' + nm]);
    lanes[nm] = rng.chance(0.03) ? rng.pick([null, 'str', 5]) : l;
    if (rng.chance(0.8)) sess.push(sessionFor(rng, now, nm, sid, l));
    if (rng.chance(0.55)) files[`sr/ctx/${sid}.json`] = JSON.stringify({ at: now - 20, context_window: { current_usage: { input_tokens: rng.pick([20000, 99000, 150000, 1]) }, context_window_size: rng.pick([200000, 1000000]) } });
    if (rng.chance(0.15)) files[`home/tasks/p1/${sid}/tasks/x.output`] = 'o\n';
  }
  // 레인과 무관한 세션(UNLINKED 후보)
  const others = rng.pick([0, 0, 1, 2, 3]);
  const pids = [];
  for (let i = 0; i < others; i++) {
    const o = { file: `o${i}.json`, pid: rng.pick(['LIVE', 'LIVE', 'DEAD', 'abc', 0, '4242']), kind: rng.pick(['interactive', 'interactive', 'interactive', 'bg', undefined]), sessionId: rng.pick([`sid-o${i}`, '', 'sid-la']) };
    if (o.kind === undefined) delete o.kind;
    if (rng.chance(0.8)) o.name = rng.pick(['other session', 'x', '', 'a\tb']);
    o.cwd = rng.pick(['@WORK@', '@WORK@/sub', '@WORK@/', '/elsewhere', '@WORK@x', '@WORK@/wt/la', '']);
    sess.push(o); pids.push(o);
  }
  const doc = { schema: 1, run: { id: 'r1', integration_branch: rng.pick(['dev', 'dev', 'dev', '', 'nope']) }, lanes };
  if (rng.chance(0.4)) doc.run.coordinator = { session_id: rng.pick(['sid-o0', 'sid-x', '']), pid: rng.pick([0, 4242, 777]) };
  if (rng.chance(0.4)) doc.windows = rng.pick([[{ kind: 'measure', lane: 'la', until: '2026-10-09T01:00:00Z' }], [{ kind: 'ban' }], [{ kind: 'measure', lane: null, until: 5 }], { a: { kind: 'x', lane: 'lb' } }, 'str', null, [1, { kind: 'measure' }]]);
  files['sr/r1/state.json'] = rng.chance(0.03) ? rng.pick(['{', '[]', '{"lanes":null}']) : JSON.stringify(doc);
  files['sr/current'] = 'r1\n';
  // git 리포: dev + 레인 브랜치
  const base = { 'README.md': 'r\n' };
  const branches = {};
  for (const nm of names) if (rng.chance(0.85)) branches[`feat/${nm}`] = { changes: { [`f-${nm}.txt`]: `${nm}\n${rng.int(0, 9)}\n` } };
  files['.repo.json'] = JSON.stringify({ integ: 'dev', base, branches, integChanges: {} });
  files['.sess.json'] = JSON.stringify(sess);
  // 외부 가짜
  files['bin/sysctl'] = FAKE_SYSCTL; files['bin/ps'] = FAKE_PS; files['bin/lsof'] = FAKE_LSOF;
  const procs = [];
  const lsof = [];
  const wtl = names[0];
  if (wtl && rng.chance(0.3)) { procs.push(`321 /usr/bin/java org.gradle.launcher.GradleMain`, `322 node /x/vitest run`); lsof.push(`321\t<WORK>/wt/${wtl}`, `322\t<WORK>/wt/${wtl}/sub`); }
  files['ps.txt'] = procs.length ? `${procs.join('\n')}\n` : '';
  files['lsof.txt'] = lsof.length ? `${lsof.join('\n')}\n` : '';
  const hv = rng.pick(['none', 'none', 'pc', 'pc', 'pcrun', 'empty', 'weird']);
  const cfg = { usage: { sources: [{ kind: 'cache', path: 'cache.json' }] } };
  files['cache.json'] = rng.chance(0.9) ? JSON.stringify({ five_hour: { utilization: rng.pick([5, 50, 80, 99, 12.5]) }, seven_day: { utilization: rng.pick([10, 70, 90]) } }) : '{';
  if (hv !== 'none') {
    cfg.heavy = { script: 'heavy.sh' };
    const run = wtl ? `printf 'RUN\\t123\\t0\\tgradle\\t%s/wt/${wtl}\\t00:01\\n' "$FAKE_WORK"` : ':';
    const body = { pc: `printf 'PC\\t${rng.pick([2, 3, 4])}\\t${rng.pick([0, 1, 2])}\\t${rng.pick([0, 1])}\\n'`, pcrun: `printf 'PC\\t4\\t1\\t2\\n'\n${run}`, empty: ':', weird: `printf 'PC\\tx\\t\\t007\\n'` }[hv];
    files['heavy.sh'] = heavyScript(body);
  }
  if (rng.chance(0.2)) cfg.tasks_root = '~/tasks';
  if (rng.chance(0.1)) cfg.sessions_dir = rng.pick(['~/.claude/sessions', '~/nodir']);
  files['.coord.local.json'] = JSON.stringify(cfg);
  const env = {
    ...GIT_ENV, COORD_RUN: rng.chance(0.04) ? '' : 'r1', COORD_STATE_ROOT: '<WORK>/sr', FAKE_WORK: '<WORK>', FAKE_PS_TABLE: '<WORK>/ps.txt', FAKE_LSOF_MAP: '<WORK>/lsof.txt',
    PATH: `<WORK>/bin:${process.env.PATH}`, FAKE_LOAD: rng.pick(LOADS), FAKE_NCPU: rng.pick(NCPUS), FAKE_SWAP: rng.pick(SWAPS),
  };
  const args = rng.chance(0.4) ? ['--json'] : [];
  if (rng.chance(0.03)) args.push(rng.pick(['--bogus', '-x']));
  return { args, files, env };
}

const base1 = (over = {}) => {
  const now = NOW();
  const files = {
    'sr/r1/state.json': JSON.stringify({ schema: 1, run: { id: 'r1', integration_branch: 'dev' }, lanes: { la: { state: 'active', worktree: 'wt/la', branch: 'feat/la', session: { session_id: 'sid-la', pid: 0, name: 'n a' }, hold: { reason: 'wait x' }, last_report_at: iso(now - 900) } }, windows: [{ kind: 'measure', lane: 'la', until: '2026-10-09T01:00:00Z' }] }),
    'sr/current': 'r1\n',
    '.repo.json': JSON.stringify({ integ: 'dev', base: { 'README.md': 'r\n' }, branches: { 'feat/la': { changes: { 'a.txt': 'a\n' } } }, integChanges: {} }),
    '.sess.json': JSON.stringify([{ file: 's-la.json', pid: 'LIVE', kind: 'interactive', sessionId: 'sid-la', status: 'idle', statusUpdatedAt: (now - 630) * 1000, cwd: '@WORK@/wt/la' }, { file: 'o.json', pid: 'LIVE', kind: 'interactive', sessionId: 'sid-o', name: 'other s', cwd: '@WORK@/sub' }]),
    'bin/sysctl': FAKE_SYSCTL, 'bin/ps': FAKE_PS, 'bin/lsof': FAKE_LSOF, 'ps.txt': '', 'lsof.txt': '',
    'cache.json': JSON.stringify({ five_hour: { utilization: 50 }, seven_day: { utilization: 10 } }),
    'sr/ctx/sid-la.json': JSON.stringify({ at: now - 20, context_window: { current_usage: { input_tokens: 99000 }, context_window_size: 200000 } }),
    '.coord.local.json': JSON.stringify({ usage: { sources: [{ kind: 'cache', path: 'cache.json' }] } }),
    ...(over.files ?? {}),
  };
  return {
    args: [], files,
    env: { ...GIT_ENV, COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr', FAKE_WORK: '<WORK>', FAKE_PS_TABLE: '<WORK>/ps.txt', FAKE_LSOF_MAP: '<WORK>/lsof.txt', PATH: `<WORK>/bin:${process.env.PATH}`,
      FAKE_LOAD: '{ 1.23 2.34 3.45 }', FAKE_NCPU: '8', FAKE_SWAP: SWAPS[0], ...(over.env ?? {}) },
    ...(over.args ? { args: over.args } : {}),
  };
};

// 래퍼(LIVE 세션)의 pid 는 실행마다 달라 지운다(UNLINKED 줄의 pid=, --json 의 pid).
const pidToN = (buf) => Buffer.from(buf.toString('latin1').replace(/pid=\d+/g, 'pid=N').replace(/"pid": \d+/g, '"pid": N'), 'latin1');

export default {
  module: 'coord-status',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/status-parity.sh',
  mjs: 'tests/js-parity/fixtures/status-parity.mjs',
  switchEnv: 'COORD_JS_COORD_STATUS',
  env: { COORD_REPO: '<WORK>' },
  functions: {
    run: {
      compareFiles: false,
      normalize: pidToN,
      gen: build,
      fixed: [
        { label: '-h', args: ['-h'], env: {}, files: {} },
        { label: '모르는 옵션(die 2)', args: ['-x'], env: {}, files: {} },
        { label: '회차 없음(die 3)', args: [], env: { COORD_RUN: '' }, files: {} },
        { label: '정상(텍스트)', ...base1() },
        { label: '정상(--json)', ...base1({ args: ['--json'] }) },
        { label: 'load 1.00·cpus 008(json 숫자 꼴)', ...base1({ args: ['--json'], env: { FAKE_LOAD: '{ 1.00 1 1 }', FAKE_NCPU: '008' } }) },
        { label: 'load 1e3·.5·nan(json)', ...base1({ args: ['--json'], env: { FAKE_LOAD: '{ 1e3 1 1 }' } }) },
        { label: 'load .5(json)', ...base1({ args: ['--json'], env: { FAKE_LOAD: '{ .5 1 1 }' } }) },
        { label: 'load nan(json)', ...base1({ args: ['--json'], env: { FAKE_LOAD: '{ nan 1 1 }' } }) },
        { label: 'cpus 0 → per_core 0.00', ...base1({ env: { FAKE_NCPU: '0' } }) },
        { label: 'load 없음 → -', ...base1({ env: { FAKE_LOAD: '' } }) },
        { label: 'swap G 단위', ...base1({ env: { FAKE_SWAP: SWAPS[1] } }) },
      ],
    },
  },
};
