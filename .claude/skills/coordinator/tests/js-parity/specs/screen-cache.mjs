// scripts/lib/screen-cache.sh ↔ screen-cache.mjs 대조 명세(스위치 COORD_JS_SCREEN_CACHE).
// HOME 아래 상태 트리는 사례별 임시 HOME에 만든다(home/.dflow/…). DFLOW_CONSOLE_DIR 로도 가리킬 수 있다.
// 믿음 검사(_sc_trusted)의 700/600 모드는 하니스 files 로 디렉터리 모드를 못 맞추므로,
// 성공 경로는 COMPAT_FORCE_OS=windows(링크·종류 검사만)로, 실패 경로는 unix 로 본다.
// 윈도우 모드에서 bash 판이 부르는 jq 는 _shared/bin 래퍼에 걸리므로 SKILLS_JQ_EXE 로 실측 jq 를 가리킨다
// (래퍼 주석: 시험에서 윈도우를 흉내 낼 때 mac 의 jq 를 가리킨다).
import { execSync } from 'node:child_process';
let REAL_JQ = '';
try { REAL_JQ = execSync('command -v jq', { encoding: 'utf8' }).trim(); } catch { /* 없음 */ }
// 시각: sc_now_ms 출력은 N 으로 가리고, 경계 근처 시각은 만들지 않는다(brief 8.3).
const SH = 'scripts/lib/screen-cache.sh';
const MJS = 'scripts/lib/screen-cache.mjs';

const digitsToN = (buf) => Buffer.from(buf.toString('latin1').replace(/[0-9]/g, 'N'), 'latin1');
const infoTimeToN = (buf) => {
  const parts = buf.toString('latin1').split(' ');
  if (parts.length === 4) parts[2] = parts[2].replace(/[0-9]/g, 'N');
  return Buffer.from(parts.join(' '), 'latin1');
};

// kind별 화면(마지막 40줄 판정과 일치해야 load가 적중한다)
const SCREENS = {
  permission: 'out1\nDo you want to proceed?\n',
  question: 'out1\nEnter to select\n',
  choice: 'out1\n❯ 1. Yes\n',
  'usage-limit': 'What do you want to do?\nWait for limit to reset\n',
  trust: 'trust the files in this folder\n',
  null: 'just some output\nno prompt here\n',
};
const KINDS = Object.keys(SCREENS);
const HEX64 = 'ab'.repeat(32);
const nowMs = () => Date.now();
const awkNR = (s) => {
  if (s === '') return 0;
  const n = (s.match(/\n/g) || []).length;
  return s.endsWith('\n') ? n : n + 1;
};
const WIN = { COMPAT_FORCE_OS: 'windows', SKILLS_JQ_EXE: REAL_JQ };
const UX = { COMPAT_FORCE_OS: 'unix' };

function cacheFiles(handle, txt, at, kind, full, mode = 0o600) {
  const key = handle.replaceAll(':', '=');
  const files = {};
  files[`home/.dflow/console/screen/${key}.txt`] = txt;
  const doc = { kind: kind === 'null' ? null : kind, read_at_ms: at, lines: awkNR(txt) };
  if (full !== undefined) doc.full = full;
  files[`home/.dflow/console/screen/${key}.json`] = { data: `${JSON.stringify(doc)}\n`, mode };
  return files;
}

