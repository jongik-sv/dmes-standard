// scripts/search.sh ↔ search.mjs 대조 명세(kind 'script', 스위치 COORD_JS_SEARCH).
//   · sh·mjs 는 fixtures/search-parity.{sh,mjs} 래퍼다: 스크립트를 돌린 뒤 상태 폴더(sr/)·$TMPDIR/coord-searches 의 파일과 가짜 orca 가 받은 줄(sent.log)을 찍는다.
//   · agy·opencode·orca 는 <WORK>/bin 의 가짜다(실제 검색 워커·실제 탭은 절대 부르지 않는다 — 어느 사례에서도 가짜가 PATH 앞에 온다).
//     가짜 orca 는 terminal send 로 받은 줄을 bash -c 로 실행해 「탭 안에서 워커가 돈 것」을 흉내 낸다.
//   · 답 파일 이름의 날짜·pid, 걸린 초, 이벤트의 secs 는 normalize 가 지운다.
//   · 시간 초과 사례는 --timeout 1 과 sleep 30 짜리 가짜 agy 로만 본다(kill 은 스크립트가 띄운 가짜 agy 의 트리뿐).
const FAKE_AGY = { data: `#!/bin/sh
case "\${FAKE_AGY:-ok}" in
  ok) printf 'agy answer\\n'; for a in "$@"; do printf '[%s]\\n' "$a"; done ;;
  tabok) f=$(printf '%s' "$2" | sed -n 's/.*파일 \\(.*\\) 에 저장하라.*/\\1/p'); [ -n "$f" ] && printf 'tab answer\\n' > "$f" ;;
  fail) echo "agy boom: failure detail" >&2; exit 3 ;;
  failko) printf '오류 한글 메시지 %s\\n' "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ" >&2; exit 4 ;;
  empty) : ;;
  slow) sleep 30 ;;
esac
exit 0
`, mode: 0o755 };
const FAKE_OC = { data: `#!/bin/sh
case "\${FAKE_OC:-ok}" in
  ok) printf 'oc answer\\n'; for a in "$@"; do printf '(%s)\\n' "$a"; done ;;
  fail) echo "oc boom" >&2; exit 2 ;;
  empty) : ;;
esac
exit \${FAKE_OC_RC:-0}
`, mode: 0o755 };
const FAKE_ORCA = { data: `#!/bin/sh
[ "$1" = terminal ] || exit 0
case "$2" in
  create) case "\${FAKE_ORCA:-run}" in none) echo '{"ok":false}' ;; *) echo '{"ok":true,"result":{"terminal":{"handle":"term_fake1"}}}' ;; esac ;;
  send) text=""; while [ $# -gt 0 ]; do [ "$1" = --text ] && text="$2"; shift; done
        printf '%s\\n' "$text" >> "$FAKE_SENT"; ( bash -c "$text" >/dev/null 2>&1 & ); echo '{"ok":true,"result":{}}' ;;
  close) echo '{"ok":true}' ;;
esac
exit 0
`, mode: 0o755 };

const QUERIES = [
  ['로그인', '세션', '처리'], ['where is foo defined'], ["it's a 'quoted' query"], ['한글 질의 !중요 @멘션'], ['a  b   c'], ['x'.repeat(250)], ['한'.repeat(210)],
  ['$HOME `date` $(id)'], ['line1\nline2'], ['--not-an-option'], ['a;b|c&d'], ['back\\slash'], ['무엇'],
];

function build(rng) {
  const files = {};
  const env = {
    PATH: `<WORK>/bin:${process.env.PATH}`, FAKE_SENT: '<WORK>/sent.log', FAKE_AGY: rng.pick(['ok', 'ok', 'ok', 'fail', 'failko', 'empty']),
    FAKE_OC: rng.pick(['ok', 'ok', 'fail', 'empty']), FAKE_OC_RC: rng.pick(['0', '0', '0', '5']), COORD_RUN: '',
  };
  files['bin/agy'] = FAKE_AGY; files['bin/opencode'] = FAKE_OC; files['bin/orca'] = FAKE_ORCA;
  const cfg = { search: { mode: 'print' } };
  const wk = rng.pick([undefined, undefined, ['agy'], ['opencode'], ['opencode', 'agy'], [], ['bogus', 'agy'], 'str', [5, 'agy'], { a: 'opencode', b: 'agy' }, ['agy', 'agy']]);
  if (wk !== undefined) cfg.search.workers = wk;
  if (rng.chance(0.2)) cfg.search.command = rng.pick(['nosuchbin-xyz {prompt}', 'agy --flag {prompt} t={timeout}s', 'agy {timeout} x{prompt} {prompt}', '', 'agy']);
  if (rng.chance(0.2)) cfg.search.opencode = { command: rng.pick(['opencode run {prompt}', 'nosuch-oc {prompt}', '  opencode   run  {prompt}']) };
  if (rng.chance(0.15)) cfg.search.timeout_s = rng.pick([240, 60, 'x', 0, 1000]);
  files['.coord.local.json'] = JSON.stringify(cfg);
  if (rng.chance(0.4)) {
    files['sr/r1/state.json'] = JSON.stringify({ schema: 1, run: { id: 'r1' }, lanes: {} });
    files['sr/current'] = 'r1\n';
    env.COORD_RUN = 'r1';
  }
  env.COORD_STATE_ROOT = '<WORK>/sr';
  const args = [];
  const mode = rng.pick(['print', 'print', 'print', 'none']);
  if (mode === 'print') args.push('--print');
  if (rng.chance(0.25)) args.push('--timeout', rng.pick(['100', '5', '240']));
  if (rng.chance(0.2)) args.push('--worker', rng.pick(['agy', 'opencode', 'bogus']));
  if (rng.chance(0.2)) { files['wd/.keep'] = ''; args.push('--cwd', 'wd'); }   // 없는 폴더(nodir)는 bash 의 cd 오류 문구가 .err 파일에 들어가는데 스크립트 경로가 섞여 대조하지 않는다(의심 목록)
  if (rng.chance(0.08)) args.push('--');
  if (rng.chance(0.93)) args.push(...rng.pick(QUERIES));
  return { args, files, env };
}

