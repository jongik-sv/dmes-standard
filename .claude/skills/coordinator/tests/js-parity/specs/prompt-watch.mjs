// scripts/prompt-watch.sh ↔ prompt-watch.mjs 대조 명세(kind 'script', 스위치 COORD_JS_PROMPT_WATCH).
//   · sh·mjs 는 fixtures/pw-parity.{sh,mjs} 래퍼다: 작업 폴더의 `.cache.json` 으로 화면 캐시(폴더 700·파일 600)를 만든 뒤 스크립트를 돌리고,
//     가짜 orca 가 받은 호출 줄(orca.log)을 stdout 끝에 덧붙인다(캐시를 썼는지·직접 읽었는지·권한 창 120줄 재읽기가 있었는지가 드러난다).
//   · 가짜 orca 는 terminal read 에서 --limit N 을 지켜 화면 파일의 마지막 N줄을 낸다. 화면이 없으면 stale 오류, <핸들>.fail 이 있으면 그 밖의 오류.
//   · 캐시는 읽은 시각을 gen 시점 상대값으로 두고(신선 1초 전 / 낡음 60초 전, 신선 기준 20초에서 멀다) 실행 시각에 기대지 않는다.
//   · --follow 가 0 이 아닌 사례는 시간이 걸려 드물게만. 읽기 횟수가 초 경계에 흔들리지 않게 늘 --follow 2 --every 3(정확히 2회).
const RULE = '─'.repeat(30);
const BODY = ['previous output', 'more output', '> ', '  ? for shortcuts'];
const PERM = ['● Bash(rm -rf /tmp/x)', RULE, ' Bash command', '   rm -rf /tmp/x', RULE, ' Do you want to proceed?', ' ❯ 1. Yes', '   2. No'];
const PERM_CD = [...PERM, ' Esc to cancel · Tab to amend', '   will automatically deny this request in 0:09'];
const PERM_BOX = ['╭──────────────╮', '│ Bash command │', '╰──────────────╯', ' Do you want to proceed?', ' ❯ 1. Yes'];
const long = (n, tag = 'filler') => Array.from({ length: n }, (_, i) => `${tag} ${i}`);
const SCREENS = {
  idle: BODY,
  empty: [''],
  blank: ['', '  ', ''],
  perm: [...BODY, ...PERM],
  permLong: [...long(60), ...PERM],          // 40줄 안에 가로줄이 없고 120줄을 다시 읽어야 시작을 찾는다
  permBox: [...BODY, ...PERM_BOX],
  permCd: [...BODY, ...PERM_CD],
  permCdB: [...BODY, ...PERM_CD.slice(0, -1), '   will automatically deny this request in 0:04'],
  choice: [...BODY, 'Pick one', '❯ 1. Option', '  2. Other'],
  busyChoice: ['echo "❯ 1. Yes / 2. No"', '✻ Working… (esc to interrupt)'],
  spinnerChoice: ['echo "❯ 1. Yes"', '✶ …ing… (3m 59s · ↓ 1k tokens)'],
  pastTurn: ['✻ Cooked for 7s · done 12:17', 'Running 1 shell command', '❯ 1. Yes', '  2. No'],
  question: [...BODY, 'Enter to select · ↑/↓ to navigate'],
  usage: ['What do you want to do?', '❯ 1. Wait for limit to reset', '  2. Switch'],
  trust: ['Do you trust the files in this folder?'],
  interrupted: [...BODY, '⎿ Interrupted · What should Claude do instead?'],
  interruptedOld: ['⎿ Interrupted · What should Claude do instead?', ...long(40)],   // 30줄 밖
  interruptedPerm: ['⎿ Interrupted · What should Claude do instead?', ...PERM],
  cr: ['line\r', 'Do you want to proceed?\r', '❯ 1. Yes\r'],
  utf: ['한글 출력', ...PERM],
};
const SCREEN_KEYS = Object.keys(SCREENS);

