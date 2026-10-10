// /dflow-merge 「4번 머지」 의 접힘 시험: phase=merged 와 결정 번호 매김이 머지 커밋 하나에 들어가는지 본다.
// 흐름 = merge --no-ff --no-commit → merge-conflicts → renumber --no-commit → state.json → git add → git commit --no-edit --cleanup=strip.
// 임시 git 저장소만 쓴다(스킬 문서의 명령 순서를 그대로 따른다).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeTempDir } from '../../_shared/node/proc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DECISIONS = path.join(HERE, '..', 'scripts', 'decisions.mjs');
const PRED = path.join(HERE, '..', '..', 'dflow-dev', 'scripts', 'pred-reflected.mjs');
const TS = '2026-10-10T00:00:00Z';
const ORDER = '11111111-2222-3333-4444-555555555555';
const SP = 'docs/tasks/TSK-9/state.json';

const tmps = [];
const tmp = (p) => {
  const d = fs.realpathSync(makeTempDir(p));
  tmps.push(d);
  return d;
};
after(() => {
  for (const d of tmps) fs.rmSync(d, { recursive: true, force: true });
});

function gitRaw(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  return { status: r.status, out: r.stdout, err: r.stderr };
}
function git(cwd, ...args) {
  const r = gitRaw(cwd, ...args);
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.err}`);
  return r.out;
}
const write = (repo, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), text);
};
const read = (repo, rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const block = (head, tag) => `${head}\n- **Phase**: build\n- **Decision needed**: q-${tag}\n- **Decision made**: a-${tag}\n- **Rationale**: r-${tag}\n`;
const state = (phase, extra = {}) => JSON.stringify({ tsk: 'TSK-9', order: ORDER, phase, ...extra }, null, 2) + '\n';

/** 기본 브랜치 main(결정 D-001 + state.json reported 브랜치) 과 agent 브랜치를 만든다. */
function setup({ devDecision = null, agentHead = `## D-TSK-9-1 (${TS})` } = {}) {
  const repo = tmp('mergefold-');
  git(repo, 'init', '-q', '-b', 'main');
  write(repo, 'decisions.md', `# Decisions Log — project\n\n${block(`## D-001 (${TS})`, 'base')}`);
  write(repo, 'README.md', 'base\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'seed');
  git(repo, 'checkout', '-q', '-b', 'agent/11111111-work');
  write(repo, 'decisions.md', `${read(repo, 'decisions.md')}\n${block(agentHead, 'agent')}`);
  write(repo, 'src/code.txt', 'work 1\nrefs D-TSK-9-1\n');
  write(repo, SP, state('reported'));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'feat(TSK-9): work');
  git(repo, 'checkout', '-q', 'main');
  if (devDecision) {
    write(repo, 'decisions.md', `${read(repo, 'decisions.md')}\n${block(devDecision, 'dev')}`);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'docs: dev decision');
  } else {
    write(repo, 'README.md', 'base\ndev change\n');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'docs: dev change');
  }
  return repo;
}

