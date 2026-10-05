# 세션·Pane 생성과 정리

설계 절: §3.e(모델 등급, GLM 기동, 생성 경로, 기동 확인, 신원 연결, 정리), Q5·Q7·Q13.

## 1. 모델 등급

세션·워커를 띄우기 전에 일의 난이도로 등급을 정한다. Workflow 안 `agent()` 의 단계별 모델(`workflow.md`)도 같은 등급을 따른다.

| 등급 | 쓰는 일 | 모델 | 실행 수단 |
|---|---|---|---|
| **Fable** | 사용자가 Fable 을 요청한 경우에만 | `claude-fable-5-1` | Claude Code 세션(`--model claude-fable-5-1`) |
| **Opus** | 어려운 일: 설계 판정, 리뷰(동작 보존 판정), 보안, 트랜잭션·동시성 정합성, 원인 모를 결함 조사, 측정 판정 | `claude-opus-5-5` | Claude Code 세션 / `agent({model:'opus'})` |
| **Sonnet** | 일반 작업: 구현·수정, 시험 작성, 조사·위치 찾기, 문서 갱신 | `claude-sonnet-5-5` | Claude Code 세션 / `agent({model:'sonnet'})` |
| **GLM** | 일반 작업 중 **쉬운 일**: 본보기가 이미 있는 같은 패턴 반복 적용, 정해진 형식의 문서·표 정리, 범위가 좁고 시험으로 바로 검증되는 수정 | GLM-5.3(Z.ai) | **새 탭**의 Claude Code 세션(`launch.glm`, 아래 3). Claude Code 이므로 SendMessage·머지 요청 절차가 같다 |
| **Haiku** | 쉬운 일: 기계적 치환, 결과 확인·집계, 상태 읽기, 형식 검사 | `claude-haiku-4-5-20251001` | `agent({model:'haiku'})` 위주 |
| **조사(검색 워커)** | 조사·위치 찾기·영향 범위·사용처 목록(읽기 전용) | 설정 `search.*`(기본 agy) | `scripts/search.sh`(기본 새 탭 대화형 `agy -i`, `--print` 는 화면 없는 단발 `agy -p`). 감독·병렬·이력이 필요할 때만 `orca orchestration worker-start --agent antigravity --timeout-ms 240000`. agy 는 SendMessage 를 못 하므로 결과는 파일로 받는다. 실패하면 sonnet/medium |

- 경계가 애매하면 한 등급 위를 고른다.
- GLM 에 맡긴 일이 같은 문제에 20분 넘게 막히거나 방향이 틀어지면, 막힌 단계만 Sonnet·Opus Claude 세션(새 탭)에 넘기고 나머지는 GLM 이 계속한다.
- GLM 은 Workflow `agent()` 의 model 값으로 고를 수 없다(같은 세션 안 서브에이전트는 그 세션의 API 공급자를 따른다). GLM 일은 **세션 단위**로만 맡긴다.
- 작업 세션은 pane 분할이 아니라 **새 탭**으로 연다: `spawn-lane.sh` 가 새 탭을 만든다.
- 모델 이름은 PC·계정에 따라 다를 수 있다. 실패하면 `--model` 별칭(`opus`·`sonnet`)으로 다시 시도한다.

## 2. 생성 경로

기본은 `scripts/spawn-lane.sh`(`--dry-run` 가능)다. 직접 명령으로 풀어 쓸 때의 흐름은 아래 표다. 사용자가 띄운 세션은 생성하지 않고 신원 보고로 연결한다(4).

`scripts/spawn-lane.sh --name <n> --kind <claude|glm|opencode> [--worktree <경로|선택자>] [--model m] [--effort e] [--autocompact t] [--prompt-file f]`

