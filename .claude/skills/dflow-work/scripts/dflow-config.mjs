// dflow-config.mjs — D'Flow 에이전트 설정 해석 모듈. dflow.mjs 가 import 해서 쓴다(단독 실행하지 않는다).
// .dflow(프로젝트 공통, 커밋)·.dflow.local(개인, gitignore)을 읽어 DFLOW_* env(process.env)에 싣는다.
// 우선순위: 이미 설정된 env > 파일 > 레거시 .env. 설정 파일은 파싱만 한다 — 값을 실행하지 않는다.
// 두 파일이 모두 받는 키(범위 both: no_docker·dialect_check)는 env > .dflow.local > .dflow 이다.
// 실패하면 사유 코드 한 줄을 stderr 에 내고 false/null 을 돌려준다. 값은 메시지에 넣지 않는다(토큰이 섞일 수 있다).
// 사용법·출력 형식·종료 코드는 dflow.mjs 의 usage 를 보라.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readText } from '../../_shared/node/io.mjs';

// 키 → env 이름
export function envOf(key) {
  return ({
    api_base: 'DFLOW_API_BASE', project_id: 'DFLOW_PROJECT_ID', release_branch: 'DFLOW_RELEASE_BRANCH',
    pats: 'DFLOW_PATS', pat: 'DFLOW_PAT', as: 'DFLOW_AS', dev_branch: 'DFLOW_DEV_BRANCH',
    automerge: 'DFLOW_AUTOMERGE', project_map: 'DFLOW_PROJECT_MAP',
    no_docker: 'DFLOW_NO_DOCKER', dialect_check: 'DFLOW_DIALECT_CHECK',
    build_model_trial: 'DFLOW_BUILD_MODEL_TRIAL', build_model_trial_rate: 'DFLOW_BUILD_MODEL_TRIAL_RATE',
    build_model_trial_tasks: 'DFLOW_BUILD_MODEL_TRIAL_TASKS',
    worker_keep_skills: 'DFLOW_WORKER_KEEP_SKILLS', worker_skills_off: 'DFLOW_WORKER_SKILLS_OFF',
    worker_keep_plugins: 'DFLOW_WORKER_KEEP_PLUGINS', worker_output_style: 'DFLOW_WORKER_OUTPUT_STYLE',
  })[key] || null;
}

// 키 → 받는 파일 범위(common|personal|both)
function scopeOf(key) {
  if (['api_base', 'project_id', 'release_branch'].includes(key)) return 'common';
  if (['pats', 'pat', 'as', 'dev_branch', 'automerge', 'project_map',
    'build_model_trial', 'build_model_trial_rate', 'build_model_trial_tasks',
    'worker_keep_skills', 'worker_skills_off', 'worker_keep_plugins', 'worker_output_style'].includes(key)) return 'personal';
  if (['no_docker', 'dialect_check'].includes(key)) return 'both';
  return 'unknown';
}

function gitOk(args, cwd) {
  const r = spawnSync('git', args, { encoding: 'utf8', cwd, windowsHide: true });
  return r.status === 0 ? (r.stdout ?? '') : null;
}

// key=value 모음을 정규화해 [k, v] 목록으로 낸다. 주석·빈 줄·CR·앞뒤 공백·값 뒤 " #…" 를 버린다.
// warn=true 면 잘못된 줄마다 "BAD_LINE <줄번호>" 를 stderr 에 낸다.
export function parseEntries(text, { warn = true } = {}) {
  const out = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '').replace(/^[ \t]+/, '');
    if (line === '' || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 1) { // '=' 이 없거나 키가 빈 칸. 한 글자 키(x=)는 받는다 — 종전 awk index()<2 와 같다.
      if (warn) console.error(`BAD_LINE ${i + 1}`);
      return;
    }
    const k = line.slice(0, eq).replace(/[ \t]+$/, '');
    const v = line.slice(eq + 1).replace(/^[ \t]+/, '').replace(/[ \t]+#.*$/, '').replace(/[ \t]+$/, '');
    out.push([k, v]);
  });
  return out;
}

// 레거시 .env 용 전처리 — 종전 source 가 이해하던 형태를 parseEntries 입력으로 맞춘다:
// 줄 앞 `export ` 를 떼고, 값 전체가 짝 맞는 따옴표로 감싸져 있으면 벗긴다.
function parseLegacyEnv(text) {
  return parseEntries(text.replace(/^[ \t]*export[ \t]+/gm, ''))
    .map(([k, v]) => {
      if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
        return [k, v.slice(1, -1)];
      }
      return [k, v];
    });
}

