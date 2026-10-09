// scripts/compact-lane.sh ↔ compact-lane.mjs 대조 명세(kind 'script', 스위치 COORD_JS_COMPACT_LANE).
//   · sh·mjs 는 fixtures/compact-parity.{sh,mjs} 래퍼다: 스크립트를 돌린 뒤 상태 폴더(sr/)의 파일(state.json·events.jsonl)을 시각을 지워 찍는다.
//   · term-send-safe.sh·ctx-usage.sh 는 진짜를 spawn 한다(두 판 모두 같은 것). 바깥은 가짜 orca 하나뿐이다: 화면은 읽을 때마다 번호를 올려 screen.<N>.json 을 쓰고
//     (없으면 가장 가까운 앞 번호), 보내기(send)가 일어나면 on_send.sh 가 있을 때 실행해 「compact 가 끝나 토큰이 줄어든」 덤프로 바꿔 준다.
//   · 실제 orca·실제 세션은 부르지 않는다(가짜가 PATH 앞). 비 dry 사례는 Compacting 이 보이는 동안 10초를 한 번 기다리므로 gen 에서는 드물게만 만든다.
const NOW = () => Math.floor(Date.now() / 1000);
const RULE = '─'.repeat(30);
const IDLE = ['previous output', RULE, '❯ ', RULE, '  ? for shortcuts'];
const DRAFT = ['previous output', RULE, '❯ half written', RULE];
const COMPACTING = ['Compacting conversation…', '(esc to interrupt)'];
const DONE_PCT = ['✻ Conversation compacted (ctrl+o for history)', RULE, '❯ ', RULE, '  ctx 12% | opus'];
const DONE_ONLY = ['✻ Conversation compacted', RULE, '❯ ', RULE];
const NOTHING = ['> ', 'nothing useful'];

const FAKE_ORCA = { data: `#!/bin/sh
[ "$1" = terminal ] || exit 0
D="$FAKE_DIR"
case "$2" in
  list) cat "$D/list.json" 2>/dev/null || echo '{"ok":false}' ;;
  wait) [ "\${FAKE_WAIT:-ok}" = timeout ] && echo '{"ok":true,"result":{"wait":{"satisfied":false}}}' || echo '{"ok":true,"result":{"wait":{"satisfied":true}}}' ;;
  read)
    n=$(cat "$D/reads" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$D/reads"
    while [ "$n" -gt 1 ] && [ ! -f "$D/screen.$n.json" ]; do n=$((n-1)); done
    cat "$D/screen.$n.json" 2>/dev/null || echo '{"ok":false}' ;;
  send) echo "send" >> "$D/events.log"; [ -f "$D/on_send.sh" ] && sh "$D/on_send.sh"; echo '{"ok":true,"result":{"submitted":true}}' ;;
  close) echo '{"ok":true}' ;;
esac
exit 0
`, mode: 0o755 };

const scr = (lines) => JSON.stringify({ ok: true, result: { terminal: { tail: lines } } });
const list = (hs) => JSON.stringify({ ok: true, result: { terminals: hs.map((h) => ({ handle: h, title: 't', worktreePath: '/w', lastOutputAt: 1700000000000 })) } });
const dump = (tok) => JSON.stringify({ at: NOW() - 20, context_window: { current_usage: { input_tokens: tok }, context_window_size: 200000 } });

