// tests/run-metrics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { COORD_ROOT } from './support/rng.mjs';
import { collectMetrics, csvRow, CSV_HEADER, renderMarkdown } from '../scripts/run-metrics.mjs';

const SCRIPT = join(COORD_ROOT, 'scripts', 'run-metrics.mjs');
const PRICES = { 'claude-opus-5-5': [4, 20, 0.2], 'claude-sonnet-5-5': [2, 10, 0.2] };
const asst = (id, ts, model, u) => JSON.stringify({ type: 'assistant', requestId: `r${id}`, timestamp: ts, message: { id: `m${id}`, model, usage: u } });
const U1 = { input_tokens: 0, output_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 100000 }; // opus: 0.02 + 0.02 = 0.04

function sessionsFixture(root) {
  // 조정 세션 c1 은 projA, 레인 세션 l1 은 projB(다른 프로젝트 폴더) — Review Focus 5
  mkdirSync(join(root, 'projA'), { recursive: true });
  mkdirSync(join(root, 'projB', 'l1', 'subagents', 'workflows', 'wf_x'), { recursive: true });
  writeFileSync(join(root, 'projA', 'c1.jsonl'), [asst(1, '2026-10-10T03:00:00Z', 'claude-opus-5-5', U1), asst(1, '2026-10-10T03:00:01Z', 'claude-opus-5-5', U1)].join('\n'));
  writeFileSync(join(root, 'projB', 'l1.jsonl'), asst(2, '2026-10-10T03:05:00Z', 'claude-opus-5-5', U1));
  writeFileSync(join(root, 'projB', 'l1', 'subagents', 'agent-s.jsonl'), asst(3, '2026-10-10T03:06:00Z', 'claude-sonnet-5-5', U1));
  writeFileSync(join(root, 'projB', 'l1', 'subagents', 'workflows', 'wf_x', 'agent-w1.jsonl'), asst(4, '2026-10-10T03:07:00Z', 'claude-opus-5-5', U1));
  writeFileSync(join(root, 'projB', 'l1', 'subagents', 'workflows', 'wf_x', 'agent-w2.jsonl'), asst(5, '2026-10-10T03:08:00Z', 'claude-sonnet-5-5', U1));
  // 창 밖 메시지(무시)
  writeFileSync(join(root, 'projA', 'c1-old.jsonl'), '');
}

test('collectMetrics: 역할별 비용, 중복 제거, 다른 프로젝트 폴더, Workflow 지표', () => {
  const root = mkdtempSync(join(tmpdir(), 'rm-'));
  sessionsFixture(root);
  const m = collectMetrics({
    projectsDir: root, prices: PRICES, gapMin: 15,
    sinceMs: Date.parse('2026-10-10T12:00:00+09:00'), untilMs: Date.parse('2026-10-10T13:00:00+09:00'),
    sessions: [{ sid: 'c1', role: 'coord' }, { sid: 'l1', role: 'lane', lane: 'a' }],
    git: { merges: 1, files: 2, add: 900, del: 100, lines: 1000 },
    pool: [{ id: 'T1', kind: 'opencode', result: 'ok', fallback: false, findings: 1, lines: 300 }, { id: 'T2', kind: 'opencode', result: 'ratelimit', fallback: true, findings: 0, lines: 0 }],
    decisions: [{ text: 'x' }, { text: 'y', esc: true }, { text: 'z', reverse: true }],
    run: { id: 'r1', mode: 'token', created_at: '2026-10-10T12:00:00+09:00', closed_at: '2026-10-10T13:00:00+09:00' },
  });
  // opus 0.04 ×3 (c1, l1, w1) + sonnet (1000*10 + 100000*0.2)/1e6 = 0.03 ×2 (s, w2)
  assert.equal(m.cost.toFixed(2), '0.18');
  assert.equal(m.costCoord.toFixed(2), '0.04');
  assert.equal(m.costLanes.toFixed(2), '0.04');
  assert.equal(m.costSub.toFixed(2), '0.03');
  assert.equal(m.costWf.toFixed(2), '0.07');
  assert.equal(m.coordShare.toFixed(0), '22');
  assert.equal(m.per1k.toFixed(2), '0.18');
  assert.equal(m.wfRuns, 1);
  assert.equal(m.wfAgentsMedian, 2);
  assert.equal(m.wfOpusShare.toFixed(0), '50');
  assert.equal(m.poolTotal, 2);
  assert.equal(m.poolFallback, 1);
  assert.equal(m.poolLines, 300);
  assert.equal(m.poolFindings, 1);
  assert.equal(m.decisions, 3);
  assert.equal(m.decisionsEsc, 1);
  assert.equal(m.decisionsRev, 1);
  assert.ok(m.activeHours > 0);
  const md = renderMarkdown(m);
  assert.match(md, /1천 줄당 Claude 비용/);
  assert.equal(csvRow(m).split(',').length, CSV_HEADER.split(',').length);
});

