// tests/session-log.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeHours, cacheWriteCostOf, costOf, findSessionFiles, inWindow, median, parseToolResults, parseUsageLines } from '../scripts/lib/session-log.mjs';

const asst = (id, req, ts, model, u) => JSON.stringify({ type: 'assistant', requestId: req, timestamp: ts, sessionId: 's1', message: { id: id, model, usage: u } });
const U = { input_tokens: 10, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 10000, cache_creation: { ephemeral_1h_input_tokens: 600, ephemeral_5m_input_tokens: 400 } };
const PRICES = { 'claude-opus-5-5': [4, 20, 0.2], 'claude-sonnet-5-5': [2, 10, 0.2] };

test('dedupes streamed duplicates', () => {
  const text = [asst('m1', 'r1', '2026-10-10T00:00:00Z', 'claude-opus-5-5', U), asst('m1', 'r1', '2026-10-10T00:00:01Z', 'claude-opus-5-5', U), asst('m2', 'r2', '2026-10-10T00:01:00Z', 'claude-sonnet-5-5', U)].join('\n');
  const seen = new Set();
  const rows = parseUsageLines(text, seen);
  assert.equal(rows.length, 2);
  assert.equal(parseUsageLines(text, seen).length, 0); // 같은 seen 으로 다시 읽으면 0
  assert.deepEqual(rows[0], { ts: '2026-10-10T00:00:00Z', model: 'claude-opus-5-5', sid: 's1', inp: 10, out: 100, cc: 1000, cr: 10000, cc1h: 600, cc5m: 400 });
});

test('skips non-assistant and broken lines', () => {
  const text = ['{"type":"user","message":{"content":"usage assistant"}}', '{broken "usage" "assistant"', asst('m3', 'r3', 't', 'x', {})].join('\n');
  const rows = parseUsageLines(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].inp, 0);
});

test('costOf splits cache write by TTL', () => {
  const r = { ts: '', model: 'claude-opus-5-5', sid: '', inp: 10, out: 100, cc: 1000, cr: 10000, cc1h: 600, cc5m: 400 };
  // 10*4 + 100*20 + 600*4*2 + 400*4*1.25 + 10000*0.2 = 40 + 2000 + 4800 + 2000 + 2000 = 10840 → /1e6
  assert.equal(Math.round(costOf(r, PRICES) * 1e6), 10840);
  assert.equal(Math.round(cacheWriteCostOf(r, PRICES) * 1e6), 6800);
  assert.equal(costOf({ ...r, model: 'glm-5.3' }, PRICES), 0);
  // TTL 칸이 없는 옛 로그: cc 전체를 1시간 단가로
  assert.equal(Math.round(costOf({ ...r, cc1h: 0, cc5m: 0 }, PRICES) * 1e6), 40 + 2000 + 8000 + 2000);
});

test('parseToolResults counts is_error', () => {
  const line = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true }, { type: 'tool_result' }, { type: 'text' }] } });
  assert.deepEqual(parseToolResults(`${line}\n${line}`), { total: 4, errors: 2 });
});

test('activeHours fills gaps up to gapMin only', () => {
  const ts = ['2026-10-10T00:00:00Z', '2026-10-10T00:10:00Z', '2026-10-10T00:20:00Z', '2026-10-10T02:00:00Z', '2026-10-10T02:05:00Z'];
  assert.equal(activeHours(ts, 15), 25 / 60);
  assert.equal(activeHours([], 15), 0);
});

test('median and inWindow', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), 0);
  const s = Date.parse('2026-10-10T12:00:00+09:00');
  const u = Date.parse('2026-10-10T13:00:00+09:00');
  assert.equal(inWindow('2026-10-10T03:30:00Z', s, u), true);
  assert.equal(inWindow('2026-10-10T02:59:00Z', s, u), false);
  assert.equal(inWindow('bad', s, u), false);
});

test('findSessionFiles finds main, subagents and workflows across project dirs', () => {
  const root = mkdtempSync(join(tmpdir(), 'slog-'));
  mkdirSync(join(root, 'projA'), { recursive: true });
  mkdirSync(join(root, 'projB', 'sid9', 'subagents', 'workflows', 'wf_1'), { recursive: true });
  writeFileSync(join(root, 'projA', 'sid9.jsonl'), '');
  writeFileSync(join(root, 'projB', 'sid9', 'subagents', 'agent-a.jsonl'), '');
  writeFileSync(join(root, 'projB', 'sid9', 'subagents', 'workflows', 'wf_1', 'agent-b.jsonl'), '');
  const f = findSessionFiles(root, 'sid9');
  assert.equal(f.main.length, 1);
  assert.equal(f.sub.length, 1);
  assert.equal(f.wf.length, 1);
  assert.deepEqual(findSessionFiles(root, ''), { main: [], sub: [], wf: [] });
  assert.deepEqual(findSessionFiles(join(root, 'none'), 'sid9'), { main: [], sub: [], wf: [] });
});
