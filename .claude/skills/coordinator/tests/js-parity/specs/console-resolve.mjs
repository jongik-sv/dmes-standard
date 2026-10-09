// scripts/lib/console-resolve.sh ↔ console-resolve.mjs 대조 명세(스위치 COORD_JS_CONSOLE_RESOLVE).
// 상태 트리(회차 state.json·_session·콘솔 lead 폴더)를 사례 작업 폴더에 만들고 신원은 CR_IDENT/CR_HOST 환경 변수로 준다.
// 살아 있는 pid 는 대조를 돌리는 이 프로세스(process.pid), 죽은 pid 는 존재할 수 없는 큰 수.
// lead-state.sh 는 slots 파일을 그대로 내는 가짜(COORD_LEAD_STATE). 시간 제한(CR_LIMIT_S)은 tests/console-resolve.test.mjs 가 본다.
// 대조하지 않는 것: 사전 정렬이 로캘에 따라 달라지는 이름(레인·핸들은 소문자·숫자만), 한 이름이 셸 글롭 문자를 가진 경우.
const SH = 'scripts/lib/console-resolve.sh';
const MJS = 'scripts/lib/console-resolve.mjs';

const ME = 'jji-test', HOST = 'host1';
const ALIVE = process.pid, DEAD = 1999999999;
const FAKE_LS = '#!/bin/sh\ncat "$FAKE_SLOTS" 2>/dev/null\n';
const J = (v) => JSON.stringify(v);
const S8S = ['aaaa1111', 'bbbb2222', 'cccc3333', 'dddd4444', '00000001', 'eeee5555'];
const LANES = ['kit', 'dup', 'gone', 'zombie', 'old', 'nopid', 'x1', 'x2'];
const HANDLES = ['h1', 'h2', 'hk1', 'term7', 'hd2'];
const BAD_JSON = ['{bad', '', '[]', '"s"', '5', 'null', '{"a":1}{"b":', '[1,2]'];

let CALM = false;
function pidVal(rng) {
  if (CALM) return rng.chance(0.9) ? ALIVE : DEAD;
  return rng.pick([ALIVE, ALIVE, ALIVE, ALIVE, ALIVE, DEAD, DEAD, 0, null, undefined, String(ALIVE), 'abc', '', 1.0]);
}
function ident(rng) {
  if (CALM) return { user: ME, host: HOST };
  // 대부분 이 신원, 가끔 남의 것·빈 값
  const r = rng.next();
  if (r < 0.75) return { user: ME, host: HOST };
  if (r < 0.85) return { user: 'other', host: HOST };
  if (r < 0.92) return { user: ME, host: 'otherhost' };
  if (r < 0.96) return {};
  return { user: 5, host: HOST };
}
function maybe(rng, v, p = 0.85) { return rng.chance(p) ? v : undefined; }

