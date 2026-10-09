---
name: dflow-team
description: D'Flow 에서 내게 배정되고 에이전트 위임(tags:agent)된 ready 작업을 상시 감시해 슬롯 N개의 팀원에게 나눠 동시에 개발시키는 팀장 스킬. 팀원은 자기 서브에이전트를 띄울 수 있는 독립 세션(tmux pane 또는 Orca 탭)이며 각자 워크트리에서 /dflow-dev 를 돌린다. 당일·여러 날·종료 요청 전까지 실행할 수 있다. 트리거 - "/dflow-team", "팀으로 개발", "팀장 시작", "N건 동시 착수", "팀장 종료". 사용법 - /dflow-team [인원] <종료시각|종료 요청 전까지> [모델] [effort] [WP-XX…] · /dflow-team help
---

# /dflow-team: 팀장 (슬롯 N개 동시 개발)

> 문체: 에이전트 지시·보고·메시지 → `../_shared/style/Korean-STE-LLM-Guide.md`. 사람이 읽는 산출물 → `../_shared/style/Korean-STE-Writing-Guide.md`.

인자: `$ARGUMENTS`

> 윈도우: 아래 `jq` 예시를 Bash 로 직접 칠 때 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 를 붙임(`_shared/platform-support.md` 「문서 속 인라인 jq」).

> **컨텍스트 압축 뒤 Skill 도구로 `/dflow-team` 재호출 금지**(스킬 전체가 다시 실림). 「팀장 상태」
> 의 「압축 뒤 첫 기상」 대로 재독 세트만 Bash `sed` 로 읽음. 재독 명령 = 매 기상 `wake.mjs` 출력의 `COMPACT_REREAD` 줄.

> **위치 선언**: 설계 정본 = wbs-web 리포 docs/superpowers/specs/2026-09-10-dflow-team-design.md(킷에는 미동봉).
> `/dflow-poll` 의 1건 착수를 슬롯 N개 동시 착수 + 상시 보충으로 넓힘.
> 기본 = 담당자가 자리에 있는 supervised 루프. 사람이 명시하면 여러 날·종료 요청 전까지 무인으로도 돔(「인자」).
> 서버 통신 = dflow.mjs, exit code 로 분기. dflow-work 금지사항 상속.
>
> **제1 제약: 팀원을 서브에이전트로 띄우지 않는다.**
> - 팀원은 `/dflow-dev` 를 돌리고, `/dflow-dev` 는 Phase 를 서브에이전트로 쪼갬.
> - 서브에이전트는 자기 턴이 끝나면 완료로 보임. 그 뒤 끝난 Phase 손자의 완료가 팀원을 깨우지 못함.
> - 팀원 = 별도 프로세스의 **대화형** claude 메인 에이전트: 팀장이 tmux pane 에 띄운 프로세스 또는 Orca 탭 프로세스(backends.md).
> - 이 문서의 서브에이전트 금지는 모두 이 조항을 가리킴.
>
> **팀장 역할: 대상 리포 소스 수정 금지, 빌드·시험 직접 실행 금지.**
> - 그 일 = 팀원(이슈 보고에 대한 `[팀장 지시]`) 또는 해소 워커(「4-1」)에게 넘김.
> - 팀장이 직접 하는 일은 이 스킬이 맡긴 것뿐:
>   - 스킬 스크립트 호출(`dflow.mjs`·`sweep-check.mjs`·`dialect-check.mjs`·`resolve-decide.mjs` 등)
>   - 팀장 체크아웃의 git 조작(fetch·detach·스윕 머지)
>   - 이벤트·문제 기록, 백엔드 명령
> - 유일한 예외 = 개발 브랜치 자체가 깨졌을 때 최소 수정(「2-4」 5번).

**참조**: 아래 문서는 그 절차를 탈 때 Bash `cat` 으로 읽음(심링크 배포 리포에서 Read 는 작업 디렉터리 밖 읽기 확인을 부름).
근거·이력 = `references/rationale.md`(운영에는 안 읽어도 됨).

| 문서 | 읽는 때 |
|---|---|
| `references/help.md` | 인자가 `help` 일 때만 |
| `references/args.md` | 인자를 물어야 할 때(종료 시각 누락·오류, 키 후보 둘 이상), 키를 자동 선택해 저장할 때, 키 판정이 `KEY_*`·`NO_*_KEY` 로 끝날 때 |
| `references/precheck.md` | 전제 검사가 `PRECHECK_OK` 없이 끝났을 때, 또는 `WARN GRADLE_TUNING` 이 나왔을 때 |
| `references/extend.md` | 사람이 실행 중 연장을 말할 때 |
| `references/second-lead.md` | 같은 리포에서 다른 신원의 팀장을 하나 더 띄울 때 |
| `references/backends.md` | spawn·회수·정리·답 넣기·고아 정리 때(그 절만) |
| `references/worker-prompt.md` | 팀장은 안 읽음(팀원 규칙. 포인터로 넘기기만 함) |
| `references/resume.md` | 재개 spawn(「5-1」) 때, 계약 2.11 에서 이어 갈지 가를 때(「서버 판단 확인」) |
| `references/restart.md` | TICK 판정·결과 줄 없는 `PANE_DEAD`·재투입·rate-limit 대기·중단 표식 정리 때 |
| `references/design-ahead.md` | 빈 슬롯에 선행 대기 작업을 설계 선행으로 줄 때, `design_waiting` 결과·설계 완료 대기 워크트리(고아 스캔 0번)를 다룰 때 |
| `references/design-state.md` | 계약 2.11 에서 poll 후보의 설계 사전 검사, 「설계 승인」 된 작업(`build`), 설계 상태 결과 처리 때 |
| `references/merge-conflict.md` | 머지 충돌 접수·해소 spawn·해소 결과·사람 머지 감지 때 |
| `references/issues.md` | 팀원의 SendMessage 이슈 보고가 도착했을 때(「2-4」) |
| `references/closing.md` | 「7. 마감」 에 들어설 때(잠금 상실·lease 상실 마감 포함) |
| `references/events.md` | 기록 명령 절 = 매 기상 `wake.mjs` 가 띄움. 이벤트 표 = 필드가 궁금할 때 |

문제 기록: 팀원이 겪은 에러·문제점 → 팀장 체크아웃의 `docs/dflow-team/issues.md` 에 누적(「3. 결과 처리」). 스킬 개선 재료, 커밋 안 함.

- `dflow.mjs` = `node .claude/skills/dflow-work/scripts/dflow.mjs`. `.dflow`·`.dflow.local`(레거시 `.env`)을 스스로 읽으므로 접두 안 붙임.
- `<기본브랜치>` = 「1. 시작」 전제 검사가 구한 이름.
- `<MAIN>`·`<MAIN_CHECKOUT>` = 팀장 체크아웃 절대경로.
- `<신원>`·`<host>` = 「1. 시작」 전제 검사가 만든 슬러그.

## 인자

`/dflow-team [인원] <종료시각|종료 요청 전까지> [모델] [effort] [WP-XX…]`. 예: `/dflow-team 18:00`,
`/dflow-team 4명 18시까지 opus`, `/dflow-team 18:00 WP-02 WP-03`, `/dflow-team 3일 뒤 06:00까지`,
`/dflow-team 종료 요청 전까지`, `/dflow-team 18:00 opus effort xhigh`.

- 인자는 자연어로 해석. 플래그 문법 강제 안 함.
- **`help`**: 인자가 `help`·`--help`·`-h`·`도움말`·`사용법` 중 하나면 `references/help.md` 를 Bash `cat` 으로 읽어 그대로 보여 주고 **끝냄.**
  - 전제 검사·잠금·서버 호출 안 함.
  - 그 파일은 이때만 읽음.
- **강제 인수**: 인자에 `--takeover`·`강제 인수`·`넘겨받기` 가 있으면 「1. 시작」 의 `<TAKEOVER>` = `--takeover`, 없으면 빈 값.
  - 같은 신원이 이 프로젝트의 팀장 lease 를 **다른 곳**(다른 clone·다른 PC)에서 쥐고 있을 때 그것을 빼앗음.
  - 밀려난 팀장은 약 1분 안에(다음 갱신 + 감시 루프 20초) `LEASE_LOST` 로 멈춤. 그 팀장의 워커는 하던 작업을 끝냄.
  - 사람이 명시할 때만 사용.
- **키 판정**: `.dflow.local` 의 `pats`(레거시 `.env` 의 `DFLOW_PATS`)에 토큰이 둘 이상이면 시작 전에 어느 키로 돌지 정함.
  - 「1. 시작」 전제 검사 **전**, 다른 인자의 질문보다 **먼저** 함.
  - 정본 = `.dflow.local` 의 `as=<prefix>`(레거시 `.env` 의 `DFLOW_AS`). `dflow.mjs`·`poll.mjs`·팀원(`.dflow.local` 심링크)·heartbeat 훅이 모두 그 값을 따름.
  - 키는 `.dflow.local` 처럼 **워크트리마다 따로** 정함(주 체크아웃, 「두 번째 팀장」 의 팀장 워크트리마다). 팀원은 자기 팀장의 키를 따름.
  ```bash
  (echo "as=$(node .claude/skills/dflow-work/scripts/dflow.mjs config as)"; node .claude/skills/dflow-work/scripts/dflow.mjs profiles) \
    | node .claude/skills/dflow-team/scripts/live-leads.mjs --mark
  ```
  - 출력 = 토큰마다 한 줄 JSON(`prefix`·`name`·`email`·`who`·`bound`·`selected`·`in_use`, 실패한 토큰은 `error`). 필드 뜻 = `references/args.md` 「키 판정 상세」.
  - `in_use` ≠ `null` 인 키(다른 워크트리의 살아 있는 팀장이 쓰는 신원)로는 시작 불가.

  | 상태 | 처리 |
  |---|---|
  | `as`(레거시 `DFLOW_AS`) 있음(값이 비어 있지 않음) | 안 묻음. `selected` = `true` 인 행이 없으면 `KEY_NOT_FOUND`, 그 행의 `in_use` ≠ `null` 이면 `KEY_IN_USE` 로 끝 |
  | 없고 토큰 1개 | 그 행의 `in_use` ≠ `null` 이면 `KEY_IN_USE` 로 끝, 아니면 그대로 진행 |
  | 없고 토큰 2개 이상 | `error` 없음 · `bound` = `true` · `in_use` = `null` 인 행이 후보 |
  | → 후보 0개 | `bound` = `true` 인 행이 하나도 없으면 `NO_KEY_FOR_PROJECT`, 있는데 모두 `in_use` 면 `NO_FREE_KEY` 로 끝 |
  | → 후보 1개 | 그 키 자동 선택 |
  | → 후보 2개 이상 | AskUserQuestion 으로 질문. 종료 시각도 물어야 하면 같은 호출에 모음 |

  - `bound` = `null` 이면(프로젝트 바인딩 없음) 키 판정 건너뛰고 전제 검사로 감.
  - 묻기·자동 선택한 키의 저장·끝낼 때의 보고 문구 = `references/args.md` 「키 판정 상세」 대로(자동 선택이든 답이든 고른 prefix 를 저장).
- **종료 시각 = 유일한 필수 인자.** 새 배정을 멈추는 시각. 세 형식 중 하나로 정규화.
  - 정규화한 값 = `<UNTIL>`, 좌석표에 싣는 표시 문자열 = `<UNTIL_LABEL>`.

  | 말 | `<UNTIL>` | `<UNTIL_LABEL>` |
  |---|---|---|
  | `18:00`, "18시까지" (오늘) | `18:00` | `18:00` |
  | "내일 아침 7시", "3일 뒤 06:00", "월요일 09:00", `2026-09-21 06:00` | `2026-09-21 06:00` | `09-21 06:00` |
  | "종료 요청 전까지", "무기한", "계속", "끝날 때까지" | `none` | `종료요청까지` |

  - 날짜 붙은 말 = 오늘 날짜(`date +%Y-%m-%d`) 기준 절대 날짜로 변환. "N일 뒤" = 오늘+N일, 요일 = 오늘 이후 가장 가까운 그 요일.
  - 시각만 있고 오늘 이미 지났으면 **내일로 추측하지 않고** 묻음.
  - 날짜 붙은 종료 시각은 지금부터 **7일 이내**여야 함(`UNTIL_TOO_FAR`). 더 길게 돌리려면 `종료 요청 전까지` 사용.
  - 시작 보고 첫 줄에 정규화한 절대 시각(또는 "종료 요청 전까지") 기재.
  - **종료 요청**: 종료 시각 전이라도, 또는 `none` 이면 언제든 둘 중 하나로 멈춤. 둘 다 「7. 마감」 으로 감.
    1. 팀장 세션에 말로 함: "팀장 종료", "마감해", "그만" 같은 말.
    2. 다른 세션·터미널에서 종료 파일 생성. 감시 루프가 20초 안에 보고 `STOP_REQUESTED` 로 팀장을 깨움.
       ```bash
       touch "$(git -C <팀장 체크아웃> rev-parse --git-path dflow-team.stop)"
       ```
  - 종료 시각이 없음·이미 지남·형식 틀림·7일 초과면 사용법만 출력하고 끝내지 않고 **AskUserQuestion 으로 질문.**
    - 질문 시점 = 「1. 시작」 전제 검사 **전**(잠금을 쥔 채 답을 기다리지 않음).
    - 한 번의 호출에 모아 질문. 선택지·다시 묻기·사용법 출력 = `references/args.md` 「인자 질문」 대로.
    - 종료 시각이 주어졌으면 나머지 선택 인자는 안 묻고 기본값 사용.
  종료 시각이 지나면 새 배정을 멈춤. 진행 중인 팀원은 대기 상한까지 기다린 뒤 남은 것을 목록으로 보고(「7. 마감」).
  - **실행 중 연장**: 사람이 "내일 9시까지 연장" 처럼 말하면 `references/extend.md` 대로(`team.extend` 기록, poll·감시 루프·좌석표 갱신, 마감 중이면 마감 취소). **`team.start` 새로 쓰기 금지.**
- **여러 날·무기한 실행**(`<UNTIL>` ≠ 오늘 또는 `none`): 시작 보고에 "팀원은 권한 확인 생략 모드로 무인으로 돕니다. 답을 기다리는 팀원은 사람이 답할 때까지 슬롯을 잡습니다." 를 한 줄 더 적음.
  - macOS 면 절전 방지를 검(「1. 시작」 6번).
  - 서버(Linux)와 Windows 는 절전 방지 안 검.
- 인원 = 동시 팀원 슬롯 수. **기본 3, 인원 상한 = 이 PC 의 `min(6, K+2)`.**
  - K = 무거운 명령 슬롯 수(`heavy.mjs` 와 같은 계산: `DFLOW_HEAVY_SLOTS`, 없으면 `max(1, ⌊RAM_GB/8⌋)`). 16GB 면 4명, 32GB 이상이면 6명.
  - 상한은 아래로 구함. 인원(기본 3 포함)이 상한을 넘으면 상한으로 자르고 그 사실을 출력 줄과 함께 한 줄 알림.
  ```bash
  node .claude/skills/dflow-team/scripts/capacity.mjs max
  ```
  - 출력 = `TEAM_MAX <상한> k=<K> ram=<GB>GB source=<default|DFLOW_TEAM_MAX>` 한 줄.
  - 사람이 상한을 바꾸려면 팀장 세션의 환경변수 `DFLOW_TEAM_MAX`(1-6)로 덮음. 6 은 덮어도 못 넘음(`clamped=` 가 붙음).
- **도커 허용 태그: 팀원은 도커 미사용이 기본(인원 무관). D'Flow 작업의 tags 에 `docker` 가 있는 Task 의 팀원에게만 허용.** 이 판정을 정하는 곳 = 이 줄 하나.
  - 새 작업·재개·재시작·해소 포인터를 쓸 때마다 띄우기 직전에 `node .claude/skills/dflow-team/scripts/docker-allow.mjs <id8>` 로 그 작업의 서버 tags 를 다시 읽음.
  - 출력의 `DOCKER=allow`·`DOCKER=ban` 을 포인터에 그대로 실음(「5. 팀원 spawn」 3·4번, `references/resume.md` 4·6항, merge-conflict.md 「2」 4번).
  - 조회 실패 = `ban`(모르면 금지).
  - 옛 포인터(`.dflow-prompt`)의 값 옮겨 쓰기 금지(옛 `NO_DOCKER=0` 을 허용으로 읽지 않음).
  - 허용된 팀원도 도커 명령은 PC 전역 도커 슬롯(`heavy.mjs --pool docker`, 기본 1개)을 잡은 동안만 실행.
  - 여러 Task 가 같은 목적으로 도는 도커 검증(DB 방언)은 팀원이 아니라 「4. 승인 스윕」 끝의 방언 검증이 한 번 실행.
  - `.dflow`·`.dflow.local` 의 `no_docker=1` = 태그가 있어도 막는 강제 스위치. 워커가 스스로 읽음(`0` 은 아무것도 풀지 않음).
  - 태그는 사람이 D'Flow 웹의 WBS 명세나 wbs.md import 의 tags 필드로 지정(`agent` 와 같은 자리).
  - 도커 명령은 대상 리포가 제공하는 컨테이너 재사용 방식을 따름. 규칙 정본 = dev-discipline.md 「도커 사용 규칙」.
- 모델은 선택(`opus`|`sonnet`). 없으면 포인터에 `MODEL=default` 를 넘겨 기본 모델 사용.
  - 값은 팀원이 `/dflow-dev --model` 로 넘김.
  - 두 백엔드 모두 팀원을 띄우는 `.dflow-run` 의 `claude --model` 에도 붙임.
- **추론 강도(effort) 기본 `high`.** 사람이 `effort xhigh`·`추론 강도 max` 처럼 요청할 때만 변경.
  - 값 = `low`|`medium`|`high`|`xhigh`|`max` 중 하나. 그 밖의 값이면 한 줄 알리고 `high` 사용.
  - 정한 값 = `<EFFORT>` 로 기억. 두 백엔드 모두 `.dflow-run` 의 `claude` 호출에 `--effort <EFFORT>` 를 붙임(backends.md 「팀원 워크트리 준비」).
  - 모델과 effort 는 안 묻음.
- **설계 방식은 인자가 아님**(계약 2.11, 설계 상태 스펙 D27). 사람이 WBS 작업 패널에서 작업마다 고르고, 팀장은 서버 판단 `action` 을 포인터 `SCOPE` 로 넘김(「5」 4번).
  - 옛 인자 "설계만"·"구현부터" 가 오면 쓰지 않고 그렇다고 한 줄 알림.
- **재개 인자 `--resume <id8>[ <id8>…]`** 선택. 자연어 "443b8ffe 재개" 도 같게 해석.
  - 이 인자가 없어도 이 PC 에 남은 중단된 팀원 워크트리는 자동으로 이어받음(「팀장 상태」 고아 스캔의 "재개 가능" 분류).
  - `--resume` = **워크트리가 이 PC 에 없거나 다른 PC 가 claim 한 작업**을 사람이 손으로 지목해 이어받게 함(「5-1. 재개 spawn」).
  - 지목한 id8 은 자동 판정의 거부 사유(재시도 상한 초과, `claimed_by` 불일치)를 무시하고 진행. 띄우기 전에 남은 것과 잃는 것을 한 줄로 보고.
  - 계약 2.11 서버에서는 서버 `mine` 이 거짓이면(다른 PC 가 30분 안에 돌렸거나 다른 신원이 잡음) 안 띄움(`references/resume.md` 「서버 판단 확인」).
- **WP 범위 `WP-XX`** 선택. 여럿이면 공백이나 쉼표로 적음. 모듈이 여럿인 프로젝트에서 한 모듈로 좁히려면 `dict/WP-02` 처럼 모듈을 앞에 붙임.
  - 자연어 "2번 WP만" → `WP-02` 로 해석. 없으면 전체.
  - 이 범위는 **새 배정만** 좁힘. poll 이 `--wp` 로 그 WP 의 Task 만 돌려줌(「2-1」).
  - 판정 기준 = `external_ref` 의 TSK 번호 첫 칸(`dict/TSK-02-05` → `WP-02`).
  - 재개(「5-1. 재개 spawn」)·「이어서 시작」 요청·승인 스윕은 범위 무관하게 그대로.
  - 범위 안 작업이 범위 밖 선행을 기다리면 워커가 `skipped` 로 끝내고 일시 제외되는 것은 지금과 같음.
  - 범위는 `team.start` 의 `wp` 에 남김(「1. 시작」 5번). 컨텍스트 압축 뒤 poll 을 다시 띄울 때 그 값으로 복원.
