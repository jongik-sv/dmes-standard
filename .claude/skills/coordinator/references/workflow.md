# Workflow 기본 사용

- 스킬이 만들거나 지시하는 세션의 착수 지시에 지시 블록(§1)을 늘 넣음
  - 다음 일 지시 = 블록 대신 「착수 지시 규칙 그대로」 한 줄(`protocol.md` 3.2)
- 표는 설정 `workflow.model_table` 에서 읽어 채움(기본값 `references/contract.md` 1.3)
- 동시 agent 수 `{N}` = 현재 띠의 `workflow.agents_by_band` 값

## 1. 지시 블록 원문

- 블록 원문 = `templates/brief.md` 「무거운 작업 칸」·「작업 방식」·「시험」 절
  - 여기에 다시 쓰지 않음
- `{…}` = 조정자가 채우는 자리 표시
- 표 줄 = `workflow.model_table` 항목마다 `- {stage} [{size}]: {model} / {effort}` 반복
- 동시 agent 수와 새 Workflow 허용 여부 = 현재 띠(`usage.md` §2)대로 채움
- `{sizing_doc}` = `<스킬 경로>/references/sizing.md` 절대 경로 (레인이 읽을 수 있게)
- `{search_cmd}` = `node <스킬 경로>/scripts/search.mjs "<질의>"`
  - 설정 `search.command`·`search.opencode.command` 가 모두 빔 → 검색 줄을 바꿈
  - 바꿀 문장 = 「검색은 grep 이나 sonnet/medium agent 로 한다」
- `{heavy_env}` = state `lanes.<레인>.heavy_env`
  - 전용 칸이 없으면 → 「무거운 작업 칸」 줄에서 「{heavy_env} 로」 만 뺌
  - `heavy.script` 가 `null` 이면 → heavy.sh 언급을 모두 뺌(「무거운 작업 칸」·「시험」)
- model 이 `search` 인 표 줄 = 검색 워커(`{search_cmd}`: agy → opencode)
  - 두 워커가 모두 실패 → sonnet/medium

## 2. 예외(Workflow 없이 세션이 직접)

- 한 줄·한 파일 수정
- 단순 조회·질문 답
- 단순 시험(단일 시험 파일·클래스, `tsc`, lint)과 그 결과 확인
- 머지·정리 같은 짧은 git 작업
- 측정 실행(사람이 정한 절차를 그대로 돌리는 것)
- compact·재개 확인 답

Workflow 기동 비용이 일 자체보다 크면 띄우지 않음.

## 3. 동시 agent 상한(띠별)

- 레인당 동시 agent = 설정 `workflow.agents_by_band` 의 현재 띠 값
  - R 띠 = 새 Workflow 없음
- 세션 밖에서 Workflow 의 동시 agent 수를 강제할 수단 없음 → 상한은 **지시문으로만** 줌
  - 띠가 바뀌면 `사용량 조정` 메시지로 새 상한 통지
  - 이미 도는 Workflow 는 끝까지 두고 다음 Workflow 부터 적용
- 「무거운 작업 금지」 상태인 레인 = 시험 단계 agent 를 띄우지 않음(조사·문서 agent 만)
- Workflow 안 무거운 단계는 레인 안에서 한 번에 하나, heavy.sh 경유
  - 레인 공용 잠금이 필요하면 레인 scratchpad 의 mkdir 잠금도 허용
- PC 전체 동시 agent 합 = `레인 수 × 레인 상한`
  - 레인 수는 `usage.md` 「새 레인 상한」 만 봄(띠가 올라도 레인을 줄이지 않음)

## 4. idle·compact 와의 관계

- 세션이 백그라운드로 Workflow 를 돌리는 동안은 idle 이 아님(`idle-check.mjs` 의 tasks 출력 mtime 신호)
  - 세션 status 가 idle 로 보여도 일을 넣지 않음
- compact 는 Workflow 가 끝난 뒤에 함(`compact.md`)

## 5. Workflow 가 없는 워커

- opencode·agy·codex 워커에는 지시 블록을 넣지 않음
- 「한 과제, 끝나면 보고」 형식의 짧은 지시를 줌
- 동시 실행 수는 워커 수 자체로 통제

