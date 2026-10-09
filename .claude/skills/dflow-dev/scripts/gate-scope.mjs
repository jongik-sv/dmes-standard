#!/usr/bin/env node
// gate-scope.mjs — /dflow-dev 게이트 범위 판정. gate-scope.sh 의 node 판.
// 이 Task 가 바꾼 경로를 리포의 게이트 대응표(.dflow-gates)에 대 보고, 돌릴 게이트 명령을 낸다.
//
//   gate-scope.mjs --base <기점> [--map <파일>] [--ignore <경로 접두>]... [--paths-file <파일>]
//
// 대응표·바뀐 경로·전체로 가는 경우·출력 형식의 정본은 gate-scope.sh 머리 주석이다.
// 출력(stdout, 마지막 줄들). 판정 사유는 stderr 의 GATE_SCOPE_REASON 한 줄이다.
//   GATE_SCOPE none                  대응표가 없다 — 지금 동작 그대로(게이트는 기준선 명령 전체)
//   GATE_SCOPE module <명령>          (한 줄 이상) 이 명령들만 돈다. 같은 명령은 한 번만, 대응표 순서대로
//   GATE_SCOPE full <명령>            (한 줄 이상) full 줄의 명령을 모두 돈다
//   GATE_SCOPE invalid <사유>         exit 2 — 대응표 형식 오류·full 줄 없음·기점을 모름. 대응표가 없는 것처럼 한다
// `--help` 는 사용법을 내고 exit 0.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// fd 에 전부 쓸 때까지 루프한다(64KB 넘는 파이프도 잘리지 않는다).
const writeAll = (fd, data) => {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  let off = 0;
  while (off < buf.length) {
    let n;
    try { n = fs.writeSync(fd, buf, off); } catch (e) { if (e.code === 'EAGAIN') continue; return; }
    if (n <= 0) return;
    off += n;
  }
};
const out = (s) => { writeAll(1, s); };
const err = (s) => { writeAll(2, s); };

const TAB = '\t';

class Invalid extends Error {}

