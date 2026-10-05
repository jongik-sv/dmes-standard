# Workflow 기본 사용

설계 절: §3.k(k-1 템플릿 ~ k-6), §3.l-4(확인 창 예방), §3.m(정지 예방).

스킬이 만들거나 지시하는 세션의 착수·다음 일 지시에는 늘 아래 블록이 들어간다. 표는 설정 `workflow.model_table` 에서 읽어 채운다(기본값은 `references/contract.md` 1.3). 동시 agent 수 `{N}` 은 현재 띠의 `workflow.agents_by_band` 값이다.

## 1. 지시 블록 원문

`{…}` 는 조정자가 채우는 자리 표시다. 표 줄은 `workflow.model_table` 의 항목마다 `- {stage} [{size}]: {model} / {effort}` 로 반복한다. 띠가 Y 이상이면 SKILL.md 「시간·토큰·성능 최적화 원칙」 6번대로 상한을 낮춘 값으로 채운다.

```text
[작업 방식] 시간·토큰·성능이 최적이 되게 진행한다. 모든 일은 최소 충분 등급에서 시작하고, 실패·막힘 근거가 있을 때만 한 칸 올린다.
지시를 시작하기 전에 핵심 수정이 몇 파일·몇 줄인가를 먼저 적고, 모든 단계를 그 크기에 비례시킨다. 항목마다 실행 수단을 업무 크기로 고른다(영향·범위·단계·시간 → D0 직접 · D1 검색 워커 · D2 agent 하나 · D3 병렬 agent · D4 Workflow, 기준표 {sizing_doc}). 낮은 단계부터 맞춰 보고 부족하다는 근거가 나올 때만 올린다. 진행 보고에 고른 단계를 적는다(예: 실행: D2).
Workflow(D4)는 구현 → 리뷰 → 수정이 필요한 M/L 항목이나 같은 흐름을 여러 항목에 반복할 때만 쓴다(먼저 workflow-authoring 스킬을 읽는다). 단순 시험·조회·한 파일 수정은 Workflow 없이 직접 한다.
모든 agent() 에 model 과 effort 를 적는다(크기 S/M/L 은 착수 지시의 항목 표 기준):
{workflow.model_table 의 각 항목을 한 줄씩: - {stage} [{size}]: {model} / {effort}. model 이 search 면 「검색 워커({search_cmd}), 실패 시 sonnet/medium」 으로 적는다}
시험이 실패하면 실패 사다리를 탄다: {workflow.escalation.ladder 를 「model/effort → …」 로}. 시간 초과·부하 연쇄 실패는 load 를 확인한 뒤 같은 등급으로 한 번만 다시 돌린다. 같은 원인으로 두 번 연속 실패하면 한 칸 건너뛴다. 사다리 끝에서도 실패하면(항목당 수정 시도 최대 {workflow.escalation.max_attempts}회) 멈추고 blocked 로 보고한다.
조사는 영향에 비례해서 한다. 값 하나 확인·위치 찾기 같은 작은 조사는 Workflow·agent 없이 {search_cmd} 한 번이나 grep 한 번으로 끝낸다. 검색·조사 질의는 {search_cmd} 를 먼저 쓰고, 실패하면 grep 이나 sonnet/medium agent 로 대신한다.
단순 시험(단일 시험 파일·클래스, tsc, lint)은 heavy.sh 없이 바로 돌리고, 바뀐 모듈 시험부터 돌린다. 전체 시험은 머지 요청 직전에 한 번만 heavy.sh 를 거쳐 돌린다. 무거운 작업 금지 통지 중에는 단순 시험도 미룬다.
항목마다 구현 → 리뷰 → 지적 수정. 리뷰가 clean 이 아니면 다음 항목으로 넘어가지 않는다.
동시 agent 는 {N}개까지(조정자가 사용량·부하 띠로 정한다). 무거운 명령은 {heavy_env} 로 heavy.sh 를 거친다.
셸 명령은 짧게 나눈다. heredoc·sh -c·변수·$(…) 를 섞은 복합 명령을 피하고, 파일 수정은 Edit·Write 도구로 한다. 확인 창이 뜨면 Workflow 가 멈춘다.
사람에게 묻는 선택 창(AskUserQuestion)을 쓰지 않는다. 물어야 할 것은 조정자에게 「질문: 배경 / 선택지 / 기본안」 메시지로 보내고, 기본안으로 계속할 수 있으면 계속한다.
무거운 단계마다 시간 상한(모듈당 15분, 전체 빌드 40분 등)을 두고, 로그가 5분 넘게 늘지 않으면서 CPU 0% 이면 자기 트리만 TERM 으로 끝내고 blocked 로 보고한다. 긴 gradle 실행에는 --info 를 쓰지 않고 출력을 파일로 보낸다.
보고 첫 줄에 지시 번호 {instr_id} 를 적고, 지금 돌고 있는 동시 agent 수를 함께 적는다.
```

