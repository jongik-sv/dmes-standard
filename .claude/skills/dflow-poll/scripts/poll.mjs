#!/usr/bin/env node
// poll.mjs — D'Flow ready 작업 감시 루프 (poll.sh 의 node 이식, dflow-poll 스킬 전용).
// ready 발견 시 stdout 에 "순번<TAB>id8<TAB>이름<TAB>action" 을 줄 단위로 내고 종료한다
// (action 은 계약 2.11 서버 판단 — 옛 서버면 빈 값).
// 승인 감지 시 stdout 에 "TSK<TAB>order-id" 를 내고 exit 9,
// 반려 감지 시 "TSK<TAB>order-id<TAB>review_note" 를 내고 exit 10.
// exit: 0 ready 발견 / 2 사용법·설정 / 3 인증 / 5 권한 / 7 기능꺼짐 (dflow 코드 전파)
//       6 네트워크·일시 오류 연속 한도 초과 / 8 종료시각 도달.
// 토큰은 env 로만 다룬다 — 출력·파일 기록·명령 문자열 보간 금지.
// DFLOW_WATCH=0 이면 좌석표 watch 신호를 보내지 않는다(팀장 /dflow-team 아래 실행용).
//
// sh 판과 맞춘 점: 인자·기본값·검증·종료시각 세 형식·WP 정규화·설정 해석(.dflow·.dflow.local·
// 레거시 .env)·바인딩 검사·필터 캐시(cksum 파일명·TTL·탈락만)·ready·승인·반려 판정·
// stdout/stderr 줄 형식·종료 코드·주기·재검사 해제.
// 알고 둔 차이: --help(짧은 도움말, exit 0)는 추가. jq 대신 JSON.parse.
//   dflow 호출은 `node <리포>/.claude/skills/dflow-work/scripts/dflow.mjs <같은 인자>` 다
//   (그 파일은 다른 레인이 만드는 중. DFLOW_SH env 로 오버라이드).
//   레거시 .env 는 실행(source)하지 않고 KEY=VALUE 줄만 읽는다(따옴표 해제, export 접두 허용).
//   종료시각 해석은 date 명령 대신 직접 계산한다(이달력 검증 포함).
//   sleep 은 신호에 바로 죽는다(트랩 없음 — sh 판과 같다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OK, USAGE, finish } from '../../_shared/node/args.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROG = path.basename(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(HERE, '..', '..');
const DFLOW = process.env.DFLOW_SH
  || path.join(SKILLS_DIR, 'dflow-work', 'scripts', 'dflow.mjs');

const USAGE_MSG = '사용법: poll.mjs [--interval 초] [--until HH:MM|"YYYY-MM-DD HH:MM"|none] [--exclude id8,id8] [--exclude-temp id8,id8] [--recheck-cycles N] [--exclude-wait id8,id8] [--wait-cycles N] [--require-tag 태그] [--wp WP-02,모듈/WP-03] [--tag-cache-cycles N] [--actions full,design,build] [--lead]';
function usage() {
  process.stderr.write(USAGE_MSG + '\n');
  return finish(USAGE);
}

// ---------------------------------------------------------------------------
// dflow 설정 해석 (dflow-config.sh port)
// ---------------------------------------------------------------------------
const DFC_ENV = {
  api_base: 'DFLOW_API_BASE', project_id: 'DFLOW_PROJECT_ID', release_branch: 'DFLOW_RELEASE_BRANCH',
  pats: 'DFLOW_PATS', pat: 'DFLOW_PAT', as: 'DFLOW_AS', dev_branch: 'DFLOW_DEV_BRANCH',
  automerge: 'DFLOW_AUTOMERGE', project_map: 'DFLOW_PROJECT_MAP',
  no_docker: 'DFLOW_NO_DOCKER', dialect_check: 'DFLOW_DIALECT_CHECK',
  build_model_trial: 'DFLOW_BUILD_MODEL_TRIAL', build_model_trial_rate: 'DFLOW_BUILD_MODEL_TRIAL_RATE',
  build_model_trial_tasks: 'DFLOW_BUILD_MODEL_TRIAL_TASKS',
  worker_keep_skills: 'DFLOW_WORKER_KEEP_SKILLS', worker_skills_off: 'DFLOW_WORKER_SKILLS_OFF',
  worker_keep_plugins: 'DFLOW_WORKER_KEEP_PLUGINS', worker_output_style: 'DFLOW_WORKER_OUTPUT_STYLE',
};
const DFC_COMMON = new Set(['api_base', 'project_id', 'release_branch']);
const DFC_PERSONAL = new Set(['pats', 'pat', 'as', 'dev_branch', 'automerge', 'project_map',
  'build_model_trial', 'build_model_trial_rate', 'build_model_trial_tasks',
  'worker_keep_skills', 'worker_skills_off', 'worker_keep_plugins', 'worker_output_style']);