function session(rng, s8) {
  if (!CALM && rng.chance(0.06)) return rng.pick(BAD_JSON);
  const o = { key: CALM ? `${ME}/${HOST}/coord:${s8}` : rng.pick([`${ME}/${HOST}/coord:${s8}`, `${ME}/${HOST}/coord:${s8}`, `${ME}/${HOST}/coord`, `x/coord:`, `x/y`, 5]), session_id: s8, ...ident(rng) };
  const pid = pidVal(rng); if (pid !== undefined) o.pid = pid;
  const h = CALM ? rng.pick(['hL1', 'hL2', '']) : rng.pick(['hL1', 'hL2', '', 'h\u001fx', 5, null, undefined, 'a b']);
  if (h !== undefined) o.handle = h;
  return J(o);
}
function run(rng, id, s8s, seen) {
  if (!CALM && rng.chance(0.05)) return rng.pick(BAD_JSON);
  const s8 = rng.pick(s8s);
  seen.sess.push(s8);
  const coord = {};
  const sid = CALM ? `${s8}-0000` : rng.pick([`${s8}-0000`, `${s8.toUpperCase()}-1`, '', undefined, 7]);
  if (sid !== undefined) coord.session_id = sid;
  const pid = pidVal(rng); if (pid !== undefined) coord.pid = pid;
  const ch = rng.pick(['hL2', 'hL3', '', undefined, 5]);
  if (ch !== undefined) coord.handle = ch;
  const doc = { schema: 1, run: { id, coordinator: rng.chance(0.97) ? coord : 'bad' } };
  const closed = CALM ? null : rng.pick([null, null, null, '2026-10-06T00:00:00+09:00', false, undefined]);
  if (closed !== undefined) doc.run.closed_at = closed;
  const lanes = {};
  const nl = rng.int(0, 4);
  for (let i = 0; i < nl; i++) {
    const l = {};
    const st = rng.pick(['active', 'active', 'closed', 'closing', undefined, 5, null]);
    if (st !== undefined) l.state = st;
    if (rng.chance(0.9)) { const s = {}; const lp = pidVal(rng); if (lp !== undefined) s.pid = lp; const lh = rng.pick(['hk1', 'hd1', '', undefined, 'h x']); if (lh !== undefined) s.handle = lh; l.session = s; }
    const ln = rng.pick(LANES); seen.lanes.push(ln);
    lanes[ln] = rng.chance(0.03) ? rng.pick([5, 'x', null, true]) : l;
  }
  doc.lanes = rng.chance(0.03) ? rng.pick([[], 'x', 5, null]) : lanes;
  const office = { ...ident(rng) };
  if (!CALM && rng.chance(0.15)) office.finished = rng.pick([true, true, false, 'yes']);
  if (office.user === undefined && rng.chance(0.6)) office.user = ME;
  doc.office = rng.chance(0.97) ? office : 'bad';
  return rng.chance(0.03) ? `${J(doc)}\n${J(doc)}` : J(doc);
}
function lead(rng) {
  if (!CALM && rng.chance(0.05)) return rng.pick(BAD_JSON);
  const o = { agent: CALM ? `${ME}/${HOST}/lead` : rng.pick([`${ME}/${HOST}/lead`, `${ME}/${HOST}/lead`, `other/${HOST}/lead`, `${ME}/h2/lead`, undefined, 5]), repo: CALM ? '/repo/main' : rng.pick(['/repo/main', '/r2', '', undefined]) };
  const h = rng.pick(['hT', 'hT2', '', undefined, 5]); if (h !== undefined) o.handle = h;
  const p = pidVal(rng); if (p !== undefined) o.pid = p;
  return J(o);
}
function slots(rng) {
  const out = [];
  const n = rng.int(0, 5);
  for (let i = 0; i < n; i++) {
    const w = rng.pick(['w1', 'w2', 'w3', 'w10', 'w01', 'w1', '1', 'wx']);
    const id8 = rng.pick(['id8a', 'id8b', 'abcd1234', '']);
    const bits = [id8 === '' ? null : id8, rng.pick(['handle=hw1', 'handle=hw2', 'handle=-', '', 'handle=']), rng.pick(['state=spawn', 'state=blocked', 'state=done', 'state=spawn', ''])].filter((x) => x);
    out.push(rng.chance(0.1) ? rng.pick(['NOSLOT x', '', 'SLOT', `SLOT ${w}`]) : `SLOT ${w} ${bits.join(rng.pick([' ', ' ', '\t', '  ']))}`);
  }
  return out.join(rng.pick(['\n', '\n', '\r\n'])) + (rng.chance(0.8) ? '\n' : '');
}

/** 상태 트리 한 벌: { files, env } */
function world(rng) {
  CALM = rng.chance(0.5);
  const files = {};
  const seen = { sess: [], lanes: [] };
  const sess = rng.pick(S8S.filter(() => true));
  const nses = CALM ? rng.int(1, 3) : rng.int(0, 3);
  const used = [];
  for (let i = 0; i < nses; i++) { const s8 = rng.pick(S8S); used.push(s8); files[`state/_session/${s8}.json`] = session(rng, s8); }
  if (rng.chance(0.05)) files['state/_session/.hidden.json'] = session(rng, sess);
  const nrun = rng.int(0, 4);
  for (let i = 1; i <= nrun; i++) files[`state/r${i}/state.json`] = run(rng, `r${i}`, used.length ? [...used, ...used, ...S8S] : S8S, seen);
  if (rng.chance(0.1)) files['state/r9/notstate.json'] = '{}';
  const nlead = rng.int(0, 3);
  for (let i = 1; i <= nlead; i++) files[`console/lead/l${i}.json`] = lead(rng);
  files['bin/ls.sh'] = { data: FAKE_LS, mode: 0o755 };
  if (rng.chance(0.8)) files.slots = slots(rng);
  const env = {
    COORD_STATE_ROOT: '<WORK>/state', DFLOW_CONSOLE_DIR: '<WORK>/console', COORD_LEAD_STATE: '<WORK>/bin/ls.sh', FAKE_SLOTS: '<WORK>/slots',
    CR_IDENT: ME, CR_HOST: HOST, COORD_REPO: '<WORK>',
  };
  const r = CALM ? 1 : rng.next();
  if (r < 0.05) delete env.CR_IDENT; else if (r < 0.08) env.CR_HOST = '';
  if (!CALM && rng.chance(0.05)) env.COORD_LEAD_STATE = '<WORK>/nope.sh';
  return { files, env, sess, used, seen };
}