test('collectMetrics: 줄 수 0 이면 per1k 는 null', () => {
  const root = mkdtempSync(join(tmpdir(), 'rm-'));
  const m = collectMetrics({ projectsDir: root, prices: PRICES, gapMin: 15, sinceMs: 0, untilMs: Date.now(), sessions: [], git: { merges: 0, files: 0, add: 0, del: 0, lines: 0 }, pool: [], decisions: [], run: { id: 'r0', mode: '' } });
  assert.equal(m.per1k, null);
  assert.equal(m.cost, 0);
  assert.match(renderMarkdown(m), /per1k|1천 줄당/);
});

function world() {
  const dir = mkdtempSync(join(tmpdir(), 'rm-cli-'));
  const repo = join(dir, 'repo');
  const stateRoot = join(dir, 'state');
  const proj = join(dir, 'projects');
  mkdirSync(repo, { recursive: true });
  const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: '2026-10-10T12:30:00+09:00', GIT_COMMITTER_DATE: '2026-10-10T12:30:00+09:00' } });
  git('init', '-q', '-b', 'dev');
  git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(repo, 'a.txt'), 'x\n'); git('add', '.'); git('commit', '-qm', 'base');
  git('checkout', '-qb', 'feat/x');
  writeFileSync(join(repo, 'b.js'), 'a\nb\nc\n'); writeFileSync(join(repo, 'note.md'), 'skip\n');
  git('add', '.'); git('commit', '-qm', 'work');
  git('checkout', '-q', 'dev');
  git('merge', '--no-ff', '-qm', "Merge branch 'feat/x' into dev", 'feat/x');
  sessionsFixture(proj);
  const run = join(stateRoot, 'r1');
  mkdirSync(join(run, 'pool'), { recursive: true });
  const state = {
    schema: 1,
    run: { id: 'r1', created_at: '2026-10-10T12:00:00+09:00', closed_at: '2026-10-10T13:00:00+09:00', integration_branch: 'dev', mode: 'token', coordinator: { session_id: 'c1' } },
    lanes: { a: { session: { session_id: 'l1' }, branch: 'feat/x' } },
    merge: { in_flight: null, queue: [], history: [] },
    decisions: [],
  };
  writeFileSync(join(run, 'state.json'), JSON.stringify(state));
  writeFileSync(join(run, 'pool', 'log.jsonl'), `${JSON.stringify({ id: 'T1', lane: 'a', kind: 'opencode', size: 'S', result: 'ok', fallback: false, findings: 0, lines: 3 })}\n`);
  writeFileSync(join(repo, '.coord.local.json'), JSON.stringify({ state_dir: stateRoot, claude_projects_dir: proj, office: { enabled: false }, usage: { sources: [] } }));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmpdir(), TZ: 'Asia/Seoul', COORD_REPO: repo, COORD_STATE_ROOT: stateRoot, COORD_RUN: 'r1', COORD_WBS_OPENER: 'none' };
  const runCli = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { env, cwd: repo, encoding: 'utf8', timeout: 60000 });
  return { dir, repo, stateRoot, run, runCli };
}

test('CLI: metrics.md·CSV 를 쓰고 METRICS 한 줄', () => {
  const w = world();
  const r = w.runCli([]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^METRICS r1 cost=0\.18 per1k=60\.0 coord=22% lines=3 file=.*metrics\.md\n$/);
  assert.ok(existsSync(join(w.run, 'metrics.md')));
  const csv = readFileSync(join(w.stateRoot, 'metrics.csv'), 'utf8').trim().split('\n');
  assert.equal(csv.length, 2);
  assert.equal(csv[0], CSV_HEADER);
  w.runCli([]);
  assert.equal(readFileSync(join(w.stateRoot, 'metrics.csv'), 'utf8').trim().split('\n').length, 3); // 헤더는 한 번만
});

