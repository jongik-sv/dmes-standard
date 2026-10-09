#!/usr/bin/env node
// pred-reflected.mjs — /dflow-dev 「--worker」 행 G 의 기본 브랜치 반영 확인. pred-reflected.sh 의 node 판.
// 워커와 /dflow-team 팀장(선행 반영 사전 검사)이 함께 쓴다.
// 판정 = state.json phase=merged AND (증거 1 head_sha 조상 | 증거 2 DFlow-Order 트레일러 | 증거 3 머지 커밋 제목).
// 규칙의 정본은 dflow-dev/references/worker-mode.md 「행 G — 기본 브랜치 반영 확인」 이고, 이 스크립트는 그 실행체다.
// 판정 이력:
// - 종전에는 phase=merged 에 트레일러(증거 2) 하나를 AND 로 요구했다. 트레일러를 붙이라는 지시가 없어 부착이 우연에
//   맡겨졌고(작업마다 0건·13건), 2026-09-22 mdm-dict-v2 실측에서 선행 4건 TSK-03-07·03-09·03-11·03-12 가 origin/main 에
//   머지됐는데 트레일러가 0건이라 후속 3건 TSK-03-10·03-13·04-01 이 모두 막혔다. 지금은 커밋 규칙과 /dflow-merge 가
//   트레일러를 못 박지만 과거 커밋에는 없을 수 있고 훅으로 강제하지도 않아 증거를 셋으로 넓혔다.
// - state.json 정본 스키마에는 아직 head_sha 가 없다(같은 실측: 막혔던 선행 4건 모두 없음). 그래서 증거 1 은 거의 늘 판정
//   불가로 건너뛰고 증거 3(머지 커밋 제목)이 실제 사례를 푼다(네 건 모두 증거 3 은 있었다). 그래도 증거 1 을 첫 자리에
//   두는 이유: 커밋 메시지·state.json 값 없이도 성립하는 유일한 구조적 증거라, 스키마가 head_sha 를 갖게 되면 곧바로
//   가장 강한 증거가 된다.
// - 트레일러 패턴의 콜론 뒤 공백: 2026-09-17 실측에서 공백 없는 패턴 0 건, 공백 있는 패턴 2 건이었다.
//
// 사용: pred-reflected.mjs <TASKS> <선행TSK> <DEV_BRANCH>   cwd = 리포(워크트리) 루트. 부르기 전에 git fetch origin 을 한다.
//   <TASKS> 는 선행 Task 폴더의 부모(예 docs/tasks). 이 스크립트는 fetch 하지 않는다.
// 출력 첫 낱말: REFLECTED <1|2|3>(exit 0) · NOT_REFLECTED <사유>(exit 1) · UNKNOWN <사유>(exit 2)
// UNKNOWN 은 판정 불가다. 호출자는 그것을 "반영 안 됨" 으로 단정하지 않는다(팀장은 거르지 않고 워커에 맡긴다).
// `.sh` 판은 jq 를 요구했지만 이 판은 node 내장 JSON 을 쓰므로 `UNKNOWN no-jq` 는 내지 않는다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

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

function git(args, { input } = {}) {
  const r = spawnSync('git', args, {
    input, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const jqStr = (v) => {
  // `jq -r '.K // ""'` 와 같다: 없음·null → '', 문자열 그대로, 수·불리언은 텍스트, 객체·배열은 jq pretty 출력.
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v);
  return JSON.stringify(v, null, 2);
};

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
  // jq(`jq -r '.phase // ""'` 등)와 같은 판정. 입력 없음(빈 state.json) → 값 없음 exit 0(아래 ''으로),
  // 배열·불리언·수·문자열을 색인하면 jq 오류(exit 5) → UNKNOWN bad-state-json.
  const text = shown.stdout;
  let phase;
  let order;
  let head;
  if (text.trim() === '') {
    phase = '';
    order = '';
    head = '';
  } else {
    let st;
    try {
      st = JSON.parse(text);
    } catch {
      out('UNKNOWN bad-state-json\n');
      return 2;
    }
    if (st !== null && (typeof st !== 'object' || Array.isArray(st))) {
      out('UNKNOWN bad-state-json\n');
      return 2;
    }
    phase = jqStr(st?.phase);
    order = jqStr(st?.order);
    head = jqStr(st?.head_sha);
  }
  if (phase !== 'merged') {
    out(`NOT_REFLECTED phase=${phase === '' ? 'none' : phase}\n`);
    return 1;
  }

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
