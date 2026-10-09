// scripts/auto-answer.sh ↔ scripts/auto-answer.mjs 대조 명세(kind 'script', 스위치 COORD_JS_AUTO_ANSWER).
//   · 이 스크립트는 살아 있는 레인 터미널에 숫자·Esc 를 보낸다. 거부해야 할 명령을 허용하는 쪽의 차이는 한 건이라도 머지 불가라서,
//     stdout·종료 코드뿐 아니라 가짜 orca 가 받은 인자(보낸 키)와 남긴 상태(승인 기록 .approvals·이벤트·입력 요청 기록·소비 목록·보낸 표식)를 대조한다.
//   · sh·mjs 는 fixtures/auto-answer-parity.{sh,mjs} 래퍼다: auto-answer 를 돌린 뒤 작업 폴더의 파일을 시각을 <ISO> 로 지워 stdout 에 찍는다(TMPDIR 에 임시 파일이 남았는지도).
//     그래서 compareFiles 는 끈다. coord-state.sh·console-poll.sh·office.sh 는 진짜 스크립트가 돈다(office.enabled=false).
//   · 가짜 orca·date·sleep: fixtures/fake-tools.mjs. 화면은 읽을 때마다 fake/screens/hk.<n>.txt(없으면 hk.txt):
//       1번째 = 판정용 80줄, 2번째 = 보내기 직전(잠금 안) 재읽기, 3번째 = 보낸 뒤 재확인. 판정 뒤 창이 바뀌는 사례는 hk.2.txt 를 따로 준다.
//   · 거부 정규식(209행 grep -qiE)은 가지(25개)마다 걸리는 사례 2·안 걸리는 사례 1 이상을 DENY_CASES 에 두고, 무작위 사례가 그것을 섞어 쓴다.
//     로케일 의존(`[[:space:]]`)을 보려고 LC_ALL 을 C·en_US.UTF-8 로 섞는다.
//   · 화면 속 경로는 <WORK> 같은 자리표시자를 쓸 수 없어(파일 내용은 치환되지 않는다) 레인 워크트리는 고정 경로 /srv/lane/kit 를 쓴다(존재하지 않아도 된다).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAKE_DATE, FAKE_ORCA, FAKE_SLEEP, clock, exe } from '../fixtures/fake-tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, '..', '..', 'fixtures');
const fxText = (n) => readFileSync(join(FX, n), 'utf8');

const CLEAN = { COORD_RUN: '', COORD_SESSION_ID: '', CLAUDE_CODE_SESSION_ID: '', CLAUDE_PID: '', ORCA_TERMINAL_HANDLE: '', COORD_DRY: '', COORD_CONSOLE_POLL: '0',
  COORD_STATE_ROOT: '', COORD_LOCK_STALE_S: '', _COORD_CFG: '', _COORD_CFG_MINE: '', _COORD_CFG_SRC: '', COMPAT_FORCE_OS: '', COMPAT_FORCE_USERLAND: '', DFLOW_CONFIG_DIR: '',
  COORD_CONSOLE_LANE_LOCK_WAIT_S: '', COORD_CONSOLE_SENT_GRACE_S: '', COORD_TERM_TIMEOUT_MS: '', COORD_JS_ALL: '', COORD_CONSOLE_WINDOW_TIMEOUT_S: '', LC_ALL: 'C' };
const BASE_ENV = { ...CLEAN, COORD_REPO: '<WORK>', COORD_STATE_ROOT: '<WORK>/state', DFLOW_CONSOLE_DIR: '<WORK>/console', FAKE_DIR: '<WORK>/fake', PATH: `<WORK>/bin:${process.env.PATH}`, COORD_CONSOLE_WINDOW_TIMEOUT_S: '29', COORD_JS_TEST: '1', COORD_JS_SLEEP_SCALE: '0', COORD_JS_SLEEP_LOG: '<WORK>/fake/sleep.log' };

// ---------- 창 조립(tests/console-keys.sh §14 의 mkwin 과 같은 모양) ----------
const RULE = '─'.repeat(60);
const OPTS3 = [' ❯ 1. Yes', "   2. Yes, and don't ask again for this command", '   3. No, and tell Claude what to do differently (esc)'];
const lines = (t) => { const l = t.split('\n'); if (l[l.length - 1] === '') l.pop(); return l; };
const out = (l) => `${l.join('\n')}\n`;