test('CLI: --stdout --no-csv 는 파일을 쓰지 않는다, --dry-run 은 DRY', () => {
  const w = world();
  const r = w.runCli(['--stdout', '--no-csv']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1천 줄당 Claude 비용/);
  assert.match(r.stdout, /METRICS r1 .* file=-\n$/);
  assert.equal(existsSync(join(w.run, 'metrics.md')), false);
  assert.equal(existsSync(join(w.stateRoot, 'metrics.csv')), false);
  const d = w.runCli(['--dry-run']);
  assert.match(d.stdout, /^DRY METRICS r1 /);
  assert.equal(existsSync(join(w.run, 'metrics.md')), false);
});

test('CLI: 알 수 없는 인자는 rc 2, 회차 없음은 rc 3', () => {
  const w = world();
  assert.equal(w.runCli(['--bogus']).status, 2);
  assert.equal(w.runCli(['--run', 'nope']).status, 3);
});

const setState = (w, fn) => {
  const f = join(w.run, 'state.json');
  const st = JSON.parse(readFileSync(f, 'utf8'));
  fn(st);
  writeFileSync(f, JSON.stringify(st));
};

test('CLI: ff-only 단일 squash 커밋은 merge.history[].merged 로 센다', () => {
  const w = world();
  const git = (...a) => spawnSync('git', a, { cwd: w.repo, encoding: 'utf8' });
  git('checkout', '-qb', 'feat/y');
  writeFileSync(join(w.repo, 'c.js'), '1\n2\n3\n4\n5\n');
  git('add', 'c.js'); git('commit', '-qm', 'lane work');
  git('checkout', '-q', 'dev');
  git('merge', '--ff-only', '-q', 'feat/y');
  const sha = git('rev-parse', 'HEAD').stdout.trim();
  setState(w, (st) => { st.lanes.a.branch = 'other/none'; st.merge.history = [{ lane: 'a', branch: 'feat/y', merged: sha }]; });
  const r = w.runCli(['--stdout', '--no-csv']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /METRICS r1 cost=0\.18 per1k=36\.0 coord=22% lines=5 /);
});

test('CLI: 풀 log 에 같은 id 두 줄이면 마지막 줄을 센다', () => {
  const w = world();
  const p = join(w.run, 'pool', 'log.jsonl');
  writeFileSync(p, `${readFileSync(p, 'utf8')}${JSON.stringify({ id: 'T1', lane: 'a', kind: 'opencode', result: 'ok', fallback: true, findings: 2, lines: 7, note: 'fix' })}\n`);
  const r = w.runCli(['--stdout', '--no-csv']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\| 풀 묶음 \(종류별\) \| 1 \(opencode 1\) \|/);
  assert.match(r.stdout, /\| 풀 → Claude 넘김 · 리뷰 지적 · 풀 변경 줄 \| 1 · 2 · 7 \|/);
});

test('CLI: 회차 기간 밖 사용량 행은 제외한다', () => {
  const w = world();
  setState(w, (st) => { st.run.closed_at = '2026-10-10T12:05:30+09:00'; });
  const r = w.runCli(['--stdout', '--no-csv']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /METRICS r1 cost=0\.08 /); // c1 0.04 + l1 0.04, 서브·Workflow(03:06 이후) 제외
});

test('CLI: 값 없는 --run/--since/--until, 날짜 아닌 값은 rc 2', () => {
  const w = world();
  assert.equal(w.runCli(['--run']).status, 2);
  assert.equal(w.runCli(['--since']).status, 2);
  assert.equal(w.runCli(['--until', 'not-a-date']).status, 2);
});

test('CLI: /clear 로 바뀌기 전 세션(prev_ids)의 비용도 센다', () => {
  const w = world();
  writeFileSync(join(dirname(w.run), '..', 'projects', 'projB', 'l0.jsonl'), asst(9, '2026-10-10T03:02:00Z', 'claude-opus-5-5', U1));
  setState(w, (st) => { st.lanes.a.session.prev_ids = ['l0']; });
  const r = w.runCli(['--stdout', '--no-csv']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /METRICS r1 cost=0\.22 /);
  assert.match(r.stdout, /\$0\.04 \/ \$0\.08 \/ \$0\.03 \/ \$0\.07/);
});
