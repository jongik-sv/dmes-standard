// tests/coord-state-mode.test.mjs — coord-state.mjs 의 mode·decide·decisions(설계 2026-10-10 §2.1·§5.5)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COORD_ROOT } from './support/rng.mjs';

const MJS = join(COORD_ROOT, 'scripts', 'coord-state.mjs');

function world(cfgExtra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'csm-'));
  const repo = join(dir, 'repo');
  const stateRoot = join(dir, 'state');
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, '.coord.local.json'), JSON.stringify({ state_dir: stateRoot, office: { enabled: false }, usage: { sources: [] }, ...cfgExtra }));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmpdir(), TZ: 'Asia/Seoul', COORD_REPO: repo, COORD_STATE_ROOT: stateRoot, COORD_RUN: 'r1', COORD_WBS_OPENER: 'none', COORD_CONSOLE_POLL: '0' };
  const cs = (...args) => spawnSync(process.execPath, [MJS, ...args], { env, cwd: repo, encoding: 'utf8', timeout: 60000 });
  const r = cs('init', 'r1', '--goal', '시험');
  assert.equal(r.status, 0, r.stderr);
  const state = () => JSON.parse(readFileSync(join(stateRoot, 'r1', 'state.json'), 'utf8'));
  return { cs, state, stateRoot };
}

test('mode: 기본은 설정 mode.default, 기록하면 state', () => {
  const w = world();
  assert.equal(w.cs('mode').stdout, 'MODE token src=default\n');
  assert.equal(w.cs('mode', 'time').stdout, 'OK mode=time\n');
  assert.equal(w.state().run.mode, 'time');
  assert.equal(w.cs('mode').stdout, 'MODE time src=state\n');
  assert.equal(w.cs('mode', 'fast').status, 2);
  assert.equal(w.state().run.mode, 'time');
});

test('init 은 run.mode 를 쓰지 않는다(골든 호환)', () => {
  const w = world();
  assert.equal(w.state().run.mode, undefined);
});

test('decide: 결정 기록·번호·플래그', () => {
  const w = world();
  assert.equal(w.cs('decide', '-', '머지 순서', 'a 먼저').stdout, 'OK decision=0\n');
  assert.equal(w.cs('decide', '-', 'API 이름', 'getX 유지', '--esc').stdout, 'OK decision=1\n');
  assert.equal(w.cs('decide', '-', 'API 이름', 'getY 로 바꿈', '--reverse').stdout, 'OK decision=2\n');
  const d = w.state().decisions;
  assert.equal(d.length, 3);
  assert.equal(d[0].lane, '-');
  assert.equal(d[0].q, '머지 순서');
  assert.equal(d[0].text, 'a 먼저');
  assert.equal(d[0].esc, undefined);
  assert.equal(d[1].esc, true);
  assert.equal(d[2].reverse, true);
  assert.match(d[0].at, /^\d{4}-\d{2}-\d{2}T/);
});

test('decide: 없는 레인은 오류, 인자 부족은 rc 2', () => {
  const w = world();
  assert.notEqual(w.cs('decide', 'nolane', 'q', 't').status, 0);
  assert.equal(w.cs('decide', '-', 'q').status, 2);
});

test('decisions: --last·--grep·none', () => {
  const w = world();
  assert.equal(w.cs('decisions').stdout, 'DECISION none\n');
  for (let i = 0; i < 25; i += 1) w.cs('decide', '-', `질문${i}`, `답${i}`);
  w.cs('decide', '-', 'Flyway 번호', 'V7 사용', '--esc');
  const all = w.cs('decisions').stdout.trim().split('\n');
  assert.equal(all.length, 20);
  assert.match(all[19], /^DECISION 25 \S+ - Flyway 번호 => V7 사용 esc$/);
  assert.equal(w.cs('decisions', '--last', '3').stdout.trim().split('\n').length, 3);
  const g = w.cs('decisions', '--grep', 'flyway').stdout.trim().split('\n');
  assert.equal(g.length, 1);
  assert.match(g[0], /^DECISION 25 /);
});

test('summary: 최근 결정 20개, q 가 있으면 [레인] q → text', () => {
  const w = world();
  for (let i = 0; i < 22; i += 1) w.cs('decide', '-', `질문${i}`, `답${i}`);
  const s = w.cs('summary');
  assert.equal(s.status, 0, s.stderr);
  const text = readFileSync(join(w.stateRoot, 'r1', 'summary.md'), 'utf8') + s.stdout;
  assert.match(text, /\[-\] 질문21 → 답21/);
  assert.match(text, /\[-\] 질문2 → 답2/);
  assert.doesNotMatch(text, /\[-\] 질문1 → 답1\b/);
});