// stdin key=value 정규화. 주석·빈 줄·CR·앞뒤 공백·값 뒤 " #…" 를 버린다.
function dfcParse(text) {
  const rows = [];
  splitLinesKeepCr(text).forEach((raw, idx) => {
    let line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    line = line.replace(/^[ \t]+/, '');
    if (line === '' || line.startsWith('#')) return;
    const i = line.indexOf('=');
    if (i < 1) {
      process.stderr.write(`BAD_LINE ${idx + 1}\n`);
      return;
    }
    const k = line.slice(0, i).replace(/[ \t]+$/, '');
    const v = line.slice(i + 1).replace(/^[ \t]+/, '').replace(/[ \t]+#.*$/, '').replace(/[ \t]+$/, '');
    rows.push([k, v]);
  });
  return rows;
}
function splitLinesKeepCr(text) {
  if (text === '') return [];
  const a = text.split('\n');
  if (a.length && a[a.length - 1] === '') a.pop();
  return a;
}

function gitOut(cwd, args) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8', cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status ?? -1, out: (r.stdout ?? '').replace(/\n+$/, '') };
}

function dfcApply(scope, label, rows, env) {
  let rc = 0;
  for (const [k, v] of rows) {
    const name = DFC_ENV[k];
    if (!name) {
      process.stderr.write(`UNKNOWN_KEY ${label}: ${k} (무시)\n`);
      continue;
    }
    const both = !DFC_COMMON.has(k) && !DFC_PERSONAL.has(k);
    if (!both && ((scope === 'common') !== DFC_COMMON.has(k))) {
      if (scope === 'common') {
        process.stderr.write(`PERSONAL_KEY_IN_DFLOW ${k} 는 개인 설정이다. .dflow.local 로 옮겨라\n`);
        rc = 2;
      } else {
        process.stderr.write(`COMMON_KEY_IN_LOCAL ${k} 는 프로젝트 공통 설정이다. .dflow.local 의 값은 무시한다\n`);
      }
      continue;
    }
    if (!env[name]) env[name] = v;
  }
  return rc;
}

function dfcMapKeys(projectMap, quiet) {
  const ok = [], bad = [];
  for (const item of String(projectMap ?? '').replace(/ /g, '').replace(/\r/g, '').split(',')) {
    if (item === '') continue;
    const parts = item.split('=');
    if (parts.length !== 2 || parts[1] === '') continue;
    let k = parts[0];
    const v = parts[1];
    let badK = k.startsWith('/') || k === '..' || k.startsWith('../')
      || k.includes('/../') || k.endsWith('/..');
    if (!badK) {
      k = k.replace(/\/+$/, '');
      if (k === '') badK = true;
    }
    if (badK) {
      bad.push(v);
      if (!quiet) {
        process.stderr.write(`BAD_DOCS_DIR ${parts[0] === '' ? '(빈 키)' : parts[0]} — project_map 의 키는 리포 최상위 기준 상대경로여야 한다(빈 키·/ 로 시작·.. 금지). 이 항목은 건너뛴다. .dflow.local 을 고쳐라\n`);
      }
      continue;
    }
    ok.push([k, v]);
  }
  return { ok, bad };
}

function dfcProjects(env, quiet) {
  const ids = [];
  const pid = String(env.DFLOW_PROJECT_ID ?? '').replace(/ /g, '').replace(/\r/g, '');
  if (pid !== '') ids.push(pid);
  for (const [, v] of dfcMapKeys(env.DFLOW_PROJECT_MAP, quiet).ok) {
    const t = v.replace(/ /g, '').replace(/\r/g, '');
    if (t !== '') ids.push(t);
  }
  return [...new Set(ids)].sort();
}

