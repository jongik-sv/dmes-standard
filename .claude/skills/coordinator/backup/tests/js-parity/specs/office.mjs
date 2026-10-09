// scripts/office.sh ↔ scripts/office.mjs 대조 명세(kind 'script', 스위치 COORD_JS_OFFICE).
//   · sh·mjs 는 fixtures/office-parity.{sh,mjs} 래퍼다: office 를 돌린 뒤 작업 폴더의 파일 내용(가짜 dflow 로그·state.json·세션 기록·잠금 흔적)을
//     시각을 <ISO> 로 지워 stdout 에 찍는다. 그래서 「보낸 인자 배열(JSON 인자 문자열 바이트까지)」과 「남긴 기록」이 stdout 대조에 들어간다.
//   · 가짜 dflow.sh(office.dflow_script)는 받은 인자를 `|` 로 이어 fake.log 에 한 줄 적고 FAKE_MODE 로 동작한다(tests/office-sh.sh 와 같은 방식).
//   · state_dir 은 환경 변수 COORD_STATE_ROOT, 설정은 <WORK>/.coord.local.json(상대 경로 dflow_script = 리포 기준).

const CLEAN = { COORD_RUN: '', COORD_SESSION_ID: '', CLAUDE_CODE_SESSION_ID: '', CLAUDE_PID: '', ORCA_TERMINAL_HANDLE: '', COORD_DRY: '', COORD_CONSOLE_POLL: '0',
  COORD_STATE_ROOT: '', COORD_LOCK_STALE_S: '', _COORD_CFG: '', _COORD_CFG_MINE: '', _COORD_CFG_SRC: '', COMPAT_FORCE_OS: '', COMPAT_FORCE_USERLAND: '', DFLOW_CONSOLE_DIR: '',
  DFLOW_CONFIG_DIR: '', COORD_OFFICE_SUM_MAX: '', COORD_OFFICE_LEAD_MAX: '', LC_ALL: 'C' };
const ENV = { ...CLEAN, COORD_REPO: '<WORK>', COORD_STATE_ROOT: '<WORK>/state', DFLOW_CONSOLE_DIR: '<WORK>/console', FAKE_LOG: '<WORK>/fake.log', COORD_SESSION_ID: 'S1A2B3C4-ffff-0000', COORD_RUN: 'r1' };

const FAKE_DFLOW = `#!/bin/sh
# 가짜 dflow.sh — 인자·cwd 이름·설정 폴더 이름을 한 줄로 적는다.
if [ "$1" = me ]; then printf '{"user_email":"Jji.Test@x.com"}'; echo "ME" >> "$FAKE_LOG"; exit 0; fi
printf '%s' "watch-call:" >> "$FAKE_LOG"
for a in "$@"; do printf ' [%s]' "$a" >> "$FAKE_LOG"; done
printf ' | cwd=%s cfg=%s\\n' "$(basename "$(pwd -P)")" "$(basename "\${DFLOW_CONFIG_DIR:-}")" >> "$FAKE_LOG"
is_stop=0; case " $* " in *" --stop "*) is_stop=1 ;; esac
case "\${FAKE_MODE:-ok}" in
  fail) echo "boom" >&2; exit 1 ;;
  noconfig) echo "NO_LOCAL x" >&2; exit 2 ;;
  reject) echo '{"error":"agent 는 1~120자여야 합니다."}' >&2; exit 2 ;;
  summerr) echo "SUMMARY_ERROR lane_summary.brief 형식 오류" >&2; exit 0 ;;
  slow) sleep 30; exit 0 ;;
  slowsub) x=$(sleep 47); echo "$x"; exit 0 ;;
  failstop) [ "$is_stop" = 1 ] && { echo boom >&2; exit 1; } ;;
  netstop) [ "$is_stop" = 1 ] && { echo net >&2; exit 6; } ;;
  authstop) [ "$is_stop" = 1 ] && { echo auth >&2; exit 3; } ;;
  slowstop) [ "$is_stop" = 1 ] && { sleep 30; exit 0; } ;;
esac
printf '2026-10-06T00:00:00Z'
`;

