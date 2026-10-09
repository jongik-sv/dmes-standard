# 세션·Pane 생성과 정리

## 1. 모델 등급

세션·워커를 띄우기 전에 일의 난이도로 등급 결정.
agent 단계별 모델 = `workflow.model_table`(`contract.md` §1.3).

- **Fable**: 사용자가 요청한 경우만. 세션 `--model claude-fable-5-1`
- **Claude 세션 모델 ID**
  - Opus `claude-opus-5-5` · Sonnet `claude-sonnet-5-5`
  - Haiku `claude-haiku-4-5-20251001`
- **GLM**: 일반 작업 중 **쉬운 일**
  - 대상: 본보기 있는 패턴 반복, 정해진 형식의 문서·표 정리
  - 대상: 시험으로 바로 검증되는 좁은 수정
  - GLM-5.3(Z.ai), **새 탭** Claude Code 세션(`launch.glm`, §3)
  - SendMessage·머지 요청 절차 동일
  - 같은 문제에 20분 넘게 막힘·방향 틀어짐 → 막힌 단계만 Sonnet·Opus 새 탭 세션에
  - `agent()` 의 model 값으로 못 고름 → **세션 단위**로만 맡김
- **opencode 워커**: 사용량 띠가 오를 때 Claude 몫을 넘김(`usage.md` §2)
  - 설정 `launch.opencode`, 새 탭(§2)
  - 막히면 그 단계만 Claude 세션에 넘김
- **조사(검색 워커)**: 읽기 전용. 기준 = `sizing.md` D1 행, 설정 `search.*`
  - `node scripts/search.mjs`: 기본 새 탭, `--print` = 화면 없는 단발
  - 감독·병렬·이력이 필요할 때만:
    `orca orchestration worker-start --agent antigravity --timeout-ms 240000`
  - agy 는 SendMessage 불가 → 결과를 파일로 받음

- 경계가 애매 → **낮은 쪽**에서 시작. 막힘·실패 근거가 있을 때 한 칸 올림
- 작업 세션 = pane 분할이 아니라 **새 탭**
- 모델 이름 실패(PC·계정마다 다름) → `--model` 별칭(`opus`·`sonnet`)으로 재시도

## 2. 생성 경로

기본 = `node scripts/spawn-lane.mjs`(`--dry-run` 가능).
사용자가 띄운 세션은 생성하지 않음 → 신원 보고로 연결(§4).

`node scripts/spawn-lane.mjs --name <n> --kind <claude|glm|opencode> …`
- 전체 인자 = `contract.md` §3.5. `--model`·`--effort`·`--autocompact`·`--prompt-file` 포함

- `--brief` = 에이전트 오피스 레인 칸의 지시 요약(`lane-add` 의 `brief`)
  - 생략 → `--prompt-file` 첫 글줄에서 추출(규칙 = `--help`)
- 탭 = **조정자의 워크트리**에 생성(Orca 가 아는 폴더여야 화면에 보임)
- `--worktree <절대경로|path:경로>` = 세션이 일할 폴더
  - 상대경로·`~` 금지. 생략 → 조정자의 현재 워크트리 폴더
  - Orca 가 모르는 폴더(`git worktree add`) → 조정자 워크트리에 탭, `cd` 로 이동
  - `name:`·`branch:`·`id:` 선택자 → 그 Orca 워크트리에 탭
  - `current`·`active` + Orca 가 모르는 git worktree → `selector_not_found`
- `orca worktree create` 금지(메인 체크아웃 안에 폴더 생성 → dev 에 untracked)
  - `git worktree add` 로 만든 폴더를 `--worktree` 로 전달

출력: `SPAWNED <n> handle=<h> pid=<pid|-> session_id=<id|->` 또는 `SPAWN_FAIL <n> <wait|process|screen|preflight|glm-cap> <사유>`.

명령 흐름:

- **새 레인(Claude Code, 오래 감)**
  1. `orca terminal create --worktree <탭 워크트리> --title <레인> --json`
     - `--command` 금지(`Timed out waiting for terminal handle after creation` 으로 실패)
  2. 셸 프롬프트가 보인 뒤 `orca terminal send --terminal <h> --text "cd <레인 폴더> && <launch.claude> -n <레인> --model <m> --effort <e> [--autocompact <tokens>]" --enter --json`
  3. `orca terminal wait --terminal <h> --for tui-idle --timeout-ms 60000 --json` (**`satisfied: true` 확인**)
  4. 첫 지시는 `term-send-safe.mjs` 로