/** 권한 창: 머리 가로줄(들여쓰기 0)·도구 이름·빈 줄·본문(3칸)·빈 줄·질문(1칸)·선택지 */
function permWin({ tool = ' Bash command', q = ' Do you want to proceed?', body = ['git status'], opts = OPTS3, rule = RULE, pre = ['⏺ 작업을 이어 갑니다.', ''], indent = '   ', post = [] }) {
  return out([...pre, rule, tool, '', ...body.map((b) => `${indent}${b}`), '', q, ...opts, ...post]);
}

// ---------- 거부 정규식 가지별 사례(걸리는 것 pos·안 걸리는 것 neg) ----------
export const DENY_CASES = [
  ['rm', ['rm -rf build', 'ls && rm x', 'ls\trm\t-f x', 'RM -rf x', 'cd x; rm'], ['echo perform x', 'cat a-rm b', 'cat a_rm b']],
  ['rmdir·unlink·shred·truncate', ['rmdir x', 'unlink y', 'shred -u z', 'truncate -s 0 f'], ['echo shredder', 'ls rmdirs']],
  ['-delete', ['find . -delete', 'find x -name a -delete'], ['find . -deleted', 'echo -deletex']],
  ['-exec·-execdir', ['find . -exec ls {} ;', 'find . -execdir ls {} +'], ['find . -executable', 'echo -execx']],
  ['xargs', ['ls | xargs echo', 'xargs -n1 ls', 'echo a|xargs\tls'], ['echo xargsx foo', 'echo myxargs a']],
  ['git push 외', ['git push origin x', 'git reset --hard', 'git clean -fd', 'git checkout -- x', 'git restore x', 'git stash drop', 'git stash pop', 'git stash clear', 'git rebase main',
    'git branch -D x', 'git branch -d x', 'git filter-branch x', 'git update-ref -d x', 'GIT PUSH x', 'git   push', 'git restoreall', 'git\tpush'], ['git stash list', 'git checkout main', 'git branch -a', 'git status']],
  ['worktree remove', ['git worktree remove x', 'git worktree   remove y', 'worktree\tremove'], ['git worktree list', 'git worktree add x']],
  ['--force', ['foo --force', 'x --force-with-lease', 'echo --FORCE'], ['foo --forc', 'foo -force', 'echo force']],
  ['DROP·TRUNCATE', ["sqlite3 x 'DROP TABLE a'", 'psql -c "truncate t"', 'echo x;DROP x', 'x drop\ty'], ['echo backdrop x', 'echo dropdown', 'echo DROPS']],
  ['DELETE FROM', ['psql -c "DELETE FROM x"', 'delete   from y', 'DELETE\tFROM z'], ['echo DELETE x', 'echo delete_from']],
  ['UPDATE .. SET', ['psql -c "UPDATE t SET a=1"', 'update x set y', 'UPDATE\tt\tSET\ta'], ['echo UPDATE', 'echo UPDATE only', 'echo update_set']],
  ['kill 류', ['kill 123', 'foo; pkill x', 'killall node', 'launchctl list', 'shutdown now', 'reboot now', 'KILL 9'], ['echo skill x', 'echo killer x', 'echo kills']],
  ['taskkill·Stop-Process', ['taskkill /F /PID 1', 'Stop-Process -Id 1', 'echo x&taskkill'], ['echo taskkills x', 'echo Stop-Processes']],
  ['del·rd·Remove-Item', ['cmd /c del x', 'a & del x', 'x;rd y', 'Remove-Item x', '(del x)', 'echo a|del b', 'ls||RD z'], ['echo del x', 'echo model x', 'ls rd1']],
  ['chmod', ['chmod +x a', 'echo xchmod', 'CHMOD 700 a'], ['echo chmo', 'echo chm od']],
  ['chown', ['chown a b', 'echo xchown'], ['echo chow', 'echo chon']],
  ['sudo', ['sudo ls', 'echo sudoers', 'x SUDO'], ['echo sud', 'echo su do']],
  ['settings.json', ['cat .claude/settings.json', 'ls settings.local.json', 'cat settings.jsonx'], ['cat setting.json', 'cat settings.jso', 'cat settingsXjson']],
  ['.coord.json', ['cat .coord.json', 'cat .coord.local.json', 'cat x.coord.jsonx'], ['cat .coord.js', 'cat .coord.local.jsn', 'cat coordXjson']],
  ['ANTHROPIC|API|AUTH + KEY|TOKEN', ['echo APIKEY', 'echo auth_token', 'echo $ANTHROPIC_API_KEY', 'echo x_AuthKey'], ['echo API_VERSION', 'echo AUTH_URL', 'echo KEY']],
  ['security find-generic-password', ['security find-generic-password -s x', 'security\tfind-generic-password'], ['security list-keychains', 'security find-identity']],
  ['curl -X', ['curl http://x -X POST', 'curl -s x -XPUT', 'curl\t-sX DELETE x', 'curl x -X  PATCH', 'CURL x -x post'], ['curl -s http://x', 'curl x -X GET', 'curl x --request POST']],
  ['bootRun', ['./gradlew bootRun', 'x bootrun', 'gradle BOOTRUN'], ['gradle boot run', 'gradle bootRu']],
  ['local-run.sh', ['bash local-run.sh', 'x local-run.sh y', './LOCAL-RUN.SH'], ['cat local-run.txt', 'cat localXrun.sh', 'cat local_run.sh']],
  ['npm remove 류', ['npm remove x', 'pnpm dlx y', 'yarn exec z', 'npm rm x', 'pnpm uninstall x', 'yarn   remove x', 'NPM\tRM x'], ['npm install', 'npm test', 'pnpm run build', 'npm removed']],
  ['npx -y', ['npx -y foo', 'npx   -y x', 'npx -yes foo', 'NPX -Y a'], ['npx vitest', 'npx vitest run -y', 'npx y']],
  ['쓰기 리다이렉션 >', ['echo a > f', 'cat x>>y', 'echo a >f', 'ls 3> x', "awk '$1 > 3' a", 'echo "a>b"'], ['ls > /dev/null', 'ls 2>&1', 'ls 2>/dev/null', 'echo x >&2', 'ls >>/dev/null', 'ls 2> /dev/null', 'ls &>/dev/null', 'ls 1>/dev/null 2>&1']],
];