- **탭은 조정자의 워크트리에 만든다**(Orca 가 아는 폴더여야 사용자 화면에 보인다). `--worktree <절대경로|path:경로>` 는 세션이 일할 폴더이고, 스크립트가 빈 탭을 만든 뒤 `cd <그 폴더> && <실행 명령>` 을 send 한다. 그 폴더를 Orca 가 모르면(`git worktree add` 로 만든 레인 워크트리) 탭은 조정자 워크트리에, 알면 그 워크트리에 만든다. `name:`·`branch:`·`id:` 같은 Orca 선택자를 주면 그 워크트리에 탭을 만들고 그 폴더에서 시작한다. 안 주면 조정자의 현재 워크트리 폴더에서 시작한다(탭은 Orca 가 아는 워크트리에 만든다). 상대경로·`~` 는 받지 않는다.
- `orca worktree create` 는 메인 체크아웃 안에 폴더를 만들어 dev 에 untracked 로 잡히므로 레인 워크트리 용도로 쓰지 않는다. `git worktree add` 로 만든 폴더를 `--worktree <그 폴더>` 로 넘긴다.
- `current`·`active` 선택자는 현재 폴더가 Orca 가 모르는 git worktree 이면 `selector_not_found` 가 된다. 스크립트는 현재 폴더, 없으면 메인 체크아웃의 `path:` 선택자를 쓴다.

출력: `SPAWNED <n> handle=<h> pid=<pid|-> session_id=<id|->` 또는 `SPAWN_FAIL <n> <wait|process|screen|preflight|glm-cap> <사유>`.

| 경우 | 명령 흐름 |
|---|---|
| 새 레인(Claude Code, 오래 감) | `orca terminal create --worktree <탭 워크트리> --title <레인> --json`(**`--command` 를 쓰지 않는다**: `Timed out waiting for terminal handle after creation` 으로 실패하고 터미널이 남지 않은 적이 있다) → 셸 프롬프트가 보인 뒤 `orca terminal send --terminal <h> --text "cd <레인 폴더> && <launch.claude> -n <레인> --model <m> --effort <e> [--autocompact <tokens>]" --enter --json` → `orca terminal wait --terminal <h> --for tui-idle --timeout-ms 60000 --json`(**`satisfied: true` 확인**) → 첫 지시는 `term-send-safe.sh` 로 |
| 새 레인, 새 워크트리까지 | `orca worktree create --name <n> --agent claude --prompt "<지시>" --json` 은 모델·effort 를 못 준다. 모델이 필요하면 `worktree create`(agent 없이) 뒤 위 `terminal create` |
| 감독형 단일 과제 워커(Claude) | `orca orchestration worker-start --spec "<과제>" --agent claude --model <m> --effort <e> --worktree current --json` → 완료(`worker_done`) → `worker-release` → `check --ack` |
| opencode 워커 | `orca terminal create --worktree <탭 워크트리> --title <n> --json` → 셸 프롬프트가 보인 뒤 `orca terminal send --terminal <h> --text "cd <폴더> && <launch.opencode>" --enter --json`(`--command` 는 시간 초과로 실패한 적이 있어 쓰지 않는다) → `terminal wait --for tui-idle` 뒤 `terminal read --screen` 으로 빈 입력창 확인 → `worker-start --terminal <h> --worktree current --spec "<지시>"`. 지시문에 `!`·`/`·`@` 금지. `--agent opencode` 는 쓰지 않는다 |
| GLM 세션 | `glm-preflight.sh` 가 `ok` 일 때만(3). `fail` 이면 같은 흐름으로 Sonnet 세션 |

- **띄운 직후에는 `tui-idle` 의 `satisfied: true` 를 확인한 뒤에만 입력을 보낸다.** 아직 시작 중인 TUI 에 친 글은 사라진다.
- `launch.claude` 는 이 PC 에서 claude 플래그가 통과하는 실행 명령이다(설정, 킷에 박지 않는다). `-n`·`--model`·`--effort`·`--autocompact` 가 통과하는지 첫 기동 때 확인한다.
- `--autocompact <tokens>` 는 백스톱이다. 정확한 발동 토큰이 확인되지 않아 주 경로는 외부 `/compact`(`compact.md`)다.
- 레인 수 상한은 사용량 띠(`usage.md`: Y 부터 새 레인 금지)와, dflow-team 의 `capacity.sh` 가 있는 PC 에서는 그 판정(free·swap·load)으로 정한다. 없으면 건너뛴다.
- 터미널 입력은 `term-send-safe.sh` 만 쓴다.

