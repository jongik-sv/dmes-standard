// scripts/measure-window.sh ↔ measure-window.mjs 대조 명세(kind 'script', 스위치 COORD_JS_MEASURE_WINDOW).
//   · sh·mjs 는 fixtures/measure-parity.{sh,mjs} 래퍼다: `.jobs.json` 대로 잡 폴더와 「시험이 띄운 sleep 300」을 만들고, 스크립트를 돌린 뒤
//     상태 폴더(sr/)·heavy.log·sleep 생존 여부를 찍고 남은 sleep 을 정리한다. kill 은 그 sleep 에게만 간다(실제 작업 프로세스는 건드리지 않는다).
//   · heavy 스크립트·sysctl·nproc·ps 는 <WORK>/bin 과 <WORK>/heavy.sh 의 가짜다. --until 은 2099 년 고정(남은 초는 heavy.log 에 10만 초 단위 버킷으로만 남긴다).
//   · opened_at 은 지금 시각이라 덤프가 2026 년 ISO 를 <ISO> 로 지운다.
const FAKE_HEAVY = { data: `#!/bin/sh
# 가짜 heavy: --detach --exclusive sleep N → 인자(남은 초는 10만 초 단위 버킷)를 heavy.log 에 적고 HEAVY_DETACHED 를 낸다 / snapshot → RUN 줄들
if [ "$1" = snapshot ]; then
  i=0; while [ "$i" -lt "\${FAKE_RUN:-0}" ]; do printf 'RUN\\t%s\\t0\\tgradle\\t/x\\t00:01\\n' "$i"; i=$((i+1)); done
  [ -n "$FAKE_SNAP_EXTRA" ] && printf '%s\\n' "$FAKE_SNAP_EXTRA"
  exit 0
fi
printf '%s %s %s bucket=%s\\n' "$1" "$2" "$3" "$(( ($4 + 50000) / 100000 ))" >> "$FAKE_LOG"
case "\${FAKE_DETACH:-ok}" in
  ok) echo "HEAVY_DETACHED id=job-77 slot=1" ;;
  noextra) echo "HEAVY_DETACHED id=job-88" ;;
  fail) echo "no slot" ;;
esac
exit 0
`, mode: 0o755 };
// 가짜 ps: 프로세스 표(-axo pid=,ppid=,args=)만 파일로 바꾸고, 그 밖(-o lstart= -p …)은 진짜 ps 로 넘긴다(잡 pstart 대조·시험 정리용)
const FAKE_PS = { data: '#!/bin/sh\ncase "$*" in\n  *ppid=*) [ -f "$FAKE_PS_TABLE" ] && cat "$FAKE_PS_TABLE"; exit 0 ;;\n  *) exec /bin/ps "$@" ;;\nesac\n', mode: 0o755 };
const FAKE_SYSCTL = { data: `#!/bin/sh
case "$2" in
  hw.ncpu) [ "\${FAKE_SYSCTL:-ok}" = fail ] && exit 1; printf '%s\\n' "\${FAKE_NCPU:-8}" ;;
  vm.loadavg) [ "\${FAKE_SYSCTL:-ok}" = fail ] && exit 1; [ -n "$FAKE_LOAD" ] && printf '{ %s 1.00 1.00 }\\n' "$FAKE_LOAD" ;;
esac
exit 0
`, mode: 0o755 };
const FAKE_NPROC = { data: '#!/bin/sh\nprintf "%s\\n" "${FAKE_NCPU:-8}"\n', mode: 0o755 };

const UNTIL = ['2099-01-01T00:00:00Z', '2099-06-01T12:00:00+09:00', '2099-12-31T23:59:59-05:00', '2099-01-01T00:00:00.500Z'];
const BADUNTIL = ['xx', '2020-01-01T00:00:00Z', '', '2099-13-45T25:61:61Z', '2026-10-09 10:00:00'];
const KINDS = ['measure', 'move', 'ban'];

function winDoc(rng, i) {
  const w = { kind: rng.pick(KINDS), lane: rng.pick(['a1', null, 'kit', '']), opened_at: '2026-10-09T01:00:00+09:00', until: rng.pick(UNTIL), notified: [], hold_job: rng.pick(['job-1', null, null, 'job-2', 'job-live']) };
  if (rng.chance(0.1)) delete w.lane;
  if (rng.chance(0.1)) w.until = rng.pick([null, 5, false]);
  if (rng.chance(0.08)) w.kind = rng.pick([null, 5, 'weird']);
  return w;
}
function windows(rng) {
  const t = rng.next();
  if (t < 0.25) return undefined;
  if (t < 0.4) return [];
  if (t < 0.45) return rng.pick(['str', 5, null, true, {}, { a: { kind: 'measure' } }, [1, 'x'], [null], ['s']]);
  const n = rng.int(1, 4);
  return Array.from({ length: n }, (_, i) => winDoc(rng, i));
}

