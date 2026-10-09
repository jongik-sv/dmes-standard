// scripts/console-poll.sh ↔ scripts/console-poll.mjs 대조 명세(kind 'script', 스위치 COORD_JS_CONSOLE_POLL).
//   · sh·mjs 는 fixtures/console-poll-parity.{sh,mjs} 래퍼다: console-poll 을 돌린 뒤 작업 폴더의 파일(콘솔 폴더의 입력 요청·화면 sha·화면 캐시·폴러 로그, 상태,
//     가짜 서버가 남긴 인자 기록)을 시각·pid 를 지워 stdout 에 찍는다. 그래서 「서버에 보낸 인자·보낸 화면 JSON·남긴 기록」이 stdout 대조에 들어간다.
//   · 가짜 dflow.sh·orca·term-send-safe·lead-state·office 는 tests/console-poll.sh 와 같은 방식(FAKE_DIR 의 파일로 움직인다).
//   · 한 주기(--once)를 무작위 세계(세션·회차·레인·터미널·화면·대기열의 프롬프트 행)에 돌리고, 하위명령(handle-record·handle-clear·status·stop·start·input-handled·judge-sha·사용법)을 따로 돈다.
//   · 상주 루프(run)·키 입력 성공 경로는 하니스 밖: tests/console-poll.sh(237건)·tests/console-keys.sh(293건)를 끔·켬 두 번 돌려 본다.
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen as screenGen } from '../gen.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', '..', 'fixtures');
const HOST = hostname().split('.')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-');
const ID = 'jji-test';

const CLEAN = { ORCA_TERMINAL_HANDLE: '', CLAUDE_PID: '', COORD_SESSION_ID: '', CLAUDE_CODE_SESSION_ID: '', COORD_RUN: '', DFLOW_CONFIG_DIR: '', COORD_DRY: '', COORD_CONSOLE_POLL: '',
  COORD_CONSOLE_KEYS_ENABLED: '', COORD_LOCK_STALE_S: '', _COORD_CFG: '', _COORD_CFG_MINE: '', _COORD_CFG_SRC: '', COMPAT_FORCE_OS: '', COMPAT_FORCE_USERLAND: '', LC_ALL: 'C',
  COORD_CONSOLE_CYCLE_S: '', COORD_CONSOLE_KEEP_SCREEN: '', COORD_JS_ALL: '' };
const ENV = {
  ...CLEAN, COORD_REPO: '<WORK>', COORD_STATE_ROOT: '<WORK>/state', DFLOW_CONSOLE_DIR: '<WORK>/console', FAKE_DIR: '<WORK>/fake', FAKE_LOG: '<WORK>/fake/dflow.log',
  COORD_TERM_SEND_SAFE: '<WORK>/bin/fake-tss.sh', COORD_LEAD_STATE: '<WORK>/bin/fake-lead-state.sh', COORD_OFFICE_SH: '<WORK>/bin/fake-office.sh',
  CONSOLE_POLL_IDENT: ID, PATH: `<WORK>/bin:${process.env.PATH}`,
};