function build(rng, forced = {}) {
  const now = NOW();
  const files = {};
  const sid = 'sid-la';
  const h = 'h-la';
  const lane = { state: 'active', session: { session_id: sid, handle: forced.noHandle ? '' : h, pid: 0 }, memo: rng.pick(['~/m.md', '/a/b c/m.md', '', '한글 메모!']), compact: {} };
  if (rng.chance(0.15)) lane.session.kind = rng.pick(['opencode', 'agy', 'glm', 'claude']);
  if (rng.chance(0.25)) lane.session.window = rng.pick([100000, 1000000, '300000', 'x']);
  const pre = forced.pre ?? rng.pick(['1. 첫 단계\n2. 둘째', '  \n  남은 일 3줄\n더', '', '진행 중!', 'a\tb\rc']);
  if (pre !== '') lane.compact.pre_compact = pre;
  if (rng.chance(0.3)) lane.compact.last_at = rng.pick([new Date((now - 600) * 1000).toISOString().replace(/\.\d+Z$/, 'Z'), new Date((now - 7200) * 1000).toISOString().replace(/\.\d+Z$/, 'Z'), 'garbage', '']);
  if (rng.chance(0.25)) lane.compact.history = rng.pick([[], [{ at: 'x', before_tokens: 5, after_tokens: 3 }], 'str', null]);
  const state = { schema: 1, run: { id: 'r1', coordinator: { name: rng.pick(['dmes-2a', '', '조정']), addr: rng.pick(['uds:/tmp/x.sock', '']) } }, lanes: { la: lane } };
  if (rng.chance(0.12)) state.merge = { in_flight: { lane: rng.pick(['la', 'lb']) } };
  if (rng.chance(0.12)) state.windows = [{ kind: rng.pick(['measure', 'ban']), lane: rng.pick(['la', 'lb', null]) }];
  files['sr/r1/state.json'] = JSON.stringify(state);
  files['sr/current'] = 'r1\n';
  files['bin/orca'] = FAKE_ORCA;
  files['term/list.json'] = list(rng.chance(0.93) ? [h, 'h-x'] : ['h-x']);
  const screens = rng.pick(['normal', 'normal', 'normal', 'normal', 'draft', 'compacting', 'perm']);
  files['term/screen.1.json'] = scr(screens === 'draft' ? DRAFT : screens === 'compacting' ? COMPACTING : screens === 'perm' ? ['Do you want to proceed?', '❯ 1. Yes'] : IDLE);
  files['term/screen.2.json'] = scr(COMPACTING);
  files['term/screen.3.json'] = scr(COMPACTING);
  files['term/screen.4.json'] = scr(rng.pick([DONE_PCT, DONE_PCT, DONE_ONLY, NOTHING]));
  const before = rng.pick([150000, 90000, 33000]);
  if (rng.chance(0.9)) files[`sr/ctx/${sid}.json`] = dump(before);
  if (rng.chance(0.5)) files['term/on_send.sh'] = `printf '%s' '${dump(rng.pick([20000, 8000]))}' > "$FAKE_STATE/ctx/${sid}.json"\n`;
  const cfg = {};
  if (rng.chance(0.25)) cfg.compact = { cooldown_min: rng.pick([30, 5, 0, '10']), wait_max_min: rng.pick([10, 0, 1]), default_window: rng.pick([200000, 500000]) };
  files['.coord.local.json'] = JSON.stringify(cfg);
  const env = {
    COORD_RUN: rng.chance(0.05) ? '' : 'r1', COORD_STATE_ROOT: '<WORK>/sr', FAKE_DIR: '<WORK>/term', FAKE_STATE: '<WORK>/sr', PATH: `<WORK>/bin:${process.env.PATH}`,
    FAKE_WAIT: rng.pick(['ok', 'ok', 'ok', 'ok', 'timeout']),
  };
  const args = ['la'];
  if (rng.chance(0.25)) args.push('--force-no-memo');
  if (rng.chance(0.12)) args.push('--over-draft');
  // 비 dry 는 최대 10초씩 걸리므로 드물게
  const dry = !rng.chance(0.15);
  if (dry) args.push('--dry-run');
  if (rng.chance(0.03)) args.push(rng.pick(['--bogus', '-x']));
  if (rng.chance(0.04)) args.length = 0;
  if (rng.chance(0.04)) args[0] = rng.pick(['nope', 'lb']);
  return { args, files, env };
}

/** 고정 사례 바탕: 터미널 목록에 핸들이 있고 정본 갱신 답(pre_compact)이 있는 정상 레인 */
function fixedBase(rng) {
  const c = build(rng, {});
  const st = JSON.parse(c.files['sr/r1/state.json']);
  st.lanes.la = { state: 'active', session: { session_id: 'sid-la', handle: 'h-la', pid: 0 }, memo: '~/m.md', compact: { pre_compact: '1. 첫 단계\n2. 둘째' } };
  delete st.merge; delete st.windows;
  c.files['sr/r1/state.json'] = JSON.stringify(st);
  c.files['term/list.json'] = list(['h-la', 'h-x']);
  c.files['term/screen.1.json'] = scr(IDLE);
  c.files['sr/ctx/sid-la.json'] = dump(150000);
  c.files['.coord.local.json'] = '{}';
  delete c.files['term/on_send.sh'];
  c.env.FAKE_WAIT = 'ok'; c.env.COORD_RUN = 'r1';
  return c;
}

export default {
  module: 'compact-lane',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/compact-parity.sh',
  mjs: 'tests/js-parity/fixtures/compact-parity.mjs',
  switchEnv: 'COORD_JS_COMPACT_LANE',
  env: { COORD_REPO: '<WORK>' },
  functions: {
    run: {
      compareFiles: false,
      gen: build,
      fixed: [
        { label: '-h', args: ['-h'], env: {}, files: {} },
        { label: '레인 없음(die 2)', args: [], env: {}, files: {} },
        { label: '회차 없음(die 3)', args: ['la'], env: { COORD_RUN: '' }, files: {} },
        (() => { const rng = { next: () => 0.1, int: (a) => a, chance: () => false, pick: (arr) => arr[0] }; const c = fixedBase(rng); return { label: 'dry-run 정상(이벤트 없음)', ...c, args: ['la', '--dry-run'], env: { ...c.env, COORD_RUN: 'r1' } }; })(),
        (() => { const rng = { next: () => 0.1, int: (a) => a, chance: () => false, pick: (arr) => arr[0] }; const c = fixedBase(rng); return { label: '실제 보내기(Compacting → 끝, after 는 on_send 덤프)', ...c, args: ['la'], files: { ...c.files, 'term/on_send.sh': `printf '%s' '${dump(20000)}' > "$FAKE_STATE/ctx/sid-la.json"\n` } }; })(),
        (() => { const rng = { next: () => 0.1, int: (a) => a, chance: () => false, pick: (arr) => arr[0] }; const c = fixedBase(rng); return { label: '실제 보내기(덤프 불변 → 화면 ctx % 로 어림)', ...c, args: ['la'] }; })(),
        (() => { const rng = { next: () => 0.1, int: (a) => a, chance: () => false, pick: (arr) => arr[0] }; const c = fixedBase(rng); return { label: '시간 초과(wait_max_min 0)', ...c, args: ['la'], files: { ...c.files, '.coord.local.json': '{"compact":{"wait_max_min":0}}' } }; })(),
      ],
    },
  },
};
