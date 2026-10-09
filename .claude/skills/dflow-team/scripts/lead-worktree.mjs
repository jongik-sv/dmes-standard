#!/usr/bin/env node
// 같은 리포에서 두 번째 /dflow-team 팀장을 띄울 링크드 워크트리를 만든다. (옛 lead-worktree.sh 를 node 로 옮긴 것.)
// 사용: lead-worktree.mjs <이름>   (주 체크아웃 루트에서 실행. 이름은 소문자·숫자·- 만)
// 만드는 것: <주 체크아웃>/.claude/worktrees/lead-<이름> (origin/<개발브랜치> 에서 detached),
//           .claude/skills 링크, .dflow.local 복사본(as 줄은 뺀다. 레거시는 .env 에서 DFLOW_AS 를 뺀다).
// 종료 코드: 0 · 2(사용·이름·위치·설정 오류).
// node 18.17 이상, 외부 패키지 없음.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const USAGE = '사용: lead-worktree.mjs <이름> (소문자·숫자·- 만)';
const HELP = '같은 리포에서 두 번째 /dflow-team 팀장을 띄울 링크드 워크트리를 만든다.\n'
  + USAGE + '\n'
  + '만드는 것: <주 체크아웃>/.claude/worktrees/lead-<이름> (origin/<개발브랜치> 에서 detached)\n'
  + '종료 코드: 0 · 2(사용·이름·위치·설정 오류)\n';

function runGit(args, cwd) {
  const r = spawnSync('git', args, { encoding: 'utf8', cwd, windowsHide: true });
  return { status: r.error ? 128 : (r.status ?? 128), stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// _dfc_parse 와 같은 정규화: CR 제거·앞 공백 제거·주석·빈 줄 버림·첫 = 분리·키 뒤/값 앞뒤 공백과 값 뒤 " #…" 제거
function parseKv(text) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    let ln = raw.replace(/\r$/, '').replace(/^[ \t]+/, '');
    if (ln === '' || ln.startsWith('#')) continue;
    const i = ln.indexOf('=');
    if (i < 2) continue;
    let k = ln.slice(0, i).replace(/[ \t]+$/, '');
    let v = ln.slice(i + 1).replace(/^[ \t]+/, '').replace(/[ \t]+#.*$/, '').replace(/[ \t]+$/, '');
    if (k === '') continue;
    out.push([k, v]);
  }
  return out;
}

function readLocalDevBranch(primary, env) {
  if (env.DFLOW_DEV_BRANCH) return env.DFLOW_DEV_BRANCH;
  try {
    const t = fs.readFileSync(path.join(primary, '.dflow.local'), 'utf8');
    for (const [k, v] of parseKv(t)) {
      if (k === 'dev_branch' && v !== '') return v;
    }
  } catch { /* 없음 */ }
  return '';
}

function originHead(cwd) {
  let r = runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd);
  let b = (r.stdout ?? '').trim();
  if (b.startsWith('origin/')) b = b.slice('origin/'.length);
  if (b !== '') return b;
  r = runGit(['ls-remote', '--symref', 'origin', 'HEAD'], cwd);
  const m = /^ref: refs\/heads\/([^ \t]*)\s*HEAD$/m.exec(r.stdout ?? '');
  return m ? m[1] : '';
}

function ensureLine(file, line) {
  let cur = '';
  try { cur = fs.readFileSync(file, 'utf8'); } catch { cur = ''; }
  const rows = cur.split('\n');
  if (rows.length && rows[rows.length - 1] === '') rows.pop();
  if (rows.includes(line)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, (cur === '' || cur.endsWith('\n') ? cur : cur + '\n') + line + '\n', 'utf8');
}