// $1=이 파일이 받을 범위(common|personal) $2=표시명. entries=parseEntries 출력.
// env 에 값이 이미 있으면 덮지 않는다(먼저 쓴 쪽이 이긴다). 범위 위반 사유는 stderr.
function applyScope(scope, display, entries) {
  let rc = 0;
  for (const [k, v] of entries) {
    const s = scopeOf(k);
    if (s === 'unknown') { console.error(`UNKNOWN_KEY ${display}: ${k} (무시)`); continue; }
    if (s !== 'both' && s !== scope) {
      if (scope === 'common') {
        console.error(`PERSONAL_KEY_IN_DFLOW ${k} 는 개인 설정이다. .dflow.local 로 옮겨라`);
        rc = 2;
      } else {
        console.error(`COMMON_KEY_IN_LOCAL ${k} 는 프로젝트 공통 설정이다. .dflow.local 의 값은 무시한다`);
      }
      continue;
    }
    const n = envOf(k);
    if (!(n in process.env) || process.env[n] === '') process.env[n] = v;
  }
  return rc;
}

// 설정 로드. 성공 = true(DFLOW_CONFIG_* 도 env 에 싣는다). 실패 = 사유 stderr + false.
export function dflowConfigLoad() {
  process.env.DFLOW_CONFIG_MODE = '';
  process.env.DFLOW_CONFIG_DOT = '';
  process.env.DFLOW_CONFIG_LOCAL = '';
  let top = '';
  if (process.env.DFLOW_CONFIG_DIR) {
    top = process.env.DFLOW_CONFIG_DIR;
  } else {
    top = (gitOk(['rev-parse', '--show-toplevel']) ?? '').replace(/\n+$/, '') || '';
  }
  let localText = '';
  let dotText = '';
  if (top && fs.existsSync(path.join(top, '.dflow.local'))) {
    localText = readText(path.join(top, '.dflow.local'));
    process.env.DFLOW_CONFIG_LOCAL = path.join(top, '.dflow.local');
  }
  if (top && fs.existsSync(path.join(top, '.dflow'))) {
    dotText = readText(path.join(top, '.dflow'));
    process.env.DFLOW_CONFIG_DOT = path.join(top, '.dflow');
  } else if (top && gitOk(['rev-parse', '--git-dir'], top) !== null) {
    // detach 된 옛 커밋에는 .dflow 가 없을 수 있다. 개발 브랜치는 개인 파일에서 이미 알므로 순환이 없다.
    // applyScope 는 비어 있는 변수만 채우므로 — 이 폴백도 첫 값을 쓰는 같은 규칙이어야 한다.
    const dev = process.env.DFLOW_DEV_BRANCH
      || (parseEntries(localText, { warn: false }).find(([k]) => k === 'dev_branch') || [])[1] || '';
    for (const ref of [dev ? `origin/${dev}` : '', 'origin/HEAD'].filter(Boolean)) {
      const shown = gitOk(['show', `${ref}:.dflow`], top);
      if (shown !== null) {
        dotText = shown;
        process.env.DFLOW_CONFIG_DOT = `${ref}:.dflow`;
        break;
      }
    }
  }

  if (process.env.DFLOW_CONFIG_DOT && process.env.DFLOW_CONFIG_LOCAL) {
    process.env.DFLOW_CONFIG_MODE = 'new';
    // .dflow.local 을 먼저 적용한다. 비어 있는 변수만 채우므로(먼저 쓴 쪽이 이긴다) 두 파일이 모두
    // 받는 키(both)는 PC 설정이 이긴다. 범위가 한쪽뿐인 키는 다른 파일에서 걸러지므로 순서가 값에 영향을 주지 않는다.
    const rcLocal = applyScope('personal', '.dflow.local', parseEntries(localText));
    const rcDot = applyScope('common', process.env.DFLOW_CONFIG_DOT, parseEntries(dotText));
    if (rcLocal || rcDot) return false;
    if (!process.env.DFLOW_DEV_BRANCH) {
      console.error('NO_DEV_BRANCH .dflow.local 에 dev_branch=<내 개발 브랜치> 를 적어라(운영 브랜치에서 직접 개발하면 그 이름을 적는다)');
      return false;
    }
  } else if (process.env.DFLOW_CONFIG_DOT) {
    console.error(`NO_LOCAL ${top}/.dflow.local 이 없다. 개인 설정(pats·dev_branch 등)을 만들어라(예시: .claude/skills/dflow-work/dflow.local.example)`);
    return false;
  } else if (process.env.DFLOW_CONFIG_LOCAL) {
    console.error('NO_DFLOW .dflow.local 은 있는데 .dflow 를 찾지 못했다(워크트리·origin/<dev_branch>·origin/HEAD). 프로젝트 공통 설정을 커밋하라');
    return false;
  } else {
    process.env.DFLOW_CONFIG_MODE = 'legacy';
    // 종전과 같다: 환경에 PAT 가 없을 때만, 파일이 있을 때만 읽는다.
    if (!process.env.DFLOW_PATS && !process.env.DFLOW_PAT) {
      let envf = process.env.DFLOW_ENV_FILE
        || (process.env.DFLOW_CONFIG_DIR ? path.join(process.env.DFLOW_CONFIG_DIR, '.env') : '');
      envf = envf || './.env';
      if (fs.existsSync(envf)) {
        console.error(`LEGACY_ENV ${envf} 를 읽었다. .dflow·.dflow.local 로 옮겨라`);
        // 종전에는 이 파일을 source 했다. node 판은 key=value 파싱으로만 싣는다(값을 실행하지 않는다).
        for (const [k, v] of parseLegacyEnv(readText(envf))) process.env[k] = v;
      }
    }
  }
  process.env.DFLOW_CONFIG_TOP = top;
  return true;
}