- poll 조회 주기 180초(3분) 고정. 일시 제외 = `--recheck-cycles 10`(10주기 = 30분) 유지. 선행 대기(「2-3」 「선행 사전 검사」)는 따로 `--wait-cycles 40`(40주기 = 2시간)으로 붙듦.
- **자동 머지 `automerge=1`**(`.dflow.local`, 개인 설정, 기본 0. 레거시 `.env` 의 `DFLOW_AUTOMERGE=1`): 켜면 팀원이 완료 보고(`done`)하는 즉시 팀장이 그 agent 브랜치를 기본 브랜치에 머지하고 다음 Task 착수.
  - **승인은 사후 확인.** 스윕이 `/dflow-merge --on-report` 로 돔(「4. 승인 스윕」). 승인 전에 머지한 작업은 state.json 에 `phase: "merged"` 와 `unapproved: true` 를 남김.
  - 나중에 사람이 승인하면 다음 스윕이 표식만 지움. 반려하면 "반려(머지됨)" 으로 보고(되돌리기는 사람이 고름).
  - 꺼져 있으면 종전대로 approved 만 머지. 승인 대기인 선행의 후속은 승인·머지 뒤에야 풀림.
  - 값은 인자가 아니라 설정. 스윕마다 아래로 읽음.
  ```bash
  [ "$(node .claude/skills/dflow-work/scripts/dflow.mjs config automerge)" = 1 ] && echo AUTOMERGE_ON || echo AUTOMERGE_OFF
  ```
- 작업을 빼는 인자 없음. 특정 작업을 안 잡게 하려면 D'Flow 에서 그 작업의 `agent` 태그를 끔. 팀장 내부의 제외 목록은 그대로 있음.
## 팀장 상태: 메모리는 캐시다

상태: 슬롯 표(슬롯 번호·`AGENT_ID`·TSK·id8·워크트리·pane id 또는 터미널 핸들·시작 시각·직전 생존 증거), 대기 큐(슬롯 없어 못 준 ready id8), 영구 제외(failed·반려·진행 중), 일시 제외(선행·spec 사유), 선행 대기(사전 검사의 선행 미충족 id8 + 선행 ref), 답 기다리는 `blocked`, 결과 줄 경로별 마지막 처리 해시, 차단기, 백엔드.
- **답을 받아 팀원 화면에 넣는 일 = 한 번의 기상 안에서 끝냄. 중간 상태 남기지 않음.**
- `team.answer` 는 넣은 뒤 기록. 그 사이 압축되면 다시 통지되고 사람이 한 번 더 답함.
- 세션 메모리의 이 값들 = 캐시. 팀장은 **깨어날 때마다** 아래 정본에서 다시 만든다.

**압축 뒤 첫 기상**: 요약 ≠ 절차 정본.
- **압축 신호**: 하나라도 맞으면 압축 뒤.
  1. 대화가 "이전 대화에서 이어진다" 는 요약으로 시작.
  2. 이 문서의 절 본문을 글자 그대로 볼 수 없고 요약만 있음.
  3. 슬롯 표·`<신원>`·`<host>`·`<UNTIL>` 같은 값을 대화에서 찾을 수 없음.
  - 모르겠으면 압축 뒤로 본다(재독은 쌈). 폴링만 이어 가지 않는다.
- **할 일**: 행동 전에 재독 세트(이 파일의 「참조」~「인자」「팀장 상태」「2. 기상과 감시」「3. 결과 처리」)를 아래 한 줄로 읽는다.
  - 매 기상 `wake.mjs` 출력의 `COMPACT_REREAD` 줄 = 같은 명령.
  - Read 도구 말고 Bash `sed` 로 읽는다.
  - Skill 도구로 `/dflow-team` 을 다시 부르지 않는다.
  ```bash
  sed -n '/^\*\*참조\*\*/,/^## 두 번째 팀장/p;/^## 2\. 기상과 감시/,/^## 4\. 승인 스윕/p' .claude/skills/dflow-team/SKILL.md
  ```
- 재독 세트 밖 절(「4」~「7」·「좌석표 연동」·「금지」)과 `references/*`: 압축 뒤 그 절차를 처음 탈 때 그 절만 `sed`·`cat` 으로 읽는다(「참조」 표). 기억으로 절차를 밟지 않는다.
- `<host>` 도 기억 말고 「1. 시작」 의 명령으로 다시 구한다.
- 요약에서 빠진 규칙(이벤트의 추가 필드, `parked` 표시, host 슬러그와 `host` 필드의 차이)은 기억으로 메워지지 않는다. 그렇게 기록한 줄은 다음 재구성이 읽지 못한다.

이 절의 접두는 모두 `<신원>/<host>/` 로 시작(같은 신원이 다른 PC 에서 띄운 팀장의 워크트리를 자기 것으로 읽지 않음).

**정본**: 이 신원·이 PC 의 팀원 워크트리와 그 결과. `TM` = 「1. 시작」 전제 검사가 출력한 tmux 절대경로.
```bash
TM='<진짜 tmux 절대경로>'   # Orca 백엔드면 빈 값
dirs=$(node .claude/skills/dflow-work/scripts/dflow.mjs config tasks-dirs); rc=$?   # 팀장 체크아웃 기준 값이 정본. 워크트리마다 다시 부르지 않는다 — 팀원 워크트리는 detach 된 옛 커밋에 있어 project_map 이 다르게 나올 수 있다(DEV_BRANCH 와 같은 이유)
{ [ "$rc" = 0 ] && [ -n "$dirs" ]; } || { echo "FAIL TASKS_DIRS rc=$rc"; exit 1; }
git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r w; do
  [ -f "$w/.dflow-agent" ] || continue
  a=$(head -n 1 "$w/.dflow-agent")
  case "$a" in "<신원>/<host>/"*) ;; *) continue ;; esac
  rf=$(printf '%s\n' "$dirs" | while IFS= read -r dd; do
    find "$w/$dd" -mindepth 2 -maxdepth 2 -name .result 2>/dev/null; done | head -n 1)
  r=$([ -n "$rf" ] && head -n 1 "$rf")
  b=$(git -C "$w" branch --show-current)
  p=$(head -n 1 "$w/.dflow-pane" 2>/dev/null); alive=-
  if [ -n "$p" ] && [ -n "$TM" ]; then
    d=$("$TM" -L dflow list-panes -t "$p" -F '#{pane_dead}' 2>/dev/null | head -n 1)
    case "$d" in 0) alive=alive ;; *) alive=dead ;; esac
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$a" "$w" "${b:--}" "${r:--}" "${p:--}" "$alive"
done
```
- `FAIL TASKS_DIRS`(`config tasks-dirs` 실패·빈 값) → 재구성 중단(빈 폴더로 워크트리 전체를 훑어 오판).
- `.dflow-agent` = `<신원>/<host>/w<slot>` 인 워크트리 = 그 슬롯의 팀원 워크트리.
- `<신원>/<host>/parked` = 슬롯 아님. 고아 스캔만 본다.
- 워크트리 안 `<TASKS>/*/.result` = 결과. 브랜치 `agent/<id8>-…`·워크트리 이름 `dflow-<id8>` = 작업 식별.
- 마지막 칸(`.dflow-pane` 의 tmux pane): `alive` = 살아 있음, `dead` = 죽었거나 사라짐(빈 출력도 `dead`), `-` = Orca 팀원.

**보조**: `~/.dflow/events.jsonl` 에서 마지막 `team.start` 이후이고 `agent` = `<신원>/<host>/lead`, `repo` = 이 리포(`<MAIN>`)인 줄.
- **줄을 통째로 띄우지 않는다.** 아래 스크립트의 요약만 읽는다(이벤트를 그대로 띄우면 실행이 길수록 불어남).
- 스크립트는 아래 목록의 규칙대로 계산한다. 출력 줄(`RUN`·`EVENTS`·`BREAKER`·`CONFLICT_CLEARED`·`HASH_OMITTED`·`EXCLUDE_*`·`ISSUE_PENDING`·`WAIT_ANSWER`·`LOST`·`SLOT`·`HASH`)의 뜻은 스크립트 머리에 있다.
```bash
node .claude/skills/dflow-team/scripts/lead-state.mjs --agent '<신원>/<host>/lead' --repo '<MAIN>'
```
- `EVENTS` 의 `bad` > 0 = 깨진 줄을 빼고 셌다는 뜻. 재구성 보고에 "events.jsonl 깨진 줄 <n>" 을 싣는다.
- `HASH_OMITTED` > 0 → `HASH` 에 없는 경로의 해시는 같은 명령에 `--hash '<worktree>'` 를 붙여 따로 읽는다.
- `RUN` 의 `wp`(`team.start` 의 `wp`, 없는 옛 줄은 전체 `-`) = WP 범위.
  - poll 을 다시 띄울 때 `--wp` 에 넘긴다.
  - `wake.mjs`·`tick.mjs` 에도 같은 값을 `--wp` 로 넘긴다(`-` 도 됨. watch 가 「설계 승인」 된 작업(`build`)을 poll 과 같은 범위로 거름).
- `RUN` 의 `scope` = 옛 팀장 기록과의 호환 칸. 계약 2.11 팀장은 `server` 를 적고 이 값을 쓰지 않는다(범위는 작업마다 서버 판단).
- 종료 시각(`<UNTIL>`·`<UNTIL_LABEL>`) = **마지막 `team.extend`** 의 `until`·`until_label`. 없으면 `team.start` 의 `until`(`RUN` 의 `until`·`until_label`).
- `team.spawn` 의 `slot`·`id8`·`worktree`·`handle` 로 슬롯과 작업을 잇는다(`SLOT`. 브랜치 전인 Phase 01 팀원도 id8 을 앎).
- `spawn_kind` = `resolve` 인 줄 = 해소 워커(「5-2. 해소 spawn」, 워크트리 `<MAIN>/.claude/worktrees/dflow-<id8>-resolve`, detached).
  - **해소 워커 판별 = 워크트리 이름 접미사 `-resolve`**(재기록이 `spawn_kind` 를 `readopt` 로 덮음. `merge-conflict.md` 「0」).
  - 결과 처리 = `references/merge-conflict.md` 「4. 해소 결과 처리」 표.
  - 고아 스캔에서는 backends.md 「고아 정리 규칙」 2-1번으로 가른다. "재개 가능" 으로 보내지 않는다.
  - 워커 자동 재시작(H) 대상도 아니다.
- 복원 대상:
  - `team.result`·`team.blocked` 로 이미 판정한 작업.
  - 제외 목록: `skipped` = 일시. `failed`·`failed no-result`·`failed not-isolated`·`failed no-worker-flag`·`failed deps`·`failed not-assignee`·`cancelled`·`blocked` = 영구. `failed rate-limit`·`design_waiting`·`design_review`·`design_reopened` = 제외 없음.
  - 차단기 상태 = 끝에서부터 연속한 `failed…` 수.
    - `failed not-assignee`·`cancelled`·해소 워커의 내용 실패(`references/merge-conflict.md` 「6. 차단기」) = 세지도 끊지도 않고 건너뜀.
    - `team.lost` = `cause` 무관하게 실패 1건으로 셈. 단 `next=wait` 인 `team.lost` 는 세지도 끊지도 않음.
  - 결과 줄 경로별 마지막 처리 해시(경로 = `<worktree>/<TASKS>/<tsk>/.result`).
- 사유가 `선행 미충족(사전 검사:` 로 시작하는 `skipped` = 일시 제외가 아니라 **선행 대기**. 선행 대기 목록은 「2-3」 의 선행 대기 블록 출력으로 복원한다.
- 제외 목록 = id8 마다 마지막 `team.spawn`·`team.blocked`·`team.result` 로 정함.
  - 마지막이 `team.spawn` 이나 `team.blocked` → 진행 중(영구 제외).
  - 마지막이 `team.result` → 위 status 별 제외.
  - `team.answer` 는 제외를 바꾸지 않음.
- **`team.lost`**: id8 의 마지막 이벤트(`team.spawn`·`team.blocked`·`team.result`·`team.lost` 중)가 `team.lost` → 영구 제외(진행 중).
  - 재시작 대기 목록·rate-limit 대기·보류 = `references/restart.md` 「이벤트로 본 상태」 블록으로 복원.
  - 이 블록은 `team.start` 로 자르지 않는다.
- 답 기다리는 질문 = `team.blocked` 중 그 뒤에 같은 id8 의 `team.answer` 가 없는 것(`WAIT_ANSWER`). 그 뒤에 같은 id8 의 결과·spawn·손실이 온 것은 끝난 질문이라 뺀다. 두 백엔드 공통.
- 지시 안 보낸 이슈 = `team.issue` 중 id8 마다 **마지막** 것의 `decision` 이 `pending`(`ISSUE_PENDING`)(「2-4. 팀원 이슈 보고 처리」).
  - 압축 뒤 첫 기상에서 이 목록을 복원해 곧바로 2·3번(판단·추가 지시)을 마무리한다.
  - 사람에게 넘긴 채 잊지 않는다.

**재구성 규칙**
- 살아 있는 팀원의 워크트리 = 그 `.dflow-agent` 슬롯 번호로 슬롯 표에 흡수. 그 안에 `.result` 가 있으면 처리 여부를 해시로 가린 뒤 처리(「3. 결과 처리」).
- 새로 줄 슬롯 번호 = 흡수한 번호를 뺀 1..N 중 가장 작은 것(같은 `AGENT_ID` 를 다시 발급하지 않음).
- "살아 있는 팀원" = spawn 했고 아직 최종 판정(`done`·`needs-merge`·`skipped`·`failed`·`cancelled`·`resolved`·`design_waiting`·`design_review`·`design_reopened`)을 받지 않은 팀원. 화면이 떠 있는지로 판단하지 않는다.
  - Orca = `.dflow-agent` 가 `w<slot>` 인 워크트리 중 최종 status 의 `.result` 가 없는 것.
  - tmux = 위에 더해 정본 표의 생존 칸이 `alive`.
  - `blocked` ≠ 최종 판정. 그 팀원은 두 백엔드 모두 살아 있음.
  - 실제로 죽은 Orca 팀원 = 무응답 규칙(「3. 결과 처리」)이 가려냄.
  - tmux pane 이 죽음(`dead`) → 살아 있지 않음. `.result` 있으면 결과 처리, 없으면 죽은 pane 화면 폴백과 고아 스캔(「3. 결과 처리」).
  - 팀장 세션이 새로 떠도 살아 있는 tmux 팀원은 원래 슬롯 번호로 흡수(tmux 서버는 팀장과 따로 돎).
- 대기 큐는 재구성하지 않는다(다음 poll 이 같은 ready 를 다시 찾음). `blocked` 작업은 대기 큐에 넣지 않는다(그 팀원이 슬롯을 잡은 채 답을 기다림).
- **결과 중복 방지**: 결과 줄 = 그 줄의 해시로 식별.
  - `.result` 경로마다 events.jsonl 의 `team.result`·`team.blocked` 에서 마지막으로 처리한 해시(경로별 마지막 처리 해시)를 유도.
  - 현재 줄의 해시와 비교해 다를 때만 처리.
  - 집계는 order 로 중복을 없앤다.
  - 줄과 해시는 한 번의 Bash 호출로 함께 읽는다.
  ```bash
  l=$(head -n 1 '<경로>'); printf '%s\n' "$l"; printf '%s\n' "$l" | cksum | cut -d' ' -f1
  ```
- **고아 스캔**: 값이 `<신원>/<host>/` 로 시작하는 `.dflow-agent` 워크트리(`parked` 포함) 중 살아 있는 팀원이 없는 것을 **정리 가능·재개 가능·멈춤** 셋으로 가른다. 판정 순서 = 정리 → 재개 → 멈춤. 앞 갈래에 안 걸린 것이 뒤로 간다.
  0. **설계 완료 대기**: `<TASKS>/*/state.json` 이 `phase=wait_pred` → 정리·멈춤으로 보내지 않는다.
     - `references/design-ahead.md` 2번(재개 판정)을 통과할 때만 2번으로 보낸다. 아니면 그대로 둔다(재시작·재개 후보 아님).
     - `phase=wait_review`(설계만·검토 대기)도 재시작·재개 후보 아님.
     - 결과 줄이 없으면 restart.md 「판정」 4-2 대로 `design_review` 로 거둔다.
     - 「설계 승인」 뒤에는 「2-3」 의 `build`(승인된 작업)가 이어 가기를 부른다.
  1. **정리 가능**: backends.md 「고아 정리 규칙」 대로 깨끗하고(미커밋 변경 없음) HEAD = `origin/<그 브랜치>`. 그 규칙대로 지운다.
  2. **재개 가능**: 아래가 모두 참. 「5-1. 재개 spawn」 의 대상. `.dflow-agent` 를 `parked` 로 바꾸지 **않는다**.
     - 브랜치가 `agent/<id8>-…`(id8 을 여기서 얻음). 브랜치가 없으면 claim 전에 죽은 것 → 재개할 산출물 없음.
     - `.result` 가 없거나, 있어도 status 가 최종 판정(`done`·`needs-merge`·`skipped`·`failed`·`cancelled`·`resolved`)이 아님.
       - 최종 판정이 있으면 재개가 아니라 「3. 결과 처리」 의 몫.
       - 단 `RETRY_DUE`(`lead-state.mjs` — fetch·push 실패 뒤 30분)인 `skipped` 는 최종 판정이 아님(12절 Y11). `WARN_RETRY` 면 「멈춤」.
     - 서버 show 가 `status=claimed` 이고 `mine=true` 이며, `claimed_by` 를 소문자로 바꾼 값이 `claude-<host>` 와 같거나 팀원 라벨 `<신원>/<host>/w<슬롯>` 의 가운데 칸이 `<host>`(이 PC 가 claim 함).
       - 계약 2.11 이면 `references/resume.md` 「서버 판단 확인」 도 통과해야 함(`same_host` 는 옛 서버의 대체 판정).
     - 그 id8 의 재개 재시도가 상한(3)에 안 닿음.
     - 그 id8 이 `references/restart.md` 「이벤트로 본 상태」 에서 `PARKED`·`RL_WAIT`·`RL_DUE` 가 아님.
       - `RESTART_DUE` = 이 다섯 조건과의 교집합일 때만 재개 가능(`references/restart.md` 「재투입」 의 재투입 전 확인이 이번 기상의 show 로 판정).
       - 재시작 대기 목록과 id8 으로 합쳐 한 번만 띄운다.
     ```bash
     w='<워크트리>'; id8='<id8>'
     br=$(git -C "$w" branch --show-current)
     (node .claude/skills/dflow-work/scripts/dflow.mjs show "$id8") \
       | jq -c --arg h 'claude-<host>' '.order | {status, mine,
           same_host: (((.claimed_by // "") | ascii_downcase) as $c | $c == $h or (($c | split("/")) as $p | ($p | length) == 3 and $p[1] == ($h | ltrimstr("claude-"))))}'
     jq -r --arg a '<신원>/<host>/lead' --arg r '<MAIN>' --arg i "$id8" \
       'select(.agent == $a and .repo == $r and (.id8 // "") == $i)
        | select(.event == "team.result" or (.event == "team.spawn" and (.spawn_kind // "new") == "resume"))
        | .event' ~/.dflow/events.jsonl 2>/dev/null \
       | awk '/team\.result/{n=0; next} {n++} END{print "tries=" n+0}'
     ```
     - 재시도 수 = 마지막 `team.result` 이후 `spawn_kind == "resume"` 인 `team.spawn` 개수.
     - 새 작업(`new`)과 이어받은 슬롯의 재기록(`readopt`)은 세지 않는다.
     - `team.start` 로 구간을 자르지 않는다.
     - 결과 줄이 하나라도 나오면 `skipped` 여도 수가 0 으로 돌아감 = **의도한 것**(판정을 남긴 작업은 그 status 의 제외 규칙이 다룸).
  3. **멈춤**: 나머지. 자동으로 지우지 않는다.
     - `.dflow-agent` 값을 `<신원>/<host>/parked` 로 바꾼다(「고아 정리 규칙」 3번).
     - **"멈춤" 목록**에 넣는다.
- **"멈춤" 보고**: 아래를 한 표로 낸다.
  - 멈춤으로 분류한 것.
  - 서버에 claimed 인데 이 PC 어디에도 워크트리가 없는 id8(「1. 시작」 3번).
  - 결과가 `failed…` 이거나 무응답 자동 정리로 끝났는데 서버에 claimed 로 남은 작업(「3. 결과 처리」).
  - 칸: id8 · TSK · 워크트리 경로(없으면 `-`) · 브랜치 · 미커밋 파일 수 · 사유 · **재시작 명령**.
  - 사유: `미커밋 보존`·`서버 미claim`·`다른 PC claim`·`재시도 상한`·`워크트리 없음`·`무응답`·`pane 죽음`·`rate-limit 반복`·`rate-limit 대기(<HH:MM>)`·`중단 표식 불일치`·`중단 표식 삭제 실패`·`거두기 실패`·`살아 있는 팀원`·`서버 <status>`·`서버 조회 실패`(`references/restart.md`), 계약 2.11 의 `references/resume.md` 「서버 판단 확인」 사유·`사람 설계 초안 있음`·`fetch·push 3회 연속 실패`·`설계 멈춤 미완료`, 또는 결과 줄의 `failed <사유>`.
  - `failed…` 로 끝난 작업은 자동 재개로 가지 않는다(원인을 사람이 먼저 고친 뒤 `--resume` 이 그 워크트리를 그대로 이어받음).
  - 이 표는 시작 보고와 마감 보고에 모두 낸다.
  - 재시작 명령은 갈래마다 아래 중 하나를 그대로 적는다(사람이 복사해 쓸 수 있게).
    - 팀장에게 맡긴다: `/dflow-team <종료시각> --resume <id8>`
    - 사람이 그 워크트리에서 직접 한다(워크트리가 있을 때):
      ```bash
      printf '%s\n' '<신원>/<host>/w<slot>' > <워크트리>/.dflow-agent   # parked 를 되돌린다
      cd <워크트리> && claude   # 그 세션에서 /dflow-dev <TSK>
      ```
      - `.dflow-agent` 를 먼저 되돌린다(`dflow.mjs heartbeat` 는 값이 `*/parked` 면 exit 2 로 거부).
      - `<slot>` = `.dflow-prompt` 의 `AGENT_ID=` 에 박힌 번호.