const jstr = (s) => JSON.stringify(s);
const LANES = ['a1', 'b-2', 'kit', 'm0', 'long-lane-name-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'];
const ISO = ['"2026-10-09T01:02:03+09:00"', '"2026-10-09T01:02:03Z"', '"2026-10-09T01:02"', 'null', '""', '"2026-10-09 01:02"', '"2026-10-09T01:02:03.456Z"', '"2026-13-45T25:61:61Z"', '"2026-10-09T01:02:03+09:00\\n"', '5', '"1969-12-31T23:59:59Z"'];
const BRIEFS = ['툴팁 사전 정리', '컬럼 사전 token=AbCdEfGh12345678 가림', '경로 /Users/jji/secret/a.md 와 ~/b 포함', '두 줄\\n둘째 줄', '긴 요약 '.repeat(60), '', 'x', 'BRIEF with "quote" and \\\\ backslash', '탭\\t포함', '😀 이모지 요약'];
const SESS = ['S1A2B3C4-ffff-0000', 'abcdef123456', 's-one1234xxxx', ''];

function lane(rng) {
  const parts = [
    `"session":{"name":"w","handle":${rng.pick(['"h-a1"', '"h-b2"', '""', 'null'])},"kind":"claude","pid":${rng.pick(['0', '999999', 'null'])}}`,
    `"brief":${rng.pick(BRIEFS.map(jstr).concat(['null', '7', '{"a":1}']))}`,
    `"branch":${jstr(rng.pick(['feat/a', 'dev', '', '한글/브랜치']))}`,
    `"state":${rng.pick(['"active"', '"active"', '"closed"', '"closing"', 'null', '"weird"'])}`,
    `"hold":${rng.pick(['null', 'null', '{"reason":"대기 사유","until":null}', '{"reason":"CPU /tmp/x token=ZzYyXxWwVv99887766","until":"2026-10-09T12:00:00+09:00"}', 'false', '"문자열 hold"', '{"reason":5}'])}`,
    `"items":[${Array.from({ length: rng.int(0, 3) }, () => `{"id":"i${rng.int(1, 9)}","done":${rng.pick(['true', 'false'])},"weight":${rng.pick(['1', '2'])}}`).join(',')}]`,
    `"last_report_at":${rng.pick(ISO)}`, `"last_instr_at":${rng.pick(ISO)}`,
    `"ctx":${rng.pick(['null', '{"pct":42}', '{"pct":250.7}', '{"pct":-5}', '63.5', '"x"', '{"pct":"7"}'])}`,
    `"compact":${rng.pick(['{"pending":true}', '{"pending":false}', 'null', '{}', '5'])}`,
    `"memo":${jstr(rng.pick(['/x/resume-a1.md\\n둘째', '/x/m.md', '', 'ㄱ'.repeat(5)]))}`,
  ];
  if (rng.chance(0.15)) parts.splice(rng.int(0, parts.length - 1), 1);
  return `{${parts.join(',')}}`;
}
function office(rng, lanes) {
  const sent = lanes.filter(() => rng.chance(0.5)).map((l) => `${jstr(l)}:${jstr(rng.pick(['jji-test/host/임시:' + l + '·요약', 'jji-test/otherhost/임시:' + l, 'k-' + l]))}`);
  if (rng.chance(0.2)) sent.push(`"_lead":${jstr(rng.pick(['jji-test/host/coord:t1', 'jji-test/host/coord']))}`);
  const label = lanes.filter(() => rng.chance(0.5)).map((l) => `${jstr(l)}:${jstr(rng.pick(['작업 중', '대기', '끝', '머지 중']))}`);
  const sum = lanes.filter(() => rng.chance(0.3)).map((l) => `${jstr(l)}:"${'ab12'.repeat(16)}"`);
  return `"office":{${rng.chance(0.7) ? `"user":"jji-test",` : ''}"sent":{${sent.join(',')}},"label":{${label.join(',')}},"sumhash":{${sum.join(',')}},"finished":${rng.pick(['false', 'false', 'false', 'true', 'null'])}}`;
}
function stateDoc(rng, rid, sid, extra = {}) {
  const names = LANES.slice(0, rng.int(0, LANES.length));
  const lanes = names.map((l) => `${jstr(l)}:${lane(rng)}`);
  const pu = rng.pick(['', '', '{"at":"2026-10-09T00:00:00+09:00","text":"결정 대기 token=AbCdEfGh12345678\\n둘째 줄"}', '"문자열 결정"', '{"title":"제목만"}', '5']);
  const parts = [
    `"schema":1`,
    `"run":{"id":${jstr(rid)},"goal":${jstr(rng.pick(['조정 목표 한 줄', '목표 /Users/x/y.md\\n둘째', '', '긴 목표 '.repeat(40)]))},"created_at":${rng.pick(ISO)},"closed_at":${extra.closed ?? rng.pick(['null', 'null', '"2026-10-09T05:00:00+09:00"'])},"coordinator":{"name":"조정","session_id":${jstr(extra.sid ?? sid)},"handle":${jstr(rng.pick(['term_x', '']))},"pid":${rng.pick(['0', '999999', '"abc"', 'null'])}},"last_tick_at":${rng.pick(ISO)}}`,
    `"lanes":{${lanes.join(',')}}`,
    `"merge":{"in_flight":${rng.pick(['null', `{"lane":"a1","branch":"feat/a"}`, `{"lane":"kit"}`, '5'])},"queue":[${rng.pick(['', '{"lane":"b-2"}', '"b-2"', '{"lane":"a1"},"kit",5', 'null'])}],"history":[]}`,
    `"usage":{"band":${rng.pick(['"Y"', '"UNKNOWN"', 'null', '""'])},"five":${rng.pick(['10.7', '75', 'null', '"x"', '250'])},"week":${rng.pick(['20', '85', 'null'])}}`,
    `"load":{"hard_ticks":${rng.pick(['0', '2', '3.9', 'null'])},"banned":${rng.pick(['[]', '["x"]', '{"a":1}', 'null'])}}`,
    `"pending_user":[${pu}]`,
    office(rng, names),
  ];
  if (rng.chance(0.08)) parts.splice(rng.int(0, parts.length - 1), 1);
  return `{${parts.join(',')}}`;
}
function inputRec(rng, lane, rid, handle) {
  const parts = [
    `"run":${rng.pick([jstr(rid), jstr(rid), jstr(rid), '"r9"', '5', 'null'])}`, `"handle":${rng.pick([jstr(handle), jstr(handle), '""', '"other"'])}`,
    `"kind":${rng.pick(['"permission"', '"question"', '"choice"', '"usage-limit"', '"trust"', '"message"', '"bogus"', '5'])}`,
    `"since":${rng.pick(ISO.slice(0, 3))}`,
    `"excerpt":${rng.pick(['["줄1","줄2 token=AbCdEfGh12345678"]', '[]', 'null', '"x"', '[1,{"a":2},"\\u0001ctl\\u007f"]', JSON.stringify(Array.from({ length: 14 }, (_, i) => `줄 ${i} ` + '가'.repeat(rng.int(1, 260))))])}`,
    `"handled":${rng.pick(['null', 'null', '{"by":"coordinator","at":"2026-10-09T01:00:00Z"}', '{"by":"nobody","at":"2026-10-09T01:00:00Z"}', '"x"'])}`,
    `"full":"숨김"`,
  ];
  return `{${parts.join(',')}}`;
}