export default {
  module: 'screen-cache',
  sh: SH,
  mjs: MJS,
  source: ['scripts/lib/compat.sh', 'scripts/lib/common.sh'],
  switchEnv: 'COORD_JS_SCREEN_CACHE',
  functions: {
    sc_dir: {
      js: ['sc_dir'],
      fixed: [
        { label: '기본 HOME 아래', args: [], stdin: '' },
        { label: 'DFLOW_CONSOLE_DIR 지정', args: [], env: { DFLOW_CONSOLE_DIR: '<WORK>/c' }, stdin: '' },
        { label: '빈 값도 기본값으로', args: [], env: { DFLOW_CONSOLE_DIR: '' }, stdin: '' },
      ],
      gen: (rng) => ({
        args: [],
        env: rng.chance(0.4) ? { DFLOW_CONSOLE_DIR: rng.pick(['<WORK>/c', '<WORK>/한글', '/abs']) } : {},
        stdin: '',
      }),
    },
    sc_ttl: {
      js: ['sc_ttl'],
      fixed: [
        { label: 'screen-cache.sh: 기본값 20', args: [], files: {}, env: { COORD_REPO: '<WORK>' }, stdin: '' },
        { label: '숫자가 아니면 20', args: [], files: { '.coord.json': '{"approvals":{"screen_cache_s":"x"}}' }, env: { COORD_REPO: '<WORK>' }, stdin: '' },
      ],
      gen: (rng) => ({
        args: [],
        files: rng.chance(0.5) ? { '.coord.json': `{"approvals":{"screen_cache_s":${rng.pick(['0', '5', '20', '60', '"x"', '""', 'null', '-3'])}}}` } : {},
        env: { COORD_REPO: '<WORK>' },
        stdin: '',
      }),
    },
    sc_key: {
      js: ['sc_key'],
      fixed: [
        { label: '콜론은 = 로', args: ['lane:1'], stdin: '' },
        { label: '앞 .은 거절', args: ['.hidden'], stdin: '' },
      ],
      gen: (rng) => ({
        args: [rng.pick(['h1', 'a:b:c', 'A.Z_9:-x', '', '.', '.a', 'a/b', 'a b', '한글', 'x'.repeat(rng.pick([1, 99, 100, 101])), 'a*b'])],
        stdin: '',
      }),
    },
    sc_now_ms: {
      js: ['sc_now_ms'],
      normalize: digitsToN,
      gen: () => ({ args: [], stdin: '' }),
    },
    sc_stat: {
      js: ['sc_stat'],
      normalize: infoTimeToN,
      gen: (rng) => ({ args: [rng.pick(['f.txt', 'missing', 'd'])], files: { 'f.txt': 'x', 'd/g': 'y' }, stdin: '' }),
    },
    sc_drop: {
      js: ['sc_drop'],
      fixed: [{ label: '캐시와 임시 파일을 지운다', args: ['h1'], files: { 'home/.dflow/console/screen/h1.txt': 'x', 'home/.dflow/console/screen/h1.json': '{}' }, stdin: '' }],
      gen: (rng) => ({
        args: [rng.pick(['h1', 'a:b', '.bad', 'missing', ''])],
        files: { 'home/.dflow/console/screen/h1.txt': 'x', 'home/.dflow/console/screen/h1.json': '{}' },
        stdin: '',
      }),
    },
    sc_clear: {
      js: ['sc_clear'],
      fixed: [{ label: '파일만 지우고 폴더는 둔다', args: [], files: { 'home/.dflow/console/screen/a.txt': 'x', 'home/.dflow/console/screen/sub/k': 'y' }, stdin: '' }],
      gen: (rng) => ({
        args: [],
        files: rng.chance(0.3) ? {} : { 'home/.dflow/console/screen/a.txt': 'x', 'home/.dflow/console/screen/.tmp.h.txt.1': 'y', 'home/.dflow/console/screen/sub/k': 'z' },
        stdin: '',
      }),
    },
    sc_store: {
      js: ['sc_store'],
      globals: ['SC_STORED_KIND'],
      fixed: [
        { label: 'screen-cache.sh: 판정을 남긴다', args: ['h1', '<WORK>/scr.txt', '1791500000000'], files: { 'scr.txt': SCREENS.permission }, stdin: '' },
        { label: '지문 포함', args: ['h1', '<WORK>/scr.txt', '1791500000000', HEX64], files: { 'scr.txt': SCREENS.choice }, stdin: '' },
      ],
      gen: (rng, i) => {
        // at이 숫자가 아니면 양쪽이 현재 시각을 써서 바이트가 달라진다(compareFiles는 함수 단위라
        // 사례별로 끌 수 없음). 그 경로는 단위 시험(screen-cache-js.test.mjs)으로 본다. 하니스는 숫자만.
        const kind = rng.pick(KINDS);
        const at = String(1791000000000 + i * 1000);
        return {
          args: ['h1', '<WORK>/scr.txt', at, ...(rng.chance(0.4) ? [rng.pick([HEX64, 'xyz', ''])]: [])],
          files: { 'scr.txt': SCREENS[kind] },
          stdin: '',
        };
      },
    },
    sc_prune: {
      js: ['sc_prune'],
      fixed: [{ label: '기본 10분: 방금 파일은 둔다', args: [], files: { 'home/.dflow/console/screen/a.txt': 'x' }, stdin: '' }],
      gen: (rng) => ({
        args: rng.chance(0.3) ? [] : [rng.pick(['10', 'abc', '', '-5'])],
        files: { 'home/.dflow/console/screen/a.txt': 'x' },
        stdin: '',
      }),
    },
    sc_sig: {
      js: ['sc_sig'],
      fixed: [
        { label: '믿을 수 있는 json 내용 그대로(윈도우 모드)', args: ['h1'], files: cacheFiles('h1', SCREENS.choice, 1791500000000, 'choice'), env: WIN, stdin: '' },
        { label: 'handle 검증 실패', args: ['.bad'], env: WIN, stdin: '' },
      ],
      gen: (rng) => {
        const kind = rng.pick(KINDS);
        const r = rng.next();
        if (r < 0.5) return { args: ['h1'], files: cacheFiles('h1', SCREENS[kind], 1791500000000, kind), env: WIN, stdin: '' };
        if (r < 0.6) return { args: ['h1'], files: cacheFiles('h1', SCREENS[kind], 1791500000000, kind, undefined, 0o644), env: UX, stdin: '' };
        if (r < 0.7) return { args: ['h1'], files: { 'home/.dflow/console/screen/h1.txt': 'x' }, env: WIN, stdin: '' };
        if (r < 0.8) return { args: ['h1'], files: { 'home/.dflow/console/screen/h1.json': { data: 'x'.repeat(5000), mode: 0o600 } }, env: WIN, stdin: '' };
        return { args: [rng.pick(['.bad', 'a/b', ''])], env: WIN, stdin: '' };
      },
    },
    sc_load: {
      js: ['sc_load'],
      globals: ['SC_SCREEN', 'SC_KIND', 'SC_AT', 'SC_FULL'],
      fixed: [
        { label: '신선하면 적중(윈도우 모드)', args: ['h1'], files: cacheFiles('h1', SCREENS.permission, nowMs() - 3000, 'permission', HEX64), env: { ...WIN, SC_TTL: '20' }, stdin: '' },
        { label: '낡으면 rc 1', args: ['h1'], files: cacheFiles('h1', SCREENS.permission, nowMs() - 3600000, 'permission'), env: { ...WIN, SC_TTL: '20' }, stdin: '' },
        { label: '설정 0이면 rc 1', args: ['h1'], files: cacheFiles('h1', SCREENS.permission, nowMs() - 3000, 'permission'), env: { ...WIN, SC_TTL: '0' }, stdin: '' },
      ],
      gen: (rng) => {
        const kind = rng.pick(KINDS);
        const txt = SCREENS[kind];
        const t = nowMs();
        const r = rng.next();
        // brief 8.3: 경계 근처 값을 만들지 않는다. 신선은 5초 이내, 낡음은 60초보다 오래.
        let at = t - rng.int(0, 5000), ttl = '20';
        if (r < 0.15) at = t - 3600000;
        else if (r < 0.22) at = t + 10000;
        else if (r < 0.28) at = t + 1000;
        if (r >= 0.28 && r < 0.33) ttl = rng.pick(['0', 'abc']);
        const full = rng.chance(0.4) ? HEX64 : rng.chance(0.5) ? 'xyz' : undefined;
        const files = cacheFiles('h1', txt, at, kind, full);
        if (r >= 0.33 && r < 0.38) files['home/.dflow/console/screen/h1.json'] = '{broken';
        if (r >= 0.38 && r < 0.43) files['home/.dflow/console/screen/h1.txt'] = `${txt}extra line\n`;
        return { args: ['h1'], files, env: { ...WIN, SC_TTL: ttl }, stdin: '' };
      },
    },
  },
};