- **부트스트랩 실패 정리**(해소 워크트리 `dflow-<id8>-resolve` 는 예외 — 「고아 정리 규칙」 2-1번): `.result` 의 branch 가 `-`(브랜치를 만들기 전에 끝남)이면 backends.md 「고아 정리 규칙」 1번대로 한다.
  - 알려진 부산물만 있을 때만 `--force` 로 정리.
  - 그 밖의 변경이 있으면 보존하고 보고.
- state.json 미러 같은 새 저장소는 만들지 않는다.

## 두 번째 팀장 (링크드 워크트리)

같은 리포에서 **다른 신원(다른 PAT)** 의 팀장을 하나 더 돌릴 때는 리포를 다시 clone 하지 않고 링크드 워크트리를 쓴다(`scripts/lead-worktree.mjs`).
- 절차: `references/second-lead.md`.
- 같은 신원으로는 띄울 수 없다(`SAME_IDENTITY_LEAD`).

## 0. 환경 감지 (시작 맨 처음)

백엔드는 Orca 를 **먼저** 보고, Orca 안이 아니면 tmux 를 본다. `TMUX` 환경변수는 감지에 쓰지 않는다(전용 소켓을 쓰고, Orca 안에서도 채워짐).

| 순위 | 조건 | 백엔드 |
|---|---|---|
| 1 | `TERM_PROGRAM` 이 `Orca` 이거나 `ORCA_WORKTREE_ID` 가 비어 있지 않다 | **pane(Orca)** |
| 2 | Orca 밖이고 `find_tmux`(backends.md 「진짜 tmux 찾기」)가 진짜 tmux 절대경로를 돌려준다 | pane(tmux) |
| 3 | 그 밖 | `FAIL NO_TMUX` 로 중단하고 설치를 안내한다 |

- 감지는 「1. 시작」 전제 검사 블록 안에서 한 번에 한다. 그 블록이 `BACKEND`(`tmux` 또는 `orca`)와 `TM`(진짜 tmux 절대경로. Orca 백엔드면 빈 값)을 출력한다.
- 백엔드 이름은 시작 보고와 `team.start` 에 남긴다.
- 3번 갈래에서만 시작하지 않는다.

**플랫폼**: 이 문서의 셸 블록은 node 로 macOS·Linux·Windows 에서 같은 절차로 돈다.
- Windows 에서만 다른 것(호스트 이름·팀장 세션 PID·심링크·tmux 설치)은 블록 안에서 `uname -s` 로 가른다(`MINGW*|MSYS*|CYGWIN*`).
- 차이 목록: backends.md 「플랫폼 차이」.
- WSL = Linux.
## 1. 시작

- `<기본브랜치>` = 개발 브랜치 = `dflow.mjs branch dev` 값(`.dflow.local` 의 `dev_branch`, legacy 는 `origin/HEAD`)
- `<TASKS>` = `<DOCS_DIR>/tasks` (리포 최상위 기준)
- 주문 폴더 `<TASKS>/<TSK>` = `dflow.mjs taskdir <ref>` 값
  - `.dflow.local` 의 `project_map` 에서 주문의 프로젝트 키 사용, 없으면 `docs`
- 작업 여럿 훑을 때 `dflow.mjs config tasks-dirs` 가 내는 폴더 전부 확인
- `<DOCS_DIR>` 를 `docs` 로 박은 고정 경로 금지

1. **전제 검사**: 아래 블록 하나를 Bash 호출 한 번으로 실행
   - 실패 항목 전부 `FAIL …` 출력 후 0 아닌 값으로 종료
   - **exit ≠ 0 이면 아무것도 띄우지 않고 중단·보고**
   - `<UNTIL>` = 「인자」 에서 정규화한 종료 시각, `<TAKEOVER>` = 「인자」 강제 인수
   ```bash
   fail=0; bad() { echo "FAIL $*"; fail=1; }
   MAIN=$(git rev-parse --show-toplevel); [ -z "$(git rev-parse --show-prefix)" ] || bad NOT_REPO_ROOT
   case "$MAIN" in *' '*) bad SPACE_IN_PATH ;; esac
   if [ -f .claude/skills/dflow-team/scripts/gradle-check.mjs ]; then   # Gradle 권장 설정 — 경고만, 시작은 막지 않는다
     node .claude/skills/dflow-team/scripts/gradle-check.mjs "$MAIN" 2>/dev/null | while IFS= read -r gline; do
       case "$gline" in
         "NOFILE "*) echo "WARN GRADLE_TUNING ${gline#NOFILE } (gradle.properties 없음)" ;;
         "MISSING "*) grest=${gline#MISSING }; echo "WARN GRADLE_TUNING ${grest% *} ${grest##* }" ;;
       esac
     done
   fi
   base=$(node .claude/skills/dflow-work/scripts/dflow.mjs branch dev) || bad CONFIG
   [ -n "$base" ] || bad NO_DEFAULT_BRANCH
   [ -z "$base" ] || git rev-parse -q --verify "refs/remotes/origin/$base" >/dev/null || node .claude/skills/dflow-work/scripts/dflow.mjs branch ensure-dev >/dev/null || bad "NO_REMOTE_DEV_BRANCH $base"
   cur=$(git branch --show-current)   # detached HEAD 면 빈 값
   [ -n "$base" ] && [ -n "$cur" ] && [ "$cur" != "$base" ] && bad "NOT_DEFAULT_BRANCH $base 또는 detached HEAD 여야 한다"
   for s in dflow-dev dflow-work dflow-poll dflow-merge dflow-team; do [ -e ".claude/skills/$s/SKILL.md" ] || bad "NO_SKILL $s"; done
   grep -q '^<!-- dflow-caps: worker ' .claude/skills/dflow-dev/SKILL.md || bad OLD_DFLOW_DEV
   grep -q '^<!-- dflow-caps: remote-candidates ' .claude/skills/dflow-merge/SKILL.md || bad OLD_DFLOW_MERGE
   node .claude/skills/dflow-work/scripts/dflow.mjs config --source >/dev/null || bad "CONFIG .dflow·.dflow.local 을 확인하라(위 사유 코드)"
   [ -n "$(node .claude/skills/dflow-work/scripts/dflow.mjs config projects)" ] || bad "NO_PROJECT .dflow 의 project_id 또는 .dflow.local 의 project_map 을 넣어라"
   node .claude/skills/dflow-work/scripts/dflow.mjs doctor   # 진단 출력용. 종료 코드로 판정하지 않는다
   email=$(node .claude/skills/dflow-work/scripts/dflow.mjs me | jq -r '.user_email // empty')
   [ -n "$email" ] || bad AUTH
   who=$(printf '%s' "$email" | cut -d@ -f1 | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9-]/-/g')
   host=$(hostname | cut -d. -f1 | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9-]/-/g')
   echo "user_email=$email lead=$who/$host/lead"
   legacy=$(node .claude/skills/dflow-work/scripts/dflow.mjs config tasks-dirs | while IFS= read -r d; do find "$(git rev-parse --show-toplevel)/$d" -mindepth 2 -maxdepth 2 -name state.json 2>/dev/null; done | while IFS= read -r f; do
     jq -e '.phase == "reported" and ((.api_base // "") == "")' "$f" >/dev/null 2>&1 && printf '%s ' "$f"
   done)
   [ -z "$legacy" ] || bad "LEGACY_REPORTED $legacy"
   mkdir -p ~/.dflow
   ex=$(git rev-parse --git-path info/exclude); mkdir -p "$(dirname "$ex")"; touch "$ex"
   for p in '**/.claude/worktrees/' '/dflow-*/' '.vitest/' '/.dflow-agent' '/.dflow-prompt' '/.dflow-pane' '/.dflow-run' '/.dflow.local' '**/tasks/*/.result' '**/tasks/*/.issues' '**/tasks/*/decisions.json' '/docs/dflow-team/'; do
     grep -qxF "$p" "$ex" || printf '%s\n' "$p" >> "$ex"
   done
   tracked=$(git ls-files .claude/skills/dflow-dev | head -n 1)   # 비어 있지 않으면 킷 복사형(dflow 스킬이 git 추적됨)
   if [ -z "$tracked" ]; then   # 심링크형 — 일반 스킬을 추적하는 리포면 dflow-* 링크만 가린다
     if [ -n "$(git ls-files .claude/skills | head -n 1)" ]; then sp='/.claude/skills/dflow-*'; else sp='/.claude/skills'; fi
     grep -qxF "$sp" "$ex" || printf '%s\n' "$sp" >> "$ex"
   fi
   if [ -n "$tracked" ] && [ -n "$base" ]; then
     if git fetch -q origin; then
       git show "origin/$base:.claude/skills/dflow-dev/SKILL.md" 2>/dev/null | grep -qE '^<!-- dflow-caps: worker |--worker' || bad "KIT_NOT_PUSHED dflow-dev"
       git show "origin/$base:.claude/skills/dflow-merge/SKILL.md" 2>/dev/null | grep -qE '^<!-- dflow-caps: remote-candidates |origin/agent/\*' || bad "KIT_NOT_PUSHED dflow-merge"
     else
       bad "KIT_NOT_PUSHED fetch 실패"
     fi
   fi
   [ -z "$(git status --porcelain)" ] || bad DIRTY
   UNTIL='<UNTIL>'   # HH:MM · YYYY-MM-DD HH:MM · none
   if [ "$UNTIL" != none ]; then
     case "$UNTIL" in ??:??) u="$(date +%Y-%m-%d) $UNTIL" ;; *) u="$UNTIL" ;; esac
     ue=$(date -j -f '%Y-%m-%d %H:%M:%S' "$u:00" +%s 2>/dev/null || date -d "$u" +%s 2>/dev/null)
     if [ -z "$ue" ]; then bad "UNTIL_BAD $UNTIL"
     elif [ "$ue" -le "$(date +%s)" ]; then bad "UNTIL_PAST $UNTIL 는 이미 지났다"
     elif [ "$ue" -gt $(( $(date +%s) + 7 * 86400 )) ]; then bad "UNTIL_TOO_FAR 7일을 넘는다. 더 길게는 '종료 요청 전까지'로 시작하라"
     fi
   fi
   find_tmux() {
     for c in /opt/homebrew/bin/tmux /usr/local/bin/tmux /usr/bin/tmux "$(command -v tmux 2>/dev/null)"; do
       [ -n "$c" ] && [ -x "$c" ] || continue
       grep -q 'agent-teams-tmux' "$c" 2>/dev/null && continue
       "$c" -L "dflowprobe$$" has-session -t __probe__ 2>&1 | grep -qi 'unsupported command' && continue
       printf '%s\n' "$c"; return 0
     done
     return 1
   }
   TM=
   if [ "${TERM_PROGRAM-}" = Orca ] || [ -n "${ORCA_WORKTREE_ID-}" ]; then
     BACKEND=orca
     { orca terminal create --help | grep -q -- '--worktree' && orca terminal create --help | grep -q -- '--command'; } || bad ORCA_OLD
     command -v claude >/dev/null 2>&1 || bad NO_CLAUDE_CLI
   elif TM=$(find_tmux); then
     BACKEND=tmux
     command -v claude >/dev/null 2>&1 || bad NO_CLAUDE_CLI
   else
     TM=
     BACKEND=-
     bad "NO_TMUX tmux 를 설치하라(macOS: brew install tmux · Debian/Ubuntu: apt install tmux · Windows: MSYS2 또는 WSL)"
   fi
   LEAD_PID=${CLAUDE_PID:-$PPID}   # 팀장 세션 프로세스. Bash 도구가 내보내는 CLAUDE_PID, 없으면 $PPID
   case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) [ -n "${CLAUDE_PID:-}" ] || bad "NO_CLAUDE_PID Windows 의 \$PPID 는 1 이라 팀장 세션을 가려내지 못한다" ;; esac
   stale() {   # $1: 잠금 디렉터리. beat 있으면 70분, 없으면 디렉터리 수정 시각 10분으로 죽음을 본다
     b=$(cat "$1/beat" 2>/dev/null || true)
     if [ -n "$b" ]; then [ $(( $(date +%s) - b )) -ge 4200 ]
     else [ -n "$(find "$1" -maxdepth 0 -mmin +10 2>/dev/null)" ]; fi
   }
   # 같은 리포의 다른 워크트리에서 같은 신원의 팀장이 살아 있으면 거부한다
   dup=$(git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r w; do
     [ "$w" = "$MAIN" ] && continue
     l=$(git -C "$w" rev-parse --path-format=absolute --git-path dflow-team.lock 2>/dev/null) || continue
     [ -d "$l" ] || continue
     [ "$(cut -d' ' -f1 "$l/owner" 2>/dev/null)" = "$who/$host/lead" ] || continue
     stale "$l" || printf '%s ' "$w"
   done)
   [ -z "$dup" ] || bad "SAME_IDENTITY_LEAD $dup"
   [ "$fail" = 0 ] || exit 1
   # 팀장 잠금: 나머지 검사가 모두 통과한 뒤 마지막에 원자 획득한다
   LOCK=$(git rev-parse --git-path dflow-team.lock)
   if ! mkdir "$LOCK" 2>/dev/null; then
     stale "$LOCK" || { echo "LOCKED $LOCK owner=$(cat "$LOCK/owner" 2>/dev/null) beat=$(cat "$LOCK/beat" 2>/dev/null || echo 없음)"; exit 1; }
     T="$LOCK.stale.$$"
     mv "$LOCK" "$T" 2>/dev/null || { echo "LOCKED $LOCK"; exit 1; }
     stale "$T" || { echo "LOCKED $LOCK 옮긴 잠금이 새롭다. 다른 팀장이 방금 가져간 것이므로 $T 를 $LOCK 로 되돌려라"; exit 1; }
     rm -rf "$T"
     mkdir "$LOCK" 2>/dev/null || { echo "LOCKED $LOCK"; exit 1; }
     echo "STALE_LOCK_TAKEN"
   fi
   # owner = <신원>/<host>/lead <시작 epoch> <팀장 세션 PID>. 방금 만든 잠금이라 쓰기에 실패하면 지우고 끝낸다
   { printf '%s %s %s\n' "$who/$host/lead" "$(date +%s)" "$LEAD_PID" > "$LOCK/owner" && date +%s > "$LOCK/beat"; } \
     || { rm -rf "$LOCK"; echo "FAIL LOCK_WRITE $LOCK"; exit 1; }
   rm -f "$(git rev-parse --git-path dflow-team.stop)"   # 지난 실행이 남긴 종료 요청을 지운다
   rm -f "$(git rev-parse --git-path dflow-team.lease-lost)"   # 지난 실행이 남긴 lease 상실 표식을 지운다
   TAKEOVER='<TAKEOVER>'   # --takeover 또는 빈 값(「인자」 강제 인수)
   if [ "$TAKEOVER" = --takeover ]; then lr=$(node .claude/skills/dflow-work/scripts/dflow.mjs lease acquire --takeover)
   else lr=$(node .claude/skills/dflow-work/scripts/dflow.mjs lease acquire); fi
   lrc=$?
   printf '%s\n' "$lr"
   [ "$lrc" = 0 ] || { rm -rf "$LOCK"; echo "FAIL LEASE rc=$lrc"; exit 1; }
   echo "PRECHECK_OK lead_pid=$LEAD_PID BACKEND=$BACKEND TM=$TM"
   ```
   - `PRECHECK_OK` 없으면(`FAIL …`·`LOCKED`·lease 거부) `references/precheck.md` 를 `cat` 으로 읽고 해당 코드 처리대로 보고
   - 질문 없이 중단(AskUserQuestion 금지)
   - **잠금 소유 판정**: `owner` 신원 = 자기 `<신원>/<host>/lead` 이고 PID = 현재 `$LEAD_PID`(`CLAUDE_PID`, 없으면 `$PPID`)
     - 매 기상(`wake.mjs`)과 「7. 마감」 은 이 판정으로 소유 확인 뒤에만 `beat` 갱신·잠금 삭제
     - 생존(다른 팀장이 가져가도 되는지) = PID 아닌 `beat` 로 판정(70분, 없으면 잠금 디렉터리 수정 시각 10분)
   - **팀장 lease**: 로컬 잠금 잡은 **뒤** 획득
     - `LEASE_OK <n>` 이면 계속
     - 그 밖(`LEAD_LEASE_HELD`·exit 2·3·5·6·7)이면 블록이 잠금 삭제 후 멈춤(fail-closed, 처리 문구는 precheck.md)
2. **담당 작업 폴더 scaffold**: 팀장 체크아웃(개발 브랜치)에서 `node .claude/skills/dflow-work/scripts/dflow.mjs scaffold` 한 번 호출
   - 출력 한 줄(`scaffold created=N skipped=N no_ref=N`)을 시작 보고에 포함
   - **개발 브랜치 위일 때만 호출**(detached HEAD 는 커밋 못 해 트리가 더러워짐)
   - **호출 전에 개발 브랜치 fast-forward**
   - fast-forward 실패 시 scaffold 건너뜀(뒤처진 dev 에서 커밋하면 push 거부돼 로컬·원격 dev 가 갈라짐)
   - 아래 블록 하나로 판정·호출(1번 변수는 남아 있지 않음):
   ```bash
   dev=$(node .claude/skills/dflow-work/scripts/dflow.mjs branch dev); cur=$(git branch --show-current)
   if [ -n "$dev" ] && [ "$cur" = "$dev" ]; then
     if git pull -q --ff-only origin "$dev"; then
       node .claude/skills/dflow-work/scripts/dflow.mjs scaffold || echo "scaffold 경고: exit $?"
     else
       echo "scaffold 건너뜀(개발 브랜치 fast-forward 실패)"
     fi
   else
     echo "scaffold 건너뜀(detached HEAD 또는 개발 브랜치 아님)"
   fi
   ```
   - 실패(exit≠0)는 경고만 하고 계속(편의 기능, gate 아님)
   - **그래도 push 실패가 보고되면** 다음 승인 스윕 전에 사람이 `git pull --rebase origin <기본브랜치>` 로 직접 되돌림
3. **재구성**: 새 `team.start` 쓰기 **전에** 「팀장 상태」 의 재구성과 고아 스캔 수행
   - 목적: "마지막 `team.start` 이후" 필터가 이전 세션 이벤트를 가리지 않게 함
   - 이 단계 = 재기동 절차
   - 이어서 서버에 claimed 인데 흡수한 슬롯·고아 워크트리·답 기다리는 `blocked`·대기 중인 답 어디에도 없는 id8 → **"멈춤" 표(사유 `워크트리 없음`)** 에 넣고 영구 제외
   - 자동 재착수 안 함: 이 PC 에 워크트리가 없으면 다른 PC·수동 세션에서 도는 것과 구분 불가, `show` 는 생존 신호 안 줌
   - 사람이 `--resume <id8>` 로 지목할 때만 이어받음(「5-1. 재개 spawn」)
   - **워크트리가 이 PC 에 남은 갈래는 이 조항이 아니라 「팀장 상태」 고아 스캔의 "재개 가능" 이 맡아 자동으로 이어받음**
   ```bash
   (node .claude/skills/dflow-work/scripts/dflow.mjs list --scope claimed) | awk -F'\t' 'NF>=4 && $2=="CL" {print $4}'
   ```
   - 상태 열 `CL` 행만 센다(`--scope claimed` 는 승인 대기 `RP` 행도 반환)
   - 계약 2.11 이면 목록의 id8 마다 `references/resume.md` 「서버 판단 확인」 실행 → 사유는 그 표의 것으로 기록
   - 그 표가 띄우라고 가르는 것 = 「설계 승인」 된 작업(`action=build`)뿐
     - 멈춤 아닌 재개 대상으로 넘김(「5-1」 이 원격 agent 브랜치에서 워크트리 생성, 설계 상태 스펙 12절 Y3 이 여는 유일한 새 길)
4. **시작 보고**: 아래 순서로 낸다
   - 첫 줄: 정규화한 종료 시각
   - 다음 줄: `키: <이름> (<email>, <prefix>)` (토큰이 하나여도 적음, 값 = 「인자」 키 판정의 `selected` 행)
   - 3번의 **"멈춤" 표**(「팀장 상태」)
   - 재개 가능 분류분과 `--resume` 지목분: "이번에 이어받습니다" 한 줄
   - 2번의 scaffold 출력 한 줄(호출했으면 `scaffold created=N skipped=N no_ref=N`, 건너뛰었으면 "scaffold 건너뜀(detached HEAD 또는 개발 브랜치 아님)")
   - 1번 전제 검사가 `WARN GRADLE_TUNING …` 을 냈으면 그 줄들(시작은 안 막음, 처리는 precheck.md)
   - WP 범위 있으면 한 줄: "새 배정과 「설계 승인」 된 작업의 구현은 <WP 목록> 만 합니다. 그 밖의 재개와 승인 스윕은 범위와 무관합니다."
   - 백엔드 무관하게: "팀원은 **권한 확인 생략 모드로** 돕니다. 팀장 세션의 권한 모드와 무관합니다."
   - tmux 백엔드면 한 줄 추가: "화면은 `TMUX= tmux -L dflow attach` 로 볼 수 있습니다." (`TMUX=` = 팀장이 tmux 안일 때 중첩 attach 거부 회피)
   - `AUTOMERGE_ON` 이면(「인자」 자동 머지) 한 줄: "자동 머지: 켜짐. 완료 보고된 작업은 승인 전에 main 에 머지하고, 승인은 사후에 확인합니다." 꺼져 있으면 알리지 않음
