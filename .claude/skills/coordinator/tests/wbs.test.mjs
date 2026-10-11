// scripts/wbs.mjs + coord-state wbs-* + 자동 호출(init·틱·close-run) 시험(node --test tests/wbs.test.mjs).
//   임시 HOME·상태 폴더·임시 git 리포만 쓴다. 실제 파일 열기는 하지 않는다 — COORD_WBS_OPENER 를 기록용 스텁(또는 none)으로 바꾼다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COORD_ROOT } from './support/rng.mjs';
import { renderWbs, splitArgv, tally } from '../scripts/wbs.mjs';
import { lastReport, memoNext, parseBriefTodo, reportDoneIds } from '../scripts/lib/wbs-ahead.mjs';

const WBS = join(COORD_ROOT, 'scripts', 'wbs.mjs');
const TICK = join(COORD_ROOT, 'scripts', 'tick.mjs');
const CSTATE = join(COORD_ROOT, 'scripts', 'coord-state.mjs');
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function sh(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
}

/** 임시 세계. opener: 'none' | 'stub'(호출 경로를 opened.log 에 한 줄씩 남김) | 'real'(설정하지 않음 — 쓰지 말 것) */
function world({ cfg = {}, opener = 'stub', init = true, auto = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-test-'));
  for (const d of ['home', 'tmp', 'repo']) mkdirSync(join(dir, d));
  const repo = join(dir, 'repo');
  sh(repo, 'init', '-q', '-b', 'dev');
  sh(repo, 'commit', '-q', '--allow-empty', '-m', 'base');
  sh(repo, 'checkout', '-q', '-b', 'lane-a');
  sh(repo, 'commit', '-q', '--allow-empty', '-m', 'a1');
  sh(repo, 'commit', '-q', '--allow-empty', '-m', 'a2');
  sh(repo, 'checkout', '-q', 'dev');
  sh(repo, 'checkout', '-q', '-b', 'lane-m');
  sh(repo, 'commit', '-q', '--allow-empty', '-m', 'm1');
  sh(repo, 'checkout', '-q', 'dev');
  sh(repo, 'merge', '-q', '--no-ff', '-m', 'merge lane-m', 'lane-m');
  const stateRoot = join(dir, 'state');
  writeFileSync(join(repo, '.coord.local.json'), JSON.stringify({ state_dir: stateRoot, integration_branch: 'dev', office: { enabled: false }, usage: { sources: [] }, ...cfg }));
  const log = join(dir, 'opened.log');
  const stub = join(dir, 'opener-stub.mjs');
  writeFileSync(stub, `import { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(log)}, process.argv[2] + '\\n');\n`);
  const env = { PATH: process.env.PATH, HOME: join(dir, 'home'), USERPROFILE: join(dir, 'home'), TMPDIR: join(dir, 'tmp'), TZ: 'Asia/Seoul', COORD_REPO: repo,
    COORD_STATE_ROOT: stateRoot, COORD_CONSOLE_POLL: '0', COORD_SESSION_ID: 'wbs-test-sess', CLAUDE_PID: '0', COORD_RUN: 'r1',
    COORD_WBS_OPENER: opener === 'stub' ? `node "${stub}"` : 'none', ...(auto ? {} : { COORD_WBS_AUTO: '0' }) };
  const run = (script, args, extra = {}) => spawnSync(process.execPath, [script, ...args], { env: { ...env, ...extra }, cwd: repo, encoding: 'utf8', timeout: 120000 });
  const w = {
    dir, env, stateRoot, repo, log, run,
    cs: (...args) => { const r = run(CSTATE, args); assert.equal(r.status, 0, `coord-state ${args.join(' ')}: ${r.stderr}`); return r.stdout; },
    wbs: (...args) => run(WBS, args),
    tick: (...args) => run(TICK, args),
    state: () => JSON.parse(readFileSync(join(stateRoot, 'r1', 'state.json'), 'utf8')),
    file: join(stateRoot, 'r1', 'WBS.md'),
    md: () => readFileSync(join(stateRoot, 'r1', 'WBS.md'), 'utf8'),
    opened: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []),
    waitOpened: (n) => { for (let i = 0; i < 60 && w.opened().length < n; i++) sleep(100); return w.opened(); },
    clean: () => rmSync(dir, { recursive: true, force: true }),
  };
  if (init) w.cs('init', 'r1', '--goal', 'WBS 시험');
  return w;
}
const addLanes = (w) => {
  w.cs('lane-add', 'a1', JSON.stringify({ branch: 'lane-a', group: '1. 앞단', memo: '/x', session: { kind: 'claude', model: 'sonnet', effort: 'high' },
    items: [{ id: '1', title: '첫 일', weight: 2, done: true }, { id: '2', title: '둘째|일', weight: 1, done: false }] }));
  w.cs('lane-add', 'm1', JSON.stringify({ branch: 'lane-m', group: '1. 앞단', memo: '/x', session: { kind: 'opencode' }, items: [{ id: '1', title: '끝난 일', weight: 1, done: true }] }));
  w.cs('lane-add', 'z1', JSON.stringify({ branch: 'no-such-branch', memo: '/x', runner: 'GLM 인수', items: [{ id: '1', title: '묶음 없음', weight: 1, done: false }] }));
};