function main(argv, env = process.env, cwd = process.cwd()) {
  for (const a of argv) {
    if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
  }
  const name = argv[0] ?? '';
  if (argv.length !== 1 || name === '' || /[^a-z0-9-]/.test(name)) {
    process.stderr.write('FAIL BAD_NAME 사용: lead-worktree.mjs <이름> (소문자·숫자·- 만)\n');
    return 2;
  }
  let r = runGit(['rev-parse', '--show-toplevel'], cwd);
  if (r.status !== 0) { process.stderr.write(r.stderr); return 2; }
  const ROOT = r.stdout.trim();
  r = runGit(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  if (r.status !== 0) { process.stderr.write(r.stderr); return 2; }
  const PRIMARY = path.dirname(r.stdout.trim());
  if (ROOT !== PRIMARY) {
    process.stderr.write(`FAIL NOT_PRIMARY 주 체크아웃(${PRIMARY})에서 실행하라\n`);
    return 2;
  }
  r = runGit(['rev-parse', '--show-prefix'], cwd);
  if (r.status !== 0) { process.stderr.write(r.stderr); return 2; }
  if (r.stdout.trim() !== '') {
    process.stderr.write('FAIL NOT_REPO_ROOT 리포 루트에서 실행하라\n');
    return 2;
  }

  // 개발 브랜치: .dflow.local 의 dev_branch(환경 DFLOW_DEV_BRANCH 우선), 없으면 origin/HEAD
  let base = readLocalDevBranch(PRIMARY, env);
  if (base === '') base = originHead(cwd);
  if (base === '') {
    process.stderr.write('FAIL NO_DEFAULT_BRANCH\n');
    return 2;
  }
  // 설정 방식: .dflow.local 이 있고 .dflow(파일 또는 git show 예비)가 있으면 new, 아니면 legacy
  let hasLocal = false;
  try { hasLocal = fs.statSync(path.join(PRIMARY, '.dflow.local')).isFile(); } catch { hasLocal = false; }
  let hasDot = false;
  try { hasDot = fs.statSync(path.join(PRIMARY, '.dflow')).isFile(); } catch { hasDot = false; }
  if (!hasDot) {
    const dev = readLocalDevBranch(PRIMARY, env);
    for (const ref of [...(dev !== '' ? [`origin/${dev}`] : []), 'origin/HEAD']) {
      const g = runGit(['show', `${ref}:.dflow`], PRIMARY);
      if (g.status === 0 && g.stdout !== '') { hasDot = true; break; }
    }
  }
  const isNew = hasLocal && hasDot;

  const ex = runGit(['rev-parse', '--git-path', 'info/exclude'], cwd);
  const exFile = ex.status === 0 ? ex.stdout.trim() : '.git/info/exclude';
  const exAbs = path.isAbsolute(exFile) ? exFile : path.join(cwd, exFile);
  try {
    fs.mkdirSync(path.dirname(exAbs), { recursive: true });
    if (!fs.existsSync(exAbs)) fs.writeFileSync(exAbs, '', 'utf8');
  } catch { /* 무시 */ }
  try {
    ensureLine(exAbs, '**/.claude/worktrees/');
    ensureLine(exAbs, '.dflow.local');
  } catch { /* 무시 */ }

  const LW = path.join(PRIMARY, '.claude', 'worktrees', `lead-${name}`);
  if (fs.existsSync(LW)) {
    process.stdout.write(`EXISTS ${LW}\n`);
  } else {
    runGit(['fetch', '-q', 'origin'], cwd);
    const wa = runGit(['worktree', 'add', '-q', '--detach', LW, `origin/${base}`], cwd);
    if (wa.status !== 0) {
      process.stderr.write(wa.stderr !== '' ? wa.stderr : `FAIL WORKTREE_ADD ${LW}\n`);
      return 2;
    }
    process.stdout.write(`CREATED ${LW} (origin/${base}, detached)\n`);
  }

  // 스킬 링크: .claude/skills 가 git 추적되지 않을 때
  const ls1 = runGit(['ls-files', '.claude/skills'], PRIMARY);
  const trackedSkills = (ls1.status === 0 ? ls1.stdout : '').split('\n').find((l) => l !== '');
  if (trackedSkills === undefined) {
    try { ensureLine(exAbs, '/.claude/skills'); } catch { /* 무시 */ }
    try { fs.mkdirSync(path.join(LW, '.claude'), { recursive: true }); } catch { /* 무시 */ }
    const dst = path.join(LW, '.claude', 'skills');
    if (!fs.existsSync(dst)) {
      try { fs.symlinkSync(path.join(PRIMARY, '.claude', 'skills'), dst, 'dir'); } catch { /* 무시 */ }
    }
  } else {
    const ls2 = runGit(['ls-files', '.claude/skills/dflow-dev'], PRIMARY);
    const trackedDev = (ls2.status === 0 ? ls2.stdout : '').split('\n').find((l) => l !== '');
    if (trackedDev === undefined) {
      try { ensureLine(exAbs, '/.claude/skills/dflow-*'); } catch { /* 무시 */ }
      try { fs.mkdirSync(path.join(LW, '.claude', 'skills'), { recursive: true }); } catch { /* 무시 */ }
      let entries = [];
      try { entries = fs.readdirSync(path.join(PRIMARY, '.claude', 'skills')); } catch { entries = []; }
      for (const s of entries) {
        if (!s.startsWith('dflow-')) continue;
        const src = path.join(PRIMARY, '.claude', 'skills', s);
        const dst = path.join(LW, '.claude', 'skills', s);
        try { if (!fs.statSync(src, { throwIfNoEntry: false })) continue; } catch { continue; }
        if (fs.existsSync(dst)) continue;
        try { fs.symlinkSync(src, dst, 'dir'); } catch { /* 무시 */ }
      }
    }
  }

  if (isNew) {
    const lwDot = path.join(LW, '.dflow');
    const pDot = path.join(PRIMARY, '.dflow');
    let lwDotExists = false;
    try { lwDotExists = fs.existsSync(lwDot); } catch { lwDotExists = false; }
    let pDotIsFile = false;
    try { pDotIsFile = fs.statSync(pDot).isFile(); } catch { pDotIsFile = false; }
    if (!lwDotExists && pDotIsFile) {
      try { fs.symlinkSync(pDot, lwDot); } catch { /* 무시 */ }
      process.stdout.write(`DFLOW_LINKED ${lwDot}\n`);
    }
    const lwLocal = path.join(LW, '.dflow.local');
    if (fs.existsSync(lwLocal)) {
      process.stdout.write(`LOCAL_KEPT ${lwLocal}\n`);
    } else {
      try {
        const t = fs.readFileSync(path.join(PRIMARY, '.dflow.local'), 'utf8');
        const kept = t.split('\n').filter((ln) => !/^[ \t]*as[ \t]*=/.test(ln)).join('\n');
        fs.writeFileSync(lwLocal, kept, { mode: 0o600 });
        try { fs.chmodSync(lwLocal, 0o600); } catch { /* 무시 */ }
      } catch { /* 원본 grep || [ $? = 1 ] 와 같이 빈 파일도 허용 */ try { fs.writeFileSync(lwLocal, '', { mode: 0o600 }); } catch { /* 무시 */ } }
      process.stdout.write(`LOCAL_COPIED ${lwLocal} (as 는 뺐다)\n`);
    }
  } else {
    const lwEnv = path.join(LW, '.env');
    let pEnvIsFile = false;
    try { pEnvIsFile = fs.statSync(path.join(PRIMARY, '.env')).isFile(); } catch { pEnvIsFile = false; }
    if (fs.existsSync(lwEnv)) {
      process.stdout.write(`ENV_KEPT ${lwEnv}\n`);
    } else if (pEnvIsFile) {
      try {
        const t = fs.readFileSync(path.join(PRIMARY, '.env'), 'utf8');
        const kept = t.split('\n').filter((ln) => !/^[ \t]*(export[ \t]+)?DFLOW_AS=/.test(ln)).join('\n');
        fs.writeFileSync(lwEnv, kept, { mode: 0o600 });
        try { fs.chmodSync(lwEnv, 0o600); } catch { /* 무시 */ }
      } catch { try { fs.writeFileSync(lwEnv, '', { mode: 0o600 }); } catch { /* 무시 */ } }
      process.stdout.write(`ENV_COPIED ${lwEnv} (DFLOW_AS 는 뺐다)\n`);
    } else {
      process.stdout.write(`ENV_MISSING 주 체크아웃에 .env 가 없다. ${lwEnv} 를 만들어라\n`);
    }
  }

  process.stdout.write(`NEXT 1) 키는 /dflow-team 이 시작할 때 정한다(다른 워크트리의 팀장이 쓰는 신원은 후보에서 빠진다). 미리 정하려면 ${LW}/.dflow.local 에 as=<prefix>(레거시는 .env 에 DFLOW_AS=<prefix>)\n`);
  process.stdout.write(`NEXT 2) cd ${LW} && claude  →  /dflow-team <종료시각> …\n`);
  return 0;
}

function isMainEntry() {
  try {
    if (!process.argv[1]) return false;
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch { return false; }
}
if (isMainEntry()) {
  let rc = 70;
  try { rc = main(process.argv.slice(2)); } catch (e) {
    try { process.stderr.write(`내부 오류: ${(e && e.stack) || e}\n`); } catch { /* 무시 */ }
    rc = 70;
  }
  process.exitCode = rc ?? 0;
}

