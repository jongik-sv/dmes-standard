# 세션·Pane 생성과 정리

설계 절: §3.e(모델 등급, GLM 기동, 생성 경로, 기동 확인, 신원 연결, 정리), Q5·Q7·Q13.

## 1. 모델 등급

세션·워커를 띄우기 전에 일의 난이도로 등급 결정. Workflow `agent()` 단계별 모델(`workflow.md`)도 같은 등급.

- **Fable**: 사용자가 요청한 경우만. `claude-fable-5-1`, 세션 `--model claude-fable-5-1`
- **Opus**: 설계 판정, 리뷰(동작 보존 판정), 보안, 트랜잭션·동시성 정합성, 원인 모를 결함 조사, 측정 판정
  - `claude-opus-5-5`, 세션 / `agent({model:'opus'})`
- **Sonnet**: 구현·수정, 시험 작성, 조사·위치 찾기, 문서 갱신
  - `claude-sonnet-5-5`, 세션 / `agent({model:'sonnet'})`
- **GLM**: 일반 작업 중 **쉬운 일**
  - 대상: 본보기 있는 같은 패턴 반복, 정해진 형식의 문서·표 정리, 범위 좁고 시험으로 바로 검증되는 수정
  - GLM-5.3(Z.ai), **새 탭** Claude Code 세션(`launch.glm`, 3절). SendMessage·머지 요청 절차 동일
- **Haiku**: 기계적 치환, 결과 확인·집계, 상태 읽기, 형식 검사
  - `claude-haiku-4-5-20251001`, `agent({model:'haiku'})` 위주
- **opencode 워커**: 사용량 띠가 오를 때 Claude 몫을 넘김(`usage.md` §2)
  - Y: 조사·문서 정리·쉬운 반복 구현 / O: 일반 구현 우선 / R: Claude 세션 정지 뒤 남은 일
  - 설정 `launch.opencode`, 새 탭(2절). 막히면 그 단계만 Claude 세션에 넘김
- **조사(검색 워커)**: 조사·위치 찾기·영향 범위·사용처 목록(읽기 전용)
  - 설정 `search.*`(기본 agy → 실패 시 opencode, `search.workers`)
  - `node scripts/search.mjs`: 기본 새 탭(agy 는 대화형 `agy -i`, opencode 는 `opencode run --standalone` 출력을 탭에 흘리며 파일에 남김). `--print` = 화면 없는 단발
  - 두 워커 모두 실패 → sonnet/medium
  - 감독·병렬·이력이 필요할 때만 `orca orchestration worker-start --agent antigravity --timeout-ms 240000`
  - agy 는 SendMessage 불가 → 결과를 파일로 받음

- 경계가 애매하면 한 등급 위
- GLM 일이 같은 문제에 20분 넘게 막히거나 방향이 틀어짐 → 막힌 단계만 Sonnet·Opus 새 탭 세션에 넘기고 나머지는 GLM 계속
- GLM 은 `agent()` 의 model 값으로 고를 수 없음(서브에이전트는 그 세션의 API 공급자를 따름) → **세션 단위**로만 맡김
- 작업 세션은 pane 분할이 아니라 **새 탭**(`spawn-lane.mjs` 가 생성)
- 모델 이름은 PC·계정마다 다름. 실패하면 `--model` 별칭(`opus`·`sonnet`)으로 재시도

## 2. 생성 경로

기본 = `node scripts/spawn-lane.mjs`(`--dry-run` 가능). 사용자가 띄운 세션은 생성하지 않고 신원 보고로 연결(4절).

`node scripts/spawn-lane.mjs --name <n> --kind <claude|glm|opencode> [--worktree <경로|선택자>] [--model m] [--effort e] [--autocompact t] [--prompt-file f] [--brief "<한 줄>"]`

`--brief "<한 줄>"` = 에이전트 오피스 레인 칸의 지시 요약(`lane-add` 의 `brief`).
- 생략 시 `--prompt-file` 첫 글줄에서 추출: 「— 」 뒤 제목, 없으면 줄 앞 60자
  - 앞쪽 `#` 와 `/`·`~/`·`./`·`../`·`C:/` 로 시작하는 경로 토큰은 제외(office.mjs 가 경로를 `[경로]` 로 가려 칸이 「[경로] 작업 중이다」 가 됨)