- `{sizing_doc}` 는 `<스킬 경로>/references/sizing.md` 다. 레인이 읽을 수 있게 절대 경로로 채운다.
- `{search_cmd}` 는 `<스킬 경로>/scripts/search.sh "<질의>"` 다. 설정 `search.command` 가 비어 있으면 그 문장을 「검색은 grep 이나 sonnet/medium agent 로 한다」 로 바꾼다.
- `{heavy_env}` 는 state `lanes.<레인>.heavy_env` 다. 전용 칸이 없으면 「무거운 명령은 heavy.sh 를 거친다」 만 쓴다. `heavy.script` 가 `null` 이면 그 문장을 빼고 「무거운 명령은 레인당 한 번에 하나」 로 바꾼다.
- 보고에 「지금 동시 agent 수」 를 넣게 하는 이유는 상한을 강제할 수단이 지시문뿐이기 때문이다.
- 이 블록은 `templates/brief.md` 의 해당 자리에 들어간다.

## 2. 예외(Workflow 없이 세션이 직접)

한 줄·한 파일 수정, 단순 조회·질문 답, **단순 시험(단일 시험 파일·클래스, `tsc`, lint)과 그 결과 확인**, 머지·정리 같은 짧은 git 작업, 측정 실행(사람이 정한 절차를 그대로 돌리는 것), compact·재개 확인 답.

Workflow 를 띄우는 비용(스크립트 작성, agent 기동, 컨텍스트 전달)이 일 자체보다 크면 띄우지 않는다.

## 3. 동시 agent 상한(띠별)

| 띠 | 레인당 동시 agent |
|---|---|
| G | 3 |
| Y | 2 |
| O | 1 |
| R | 0(새 Workflow 없음) |

- 세션 밖에서 Workflow 의 동시 agent 수를 강제할 수단은 없다. 상한은 **지시문으로만** 준다. 띠가 바뀌면 `사용량 조정` 메시지로 새 상한을 알리고, 이미 도는 Workflow 는 끝까지 두고 다음 Workflow 부터 적용하게 한다.
- 「무거운 작업 금지」 상태인 레인은 시험 단계 agent 를 띄우지 않는다(조사·문서 agent 만).
- Workflow 안 무거운 단계(시험 실행)는 레인 안에서 한 번에 하나, heavy.sh 를 거친다. 레인 공용 잠금이 필요하면 레인 scratchpad 의 mkdir 잠금도 허용한다.
- PC 전체 동시 agent 합은 `레인 수 × 레인 상한` 이다. O 띠에서 레인 수 자체를 줄이는 것은 `usage.md`.

## 4. idle·compact 와의 관계

- 세션이 백그라운드로 Workflow 를 돌리는 동안은 idle 이 아니다(`idle-check.sh` 의 tasks 출력 mtime 신호). 세션 status 가 idle 로 보여도 일을 넣지 않는다.
- compact 는 Workflow 가 끝난 뒤에 한다(`compact.md`).

## 5. Workflow 가 없는 워커

opencode·agy·codex 워커에는 위 블록을 넣지 않는다. 「한 과제, 끝나면 보고」 형식의 짧은 지시를 주고, 동시 실행 수는 워커 수 자체로 통제한다.