- **새 레인, 새 워크트리까지**
  - `orca worktree create --name <n> --agent claude --prompt "<지시>" --json` 은 모델·effort 지정 불가
  - 모델이 필요 → `worktree create`(agent 없이) 뒤 위 `terminal create` 흐름
- **감독형 단일 과제 워커(Claude)**
  - `orca orchestration worker-start --spec "<과제>" --agent claude --model <m> --effort <e> --worktree current --json`
  - 완료(`worker_done`) → `worker-release` → `check --ack`
- **opencode 워커**
  1. `orca terminal create --worktree <탭 워크트리> --title <n> --json`
  2. 셸 프롬프트가 보인 뒤 `orca terminal send --terminal <h> --text "cd <폴더> && <launch.opencode>" --enter --json`
     - `--command` 금지(시간 초과로 실패)
  3. `terminal wait --for tui-idle` 뒤 `terminal read --screen` 으로 빈 입력창 확인
  4. `worker-start --terminal <h> --worktree current --spec "<지시>"`
  - 지시문에 `!`·`/`·`@` 금지
  - `--agent opencode` 금지
- **GLM 세션**: `glm-preflight.mjs` 가 `ok` 일 때만(§3)
  - `fail` → 같은 흐름으로 Sonnet 세션

- 입력 전송 = 띄운 뒤 `tui-idle` 의 `satisfied: true` 확인 뒤에만
  - 시작 중인 TUI 에 친 글은 사라짐
- `launch.claude` = 이 PC 에서 claude 플래그가 통과하는 실행 명령(설정, 킷에 박지 않음)
  - 첫 기동 때 `-n`·`--model`·`--effort`·`--autocompact` 통과 확인
- `--autocompact <tokens>` = 백스톱. 주 경로 = 외부 `/compact`(`compact.md`)
- 레인 수 상한 = `usage.md` §2 「새 레인 상한」
  - dflow-team 의 `capacity.sh` 가 있는 PC → 그 판정(free·swap·load)도 적용
- 터미널 입력 = `term-send-safe.mjs` 만
- 레인 이름 40자 이하·첫 `lane-add` 에 `memo` → `decompose.md` §5

## 3. GLM 기동 절차

회사 PC·회사망 = GLM 동작 불가.
GLM 세션 전에 `node scripts/glm-preflight.mjs` 실행.
- 출력: `ok <host> <model> <초>` 또는 `fail <alias|host|call|model> <사유>`
- 결과 = 스크립트가 state `.glm` 에 기록
- 확인 단계(`fail` 둘째 단어):
  1. `alias`: alias 존재
  2. `host`: `ANTHROPIC_BASE_URL` 호스트가 `api.z.ai`
  3. `call`: `POST <base>/v1/messages`(max_tokens 1, 제한 시간 `glm.timeout_s`)가 HTTP 200
  4. `model`: 응답 `model` 이 GLM 이름

**토큰 값은 출력·로그·이벤트·대화 어디에도 기록 금지.**

- `fail` → Sonnet 세션으로 대신 띄움 + 사용자에게 한 줄 알림:
  `GLM 사전 확인 실패(<단계>) → Sonnet 으로 진행`
  - 대체 = 조정자가 정함(`spawn-lane.mjs` 는 `SPAWN_FAIL … preflight` 만 출력)
  - 대신 띄웠으면 마감 보고에 기재
  - 같은 조정 회차에서 실패 → 재시도 금지(망이 바뀌었을 때만 재확인)
- 동시 GLM 세션 상한 `glm.max_sessions`
  - 넘음 → `SPAWN_FAIL … glm-cap` → Sonnet 으로 대신
- 기동 뒤 화면 확인 = `spawn-lane.mjs` 가 수행
  - 새 탭에서 `<launch.glm> -n <이름>` → 화면에 `glm-5` 와 `API Usage Billing`
  - `Claude Max` 표시 → Anthropic 계정. 닫고 `SPAWN_FAIL … screen`