const SAFE = {
  status: ['git status', 'git log --oneline -5', 'git diff', 'git show HEAD', 'git rev-parse HEAD', 'git branch --show-current', 'git branch', 'git branch -a', 'git worktree list', 'ps aux', 'uptime', 'date',
    'pwd', 'echo hi', 'which node', 'whoami', 'uname -a', 'printf x', 'orca terminal list', 'orca terminal read --terminal x', 'orca terminal show x', 'bash x/heavy.sh status', 'x/heavy.sh snapshot'],
  read: ['cat a.txt', 'head -5 a', 'tail -f a', 'ls -la', 'grep -rn foo src', 'rg x', 'find . -name x', 'wc -l a', 'jq . a.json', 'stat a', 'file a', 'sort a', 'uniq a', 'cut -d: -f1 a', 'diff a b', 'tree', 'du -sh .', 'sed -n 1,5p a', "awk '{print $1}' a"],
  'commit-own': ['git add .', 'git commit -m x', 'git add -A'],
  'edit-own': ['sed -i s/a/b/ /srv/lane/kit/f', "sed -i '' s/a/b/ /tmp/f", 'mkdir /tmp/x', 'touch /private/tmp/y', 'cp a b', 'mv /srv/lane/kit/a /srv/lane/kit/b', 'tee /tmp/z', 'mkdir -p out/x', 'touch /etc/x', 'cp ~/a /tmp/b', 'mkdir ../x', 'mkdir a/../b', 'touch C:x', 'cp a\\b c'],
  'heavy-build': ['./gradlew test', 'gradlew build', 'bash x/heavy.sh run', '/x/heavy.sh run foo', 'npx vitest run', 'npx tsc --noEmit', 'npm test', 'npm run test', 'npm run build', 'pnpm run lint', 'npm run typecheck', 'pnpm exec vitest', 'yarn test'],
  unknown: ['python3 x.py', 'curl http://x', 'make', 'node a.js', 'FOO=bar git status', '(git status)', 'FOO=bar BAZ=1 ls', 'ls;', '&& ls', '   ', 'echo hi  # c'],
};
const ALL_SAFE = Object.values(SAFE).flat();
const OPS = [' && ', ' && ', ' || ', '; ', ' | ', '\n'];