test('순수 함수: tally 가중치·내림, splitArgv 따옴표', () => {
  assert.deepEqual(tally([{ weight: 2, done: true }, { done: false }, { weight: 3, done: false }]), { d: 2, t: 6, p: 33 });
  assert.deepEqual(tally(undefined), { d: 0, t: 0, p: 0 });
  assert.deepEqual(splitArgv(`node "a b/c.mjs" --x 'y z' ''`), ['node', 'a b/c.mjs', '--x', 'y z', '']);
  const { text, pct } = renderWbs({ run: { id: 'r', goal: '목표' }, lanes: { l: { items: [{ id: 1, title: 't', done: true }], state: 'active' } } },
    { now: '2026-01-01 00:00', commits: () => 3, branchState: () => ({ gone: false, merged: false }), metrics: null });
  assert.equal(pct, 100);
  assert.match(text, /^# WBS — r\n/);
  assert.match(text, /\| l \| - \| ██████████ 100% \| - \| active \| ☑ 1\.t \|/, '브랜치가 없으면 커밋 -, 실행자 -');
});

test('wbs.mjs: 묶음·가중치·실행자·커밋 수·머지됨 상태를 그린다', () => {
  const w = world({ opener: 'none' });
  try {
    addLanes(w);
    const r = w.wbs();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, `WBS 60% ${w.file}\n`, '완료 가중치 2+1 / 전체 3+1+1');
    const md = w.md();
    assert.match(md, /^# WBS — r1\n\n- 목표: WBS 시험\n- 갱신: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\n\n\*\*전체 ██████░░░░ 60%\*\*/);
    assert.match(md, /## 1\. 앞단 — 75%\n\n\| lane \| runner \| progress \| commits \| state \| items \|/);
    assert.match(md, /\| a1 \| Claude sonnet·high \| ███████░░░ 66% \| 2 \| active \| ☑ 1\.첫 일<br>☐ 2\.둘째\\\|일 \|/);
    assert.match(md, /\| m1 \| opencode \| ██████████ 100% \| 0 \| merged \| ☑ 1\.끝난 일 \|/);
    assert.match(md, /## 레인 — 0%\n\n[^]*\| z1 \| GLM 인수 \| ░░░░░░░░░░ 0% \| - \| active \|/);
  } finally { w.clean(); }
});

test('wbs-phase·wbs-done·wbs-issue: state.wbs 와 WBS.md 에 반영, 없는 항목은 종료 코드 2', () => {
  const w = world({ opener: 'none' });
  try {
    addLanes(w);
    assert.equal(w.cs('wbs-phase', '0. 착수', '규칙 문서 작성'), 'OK\n');
    w.cs('wbs-phase', '0. 착수', '레인 기동', '--weight', '2');
    w.cs('wbs-phase', '9. 마감', '최종 보고');
    assert.deepEqual(w.state().wbs.phases.map((p) => [p.name, p.items.map((i) => [i.title, i.weight, i.done])]),
      [['0. 착수', [['규칙 문서 작성', 1, false], ['레인 기동', 2, false]]], ['9. 마감', [['최종 보고', 1, false]]]]);
    assert.equal(w.cs('wbs-done', '0. 착수', '규칙', '--note', '커밋 abc'), 'OK\n');
    w.cs('wbs-done', '0. 착수', '2');   // 번호(1부터)
    assert.equal(w.run(CSTATE, ['wbs-done', '0. 착수', '없는 항목']).status, 2);
    assert.equal(w.run(CSTATE, ['wbs-done', '없는 단계', '1']).status, 2);
    assert.equal(w.run(CSTATE, ['wbs-phase', '단계']).status, 2, '제목 없음');
    assert.equal(w.run(CSTATE, ['wbs-phase', '단계', '제목', '--weight', '0']).status, 2);
    assert.equal(w.cs('wbs-issue', '결정 필요: A 안 vs B 안'), 'OK\n');
    const st = w.state();
    assert.equal(st.wbs.phases[0].items[0].note, '커밋 abc');
    assert.deepEqual(st.wbs.issues, ['결정 필요: A 안 vs B 안']);
    const md = w.md();   // 레인 3/5 + 단계 (1+2)/(1+2+1)
    assert.match(md, /## 0\. 착수 — 100%\n\n- ☑ 규칙 문서 작성 — 커밋 abc\n- ☑ 레인 기동\n/);
    assert.match(md, /## 9\. 마감 — 0%\n\n- ☐ 최종 보고\n/);
    assert.match(md, /## 이슈·결정\n\n- 결정 필요: A 안 vs B 안\n/);
    assert.match(md, /완료 6\/9\)/);
    assert.doesNotMatch(w.cs('progress'), /착수/, 'progress 명령은 레인만 센다(기존 출력 불변)');
  } finally { w.clean(); }
});

test('틱: TICK quiet 출력·stderr 불변, WBS.md 를 조용히 만들고 시각만 다르면 다시 쓰지 않는다', () => {
  const w = world({ opener: 'none' });
  try {
    rmSync(w.file, { force: true });
    const r = w.tick('--no-answer');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'TICK quiet\n');
    assert.equal(r.stderr, '');
    assert.equal(existsSync(w.file), true, '틱이 WBS.md 를 만든다');
    // 시각 줄만 옛 값으로 바꾸고 mtime 도 옛날로: 다시 쓰지 않으면 그대로 남는다
    writeFileSync(w.file, w.md().replace(/^- 갱신: .*$/m, '- 갱신: 1999-01-01 00:00'));
    const old = new Date('2000-01-01T00:00:00Z');
    utimesSync(w.file, old, old);
    assert.equal(w.tick('--no-answer').stdout, 'TICK quiet\n');
    assert.match(w.md(), /- 갱신: 1999-01-01 00:00/);
    // 내용이 바뀌면 다시 쓴다
    w.cs('wbs-issue', '새 이슈');
    assert.match(w.md(), /새 이슈/);
    assert.doesNotMatch(w.md(), /1999-01-01/);
    // --dry-run 틱은 WBS 를 건드리지 않는다
    writeFileSync(w.file, 'dry');
    assert.equal(w.tick('--dry-run', '--no-answer').stdout, 'TICK quiet\n');
    assert.equal(w.md(), 'dry');
  } finally { w.clean(); }
});

test('자동 열기: init 에서 한 번 열고 opened_at 기록, close-run 에서 다시 연다', () => {
  const w = world({ opener: 'stub' });
  try {
    assert.equal(existsSync(w.file), true, 'init 이 WBS.md 를 만든다');
    assert.deepEqual(w.waitOpened(1), [w.file]);
    for (let i = 0; i < 40 && !w.state().wbs?.opened_at; i++) sleep(100);
    assert.match(w.state().wbs.opened_at, /^\d{4}-\d{2}-\d{2}T/);
    w.tick('--no-answer');
    w.cs('wbs-issue', '이슈');
    sleep(500);
    assert.equal(w.opened().length, 1, '틱·wbs-issue 는 열지 않는다');
    w.cs('close-run');
    assert.equal(w.waitOpened(2).length, 2, 'close-run 이 최종 WBS 를 다시 연다');
    assert.ok(w.state().run.closed_at);
  } finally { w.clean(); }
});

test('wbs.auto_open=false: 만들되 열기 명령을 실행하지 않는다 / COORD_WBS_AUTO=0: 자동 생성 없음', () => {
  const w = world({ cfg: { wbs: { auto_open: false } }, opener: 'stub' });
  try {
    assert.equal(existsSync(w.file), true);
    w.wbs('--open');
    w.cs('close-run');
    sleep(700);
    assert.deepEqual(w.opened(), [], '열기 스텁이 한 번도 불리지 않는다');
    assert.equal(w.state().wbs?.opened_at ?? null, null);
  } finally { w.clean(); }
  const w2 = world({ auto: false, opener: 'stub' });
  try {
    assert.equal(existsSync(w2.file), false, '자동 호출 끔');
    assert.equal(w2.wbs().status, 0, '수동 호출은 그대로');
    assert.equal(existsSync(w2.file), true);
  } finally { w2.clean(); }
});

test('지표: wbs.metrics_cmd 출력은 ## 지표 아래에, 실패는 한 줄 알림(치명 아님)', () => {
  const ok = world({ opener: 'none', init: false });
  try {
    writeFileSync(join(ok.dir, 'metrics.mjs'), `process.stdout.write('| 항목 | 값 |\\n|---|---|\\n| a | 1 |\\n');\n`);
    writeFileSync(join(ok.repo, '.coord.local.json'), JSON.stringify({ state_dir: ok.stateRoot, office: { enabled: false }, wbs: { metrics_cmd: ['node', join(ok.dir, 'metrics.mjs')] } }));
    ok.cs('init', 'r1');
    assert.equal(ok.wbs().status, 0);
    assert.match(ok.md(), /## 지표\n\n\| 항목 \| 값 \|\n\|---\|---\|\n\| a \| 1 \|\n$/);
  } finally { ok.clean(); }
  const bad = world({ opener: 'none', init: false });
  try {
    writeFileSync(join(bad.repo, '.coord.local.json'), JSON.stringify({ state_dir: bad.stateRoot, office: { enabled: false }, wbs: { metrics_cmd: 'node -e "process.exit(3)"' } }));
    bad.cs('init', 'r1');
    const r = bad.wbs();
    assert.equal(r.status, 0, r.stderr);
    assert.match(bad.md(), /## 지표\n\n> 지표 명령 실패: 종료 코드 3\n/);
  } finally { bad.clean(); }
  const none = world({ opener: 'none', init: false });
  try {
    writeFileSync(join(none.repo, '.coord.local.json'), JSON.stringify({ state_dir: none.stateRoot, office: { enabled: false }, wbs: { metrics_cmd: ['no-such-command-xyz'] } }));
    none.cs('init', 'r1');
    assert.equal(none.wbs().status, 0);
    assert.match(none.md(), /> 지표 명령 실행 실패: ENOENT/);
  } finally { none.clean(); }
});

test('--help 와 회차 없음', () => {
  const r = spawnSync(process.execPath, [WBS, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /사용법: wbs\.mjs \[--open\] \[--print\] \[--quiet\]/);
  const dir = mkdtempSync(join(tmpdir(), 'wbs-norun-'));
  try {
    const r2 = spawnSync(process.execPath, [WBS], { encoding: 'utf8', cwd: dir, env: { PATH: process.env.PATH, HOME: dir, COORD_REPO: dir, COORD_STATE_ROOT: join(dir, 's'), COORD_RUN: 'nope' } });
    assert.equal(r2.status, 3);
    assert.equal(r2.stdout, '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- 「앞으로」 모드(wbs.mjs --ahead · ## 앞으로 · items-from-brief) ----------
const BRIEF_A = `[조정→a] 착수 지시

## 레인

- 레인: a

## 할 일

계획 정본: 어딘가. 설명 문단.

1. t1 순수 \`canvas/x.ts\`: 맞춤·간격 (Task 1) (크기 M)
2. t2 정렬 연결(가: 나, 다) (크기 L)
   - 하위 줄은 무시
3. 이름 없는 일 (크기 S)
4. m 시험 전부 → squash → 머지 요청 (S)

참고:
- 덧말

## 보고 방식

1. dev 최신을 합침
2. squash
`;

test('앞으로 순수 함수: brief 할 일 파싱·보고 완료 추정·메모 다음·마지막 보고', () => {
  assert.deepEqual(parseBriefTodo(BRIEF_A), [
    { id: 't1', title: '순수 `canvas/x.ts`', weight: 2 },
    { id: 't2', title: '정렬 연결(가: 나, 다)', weight: 3 },
    { id: '3', title: '이름 없는 일', weight: 1 },
    { id: 'm', title: '시험 전부 → squash → 머지 요청', weight: 1 },
  ], '다른 절의 번호 목록·하위 줄은 무시, (S) 도 크기, 괄호 안 콜론에서 자르지 않음');
  assert.deepEqual(parseBriefTodo('## 레인\n\n1. x 일\n'), [], '할 일 절 없음');
  const rep = ['- 2026-10-11T16:00:00+09:00 t1 완료 커밋 abc, t2 착수', '- 2026-10-11T16:10:00+09:00 머지 요청 fe618f0d6 m', '- 2026-10-11T16:20:00+09:00 t20 끝'].join('\n');
  assert.deepEqual([...reportDoneIds(['t1', 't2', 'm', 'd', '3'], rep)].sort(), ['t1'], 't2 는 다른 마디, 한 글자 id 는 SHA·낱말 속에서 맞추지 않음');
  assert.deepEqual([...reportDoneIds(['m', 't2'], '- x m 완료\n- ☑ t2')].sort(), ['m', 't2'], '☑ <id> 도 끝남');
  assert.deepEqual([...reportDoneIds(['m'], '- m 시험 후 완료')], [], '한 글자 id 는 바로 다음 낱말만');
  // 리뷰 회귀: 줄 앞 시각의 분·초, 「2/5」, 부정, 다른 id 를 건너간 완료, 조건(끝나면)
  const neg = ['- 2026-10-11T17:10:42+09:00 t3 완료', '- 2/5 완료', '- T1 미완료', '- t4 아직 안 끝남', '- t6 not done', '- T2 착수 전 T7 완료', '- t8 끝나면 t9'].join('\n');
  assert.deepEqual([...reportDoneIds(['10', '42', '5', 'T1', 't4', 't6', 'T2', 't8', 't9'], neg)], []);
  assert.deepEqual([...reportDoneIds(['T7', 't3'], neg)].sort(), ['T7', 't3']);
  assert.deepEqual(parseBriefTodo('## 할 일\n\n설명\n\n1. API 설계 (크기 M)\n2. T1: 로그인 (크기 M)\n3. doc 문서\n\n```\n# 셸 주석\n```\n\n### 완료 기준\n\n1. x\n'),
    [{ id: '1', title: 'API 설계', weight: 2 }, { id: 'T1', title: '로그인', weight: 2 }, { id: 'doc', title: '문서', weight: 1 }], '대문자 낱말은 id 아님, id 끝 콜론, 목록 뒤 다른 절은 무시');
  assert.deepEqual(parseBriefTodo('## 할 일\n\n1. a1 일\n\n참고:\n2. b1 덧말 목록\n').map((i) => i.id), ['a1'], '목록이 끝나면 멈춤');
  assert.equal(memoNext('# 메모\n\n## 다음\n\n- [ ] 구현 시작\n- 그다음\n'), '구현 시작');
  assert.equal(memoNext('- 다음: 시험 실행\n'), '시험 실행');
  assert.equal(memoNext('없음'), '');
  assert.equal(lastReport('- 2026-10-11T16:00:00+09:00 첫 보고\n- 2026-10-11T16:05:00+09:00 \n'), '2026-10-11T16:00:00+09:00 첫 보고', '시각만 있는 줄은 건너뜀');
});

test('renderWbs: 항목 미등록 레인은 brief 추정·전체 줄에 등록 기준과 추정 포함을 나눠 적고 ## 앞으로 를 붙인다', () => {
  const st = {
    run: { id: 'r', cron_id: 'c1' },
    lanes: {
      a: { state: 'active', items: [], hold: { reason: 'merge-wait', until: null }, question: { at: 'x', text: 'A 안?' } },
      b: { state: 'active', items: [{ id: '1', title: '등록', weight: 1, done: false }, { id: '2', title: '끝', weight: 1, done: true }] },
      c: { state: 'closed', items: [] },
      z: { state: 'active', items: [] },
    },
    merge: { in_flight: { lane: 'b', branch: 'br-b', expected_tree: 'tree1', granted_at: 'g1' }, queue: [{ lane: 'a', branch: 'br-a' }], history: [] },
    pending_user: [{ at: '2026-10-11T10:00:00+09:00', text: '브랜치 x 지울까' }],
    windows: [],
  };
  const info = {
    now: '2026-01-01 00:00', commits: () => null, branchState: () => ({ gone: false, merged: false }), metrics: null,
    ahead: {
      files: { a: { brief: BRIEF_A, reports: '- 2026-10-11T16:00:00+09:00 t1 완료\n', memo: '## 다음\n- t2 착수\n' }, b: { reports: '- 2026-10-11T16:00:00+09:00 1 완료\n' }, c: { brief: BRIEF_A } },
      events: [{ kind: 'close-step', data: { step: '2' } }, { kind: 'window-close', data: { kind: 'measure' } }],
      runFiles: { runReport: false, metrics: true },
    },
  };
  const r = renderWbs(st, info);
  assert.equal(r.pct, 50, '등록 기준 = b 의 1/2 (coord-state progress 와 같은 셈)');
  assert.equal(r.est, 2);
  assert.equal(r.unknown, 1);
  // 추정: a = t1(2) 끝 / 2+3+1+1, c = closed 라 모두 끝(7/7) → (1+2+7)/(2+7+7) = 10/16 = 62%
  assert.match(r.text, /\*\*전체 █████░░░░░ 50%\*\* \(가중치 S=1·M=2·L=3 또는 항목 weight, 완료 1\/2\) · 추정 포함 62% \(brief 추정 가중치 9\/14 — 항목 미등록 레인 a, c\) · 항목·brief 모두 없음: z/);
  assert.match(r.text, /\| a \| - \| 추정 ███░░░░░░░ 28% \| - \| active \| \(brief 추정\)<br>☑ t1\.순수/);
  assert.match(r.text, /\| z \| - \| 항목 미등록 \| - \| active \|  \|/);
  const a = r.ahead;
  assert.match(a, /^## 앞으로\n\n### 레인\n\n- \*\*a\*\* \(active\) — 남은 3\/4 \(brief 추정\)\n  - ☐ t2\. 정렬 연결\(가: 나, 다\)\n/);
  assert.match(a, /  - 마지막 보고: 2026-10-11T16:00:00\+09:00 t1 완료\n  - 다음\(메모\): t2 착수\n  - 보류: merge-wait\n  - 질문 대기: A 안\?\n/);
  assert.match(a, /- \*\*b\*\* \(active\) — 남은 1\/2\n  - ☐ 1\. 등록 — 보고상 끝, `item-done` 필요\n/);
  assert.match(a, /- \*\*c\*\* \(closed\) — 끝\n/);
  assert.match(a, /- \*\*z\*\* \(active\) — 남은 항목 알 수 없음 \(항목 미등록 · brief 없음\)\n/);
  assert.match(a, /### 머지\n\n- 진행 중: b · br-b · tree1 · g1\n- 대기: a · br-a\n/);
  assert.match(a, /- ☑ 0\. 화면 프로파일링 — 측정 창 닫힘\n- ☐ 1\. 마감 조건 확인 — 남은 항목 4개 · 항목 모르는 레인 1개 · 머지 안 된 레인 3개 · 머지 진행 중 · 머지 대기 1건\n- ☑ 2\. 통합 확인 — close-step 이벤트\n- ☐ 3\. SUMMARY/);
  assert.match(a, /- ☐ 4\. 정리 확인\(워크트리·세션·감시\) — 안 닫힌 레인 3개 · cron 남음\n- ☑ 4\.5\. 측정\(run-metrics\.mjs\) — metrics\.md 있음\n- ☐ 5\. 마감 보고\n- ☐ 6\. 닫기\(close-run\)\n/);
  assert.match(a, /### 사용자 결정 대기\n\n- 2026-10-11T10:00:00\+09:00 브랜치 x 지울까\n- 레인 질문\(조정자 답 대기\): a\n$/);
  assert.ok(r.text.indexOf('## 앞으로') > 0 && r.text.endsWith(a), '앞으로 절은 이슈 뒤·지표 앞(지표 없으면 끝)');
  const none = renderWbs({ run: { id: 'r' }, lanes: { z: { items: [] } } }, { ...info, ahead: undefined });
  assert.match(none.text, /\*\*전체 ░░░░░░░░░░ -\*\* \(등록 항목 0개 — 진도 계산 불가\) · 항목·brief 모두 없음: z/);
  assert.match(none.text, /## 레인 — -\n/);
});

test('items-from-brief·자동 등록: lane-add·instr start 에서 active·항목 0개·brief 있음일 때만, 설정으로 끔', () => {
  const w = world({ opener: 'none' });
  const brief = (l) => { mkdirSync(join(w.stateRoot, 'r1', 'lanes', l), { recursive: true }); writeFileSync(join(w.stateRoot, 'r1', 'lanes', l, 'brief.md'), BRIEF_A); };
  try {
    brief('a');
    w.cs('lane-add', 'a', JSON.stringify({ memo: '/x' }));
    assert.deepEqual(w.state().lanes.a.items.map((i) => [i.id, i.weight, i.done]), [['t1', 2, false], ['t2', 3, false], ['3', 1, false], ['m', 1, false]], 'lane-add 가 brief 를 항목으로');
    w.cs('item-done', 'a', 't1');
    w.cs('lane-add', 'a', JSON.stringify({ priority: 1 }));
    assert.equal(w.state().lanes.a.items[0].done, true, '이미 항목이 있으면 덮어쓰지 않음');
    assert.equal(w.cs('items-from-brief', 'a'), 'ITEMS a skip has-items\n');
    assert.equal(w.cs('items-from-brief', 'a', '--force'), 'ITEMS a 4\n');
    assert.equal(w.state().lanes.a.items[0].done, false);
    // brief 가 lane-add 뒤에 생기면 instr start 가 등록
    w.cs('lane-add', 'b', JSON.stringify({ memo: '/x' }));
    assert.deepEqual(w.state().lanes.b.items, []);
    brief('b');
    w.cs('instr', 'b', 'nudge');
    assert.deepEqual(w.state().lanes.b.items, [], 'start 가 아닌 지시는 등록 안 함');
    assert.equal(w.cs('instr', 'b', 'start'), 'b-2\n', 'instr 출력 불변');
    assert.equal(w.state().lanes.b.items.length, 4);
    // 닫힌 레인 보호
    brief('c');
    w.cs('lane-add', 'c', JSON.stringify({ memo: '/x', state: 'closed' }));
    assert.deepEqual(w.state().lanes.c.items, []);
    assert.equal(w.cs('items-from-brief', 'c'), 'ITEMS c skip state=closed\n');
    assert.equal(w.cs('items-from-brief', 'b'), 'ITEMS b skip has-items\n');
    w.cs('lane-add', 'd', JSON.stringify({ memo: '/x' }));
    assert.equal(w.cs('items-from-brief', 'd'), 'ITEMS d skip no-brief\n');
    assert.equal(w.run(CSTATE, ['items-from-brief', 'nope']).status, 2, '없는 레인');
    assert.match(w.md(), /\| a \| Claude \| ░░░░░░░░░░ 0% \|/, '등록 뒤 WBS 를 다시 만듦');
  } finally { w.clean(); }
  const off = world({ opener: 'none', cfg: { wbs: { auto_items: false } } });
  try {
    mkdirSync(join(off.stateRoot, 'r1', 'lanes', 'a'), { recursive: true });
    writeFileSync(join(off.stateRoot, 'r1', 'lanes', 'a', 'brief.md'), BRIEF_A);
    off.cs('lane-add', 'a', JSON.stringify({ memo: '/x' }));
    off.cs('instr', 'a', 'start');
    assert.deepEqual(off.state().lanes.a.items, [], 'wbs.auto_items=false 면 자동 등록 없음');
    assert.equal(off.cs('items-from-brief', 'a'), 'ITEMS a 4\n', '수동 명령은 그대로');
  } finally { off.clean(); }
});

test('wbs.mjs --ahead: 한 줄 덧말·진행 요약·앞으로 절을 내고, close-step 이벤트·산출물로 마감 단계를 판정', () => {
  const w = world({ opener: 'none', cfg: { wbs: { auto_items: false } } });
  try {
    mkdirSync(join(w.stateRoot, 'r1', 'lanes', 'a'), { recursive: true });
    writeFileSync(join(w.stateRoot, 'r1', 'lanes', 'a', 'brief.md'), BRIEF_A);
    w.cs('lane-add', 'a', JSON.stringify({ memo: '/x' }));
    w.cs('report', 'a', 't1 완료 커밋 abc');
    w.cs('event', 'close-step', '-', '{"step":"5"}');
    writeFileSync(join(w.stateRoot, 'r1', 'run-report.md'), '# r');
    const r = w.wbs('--ahead');
    assert.equal(r.status, 0, r.stderr);
    const [first, ...rest] = r.stdout.split('\n');
    assert.equal(first, `WBS 0% ${w.file} (등록 항목 0개 · 추정 포함 28%)`);
    const body = rest.join('\n');
    assert.match(body, /^\n\*\*전체 ░░░░░░░░░░ -\*\* \(등록 항목 0개 — 진도 계산 불가\) · 추정 포함 28%/);
    assert.match(body, /## 진행\n\n- a: 추정 28% \(끝난 항목 1\/4\) · active\n/);
    assert.match(body, /## 앞으로\n\n### 레인\n\n- \*\*a\*\* \(active\) — 남은 3\/4 \(brief 추정\)\n/);
    assert.match(body, /- ☑ 3\. SUMMARY\(run-report\.md\) — run-report\.md 있음\n/);
    assert.match(body, /- ☑ 5\. 마감 보고 — close-step 이벤트\n/);
    assert.match(w.md(), /## 앞으로\n/, 'WBS.md 에도 늘 붙음');
    const plain = w.wbs();
    assert.equal(plain.stdout, `WBS 0% ${w.file} (등록 항목 0개 · 추정 포함 28%)\n`, '--ahead 없으면 한 줄만');
  } finally { w.clean(); }
});