const FAKE_DFLOW = `#!/bin/sh
F="$FAKE_DIR"
case "$1" in
  me) printf '{"user_email":"Jji.Test@x.com"}'; exit 0 ;;
  console-poll)
    echo "$*" >> "$FAKE_LOG"
    [ "$(cat "$F/poll_mode" 2>/dev/null)" = forbidden ] && { echo '{"error":"프로젝트 한정 토큰","code":"forbidden_role"}' >&2; exit 5; }
    [ -f "$F/poll_rc" ] && exit "$(cat "$F/poll_rc")"
    l="$(head -1 "$F/queue" 2>/dev/null)"
    tail -n +2 "$F/queue" > "$F/q.tmp" 2>/dev/null; mv "$F/q.tmp" "$F/queue"
    if [ -n "$l" ]; then
      mkdir -p "$F/claimed"; printf '%s\\n' "$l" > "$F/claimed/$(printf '%s' "$l" | jq -r .id)"
      printf '%s\\n' "$l"
    fi
    exit 0 ;;
  console-ack)
    echo "$*" >> "$FAKE_LOG"
    rc=0
    if [ -s "$F/ack_rc" ]; then rc="$(head -1 "$F/ack_rc")"; tail -n +2 "$F/ack_rc" > "$F/a.tmp"; mv "$F/a.tmp" "$F/ack_rc"; fi
    [ "$rc" = 0 ] || exit "$rc"
    if [ "$4" = retry ] && [ -f "$F/claimed/$2" ]; then cat "$F/claimed/$2" "$F/queue" > "$F/q.tmp"; mv "$F/q.tmp" "$F/queue"; fi
    echo "ACK $4"; exit 0 ;;
  console-screen)
    n=$(( $(ls "$F"/screen.*.json 2>/dev/null | wc -l) + 1 ))
    cat > "$F/screen.$n.json"
    echo "$* n=$n" >> "$FAKE_LOG"
    [ -f "$F/screen_rc" ] && { echo '{"error":"server"}' >&2; exit "$(cat "$F/screen_rc")"; }
    jq -r --arg m "$(cat "$F/screen_mode" 2>/dev/null)" '.[] | "SCREEN \\(.target_kind) \\(.target_ref) \\(if has("lines") then "stored" elif $m == "need_full" then "need_full" else "touched" end)"' "$F/screen.$n.json"
    exit 0 ;;
  *) echo "$*" >> "$FAKE_LOG"; printf '2026-10-06T00:00:00Z'; exit 0 ;;
esac
`;
const FAKE_ORCA = `#!/bin/sh
echo "$*" >> "$FAKE_DIR/orca.log"
sub="$2"; h=""; prev=""
for a in "$@"; do [ "$prev" = "--terminal" ] && h="$a"; prev="$a"; done
case "$sub" in
  list) jq -nc --arg t "$(cat "$FAKE_DIR/terms" 2>/dev/null)" '{ok:true,result:{terminals:[$t | split(" ")[] | select(. != "") | {handle:., title:"", worktreePath:""}]}}' ;;
  read)
    if [ -f "$FAKE_DIR/screens/$h.txt" ]; then jq -Rnc '[inputs] | {ok:true,result:{terminal:{tail:.}}}' < "$FAKE_DIR/screens/$h.txt"
    else echo '{"ok":false,"error":{"message":"terminal_handle_stale"}}'; fi ;;
  *) echo '{"ok":false,"error":{"message":"fake orca: not allowed"}}' ;;
esac
`;
const FAKE_TSS = `#!/bin/sh
h=""; f=""; busy=no
while [ $# -gt 0 ]; do
  case "$1" in --handle) h="$2"; shift ;; --text-file) f="$2"; shift ;; --allow-busy) busy=yes ;; esac
  shift
done
printf 'h=%s busy=%s text=%s\\n' "$h" "$busy" "$(cat "$f")" >> "$FAKE_DIR/tss.log"
if [ -f "$FAKE_DIR/tss/$h" ]; then
  r="$(cat "$FAKE_DIR/tss/$h")"; [ "$r" = exit ] && exit 4
  echo "$r"
else echo "SENT $h turn_started"; fi
`;
const FAKE_LS = `#!/bin/sh
echo "$*" >> "$FAKE_DIR/ls.log"
cat "$FAKE_DIR/slots" 2>/dev/null
`;
const FAKE_OFFICE = `#!/bin/sh
printf 'COORD_RUN=%s %s\\n' "\${COORD_RUN:-}" "$*" >> "$FAKE_DIR/office.log"
exit 0
`;
const exe = (data) => ({ data, mode: 0o755 });

