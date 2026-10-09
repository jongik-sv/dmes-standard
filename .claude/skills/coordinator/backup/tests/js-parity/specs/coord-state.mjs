// scripts/coord-state.sh ↔ scripts/coord-state.mjs 대조 명세(kind 'script', 스위치 COORD_JS_COORD_STATE).
//   · 하위명령마다 무작위 생성기 + 기존 bash 시험(tests/lessons.sh·run-close.sh·instr-id.sh·console-keys.sh)에서 옮긴 고정 사례(fixed).
//   · 회차는 COORD_RUN 환경 변수로 고정(state/<id>/state.json 를 사례 폴더에 심는다). 설정 파일 없이 COORD_STATE_ROOT 로 상태 뿌리 지정.
//   · office.sh 호출·콘솔 폴러 기동은 COORD_DRY=1·COORD_CONSOLE_POLL=0 으로 무출력 스킵(bash 판·node 판 같은 분기).
//   · 시각이 파일에 들어가는 하위명령(init·event·instr·ack·report·item-done·hold·close-run·lane-add·summary)은 파일 대조를 끄고
//     stdout·events/state 내용 대조는 tests/coord-state.test.mjs 가 시각 정규화 뒤 바이트로 본다.
//   · STALE_RUN 줄의 idle 분 수는 두 판이 병렬로 돌아 1분 경계에서 흔들리므로 normalize 로 지운다.
import { gen } from '../gen.mjs';

const CLEAN = { COORD_RUN: '', COORD_SESSION_ID: '', CLAUDE_CODE_SESSION_ID: '', CLAUDE_PID: '', ORCA_TERMINAL_HANDLE: '', COORD_DRY: '1', COORD_CONSOLE_POLL: '0',
  COORD_STATE_ROOT: '', COORD_LOCK_STALE_S: '', _COORD_CFG: '', _COORD_CFG_MINE: '', _COORD_CFG_SRC: '', COMPAT_FORCE_OS: '', COMPAT_FORCE_USERLAND: '', DFLOW_CONSOLE_DIR: '', LC_ALL: 'C' };
const ENV = { ...CLEAN, COORD_REPO: '<WORK>', COORD_STATE_ROOT: '<WORK>/state' };

// ---------- 무작위 state.json(coord-state 가 실제로 쓰는 모양 + 드물게 변형·깨짐) ----------
const LANE_IDS = ['a1', 'b-2', 'c.d3', 'kit', 'm0', '한글', 'x y'];
const RUN_IDS_OK = ['r1', 'run-2', 'a.b_c', 'z9-st', 'lane-01'];
const RUN_IDS_BAD = ['', 'a/b', '.x', 'current', 'ctx', '_session', '한글', 'a b', '..'];
const ISO = ['"2026-10-09T01:02:03+09:00"', '"2026-10-09T01:02:03Z"', 'null', '""', '"2026-10-09 01:02"'];