const FAKE_ORCA = { data: `#!/bin/sh
echo "$*" >> "$FAKE_LOG"
sub="$2"; h=""; lim=""; prev=""
for a in "$@"; do [ "$prev" = "--terminal" ] && h="$a"; [ "$prev" = "--limit" ] && lim="$a"; prev="$a"; done
case "$sub" in
  read)
    if [ -f "$FAKE_SCREENS/$h.fail" ]; then echo '{"ok":false,"error":{"message":"boom"}}'
    elif [ -f "$FAKE_SCREENS/$h.txt" ]; then
      if [ -n "$lim" ]; then tail -n "$lim" "$FAKE_SCREENS/$h.txt" | jq -Rnc '[inputs] | {ok:true,result:{terminal:{tail:.}}}'
      else jq -Rnc '[inputs] | {ok:true,result:{terminal:{tail:.}}}' < "$FAKE_SCREENS/$h.txt"; fi
    else echo '{"ok":false,"error":{"message":"terminal_handle_stale"}}'; fi ;;
  *) echo '{"ok":false,"error":{"message":"unknown"}}' ;;
esac
exit 0
`, mode: 0o755 };

const LANES = ['a', 'b', 'c'];
const text = (k) => `${SCREENS[k].join('\n')}\n`;

function base(handles, { run = true, ttl = 20, every } = {}) {
  const files = { 'bin/orca': FAKE_ORCA };
  const lanes = {};
  for (const [lane, h] of Object.entries(handles)) lanes[lane] = { state: 'active', session: { handle: h } };
  if (run) { files['sr/r1/state.json'] = JSON.stringify({ schema: 1, run: { id: 'r1' }, lanes }); files['sr/current'] = 'r1\n'; }
  const approvals = { screen_cache_s: ttl };
  if (every !== undefined) approvals.watch_every_s = every;
  files['.coord.local.json'] = JSON.stringify({ terminal_backend: 'orca', approvals });
  const env = {
    COORD_RUN: run ? 'r1' : '', COORD_STATE_ROOT: '<WORK>/sr', DFLOW_CONSOLE_DIR: '<WORK>/cons', FAKE_SCREENS: '<WORK>/screens', FAKE_LOG: '<WORK>/orca.log',
    PATH: `<WORK>/bin:${process.env.PATH}`,
  };
  return { files, env };
}
const screenFile = (files, h, k) => { files[`screens/${h}.txt`] = text(k); };

function build(rng) {
  const hs = { a: 'ha', b: 'hb', c: rng.chance(0.15) ? '' : 'hc' };
  const ttl = rng.pick([20, 20, 20, 0, 5]);
  const { files, env } = base(hs, { ttl });
  const cache = {};
  for (const h of Object.values(hs)) {
    if (h === '') continue;
    const r = rng.next();
    const k = rng.pick(SCREEN_KEYS);
    if (r < 0.85) screenFile(files, h, k);
    else if (r < 0.92) files[`screens/${h}.fail`] = '';
    if (rng.chance(0.45)) {
      // 캐시: 대개 화면 파일과 같은 화면, 가끔 다른 화면(캐시를 믿는 쪽이 보이게)
      const ck = rng.chance(0.7) ? k : rng.pick(SCREEN_KEYS);
      cache[h] = { screen: SCREENS[ck].join('\n'), ageMs: rng.pick([1000, 1000, 1000, 60000]) };
      if (rng.chance(0.12)) cache[h].corrupt = rng.pick(['kind', 'lines', 'mode', 'nofull']);
    }
  }
  if (Object.keys(cache).length) files['.cache.json'] = JSON.stringify(cache);
  const mode = rng.pick(['lane', 'lane', 'handle', 'lanes', 'lanes', 'lanes']);
  const args = [];
  if (mode === 'lane') args.push(rng.pick(LANES));
  else if (mode === 'handle') args.push('--handle', rng.pick(['ha', 'hb', 'hc', 'hx']));
  else args.push('--lanes', rng.pick(['a,b,c', 'a,b', 'b', 'c,a', 'a,,b', 'a,ghost', ',', 'b,b']));
  if (rng.chance(0.03)) args.push('--follow', '2', '--every', '3');
  else if (rng.chance(0.2)) args.push('--follow', '0');
  if (rng.chance(0.04)) args.push(rng.pick(['--bogus', '--follow', 'x', '--every', 'q']));
  if (rng.chance(0.03)) args.length = 0;
  if (rng.chance(0.03)) env.COORD_RUN = '';
  return { args, files, env };
}