function cmdBody(rng) {
  const kind = rng.pick(['safe', 'safe', 'safe', 'deny-pos', 'deny-neg', 'deny-neg', 'mixed', 'mixed']);
  const pick = () => {
    if (kind === 'safe') return rng.pick(ALL_SAFE);
    if (kind === 'deny-pos') { const d = rng.pick(DENY_CASES); return rng.pick(d[1]); }
    if (kind === 'deny-neg') { const d = rng.pick(DENY_CASES); return rng.pick(d[2]); }
    return rng.pick([...ALL_SAFE, ...DENY_CASES.flatMap((d) => [d[1][0], d[2][0]])]);
  };
  const n = rng.pick([1, 1, 1, 2, 2, 3]);
  let s = pick();
  for (let i = 1; i < n; i++) s += rng.pick(OPS) + pick();
  return s.split('\n');
}

// ---------- 창 종류별 화면 ----------
const TOOLS = [' Bash command', ' Bash command', ' Bash command', ' Bash command (unsandboxed)', ' Edit file', ' Write file', ' Fetch', ' Bash command (runs on host)', 'Bash command', '  Bash command'];
const QS = [' Do you want to proceed?', ' Do you want to proceed?', ' Do you want to proceed?', ' Do you want to proceed?', ' Do you want to make this edit to settings.json?',
  ' Do you want to make this edit to app.ts?', ' Do you want to allow this command?', ' Do you want to proceed?  ', '  Do you want to proceed?', ' do you want to proceed?'];
