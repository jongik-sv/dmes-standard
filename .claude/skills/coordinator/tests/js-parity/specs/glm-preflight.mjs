// scripts/glm-preflight.sh ↔ glm-preflight.mjs 대조 명세(kind 'script', 스위치 COORD_JS_GLM_PREFLIGHT).
//   · sh·mjs 는 fixtures/glm-parity.{sh,mjs} 래퍼다: 스크립트를 돌린 뒤 state.json·events.jsonl 을 시각을 <ISO> 로 지워 찍는다.
//   · zsh·curl 은 <WORK>/bin 의 가짜(FAKE_ZSH_OUT·FAKE_CURL* 로 동작). 가짜 curl 은 URL·--data·-m·헤더 줄 수를 curl.log 에 남겨
//     요청 바이트까지 대조한다(헤더 값은 토큰이므로 줄 수만). jq(진짜)는 coord-state 호출에만 쓰인다.
//   · alias 문자열은 실제 꼴(`glm='VAR=x VAR2=y …'`)을 환경 변수로 준다 — 비밀 흉내 값도 문구·출력에 절대 안 나가는지 같이 본다.
const BASE = (rng) => rng.pick([
  'https://api.z.ai', 'https://api.z.ai/', 'https://api.z.ai:8443', 'https://api.z.ai/x/y', 'api.z.ai', 'https://api.z.ai//',
  'https://api.other.com', 'https://sub.api.z.ai', 'http://api.z.ai', 'https://evil.com/a?x=1',
]);
const TOKEN = () => 'tok-FAKE-' + Math.random().toString(36).slice(2, 10);   // 흉내만(시드 무관 — 값 자체는 출력에 안 나온다)

function aliasLine(rng) {
  const q = (v) => rng.pick([`"${v}"`, `'${v}'`, v]);
  const parts = [];
  const base = BASE(rng);
  const model = rng.pick(['glm-4.6', 'GLM-4.5-air', 'glm', 'claude-3', 'x']);
  if (rng.chance(0.9)) parts.push(`ANTHROPIC_BASE_URL=${q(base)}`);
  if (rng.chance(0.9)) parts.push(`ANTHROPIC_AUTH_TOKEN=${q(TOKEN())}`);
  if (rng.chance(0.05)) parts.push(`ANTHROPIC_API_KEY=${q(TOKEN())}`);
  if (rng.chance(0.85)) parts.push(`ANTHROPIC_DEFAULT_HAIKU_MODEL=${q(model)}`);
  if (rng.chance(0.3)) parts.push(rng.pick(['claude -m x', '--model y', 'cd /x && claude', 'ANTHROPIC_TIMEOUT_MS=60000 claude']));
  if (rng.chance(0.15)) parts.push('ANTHROPIC_BASE_URL=' + q(BASE(rng)));   // 같은 이름 두 번 — 첫 일치가 이긴다
  const name = rng.pick(['glm', 'glm', 'glm', 'myglm']);
  return `${name}='ARM=1 ${parts.join(' ')}'`;
}

const FAKE_ZSH = { data: '#!/bin/sh\nprintf \'%s\\n\' "$FAKE_ZSH_OUT"\n', mode: 0o755 };
const FAKE_CURL = { data: `#!/bin/sh
# 가짜 curl: URL·--data·-m·헤더 줄 수를 로그에 남기고, -o 파일에 $FAKE_CURL_BODY 를 쓴 뒤 "<code> <time>" 을 낸다.
out=""; url=""; tm=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    -m) tm="$2"; shift ;;
    --data) printf 'data %s\\n' "$2" >> "$CURL_LOG"; shift ;;
    -H) case "$2" in @*) printf 'hdr %s lines\\n' "$(wc -l < "\${2#@}" | tr -d ' ')" >> "$CURL_LOG" ;; esac ;;
    http*) url="$1" ;;
  esac
  shift
done
printf 'url %s m=%s\\n' "$url" "$tm" >> "$CURL_LOG"
case "\${FAKE_CURL:-ok}" in
  ok) [ -n "$out" ] && [ -n "$FAKE_CURL_BODY" ] && printf '%s' "$FAKE_CURL_BODY" > "$out"
      if [ "$FAKE_CURL_TIME" = nospace ]; then printf '%s\\n' "\${FAKE_CURL_CODE:-200}"
      else printf '%s %s\\n' "\${FAKE_CURL_CODE:-200}" "\${FAKE_CURL_TIME:-0.837}"; fi ;;
  rc) exit "\${FAKE_CURL_RC:-28}" ;;
esac
`, mode: 0o755 };

