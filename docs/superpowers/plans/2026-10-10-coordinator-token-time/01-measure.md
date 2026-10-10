# 조정자 토큰·시간 개편 — Task 1~3: 설정 기반·세션 로그·측정

> 공통 제약(Global Constraints)·스펙과 다르게 정한 점(P1~P9)·Review Focus·파일 구조는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> [README](README.md) · 다음: [02-context.md](02-context.md)

### Task 1: 새 설정 키 기본값

**Files:**
- Modify: `SK/scripts/lib/common.mjs` (`COORD_DEFAULTS`, :21 부근 JSON 문자열)
- Modify: `SK/tests/golden/common-defaults.json`
- Modify: `SK/tests/common.test.mjs` (`OPAQUE` 목록)
- Modify: `SK/templates/config.example.json`
- Modify: `SK/references/contract.md` §1.2 설정 표, §1.3 모델 표

**Interfaces:**
- Produces (설정 경로와 기본값, 뒤 Task 가 이 이름으로 읽는다):
  - `mode.default` = `"token"`
  - `mode.lanes_max` = `{"time": 6, "token": 3}`
  - `mode.heartbeat_min` = `{"time": 15, "token": 30}`
  - `mode.workflow_min_items` = `{"time": 2, "token": 4}`
  - `compact.coordinator_max` = `200000`
  - `compact.lane_max` = `250000`
  - `coordinator.model_by_mode` = `{"time": "opus/medium", "token": "sonnet/medium"}`
  - `workflow.agents_by_mode` = `{"time": {"G": 6, "Y": 5, "O": 3, "R": 0}, "token": {"G": 4, "Y": 3, "O": 2, "R": 0}}`
  - `pool.opencode_max` = `3`, `pool.glm_max` = `1`, `pool.order` = `["opencode", "glm"]`
  - `pool.timeout_min` = `{"S": 20, "M": 40}`, `pool.cooldown_min` = `30`
  - `pool.opencode_command` = `"opencode run --standalone {prompt}"`, `pool.glm_command` = `null`
  - `pool.notify` = `true`
  - `metrics.prices` = `{"claude-opus-5-5": [4, 20, 0.2], "claude-sonnet-5-5": [2, 10, 0.2], "claude-haiku-5-5": [0.1, 0.5, 0.01], "claude-haiku-4-5-20251001": [1, 5, 0.1], "claude-opus-4-8": [5, 25, 0.5]}`
  - `metrics.exclude` = `["*.md", "*.csv", "*.log", "*golden*", "*V1__baseline.sql", "*lock.yaml", "*lock.json", "*.snap"]`
  - `metrics.gap_min` = `15`, `metrics.csv` = `"metrics.csv"`

- [ ] **Step 1: 기존 기본값과 시험 구조 확인**

Run: `sed -n 15,80p scripts/lib/common.mjs` 와 `sed -n 1,40p tests/common.test.mjs`
확인할 것: `compact`·`coordinator`·`workflow` 블록의 현재 위치, `coordinator` 블록이 기본값에 있는지(없으면 새로 만든다), golden 파일이 기본값 글자 그대로인지(`common.test.mjs:16-20`), `OPAQUE`·`DOC_ONLY` 목록 위치.

- [ ] **Step 2: 시험이 새 키를 요구하게 만든다 (실패 확인용)**

`tests/common.test.mjs` 의 `OPAQUE` 목록에 객체 값을 한 줄로 적는 키 이름을 더한다.

```js
const OPAQUE = ['by_window', 'bands', 'agents_by_band', 'opencode',
  'lanes_max', 'heartbeat_min', 'workflow_min_items', 'model_by_mode', 'agents_by_mode', 'timeout_min', 'prices'];
```

그리고 `tests/common.test.mjs` 끝에 아래 시험을 추가한다.

```js
test('토큰·시간 개편 설정 키 기본값', () => {
  const d = JSON.parse(COORD_DEFAULTS);
  assert.equal(d.mode.default, 'token');
  assert.deepEqual(d.mode.lanes_max, { time: 6, token: 3 });
  assert.deepEqual(d.mode.heartbeat_min, { time: 15, token: 30 });
  assert.deepEqual(d.mode.workflow_min_items, { time: 2, token: 4 });
  assert.equal(d.compact.coordinator_max, 200000);
  assert.equal(d.compact.lane_max, 250000);
  assert.deepEqual(d.coordinator.model_by_mode, { time: 'opus/medium', token: 'sonnet/medium' });
  assert.deepEqual(d.workflow.agents_by_mode.token, { G: 4, Y: 3, O: 2, R: 0 });
  assert.deepEqual(d.workflow.agents_by_mode.time, { G: 6, Y: 5, O: 3, R: 0 });
  assert.equal(d.pool.opencode_max, 3);
  assert.equal(d.pool.glm_max, 1);
  assert.deepEqual(d.pool.order, ['opencode', 'glm']);
  assert.deepEqual(d.pool.timeout_min, { S: 20, M: 40 });
  assert.equal(d.pool.cooldown_min, 30);
  assert.equal(d.pool.opencode_command, 'opencode run --standalone {prompt}');
  assert.equal(d.pool.glm_command, null);
  assert.equal(d.pool.notify, true);
  assert.deepEqual(d.metrics.prices['claude-opus-5-5'], [4, 20, 0.2]);
  assert.ok(d.metrics.exclude.includes('*.csv'));
  assert.equal(d.metrics.gap_min, 15);
  assert.equal(d.metrics.csv, 'metrics.csv');
  // 모델 표: 모드 열이 있는 행
  const rows = d.workflow.model_table;
  assert.ok(rows.some((r) => r.mode === 'token' && r.model === 'sonnet' && r.effort === 'medium'));
  assert.ok(rows.some((r) => r.mode === 'time' && r.model === 'opus'));
});
```

