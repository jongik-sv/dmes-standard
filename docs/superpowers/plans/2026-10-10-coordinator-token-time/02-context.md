# 조정자 토큰·시간 개편 — Task 4~5: 컨텍스트 토큰 상한·`/clear` 정리

> 공통 제약·P1~P9·Review Focus·파일 구조는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [01-measure.md](01-measure.md) · [README](README.md) · 다음: [03-mode-parallel.md](03-mode-parallel.md)

### Task 4: tick 컨텍스트 토큰 상한

**Files:**
- Modify: `SK/scripts/tick.mjs` (§3 컨텍스트 임계, :124-164)
- Test: `SK/tests/tick.test.mjs`

**Interfaces:**
- Consumes: Task 1 설정 `compact.lane_max`(250000)·`compact.coordinator_max`(200000).
- Produces:
  - `export function laneTokens(pct: number, win: number) → number` (NaN 가능)
  - `export function ctxOver({pct, thr, tokens, max}) → boolean`
  - 출력 줄(형식 변경, 끝에 두 칸 추가): `CTX_OVER <레인> pct=<n> thr=<n> tokens=<n|-> max=<n|->`, `CTX_OVER_SELF pct=<n> thr=<n> tokens=<n|-> max=<n|->`
  - 판정: `pct >= thr` 또는 `tokens >= max` (max > 0 이고 둘 다 숫자일 때). 레인 쿨다운 규칙은 그대로.

- [ ] **Step 1: 실패하는 시험 작성**

`tests/tick.test.mjs` 머리 import 에 `import { ctxOver, laneTokens } from '../scripts/tick.mjs';` 를 더하고, 끝에 아래 시험을 더한다.

```js
test('ctxOver: pct 임계 또는 토큰 상한', () => {
  assert.equal(ctxOver({ pct: 45, thr: 40, tokens: 1000, max: 250000 }), true);
  assert.equal(ctxOver({ pct: 30, thr: 40, tokens: 300000, max: 250000 }), true);
  assert.equal(ctxOver({ pct: 30, thr: 40, tokens: 100000, max: 250000 }), false);
  assert.equal(ctxOver({ pct: 30, thr: 40, tokens: NaN, max: 250000 }), false);
  assert.equal(ctxOver({ pct: 30, thr: 40, tokens: 300000, max: 0 }), false);
  assert.equal(ctxOver({ pct: NaN, thr: 40, tokens: 300000, max: 250000 }), true);
});

test('laneTokens: pct × window / 100 반올림', () => {
  assert.equal(laneTokens(30, 1000000), 300000);
  assert.equal(laneTokens(33, 200000), 66000);
  assert.ok(Number.isNaN(laneTokens(30, NaN)));
});

test('틱: 조정 세션 토큰이 coordinator_max 를 넘으면 pct 가 임계 아래여도 CTX_OVER_SELF', () => {
  const w = world();
  w.cs('set', '.run.coordinator.session_id', '"self-sid"');
  mkdirSync(join(w.stateRoot, 'ctx'), { recursive: true });
  writeFileSync(join(w.stateRoot, 'ctx', 'self-sid.json'), JSON.stringify({
    at: Math.floor(Date.now() / 1000), session_id: 'self-sid',
    context_window: { context_window_size: 1000000, current_usage: { input_tokens: 10000, cache_read_input_tokens: 200000, cache_creation_input_tokens: 0 } },
  }));
  const r = w.tick([]);
  assert.match(r.stdout, /^CTX_OVER_SELF pct=21 thr=40 tokens=210000 max=200000$/m);
});

test('틱: 조정 세션 토큰이 상한 아래면 CTX_OVER_SELF 없음', () => {
  const w = world();
  w.cs('set', '.run.coordinator.session_id', '"self-sid"');
  mkdirSync(join(w.stateRoot, 'ctx'), { recursive: true });
  writeFileSync(join(w.stateRoot, 'ctx', 'self-sid.json'), JSON.stringify({
    at: Math.floor(Date.now() / 1000), session_id: 'self-sid',
    context_window: { context_window_size: 1000000, current_usage: { input_tokens: 10000, cache_read_input_tokens: 90000, cache_creation_input_tokens: 0 } },
  }));
  const r = w.tick([]);
  assert.doesNotMatch(r.stdout, /CTX_OVER_SELF/);
});
```