const PATHENV = { PATH: '<WORK>/bin:' + process.env.PATH };
const STATE = '{"schema":1,"run":{"id":"r1","coordinator":{"session_id":"S1","pid":0}},"lanes":{}}';
const TIMES = ['0.837', '0.25', '0.35', '0.05', '12.34', '0', '1e-3', 'abc', '', '2.675', '99.96', '0.15', '8', '3.00005'];
const BODIES = ['{"model":"glm-4.6"}', '{"model":"GLM-4.5-air"}', '{"model":"claude-3"}', '{"model":123}', '{oops', '', 'null', '{"model":"x"}{"model":"glm-2"}'];

export default {
  module: 'glm-preflight',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/glm-parity.sh',
  mjs: 'tests/js-parity/fixtures/glm-parity.mjs',
  switchEnv: 'COORD_JS_GLM_PREFLIGHT',
  env: { COORD_RUN: 'r1', COORD_STATE_ROOT: '<WORK>/sr', COORD_DRY: '', COORD_SCRIPTS_DIR: '' },
  functions: {
    run: {
      compareFiles: false,
      gen(rng) {
        const files = { 'bin/zsh': FAKE_ZSH, 'bin/curl': FAKE_CURL, 'curl.log': '' };
        const env = { ...PATHENV, FAKE_ZSH_OUT: aliasLine(rng), CURL_LOG: '<WORK>/curl.log', FAKE_CURL: rng.pick(['ok', 'ok', 'ok', 'ok', 'rc']), FAKE_CURL_CODE: rng.pick(['200', '200', '200', '500', '401', '']), FAKE_CURL_TIME: rng.pick(TIMES), FAKE_CURL_BODY: rng.pick(BODIES), FAKE_CURL_RC: rng.pick(['28', '6', '7', '1', '2']) };
        if (rng.chance(0.15)) env.FAKE_ZSH_OUT = rng.pick(['', 'glm: not found', "glm=''", "glm='ANTHROPIC_BASE_URL=https://api.z.ai'", "glm='ANTHROPIC_AUTH_TOKEN=abc ANTHROPIC_BASE_URL=https://api.z.ai ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-4'"]);
        if (rng.chance(0.7)) files['sr/r1/state.json'] = STATE;
        if (rng.chance(0.2)) files['sr/r1/events.jsonl'] = '{"at":"2026-10-09T00:00:00+09:00","kind":"old","lane":"-","data":{}}\n';
        if (rng.chance(0.15)) env.COORD_RUN = 'nope';
        if (rng.chance(0.15)) env.COORD_DRY = '1';
        const cfg = {};
        if (rng.chance(0.2)) cfg.launch = { glm: rng.pick(['myglm', 'weird name', '', 'a-b_c.d', '한글']) };
        if (rng.chance(0.25)) cfg.glm = { timeout_s: rng.pick(['5', 'x', '', '10.5', '0']) };
        if (Object.keys(cfg).length) files['.coord.local.json'] = JSON.stringify(cfg);
        return { args: [], files, env, stdin: '' };
      },
      fixed: [
        { label: '정상(ok)', args: [], env: { ...PATHENV, FAKE_ZSH_OUT: "glm='ANTHROPIC_BASE_URL=\"https://api.z.ai\" ANTHROPIC_AUTH_TOKEN=abc ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-4.6 claude'", FAKE_CURL: 'ok', FAKE_CURL_CODE: '200', FAKE_CURL_TIME: '0.837', FAKE_CURL_BODY: '{"model":"glm-4.6"}', CURL_LOG: '<WORK>/curl.log' }, files: { 'bin/zsh': FAKE_ZSH, 'bin/curl': FAKE_CURL, 'curl.log': '', 'sr/r1/state.json': STATE }, stdin: '' },
        { label: '반올림 0.25 → 0.2(짝수로)', args: [], env: { ...PATHENV, FAKE_ZSH_OUT: "glm='ANTHROPIC_BASE_URL=https://api.z.ai ANTHROPIC_AUTH_TOKEN=t ANTHROPIC_DEFAULT_HAIKU_MODEL=glm'", FAKE_CURL: 'ok', FAKE_CURL_TIME: '0.25', FAKE_CURL_BODY: '{"model":"glm"}', CURL_LOG: '<WORK>/curl.log' }, files: { 'bin/zsh': FAKE_ZSH, 'bin/curl': FAKE_CURL, 'curl.log': '' }, stdin: '' },
        { label: '시간이 글자(printf 실패 → 0.0\\n원문)', args: [], env: { ...PATHENV, FAKE_ZSH_OUT: "glm='ANTHROPIC_BASE_URL=https://api.z.ai ANTHROPIC_AUTH_TOKEN=t ANTHROPIC_DEFAULT_HAIKU_MODEL=glm'", FAKE_CURL: 'ok', FAKE_CURL_TIME: 'abc', FAKE_CURL_BODY: '{"model":"glm"}', CURL_LOG: '<WORK>/curl.log' }, files: { 'bin/zsh': FAKE_ZSH, 'bin/curl': FAKE_CURL, 'curl.log': '' }, stdin: '' },
        { label: '빈 시간(nospace → secs=code)', args: [], env: { ...PATHENV, FAKE_ZSH_OUT: "glm='ANTHROPIC_BASE_URL=https://api.z.ai ANTHROPIC_AUTH_TOKEN=t ANTHROPIC_DEFAULT_HAIKU_MODEL=glm'", FAKE_CURL: 'ok', FAKE_CURL_TIME: 'nospace', FAKE_CURL_CODE: '200', FAKE_CURL_BODY: '{"model":"glm"}', CURL_LOG: '<WORK>/curl.log' }, files: { 'bin/zsh': FAKE_ZSH, 'bin/curl': FAKE_CURL, 'curl.log': '' }, stdin: '' },
        { label: 'timeout rc28', args: [], env: { ...PATHENV, FAKE_ZSH_OUT: "glm='ANTHROPIC_BASE_URL=https://api.z.ai ANTHROPIC_AUTH_TOKEN=t ANTHROPIC_DEFAULT_HAIKU_MODEL=glm'", FAKE_CURL: 'rc', FAKE_CURL_RC: '28', CURL_LOG: '<WORK>/curl.log' }, files: { 'bin/zsh': FAKE_ZSH, 'bin/curl': FAKE_CURL, 'curl.log': '' }, stdin: '' },
        { label: 'DRY: 상태 기록을 건너뛴다', args: [], env: { COORD_DRY: '1', FAKE_ZSH_OUT: "glm='ANTHROPIC_BASE_URL=https://api.z.ai ANTHROPIC_AUTH_TOKEN=t ANTHROPIC_DEFAULT_HAIKU_MODEL=glm'", FAKE_CURL: 'ok', FAKE_CURL_BODY: '{"model":"glm"}', CURL_LOG: '<WORK>/curl.log' }, files: { 'bin/zsh': FAKE_ZSH, 'bin/curl': FAKE_CURL, 'curl.log': '', 'sr/r1/state.json': STATE }, stdin: '' },
        { label: '토큰이 값에 섞여 있어도 출력에 안 나온다', args: [], env: { ...PATHENV, FAKE_ZSH_OUT: "glm='ANTHROPIC_BASE_URL=\"https://api.z.ai\" ANTHROPIC_AUTH_TOKEN=sk-VERYSECRET123456 ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-4'", FAKE_CURL: 'ok', FAKE_CURL_BODY: '{"model":"glm-4"}', CURL_LOG: '<WORK>/curl.log' }, files: { 'bin/zsh': FAKE_ZSH, 'bin/curl': FAKE_CURL, 'curl.log': '', 'sr/r1/state.json': STATE }, stdin: '' },
      ],
    },
  },
};