function originHead() {
  const top = process.env.DFLOW_CONFIG_TOP || '.'; // cwd 가 아니라 설정 리포 기준 — 종전 git -C 와 같다
  const b = (gitOk(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], top) ?? '')
    .trim().replace(/^origin\//, '');
  if (b) return b;
  const sym = gitOk(['ls-remote', '--symref', 'origin', 'HEAD'], top) ?? '';
  const m = sym.match(/^ref: refs\/heads\/(\S*)\s+HEAD$/m);
  return m ? m[1] : '';
}

// kind='dev'|'release' → origin/ 없는 브랜치 이름. 새 방식의 dev 는 load 가 이미 필수로 확인했다.
// 실패 = 사유 stderr + null.
export function dflowConfigBranch(kind) {
  if (kind === 'dev' && process.env.DFLOW_DEV_BRANCH) return process.env.DFLOW_DEV_BRANCH;
  if (kind === 'release' && process.env.DFLOW_RELEASE_BRANCH) return process.env.DFLOW_RELEASE_BRANCH;
  if (kind !== 'dev' && kind !== 'release') {
    console.error('사용: dflow branch dev|release');
    return null;
  }
  const b = originHead();
  if (!b) { console.error('NO_DEFAULT_BRANCH origin/HEAD 를 알 수 없다'); return null; }
  return b;
}

// project_map(docs/x=<uuid>,…)을 검증해 낸다.
// 키는 리포 최상위 기준 상대경로여야 한다 — 빈 키, / 로 시작하는 키, '..' 칸이 든 키는 잘못된 항목이다.
// 그런 키는 원격 스캔의 git diff pathspec 을 리포 밖으로 보내 exit 128(후보 조용히 0건)을 내고, claim 이
// 리포 밖·엉뚱한 곳에 작업 폴더를 만든다. 잘못된 항목은 그 항목만 건너뛴다.
//   {pairs: [[키, uuid]], bad: [잘못된 항목의 uuid], warnings: [BAD_DOCS_DIR 사유]}
// 경고 묵음 여부는 종전처럼 DFLOW_CONFIG_QUIET 환경 변수가 정한다(호출부 quiet 로 덮을 수 있다).
export function mapKeys({ quiet = process.env.DFLOW_CONFIG_QUIET === '1' } = {}) {
  const pairs = [];
  const bad = [];
  const warnings = [];
  for (const part of (process.env.DFLOW_PROJECT_MAP || '').split(',')) {
    const t = part.replace(/ /g, '').replace(/\r/g, '');
    const seg = t.split('=');
    if (seg.length !== 2 || seg[1] === '') continue;
    let k = seg[0];
    let badKey = k.startsWith('/') || k === '..' || k.startsWith('../') || k.includes('/../') || k.endsWith('/..');
    if (!badKey) {
      k = k.replace(/\/+$/, '');
      if (k === '') badKey = true;
    }
    if (badKey) {
      bad.push(seg[1]);
      if (!quiet) {
        const shown = seg[0] === '' ? '(빈 키)' : seg[0];
        warnings.push(`BAD_DOCS_DIR ${shown} — project_map 의 키는 리포 최상위 기준 상대경로여야 한다(빈 키·/ 로 시작·.. 금지). 이 항목은 건너뛴다. .dflow.local 을 고쳐라`);
      }
      continue;
    }
    pairs.push([k, seg[1]]);
  }
  return { pairs, bad, warnings };
}