`COORD_DEFAULTS` 를 이미 import 하지 않으면 파일 머리에 `import { COORD_DEFAULTS } from '../scripts/lib/common.mjs';` 를 더한다. `workflow.model_table` 이 기본값에 없으면(§1.3 문서에만 있으면) 이 시험의 마지막 세 줄을 빼고 Step 4 의 모델 표 변경은 문서에만 한다.

- [ ] **Step 3: 실패 확인**

Run: `node --test tests/common.test.mjs`
Expected: FAIL (`d.mode` undefined)

- [ ] **Step 4: 기본값 추가**

`COORD_DEFAULTS` JSON 문자열에 아래를 넣는다. 기존 블록이 있으면 그 안에 키를 더하고, 없으면 블록을 만든다. 들여쓰기·줄 나눔은 주변 형식을 따른다.

```json
"mode": {"default": "token", "lanes_max": {"time": 6, "token": 3}, "heartbeat_min": {"time": 15, "token": 30}, "workflow_min_items": {"time": 2, "token": 4}},
```

`compact` 블록 끝: `"coordinator_max": 200000, "lane_max": 250000`
`coordinator` 블록: `"model_by_mode": {"time": "opus/medium", "token": "sonnet/medium"}`
`workflow` 블록: `"agents_by_mode": {"time": {"G": 6, "Y": 5, "O": 3, "R": 0}, "token": {"G": 4, "Y": 3, "O": 2, "R": 0}}`

```json
"pool": {"opencode_max": 3, "glm_max": 1, "order": ["opencode", "glm"], "timeout_min": {"S": 20, "M": 40}, "cooldown_min": 30, "opencode_command": "opencode run --standalone {prompt}", "glm_command": null, "notify": true},
"metrics": {"prices": {"claude-opus-5-5": [4, 20, 0.2], "claude-sonnet-5-5": [2, 10, 0.2], "claude-haiku-5-5": [0.1, 0.5, 0.01], "claude-haiku-4-5-20251001": [1, 5, 0.1], "claude-opus-4-8": [5, 25, 0.5]}, "exclude": ["*.md", "*.csv", "*.log", "*golden*", "*V1__baseline.sql", "*lock.yaml", "*lock.json", "*.snap"], "gap_min": 15, "csv": "metrics.csv"},
```

`workflow.model_table` 이 기본값에 있으면 구현·리뷰 행을 모드별로 나눈다. 모드 열이 없는 행은 두 모드에 같이 쓴다.

```json
{"stage":"구현·수정·특성 테스트 작성","size":"S/M","mode":"token","model":"sonnet","effort":"medium"},
{"stage":"구현·수정·특성 테스트 작성","size":"S/M","mode":"time","model":"sonnet","effort":"high"},
{"stage":"구현·수정·특성 테스트 작성","size":"L·동시성·트랜잭션·원인 모를 결함","mode":"token","model":"sonnet","effort":"high"},
{"stage":"구현·수정·특성 테스트 작성","size":"L·동시성·트랜잭션·원인 모를 결함","mode":"time","model":"opus","effort":"high"},
```

기존 `S/M` sonnet/high 행과 `L·…` opus/high 행은 위 네 행으로 바꾼다. 리뷰·보안 행은 그대로 둔다(판정은 두 모드 모두 opus).

- [ ] **Step 5: golden·예시 설정 갱신**

`tests/golden/common-defaults.json` 을 새 기본값 글자 그대로 맞춘다(시험이 비교하는 방식대로. `common.test.mjs:16-20` 을 보고 같은 직렬화로 쓴다). `templates/config.example.json` 도 같은 키를 넣는다.

- [ ] **Step 6: contract.md §1.2 표 행 추가**

§1.2 표에 아래 행을 키 순서에 맞는 자리에 넣는다. 형식은 ``| `key.path` | 기본값 | 뜻 |`` 이다.