function optsOf(rng) {
  return rng.pick([OPTS3, OPTS3, OPTS3, [' ❯ 1. Yes', '   2. No'], ['   1. Yes', ' ❯ 2. No'], [" ❯ 1. Yes, and don't ask again", '   2. Yes', '   3. No'], [' ❯ 1. Yes', '   2. Yes, allow all edits during this session (shift+tab)', '   3. No'],
    [' ❯ 1. Yes, proceed', '   2. No'], [' ❯ 1. No'], [], [' › 1. Yes', '   2. No'], [' > 1. Yes', '   2. No'], [' ❯ 1.Yes', '   2.No'], ['   1. Yes  ', '   2. No'], [' ❯ 1. YES', '   2. Always allow this session']]);
}
function permScreen(rng) {
  const body = cmdBody(rng);
  const base = { tool: rng.chance(0.15) ? rng.pick(TOOLS) : ' Bash command', q: rng.chance(0.15) ? rng.pick(QS) : ' Do you want to proceed?', body, opts: rng.chance(0.2) ? optsOf(rng) : OPTS3 };
  if (rng.chance(0.04)) base.body = [];
  if (rng.chance(0.04)) base.indent = rng.pick(['  ', '     ', '\t', ' ']);
  if (rng.chance(0.04)) base.rule = rng.pick([`  ${RULE}`, '─'.repeat(9), '─'.repeat(40), `${RULE} x ─`]);
  if (rng.chance(0.15)) base.pre = ['⏺ 작업', ...Array.from({ length: rng.int(0, 45) }, (_, i) => `⏺ 대화 ${i}`)];
  if (rng.chance(0.08)) base.post = rng.pick([['', '  ctx 45% · $0.12'], [' Esc to cancel · Tab to amend'], ['', ' Esc to cancel · Tab to amend', '  ⎇ main']]);
  if (rng.chance(0.04)) base.body = [...body, 'Show working tree status'];
  if (rng.chance(0.03)) base.body = [...body.slice(0, 1), RULE.slice(0, 20), ...body.slice(1)];
  if (rng.chance(0.03)) base.body = [...body, 'Do you want to proceed?', '1. Yes'];
  const q2 = base.q.trim();
  if (q2 !== 'Do you want to proceed?' && rng.chance(0.5)) base.post = [...(base.post || []), ' Esc to cancel · Tab to amend'];
  return permWin(base);
}
const TRUSTS = [
  out(['Do you trust the files in this folder?', '', ' ❯ 1. Yes, proceed', '   2. No, exit', '']),
  out(['Do you trust the files in this folder?', '', ' ❯ Yes, proceed', '   No, exit', '']),
  out(['Is this a project you created or one you trust?', '', '   1. Yes, I trust this folder', ' ❯ 2. No, exit', '']),
  out(['Do you trust the files in this folder?', ' ❯ 1. No, exit', '   2. Yes, proceed']),
  out(['Quick safety check: is this a project you trust?', '', ' ❯ 1. Yes, I trust this folder', '   2. No, exit', '']),
  out(['Do you trust the files in this folder?', '', ' ❯ 1. Yes, proceed']),
  out([RULE, ' Bash command', '', '   echo trust the files in this folder', '', ' Do you want to proceed?', ' ❯ 1. Yes', '   2. No']),
];
const USAGES = [
  out(['What do you want to do?', '', ' ❯ 1. Stop and wait for limit to reset', '   2. Upgrade your plan', '']),
  out(['Usage limit reached', 'What do you want to do?', ' ❯ 1. Wait for limit to reset', '   2. Switch to extra usage', '   3. Upgrade']),
  out(['What do you want to do?', ' ❯ 1. Wait here, then continue', '   2. Switch account']),
  out(['Usage limit reached', ' ❯ 1. Stop and wait', '   2. Request more']),
  out(['What do you want to do?', ' ❯ 1. Upgrade', '   2. Add funds', '']),
  out(['Usage limit reached', 'Stop and wait']),
  out(['  What do you want to do?', ' ❯ 1. Wait for limit to reset']),
];
const QUESTIONS = [
  out(['⏺ 질문', '', ' 어느 쪽으로 진행할까요?', '', ' ❯ 1. 안 A (Recommended)', '   2. 안 B', '   3. 안 C', '', ' Enter to select · ↑/↓ to navigate · Esc to cancel']),
  out(['어떻게 할까요?', ' ❯ 1. 안 A', '   2. 안 B (권장)', ' Enter to select · ↑/↓ to navigate']),
  out(['삭제할까요?', ' ❯ 1. 예 (Recommended)', '   2. 아니오', ' Enter to select · ↑/↓ to navigate']),
  out(['What next?', ' ❯ 1. Deploy now', '   2. Later (Recommended)', ' Enter to select']),
  out(['What next?', ' ❯ 1. First', '   2. Second', ' Enter to select · Arrow keys to navigate']),
  out(['token 을 쓸까요?', ' ❯ 1. (추천) 사용', '   2. 안 함', ' Enter to select']),
  out(['⏺ 이 방법으로 가자 (secret 아님)', '', ' ❯ 1. 이대로 (Recommended)', ' Enter to select']),
];
const CHOICES = [
  out(['⏺ 어느 쪽으로 할까요?', ' ❯ 1. 안 A (Recommended)', '   2. 안 B']),
  out(['⏺ 선택', ' ❯ 1. 안 A', '   2. 안 B (권장)']),
  out(['⏺ 선택', ' ❯ 1. 안 A', '   2. 안 B']),
  out(['⏺ push 할까요', ' ❯ 1. 예 (Recommended)', '   2. 아니오']),
  out(['⏺ 배포할까요', ' ❯ 1. 예 (추천)', '   2. 아니오']),
];
const FIX = ['prompt-permission.txt', 'prompt-question.txt'].map(fxText);
const NONE = [out(['조정 중', '❯ ']), fxText('claude-empty-bare-named.txt'), out([''])];

function screenFor(rng) {
  const k = rng.pick(['perm', 'perm', 'perm', 'perm', 'perm', 'perm', 'perm', 'perm', 'perm', 'trust', 'usage', 'question', 'choice', 'fixture', 'none']);
  if (k === 'perm') return { k, text: permScreen(rng) };
  if (k === 'trust') return { k, text: rng.pick(TRUSTS) };
  if (k === 'usage') return { k, text: rng.pick(USAGES) };
  if (k === 'question') return { k, text: rng.pick(QUESTIONS) };
  if (k === 'choice') return { k, text: rng.pick(CHOICES) };
  if (k === 'fixture') return { k, text: rng.pick(FIX) };
  return { k, text: rng.pick(NONE) };
}