function build(rng) {
  const files = {};
  const env = { COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr', DFLOW_HEAVY_JOBS: '<WORK>/jobs', FAKE_LOG: '<WORK>/heavy.log', FAKE_PS_TABLE: '<WORK>/ps.txt', PATH: `<WORK>/bin:${process.env.PATH}`, LC_ALL: 'C' };
  const ws = windows(rng);
  const state = { schema: 1, run: { id: 'r1' } };
  if (ws !== undefined) state.windows = ws;
  files['sr/r1/state.json'] = rng.chance(0.03) ? rng.pick(['{', '[]', '5']) : JSON.stringify(state);
  files['sr/current'] = 'r1\n';
  files['bin/ps'] = FAKE_PS; files['bin/sysctl'] = FAKE_SYSCTL; files['bin/nproc'] = FAKE_NPROC; files['heavy.sh'] = FAKE_HEAVY;
  const cfg = {};
  if (rng.chance(0.85)) cfg.heavy = { script: 'heavy.sh' };
  if (rng.chance(0.3)) cfg.heavy = { ...(cfg.heavy ?? {}), measure_quiet: rng.pick([0.5, 0.2, 2, '0.3', 'abc', 0]) };
  files['.coord.local.json'] = JSON.stringify(cfg);
  // 잡 폴더
  const jobs = [];
  for (const id of ['job-1', 'job-2', 'job-live']) {
    if (rng.chance(0.5)) jobs.push({ id, kind: rng.pick(['live', 'live', 'runlive', 'mismatch', 'dead', 'done', 'nopid']) });
  }
  files['.jobs.json'] = JSON.stringify(jobs);
  files['ps.txt'] = ['  100 1 /bin/zsh', '  200 100 node /x/vitest run', '  210 100 node mcp-vitest', '  220 100 java GradleWrapperMain x', '  230 1 playwright test', '  240 1 grep vitest', '  250 1 sleep 5']
    .filter(() => rng.chance(0.4)).map((l) => `${l}\n`).join('');
  if (rng.chance(0.2)) { env.FAKE_RUN = String(rng.int(0, 3)); }
  if (rng.chance(0.1)) env.FAKE_SNAP_EXTRA = 'HOLD\t1\t2';
  env.FAKE_LOAD = rng.pick(['0.30', '1.50', '12.00', '0', '3.14159', '']);
  env.FAKE_NCPU = rng.pick(['8', '16', '1', '0']);
  if (rng.chance(0.08)) env.FAKE_SYSCTL = 'fail';
  env.FAKE_DETACH = rng.pick(['ok', 'ok', 'ok', 'noextra', 'fail']);
  if (rng.chance(0.07)) env.COORD_RUN = '';
  let args;
  const sub = rng.pick(['open', 'open', 'open', 'close', 'close', 'status', 'status', 'quiet-check', 'quiet-check']);
  if (sub === 'open') {
    args = ['open', rng.chance(0.93) ? rng.pick(KINDS) : rng.pick(['bogus', ''])];
    if (rng.chance(0.4)) args.push('--lane', rng.pick(['a1', 'b-2', '']));
    if (rng.chance(0.93)) args.push('--until', rng.chance(0.85) ? rng.pick(UNTIL) : rng.pick(BADUNTIL));
    if (rng.chance(0.4)) args.push('--hold-heavy');
    if (rng.chance(0.25)) args.push('--dry-run');
  } else if (sub === 'close') {
    args = ['close'];
    if (rng.chance(0.5)) args.push(rng.pick(KINDS));
    if (rng.chance(0.25)) args.push('--dry-run');
  } else args = [sub];
  if (rng.chance(0.02)) args.push(rng.pick(['--bogus', '-x']));
  return { args, files, env };
}

const closeCase = (label, jobKind, extra = {}) => {
  const w = [{ kind: 'measure', lane: 'a1', opened_at: '2026-10-09T01:00:00+09:00', until: '2099-01-01T00:00:00Z', notified: [], hold_job: 'job-1' }, { kind: 'ban', lane: null, opened_at: '2026-10-09T01:00:00+09:00', until: '2099-01-01T00:00:00Z', notified: [], hold_job: null }];
  return {
    label, args: ['close', ...(extra.args ?? [])],
    env: { COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr', DFLOW_HEAVY_JOBS: '<WORK>/jobs', FAKE_LOG: '<WORK>/heavy.log', PATH: `<WORK>/bin:${process.env.PATH}`, LC_ALL: 'C' },
    files: { 'sr/r1/state.json': JSON.stringify({ schema: 1, run: { id: 'r1' }, windows: w }), 'sr/current': 'r1\n', 'bin/ps': FAKE_PS, 'heavy.sh': FAKE_HEAVY, '.coord.local.json': '{"heavy":{"script":"heavy.sh"}}', '.jobs.json': JSON.stringify([{ id: 'job-1', kind: jobKind }]) },
  };
};

export default {
  module: 'measure-window',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/measure-parity.sh',
  mjs: 'tests/js-parity/fixtures/measure-parity.mjs',
  switchEnv: 'COORD_JS_MEASURE_WINDOW',
  env: { COORD_REPO: '<WORK>' },
  functions: {
    run: {
      compareFiles: false,
      gen: build,
      fixed: [
        closeCase('close: 살아 있는 잡(pid 일치) → TERM', 'live'),
        closeCase('close: runpid·pid 모두 → TERM', 'runlive'),
        closeCase('close: lstart 불일치 → 건너뜀', 'mismatch'),
        closeCase('close: 이미 죽은 pid', 'dead'),
        closeCase('close: rc 있는 잡', 'done'),
        closeCase('close: 잡 폴더 없음', 'none'),
        closeCase('close --dry-run: kill 안 함', 'live', { args: ['--dry-run'] }),
        closeCase('close ban 만', 'live', { args: ['ban'] }),
        closeCase('close measure 만', 'runlive', { args: ['measure'] }),
        { label: '-h', args: ['-h'], env: {}, files: {} },
        { label: '인자 없음(die 2)', args: [], env: {}, files: {} },
        { label: 'status: 창 없음', args: ['status'], env: { COORD_RUN: '' }, files: {} },
        { label: 'quiet-check: heavy 없음', args: ['quiet-check'], env: { COORD_RUN: '' }, files: { '.coord.local.json': '{}', 'bin/sysctl': FAKE_SYSCTL, 'bin/ps': FAKE_PS, 'ps.txt': '' } },
      ],
    },
  },
};