const jstr = (s) => JSON.stringify(s);
function iso(rng) { return rng.pick(ISO); }
function item(rng) {
  const r = rng.next();
  const id = rng.pick(['"it-1"', '"it-2"', '"3"', '5', 'null', '"한글항목"']);
  if (r < 0.1) return `{${rng.chance(0.5) ? '"id"' : '"x"'}:${id}}`;
  return `{"id":${id},"title":${rng.chance(0.8) ? jstr(rng.pick(['첫 항목', '두번째', 'x'])) : 'null'},"weight":${rng.pick(['1', '2', '3'])},"done":${rng.pick(['true', 'true', 'false'])}}`;
}
function lane(rng, weird) {
  if (weird && rng.chance(0.08)) return rng.pick(['null', '7', '"s"']);
  const items = Array.from({ length: rng.int(0, 3) }, () => item(rng));
  const parts = [
    `"session":{"name":${rng.chance(0.8) ? jstr(rng.pick(['레인a', 'b', ''])) : 'null'},"addr":"","session_id":${rng.chance(0.8) ? jstr(rng.pick(['sid-1', 'abcdef123456', ''])) : 'null'},"pid":${rng.pick(['101', '0', 'null'])},"handle":${jstr(rng.pick(['h1', '']))},"kind":"claude","spawned_by":${jstr(rng.pick(['user', 'coordinator']))}}`,
    `"branch":${jstr(rng.pick(['feat/a', 'dev', '']))}`,
    `"worktree":${jstr(rng.pick(['/w/a', '/w/한글 b', '']))}`,
    `"owned":["a.mjs"]`,
    `"priority":${rng.pick(['1', '2', '3'])}`,
    `"items":[${items.join(',')}]`,
    `"queue":[${rng.chance(0.5) ? jstr(rng.pick(['다음 일', 'another'])) : ''}]`,
    `"hold":${rng.pick(['null', '{"reason":"대기","until":null}', '{"reason":"CPU","until":"2026-10-09T12:00:00+09:00"}', 'false'])}`,
    `"last_report_at":${iso(rng)}`,
    `"last_instr_at":${iso(rng)}`,
    `"ctx":${rng.pick(['null', '{"pct":42}', '{"pct":100}', '7'])}`,
    `"compact":{"pending":${rng.pick(['true', 'false'])},"last_at":${iso(rng)},"pre_compact":${rng.chance(0.7) ? jstr('남은 일 하나') : 'null'},"history":[{"before_tokens":100000,"after_tokens":24000},{"before_tokens":9,"after_tokens":null}]}`,
    `"memo":${jstr(rng.pick(['/x/resume-a1.md', '/x/두 글자.md']))}`,
    `"brief":${rng.chance(0.8) ? jstr(rng.pick(['요약 한 줄', 'brief with /path', ''])) : 'null'}`,
    `"state":${rng.pick(['"active"', '"closed"', '"closing"'])}`,
  ];
  if (rng.chance(0.1)) parts.splice(rng.int(0, parts.length - 1), 1);
  return `{${parts.join(',')}}`;
}
function instrs(rng) {
  return Array.from({ length: rng.int(0, 4) }, () =>
    `{"id":${rng.pick(['"a1-1"', '"a1-7"', '"b-2-2"', 'null', '5', '"x"'])},"lane":${jstr(rng.pick(['a1', 'b-2', 'kit']))},"kind":"start","sent_at":"2026-10-09T00:00:00+09:00","ack_at":${rng.pick(['null', '"2026-10-09T00:01:00+09:00"'])},"nudges":0}`);
}
function stateDoc(rng) {
  const r = rng.next();
  if (r < 0.06) return rng.pick(['{', '', '[]', '5', 'null', '"s"', '{"run":[]}', '{"lanes":"x"}', '{"run":{"coordinator":5}}']);
  const lanes = [];
  for (const l of LANE_IDS.slice(0, rng.int(0, LANE_IDS.length))) lanes.push(`${JSON.stringify(l)}:${lane(rng, true)}`);
  const merge = `"merge":{"in_flight":${rng.pick(['null', '{"lane":"a1","branch":"feat/a","granted_at":"2026-10-09T00:00:00+09:00"}'])},"queue":[${rng.pick(['', '{"lane":"b-2"}', '"b-2"', '{"lane":"a1"},{"lane":"kit"}'])}],"history":[{"lane":"a1","branch":"feat/a","merged":"2026-10-08T00:00:00+09:00","cleaned":"2026-10-08T00:05:00+09:00"}]}`;
  const parts = [
    `"schema":1`,
    `"run":{"id":"r1","goal":${jstr(rng.pick(['목표 글', '']))},"rules_doc":${jstr(rng.pick(['docs/RULE.md', '']))},"integration_branch":"dev","created_at":"2026-10-09T00:00:00+09:00","closed_at":${rng.pick(['null', 'null', '"2026-10-09T05:00:00+09:00"'])},"coordinator":{"name":"조정","addr":"","session_id":${jstr(rng.pick(['s-one1234xxxx', 'abcdef123456', '']))},"handle":"term_x","pid":${rng.pick(['4242', '0'])}},"cron_id":null,"usage_band_notified":null,"last_tick_at":${iso(rng)}}`,
    `"lanes":{${lanes.join(',')}}`,
    merge,
    `"windows":[{"kind":"merge","lane":"a1","until":"2026-10-09T12:00:00+09:00"}]`,
    `"usage":{"band":${rng.pick(['"Y"', '"UNKNOWN"', '"G"', 'null'])},"five":${rng.pick(['10', '75', 'null'])},"week":${rng.pick(['20', '85', 'null'])},"src":"tick","at":${iso(rng)}}`,
    `"load":{"soft_ticks":0,"hard_ticks":${rng.pick(['0', '2'])},"release_ticks":0,"banned":[]}`,
    `"instrs":[${instrs(rng).join(',')}]`,
    `"backlog":[],"approvals":[]`,
    `"glm":{"status":${rng.pick(['null', '"ok"'])},"at":null,"detail":null}`,
    `"decisions":[{"at":"2026-10-09T00:00:00+09:00","text":"결정 1"}]`,
    `"pending_user":[${rng.pick(['', '{"at":"2026-10-09T00:00:00+09:00","text":"결정 대기 1"}'])}]`,
    `"office":{"sent":{${rng.pick(['', `"a1":"jji-test/host/임시:a1·요약"`, `"_lead":"jji-test/host/coord:abcdef12"`, `"a1":"k1","kit":"k2"`])}},"label":{"a1":"작업 중"},"sumhash":{"a1":"ab12"},"user":"jji-test","finished":${rng.pick(['false', 'false', 'true'])}}`,
  ];
  if (rng.chance(0.1)) parts.splice(rng.int(0, parts.length - 1), 1);
  return `{${parts.join(',')}}`;
}

