// scripts/close-lane.sh ↔ close-lane.mjs 대조 명세(kind 'script', 스위치 COORD_JS_CLOSE_LANE).
//   · sh·mjs 는 fixtures/close-parity.{sh,mjs} 래퍼다: 스크립트를 돌린 뒤 상태 폴더(sr/)의 파일(state.json·events.jsonl·office 흔적)을 시각을 지워 찍는다.
//   · orca·ps·lsof·heavy 스크립트는 <WORK>/bin 의 가짜다. orca terminal list 는 list.json, terminal close 는 list.after.json 으로 바꿔치기해 「닫힘」을 흉내 낸다.
//     실제 orca·실제 kill 은 쓰지 않는다. 세션 pid 는 하니스 자신(process.pid)이라 두 판 모두 살아 있다.
//   · 사라짐 확인 루프(최대 15초)는 목록에서 빠지게 해 바로 끝나게 하고, 못 끝나는 경우는 fixed 한 건으로만 본다.
const NOW = () => Math.floor(Date.now() / 1000);

const FAKE_ORCA = { data: `#!/bin/sh
# 가짜 orca: terminal list --json / terminal close --terminal H --tab --json
case "$2" in
  list) cat "$FAKE_DIR/list.json" 2>/dev/null || echo '{"ok":false}'; exit 0 ;;
  close)
    case "\${FAKE_CLOSE:-ok}" in
      ok) [ -f "$FAKE_DIR/list.after.json" ] && cp "$FAKE_DIR/list.after.json" "$FAKE_DIR/list.json"; echo '{"ok":true}'; exit 0 ;;
      stale) echo '{"ok":false,"error":{"code":"terminal_handle_stale"}}'; exit 1 ;;
      stuck) echo '{"ok":true}'; exit 0 ;;
      *) echo '{"ok":false,"error":{"code":"boom"}}'; exit 1 ;;
    esac ;;
esac
exit 0
`, mode: 0o755 };
const FAKE_PS = { data: '#!/bin/sh\n[ -f "$FAKE_PS_TABLE" ] && cat "$FAKE_PS_TABLE"\nexit 0\n', mode: 0o755 };
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
const FAKE_HEAVY = { data: `#!/bin/sh
if [ "$1" = snapshot ] && [ -n "$FAKE_HEAVY" ]; then printf 'RUN\\t123\\t0\\tgradle\\t%s/wt/%s\\t00:01\\n' "$FAKE_WORK" "$FAKE_HEAVY"; fi
exit 0
`, mode: 0o755 };

const PS_ROWS = (me) => [
  [me, 1, '/bin/claude --session'], [me + 1, me, 'node /x/vitest run'], [me + 2, me, 'node mcp-vitest-server'], [me + 3, me + 1, 'java GradleWrapperMain x'],
  [9001, 1, 'npm run build'], [9002, 1, '/usr/bin/tsc --noEmit'], [9003, 1, 'bash heavy.sh run'], [9004, 1, 'sleep 100'], [9005, 1, 'grep vitest'],
  [9006, 1, 'playwright test e2e'], [9007, 1, '/x/tsup --watch'], [9008, 1, 'node jest-worker'],
];

function handleList(handles) {
  return JSON.stringify({ ok: true, result: { terminals: handles.map((h) => ({ handle: h, title: `t-${h}`, worktreePath: '/w', lastOutputAt: 1700000000000 })) } });
}