const jstr = (s) => JSON.stringify(s);
const readFix = (n) => readFileSync(join(FIX, n), 'utf8');
const SCREENS = [
  readFix('prompt-permission.txt'), readFix('prompt-question.txt'),
  '작업 중 화면\n❯ \n', '화면\n', '', 'export ANTHROPIC_API_KEY=sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789\ntoken: Bearer abcdEFGH12345678\n❯ \n',
  ' Do you want to proceed?\n ❯ 1. Yes\n   2. No\n', 'Usage limit reached\n  1. Stop and wait for limit to reset\n', ' Do you trust the files in this folder?\n ❯ 1. Yes, proceed\n',
  'Pick one\n ❯ 1. 첫째\n   2. 둘째\n', '질문입니다\n Enter to select · ↑/↓ to navigate\n ❯ 1. a\n',
];
const HEX = (rng, n) => Array.from({ length: n }, () => '0123456789abcdef'[rng.int(0, 15)]).join('');
const HANDLES = ['hk', 'hL', 'hT', 'hw1', 'hz', 'hold'];

function sessRec(s8, pid, handle, user = ID, host = HOST, key) {
  return `{"key":${jstr(key ?? `${ID}/${HOST}/coord:${s8}`)},"session_id":"${s8}-0000","host":${jstr(host)},"user":${jstr(user)},"pid":${pid},"handle":${jstr(handle)},"sent_at":"2026-10-06T00:00:00+09:00","slots":0,"busy":0}`;
}
function runDoc(rid, sid, pid, user, lanes, extra = '') {
  const l = lanes.map(([n, h, st]) => `${jstr(n)}:{"session":{"handle":${jstr(h)},"pid":0},"state":${jstr(st)}${n === 'kit' ? ',"question":{"at":"2026-10-09T01:02:03+09:00","text":"결정이 필요하다 token=AbCdEfGh12345678"}' : ''}}`).join(',');
  return `{"schema":1,"run":{"id":${jstr(rid)},"closed_at":null,"coordinator":{"session_id":${jstr(sid)},"pid":${pid},"handle":"hL"}},"lanes":{${l}},"merge":{"in_flight":null},"office":${user === '-' ? '{}' : `{"user":${jstr(user)}${extra}}`}}`;
}
function row(rng, i, extra = {}) {
  const base = {
    id: rng.pick([`${HEX(rng, 8)}-${HEX(rng, 4)}`, HEX(rng, 32), 'short', '', `${HEX(rng, 8)}\nzz`]),
    target_kind: rng.pick(['coord_lane', 'coord_lane', 'coord_lane', 'coord_lead', 'team_lead', 'team_worker', 'bogus', 'Coord_Lane']),
    target_ref: rng.pick(['kit', 'kit', 'dup', 'aaaa1111', 'lead', 'w1', 'x/y', '../z', '']),
    claim_token: rng.pick(['tok-' + i, 'tok-' + i, 'tok-' + i, '']),
    text: rng.pick(['안녕 지시 하나', 'a'.repeat(300), '느낌표! 있음', '', ' ', '비밀 token=AbCdEfGh12345678 가림', '줄1\n줄2', 'x'.repeat(2100), '🙂 이모지', 'sk-' + HEX(rng, 30)]),
    ...extra,
  };
  if (rng.chance(0.12)) base.kind = rng.pick(['keys', 'keys', 'weird', 'text', '']);
  if (base.kind === 'keys') {
    base.keys = rng.pick([['Enter'], ['Down', 'Enter'], ['Up', 'Down', 'Up', 'Tab'], ['x'], 'Enter', [], ['Down', 'Down', 'Down', 'Down', 'Enter'], ['Enter', 'Down']]);
    base.input_request = rng.pick([{ kind: 'permission', since: '2026-10-09T01:02:03.456Z', sha: HEX(rng, 64) }, { kind: 'bogus', since: 'x', sha: 'y' }, { kind: 'choice', since: '2026-10-09T01:02:03.456Z', sha: 'zz' }, null]);
    base.expires_at = rng.pick(['2099-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z', 'nope', null]);
  }
  return JSON.stringify(base);
}

