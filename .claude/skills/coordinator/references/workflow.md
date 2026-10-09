# Workflow 기본 사용

설계 절: §3.k(k-1 템플릿 ~ k-6), §3.l-4(확인 창 예방), §3.m(정지 예방).

- 스킬이 만들거나 지시하는 세션의 착수·다음 일 지시에 아래 블록을 늘 넣음
- 표는 설정 `workflow.model_table` 에서 읽어 채움(기본값 `references/contract.md` 1.3)
- 동시 agent 수 `{N}` = 현재 띠의 `workflow.agents_by_band` 값

## 1. 지시 블록 원문

- `{…}` = 조정자가 채우는 자리 표시
- 표 줄 = `workflow.model_table` 항목마다 `- {stage} [{size}]: {model} / {effort}` 반복
- 동시 agent 수와 새 Workflow 허용 여부 = 현재 띠(`usage.md` §2)대로 채움

```text
[작업 방식] 시간·토큰·성능이 최적이 되게 진행한다. 모든 일은 최소 충분 등급에서 시작하고, 실패·막힘 근거가 있을 때만 한 칸 올린다.
지시를 시작하기 전에 핵심 수정이 몇 파일·몇 줄인가를 먼저 적고, 모든 단계를 그 크기에 비례시킨다. 항목마다 실행 수단을 업무 크기로 고른다(영향·범위·단계·시간 → D0 직접 · D1 검색 워커 · D2 agent 하나 · D3 병렬 agent · D4 Workflow, 기준표 {sizing_doc}). 낮은 단계부터 맞춰 보고 부족하다는 근거가 나올 때만 올린다. 진행 보고에 고른 단계를 적는다(예: 실행: D2).
Workflow(D4)는 구현 → 리뷰 → 수정이 필요한 M/L 항목이나 같은 흐름을 여러 항목에 반복할 때만 쓴다(먼저 workflow-authoring 스킬을 읽는다). 단순 시험·조회·한 파일 수정은 Workflow 없이 직접 한다.
모든 agent() 에 model 과 effort 를 적는다(크기 S/M/L 은 착수 지시의 항목 표 기준):
{workflow.model_table 의 각 항목을 한 줄씩: - {stage} [{size}]: {model} / {effort}. model 이 search 면 「검색 워커({search_cmd}: agy, 실패 시 opencode) → 두 워커가 모두 실패하면 sonnet/medium」 으로 적는다}
시험이 실패하면 실패 사다리를 탄다: {workflow.escalation.ladder 를 「model/effort → …」 로}. 시간 초과·부하 연쇄 실패는 load 를 확인한 뒤 같은 등급으로 한 번만 다시 돌린다. 같은 원인으로 두 번 연속 실패하면 한 칸 건너뛴다. 사다리 끝에서도 실패하면(항목당 수정 시도 최대 {workflow.escalation.max_attempts}회) 멈추고 blocked 로 보고한다.
조사는 영향에 비례해서 한다. 값 하나 확인·위치 찾기 같은 작은 조사는 Workflow·agent 없이 {search_cmd} 한 번이나 grep 한 번으로 끝낸다. 조사·위치 찾기·사용처 집계는 agy·opencode 를 먼저 쓴다. 검색·조사 질의는 {search_cmd} 로 보내고(agy 가 실패하면 opencode 로 자동으로 내려간다), 두 워커가 모두 실패했을 때만 grep 이나 sonnet/medium agent 로 대신한다.
단순 시험(단일 시험 파일·클래스, tsc, lint)은 heavy.sh 없이 바로 돌리고, 바뀐 모듈 시험부터 돌린다. 바뀐 모듈의 전체 시험은 머지 요청 직전에 한 번만 heavy.sh 를 거쳐 돌린다. 리포 전체 시험·E2E 전체는 조정자가 지시할 때만 돌린다. 무거운 작업 금지 통지 중에는 단순 시험도 미룬다.
**속도 규칙**: 중간 단계는 해당 모듈 tsc 와 바뀐 파일 시험만 돌리고, 바뀐 모듈의 전체 시험은 머지 요청 직전 한 번만 돌린다. 리뷰는 한 번이다. 리뷰 지적을 고친 뒤에는 전체 재리뷰·전체 재시험 없이 수정분만 확인하고 수정분 시험만 돌린다(보안 리뷰 지적의 수정분 확인만 opus 로 한 번). 무거운 시험은 PC 전체에서 한 번에 하나만 돈다. 파일을 하나씩 옮기는 단계(리팩토링)에서는 해당 폴더 시험과 tsc 만 돌린다. 띄운 백그라운드(시험 입력·성능 측정·로컬 DB·감시)는 반드시 정리하고, 진행 보고와 정리 완료 보고에 「남은 백그라운드 0」 을 적는다. 성능을 재는 시험에는 시간 상한을 붙인다.
시험 시간 예산은 착수 지시의 「시험 시간 예산」 절을 따른다(바뀐 동작당 새 시험 1~2개, 실패 재실행은 같은 명령 1회, 내 변경과 무관한 기존 실패는 보고만, 항목당 시험 실행 시간 합계 15분 초과 시 멈추고 진행 보고).
항목마다 구현 → 리뷰 → 지적 수정 → 수정분 확인. 수정분 확인이 clean 이 아니면 다음 항목으로 넘어가지 않는다.
동시 agent 는 {N}개까지(현재 띠의 상한: G 4·Y 3·O 2 — 조정자가 사용량·부하 띠로 정한다). 무거운 명령은 {heavy_env} 로 heavy.sh 를 거친다.
셸 명령은 짧게 나눈다. heredoc·sh -c·변수·$(…) 를 섞은 복합 명령을 피하고, 파일 수정은 Edit·Write 도구로 한다. 확인 창이 뜨면 Workflow 가 멈춘다.
사람에게 묻는 선택 창(AskUserQuestion)을 쓰지 않는다. 물어야 할 것은 조정자에게 「질문: 배경 / 선택지 / 기본안」 메시지로 보내고, 기본안으로 계속할 수 있으면 계속한다.
무거운 단계마다 시간 상한(모듈당 15분, 전체 빌드 40분 등)을 두고, 로그가 5분 넘게 늘지 않으면서 CPU 0% 이면 자기 트리만 TERM 으로 끝내고 blocked 로 보고한다. 긴 gradle 실행에는 --info 를 쓰지 않고 출력을 파일로 보낸다.
보고 첫 줄에 지시 번호 {instr_id} 를 적고, 지금 돌고 있는 동시 agent 수를 함께 적는다.
```

