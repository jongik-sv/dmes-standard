#!/usr/bin/env node
// 머지 충돌 해소 재시도 판정 — 팀장이 스윕의 "머지 실패(충돌)" id8 마다 부른다. (옛 resolve-decide.sh 를 node 로 옮긴 것.)
// 사용: resolve-decide.mjs <EVENTS> <LEAD_AGENT> <REPO> <id8> <DEV_SHA>
// 출력: RESOLVE <다음 시도 번호>(exit 0) · HUMAN <사유>(exit 1) · UNKNOWN <사유>(exit 2) · RUNNING(exit 3)
// node 18.17 이상, 외부 패키지 없음.
import fs from 'node:fs';

const USAGE = '사용: resolve-decide.mjs <EVENTS> <LEAD_AGENT> <REPO> <id8> <DEV_SHA>';
const HELP = '머지 충돌 해소 재시도 판정 — 팀장이 스윕의 "머지 실패(충돌)" id8 마다 부른다.\n'
  + USAGE + '\n'
  + '출력: RESOLVE <n>(0) · HUMAN <사유>(1) · UNKNOWN <사유>(2) · RUNNING(3)\n';

const MAX = 3;

function main(argv) {
  for (const a of argv) {
    if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
  }
  if (argv.length !== 5 || argv[3] === '' || argv[4] === '') {
    process.stdout.write('UNKNOWN usage\n');
    return 2;
  }
  const [ev, lead, repo, id8, dev] = argv;
  let isFile = false;
  try { isFile = fs.statSync(ev).isFile(); } catch { isFile = false; }
  if (!isFile) { process.stdout.write('RESOLVE 1\n'); return 0; }
  let text;
  try { text = fs.readFileSync(ev, 'utf8'); } catch {
    process.stdout.write('UNKNOWN bad-events\n');
    return 2;
  }
  const lines = [];
  for (const ln of text.split('\n')) {
    if (!/\S/.test(ln)) continue;
    let o;
    try { o = JSON.parse(ln); } catch {
      process.stdout.write('UNKNOWN bad-events\n');
      return 2;
    }
    if (o === null || typeof o !== 'object' || Array.isArray(o)) continue;
    if (o.agent !== lead || o.repo !== repo || (o.id8 ?? '') !== id8) continue;
    if (o.event === 'team.spawn') {
      if ((o.spawn_kind ?? 'new') === 'resolve') lines.push('S');
    } else if (o.event === 'team.result') {
      lines.push(`R	${o.status ?? ''}	${o.reason ?? ''}`);
    } else if (o.event === 'team.blocked') {
      lines.push('B');
    }
  }
  const n = lines.filter((l) => l === 'S').length;
  if (n === 0) { process.stdout.write('RESOLVE 1\n'); return 0; }
  let last = '';
  let seenS = false;
  for (const l of lines) {
    if (l === 'S') { seenS = true; last = ''; continue; }
    if (seenS && l !== '') last = l;
  }
  // S 뒤에 판정 줄이 없으면 RUNNING (S 가 없으면 위에서 끝났으므로 seenS 는 항상 참)
  if (last === '' || last === 'B') { process.stdout.write('RUNNING\n'); return 3; }
  if (n >= MAX) { process.stdout.write(`HUMAN 해소 상한(${n}/${MAX})\n`); return 1; }
  const parts = last.split('	');
  const status = parts[1] ?? '';
  const reason = parts[2] ?? '';
  const next = n + 1;
  if (status === 'resolved') {
    const ms = [...reason.matchAll(/base=([0-9a-f]+)/g)];
    const base = ms.length ? ms[ms.length - 1][1] : '';
    if (base === '') { process.stdout.write('HUMAN 해소 기준 불명\n'); return 1; }
    if (dev.startsWith(base)) { process.stdout.write(`HUMAN 같은 기준 재충돌(base=${base})\n`); return 1; }
    process.stdout.write(`RESOLVE ${next}\n`);
    return 0;
  }
  if (status === 'failed push-race' || status === 'failed rate-limit' || status === 'failed no-result' || status === 'skipped') {
    process.stdout.write(`RESOLVE ${next}\n`);
    return 0;
  }
  process.stdout.write(`HUMAN 재시도 불가(${status})\n`);
  return 1;
}

// 직접 실행·심링크 경로에서도 늘 main 을 실행한다(진입 가드 없음).
{
  let rc = 70;
  try { rc = main(process.argv.slice(2)); } catch (e) {
    try { process.stdout.write('UNKNOWN bad-events\n'); } catch { /* 무시 */ }
    rc = 2;
  }
  process.exitCode = rc ?? 0;
}