- 둘 다 없으면 `brief` 생략
- 그 레인에 `brief` 가 이미 있으면 유지(비어 있을 때만 채움)
- `--dry-run` = `lane-add` 에 넘길 JSON 을 `DRY node scripts/coord-state.mjs lane-add …` 로 출력

- **탭은 조정자의 워크트리에 생성**(Orca 가 아는 폴더여야 사용자 화면에 보임)
  - `--worktree <절대경로|path:경로>` = 세션이 일할 폴더. 스크립트가 빈 탭을 만든 뒤 `cd <그 폴더> && <실행 명령>` 을 send
  - Orca 가 그 폴더를 모름(`git worktree add` 로 만든 레인 워크트리) → 탭은 조정자 워크트리에 생성. 알면 그 워크트리에 생성
  - `name:`·`branch:`·`id:` Orca 선택자 → 그 워크트리에 탭 생성, 그 폴더에서 시작
  - 생략 → 조정자의 현재 워크트리 폴더에서 시작
  - 상대경로·`~` 금지
- `orca worktree create` 금지: 메인 체크아웃 안에 폴더를 만들어 dev 에 untracked 로 잡힘
  - `git worktree add` 로 만든 폴더를 `--worktree <그 폴더>` 로 전달
- `current`·`active` 선택자는 현재 폴더가 Orca 가 모르는 git worktree 이면 `selector_not_found`
  - 스크립트는 현재 폴더, 없으면 메인 체크아웃의 `path:` 선택자 사용

출력: `SPAWNED <n> handle=<h> pid=<pid|-> session_id=<id|->` 또는 `SPAWN_FAIL <n> <wait|process|screen|preflight|glm-cap> <사유>`.

명령 흐름:

- **새 레인(Claude Code, 오래 감)**
  1. `orca terminal create --worktree <탭 워크트리> --title <레인> --json`
     - **`--command` 를 쓰지 않음**: `Timed out waiting for terminal handle after creation` 으로 실패하고 터미널이 남지 않은 적이 있음
  2. 셸 프롬프트가 보인 뒤 `orca terminal send --terminal <h> --text "cd <레인 폴더> && <launch.claude> -n <레인> --model <m> --effort <e> [--autocompact <tokens>]" --enter --json`
  3. `orca terminal wait --terminal <h> --for tui-idle --timeout-ms 60000 --json` (**`satisfied: true` 확인**)
  4. 첫 지시는 `term-send-safe.mjs` 로
- **새 레인, 새 워크트리까지**
  - `orca worktree create --name <n> --agent claude --prompt "<지시>" --json` 은 모델·effort 지정 불가
  - 모델이 필요하면 `worktree create`(agent 없이) 뒤 위 `terminal create` 흐름
- **감독형 단일 과제 워커(Claude)**
  - `orca orchestration worker-start --spec "<과제>" --agent claude --model <m> --effort <e> --worktree current --json` → 완료(`worker_done`) → `worker-release` → `check --ack`
- **opencode 워커**
  1. `orca terminal create --worktree <탭 워크트리> --title <n> --json`
  2. 셸 프롬프트가 보인 뒤 `orca terminal send --terminal <h> --text "cd <폴더> && <launch.opencode>" --enter --json` (`--command` 는 시간 초과로 실패한 적이 있어 쓰지 않음)
  3. `terminal wait --for tui-idle` 뒤 `terminal read --screen` 으로 빈 입력창 확인
  4. `worker-start --terminal <h> --worktree current --spec "<지시>"`
  - 지시문에 `!`·`/`·`@` 금지
  - `--agent opencode` 는 쓰지 않음
- **GLM 세션**
  - `glm-preflight.mjs` 가 `ok` 일 때만(3)
  - `fail` 이면 같은 흐름으로 Sonnet 세션