// ---------- 세계 ----------
const STATE = (lane, handle, wt, spawned) => JSON.stringify({ schema: 1, run: { id: 'r1', coordinator: { name: 'c', session_id: 'aaaa1111-0000', pid: 0 } },
  lanes: { [lane]: { session: { handle, kind: 'claude', ...(spawned ? { spawned_by: 'coordinator' } : {}) }, ...(wt === undefined ? {} : { worktree: wt }), state: 'active' } }, approvals: [] });
const CFGS = [
  { auto_allow: ['read', 'status'], auto_allow_spawned: ['read', 'status'] },
  { auto_allow: ['read', 'status', 'commit-own', 'edit-own', 'heavy-build'], auto_allow_spawned: ['read', 'status', 'commit-own', 'edit-own', 'heavy-build'] },
  { auto_allow: ['read', 'status'], auto_allow_spawned: ['read', 'status', 'commit-own', 'edit-own', 'heavy-build'] },
  { auto_allow: [], auto_allow_spawned: [] },
  { auto_allow: ['status'] },
  {},
];
const cfgJson = (a) => JSON.stringify({ state_dir: 'state', terminal_backend: 'orca', office: { enabled: false }, approvals: a });

function baseFiles({ screen, screen2 = null, screen3 = null, handleTerm = 'hk=@REPO/wt', send = 'accepted', cfg, state, extra = {} }) {
  const files = {
    '.coord.local.json': cfgJson(cfg), 'bin/orca': exe(FAKE_ORCA), 'bin/date': exe(FAKE_DATE), 'bin/sleep': exe(FAKE_SLEEP),
    'fake/terms': handleTerm, 'fake/idle': 'true', 'fake/send': send, 'fake/orca.log': '', 'fake/screens/hk.txt': screen,
    ...(state ? { 'state/r1/state.json': state } : {}), ...extra,
  };
  if (screen2 !== null) files['fake/screens/hk.2.txt'] = screen2;
  if (screen3 !== null) files['fake/screens/hk.3.txt'] = screen3;
  return files;
}

function gen(rng) {
  const clk = clock();
  const sc = screenFor(rng);
  let screen2 = null, screen3 = null;
  if (rng.chance(0.12)) screen2 = rng.pick([screenFor(rng).text, sc.text.replace('git status', 'rm -rf x'), '', sc.text + 'x\n']);   // 판정 뒤 창이 바뀐다
  if (rng.chance(0.3)) screen3 = rng.pick([sc.text, out(['조정 중', '❯ '])]);
  const lane = 'kit';
  const wt = rng.pick(['/srv/lane/kit', '/srv/lane/kit', '/srv/lane/kit/', 'wt/kit', '', null, undefined]);
  const spawned = rng.chance(0.5);
  const state = rng.chance(0.93) ? STATE(lane, 'hk', wt, spawned) : undefined;
  const env = { ...BASE_ENV, ...clk.env, LC_ALL: rng.pick(['C', 'C', 'C', 'en_US.UTF-8']) };
  if (state) env.COORD_RUN = 'r1';
  const extra = {};
  const lockLive = rng.chance(0.04);
  if (lockLive) { extra['console/lock/lane-kit/pid'] = `${process.pid}\n`; env.COORD_CONSOLE_LANE_LOCK_WAIT_S = '1'; }
  if (rng.chance(0.05)) extra['console/lock/lane-kit.sent'] = `${Math.floor(clk.ms / 1000) - 1} -\n`;
  const term = rng.pick(['hk=@REPO/wt', 'hk=@REPO/wt', 'hk=@REPO', 'hk=/elsewhere/x', 'hk', 'hk=@REPO/.claude/worktrees/a']);
  const files = baseFiles({ screen: sc.text, screen2, screen3, handleTerm: rng.chance(0.03) ? 'hk h2' : term, send: rng.pick(['accepted', 'accepted', 'accepted', 'turn_started', 'stale', 'error']), cfg: rng.pick(CFGS), state, extra });
  const args = [];
  const by = rng.pick(['lane', 'lane', 'lane', 'lane', 'handle', 'handle', 'both']);
  if (by !== 'handle') args.push('--lane', rng.chance(0.03) ? rng.pick(['nolane', '../x']) : lane);
  if (by !== 'lane') args.push('--handle', rng.chance(0.05) ? 'h9' : 'hk');
  if (rng.chance(0.2)) args.push('--dry-run');
  if (rng.chance(0.03)) args.push(rng.pick(['--bogus', '-h', 'positional']));
  return { args, stdin: '', files, env };
}