`world()` 가 돌려주는 객체에 `stateRoot`·`cs`(coord-state 호출)·`tick`(tick 실행) 이 없으면 기존 `world()` 를 읽고 그 이름에 맞춘다. 기존 시험이 쓰는 이름을 그대로 쓴다(예: `w.run('tick.mjs', [])`). `mkdirSync`·`writeFileSync`·`join` import 가 없으면 더한다. 조정 세션 덤프 경로가 `ctx-usage.mjs` 에서 `<stateRoot>/ctx/<sid>.json` 이 아니면 그 경로에 맞춘다. 기본 설정의 `compact.by_window["1000000"].pct` 가 40 이 아니면 기대값 `thr=` 를 그 값으로 바꾼다.

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/tick.test.mjs`
Expected: FAIL (`ctxOver` export 없음)

- [ ] **Step 3: 구현**

`scripts/tick.mjs` 의 import 아래(또는 HELP 상수 아래)에 순수 함수를 둔다.

```js
/** 레인 컨텍스트 토큰 어림: pct × window / 100 (반올림). */
export function laneTokens(pct, win) {
  const p = Number(pct); const w = Number(win);
  if (!Number.isFinite(p) || !Number.isFinite(w)) return NaN;
  return Math.round((p * w) / 100);
}

/** 컨텍스트 정리 필요: pct 임계 또는 토큰 상한(설계 2026-10-10 §5.1). */
export function ctxOver({ pct, thr, tokens, max }) {
  if (Number.isFinite(pct) && Number.isFinite(thr) && pct >= thr) return true;
  return Number.isFinite(tokens) && Number.isFinite(max) && max > 0 && tokens >= max;
}
```

레인 반복문(:136 부근)을 고친다. `const thr = thrFor(win);` 다음 줄부터 `emit(...)` 까지를 아래로 바꾼다.

```js
      const thr = thrFor(win);
      const laneMax = Number(cfgSub(c, '.compact.lane_max') || '0');
      const tokens = laneTokens(Number(pct), Number(win));
      if (!ctxOver({ pct: Number(pct), thr: Number(thr), tokens, max: laneMax })) continue;
      const last = stripNl(isoToEpoch(c, stripNl(laneGet(c, L, '.compact.last_at').out)));
      if (last !== '') {
        const li = testInt(last); const ci = testInt(cool);
        if (li !== null && ci !== null && BigInt(Math.trunc((now - Number(li)) / 60)) < ci) continue;
      }
      emit(`CTX_OVER ${L} pct=${pct} thr=${thr} tokens=${Number.isFinite(tokens) ? tokens : '-'} max=${laneMax || '-'}`);
```

조정 세션 부분(:154 부근)을 고친다.

```js
      if (cu.includes(' pct=')) {
        const pct = cu.replace(/^.* pct=([0-9]*).*$/, '$1');
        const win = cu.replace(/^.* window=([0-9]*).*$/, '$1');
        const tok = cu.includes(' tokens=') ? cu.replace(/^.* tokens=([0-9]*).*$/, '$1') : '';
        const thr = thrFor(win);
        const selfMax = Number(cfgSub(c, '.compact.coordinator_max') || '0');
        const tokens = tok === '' ? NaN : Number(tok);
        if (ctxOver({ pct: Number(pct), thr: Number(thr), tokens, max: selfMax })) {
          emit(`CTX_OVER_SELF pct=${pct} thr=${thr} tokens=${Number.isFinite(tokens) ? tokens : '-'} max=${selfMax || '-'}`);
        }
      }
```

`HELP` 상수에 출력 줄 설명이 있으면 두 줄의 새 형식(`tokens=`·`max=`)을 반영한다.

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/tick.test.mjs`
Expected: PASS (기존 + 4)

Run: `grep -rn "CTX_OVER" references/ SKILL.md` — 출력 형식(`pct=… thr=…`)을 글자 그대로 적은 곳이 있으면 이 Task 에서 ` tokens=… max=…` 를 더한다. `SKILL.md` 는 Task 12 가 고치므로 여기서는 고치지 않는다(목록만 Task 12 보고에 남긴다).

- [ ] **Step 5: 전체 시험·커밋**

Run: `node --test tests/`
Expected: 전체 PASS

