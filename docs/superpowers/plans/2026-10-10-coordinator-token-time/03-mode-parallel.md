# 조정자 토큰·시간 개편 — Task 6~7: 회차 모드·결정 기록·레인 병렬 지시

> 공통 제약·P1~P9·Review Focus·파일 구조는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [02-context.md](02-context.md) · [README](README.md) · 다음: [04-pool.md](04-pool.md)

### Task 6: `coord-state.mjs` 의 `mode`·`decide`·`decisions`

**Files:**
- Modify: `SK/scripts/coord-state.mjs` (switch :1149-1175, `HELP`·`USAGE`, `cmdSummary` :970 과 jq 폴백 :1040)
- Create: `SK/tests/coord-state-mode.test.mjs`

**Interfaces:**
- Produces:
  - `coord-state.mjs mode` → stdout `MODE <token|time> src=<state|default>`
  - `coord-state.mjs mode <token|time>` → state `.run.mode` 기록, 이벤트 `mode`, stdout `OK mode=<m>`. 다른 값 → rc 2.
  - `coord-state.mjs decide <레인|-> <질문 요약> <결정> [--esc] [--reverse]` → `.decisions` 끝에 `{at, lane, q, text}` (+ `esc: true`, `reverse: true` 는 플래그가 있을 때만) 추가, 이벤트 `decide`, stdout `OK decision=<번호>` (0부터). 레인이 `-` 가 아니면 레인이 있어야 한다(없으면 기존 `laneExists` 의 오류).
  - `coord-state.mjs decisions [--last <n>] [--grep <글>]` → 줄마다 `DECISION <번호> <at> <lane> <q> => <text>[ esc][ reverse]`. 기본 `--last 20`. `--grep` 은 q·text 에 대소문자 무시 부분 일치. 없으면 `DECISION none`.
  - `summary` 의 결정 목록: 최근 20개. 줄 형식 = `q` 가 있으면 `- <at> [<lane>] <q> → <text>`, 없으면 기존 `- <at> <text>`.
  - Task 3 이 `decisions[].esc`·`decisions[].reverse` 를 센다.

- [ ] **Step 1: 기존 구조 확인**

Run: `sed -n 15,50p scripts/coord-state.mjs` (HELP·USAGE), `sed -n 686,720p scripts/coord-state.mjs` (cmdReport 인자 파싱), `sed -n 825,850p scripts/coord-state.mjs` (cmdHold), `sed -n 960,975p scripts/coord-state.mjs`, `sed -n 1035,1045p scripts/coord-state.mjs`
확인할 것: `stUpdate`·`evAppend`·`laneExists`·`nowIso` 사용법, 요약의 JS 경로와 jq 폴백 경로가 같은 글을 만드는 방식.

- [ ] **Step 2: 실패하는 시험 작성**

```js
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
```

`summary` 가 결과를 파일(`summary.md`)에 쓰는지 stdout 에 쓰는지는 Step 1 에서 확인한다. 위 시험은 둘을 합쳐서 본다. `summary.md` 경로가 다르면 맞춘다.

- [ ] **Step 3: 실패 확인**

Run: `node --test tests/coord-state-mode.test.mjs`
Expected: FAIL (`mode` 하위 명령 없음 → rc 2)

- [ ] **Step 4: 구현**

switch 에 세 줄을 더한다.

```js
      case 'mode': cmdMode(c, rest); break;
      case 'decide': cmdDecide(c, rest); break;
      case 'decisions': cmdDecisions(c, rest); break;
```

명령 함수(`cmdHold` 근처에 둔다). `stUpdate` 의 `jqExpr`·`jqArgs` 는 jq 폴백용이다. 기존 명령처럼 같은 뜻의 jq 식을 함께 적는다.