function dfcTasksDirs(env, quiet) {
  const out = new Set();
  const pid = String(env.DFLOW_PROJECT_ID ?? '').replace(/ /g, '').replace(/\r/g, '');
  if (pid !== '') out.add('docs/tasks');
  for (const [k] of dfcMapKeys(env.DFLOW_PROJECT_MAP ?? '', quiet).ok) out.add(`${k}/tasks`);
  return [...out].sort();
}

// 레거시 .env 읽기용 관대 파서(실행하지 않는다).
function parseEnvFile(text) {
  const vars = {};
  for (let line of splitLinesKeepCr(text)) {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    line = line.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
      v = v.slice(1, -1);
    } else {
      const h = v.search(/[ \t]#/);
      if (h >= 0) v = v.slice(0, h).trim();
    }
    vars[m[1]] = v;
  }
  return vars;
}

function dflowConfigLoad(env) {
  let top = env.DFLOW_CONFIG_DIR || '';
  if (!top) {
    const r = gitOut(process.cwd(), ['rev-parse', '--show-toplevel']);
    top = r.status === 0 ? r.out : '';
  }
  env.DFLOW_CONFIG_TOP = top;
  let localText = '', dotText = '', localPath = '', dotPath = '';
  if (top) {
    try {
      localText = fs.readFileSync(path.join(top, '.dflow.local'), 'utf8');
      localPath = path.join(top, '.dflow.local');
    } catch { /* 없음 */ }
    try {
      dotText = fs.readFileSync(path.join(top, '.dflow'), 'utf8');
      dotPath = path.join(top, '.dflow');
    } catch { /* 없음 */ }
  }
  if (!dotPath && top && gitOut(top, ['rev-parse', '--git-dir']).status === 0) {
    let dev = env.DFLOW_DEV_BRANCH || '';
    if (!dev) {
      for (const [k, v] of dfcParse(localText)) {
        if (k === 'dev_branch') {
          dev = v;
          break;
        }
      }
    }
    const candidates = [...(dev ? [`origin/${dev}`] : []), 'origin/HEAD'];
    for (const ref of candidates) {
      const r = spawnSync('git', ['-C', top, 'show', `${ref}:.dflow`], { encoding: 'utf8', windowsHide: true });
      if (r.status === 0) {
        dotText = r.stdout ?? '';
        dotPath = `${ref}:.dflow`;
        break;
      }
    }
  }
  env.DFLOW_CONFIG_LOCAL = localPath;
  env.DFLOW_CONFIG_DOT = dotPath;
  if (dotPath && localPath) {
    env.DFLOW_CONFIG_MODE = 'new';
    if (dfcApply('personal', '.dflow.local', dfcParse(localText), env) !== 0) return 2;
    if (dfcApply('common', dotPath, dfcParse(dotText), env) !== 0) return 2;
    if (!env.DFLOW_DEV_BRANCH) {
      process.stderr.write('NO_DEV_BRANCH .dflow.local 에 dev_branch=<내 개발 브랜치> 를 적어라(운영 브랜치에서 직접 개발하면 그 이름을 적는다)\n');
      return 2;
    }
  } else if (dotPath) {
    process.stderr.write(`NO_LOCAL ${top}/.dflow.local 이 없다. 개인 설정(pats·dev_branch 등)을 만들어라(예시: .claude/skills/dflow-work/dflow.local.example)\n`);
    return 2;
  } else if (localPath) {
    process.stderr.write('NO_DFLOW .dflow.local 은 있는데 .dflow 를 찾지 못했다(워크트리·origin/<dev_branch>·origin/HEAD). 프로젝트 공통 설정을 커밋하라\n');
    return 2;
  } else {
    env.DFLOW_CONFIG_MODE = 'legacy';
    if (!env.DFLOW_PATS && !env.DFLOW_PAT) {
      let envf = env.DFLOW_ENV_FILE || (env.DFLOW_CONFIG_DIR ? path.join(env.DFLOW_CONFIG_DIR, '.env') : './.env');
      try {
        const t = fs.readFileSync(envf, 'utf8');
        process.stderr.write(`LEGACY_ENV ${envf} 를 읽었다. .dflow·.dflow.local 로 옮겨라\n`);
        Object.assign(env, parseEnvFile(t));
      } catch { /* 없음 */ }
    }
  }
  return 0;
}

