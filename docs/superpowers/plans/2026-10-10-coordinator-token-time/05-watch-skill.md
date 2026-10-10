# 조정자 토큰·시간 개편 — Task 11~12: 이벤트 틱·SKILL 정리

> 공통 제약·P1~P12·Review Focus·파일 구조는 [README](README.md)·[04-pool.md](04-pool.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [04-pool.md](04-pool.md) · [README](README.md)

### Task 11: `tick.mjs --watch` 와 `POOL_DONE`

**Files:**
- Modify: `SK/scripts/tick.mjs`
- Test: `SK/tests/tick.test.mjs`

**Interfaces:**
- Consumes: Task 4 의 `tick.mjs` 구조(`emit`, `out[]`, 끝의 출력·후처리), Task 8 의 `<runDir>/pool/log.jsonl` 형식(`{id, lane, result, fallback, …}`, 같은 id 의 뒤 줄 = note 보정).
- Produces:
  - 새 틱 줄: `POOL_DONE <id> lane=<L> result=<r> fallback=<0|1>` (log.jsonl 의 새 완료 줄마다 한 번. 같은 id 의 보정 줄은 내지 않음)
  - 처리 위치 기록: `<runDir>/ticks/pool` (지금까지 본 log.jsonl 줄 수)
  - CLI: `tick.mjs --watch [--interval <초>] [--max-iter <n>] [--repeat-min <분>]`
    - 틱 본문을 `--interval`(기본 60)초마다 돈다. 줄이 있을 때만 stdout 에 쓴다(`TICK quiet` 는 쓰지 않음).
    - 같은 줄은 `--repeat-min`(기본 15)분 안에 다시 쓰지 않는다.
    - 회차가 없어지면(rc 3) 끝낸다. `--max-iter` 는 시험용.
  - `export async function tickOnce(c, opts) → string[]` (한 번 돈 결과 줄들. 후처리 포함)

- [ ] **Step 1: 구조 확인**

Run: `sed -n 60,100p scripts/tick.mjs` 와 `sed -n 240,290p scripts/tick.mjs`
확인할 것: `main` 안에서 `out`·`emit` 선언 위치, 출력·후처리(`last_tick_at`·office·wbs·console-poll) 순서, `ticks/` 폴더 파일을 읽고 쓰는 기존 코드(UNLINKED·load).

- [ ] **Step 2: 실패하는 시험 작성**

`tests/tick.test.mjs` 에 더한다. `world()` 가 돌려주는 이름은 Task 4 에서 맞춘 것과 같게 쓴다. 회차 폴더 경로는 `join(w.stateRoot, 'r1')` 로 본다(다르면 맞춘다).

```js
test('틱: 풀 완료 줄은 POOL_DONE 으로 한 번만, note 보정 줄은 무시', () => {
  const w = world();
  const pdir = join(w.stateRoot, 'r1', 'pool');
  mkdirSync(pdir, { recursive: true });
  const line = (o) => `${JSON.stringify(o)}\n`;
  writeFileSync(join(pdir, 'log.jsonl'), line({ id: 'T1', lane: 'a1', result: 'ok', fallback: false }) + line({ id: 'T2', lane: 'a1', result: 'ratelimit', fallback: true }));
  const r1 = w.tick([]);
  assert.match(r1.stdout, /^POOL_DONE T1 lane=a1 result=ok fallback=0$/m);
  assert.match(r1.stdout, /^POOL_DONE T2 lane=a1 result=ratelimit fallback=1$/m);
  appendFileSync(join(pdir, 'log.jsonl'), line({ id: 'T1', lane: 'a1', result: 'ok', fallback: false, findings: 2 }));
  const r2 = w.tick([]);
  assert.doesNotMatch(r2.stdout, /POOL_DONE/);
  appendFileSync(join(pdir, 'log.jsonl'), line({ id: 'T3', lane: 'b', result: 'fail', fallback: true }));
  assert.match(w.tick([]).stdout, /^POOL_DONE T3 lane=b result=fail fallback=1$/m);
});

test('--watch: 줄이 있을 때만 쓰고 같은 줄은 반복하지 않는다', () => {
  const w = world();
  const pdir = join(w.stateRoot, 'r1', 'pool');
  mkdirSync(pdir, { recursive: true });
  writeFileSync(join(pdir, 'log.jsonl'), `${JSON.stringify({ id: 'W1', lane: 'a1', result: 'ok', fallback: false })}\n`);
  const r = w.tick(['--watch', '--interval', '0', '--max-iter', '3']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stdout.match(/POOL_DONE W1/g) || []).length, 1);
  assert.doesNotMatch(r.stdout, /TICK quiet/);
});

test('--watch: 아무 일 없으면 출력 없음', () => {
  const w = world();
  const r = w.tick(['--watch', '--interval', '0', '--max-iter', '2']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});
```

`appendFileSync` import 가 없으면 더한다.

- [ ] **Step 3: 실패 확인**

Run: `node --test tests/tick.test.mjs`
Expected: FAIL (POOL_DONE 없음)

- [ ] **Step 4: 구현**

1. 풀 완료 확인을 틱 본문의 STALE_RUN 확인 뒤(마지막 확인 뒤)에 더한다.

```js
    // 12. 풀 완료(설계 2026-10-10 §5.3). log.jsonl 의 새 줄 중 처음 보는 id 만
    try {
      const plog = join(runDir(c), 'pool', 'log.jsonl');
      if (existsSync(plog)) {
        const lines = readFileSync(plog, 'utf8').split('\n').filter((l) => l.trim() !== '');
        const mark = join(runDir(c), 'ticks', 'pool');
        const seenN = existsSync(mark) ? Number(readFileSync(mark, 'utf8').trim()) || 0 : 0;
        const before = new Set(lines.slice(0, seenN).flatMap((l) => { try { return [JSON.parse(l).id]; } catch { return []; } }));
        for (const l of lines.slice(seenN)) {
          let o; try { o = JSON.parse(l); } catch { continue; }
          if (before.has(o.id)) continue;
          before.add(o.id);
          emit(`POOL_DONE ${o.id} lane=${o.lane ?? '-'} result=${o.result ?? '-'} fallback=${o.fallback ? 1 : 0}`);
        }
        if (!dry) { mkdirSync(join(runDir(c), 'ticks'), { recursive: true }); writeFileSync(mark, `${lines.length}\n`); }
      }
    } catch { /* 풀 기록을 못 읽으면 건너뜀 */ }
```

`dry`·`runDir`·`existsSync`·`readFileSync`·`writeFileSync`·`mkdirSync` 는 tick.mjs 의 실제 이름·import 에 맞춘다(`--dry-run` 이면 표시 파일을 쓰지 않는다).

2. `main` 의 본문(인자 파싱 뒤부터 출력·후처리까지)을 `export async function tickOnce(c, opts)` 로 옮긴다. `tickOnce` 는 출력 줄 배열(`out`)을 돌려주고, 후처리(`last_tick_at`·office·wbs·console-poll·`event tick`)는 지금처럼 안에서 한다. `main` 은 아래처럼 된다.

```js
export async function main(argv, { env, cwd }) {
  // 기존 인자 파싱(--no-answer, --dry-run, -h)에 더함
  let watch = false; let interval = 60; let maxIter = 0; let repeatMin = 15;
  // … for 루프 안:
  //   else if (a === '--watch') watch = true;
  //   else if (a === '--interval') interval = Number(argv[++i]);
  //   else if (a === '--max-iter') maxIter = Number(argv[++i]);
  //   else if (a === '--repeat-min') repeatMin = Number(argv[++i]);
  const c = new Ctx(env, cwd);
  if (!watch) {
    const out = await tickOnce(c, opts);
    process.stdout.write(out.length === 0 ? 'TICK quiet\n' : `${out.join('\n')}\n`);
    return 0;
  }
  const lastShown = new Map();
  for (let it = 1; maxIter === 0 || it <= maxIter; it += 1) {
    let out;
    try { out = await tickOnce(c, opts); } catch (e) { if (e instanceof CoordDie && e.rc === 3) return 0; throw e; }
    const now = Date.now();
    for (const ln of out) {
      const prev = lastShown.get(ln);
      if (prev !== undefined && now - prev < repeatMin * 60000) continue;
      lastShown.set(ln, now);
      process.stdout.write(`${ln}\n`);
    }
    if (maxIter !== 0 && it === maxIter) break;
    await new Promise((r) => setTimeout(r, Math.max(0, interval) * 1000));
  }
  return 0;
}
```

기존 `main` 의 회차 없음 처리(`CoordDie(3)`)는 `--watch` 가 아닐 때 지금과 같은 rc·메시지를 내야 한다(기존 시험 「--help 와 회차 없음」). `HELP` 에 `--watch [--interval 초] [--max-iter n] [--repeat-min 분]` 과 `POOL_DONE` 줄을 더한다.

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/tick.test.mjs`
Expected: PASS (기존 + 3)

- [ ] **Step 6: 전체 시험·커밋**

Run: `node --test tests/`
Expected: 전체 PASS

```bash
git add scripts/tick.mjs tests/tick.test.mjs
git commit -m "feat(coordinator): tick --watch(이벤트 틱)·POOL_DONE

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: SKILL·contract·help 정리

**Files:**
- Modify: `SK/SKILL.md`
- Modify: `SK/references/contract.md` (§2.1 state 스키마, §3 스크립트 표·출력 줄)
- Modify: `SK/references/help.md`

**Interfaces:**
- Consumes: Task 1~11 의 이름 전부(설정 키, 하위 명령, 출력 줄, 문서 경로). 각 Task 커밋을 `git log --oneline coord-token-time` 으로 보고, 실제 구현된 이름을 `grep` 으로 다시 확인한 뒤 적는다.

이 Task 는 문서만 고친다.

- [ ] **Step 1: SKILL.md 「시간·토큰·성능 최적화 원칙」**

목록 맨 앞에 항목을 더하고 번호를 하나씩 민다.

```markdown
0. **회차 모드.** 기본 = token(토큰 우선). 사용자가 「빠르게」 같은 요청 → time
   - 기록: `node scripts/coord-state.mjs mode time`(되돌림 = `mode token`). 이미 도는 일은 그대로, 다음 배정부터
   - 모드가 바꾸는 것: 레인 상한(`mode.lanes_max` token 3·time 6), 레인당 동시 agent(`workflow.agents_by_mode`), 풀 우선순위, 모델 표 `mode` 행, Workflow 최소 항목(`mode.workflow_min_items`), 하트비트(`mode.heartbeat_min`)
   - 조정 세션 모델 = `coordinator.model_by_mode`(token sonnet/medium·time opus/medium). 바꿀 때 사용자에게 한 줄: 「`/model sonnet`(또는 `opus`) 입력」
```

기존 7번(「조정자는 적게 읽고 적게 말함」) 아래에 더한다.

```markdown
   - 조정 세션이 직접 하는 일 = D0(git·상태·짧은 확인)만. 조사 = 검색 워커, 구현 = 레인·풀
   - 진행표 요청 = `node scripts/coord-status.mjs` 출력 그대로 + `WBS.md`·오피스 위치. 레인 화면 다시 읽지 않음
   - 컨텍스트 = `compact.coordinator_max`(200000) 넘으면 `CTX_OVER_SELF` → `compact.md` §8(`/clear` 재개)
```

8번(사용량 띠) 문구 `Claude 몫을 opencode·agy 로 이동` 을 `풀(opencode·GLM)·agy 비중을 키움. 풀은 띠와 상관없이 늘 씀(`references/pool.md`)` 로 바꾼다.

- [ ] **Step 2: SKILL.md 머리 명령 목록·「판단 올리기」**

머리 목록의 명령별 문서에 더한다: `metrics` = `node scripts/run-metrics.mjs --stdout --no-csv`(마감 때는 `closing.md` §4.5), `mode` = `coord-state.mjs mode`.
description 줄의 사용법 끝에 `· metrics · mode <token|time>` 를 더한다.

「판단 올리기」 대상에 한 줄을 더한다.

```markdown
- 대상: 레인 `질문` 중 설계·정합성(공유 API·스키마·다른 레인과 겹치는 결정·트랜잭션). 아래 「`질문` 처리」 2단계
```

- [ ] **Step 3: SKILL.md 「시작 절차」**

2번(`coord-state.mjs init`) 아래에 더한다.

```markdown
   - 사용자가 빠르게를 요청했으면 `node scripts/coord-state.mjs mode time`
```

4번 레인 확보에 더한다.

```markdown
   - 레인 수 상한 = `mode.lanes_max[모드]` 와 `usage.md` 「새 레인 상한」 중 작은 쪽
```

6번(CronCreate)을 아래로 바꾼다.

```markdown
6. 감시 시작
   - 이벤트 틱: `Monitor` 로 `node .claude/skills/coordinator/scripts/tick.mjs --watch` 를 백그라운드 감시(줄이 나올 때만 깨움)
   - 하트비트: `CronCreate` 간격 = `mode.heartbeat_min[모드]`분(token 30·time 15), 고정 문구 그대로
   - `set-many` 로 기록(cron_id·조정 세션 이름·주소)
```

- [ ] **Step 4: SKILL.md 「틱 절차」 표**

표에 행을 더하고 두 행을 고친다.

```markdown
| `POOL_DONE …` | 기록만. `fallback=1` 이 한 레인에서 3번 넘음 → 그 레인 지시의 풀 몫 낮출지 판단 |
| `CTX_OVER`(`tokens=`·`max=` 포함) | → `compact.md`(`compact-lane.mjs <레인> --clear`) |
| `CTX_OVER_SELF` | 정본 메모·`summary` 갱신 뒤 사용자에게 「`/clear` 뒤 재개 문구」 한 줄(`compact.md` §8) |
```

틱 절차 1번에 한 줄을 더한다: `- Monitor 로 받은 --watch 줄도 같은 표로 처리. 하트비트 틱은 tick.mjs 1회`.

- [ ] **Step 5: SKILL.md 「`질문` 처리」**

기존 3단계를 아래로 바꾼다.

```markdown
`질문` 처리
1. `node scripts/coord-state.mjs report <레인> "<요약>" --question "<첫 줄>"` 기록
2. 같은 질문 확인: `node scripts/coord-state.mjs decisions --grep "<핵심어>"` → 있으면 그 답 그대로
3. 종류별 처리
   - 사실·절차(규칙 문서·머지 순서·시험 범위) → 직접 답
   - 영향 작은 선택(기본안 있음, 레인 안에서 끝남) → 「기본안대로」
   - 설계·정합성(공유 API·스키마·다른 레인과 겹침·트랜잭션) → 「판단 올리기」(opus/high)
   - 제품 결정·삭제·shared 기존 API 변경 → `pending_user` 에 올려 사용자에게. 레인은 기본안으로 계속할 수 있으면 계속
4. 답한 뒤: `report <레인> --answered` + `node scripts/coord-state.mjs decide <레인> "<질문 요약>" "<결정>"`
   - 판단 올리기로 정함 → `--esc`. 앞 결정을 뒤집음 → `--reverse`
```

- [ ] **Step 6: contract.md §2.1·§3**

§2.1 state 스키마:
- `run` 칸 설명에 `mode`(선택, `"token"|"time"`, `coord-state.mjs mode` 가 씀. 없으면 설정 `mode.default`)를 더한다.
- `decisions` 설명을 `[{at, lane, q, text, esc?, reverse?}]`(`decide` 가 씀. 옛 항목은 `{at, text}`)로 바꾼다.
- 회차 폴더 파일 표에 `pool/`(풀 기록: `items/`·`cool.json`·`log.jsonl`)·`metrics.md`·`ticks/pool` 을 더한다.

§3 스크립트 표에 행을 더한다(형식은 기존 행을 따른다).

```markdown
| `pool.mjs` | `submit --lane L --id id --size S\|M --packet f [--cwd d] [--kind auto\|opencode\|glm] [--dry-run]` · `status [--lane L] [--id id]` · `cancel <id>` · `note <id> [--findings n] [--lines n]` | `POOL started <id> kind=<k>` · `POOL queued <id> position=<n>` · `POOL fallback <id> reason=no-worker` · `POOL refused <id> <사유>` · `POOL <id> <state> kind= lane= result= rc=` · `POOL slots …` · `POOL cancelled|noted <id>` |
| `run-metrics.mjs` | `[--run id] [--stdout] [--no-csv] [--since iso] [--until iso] [--dry-run]` | `METRICS <run> cost=<$> per1k=<$\|-> coord=<%> lines=<n> file=<경로\|->` |
```

기존 행을 고친다:
- `tick.mjs`: 인자에 `--watch [--interval 초] [--max-iter n] [--repeat-min 분]`, 출력에 `POOL_DONE <id> lane= result= fallback=`, `CTX_OVER`·`CTX_OVER_SELF` 의 `tokens=`·`max=`
- `compact-lane.mjs`: 인자에 `--clear`, 출력에 ` mode=clear`
- `coord-state.mjs`: 하위 명령에 `mode [token|time]`(`MODE <m> src=<state|default>` · `OK mode=<m>`), `decide <레인|-> <질문> <결정> [--esc] [--reverse]`(`OK decision=<n>`), `decisions [--last n] [--grep 글]`(`DECISION …` · `DECISION none`)

- [ ] **Step 7: help.md**

「명령」 목록에 더한다.

```markdown
- `/coordinator metrics`: 이 회차 지표(Claude 비용·1천 줄당 비용·조정 세션 비중·풀·결정)
  - `run-metrics.mjs --stdout --no-csv`. 마감 때는 자동(`metrics.md`·누적 CSV)
- `/coordinator mode <token|time>`: 회차 모드 바꾸기. 기본 token, 「빠르게」 요청 = time
```

「개요」의 `조정 세션 = effort medium` 줄을 `조정 세션 = token 모드 sonnet/medium, time 모드 opus/medium. 무거운 판단 = opus/high 서브에이전트` 로 바꾼다.

- [ ] **Step 8: 남은 글자 그대로 형식 확인**

Run: `grep -rn "CTX_OVER " references/ SKILL.md | grep -v "tokens="` → 출력 형식을 옛 모양 그대로 적은 줄이 남으면 고친다.
Run: `grep -rn "opencode·agy 로 옮" SKILL.md references/` → 남으면 풀 문구로 고친다.
Run: `node --test tests/`
Expected: 전체 PASS

- [ ] **Step 9: 커밋**

```bash
git add SKILL.md references/contract.md references/help.md
git commit -m "docs(coordinator): SKILL·contract·help 에 모드·풀·이벤트 틱·결정 기록·측정 반영

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