5. `team.start`(backend, slots, until, wp, scope) 기록
   - `until` = `<UNTIL>`
   - `wp` = 정규화한 WP 범위를 쉼표로 이은 값, 없으면 `-`
   - `scope` = 늘 `server` (설계 방식은 작업마다 서버 판단 — 「인자」)
   - 3번에서 이어받은 것은 `team.start` 바로 뒤에 같은 필드로 다시 기록
     - 흡수한 슬롯마다 `team.spawn`(`spawn_kind` = `readopt`, 원래 종류는 `orig_kind` 필드, `references/events.md`)
     - 답 기다리는 `blocked` 마다 `team.blocked`
     - 흡수한 슬롯의 마지막 처리 해시마다 `team.result` 또는 `team.blocked`
   - 다시 기록 안 하면 이어받은 팀원이 죽은 것으로 보이고 같은 결과가 재처리됨(재구성은 새 `team.start` 이후만 읽음)
   - 이어서 **승인 스윕**(「4. 승인 스윕」) 한 번 실행, 결과(머지됨·대기·반려·건너뜀)를 한 줄씩 보고
     - 사전 검사 없이 늘 호출(「4-0」 의 예외)
   - 스윕 뒤 빈 슬롯이 있으면 재개 대상 spawn(「5-1. 재개 spawn」)
6. **감시 시작**: 「2-2」 대로 감시 루프를 `--new-tick` 으로 띄움(다음 TICK = 지금+1800초)
   - 재기동 조건 맞으면 poll.mjs 도 띄움(「2-1」)
   - 둘 다 Bash `run_in_background` 로 띄움. 셸 `&` 금지(종료 알림이 세션에 안 와 루프가 소리 없이 끊김)
   - 이어서 좌석표에 감시 시작 알림. STANDBY 는 마지막 신호 뒤 70분에 꺼지므로 시작과 매 기상마다 전송
   ```bash
   LOCK=$(git rev-parse --git-path dflow-team.lock); lead=$(cut -d' ' -f1 "$LOCK/owner")
   node .claude/skills/dflow-work/scripts/dflow.mjs watch --agent "$lead" \
     --slots <N> --busy <M> --until '<UNTIL_LABEL>' --json || :
   ```
   **절전 방지**: `<UNTIL>` 이 오늘이 아니거나 `none` 이고 `uname -s` = `Darwin` 이면 이어서 아래를 Bash `run_in_background` 로 띄움
   - `-w` = 팀장 세션 프로세스가 끝나면 함께 끝남. 「7. 마감」(closing.md 6번)이 거둠
   ```bash
   caffeinate -i -w <LEAD_PID>
   ```
   - `-i` = 시스템 유휴 절전만 막음
   - 시작 보고에 "전원을 연결하고 뚜껑을 연 채로 두라" 기재
   - Linux 서버·Windows 에서는 안 띄움

   **lease 갱신**: 이어서 아래를 Bash `run_in_background` 로 띄움(모든 OS)
   - 60초마다 lease 갱신
   - 팀장 세션이 끝나면 lease 바로 반납 후 종료
   - lease 를 잃으면 표식 파일에 사유 쓰고 종료. 감시 루프가 이를 보고 `LEASE_LOST` 로 깨움
   - `<lease-lost 절대경로>` = `git rev-parse --path-format=absolute --git-path dflow-team.lease-lost` 값을 **리터럴로** 박음
   ```bash
   node .claude/skills/dflow-work/scripts/dflow.mjs lease keep --pid <LEAD_PID> --lost-file '<lease-lost 절대경로>'
   ```
   - 첫 watch 응답에도 `resume_requests` 가 실려 옴
     - 「2-3」 처리 규칙대로 읽고, `host` 가 이 PC 인 요청은 5번에서 못 띄운 재개 대상에 더해 지금 띄움(첫 `TICK` 까지 방치 금지)
   - `<N>` = 「인자」 에서 정한 인원, `<M>` = 지금 슬롯 표의 찬 슬롯 수, `<UNTIL_LABEL>` = 「인자」 의 표시 문자열
   - `--project` 는 넘기지 않음(`dflow.mjs watch` 가 설정의 `project_id` 사용, `${V:+--project "$V"}` 꼴은 zsh 에서 깨짐)
   - 신원은 방금 쓴 잠금 `owner` 에서 읽음(1번 env 는 남아 있지 않음)

## 2. 기상과 감시

팀장은 포그라운드 대기 금지. 팀장을 깨우는 것 넷:
- poll.mjs 종료 (새 작업·시한·오류)
- 감시 루프 종료 (팀원 결과·팀원 pane 종료·`TICK`·`STALE`·`STOP_REQUESTED`)
- 사람이 이 세션에 주는 답 (종료 요청 포함)
- 팀원의 cross-session 메시지 (SendMessage 이슈 보고, 「2-4. 팀원 이슈 보고 처리」)

팀원은 결과 줄을 알리지 않음. 이슈가 생기면 SendMessage 로 이 세션을 직접 깨울 수 있음.

### 2-1. poll

작업 폴더 없는 빈 디렉터리를 cwd 로 두고 띄운다.
```bash
mkdir -p "$(git rev-parse --git-path dflow-team-poll)"
POLL_DIR=$(cd "$(git rev-parse --git-path dflow-team-poll)" && pwd)
( cd "$POLL_DIR" && DFLOW_CONFIG_DIR="<MAIN>" DFLOW_WATCH=0 \
    "<MAIN>/node .claude/skills/dflow-poll/scripts/poll.mjs" --require-tag agent --lead --until '<UNTIL>' --interval 180 --recheck-cycles 10 \
    --wait-cycles 40 [--wp <WP-02,dict/WP-03>] [--exclude <id8,id8>] [--exclude-temp <id8,id8>] [--exclude-wait <id8,id8>] )
```
대괄호 = 선택 플래그 표기. 실제 명령에는 쓰지 않음. `<MAIN>` 경로는 따옴표로 감쌈 (공백 있으면 poll 이 곧바로 죽음).
- 빈 디렉터리가 cwd 라 poll exit 9·10 (승인·반려 감지)은 팀장에게 안 옴. 팀장은 기상마다 승인 스윕 판정 (「4-0」).
- `DFLOW_CONFIG_DIR` = 설정 위치 (poll cwd 는 작업 트리 밖. 레거시 리포는 `<MAIN>/.env` 읽음). `git rev-parse
  --git-path` 가 상대경로를 줄 수 있어 `cd … && pwd` 로 절대경로 생성.
- `DFLOW_WATCH=0`: 팀장이 자기 식별자로 watch 를 보내므로 poll.mjs watch 는 끔.
- `--exclude` = **영구 제외 ∪ 현재 슬롯 id8**. 슬롯 id8 은 재구성으로 복원 (claim 전 ready 를 poll 이 즉시 다시 찾지 않게).
- `--exclude-temp` = 일시 제외 목록. `--exclude-wait` = 선행 대기 목록 (「2-3」 선행 대기 블록 출력의 id8).
- 한 id8 은 둘 중 한쪽에만 넣음.
- 목록 = 공백 없는 쉼표 구분. **목록이 비면 그 플래그 자체 생략.** 빈 값을 넘기면 poll.mjs 가 다음 플래그를 값으로 삼켜 사용법 오류로 끝남.
- `--wp` = WP 범위 (`team.start` 의 `wp`), 공백 없는 쉼표 구분. 범위가 전체 (`-`)면 플래그 생략.
- poll.mjs 가 형식 (`WP-<숫자>` 또는 `<모듈>/WP-<숫자>`) 검사, 틀리면 exit 2. 번호 앞 0 은 무시.
- `--lead` (계약 2.11): 서버가 `mine` 을 팀장 기준으로 계산. 새 서버면 ready 줄에 넷째 칸 `action` 이 붙음.
- 새 서버면 `action` 이 `full`·`design`·`build` 이고 `mine` 인 것만 옴 (12절 Y4). 옛 서버는 종전과 같음.
- 대기 큐는 `--exclude` 에 넣지 않음 (압축으로 대기 큐를 잃으면 그 작업들이 보이지 않는 제외에 갇힘).

**재기동 조건**: 아래 넷 모두 만족할 때만 띄운다.
- 빈 슬롯 있음
- 대기 큐 빔
- 차단기 풀림
- rate-limit 보류 없음 (`references/restart.md` 「이벤트로 본 상태」)

poll 은 기동 즉시 첫 조회를 하므로, 줄 수 없을 때 띄우면 공회전.
예외 하나: 차단기가 걸린 `TICK` 에 대기 큐가 비어 시험 spawn 후보가 없으면 poll 을 한 번 띄움.
그 poll exit 0 에서는 1건만 시험 spawn, 나머지는 대기 큐.
poll 이 안 떠 있는 구간이 있으므로, 팀장은 기상마다 시각을 보고 종료 시각이 지났으면 poll exit 8 과 같이 처리.

일시 제외는 poll.mjs 가 10주기 (30분) 뒤 스스로 풀어 재발견 유도. 팀장은 해제 시각을 따로 관리하지 않음.
- 풀린 id8 이 다시 발견되면 착수 판정을 다시 하고, 여전히 막히면 다시 일시 제외.
- poll exit 0 재대조는 일시 제외 목록을 보지 않음 (「2-3」 표).
- poll 을 다른 이유로 재기동하면 10주기 계산이 처음부터 다시 시작 (재검사만 늦어짐, 틀린 착수 없음).
- 선행 대기는 poll.mjs 가 40주기 (2시간) 뒤 풀고, 선행 대기 블록도 기록 시각 2시간 지난 것을 뺌. 먼저 닿는 쪽이 품.

### 2-2. 감시 루프

감시 루프 = `scripts/tick.mjs`. 루프를 손으로 쓰지 않음. 아래 한 줄을 Bash `run_in_background` 로 띄움 (셸 `&` 금지).
대괄호 = 선택 플래그 표기.
```bash
node .claude/skills/dflow-team/scripts/tick.mjs [--new-tick] [--may-skip] [--until '<UNTIL>'] [--wp <WP-02,dict/WP-03>] --tm '<진짜 tmux 절대경로 또는 빈 값>' \
  --owner '<신원>/<host>/lead' --slots <N> --until-label '<UNTIL_LABEL>' --pid "${CLAUDE_PID:-$PPID}" \
  -- '<워크트리1>/<TASKS>/<TSK1>/.result|<해시1>|<pane1>' '<워크트리2>/<TASKS>/<TSK2>/.result|-|-'
```
- `--` 뒤: 진행 중 슬롯 (`blocked` 포함)마다 `'<.result 경로>|<마지막 처리 해시 또는 ->|<pane id 또는 ->'`.
  - pane id = tmux 팀원의 `.dflow-pane` 첫 줄. Orca 는 `-`.
  - 슬롯 없으면 비움. 공백·작은따옴표 든 경로 미지원.
- `--tm` = 전제 검사의 `TM` 을 **리터럴 절대경로**로. Orca 면 `''` (별도 셸이라 변수를 못 물려받고 PATH 에 Orca shim 이 있을 수 있음).
- 세대·종료·lease 상실 파일 경로는 스크립트가 git 에 물음.
- `--new-tick` = 시작과 `TICK` 기상 때만 (다음 TICK = 지금+1800초). 그 밖의 교체는 세대 파일 값을 그대로 써서 TICK 이 안 밀림.
- `--until` = `<UNTIL>` ≠ `none` 일 때만.
- 교체는 TaskStop 이 아니라 세대 파일 `$(git rev-parse --git-path dflow-team.gen)` (`<세대> <다음 TICK epoch 초> <건너뛴 TICK 수>`)로.
  - 기동하면 세대가 오르고 옛 루프는 `STALE` 로 끝남 (압축으로 태스크 id 를 잃어도 안 겹침).
  - 새 루프 없이 끝내기만 할 때 (「7. 마감」)는 `tick.mjs --retire`.
- 새로 띄우는 때: 진행 중 슬롯의 경로·처리 해시·pane id 집합이 바뀔 때, 루프가 끝나 있을 때.
- 압축 뒤 떠 있는지 모르면 새로 띄움.
- 루프는 기동 즉시 전수 검사 후 20초 간격으로 봄 (교체 사이에 온 `.result` 를 놓치지 않음).

출력 **마지막 줄** = 기상 사유. 위에서부터 먼저 걸린 하나.

| 마지막 줄 | 뜻 |
|---|---|
| `STALE` | 세대 바뀜 (새 루프가 떴거나 `--retire`) |
| `STOP_REQUESTED` | 종료 파일 생김 (「인자」 종료 요청). 결과보다 먼저 봄 (멈추라고 한 뒤 새 결과로 spawn 을 잇지 않음. 결과 줄은 마감에서 처리) |
| `LEASE_LOST <사유>` | lease 상실 표식 (`dflow-team.lease-lost`). 종료 요청 다음, 결과보다 먼저 봄 |
| `RESULT_READY <경로…>` | 결과 줄 해시 ≠ 넘겨받은 해시. **줄 전체를 비교** (status 만 보면 답 받은 팀원이 다시 `blocked` 가 돼도 안 깨움) |
| `PANE_DEAD <경로…>` | tmux 팀원 pane 이 새 결과 줄 없이 죽었거나 사라짐. 결과 줄이 새로 있으면 `RESULT_READY` 가 먼저 |
| `TICK` | 다음 TICK 시각 지남 (한가해도 승인 스윕 판정 「4-0」 과 무응답 점검을 함) |

**변화 없는 TICK 건너뛰기** (`--may-skip`): TICK 시각에 아래가 모두 참이면 TICK 을 내지 않고 **한 번만** 건너뜀.
- 건너뛸 때 `TICK_SKIPPED at=<epoch> next=<epoch>` 줄을 남기고 계속함.
- 건너뛴 다음 TICK 은 반드시 냄 (건너뛴 수는 세대 파일에 남아 루프를 바꿔도 이어지고 `--new-tick` 이 0 으로 되돌림).
- 그래서 팀장 기상 간격은 최대 60분.

조건 (모두 참):
- 진행 중 슬롯 (결과 줄이 `blocked` 인 것 제외)마다 생존 증거 (「3」 의 셋과 heartbeat)가 루프를 띄운 때와 달라졌고 서버 status 는 그대로.
  - 한 슬롯이라도 증거가 그대로면 (팀원 무응답 30분) 깨움. 재지 못해도 깨움.
- 승인 후보 (`sweep-check.mjs`)와 그 서버 status 가 그대로 (사람의 승인·반려는 깨움). 판정 불가면 깨움.
- 종료 시각이 안 지남 (poll 이 안 떠 있을 때의 종료 시각 확인). 형식을 못 읽으면 깨움.
- `scripts/wake.mjs` (「2-3」)가 `LOCK_OK` 를 냈고, 재개 요청 조회가 성공했으며, 이 리포의 요청이 없음.
  - `LOCK_LOST`·`WATCH_FAILED`·`HOLDER_FAILED`·`LEASE_KEEP_DEAD` 면 깨움.
  - 건너뛸 때도 이 호출이 잠금 `beat` 와 좌석표 STANDBY 를 갱신 (대가: 루프를 띄운 뒤 멈춘 팀장은 한 TICK (30분) 늦게 드러남).

건너뛸 때는 진행 슬롯마다 `EVIDENCE <id8> ct=<…> report=<…> heartbeat=<…> phase=<…> dirty=<…> status=<…>` 줄도 남김.
다음 TICK 에서 이 값 = 그 슬롯의 "직전 TICK" 증거 (「3」 생존 증거).

`--may-skip` 은 TICK 이 시각으로 할 일이 없을 때만 붙임. 아래 중 하나라도 있으면 안 붙임.
- 차단기 걸림 (TICK 마다 시험 spawn 1건).
- 재시작 대기·rate-limit 대기 있음 (`references/restart.md` 「이벤트로 본 상태」 의 `RESTART_DUE`·`RL_WAIT`·`RL_DUE`).
- 빈 슬롯이 있는데 못 띄운 후보 (대기 큐·재개 대상·해소 큐. 입장 제어로 미룬 것 포함)가 남음.
- 「7. 마감」 에 들어섬 (마감의 기다림 = `TICK` 두 번).

### 2-3. 기상마다 하는 일

모든 기상은 먼저 아래 한 줄 (`scripts/wake.mjs`, 기상 블록)을 돈다. 스크립트 동작:
잠금 소유 확인 → 소유가 맞을 때만 `beat` 갱신, 좌석표에도 같은 신호 (watch) 전송 → lease 갱신 상태 보고 → 마지막으로 `references/events.md` 「기록 명령」 절과 압축 뒤 재독 명령 (`COMPACT_REREAD`) 출력.

`STALE` 은 그것만 하고 넘김 (출력에 `EVIDENCE` 줄이 있으면 직전 TICK 증거로 갱신).
잠금을 잃은 팀장은 새 팀장의 잠금을 살아 있게 만들지 않음 (「1. 시작」 잠금 소유 판정).
기상에서 이벤트를 기록할 때는 이 출력이 띄운 `references/events.md` 명령 블록을 그대로 씀.
기억으로 재구성한 명령 금지. events.md 가드가 인자가 비거나 필드가 빠진 줄을 `EVENT_ARGS_MISSING` 으로 거부함. 그 출력이 보이면 명령 블록을 다시 띄워 다시 기록.
```bash
node .claude/skills/dflow-team/scripts/wake.mjs --owner '<신원>/<host>/lead' --slots <N> --busy <M> --until-label '<UNTIL_LABEL>' [--wp <WP-02,dict/WP-03>]
```
출력 줄 (글자 그대로):
- `LOCK_OK` 다음 줄에 재개 요청 요약 `{"n":…,"err":…,"reqs":[…],"other_project":[…]}` (또는 `WATCH_FAILED`·`HOLDER_FAILED`)
- 소유가 아니면 `LOCK_LOST …`
- lease 갱신이 멈췄으면 `LEASE_KEEP_DEAD …`
- 그 뒤에 기록 명령 절

팀장 세션 PID 는 `CLAUDE_PID` 로 봄 (스크립트 안의 `$PPID` ≠ 팀장).

**`resume_requests` = 좌석표의 「이어서 시작」 요청.**
- 사람이 멈춘 좌석의 그 버튼을 누르면 서버가 주문에 표식을 남기고 watch 응답이 그것을 실어 옴.
- 최대 50건, 오래된 것부터, 이 신원이 점유한 `claimed` 주문뿐. **프로젝트를 가리지 않음.**
- 그래서 스크립트가 이 리포 바인딩 (`DFLOW_PROJECT_ID`·`DFLOW_PROJECT_MAP`) 밖의 요청을 `reqs` 에서 빼 `other_project` 로 따로 냄.
- `other_project` 는 처리 안 함. "다른 프로젝트의 요청: <id8…>. 그 프로젝트 리포의 팀장이 처리한다" 한 줄만 보고.

처리 규칙 셋:
- `n` 이 `"NULL"` = **요청 없음이 아니라 조회 실패.** `err` 에 사유.
  - 그 기상에서는 요청을 하나도 처리하지 않고 사유를 한 줄 보고한 뒤 다음 기상에 다시 읽음.
  - 빈 배열 (`n` 이 0)과 절대 뭉개지 않음.
- `host` 가 이 PC 의 `<host>` 슬러그와 **글자 그대로 같은 것만** 「5-1. 재개 spawn」 으로 보냄 (서버가 `claimed_by` 에서 파생한 값. 팀장이 다시 계산 안 함).
  - 다른 값이면 **"멈춤" 표에 사유 `다른 PC claim` 으로 적고 띄우지 않음.**
  - 계약 2.11 이면 `host` 대신 요청의 `mine` 으로 가름 (거짓이면 「멈춤」 `다른 PC 도는 중`).
  - `design_state` 가 `review` 면 띄우지 않고 "「설계 승인」 뒤에 이어 갑니다" 를 한 줄 알림.
  - 그 밖에는 서버 판단이 `skip` 이어도 띄움 (12절 Y10).
- **팀장은 표식을 지우지 않고 확인 응답도 안 보냄.** 되살아난 워커의 첫 heartbeat 가 비우고, 회수 뒤 재claim 하는 경로에서는 claim 라우트가 지움.

`WATCH_FAILED` (watch 호출 실패)·`HOLDER_FAILED` (`lease holder` 조회 실패로 watch 를 아예 안 부름. 빈 `--holder` 로 부르면 무필터로 전체 재개 요청이 옴):
- `beat` 는 이미 갱신돼 잠금은 유효.
- 그 기상의 요청 처리만 건너뜀.