// POSIX cksum (캐시 파일명용).
const CKSUM_TAB = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = (n << 24) >>> 0;
    for (let k = 0; k < 8; k++) c = (c & 0x80000000) ? ((((c << 1) >>> 0) ^ 0x04c11db7) >>> 0) : ((c << 1) >>> 0);
    t[n] = c;
  }
  return t;
})();
function cksum(str) {
  const b = Buffer.from(str, 'utf8');
  let crc = 0;
  for (const x of b) crc = ((((crc << 8) >>> 0) ^ CKSUM_TAB[((crc >>> 24) ^ x) & 0xff]) >>> 0);
  let len = b.length;
  while (len !== 0) {
    crc = ((((crc << 8) >>> 0) ^ CKSUM_TAB[((crc >>> 24) ^ (len & 0xff)) & 0xff]) >>> 0);
    len >>>= 8;
  }
  return (~crc) >>> 0;
}

// ---------------------------------------------------------------------------
// 인자
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const o = {
    interval: '300', untilRaw: '18:00', exclude: '', excludeTemp: '', recheckCycles: '6',
    excludeWait: '', waitCycles: '24', requireTag: '', wp: '', tagCacheCycles: '3',
    actions: 'full,design,build', lead: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') return { help: true };
    const take = () => (i + 1 < argv.length ? argv[++i] : null);
    if (a === '--interval') o.interval = take();
    else if (a === '--until') o.untilRaw = take();
    else if (a === '--exclude') o.exclude = take();
    else if (a === '--exclude-temp') o.excludeTemp = take();
    else if (a === '--recheck-cycles') o.recheckCycles = take();
    else if (a === '--exclude-wait') o.excludeWait = take();
    else if (a === '--wait-cycles') o.waitCycles = take();
    else if (a === '--require-tag') o.requireTag = take();
    else if (a === '--wp') o.wp = take();
    else if (a === '--tag-cache-cycles') o.tagCacheCycles = take();
    else if (a === '--actions') o.actions = take();
    else if (a === '--lead') o.lead = true;
    else return null;
    if (o.interval === null || o.untilRaw === null || o.exclude === null || o.excludeTemp === null
      || o.recheckCycles === null || o.excludeWait === null || o.waitCycles === null
      || o.requireTag === null || o.wp === null || o.tagCacheCycles === null || o.actions === null) return null;
  }
  return o;
}

const isDigits = (s) => s !== null && s !== undefined && s !== '' && /^[0-9]+$/.test(s);

// 종료시각 → {epoch|null, label}. sh 판 to_epoch(BSD date -j 먼저, 없으면 GNU date -d)과 같다.
function parseUntil(raw) {
  if (raw === 'none') return { epoch: null, label: '종료요청까지' };
  let y, mo, d, h, mi, label;
  let m = /^([0-2][0-9]):([0-5][0-9])$/.exec(raw);
  if (m) {
    const now = new Date();
    y = now.getFullYear();
    mo = now.getMonth() + 1;
    d = now.getDate();
    h = +m[1];
    mi = +m[2];
    label = raw;
  } else if ((m = /^([0-9]{4})-([0-1][0-9])-([0-3][0-9]) ([0-2][0-9]):([0-5][0-9])$/.exec(raw))) {
    y = +m[1];
    mo = +m[2];
    d = +m[3];
    h = +m[4];
    mi = +m[5];
    label = raw.slice(5);
  } else return null;
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  // 존재하지 않는 시각(2월 30일·25시 등)은 date 가 실패하므로 사용법 오류다.
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d
    || dt.getHours() !== h || dt.getMinutes() !== mi) return null;
  return { epoch: Math.floor(dt.getTime() / 1000), label };
}

