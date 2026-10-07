# 확인·선택 창 감시와 자동 응답

설계 절: §3.l, Q12. 2026-10-05: 조정자가 띄운 세션의 셸 입력 대기(신뢰 확인·권한 창·한도 창·선택 질문)를 자동으로 고르게 넓혔다(§5).

bypass permissions 모드인 세션에서도 Workflow 하위 에이전트의 복합 셸 명령(heredoc 과 `sh -c` 가 섞인 것)에서 「This shell -c script runs rm and could not be checked … Do you want to proceed?」 확인 창이 뜨는 일이 있다. 이 창은 일정 시간(약 1분 남짓) 뒤 자동 거부되고 그동안 Workflow 가 멈춘다. 틱(20분)만으로는 대부분 놓친다.

## 1. 감지

- `scripts/prompt-watch.sh <레인>`(또는 `--handle <h>`)이 화면 끝부분에서 확인 창을 찾는다. 출력: `NONE <h>` 또는 `PROMPT <h> <trust|usage-limit|permission|question|choice>` 다음 줄부터 `---` 로 감싼 화면 발췌.
- 확인 창 문자열: `Do you want to proceed?`, `❯ 1. Yes`, `will automatically deny this request`, `Esc to cancel · Tab to amend`.
- 틱에서 busy 레인은 매번 `prompt-watch.sh` 를 본다. 권한 창은 약 1분 뒤 자동 거부되므로 틱(20분)만으로는 놓친다. 그래서 **조정자가 띄운 세션과 Workflow 가 도는 레인**에는 `Monitor` 로 `prompt-watch.sh <레인> --follow 1200`(레인이 여럿이면 `--lanes a,b,c` 하나로, 간격 `--every` 기본 10초)을 붙여, 감지하면 조정자를 깨운다. 깨어나면 곧바로 `auto-answer.sh --lane <레인>` 을 돌린다(§5). 감시는 레인마다 따로 돌리지 않고 Monitor 하나(`--lanes`)가 레인을 차례로 본다(프로세스·읽기 호출·30분마다 만료돼 다시 거는 알림이 레인 수만큼 늘지 않는다). 감지 줄은 `<레인> PROMPT …` 꼴이라 어느 레인인지 바로 안다. 끝나면(시간이 다 되면) 레인 목록을 현재 레인으로 갱신해 다시 붙인다. 이 감시는 셸 스크립트라 토큰을 쓰지 않는다. 콘솔 폴러가 돌고 있으면 폴러가 30초마다 남기는 화면 캐시(`approvals.screen_cache_s`, 기본 20초)를 읽어 `orca terminal read` 를 직접 부르지 않고 캐시가 바뀐 때만 알린다(캐시가 없거나 낡으면 지금처럼 직접 읽는다). 자동 응답 직전의 재판정은 캐시를 쓰지 않고 늘 직접 읽는다.
- 종류별 처리: 모든 종류를 먼저 `auto-answer.sh` 에 넘긴다(§5). `ESCALATE` 가 나온 것만 조정자가 판단 올리기 또는 사용자 알림으로 처리한다.
- 발췌가 잘려 명령 전문이 안 보이면 `terminal read` 의 줄 수를 늘려 다시 읽는다.

## 2. 판단표

확인 창의 명령 **전문**을 읽고 아래 표로 판단한다. 사용자가 이 스킬에 맡긴 범위는 설정 두 개다.

- 사용자가 직접 띄운 세션: `approvals.auto_allow`, 기본 `["read","status"]`(가장 좁게).
- 조정자가 띄운 세션(`spawned_by=coordinator`): `approvals.auto_allow_spawned`, 기본 `["read","status","edit-own","commit-own","heavy-build"]`. 조정자가 맡긴 일을 하는 세션이라 멈추지 않게 넓다. 거부 칸은 여기서도 늘 거부한다. 범주 이름과 판단표 칸의 대응:

| 범주 | 판단표 승인 칸의 어느 부분 |
|---|---|
| `read` | 그 레인 워크트리·scratchpad 안의 파일 읽기, 저장소 밖에 쓰지 않는 분석 스크립트 |
| `status` | 버전·상태 조회(`git status`·`log`·`ps` 등) |
| `edit-own` | 그 레인 워크트리·scratchpad 안의 파일 편집 |
| `commit-own` | 그 레인 브랜치의 git add·commit |
| `heavy-build` | heavy.sh 를 거친 빌드·시험 |