/** 한 주기용 세계 */
function world(rng, { once = true } = {}) {
  const files = {};
  const cfg = { state_dir: 'state', terminal_backend: 'orca', office: { enabled: rng.chance(0.97), project_id: null, label_max: 40, dflow_script: 'bin/fake-dflow.sh' } };
  cfg.approvals = { screen_cache_s: rng.pick([20, 20, 20, 0]) };
  files['.coord.local.json'] = JSON.stringify(cfg);
  files['bin/fake-dflow.sh'] = exe(FAKE_DFLOW); files['bin/orca'] = exe(FAKE_ORCA); files['bin/fake-tss.sh'] = exe(FAKE_TSS);
  files['bin/fake-lead-state.sh'] = exe(FAKE_LS); files['bin/fake-office.sh'] = exe(FAKE_OFFICE);
  files['fake/dflow.log'] = ''; files['fake/tss.log'] = ''; files['fake/office.log'] = ''; files['fake/orca.log'] = '';
  // 세션·회차·레인
  const pid = String(process.pid);
  const nSess = rng.int(0, 2);
  const sessions = [];
  if (nSess >= 1) sessions.push(['aaaa1111', rng.pick([pid, pid, '999999', '0', 'null']), 'hL']);
  if (nSess >= 2) sessions.push(['bbbb2222', rng.pick([pid, '999999']), 'hOther']);
  for (const [s8, p, h] of sessions) files[`state/_session/${s8}.json`] = sessRec(s8, p, h, rng.pick([ID, ID, ID, 'someone']), HOST);
  const lanes = [['kit', rng.pick(HANDLES), rng.pick(['active', 'active', 'closed'])], ['dup', rng.pick(HANDLES), 'active']];
  files['state/r1/state.json'] = runDoc('r1', 'aaaa1111-0000', rng.pick([pid, pid, '999999']), ID, lanes);
  if (rng.chance(0.4)) files['state/r2/state.json'] = runDoc('r2', 'bbbb2222-0000', rng.pick([pid, '999999', '0']), rng.pick([ID, ID, 'other']), [['dup', rng.pick(HANDLES), 'active'], ['lane9', rng.pick(HANDLES), 'active']]);
  if (rng.chance(0.15)) files['state/r3/state.json'] = rng.pick(['{', '[]', '5']);
  if (rng.chance(0.3)) files['state/current'] = 'r1\n';
  // 팀장 핸들 기록
  if (rng.chance(0.3)) files['console/lead/L1.json'] = JSON.stringify({ agent: `${ID}/${HOST}/lead`, repo: '/repo/main', handle: 'hT', pid: Number(rng.pick([pid, '999999'])), at: 'x', slots: 2, busy: 1, until_label: '18:00', project: null });
  if (rng.chance(0.3)) files['fake/slots'] = 'SLOT w1 aaaa1111 handle=hw1 state=spawn\nSLOT w2 bbbb2222 handle=- state=done\n';
  // 터미널·화면
  const terms = HANDLES.filter(() => rng.chance(0.6));
  files['fake/terms'] = terms.join(' ');
  for (const h of HANDLES) if (rng.chance(0.85)) files[`fake/screens/${h}.txt`] = rng.chance(0.15) ? Buffer.from(screenGen(rng).stdin).toString('latin1') : rng.pick(SCREENS);
  // 대기열(프롬프트 행)
  const rows = Array.from({ length: rng.pick([0, 0, 1, 1, 2, 3]) }, (_, i) => row(rng, i));
  files['fake/queue'] = rows.length ? `${rows.join('\n')}\n` : '';
  if (rng.chance(0.08)) files['fake/poll_rc'] = String(rng.pick([7, 6, 1]));
  if (rng.chance(0.06)) files['fake/poll_mode'] = 'forbidden';
  if (rng.chance(0.15)) files['fake/ack_rc'] = `${rng.pick(['0', '6', '7', '1'])}\n${rng.pick(['0', '6'])}\n`;
  if (rng.chance(0.15)) files['fake/screen_mode'] = 'need_full';
  if (rng.chance(0.06)) files['fake/screen_rc'] = String(rng.pick([7, 6, 1]));
  for (const h of HANDLES) if (rng.chance(0.15)) files[`fake/tss/${h}`] = rng.pick(['REFUSED ' + h + ' compacting', 'REFUSED ' + h + ' stale', 'REFUSED ' + h + ' draft-in-input', 'REFUSED ' + h + ' not-idle', 'SENT ' + h + ' submitted', 'SENT other turn_started', 'exit', 'garbage']);
  // 이전 주기가 남긴 상태
  if (rng.chance(0.4)) files['console/screens/coord_lane_kit.sha'] = `${HEX(rng, 64)}\n`;
  if (rng.chance(0.25)) files['console/inflight/' + HEX(rng, 8) + '-aa'] = '2026-10-09T01:00:00+09:00 x\n';
  if (rng.chance(0.3)) {
    const h = rng.pick(HANDLES);
    files['console/input/coord_lane_kit.json'] = JSON.stringify({ v: 1, kind: rng.pick(['permission', 'question', 'choice', 'usage-limit']), since: '2026-10-09T01:00:00.000Z', excerpt: ['줄1', '줄2'], handled: rng.pick([null, null, { by: 'auto', at: '2026-10-09T01:00:01.000Z' }]), full: rng.pick([null, HEX(rng, 64)]), run: rng.pick(['r1', '']), handle: h });
    if (rng.chance(0.3)) files['console/input/consumed/coord_lane_kit.list'] = `2026-10-09T01:00:00.000Z ${HEX(rng, 64)}\n`;
  }
  if (rng.chance(0.15)) files['console/input/coord_lane_gone.json'] = JSON.stringify({ v: 1, kind: 'permission', since: '2026-10-09T01:00:00.000Z', excerpt: ['x'], handled: null, full: null, run: '', handle: 'hx' });
  if (rng.chance(0.15)) files['console/input/.notify/coord_lane_kit'] = '';
  if (rng.chance(0.1)) files['console/screen/stale.txt'] = 'old\n';
  const env = {};
  if (rng.chance(0.15)) env.COORD_DRY = '1';
  if (rng.chance(0.2)) env.COORD_CONSOLE_KEYS_ENABLED = '1';
  if (rng.chance(0.1)) env.CONSOLE_POLL_IDENT = '';
  void once;
  return { files, env, stdin: '' };
}

