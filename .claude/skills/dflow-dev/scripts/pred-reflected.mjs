#!/usr/bin/env node
// pred-reflected.mjs — /dflow-dev 「--worker」 행 G 의 기본 브랜치 반영 확인. pred-reflected.sh 의 node 판.
// 워커와 /dflow-team 팀장(선행 반영 사전 검사)이 함께 쓴다.
// 판정 = state.json phase=merged AND (증거 1 head_sha 조상 | 증거 2 DFlow-Order 트레일러 | 증거 3 머지 커밋 제목).
// 규칙의 정본은 dflow-dev/references/worker-mode.md 「행 G — 기본 브랜치 반영 확인」 이고, 이 스크립트는 그 실행체다.
//
// 사용: pred-reflected.mjs <TASKS> <선행TSK> <DEV_BRANCH>   cwd = 리포(워크트리) 루트. 부르기 전에 git fetch origin 을 한다.
//   <TASKS> 는 선행 Task 폴더의 부모(예 docs/tasks). 이 스크립트는 fetch 하지 않는다.
// 출력 첫 낱말: REFLECTED <1|2|3>(exit 0) · NOT_REFLECTED <사유>(exit 1) · UNKNOWN <사유>(exit 2)
// UNKNOWN 은 판정 불가다. 호출자는 그것을 "반영 안 됨" 으로 단정하지 않는다(팀장은 거르지 않고 워커에 맡긴다).
// `.sh` 판은 jq 를 요구했지만 이 판은 node 내장 JSON 을 쓰므로 `UNKNOWN no-jq` 는 내지 않는다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const out = (s) => { for (;;) { try { fs.writeSync(1, s); return; } catch (e) { if (e.code !== 'EAGAIN') return; } } };

function git(args, { input } = {}) {
  const r = spawnSync('git', args, {
    input, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const strOf = (v) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

function main(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    out('사용: pred-reflected.mjs <TASKS> <선행TSK> <DEV_BRANCH>\n출력 첫 낱말: REFLECTED <1|2|3>(exit 0) · NOT_REFLECTED <사유>(exit 1) · UNKNOWN <사유>(exit 2)\n');
    return 0;
  }
  if (argv.length !== 3 || argv[0] === '' || argv[1] === '' || argv[2] === '') {
    out('UNKNOWN usage\n');
    return 2;
  }
  let tasks = argv[0];
  if (tasks.endsWith('/')) tasks = tasks.slice(0, -1);
  const tsk = argv[1];
  const dev = argv[2];

  if (git(['rev-parse', '--verify', '-q', `refs/remotes/origin/${dev}`]).status !== 0) {
    out(`UNKNOWN no-dev-branch origin/${dev}\n`);
    return 2;
  }

  const shown = git(['show', `origin/${dev}:${tasks}/${tsk}/state.json`]);
  if (shown.status !== 0) {
    out('NOT_REFLECTED no-state\n');
    return 1;
  }
  let st;
  try {
    st = JSON.parse(shown.stdout);
  } catch {
    out('UNKNOWN bad-state-json\n');
    return 2;
  }
  const phase = strOf(st?.phase);
  if (phase !== 'merged') {
    out(`NOT_REFLECTED phase=${phase === '' ? 'none' : phase}\n`);
    return 1;
  }
  const order = strOf(st?.order);
  const head = strOf(st?.head_sha);

  // 증거 1 — 커밋 그래프의 조상 관계. head_sha 가 없으면 판정 불가로 건너뛴다.
  if (head !== '' && git(['merge-base', '--is-ancestor', head, `origin/${dev}`]).status === 0) {
    out('REFLECTED 1\n');
    return 0;
  }
  // 증거 2 — 트레일러. 콜론 뒤 공백을 반드시 넣는다(실제 트레일러가 "DFlow-Order: <uuid>").
  if (order !== '') {
    const logged = git(['log', `origin/${dev}`, `--grep=DFlow-Order: ${order}`, '--format=%h']);
    if (logged.status !== 0) {
      out('UNKNOWN git-log\n');
      return 2;
    }
    if (logged.stdout.trim() !== '') {
      out('REFLECTED 2\n');
      return 0;
    }
  }
  // 증거 3 — 머지 커밋 제목. TSK 뒤 공백까지 넣는다(TSK-03-1 이 TSK-03-10 을 집지 않게).
  const merges = git(['log', `origin/${dev}`, '--merges', `--grep=^merge: ${tsk} `, '--format=%h']);
  if (merges.status !== 0) {
    out('UNKNOWN git-log\n');
    return 2;
  }
  if (merges.stdout.trim() !== '') {
    out('REFLECTED 3\n');
    return 0;
  }
  out('NOT_REFLECTED no-evidence\n');
  return 1;
}

process.exitCode = main(process.argv.slice(2));
