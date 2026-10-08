// scripts/idle-check.sh ↔ idle-check.mjs 대조 명세(kind 'script', 스위치 COORD_JS_IDLE_CHECK).
//   · sh·mjs 는 fixtures/idle-parity.{sh,mjs} 래퍼다: 스크립트를 돌린 뒤 상태 폴더(sr/)의 파일(ticks·state.json·events.jsonl)을 시각을 지워 찍는다.
//   · 살아 있는 pid 는 하니스 자신의 process.pid 를 쓴다(두 판 모두 실행 중에 살아 있다). 레인마다 세션 파일을 sessionId 로 찾게 pid 0 을 둔다.
//   · 시간은 gen 시점 상대값: 경과 분은 분 중간(+30초), 임계(쿨다운·hold until·확정 간격)에서는 ±45초 이상 떨어뜨린다.
//   · 가짜 orca(terminal read)·가짜 heavy 스크립트(snapshot)·usage cache 로 외부 입력을 고정한다. usage.sources 는 항상 덮어쓴다(실제 /tmp 파일 방지).
const NOW = () => Math.floor(Date.now() / 1000);
const pad = (n, w = 2) => String(n).padStart(w, '0');
function iso(e, tzMin = 0, z = false) {
  const d = new Date((e + tzMin * 60) * 1000);
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  if (z) return `${base}Z`;
  const a = Math.abs(tzMin);
  return `${base}${tzMin < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
const isoR = (rng, e) => (rng.chance(0.3) ? iso(e, 0, true) : iso(e, rng.pick([0, 540, -300])));

const FAKE_ORCA = { data: `#!/bin/sh
# 가짜 orca: terminal read --terminal H → $FAKE_SCREENS/H.json 그대로, 없으면 stale 오류
h=""; while [ $# -gt 0 ]; do [ "$1" = --terminal ] && h="$2"; shift; done
if [ -f "$FAKE_SCREENS/$h.json" ]; then cat "$FAKE_SCREENS/$h.json"; exit 0; fi
echo '{"ok":false,"error":{"code":"terminal_handle_stale"}}'; exit 1
`, mode: 0o755 };
const FAKE_HEAVY = { data: `#!/bin/sh
# 가짜 heavy 스크립트: snapshot → FAKE_HEAVY 레인의 워크트리를 cwd 로 한 RUN 줄
if [ "$1" = snapshot ] && [ -n "$FAKE_HEAVY" ]; then printf 'RUN\\t123\\t0\\tgradle\\t%s/wt/%s\\t00:01\\n' "$FAKE_WORK" "$FAKE_HEAVY"; fi
exit 0
`, mode: 0o755 };

const LANES = ['a1', 'b-2', 'kit'];
const SCREENS = [
  ['> ', '  ready'], ['Do you want to proceed?', '❯ 1. Yes', '  2. No'], ['Enter to select · ↑/↓ to navigate'], ['Compacting conversation…', '(esc to interrupt)'],
  ['… Compacting', ...Array.from({ length: 16 }, (_, i) => `line ${i}`)], ['Usage limit reached', 'Stop and wait for limit to reset'], ['Do you trust the files in this folder?'],
  ['❯ 1. option', '  2. other'], [''], ['normal output', 'more'],
];

function lane(rng, i, now, pid) {
  const name = LANES[i];
  const sid = `sid-${name}`;
  const files = {};
  const kind = rng.pick(['ok', 'ok', 'ok', 'ok', 'dead', 'nosession', 'pidfile']);
  const age = rng.pick([30, 90, 210, 270, 330, 630, 5430, 400000]);   // 분 중간(+30초): 0,1,3,4,5,10,90,… 분
  const status = rng.pick(['idle', 'idle', 'idle', 'idle', 'busy', 'waiting', undefined, 5]);
  const sess = {};
  if (status !== undefined) sess.status = status;
  const tsKey = rng.pick(['statusUpdatedAt', 'statusUpdatedAt', 'updatedAt', 'both', 'none', 'str']);
  if (tsKey === 'statusUpdatedAt') sess.statusUpdatedAt = (now - age) * 1000;
  else if (tsKey === 'updatedAt') sess.updatedAt = (now - age) * 1000;
  else if (tsKey === 'both') { sess.statusUpdatedAt = (now - age) * 1000; sess.updatedAt = (now - 99999) * 1000; }
  else if (tsKey === 'str') sess.statusUpdatedAt = 'x';
  sess.sessionId = rng.chance(0.85) ? sid : `${sid}-new`;
  sess.pid = kind === 'dead' ? 999999 : pid;
  const lanePid = kind === 'pidfile' ? pid : rng.pick([0, 0, null]);
  if (kind !== 'nosession') files[kind === 'pidfile' ? `home/.claude/sessions/${pid}.json` : `home/.claude/sessions/s-${name}.json`] = JSON.stringify(sess);
  const l = { state: rng.pick(['active', 'active', 'active', 'active', 'done', undefined]), session: { session_id: sid, pid: lanePid, handle: rng.chance(0.6) ? `h-${name}` : '' }, worktree: `wt/${name}` };
  const upd = now - age;
  if (rng.chance(0.25)) l.hold = { reason: rng.pick(['사용자 보류', 'plan a', 'x\ty']), until: rng.pick([isoR(rng, now - 400), isoR(rng, now + 400), '', 'garbage', isoR(rng, now + 4000)]) };
  if (rng.chance(0.35)) l.last_instr_at = rng.pick([isoR(rng, now - 15 * 60 - 150), isoR(rng, now - 15 * 60 + 150), isoR(rng, now - 100000), 'garbage', '']);
  if (rng.chance(0.15)) l.session.window = 100000;
  // 화면
  if (l.session.handle && rng.chance(0.7)) {
    const scr = rng.pick(SCREENS);
    files[`screens/${l.session.handle}.json`] = JSON.stringify({ ok: true, result: { terminal: { tail: scr } } });
  }
  // 확정 간격 tick
  if (rng.chance(0.4)) {
    let d = rng.pick([-75, 75, 200, -300]);
    for (let t = 0; t < 12 && Math.abs(age - d - 120) < 45; t++) d = rng.pick([-75, 75, 200, -300, 500]);
    files[`sr/r1/ticks/idle-${name}`] = `${upd + d}\n`;
  }
  // 백그라운드 신호
  if (rng.chance(0.15)) files[`home/tasks/p1/${l.session.session_id}/tasks/x.output`] = 'o\n';
  return { name, l, files };
}

function build(rng) {
  const now = NOW();
  const pid = process.pid;
  const files = {};
  const lanes = {};
  const n = rng.pick([1, 2, 3]);
  const picked = [];
  for (let i = 0; i < n; i++) {
    const r = lane(rng, i, now, pid);
    lanes[r.name] = r.l;
    picked.push(r.name);
    Object.assign(files, r.files);
  }
  files['sr/r1/state.json'] = rng.chance(0.03) ? rng.pick(['{', '[]', '{"lanes":null}']) : JSON.stringify({ schema: 1, run: { id: 'r1', integration_branch: 'dev' }, lanes });
  files['sr/current'] = 'r1\n';
  files['bin/orca'] = FAKE_ORCA;
  files['heavy.sh'] = FAKE_HEAVY;
  files['cache.json'] = JSON.stringify({ five_hour: { utilization: rng.pick([5, 50, 80, 99]) }, seven_day: { utilization: 10 } });
  const cfg = { usage: { sources: [{ kind: 'cache', path: 'cache.json' }] }, heavy: { script: 'heavy.sh' } };
  if (rng.chance(0.2)) cfg.tasks_root = '~/tasks';
  if (rng.chance(0.3)) cfg.idle = { idle_min: rng.pick([2, 5, '0', 'x', '010']), cooldown_min: rng.pick([15, 10]), confirm_gap_min: rng.pick([2, 1, 5]), stall_max_min: rng.pick([90, 3, 'x']) };
  files['.coord.local.json'] = JSON.stringify(cfg);
  const env = {
    COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr', FAKE_SCREENS: '<WORK>/screens', FAKE_WORK: '<WORK>',
    PATH: `<WORK>/bin:${process.env.PATH}`, FAKE_HEAVY: rng.chance(0.2) ? picked[0] : '',
  };
  if (rng.chance(0.08)) env.COORD_DRY = '1';
  if (rng.chance(0.05)) env.COORD_RUN = 'none';
  const args = rng.pick([[], [], [], [picked[0]], [...picked, 'ghost'], ['ghost'], picked.slice().reverse()]);
  return { args, files, env };
}

/** 고정 사례용 레인 하나(a1) 틀: 세션 파일(경과 ageS 초)·상태·가짜 외부를 채운다 */
function one({ age = 630, status = 'idle', lane = {}, extra = {}, cfg = {}, env = {}, cache = 5 }) {
  const now = NOW();
  const files = {
    'home/.claude/sessions/s-a1.json': JSON.stringify({ status, statusUpdatedAt: (now - age) * 1000, sessionId: 'sid-a1', pid: process.pid }),
    'sr/r1/state.json': JSON.stringify({ schema: 1, run: { id: 'r1', integration_branch: 'dev' }, lanes: { a1: { state: 'active', session: { session_id: 'sid-a1', pid: 0, handle: 'h-a1' }, worktree: 'wt/a1', ...lane } } }),
    'sr/current': 'r1\n', 'bin/orca': FAKE_ORCA, 'heavy.sh': FAKE_HEAVY,
    'cache.json': JSON.stringify({ five_hour: { utilization: cache }, seven_day: { utilization: 10 } }),
    '.coord.local.json': JSON.stringify({ usage: { sources: [{ kind: 'cache', path: 'cache.json' }] }, heavy: { script: 'heavy.sh' }, ...cfg }),
    ...extra,
  };
  return { args: [], files, env: { COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr', FAKE_SCREENS: '<WORK>/screens', FAKE_WORK: '<WORK>', PATH: `<WORK>/bin:${process.env.PATH}`, FAKE_HEAVY: '', ...env } };
}
const scr = (lines) => ({ 'screens/h-a1.json': JSON.stringify({ ok: true, result: { terminal: { tail: lines } } }) });
const fixedCases = () => {
  const now = NOW();
  return [
    { label: 'IDLE 확정(tick 이 확정 간격 이전)', ...one({ extra: { 'sr/r1/ticks/idle-a1': `${now - 300}\n` } }) },
    { label: 'CANDIDATE(tick 새로 씀)', ...one({}) },
    { label: 'CANDIDATE(tick 있으나 간격 미달)', ...one({ extra: { 'sr/r1/ticks/idle-a1': `${now - 60}\n` } }) },
    { label: 'tick 이 upd 보다 오래됨 → 다시 씀', ...one({ age: 330, extra: { 'sr/r1/ticks/idle-a1': `${now - 1000}\n` } }) },
    { label: 'STALL?(heavy bg, idle 6666분)', ...one({ age: 400000, env: { FAKE_HEAVY: 'a1' } }) },
    { label: 'BUSY bg=heavy', ...one({ env: { FAKE_HEAVY: 'a1' } }) },
    { label: 'COMPACTING', ...one({ extra: scr(['Compacting conversation…']) }) },
    { label: 'WAIT_USER permission', ...one({ extra: scr(['Do you want to proceed?']) }) },
    { label: 'hold until 지남 → 풀고 이벤트', ...one({ lane: { hold: { reason: 'wait x', until: iso(now - 400) } } }) },
    { label: 'hold until 지남 + COORD_DRY', ...one({ lane: { hold: { reason: 'wait x', until: iso(now - 400) } }, env: { COORD_DRY: '1' } }) },
    { label: 'HOLD 미경과', ...one({ lane: { hold: { reason: 'pause now', until: iso(now + 600) } } }) },
    { label: 'HOLD usage-band-R', ...one({ cache: 99 }) },
    { label: 'BUSY cooldown', ...one({ lane: { last_instr_at: iso(now - 300) } }) },
    { label: 'BUSY idle-Nm', ...one({ age: 150 }) },
    { label: 'GONE(죽은 pid)', ...one({ extra: { 'home/.claude/sessions/s-a1.json': JSON.stringify({ status: 'idle', statusUpdatedAt: now * 1000, sessionId: 'sid-a1', pid: 999999 }) } }) },
    { label: '상태 파일 없는 레인 이름', ...one({}), args: ['nope', 'a1'] },
    { label: 'idle_min 앞 0 (010) 설정', ...one({ cfg: { idle: { idle_min: '010' } } }) },
  ];
};

export default {
  module: 'idle-check',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/idle-parity.sh',
  mjs: 'tests/js-parity/fixtures/idle-parity.mjs',
  switchEnv: 'COORD_JS_IDLE_CHECK',
  env: { COORD_REPO: '<WORK>' },
  functions: {
    run: {
      compareFiles: false,
      gen: build,
      fixed: [
        { label: '-h', args: ['-h'], env: {}, files: {} },
        { label: '모르는 옵션(die 2)', args: ['-x'], env: {}, files: {} },
        { label: '회차 없음(die 3)', args: [], env: { COORD_RUN: '' }, files: {} },
        ...fixedCases(),
      ],
    },
  },
};