const once = {
  compareFiles: false,
  gen(rng) { const w = world(rng); return { ...w, args: rng.pick([['--once'], ['--once'], ['--once'], ['--once', '--dry-run'], ['--dry-run', '--once']]) }; },
  fixed: [],
};

function lockWorld(rng, alive) {
  const w = world(rng);
  const p = alive ? String(process.pid) : '999999';
  w.files[`console/poller-${ID}.lock/pid`] = `${p}\n`;
  w.files[`console/poller-${ID}.lock/since`] = '2026-10-09T01:00:00+09:00\n';
  w.files[`console/poller-${ID}.lock/cycle`] = '30\n';
  return w;
}

/** node:test 용: 부른 프로세스 자신을 세션·회차 소유자로 둔 「할 일이 있는」 고정 세계(무작위 변덕은 모두 걷어 낸다) */
export function activeWorld(rng) {
  const w = world(rng);
  for (const f of Object.keys(w.files)) if (/^(fake\/(queue|slots|terms|poll_rc|poll_mode|ack_rc|screen_mode|screen_rc|tss\/)|state\/(r[0-9]+\/|current)|state\/_session\/|console\/(input|inflight|lead|screens))/.test(f)) delete w.files[f];
  const pid = String(process.pid);
  w.files['.coord.local.json'] = JSON.stringify({ state_dir: 'state', terminal_backend: 'orca', office: { enabled: true, project_id: null, label_max: 40, dflow_script: 'bin/fake-dflow.sh' }, approvals: { screen_cache_s: 20 } });
  w.files['state/_session/aaaa1111.json'] = sessRec('aaaa1111', pid, 'hL', ID, HOST);
  w.files['state/r1/state.json'] = runDoc('r1', 'aaaa1111-0000', pid, ID, [['kit', 'hk', 'active']]);
  w.files['fake/queue'] = ''; w.files['fake/terms'] = 'hk hL';
  w.env = { COORD_CONSOLE_CYCLE_S: '1' };
  return w;
}
export { ENV, ID };