```bash
git add scripts/tick.mjs tests/tick.test.mjs
git commit -m "feat(coordinator): 틱 컨텍스트 판정에 토큰 상한(lane_max·coordinator_max)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `compact-lane --clear` 와 정리 문서

**Files:**
- Modify: `SK/scripts/compact-lane.mjs`
- Create: `SK/tests/compact-lane.test.mjs`
- Modify: `SK/references/compact.md`, `SK/references/resume.md`

**Interfaces:**
- Consumes: state `lanes.<L>.pre_compact`(정본 메모 경로 등, 기존 칸), 기존 `compact-lane.mjs` 의 거부 판정·`term-send-safe.mjs` 호출.
- Produces:
  - CLI: `compact-lane.mjs <레인> [--clear] [--force-no-memo] [--over-draft] [--dry-run]`
  - `--clear` 동작: `/clear` 전송 → 입력창이 빌 때까지 대기 → 재개 문구 전송.
  - `--clear` 에서는 `--force-no-memo` 를 받지 않는다. 메모가 없으면 `COMPACT_REFUSED <레인> no-memo`.
  - 성공 줄: `COMPACT_DONE <레인> before=<n|-> after=<n|-> mode=clear` (기존 `/compact` 경로 출력은 그대로)
  - dry-run: `DRY COMPACT_DONE <레인> before=<n|-> after=- mode=clear`
  - `export function resumeText({lane, memo, cname, caddr, next}) → string`

- [ ] **Step 1: 기존 흐름 확인**

Run: `sed -n 60,205p scripts/compact-lane.mjs`
확인할 것: 거부 판정 순서, 메모·조정 세션 이름·다음 단계 값을 읽는 변수(`memo`·`cname`·`caddr`·`next`), `/compact` 문구 조립(:114), 전송(:130), 완료 대기 루프, dry-run 분기(:138). 그리고 `tests/term-send-safe.test.mjs` 에서 가짜 orca(`tests/support/fake-tools.mjs`) 쓰는 법.

- [ ] **Step 2: 실패하는 시험 작성**

```js
// tests/compact-lane.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeText } from '../scripts/compact-lane.mjs';