- **띄운 직후 `tui-idle` 의 `satisfied: true` 확인 뒤에만 입력 전송** (시작 중인 TUI 에 친 글은 사라짐)
- `launch.claude` = 이 PC 에서 claude 플래그가 통과하는 실행 명령(설정, 킷에 박지 않음)
  - 첫 기동 때 `-n`·`--model`·`--effort`·`--autocompact` 통과 확인
- `--autocompact <tokens>` = 백스톱(발동 토큰 미확인). 주 경로는 외부 `/compact`(`compact.md`)
- 레인 수 상한 = 사용량 띠(`usage.md`: 1주 사용률이 `usage.spawn_week_max` 미만이면 띠와 무관하게 허용)
  - dflow-team 의 `capacity.sh` 가 있는 PC 에서는 그 판정(free·swap·load)도 적용. 없으면 생략
- 터미널 입력은 `term-send-safe.mjs` 만 사용
- 레인 이름 40자 이하(`lane-add` 가 넘으면 거절)
  - 띄운 뒤 첫 `lane-add` 에 정본 메모 경로 `memo` 도 입력
  - 비면 compact 문구가 「정본은 -」 로 나가고 `lane-add` 가 stderr 에 `WARN` 출력(`decompose.md` §5)

## 3. GLM 기동 절차

회사 PC·회사망에서는 GLM 동작 불가 → GLM 세션 전에 `node scripts/glm-preflight.mjs` 실행. 출력: `ok <host> <model> <초>` 또는 `fail <alias|host|call|model> <사유>`.

확인 단계:
1. alias 존재
2. alias 의 `ANTHROPIC_BASE_URL` 호스트가 `api.z.ai`
3. `POST <base>/v1/messages`(max_tokens 1, 제한 시간 `glm.timeout_s`)가 HTTP 200 이고 응답 `model` 이 GLM 이름

**토큰 값은 출력·로그·이벤트·대화 어디에도 기록 금지.**

- **하나라도 실패 → Sonnet 세션으로 대신 띄우고 사용자에게 한 줄 알림**: `GLM 사전 확인 실패(<단계>) → Sonnet 으로 진행`
  - 대체 여부는 조정자가 정함(`spawn-lane.mjs` 는 `SPAWN_FAIL … preflight` 만 출력)
  - Sonnet 으로 대신 띄웠으면 마감 보고에 기재
- 결과 기록: `node scripts/coord-state.mjs set '.glm' '{"status":"ok|fail","at":"<iso>","detail":"…"}'`
  - 같은 조정 회차에서 실패했으면 재시도 금지(망이 바뀌었을 때만 재확인)
- 동시 GLM 세션 상한 `glm.max_sessions`(기본 1). 넘으면 `SPAWN_FAIL … glm-cap`, Sonnet 으로 대신
- 기동 뒤 확인: 새 탭에서 `<launch.glm> -n <이름>` 실행 → `terminal read --screen` 에 `glm-5.3` 과 `API Usage Billing` 표시
  - `Claude Max`·`Opus` 표시 → Anthropic 계정으로 뜬 것. 닫고 실패 처리
  - 시험 지시로 SendMessage 왕복(`<브랜치> / glm-ok / <모델>`) 1회 확인
- **사용 한도**: Z.ai 플랜은 5시간 한도 → GLM 세션을 여러 개 돌리면 빨리 닳음
  - 틱에서 GLM 화면에 `429`·`Usage limit reached` 가 보이면 해제 시각 확인
  - 20분 넘게 남음 → 남은 단계만 Sonnet 새 탭에 인계
  - GLM 이 남긴 초안·미커밋 편집을 이어받게 지시 파일에 기재

## 4. 기동 확인과 신원 연결

기동 확인(Spawned 성공이어도 빈 셸만 남는 일이 있음): `spawn-lane.mjs` 가 수행. 실패 사유 = `SPAWN_FAIL` 둘째 단어.

1. `terminal wait --for tui-idle` 의 `satisfied` 확인(`wait`). false → 한 번 더 길게, 그래도 false 면 「안 떴다」
2. 세션 json 에 `name == <레인 이름>` 항목이 생기고 pid 가 살아 있는지 확인(`process`)
   - 없으면 화면을 읽어 원인(업데이트 중 Permission denied, 폴더 신뢰 확인 창 등) 확인(`screen`)
   - 빈 셸 → `terminal close` 뒤 재기동