```js
function cmdMode(c, argv) {
  const [m] = argv;
  if (m === undefined) {
    const doc = readStateDoc(c);                       // 기존 state 읽기 함수 이름에 맞춘다
    const v = J.index(J.index(doc, 'run'), 'mode');
    if (v !== null && v !== undefined && J.tostring(v) !== '') { process.stdout.write(`MODE ${J.tostring(v)} src=state\n`); return; }
    const d = cfgSub(c, '.mode.default') || 'token';
    process.stdout.write(`MODE ${d} src=default\n`);
    return;
  }
  if (m !== 'token' && m !== 'time') die(2, `mode 는 token 또는 time: ${m}`);
  if (stUpdate(c, {
    jqExpr: '.run.mode = $m', jqArgs: () => ['--arg', 'm', m],
    apply(doc) { J.index(doc, 'run').set('mode', m); return doc; },
  }) !== 0) exitNow(4);
  evAppend(c, runDirSub(c), 'mode', '-', J.tojson(new Map([['mode', m]])));
  process.stdout.write(`OK mode=${m}\n`);
}

function cmdDecide(c, argv) {
  const flags = { esc: false, reverse: false };
  const pos = [];
  for (const a of argv) {
    if (a === '--esc') flags.esc = true;
    else if (a === '--reverse') flags.reverse = true;
    else pos.push(a);
  }
  if (pos.length !== 3) die(2, '사용법: coord-state.mjs decide <레인|-> <질문 요약> <결정> [--esc] [--reverse]');
  const [lane, q, text] = pos;
  if (lane !== '-') laneExists(c, lane);
  const at = nowIso(c);
  let idx = -1;
  if (stUpdate(c, {
    jqExpr: '.decisions = ((.decisions // []) + [$d])',
    jqArgs: () => ['--argjson', 'd', JSON.stringify({ at, lane, q, text, ...(flags.esc ? { esc: true } : {}), ...(flags.reverse ? { reverse: true } : {}) })],
    apply(doc) {
      let arr = J.index(doc, 'decisions');
      if (!Array.isArray(arr)) { arr = []; doc.set('decisions', arr); }
      const e = new Map([['at', at], ['lane', lane], ['q', q], ['text', text]]);
      if (flags.esc) e.set('esc', true);
      if (flags.reverse) e.set('reverse', true);
      arr.push(e);
      idx = arr.length - 1;
      return doc;
    },
  }) !== 0) exitNow(4);
  if (idx < 0) idx = arrLen(readStateDoc(c), 'decisions') - 1;   // jq 폴백 경로일 때 다시 읽어서 번호
  evAppend(c, runDirSub(c), 'decide', lane, J.tojson(new Map([['q', q], ['text', text]])));
  process.stdout.write(`OK decision=${idx}\n`);
}

function cmdDecisions(c, argv) {
  let last = 20; let grep = '';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--last') last = Number(argv[++i]);
    else if (argv[i] === '--grep') grep = String(argv[++i] ?? '').toLowerCase();
    else die(2, '사용법: coord-state.mjs decisions [--last <n>] [--grep <글>]');
  }
  if (!Number.isInteger(last) || last < 1) die(2, '--last 는 1 이상 정수');
  const doc = readStateDoc(c);
  const arr = J.index(doc, 'decisions');
  const list = (Array.isArray(arr) ? arr : []).map((d, i) => ({ i, d }));
  const s = (d, k) => { const v = J.index(d, k); return v === null || v === undefined ? '' : J.tostring(v); };
  const hit = list.filter(({ d }) => grep === '' || `${s(d, 'q')} ${s(d, 'text')}`.toLowerCase().includes(grep)).slice(-last);
  if (hit.length === 0) { process.stdout.write('DECISION none\n'); return; }
  for (const { i, d } of hit) {
    const tail = `${J.index(d, 'esc') === true ? ' esc' : ''}${J.index(d, 'reverse') === true ? ' reverse' : ''}`;
    process.stdout.write(`DECISION ${i} ${s(d, 'at')} ${s(d, 'lane') || '-'} ${s(d, 'q') || '-'} => ${s(d, 'text')}${tail}\n`);
  }
}
```

- `readStateDoc`·`arrLen`·`die`·`exitNow`·`runDirSub` 는 Step 1 에서 본 실제 함수 이름으로 바꾼다. 같은 일을 하는 함수가 없으면 파일 안의 기존 패턴으로 작은 도우미를 만든다.
- `J.index` 가 배열 요소를 `Map` 으로 돌려주는지, JSON 배열을 JS 배열로 돌려주는지 확인하고 맞춘다.