```markdown
| `mode.default` | `"token"` | 회차 모드 기본값. state `run.mode` 가 없을 때 쓴다(`token`·`time`) |
| `mode.lanes_max` | `{"time":6,"token":3}` | 모드별 Claude 레인 수 상한. `usage.md` 「새 레인 상한」과 함께 적용 |
| `mode.heartbeat_min` | `{"time":15,"token":30}` | 모드별 하트비트 cron 간격(분). 이벤트 틱(`tick.mjs --watch`)이 주 경로 |
| `mode.workflow_min_items` | `{"time":2,"token":4}` | Workflow 를 쓰는 최소 같은 흐름 M/L 항목 수 |
| `compact.coordinator_max` | `200000` | 조정 세션 컨텍스트 토큰 상한. 넘으면 `CTX_OVER_SELF` |
| `compact.lane_max` | `250000` | 레인 세션 컨텍스트 토큰 상한. 넘으면 `CTX_OVER` |
| `coordinator.model_by_mode` | `{"time":"opus/medium","token":"sonnet/medium"}` | 모드별 조정 세션 model/effort |
| `workflow.agents_by_mode` | `{"time":{…},"token":{…}}` | 모드별·띠별 레인당 동시 agent 상한. 있으면 `agents_by_band` 대신 씀 |
| `pool.opencode_max` | `3` | 풀 opencode 동시 수 |
| `pool.glm_max` | `1` | 풀 GLM 동시 수. `glm-preflight` 가 `ok` 가 아니면 0 으로 봄 |
| `pool.order` | `["opencode","glm"]` | 빈 슬롯을 찾는 순서 |
| `pool.timeout_min` | `{"S":20,"M":40}` | 묶음 크기별 시간 상한(분) |
| `pool.cooldown_min` | `30` | 한도 오류 뒤 그 워커 종류를 쉬게 하는 시간(분) |
| `pool.opencode_command` | `"opencode run --standalone {prompt}"` | opencode 단발 실행 틀. `{prompt}` = 인자 하나 |
| `pool.glm_command` | `null` | GLM 단발 실행 틀(argv 배열 또는 문자열). 빈 값이면 GLM 슬롯 0. PC 전용 값이라 `.coord.local.json` 에 둠 |
| `pool.notify` | `true` | 묶음이 끝나면 레인 탭에 한 줄 알림(`term-send-safe.mjs`) |
| `metrics.prices` | `{"claude-opus-5-5":[4,20,0.2],…}` | 모델별 단가 [입력, 출력, 캐시 읽기] $/MTok. 캐시 쓰기 = 입력 × 2(1시간)·× 1.25(5분) |
| `metrics.exclude` | `["*.md","*.csv",…]` | 변경 줄에서 뺄 경로 패턴(git pathspec exclude) |
| `metrics.gap_min` | `15` | 활동 시간 계산에서 이어진 것으로 보는 메시지 간격(분) |
| `metrics.csv` | `"metrics.csv"` | 회차 지표 누적 파일 이름(`state_dir` 아래) |
```

§1.3 모델 표 JSON 도 Step 4 와 같은 행으로 고치고, 표 위 설명에 「`mode` 열이 있으면 그 모드에서만 쓴다. 없으면 두 모드 공통」 한 줄을 더한다.

- [ ] **Step 7: 시험 통과 확인**

Run: `node --test tests/common.test.mjs`
Expected: PASS

Run: `node --test tests/`
Expected: 전체 PASS (195 + 새 시험)

- [ ] **Step 8: 커밋**

```bash
git add scripts/lib/common.mjs tests/golden/common-defaults.json tests/common.test.mjs templates/config.example.json references/contract.md
git commit -m "feat(coordinator): 회차 모드·풀·측정·컨텍스트 상한 설정 키 기본값

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 세션 로그 lib (`lib/session-log.mjs`)

**Files:**
- Create: `SK/scripts/lib/session-log.mjs`
- Test: `SK/tests/session-log.test.mjs`

**Interfaces:**
- Produces:
  - `parseUsageLines(text: string, seen?: Set<string>) → Row[]`, `Row = {ts, model, sid, inp, out, cc, cr, cc1h, cc5m}` (토큰 수는 number)
  - `parseToolResults(text: string) → {total: number, errors: number}`
  - `costOf(row: Row, prices: {[model]: [in, out, cacheRead]}) → number` (달러)
  - `cacheWriteCostOf(row: Row, prices) → number` (달러, 캐시 쓰기 몫만)
  - `activeHours(tsList: string[], gapMin = 15) → number`
  - `median(xs: number[]) → number`
  - `findSessionFiles(projectsDir: string, sid: string) → {main: string[], sub: string[], wf: string[]}`
  - `inWindow(ts: string, sinceMs: number, untilMs: number) → boolean`

- [ ] **Step 1: 실패하는 시험 작성**

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/session-log.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

```js
// lib/session-log.mjs — 조정자 lib(node). Claude Code 세션 로그(jsonl)에서 사용량·도구 결과를 읽는 함수.
//   run-metrics.mjs 가 쓴다. 파일 찾기(findSessionFiles) 말고는 순수 함수다.
// node 18.17 이상, 외부 패키지 없음.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** assistant 줄 → 사용량 행. 같은 message.id+requestId 는 seen 으로 한 번만 센다(스트리밍 중복 줄). */
export function parseUsageLines(text, seen = new Set()) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.type !== 'assistant') continue;
    const m = o.message || {};
    const u = m.usage || {};
    const key = `${m.id ?? ''}|${o.requestId ?? ''}`;
    if (key !== '|') {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const cc = u.cache_creation || {};
    rows.push({
      ts: o.timestamp || '', model: m.model || '', sid: o.sessionId || '',
      inp: u.input_tokens || 0, out: u.output_tokens || 0,
      cc: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0,
      cc1h: cc.ephemeral_1h_input_tokens || 0, cc5m: cc.ephemeral_5m_input_tokens || 0,
    });
  }
  return rows;
}