// ---------- 고정 사례 ----------
function fixedCases() {
  const clk = clock();
  const cases = [];
  const FULL = ['read', 'status', 'commit-own', 'edit-own', 'heavy-build'];
  const mk = (label, screen, { a = ['--lane', 'kit'], cfg = { auto_allow: FULL, auto_allow_spawned: FULL }, spawned = false, wt = '/srv/lane/kit', term = 'hk=@REPO/wt', screen2 = null, screen3 = null, send = 'accepted', env = {} } = {}) => {
    cases.push({ label, args: a, stdin: '', files: baseFiles({ screen, screen2, screen3, handleTerm: term, send, cfg, state: STATE('kit', 'hk', wt, spawned) }), env: { ...BASE_ENV, ...clk.env, COORD_RUN: 'r1', ...env } });
  };
  const body = (...b) => permWin({ body: b });
  // 거부 정규식 가지별(권한 창 + 허용 범주 전부 켠 설정이라 DENY 가 아니면 ANSWER 또는 ESCALATE 가 나온다)
  for (const [name, pos, neg] of DENY_CASES) {
    for (const c of pos) mk(`거부 칸 ${name}: 걸림 ${JSON.stringify(c)}`, body(c));
    for (const c of neg) mk(`거부 칸 ${name}: 안 걸림 ${JSON.stringify(c)}`, body(c));
  }
  // 질문 줄도 거부 정규식 대상
  mk('질문 줄 settings.json → DENY', permWin({ tool: ' Edit file', q: ' Do you want to make this edit to settings.json?', body: ['const a = 1'] }));
  mk('질문 줄 무해 편집 → ESCALATE not-proceed', permWin({ tool: ' Edit file', q: ' Do you want to make this edit to app.ts?', body: ['const a = 1'] }));
  // console-keys.sh §14 의 창 모양 사례
  mk('정상 창(git status) → ANSWER 1', body('git status'));
  mk('상자 모양 정상 창', out(['⏺ 작업', `╭${'─'.repeat(40)}╮`, '│ Bash command                            │', '│                                         │', '│   git status                            │', '│                                         │', '│ Do you want to proceed?                 │', '│ ❯ 1. Yes                                │', '│   2. No                                 │', `╰${'─'.repeat(40)}╯`]));
  mk('제목 괄호 변형 정상 창', permWin({ tool: ' Bash command (unsandboxed)' }));
  mk('설명 줄이 있는 창 → ESCALATE', body('git status', 'Show working tree status'));
  mk('A1 본문 줄 끝 command → DENY', body('git push --force origin main; echo command', 'git status'));
  mk('A3 본문에 Do you want to proceed? → DENY', body('rm -rf ~/work', 'echo "Do you want to proceed?"', 'ls'));
  mk('B 가짜 권한 창 기록 + 진짜 settings.json 편집 창 → DENY', out(['⏺ Bash(cat notes.txt)', `  ⎿  ${'─'.repeat(40)}`, '      Bash command', '      git status', '      Do you want to proceed?', '      ❯ 1. Yes', '        2. No', '', RULE, ' Edit file', ' .claude/settings.json', '╌╌╌╌╌╌╌╌╌╌╌╌', '   1 -  "allow": []', '   1 +  "allow": ["Bash(*)"]', '╌╌╌╌╌╌╌╌╌╌╌╌', ' Do you want to make this edit to settings.json?', ' ❯ 1. Yes', '   2. Yes, allow all edits during this session (shift+tab)', '   3. No, and tell Claude what to do differently (esc)']));
  mk('B 본문 속 가짜 질문·선택지 → window-shape', permWin({ body: ['echo hi', 'Do you want to proceed?', '1. Yes', 'python3 evil.py'], indent: '   ' }));
  mk('C2 들여쓰기 0 가로줄 다음이 도구 이름이 아님 → no-fingerprint', out(['⏺ 작업', '', RULE, ' Bash command', '', '   rm -rf ~/work', RULE, '   ls', '', ' Do you want to proceed?', ' ❯ 1. Yes', '   2. No']));
  mk('C4 위험 명령 뒤 다른 창 머리 복제 → DENY', permWin({ body: ['rm -rf ~/work', RULE, 'Bash command', '', 'git status'] }));
  mk('46줄 명령 + 본문 가로줄 → 80줄 읽기로는 지문 있음', permWin({ body: ['git status', ...Array.from({ length: 44 }, (_, i) => (i === 29 ? RULE : `--opt${i} v${i}`))] }));
  mk('권한 창 머리 밀림 → no-fingerprint', permWin({ body: ['git status', ...Array.from({ length: 90 }, (_, i) => `--opt${i} v${i}`)] }));
  // kind 별 창
  TRUSTS.forEach((t, i) => mk(`trust #${i} (리포 안)`, t));
  mk('trust: 리포 밖 폴더 → ESCALATE outside-repo', TRUSTS[0], { term: 'hk=/elsewhere/x' });
  mk('trust: 폴더를 모름(wt 사용)', TRUSTS[0], { term: 'hk', wt: '/srv/lane/kit' });
  USAGES.forEach((t, i) => mk(`usage-limit #${i}`, t));
  QUESTIONS.forEach((t, i) => mk(`question #${i}`, t));
  CHOICES.forEach((t, i) => mk(`choice #${i}`, t));
  mk('실제 샘플 권한 창(rm -rf + API 키) → DENY', fxText('prompt-permission.txt'));
  mk('실제 샘플 질문 창', fxText('prompt-question.txt'));
  mk('창 없음 → NONE', NONE[0]);
  // 판정 뒤 창이 바뀜 / 잠금 / dry-run / send 실패
  mk('보내기 직전 창이 바뀜(같은 kind 다른 내용) → NONE', body('git status'), { screen2: body('git status ') });
  mk('보내기 직전 창이 사라짐 → NONE', body('git status'), { screen2: out(['조정 중', '❯ ']) });
  mk('보낸 뒤에도 창이 남음(경고만)', body('git status'), { screen3: body('git status') });
  mk('--dry-run → DRY ANSWER', body('git status'), { a: ['--lane', 'kit', '--dry-run'] });
  mk('--dry-run DENY', body('rm x'), { a: ['--lane', 'kit', '--dry-run'] });
  mk('send stale', body('git status'), { send: 'stale' });
  mk('--handle 만(레인을 state 에서 찾음)', body('git status'), { a: ['--handle', 'hk'] });
  mk('--handle 이 state 에 없음', body('git status'), { a: ['--handle', 'hx'], term: 'hx=@REPO/wt' });
  mk('spawned_by=coordinator 는 auto_allow_spawned', body('git add .'), { cfg: { auto_allow: ['read'], auto_allow_spawned: ['commit-own'] }, spawned: true });
  mk('일반 세션은 auto_allow', body('git add .'), { cfg: { auto_allow: ['read'], auto_allow_spawned: ['commit-own'] }, spawned: false });
  mk('허용 범주 없음 → ESCALATE', body('git status'), { cfg: { auto_allow: [] } });
  // 사용법
  mk('사용법: 모르는 인자', body('git status'), { a: ['--bogus'] });
  mk('사용법: handle 없음', body('git status'), { a: [] });
  mk('도움말', body('git status'), { a: ['-h'] });
  return cases;
}

export default {
  module: 'auto-answer',
  kind: 'script',
  sh: 'tests/js-parity/fixtures/auto-answer-parity.sh',
  mjs: 'tests/js-parity/fixtures/auto-answer-parity.mjs',
  switchEnv: 'COORD_JS_AUTO_ANSWER',
  functions: {
    run: { shArgs: (c) => c.args, gen, fixed: fixedCases, compareFiles: false },
  },
};