const one = (screens, { args = ['a'], cache, ttl = 20, handles = { a: 'ha', b: 'hb', c: 'hc' }, extra = {} } = {}) => {
  const { files, env } = base(handles, { ttl });
  for (const [h, k] of Object.entries(screens)) screenFile(files, h, k);
  if (cache) files['.cache.json'] = JSON.stringify(cache);
  return { args, files: { ...files, ...extra }, env };
};
const cacheOf = (k, o = {}) => ({ screen: SCREENS[k].join('\n'), ageMs: 1000, ...o });

export default {
  module: 'prompt-watch',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/pw-parity.sh',
  mjs: 'tests/js-parity/fixtures/pw-parity.mjs',
  switchEnv: 'COORD_JS_PROMPT_WATCH',
  env: { COORD_REPO: '<WORK>' },
  functions: {
    run: {
      compareFiles: false,
      gen: build,
      fixed: [
        { label: '-h', args: ['-h'], env: {}, files: {} },
        { label: '모르는 옵션(die 2)', args: ['--bogus'], env: {}, files: {} },
        { label: '--follow 가 정수 아님(die 2)', args: ['a', '--follow', 'x'], env: {}, files: {} },
        { label: '레인도 핸들도 없음(die 2)', args: [], env: {}, files: {} },
        { label: '회차 없음(die 3)', ...one({}, { args: ['a'] }), env: { ...one({}).env, COORD_RUN: '' } },
        { label: '레인에 handle 없음(die 3)', ...one({}, { args: ['c'], handles: { a: 'ha', c: '' } }) },
        { label: '--lanes 와 <레인> 같이(die 2)', ...one({ ha: 'perm' }, { args: ['--lanes', 'a', 'a'] }) },
        { label: '--lanes 에 레인 없음(die 2)', ...one({}, { args: ['--lanes', ','] }) },
        { label: '단일: 창 없음 → NONE', ...one({ ha: 'idle' }, { ttl: 0 }) },
        { label: '단일: permission(120줄 재읽기)', ...one({ ha: 'perm' }, { ttl: 0 }) },
        { label: '단일: permission 40줄 밖 시작(120줄로 발췌)', ...one({ ha: 'permLong' }, { ttl: 0 }) },
        { label: '단일: ╭ 상자 창', ...one({ ha: 'permBox' }, { ttl: 0 }) },
        { label: '단일: 카운트다운 줄 permission', ...one({ ha: 'permCd' }, { ttl: 0 }) },
        { label: '단일: choice', ...one({ ha: 'choice' }, { ttl: 0 }) },
        { label: '단일: 진행 표시(esc to interrupt)가 있으면 choice 아님', ...one({ ha: 'busyChoice' }, { ttl: 0 }) },
        { label: '단일: 스피너 경과 시간이 있으면 choice 아님', ...one({ ha: 'spinnerChoice' }, { ttl: 0 }) },
        { label: '단일: 지난 턴 표시 + 진짜 창은 choice', ...one({ ha: 'pastTurn' }, { ttl: 0 }) },
        { label: '단일: question', ...one({ ha: 'question' }, { ttl: 0 }) },
        { label: '단일: usage-limit', ...one({ ha: 'usage' }, { ttl: 0 }) },
        { label: '단일: trust', ...one({ ha: 'trust' }, { ttl: 0 }) },
        { label: '단일: interrupted', ...one({ ha: 'interrupted' }, { ttl: 0 }) },
        { label: '단일: interrupted 가 30줄 밖이면 NONE', ...one({ ha: 'interruptedOld' }, { ttl: 0 }) },
        { label: '단일: permission 이 interrupted 보다 우선', ...one({ ha: 'interruptedPerm' }, { ttl: 0 }) },
        { label: '단일: CR 이 든 화면', ...one({ ha: 'cr' }, { ttl: 0 }) },
        { label: '단일: UTF-8 화면', ...one({ ha: 'utf' }, { ttl: 0 }) },
        { label: '단일: 화면 읽기 stale(die 4)', ...one({}, { ttl: 0 }) },
        { label: '단일: 화면 읽기 실패(die 4)', ...one({}, { ttl: 0, extra: { 'screens/ha.fail': '' } }) },
        { label: '캐시: 신선하면 orca 를 부르지 않는다(NONE)', ...one({ ha: 'perm' }, { cache: { ha: cacheOf('idle') } }) },
        { label: '캐시: 신선한 permission 은 120줄 재읽기만 직접', ...one({ ha: 'idle' }, { cache: { ha: cacheOf('perm') } }) },
        { label: '캐시: 낡으면 직접 읽는다', ...one({ ha: 'perm' }, { cache: { ha: cacheOf('idle', { ageMs: 60000 }) } }) },
        { label: '캐시: kind 불일치면 직접 읽는다', ...one({ ha: 'perm' }, { cache: { ha: cacheOf('perm', { corrupt: 'kind' }) } }) },
        { label: '캐시: 줄 수 불일치면 직접 읽는다', ...one({ ha: 'perm' }, { cache: { ha: cacheOf('perm', { corrupt: 'lines' }) } }) },
        { label: '캐시: 권한 644 면 직접 읽는다', ...one({ ha: 'perm' }, { cache: { ha: cacheOf('perm', { corrupt: 'mode' }) } }) },
        { label: '캐시: screen_cache_s=0 이면 캐시를 읽지 않는다', ...one({ ha: 'idle' }, { ttl: 0, cache: { ha: cacheOf('perm') } }) },
        { label: '--lanes: 창 있는 레인만 블록 + 나머지 NONE', ...one({ ha: 'idle', hb: 'perm', hc: 'choice' }, { args: ['--lanes', 'a,b,c'], ttl: 0 }) },
        { label: '--lanes: handle 없는 레인 GONE', ...one({ ha: 'idle' }, { args: ['--lanes', 'a,c'], handles: { a: 'ha', c: '' }, ttl: 0 }) },
        { label: '--lanes: 낡은 handle GONE', ...one({ ha: 'idle' }, { args: ['--lanes', 'a,b'], ttl: 0 }) },
        { label: '--lanes: 캐시 섞음(신선/낡음/없음)', ...one({ ha: 'idle', hb: 'perm', hc: 'choice' }, { args: ['--lanes', 'a,b,c'], cache: { ha: cacheOf('question'), hb: cacheOf('perm', { ageMs: 60000 }) } }) },
        { label: '--lanes: interrupted', ...one({ ha: 'interrupted', hb: 'idle' }, { args: ['--lanes', 'a,b'], ttl: 0 }) },
        { label: '--lanes --follow 2 --every 3: 같은 창은 한 번만(지문 같음)', ...one({ ha: 'permCd' }, { args: ['--lanes', 'a', '--follow', '2', '--every', '3'], ttl: 0 }) },
        { label: '--lanes --follow 2 --every 3: 캐시가 신선하면 다시 읽지 않는다', ...one({ ha: 'idle' }, { args: ['--lanes', 'a', '--follow', '2', '--every', '3'], cache: { ha: cacheOf('perm') } }) },
        { label: '--follow 2 --every 3 단일: 끝까지 NONE', ...one({ ha: 'idle' }, { args: ['a', '--follow', '2', '--every', '3'], ttl: 0 }) },
      ],
    },
  },
};