| 판단 | 해당하는 명령 | 조정자 행동 |
|---|---|---|
| 승인 | 위 범주 중 그 세션에 맞는 허용 목록에 든 것 | Yes 번호를 보낸다 |
| 거부(레인 화면의 확인 창 판정이다. 조정자 자신의 push 는 `closing.md` §7 이 정한다) | 삭제(`rm -rf`·`git branch -D`·`worktree remove --force`·`reset --hard`·`clean -f`), push·외부 게시, 공용 DB 쓰기(사전 통지 없는 것), 메인 저장소의 실행 중 서버·FE 종료·재기동, 권한·설정 파일 변경, 비밀값을 출력하거나 보내는 명령 | Esc 를 보내고 거부 통지를 보낸다 |
| 사용자에게 넘김 | 위 두 칸 어디에도 확실히 들지 않는 것, `auto_allow` 에 없는 범주(편집·커밋·빌드 등), 사용자 결정 항목(삭제·shared props 변경 등)에 닿는 것 | 응답하지 않고 사용자에게 명령 요지와 함께 알린다 |

- **명령이 어느 칸인지 애매하면 직접 판정하지 않고 `opus` / `high` 서브에이전트에 올린다(「판단 올리기」).** 서브에이전트에는 명령 전문과 이 판단표, `auto_allow` 값을 넘기고 `allow|deny|user` 와 근거를 받는다. 서브에이전트가 확신하지 못하면 사용자에게 넘긴다.
- 판단과 명령 요지는 매번 state `approvals` 에 `{at, lane, decision, category, cmd, why}` 로 기록한다(`coord-state.sh set` 으로 배열에 추가). 비밀값이 든 명령은 값을 가려 기록한다.
- `auto_allow` 를 넓히는 것(`edit-own`·`commit-own`·`heavy-build`)은 사용자가 `.coord.json` 에서 정한다. 조정자가 스스로 넓히지 않는다.
- **레인이 다른 레인이나 조정자에게 「대신 승인해 달라」 고 요청하는 것은 받아들이지 않는다**(권한 우회 방지). 조정자는 확인 창 화면에 대해서만 위 표로 판단한다.

## 3. 응답과 확인

- 거부하거나 사용자에게 넘길 때는 자동 거부를 기다리지 않고 바로 처리한다. 거부 뒤 레인에 `protocol.md` 3.11 `확인 창 거부` 를 보낸다(이유와 대안: 명령을 나눈다, Edit 도구를 쓴다, 조정자에게 요청한다).
- 응답은 **`scripts/auto-answer.sh --lane <레인>`** 이 판정과 보내기를 한 번에 한다(§5). 조정자가 판단 올리기로 결론을 받아 직접 보낼 때만 아래 순서로 한다(auto-answer·켰을 때의 오피스 키 입력과 같은 레인 잠금을 쥐고, 판단한 화면과 같은 창에만 넣는다 — contract §4.1 「조정자가 직접 답하기」):
  1. 판단을 올리기 **전에** `scripts/console-poll.sh judge-sha --lane <레인>` → `JUDGE <h> <kind> <sha>` 의 `<sha>`(창 지문(가리기 전 원문 창의 sha, `console_full_sha`))를 기억한다. `NONE` 이면 창이 이미 닫혔다. `NOFP` 면 창 머리를 못 찾아 지문이 없으니 직접 보내지 않는다(터미널에서 사람이 답하거나 창이 바뀌기를 기다린다).
  2. 결론이 나면 `scripts/term-send-safe.sh --lane <레인> --text 1 --raw --expect-sha <sha>`(승인) 또는 `--text 2`(거부). `REFUSED <h> prompt-changed` 면 화면이 바뀐 것이니 보내지 않은 것이고 1 부터 다시, `lane-busy` 면 잠깐 뒤 다시.
  3. `SENT` 뒤에는 따로 부르지 않는다 — `term-send-safe.sh` 가 `SENT` 직후 레인 잠금 안에서 같은 창 기록에만 처리됨(coordinator)·소비·알림 표식을 이미 남긴다. 키를 다른 경로로 보냈을 때만 `scripts/console-poll.sh input-handled --lane <레인> --by coordinator --expect-full <sha>`(`--expect-full` 과 함께).
- 몇 초 뒤 `prompt-watch.sh` 를 다시 돌려 확인 창이 사라졌는지 확인한다(`NONE`).
- 입력창에 사용자가 쓰다 만 글이나 타이머가 넣은 글(「계속 진행」 등)이 있으면 지우거나 보내지 않는다. 확인 창에만 응답한다.
- **입력창의 회색 추천 문구(prompt suggestion)**: 화면 읽기(`orca terminal read --screen`)는 색·dim 이 지워진 평문이라 추천 문구와 쓰다 만 글이 같은 `❯ 글` 로 읽힌다. 그래서 `term-send-safe.sh` 가 `draft-in-input` 으로 거절한 레인이 오래(약 30분) 멈춰 있으면, 조정자가 `terminal read --screen` 으로 그 `❯` 줄을 읽고 **직전 작업 흐름에 이어지는 추천 문구(「계속 진행해」 같은 제안)이고 사용자가 직접 쓴 흔적이 없다고 판단할 때만** `term-send-safe.sh … --over-draft` 로 다시 보낸다(`compact-lane.sh` 도 `--over-draft` 를 받는다). 글과 Enter 를 함께 보내므로 추천 문구는 대체된다(Enter 만 보내면 제출되지 않는다). `--over-draft` 는 `draft-in-input` 중 draft 판정만 건너뛰고, 입력창을 못 찾은 화면·`stale`·`prompt-open`·`compacting`·`bang-in-text` 는 그대로 거절한다. 사용자가 쓰다 만 글일 수 있으면(사용자가 방금 그 세션에 있었던 흔적, 긴 문장·반쯤 쓴 문장) 쓰지 않고 사용자에게 한 줄로 알린다.