const REFS = ['kit', 'dup', 'gone', 'zombie', 'old', 'nopid', 'x1', 'x2', 'nope', '../x', '', '.a', 'a b', 'w1', 'w2', 'w01', 'w10', 'w1x', 'wabc', 'x'.repeat(65), 'x'.repeat(64)];
const KINDS = ['coord_lead', 'coord_lead', 'coord_lane', 'coord_lane', 'coord_lane', 'team_lead', 'team_worker', 'team_worker', 'bogus', ''];
function refFor(rng, kind, w) {
  if (kind === 'coord_lead') return rng.pick([...w.used, ...w.seen.sess, ...w.seen.sess, ...S8S, 'zzzz9999', '', '../x']);
  if (kind === 'team_worker') return rng.pick(['w1', 'w2', 'w3', 'w10', 'w01', 'w1x', 'w', '1', 'wabc', 'w1.0']);
  return rng.chance(0.6) && w.seen.lanes.length ? rng.pick(w.seen.lanes) : rng.pick(REFS);
}
const withWorld = (fn) => (rng, i) => { const w = world(rng); const c = fn(rng, w, i); return { stdin: '', ...c, files: w.files, env: { ...w.env, ...(c.env || {}) } }; };

// 기존 시험(tests/console-poll.sh 1. 대상 해석)의 시나리오를 고정 사례로
const DEADPID = DEAD;
const sessF = (s8, pid, handle, extra = {}) => J({ key: `${ME}/${HOST}/coord:${s8}`, session_id: s8, host: HOST, user: ME, pid, handle, ...extra });
const runF = (id, sid, pid, handle = '', lanes = {}, extra = {}) => J({ schema: 1, run: { id, closed_at: null, coordinator: { session_id: sid, pid, handle } }, lanes, merge: { in_flight: null }, office: { user: ME }, ...extra });
const laneF = (handle, state = 'active', pid = 0) => ({ session: { handle, pid }, state });
const BASE_ENV = { COORD_STATE_ROOT: '<WORK>/state', DFLOW_CONSOLE_DIR: '<WORK>/console', COORD_LEAD_STATE: '<WORK>/bin/ls.sh', FAKE_SLOTS: '<WORK>/slots', CR_IDENT: ME, CR_HOST: HOST, COORD_REPO: '<WORK>' };
const POLL_FILES = {
  'state/_session/aaaa1111.json': sessF('aaaa1111', ALIVE, 'hL1'),
  'state/_session/dead0000.json': sessF('dead0000', DEADPID, 'hDead'),
  'state/_session/cccc3333.json': J({ key: `${ME}/${HOST}/coord`, session_id: 'cccc3333', host: HOST, user: ME, pid: ALIVE, handle: 'hOld' }),
  'state/r1/state.json': runF('r1', 'aaaa1111-0000', ALIVE, '', { kit: laneF('hk1'), dup: laneF('hd1'), gone: laneF('hg', 'closed') }),
  'state/r2/state.json': runF('r2', 'bbbb2222-0000', ALIVE, 'hL2', { dup: laneF('hd2') }),
  'state/r3/state.json': runF('r3', 'dead0000-0000', DEADPID, '', { zombie: laneF('hz') }),
  'state/r4/state.json': J({ schema: 1, run: { id: 'r4', closed_at: '2026-10-06T00:00:00+09:00', coordinator: { session_id: 'dddd4444-0000', pid: ALIVE, handle: '' } }, lanes: { old: laneF('ho') }, office: { user: ME } }),
  'state/r5/state.json': runF('r5', 'eeee5555-0000', DEADPID, '', { orphan: laneF('hor') }),
  'state/r6/state.json': runF('r6', 'ffff6666-0000', ALIVE, '', { fin: laneF('hf') }, { office: { user: ME, finished: true } }),
  'state/r7/state.json': runF('r7', '9999aaaa-0000', 0, '', { nopid: laneF('hnp') }),
  'console/lead/L1.json': J({ agent: `${ME}/${HOST}/lead`, repo: '/repo/main', handle: 'hT', pid: ALIVE }),
  'console/lead/L0.json': J({ agent: `${ME}/${HOST}/lead`, repo: '/repo/main', handle: 'hTdead', pid: DEADPID }),
  'bin/ls.sh': { data: FAKE_LS, mode: 0o755 },
  slots: 'SLOT w1 id8a handle=hw1 state=spawn\nSLOT w2 id8b handle=- state=blocked\nSLOT w3 id8c handle=hw3 state=done\n',
};
const fx = (label, args, extra = {}) => ({ label: `console-poll.sh: ${label}`, args, stdin: '', files: POLL_FILES, env: BASE_ENV, ...extra });