/** 사례 files: state/r1/state.json (+events.jsonl 가끔). COORD_RUN=r1 고정 */
function stateCase(rng, extra = {}, { need = false } = {}) {
  const files = {};
  // need: state.json 이 없으면 bash 판 st_update 가 서브셸에서 빈 경로(`/.lock`)로 잠금을 300번(약 30초) 재시도하다 실패해 시간 초과가 되므로(의심 목록) 반드시 둔다
  if (need || rng.chance(0.92)) files['state/r1/state.json'] = stateDoc(rng);
  if (rng.chance(0.3)) files['state/r1/events.jsonl'] = '{"at":"2026-10-09T00:00:00+09:00","kind":"init","lane":null,"data":{"goal":""}}\n';
  if (rng.chance(0.1)) files['state/r1/lanes/a1/reports.md'] = '- 2026-10-09T00:00:00+09:00 이전 보고\n';
  if (rng.chance(0.15)) files['state/current'] = 'r1\n';
  return { files, env: { COORD_RUN: 'r1' }, stdin: '', ...extra };
}

// ---------- 경로·값 풀 ----------
const SET_PATHS = ['.run.goal', '.run.rules_doc', '.lanes.a1.state', '.lanes["x y"].memo', '.lanes["a1"].compact.pending', '.office.finished', '.office.sent["_lead"]', '.office.sent["a1"]',
  '.office.label["a1"]', '.office.sumhash["a1"]', '.instrs', '.usage', '.windows', '.pending_user', '.approvals', '.glm', '.run.coordinator.pid', '.run.cron_id', '.run.last_tick_at',
  '.run', '.', '.merge.in_flight', '.merge.queue', '.pending_user[0].text', '.lanes.a1.items[0].done', '.nonexistent.deep', '.lanes.a1.session', '.decisions',
  '.lanes.a1.compact.history', '.lanes.a1.compact.history[-1]', '.run.coordinator'];
const SET_PATHS_BAD = ['run.goal', '["k"]', '.a[', '..a', '.a..b', '. and'];
const JSON_VALS = ['"s"', '"한글 줄"', '""', '1', '-5', '1.50', '1e3', '12345678901234567890', 'true', 'false', 'null', '{}', '[]', '{"a":1}', '["x",2,null]', '{"b":{"c":[1,{"d":false}]}}', '"a b/c"', '"\\u007f\\u0001"', '"~/p"'];
const JSON_VALS_BAD = ['x', '', '{a:1}', '[1,', '{"a"}', '1 2', 'null null'];