function build(rng) {
  const me = process.pid;
  const files = {};
  const lanes = {};
  const names = ['a1', 'b-2'];
  const target = names[0];
  const handle = `h-${target}`;
  const isMain = rng.chance(0.1);
  const lane = {
    state: 'active',
    session: { session_id: `sid-${target}`, pid: rng.pick([me, me, me, 0, 999999, null]), handle: rng.pick([handle, handle, handle, '']) },
    worktree: isMain ? '.' : 'wt/a1',
    branch: rng.pick(['feat/a', 'dev', '', 'feat/none']),
  };
  if (rng.chance(0.7)) lane.last_report_at = '2026-10-09T01:00:00+09:00';
  lanes[target] = lane;
  if (rng.chance(0.5)) lanes[names[1]] = { state: 'active', session: { handle: `h-${names[1]}`, pid: 0 }, worktree: 'wt/b2' };
  files['sr/r1/state.json'] = rng.chance(0.03) ? rng.pick(['{', '[]']) : JSON.stringify({ schema: 1, run: { id: 'r1' }, lanes });
  files['sr/current'] = 'r1\n';
  if (!isMain) files['wt/a1/.keep'] = '';
  // 터미널 목록: 목록에 있을 때/없을 때
  const listed = rng.chance(0.85);
  files['term/list.json'] = handleList(listed ? [handle, 'h-other'] : ['h-other']);
  files['term/list.after.json'] = handleList(['h-other']);
  // 세션 파일이 남아 있으면 15초 루프가 끝나지 않으므로 거의 만들지 않는다
  const rows = PS_ROWS(me).filter(() => rng.chance(0.55));
  files['ps.txt'] = rows.map(([p, pp, a]) => `  ${p} ${pp} ${a}\n`).join('');
  files['lsof.txt'] = rows.map(([p]) => `${p}\t${rng.chance(0.4) ? '<WORK>/wt/a1' : rng.pick(['/elsewhere', '<WORK>', ''])}\n`).join('');
  files['bin/orca'] = FAKE_ORCA; files['bin/ps'] = FAKE_PS; files['bin/lsof'] = FAKE_LSOF; files['heavy.sh'] = FAKE_HEAVY;
  const cfg = { heavy: { script: 'heavy.sh' }, office: { enabled: rng.chance(0.1), dflow_script: 'missing-dflow.sh' } };
  if (rng.chance(0.15)) cfg.wake_targets = ['x'];
  if (rng.chance(0.1)) cfg.integration_branch = 'feat/a';
  files['.coord.local.json'] = JSON.stringify(cfg);
  const env = {
    COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr', FAKE_DIR: '<WORK>/term', FAKE_PS_TABLE: '<WORK>/ps.txt', FAKE_LSOF_MAP: '<WORK>/lsof.txt', FAKE_WORK: '<WORK>',
    PATH: `<WORK>/bin:${process.env.PATH}`, FAKE_HEAVY: rng.chance(0.15) ? 'a1' : '', FAKE_CLOSE: rng.pick(['ok', 'ok', 'ok', 'ok', 'stale', 'boom']),
  };
  const args = [];
  const mode = rng.pick(['lane', 'lane', 'lane', 'handle', 'both', 'nolane']);
  if (mode === 'lane') args.push(target);
  else if (mode === 'handle') args.push('--handle', rng.pick([handle, handle, 'h-other', 'h-zzz']));
  else if (mode === 'both') args.push(target, '--handle', rng.pick([handle, 'h-other']));
  else args.push(rng.pick(['ghost', 'b-2']));
  if (rng.chance(0.3)) args.push('--force-report');
  if (rng.chance(0.3)) args.push('--dry-run');
  if (rng.chance(0.03)) args.push(rng.pick(['--bogus', '-x']));
  if (rng.chance(0.04)) env.COORD_RUN = '';
  return { args, files, env };
}

const baseOne = (over = {}) => {
  const c = build({ next: () => 0.5, int: (a) => a, chance: () => false, pick: (arr) => arr[0] });
  return { ...c, ...over, files: { ...c.files, ...(over.files ?? {}) }, env: { ...c.env, ...(over.env ?? {}) } };
};

export default {
  module: 'close-lane',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/close-parity.sh',
  mjs: 'tests/js-parity/fixtures/close-parity.mjs',
  switchEnv: 'COORD_JS_CLOSE_LANE',
  env: { COORD_REPO: '<WORK>' },
  functions: {
    run: {
      compareFiles: false,
      gen: build,
      fixed: [
        { label: '-h(stdout 2~10줄)', args: ['-h'], env: {}, files: {} },
        { label: '모르는 옵션(die 2)', args: ['-x'], env: {}, files: {} },
        { label: '인자 없음(die 2)', args: [], env: {}, files: {} },
        { label: '레인인데 회차 없음(die 3)', args: ['a1'], env: { COORD_RUN: '' }, files: {} },
        { label: '정상 닫기', ...baseOne({ args: ['a1', '--force-report'] }) },
        { label: '정상 닫기(보고 있음) + 상태 갱신', ...baseOne({ args: ['a1'], files: { 'sr/r1/state.json': JSON.stringify({ schema: 1, run: { id: 'r1' }, lanes: { a1: { state: 'active', session: { pid: 0, handle: 'h-a1' }, worktree: 'wt/a1', branch: 'feat/a', last_report_at: '2026-10-09T01:00:00+09:00' } } }) } }) },
        { label: '보고 없음 → not-reported', ...baseOne({ args: ['a1'] }) },
        { label: 'dry-run', ...baseOne({ args: ['a1', '--dry-run'] }) },
        { label: 'close 실패(boom → die 4)', ...baseOne({ args: ['a1', '--force-report'], env: { FAKE_CLOSE: 'boom' } }) },
        { label: 'handle 모드(--handle)', ...baseOne({ args: ['--handle', 'h-a1', '--force-report'] }) },
        { label: '목록에 이미 없음', ...baseOne({ args: ['a1', '--force-report'], files: { 'term/list.json': handleList(['h-other']) } }) },
        { label: 'heavy RUN cwd → bg-running', ...baseOne({ args: ['a1', '--force-report'], env: { FAKE_HEAVY: 'a1' } }) },
      ],
    },
  },
};