const MSG = ['-m', 'merge: TSK-9 제목 (approved)', '-m', `DFlow-Order: ${ORDER}`];
function dec(repo, ...args) {
  const r = spawnSync(process.execPath, [DECISIONS, ...args, '-C', repo], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

/** 문서의 4번 머지 순서. 끝에서 머지 커밋 하나를 만든다(push 는 안 함). */
function foldMerge(repo, { unapproved = false } = {}) {
  const pre = git(repo, 'rev-parse', 'HEAD').trim();
  const m = gitRaw(repo, 'merge', '--no-ff', '--no-commit', 'agent/11111111-work', ...MSG);
  const log = { pre, mergeOut: m.out + m.err };
  const conflicted = git(repo, 'diff', '--name-only', '--diff-filter=U').trim();
  if (conflicted) {
    log.conflictBefore = conflicted;
    log.mergeConflicts = dec(repo, 'merge-conflicts').out;
    log.conflictAfter = git(repo, 'diff', '--name-only', '--diff-filter=U').trim();
    assert.equal(log.conflictAfter, '', `남은 충돌: ${log.conflictAfter}`);
  }
  log.renumber = dec(repo, 'renumber', '--no-commit', '--tsk', 'TSK-9', '--order', ORDER);
  assert.equal(log.renumber.status, 0, log.renumber.out);
  write(repo, SP, state('merged', unapproved ? { unapproved: true } : {}));
  git(repo, 'add', SP);
  git(repo, 'commit', '--no-edit', '--cleanup=strip', '-q');
  return log;
}

function assertFolded(repo, pre) {
  const head = git(repo, 'rev-parse', 'HEAD').trim();
  assert.equal(git(repo, 'rev-list', '--count', '--first-parent', `${pre}..HEAD`).trim(), '1', '머지 뒤 첫 부모 줄에는 머지 커밋 하나만 있어야 한다');
  assert.equal(git(repo, 'rev-list', '--count', `${pre}..HEAD`).trim(), '2', '머지 커밋 + agent 작업 커밋 1개');
  assert.equal(git(repo, 'rev-list', '--parents', '-n', '1', 'HEAD').trim().split(' ').length, 3, '부모가 둘이어야 한다');
  assert.equal(git(repo, 'log', '-1', '--format=%s').trim(), 'merge: TSK-9 제목 (approved)');
  assert.equal(git(repo, 'log', '-1', '--format=%(trailers:key=DFlow-Order,valueonly)').trim(), ORDER);
  const subjects = git(repo, 'log', '--format=%s', `${pre}..HEAD`);
  assert.doesNotMatch(subjects, /chore\(/, '별도 chore 커밋이 없어야 한다');
  assert.equal(JSON.parse(git(repo, 'show', `${head}:${SP}`)).phase, 'merged', '머지 커밋 트리에 phase=merged');
  assert.equal(git(repo, 'status', '--porcelain').trim(), '');
  return head;
}

test('충돌 없는 머지: 번호 매김과 phase=merged 가 머지 커밋 하나에 들어간다', () => {
  const repo = setup();
  const log = foldMerge(repo);
  assert.match(log.renumber.out, /RENUMBERED D-TSK-9-1=D-002 decisions\.md/);
  assert.match(log.renumber.out, /STAGED 2/);
  assert.doesNotMatch(log.renumber.out, /COMMITTED/);
  const head = assertFolded(repo, log.pre);
  const dtext = git(repo, 'show', `${head}:decisions.md`);
  assert.match(dtext, /^## D-002 \(/m);
  assert.doesNotMatch(dtext, /D-TSK-9-1 \(/);
  assert.match(git(repo, 'show', `${head}:src/code.txt`), /refs D-002/, '참조도 새 번호로');
  // 행 G 의 반영 확인(pred-reflected)이 별도 chore 커밋 없이 머지 커밋만으로 반영을 판정한다.
  git(repo, 'update-ref', 'refs/remotes/origin/main', head);
  const pr = spawnSync(process.execPath, [PRED, 'docs/tasks', 'TSK-9', 'main'], { cwd: repo, encoding: 'utf8' });
  assert.equal(pr.status, 0, pr.stdout + pr.stderr);
  assert.match(pr.stdout, /^REFLECTED [23]/);
});

test('승인 전 머지: unapproved 표식도 같은 머지 커밋에 들어간다', () => {
  const repo = setup();
  const log = foldMerge(repo, { unapproved: true });
  const head = assertFolded(repo, log.pre);
  assert.equal(JSON.parse(git(repo, 'show', `${head}:${SP}`)).unapproved, true);
});

test('decisions.md 충돌: merge-conflicts 로 풀고도 머지 커밋 하나다', () => {
  const repo = setup({ devDecision: `## D-002 (${TS})` });
  const log = foldMerge(repo);
  assert.equal(log.conflictBefore, 'decisions.md');
  assert.match(log.mergeConflicts, /DECISIONS_RESOLVED/);
  const head = assertFolded(repo, log.pre);
  const dtext = git(repo, 'show', `${head}:decisions.md`);
  const heads = dtext.split('\n').filter((l) => /^## D-/.test(l)).map((l) => l.split(' ')[1]);
  assert.deepEqual(heads, ['D-001', 'D-002', 'D-003']);
  assert.match(dtext, /q-dev/);
  assert.match(dtext, /q-agent/);
  assert.equal(git(repo, 'log', '-1', '--format=%B').includes('# Conflicts'), false, '--cleanup=strip 이 충돌 주석을 지운다');
});

test('전역 번호 중복(머지 대상이 직접 D-002 를 매김): --no-commit 도 MERGE_HEAD 기준으로 옮긴다', () => {
  const repo = setup({ devDecision: `## D-002 (${TS})`, agentHead: '## D-002 (2026-10-10T01:00:00Z)' });
  const log = foldMerge(repo);
  assert.match(log.renumber.out, /DUP_RENUMBERED D-002=D-003 decisions\.md/);
  const head = assertFolded(repo, log.pre);
  const dtext = git(repo, 'show', `${head}:decisions.md`);
  const heads = dtext.split('\n').filter((l) => /^## D-/.test(l)).map((l) => l.split(' ')[1]);
  assert.deepEqual(heads, ['D-001', 'D-002', 'D-003']);
  assert.match(dtext, /Renumbered from\*\*: D-002/);
  // 개발 브랜치 쪽 D-002 는 그대로, 머지 대상 쪽이 D-003
  assert.match(dtext, /## D-002 \([^)]*\)\n- \*\*Phase\*\*: build\n- \*\*Decision needed\*\*: q-dev/);
});

test('임시 ID 없음: NO_TEMP_IDS, 머지 커밋은 state.json 만 더한다', () => {
  const repo = setup({ agentHead: `## D-002 (${TS})` });
  const log = foldMerge(repo);
  assert.match(log.renumber.out, /NO_TEMP_IDS/);
  assertFolded(repo, log.pre);
});

test('--no-commit 은 머지 도중이 아니면 RENUMBER_FAILED no-merge-head 로 멈춘다', () => {
  const repo = setup();
  const r = dec(repo, 'renumber', '--no-commit');
  assert.equal(r.status, 1);
  assert.match(r.out, /RENUMBER_FAILED no-merge-head/);
});

test('--no-commit 은 소스를 되돌리지 않는다: 기본 모드 renumber 는 여전히 커밋 하나를 만든다', () => {
  const repo = setup();
  git(repo, 'merge', '--no-ff', 'agent/11111111-work', ...MSG);
  const pre = git(repo, 'rev-parse', 'HEAD').trim();
  const r = dec(repo, 'renumber', '--tsk', 'TSK-9', '--order', ORDER);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /COMMITTED /);
  assert.equal(git(repo, 'rev-list', '--count', `${pre}..HEAD`).trim(), '1');
});

test('state.json 경로가 없어 git add 가 실패하면 merge --abort 로 머지 전으로 돌아간다', () => {
  const repo = setup();
  const pre = git(repo, 'rev-parse', 'HEAD').trim();
  const m = gitRaw(repo, 'merge', '--no-ff', '--no-commit', 'agent/11111111-work', ...MSG);
  assert.equal(m.status, 0, m.err);
  const r = dec(repo, 'renumber', '--no-commit', '--tsk', 'TSK-9', '--order', ORDER);
  assert.equal(r.status, 0, r.out);
  const add = gitRaw(repo, 'add', 'docs/tasks/NOPE/state.json');
  assert.notEqual(add.status, 0);
  git(repo, 'merge', '--abort');
  assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), pre);
  assert.equal(git(repo, 'status', '--porcelain').trim(), '');
  assert.equal(read(repo, 'README.md'), 'base\ndev change\n');
  assert.equal(fs.existsSync(path.join(repo, 'src/code.txt')), false);
});

test('push 실패 되돌림: reset --keep <기록한 HEAD> 가 머지 커밋 하나를 없앤다', () => {
  const repo = setup();
  const log = foldMerge(repo);
  git(repo, 'reset', '--keep', log.pre);
  assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), log.pre);
  assert.equal(git(repo, 'status', '--porcelain').trim(), '');
});
