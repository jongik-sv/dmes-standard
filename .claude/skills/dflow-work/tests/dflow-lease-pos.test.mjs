// dflow-lease.mjs 의 heavy 대기열 줄 위치(heavyWaitPos) 시험 — heavy.mjs 공정 순서 규칙과 같은 기준
import test from 'node:test';
import assert from 'node:assert/strict';
import { heavyWaitPos } from '../scripts/dflow-lease.mjs';

test('받을 수 있는 앞 대기자만 센다: ora·excl·docker·표식에 state 없음(-)은 건너뛴다', () => {
  const waits = [
    { since: 100, state: 'ora' },
    { since: 110, state: 'excl' },
    { since: 120, state: 'docker' },
    { since: 130, state: '-' },
    { since: 140, state: 'slot' },
    { since: 150, state: 'yield' },
    { since: 300, state: 'queue' }, // 나보다 뒤
  ];
  assert.equal(heavyWaitPos({ since: 200, state: 'slot' }, waits), 3);
});

test('내가 Oracle 자리를 기다리면 먼저 줄 선 ora 대기자도 센다', () => {
  const waits = [{ since: 100, state: 'ora' }, { since: 150, state: 'slot' }];
  assert.equal(heavyWaitPos({ since: 200, state: 'ora' }, waits), 3);
});

test('state 칸이 없는 옛 줄은 종전처럼 먼저 줄 선 순서로 센다', () => {
  const waits = [{ since: 100, state: undefined }, { since: 150, state: undefined }, { since: 250, state: undefined }];
  assert.equal(heavyWaitPos({ since: 200, state: undefined }, waits), 3);
});