const normalize = (buf) => Buffer.from(buf.toString('latin1')
  .replace(/\d{8}-\d{6}-\d+-/g, '<TS>-<PID>-').replace(/ \d+ worker=/g, ' <S> worker=').replace(/"secs":\d+/g, '"secs":<S>'), 'latin1');

const base = (over = {}) => ({
  args: ['--print', '질의'], env: { PATH: `<WORK>/bin:${process.env.PATH}`, FAKE_SENT: '<WORK>/sent.log', COORD_RUN: '', COORD_STATE_ROOT: '<WORK>/sr', ...(over.env ?? {}) },
  files: { 'bin/agy': FAKE_AGY, 'bin/opencode': FAKE_OC, 'bin/orca': FAKE_ORCA, '.coord.local.json': '{"search":{"mode":"print"}}', ...(over.files ?? {}) },
  ...(over.args ? { args: over.args } : {}),
});

export default {
  module: 'search',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/search-parity.sh',
  mjs: 'tests/js-parity/fixtures/search-parity.mjs',
  switchEnv: 'COORD_JS_SEARCH',
  env: { COORD_REPO: '<WORK>' },
  normalize,
  functions: {
    run: {
      compareFiles: false,
      gen: build,
      fixed: [
        { label: '-h', args: ['-h'], env: {}, files: {} },
        { label: '질의 없음(die 2)', args: ['--print'], ...base({ args: ['--print'] }) },
        { label: '--cwd 값 없음(unbound)', ...base({ args: ['--cwd'] }) },
        { label: 'print: agy 성공(인자 배열 확인)', ...base({ args: ['--print', '로그인 처리', '위치'] }) },
        { label: 'print: agy 실패 → opencode 로', ...base({ env: { FAKE_AGY: 'fail' } }) },
        { label: 'print: 둘 다 실패(마지막 실패 줄)', ...base({ env: { FAKE_AGY: 'fail', FAKE_OC: 'fail' } }) },
        { label: 'print: 한글 stderr 120자 자름', ...base({ env: { FAKE_AGY: 'failko', FAKE_OC: 'empty' } }) },
        { label: 'print: opencode 에서 !·@ 지움', ...base({ args: ['--print', '--worker', 'opencode', '한글 !중요 @멘션'] }) },
        { label: 'print: 시간 초과(trees kill)', ...base({ args: ['--print', '--timeout', '1', '--worker', 'agy', 'q'], env: { FAKE_AGY: 'slow' } }) },
        { label: 'tab: 가짜 orca 로 agy 탭 성공', ...base({ args: ['--tab', '--worker', 'agy', '탭 질의'], env: { FAKE_AGY: 'tabok' }, files: { '.coord.local.json': '{"search":{"mode":"tab"}}' } }) },
        { label: 'tab: opencode 탭 성공(.done)', ...base({ args: ['--tab', '--worker', 'opencode', '탭 질의'], files: { '.coord.local.json': '{"search":{"mode":"tab"}}' } }) },
        { label: 'tab: 탭을 못 띄우면 print 로', ...base({ args: ['--tab', '--worker', 'agy', 'q'], env: { FAKE_ORCA: 'none' } }) },
        { label: '이벤트: 회차 있음', ...base({ args: ['--print', 'q'], env: { COORD_RUN: 'r1' }, files: { 'sr/r1/state.json': '{"schema":1,"run":{"id":"r1"},"lanes":{}}', 'sr/current': 'r1\n' } }) },
      ],
    },
  },
};