**`build` (계약 2.11) = 「설계 승인」 된 작업 목록.** 기상 블록 요약 끝의 `build` 칸. 처리는 `references/design-state.md` 「2」 (claimed 원소를 재개 대상으로. `"NULL"` = 조회 실패).

`LEASE_KEEP_DEAD` = lease 갱신 프로세스가 3분 넘게 갱신 못 함 (죽었거나 서버에 못 닿음).
- **이 기상이 「2-2」 감시 루프의 `LEASE_LOST` 로 온 것이면 이 문단은 건너뛰고 그 `LEASE_LOST` 를 그대로 따름 (아래 기상 표).**
- 둘이 같은 기상에 함께 뜰 수 있음. **우선순위 = `LEASE_LOST`**: 곧장 「7. 마감」 의 lease 상실 마감으로 가고, 함께 뜬 `LEASE_KEEP_DEAD` 는 무시.
- 그 밖의 기상 (감시 루프의 `LEASE_LOST` 없이 이 블록만 `LEASE_KEEP_DEAD` 를 낸 경우)에서는 `dflow.mjs lease renew` 를 한 번 부름.
  - `LEASE_OK` 면: lease 상실 표식 파일 (`dflow-team.lease-lost`, 「2-2」)이 남아 있으면 먼저 지운 뒤, 「1. 시작」 6번의 lease 갱신 블록과 감시 루프를 다시 띄움 (표식이 남으면 새 루프가 곧바로 `LEASE_LOST` 로 깨움).
  - `LEASE_LOST` (exit 4)나 `LEASE_NONE` 이면 「7. 마감」 의 lease 상실 마감.
  - 그 밖의 실패는 사유를 보고하고 다음 기상에 다시 봄.

`LOCK_LOST` = **잠금 상실.**
- "잠금 상실" 로 보고, 새 spawn 중지.
- 잠금을 지우지 않은 채 「7. 마감」 의 잠금 상실 마감으로 감 (다른 팀장이 잠금을 가져갔으면 두 팀장이 같은 체크아웃을 쓰게 됨).

`STALE` 과 `LEASE_LOST` 를 뺀 모든 기상에서는 `LOCK_OK` 뒤에 이 순서로 한다.
1. 재구성 (「팀장 상태」). 컨텍스트 압축 뒤 첫 기상이면 그 전에 「팀장 상태」 의 「압축 뒤 첫 기상」 대로 재독 세트를 읽음 (`wake.mjs` 출력의 `COMPACT_REREAD` 줄).
2. 아래 표의 처리.
3. 승인 스윕 판정 — 부를지·몇 번인지는 「4-0. 스윕을 부르는 규칙」 이 정함 (기상마다 **최대 1회**, 먼저 `sweep-check.mjs`).
   - 판정하는 기상: 시작, 결과 도착 (`.result` 또는 완료 알림), `TICK`, poll 재기동 직전, 마감 (팀장의 poll 에는 exit 9·10 이 안 옴).
   - 승인 반영은 사람이 승인한 뒤 다음 기상까지 늦어짐. `TICK` 이 있어 최대 30분.
   - 이 지연 동안 승인됐으나 main 미반영인 선행: 워커가 그 `head_sha` 를 스택 기점으로 받음 (`/dflow-dev` 「--worker」 B).
   - 승인 대기인 선행의 후속: `skipped` 로 일시 제외됐다가 승인·머지 뒤 재검사에서 풀림 (「--worker」 G).
   - 자동 머지 (`AUTOMERGE_ON`)면 승인 대기인 선행도 결과 도착 스윕에서 곧바로 머지됨. 후속은 워커의 기본 브랜치 반영 확인 (「--worker」 G)을 통과해 승인을 기다리지 않고 착수.
4. 빈 슬롯이 있고 차단기가 허락하면 아래 순서로 spawn.
   1. **재개 대상** (「5-1. 재개 spawn」)
   2. **해소 큐** (「5-2. 해소 spawn」)
   3. 대기 큐 맨 앞부터 (「5. 팀원 spawn」)
   - 재개 대상 = 재구성의 고아 스캔이 "재개 가능" 으로 분류한 것 + 아직 안 띄운 `--resume` 지목분.
   - 재시작 대기 목록 (`references/restart.md` 「이벤트로 본 상태」 의 `RESTART_DUE`)도 재개 대상. 재투입 전 확인 (`REINJECT_OK`)을 통과할 때만 띄움. 재시작 대기는 새 작업보다 먼저.
   - rate-limit 보류 중에는 재개·새 작업 모두 안 띄움 (`RL_DUE` 슬롯 자신의 재투입만 예외).
   - 기상 블록 요약 `build` 의 claimed 원소 (「설계 승인」 된 작업, 계약 2.11)와 재구성의 `RETRY_DUE` (fetch·push 실패 재시도)도 재개 대상 — 새 작업보다 먼저.
   - 그러고도 빈 슬롯이 남으면 선행 대기 작업을 **설계 선행**으로 줌 (`references/design-ahead.md` 3번, `DFLOW_DESIGN_AHEAD_MAX`).
5. 끝난 감시 루프를 다시 띄움 (`--may-skip` 은 「2-2」 조건일 때만). 재기동 조건 (「2-1」)을 만족하면 poll.mjs 도 다시 띄움.
   - 컨텍스트 압축 뒤 poll 이 떠 있는지 모르면 재기동 조건에 따라 새로 띄움.
   - poll 이 겹쳐 떠도 poll exit 0 처리의 대조와 spawn 전 확인 (「5. 팀원 spawn」 1번)이 같은 작업을 두 번 띄우는 것을 막음.

| 기상 | 처리 |
|---|---|
| poll exit 0 (ready N줄) | 각 줄 `순번<TAB>id8<TAB>이름[<TAB>action]` 에서 순번은 버리고 id8 과 `action` (계약 2.11, 없으면 `full`)을 씀. 먼저 후보를 영구 제외 목록과 슬롯 표에만 한 번 더 대조해 걸리는 것을 버림 (겹쳐 뜬 옛 poll 은 옛 제외 목록으로 돌 수 있음). 일시 제외는 대조 안 함 (poll.mjs 가 10주기 뒤 풀어 돌려준 것을 그대로 다시 판정, 「2-1」). 남은 후보마다 아래 show 필터로 `.order.item.spec` 이 빈지와 선행 사전 검사 (`deps_unmet`)만 봄 (spec 본문을 컨텍스트에 싣지 않음). 비었거나 `ref` 가 비면 일시 제외에 넣고 사유 (spec 부재·TSK 없음)를 보고하며 `team.result` (slot `-`, status `skipped`)를 남김. `deps_unmet` 이 비어 있지 않으면 띄우지 않고 사유 `선행 미충족(사전 검사: <ref…>)` 로 보고와 `team.result` 는 같게 하되, 일시 제외가 아니라 **선행 대기**에 넣음 (아래 「선행 사전 검사」). `deps_unmet` 이 비고 `deps_nohead` 가 비어 있지 않으면 아래 「선행 반영 사전 검사」 를 거침. 남은 것을 빈 슬롯 수만큼 spawn, 나머지는 대기 큐 끝. 차단기가 걸려 있으면 spawn 안 하고 대기 큐에 넣음 (시험 spawn 예외는 「2-1」 재기동 조건). 대기 큐를 잃어도 그 작업들은 아직 ready 라 다음 poll 이 다시 찾음. `action` 이 `design` 이면 `deps_unmet` 이 있어도 선행 대기에 안 넣음 (설계만 함, 스펙 6.6). spawn 전에 아래 「설계 사전 검사」 를 거침 |
| `STOP_REQUESTED`, 사람의 종료 요청 ("팀장 종료"·"마감해" 등) | 종료 시각과 무관하게 「7. 마감」 으로 감. "종료 요청으로 마감합니다" 한 줄 알림. 종료 파일은 이 자리에서 지움 (남기면 마감 중 다시 띄운 감시 루프가 곧바로 다시 끝나 공회전). 마감의 기다림 (「7. 마감」 2번) 중 종료 요청이 **한 번 더** 오면 기다림을 끝내고 곧바로 3번으로 감 |
| poll exit 8 (시한) | 먼저 지금 시각이 현재 `<UNTIL>` (연장 반영) 전인지 봄. 전이면 연장 전에 띄운 옛 poll 이 끝난 것이므로 무시하고 재기동 조건 (「2-1」)대로 새 `--until` 로 다시 띄움. 지났으면 새 배정 중지, 대기 큐를 비우고 (보고만) 「7. 마감」 으로 감 |
| poll exit 2·3·5·6·7 | 중단 사유 (stderr) 보고 후 「7. 마감」 |
| `RESULT_READY <경로…>` | 경로마다 「3. 결과 처리」 |
| `PANE_DEAD <경로…>` (tmux) | 경로마다 「3. 결과 처리」. `.result` 가 있으면 그 줄, 없으면 죽은 pane 화면 폴백, 그것도 없으면 `references/restart.md` 「판정」 (`pane_dead_status` 127 이면 `failed no-result`) |
| 팀원의 cross-session 메시지 (이슈 보고) | 「2-4. 팀원 이슈 보고 처리」. 도착한 이 기상 안에서 곧바로 처리 — 사람에게 보고만 하고 턴을 끝내지 않음 |
| 사람의 답 | 「6. blocked」 의 답 매칭 |
| `TICK` | 감시 루프를 `--new-tick` 으로 다시 띄워 다음 TICK 을 지금+1800초로 새로 정함. 출력에 `TICK_SKIPPED` 가 있었으면 한 번 건너뛴 뒤의 TICK 이며 그 `EVIDENCE` 줄 = 직전 TICK 증거 (「3」). 진행 중 슬롯의 생존을 확인하고 무응답 슬롯의 생존 증거를 잼 (「3. 결과 처리」). 결과 줄 없는 정체 슬롯과 재시작 대기 목록은 `references/restart.md` 「판정」·「rate-limit 대기」 를 탐. 차단기가 걸려 있으면 시험 spawn 1건 허용 |
| `LEASE_LOST <사유>` | 다른 곳이 이 신원+프로젝트의 팀장 lease 를 가져갔거나 (`LEASE_LOST <project_id…>`), 서버에 3분 넘게 못 닿음 (`LEASE_UNREACHABLE`). 위 1-5 (재구성·승인 스윕·spawn·poll·감시 루프 재기동) 안 함. 같은 `LOCK_OK` 블록이 함께 낸 `LEASE_KEEP_DEAD` 도 무시하고 곧장 「7. 마감」 의 lease 상실 마감 |
| `STALE` | 잠금 소유 확인과 `beat` 갱신만 하고 나머지는 넘김 |

poll exit 0 의 show 필터:
```bash
(node .claude/skills/dflow-work/scripts/dflow.mjs show <id8>) | tee "$(git rev-parse --git-path dflow-team-poll)/show-<id8>.json" \
  | jq -c '{order: .order.id, status: .order.status, ref: .order.item.external_ref, spec_empty: ((.order.item.spec // "") | length == 0),
            deps_unmet: [.depends_evidence[]? | select(has("reached") and .reached == false) | .external_ref],
            deps_nohead: [.depends_evidence[]? | select(.reached == true and ((.head_sha // "") == "")) | .external_ref]}'
```
show 실패 (dflow.mjs 가 0 아닌 코드로 끝남, 404 로 exit 7, 출력이 빔)는 spec 부재로 보지 않음.
- 그 id8 은 "조회 실패" 사유로 일시 제외에 넣고 다음 기상에서 다시 판정.
- 조회 실패를 데이터 없음으로 위장하지 않음.

**선행 사전 검사** (`deps_unmet`): 서버 판정 `reached` 가 거짓인 선행이 하나라도 있으면 spawn 안 함.
- 워커가 무엇을 하든 `skipped` 로 끝나는 확정 skip (`reached` 거짓이면 `head_sha` 도 없고, 서버 claim 게이트도 같은 `reached` 로 거부).
- 이 검사는 워커 G 의 판정을 대신하지 않음.
- `reached` 참인 선행 (승인 대기·기본 브랜치 반영 여부·스택 기점)은 전부 워커가 판정.
- `reached` 키 없는 옛 서버 응답이나 `depends_evidence` 없는 응답은 걸러내지 않고 워커에 맡김 (판정 불가를 미충족으로 단정 안 함).
- `state.json` 의 `phase=merged` 로 거르지 않음 (단, 행 G 갈래 2 의 반영 확인은 아래 「선행 반영 사전 검사」 가 사전에 함).
- 면제된 간선 (`waived:true`, 계약 2.8)은 서버가 `reached:true` 로 주므로 이 검사에 안 걸림 — 그대로 spawn.

**선행 대기**: 이 검사로 건너뛴 작업은 일시 제외 (30분)가 아니라 선행 대기에 둠.
사유의 `<ref…>` = `deps_unmet` 원소를 공백으로 이음 (`선행 미충족(사전 검사: d/TSK-03-01 d/TSK-03-02)`). 푸는 길 셋:
- **선행 완료**: 선행 대기 블록 (아래)에서, 그 선행 TSK 의 `done`·`needs-merge`·`resolved` 결과 (`team.result`)가 건너뛴 뒤에 있으면 목록에서 뺌.
  - 이 팀의 팀원이 선행을 끝낸 경우.
  - 결과를 처리한 기상에서 블록을 다시 돌려 줄었으면 재기동 조건 (「2-1」)대로 poll 을 줄어든 `--exclude-wait` 로 다시 띄움.
- **선행 머지**: 승인 스윕이 "머지됨"·"머지됨(승인 전)" 을 냈거나 해소 워커가 `resolved` 로 끝났으면, 그 TSK 를 선행 ref 에 가진 id8 을 이번 기상의 선행 대기에서 빼고 같은 방법으로 poll 을 다시 띄움.
  - 이 해제는 이벤트에 안 남음. poll 이 그 작업을 돌려주기 전에 컨텍스트가 압축되면 블록이 다시 넣음. 그때는 아래 안전망이 품.
- **안전망**: 블록은 기록한 지 2시간 지난 것을 빼고, poll.mjs 도 `--wait-cycles 40` (2시간) 뒤 스스로 풂. 다른 PC 나 사람이 선행을 끝낸 경우처럼 이 팀장이 신호를 못 받는 갈래.

푼 작업을 팀장이 직접 띄우지 않음.
- poll 이 다시 돌려주면 이 사전 검사를 다시 하고, 여전히 막히면 새 `team.result` 로 다시 선행 대기에 들어감 (2시간 계산도 새로 시작).
- poll exit 0 의 재대조는 선행 대기도 안 봄 (일시 제외와 같은 이유).

선행 대기 블록 — 출력 한 줄 = `<id8><TAB><선행 TSK,…>`. 목록은 기억이 아니라 이 출력이 정본. poll 을 띄울 때마다 돌림.
```bash
now=$(date +%s)
jq -c --arg a '<신원>/<host>/lead' --arg r '<MAIN>' 'select(.agent == $a and .repo == $r)' ~/.dflow/events.jsonl 2>/dev/null \
  | awk '/"event":"team.start"/{buf=""} {buf=buf $0 "\n"} END{printf "%s", buf}' \
  | jq -rs --argjson now "$now" '
      def t: (.ts // "");
      ($now - 7200 | todate) as $cut
      | [.[] | select(.event == "team.result" and (.status == "done" or .status == "needs-merge" or .status == "resolved"))
        | {tsk: (.tsk // ""), t: t}] as $done
      | reduce (.[] | select((.event == "team.spawn" or .event == "team.blocked" or .event == "team.result" or .event == "team.lost")
          and (.id8 // "") != "")) as $e ({}; .[$e.id8] = $e)
      | .[]
      | select(.event == "team.result" and .status == "skipped" and ((.reason // "") | startswith("선행 미충족(사전 검사:")))
      | t as $at
      | [.reason | ltrimstr("선행 미충족(사전 검사:") | rtrimstr(")") | splits("[ ,]+") | select(. != "") | split("/") | last] as $refs
      | select($at > $cut)
      | select(any($done[]; .t >= $at and (.tsk as $k | any($refs[]; . == $k))) | not)
      | "\(.id8)\t\($refs | join(","))"'
```
시각 = `ts` (UTC `YYYY-MM-DDTHH:MM:SSZ`) 문자열끼리 비교. 형식이 같아 사전순 = 시간순.

**선행 반영 사전 검사** (`deps_nohead`): `deps_unmet` 이 비고 `deps_nohead` (서버 `reached` 참인데 `head_sha` 없는 선행, 즉 완료 보고 뒤 승인 전)가 비어 있지 않으면, 워커 행 G 갈래 2 의 반영 확인을 여기서 먼저 함.
- 그대로 띄우면 워커가 `skipped 선행 승인 대기` 로 끝나는 확정 skip.
- `head_sha` 있는 선행은 거르지 않음 (워커 행 B 가 그 기점에 스택).
- `git fetch origin` 은 기상마다 한 번만.
- `<TASKS>` 는 `references/merge-conflict.md` 「2」 2번 블록으로 구함. `TASKDIR_FAILED` 면 사유 `작업 폴더 해석 실패` 로 일시 제외.
- 구한 작업 폴더는 「5. 팀원 spawn」 이 다시 씀 (두 번 안 부름).
```bash
node .claude/skills/dflow-dev/scripts/pred-reflected.mjs '<TASKS>' '<선행TSK>' '<개발브랜치>'; echo "rc=$?"
```
`<선행TSK>` = `deps_nohead` 원소의 마지막 `/` 뒤.
- 하나라도 `NOT_REFLECTED` (rc=1)이면 띄우지 않음.
  - 사유 `선행 미반영(사전 검사: <ref…>)` 로 일시 제외에 넣고 `team.result` (slot `-`, status `skipped`)를 남김.
  - 그 선행이 해소 큐나 해소 슬롯에 있으면 (TSK 로 대조) 사유 `선행 미반영(머지 충돌 해소 중: <ref>)`.
  - 두 문구 모두 「선행」 으로 시작해 일시 제외 해제의 선행 계열에 듦.
- `UNKNOWN` (rc=2)은 거르지 않고 워커에 맡김. 위 「선행 사전 검사」 의 "판정 불가를 미충족으로 단정 안 함" 과 같음.
- 모두 `REFLECTED` 면 그대로 spawn.

**설계 사전 검사** (계약 2.11): `action` 이 있는 후보는 띄우기 전에 `references/design-state.md` 「1」 을 함.

### 2-4. 팀원 이슈 보고 처리

팀원이 SendMessage 로 이슈 보고 (첫 줄 `[이슈 <TSK> <id8>] <요약>`, worker-prompt.md 「9」)를 보내면 **도착한 턴에서 곧바로** 처리.
1. `references/issues.md` 를 Bash `cat` 으로 읽음.
2. 그 1-5 (저장·판단·`[팀장 지시 <id8>]` 추가 지시·전파·근본 조치)를 함.

- 감시 루프는 cross-session 메시지로 안 깸.
- **사람에게 보고만 하고 턴을 끝내는 것 금지** (팀원과 팀장이 서로 기다리며 교착).
- 팀장이 10분 안에 지시를 못 보내면 팀원은 `.result` 의 `blocked` 로 넘어감. 그때는 「6. blocked」 로 처리.
## 3. 결과 처리

**결과 줄 찾기**
- 감시 루프가 알린 경로(`RESULT_READY`)의 `.result` 한 줄. 두 백엔드 공통. 슬롯은 경로(그 슬롯 워크트리)로 찾음.
- 이미 판정한 경로의 알림 → 집계만 갱신, 슬롯 건드리지 않음.
- `PANE_DEAD <경로>`(tmux): 그 슬롯 팀원 pane 죽음. 처리 순서:
  1. `.result` 있으면 그 줄 처리.
  2. 없으면 backends.md 「결과 줄과 죽은 pane 폴백」 대로 `capture-pane -p -J -S -` 로 죽은 pane 화면 전체를 읽어 `<TSK> <id8> ` 로 시작하는 마지막 줄 처리. `failed not-isolated` 는 워커가 파일을 안 쓰므로 이 폴백으로만 옴.
  3. 그것도 없으면 `#{pane_dead_status}` 읽음(`references/restart.md` 「판정」 블록의 `dead_status`).
     - `127`(`claude` 못 찾음) → 곧바로 `failed no-result` 판정(hash `-`. 다시 띄워도 같은 자리에서 죽는 환경 결함).
     - 그 밖 → `references/restart.md` 「판정」 으로 감(재시작 후보).
  - 프로세스가 없으므로 기다리지 않음.
- 줄 형식 `<TSK> <id8> <branch|-> <head|-> <done_exit|-> <status> <사유…>`.
- 줄과 해시는 「팀장 상태」 한 줄 명령으로 함께 읽음. 해시 = 그 경로의 마지막 처리 해시면 처리 안 함.