`cmdSummary`(:965 부근)의 결정 목록을 고친다.

```js
  const decisions = arrOf(ix(doc, 'decisions'));
  if (decisions.length === 0) push('- 없음');
  else for (const d of decisions.slice(-20)) {
    const q = asText(ix(d, 'q'));
    push(q !== '' ? `- ${vTxt(ix(d, 'at'))} [${asText(ix(d, 'lane')) || '-'}] ${q} → ${asText(ix(d, 'text'))}` : `- ${vTxt(ix(d, 'at'))} ${asText(ix(d, 'text'))}`);
  }
```

jq 폴백 식(:1040)도 같은 뜻으로 바꾼다.

```
(if (.decisions // []) == [] then "- 없음" else (.decisions[-20:][] | if (.q // "") != "" then "- \(.at | v) [\(.lane // "-")] \(.q) → \(.text)" else "- \(.at | v) \(.text)" end) end)
```

`HELP` 와 `USAGE` 에 세 명령 사용법을 더한다.

```
#   mode [token|time]                      회차 모드 보기·기록(state .run.mode, 없으면 설정 mode.default)
#   decide <레인|-> <질문> <결정> [--esc] [--reverse]   레인 질문 결정 기록(.decisions)
#   decisions [--last n] [--grep 글]        결정 기록 찾기(같은 질문 재판단 금지용)
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/coord-state-mode.test.mjs tests/coord-state.test.mjs`
Expected: PASS. 골든 시험(`coord-state.test.mjs`)이 `help`·`bogus` 사례에서 깨지면 stdout 이 바뀌었는지 본다. HELP 가 stderr 로만 가면 골든은 그대로 통과해야 한다. stdout 이 바뀌어 깨지면 골든 파일을 고치지 말고 HELP 출력 경로를 기존과 같게 맞춘다.

- [ ] **Step 6: 전체 시험·커밋**

Run: `node --test tests/`
Expected: 전체 PASS

```bash
git add scripts/coord-state.mjs tests/coord-state-mode.test.mjs
git commit -m "feat(coordinator): coord-state mode·decide·decisions, 요약 결정 20개

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 레인 병렬·모드·Workflow 지시문과 기준표

**Files:**
- Modify: `SK/templates/brief.md` (「작업 방식」 절)
- Modify: `SK/references/workflow.md` (§1 자리표시자, §2 예외, §3 상한, 새 §3.1 모델 규율·§3.2 캐시)
- Modify: `SK/references/sizing.md` (§2 표에 DP 행, §3 고르는 순서, §4 흔한 과잉)
- Modify: `SK/references/decompose.md` (§2 항목 표: 레인 안 항목 표 형식)

**Interfaces:**
- Consumes: Task 1 설정 이름(`mode.*`, `workflow.agents_by_mode`, `compact.lane_max`), Task 9 의 CLI 이름 `pool.mjs submit` 과 문서 `references/pool.md`(Task 10 이 만든다. 여기서는 경로만 적는다).
- Produces: 지시문 자리표시자 `{mode}`·`{wf_min}`·`{pool_cmd}`·`{pool_doc}`·`{lane_max}` (조정자가 채운다. 채우는 규칙 = `workflow.md` §1).

이 Task 는 문서만 고친다. 시험 대신 각 Step 끝에 `grep` 확인을 한다.

- [ ] **Step 1: brief.md 「작업 방식」 고치기**

현재 줄 `  - 수정분 확인이 clean 이 아니면 다음 항목 금지` 를 아래로 바꾼다.

```markdown
  - 수정분 확인이 clean 이 아니면 그 항목에 의존하는 항목만 대기(다른 항목은 계속)