- `{sizing_doc}` = `<스킬 경로>/references/sizing.md` 절대 경로 (레인이 읽을 수 있게)
- `{search_cmd}` = `node <스킬 경로>/scripts/search.mjs "<질의>"`
  - 설정 `search.command` 와 `search.opencode.command` 가 모두 비면 그 문장을 「검색은 grep 이나 sonnet/medium agent 로 한다」 로 바꿈
- `{heavy_env}` = state `lanes.<레인>.heavy_env`
  - 전용 칸이 없으면 「무거운 명령은 heavy.sh 를 거친다」 만 씀
  - `heavy.script` 가 `null` 이면 그 문장을 빼고 「무거운 명령은 레인당 한 번에 하나」 로 바꿈
- 이 블록은 `templates/brief.md` 의 해당 자리에 들어감

## 2. 예외(Workflow 없이 세션이 직접)

- 한 줄·한 파일 수정
- 단순 조회·질문 답
- **단순 시험(단일 시험 파일·클래스, `tsc`, lint)과 그 결과 확인**
- 머지·정리 같은 짧은 git 작업
- 측정 실행(사람이 정한 절차를 그대로 돌리는 것)
- compact·재개 확인 답

Workflow 기동 비용이 일 자체보다 크면 띄우지 않음.

## 3. 동시 agent 상한(띠별)

- 레인당 동시 agent: G 4 · Y 3 · O 2 · R 0(새 Workflow 없음)

- 세션 밖에서 Workflow 의 동시 agent 수를 강제할 수단 없음 → 상한은 **지시문으로만** 줌
  - 띠가 바뀌면 `사용량 조정` 메시지로 새 상한 통지
  - 이미 도는 Workflow 는 끝까지 두고 다음 Workflow 부터 적용
- 「무거운 작업 금지」 상태인 레인은 시험 단계 agent 를 띄우지 않음(조사·문서 agent 만)
- Workflow 안 무거운 단계(시험 실행)는 레인 안에서 한 번에 하나, heavy.sh 경유
  - 레인 공용 잠금이 필요하면 레인 scratchpad 의 mkdir 잠금도 허용
- PC 전체 동시 agent 합 = `레인 수 × 레인 상한`
  - 레인 수는 `usage.md` 「새 레인 상한」 만 봄(띠가 올라도 레인을 줄이지 않음)

## 4. idle·compact 와의 관계

- 세션이 백그라운드로 Workflow 를 돌리는 동안은 idle 이 아님(`idle-check.mjs` 의 tasks 출력 mtime 신호)
  - 세션 status 가 idle 로 보여도 일을 넣지 않음
- compact 는 Workflow 가 끝난 뒤에 함(`compact.md`)

## 5. Workflow 가 없는 워커

- opencode·agy·codex 워커에는 위 블록을 넣지 않음
- 「한 과제, 끝나면 보고」 형식의 짧은 지시를 줌
- 동시 실행 수는 워커 수 자체로 통제

## 6. 금지·주의

- **실행 중인 Workflow 하위 에이전트에 SendMessage 를 보내지 않음.** 사본이 새로 떠 같은 파일을 함께 고침
  - 규칙을 바꿔야 하면 그 세션에 「Workflow 를 TaskStop 하고 남은 단계만 새로 띄워라」 지시
- 재개 캐시(`resumeFromRunId`)는 앞에서부터 이어지는 같은 호출만 재사용
  - 앞쪽 지시문을 고치면 거의 전부 다시 돔
  - 규칙을 더할 때는 journal·워크트리로 남은 일을 확인하고 **남은 단계만 담은 새 스크립트**를 띄우게 함