## 3. GLM 기동 절차

회사 PC·회사망에서는 GLM 이 동작하지 않는다. 그래서 GLM 세션 전에 `scripts/glm-preflight.sh` 를 돌린다. 출력: `ok <host> <model> <초>` 또는 `fail <alias|host|call|model> <사유>`.

확인 단계: (1) alias 존재, (2) alias 의 `ANTHROPIC_BASE_URL` 호스트가 `api.z.ai`, (3) 실제 `POST <base>/v1/messages`(max_tokens 1, 제한 시간 `glm.timeout_s`)가 HTTP 200 이고 응답 `model` 이 GLM 이름. **토큰 값은 출력·로그·이벤트·대화 어디에도 남기지 않는다.**

- **하나라도 실패하면 GLM 을 쓰지 않고 Sonnet 세션으로 대신 띄운 뒤 사용자에게 한 줄 알린다**: `GLM 사전 확인 실패(<단계>) → Sonnet 으로 진행`. 대체 여부는 조정자가 정한다(`spawn-lane.sh` 는 `SPAWN_FAIL … preflight` 만 낸다).
- 결과는 `coord-state.sh set '.glm' '{"status":"ok|fail","at":"<iso>","detail":"…"}'` 로 남긴다. 같은 조정 회차에서 실패했으면 다시 시도하지 않는다(망이 바뀌었을 때만 재확인).
- 동시 GLM 세션 상한은 `glm.max_sessions`(기본 1). 넘으면 `SPAWN_FAIL … glm-cap` 이고 Sonnet 으로 대신한다.
- GLM 일을 Sonnet 으로 대신 띄웠으면 마감 보고에 적는다.
- 기동 뒤 확인: 새 탭에서 `<launch.glm> -n <이름>` 이 뜨면 `terminal read --screen` 에 `glm-5.3` 과 `API Usage Billing` 이 보여야 한다. `Claude Max`·`Opus` 가 보이면 GLM 이 아니라 Anthropic 계정으로 뜬 것이므로 닫고 실패 처리한다. 이어 시험 지시로 SendMessage 왕복(`<브랜치> / glm-ok / <모델>`)을 한 번 받는다.
- **사용 한도**: Z.ai 플랜은 5시간 한도가 있어 GLM 세션을 여러 개 돌리면 빨리 닳는다. 틱에서 GLM 화면에 `429`·`Usage limit reached` 가 보이면 해제 시각을 읽고, 20분 넘게 남았으면 그 세션의 남은 단계만 Sonnet 새 탭에 인계한다(GLM 이 남긴 초안·미커밋 편집을 이어받게 지시 파일에 적는다).

## 4. 기동 확인과 신원 연결

기동 확인(Spawned 성공이어도 빈 셸만 남는 일이 있다): `spawn-lane.sh` 가 아래를 한다. 실패 사유는 `SPAWN_FAIL` 의 둘째 단어다.