- 조정자: 시험 지시로 SendMessage 왕복(`<브랜치> / glm-ok / <모델>`) 1회 확인
- Z.ai 플랜 = 5시간 한도
  - 틱에서 GLM 화면에 `429`·`Usage limit reached` → 해제 시각 확인
  - 20분 넘게 남음 → 남은 단계만 Sonnet 새 탭에 인계
  - 인계 지시 파일에 GLM 의 초안·미커밋 편집 이어받기 기재

## 4. 기동 확인과 신원 연결

기동 확인 = `spawn-lane.mjs` 가 수행(Spawned 성공이어도 빈 셸만 남는 일 있음).
`SPAWN_FAIL` 둘째 단어:
- `wait`: `tui-idle` 미충족 → 한 번 더 길게. 그래도 안 되면 「안 떴다」
- `process`: 세션 json 에 `name == <레인 이름>` 항목 없음 또는 pid 죽음
- `screen`: 화면을 읽어 원인 확인(업데이트 중 Permission denied, 신뢰 확인 창 등)
  - 빈 셸 → `terminal close` 뒤 재기동

그 밖:
- 첫 지시 제출 증거 = `send --wait-submit` 결과의 `turn_started`
- 첫 화면의 폴더 신뢰 확인 = `auto-answer.mjs` 가 자동 처리(리포 안 폴더만 Yes)
- 띄운 직후 prompt-watch 부착 → `approvals.md` §1

신원 연결(감시·compact 의 전제):
- 사용자가 띄운 세션: 착수 지시에 신원 보고 요청 포함(`protocol.md` 3.1·3.10)
  - `신원:` 수신 → `node scripts/coord-state.mjs set '.lanes.<레인>.session' '<json>'`
  - 기록: 이름·주소·세션ID·pid·핸들·`spawned_by":"user"`
- 스킬이 띄운 세션: 회차가 있으면 `spawn-lane.mjs` 가 `lane-add` 로 기록
  - `spawned_by":"coordinator"`
- 연결에 사용 금지: 터미널 제목(Claude 가 덮어씀), 세션 json 의 tmux 칸
- 핸들 = Orca 재시작 뒤 바뀔 수 있음(`terminal_handle_stale`)
  - `coord-status.mjs` 의 `status=gone` → 신원 재요청
  - `term-send-safe.mjs` 의 `REFUSED … stale` → 신원 재요청
- `UNLINKED` 세션 → 사용자에게 어느 레인인지 묻거나 신원 요청

## 5. 정리 절차

끝난 세션·Pane = 조정자가 알아서 즉시 닫음. 임시 Pane·사용자가 띄운 세션도 같음.

1. **조건** 확인
   - 레인: 마지막 산출물(커밋·보고) 수신, 머지·정리 끝
   - 임시 워커: 결과를 장부에 기재함
2. squash 로 `-d` 가 거부된 브랜치 → 남기고 `pending_user` 에 올림(삭제 금지)
3. 레인 정본 메모 「완료」 갱신 확인
4. 백그라운드 0 확인(`idle-check.mjs`)
   - 그 세션이 연 브라우저 작업 공간·로컬 서버 → 먼저 닫게 함
5. **닫기**: `node scripts/close-lane.mjs <레인>`(또는 `--handle <h>`, `--dry-run` 가능)
   - 출력: `CLOSED <레인> handle=<h>` 또는 `CLOSE_REFUSED <레인> <bg-running|not-reported>`
   - `bg-running` → 백그라운드 종료까지 대기
   - `not-reported` → 마지막 보고 수신 뒤 닫음
     - 보고 없이 닫을 사유가 타당할 때만 `--force-report`(`not-reported` 만 통과)
   - 워크트리·브랜치 남음 = stderr 경고(거부 아님) → 레인에 정리 요청 뒤 닫음
   - `CLOSED` = 스크립트가 핸들·세션 파일 소멸 확인, state `closed`·이벤트 기록까지 끝냄
   - orchestration 워커: `worker-release` → `check --ack` → `terminal close`
     - 확인: `orca orchestration worker-list` 의 reclaimable 0
   - Agent 도구로 띄운 팀원: `shutdown_request`
6. `wake_targets` 파일이 있으면 갱신 필요를 사용자에게 알림