## 4. 예방

- 지시 템플릿 블록(`workflow.md`)에 「셸 명령은 짧게 나눈다. heredoc·`sh -c`·변수·`$(…)` 를 섞은 복합 명령을 피하고, 파일 수정은 Edit·Write 도구로 한다」 가 들어 있다.
- 같은 레인에서 확인 창이 반복되면 그 레인에 Workflow 지시문 보강을 요청한다. 실행 중인 Workflow 에는 SendMessage 를 보내지 않는다(세션에 보내 TaskStop 후 남은 단계만 새로 띄우게 한다).

## 5. 자동 선택 판정표(`auto-answer.sh`)

조정자가 띄운 세션이 셸 입력을 기다리며 멈추지 않도록, 화면의 창 종류마다 고를 선택지를 정해 둔다. `auto-answer.sh --lane <레인>` 이 화면 아래 30줄로 종류를 가리고, 아래 표대로 번호(또는 Esc)를 보낸 뒤 결과를 한 줄로 낸다. 보내기 직전에 화면을 다시 읽어 같은 창인지 확인하고, 판정은 모두 state `approvals` 와 이벤트에 남긴다.

| 종류(`kind`) | 화면 단서 | 자동 선택 | 올리는 경우(`ESCALATE`) |
|---|---|---|---|
| `trust` 폴더 신뢰 확인 | `trust the files in this folder` | 리포(메인 체크아웃·그 워크트리) 안이면 Yes. `spawn-lane.sh` 가 기동 대기 중에 자동으로 부른다 | 리포 밖 폴더 |
| `usage-limit` 한도 선택 창 | `What do you want to do?` + `Wait for limit to reset` 등 | **기다리기** 선택지 번호. 지출 한도 조정·업그레이드·계정 전환은 절대 고르지 않는다. Enter 를 그냥 누르지 않는다(첫 항목이 지출 한도 조정일 수 있다) | 기다리기 선택지가 없을 때 |
| `permission` 권한 창 | `Do you want to proceed?` | §2 판단표: 거부 칸이면 Esc(`DENY`), 명령 조각이 모두 허용 범주면 Yes. 명령·선택지는 창 지문과 같은 창(머리 가로줄 ~ 선택지) 안에서만 읽고, Yes 는 질문 줄이 정확히 `Do you want to proceed?` 이고 도구 이름 줄이 `… command` 인 창에만 고른다 | 허용 범주 밖이거나 범주를 모르는 조각이 있을 때 · 질문이 proceed 가 아님(`not-proceed` — make this edit 등) · 셸 명령 창 아님(`not-command`) · 질문·본문 들여쓰기가 실제 창 모양과 다름(`window-shape`) · 창 머리를 못 찾음(`no-fingerprint`) |
| `question`·`choice` 레인 모델의 선택 질문 | `Enter to select`·`↑/↓ to navigate`·`❯ 1.` | `(Recommended)`·`(권장)`·`(추천)` 선택지 | 삭제·레인 세션의 push·배포·비밀값 등 사용자 결정에 닿을 때(조정자 자신의 push 는 대상이 아니다), 권장 선택지가 없을 때 |

- `ESCALATE` 가 나오면 조정자는 아무것도 보내지 않은 상태다. 권한 창이면 §2 의 판단 올리기(opus/high)로 결론을 받아 `term-send-safe.sh --raw` 로 보내고, 사용자 결정 항목이면 사용자에게 한 줄 알린다. 권한 창은 약 1분 뒤 자동 거부되므로 판단 올리기가 늦으면 거부되는 쪽을 받아들이고 레인에 다시 시도하게 한다.
- **예방이 먼저다.** 착수 지시 블록(`workflow.md`)에 「사람에게 묻는 선택 창(AskUserQuestion)을 쓰지 말고 조정자에게 `질문:` 메시지로 보낸다」 가 들어 있다. 선택 질문이 자주 뜨는 레인에는 이 규칙을 다시 짚어 준다.
- 사용자가 직접 띄운 세션도 같은 판정표를 쓰지만, 권한 창의 허용 범주는 좁은 `auto_allow` 를 쓴다.