/** tool_result 블록 수와 is_error 수. */
export function parseToolResults(text) {
  let total = 0;
  let errors = 0;
  for (const line of text.split('\n')) {
    if (!line.includes('"tool_result"')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const c = o.message && o.message.content;
    if (!Array.isArray(c)) continue;
    for (const x of c) {
      if (x && x.type === 'tool_result') { total += 1; if (x.is_error) errors += 1; }
    }
  }
  return { total, errors };
}

/** 캐시 쓰기 몫(달러). TTL 칸이 없으면 cc 전체를 1시간 단가로 본다. */
export function cacheWriteCostOf(r, prices) {
  const p = prices[r.model];
  if (!p) return 0;
  const rest = Math.max(0, r.cc - r.cc1h - r.cc5m);
  return ((r.cc1h + rest) * p[0] * 2 + r.cc5m * p[0] * 1.25) / 1e6;
}

/** 한 행의 비용(달러). 단가가 없는 모델(glm 등)은 0. */
export function costOf(r, prices) {
  const p = prices[r.model];
  if (!p) return 0;
  return (r.inp * p[0] + r.out * p[1] + r.cr * p[2]) / 1e6 + cacheWriteCostOf(r, prices);
}

/** 이어진 메시지 간격(gapMin 이하)만 더한 활동 시간(시간). */
export function activeHours(tsList, gapMin = 15) {
  const t = tsList.map((s) => Date.parse(s)).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  let sum = 0;
  for (let k = 1; k < t.length; k += 1) {
    const d = (t[k] - t[k - 1]) / 60000;
    if (d <= gapMin) sum += d;
  }
  return sum / 60;
}

export function median(xs) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function inWindow(ts, sinceMs, untilMs) {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return false;
  return t >= sinceMs && t <= untilMs;
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** 모든 프로젝트 폴더에서 세션 sid 의 메인·서브에이전트·Workflow 로그를 찾는다. */
export function findSessionFiles(projectsDir, sid) {
  const res = { main: [], sub: [], wf: [] };
  if (!sid || !isDir(projectsDir)) return res;
  for (const d of readdirSync(projectsDir)) {
    const base = join(projectsDir, d);
    if (!isDir(base)) continue;
    const f = join(base, `${sid}.jsonl`);
    if (existsSync(f)) res.main.push(f);
    const sd = join(base, sid, 'subagents');
    if (!isDir(sd)) continue;
    for (const e of readdirSync(sd)) {
      const p = join(sd, e);
      if (e.endsWith('.jsonl')) res.sub.push(p);
      else if (e === 'workflows' && isDir(p)) {
        for (const w of readdirSync(p)) {
          const wp = join(p, w);
          if (!isDir(wp)) continue;
          for (const a of readdirSync(wp)) if (a.endsWith('.jsonl')) res.wf.push(join(wp, a));
        }
      }
    }
  }
  return res;
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/session-log.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add scripts/lib/session-log.mjs tests/session-log.test.mjs
git commit -m "feat(coordinator): 세션 로그 사용량·비용·활동 시간 lib

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 측정 CLI (`run-metrics.mjs`)

**Files:**
- Create: `SK/scripts/run-metrics.mjs`
- Test: `SK/tests/run-metrics.test.mjs`
- Modify: `SK/references/closing.md` (finish 절차에 측정 단계)

**Interfaces:**
- Consumes: Task 1 설정 `metrics.*`, Task 2 lib 함수 전부. state 칸: `run.id`, `run.created_at`, `run.closed_at`, `run.mode`, `run.integration_branch`, `run.coordinator.session_id`, `lanes.<n>.session.session_id`, `lanes.<n>.branch`(실제 칸 이름은 `coord-state.mjs` 의 `LANE_SKEL_TEXT` 에서 확인), `merge.history[]`, `decisions[]` (Task 6 이 `{at, lane, q, text, esc?, reverse?}` 로 씀). 풀 기록 `<runDir>/pool/log.jsonl` (Task 8 형식: `{id, lane, kind, size, started_at, ended_at, result, fallback, findings, lines}`).
- Produces:
  - CLI: `run-metrics.mjs [--run <id>] [--stdout] [--no-csv] [--since <iso>] [--until <iso>] [--dry-run]`
  - stdout 한 줄: `METRICS <run> cost=<$소수2> per1k=<$소수1|-> coord=<정수%> lines=<n> file=<경로|->`
  - 파일: `<runDir>/metrics.md`, `<state_dir>/<metrics.csv>` 에 한 줄 추가(헤더는 새 파일일 때만)
  - 내보내는 순수 함수: `collectMetrics(input) → Metrics`, `renderMarkdown(m) → string`, `csvRow(m) → string`, `CSV_HEADER`

- [ ] **Step 1: 기존 진입 패턴 확인**

Run: `sed -n 1,60p scripts/search.mjs` 와 `grep -n "export function \(runSync\|coordDefaultRepo\)" scripts/lib/common-ext.mjs` 와 `grep -n "export function \(expand\|cfgAll\|runDir\|stateFile\|stateRoot\)" scripts/lib/common.mjs` 와 `grep -n "LANE_SKEL_TEXT" -A3 scripts/coord-state.mjs`
확인할 것: `main` 안 `CoordDie` 처리 방식, `runSync` 반환 모양(`{rc,out,err}` 인지, `out` 이 Buffer 인지), 레인 브랜치 칸 이름, `--run` 을 `COORD_RUN` 으로 넘기는 방법(`runId(c, arg)` 가 env 를 읽음).

- [ ] **Step 2: 실패하는 시험 작성**

시험은 순수 함수 `collectMetrics` 와 CLI 를 둘 다 본다. CLI 시험은 임시 git 저장소·state·프로젝트 폴더를 만든다.

```js
// tests/run-metrics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
```

계산 확인: 레인 브랜치 머지의 변경 줄 = `b.js` 3줄(`note.md` 는 `*.md` 제외) → `lines=3`, `per1k = 0.18 / 3 × 1000 = 60.0`.

- [ ] **Step 3: 실패 확인**

Run: `node --test tests/run-metrics.test.mjs`
Expected: FAIL (모듈 없음)

- [ ] **Step 4: 구현**

```js
// run-metrics.mjs — 조정자 스크립트(node). 회차 하나의 Claude 비용·속도·풀·결정 지표를 잰다(설계 2026-10-10 §7).
//   사용법: run-metrics.mjs [--run <id>] [--stdout] [--no-csv] [--since <iso>] [--until <iso>] [--dry-run]
//   입력: state(조정·레인 세션 ID, 레인 브랜치, decisions), ~/.claude/projects 세션 로그, git 머지, <회차>/pool/log.jsonl
//   stdout: `METRICS <run> cost=<$> per1k=<$|-> coord=<%> lines=<n> file=<metrics.md|->`
//   파일: <회차>/metrics.md, <state_dir>/<metrics.csv> 에 한 줄(헤더는 새 파일일 때만)
// node 18.17 이상, 외부 패키지 없음.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { CoordDie, Ctx, cfgAll, cfgSub, expand, runDir, stateFile, stateRoot } from './lib/common.mjs';
import { runSync } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';
import { activeHours, cacheWriteCostOf, costOf, findSessionFiles, inWindow, median, parseToolResults, parseUsageLines } from './lib/session-log.mjs';

const HELP = `# 사용법: run-metrics.mjs [--run <id>] [--stdout] [--no-csv] [--since <iso>] [--until <iso>] [--dry-run]
#   회차의 Claude 비용(API 단가 환산)·활동 시간·변경 줄·풀·결정 지표를 잰다. 단가·제외 패턴 = 설정 metrics.*
#   --stdout: metrics.md 내용을 stdout 에 쓰고 파일은 만들지 않음 · --no-csv: 누적 CSV 에 쓰지 않음
#   stdout 끝 줄: METRICS <run> cost=<$> per1k=<$|-> coord=<%> lines=<n> file=<경로|->
`;

export const CSV_HEADER = 'run,mode,created_at,closed_at,cost,cost_coord,cost_lanes,cost_sub,cost_wf,active_h,session_h,lines,per1k,coord_share,coord_ctx_median,wf_runs,wf_agents_median,wf_opus_share,wf_cw_share,pool_total,pool_fallback,pool_lines,pool_findings,decisions,decisions_esc,decisions_rev,tool_retry';

/** 순수 계산. input = {projectsDir, prices, gapMin, sinceMs, untilMs, sessions:[{sid,role,lane?}], git, pool, decisions, run} */
export function collectMetrics(input) {
  const { projectsDir, prices, gapMin, sinceMs, untilMs, sessions, git, pool, decisions, run } = input;
  const seen = new Set();
  const m = {
    run: run.id, mode: run.mode || '', createdAt: run.created_at || '', closedAt: run.closed_at || '',
    cost: 0, costCoord: 0, costLanes: 0, costSub: 0, costWf: 0, wfCw: 0,
    activeHours: 0, sessionHours: 0, coordCtxMedian: 0,
    wfRuns: 0, wfAgentsMedian: 0, wfOpusShare: 0, wfCwShare: 0,
    lines: git.lines, merges: git.merges, files: git.files, per1k: null, coordShare: 0,
    poolTotal: pool.length, poolFallback: pool.filter((p) => p.fallback).length,
    poolLines: pool.reduce((s, p) => s + (Number(p.lines) || 0), 0),
    poolFindings: pool.reduce((s, p) => s + (Number(p.findings) || 0), 0),
    poolByKind: {},
    decisions: decisions.length, decisionsEsc: decisions.filter((d) => d.esc).length, decisionsRev: decisions.filter((d) => d.reverse).length,
    toolTotal: 0, toolErrors: 0, toolRetry: 0,
  };
  for (const p of pool) m.poolByKind[p.kind] = (m.poolByKind[p.kind] || 0) + 1;
  const allTs = [];
  const coordCtx = [];
  const wfAgents = new Map();
  let wfCalls = 0;
  let wfOpus = 0;
  for (const s of sessions) {
    const f = findSessionFiles(projectsDir, s.sid);
    const mine = [];
    for (const [kind, list] of [['main', f.main], ['sub', f.sub], ['wf', f.wf]]) {
      for (const path of list) {
        const text = readFileSync(path, 'utf8');
        const tr = parseToolResults(text);
        m.toolTotal += tr.total; m.toolErrors += tr.errors;
        for (const r of parseUsageLines(text, seen)) {
          if (!inWindow(r.ts, sinceMs, untilMs)) continue;
          const v = costOf(r, prices);
          m.cost += v; allTs.push(r.ts); mine.push(r.ts);
          if (kind === 'main') {
            if (s.role === 'coord') { m.costCoord += v; coordCtx.push(r.inp + r.cc + r.cr); } else m.costLanes += v;
          } else if (kind === 'sub') m.costSub += v;
          else {
            m.costWf += v; m.wfCw += cacheWriteCostOf(r, prices); wfCalls += 1;
            if (r.model.includes('opus')) wfOpus += 1;
            const wf = basename(dirname(path));
            if (!wfAgents.has(wf)) wfAgents.set(wf, new Set());
            wfAgents.get(wf).add(path);
          }
        }
      }
    }
    m.sessionHours += activeHours(mine, gapMin);
  }
  m.activeHours = activeHours(allTs, gapMin);
  m.coordCtxMedian = median(coordCtx);
  m.wfRuns = wfAgents.size;
  m.wfAgentsMedian = median([...wfAgents.values()].map((x) => x.size));
  m.wfOpusShare = wfCalls ? (wfOpus / wfCalls) * 100 : 0;
  m.wfCwShare = m.costWf ? (m.wfCw / m.costWf) * 100 : 0;
  m.coordShare = m.cost ? (m.costCoord / m.cost) * 100 : 0;
  m.per1k = m.lines > 0 ? (m.cost / m.lines) * 1000 : null;
  m.toolRetry = m.toolTotal ? (m.toolErrors / m.toolTotal) * 100 : 0;
  return m;
}

const f2 = (n) => n.toFixed(2);
const f1 = (n) => n.toFixed(1);
const f0 = (n) => n.toFixed(0);

export function renderMarkdown(m) {
  const per1k = m.per1k === null ? '-' : `$${f1(m.per1k)}`;
  const kinds = Object.entries(m.poolByKind).map(([k, v]) => `${k} ${v}`).join(', ') || '-';
  return [
    `# 회차 지표 — ${m.run}`,
    '',
    `- 모드: ${m.mode || '-'} · 기간: ${m.createdAt || '-'} ~ ${m.closedAt || '진행 중'}`,
    '- 비용은 Claude 사용량을 API 단가로 환산한 값이다. 비-Claude 워커 토큰은 넣지 않는다.',
    '',
    '| 항목 | 값 |',
    '|---|---|',
    `| Claude 비용 | $${f2(m.cost)} |`,
    `| 조정 세션 / 레인 세션 / 서브에이전트 / Workflow | $${f2(m.costCoord)} / $${f2(m.costLanes)} / $${f2(m.costSub)} / $${f2(m.costWf)} |`,
    `| 조정 세션 비중 | ${f0(m.coordShare)}% |`,
    `| 조정 세션 컨텍스트 중앙값 | ${f0(m.coordCtxMedian / 1000)}K |`,
    `| 활동 시간 (세션 시간 합) | ${f1(m.activeHours)}h (${f1(m.sessionHours)}h) |`,
    `| 변경 줄 (머지 ${m.merges}건, 제외 패턴 적용) | ${m.lines} |`,
    `| 1천 줄당 Claude 비용 | ${per1k} |`,
    `| Workflow 회수 · 회당 agent 중앙값 | ${m.wfRuns} · ${m.wfAgentsMedian} |`,
    `| Workflow opus 비중 · 캐시 쓰기 비중 | ${f0(m.wfOpusShare)}% · ${f0(m.wfCwShare)}% |`,
    `| 풀 묶음 (종류별) | ${m.poolTotal} (${kinds}) |`,
    `| 풀 → Claude 넘김 · 리뷰 지적 · 풀 변경 줄 | ${m.poolFallback} · ${m.poolFindings} · ${m.poolLines} |`,
    `| 결정 · 판단 올리기 · 뒤집음 | ${m.decisions} · ${m.decisionsEsc} · ${m.decisionsRev} |`,
    `| 도구 재시도율 | ${f1(m.toolRetry)}% (${m.toolErrors}/${m.toolTotal}) |`,
    '',
  ].join('\n');
}

export function csvRow(m) {
  const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  return [m.run, m.mode, m.createdAt, m.closedAt, f2(m.cost), f2(m.costCoord), f2(m.costLanes), f2(m.costSub), f2(m.costWf),
    f2(m.activeHours), f2(m.sessionHours), m.lines, m.per1k === null ? '' : f2(m.per1k), f1(m.coordShare), f0(m.coordCtxMedian),
    m.wfRuns, m.wfAgentsMedian, f1(m.wfOpusShare), f1(m.wfCwShare), m.poolTotal, m.poolFallback, m.poolLines, m.poolFindings,
    m.decisions, m.decisionsEsc, m.decisionsRev, f1(m.toolRetry)].map(q).join(',');
}

const outText = (r) => String(r && r.out !== undefined ? r.out : '');

/** 레인 브랜치 머지 커밋의 변경 줄(제외 패턴 적용). */
function gitLines(c, st, cfg, since, until) {
  const repo = c.env.COORD_REPO || outText(runSync('git', ['rev-parse', '--show-toplevel'], { env: c.env, cwd: c.cwd })).trim();
  const git = cfgSub(c, '.git_bin') || 'git';
  const branch = (st.run && st.run.integration_branch) || cfgSub(c, '.integration_branch') || 'dev';
  const laneBranches = Object.values(st.lanes || {}).map((l) => l && l.branch).filter(Boolean);
  const shas = new Set(((st.merge && st.merge.history) || []).map((h) => h && (h.commit || h.sha)).filter(Boolean));
  const lg = runSync(git, ['log', '--first-parent', '--merges', `--since=${since}`, `--until=${until}`, '--format=%H%x09%s', branch], { env: c.env, cwd: repo });
  for (const line of outText(lg).split('\n')) {
    const [sha, subj = ''] = line.split('\t');
    if (sha && laneBranches.some((b) => subj.includes(`'${b}'`))) shas.add(sha);
  }
  const ex = ((cfg.metrics && cfg.metrics.exclude) || []).map((p) => `:(exclude,glob)**/${p}`);
  let add = 0; let del = 0; let files = 0;
  for (const sha of shas) {
    const r = runSync(git, ['diff', '--numstat', `${sha}^1`, sha, '--', '.', ...ex], { env: c.env, cwd: repo });
    for (const l of outText(r).split('\n')) {
      const [a, d] = l.split('\t');
      if (/^\d+$/.test(a || '') && /^\d+$/.test(d || '')) { add += Number(a); del += Number(d); files += 1; }
    }
  }
  return { merges: shas.size, files, add, del, lines: add + del };
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '').flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

export async function main(argv, { env, cwd }) {
  const o = { run: '', stdout: false, csv: true, since: '', until: '', dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
    if (a === '--run') o.run = argv[++i] ?? '';
    else if (a === '--stdout') o.stdout = true;
    else if (a === '--no-csv') o.csv = false;
    else if (a === '--since') o.since = argv[++i] ?? '';
    else if (a === '--until') o.until = argv[++i] ?? '';
    else if (a === '--dry-run') o.dry = true;
    else { process.stderr.write(`알 수 없는 인자: ${a}\n${HELP}`); return 2; }
  }
  const c = new Ctx(o.run ? { ...env, COORD_RUN: o.run } : env, cwd);
  try {
    const dir = runDir(c);
    if (!existsSync(stateFile(c))) throw new CoordDie(3, `회차 state 가 없다: ${o.run || '(현재)'}`);
    const st = JSON.parse(readFileSync(stateFile(c), 'utf8'));
    const cfg = JSON.parse(cfgAll(c));
    const mc = cfg.metrics || {};
    const since = o.since || (st.run && st.run.created_at) || '1970-01-01T00:00:00Z';
    const until = o.until || (st.run && st.run.closed_at) || new Date().toISOString();
    const sessions = [];
    const csid = st.run && st.run.coordinator && st.run.coordinator.session_id;
    if (csid) sessions.push({ sid: csid, role: 'coord' });
    for (const [name, l] of Object.entries(st.lanes || {})) {
      const sid = l && l.session && l.session.session_id;
      if (sid) sessions.push({ sid, role: 'lane', lane: name });
    }
    const m = collectMetrics({
      projectsDir: expand(cfgSub(c, '.claude_projects_dir') || '~/.claude/projects'),
      prices: mc.prices || {}, gapMin: Number(mc.gap_min ?? 15),
      sinceMs: Date.parse(since), untilMs: Date.parse(until),
      sessions, git: gitLines(c, st, cfg, since, until),
      // 같은 묶음 id 가 여러 줄(완료 줄 + pool.mjs note 보정 줄)이면 마지막 줄만
      pool: [...new Map(readJsonl(join(dir, 'pool', 'log.jsonl')).map((r) => [r.id, r])).values()],
      decisions: st.decisions || [],
      run: { ...(st.run || {}), mode: (st.run && st.run.mode) || cfgSub(c, '.mode.default') },
    });
    const md = renderMarkdown(m);
    const per1k = m.per1k === null ? '-' : f1(m.per1k);
    const head = `cost=${f2(m.cost)} per1k=${per1k} coord=${f0(m.coordShare)}% lines=${m.lines}`;
    if (o.dry) { process.stderr.write('DRY metrics.md·CSV 를 쓰지 않음\n'); process.stdout.write(`DRY METRICS ${m.run} ${head} file=-\n`); return 0; }
    let file = '-';
    if (o.stdout) process.stdout.write(md);
    else { file = join(dir, 'metrics.md'); writeFileSync(file, md); }
    if (o.csv) {
      const csv = join(stateRoot(c), mc.csv || 'metrics.csv');
      if (!existsSync(csv)) writeFileSync(csv, `${CSV_HEADER}\n`);
      appendFileSync(csv, `${csvRow(m)}\n`);
    }
    process.stdout.write(`METRICS ${m.run} ${head} file=${file}\n`);
    return 0;
  } catch (e) {
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc ?? 3; }
    throw e;
  }
}

