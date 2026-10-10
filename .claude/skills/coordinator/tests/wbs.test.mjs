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