1. `terminal wait --for tui-idle` 의 `satisfied` 확인(`wait`). false 면 한 번 더 길게, 그래도 false 면 「안 떴다」.
2. 세션 json 에서 `name == <레인 이름>` 인 항목이 생기고 pid 가 살아 있는지(`process`). 없으면 화면을 읽어 원인(업데이트 중 Permission denied, 폴더 신뢰 확인 창 등)을 본다(`screen`). 빈 셸이면 `terminal close` 뒤 다시 띄운다.
3. 첫 지시 제출 증거: `send --wait-submit` 결과의 `turn_started`.
4. 첫 화면의 폴더 신뢰 확인은 `spawn-lane.sh` 가 기동 대기 중에 `auto-answer.sh` 로 자동 처리한다(리포 안 폴더만 Yes).
5. 띄운 직후 조정자는 그 세션에 `Monitor` 로 `scripts/prompt-watch.sh <레인> --follow 1200` 을 붙인다. 감지하면 `auto-answer.sh --lane <레인>` 을 돌린다(`approvals.md` §5). 권한 창은 약 1분 뒤 자동 거부되므로 틱만으로는 늦다.

신원 연결(감시·compact 의 전제):

- 사용자가 띄운 세션: 착수 지시에 신원 보고 요청을 넣어(`protocol.md` 3.1·3.10) `신원:` 메시지를 받는다. 받으면 `coord-state.sh set '.lanes.<레인>.session' '<json>'` 으로 이름·주소·세션ID·pid·핸들·`spawned_by":"user"` 를 기록한다.
- 스킬이 띄운 세션: `SPAWNED` 출력의 handle·pid·session_id 를 그대로 기록한다(`spawned_by":"coordinator"`).
- 터미널 제목은 Claude 가 덮어써서 연결에 못 쓴다. 세션 json 의 tmux 칸도 같아서 못 쓴다.
- 핸들은 Orca 재시작 뒤 바뀔 수 있으므로(`terminal_handle_stale`) 틱마다 `coord-status.sh` 의 `status=gone` 이나 `term-send-safe.sh` 의 `REFUSED … stale` 로 확인하고, 그러면 신원을 다시 요청한다.
- `UNLINKED` 세션은 사용자에게 어느 레인인지 묻거나 신원을 요청한다.

## 5. 정리 절차

끝난 세션·Pane 은 즉시 닫는다. 정리 조건·순서:

1. **조건**: 그 세션의 마지막 산출물(커밋·보고)을 받았고, 머지·정리 완료까지 끝났거나(레인), 결과를 장부에 적었다(임시 워커).
2. **세션이 자기 워크트리를 정리했는지**: `close-lane.sh` 가 worktree·branch 가 남았는지 본다. squash 로 `-d` 가 거부된 브랜치는 남기고 `pending_user` 에 올린다(삭제하지 않는다).
3. **레인 정본 메모가 「완료」 로 갱신됐는지, 백그라운드가 0 인지**(`idle-check.sh`)를 확인한다. 브라우저 작업 공간·로컬 서버를 그 세션이 열었다면 먼저 닫게 한다.
4. **닫기**: `scripts/close-lane.sh <레인>`(또는 `--handle <h>`, `--dry-run` 가능). 출력 `CLOSED <레인> handle=<h>` 또는 `CLOSE_REFUSED <레인> <bg-running|worktree-left|branch-left|not-reported>`.
   - `bg-running`: 백그라운드가 끝나기를 기다린다. `not-reported`: 마지막 보고를 받은 뒤 닫는다.
   - `worktree-left`·`branch-left` 는 경고다. 레인에 정리를 요청하거나 사유가 타당하면 `--force-report` 로 닫는다.
   - orchestration 워커는 `worker-release` → `check --ack` → `terminal close`. Agent 도구로 띄운 팀원은 `shutdown_request`.
5. **확인**: 터미널 목록에서 그 핸들이 사라졌는지, 세션 json 에 그 pid 항목이 없는지, `orca orchestration worker-list` 의 reclaimable 이 0 인지 본다. 결과를 `coord-state.sh set '.lanes.<레인>.state' '"closed"'` 와 이벤트로 남긴다.
6. `wake_targets` 파일이 있으면 갱신이 필요하다고 사용자에게 알린다.

끝난 레인 세션은 조정자가 알아서 닫는다(사용자 결정, 2026-10-04). 임시 Pane 도 자동으로 닫는다. 사용자가 띄운 세션도 같다.
