// scripts/lib/common.sh ↔ common.mjs 대조 명세(스위치 COORD_JS_COMMON). 함수마다 무작위 생성기 + 기존 bash 시험에서 옮긴 고정 사례(fixed).
//   · 설정/상태 파일은 사례마다 작업 폴더에 만든다(COORD_REPO=<WORK>, COORD_STATE_ROOT=<WORK>/sr). 환경의 COORD_* 는 지운다.
//   · 시계가 낀 함수(now_*·file_mtime)는 숫자를 지워 모양만 비교한다.
//   · coord_lock 은 주인 pid 파일이 두 판에서 다르므로(bash 셸 $$ ↔ node 의 부모) 파일 비교를 끄고 종료 코드·출력만 본다. 잠금 의미 시험은 tests/common.test.mjs.
import { gen } from '../gen.mjs';

const SH = 'scripts/lib/common.sh';
const CLEAN = { COORD_REPO: '', COORD_RUN: '', COORD_STATE_ROOT: '', _COORD_CFG: '', _COORD_CFG_MINE: '', _COORD_CFG_SRC: '', COORD_LOCK_STALE_S: '', COORD_DRY: '', COMPAT_FORCE_OS: '', COMPAT_FORCE_USERLAND: '', LC_ALL: 'C' };   // LC_ALL=C: bash 글롭 정렬이 로캘을 따르므로 고정(node 판은 늘 코드 단위 순서)

// ---------- 무작위 JSON 글 ----------
const KEYS = ['alpha', 'b_c', 'Zed', 'd1', 'x9', 'and', 'if', '_u', 'under_score', 'k_', 'A_B', '1000000', '9lives', 'heavy', 'state_dir'];
const WEIRD = ['한글', 'a-b', 'a.b', '@x'];
const SCALARS = ['0', '1', '-5', '1.0', '1.50', '1e3', '-0.5', '12345678901234567890', '0.1', 'true', 'false', 'null', '""', '"s"', '"한글\\n줄"', '"a b"', '"~/p"', '"tab\\tq\\"uote"', '"\\u007f\\u0001"'];
function jval(rng, depth, weird) {
  const r = rng.next();
  if (depth <= 0 || r < 0.5) return rng.pick(SCALARS);
  if (r < 0.62) return `[${Array.from({ length: rng.int(0, 3) }, () => jval(rng, depth - 1, weird)).join(',')}]`;
  return jobj(rng, depth - 1, weird);
}
function jobj(rng, depth, weird) {
  const used = new Set(), parts = [];
  for (let i = rng.int(0, 4); i > 0; i--) {
    const k = weird && rng.chance(0.15) ? rng.pick(WEIRD) : rng.pick(KEYS);
    if (used.has(k)) continue;
    used.add(k);
    parts.push(`"${k}":${jval(rng, depth, weird)}`);
  }
  return `{${parts.join(rng.chance(0.3) ? ', ' : ',')}}`;
}
/** 글 안의 객체 경로(.a.b …)를 모두 모은다(단순 식별자 키만) */
function pathsOf(text) {
  const out = [];
  try {
    const walk = (v, p) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, e] of Object.entries(v)) { const q = `${p}.${k}`; out.push(q); walk(e, q); }
    };
    walk(JSON.parse(text), '');
  } catch { /* 깨진 글 */ }
  return out.filter((p) => /^[.A-Za-z0-9_]+$/.test(p));
}

const DEFAULT_PATHS = ['.state_dir', '.integration_branch', '.heavy.load_soft', '.heavy.script', '.heavy.measure_dir', '.usage.bands.Y.five', '.usage.bands', '.usage.sources', '.workflow.model_table', '.workflow.escalation.ladder',
  '.glm.timeout_s', '.launch', '.launch.opencode', '.tasks_root', '.records_check', '.integration_check', '.console.keys_enabled', '.approvals.screen_cache_s', '.sessions_dir', '.restart_rules', '.wake_targets', '.nonexistent', '.nonexistent.deep.x', '.state_dir.x', '.coordinator.model'];
const EXPRS = ['.usage.sources[0].path', '.workflow.agents_by_band|keys', '.launch.claude // "x"', '.workflow.model_table|length', '..', '.[]|numbers', '.heavy|keys[]', '.compact.by_window."1000000".pct', '.compact.by_window.1000000', '.a[', 'keys', '.usage.sources[]|.kind', '.state_dir|ascii_upcase', '.tick.cron|split(" ")|.[0]', '. | tojson'];

