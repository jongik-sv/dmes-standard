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

test('seen 이 30초 넘게 낡은 대기는 뒤를 막지 않아 세지 않는다', () => {
  const t = 1000;
  const waits = [
    { since: 100, state: 'slot', seen: t - 31 }, // 멈춘 프로세스
    { since: 110, state: 'slot', seen: t - 30 }, // 경계: 30초는 아직 산 것
    { since: 120, state: 'slot', seen: t },
  ];
  assert.equal(heavyWaitPos({ since: 200, state: 'slot' }, waits, t), 3);
});

test('seen 이 없는 옛 줄(null·undefined)은 지금 동작 그대로 센다', () => {
  const waits = [{ since: 100, state: 'slot', seen: null }, { since: 150, state: 'slot' }];
  assert.equal(heavyWaitPos({ since: 200, state: 'slot' }, waits, 1_000_000), 3);
});