```

현재 줄 `- 동시 agent = {N}개까지` 를 아래 블록으로 바꾼다.

```markdown
- 회차 모드 = {mode} (token = 토큰 우선, time = 시간 우선)
- 병렬 배정(레인 안)
  - 착수 때 항목 표에 항목마다 `선행 항목`·`건드릴 파일` 기재({sizing_doc} 옆 decompose 형식)
  - 선행이 끝났고 진행 중 항목과 건드릴 파일이 안 겹치는 항목 → 동시 상한까지 한꺼번에 시작
  - 동시 agent = {N}개까지(구현·리뷰·수정 합)
  - 구현 agent = 자기 항목 파일만 수정, 커밋 금지
  - 컨트롤러 = 그 항목 파일만 `git add <파일…>` 로 커밋
    - 커밋 전 `git status` 로 소유 밖 변경 확인 → 있으면 그 항목 멈추고 보고
  - 구현 끝난 항목 → 바로 커밋·리뷰 시작. 다른 항목 구현은 계속
  - 리뷰가 clean 될 때까지 그 항목 파일 = 그 항목 소유
  - 웨이브(함께 진행한 묶음) 끝 → 컨트롤러가 모듈 시험 1회(heavy.mjs)
- agent 보고 = `task-<번호>-report.md` 파일 + 컨트롤러에게 5줄 이하 요약
- 비-Claude 풀(절차 {pool_doc})
  - token 모드: S/M 구현·조사·문서 → 풀 먼저(`{pool_cmd} submit …`)
  - time 모드: Claude agent 와 풀 중 먼저 비는 쪽
  - 풀 결과 → 완료 조건 시험 1회 → Claude 리뷰
  - 풀 실패·리뷰 지적 → Claude agent 가 처리(풀에 다시 맡기지 않음)
  - 풀 금지: L·동시성·트랜잭션·보안·공유 API·원인 모를 결함
- 컨텍스트 {lane_max} 토큰 넘음 → 조정자의 정본 갱신 요청에 답하고 `/clear` 재개 대기
```

현재 Workflow 줄 `- Workflow(D4) = 구현→리뷰→수정이 필요한 M/L 항목, 같은 흐름 반복일 때만` 을 아래로 바꾼다.

```markdown
- Workflow(D4) = 같은 흐름(구현→리뷰→수정) M/L 항목이 {wf_min}개 이상일 때만
  - agent 2개 이하로 끝나는 일 → Agent 도구 직접(D2·D3)
  - Workflow 안에서 풀 호출 금지(풀은 레인이 Workflow 밖에서)
```

모델 표 줄 `- 모든 agent() 에 model·effort 기재(크기 S/M/L = 항목 표 기준):` 바로 아래에 한 줄을 더한다.

```markdown
  - opus 를 쓰면 근거 한 줄(L·동시성·판정 중 무엇). token 모드 opus = 판정 리뷰·L 구현만
  - 같은 단계 agent = 같은 모델로 함께 띄움. 지시문은 공통 부분 먼저, 항목별 내용 뒤(캐시 재사용)
```

확인: `grep -n "{mode}\|{wf_min}\|{pool_cmd}\|{pool_doc}\|{lane_max}" templates/brief.md` → 5개 자리표시자가 모두 나온다. `grep -n "다음 항목 금지" templates/brief.md` → 없음.

- [ ] **Step 2: workflow.md 고치기**

§1 자리표시자 목록에 더한다.

```markdown
- `{mode}` = state `run.mode`(없으면 설정 `mode.default`). `coord-state.mjs mode` 출력의 두 번째 칸
- `{wf_min}` = 설정 `mode.workflow_min_items[{mode}]`
- `{pool_cmd}` = `node <스킬 경로>/scripts/pool.mjs`
- `{pool_doc}` = `<스킬 경로>/references/pool.md` 절대 경로
- `{lane_max}` = 설정 `compact.lane_max`
- 모델 표 줄 = `mode` 칸이 없거나 `{mode}` 와 같은 행만
```

§2 예외 목록 끝에 더한다.

```markdown
- agent 2개 이하로 끝나는 일(Agent 도구 D2·D3 로)
- 풀에 맡길 S/M 항목(레인이 `pool.mjs submit` 으로)
```

§3 제목을 「동시 agent 상한(모드·띠별)」로 바꾸고 첫 항목을 아래로 바꾼다.

```markdown
- 레인당 동시 agent = 설정 `workflow.agents_by_mode[{mode}][띠]`
  - 이 키가 없으면 `workflow.agents_by_band[띠]`
  - 기본: token G4·Y3·O2·R0, time G6·Y5·O3·R0