function cfgCase(rng, kind) {
  const files = {};
  let shared = '', local = '', paths = [];
  const mode = rng.int(0, 9);
  if (mode >= 1) { shared = rng.chance(0.08) ? rng.pick(['{', '[1]', '5', 'null', '"x"', '{"a":1}{"b":2}', '{} []']) : jobj(rng, 3, true); files['.coord.json'] = rng.chance(0.2) ? shared + '\n' : shared; paths.push(...pathsOf(shared)); }
  if (mode >= 5) { local = rng.chance(0.06) ? rng.pick(['{"a":', '[]', '3']) : jobj(rng, 3, true); files['.coord.local.json'] = local; paths.push(...pathsOf(local)); }
  const env = { COORD_REPO: '<WORK>' };
  if (rng.chance(0.07)) env._COORD_CFG = rng.pick(['{"terminal_backend":"tmux"}', jobj(rng, 2, false), '{"a":{"b":""}}', 'not json', '[1,2]', '"str"']);
  const pool = [...paths, ...DEFAULT_PATHS];
  const path = rng.chance(0.15) ? rng.pick(EXPRS) : rng.pick(pool);
  return { args: kind === 'all' ? [] : [path], files, env, stdin: '' };
}

// ---------- 상태 글 ----------
const SIDS = ['"abcdef123456"', '"ABC-def_12345678xyz"', '""', 'null', '123456789', '"한글session1"', '{"a":1}', '"  x y z"', '"abcdefgh"', '"ZZ"', 'false'];
const PIDS = ['4242', '0', 'null', '"77"', '"0"', '1.5', '""', '0.0', 'false'];
const RIDS = ['"r1"', '"a/b c\\td"', '""', 'null', '"한글 회차"', '12', '"run-2026"'];
const STATES = ['"active"', '"closed"', '"closing"', '"hold"', 'null', '3', '""'];
function stateDoc(rng) {
  const r = rng.next();
  if (r < 0.05) return rng.pick(['{', '', '[]', '5', 'null', '"s"', '{"run":[]}', '{"run":{"coordinator":5}}', '{"lanes":"x"}', '{"lanes":[{"state":"closed"},{}]}', '{"lanes":{"a":5}}']);
  const lanes = [];
  for (let i = rng.int(0, 4); i > 0; i--) lanes.push(`"${rng.pick(['a', 'b', 'c-1', '한', 'x y', 'd'])}":${rng.chance(0.05) ? rng.pick(['null', '7', '"s"']) : `{"state":${rng.pick(STATES)},"hold":${rng.pick(['null', '"h"', 'false', '0'])}}`}`);
  const dedup = [...new Map(lanes.map((l) => [l.slice(0, l.indexOf('":')), l])).values()];
  const run = `"run":{"id":${rng.pick(RIDS)},"coordinator":{"session_id":${rng.pick(SIDS)},"pid":${rng.pick(PIDS)}},"closed_at":${rng.pick(['null', '"2026-10-09T01:00:00+09:00"', 'false', '0'])}}`;
  const parts = [run, `"office":{"finished":${rng.pick(['true', 'false', 'null', '"true"', '1'])}}`, `"lanes":{${dedup.join(',')}}`, `"merge":{"in_flight":{"lane":${rng.pick(['null', '"a"', '"b"', '"d"', '5'])}}}`];
  if (rng.chance(0.15)) parts.splice(rng.int(0, parts.length - 1), 1);
  return `{${parts.join(',')}}`;
}
const stateCase = (rng) => ({ doc: stateDoc(rng) });

const RUN_IDS = ['r1', 'run-2', '한글', 'a b', '.hidden', 'z9', 'R2'];
function runsCase(rng, extra = {}) {
  const files = {}, ids = [];
  for (let i = rng.int(0, 4); i > 0; i--) { const id = rng.pick(RUN_IDS); if (!ids.includes(id)) ids.push(id); }
  for (const id of ids) if (rng.chance(0.9)) files[`sr/${id}/state.json`] = stateDoc(rng);
  if (rng.chance(0.15)) files['sr/loose.txt'] = 'x';
  const env = { COORD_REPO: '<WORK>', COORD_STATE_ROOT: '<WORK>/sr', ...(extra.env || {}) };
  if (extra.current !== false && rng.chance(0.5) && ids.length) files['sr/current'] = rng.pick([`${rng.pick(ids)}\n`, `${rng.pick(ids)}`, '\n', '', 'nope\nsecond\n']);
  return { files, env, ids };
}