export default {
  module: 'console-resolve',
  sh: SH,
  mjs: MJS,
  source: ['scripts/lib/compat.sh', 'scripts/lib/common.sh'],
  switchEnv: 'COORD_JS_CONSOLE_RESOLVE',
  functions: {
    console_dir: {
      js: ['console_dir'],
      fixed: [
        { label: '기본', args: [], stdin: '', env: { DFLOW_CONSOLE_DIR: '' } },
        { label: '지정', args: [], stdin: '', env: { DFLOW_CONSOLE_DIR: '<WORK>/c' } },
        { label: '~ 확장', args: [], stdin: '', env: { DFLOW_CONSOLE_DIR: '~/x' } },
      ],
      gen: (rng) => ({ args: [], stdin: '', env: { DFLOW_CONSOLE_DIR: rng.pick(['', '<WORK>/c', '~', '~/a b', '/abs/한글', '~x']) } }),
    },
    _cr_count: {
      js: ['_cr_count'],
      fixed: [
        { label: '빈 값', args: [''], stdin: '' },
        { label: '한 줄', args: ['a'], stdin: '' },
        { label: '둘', args: ['a\nb'], stdin: '' },
        { label: '빈 줄만(grep -c rc 1)', args: ['\n'], stdin: '' },
        { label: '끝 개행', args: ['a\n'], stdin: '' },
      ],
      gen: (rng) => ({ args: [rng.pick(['', 'a', 'a\nb', '\n', '\n\n', 'a\n\nb', 'a\n', '\na', '-', 'h1\nh1', ' ', '한글\n한글2', 'x\r\ny'])], stdin: '' }),
    },
    _cr_sess_read: {
      js: ['_cr_sess_read'],
      globals: ['_CR_MINE', '_CR_PID', '_CR_HANDLE'],
      fixed: [
        { label: 'console-poll.sh: 내 세션', args: ['<WORK>/state/_session/aaaa1111.json'], stdin: '', files: POLL_FILES, env: BASE_ENV },
        { label: '다른 신원', args: ['<WORK>/state/_session/aaaa1111.json'], stdin: '', files: POLL_FILES, env: { ...BASE_ENV, CR_IDENT: 'x' } },
      ],
      gen: withWorld((rng, w) => ({ args: [rng.pick([`<WORK>/state/_session/${rng.pick(w.used.length ? w.used : S8S)}.json`, `<WORK>/state/_session/${rng.pick(w.used.length ? w.used : S8S)}.json`, '<WORK>/nofile', '<WORK>/state/r1/state.json', '<WORK>/console/lead/l1.json'])] })),
    },
    _cr_live_runs: {
      js: ['_cr_live_runs'],
      fixed: [fx('열린 회차', []), fx('strict', ['strict'])],
      gen: withWorld((rng) => ({ args: rng.chance(0.7) ? [] : ['strict'] })),
    },
    _cr_live_leads: {
      js: ['_cr_live_leads'],
      fixed: [fx('팀장 기록', [])],
      gen: withWorld(() => ({ args: [] })),
    },
    console_resolve: {
      js: ['console_resolve'],
      fixed: [
        ...['kit', 'dup', 'gone', 'zombie', 'old', 'orphan', 'fin', 'nopid', 'nope', '../x'].map((l) => fx(`coord_lane ${l}`, ['coord_lane', l])),
        ...['aaaa1111', 'bbbb2222', 'dead0000', 'zzzz9999'].map((s) => fx(`coord_lead ${s}`, ['coord_lead', s])),
        fx('team_lead', ['team_lead', 'lead']),
        fx('team_worker w1', ['team_worker', 'w1']),
        fx('team_worker w2(handle -)', ['team_worker', 'w2']),
        fx('team_worker w3(done)', ['team_worker', 'w3']),
        fx('모르는 kind', ['bogus', 'x']),
      ],
      gen: withWorld((rng, w) => { const kind = rng.pick(KINDS); return { args: rng.chance(0.05) ? [kind] : [kind, refFor(rng, kind, w)] }; }),
    },
    console_header_ref: {
      js: ['console_header_ref'],
      fixed: [
        fx('coord_lane', ['coord_lane', 'kit']),
        fx('team_lead', ['team_lead', 'lead']),
        fx('team_worker w1', ['team_worker', 'w1']),
        fx('team_worker 없는 슬롯', ['team_worker', 'w9']),
        fx('형식이 틀린 레인', ['coord_lane', 'a b']),
      ],
      gen: withWorld((rng, w) => { const kind = rng.pick(KINDS); return { args: [kind, refFor(rng, kind, w)] }; }),
    },
    console_list_targets: {
      js: ['console_list_targets'],
      fixed: [fx('전부', [])],
      gen: withWorld(() => ({ args: [] })),
    },
  },
};