if (isMain(import.meta.url)) scriptMain(main);
```

Step 1 에서 확인한 실제 모양에 맞춰 조정한다:
- `runSync` 의 반환이 `{rc, out}` 가 아니면 `outText` 를 고친다.
- `CoordDie` 의 rc 속성 이름이 `rc` 가 아니면 맞춘다(다른 스크립트의 catch 를 본다).
- `runDir(c)` 가 회차 없음에서 `CoordDie(3)` 를 던지는지 확인한다(시험 `--run nope` → rc 3).
- 레인 브랜치 칸이 `branch` 가 아니면 `gitLines` 와 시험 state 를 함께 고친다.
- `:(exclude,glob)**/<패턴>` 이 시험에서 `note.md` 를 빼는지 확인한다. 안 되면 `:(exclude)*<패턴>` 형식으로 바꾼다.

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/run-metrics.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 6: closing.md 에 측정 단계 추가**

`references/closing.md` §4(정리 확인)와 §5(최종 보고) 사이에 절을 넣는다. 번호는 §4.5 로 한다(뒤 절 번호를 바꾸지 않는다).

```markdown
## 4.5 측정

- `node scripts/run-metrics.mjs` 실행 → `METRICS …` 한 줄 확인
  - `<회차>/metrics.md` 생성, `<state_dir>/metrics.csv` 에 한 줄 추가
  - 실패해도 마감은 계속. 사용자에게 한 줄 알림
- §5 최종 보고 입력에 `metrics.md` 추가
- 목표값(설계 2026-10-10 §7.2)과 비교한 한 줄을 SUMMARY 에 기재
  - 예: `1천 줄당 $6.2(목표 $7) · 조정 9%(목표 10%) · 풀 줄 34%`
```

그리고 §5 의 서브에이전트 입력 목록에 `metrics.md` 를 더한다.

- [ ] **Step 7: 전체 시험·커밋**

Run: `node --test tests/`
Expected: 전체 PASS

```bash
git add scripts/run-metrics.mjs tests/run-metrics.test.mjs references/closing.md
git commit -m "feat(coordinator): 회차 지표 측정 run-metrics.mjs·finish 측정 단계

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