// ---------- 시각 ----------
function isoText(rng) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const Y = rng.pick([1969, 1970, 2000, 2024, 2026, 2038, 2100, 1999]), M = rng.pick([0, 1, 2, 2, 6, 12, 13]), D = rng.pick([0, 1, 15, 28, 29, 30, 31, 32]);
  const h = rng.pick([0, 9, 23, 24]), mi = rng.pick([0, 30, 59, 60]), s = rng.pick([0, 1, 59, 60]);
  const tz = rng.pick(['Z', '+09:00', '-05:30', '+00:00', '+23:59', '+24:00', '+09:99', '+0900', '', 'z', ' UTC']);
  const frac = rng.pick(['', '', '.5', '.123456', '.']);
  let t = `${pad(Y, 4)}-${pad(M)}-${pad(D)}T${pad(h)}:${pad(mi)}:${pad(s)}${frac}${tz}`;
  const r = rng.next();
  if (r < 0.08) t = t.replace(/:\d\d(\.\d+)?(Z|[+-].*|)$/, '$2');       // 초 없는 꼴(loose 가 받는 것)
  else if (r < 0.12) t = rng.pick(['', 'null', 'garbage', '2026-10-09', '2026-10-09T10:00:00+09:00\n', '  2026-10-09T10:00:00Z', '2026-1-9T1:2:3Z', '2026-10-09 10:00:00Z']);
  return t;
}
const EPOCHS = ['0', '1', '86399', '1791507600', '1700000000', '4102444800', '99999999999', '123456789012', '-1', '1.5', 'abc', '', 'null', '0x10', '+5', ' 7', '00012'];

