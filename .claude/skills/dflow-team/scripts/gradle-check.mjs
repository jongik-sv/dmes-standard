#!/usr/bin/env node
// gradle-check <리포 경로> — Gradle 빌드 루트를 찾아 gradle.properties 의 권장 키 상태를 보고한다.
// (옛 gradle-check.sh 를 node 로 옮긴 것. 파일을 고치지 않는다.)
// 출력(한 줄씩): ROOT <경로> · NOFILE <경로> · MISSING <경로> <키,…> · OK <경로>
// 종료 코드: 0 · 2(사용 오류).
// node 18.17 이상, 외부 패키지 없음.
import fs from 'node:fs';
import path from 'node:path';

const USAGE = '사용: gradle-check.mjs [<리포 경로>]';
const HELP = 'Gradle 빌드 루트를 찾아 gradle.properties 의 권장 키 상태를 보고한다(읽기만 한다).\n'
  + USAGE + '\n'
  + '출력(한 줄씩): ROOT <경로> · NOFILE <경로> · MISSING <경로> <키,…> · OK <경로>\n'
  + '종료 코드: 0 · 2(사용 오류)\n';

const KEYS = ['org.gradle.caching', 'org.gradle.workers.max', 'org.gradle.daemon.idletimeout'];
const PRUNE = new Set(['node_modules', '.git', 'build', '.gradle', '.claude']);
const TARGET = new Set(['gradlew', 'settings.gradle', 'settings.gradle.kts']);

// 깊이 4 로 제한하고 PRUNE 밑은 내려가지 않는다. 결과는 코드포인트 순으로 같게 한다.
function findRoots(repo) {
  const found = new Set();
  const visit = (dir, depth) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const nm = e.name;
      const full = path.join(dir, nm);
      // find(심링크 미추적)와 같이 링크된 폴더에는 내려가지 않는다. 이름이 맞는 심링크 파일은 찾는다.
      if (e.isDirectory()) {
        if (PRUNE.has(nm)) continue;
        if (depth < 4) visit(full, depth + 1);
      } else if (TARGET.has(nm)) {
        found.add(dir);
      }
      void full;
    }
  };
  visit(repo, 0);
  return [...found].sort();
}

function main(argv) {
  for (const a of argv) {
    if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
  }
  if (argv.length > 1) { process.stderr.write(USAGE + '\n'); return 2; }
  const given = argv[0] ?? '.';
  let isDir = false;
  try { isDir = fs.statSync(given).isDirectory(); } catch { isDir = false; }
  if (!isDir) return 0;
  const REPO = path.resolve(given);
  const roots = findRoots(REPO);
  if (roots.length === 0) return 0;
  const out = [];
  for (const root of roots) {
    if (root !== REPO && fs.existsSync(path.join(root, '.git'))) continue;
    out.push(`ROOT ${root}`);
    const props = path.join(root, 'gradle.properties');
    let isFile = false;
    try { isFile = fs.statSync(props).isFile(); } catch { isFile = false; }
    if (!isFile) { out.push(`NOFILE ${root}`); continue; }
    let text = '';
    try { text = fs.readFileSync(props, 'utf8'); } catch { text = ''; }
    const missing = KEYS.filter((k) => !text.split('\n').some((ln) => new RegExp(`^[\\s]*${k}[\\s]*=`).test(ln)));
    if (missing.length > 0) out.push(`MISSING ${root} ${missing.join(',')}`);
    else out.push(`OK ${root}`);
  }
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  return 0;
}

// 직접 실행·심링크 경로에서도 늘 main 을 실행한다(진입 가드 없음).
{
  let rc = 0;
  try { rc = main(process.argv.slice(2)); } catch (e) {
    try { process.stderr.write(`내부 오류: ${(e && e.stack) || e}\n`); } catch { /* 무시 */ }
    rc = 70;
  }
  process.exitCode = rc ?? 0;
}