## 6. 금지·주의

- **실행 중인 Workflow 하위 에이전트에 SendMessage 를 보내지 않음.** 사본이 새로 떠 같은 파일을 함께 고침
  - 규칙을 바꿔야 하면 그 세션에 「Workflow 를 TaskStop 하고 남은 단계만 새로 띄워라」 지시
- 재개 캐시(`resumeFromRunId`)는 앞에서부터 이어지는 같은 호출만 재사용
  - 앞쪽 지시문을 고치면 거의 전부 다시 돔
  - 규칙을 더할 때는 journal·워크트리로 남은 일을 확인하고 **남은 단계만 담은 새 스크립트**를 띄우게 함
- 같은 레인에서 확인 창이 반복되면 → 지시문 보강 요청(`approvals.md` §4)
  - 실행 중인 Workflow 에는 보내지 않음

## 7. 실패 사다리(시험 실패 시 상급 재시도)

- 시험이 실패하면 같은 등급으로 같은 수정을 반복하지 않음
- 근거가 쌓일 때마다 등급을 한 칸씩 올림
- 처음부터 높은 등급을 쓰지 않음

**설정**(`workflow.escalation`, 기본값 `references/contract.md` 1.2)

- `ladder`: 수정 agent 등급의 사다리
- `allow_xhigh`: true 면 끝에 `opus/xhigh` 한 칸 추가 (어려운 레인에서만 켬)
- `max_attempts`: 한 항목의 수정 시도 최대 횟수 (환경 재실행은 안 셈)
- `env_retry`: 환경 실패일 때 같은 등급 재실행 횟수

**흐름**

1. 시험 실행 = 세션이 직접
   - 결과 형식: `통과 N / 실패 M / 실패 시험 이름 / 오류 요지 첫 줄`
2. **환경 실패를 먼저 거름.**
   - 환경 실패 = 코드 결함이 아닐 수 있는 실패
     - 예: 시간 초과, 연결 거부, `OutOfMemoryError`, 여러 모듈 동시 연쇄 실패
   - 환경 실패이고 load1/코어 > `heavy.load_soft` 이면 → load 가 내려가길 기다림
     - 그 뒤 같은 등급으로 `env_retry` 회 재실행
   - 등급은 올리지 않음
3. **시작 칸** = 그 항목의 구현 등급과 같은 칸
   - S/M 항목은 `sonnet/medium` 이 아니라 구현 등급 `sonnet/high` 부터
   - 실패가 오타·import·타입처럼 명백하면 한 칸 아래(`sonnet/medium`)부터 가능
4. 수정 agent 에 넘길 것: 실패 시험 이름, 오류 요지, 이전 시도에서 바꾼 것과 결과
   - 목적 = 같은 시도 반복 방지
   - 고친 뒤 **실패했던 시험만** 재실행
   - 통과하면 끝. 바뀐 모듈 전체 시험은 머지 요청 직전 한 번(`templates/brief.md` 「시험」)
5. 다시 실패하면 한 칸 올림
   - 같은 시험이 같은 원인으로 두 번 연속 실패하면 두 칸 올림(한 칸 건너뜀)
6. **끝 칸에서도 실패**하거나 `max_attempts` 에 닿으면 더 돌리지 않음
   - 바뀐 것을 커밋하지 않은 채 둠
   - 조정자에게 `질문: 배경(실패 시험·시도 이력) / 선택지 / 기본안` 으로 blocked 보고
   - 조정자는 원인 판정을 「판단 올리기」(opus/high 서브에이전트)에 맡김
7. 사다리 끝 칸 = G·Y·O 모두 `opus/high` 까지 허용 (xhigh 는 `allow_xhigh` 가 켜졌을 때만)
   - R 띠의 Claude 레인은 재시도 없이 blocked 보고
8. 항목당 시험 실행 시간 합계가 예산을 넘으면 → 사다리 중이라도 멈추고 진행 보고
   - 예산 = `templates/brief.md` 「시험」
   - 내 변경과 무관한 기존 실패는 사다리에 태우지 않고 보고만