**생존 증거**: tmux 팀원은 먼저 「팀장 상태」 정본 표의 생존 칸(`.dflow-pane` 의 pane 이 `#{pane_dead}=0` 인지)을 봄.
- `dead` → 증거 재지 않고 `PANE_DEAD` 와 같이 처리.
- 살아 있는 팀원은 아래 중 하나라도 직전 `TICK` 과 다르면 생존.
- 슬롯의 첫 `TICK` 은 기록만.
- 직전 TICK 증거 = 그 슬롯 마지막 TICK 기상 때 잰 값. 감시 루프가 그 뒤 TICK 을 건너뛰었으면(「2-2」) 그 출력의 `EVIDENCE <id8>` 줄(`ct`=1번, `report`=2번, `heartbeat`·`phase`=무응답의 heartbeat 값, `dirty`=3번 cksum 첫 칸).
```bash
git -C <워크트리> log -1 --format=%ct                                        # 1. 워크트리가 있으면 HEAD 커밋 시각
git fetch origin && git log -1 --format=%ct 'origin/agent/<id8>-<slug>'   # 1. 워크트리가 없으면 원격 tip 커밋 시각
(node .claude/skills/dflow-work/scripts/dflow.mjs show <id8>) | jq -r '[.reports[]?] | last | .created_at // empty'   # 2. 서버 최신 progress
git -C <워크트리> status --porcelain | cksum                                 # 3. 미커밋 변경 목록
```
- 2번 show 실패 → 증거 없음 아닌 측정 실패로 기록. 그 `TICK` 은 2번을 비교에서 뺌.
- 화면은 생존 증거로 쓰지 않음. 화면(tmux `capture-pane`, Orca `orca terminal read`)은 보고용·폴더 신뢰 확인 판별(backends.md)에만 씀(스피너 때문에 멈춘 팀원도 화면이 매번 달라짐).
- 이 원칙 정본 = 이 줄. backends.md·restart.md 는 여기를 가리킴.
- 터미널 핸들 없는 옛 Orca 런타임 → 화면 안 읽고 위 셋만 씀.

**문제 기록**: 결과 줄 처리 시 `blocked` 가 아니면 `team.result` 기록·워크트리 정리보다 먼저 팀장 체크아웃 `docs/dflow-team/issues.md` 에 항목 하나 붙임(정리가 미추적 `.issues` 를 함께 지움). 이 파일은 commit 안 함(「1. 시작」 exclude 의 `/docs/dflow-team/`).
- 재료 둘: 워커가 쓴 `<워크트리>/<TASKS>/<TSK>/.issues`(worker-prompt.md 「7-1」, 줄마다 `<phase>\t<분류>\t<내용>`), `done` 아닌 결과의 사유(결과 줄 7번째 칸부터).
- `done`·`needs-merge`·`design_waiting`·`design_review` 이고 `.issues` 없거나 비면 붙이지 않음. 그 밖 status 는 `.issues` 없어도 사유 한 줄로 항목 만듦.
- `failed no-result` → 사유 대신 `pane_dead_status` 와 화면 마지막 20줄(tmux `capture-pane -p -J -S - | tail -n 20`, Orca `orca terminal read`)을 코드 블록으로 붙임. 화면 못 읽으면 `화면 없음` 한 줄.
- `blocked` 는 붙이지 않음. 팀원이 답 받아 이어 가며 `.issues` 에 계속 적고, 최종 결과 때 한 번에 옮김.
```bash
f='<MAIN>/docs/dflow-team/issues.md'; i='<워크트리>/<TASKS>/<TSK>/.issues'; st='<status>'
reason=$(head -n 1 "$(dirname "$i")/.result" 2>/dev/null | cut -d' ' -f7-)
if [ -s "$i" ] || { [ "$st" != done ] && [ "$st" != needs-merge ] && [ "$st" != design_waiting ] && [ "$st" != design_review ]; }; then
  mkdir -p "$(dirname "$f")"
  [ -s "$f" ] || printf '# /dflow-team 문제 기록\n\n팀원이 보고한 에러·문제점. 스킬·환경 개선 재료이며 커밋하지 않는다.\n' > "$f"
  { printf '\n### %s · <TSK> (<id8>) · %s\n\n' "$(date '+%Y-%m-%d %H:%M')" "$st"
    [ "$st" = done ] || [ "$st" = needs-merge ] || [ "$st" = design_waiting ] || [ "$st" = design_review ] || printf -- '- 결과 사유: %s\n' "$reason"
    [ -s "$i" ] && awk -F'\t' 'NF{c=$2;p=$1;sub(/^[^\t]*\t[^\t]*\t/,"");printf "- [%s] %s: %s\n",c,p,$0}' "$i"
  } >> "$f" || echo ISSUE_LOG_FAIL
fi
```
- `reason` 은 events.md 「기록 명령」 과 같은 방법(`.result` 첫 줄 7번째 칸부터)으로 이 블록 안에서 다시 뽑음(별도 Bash 호출의 변수는 안 남음). `.result` 없으면(`failed no-result`) 빈 값.
- `ISSUE_LOG_FAIL` 이 나와도 결과 처리를 멈추지 않고 보고에 한 줄 적음.

**status 별 처리**:
- 결과 줄은 경로별 마지막 처리 해시와 다를 때만 처리.
- `blocked` → `team.blocked`, 나머지 → `team.result` 로 해시·사유와 함께 기록(events.md).
- 모든 결과를 집계에 넣음.
- 결과 처리 시 그 id8 을 먼저 진행 중 영구 제외에서 빼고, 아래 표 제외 칸대로 일시·영구 제외를 새로 정함(그대로 두면 `skipped`·`failed rate-limit` 재시도가 막힘).