test('resumeText: 정본·조정 세션·다음 단계를 담고 슬래시 명령으로 시작하지 않는다', () => {
  const t = resumeText({ lane: 'a1', memo: '/tmp/memo-a1.md', cname: 'coord', caddr: 'coord@x', next: 'Task 3 리뷰' });
  assert.match(t, /^\[조정자→a1\] 재개:/);
  assert.match(t, /\/tmp\/memo-a1\.md/);
  assert.match(t, /coord\(coord@x\)/);
  assert.match(t, /Task 3 리뷰/);
  const e = resumeText({ lane: 'b', memo: '', cname: '', caddr: '', next: '' });
  assert.match(e, /정본 - /);
});
```

그리고 같은 파일에 CLI 시험 두 개를 더한다. 가짜 orca 와 state 준비는 `tests/term-send-safe.test.mjs` 또는 `tests/close-lane.test.mjs` 의 `world()`·준비 함수를 복사해서 쓴다. 레인 `a1` 은 `kind: "claude"`, `session.handle: "term_x"` 로 둔다.

```js
test('--clear: 정본 메모가 없으면 no-memo 로 거부(--force-no-memo 무시)', () => {
  const w = world();               // 위에서 복사한 준비 함수
  laneWithHandle(w, 'a1');         // lanes.a1 = {kind:"claude", session:{handle:"term_x"}} 를 coord-state set 으로 기록
  const r = w.run('compact-lane.mjs', ['a1', '--clear', '--force-no-memo', '--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'COMPACT_REFUSED a1 no-memo\n');
});

test('--clear --dry-run: 메모가 있으면 DRY COMPACT_DONE … mode=clear', () => {
  const w = world();
  laneWithHandle(w, 'a1');
  w.cs('set', '.lanes.a1.pre_compact', JSON.stringify({ memo: '/tmp/memo-a1.md', next: 'Task 3', at: new Date().toISOString() }));
  const r = w.run('compact-lane.mjs', ['a1', '--clear', '--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^DRY COMPACT_DONE a1 before=\S+ after=- mode=clear\n$/);
});
```

`pre_compact` 칸 이름·모양이 다르면(Step 1 에서 확인) 시험 state 를 실제 모양에 맞춘다. dry-run 이 화면 확인을 실제로 하므로(머리 주석: 「판정·화면 확인은 실제로」) 가짜 orca 의 `terminal read` 응답이 빈 입력창 화면을 돌려주게 한다.

- [ ] **Step 3: 실패 확인**

Run: `node --test tests/compact-lane.test.mjs`
Expected: FAIL (`resumeText` export 없음)

- [ ] **Step 4: 구현**

```js
/** /clear 뒤 레인에 보낼 재개 문구(설계 2026-10-10 §5.1). 슬래시로 시작하지 않는다. */
export function resumeText({ lane, memo, cname, caddr, next }) {
  const d = (v) => (v && v !== '' ? v : '-');
  return `[조정자→${lane}] 재개: 컨텍스트를 비웠다. 정본 ${d(memo)} 를 읽고 이어서 진행한다. 조정 세션 ${d(cname)}(${d(caddr)}). 다음 단계: ${d(next)}`;
}
```

`main` 에 `--clear` 플래그를 파싱한다(`let clear = false;` … `else if (a === '--clear') clear = true;`). 거부 판정에서 메모 확인 부분을 고친다.

```js
    if (memo === '' && (clear || !forceNoMemo)) return refuse('no-memo', clear ? '--clear 는 정본 메모가 있어야 한다(재개 근거)' : undefined);
```

`/compact` 문구를 만드는 자리(:114)에서 분기한다.

```js
    let text = clear ? '/clear' : `/compact ${lane} 진행 중. 정본은 ${memo !== '' ? memo : '-'}. 조정 세션 ${cname !== '' ? cname : '-'}(${caddr !== '' ? caddr : '-'}). 다음 단계: ${next !== '' ? next : '-'}`;
```

dry-run 분기(:138)의 출력에 `clear` 일 때 ` mode=clear` 를 붙인다. 실제 전송 뒤:
- `clear` 가 아니면 기존 완료 대기(Compacted 확인)를 그대로 한다.
- `clear` 이면 `orca terminal wait --terminal <h> --for tui-idle --timeout-ms 60000 --json` 을 `runSync` 로 부르고 `satisfied: true` 를 확인한다. 실패하면 `COMPACT_TIMEOUT <레인>`.
- 그다음 `term-send-safe.mjs --handle <h> --text <resumeText(...)> --timeout-ms 300000` 로 재개 문구를 보낸다. `SENT ` 로 시작하지 않으면 `CoordDie(4, ...)`.
- after 는 기존과 같은 방식(ctx-usage 재측정, 못 읽으면 `-`)으로 구한다.
- 성공 줄 끝에 ` mode=clear` 를 붙인다.
- `.compact.last_at` 기록은 기존 경로를 그대로 탄다(쿨다운 공유).

`HELP` 와 머리 주석의 사용법·출력 줄에 `--clear` 와 ` mode=clear` 를 더한다.

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/compact-lane.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 6: compact.md·resume.md 갱신**

`references/compact.md`:
- §5 절차의 `compact-lane.mjs <lane>` 을 `compact-lane.mjs <lane> --clear` 로 바꾸고, 아래를 덧붙인다.
  - `--clear` = `/clear` → 입력창 빈 것 확인 → 재개 문구(정본 경로·다음 단계) 전송. 정본 메모 필수
  - `/compact` 경로(옵션 없음)는 정본 메모를 받을 수 없을 때만
  - 이유: `/compact` 는 큰 컨텍스트를 한 번 더 읽고 요약을 씀. `/clear` 는 재독 세트만 읽음
- 판정 줄 설명에 「`CTX_OVER` = `pct ≥ thr` 또는 `tokens ≥ compact.lane_max`(기본 250000)」를 적는다. 출력 형식 `CTX_OVER <레인> pct=<n> thr=<n> tokens=<n|-> max=<n|->`.
- §8 조정 세션 자신: 「`CTX_OVER_SELF` = `pct ≥ thr` 또는 `tokens ≥ compact.coordinator_max`(기본 200000)」. 절차를 아래로 바꾼다.
  1. 정본 메모·`coord-state.mjs summary` 갱신
  2. 사용자에게 한 줄: 「`/clear` 입력 뒤 `[조정자 재개] .claude/skills/coordinator/references/resume.md 의 재독 세트만 읽고 이어서` 를 입력」
  3. 같은 알림을 틱마다 반복하지 않음

`references/resume.md` §1 재독 세트:
- `coord-state.mjs summary` 항목에 「최근 결정 20개 포함(같은 질문 재판단 금지, `decide` 기록 먼저 확인)」을 더한다.
- `coord-state.mjs get` 뒤에 「`run.mode` 확인(없으면 `mode.default`)」 한 줄을 더한다.

- [ ] **Step 7: 전체 시험·커밋**

Run: `node --test tests/`
Expected: 전체 PASS

```bash
git add scripts/compact-lane.mjs tests/compact-lane.test.mjs references/compact.md references/resume.md
git commit -m "feat(coordinator): compact-lane --clear(정본 재독 재개)·컨텍스트 토큰 상한 문서

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