## 6. 금지·주의

- **실행 중인 Workflow 하위 에이전트에 SendMessage 를 보내지 않는다.** 사본이 새로 떠 같은 파일을 함께 고친다. 규칙을 바꿔야 하면 그 세션에 「Workflow 를 TaskStop 하고 남은 단계만 새로 띄워라」 를 지시한다.
- 재개 캐시(`resumeFromRunId`)는 앞에서부터 이어지는 같은 호출만 재사용한다. 앞쪽 지시문을 고치면 거의 전부 다시 돈다(동시 agent 가 갑자기 늘어난 사고가 있었다). 규칙을 더할 때는 journal·워크트리로 남은 일을 확인하고 **남은 단계만 담은 새 스크립트**를 띄우게 한다.
- 같은 레인에서 확인 창이 반복되면 Workflow 지시문 보강을 요청한다. 단 실행 중인 Workflow 에는 보내지 않는다(`approvals.md`).
- 지시문에 `!` 를 넣지 않는다.

## 7. 실패 사다리(시험 실패 시 상급 재시도)

시험이 실패했을 때 같은 등급으로 같은 수정을 반복하지 않고, 근거가 쌓일 때마다 등급을 한 칸씩 올린다. 처음부터 높은 등급을 쓰지 않는다.

**설정**(`workflow.escalation`, 정본 `references/contract.md` 1.2)

| 키 | 기본값 | 뜻 |
|---|---|---|
| `ladder` | `sonnet/medium → sonnet/high → opus/high` | 수정 agent 등급의 사다리 |
| `allow_xhigh` | `false` | true 면 끝에 `opus/xhigh` 한 칸을 더한다(어려운 레인에서만 켠다) |
| `max_attempts` | `3` | 한 항목에서 수정 시도 최대 횟수(환경 재실행은 세지 않는다) |
| `env_retry` | `1` | 환경 실패일 때 같은 등급 재실행 횟수 |

**흐름**

1. 시험 실행은 haiku/low agent(또는 세션이 직접)가 한다. 결과는 `통과 N / 실패 M / 실패 시험 이름 / 오류 요지 첫 줄` 로 돌려준다.
2. **환경 실패를 먼저 거른다.** 시간 초과, 연결 거부, `OutOfMemoryError`, 여러 모듈의 동시 연쇄 실패처럼 코드 결함이 아닐 수 있는 실패이고 load1/코어 가 `heavy.load_soft` 를 넘었다면, load 가 내려가기를 기다렸다가 같은 등급으로 `env_retry` 회 다시 돌린다. 등급은 올리지 않는다.
3. **시작 칸**: 그 항목의 구현 등급과 같은 칸에서 시작한다. S/M 항목은 `sonnet/medium` 이 아니라 구현 등급인 `sonnet/high` 부터 시작한다. 단, 실패가 오타·import·타입처럼 명백하면 한 칸 아래(`sonnet/medium`)부터 시작해도 된다.
4. 수정 agent 에는 실패 시험 이름, 오류 요지, 이전 시도에서 바꾼 것과 그 결과를 넘긴다(같은 시도를 반복하지 않게). 고친 뒤 **실패했던 시험만** 다시 돌리고, 통과하면 바뀐 모듈 시험을 한 번 더 돌린다.
5. 다시 실패하면 한 칸 올린다. 같은 시험이 같은 원인으로 두 번 연속 실패하면 한 칸을 건너뛴다.
6. **끝 칸에서도 실패**하거나 `max_attempts` 에 닿으면 더 돌리지 않는다. 바뀐 것을 커밋하지 않은 채 두고 조정자에게 `질문: 배경(실패 시험·시도 이력) / 선택지 / 기본안` 으로 blocked 를 보고한다. 조정자는 원인 판정을 「판단 올리기」(opus/high 서브에이전트)에 맡긴다.
7. 사용량 띠가 Y 이상이면 사다리 끝 칸을 낮춘다(Y: `opus/high`, xhigh 금지 · O: `sonnet/high` 까지 · R: 재시도 없이 blocked).

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