3. 첫 지시 제출 증거 = `send --wait-submit` 결과의 `turn_started`
4. 첫 화면의 폴더 신뢰 확인 = `spawn-lane.mjs` 가 기동 대기 중 `auto-answer.mjs` 로 자동 처리(리포 안 폴더만 Yes)
5. 띄운 직후 조정자가 `Monitor` 로 `node scripts/prompt-watch.mjs <레인> --follow 1200` 부착(간격 기본 10초)
   - 레인이 여럿이면 `node scripts/prompt-watch.mjs --lanes a,b,c --follow 1200` 한 프로세스로 합침(읽기마다 `orca terminal read` 가 CPU 사용)
   - 콘솔 폴러가 돌면 폴러의 화면 캐시로 판정(화면 직접 읽기 금지). 캐시가 낡으면 직접 읽음
   - 감지 → `node scripts/auto-answer.mjs --lane <레인>` 실행(`approvals.md` §5)
   - 권한 창은 약 1분 뒤 자동 거부 → 틱만으로는 늦음

신원 연결(감시·compact 의 전제):

- 사용자가 띄운 세션: 착수 지시에 신원 보고 요청 포함(`protocol.md` 3.1·3.10) → `신원:` 수신
  - `node scripts/coord-state.mjs set '.lanes.<레인>.session' '<json>'` 으로 이름·주소·세션ID·pid·핸들·`spawned_by":"user"` 기록
- 스킬이 띄운 세션: `SPAWNED` 출력의 handle·pid·session_id 기록(`spawned_by":"coordinator"`)
- 터미널 제목(Claude 가 덮어씀)·세션 json 의 tmux 칸은 연결에 사용 금지
- 핸들은 Orca 재시작 뒤 바뀔 수 있음(`terminal_handle_stale`)
  - 틱마다 `coord-status.mjs` 의 `status=gone` 이나 `term-send-safe.mjs` 의 `REFUSED … stale` 확인 → 신원 재요청
- `UNLINKED` 세션 → 사용자에게 어느 레인인지 묻거나 신원 요청

## 5. 정리 절차

끝난 세션·Pane 은 즉시 닫음.

1. **조건**: 마지막 산출물(커밋·보고)을 받았고, 머지·정리 완료까지 끝남(레인) 또는 결과를 장부에 기재함(임시 워커)
2. **워크트리 정리 여부**: `close-lane.mjs` 가 worktree·branch 잔존 확인
   - squash 로 `-d` 가 거부된 브랜치 → 남기고 `pending_user` 에 올림(삭제 금지)
3. **레인 정본 메모가 「완료」 로 갱신됐는지, 백그라운드가 0 인지**(`idle-check.mjs`) 확인
   - 그 세션이 연 브라우저 작업 공간·로컬 서버 → 먼저 닫게 함
4. **닫기**: `node scripts/close-lane.mjs <레인>`(또는 `--handle <h>`, `--dry-run` 가능)
   - 출력: `CLOSED <레인> handle=<h>` 또는 `CLOSE_REFUSED <레인> <bg-running|worktree-left|branch-left|not-reported>`
   - `bg-running` → 백그라운드 종료까지 대기. `not-reported` → 마지막 보고 수신 뒤 닫음
   - `worktree-left`·`branch-left` = 경고. 레인에 정리를 요청하거나 사유가 타당하면 `--force-report` 로 닫음
   - orchestration 워커: `worker-release` → `check --ack` → `terminal close`
   - Agent 도구로 띄운 팀원: `shutdown_request`
5. **확인**: 터미널 목록에서 핸들 소멸, 세션 json 에서 pid 항목 소멸, `orca orchestration worker-list` 의 reclaimable 0
   - 기록: `node scripts/coord-state.mjs set '.lanes.<레인>.state' '"closed"'` 와 이벤트
6. `wake_targets` 파일이 있으면 갱신 필요를 사용자에게 알림

끝난 레인 세션은 조정자가 알아서 닫음(사용자 결정, 2026-10-04). 임시 Pane·사용자가 띄운 세션도 같음.