| status | 슬롯 | 제외 | 워크트리 | 그 밖 |
|---|---|---|---|---|
| `done` | 해제 | 없음 | 「고아 정리 규칙」 2번(미커밋 변경 없음, HEAD 가 `origin/<agent 브랜치>` 와 같거나 그 머지가 이미 기본 브랜치 조상)을 맞추면 그 자리에서 정리. 아니면 3번대로 경로·미커밋 목록 보고 후 남기고 `.dflow-agent` 값을 `<신원>/<host>/parked` 로 바꿈 | 자동 머지(`AUTOMERGE_ON`)면 먼저 승인 스윕을 곧바로 함(이 기상의 스윕 1회(「4-0」)를 spawn 보다 먼저. 방금 끝난 작업이 기본 브랜치에 들어가야 후속이 착수). 그 다음 대기 큐 있으면 그 슬롯에 spawn. 비면 poll 재기동 조건(「2-1」)을 따름 |
| `needs-merge` | 해제 | 없음 | `done` 과 같다 | 승인 스윕을 곧바로 함. 이 기상의 스윕 1회이며, 워커가 approved 확인한 머지 대상이 있으므로 사전 검사 없이 부름(「4-0」 의 예외) |
| `skipped`(선행 미충족·선행 미승인·선행 승인 대기·claim exit 4·공통 기점 없음·spec 부재, 계약 2.11 의 `설계 관문(<code>)`·`사람 설계 초안 있음`·`주문이 바뀜`·서버 판단 사유) | 해제 | 일시 제외 | branch 가 `-` 면 부트스트랩 실패 정리 규칙, 아니면 `done` 과 같다 | 사유 보고. `사람 설계 초안 있음` 은 「멈춤」 표에도 |
| `skipped`(`fetch 실패`·`push 실패`·`다른 PC 도는 중(<runner>)`, 계약 2.11) | 해제 | 일시 제외 | 지우지 않음. `parked` 로 | `references/design-state.md` 「3」 |
| `design_waiting`(설계 완료·선행 대기, 사유 = 미충족 선행 ref) | 해제 | 없음 | 지우지 않음. `.dflow-agent` 를 `parked` 로 | 실패 아님(차단기 연속 수 0). 재개는 `references/design-ahead.md` 2·4번. `design-done 미확인` 이면 `references/design-state.md` 「3」 먼저 |
| `design_review`(설계 검토 대기로 멈춤) | 해제 | 없음 | `done` 과 같다(설계는 push 돼 있음) | 실패 아님(차단기 0). 보고·`design-done 미확인` 은 `references/design-state.md` 「3」 |
| `design_reopened`(설계를 사람에게 되돌림, 계약 2.11) | 해제 | 없음 | 미커밋 변경 있어도 지움(`references/design-state.md` 「3」) | 실패 아님(차단기 0) |
| `blocked` | 유지 | 진행 중으로 영구 제외에 남김 | 그대로 둠(두 백엔드 공통). 팀원이 pane·탭에서 답을 기다림 | 통지(「6. blocked」) |
| `failed <사유>` | 해제 | 영구 제외 | 고아 정리 규칙 | 사유 보고, 차단기 계산 |
| `failed permission <명령>` | 해제 | 영구 제외 | 고아 정리 규칙 | 거부된 명령을 "권한 목록 재료" 로 보고(킷 허용 목록에 넣을 값). 서버에 claimed 로 남으므로 "멈춤" 표에 넣음(사유 = 그 status). 차단기 계산 |
| `failed rate-limit` | 해제 | 제외 안 함 | 고아 정리 규칙 | 재시도 가능. 아직 ready 면 poll 이 다시 찾고, 이미 claimed 면 "멈춤" 표에 넣음(사유 = 그 status). 차단기 계산에 넣음. 워커가 결과 줄을 쓴 경우라 자동 재시작·보류 대상 아님. 결과 줄 없이 한도에 선 워커는 `references/restart.md` 「rate-limit 대기」 가 다룸 |
| `failed no-result`(pane 죽었는데 결과 줄 없음) | 해제 | 영구 제외 | 고아 정리 규칙 | 서버에 claimed 면 "멈춤" 표에 넣음(사유 = 그 status). 차단기 계산. `pane_dead_status` 127 일 때만 이 행. 127 아닌 죽음은 `references/restart.md` 재시작 판정으로 감(워크트리 안 지움) |
| `failed not-isolated` | 해제 | 영구 제외 | 없음(워커가 파일을 안 씀) | 백엔드 결함 → 새 spawn 멈추고 「7. 마감」 으로 |
| `failed project` | 해제 | 영구 제외 | 고아 정리 규칙(claim 전이라 대개 부트스트랩 실패 정리) | 주문이 이 리포의 D'Flow 프로젝트 밖. claim 안 했으므로 "멈춤" 표에 넣지 않음. 바인딩(`.env`)·poll 필터가 새는 결함이므로 사유 그대로 보고. 차단기 계산 |
| `failed not-assignee` | 해제 | 영구 제외 | 고아 정리 규칙(claim 전이라 대개 부트스트랩 실패 정리) | 다른 멤버 배정 작업을 claim 하려다 서버가 `not_assignee` 로 거부. claim 안 했으므로 "멈춤" 표에 넣지 않음. **차단기 계산에 넣지 않음**(배정 불일치, 환경 결함 아님). 사유와 함께 "담당자 변경 여부를 D'Flow 에서 확인하라" 보고 |
| `failed deps` | 해제 | 영구 제외 | 고아 정리 규칙 | 사유 보고, 차단기 계산. 설치는 claim·브랜치 생성 뒤라(`/dflow-dev` 「--worker」 H) 서버에 claimed 로 남으므로 "멈춤" 표에 넣음(사유 = 그 status). 대상 리포 lockfile·패키지 관리자 문제라 사람이 고침 |
| `cancelled`(사람이 D'Flow 에서 중단 — 주문 `cancelled`·위임 해제) | 해제 | 영구 제외 | 지우지 않음(산출물 보존). 미커밋 변경 있어도 그대로 두고 경로만 보고, `.dflow-agent` 값을 `<신원>/<host>/parked` 로 바꿈 | 사람 알림 한 줄(`<TSK> <id8> 중단됨 — 워크트리 <경로> 보존`). 사람이 멈춘 것이라 "멈춤" 표에 안 넣고, 차단기 계산에도 안 넣음(세지도 끊지도 않음). 다시 맡기려면 사람이 위임 체크를 켬 → 새 주문으로 poll 에 다시 잡힘 |

**해소 워커의 결과**: 슬롯 워크트리 이름이 `-resolve` 로 끝나면(`dflow-<id8>-resolve`, `readopt` 뒤에도 같음) 위 표 대신 `references/merge-conflict.md` 「4. 해소 결과 처리」 표를 따름. 결과 줄 찾기·해시·`team.result`·`team.blocked` 기록·tmux 회수는 위와 같음.

- **그 자리에서 정리한다**: git 은 다른 워크트리가 체크아웃한 브랜치를 못 지움. 마감까지 남기면 승인된 작업의 로컬 agent 브랜치 삭제가 실패함. 정리 명령 = backends.md 백엔드별 「정리」 와 「고아 정리 규칙」. 워크트리를 지웠으면 그 규칙 5번의 생성 브랜치 정리까지 함.
- **회수**: 결과 줄 처리 뒤.
  - tmux: pane 을 `kill-pane -t <pane>` 으로 거두고 `select-layout -t dflow tiled` 다시 돎(backends.md 「생존·화면·답·회수」).
  - Orca: `orca terminal close --terminal <handle> --tab --json` 으로 탭 닫음(핸들이 `-` 면 건너뜀).
  - 순서: 결과 처리 → 탭 닫기 → 워크트리 정리.
  - 응답의 `ptyKilled:false` 는 실패 아님(claude 프로세스는 실제로 끝남).
  - `blocked` 는 예외, 거두지 않음(답을 기다리며 살아 있어야 함).
  - 워커는 `.result` 를 쓰고 곧 끝나므로 보통 `remain-on-exit` 가 남긴 죽은 pane. 그것도 `kill-pane` 으로 치움.
- **차단기**: 결과 도착 순서로 `failed` 연속 2건이면 새 spawn 멈추고 보고.
  - `failed` 에 `no-result`·`rate-limit` 포함. `not-assignee`·해소 워커의 내용 실패(`references/merge-conflict.md` 「6. 차단기」) 제외.
  - `failed` 아닌 결과가 오면 연속 수 0 으로 되돌림.
  - 걸린 동안 다음 `TICK` 마다 1건만 시험 spawn(대기 큐 맨 앞에서, 큐가 비었으면 poll 한 번 띄워 얻음). 그 결과가 `failed` 아니면 차단기 풂(한도·환경 결함에 걸린 채 대기 큐를 소진하지 않음).
  - 자동 재시작의 `team.lost`(모든 `cause`)도 실패 1건으로 셈(`references/restart.md`). 단 `next=wait` 인 `team.lost` 는 세지 않음.
  - 걸린 동안의 시험 1건은 재시작 대기가 새 작업보다 먼저.
- **중단**: 워커는 `dflow.mjs` exit 10 을 받으면 `.result` 에 `cancelled` 를 쓰지만, heartbeat 훅이 먼저 세션을 세우면 결과 줄 없이 멈춤.
  - 결과 줄 없는 진행 슬롯이라도 생존 증거 2번의 `show` 가 `status=cancelled` 면 결과 줄 `cancelled`(hash `-`)를 받은 것과 똑같이 처리. 무응답 판정을 기다리지 않음.
  - tmux 는 `kill-pane`, Orca 는 `orca terminal close --terminal <handle> --tab --json` 으로 거두되 워크트리는 안 지움.
- **무응답**: 결과도 알림도 없는 진행 슬롯의 생존 증거가 한 `TICK` 동안 안 변하면 "무응답" 으로 보고만 하고 슬롯 유지.
  - 생존 증거에 `show` 의 `last_heartbeat_at`·`heartbeat_phase` 포함(워커가 Phase 마다 보내 브랜치 tip 시각보다 촘촘함).
  - `stale` 은 쓰지 않음(`claimed_at` 으로부터 24시간 경과일 뿐).
  - 자동 정리는 두 TICK 연속 생존 증거 없을 때만. tmux 는 `kill-pane`, Orca 는 `orca terminal close --terminal <handle> --tab --json` 으로 팀원을 멈추고 슬롯 해제. 워크트리는 고아 정리 규칙.
  - 자동 정리한 작업은 영구 제외에 넣고 "멈춤" 표에 넣음(사유 `무응답`).
- **서브에이전트 종료 후 정지 패턴(2026-09-24, dmes-standard TSK-03-01)**: 위 "무응답" 판정 시점(생존 증거 무변화 1회째 — 두 `TICK` 안 기다림)에 화면(tmux `capture-pane`)을 이 판정에만 씀.
  - 적용 대상 = `references/restart.md` 「판정」 1-5번(측정 실패·중단·점유 변동·표식 불일치·rate-limit)에 안 걸리고 그 표 9번(무응답 1회)에 이른 슬롯뿐. 취소되거나 한도에 걸린 슬롯에 이 지시를 주입하지 않음.
  - `last_heartbeat_at` 이 함께 멈춰 있어도 상관없음. 오케스트레이터가 입력 대기로 서 있으면 도구 호출이 없어 heartbeat 자체가 멎음. heartbeat 갱신을 전제로 하는 아래 "대기 중인 팀원 판정" 과 달리 이 판정은 heartbeat 값을 안 봄.
  - 조건: 화면 마지막 줄이 입력 대기 프롬프트(`❯`) + 그 위에 `Teammate @<TSK>-<phase> finished` 류 서브에이전트 종료 알림 + 그 뒤 오케스트레이터 발화가 "완료 알림을 기다린다"·"백그라운드 작업이 끝나면" 류.
  - 이는 다시는 오지 않을 알림을 기다리는 정지임. 서브에이전트 턴이 끝나면 하네스가 완료로 보아 그 뒤 백그라운드 손자의 완료가 오케스트레이터를 못 깨움(「제1 제약」 과 같은 구조가 Phase 한 단계 아래에서 재발, `/dflow-dev` `references/orch/phase-common.md` 「서브에이전트가 끝났는데 게이트를 안 돌렸을 때」 와 짝).
  - 조치: "무응답" 으로 보고만 하고 다음 `TICK` 을 안 기다림. 이 TICK 에서 곧바로 `send-keys -l --`(tmux) 또는 `orca terminal`(`references/issues.md` 「SendMessage 가 닿지 않을 때」 와 같은 주입 경로)로 그 팀원 화면에 다음을 넣음:
    "[팀장 지시 <id8>] 서브에이전트 @<TSK>-<phase> 는 이미 끝났다(finished). 백그라운드 완료 알림은 오지 않는다 —
    프로세스(`pgrep` 등)와 산출물(커밋·파일)을 직접 확인하고, 남은 작업이 없으면 게이트를 직접 돌려라(구현 단위가 남았으면 다음 단위·묶음을 띄워라)."
  - 자동 정리·자동 재시작과의 관계: 주입이 오케스트레이터를 깨우면 다음 `TICK` 생존 증거(커밋·미커밋 목록 등)가 바뀌어 "두 `TICK` 연속 무변화" 조건이 깨짐. 그래서 위 무응답 자동 정리(`kill-pane`)도 `references/restart.md` 「판정」 재시작 후보(`cause=no-response`, (나) 2회째)도 안 걸림.
  - 주입이 안 먹어 다음 `TICK` 에도 같은 화면(finished 알림 + 프롬프트)이면 재주입 안 하고 "사람 확인 필요" 로 올림(같은 문구를 무한 재주입 금지). 그 이후 두 `TICK` 무변화 조건이 유지되면 기존 자동 정리·자동 재시작이 그대로 이어받음(이 절이 막지 않음).
- **대기 중인 팀원 판정(2026-09-24, doc-level — 별도 판정 스크립트는 아직 없음)**: 조건 전부 충족 시.
  - `last_heartbeat_at` 은 갱신됨.
  - 커밋 시각·미커밋 변경 목록·`heartbeat_phase` 가 두 `TICK` 연속 그대로.
  - 화면(tmux `capture-pane`, Orca `orca terminal read --terminal <handle>`) 마지막 줄이 입력 대기 프롬프트(`❯`).
  - 결론: 죽은 게 아니라 입력을 기다리며 서 있음. SendMessage 이슈 보고 뒤 지시를 기다리는 경우가 전형(「2-4. 팀원 이슈 보고 처리」).
  - 조치: 위 무응답 자동 정리(tmux `kill-pane`, Orca `orca terminal close`)를 안 함. "대기 중인 팀원" 으로 보고만 하고 슬롯 유지. heartbeat 가 살아 있는 프로세스를 죽이면 미답 이슈와 미커밋 산출물을 함께 잃음.
  - 화면은 다른 곳과 같이 생존 증거로 안 쓰고 이 판정에만 씀(backends.md 「화면은 생존 증거로 쓰지 않는다」 와 같은 원칙).
  - Orca 는 터미널 핸들이 없으면(`-`) 화면을 못 읽으므로 이 판정을 건너뛰고 위 무응답 규칙만 적용.
- **자동 재시작**: 위 자동 정리는 `references/restart.md` 「판정」 이 대신함(두 백엔드 공통).
  - 두 TICK 연속 무변화(또는 결과 없는 pane·탭 죽음)면 원인을 가림.
  - 재시작 후보는 워크트리를 안 지우고 pane(Orca 는 탭)만 거둠 → `team.lost` 기록 → 같은 기상 안에 「5-1. 재개 spawn」 으로 다시 띄움(재시도 상한 3 은 고아 재개와 공유).
  - 영구 제외는 `team.lost` 가 대신함.

## 4. 승인 스윕

「4-0. 스윕을 부르는 규칙」 이 부르라고 판정했을 때만 함.
- Skill 도구로 `/dflow-merge` 를 인자 없이 실행. 자동 머지(`AUTOMERGE_ON`, 「인자」)면 `--on-report` 하나만 붙여 실행.
- 스윕마다 `.dflow`·`.dflow.local`(레거시 `.env`)을 다시 읽어 정함.
- 후보가 원격 `origin/agent/*` tip 에서도 오므로 팀장 체크아웃의 state.json 유무와 무관.
- 판정은 서버 `show` 로만 하고 approved 만 머지.
- 후보는 state.json 의 `api_base` 가 팀장 `api_base` 설정(`.dflow`, 레거시 `DFLOW_API_BASE`)과 같은 것만 받음. `api_base` 없는 로컬 후보는 전제 검사가 시작 전에 막음(「1. 시작」 `LEGACY_REPORTED`).
- **반려(머지됨)**: 자동 머지로 이미 기본 브랜치에 들어간 작업이 반려되면 `/dflow-merge` 가 "반려(머지됨)" 과 그 위에 쌓였을 수 있는 작업 목록을 냄.
  - 팀장 보고: "main 에 머지된 반려 작업: <id8> (<review_note>). 그 위에 쌓였을 수 있는 작업: <id8…>. 되돌리기(`git revert -m 1 <머지 커밋>`)나 수동 `/dflow-dev <id8>` 재작업을 사람이 고른다".
  - 그 id8 을 영구 제외에 넣음.
  - 팀장이 스스로 revert 하지 않음(후속이 반려된 코드에 기댈 수 있음).
- **반려**: 반려로 보고된 id8 은 "반려: 수동 `/dflow-dev <id8>` 대상 (<review_note>)" 로 보고하고 영구 제외에 넣음. 재작업은 기존 agent 브랜치 위에서 해야 하므로 자동 배정 안 함.
- **다중 경합**: 두 팀장 스윕이 같은 브랜치를 머지하려 하면 나중 쪽 `git push` 가 non-fast-forward 로 거부됨.
  - `/dflow-merge` 가 머지 직전 HEAD 로 `git reset --keep` 해 되돌리고 "push 실패(경합)" 로 보고 후 스윕 멈춤.
  - 다음 기상 스윕이 fetch 부터 다시 함.
- **그 밖의 push 실패**: `/dflow-merge` 는 연결·권한 오류(128 등)를 "push 실패" 로 보고하고 스윕을 멈춤. 팀장은 그 스윕을 "중간에 멈춤" 으로 보고, 정상 완료로 적지 않음. 머지 안 된 후보는 다음 기상 스윕이 다시 봄.
- **push 훅 거부**: `/dflow-merge` 가 `git reset --keep` 으로 되돌리고 "push 실패(훅)" 로 보고한 뒤, 그 작업과 후손만 빼고 다음 후보로 감. 팀장은 그 id8 을 "사람이 머지해야 함" 으로 보고.
- **머지 충돌**: `/dflow-merge` 가 충돌 파일 목록을 읽고 `git merge --abort` 로 되돌린 뒤 "머지 실패(충돌)" 로 보고(파일 목록 `<파일,…>` 동반)하고 다음 후보로 감.
  - 마이그레이션 버전 중복·역순 도착(`/dflow-merge` 「마이그레이션 버전 관문」)도 머지 전에 같은 문구로 보고됨(끝에 `(마이그레이션 버전)`, 파일은 이 브랜치가 추가한 마이그레이션).
  - 팀장은 그 id8 을 「4-1. 머지 충돌 해소」 로 넘김.
  - 해소 못 하는 경우(다른 신원의 주문·상한·재시도 불가)만 "사람이 머지해야 함" 으로 보고.
- **공용 결정 기록(`decisions.md`)**: 팀원은 전역 번호 대신 임시 ID `D-<TSK>-<n>` 을 씀(dev-discipline 「공용 결정 기록(decisions.md)의 번호」).
  - `/dflow-merge` 가 머지하며 그 파일 충돌을 기계적으로 풀고 번호를 매김(「결정 번호 매김」).
  - 대상 리포에 `merge=union` 을 걸지 않음 — 같은 필드 줄을 가진 블록을 섞음.
  - 스윕 보고에 `UNION_SET <파일>` 이 있으면 "대상 리포 `.gitattributes` 에서 decisions.md 의 `merge=union` 을 빼야 함" 으로 사람에게 보고.
  - 팀장이 그 파일을 직접 고쳐 commit 하지 않음(대상 리포 설정 변경은 사람 몫).
  - "결정 번호 매김 실패" 는 보고만(다음 머지가 다시 매김).
  - 직접 매긴 전역 번호가 겹쳐 옮겨졌으면(`DUP_RENUMBERED`) 결과만 알림.
  - `DUP_REF_AMBIGUOUS`·`DUP_LEFT`·`DECISIONS_SEQ` 는 그 위치를 그대로 사람에게 넘김(팀장이 손으로 고치지 않음).
- 로컬 agent 브랜치 삭제가 브랜치 없음·"checked out" 오류로 실패하면 `/dflow-merge` 가 건너뛰고 보고. 그 워크트리는 결과 처리나 고아 스캔이 정리.
- 승인 대기·건너뜀(서버 <status>·조회 실패·다른 D'Flow·조상 미승인·기점 미반영·승인 뒤 변경·승인 뒤 변경 확인 불가)은 보고만. 자동 머지의 "머지됨(승인 전)"·"승인 반영(이미 머지됨)"·"승인 대기(머지됨)" 도 한 줄씩 보고.
- **자동 머지 뒤 일시 제외 해제**: 스윕이 "머지됨(승인 전)"·"머지됨" 을 한 건이라도 냈거나 해소 워커가 `resolved` 로 끝났으면(「5-2」):
  - 일시 제외 중 사유가 선행 계열(선행 미충족·선행 미승인·선행 승인 대기·claim exit 4·공통 기점 없음·선행 미반영)인 id8 을 목록에서 뺌.
  - 재기동 조건(「2-1」)이 맞으면 줄어든 `--exclude-temp` 로 poll 을 새로 띄움.
  - 푼 작업을 팀장이 직접 띄우지 않음. poll 이 다시 돌려준 것만 띄움(담당자 변경·다른 팀장 점유를 거르는 곳 = poll 의 `--scope assigned` 조회).
  - 떠 있던 옛 poll 이 옛 목록으로 한 번 더 돌아도 poll exit 0 처리의 대조와 spawn 전 확인이 같은 작업을 두 번 띄우지 않게 막음(「2-3」 5번).
- `team.sweep`(merged, waiting, rejected, resolved 개수)을 기록.
  - `resolved` = 직전 스윕 뒤 해소 워커의 `resolved` 가 조상 확인까지 통과한 수. 기억으로 세지 않고 `lead-state.mjs` 의 `CONFLICT_CLEARED resolved=` 를 씀.
  - `merged` 에 승인 전 머지 포함, `waiting` 에 승인 대기(머지됨) 포함, `rejected` 에 반려(머지됨) 포함.
- **방언 검증**: `/dflow-merge` 가 스윕 끝에 「방언 검증」 을 한 번 돌고(`.dflow`·`.dflow.local` 의 `dialect_check` 있을 때만, 머지마다가 아니라 스윕마다 한 번) 결과 줄 `DIALECT_*` 를 보고에 실음. 팀장 처리:
  - 방언 검증은 자동으로 되돌리거나 Task 를 재오픈하지 않음. 어느 머지가 깨뜨렸는지와 되돌리기는 사람이 판단.
  - `DIALECT_FAIL`: 사람에게 "방언 검증 실패 <sha>: 직전 통과 <since> 이후 머지된 Task <tasks>. 도커 금지로 확인하지 못한 항목이 있는 Task <unverified>. 로그 <log>" 로 알림.
    - `docs/dflow-team/issues.md` 에 같은 내용을 항목 하나로 붙임(`DIALECT_UNVERIFIED` 줄도 함께).
    - `team.issue` 를 남김: id8 = `dialect`, `tsk` = `-`, `summary` = 위 알림 문장, `decision` = `사람 판단(자동 되돌리기·재오픈 없음)`.
    - `decision` 을 `pending` 으로 쓰지 않음(재구성이 팀원 이슈로 읽음).
  - `DIALECT_DEFERRED docker-off … notify=1`: "방언 검증 보류(도커 꺼짐): <sha>. 도커를 켜면 다음 스윕이 같은 커밋을 돌린다" 로 알리고 issues.md 에 한 줄 남김. `notify=0` 이면 알리지 않음. 팀장은 도커 런타임을 안 켬.
  - `DIALECT_PASS`: 한 줄 보고. `unverified=` 가 `-` 아니면 "방언 검증 통과. 도커 금지로 확인하지 못한 항목이 있던 Task: <unverified>" 를 붙여 사람이 대조하게 함.
  - `DIALECT_ERROR`: `notify=1` 이거나 `notify=` 없으면(설정·fetch 오류) "방언 검증을 돌리지 못함: <줄>" 로 알리고 issues.md 에 한 줄 남김. 다음 스윕이 다시 시도. 명령 설정(`dialect_check`, PC 전용 값)은 사람이 고침.
  - `DIALECT_BUSY`·`DIALECT_RUNNING`·`DIALECT_SKIP`·`DIALECT_NONE`: 보고 안 함. BUSY 는 다음 스윕이 다시 시도.
  - 방언 검증은 팀장 Bash 한 번으로 돎(timeout 600000). 10분 넘겨 하네스가 백그라운드로 옮기면 완료 알림으로 결과를 받음. 컨텍스트 압축 등으로 놓쳤으면 `node .claude/skills/dflow-merge/scripts/dialect-check.mjs status --dev <기본브랜치>` 로 마지막 결과를 읽음. 도는 동안 겹친 스윕 = `DIALECT_RUNNING`.
- 머지 자리는 팀장 체크아웃 상태로 갈림(`/dflow-merge` 4번).
  - 기본 브랜치 위 팀장 → 그 체크아웃에서 머지.
  - detached HEAD 팀장 → 임시 머지 워크트리 `<MAIN>/.claude/worktrees/dflow-merge` 에서 머지하고 `HEAD:<기본브랜치>` 로 push.
- detached HEAD 팀장은 스윕이 끝나면 팀장 체크아웃을 최신으로 옮김(옛 커밋의 state.json 이 `LEGACY_REPORTED` 를 안 부르게). 체크아웃이 깨끗할 때만.
  ```bash
  [ -z "$(git branch --show-current)" ] && [ -z "$(git status --porcelain)" ] && git switch -q --detach origin/<기본브랜치>
  ```

### 4-0. 스윕을 부르는 규칙

스윕(`/dflow-merge` 호출)을 언제·몇 번 부르는지는 이 절 하나가 정함. 시작(「1. 시작」 5번), 「2-3」 3번, `TICK`, 「3. 결과 처리」 `done`·`needs-merge` 행, 해소 `resolved`(merge-conflict.md 「4」), 「7. 마감」 모두 이 절을 따름.

1. 한 기상에 최대 1회.
   - 결과가 여럿 도착했거나 `done`·`needs-merge`·`resolved` 행이 "곧바로 스윕" 이라 해도, 그 기상의 판정과 스윕은 「2-3」 3번 자리에서 한 번.
   - 그 행들의 "곧바로" = "같은 기상의 spawn(「2-3」 4번)보다 먼저".
   - 판정하는 기상 = 「2-3」 3번에 적은 것(시작·결과 도착·`TICK`·poll 재기동 직전·마감)뿐.
   - 사람의 답·이슈 보고·`STALE`·`LEASE_LOST` 기상에서는 판정 안 함.
   - 감시 루프가 건너뛴 TICK(「2-2」)은 기상이 아니므로 판정 안 함(승인·반려가 생기면 루프가 안 건너뛰고 깨움).
2. 먼저 사전 검사: `/dflow-merge` 부르기 전에 아래를 돎. 후보 정의는 `/dflow-merge` 「절차」 1번 그대로(서버 조회 안 함).
   ```bash
   node .claude/skills/dflow-merge/scripts/sweep-check.mjs --dev '<기본브랜치>'; echo "rc=$?"
   ```
   | 마지막 줄 | 처리 |
   |---|---|
   | `SWEEP_CANDIDATES n=<N> <id8…>` | 「4. 승인 스윕」 대로 `/dflow-merge` 를 부름 |
   | `SWEEP_NONE` | 부르지 않음. 보고 = "스윕 생략(후보 없음)" 한 줄. 아래 3번은 함 |
   | `SWEEP_UNKNOWN <사유>`, 빈 출력, 스크립트 없음(옛 킷), `rc` ≠ 0 | 부름(fail-open). 사유 한 줄 보고 |

   글자 그대로 `SWEEP_NONE` 일 때만 건너뜀(판정 불가를 후보 없음으로 뭉개지 않음). 자동 머지(`AUTOMERGE_ON`)에서도 같음.
3. `SWEEP_NONE` 이어도 하는 일(스윕에 묶여 있던 일이라 안 불렀다고 빠뜨리지 않음):
   - 출력에 `SWEEP_DIALECT_PENDING <sha>` 줄이 있으면 방언 검증을 직접 한 번 부르고, 결과 줄은 「4」 방언 검증 규칙대로 처리. `/dflow-merge` 본문을 다시 싣지 않도록 스크립트만 부름.
     ```bash
     node .claude/skills/dflow-merge/scripts/dialect-check.mjs run --dev '<기본브랜치>'; echo "rc=$?"
     ```
   - merge-conflict.md 「5. 사람 머지 감지」. 사람이 손으로 머지하면 agent 브랜치가 지워져 후보가 없으므로, 이것을 스윕에 묶어 두면 `merge_conflict` 표시가 영영 남음.
   - 「4」 detached HEAD 재-detach 블록. 팀장 체크아웃이 옛 커밋에 머물지 않게 함.
   - 해소 `resolved` 가 있었으면 「4」 일시 제외 해제(선행 계열)를 함.
   - `team.sweep` 은 기록 안 함(스윕을 안 했음). `resolved` 개수는 다음에 실제로 도는 스윕의 `team.sweep` 에 실음.
4. 예외 — 사전 검사 없이 늘 부름:
   - 「1. 시작」 첫 스윕과 「7. 마감」 마지막 스윕. 실행마다 한 번뿐이고, 그 보고가 사람이 그 시점에 읽는 현황. 후보 없으면 `/dflow-merge` 가 스스로 0건으로 끝남.
   - `needs-merge` 결과가 온 기상. 워커가 서버 approved 를 확인한 머지 대상이 있어 검사는 어차피 후보를 냄.
   - 사람이 "스윕해"·"머지해" 처럼 직접 요청한 경우.

   위 예외여도 한 기상에 최대 1회는 같음(1번).

### 4-1. 머지 충돌 해소

스윕이 "머지 실패(충돌)" 을 낸 id8 은 `references/merge-conflict.md` 「1. 충돌 접수」 로 넘김.
- 해소 조건: 이 신원의 주문(`mine`)만, 한 작업에 3번까지, 같은 기준에서 다시 충돌한 게 아닐 때만.
- 해소 큐에 넣으면 「5-2. 해소 spawn」 이 띄움.
- 나머지는 "사람이 머지해야 함" 으로 보고.
- 두 경우 모두 좌석표에 `merge_conflict` 표시를 대리로 쏨.
- 충돌 목록은 `team.conflict` 로 남음.
- 사람이 손으로 머지하면 다음 스윕 판정 기상(「4-0」, 스윕을 건너뛴 기상 포함)의 「5. 사람 머지 감지」 가 표시를 풂.
- 절차 정본 = 그 문서. Bash `cat` 으로 읽음.
```bash
cat .claude/skills/dflow-team/references/merge-conflict.md
```
## 5. 팀원 spawn

0. 입장 제어 = spawn 블록이 집행 (「5-3. 입장 제어」).
   - 5항에서 도는 backends.md spawn 블록이 첫 단계에서 `capacity.mjs` 호출.
   - 막히면 `SPAWN_DEFERRED_CAPACITY` 출력 후 아무것도 만들지 않고 끝남.
   - 그러면 6항(`team.spawn`·진행 중 제외) 안 함 → 작업을 대기 큐에 되돌림 → 이번 기상의 나머지 spawn 도 안 함.
   - 재개(「5-1」)·해소(「5-2」)·재투입도 같음.
   - **새 작업만** 그 블록 전에 주간 사용량도 확인: `node .claude/skills/dflow-team/scripts/capacity.mjs usage --live <점유 슬롯 수(이번 기상에 띄운 것 포함)> --state "$(git rev-parse --git-path dflow-team.usage)"`.
   - exit 1(`CAPACITY_USAGE_STOP`, `CAPACITY_USAGE_CAP … defer=1`)이면 `SPAWN_DEFERRED_CAPACITY` 와 같이 새 작업만 미룸.
   - 알림은 `notify=1` 일 때만, 그 줄 그대로 한 줄. 근거 = rationale.md 「5-3」.
1. 그 id8 이 재구성한 슬롯 표에 있으면 안 띄움 (poll 이 겹쳐 같은 ready 를 두 번 돌려줘도 한 번만).
2. 슬롯 번호 결정(「팀장 상태」 발급 규칙) → `AGENT_ID = <신원>/<host>/w<slot>` 생성.
3. TSK = show 필터 `ref`(`.order.item.external_ref`)에서 마지막 `/` 뒤. order = `.order.id`.
   **4번은 별도 Bash 호출 → 이 줄의 셸 변수 못 봄. 값을 이 자리에서 출력하고, 그 출력을 4번 포인터에 그대로 옮겨 씀.**
   ```bash
   order='<order>'   # show 출력의 .order.id(전체 UUID)를 옮겨 쓴다
   TASK_DIR=$(node .claude/skills/dflow-work/scripts/dflow.mjs taskdir "$order"); rc=$?
   echo "TASK_DIR=${TASK_DIR:-없음} rc=$rc"
   node .claude/skills/dflow-team/scripts/docker-allow.mjs "$order" --reuse-dir "$(git rev-parse --git-path dflow-team-poll)"   # DOCKER=allow|ban — 4번 포인터에 옮긴다
   ```
   로 이 작업의 작업 폴더(`<TASKS>/<TSK>`)를 구함.
   - `taskdir` 는 `external_ref` 를 모름 → `ref` 가 아니라 `order` 를 넘김.
   - `rc` ≠ 0(exit 2 `PROJECT_MISMATCH`·`AMBIGUOUS_DOCS_DIR`, exit 6 `NO_REF`)이면 **spawn 안 함**.
   - 그 id8 을 일시 제외에 넣음 → 사유 `작업 폴더 해석 실패(exit $rc)` 보고 → `team.result`(slot `-`, status `skipped`) 기록 → 다음 후보.
   - poll exit 0 갈래의 spec 부재·TSK 없음과 같은 처리.
4. 포인터 **한 줄** 생성.
   - 백엔드에는 워커 프롬프트 전문 대신 이 포인터를 넘김.
   - 워커가 `references/worker-prompt.md` 를 읽고 그 규칙대로 실행.
   - 포인터는 치환 변수만 전달.
   ```
   <MAIN_CHECKOUT>/.claude/skills/dflow-team/references/worker-prompt.md 를 읽고 그 규칙대로 실행하라. TSK=<TSK> ID8=<id8> AGENT_ID=<신원>/<host>/w<slot> MAIN_CHECKOUT=<팀장 체크아웃 절대경로> BACKEND=pane MODEL=<opus|sonnet|default> DEV_BRANCH=<개발브랜치> TASK_DIR=<작업 폴더> DOCKER=<allow|ban> SCOPE=<full|design|build>
   ```
   - `DOCKER` = 3번 블록 `docker-allow.mjs` 출력값 (「인자」 「도커 허용 태그」).
     - 재개(「5-1」)·재시작(restart.md 재투입)도 이 형식으로 포인터 재작성, 그때도 `docker-allow.mjs` 로 다시 구함.
     - 해소(「5-2」)는 merge-conflict.md 해소 포인터에 같은 방법으로 실음.
     - 옛 포인터 값 옮겨 쓰기 금지.
   - `DEV_BRANCH` = 전제 검사의 `base`. `TASK_DIR` = 3번 출력값.
     - 워커는 둘을 다시 해석 안 함 (detach 된 옛 커밋에서는 다른 값이 나올 수 있음).
   - 전문을 셸 인자로 넘기면 백틱·따옴표·여러 줄이 섞여 깨짐.
     - 워커 프롬프트 경로는 절대경로 (새 워크트리에 스킬이 없을 수 있음).
   - `BACKEND` = 언제나 `pane` (두 백엔드 모두 팀원이 화면에서 멈춰 답을 기다림, worker-prompt.md).
   - `SCOPE` = 그 주문의 서버 판단 `action` (계약 2.11).
     - 새 작업: poll 줄 넷째 칸. 비었으면(옛 서버) `full`.
     - 재개(「5-1」)·재시작(restart.md 재투입): `references/resume.md` 「서버 판단 확인」 의 `action`(`full`·`design`·`build`, 그 밖은 `full`).
     - 워커는 잡힌 작업에서 서버 `claim_scope` 를 따름.
   - 모델은 공백 든 `--model opus` 대신 `MODEL=` 로 전달. 워커가 `{MODEL_FLAG}` 로 바꿈 (`default` 면 빈 값).
     - 두 백엔드 모두 같은 값을 `.dflow-run` 의 `claude` 호출에도 붙임 (backends.md).
5. **띄우기 직전** `references/restart.md` 「중단 표식 정리」 블록 실행 (`order` = show 필터 `order`, `st` = `status`).
   - `CANCEL_MARK_RM_FAILED` 면 안 띄움 → 그 id8 을 일시 제외에 넣고 사유 보고.
   - 이어서 backends.md 해당 절 명령 그대로 띄움.
   - backends.md 는 통째로 읽지 않고, 머리 「읽는 법」 의 `sed` 명령으로 spawn 절만 읽음 (Orca 는 「pane(Orca)」 도).
   - **pane(tmux)**: 팀장 체크아웃에서
     `git worktree add --detach <MAIN>/.claude/worktrees/dflow-<id8> origin/<기본브랜치>` 로 워크트리 생성.
     1. `.dflow.local`(레거시 `.env`)·스킬 링크 연결.
     2. 포인터를 `<워크트리>/.dflow-prompt` 에, 실행 스크립트를 `<워크트리>/.dflow-run` 에 씀.
     3. 서버 없으면 `new-session`, 있으면 `split-window` 로 pane 생성 (명령 전문 = backends.md 「pane(tmux)」).
     4. pane id 를 `<워크트리>/.dflow-pane` 에 씀.
     5. `allow-set-title off` 설정 → `select-pane -T` 로 이름표 `w<slot> · <TSK> <id8> · <작업 이름>`.
     6. **이어서 폴더 신뢰 확인 루프 필수** (넘기면 팀원이 첫 화면에서 멈춰 슬롯 하나가 놂).
     - 기점 = `origin/<기본브랜치>` 명시. 스택 기점은 `/dflow-dev` Phase 01 2번이 claim 전에 맞춤.
   - **pane(Orca)**:
     1. backends.md 「pane(tmux)」 스폰 블록의 처음(입장 제어 두 줄 포함)부터 `chmod +x "$WT/.dflow-run"` 줄까지 **그대로, 한 번의 Bash 호출 안에서** 실행.
     2. 이어서 (tmux 의 `has-session` 대신) backends.md 「pane(Orca)」 의 `orca terminal create --worktree "path:$WT" … --command ./.dflow-run --json` 블록 실행.
     3. `WT` = tmux 와 같은 `<MAIN>/.claude/worktrees/dflow-<id8>`.
     4. 결과 JSON 핸들을 슬롯 표와 `$WT/.dflow-pane` 에 저장. 핸들 없으면 화면 읽기 없이 git·서버 증거만 사용.
     5. **이어서 폴더 신뢰 확인 루프 필수** (backends.md 「pane(Orca)」 「폴더 신뢰 확인」).
        `I trust this folder` 가 보이면 키를 보내지 않고 "사람 확인 필요"로 보고.
     6. 이후 이 워크트리는 `--worktree "path:$WT"` 선택자로 가리킴.

   팀원을 Agent 도구 서브에이전트로 띄우지 않음 (머리말 「제1 제약」).
6. spawn 직후 `team.spawn` 에 `slot`·`tsk`·`order`·`id8`·`worktree`·`handle`·`spawn_kind` 기록.
   - 새 작업 → `spawn_kind` = `new`.
   - `worktree` = 팀원 워크트리 절대경로 (모르면 `-`).
   - `handle` = `tmux:<pane_id>` 또는 Orca 터미널 핸들 (없으면 `-`).
   - 재구성이 이 기록으로 슬롯과 작업을 이음.
   - id8 을 영구 제외(진행 중)에 넣음. 빠뜨리면 압축 뒤 재구성이 그 작업을 놓침.

같은 작업 재spawn 은 여섯뿐 (위 0-6 단계 번호와 구별하려고 ①-⑥ 로 적음):
- ① poll 이 그 작업을 다시 돌려준 경우 (일시 제외가 풀린 `skipped`, 제외 안 하는 `failed rate-limit`).
- ② 고아 스캔이 "재개 가능" 으로 분류한 중단 작업.
- ③ `--resume` 으로 사람이 지목한 작업.
- ④ 자동 재시작(`references/restart.md`)이 다시 띄우는 작업.
- ⑤ 「5-2. 해소 spawn」 의 해소 워커. 주문이 `reported`·`approved` 라 개발 재spawn 이 아님. `resolve-decide.mjs` 판정 안에서만 띄움.
- ⑥ 「설계 승인」 된 작업의 이어 가기 (계약 2.11, 「2-3」 의 `build`).

- ① = 이 절 / ⑤ = 「5-2」 / ②③④⑥ = 이 절이 아니라 「5-1. 재개 spawn」 절차 (워크트리 새로 안 만들고 claim 도 안 함).
- `blocked` 는 재spawn 안 함. 팀원이 자기 화면에서 답을 기다리므로 그 자리에서 이어 감 (「6. blocked」).
- 다시 띄울 때 이름·브랜치 충돌은 backends.md 「고아 정리 규칙」 5번(생성 브랜치 정리)과 결과 처리의 워크트리 정리가 맡음.

### 5-1. 재개 spawn

중단된 작업을 이어 띄움. 새 작업 spawn 과 차이 둘: **워크트리 새로 안 만듦**(남아 있으면 그대로 사용), **claim 안 함**.

대상 다섯:
- 고아 스캔 "재개 가능" (**자동**, 대기 큐보다 먼저)
- 좌석표 「이어서 시작」 의 `resume_requests` (**요청**, 재시도 상한 무시)
- `references/restart.md` 「재투입」 (**재시작**)
- `--resume <id8>` (**지목**, 자동 판정의 거부 사유 무시. 서버 status 가 `claimed` 일 때만 재개)
- 「2-3」 `build` 의 claimed 원소 (**승인**, 계약 2.11. 워크트리 없으면 원격 agent 브랜치에서 생성)

띄울 때마다:
1. `references/resume.md` 를 Bash `cat` 으로 읽음.
2. 「서버 판단 확인」(계약 2.11)과 0-9항 절차를 그대로 따름: 입장 제어 → 손실 보고 → 다른 PC 경고 → 워크트리 확보 → `TASK_DIR`·`DOCKER` → 슬롯·`.dflow-agent` 되돌리기 → 포인터 재작성 → 중단 표식 정리·띄우기 → 옛 `.result` 삭제 → `team.spawn`(`resume`).

### 5-2. 해소 spawn

해소 큐의 작업을 해소 전용 워커로 띄움.
- 워크트리 = `origin/<기본브랜치>` 에 detach 한 `<MAIN>/.claude/worktrees/dflow-<id8>-resolve`.
- 포인터 = `references/resolve-prompt.md` 가리킴.
- `team.spawn` 의 `spawn_kind` = `resolve`.
- 재개 다음·대기 큐보다 먼저 띄움.
- 동시 상한 `max(1, ⌊인원/2⌋)` (인원 = 「인자」 인원 상한으로 자른 뒤 값. 16GB PC 기본 상한 4 면 해소 2개까지).
- claim 안 함.
- tmux·Orca 띄우기, 신뢰 확인 루프, 이름표(`w<slot> · 해소 <TSK> <id8>`)는 5번과 같음.
- 입장 제어도 같음 (「5-3」): merge-conflict.md 가 backends.md 공용 스폰 블록을 그대로 돌리므로 그 첫 단계가 집행.
- `SPAWN_DEFERRED_CAPACITY` 면:
  - 해소 큐에 그대로 둠.
  - merge-conflict.md 「2」 5-7번(`team.spawn`·표시 note·감시 루프 항목) 안 함.
  - 띄우지 않았으므로 해소 시도로 안 셈. `team.spawn`(`resolve`) 줄 수 = 해소 카운터이고 그 id8 을 진행 중(영구 제외)으로 만들기 때문.
- 절차 정본 = `references/merge-conflict.md` 「2. 해소 spawn」, 결과 처리 = 같은 문서 「4」.

### 5-3. 입장 제어 (spawn 직전 자원 확인)

**입장 제어 정본 = 이 절** (「5」 0항·「5-2」·`references/resume.md` 0항·backends.md 「입장 제어」·restart.md 「재투입」 이 이 절을 가리킴).
- 팀원 세션을 새로 띄우기 직전마다 PC 여유 자원 확인.
- 대상: 새 작업(「5」)·재개와 재투입(「5-1」)·해소(「5-2」)·차단기의 시험 spawn 모두.
- 이미 모자란 PC 에 팀원을 더 얹지 않음.
- **이미 떠 있는 팀원은 건드리지 않음** (끄거나 멈추지 않음).
- 무거운 명령 자체의 동시 실행은 워커 쪽 `heavy.mjs`(`dev-discipline.md` 「무거운 명령 줄 세우기」)가 따로 묶음.

**집행 = spawn 블록 한 곳.**
- backends.md 「입장 제어」 블록이 아래 명령을 호출. 막히면 `SPAWN_DEFERRED_CAPACITY` 출력 후 끝.
- 새 작업(「5」)·해소(「5-2」)의 spawn 블록(backends.md 「팀원 워크트리 준비」)은 두 백엔드 모두 그 두 줄로 시작 → 블록을 돌기만 하면 걸림.
- 블록을 통째로 안 도는 자리(재개·재투입: `references/resume.md` 0항, restart.md 「재투입」)는 「입장 제어」 블록을 첫 단계로 따로 실행 (워크트리를 새로 안 만들고 있는 것을 이어 씀).
```bash
node .claude/skills/dflow-team/scripts/capacity.mjs --state "$(git rev-parse --git-path dflow-team.capacity)"; echo "rc=$?"
```
- `CAPACITY_OK`(rc=0): 띄움.
- `CAPACITY_LOW`(rc=1) = 블록의 `SPAWN_DEFERRED_CAPACITY`: 이번 기상에 팀원 새로 안 띄움.
  - 후보는 대기 큐에 그대로 둠 (재개 대상 = 재개 목록, 해소 = 해소 큐, 재투입 = 재시작 대기).
  - 한 후보가 막히면 같은 기상의 나머지 후보도 안 띄움.
  - 작업 탓 아님 → `team.result` 안 남기고 일시 제외에도 안 넣음.
  - 다음 기상(늦어도 `TICK`)에 다시 확인.
- `CAPACITY_UNKNOWN`(rc=0): 판정 불가 OS 이거나 측정 명령 실패. 막지 않고 띄움 (성능 보호이지 보안 가드 아님).
  - 일부 항목만 못 읽었으면 `unknown=` 에 적히고, 읽은 항목으로 판정.
- **알림은 줄 끝이 `notify=1` 일 때만** 사람에게 한 줄.
  - `CAPACITY_LOW` → "자원 부족으로 새 팀원 보류: <출력 줄>"
  - `CAPACITY_OK` → "자원 회복, 팀원 spawn 재개"
  - `CAPACITY_UNKNOWN` → "자원 판정 불가(막지 않음): <출력 줄>"
  - `notify=0` 이면 알리지 않음.
  - 상태 파일(git-path `dflow-team.capacity`) = 마지막 판정과 시각 기록. 판정이 바뀔 때만 `notify=1` → `TICK` 마다나 컨텍스트 압축 뒤 같은 알림 반복 없음.
- 기준값 정본 = `capacity.mjs` 머리. 하나라도 걸리면 `CAPACITY_LOW`:
  - macOS 메모리 압박 warn 이상
  - 여유 메모리 30% 미만
  - 5분 load average 가 코어당 2.0 초과
  - 무거운 명령 슬롯의 대기자 수 ≥ 슬롯 수 (`heavy_wait=<대기>/<슬롯>`, `heavy.mjs status` 첫 줄에서 읽음)
- 스왑은 RAM 의 150% 이상일 때만 막는 극단 안전망 (macOS 스왑은 압박이 풀린 뒤에도 몇 시간씩 남음).
- `heavy.mjs status` 를 못 읽으면 그 항목만 판정 안 함 (`unknown=heavy`).
- 사람이 바꾸려면 팀장 세션 환경변수 `DFLOW_CAP_MIN_FREE_PCT`·`DFLOW_CAP_MAX_LOAD_PER_CPU`·`DFLOW_CAP_MAX_SWAP_PCT` 로 덮음.

## 6. blocked

**공통**:
- 사람에게 AskUserQuestion 으로 안 물음 (자동 루프).
- 결과 처리가 `team.blocked` 기록.
- PushNotification 도구가 있으면(지연 로드면 ToolSearch 로 불러) 질문 요약으로 한 번 알림. 없으면 화면 통지만.
- 그 id8 은 진행 중으로 영구 제외에 남김.

**그 슬롯은 blocked 팀원이 계속 잡음. 다른 작업에 재배정 안 함.**
- 살아 있는 프로세스 둘이 같은 `AGENT_ID` 로 heartbeat 를 보내면 좌석표가 한 인물을 두 책상에 그림.
- 두 백엔드 모두 팀원이 같은 워크트리·브랜치에서 이어 감. 재spawn·재claim 없음.
- `.result` 가 새 줄로 바뀌면 감시 루프가 알림.

**tmux**: "결정 필요 <id8>: <질문>. `TMUX= tmux -L dflow attach` 로 붙어 그 pane 에서 직접 답하거나, 이 세션에
`<id8> <답>` 으로 답하라" 고 알림.

**Orca**: "결정 필요 <id8>: <질문>. Orca 의 `w<slot> · <TSK> <id8> · <작업 이름>` 탭에서 답하라" 고 알림.

**답 매칭(tmux)**
- 답 형식 = `<id8> <답>` (여러 팀원의 질문이 동시에 쌓일 수 있음).
- 답을 기다리는 `blocked` 가 하나뿐이면 id8 없는 답도 그 작업의 답으로 봄.
- 여럿인데 id8 이 없으면 어느 작업의 답인지 되물음.
  - 루프가 돈 뒤 팀장이 사람에게 묻는 곳은 여기 하나 (시작 전 인자 질문은 「인자」).
  - 답을 엉뚱한 작업에 넣지 않음.
- 답을 넣기 **전에** "그 pane 에 답을 넣는다" 를 한 줄 알림 (사람이 같은 pane 에 동시에 치면 입력이 섞임).
  ```bash
  TM='<진짜 tmux 절대경로>'; PANE=$(head -n 1 '<워크트리>/.dflow-pane')
  d=$("$TM" -L dflow list-panes -t "$PANE" -F '#{pane_dead}' 2>/dev/null | head -n 1)
  if [ "$d" = 0 ]; then
    "$TM" -L dflow send-keys -t "$PANE" -l -- '<답 한 줄>'
    "$TM" -L dflow send-keys -t "$PANE" Enter
    echo ANSWER_SENT
  else
    echo "PANE_GONE dead=$d"
  fi
  ```
  `-l --` 로 넣음 (없으면 tmux 가 답을 키 이름으로 먼저 해석. backends.md 「생존·화면·답·회수」).
- `PANE_GONE` = 그 팀원은 이미 끝남. 답을 못 넣으므로:
  - "그 팀원은 이미 끝났다. 수동 `/dflow-dev <id8>` 대상" 으로 보고.
  - 영구 제외에 남김 → 슬롯 해제.
  - 워크트리는 「고아 정리 규칙」 을 따름.
- `ANSWER_SENT` 면 `team.answer`(id8, answer) 기록 (없으면 압축 뒤 재구성이 이미 답한 질문을 다시 통지).
- 슬롯은 그대로 둠. 팀원이 그 자리에서 이어 가므로 새로 띄울 것 없음.

## 7. 마감

진입 조건:
- poll exit 8
- poll 오류 exit
- `failed not-isolated`
- 기상 때 확인한 종료 시각 경과
- 종료 요청 (`STOP_REQUESTED` 또는 사람의 말)

잠금 상실(「2-3」 `LOCK_LOST`)과 lease 상실(`LEASE_LOST`)은 「잠금 상실 마감」·「lease 상실 마감」 으로 감.

들어서면:
- 먼저 아래를 읽고 그 절차(1-7, 잠금 상실 마감, lease 상실 마감)를 그대로 따름.
- 새 spawn 은 곧바로 멈춤.
```bash
cat .claude/skills/dflow-team/references/closing.md
```

## 좌석표 연동

- 팀원 좌석 식별 = 워커가 쓰는 워크트리 루트 `.dflow-agent`(`<신원>/<host>/w<slot>`). 좌석표 S1 훅이 이 파일을 `heartbeat_agent` 로 읽음.
- `<신원>/<host>/parked` ≠ 좌석. heartbeat 안 보냄.
- 팀장 자신 = `<신원>/<host>/lead`. 같은 신원의 두 PC 팀장이 좌석표에서 하나로 합쳐지지 않게 함.
- 좌석표 STANDBY 신호:
  - 「1. 시작」 6번과 매 기상(「2-3」 `wake.mjs`)에서, 잠금 `owner` 신원으로 `dflow.mjs watch --agent <신원>/<host>/lead --slots <N> --busy <M> --until '<UNTIL_LABEL>'` 을 1회 보냄.
  - 「7. 마감」에서 `--stop` 을 1회 보냄.
  - 감시 루프가 TICK 을 건너뛸 때도 `wake.mjs` 로 1회 보냄 (「2-2」).
  - 좌석표는 마지막 신호 뒤 70분에 STANDBY 를 끔.
- poll.mjs 는 `DFLOW_WATCH=0` 으로 띄움 → watch 안 보냄.
- **이 호출은 표시용만이 아님.**
  - 응답의 `resume_requests` 가 좌석표 「이어서 시작」 요청을 실어 옴 → `--json` 으로 호출하고 본문을 읽음 (「2-3」).
  - 실패해도 팀장을 멈추지 않음. 단 실패를 "요청 없음" 으로 읽지 않음.
  - 「1. 시작」 6번과 「7. 마감」 의 `--stop` 은 종전대로 결과를 안 봄.
- 팀원의 blocked 직전 heartbeat(worker-prompt.md)가 좌석표에 손 든 상태를 남기고, 다음 heartbeat 가 해제.

## 금지

- 팀원에게 AskUserQuestion 을 쓰게 하기. 팀장이 사람에게 묻는 곳 = 시작 전 인자 질문(「인자」)과 답 매칭의 id8 되묻기, 둘뿐.
- 팀장이 작업을 claim·progress·done 하기. 서버 쓰기는 팀원 몫 (스윕의 머지만 팀장).
  - 재개도 같음: 서버가 이미 `claimed` → 다시 claim 안 함. 끊긴 Phase 를 잇는 것은 이어받은 워커의 `/dflow-dev --worker`.
  - 예외 넷:
    1. 머지 충돌 표시 heartbeat(`merge_conflict` 설정·해제, `references/merge-conflict.md` 「3」)는 팀장이 함. 주문 상태 안 바꾸고 표시 열만 씀.
    2. 팀장이 띄운 해소 워커의 `/dflow-merge --resolve` 가 개발 브랜치에 한 건을 머지·push. "스윕의 머지만 팀장이 한다" 의 유일한 예외. 경합은 두 쪽 모두 non-fast-forward 거부로 드러남. force push 는 여전히 금지.
    3. 「2-3」 「설계 사전 검사」 의 `design-reopen` (ready 인 구현자동 작업의 사람 설계를 되돌림 — 주문의 설계 상태만 바꿈).
    4. 「3. 결과 처리」 의 설계 멈춤 이어받기에서 부르는 `design-done` (워커가 push 까지 마친 멈춤을 서버에 기록만 함, 설계 상태 스펙 6.3).
- 팀장이 대상 리포의 소스를 고치거나 빌드·시험(gradle·npm test 등)을 직접 돌리기 (머리말 「팀장 역할」, 예외 = 「2-4」 5번). 팀원이나 해소 워커에게 넘김.
  - 예외: 스킬이 팀장에게 맡긴 스크립트(`dialect-check.mjs` 등)가 안에서 시험을 돌리는 것.
- 한 기상에 스윕을 두 번 이상 호출하기. `sweep-check.mjs` 가 `SWEEP_NONE` 인데 `/dflow-merge` 를 호출하기 (「4-0」 의 예외 제외).
- 팀원을 Agent 도구 서브에이전트로 띄우기 (`isolation: "worktree"` 를 주어도). 머리말 「제1 제약」.
- tmux 를 PATH 로 호출하기 (Orca shim 이 잡음). 언제나 전제 검사가 구한 절대경로(`TM`)로 호출 (backends.md 「진짜 tmux 찾기」).
- 팀원 워크트리에서 팀장이 git 조작하기. 예외: 읽기 조회, `parked` 표시, 「5-1. 재개 spawn」 의 `.dflow-agent` 되돌리기·포인터 재작성·옛 `.result` 삭제, backends.md 정리 절차.
- 팀장 체크아웃에서 poll.mjs 띄우기. 빈 디렉터리(「2-1」)에서만 띄움.
- 순번 참조, force push, 훅 우회(SKIP_GUARD).
- 같은 작업의 재spawn. 예외 = 「5. 팀원 spawn」 끝의 여섯뿐. `blocked` 는 재spawn 안 함.
- poll·감시 루프를 셸 `&` 로 띄우기. 둘은 Bash `run_in_background` 로만. 팀원 spawn 에도 `&` 금지 (tmux `split-window` 가 곧바로 돌아오고 pane 은 tmux 서버가 붙잡음).
- 컨텍스트 압축 뒤 Skill 도구로 `/dflow-team` 을 다시 부르기 (「팀장 상태」 「압축 뒤 첫 기상」).