function normalizeWp(wp) {
  if (!wp) return '';
  const out = [];
  for (const w of wp.split(',')) {
    if (!/^([^/\s]+\/)?WP-[0-9]+$/.test(w)) {
      process.stderr.write(`--wp 형식 오류: ${w} (예: WP-02, dict/WP-02)\n`);
      return null;
    }
    const cut = w.lastIndexOf('-');
    let n = w.slice(cut + 1).replace(/^0*/, '');
    if (n === '') n = '0';
    out.push(`${w.slice(0, cut)}-${n}`);
  }
  return out.join(',');
}

// jq -r 스칼라: 없음·null → ''.
function jstr(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}

function dflowRun(args, { combine = false, quiet = false } = {}) {
  const r = spawnSync(process.execPath, [DFLOW, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) return { rc: 127, out: '', err: String(r.error.message ?? r.error) };
  const out = r.stdout ?? '', err = r.stderr ?? '';
  return { rc: r.status ?? 127, out: combine ? out + err : out, err };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main(argv, env) {
  const o = parseArgs(argv);
  if (o && o.help) {
    process.stdout.write(USAGE_MSG + '\nready 감시 루프. 종료 코드는 머리말 주석 참고.\n');
    return finish(OK);
  }
  if (!o) return usage();
  if (!isDigits(o.interval)) return usage();
  const until = parseUntil(o.untilRaw ?? '');
  if (!until) return usage();
  if (!isDigits(o.recheckCycles) || !isDigits(o.waitCycles) || !isDigits(o.tagCacheCycles)) return usage();
  for (const a of String(o.actions ?? '').split(',')) {
    if (a !== 'full' && a !== 'design' && a !== 'build') return usage();
  }
  if (!/,(full|design|build),/.test(`,${o.actions},`)) return usage();
  const wp = normalizeWp(o.wp ?? '');
  if (wp === null) return finish(USAGE);
  o.wp = wp;

  const interval = parseInt(o.interval, 10);
  const recheckCycles = parseInt(o.recheckCycles, 10);
  const waitCycles = parseInt(o.waitCycles, 10);
  const tagCacheCycles = parseInt(o.tagCacheCycles, 10);

  try {
    fs.accessSync(DFLOW, fs.constants.X_OK);
  } catch {
    process.stderr.write(`dflow.mjs 없음: ${DFLOW}\n`);
    return finish(USAGE);
  }
  if (dflowConfigLoad(env) !== 0) return finish(USAGE);

  let stateTop = gitOut(process.cwd(), ['rev-parse', '--show-toplevel']).out;
  if (!stateTop) stateTop = process.cwd();
  const stateFiles = () => {
    const files = [];
    for (const d of dfcTasksDirs(env, true)) {
      let subs;
      try {
        subs = fs.readdirSync(path.join(stateTop, d), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const s of subs) {
        if (!s.isDirectory()) continue;
        const f = path.join(stateTop, d, s.name, 'state.json');
        try {
          if (fs.statSync(f).isFile()) files.push(f);
        } catch { /* 없음 */ }
      }
    }
    return files;
  };
  if (!dfcProjects(env, true).length) {
    process.stderr.write('프로젝트 바인딩 없음: .dflow 의 project_id 또는 .dflow.local 의 project_map(레거시는 .env 의 DFLOW_PROJECT_ID·DFLOW_PROJECT_MAP)을 넣으세요\n');
    return finish(USAGE);
  }
  dfcTasksDirs(env, false);

  // 필터 캐시.
  let tagCache = '';
  const tagTtl = tagCacheCycles * interval;
  if ((o.requireTag || o.wp) && tagTtl > 0) {
    const cd = path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'dflow');
    const base = String(env.DFLOW_API_BASE ?? '').replace(/\/$/, '');
    const key = cksum(`${base}|${dfcProjects(env, true).join('\n')}`);
    try {
      fs.mkdirSync(cd, { recursive: true });
      fs.accessSync(cd, fs.constants.W_OK);
      tagCache = path.join(cd, `poll-filter-cache-${key}.tsv`);
    } catch {
      process.stderr.write(`필터 캐시 끔(쓸 수 없음: ${cd}) — 후보마다 매 주기 show 한다\n`);
    }
  }
  const filterOk = (tags, ref) => {
    if (o.requireTag) {
      if (!`,${tags},`.includes(`,${o.requireTag},`)) return false;
    }
    if (o.wp) {
      const m = /^TSK-([0-9]+)-/.exec(String(ref).split('/').pop() ?? '');
      if (!m) return false;
      let n = m[1].replace(/^0*/, '');
      if (n === '') n = '0';
      const mod = String(ref).includes('/') ? String(ref).split('/').slice(0, -1).join('/') : '';
      if (`,${o.wp},`.includes(`,WP-${n},`)) return true;
      if (mod !== '' && `,${o.wp},`.includes(`,${mod}/WP-${n},`)) return true;
      return false;
    }
    return true;
  };
  const cacheDrop = (id, tags, ref) => {
    if (!tagCache) return;
    const now = Math.floor(Date.now() / 1000);
    let kept = [];
    try {
      kept = fs.readFileSync(tagCache, 'utf8').split('\n').filter((l) => {
        if (l === '') return false;
        const c = l.split('\t');
        return c[0] !== id && now - parseInt(c[1], 10) < tagTtl;
      });
    } catch { /* 없음 */ }
    kept.push(`${id}\t${now}\t${tags}\t${ref}`);
    try {
      const t = `${tagCache}.${process.pid}`;
      fs.writeFileSync(t, kept.join('\n') + '\n');
      fs.renameSync(t, tagCache);
    } catch {
      try { fs.rmSync(`${tagCache}.${process.pid}`, { force: true }); } catch { /* 무시 */ }
    }
  };
  const cacheHit = (id) => {
    if (!tagCache) return '';
    let text = '';
    try {
      text = fs.readFileSync(tagCache, 'utf8');
    } catch {
      return '';
    }
    const now = Math.floor(Date.now() / 1000);
    for (const l of text.split('\n')) {
      if (l === '') continue;
      const c = l.split('\t');
      if (c[0] === id && now - parseInt(c[1], 10) < tagTtl) return `${c[2] ?? ''}\t${c[3] ?? ''}`;
    }
    return '';
  };

  const watch = env.DFLOW_WATCH ?? '1';
  let netFail = 0, cycle = 0;
  for (;;) {
    if (until.epoch !== null && Math.floor(Date.now() / 1000) >= until.epoch) {
      if (watch !== '0') dflowRun(['watch', '--stop']);
      process.stderr.write(`종료 시각 도달(--until ${o.untilRaw})\n`);
      return finish(8);
    }
    if (watch !== '0') dflowRun(['watch', '--until', until.label]);

    cycle++;
    if (o.excludeTemp && cycle > recheckCycles) {
      process.stderr.write(`일시성 제외 해제(재검사 유도): ${o.excludeTemp}\n`);
      o.excludeTemp = '';
    }
    if (o.excludeWait && cycle > waitCycles) {
      process.stderr.write(`선행 대기 해제(안전망 재검사): ${o.excludeWait}\n`);
      o.excludeWait = '';
    }

    // -- 승인 감지 --
    let mergeHits = '', rejectHits = '';
    for (const sf of stateFiles()) {
      let doc;
      try {
        doc = JSON.parse(fs.readFileSync(sf, 'utf8'));
      } catch {
        continue;
      }
      if (doc === null || typeof doc !== 'object') continue;
      const phase = doc.phase;
      if (phase !== 'reported' && phase !== 'merged') continue;
      const ord = jstr(doc.order);
      if (!ord) continue;
      const tsk = jstr(doc.tsk);
      const sj = dflowRun(['show', ord]);
      let sdoc = null;
      if (sj.rc === 0) {
        try {
          sdoc = JSON.parse(sj.out);
        } catch {
          sdoc = null;
        }
      }
      const st = sdoc && sdoc.order ? jstr(sdoc.order.status) : '';
      let rv = '';
      if (sdoc && Array.isArray(sdoc.reports)) {
        const comps = sdoc.reports.filter((r) => r && r.kind === 'completion');
        if (comps.length) rv = jstr(comps[comps.length - 1].review_action);
      }
      if (st === 'approved' && phase === 'reported') mergeHits += `${tsk}\t${ord}\n`;
      else if (rv === 'reject') {
        let note = '';
        if (sdoc && Array.isArray(sdoc.reports)) {
          const comps = sdoc.reports.filter((r) => r && r.kind === 'completion');
          if (comps.length) note = jstr(comps[comps.length - 1].review_note);
        }
        note = note.replace(/[\n\t]/g, ' ').replace(/ *$/, '');
        rejectHits += `${tsk}\t${ord}\t${note}\n`;
      } else if (!st) {
        process.stderr.write(`승인 조회 실패: ${tsk} (order=${ord}) — show 해석 불가(전체 UUID 로 기록됐는지 확인)\n`);
      }
    }
    if (mergeHits) {
      process.stdout.write(mergeHits);
      return finish(9);
    }
    if (rejectHits) {
      process.stdout.write(rejectHits);
      return finish(10);
    }

    const largs = ['list', '--scope', 'assigned'];
    if (o.requireTag) largs.push('--require-tag', o.requireTag);
    if (o.wp) largs.push('--wp', o.wp);
    if (o.lead) largs.push('--lead');
    const lr = dflowRun(largs, { combine: true });
    const rc = lr.rc, out = lr.out;
    if (rc === 0) {
      netFail = 0;
      const ex = `,${o.exclude},${o.excludeTemp},${o.excludeWait},`;
      const acts = `,${o.actions},`;
      let ready = [];
      for (const line of out.split('\n')) {
        if (line === '') continue;
        const c = line.split('\t');
        const st2 = c[1] ?? '', id = c[3] ?? '', nm = c[4] ?? '', ac = c[5] ?? '', mine = c[6] ?? '';
        if (st2 !== 'RD' || ex.includes(`,${id},`)) continue;
        if (!(ac === '' || (acts.includes(`,${ac},`) && mine === '1'))) continue;
        ready.push(ac !== '' ? `${c[0]}\t${id}\t${nm}\t${ac}` : `${c[0]}\t${id}\t${nm}`);
      }
      if (ready.length && (o.requireTag || o.wp)) {
        const kept = [];
        for (const ln of ready) {
          const parts = ln.split('\t');
          if ((parts[3] ?? '') !== '') {
            kept.push(ln);
            continue;
          }
          if (!ln) continue;
          const id = parts[1] ?? '';
          if (tagCache) {
            const hit = cacheHit(id);
            if (hit && !filterOk(hit.split('\t')[0] ?? '', hit.split('\t')[1] ?? '')) continue;
          }
          const sj = dflowRun(['show', id]);
          if (sj.rc !== 0) continue;
          let item = '';
          try {
            const d = JSON.parse(sj.out);
            if (d && d.order && jstr(d.order.id) !== '') {
              const it = d.order.item;
              const tagsRaw = it ? it.tags : undefined;
              // sh 판 jq 와 같이 tags 가 배열이 아니면 조회 실패로 본다.
              if (tagsRaw !== undefined && tagsRaw !== null && !Array.isArray(tagsRaw)) item = '';
              else {
                const tags = Array.isArray(tagsRaw) ? tagsRaw.join(',') : '';
                const ref = it ? jstr(it.external_ref) : '';
                item = `${tags}\t${ref}`;
              }
            }
          } catch {
            item = '';
          }
          if (!item) continue;
          const [tags, ref] = item.split('\t');
          if (!filterOk(tags ?? '', ref ?? '')) {
            cacheDrop(id, tags ?? '', ref ?? '');
            continue;
          }
          kept.push(ln);
        }
        ready = kept;
      }
      if (ready.length) {
        process.stdout.write(ready.join('\n') + '\n');
        return finish(OK);
      }
    } else if (rc === 3 || rc === 5 || rc === 7) {
      // sh 판 `printf '%s\n'` 과 같이 개행을 항상 덧붙인다.
      process.stderr.write(out + '\n');
      return finish(rc);
    } else if (rc === 6 || rc === 126 || rc === 127) {
      netFail++;
      if (netFail >= 3) {
        process.stderr.write(`일시 오류(rc=${rc}) 3회 연속 — 중단\n`);
        process.stderr.write(out + '\n');
        return finish(6);
      }
    } else {
      process.stderr.write(out + '\n');
      return finish(rc);
    }
    await sleep(interval * 1000);
  }
}

finish(await main(process.argv.slice(2), process.env));