// 리포 ↔ D'Flow 프로젝트 바인딩: project_id 와 project_map 값의 합집합(줄 목록).
// 키가 잘못된 항목의 UUID 는 바인딩하지 않는다. 경고는 mapKeys 의 quiet 규칙(DFLOW_CONFIG_QUIET)을 따른다.
export function dflowConfigProjects({ quiet } = {}) {
  const { pairs, warnings } = mapKeys(quiet === undefined ? {} : { quiet });
  for (const w of warnings) console.error(w);
  const ids = [process.env.DFLOW_PROJECT_ID || '', ...pairs.map(([, u]) => u)]
    .map((u) => u.replace(/[ \r]/g, ''))
    .filter((u) => u !== '');
  return [...new Set(ids)].sort();
}

// 작업 폴더 역매핑: uuid → DOCS_DIR(끝 / 제거). 작업 폴더는 <DOCS_DIR>/tasks/<TSK>.
// project_map 의 키가 먼저, 없고 project_id 와 같으면 docs. 추측하지 않는다(스펙 2026-09-23-dflow-task-scaffold §3).
// 실패 = 사유 stderr + null.
export function dflowConfigDocsDir(uuid) {
  const u = (uuid || '').replace(/[ \r]/g, '');
  if (!u) { console.error('사용: dflow config docs-dir <project_uuid>'); return null; }
  // 이 UUID 가 잘못된 map 항목에 있으면 멈춘다 — project_id 폴백(docs)보다 먼저 본다. 잘못 적은 키가 조용히
  // docs 로 풀리면 작업 폴더가 의도와 다른 곳에 생긴다. 무관한 잘못된 항목은 경고만 하고 건너뛴다.
  // 판정이 경고보다 먼저다 — 이 요청 자체가 잘못된 항목에 걸렸으면 그 사유만 보여야 한다.
  const { pairs, bad, warnings } = mapKeys({ quiet: true });
  if (bad.includes(u)) {
    console.error(`BAD_DOCS_DIR 프로젝트 ${u.split('-')[0]} 의 project_map 키가 리포 최상위 기준 상대경로가 아니다(빈 키·/ 로 시작·.. 금지). .dflow.local 을 고쳐라`);
    return null;
  }
  for (const w of warnings) console.error(w);
  const keys = [...new Set(pairs.filter(([, v]) => v === u).map(([k]) => k))].sort();
  if (keys.length > 1) {
    console.error(`AMBIGUOUS_DOCS_DIR 프로젝트 ${u.split('-')[0]} 가 project_map 에 여러 키로 있다`);
    return null;
  }
  if (keys.length === 1) return keys[0];
  if ((process.env.DFLOW_PROJECT_ID || '').replace(/[ \r]/g, '') === u) return 'docs';
  console.error(`PROJECT_MISMATCH 프로젝트 ${u.split('-')[0]} 는 이 리포 바인딩(project_id·project_map) 밖이다`);
  return null;
}

// 바인딩된 작업 폴더 목록(리포 최상위 기준 상대경로). 여러 작업을 훑는 스윕·감지가 쓴다.
export function dflowConfigTasksDirs() {
  const { pairs, warnings } = mapKeys();
  for (const w of warnings) console.error(w);
  const dirs = [
    (process.env.DFLOW_PROJECT_ID || '').replace(/[ \r]/g, '') !== '' ? 'docs' : '',
    ...pairs.map(([k]) => k),
  ].filter((d) => d !== '');
  return [...new Set(dirs.map((d) => `${d}/tasks`))].sort();
}