const digitsToN = (buf) => Buffer.from(buf.toString('latin1').replace(/[0-9]/g, 'N'), 'latin1');
const baseToTag = (buf) => Buffer.from(buf.toString('latin1').replace(/(?:\/private)?[^\s'"]*?\/jsparity-(?:sh|js|swon)-\w{6}/g, '<BASE>'), 'latin1');

// ---------- 화면 ----------
const PHRASES = ['trust the files in this folder', 'one you trust', 'What do you want to do?', 'Wait for limit to reset', 'Wait here, then continue', 'Usage limit reached', 'Stop and wait',
  'Do you want to proceed?', 'will automatically deny this request', 'Esc to cancel · Tab to amend', 'Enter to select', '↑/↓ to navigate', 'Arrow keys to navigate', '❯ 1. Yes', '❯ 1.'];
function screenBuf(rng, i) {
  const base = gen('screen')(rng, i).stdin;
  const lines = Buffer.from(base).toString('latin1').split('\n');
  const n = rng.int(0, 3);
  for (let k = 0; k < n; k++) {
    const phrase = Buffer.from(rng.pick(PHRASES), 'utf8').toString('latin1');
    const at = rng.chance(0.5) ? lines.length : rng.int(0, lines.length);
    lines.splice(at, 0, rng.chance(0.3) ? `${phrase} ${Buffer.from(rng.pick(PHRASES), 'utf8').toString('latin1')}` : phrase);
  }
  if (rng.chance(0.2)) for (let k = rng.int(1, 40); k > 0; k--) lines.push('');
  return Buffer.from(lines.join('\n'), 'latin1');
}

// ---------- 경로 ----------
const PATHS = ['/a/b', '/a/b/', '/a/b/.', '/a/b//', 'rel/x', 'rel', '.', './x', '', 'null', '~', '~/w', '~x', 'C:/w/r', 'C:\\w\\r', '/c/Users/x/wt', 'C:/Users/X/WT/', '\\\\srv\\sh', '/', '/a/b/.claude/worktrees/w1', '/A/B', '한글/경로'];

const OSES = ['', '', 'windows', 'unix'];

export default {
  module: 'common',
  sh: SH,
  mjs: 'scripts/lib/common.mjs',
  source: ['scripts/lib/compat.sh'],
  switchEnv: 'COORD_JS_COMMON',
  env: CLEAN,
  normalize: baseToTag,
  functions: {
    coord_expand: { js: ['coord_expand'], gen: (rng) => ({ args: [rng.pick(['~', '~/x', '~x', '', 'a/~/b', '~/', '/abs', '~/한글 b', '~//x'])], stdin: '' }) },

    coord_repo: {
      js: ['coord_repo'],
      gen: (rng) => {
        const r = rng.next();
        if (r < 0.4) return { args: [], env: { COORD_REPO: rng.pick(['/x/y', 'C:/x', '/', '<WORK>', '한글']) }, stdin: '' };
        if (r < 0.7) return { args: [], files: {}, stdin: '' };
        return { args: [], files: { '.git/HEAD': 'ref: refs/heads/main\n', '.git/objects/x': '', '.git/refs/x': '' }, stdin: '' };
      },
    },

    coord_cfg: {
      js: ['coord_cfg'],
      fixed: [
        { label: 'screen-cache.sh: 기본값 approvals.screen_cache_s', args: ['.approvals.screen_cache_s'], stdin: '' },
        { label: '빈 문자열 값은 표에서 아무것도 안 낸다', args: ['.integration_check'], stdin: '' },
        { label: '객체 경로는 jq 로(compact)', args: ['.launch'], stdin: '' },
        { label: '덮어쓴 설정은 표를 안 쓴다', args: ['.terminal_backend'], env: { _COORD_CFG: '{"terminal_backend":"tmux"}' }, stdin: '' },
        { label: '덮어쓴 설정의 빈 문자열은 빈 줄', args: ['.a.b'], env: { _COORD_CFG: '{"a":{"b":""}}' }, stdin: '' },
      ],
      gen: (rng) => cfgCase(rng, 'cfg'),
    },
    coord_cfg_json: { js: ['coord_cfg_json'], gen: (rng) => cfgCase(rng, 'json') },
    coord_cfg_all: { js: ['coord_cfg_all'], gen: (rng) => cfgCase(rng, 'all') },

    coord_state_root: {
      js: ['coord_state_root'],
      gen: (rng) => {
        const c = cfgCase(rng, 'all');
        c.env.COORD_STATE_ROOT = rng.pick(['', '', '~/sr', '/abs/sr', '~', '<WORK>/sr']);
        if (rng.chance(0.4)) c.files['.coord.local.json'] = `{"state_dir":${rng.pick(['"~/.x"', '"/tmp/s"', '""', 'null', '"~"', '5', '{"a":1}'])}}`;
        return c;
      },
    },

    coord_sess8: {
      js: ['coord_sess8'],
      gen: (rng) => {
        const c = stateCase(rng);
        return { args: [rng.chance(0.05) ? 'missing.json' : 'st.json'], files: { 'st.json': c.doc }, stdin: '' };
      },
    },

    coord_runs_summary: {
      js: ['coord_runs_summary'],
      gen: (rng) => { const c = runsCase(rng); return { args: rng.chance(0.5) ? [] : [rng.pick(c.ids.length ? c.ids : ['r1']), rng.pick(['a', 'b', 'd', '한', ''])], files: c.files, env: c.env, stdin: '' }; },
    },
    coord_stale_runs: {
      js: ['coord_stale_runs'],
      gen: (rng) => { const c = runsCase(rng); return { args: rng.chance(0.5) ? [] : [rng.pick(c.ids.length ? c.ids : ['r1'])], files: c.files, env: c.env, stdin: '' }; },
    },

    coord_run_id: {
      js: ['coord_run_id'],
      gen: (rng) => {
        const c = runsCase(rng);
        if (rng.chance(0.3)) c.env.COORD_RUN = rng.pick(['envrun', 'a b']);
        return { args: rng.chance(0.2) ? [rng.pick(['argrun', '한글'])] : [], files: c.files, env: c.env, stdin: '' };
      },
    },
    coord_run_dir: {
      js: ['coord_run_dir'],
      gen: (rng) => { const c = runsCase(rng); if (rng.chance(0.2)) c.env.COORD_RUN = 'envrun'; return { args: rng.chance(0.2) ? ['argrun'] : [], files: c.files, env: c.env, stdin: '' }; },
    },
    coord_state_file: {
      js: ['coord_state_file'],
      gen: (rng) => { const c = runsCase(rng); if (rng.chance(0.2)) c.env.COORD_RUN = 'envrun'; return { args: rng.chance(0.2) ? ['argrun'] : [], files: c.files, env: c.env, stdin: '' }; },
    },
    coord_has_run: {
      js: ['coord_has_run'],
      gen: (rng) => { const c = runsCase(rng); if (rng.chance(0.2)) c.env.COORD_RUN = rng.pick(c.ids.length ? c.ids : ['r1']); return { args: [], files: c.files, env: c.env, stdin: '' }; },
    },
    coord_state: {
      js: ['coord_state'],
      gen: (rng) => {
        const c = runsCase(rng);
        if (c.ids.length) c.env.COORD_RUN = rng.pick(c.ids);
        return { args: [rng.pick(['.run.id', '.lanes|keys[]', '.office', '.nope', '.run.coordinator.pid', '.lanes | length', '.['])], files: c.files, env: c.env, stdin: '' };
      },
    },
    coord_lane_get: {
      js: ['coord_lane_get'],
      gen: (rng) => {
        const c = runsCase(rng);
        if (c.ids.length) c.env.COORD_RUN = rng.pick(c.ids);
        return { args: [rng.pick(['a', 'b', 'c-1', '한', 'x y', 'zz']), ...(rng.chance(0.15) ? [] : [rng.pick(['.state', '.hold', '.state.x', '', '.session.handle', '.a.b', '|keys', ' | .state?'])])], files: c.files, env: c.env, stdin: '' };
      },
    },

    coord_now_epoch: { js: ['coord_now_epoch'], normalize: digitsToN, gen: () => ({ args: [], stdin: '' }) },
    coord_now_iso: { js: ['coord_now_iso'], normalize: digitsToN, gen: () => ({ args: [], stdin: '' }) },
    coord_epoch_to_hm: { js: ['coord_epoch_to_hm'], gen: (rng) => ({ args: [rng.pick(EPOCHS)], stdin: '' }) },
    coord_epoch_to_iso: { js: ['coord_epoch_to_iso'], gen: (rng) => ({ args: [rng.pick(EPOCHS)], env: rng.chance(0.4) ? { TZ: rng.pick(['Asia/Seoul', 'America/New_York', 'UTC']) } : {}, stdin: '' }) },
    coord_iso_to_epoch: {
      js: ['coord_iso_to_epoch'],
      fixed: [
        { label: '+09:00', args: ['2026-10-09T10:00:00+09:00'], stdin: '' },
        { label: 'Z 와 소수초', args: ['2026-10-09T01:00:00.123Z'], stdin: '' },
        { label: '윤일', args: ['2024-02-29T00:00:00Z'], stdin: '' },
        { label: '시간대 없음(date 길)', args: ['2026-10-09T10:00:00'], stdin: '' },
        { label: '범위 밖(date 길)', args: ['2026-13-09T10:00:00Z'], stdin: '' },
      ],
      gen: (rng) => ({ args: [isoText(rng)], env: rng.chance(0.3) ? { TZ: rng.pick(['Asia/Seoul', 'America/New_York']) } : {}, stdin: '' }),
    },
    coord_iso_to_epoch_loose: {
      js: ['coord_iso_to_epoch_loose'],
      fixed: [{ label: '초 없는 꼴', args: ['2026-10-04T13:00+09:00'], stdin: '' }],
      gen: (rng) => ({ args: [isoText(rng)], stdin: '' }),
    },
    coord_file_mtime: { js: ['coord_file_mtime'], normalize: digitsToN, gen: (rng) => ({ args: [rng.pick(['f.txt', 'missing', '.', 'd'])], files: { 'f.txt': 'x', 'd/g': 'y' }, stdin: '' }) },

    coord_lock: {
      js: ['coord_lock'],
      compareFiles: false,
      fixed: [
        { label: 'office-locks.sh: 잠그면 성공', args: ['<WORK>/a'], stdin: '' },
        { label: 'office-locks.sh: 죽은 주인의 잠금은 바로 탈취', args: ['<WORK>/c'], files: { 'c.lock/pid': '999999\n', 'c.lock/pstart': 'x\n' }, stdin: '' },
        { label: 'office-locks.sh: pid 없는 옛 형식 잠금도 오래되면(STALE_S=0) 탈취', args: ['<WORK>/e'], env: { COORD_LOCK_STALE_S: '0' }, files: { 'e.lock/x': '' }, stdin: '' },
      ],
      gen: (rng) => {
        const files = {}, env = {};
        const kind = rng.int(0, 4);
        if (kind === 1) files['k.lock/pid'] = `${rng.pick(['999999', '99999999999'])}\n`;       // 죽은 주인(숫자가 아닌 pid 는 오래될 때까지 안 뺏으므로 30초 기다리다 끝나 제외)
        if (kind === 2) { files['k.lock/pid'] = '999999\n'; env.COORD_LOCK_STALE_S = rng.pick(['0', 'x', '', '5']); }
        if (kind === 3) { files['k.lock/x'] = ''; env.COORD_LOCK_STALE_S = '0'; }
        return { args: ['<WORK>/k'], files, env, stdin: '' };
      },
    },
    coord_unlock: {
      js: ['coord_unlock'],
      fixed: [
        { label: 'office-locks.sh: 남(산 주인)의 잠금은 풀지 않는다', args: ['<WORK>/f'], files: { 'f.lock/pid': '1\n', 'f.lock/pstart': 'x\n' }, stdin: '' },
      ],
      gen: (rng) => {
        const files = {};
        const kind = rng.int(0, 3);
        if (kind === 1) files['k.lock/pid'] = '';
        if (kind === 2) files['k.lock/pid'] = `${rng.pick(['1', '999999', 'abc'])}\n`;
        if (kind === 3) { files['k.lock/pid'] = '\n'; files['k.lock/pstart'] = 'Mon Jan  1 00:00:00 2024\n'; files['k.lock/extra'] = 'x'; }
        return { args: ['<WORK>/k'], files, stdin: '' };
      },
    },

    coord_screen_prompt_kind: {
      js: ['coord_screen_prompt_kind'],
      fixed: PHRASES.map((p) => ({ label: `문구 ${p}`, args: [], stdin: `앞 줄\n${p}\n` })).concat([
        { label: '원문 순서가 반대면 아님', args: [], stdin: 'Wait for limit to reset\nWhat do you want to do?\n' },
        { label: '30줄보다 위의 문구는 무시', args: [], stdin: `Do you want to proceed?\n${'x\n'.repeat(30)}` },
        { label: '빈 입력', args: [], stdin: '' },
        // 진행 표시가 보이면 선택 창이 아니다(명령 본문에 「❯ 1. Yes / 2. No」 문자열이 있어도). 지난 턴 표시는 진행 표시가 아니다.
        { label: '오탐: 본문의 ❯ 1. + esc to interrupt', args: [], stdin: 'echo "❯ 1. Yes / 2. No"\n✻ Working… (esc to interrupt)\n' },
        { label: '오탐: 본문의 ❯ 1. + 스피너 경과 시간', args: [], stdin: 'echo "❯ 1. Yes"\n✶ …ing… (3m 59s · ↓ 1.2k tokens)\n' },
        { label: '오탐: 스피너 시간만(h·m·s)', args: [], stdin: '❯ 1. Yes\n✽ Thinking… (1h 2m 3s · x)\n' },
        { label: '진짜 choice(진행 표시 없음)', args: [], stdin: 'Pick one\n❯ 1. Yes\n  2. No\n' },
        { label: '지난 턴 표시 + 진짜 창은 choice', args: [], stdin: '✻ Cooked for 7s · done 12:17\nRunning 1 shell command\n❯ 1. Yes\n  2. No\n' },
        { label: '스피너 줄이 있어도 시간 괄호가 없으면 진행 아님', args: [], stdin: '✻ Cooked for 7s\n❯ 1. Yes\n' },
        { label: 'permission 은 진행 표시가 있어도 그대로', args: [], stdin: '✻ Working… (3s · x)\nDo you want to proceed?\n❯ 1. Yes\n' },
        { label: 'question 은 진행 표시가 있어도 그대로', args: [], stdin: '✶ …ing… (3s · x)\nEnter to select\n❯ 1. Yes\n' },
      ]),
      gen: (rng, i) => ({ args: [], stdin: screenBuf(rng, i) }),
    },

    coord_q: {
      js: ['coord_q'],
      gen: (rng) => ({ args: Array.from({ length: rng.int(0, 4) }, () => rng.pick(['', 'a', 'a b', "it's", 'x=1', '한글', 'a*b', '$x', '/p/q-r.s', 'a\nb', '%+,-:@_', '"', "'", 'a b c'])), stdin: '' }),
    },
    coord_pstart: { js: ['coord_pstart'], gen: (rng) => ({ args: [rng.pick(['1', '999999', '', 'abc', '0'])], stdin: '' }) },
    coord_wt_abs: {
      js: ['coord_wt_abs'],
      fixed: [{ label: 'compat.sh: Win C:/x 를 절대 경로로', args: ['C:/w/r'], env: { COMPAT_FORCE_OS: 'windows', COORD_REPO: '<WORK>' }, stdin: '' }],
      gen: (rng) => ({ args: [rng.pick(PATHS)], env: { COORD_REPO: rng.pick(['<WORK>', '/r/main', 'C:/Users/x/main']), COMPAT_FORCE_OS: rng.pick(OSES) }, stdin: '' }),
    },
    coord_path_in_wt: {
      js: ['coord_path_in_wt'],
      fixed: [
        { label: 'compat.sh: Win 두 꼴을 같게', args: ['/c/Users/x/wt/sub', 'C:/Users/x/wt'], env: { COMPAT_FORCE_OS: 'windows', COORD_REPO: '<WORK>' }, stdin: '' },
        { label: 'compat.sh: Win 대소문자 달라도 같은 폴더', args: ['/c/users/x/wt/sub', 'C:/Users/X/WT'], env: { COMPAT_FORCE_OS: 'windows', COORD_REPO: '<WORK>' }, stdin: '' },
        { label: 'compat.sh: Win 백슬래시 꼴', args: ['C:\\Users\\x\\wt\\sub', '/c/Users/x/wt'], env: { COMPAT_FORCE_OS: 'windows', COORD_REPO: '<WORK>' }, stdin: '' },
        { label: 'compat.sh: Win 워크트리 밖', args: ['C:\\Users\\x\\wt2', 'C:/Users/x/wt'], env: { COMPAT_FORCE_OS: 'windows', COORD_REPO: '<WORK>' }, stdin: '' },
        { label: 'compat.sh: 메인 체크아웃 안의 .claude/worktrees 는 뺀다', args: ['/c/Users/x/main/.claude/worktrees/w1', 'C:/Users/x/main'], env: { COMPAT_FORCE_OS: 'windows', COORD_REPO: 'C:/Users/x/main' }, stdin: '' },
      ],
      gen: (rng) => ({ args: [rng.pick(PATHS), rng.pick(PATHS)], env: { COORD_REPO: rng.pick(['<WORK>', '/a/b', '/a', 'C:/Users/x/main']), COMPAT_FORCE_OS: rng.pick(OSES) }, stdin: '' }),
    },
    coord_session_file: {
      js: ['coord_session_file'],
      gen: (rng) => {
        const files = {};
        for (const [n, d] of [['4242', '{"sessionId":"sid-a"}'], ['11', '{"sessionId":"sid-b"}'], ['x', '{"sessionId":5}'], ['y', '{"sessionId":null}'], ['z', '{']]) if (rng.chance(0.6)) files[`home/${rng.chance(0.1) ? 'alt' : '.claude/sessions'}/${n}.json`] = d;
        if (rng.chance(0.2)) files['.coord.local.json'] = '{"sessions_dir":"~/alt"}';
        return { args: [rng.pick(['4242', '11', '0', 'null', '', '99']), rng.pick(['sid-a', 'sid-b', '5', '', 'null', 'none'])], files, env: { COORD_REPO: '<WORK>' }, stdin: '' };
      },
    },
    coord_pid_alive: { js: ['coord_pid_alive'], gen: (rng) => ({ args: [rng.pick(['', '0', 'null', '1', '999999', 'abc', '1 2', '99999999999'])], stdin: '' }) },
    coord_proc_cwds: { js: ['coord_proc_cwds'], gen: (rng) => ({ args: [rng.pick(['', '999999', '999998,999999'])], stdin: '' }) },
  },
};