function gitTop() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  return (r.stdout ?? '').replace(/\n+$/, '');
}
function gitRun(args, { cwd } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function usage() {
  err('usage: gate-scope.mjs --base <기점> [--map <파일>] [--ignore <경로 접두>]... [--paths-file <파일>]\n');
}

// 셸 case 패턴을 정규식으로 바꾼다(`*` 는 `/` 도 넘는다). `[...]`·`?`·`\x` 를 처리한다.
function globToRegExp(pat) {
  let re = '';
  let i = 0;
  const n = pat.length;
  while (i < n) {
    const c = pat[i];
    if (c === '*') { re += '.*'; i++; }
    else if (c === '?') { re += '.'; i++; }
    else if (c === '\\' && i + 1 < n) { re += escapeRegExp(pat[i + 1]); i += 2; }
    else if (c === '[') {
      let j = i + 1;
      if (j < n && (pat[j] === '!' || pat[j] === '^')) j++;
      if (j < n && pat[j] === ']') j++;
      while (j < n && pat[j] !== ']') j++;
      if (j >= n) { re += '\\['; i++; }
      else {
        let cls = pat.slice(i + 1, j);
        if (cls.startsWith('!') || cls.startsWith('^')) cls = `^${cls.slice(1)}`;
        cls = cls.replace(/\\/g, '\\\\');
        re += `[${cls}]`;
        i = j + 1;
      }
    } else { re += escapeRegExp(c); i++; }
  }
  return new RegExp(`^${re}$`, 'u');
}
function escapeRegExp(c) {
  return c.replace(/[.*+?^${}()|[\]\\]/, '\\$&');
}

function matches(p, pat) {
  if (pat.includes('*') || pat.includes('?') || pat.includes('[')) return globToRegExp(pat).test(p);
  return p.startsWith(pat);
}

function sharedBuildFile(p) {
  if (p === '.dflow-gates' || p === 'build.gradle' || p === 'build.gradle.kts' || p === 'package.json'
    || p === 'pom.xml' || p === 'tsconfig.json' || p === 'tsconfig.base.json'
    || p.startsWith('buildSrc/') || p.startsWith('gradle/')) return true;
  const base = p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p;
  return base === 'settings.gradle' || base === 'settings.gradle.kts' || base === 'gradle.properties'
    || base === 'gradle-wrapper.properties' || base === 'libs.versions.toml' || base === 'pnpm-lock.yaml'
    || base === 'pnpm-workspace.yaml' || base === 'package-lock.json' || base === 'npm-shrinkwrap.json'
    || base === 'yarn.lock';
}

function main(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    out('usage: gate-scope.mjs --base <기점> [--map <파일>] [--ignore <경로 접두>]... [--paths-file <파일>]\n');
    return 0;
  }
  let BASE = '';
  let MAP = '';
  let PATHS_FILE = '';
  const ignores = [];
  // abspath: 상대 경로면 지금 cwd 기준 절대경로로. 셸 `$(pwd)` 와 같이 논리 경로($PWD)를 쓴다.
  // PWD 는 realpath(PWD)===realpath('.') 일 때만 믿는다.
  let logicalCwd = process.cwd();
  const PWD = process.env.PWD;
  if (PWD && path.isAbsolute(PWD)) {
    try {
      if (fs.realpathSync(PWD) === fs.realpathSync(process.cwd())) logicalCwd = PWD;
    } catch { /* cwd 유지 */ }
  }
  const abspath = (a) => (path.isAbsolute(a) ? a : `${logicalCwd}/${a}`);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base' || a === '--map' || a === '--ignore' || a === '--paths-file') {
      if (i + 1 >= argv.length) { usage(); return 2; }
      const v = argv[i + 1];
      if (a === '--base') BASE = v;
      else if (a === '--map') MAP = abspath(v);
      else if (a === '--ignore') ignores.push(v.startsWith('./') ? v.slice(2) : v);
      else PATHS_FILE = abspath(v);
      i++;
    } else { usage(); return 2; }
  }
  if (BASE === '') { usage(); return 2; }

  const failInvalid = (reason) => {
    err(`GATE_SCOPE_REASON ${reason}\n`);
    out(`GATE_SCOPE invalid ${reason}\n`);
    return 2;
  };

  let TOP;
  try {
    TOP = gitTop();
    if (TOP === null) return failInvalid('git 리포가 아님');
    process.chdir(TOP);
    if (gitRun(['rev-parse', '--verify', '-q', `${BASE}^{commit}`]).status !== 0) {
      return failInvalid(`기점 ${BASE} 를 모름`);
    }

    // 임시 파일을 쓰지 않는다(대응표·경로 모두 메모리에서 처리한다).

    // 1) 대응표 읽기
      let mapText;
      if (MAP !== '') {
        let isFile = false;
        try { isFile = fs.statSync(MAP).isFile(); } catch { isFile = false; }
        if (!isFile) {
          err(`GATE_SCOPE_REASON 대응표 ${MAP} 없음\n`);
          out('GATE_SCOPE none\n');
          return 0;
        }
        try {
          mapText = fs.readFileSync(MAP, 'utf8');
        } catch {
          throw new Invalid('대응표를 못 읽음');
        }
      } else {
        const shown = gitRun(['show', `${BASE}:.dflow-gates`], { cwd: TOP });
        if (shown.status !== 0) {
          err('GATE_SCOPE_REASON 기점에 .dflow-gates 없음\n');
          out('GATE_SCOPE none\n');
          return 0;
        }
        mapText = shown.stdout;
      }

      const full = [];
      const rules = []; // [pat, cmd]
      const rawLines = mapText.split('\n');
      for (let li = 0; li < rawLines.length; li++) {
        let line = rawLines[li].replace(/\r/g, '');
        // 루프 종료 뒤 빈 조각(마지막 줄바꿈)은 건너뛴다 — `read || [ -n ]` 와 같다.
        if (li === rawLines.length - 1 && line === '') continue;
        if (line === '' || line.startsWith('#')) continue;
        const trimmed = line.replace(/^[ \t\v\f]+/, '');
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        const ti = line.indexOf(TAB);
        if (ti === -1) throw new Invalid(`대응표 ${li + 1}행에 TAB 이 없음`);
        const key = line.slice(0, ti);
        const cmd = line.slice(ti + 1).replace(/^[ \t\v\f]+/, '').replace(/[ \t\v\f]+$/, '');
        if (key === '' || cmd === '') throw new Invalid(`대응표 ${li + 1}행의 경로나 명령이 비었음`);
        if (key === 'full') full.push(cmd);
        else if (key === 'prepare') { /* 무시한다 */ }
        else rules.push([key, cmd]);
      }
      if (full.length === 0) throw new Invalid('대응표에 full 줄이 없음');

      const emitFull = (reason) => {
        err(`GATE_SCOPE_REASON ${reason}\n`);
        for (const c of full) out(`GATE_SCOPE full ${c}\n`);
        return 0;
      };

      // 2) 바뀐 경로
      let pathsText;
      if (PATHS_FILE !== '') {
        let isFile = false;
        try { isFile = fs.statSync(PATHS_FILE).isFile(); } catch { isFile = false; }
        if (!isFile) throw new Invalid(`경로 파일 ${PATHS_FILE} 없음`);
        try {
          pathsText = fs.readFileSync(PATHS_FILE, 'utf8');
        } catch {
          throw new Invalid(`경로 파일 ${PATHS_FILE} 없음`);
        }
        pathsText = pathsText.replace(/\r/g, '');
      } else {
        const d = gitRun(['-c', 'core.quotePath=off', 'diff', '--name-only', '--no-renames', BASE, '--'], { cwd: TOP });
        if (d.status !== 0) throw new Invalid('git diff 실패');
        const l = gitRun(['-c', 'core.quotePath=off', 'ls-files', '--others', '--exclude-standard'], { cwd: TOP });
        if (l.status !== 0) throw new Invalid('git ls-files 실패');
        pathsText = `${d.stdout}${l.stdout}`;
      }

      // --ignore 가 절대경로면 리포 최상위 기준으로 바꾼다. 비교는 / 로 정규화한다(win32 역슬래시).
      let TOP_P = TOP;
      try { TOP_P = fs.realpathSync(TOP); } catch { /* 그대로 */ }
      const slash = (p) => p.replace(/\\/g, '/');
      const sTop = slash(TOP);
      const sTopP = slash(TOP_P);
      const ign = ignores.map((g) => {
        const sg = slash(g);
        if (sg.startsWith(`${sTop}/`)) return sg.slice(sTop.length + 1);
        if (sg.startsWith(`${sTopP}/`)) return sg.slice(sTopP.length + 1);
        return sg;
      });
      const ignored = (p) => {
        for (const g of ign) {
          if (g === '') continue;
          if (p.startsWith(g)) return true;
        }
        return false;
      };

      // 3) 경로마다 먼저 맞는 줄을 찾는다
      const hit = [];
      let left = false;
      for (let raw of pathsText.split('\n')) {
        let p = raw.startsWith('./') ? raw.slice(2) : raw;
        if (p === '') continue;
        if (ignored(p)) continue;
        if (sharedBuildFile(p)) return emitFull(`공용 빌드·설정 파일 변경: ${p}`);
        let found = -1;
        for (let i = 0; i < rules.length; i++) {
          if (matches(p, rules[i][0])) { found = i; break; }
        }
        if (found === -1) return emitFull(`대응표에 없는 경로: ${p}`);
        hit.push(found);
        left = true;
      }

      // 4) 맞은 줄의 명령을 대응표 순서대로, 같은 명령은 한 번만
      const hitSet = new Set(hit);
      const seen = new Set();
      const cmds = [];
      for (let i = 0; i < rules.length; i++) {
        if (!hitSet.has(i)) continue;
        const cmd = rules[i][1];
        if (cmd === '-') continue;
        if (seen.has(cmd)) continue;
        seen.add(cmd);
        cmds.push(cmd);
      }
      if (!left || cmds.length === 0) return emitFull('범위에 남은 코드 경로가 없음');
      err('GATE_SCOPE_REASON 모듈 범위\n');
      for (const c of cmds) out(`GATE_SCOPE module ${c}\n`);
      return 0;
  } catch (e) {
    if (e instanceof Invalid) return failInvalid(e.message);
    throw e;
  }
}

process.exitCode = main(process.argv.slice(2));