// ---------- 명세 ----------
export default {
  module: 'coord-state',
  kind: 'script',
  sh: 'scripts/coord-state.sh',
  mjs: 'scripts/coord-state.mjs',
  switchEnv: 'COORD_JS_COORD_STATE',
  env: ENV,
  // STALE_RUN 줄의 idle=<n>m 은 두 판이 병렬로 돌아 1분 경계에서 달라질 수 있다 — 숫자만 지운다.
  normalize(buf) {
    return Buffer.from(buf.toString('latin1').replace(/idle=[0-9]+m/g, 'idle=Nm'), 'latin1');
  },
  functions: {
    init: {
      compareFiles: false,
      gen(rng) {
        const files = {};
        // 이미 있는 회차들: 같은 세션(SESSION_RUNS)·다른 세션(STALE_RUN)·마감(closed_at) 섞기
        const mySid = rng.pick(['s-abc1234', 'sess8-xy', '']);
        for (let k = rng.int(0, 3); k > 0; k--) {
          const rid = rng.pick(['old1', 'old-2', 'r.x']);
          const sid = rng.chance(0.5) ? mySid : rng.pick(['s-other1', 'zzzz9999', '']);
          const closed = rng.chance(0.4);
          const finished = rng.chance(0.3);
          files[`state/${rid}/state.json`] = `{"run":{"id":"${rid}","closed_at":${closed ? '"2026-10-08T00:00:00+09:00"' : 'null'},"coordinator":{"session_id":${JSON.stringify(sid)},"pid":${rng.pick(['0', '4242'])}}},"office":{"finished":${finished}},"lanes":{"l1":{"state":"active","items":[]},"l2":{"state":"closed","items":[]}}}`;
          if (rng.chance(0.4)) files[`state/${rid}/events.jsonl`] = '';
        }
        if (rng.chance(0.3)) files['state/current'] = 'old1\n';
        const args = ['init'];
        const id = rng.chance(0.75) ? rng.pick(RUN_IDS_OK) : rng.pick(RUN_IDS_BAD);
        args.push(id);
        if (rng.chance(0.4)) args.push('--goal', rng.pick(['목표', 'goal with space', '']));
        if (rng.chance(0.3)) args.push('--rules-doc', 'docs/RULE.md');
        if (rng.chance(0.06)) args.push('--bogus');
        return {
          args, files, stdin: '',
          env: {
            COORD_SESSION_ID: rng.chance(0.75) ? mySid : '',
            CLAUDE_PID: rng.pick(['', '0', '4242', 'abc', '1.5']),
            ORCA_TERMINAL_HANDLE: rng.pick(['', 'term_h1']),
          },
        };
      },
      async fixed() {
        const mk = (sid, closed, finished, extraLanes = '"l1":{"state":"active","items":[]}') =>
          `{"run":{"id":"X","closed_at":${closed ? '"2026-10-08T00:00:00+09:00"' : 'null'},"coordinator":{"session_id":${JSON.stringify(sid)},"pid":0}},"office":{"finished":${finished ? 'true' : 'false'}},"lanes":{${extraLanes}}}`;
        return [
          { label: 'lessons.sh: init r1 --goal 시험', args: ['r1', '--goal', '시험'], files: {}, env: { COORD_SESSION_ID: 's-lessons', CLAUDE_PID: '4242' } },
          { label: 'run-close.sh: 같은 세션 열린 회차 → SESSION_RUNS open=2', args: ['r4'], files: { 'state/r3/state.json': mk('s-three', false, false) }, env: { COORD_SESSION_ID: 's-three', CLAUDE_PID: '4242' } },
          { label: 'run-close.sh: 다른 세션 열린 회차 → STALE_RUN', args: ['r5'], files: { 'state/r3/state.json': mk('s-three', false, false), 'state/r4/state.json': mk('s-three', false, false) }, env: { COORD_SESSION_ID: 's-other', CLAUDE_PID: '4242' } },
          { label: 'run-close.sh: 마감된 회차는 경고 없음', args: ['r6'], files: { 'state/r1/state.json': mk('s-one', true, true), 'state/r2/state.json': mk('s-two', true, true) }, env: { COORD_SESSION_ID: 's-five', CLAUDE_PID: '4242' } },
          { label: 'run-close.sh: pid fallback(p<pid>) 세션', args: ['r7'], files: { 'state/old/state.json': '{"run":{"closed_at":null,"coordinator":{"session_id":"","pid":4242}},"office":{"finished":false},"lanes":{}}' }, env: { COORD_SESSION_ID: 's-five', CLAUDE_PID: '0' } },
          { label: '형식 오류: current', args: ['current'], files: {}, env: {} },
          { label: '형식 오류: a/b', args: ['a/b'], files: {}, env: {} },
          { label: '이미 있는 회차', args: ['r1'], files: { 'state/r1/state.json': mk('s', false, false) }, env: {} },
          { label: '인자 없음', args: ['init'], files: {}, env: {} },
          { label: '--goal 값 없음', args: ['r9', '--goal'], files: {}, env: {} },
        ];
      },
    },
    use: {
      gen(rng) {
        const id = rng.chance(0.8) ? rng.pick(RUN_IDS_OK.concat(['old1'])) : rng.pick(RUN_IDS_BAD);
        const files = {};
        const okId = id !== '' && id !== 'current' && !id.includes('/') && id !== '..';   // 'current'·'..' 폴더는 current 파일·상위 폴더와 겹친다
        if (rng.chance(0.85)) files[`state/${okId ? id : 'r1'}/state.json`] = stateDoc(rng);
        if (rng.chance(0.5)) files['state/current'] = rng.pick(['old1\n', 'r1\n']);
        return { args: ['use', id], files, env: { COORD_RUN: '' }, stdin: '' };
      },
      fixed: [
        { label: 'lessons.sh: use r1', args: ['r1'], files: { 'state/r1/state.json': '{"run":{"id":"r1"}}' }, env: { COORD_RUN: '' } },
        { label: '없는 회차', args: ['nope'], files: {}, env: { COORD_RUN: '' } },
        { label: '인자 없음', args: ['use'], files: {}, env: {} },
      ],
    },
    get: {
      gen(rng) {
        const exprs = ['.', '.run', '.run.goal', '.run.id', '.lanes', '.lanes.a1', '.lanes["x y"]', '.lanes.a1.items', '.lanes.a1.items[-1]', '.instrs', '.merge', '.office',
          '.usage.band', '.windows', '.pending_user', '.run.coordinator.pid', '.schema', '.nonexistent', '.lanes.a1.compact.history[-1].after_tokens',
          '.run.closed_at // ""', '.office.finished // false', '.usage.five // 0', '.lanes.a1.memo // empty', '.lanes | keys', '.run | keys', '.instrs | length',
          '.run | has("state")', '.lanes | has("a1")', '.lanes | length', '.merge.queue | length', '.a[', 'keys', '. | tostring'];
        const c = stateCase(rng);
        return { args: rng.chance(0.85) ? ['get', rng.pick(exprs)] : ['get'], ...c };
      },
      fixed: [
        { label: 'lessons.sh: get .lanes.m1.memo', args: ['.lanes.m1.memo'], files: { 'state/r1/state.json': '{"lanes":{"m1":{"memo":"/x/resume-m1.md"}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'lessons.sh: get history[-1].after_tokens', args: ['.lanes.c2.compact.history[-1].after_tokens'], files: { 'state/r1/state.json': '{"lanes":{"c2":{"compact":{"history":[{"after_tokens":24000},{"after_tokens":null}]}}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'run-close.sh: get .run.closed_at // ""', args: ['.run.closed_at // ""'], files: { 'state/r1/state.json': '{"run":{"closed_at":null}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'run-close.sh: get .run | has("state")', args: ['.run | has("state")'], files: { 'state/r1/state.json': '{"run":{"closed_at":null}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'resume.md: .lanes | keys', args: ['.lanes | keys'], files: { 'state/r1/state.json': '{"lanes":{"b":{},"a":{},"10":{},"2":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'state.json 없음', args: ['.run.id'], files: {}, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '깨진 state.json', args: ['.run.id'], files: { 'state/r1/state.json': '{"run":' }, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    set: {
      gen(rng) {
        const c = stateCase(rng, {}, { need: true });
        const path = rng.chance(0.85) ? rng.pick(SET_PATHS) : rng.pick(SET_PATHS_BAD);
        const val = rng.chance(0.9) ? rng.pick(JSON_VALS) : rng.pick(JSON_VALS_BAD);
        return { args: ['set', path, val], ...c };
      },
      fixed: [
        { label: 'lessons.sh: set .run.goal "목표"', args: ['.run.goal', '"목표"'], files: { 'state/r1/state.json': '{"run":{"goal":""},"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'lessons.sh: set .lanes.c1.compact.pre_compact', args: ['.lanes.c1.compact.pre_compact', '"남은 일 하나"'], files: { 'state/r1/state.json': '{"lanes":{"c1":{"compact":{"pre_compact":null}}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'instr-id.sh: set .instrs (경계 id 들)', args: ['.instrs', '[{"lane":"a1","id":"a1-7"},{"lane":"a1","id":null},{"lane":"a1","id":5},{"lane":"a1","id":{"x":1}},{"lane":"a1"},{"lane":"b1","id":"b1-40"}]'], files: { 'state/r1/state.json': '{"instrs":[],"lanes":{"a1":{},"b1":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'tick.sh: set .usage (객체)', args: ['.usage', '{"band":"Y","five":75,"week":85,"src":"tick","at":"2026-10-09T01:00:00+09:00"}'], files: { 'state/r1/state.json': '{"usage":{"band":"UNKNOWN"}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'office.sh: set .office.sent["a1"]', args: ['.office.sent["a1"]', '"jji-test/host/임시:a1·요약"'], files: { 'state/r1/state.json': '{"office":{"sent":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '경로 형식 오류(dot 없음)', args: ['run.goal', '"x"'], files: { 'state/r1/state.json': '{"run":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'json 오류', args: ['.run.goal', '{a:1}'], files: { 'state/r1/state.json': '{"run":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'merge: in_flight 바뀜', args: ['.merge.in_flight', '{"lane":"b2","branch":"feat/b2","granted_at":"2026-10-09T00:00:00+09:00"}'], files: { 'state/r1/state.json': '{"merge":{"in_flight":{"lane":"a1"},"queue":[]}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'pending_user: lead-sync 경로', args: ['.pending_user', '[{"at":"2026-10-09T00:00:00+09:00","text":"결정 대기"}]'], files: { 'state/r1/state.json': '{"pending_user":[]}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    'set-many': {
      gen(rng) {
        const c = stateCase(rng, {}, { need: true });
        const n = rng.int(1, 4);
        const args = ['set-many'];
        for (let k = 0; k < n; k++) args.push(rng.pick(SET_PATHS), rng.chance(0.92) ? rng.pick(JSON_VALS) : rng.pick(JSON_VALS_BAD));
        if (rng.chance(0.1)) args.push('.orphan');
        return { args, ...c };
      },
      fixed: [
        { label: 'lessons.sh: set-many goal·rules_doc', args: ['set-many', '.run.goal', '"목표2"', '.run.rules_doc', '"규칙"'], files: { 'state/r1/state.json': '{"run":{"goal":"","rules_doc":""}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'office.sh: sent·label·sumhash 3쌍', args: ['set-many', '.office.sent["a1"]', 'null', '.office.label["a1"]', 'null', '.office.sumhash["a1"]', 'null'], files: { 'state/r1/state.json': '{"office":{"sent":{"a1":"k"},"label":{"a1":"s"},"sumhash":{"a1":"h"}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'merge 포함 → 하나씩 set', args: ['set-many', '.run.goal', '"g"', '.merge.queue', '[]'], files: { 'state/r1/state.json': '{"run":{"goal":""},"merge":{"queue":[]}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '홀수 개 → usage', args: ['set-many', '.run.goal'], files: { 'state/r1/state.json': '{"run":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '인자 없음', args: ['set-many'], files: { 'state/r1/state.json': '{"run":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    'lane-add': {
      compareFiles: false,
      gen(rng) {
        const c = stateCase(rng, {}, { need: true });
        const laneIds = ['a1', 'b-2', 'kit', 'm0', 'x y', '한글', 'A.B-C_D', 'with"q', 'with]b', 'a'.repeat(41), 'n'.repeat(40), '', 'a b'];
        const jsons = ['{}', '{"brief":"요약 한 줄"}', '{"memo":"/x/m.md","session":{"kind":"claude","handle":"h-a1","session_id":"sid"}}', '{"brief":"다시 호출"}',
          '{"branch":"feat/x","worktree":"/w/x","owned":["a.mjs"],"forbidden":["b.sh"],"priority":2,"items":[{"id":"1","title":"첫","weight":2,"done":false}],"queue":["다음"]}',
          '{"memo":""}', '{"state":"closing"}', 'x', '', '{"session":{"pid":7}}', '{"items":[{"id":1,"done":true,"weight":3}]}'];
        return { args: ['lane-add', rng.pick(laneIds), rng.chance(0.92) ? rng.pick(jsons) : rng.pick(jsons.slice(-3))], ...c };
      },
      fixed: [
        { label: 'lessons.sh: lane-add m0 memo 없음 경고', args: ['lane-add', 'm0', '{"brief":"메모 없음"}'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'lessons.sh: lane-add m1 memo', args: ['lane-add', 'm1', '{"memo":"/x/resume-m1.md"}'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'lessons.sh: 이미 memo 있는 레인에 다시', args: ['lane-add', 'm1', '{"brief":"다시 호출"}'], files: { 'state/r1/state.json': '{"lanes":{"m1":{"memo":"/x/resume-m1.md"}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'lessons.sh: memo 빈 문자열 경고', args: ['lane-add', 'm2', '{"memo":""}'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'run-close.sh: lane-add a1 brief', args: ['lane-add', 'a1', '{"brief":"레인"}'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'spawn-lane.sh: session 병합', args: ['lane-add', 'l9', '{"session":{"kind":"glm","spawned_by":"coordinator","session_id":"s-glm"},"state":"active"}'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '이미 오피스에 올라간 레인(office.sent 있음)', args: ['lane-add', 'a1', '{"brief":"바뀐 요약"}'], files: { 'state/r1/state.json': '{"lanes":{"a1":{"brief":"옛"}},"office":{"sent":{"a1":"key1"}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '이름 41자', args: ['lane-add', 'a'.repeat(41), '{}'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '이름 형식 오류', args: ['lane-add', 'bad name!', '{}'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'json 오류', args: ['lane-add', 'a1', 'x'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    event: {
      compareFiles: false,
      gen(rng) {
        const c = stateCase(rng);
        const kinds = ['lane-closed', 'compact-sent', 'window-open', 'approval', 'hold-expired', 'test-kind', 'spawned', 'run-closed', 'stop', 'nudge', 'merge-done', 'compact-timeout', 'window-close', 'lane-closed-x'];
        const args = ['event', rng.pick(kinds)];
        if (rng.chance(0.8)) args.push(rng.pick(['a1', 'b-2', '-', '', 'x y']));
        if (rng.chance(0.7)) args.push(rng.chance(0.92) ? rng.pick(['{}', '{"k":"v"}', '{"why":"시험"}', '{"item":"it-1"}', '[]', '5', 'null', '{"text":"한글 보고"}']) : rng.pick(JSON_VALS_BAD));
        if (rng.chance(0.05)) args.push('extra');
        return { args, ...c };
      },
      fixed: [
        { label: 'lessons.sh: event test-kind lane-a {"k":"v"}', args: ['event', 'test-kind', 'lane-a', '{"k":"v"}'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'run-close.sh: event run-closed - {"why":"시험"}', args: ['event', 'run-closed', '-', '{"why":"시험"}'], files: { 'state/r1/state.json': '{"run":{"closed_at":null}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'event json 오류', args: ['event', 'bad', 'a1', '{a}'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '인자 없음', args: ['event'], files: { 'state/r1/state.json': '{}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    instr: {
      compareFiles: false,
      gen(rng) {
        const c = stateCase(rng);
        return { args: ['instr', rng.pick(['a1', 'b-2', 'kit', 'nope', '']), rng.pick(['start', 'kick', 'fix', ''])], ...c };
      },
      fixed: [
        { label: 'instr-id.sh: 경계 id 섞임 → a1-8', args: ['instr', 'a1', 'kick'], files: { 'state/r1/state.json': '{"instrs":[{"lane":"a1","id":"a1-7"},{"lane":"a1","id":null},{"lane":"a1","id":5},{"lane":"a1","id":{"x":1}},{"lane":"a1"},{"lane":"b1","id":"b1-40"}],"lanes":{"a1":{},"b1":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'instr-id.sh: 다른 레인 번호 따로 → b1-41', args: ['instr', 'b1', 'kick'], files: { 'state/r1/state.json': '{"instrs":[{"lane":"a1","id":"a1-7"},{"lane":"b1","id":"b1-40"}],"lanes":{"a1":{},"b1":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'lessons.sh: 첫 지시 a1-1', args: ['instr', 'lane-a', 'start'], files: { 'state/r1/state.json': '{"instrs":[],"lanes":{"lane-a":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '없는 레인', args: ['instr', 'nope', 'start'], files: { 'state/r1/state.json': '{"instrs":[],"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '인자 1개', args: ['instr', 'a1'], files: { 'state/r1/state.json': '{"lanes":{"a1":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    ack: {
      compareFiles: false,
      gen(rng) {
        const c = stateCase(rng);
        return { args: ['ack', rng.pick(['a1-1', 'a1-7', 'b-2-2', 'nope', 'null', '5', ''])], ...c };
      },
      fixed: [
        { label: 'lessons.sh: ack a1-1', args: ['ack', 'a1-1'], files: { 'state/r1/state.json': '{"instrs":[{"id":"a1-1","lane":"a1","ack_at":null}]}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '없는 지시', args: ['ack', 'nope'], files: { 'state/r1/state.json': '{"instrs":[{"id":"a1-1"}]}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    report: {
      compareFiles: false,
      gen(rng) {
        const c = stateCase(rng);
        const args = ['report', rng.pick(['a1', 'b-2', 'kit', 'nope'])];
        if (rng.chance(0.7)) args.push(rng.pick(['보고 1', '요약 글', '여러 글자 있는 보고 문장', '', '한글/경로 /a/b']));
        if (rng.chance(0.35)) args.push('--question', rng.pick([
          '어느 쪽으로 할까요?', '질문\n둘째 줄', '  앞공백 질문  ', '탭\t질문', '제어문자', '첫 줄이 200자를 넘는 질문'.repeat(20), '', '한 줄\n\n둘째', 'token=AbCdEf 가림']));
        else if (rng.chance(0.35)) args.push('--answered');
        if (rng.chance(0.05)) args.push('뒤에 더');
        if (rng.chance(0.05)) args.push('--question', '--answered');
        return { args, ...c };
      },
      fixed: [
        { label: 'lessons.sh: report lane-a "보고 1"', args: ['report', 'lane-a', '보고 1'], files: { 'state/r1/state.json': '{"lanes":{"lane-a":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'console-keys.sh: report --question 여러 줄', args: ['report', 'kit', '요약 글', '--question', '어느 쪽으로 할까요? token=AbCdEf\n둘째 줄'], files: { 'state/r1/state.json': '{"lanes":{"kit":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'console-keys.sh: report --answered', args: ['report', 'kit', '--answered'], files: { 'state/r1/state.json': '{"lanes":{"kit":{"question":{"at":"x","text":"q"}}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'console-keys.sh: 예전 사용(요약만)', args: ['report', 'kit', '그냥 보고'], files: { 'state/r1/state.json': '{"lanes":{"kit":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '--question 빈 글', args: ['report', 'kit', '--question', ''], files: { 'state/r1/state.json': '{"lanes":{"kit":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '--question·--answered 같이', args: ['report', 'kit', '--question', 'q', '--answered'], files: { 'state/r1/state.json': '{"lanes":{"kit":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '없는 레인', args: ['report', 'nope', '보고'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    'item-done': {
      compareFiles: false,
      gen(rng) {
        const c = stateCase(rng);
        return { args: ['item-done', rng.pick(['a1', 'b-2', 'kit', 'nope']), rng.pick(['it-1', 'it-2', '3', '5', 'null', 'nope', ''])], ...c };
      },
      fixed: [
        { label: 'lessons.sh: item-done lane-a it-1', args: ['item-done', 'lane-a', 'it-1'], files: { 'state/r1/state.json': '{"lanes":{"lane-a":{"items":[{"id":"it-1","done":false,"weight":1},{"id":"it-2","done":true,"weight":2}]}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '숫자 id 항목', args: ['item-done', 'a1', '3'], files: { 'state/r1/state.json': '{"lanes":{"a1":{"items":[{"id":3,"done":false,"weight":3}]}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '없는 항목', args: ['item-done', 'a1', 'zz'], files: { 'state/r1/state.json': '{"lanes":{"a1":{"items":[{"id":"it-1"}]}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '가중치 진도', args: ['item-done', 'a1', 'it-1'], files: { 'state/r1/state.json': '{"lanes":{"a1":{"items":[{"id":"it-1","done":true,"weight":3},{"id":"it-2","done":false,"weight":1}]}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    progress: {
      gen: (rng) => stateCase(rng, { args: ['progress'] }),
      fixed: [
        { label: 'run-close.sh 계열: 레인별·ALL 진도', args: ['progress'], files: { 'state/r1/state.json': '{"lanes":{"lane-a":{"items":[{"id":"1","done":true,"weight":1},{"id":"2","done":false,"weight":1}]},"lane-b":{"items":[{"id":"1","done":true,"weight":2},{"id":"2","done":true,"weight":2}]}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'weight 없는 항목(기본 1)', args: ['progress'], files: { 'state/r1/state.json': '{"lanes":{"a":{"items":[{"id":"1","done":true}]}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '레인 없음', args: ['progress'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    hold: {
      compareFiles: false,
      gen(rng) {
        const c = stateCase(rng);
        const args = ['hold', rng.pick(['a1', 'b-2', 'kit', 'nope']), rng.pick(['-', '대기사유', 'CPU', '한글 사유', ''])];
        if (rng.chance(0.4)) args.push(rng.pick(['2026-10-09T12:00:00+09:00', '2026-10-10T00:00:00Z', 'bad-date', '2026-10-09 12:00', '']));
        return { args, ...c };
      },
      fixed: [
        { label: 'lessons.sh: hold lane-a 대기사유', args: ['hold', 'lane-a', '대기사유'], files: { 'state/r1/state.json': '{"lanes":{"lane-a":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'hold 풀기(-)', args: ['hold', 'lane-a', '-'], files: { 'state/r1/state.json': '{"lanes":{"lane-a":{"hold":{"reason":"x"}}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'until 정상', args: ['hold', 'lane-a', '사유', '2026-10-09T12:00:00+09:00'], files: { 'state/r1/state.json': '{"lanes":{"lane-a":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'until 형식 오류', args: ['hold', 'lane-a', '사유', 'bad-date'], files: { 'state/r1/state.json': '{"lanes":{"lane-a":{}}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '없는 레인', args: ['hold', 'nope', '-'], files: { 'state/r1/state.json': '{"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    'close-run': {
      compareFiles: false,
      gen(rng) {
        const c = stateCase(rng);
        const args = ['close-run'];
        if (rng.chance(0.7)) args.push(rng.chance(0.92) ? rng.pick(['{"reason":"finished"}', '{}', '{"why":"x"}', '']) : '{bad');
        if (rng.chance(0.05)) args.push('extra');
        return { args, ...c };
      },
      fixed: [
        { label: 'run-close.sh: close-run {"reason":"finished"}', args: ['close-run', '{"reason":"finished"}'], files: { 'state/r1/state.json': '{"run":{"closed_at":null},"office":{"finished":false},"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'run-close.sh: 이미 마감 → closed_at 유지·finish 다시', args: ['close-run', '{"reason":"again"}'], files: { 'state/r1/state.json': '{"run":{"closed_at":"2026-10-09T05:00:00+09:00"},"office":{"finished":true},"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '인자 2개 → usage', args: ['close-run', '{}', 'x'], files: { 'state/r1/state.json': '{"run":{"closed_at":null}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: 'state.json 없음', args: ['close-run'], files: {}, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    summary: {
      compareFiles: false,
      gen: (rng) => stateCase(rng, { args: ['summary'] }),
      fixed: [
        { label: 'lessons.sh: summary', args: ['summary'], files: { 'state/r1/state.json': '{"run":{"id":"r1","goal":"목표","rules_doc":"docs/RULE.md","integration_branch":"dev","coordinator":{"name":"조정","session_id":"s-abc"}},"lanes":{"lane-a":{"branch":"feat/a","worktree":"/w/a","state":"active","items":[{"id":"1","title":"첫","weight":2,"done":true}],"queue":["다음"]},"b":{"state":"closed","hold":{"reason":"대기","until":"2026-10-09T12:00:00+09:00"},"last_report_at":"2026-10-09T01:02:03+09:00","ctx":{"pct":42}}},"merge":{"in_flight":{"lane":"lane-a","branch":"feat/a","granted_at":"2026-10-09T00:00:00+09:00"},"queue":[{"lane":"b"}],"history":[{"lane":"c","branch":"feat/c","merged":"2026-10-08T00:00:00+09:00","cleaned":"2026-10-08T00:05:00+09:00"}]},"windows":[{"kind":"merge","lane":"lane-a","until":"2026-10-09T12:00:00+09:00"}],"usage":{"band":"Y","five":75,"week":85,"src":"tick","at":"2026-10-09T01:00:00+09:00"},"pending_user":[{"at":"2026-10-09T00:00:00+09:00","text":"결정 대기"}],"decisions":[{"at":"2026-10-09T00:00:00+09:00","text":"결정 1"}]}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
        { label: '빈 회차', args: ['summary'], files: { 'state/r1/state.json': '{"run":{"id":"r1"},"lanes":{}}' }, env: { COORD_RUN: 'r1' }, stdin: '' },
      ],
    },
    help: {
      gen: (rng) => ({ args: [rng.pick(['help', '-h', '--help'])], files: {}, env: {}, stdin: '' }),
      fixed: [{ label: 'help', args: ['help'], files: {}, env: {}, stdin: '' }],
    },
    bogus: {
      gen: (rng) => ({ args: [rng.pick(['bogus', 'Init', 'GET', 'events'])], files: {}, env: {}, stdin: '' }),
      fixed: [{ label: '모르는 하위명령', args: ['bogus'], files: {}, env: {}, stdin: '' }],
    },
    noargs: {
      gen: (rng) => ({ args: [], files: {}, env: {}, stdin: '' }),
      fixed: [{ label: '인자 없음', args: [], files: {}, env: {}, stdin: '' }],
    },
  },
};