export default {
  module: 'console-poll',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/console-poll-parity.sh',
  mjs: 'tests/js-parity/fixtures/console-poll-parity.mjs',
  switchEnv: 'COORD_JS_CONSOLE_POLL',
  env: ENV,
  functions: {
    once,
    'handle-record': {
      compareFiles: false,
      gen(rng) {
        const w = world(rng);
        const args = ['handle-record', 'team', '--agent', rng.pick([`${ID}/${HOST}/lead`, '에이전트/호스트/lead']), '--repo', rng.pick(['/repo/main', '/Users/jji/project/dmes-standard', '한글/리포', 'a', '/x y/z'])];
        if (rng.chance(0.5)) args.push('--slots', String(rng.int(0, 9)));
        if (rng.chance(0.5)) args.push('--busy', String(rng.int(0, 9)));
        if (rng.chance(0.4)) args.push('--until-label', rng.pick(['18:00', '', '답 대기', '한글 라벨']));
        if (rng.chance(0.3)) args.push('--project', rng.pick(['proj-1', '']));
        w.env.CLAUDE_PID = rng.pick(['', '12345', 'abc', '007']);
        w.env.ORCA_TERMINAL_HANDLE = rng.pick(['', 'term_abc', 'h한글']);
        if (rng.chance(0.4)) {
          const repo = args[args.indexOf('--repo') + 1];
          void repo;
        }
        return { ...w, args };
      },
      fixed: [
        { label: 'console-poll.sh: handle-record 기본', args: ['handle-record', 'team', '--agent', `${ID}/${HOST}/lead`, '--repo', '/repo/main', '--slots', '2', '--busy', '1', '--until-label', '18:00'], files: {}, env: { CLAUDE_PID: '4242', ORCA_TERMINAL_HANDLE: 'hT' }, stdin: '' },
        { label: 'handle-record: 사용법(--slots 숫자 아님)', args: ['handle-record', 'team', '--agent', 'a', '--repo', 'r', '--slots', 'x'], files: {}, env: {}, stdin: '' },
      ],
    },
    'handle-clear': {
      compareFiles: false,
      gen(rng) { const w = world(rng); return { ...w, args: rng.pick([['handle-clear', 'team', '--repo', '/repo/main'], ['handle-clear', 'team'], ['handle-clear', 'x'], ['handle-clear', 'team', '--repo', '']]) }; },
      fixed: [],
    },
    status: {
      compareFiles: false,
      gen(rng) { const w = rng.chance(0.5) ? lockWorld(rng, rng.chance(0.6)) : world(rng); return { ...w, args: rng.pick([['status'], ['status'], ['status', 'x']]) }; },
      fixed: [],
    },
    stop: {
      compareFiles: false,
      gen(rng) { const w = rng.chance(0.4) ? lockWorld(rng, false) : world(rng); w.env.COORD_CONSOLE_STOP_WAIT_S = rng.pick(['1', '1', '01', '001', '08']); return { ...w, args: ['stop'] }; },
      fixed: [],
    },
    start: {
      compareFiles: false,
      // 실제로 폴러를 띄우는 갈래(detached 자식이 파일을 계속 쓴다)는 비교 대상이 아니다. 띄우기·종료는 tests/console-poll-js.test.mjs 가 본다
      gen(rng) {
        const kind = rng.pick(['dry', 'running', 'idle', 'idle', 'noident']);
        const w = kind === 'running' ? lockWorld(rng, true) : world(rng);
        if (kind === 'dry') w.env.COORD_DRY = '1';
        if (kind === 'noident') w.env.CONSOLE_POLL_IDENT = '';
        if (kind === 'idle' || kind === 'noident') {
          for (const f of Object.keys(w.files)) if (/^(state\/(_session|r[0-9]+)\/|state\/current$|console\/lead\/|fake\/slots$)/.test(f)) delete w.files[f];
          delete w.env.COORD_DRY;
        }
        return { ...w, args: ['start'] };
      },
      fixed: [{ label: 'start: COORD_DRY=1 이면 skipped dry', args: ['start'], files: {}, env: { COORD_DRY: '1' }, stdin: '' }],
    },
    'input-handled': {
      compareFiles: false,
      gen(rng) {
        const w = world(rng);
        const kind = rng.pick(['permission', 'question', 'choice', 'usage-limit']);
        const full = HEX(rng, 64);
        const rec = { v: 1, kind, since: '2026-10-09T01:00:00.000Z', excerpt: rng.pick([['줄1', '줄2'], [], ['a']]), handled: rng.pick([null, null, { by: 'auto', at: '2026-10-09T01:00:01.000Z' }]), full: rng.pick([full, full, null]), run: rng.pick(['r1', 'r1', '', 'r9', '../x']), handle: 'hk' };
        w.files['console/input/coord_lane_kit.json'] = rng.chance(0.1) ? rng.pick(['{', '[]', '']) : JSON.stringify(rec);
        if (rng.chance(0.3)) w.files['console/input/coord_lead_aaaa1111.json'] = JSON.stringify({ ...rec, run: 'r1' });
        const exp = rng.chance(0.4) ? ['--expect-full', rng.pick([full, full, HEX(rng, 64), 'nothex'])] : [];
        const who = rng.pick([['--lane', 'kit'], ['--lane', 'kit'], ['--lane', 'nope'], ['--lead', 'aaaa1111'], ['--lane', 'kit', '--lead', 'x'], []]);
        if (rng.chance(0.3)) w.env.COORD_RUN = rng.pick(['r1', 'r2', 'zz']);
        return { ...w, args: ['input-handled', ...who, '--by', rng.pick(['coordinator', 'auto', 'auto', 'bogus']), ...exp] };
      },
      fixed: [],
    },
    'judge-sha': {
      compareFiles: false,
      gen(rng) {
        const w = world(rng);
        w.files['state/r1/state.json'] = runDoc('r1', 'aaaa1111-0000', process.pid, ID, [['kit', rng.pick(HANDLES), 'active']]);
        w.files['state/current'] = 'r1\n';
        w.env.COORD_RUN = rng.pick(['r1', 'r1', '']);
        return { ...w, args: ['judge-sha', ...rng.pick([['--lane', 'kit'], ['--lane', 'kit'], ['--lane', 'nope'], ['--lane', '../x'], [], ['--bogus']])] };
      },
      fixed: [],
    },
    usage: {
      compareFiles: false,
      gen: (rng) => ({ args: rng.pick([[], ['bogus'], ['start', 'x'], ['stop', 'x'], ['run', 'x'], ['--once', 'x'], ['--dry-run'], ['handle-record'], ['handle-clear'], ['input-handled'], ['judge-sha'], ['help'], ['-h']]), files: {}, env: {}, stdin: '' }),
      fixed: [{ label: 'usage: 인자 없음', args: [], files: {}, env: {}, stdin: '' }],
    },
  },
};