- 같은 레인에서 확인 창이 반복되면 Workflow 지시문 보강 요청
  - 실행 중인 Workflow 에는 보내지 않음(`approvals.md`)
- 지시문에 `!` 금지

## 7. 실패 사다리(시험 실패 시 상급 재시도)

- 시험이 실패하면 같은 등급으로 같은 수정을 반복하지 않음
- 근거가 쌓일 때마다 등급을 한 칸씩 올림
- 처음부터 높은 등급을 쓰지 않음

**설정**(`workflow.escalation`, 정본 `references/contract.md` 1.2)

- `ladder` (기본 `sonnet/medium → sonnet/high → opus/high`): 수정 agent 등급의 사다리
- `allow_xhigh` (기본 `false`): true 면 끝에 `opus/xhigh` 한 칸 추가 (어려운 레인에서만 켬)
- `max_attempts` (기본 `3`): 한 항목의 수정 시도 최대 횟수 (환경 재실행은 안 셈)
- `env_retry` (기본 `1`): 환경 실패일 때 같은 등급 재실행 횟수

**흐름**

1. 시험 실행 = haiku/low agent(또는 세션이 직접)
   - 결과 형식: `통과 N / 실패 M / 실패 시험 이름 / 오류 요지 첫 줄`
2. **환경 실패를 먼저 거름.**
   - 환경 실패 = 시간 초과, 연결 거부, `OutOfMemoryError`, 여러 모듈 동시 연쇄 실패 등 코드 결함이 아닐 수 있는 실패
   - 환경 실패이고 load1/코어 가 `heavy.load_soft` 초과이면 → load 가 내려가길 기다린 뒤 같은 등급으로 `env_retry` 회 재실행
   - 등급은 올리지 않음
3. **시작 칸** = 그 항목의 구현 등급과 같은 칸
   - S/M 항목은 `sonnet/medium` 이 아니라 구현 등급 `sonnet/high` 부터
   - 실패가 오타·import·타입처럼 명백하면 한 칸 아래(`sonnet/medium`)부터 가능
4. 수정 agent 에 넘길 것: 실패 시험 이름, 오류 요지, 이전 시도에서 바꾼 것과 결과 (같은 시도 반복 방지)
   - 고친 뒤 **실패했던 시험만** 재실행
   - 통과하면 끝. 바뀐 모듈의 전체 시험은 머지 요청 직전 한 번(`heavy.md` §7)
5. 다시 실패하면 한 칸 올림
   - 같은 시험이 같은 원인으로 두 번 연속 실패하면 두 칸 올림(한 칸 건너뜀)
6. **끝 칸에서도 실패**하거나 `max_attempts` 에 닿으면 더 돌리지 않음
   - 바뀐 것을 커밋하지 않은 채 둠
   - 조정자에게 `질문: 배경(실패 시험·시도 이력) / 선택지 / 기본안` 으로 blocked 보고
   - 조정자는 원인 판정을 「판단 올리기」(opus/high 서브에이전트)에 맡김
7. 사다리 끝 칸 = G·Y·O 모두 `opus/high` 까지 허용 (xhigh 는 `allow_xhigh` 가 켜졌을 때만)
   - R 띠의 Claude 레인은 재시도 없이 blocked 보고 (2026-10-07 완화)
8. 항목당 시험 실행 시간 합계가 15분을 넘으면 사다리 중이라도 멈추고 진행 보고 (2026-10-09 시험 시간 예산)
   - 내 변경과 무관한 기존 실패는 사다리에 태우지 않고 보고만

**Workflow 스크립트 본보기**

```js
// 실패 사다리: 시험은 haiku, 수정은 사다리를 한 칸씩
const LADDER = [
  { model: 'sonnet', effort: 'medium' },
  { model: 'sonnet', effort: 'high' },
  { model: 'opus', effort: 'high' },
]
const MAX_ATTEMPTS = 3
let rung = startRung            // 항목 구현 등급의 칸(S/M = 1)
let history = []
let result = await agent(runTestsPrompt, { model: 'haiku', effort: 'low', schema: TEST_RESULT })
let envRetried = false
for (let attempt = 0; !result.passed && attempt < MAX_ATTEMPTS; attempt++) {
  if (result.envFailure && !envRetried) {            // 환경 실패는 같은 등급으로 한 번만
    envRetried = true; attempt--
    result = await agent(runTestsPrompt + WAIT_FOR_LOAD, { model: 'haiku', effort: 'low', schema: TEST_RESULT })
    continue
  }
  const sameCause = history.length > 0 && history.at(-1).cause === result.cause
  if (attempt > 0) rung = Math.min(rung + (sameCause ? 2 : 1), LADDER.length - 1)
  const fix = await agent(fixPrompt(result, history), { ...LADDER[rung], label: `fix:${attempt}` })
  history.push({ rung, cause: result.cause, change: fix.summary })
  result = await agent(rerunFailedPrompt(result), { model: 'haiku', effort: 'low', schema: TEST_RESULT })
}
if (!result.passed) return { blocked: true, history, last: result }
```