/** 사례 공통 틀: 설정·가짜 dflow·상태·콘솔 입력·세션 기록을 심고 환경을 정한다 */
function base(rng, { reap = false, needState = true } = {}) {
  const sid = rng.pick(SESS);
  const files = {};
  const cfg = { state_dir: 'state', office: { enabled: rng.chance(0.96), project_id: rng.pick(['proj-1', 'proj-1', '']), label_max: rng.pick([40, 40, 12, 120]), dflow_script: 'fake-dflow.sh' } };
  if (rng.chance(0.04)) cfg.office.dflow_script = 'missing-dflow.sh';
  if (rng.chance(0.03)) cfg.office.quiet_min = 'x';
  files['.coord.local.json'] = JSON.stringify(cfg);
  files['fake-dflow.sh'] = FAKE_DFLOW;
  files['fake.log'] = '';
  if (needState || rng.chance(0.5)) files['state/r1/state.json'] = rng.chance(0.03) ? rng.pick(['{', '[]', '5']) : stateDoc(rng, 'r1', sid);
  if (rng.chance(0.4)) files['state/r2/state.json'] = stateDoc(rng, 'r2', sid, { sid: rng.chance(0.7) ? sid : 'zzzz9999' });
  if (rng.chance(0.15)) files['state/r3/state.json'] = stateDoc(rng, 'r3', rng.pick(SESS));
  if (rng.chance(0.3)) files['state/current'] = 'r1\n';
  const s8 = sid.slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const l of LANES.slice(0, 3)) if (rng.chance(0.5)) files[`console/input/coord_lane_${l}.json`] = rng.chance(0.05) ? '{' : inputRec(rng, l, 'r1', rng.pick(['h-a1', 'h-b2']));
  if (rng.chance(0.3)) files[`console/input/coord_lead_${s8 || 'r1'}.json`] = inputRec(rng, 'lead', 'r1', '');
  const sessRec = (key, pid, extra = '') => `{"key":${jstr(key)},"session_id":"S1A2B3C4-ffff-0000","host":"h","user":"jji-test","pid":${pid},"handle":${jstr(rng.pick(['', 'term_old']))},"sent_at":"2026-10-09T00:00:00+09:00","slots":${rng.int(0, 3)},"busy":${rng.int(0, 2)}${extra}}`;
  if (s8 && rng.chance(reap ? 0.8 : 0.35)) files[`state/_session/${s8}.json`] = sessRec(rng.pick([`jji-test/host/coord:${s8}`, 'jji-test/old/coord:old', '']), rng.pick(['999999', '0', 'null', '"abc"', String(process.pid)]), rng.chance(0.5) ? `,"label":"조정 중","sumhash":"${'cd34'.repeat(16)}"` : '');
  if (reap && rng.chance(0.5)) files['state/_session/other99.json'] = sessRec('jji-test/host/coord:other99', rng.pick(['999999', '999998']));
  if (rng.chance(0.05)) files[`state/_session/${s8 || 'zz'}.lock/pid`] = '999999\n';   // 죽은 주인의 낡은 잠금 탈취 경로
  const env = {
    COORD_SESSION_ID: sid,
    FAKE_MODE: rng.pick(['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'fail', 'noconfig', 'reject', 'failstop', 'netstop', 'authstop', 'summerr']),
    CLAUDE_PID: rng.pick(['', '', String(process.pid), '999999', 'abc']),
  };
  if (rng.chance(0.08)) env.COORD_DRY = '1';
  if (rng.chance(0.08)) { env.COORD_OFFICE_SUM_MAX = String(rng.pick([300, 500, 900])); env.COORD_OFFICE_LEAD_MAX = String(rng.pick([300, 700, 1500])); }
  if (rng.chance(0.2)) env.COORD_RUN = rng.pick(['r1', 'r2', 'nope']);
  return { files, env, stdin: '' };
}

const sub = (name, argsFn, opts) => ({
  compareFiles: false,
  gen(rng) { const c = base(rng, opts); return { ...c, args: argsFn(rng) }; },
  fixed: [],
});
const lanePick = (rng) => rng.pick(['a1', 'b-2', 'kit', 'm0', 'nope', LANES[4]]);

export default {
  module: 'office',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/office-parity.sh',
  mjs: 'tests/js-parity/fixtures/office-parity.mjs',
  switchEnv: 'COORD_JS_OFFICE',
  env: ENV,
  functions: {
    'lead-up': { ...sub('lead-up', () => ['lead-up']),
      fixed: [
        { label: 'office-sh.sh: lead-up 팀장 등록', args: ['lead-up'], files: { '.coord.local.json': '{"state_dir":"state","office":{"enabled":true,"project_id":"proj-1","label_max":40,"dflow_script":"fake-dflow.sh"}}', 'fake-dflow.sh': FAKE_DFLOW, 'fake.log': '', 'state/r1/state.json': '{"run":{"id":"r1","coordinator":{"session_id":"S1A2B3C4-ffff-0000","pid":0}},"lanes":{}}' }, env: {}, stdin: '' },
      ] },
    'lead-sync': sub('lead-sync', () => ['lead-sync']),
    'lane-up': sub('lane-up', (rng) => ['lane-up', lanePick(rng)]),
    'lane-state': sub('lane-state', (rng) => ['lane-state', lanePick(rng), rng.pick(['auto', 'auto', 'auto', '작업 중', '대기', '머지 중', '답 대기', '끝', 'bogus'])]),
    'lane-down': sub('lane-down', (rng) => ['lane-down', lanePick(rng)]),
    beat: sub('beat', () => ['beat']),
    finish: sub('finish', () => ['finish']),
    reap: { ...sub('reap', (rng) => (rng.chance(0.3) ? ['reap', '--state-dir', '<WORK>/state'] : ['reap']), { reap: true, needState: false }) },
    usage: {
      compareFiles: false,
      gen: (rng) => ({ args: rng.pick([[], ['bogus'], ['lead-up', 'x'], ['lane-up'], ['lane-state', 'a1'], ['reap', '--state-dir'], ['reap', 'x', 'y'], ['reap', '--state-dir', ''], ['beat', 'x'], ['help'], ['-h']]), files: {}, env: {}, stdin: '' }),
      fixed: [{ label: 'usage: 인자 없음', args: [], files: {}, env: {}, stdin: '' }],
    },
  },
};