```

§3 끝에 두 절을 더한다.

```markdown
### 3.1 모델 규율

- `agent()` 마다 model·effort 기재. opus 는 근거 한 줄(L·동시성·판정)
- token 모드: opus = 판정 리뷰·L 구현만
  - 실패 사다리에서 sonnet/high 를 한 번 더 시도한 뒤 opus
- 근거(2026-10-04 refactor 회차): Workflow agent 호출의 72% 가 opus, 모델 표 기본은 sonnet

### 3.2 캐시 재사용

- 같은 단계 agent = 같은 모델로 함께 띄움
- 지시문 = 공통 부분 먼저, 항목별 내용 뒤
- 근거: Workflow 비용의 50% 가 캐시 쓰기(agent 마다 새 컨텍스트). 앞부분이 같아야 캐시를 나눠 씀(추정, `run-metrics.mjs` 의 Workflow 캐시 쓰기 비중으로 확인)
```

확인: `grep -n "agents_by_mode\|3.1 모델 규율\|3.2 캐시" references/workflow.md` → 3줄 이상.

- [ ] **Step 3: sizing.md 고치기**

§2 표에서 D1 행과 D2 행 사이에 행을 넣는다.

```markdown
| **DP 풀** | `pool.mjs submit`(opencode·GLM, `references/pool.md`) | 완료 조건 시험이 분명한 S/M 구현·수정, 조사, 문서, 본보기 있는 반복. 풀 금지 목록(L·동시성·트랜잭션·보안·공유 API·원인 모를 결함)이 아님 | 시험이 있는 함수 하나 추가, 화면 문구 정리, 사용처 표 |
```

§2 표의 D4 행 「고르는 조건」 칸을 아래로 바꾼다.

```markdown
같은 흐름(구현 → 리뷰 → 수정) M/L 항목이 `mode.workflow_min_items`(token 4·time 2)개 이상, 또는 결정적 흐름·재개 필요. agent 2개 이하로 끝나면 금지
```

§3 고르는 순서 2번 아래에 더한다.

```markdown
   - token 모드: DP 조건이 맞으면 D2 보다 DP 먼저
   - time 모드: DP 와 D2·D3 중 먼저 비는 쪽
```

§4 흔한 과잉에 더한다.

```markdown
- agent 2개짜리 Workflow → D2·D3 (2026-10-04 회차 Workflow 108회의 회당 agent 중앙값 = 2)
- 풀에 맡길 수 있는 S/M 구현을 Claude agent 로 → token 모드에서는 DP
```

확인: `grep -n "DP 풀\|workflow_min_items\|agent 2개짜리" references/sizing.md` → 3줄 이상.

- [ ] **Step 4: decompose.md 고치기**

§2 항목 표 설명 끝에 레인 안 항목 표 형식을 더한다.

```markdown
### 2.1 레인 안 항목 표(레인이 착수 때 작성)

- 레인은 조정자 항목 하나를 다시 작은 항목으로 나눠 아래 표를 만든다(지시문 「병렬 배정」)
- 칸: `번호`·`제목`·`크기(S/M/L)`·`선행 항목`·`건드릴 파일`·`실행 수단(D0~D5·DP)`
- `건드릴 파일`이 겹치는 두 항목 → 한쪽이 끝난 뒤 다른 쪽(선행 항목으로 적음)
- 같은 묶음으로 시작하는 항목들 = 웨이브. 웨이브 끝에 모듈 시험 1회
```

확인: `grep -n "2.1 레인 안 항목 표" references/decompose.md` → 1줄.

- [ ] **Step 5: 전체 시험·커밋**

Run: `node --test tests/`
Expected: 전체 PASS (문서 변경이라 결과가 같아야 한다)

```bash
git add templates/brief.md references/workflow.md references/sizing.md references/decompose.md
git commit -m "docs(coordinator): 레인 안 병렬 배정·모드·풀·Workflow 조건 지시문과 기준표

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
