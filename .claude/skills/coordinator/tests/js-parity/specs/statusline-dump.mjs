// scripts/statusline-dump.sh ↔ statusline-dump.mjs 대조 명세(kind 'script', 스위치 COORD_JS_STATUSLINE_DUMP).
//   · sh·mjs 는 fixtures/statusline-parity.{sh,mjs} 래퍼다: 스크립트를 돌린 뒤 작업 폴더·홈의 파일을 찍는다.
//     이때 쓴 파일의 시각(at)은 <ISO>, 남은 임시 파일 이름의 pid 는 <PID> 로 지운다 — 그래서 「쓴 파일 내용」이 stdout 대조에 들어간다.
//   · COORD_STATUSLINE_NEXT 는 진짜 cat·echo·tr 로 확인한다(같은 stdin 이 들어가 출력이 그대로 나오는지).
//   · 상태 뿌리는 COORD_STATE_ROOT, 설정 오류(HOME 폴백)는 .coord.local.json state_dir 로 만든다.
const SIDS = ['sess-a1', 'SESS.b2_c', '한글', 'x/y', 'a b', '', 'null', 'true', '12345', 's..d', 'x-', '.lead', 'lead.', 'verylongsessionid0123456789'];
const CW = ['123456', '1.0', '0', '-5', '1e3', '"x"', 'true', 'false', 'null', '{n:1}', '{"a":[1,2]}', 'null'];
const RL = ['{"five":42.5,"week":80}', 'null', '5', '"x"', '[]', '{"limit":1e3}', '{"resets":{"five":"2026-10-09T12:00:00Z"}}'];

function doc(rng, bad = 0) {
  const sid = rng.pick(SIDS);
  const parts = [];
  if (bad === 1) parts.push('"session_id":' + (rng.chance(0.5) ? sid : JSON.stringify(sid)));
  else parts.push(`"session_id":${JSON.stringify(sid)}`);
  if (rng.chance(0.85)) parts.push(`"context_window":${rng.pick(CW)}`);
  if (rng.chance(0.85)) parts.push(`"rate_limits":${rng.pick(RL)}`);
  if (rng.chance(0.3)) parts.push(`"extra":${rng.pick(['1', '"한글"', 'null', '{"k":"v"}'])}`);
  return `{${parts.join(',')}}`;
}

function input(rng) {
  const r = rng.next();
  if (r < 0.05) return '';
  if (r < 0.08) return rng.pick(['{', 'not json', '{"a":1}{"b"', '[]', 'null', '"str"', '{"session_id":"a"}garbage']);
  if (r < 0.14) return `${doc(rng)}\n${doc(rng)}`;   // 문서 둘
  return doc(rng);
}

const NEXTS = ['', '', '', 'cat', 'echo next-out', 'tr a-z A-Z', 'grep -o session_id', 'wc -c', 'exit 3', 'head -c 8'];

export default {
  module: 'statusline-dump',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/statusline-parity.sh',
  mjs: 'tests/js-parity/fixtures/statusline-parity.mjs',
  switchEnv: 'COORD_JS_STATUSLINE_DUMP',
  env: { COORD_STATE_ROOT: '<WORK>/sr', COORD_STATUSLINE_NEXT: '' },
  functions: {
    run: {
      compareFiles: false,
      gen(rng) {
        const files = {};
        const env = { COORD_STATUSLINE_NEXT: rng.pick(NEXTS) };
        const mode = rng.int(0, 9);
        if (mode === 0) env.COORD_STATE_ROOT = '';   // 사양 env 의 상태 뿌리 지움(빈 값) → 설정 state_dir · HOME 폴백 경로
        if (mode <= 1) files['.coord.local.json'] = `{"state_dir":${rng.pick(['"~/.coord"', '""', 'null', '"sr2"', '"~/cs"'])}}`;
        if (mode >= 2 && rng.chance(0.15)) files['.coord.local.json'] = rng.pick(['{', '[]']);   // 설정 JSON 오류 → HOME 폴백
        if (rng.chance(0.3)) files['sr/r1/state.json'] = '{"run":{"id":"r1"}}';
        if (rng.chance(0.2)) files['sr2/x'] = '';
        if (rng.chance(0.2)) files['home/cs/old.json'] = '{"at":"2026-10-09T00:00:00+00:00"}';
        return { args: [], files, env, stdin: input(rng) };
      },
      fixed: [
        { label: '정상 한 문서', args: [], env: { COORD_STATUSLINE_NEXT: '' }, files: {}, stdin: '{"session_id":"abc123","context_window":200000,"rate_limits":{"five":42.5}}' },
        { label: 'NEXT 체인(cat)', args: [], env: { COORD_STATUSLINE_NEXT: 'cat' }, files: {}, stdin: '{"session_id":"abc123"}' },
        { label: 'NEXT 실패(exit 3)도 종료 코드 0', args: [], env: { COORD_STATUSLINE_NEXT: 'exit 3' }, files: {}, stdin: '{"session_id":"abc123"}' },
        { label: '잘못된 JSON', args: [], env: {}, files: {}, stdin: '{"session_id":' },
        { label: '빈 stdin', args: [], env: {}, files: {}, stdin: '' },
        { label: 'session_id 숫자', args: [], env: {}, files: {}, stdin: '{"session_id":12345}' },
        { label: 'context_window 거짓(null 보존)', args: [], env: {}, files: {}, stdin: '{"session_id":"s1","context_window":false,"rate_limits":0}' },
      ],
    },
  },
};
