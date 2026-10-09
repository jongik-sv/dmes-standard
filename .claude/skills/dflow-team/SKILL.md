---
name: dflow-team
description: D'Flow 에서 내게 배정되고 에이전트 위임(tags:agent)된 ready 작업을 상시 감시해 슬롯 N개의 팀원에게 나눠 동시에 개발시키는 팀장 스킬. 팀원은 자기 서브에이전트를 띄울 수 있는 독립 세션(tmux pane 또는 Orca 탭)이며 각자 워크트리에서 /dflow-dev 를 돌린다. 당일·여러 날·종료 요청 전까지 실행할 수 있다. 트리거 - "/dflow-team", "팀으로 개발", "팀장 시작", "N건 동시 착수", "팀장 종료". 사용법 - /dflow-team [인원] <종료시각|종료 요청 전까지> [모델] [effort] [WP-XX…] · /dflow-team help
---

# /dflow-team: 팀장 (슬롯 N개 동시 개발)

> 문체: 에이전트 지시·보고·메시지 → `../_shared/style/Korean-STE-LLM-Guide.md`. 사람이 읽는 산출물 → `../_shared/style/Korean-STE-Writing-Guide.md`.

인자: `$ARGUMENTS`

> 윈도우: 아래 `jq` 예시 Bash 직접 칠 때 같은 호출 맨 앞에 `export PATH="$PWD/.claude/skills/_shared/bin:$PATH";` 붙임(`_shared/platform-support.md` 「문서 속 인라인 jq」).

> **컨텍스트 압축 뒤 Skill 도구로 `/dflow-team` 재호출 금지**(스킬 전체 다시 실림). 「팀장 상태」
> 「압축 뒤 첫 기상」 대로 재독 세트만 Bash `sed` 로 읽음. 재독 명령 = 매 기상 `wake.mjs` 출력 `COMPACT_REREAD` 줄.

> **위치 선언**: 설계 정본 = wbs-web 리포 docs/superpowers/specs/2026-09-10-dflow-team-design.md(킷 미동봉).
> `/dflow-poll` 1건 착수 → 슬롯 N개 동시 착수 + 상시 보충으로 확장.
> 기본 = 담당자 자리에 있는 supervised 루프. 사람이 명시하면 여러 날·종료 요청 전까지 무인으로도 돔(「인자」).
> 서버 통신 = dflow.mjs, exit code 로 분기. dflow-work 금지사항 상속.
>
> **제1 제약: 팀원을 서브에이전트로 띄우지 않는다.**
> - 팀원 = `/dflow-dev` 실행. `/dflow-dev` 는 Phase 를 서브에이전트로 쪼갬.
> - 서브에이전트는 자기 턴 끝나면 완료로 보임. 그 뒤 끝난 Phase 손자 완료가 팀원을 못 깨움.
> - 팀원 = 별도 프로세스 **대화형** claude 메인 에이전트: 팀장이 tmux pane 에 띄운 프로세스 또는 Orca 탭 프로세스(backends.md).
> - 이 문서 서브에이전트 금지 = 모두 이 조항 가리킴.
>
> **팀장 역할: 대상 리포 소스 수정 금지, build·test 직접 실행 금지.**
> - 그 일 = 팀원(이슈 보고 대응 `[팀장 지시]`) 또는 해소 워커(「4-1」)에게 넘김.
> - 팀장 직접 작업 = 이 스킬이 맡긴 것뿐:
>   - 스킬 스크립트 호출(`dflow.mjs`·`sweep-check.mjs`·`dialect-check.mjs`·`resolve-decide.mjs` 등)
>   - 팀장 체크아웃 git 조작(fetch·detach·스윕 merge)
>   - 이벤트·문제 기록, 백엔드 명령
> - 유일한 예외 = 개발 branch 자체 깨졌을 때 최소 수정(「2-4」 5번).

**참조**: 아래 문서는 해당 절차 탈 때 Bash `cat` 으로 읽음(심링크 deploy 리포 Read = 작업 디렉터리 밖 읽기 확인 부름).
근거·이력 = `references/rationale.md`(운영 시 안 읽어도 됨).

| 문서 | 읽는 때 |
|---|---|
| `references/help.md` | 인자 `help` 일 때만 |
| `references/args.md` | 인자 물어야 할 때(종료 시각 누락·오류, 키 후보 둘 이상), 키 자동 선택해 저장할 때, 키 판정이 `KEY_*`·`NO_*_KEY` 로 끝날 때. 끝 「인자 전문」 = 도커 허용 태그 세부, `--resume`·WP 범위·자동 merge 세부 필요할 때 |
| `references/start.md` | 「1. 시작」 2번 scaffold 블록, 3번 서버 claimed 대조(`list --scope claimed`), 6번 절전 방지(`caffeinate`) 실행할 때 |
| `references/lead-state.md` | 「복원 규칙」 = 압축 뒤 첫 기상 또는 `lead-state.mjs` 출력(`RUN`·`EXCLUDE_*`·`BREAKER`) 이해 안 될 때. 「고아 스캔」 = 시작 3번, 또는 살아 있는 팀원 없는 `.dflow-agent` worktree 보일 때(정리·재개·멈춤 판정, "멈춤" 표, 부트스트랩 실패 정리) |
| `references/wake.md` | `--may-skip` 붙일지 판단할 때, `LOCK_OK` 다음 줄 `reqs`·`other_project` 비어 있지 않거나 `n` = `"NULL"` 일 때, `WATCH_FAILED`·`HOLDER_FAILED`·`LEASE_KEEP_DEAD` 나왔을 때, `deps_unmet`·`deps_nohead` 후보 판정할 때(선행 사전 검사·선행 반영 사전 검사) |
| `references/result-handling.md` | 결과 줄 처리해 문제 기록 붙일 때, 「3」 표 합친 행에 든 status(`design_*`·`failed permission/rate-limit/no-result/not-isolated/project/not-assignee/deps`·`cancelled`) 나왔을 때, 결과 줄 없는 슬롯 `TICK` 에서 판정할 때(생존 증거·무응답·정지·대기·재시작) |
| `references/sweep.md` | 스윕 보고에 반려·push 실패·merge 충돌·`UNION_SET`·`DECISIONS_SEQ`·`DIALECT_*` 있을 때, 스윕이 "머지됨"·"머지됨(승인 전)" 냈거나 `resolved` 있을 때, `SWEEP_NONE` 인데 `SWEEP_DIALECT_PENDING` 나왔을 때 |
| `references/spawn.md` | 「5」 tmux·Orca 띄우기 단계 실행할 때, 해소 spawn 세부(「5-2」), 입장 제어 출력 줄 끝 `notify=1` 이거나 기준값·환경변수 바꿀 때(「5-3」) |
| `references/blocked-seat.md` | `team.blocked` 의 사람 답을 팀원 pane 에 넣을 때(「6」), `dflow.mjs watch` 호출 실패했거나 좌석표 STANDBY 꺼졌을 때 |
| `references/precheck.md` | 전제 검사가 `PRECHECK_OK` 없이 끝났거나 `WARN GRADLE_TUNING` 나왔을 때 |
| `references/extend.md` | 사람이 실행 중 연장 말할 때 |
| `references/second-lead.md` | 같은 리포에서 다른 신원 팀장 하나 더 띄울 때 |
| `references/backends.md` | spawn·회수·정리·답 넣기·고아 정리 때(그 절만) |
| `references/worker-prompt.md` | 팀장은 안 읽음(팀원 규칙. 포인터로 넘기기만 함) |
| `references/resume.md` | 재개 spawn(「5-1」) 때, 계약 2.11 에서 이어 갈지 가를 때(「서버 판단 확인」) |
| `references/restart.md` | TICK 판정·결과 줄 없는 `PANE_DEAD`·재투입·rate-limit 대기·중단 표식 정리 때 |
| `references/design-ahead.md` | 빈 슬롯에 선행 대기 작업 설계 선행으로 줄 때, `design_waiting` 결과·설계 완료 대기 worktree(고아 스캔 0번) 다룰 때 |
| `references/design-state.md` | 계약 2.11 에서 poll 후보 설계 사전 검사, 「설계 승인」 된 작업(`build`), 설계 상태 결과 처리 때 |
| `references/merge-conflict.md` | merge 충돌 접수·해소 spawn·해소 결과·사람 merge 감지 때 |
| `references/issues.md` | 팀원 SendMessage 이슈 보고 도착했을 때(「2-4」) |
| `references/closing.md` | 「7. 마감」 진입 때(잠금 상실·lease 상실 마감 포함) |
| `references/events.md` | 기록 명령 절 = 매 기상 `wake.mjs` 가 띄움. 이벤트 표 = 필드 궁금할 때 |

문제 기록: 팀원 겪은 에러·문제점 → 팀장 체크아웃 `docs/dflow-team/issues.md` 에 누적(「3. 결과 처리」). 스킬 개선 재료, commit 안 함.

- `dflow.mjs` = `node .claude/skills/dflow-work/scripts/dflow.mjs`. `.dflow`·`.dflow.local`(레거시 `.env`) 스스로 읽으므로 접두 안 붙임.
- `<기본브랜치>` = 「1. 시작」 전제 검사 구한 이름.
- `<MAIN>`·`<MAIN_CHECKOUT>` = 팀장 체크아웃 절대경로.
- `<신원>`·`<host>` = 「1. 시작」 전제 검사 만든 슬러그.

## 인자

`/dflow-team [인원] <종료시각|종료 요청 전까지> [모델] [effort] [WP-XX…]`. 예: `/dflow-team 18:00`,
`/dflow-team 4명 18시까지 opus`, `/dflow-team 18:00 WP-02 WP-03`, `/dflow-team 3일 뒤 06:00까지`,
`/dflow-team 종료 요청 전까지`, `/dflow-team 18:00 opus effort xhigh`.

- 인자 = 자연어 해석. 플래그 문법 강제 안 함.
- **`help`**: 인자 `help`·`--help`·`-h`·`도움말`·`사용법` 중 하나면 `references/help.md` Bash `cat` 으로 읽어 그대로 보여 주고 **끝냄.**
  - 전제 검사·잠금·서버 호출 안 함.
  - 그 파일 = 이때만 읽음.
- **강제 인수**: 인자에 `--takeover`·`강제 인수`·`넘겨받기` 있으면 「1. 시작」 `<TAKEOVER>` = `--takeover`, 없으면 빈 값.
  - 같은 신원이 이 프로젝트 팀장 lease 를 **다른 곳**(다른 clone·다른 PC)에서 쥐면 빼앗음.
  - 밀려난 팀장 약 1분 안에(다음 갱신 + 감시 루프 20초) `LEASE_LOST` 로 멈춤. 그 팀장 워커는 하던 작업 끝냄.
  - 사람이 명시할 때만 사용.
- **키 판정**: `.dflow.local` `pats`(레거시 `.env` `DFLOW_PATS`)에 토큰 둘 이상이면 시작 전에 돌릴 키 정함.
  - 「1. 시작」 전제 검사 **전**, 다른 인자 질문보다 **먼저** 함.
  - 정본 = `.dflow.local` `as=<prefix>`(레거시 `.env` `DFLOW_AS`). `dflow.mjs`·`poll.mjs`·팀원(`.dflow.local` 심링크)·heartbeat 훅 모두 그 값 따름.
  - 키 = `.dflow.local` 처럼 **worktree 마다 따로** 정함(주 체크아웃, 「두 번째 팀장」 의 팀장 worktree 마다). 팀원 = 자기 팀장 키 따름.
  ```bash
  (echo "as=$(node .claude/skills/dflow-work/scripts/dflow.mjs config as)"; node .claude/skills/dflow-work/scripts/dflow.mjs profiles) \
    | node .claude/skills/dflow-team/scripts/live-leads.mjs --mark
  ```
  - 출력 = 토큰마다 한 줄 JSON(`prefix`·`name`·`email`·`who`·`bound`·`selected`·`in_use`, 실패한 토큰은 `error`). 필드 뜻 = `references/args.md` 「키 판정 상세」.
  - `in_use` ≠ `null` 키(다른 worktree 살아 있는 팀장이 쓰는 신원) = 시작 불가.

  | 상태 | 처리 |
  |---|---|
  | `as`(레거시 `DFLOW_AS`) 있음(값 비지 않음) | 안 묻음. `selected` = `true` 인 행 없으면 `KEY_NOT_FOUND`, 그 행 `in_use` ≠ `null` 이면 `KEY_IN_USE` 로 끝 |
  | 없고 토큰 1개 | 그 행 `in_use` ≠ `null` 이면 `KEY_IN_USE` 로 끝, 아니면 그대로 진행 |
  | 없고 토큰 2개 이상 | `error` 없음 · `bound` = `true` · `in_use` = `null` 인 행 = 후보 |
  | → 후보 0개 | `bound` = `true` 행 하나도 없으면 `NO_KEY_FOR_PROJECT`, 있는데 모두 `in_use` 면 `NO_FREE_KEY` 로 끝 |
  | → 후보 1개 | 그 키 자동 선택 |
  | → 후보 2개 이상 | AskUserQuestion 으로 질문. 종료 시각도 물어야 하면 같은 호출에 모음 |

  - `bound` = `null`(프로젝트 바인딩 없음)이면 키 판정 건너뛰고 전제 검사로 감.
  - 묻기·자동 선택한 키 저장·끝낼 때 보고 문구 = `references/args.md` 「키 판정 상세」 대로(자동 선택이든 답이든 고른 prefix 저장).
- **종료 시각 = 유일한 필수 인자.** 새 배정 멈추는 시각. 세 형식 중 하나로 정규화.
  - 정규화 값 = `<UNTIL>`, 좌석표 싣는 표시 문자열 = `<UNTIL_LABEL>`.

  | 말 | `<UNTIL>` | `<UNTIL_LABEL>` |
  |---|---|---|
  | `18:00`, "18시까지" (오늘) | `18:00` | `18:00` |
  | "내일 아침 7시", "3일 뒤 06:00", "월요일 09:00", `2026-09-21 06:00` | `2026-09-21 06:00` | `09-21 06:00` |
  | "종료 요청 전까지", "무기한", "계속", "끝날 때까지" | `none` | `종료요청까지` |

  - 날짜 붙은 말 = 오늘 날짜(`date +%Y-%m-%d`) 기준 절대 날짜로 변환. "N일 뒤" = 오늘+N일, 요일 = 오늘 이후 가장 가까운 그 요일.
  - 시각만 있고 오늘 이미 지났으면 **내일로 추측하지 않고** 묻음.
  - 날짜 붙은 종료 시각 = 지금부터 **7일 이내**(`UNTIL_TOO_FAR`). 더 길게 = `종료 요청 전까지` 사용.
  - 시작 보고 첫 줄 = 정규화 절대 시각(또는 "종료 요청 전까지").
  - **종료 요청**: 종료 시각 전이라도, 또는 `none` 이면 언제든 둘 중 하나로 멈춤. 둘 다 「7. 마감」 으로 감.
    1. 팀장 세션에 말로 함: "팀장 종료", "마감해", "그만" 같은 말.
    2. 다른 세션·터미널에서 종료 파일 생성. 감시 루프가 20초 안에 보고 `STOP_REQUESTED` 로 팀장 깨움.
       ```bash
       touch "$(git -C <팀장 체크아웃> rev-parse --git-path dflow-team.stop)"
       ```
  - 종료 시각 없음·이미 지남·형식 틀림·7일 초과면 사용법만 출력하고 끝내지 않고 **AskUserQuestion 으로 질문.**
    - 질문 시점 = 「1. 시작」 전제 검사 **전**(잠금 쥔 채 답 기다리지 않음).
    - 한 호출에 모아 질문. 선택지·다시 묻기·사용법 출력 = `references/args.md` 「인자 질문」 대로.
    - 종료 시각 있으면 나머지 선택 인자 안 묻고 기본값 사용.
  종료 시각 지나면 새 배정 멈춤. 진행 중 팀원은 대기 상한까지 기다린 뒤 남은 것 목록으로 보고(「7. 마감」).
  - **실행 중 연장**: 사람이 "내일 9시까지 연장" 처럼 말하면 `references/extend.md` 대로(`team.extend` 기록, poll·감시 루프·좌석표 갱신, 마감 중이면 마감 취소). **`team.start` 새로 쓰기 금지.**
- **여러 날·무기한 실행**(`<UNTIL>` ≠ 오늘 또는 `none`): 시작 보고에 "팀원은 권한 확인 생략 모드로 무인으로 돕니다. 답을 기다리는 팀원은 사람이 답할 때까지 슬롯을 잡습니다." 한 줄 더 적음.
  - macOS 면 절전 방지 검(「1. 시작」 6번).
  - 서버(Linux)·Windows = 절전 방지 안 검.
- 인원 = 동시 팀원 슬롯 수. **기본 3, 인원 상한 = 이 PC `min(6, K+2)`.**
  - K = 무거운 명령 슬롯 수(`heavy.mjs` 와 같은 계산: `DFLOW_HEAVY_SLOTS`, 없으면 `max(1, ⌊RAM_GB/8⌋)`). 16GB = 4명, 32GB 이상 = 6명.
  - 상한 = 아래로 구함. 인원(기본 3 포함) > 상한 → 상한으로 자르고 출력 줄과 함께 한 줄 알림.
  ```bash
  node .claude/skills/dflow-team/scripts/capacity.mjs max
  ```
  - 출력 = `TEAM_MAX <상한> k=<K> ram=<GB>GB source=<default|DFLOW_TEAM_MAX>` 한 줄.
  - 상한 변경 = 팀장 세션 환경변수 `DFLOW_TEAM_MAX`(1-6)로 덮음. 6 초과 불가(`clamped=` 붙음).
- **도커 허용 태그: 팀원은 도커 미사용이 기본(인원 무관). D'Flow 작업 tags 에 `docker` 있는 Task 의 팀원에게만 허용.** 이 판정 정하는 곳 = 이 줄 하나.
  - 새 작업·재개·재시작·해소 포인터 쓸 때마다 띄우기 직전 `node .claude/skills/dflow-team/scripts/docker-allow.mjs <id8>` 로 그 작업 서버 tags 다시 읽음.
  - 출력 `DOCKER=allow`·`DOCKER=ban` 포인터에 그대로 실음(「5. 팀원 spawn」 3·4번, `references/resume.md` 4·6항, merge-conflict.md 「2」 4번).
  - 조회 실패 = `ban`(모르면 금지).
  - 옛 포인터(`.dflow-prompt`) 값 옮겨 쓰기 금지(옛 `NO_DOCKER=0` 허용으로 읽지 않음).
  - 세부(허용된 팀원의 도커 슬롯 `heavy.mjs --pool docker`, DB 방언 검증 소관, `no_docker=1` 강제 스위치, 태그 지정법, 도커 사용 규칙 정본) = `references/args.md` 「인자 전문: 도커 허용 태그 세부」.
- 모델 = 선택(`opus`|`sonnet`). 없으면 포인터에 `MODEL=default` 넘겨 기본 모델 사용.
  - 값 = 팀원이 `/dflow-dev --model` 로 넘김.
  - 두 백엔드 모두 팀원 띄우는 `.dflow-run` `claude --model` 에도 붙임.
- **추론 강도(effort) 기본 `high`.** 사람이 `effort xhigh`·`추론 강도 max` 처럼 요청할 때만 변경.
  - 값 = `low`|`medium`|`high`|`xhigh`|`max` 중 하나. 그 밖 값 → 한 줄 알림 + `high` 사용.
  - 정한 값 = `<EFFORT>` 기억. 두 백엔드 모두 `.dflow-run` `claude` 호출에 `--effort <EFFORT>` 붙임(backends.md 「팀원 워크트리 준비」).
  - 모델·effort 는 안 묻음.
- **설계 방식은 인자 아님**(계약 2.11, 설계 상태 스펙 D27). 사람이 WBS 작업 패널에서 작업마다 고르고, 팀장은 서버 판단 `action` 포인터 `SCOPE` 로 넘김(「5」 4번).
  - 옛 인자 "설계만"·"구현부터" 오면 안 쓰고 한 줄 알림.
- **재개 인자 `--resume <id8>[ <id8>…]`** 선택. 자연어 "443b8ffe 재개" 도 같게 해석.
  - 이 인자 없어도 이 PC 에 남은 중단 팀원 worktree 자동으로 이어받음(「팀장 상태」 고아 스캔의 "재개 가능" 분류).
  - `--resume` = worktree 이 PC 에 없는 작업·다른 PC 가 claim 한 작업을 사람이 지목해 이어받게 함(「5-1」).
  - 지목한 id8 = 자동 판정 거부 사유 무시. 띄우기 전에 남은 것·잃는 것 한 줄 보고.
  - 세부(계약 2.11 `mine` 거짓이면 안 띄움 포함) = `references/args.md` 「인자 전문: --resume 세부」.
- **WP 범위 `WP-XX`** 선택. 여럿이면 공백·쉼표로 적음. 모듈 여럿인 프로젝트에서 한 모듈로 좁히려면 `dict/WP-02` 처럼 모듈 앞에 붙임.
  - 자연어 "2번 WP만" → `WP-02` 로 해석. 없으면 전체.
  - 범위 = **새 배정만** 좁힘(poll `--wp`).
  - 재개·「이어서 시작」·승인 스윕 = 범위 무관.
  - 범위는 `team.start` `wp` 에 남겨 압축 뒤 복원.
  - 판정 기준(`external_ref` TSK 번호 첫 칸)·`skipped` 처리 = `references/args.md` 「인자 전문: WP 범위 세부」.
- poll 조회 주기 180초(3분) 고정.
- 일시 제외 = `--recheck-cycles 10`(10주기 = 30분) 유지.
- 선행 대기(「2-3」 「선행 사전 검사」) = 따로 `--wait-cycles 40`(40주기 = 2시간)으로 붙듦.
- **자동 merge `automerge=1`**(`.dflow.local`, 개인 설정, 기본 0. 레거시 `.env` `DFLOW_AUTOMERGE=1`): 켜면 팀원 완료 보고(`done`) 즉시 팀장이 그 agent branch 를 기본 branch 에 merge 하고 다음 Task 착수.
  - 승인 = 사후 확인(스윕이 `/dflow-merge --on-report`).
  - 승인 전 merge → state.json 에 `phase: "merged"`·`unapproved: true` 남김.
  - 승인되면 다음 스윕이 표식 지움.
  - 반려되면 「반려(머지됨)」 로 보고.
  - 꺼져 있으면 approved 만 merge.
  - 세부 = `references/args.md` 「인자 전문: 자동 머지 세부」.
  - 값 = 인자 아닌 설정. 스윕마다 아래로 읽음.
  ```bash
  [ "$(node .claude/skills/dflow-work/scripts/dflow.mjs config automerge)" = 1 ] && echo AUTOMERGE_ON || echo AUTOMERGE_OFF
  ```
- 작업 빼는 인자 없음. 특정 작업 안 잡게 하려면 D'Flow 에서 그 작업 `agent` 태그 끔. 팀장 내부 제외 목록은 그대로 있음.
## 팀장 상태: 메모리는 캐시다

상태: 슬롯 표(슬롯 번호·`AGENT_ID`·TSK·id8·worktree·pane id 또는 터미널 핸들·시작 시각·직전 생존 증거), 대기 큐(슬롯 없어 못 준 ready id8), 영구 제외(failed·반려·진행 중), 일시 제외(선행·spec 사유), 선행 대기(사전 검사의 선행 미충족 id8 + 선행 ref), 답 기다리는 `blocked`, 결과 줄 경로별 마지막 처리 해시, 차단기, 백엔드.
- **답 받아 팀원 screen 에 넣는 일 = 한 기상 안에서 끝냄. 중간 상태 남기지 않음.**
- `team.answer` = 넣은 뒤 기록. 그 사이 압축되면 다시 통지, 사람이 한 번 더 답함.
- 세션 메모리 이 값들 = 캐시. 팀장은 **깨어날 때마다** 아래 정본에서 다시 만듦.

**압축 뒤 첫 기상**: 요약 ≠ 절차 정본.
- **압축 신호**: 하나라도 맞으면 압축 뒤.
  1. 대화 "이전 대화에서 이어진다" 요약으로 시작.
  2. 이 문서 절 본문 글자 그대로 볼 수 없고 요약만 있음.
  3. 슬롯 표·`<신원>`·`<host>`·`<UNTIL>` 같은 값 대화에서 찾을 수 없음.
  - 모르겠으면 압축 뒤로 봄(재독은 쌈). 폴링만 이어 가지 않음.
- **할 일**: 행동 전 재독 세트(이 파일 「참조」-「인자」「팀장 상태」「2. 기상과 감시」「3. 결과 처리」)를 아래 한 줄로 읽음.
  - 매 기상 `wake.mjs` 출력 `COMPACT_REREAD` 줄 = 같은 명령.
  - Read 도구 말고 Bash `sed` 로 읽음.
  - Skill 도구로 `/dflow-team` 다시 부르지 않음.
  ```bash
  sed -n '/^\*\*참조\*\*/,/^## 두 번째 팀장/p;/^## 2\. 기상과 감시/,/^## 4\. 승인 스윕/p' .claude/skills/dflow-team/SKILL.md
  ```
- 재독 세트 밖 절(「4」-「7」·「좌석표 연동」·「금지」)·`references/*`: 압축 뒤 그 절차 처음 탈 때 그 절만 `sed`·`cat` 으로 읽음(「참조」 표). 기억으로 절차 밟지 않음.
- `<host>` 도 기억 말고 「1. 시작」 명령으로 다시 구함.
- 요약에서 빠진 규칙(이벤트 추가 필드, `parked` 표시, host 슬러그 ≠ `host` 필드)은 기억으로 못 메움. 그렇게 기록한 줄은 다음 재구성이 못 읽음.

이 절 접두 모두 `<신원>/<host>/` 로 시작(같은 신원이 다른 PC 에서 띄운 팀장 worktree 를 자기 것으로 안 읽음).

**정본**: 이 신원·이 PC 팀원 worktree 와 그 결과. `TM` = 「1. 시작」 전제 검사 출력 tmux 절대경로.
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
- `FAIL TASKS_DIRS`(`config tasks-dirs` 실패·빈 값) → 재구성 중단(빈 폴더로 worktree 전체 훑어 오판).
- `.dflow-agent` = `<신원>/<host>/w<slot>` 인 worktree = 그 슬롯 팀원 worktree.
- `<신원>/<host>/parked` = 슬롯 아님. 고아 스캔만 봄.
- worktree 안 `<TASKS>/*/.result` = 결과. branch `agent/<id8>-…`·worktree 이름 `dflow-<id8>` = 작업 식별.
- 마지막 칸(`.dflow-pane` tmux pane): `alive` = 살아 있음, `dead` = 죽었거나 사라짐(빈 출력도 `dead`), `-` = Orca 팀원.

**보조**: `~/.dflow/events.jsonl` 에서 마지막 `team.start` 이후이고 `agent` = `<신원>/<host>/lead`, `repo` = 이 리포(`<MAIN>`)인 줄.
- **줄 통째로 띄우지 않음.** 아래 스크립트 요약만 읽음(이벤트 그대로 띄우면 실행 길수록 불어남).
- 스크립트 = 아래 목록 규칙대로 계산. 출력 줄(`RUN`·`EVENTS`·`BREAKER`·`CONFLICT_CLEARED`·`HASH_OMITTED`·`EXCLUDE_*`·`ISSUE_PENDING`·`WAIT_ANSWER`·`LOST`·`SLOT`·`HASH`) 뜻 = 스크립트 머리에 있음.
```bash
node .claude/skills/dflow-team/scripts/lead-state.mjs --agent '<신원>/<host>/lead' --repo '<MAIN>'
```
- `EVENTS` `bad` > 0 = 깨진 줄 빼고 셌음. 재구성 보고에 "events.jsonl 깨진 줄 <n>" 기재.
- `HASH_OMITTED` > 0 → `HASH` 에 없는 경로 해시는 같은 명령에 `--hash '<worktree>'` 붙여 따로 읽음.
- `RUN` `wp`(`team.start` `wp`, 없는 옛 줄은 전체 `-`) = WP 범위.
  - poll 다시 띄울 때 `--wp` 에 넘김.
  - `wake.mjs`·`tick.mjs` 에도 같은 값 `--wp` 로 넘김(`-` 도 됨. watch 가 「설계 승인」 된 작업(`build`)을 poll 과 같은 범위로 거름).
- 복원 규칙(`RUN`의 `scope`, 종료 시각 = **마지막 `team.extend`** 의 `until`·`until_label` 없으면 `team.start`, `SLOT` 연결, 해소 워커 판별 = worktree 이름 접미사 `-resolve`, 제외 목록·차단기 연속 수·`team.lost`·선행 대기·`WAIT_ANSWER`·`ISSUE_PENDING` 복원) = `references/lead-state.md` 「복원 규칙」. `lead-state.mjs` 출력 줄 = 정본, 기억으로 안 메움. 재구성 때·압축 뒤 첫 기상에 읽음.

**재구성 규칙**
- 살아 있는 팀원 worktree = 그 `.dflow-agent` 슬롯 번호로 슬롯 표에 흡수. 안에 `.result` 있으면 처리 여부 해시로 가린 뒤 처리(「3. 결과 처리」).
- 새로 줄 슬롯 번호 = 흡수한 번호 뺀 1..N 중 가장 작은 것(같은 `AGENT_ID` 다시 발급 안 함).
- "살아 있는 팀원" = spawn 했고 아직 최종 판정(`done`·`needs-merge`·`skipped`·`failed`·`cancelled`·`resolved`·`design_waiting`·`design_review`·`design_reopened`) 안 받은 팀원. screen 떠 있는지로 판단 안 함.
  - Orca = `.dflow-agent` 가 `w<slot>` 인 worktree 중 최종 status `.result` 없는 것.
  - tmux = 위에 더해 정본 표 생존 칸 `alive`.
  - `blocked` ≠ 최종 판정. 그 팀원은 두 백엔드 모두 살아 있음.
  - 실제 죽은 Orca 팀원 = 무응답 규칙(「3. 결과 처리」)이 가려냄.
  - tmux pane 죽음(`dead`) → 살아 있지 않음. `.result` 있으면 결과 처리, 없으면 죽은 pane screen 폴백과 고아 스캔(「3. 결과 처리」).
  - 팀장 세션 새로 떠도 살아 있는 tmux 팀원은 원래 슬롯 번호로 흡수(tmux 서버는 팀장과 따로 돎).
- 대기 큐 재구성 안 함(다음 poll 이 같은 ready 다시 찾음). `blocked` 작업은 대기 큐에 안 넣음(그 팀원 슬롯 잡은 채 답 기다림).
- **결과 중복 방지**: 결과 줄 = 그 줄 해시로 식별.
  - `.result` 경로마다 events.jsonl `team.result`·`team.blocked` 에서 마지막 처리 해시(경로별 마지막 처리 해시) 유도.
  - 현재 줄 해시와 비교해 다를 때만 처리.
  - 집계는 order 로 중복 제거.
  - 줄·해시 = 한 Bash 호출로 함께 읽음.
  ```bash
  l=$(head -n 1 '<경로>'); printf '%s\n' "$l"; printf '%s\n' "$l" | cksum | cut -d' ' -f1
  ```
- **고아 스캔**: `<신원>/<host>/` 로 시작하는 `.dflow-agent` worktree 중 살아 있는 팀원 없는 것을 **정리 가능·재개 가능·멈춤** 으로 가름(순서: 설계 완료 대기 0번 → 정리 → 재개 → 멈춤).
  - 멈춤 → `.dflow-agent` 를 `parked` 로 바꾸고 "멈춤" 표(id8·TSK·worktree·branch·미commit·사유·재시작 명령)를 시작·마감 보고에 모두 냄.
  - 재개 가능 → 「5-1」.
  - 판정 조건·재시도 수 명령·사유 목록·재시작 명령·부트스트랩 실패 정리 = `references/lead-state.md` 「고아 스캔」. 시작 3번, 살아 있는 팀원 없는 `.dflow-agent` worktree 보일 때 읽음.
- state.json 미러 같은 새 저장소 안 만듦.

## 두 번째 팀장 (링크드 워크트리)

같은 리포에서 **다른 신원(다른 PAT)** 팀장 하나 더 돌릴 때 리포 다시 clone 안 하고 링크드 worktree 사용(`scripts/lead-worktree.mjs`).
- 절차: `references/second-lead.md`.
- 같은 신원으로는 띄울 수 없음(`SAME_IDENTITY_LEAD`).

## 0. 환경 감지 (시작 맨 처음)

백엔드: Orca **먼저** 확인, Orca 안 아니면 tmux 확인. `TMUX` 환경변수 감지에 안 씀(전용 소켓 사용, Orca 안에서도 채워짐).

| 순위 | 조건 | 백엔드 |
|---|---|---|
| 1 | `TERM_PROGRAM` = `Orca` 이거나 `ORCA_WORKTREE_ID` 비어 있지 않음 | **pane(Orca)** |
| 2 | Orca 밖이고 `find_tmux`(backends.md 「진짜 tmux 찾기」)가 진짜 tmux 절대경로 반환 | pane(tmux) |
| 3 | 그 밖 | `FAIL NO_TMUX` 로 중단·설치 안내 |

- 감지 = 「1. 시작」 전제 검사 블록 안에서 한 번에 함. 그 블록이 `BACKEND`(`tmux` 또는 `orca`)와 `TM`(진짜 tmux 절대경로. Orca 백엔드면 빈 값) 출력.
- 백엔드 이름 → 시작 보고·`team.start` 에 남김.
- 3번 갈래에서만 시작 안 함.

**플랫폼**: 이 문서 셸 블록 = node 로 macOS·Linux·Windows 에서 같은 절차로 돔.
- Windows 에서만 다른 것(호스트 이름·팀장 세션 PID·심링크·tmux 설치)은 블록 안에서 `uname -s` 로 가름(`MINGW*|MSYS*|CYGWIN*`).
- 차이 목록: backends.md 「플랫폼 차이」.
- WSL = Linux.
## 1. 시작

- `<기본브랜치>` = 개발 branch = `dflow.mjs branch dev` 값(`.dflow.local` `dev_branch`, legacy 는 `origin/HEAD`)
- `<TASKS>` = `<DOCS_DIR>/tasks` (리포 최상위 기준)
- 주문 폴더 `<TASKS>/<TSK>` = `dflow.mjs taskdir <ref>` 값
  - `.dflow.local` `project_map` 에서 주문 프로젝트 키 사용, 없으면 `docs`
- 작업 여럿 훑을 때 `dflow.mjs config tasks-dirs` 가 내는 폴더 전부 확인
- `<DOCS_DIR>` 를 `docs` 로 박은 고정 경로 금지

1. **전제 검사**: 아래 블록 하나를 Bash 호출 한 번으로 실행
   - 실패 항목 전부 `FAIL …` 출력 후 0 아닌 값으로 종료
   - **exit ≠ 0 이면 아무것도 띄우지 않고 중단·보고**
   - `<UNTIL>` = 「인자」 정규화한 종료 시각, `<TAKEOVER>` = 「인자」 강제 인수
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
   - `PRECHECK_OK` 없으면(`FAIL …`·`LOCKED`·lease 거부) `references/precheck.md` `cat` 으로 읽고 해당 코드 처리대로 보고
   - 질문 없이 중단(AskUserQuestion 금지)
   - **잠금 소유 판정**: `owner` 신원 = 자기 `<신원>/<host>/lead` 이고 PID = 현재 `$LEAD_PID`(`CLAUDE_PID`, 없으면 `$PPID`)
     - 매 기상(`wake.mjs`)과 「7. 마감」 은 이 판정으로 소유 확인 뒤에만 `beat` 갱신·잠금 삭제
     - 생존(다른 팀장이 가져가도 되는지) = PID 아닌 `beat` 로 판정(70분, 없으면 잠금 디렉터리 수정 시각 10분)
   - **팀장 lease**: 로컬 잠금 잡은 **뒤** 획득
     - `LEASE_OK <n>` 이면 계속
     - 그 밖(`LEAD_LEASE_HELD`·exit 2·3·5·6·7)이면 블록이 잠금 삭제 후 멈춤(fail-closed, 처리 문구 = precheck.md)
2. **담당 작업 폴더 scaffold**: 팀장 체크아웃(개발 branch)에서 `node .claude/skills/dflow-work/scripts/dflow.mjs scaffold` 한 번 호출
   - 출력 한 줄(`scaffold created=N skipped=N no_ref=N`) 시작 보고에 포함
   - **개발 branch 위일 때만 호출**(detached HEAD 는 commit 못 해 트리 더러워짐)
   - **호출 전에 개발 branch fast-forward**
   - fast-forward 실패 시 scaffold 건너뜀(뒤처진 dev 에서 commit 하면 push 거부돼 로컬·원격 dev 갈라짐)
   - 판정·호출 블록(개발 branch 위일 때만, `git pull --ff-only` 성공 뒤에만 `scaffold`)·push 실패 시 조치 = `references/start.md` 「1번 시작: 2번 scaffold 블록」.
   - 실패(exit≠0) = 경고만 하고 계속.
3. **재구성**: 새 `team.start` 쓰기 **전에** 「팀장 상태」 재구성·고아 스캔 수행
   - 목적: "마지막 `team.start` 이후" 필터가 이전 세션 이벤트 안 가리게 함
   - 이 단계 = restart 절차
   - 이어서: 서버에 claimed 인데 흡수한 슬롯·고아 worktree·답 기다리는 `blocked` 어디에도 없는 id8 → "멈춤" 표(사유 `워크트리 없음`)·영구 제외에 넣음.
   - 자동 재착수 안 함(사람이 `--resume <id8>` 로 지목할 때만).
   - 대조 명령(`list --scope claimed` 의 `CL` 행)·계약 2.11 처리(`resume.md` 「서버 판단 확인」, `action=build` 는 재개 대상) = `references/start.md` 「1번 시작: 3번 서버 claimed 대조」.
4. **시작 보고**: 아래 순서로 냄
   - 첫 줄: 정규화 종료 시각
   - 다음 줄: `키: <이름> (<email>, <prefix>)` (토큰 하나여도 적음, 값 = 「인자」 키 판정 `selected` 행)
   - 3번 **"멈춤" 표**(「팀장 상태」)
   - 재개 가능 분류분·`--resume` 지목분: "이번에 이어받습니다" 한 줄
   - 2번 scaffold 출력 한 줄(호출했으면 `scaffold created=N skipped=N no_ref=N`, 건너뛰었으면 "scaffold 건너뜀(detached HEAD 또는 개발 브랜치 아님)")
   - 1번 전제 검사 `WARN GRADLE_TUNING …` 냈으면 그 줄들(시작 안 막음, 처리 = precheck.md)
   - WP 범위 있으면 한 줄: "새 배정과 「설계 승인」 된 작업의 구현은 <WP 목록> 만 합니다. 그 밖의 재개와 승인 스윕은 범위와 무관합니다."
   - 백엔드 무관하게: "팀원은 **권한 확인 생략 모드로** 돕니다. 팀장 세션의 권한 모드와 무관합니다."
   - tmux 백엔드면 한 줄 추가: "화면은 `TMUX= tmux -L dflow attach` 로 볼 수 있습니다." (`TMUX=` = 팀장이 tmux 안일 때 중첩 attach 거부 회피)
   - `AUTOMERGE_ON` 이면(「인자」 자동 merge) 한 줄: "자동 머지: 켜짐. 완료 보고된 작업은 승인 전에 main 에 머지하고, 승인은 사후에 확인합니다." 꺼져 있으면 알리지 않음
5. `team.start`(backend, slots, until, wp, scope) 기록
   - `until` = `<UNTIL>`
   - `wp` = 정규화한 WP 범위를 쉼표로 이은 값, 없으면 `-`
   - `scope` = 늘 `server` (설계 방식은 작업마다 서버 판단 — 「인자」)
   - 3번에서 이어받은 것 = `team.start` 바로 뒤에 같은 필드로 다시 기록
     - 흡수한 슬롯마다 `team.spawn`(`spawn_kind` = `readopt`, 원래 종류는 `orig_kind` 필드, `references/events.md`)
     - 답 기다리는 `blocked` 마다 `team.blocked`
     - 흡수한 슬롯의 마지막 처리 해시마다 `team.result` 또는 `team.blocked`
   - 다시 기록 안 하면 이어받은 팀원 죽은 것으로 보이고 같은 결과 재처리됨(재구성은 새 `team.start` 이후만 읽음)
   - 이어서 **승인 스윕**(「4. 승인 스윕」) 한 번 실행, 결과(머지됨·대기·반려·건너뜀) 한 줄씩 보고
     - 사전 검사 없이 늘 호출(「4-0」 의 예외)
   - 스윕 뒤 빈 슬롯 있으면 재개 대상 spawn(「5-1. 재개 spawn」)
6. **감시 시작**: 「2-2」 대로 감시 루프 `--new-tick` 으로 띄움(다음 TICK = 지금+1800초)
   - restart 조건 맞으면 poll.mjs 도 띄움(「2-1」)
   - 둘 다 Bash `run_in_background` 로 띄움. 셸 `&` 금지(종료 알림이 세션에 안 와 루프 소리 없이 끊김)
   - 이어서 좌석표에 감시 시작 알림. STANDBY = 마지막 신호 뒤 70분에 꺼지므로 시작·매 기상마다 전송
   ```bash
   LOCK=$(git rev-parse --git-path dflow-team.lock); lead=$(cut -d' ' -f1 "$LOCK/owner")
   node .claude/skills/dflow-work/scripts/dflow.mjs watch --agent "$lead" \
     --slots <N> --busy <M> --until '<UNTIL_LABEL>' --json || :
   ```
   **절전 방지**: `<UNTIL>` ≠ 오늘 또는 `none` 이고 `uname -s` = `Darwin` 일 때만 `caffeinate -i -w <LEAD_PID>` 를 Bash `run_in_background` 로 띄움.
   - 시작 보고에 "전원을 연결하고 뚜껑을 연 채로 두라" 기재.
   - Linux 서버·Windows 는 안 띄움.
   - 세부 = `references/start.md` 「1번 시작: 6번 절전 방지」.

   **lease 갱신**: 이어서 아래를 Bash `run_in_background` 로 띄움(모든 OS)
   - 60초마다 lease 갱신
   - 팀장 세션 끝나면 lease 바로 반납 후 종료
   - lease 잃으면 표식 파일에 사유 쓰고 종료. 감시 루프가 이를 보고 `LEASE_LOST` 로 깨움
   - `<lease-lost 절대경로>` = `git rev-parse --path-format=absolute --git-path dflow-team.lease-lost` 값 **리터럴로** 박음
   ```bash
   node .claude/skills/dflow-work/scripts/dflow.mjs lease keep --pid <LEAD_PID> --lost-file '<lease-lost 절대경로>'
   ```
   - 첫 watch 응답에도 `resume_requests` 실려 옴
     - 「2-3」 처리 규칙대로 읽고, `host` = 이 PC 인 요청은 5번에서 못 띄운 재개 대상에 더해 지금 띄움(첫 `TICK` 까지 방치 금지)
   - `<N>` = 「인자」 에서 정한 인원, `<M>` = 지금 슬롯 표 찬 슬롯 수, `<UNTIL_LABEL>` = 「인자」 표시 문자열
   - `--project` 안 넘김(`dflow.mjs watch` 가 설정 `project_id` 사용, `${V:+--project "$V"}` 꼴은 zsh 에서 깨짐)
   - 신원 = 방금 쓴 잠금 `owner` 에서 읽음(1번 env 안 남음)

## 2. 기상과 감시

팀장은 포그라운드 대기 금지. 팀장 깨우는 것 넷:
- poll.mjs 종료 (새 작업·시한·오류)
- 감시 루프 종료 (팀원 결과·팀원 pane 종료·`TICK`·`STALE`·`STOP_REQUESTED`)
- 사람이 이 세션에 주는 답 (종료 요청 포함)
- 팀원 cross-session 메시지 (SendMessage 이슈 보고, 「2-4. 팀원 이슈 보고 처리」)

팀원은 결과 줄 알리지 않음. 이슈 생기면 SendMessage 로 이 세션 직접 깨울 수 있음.

### 2-1. poll

작업 폴더 없는 빈 디렉터리 cwd 로 두고 띄움.
```bash
mkdir -p "$(git rev-parse --git-path dflow-team-poll)"
POLL_DIR=$(cd "$(git rev-parse --git-path dflow-team-poll)" && pwd)
( cd "$POLL_DIR" && DFLOW_CONFIG_DIR="<MAIN>" DFLOW_WATCH=0 \
    "<MAIN>/node .claude/skills/dflow-poll/scripts/poll.mjs" --require-tag agent --lead --until '<UNTIL>' --interval 180 --recheck-cycles 10 \
    --wait-cycles 40 [--wp <WP-02,dict/WP-03>] [--exclude <id8,id8>] [--exclude-temp <id8,id8>] [--exclude-wait <id8,id8>] )
```
대괄호 = 선택 플래그 표기, 실제 명령에 쓰지 않음. `<MAIN>` 경로는 따옴표로 감쌈 (공백 있으면 poll 즉시 죽음).
- 빈 디렉터리가 cwd 라 poll exit 9·10 (승인·반려 감지) 팀장에게 안 옴. 팀장 기상마다 승인 스윕 판정 (「4-0」).
- `DFLOW_CONFIG_DIR` = 설정 위치 (poll cwd 는 작업 트리 밖. 레거시 리포는 `<MAIN>/.env` 읽음). `git rev-parse
  --git-path` 가 상대경로 줄 수 있어 `cd … && pwd` 로 절대경로 생성.
- `DFLOW_WATCH=0`: 팀장이 자기 식별자로 watch 보내므로 poll.mjs watch 끔.
- `--exclude` = **영구 제외 ∪ 현재 슬롯 id8**. 슬롯 id8 재구성으로 복원 (claim 전 ready 를 poll 이 즉시 다시 찾지 않게).
- `--exclude-temp` = 일시 제외 목록. `--exclude-wait` = 선행 대기 목록 (「2-3」 선행 대기 블록 출력 id8).
- 한 id8 둘 중 한쪽에만 넣음.
- 목록 = 공백 없는 쉼표 구분. **목록이 비면 그 플래그 자체 생략.** 빈 값 넘기면 poll.mjs 가 다음 플래그를 값으로 삼켜 사용법 오류로 끝남.
- `--wp` = WP 범위 (`team.start` `wp`), 공백 없는 쉼표 구분. 범위가 전체 (`-`)면 플래그 생략.
- poll.mjs 가 형식 (`WP-<숫자>` 또는 `<모듈>/WP-<숫자>`) 검사, 틀리면 exit 2. 번호 앞 0 무시.
- `--lead` (계약 2.11): 서버가 `mine` 을 팀장 기준 계산. 새 서버면 ready 줄에 넷째 칸 `action` 붙음.
- 새 서버면 `action` 이 `full`·`design`·`build` 이고 `mine` 인 것만 옴 (12절 Y4). 옛 서버 종전과 같음.
- 대기 큐 `--exclude` 에 넣지 않음 (압축으로 대기 큐 잃으면 그 작업이 보이지 않는 제외에 갇힘).

**restart 조건**: 아래 넷 모두 만족할 때만 띄움.
- 빈 슬롯 있음
- 대기 큐 빔
- 차단기 풀림
- rate-limit 보류 없음 (`references/restart.md` 「이벤트로 본 상태」)

poll 은 start 즉시 첫 조회 → 줄 수 없을 때 띄우면 공회전.
예외 하나: 차단기 걸린 `TICK` 에 대기 큐 비어 test spawn 후보 없으면 poll 한 번 띄움.
그 poll exit 0 에서 1건만 test spawn, 나머지 대기 큐.
poll 안 떠 있는 구간 있음 → 팀장은 기상마다 시각 보고 종료 시각 지났으면 poll exit 8 과 같이 처리.

일시 제외는 poll.mjs 가 10주기 (30분) 뒤 스스로 풀어 재발견 유도. 팀장은 해제 시각 따로 관리 안 함.
- 풀린 id8 재발견 시 착수 판정 다시, 여전히 막히면 다시 일시 제외.
- poll exit 0 재대조는 일시 제외 목록 보지 않음 (「2-3」 표).
- poll 을 다른 이유로 restart 하면 10주기 계산 처음부터 다시 시작 (재검사만 늦어짐, 틀린 착수 없음).
- 선행 대기: poll.mjs 가 40주기 (2시간) 뒤 풀고, 선행 대기 블록도 기록 시각 2시간 지난 것 뺌. 먼저 닿는 쪽이 풂.

### 2-2. 감시 루프

감시 루프 = `scripts/tick.mjs`. 루프 손으로 쓰지 않음. 아래 한 줄을 Bash `run_in_background` 로 띄움 (셸 `&` 금지).
대괄호 = 선택 플래그 표기.
```bash
node .claude/skills/dflow-team/scripts/tick.mjs [--new-tick] [--may-skip] [--until '<UNTIL>'] [--wp <WP-02,dict/WP-03>] --tm '<진짜 tmux 절대경로 또는 빈 값>' \
  --owner '<신원>/<host>/lead' --slots <N> --until-label '<UNTIL_LABEL>' --pid "${CLAUDE_PID:-$PPID}" \
  -- '<워크트리1>/<TASKS>/<TSK1>/.result|<해시1>|<pane1>' '<워크트리2>/<TASKS>/<TSK2>/.result|-|-'
```
- `--` 뒤: 진행 중 슬롯 (`blocked` 포함)마다 `'<.result 경로>|<마지막 처리 해시 또는 ->|<pane id 또는 ->'`.
  - pane id = tmux 팀원 `.dflow-pane` 첫 줄. Orca 는 `-`.
  - 슬롯 없으면 비움. 공백·작은따옴표 든 경로 미지원.
- `--tm` = 전제 검사 `TM` 을 **리터럴 절대경로**로. Orca 면 `''` (별도 셸이라 변수 못 물려받고 PATH 에 Orca shim 있을 수 있음).
- 세대·종료·lease 상실 파일 경로는 스크립트가 git 에 물음.
- `--new-tick` = 시작과 `TICK` 기상 때만 (다음 TICK = 지금+1800초). 그 밖의 교체는 세대 파일 값 그대로 써서 TICK 안 밀림.
- `--until` = `<UNTIL>` ≠ `none` 일 때만.
- 교체는 TaskStop 아닌 세대 파일 `$(git rev-parse --git-path dflow-team.gen)` (`<세대> <다음 TICK epoch 초> <건너뛴 TICK 수>`)로.
  - start 하면 세대 오르고 옛 루프 `STALE` 로 끝남 (압축으로 태스크 id 잃어도 안 겹침).
  - 새 루프 없이 끝내기만 할 때 (「7. 마감」) `tick.mjs --retire`.
- 새로 띄우는 때: 진행 중 슬롯 경로·처리 해시·pane id 집합 바뀔 때, 루프 끝나 있을 때.
- 압축 뒤 떠 있는지 모르면 새로 띄움.
- 루프는 start 즉시 전수 검사 후 20초 간격 확인 (교체 사이 온 `.result` 놓치지 않음).

출력 **마지막 줄** = 기상 사유. 위에서부터 먼저 걸린 하나.

| 마지막 줄 | 뜻 |
|---|---|
| `STALE` | 세대 바뀜 (새 루프 뜸 또는 `--retire`) |
| `STOP_REQUESTED` | 종료 파일 생김 (「인자」 종료 요청). 결과보다 먼저 봄 (멈추라고 한 뒤 새 결과로 spawn 잇지 않음. 결과 줄은 마감에서 처리) |
| `LEASE_LOST <사유>` | lease 상실 표식 (`dflow-team.lease-lost`). 종료 요청 다음, 결과보다 먼저 봄 |
| `RESULT_READY <경로…>` | 결과 줄 해시 ≠ 넘겨받은 해시. **줄 전체 비교** (status 만 보면 답 받은 팀원이 다시 `blocked` 돼도 안 깨움) |
| `PANE_DEAD <경로…>` | tmux 팀원 pane 이 새 결과 줄 없이 죽었거나 사라짐. 새 결과 줄 있으면 `RESULT_READY` 먼저 |
| `TICK` | 다음 TICK 시각 지남 (한가해도 승인 스윕 판정 「4-0」 과 무응답 점검 함) |

**변화 없는 TICK 건너뛰기** (`--may-skip`): TICK 이 시각으로 할 일 없을 때만 붙임. 아래면 안 붙임: 차단기 걸림·재시작 대기/rate-limit 대기·못 띄운 후보 있는 빈 슬롯·「7. 마감」 중. 건너뛰면 `TICK_SKIPPED`·슬롯별 `EVIDENCE` 줄 남기고 다음 TICK 반드시 냄(팀장 기상 간격 최대 60분). 건너뛰는 조건 전문 = `references/wake.md` 「변화 없는 TICK 건너뛰기」.

### 2-3. 기상마다 하는 일

모든 기상은 먼저 아래 한 줄 (`scripts/wake.mjs`, 기상 블록) 돎. 스크립트 동작:
잠금 소유 확인 → 소유 맞을 때만 `beat` 갱신, 좌석표에도 같은 신호 (watch) 전송 → lease 갱신 상태 보고 → 마지막에 `references/events.md` 「기록 명령」 절과 압축 뒤 재독 명령 (`COMPACT_REREAD`) 출력.

`STALE` 은 그것만 하고 넘김 (출력에 `EVIDENCE` 줄 있으면 직전 TICK 증거로 갱신).
잠금 잃은 팀장은 새 팀장 잠금을 살아 있게 만들지 않음 (「1. 시작」 잠금 소유 판정).
기상에서 이벤트 기록 시 이 출력이 띄운 `references/events.md` 명령 블록 그대로 씀.
기억으로 재구성한 명령 금지. events.md 가드가 인자 비거나 필드 빠진 줄을 `EVENT_ARGS_MISSING` 으로 거부함. 그 출력 보이면 명령 블록 다시 띄워 다시 기록.
```bash
node .claude/skills/dflow-team/scripts/wake.mjs --owner '<신원>/<host>/lead' --slots <N> --busy <M> --until-label '<UNTIL_LABEL>' [--wp <WP-02,dict/WP-03>]
```
출력 줄 (글자 그대로):
- `LOCK_OK` 다음 줄에 재개 요청 요약 `{"n":…,"err":…,"reqs":[…],"other_project":[…]}` (또는 `WATCH_FAILED`·`HOLDER_FAILED`)
- 소유 아니면 `LOCK_LOST …`
- lease 갱신 멈췄으면 `LEASE_KEEP_DEAD …`
- 그 뒤 기록 명령 절

팀장 세션 PID 는 `CLAUDE_PID` 로 봄 (스크립트 안 `$PPID` ≠ 팀장).

**`resume_requests`** = 좌석표 「이어서 시작」 요청(`LOCK_OK` 다음 줄 JSON `{"n","err","reqs","other_project"}`).
- `n` `"NULL"` = 조회 실패(요청 없음 아님). 그 기상은 요청 처리 안 함, 사유 한 줄 보고, 다음 기상에 다시 읽음.
- `host` 가 이 PC `<host>` 와 글자 그대로 같은 것만 「5-1」 로 보냄. 다른 값은 "멈춤" 표에 `다른 PC claim`.
  - 계약 2.11 은 요청 `mine` 으로 가름(거짓이면 "멈춤" 사유 `다른 PC 도는 중`).
  - `design_state` 가 `review` 면 띄우지 않고 "「설계 승인」 뒤에 이어 갑니다" 한 줄 알림. 그 밖에는 서버 판단이 `skip` 이어도 띄움.
- `other_project` 한 줄 보고만. 팀장은 표식 지우지 않고 확인 응답도 안 보냄.
- `WATCH_FAILED`·`HOLDER_FAILED` = `beat` 갱신됨 → 그 기상 요청 처리만 건너뜀.
- 전문 = `references/wake.md` 「resume_requests 처리 전문」.

**`build` (계약 2.11) = 「설계 승인」 된 작업 목록.** 기상 블록 요약 끝 `build` 칸. 처리 = `references/design-state.md` 「2」 (claimed 원소 → 재개 대상. `"NULL"` = 조회 실패).

`LEASE_KEEP_DEAD` = lease 갱신 3분 넘게 멈춤. 감시 루프 `LEASE_LOST` 와 함께 뜨면 `LEASE_LOST` 우선(곧장 lease 상실 마감). 단독이면 `dflow.mjs lease renew` 한 번 부름: `LEASE_OK` → 표식 파일 지우고 lease 갱신 블록·감시 루프 restart / `LEASE_LOST`(exit 4)·`LEASE_NONE` → lease 상실 마감 / 그 밖 실패 → 보고 후 다음 기상. 전문 = `references/wake.md` 「LEASE_KEEP_DEAD 처리」.

`LOCK_LOST` = **잠금 상실.**
- "잠금 상실" 로 보고, 새 spawn stop.
- 잠금 지우지 않은 채 「7. 마감」 의 잠금 상실 마감으로 감 (다른 팀장이 잠금 가져갔으면 두 팀장이 같은 체크아웃 쓰게 됨).

`STALE`·`LEASE_LOST` 제외 모든 기상은 `LOCK_OK` 뒤 이 순서:
1. 재구성 (「팀장 상태」). 컨텍스트 압축 뒤 첫 기상이면 그 전에 「팀장 상태」 의 「압축 뒤 첫 기상」 대로 재독 세트 읽음 (`wake.mjs` 출력 `COMPACT_REREAD` 줄).
2. 아래 표 처리.
3. 승인 스윕 판정 — 호출 여부·횟수는 「4-0. 스윕을 부르는 규칙」 이 정함 (기상마다 **최대 1회**, 먼저 `sweep-check.mjs`).
   - 판정하는 기상: 시작, 결과 도착 (`.result` 또는 완료 알림), `TICK`, poll restart 직전, 마감 (팀장 poll 에 exit 9·10 안 옴).
   - 승인 반영은 사람 승인 뒤 다음 기상까지 늦어짐. `TICK` 있어 최대 30분.
   - 이 지연 동안 승인됐으나 main 미반영인 선행: 워커가 그 `head_sha` 를 스택 기점으로 받음 (`/dflow-dev` 「--worker」 B).
   - 승인 대기인 선행의 후속: `skipped` 로 일시 제외됐다가 승인·merge 뒤 재검사에서 풀림 (「--worker」 G).
   - 자동 merge (`AUTOMERGE_ON`)면 승인 대기 선행도 결과 도착 스윕에서 곧바로 merge. 후속은 워커의 기본 branch 반영 확인 (「--worker」 G) 통과 → 승인 기다리지 않고 착수.
4. 빈 슬롯 있고 차단기가 허락하면 아래 순서로 spawn.
   1. **재개 대상** (「5-1. 재개 spawn」)
   2. **해소 큐** (「5-2. 해소 spawn」)
   3. 대기 큐 맨 앞부터 (「5. 팀원 spawn」)
   - 재개 대상 = 재구성 고아 스캔이 "재개 가능" 으로 분류한 것 + 아직 안 띄운 `--resume` 지목분.
   - 재시작 대기 목록 (`references/restart.md` 「이벤트로 본 상태」 의 `RESTART_DUE`)도 재개 대상. 재투입 전 확인 (`REINJECT_OK`) 통과할 때만 띄움. 재시작 대기는 새 작업보다 먼저.
   - rate-limit 보류 중에는 재개·새 작업 모두 안 띄움 (`RL_DUE` 슬롯 자신의 재투입만 예외).
   - 기상 블록 요약 `build` 의 claimed 원소 (「설계 승인」 된 작업, 계약 2.11)와 재구성의 `RETRY_DUE` (fetch·push 실패 재시도)도 재개 대상 — 새 작업보다 먼저.
   - 그래도 빈 슬롯 남으면 선행 대기 작업을 **설계 선행**으로 줌 (`references/design-ahead.md` 3번, `DFLOW_DESIGN_AHEAD_MAX`).
5. 끝난 감시 루프 다시 띄움 (`--may-skip` 은 「2-2」 조건일 때만). restart 조건 (「2-1」) 만족하면 poll.mjs 도 다시 띄움.
   - 컨텍스트 압축 뒤 poll 이 떠 있는지 모르면 restart 조건에 따라 새로 띄움.
   - poll 겹쳐 떠도 poll exit 0 처리 대조와 spawn 전 확인 (「5. 팀원 spawn」 1번)이 같은 작업 두 번 띄우는 것 막음.

| 기상 | 처리 |
|---|---|
| poll exit 0 (ready N줄) | 각 줄 `순번<TAB>id8<TAB>이름[<TAB>action]` 에서 순번 버리고 id8 과 `action` (계약 2.11, 없으면 `full`) 사용. 먼저 후보를 영구 제외 목록·슬롯 표에만 한 번 더 대조해 걸리는 것 버림 (겹쳐 뜬 옛 poll 은 옛 제외 목록으로 돌 수 있음). 일시 제외는 대조 안 함 (poll.mjs 가 10주기 뒤 풀어 돌려준 것 그대로 다시 판정, 「2-1」). 남은 후보마다 아래 show 필터로 `.order.item.spec` 빈지와 선행 사전 검사 (`deps_unmet`)만 봄 (spec 본문 컨텍스트에 싣지 않음). 비었거나 `ref` 비면 일시 제외에 넣고 사유 (spec 부재·TSK 없음) 보고 + `team.result` (slot `-`, status `skipped`) 남김. `deps_unmet` 비어 있지 않으면 띄우지 않고 사유 `선행 미충족(사전 검사: <ref…>)` 로 보고·`team.result` 는 같게 하되, 일시 제외 아닌 **선행 대기**에 넣음 (아래 「선행 사전 검사」). `deps_unmet` 비고 `deps_nohead` 비어 있지 않으면 아래 「선행 반영 사전 검사」 거침. 남은 것을 빈 슬롯 수만큼 spawn, 나머지 대기 큐 끝. 차단기 걸려 있으면 spawn 안 하고 대기 큐에 넣음 (test spawn 예외는 「2-1」 restart 조건). 대기 큐 잃어도 그 작업은 아직 ready 라 다음 poll 이 다시 찾음. `action` 이 `design` 이면 `deps_unmet` 있어도 선행 대기에 안 넣음 (설계만 함, 스펙 6.6). spawn 전에 아래 「설계 사전 검사」 거침 |
| `STOP_REQUESTED`, 사람의 종료 요청 ("팀장 종료"·"마감해" 등) | 종료 시각 무관, 「7. 마감」 으로 감. "종료 요청으로 마감합니다" 한 줄 알림. 종료 파일은 이 자리에서 지움 (남기면 마감 중 다시 띄운 감시 루프가 곧바로 다시 끝나 공회전). 마감 기다림 (「7. 마감」 2번) 중 종료 요청이 **한 번 더** 오면 기다림 끝내고 곧바로 3번으로 감 |
| poll exit 8 (시한) | 먼저 지금 시각이 현재 `<UNTIL>` (연장 반영) 전인지 봄. 전이면 연장 전에 띄운 옛 poll 이 끝난 것 → 무시, restart 조건 (「2-1」)대로 새 `--until` 로 다시 띄움. 지났으면 새 배정 stop, 대기 큐 비우고 (보고만) 「7. 마감」 으로 감 |
| poll exit 2·3·5·6·7 | 중단 사유 (stderr) 보고 후 「7. 마감」 |
| `RESULT_READY <경로…>` | 경로마다 「3. 결과 처리」 |
| `PANE_DEAD <경로…>` (tmux) | 경로마다 「3. 결과 처리」. `.result` 있으면 그 줄, 없으면 죽은 pane screen 폴백, 그것도 없으면 `references/restart.md` 「판정」 (`pane_dead_status` 127 이면 `failed no-result`) |
| 팀원의 cross-session 메시지 (이슈 보고) | 「2-4. 팀원 이슈 보고 처리」. 도착한 이 기상 안에서 곧바로 처리 — 사람에게 보고만 하고 턴 끝내지 않음 |
| 사람의 답 | 「6. blocked」 의 답 매칭 |
| `TICK` | 감시 루프를 `--new-tick` 으로 다시 띄워 다음 TICK 을 지금+1800초로 새로 정함. 출력에 `TICK_SKIPPED` 있었으면 한 번 건너뛴 뒤의 TICK, 그 `EVIDENCE` 줄 = 직전 TICK 증거 (「3」). 진행 중 슬롯 생존 확인, 무응답 슬롯 생존 증거 잼 (「3. 결과 처리」). 결과 줄 없는 정체 슬롯·재시작 대기 목록은 `references/restart.md` 「판정」·「rate-limit 대기」 를 탐. 차단기 걸려 있으면 test spawn 1건 허용 |
| `LEASE_LOST <사유>` | 다른 곳이 이 신원+프로젝트 팀장 lease 를 가져갔거나 (`LEASE_LOST <project_id…>`), 서버에 3분 넘게 못 닿음 (`LEASE_UNREACHABLE`). 위 1-5 (재구성·승인 스윕·spawn·poll·감시 루프 restart) 안 함. 같은 `LOCK_OK` 블록이 함께 낸 `LEASE_KEEP_DEAD` 도 무시하고 곧장 「7. 마감」 의 lease 상실 마감 |
| `STALE` | 잠금 소유 확인과 `beat` 갱신만 하고 나머지 넘김 |

poll exit 0 의 show 필터:
```bash
(node .claude/skills/dflow-work/scripts/dflow.mjs show <id8>) | tee "$(git rev-parse --git-path dflow-team-poll)/show-<id8>.json" \
  | jq -c '{order: .order.id, status: .order.status, ref: .order.item.external_ref, spec_empty: ((.order.item.spec // "") | length == 0),
            deps_unmet: [.depends_evidence[]? | select(has("reached") and .reached == false) | .external_ref],
            deps_nohead: [.depends_evidence[]? | select(.reached == true and ((.head_sha // "") == "")) | .external_ref]}'
```
show 실패 (dflow.mjs 가 0 아닌 코드로 끝남, 404 로 exit 7, 출력 빔) spec 부재로 보지 않음.
- 그 id8 "조회 실패" 사유로 일시 제외에 넣고 다음 기상에서 다시 판정.
- 조회 실패를 데이터 없음으로 위장하지 않음.

**선행 사전 검사** (`deps_unmet`): 서버 판정 `reached` 가 거짓인 선행이 하나라도 있으면 spawn 안 함(확정 skip). `reached` 키 없는 옛 서버 응답·`depends_evidence` 없는 응답은 걸러내지 않고 워커에 맡김. 사유 `선행 미충족(사전 검사: <ref…>)` 인 작업은 일시 제외 아닌 **선행 대기**(푸는 길: 선행 완료·선행 merge·2시간 안전망). 푼 작업을 팀장이 직접 띄우지 않음, poll 이 다시 돌려주면 사전 검사 다시 함. 전문 = `references/wake.md` 「선행 사전 검사·선행 대기 설명」.

선행 대기 블록 — 출력 한 줄 = `<id8><TAB><선행 TSK,…>`. 목록은 기억 아닌 이 출력이 정본. poll 띄울 때마다 돌림.
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
시각 = `ts` (UTC `YYYY-MM-DDTHH:MM:SSZ`) 문자열끼리 비교. 형식 같아 사전순 = 시간순.

**선행 반영 사전 검사** (`deps_nohead`): `deps_unmet` 비고 `deps_nohead` 비어 있지 않을 때만. `node .claude/skills/dflow-dev/scripts/pred-reflected.mjs '<TASKS>' '<선행TSK>' '<개발브랜치>'`: 하나라도 `NOT_REFLECTED`(rc=1) 이면 띄우지 않고 사유 `선행 미반영(사전 검사: <ref…>)` 로 일시 제외 + `team.result`(slot `-`, status `skipped`); `UNKNOWN`(rc=2) 은 워커에 맡김. 명령 전문·해소 중 사유 문구 = `references/wake.md` 「선행 반영 사전 검사」.

**설계 사전 검사** (계약 2.11): `action` 있는 후보는 띄우기 전에 `references/design-state.md` 「1」 수행.

### 2-4. 팀원 이슈 보고 처리

팀원이 SendMessage 로 이슈 보고 (첫 줄 `[이슈 <TSK> <id8>] <요약>`, worker-prompt.md 「9」) 보내면 **도착한 턴에서 곧바로** 처리.
1. `references/issues.md` 를 Bash `cat` 으로 읽음.
2. 그 1-5 (저장·판단·`[팀장 지시 <id8>]` 추가 지시·전파·근본 조치) 수행.

- 감시 루프는 cross-session 메시지로 안 깸.
- **사람에게 보고만 하고 턴 끝내기 금지** (팀원과 팀장이 서로 기다리며 교착).
- 팀장이 10분 안에 지시 못 보내면 팀원이 `.result` 의 `blocked` 로 넘어감. 그때는 「6. blocked」 로 처리.
## 3. 결과 처리

**결과 줄 찾기**
- 감시 루프가 알린 경로(`RESULT_READY`)의 `.result` 한 줄. 두 백엔드 공통. 슬롯은 경로(그 슬롯 worktree)로 찾음.
- 이미 판정한 경로의 알림 → 집계만 갱신, 슬롯 건드리지 않음.
- `PANE_DEAD <경로>`(tmux): 그 슬롯 팀원 pane 죽음. 처리 순서:
  1. `.result` 있으면 그 줄 처리.
  2. 없으면 backends.md 「결과 줄과 죽은 pane 폴백」 대로 `capture-pane -p -J -S -` 로 죽은 pane screen 전체 읽어 `<TSK> <id8> ` 로 시작하는 마지막 줄 처리. `failed not-isolated` 는 워커가 파일 안 쓰므로 이 폴백으로만 옴.
  3. 그것도 없으면 `#{pane_dead_status}` 읽음(`references/restart.md` 「판정」 블록의 `dead_status`).
     - `127`(`claude` 못 찾음) → 곧바로 `failed no-result` 판정(hash `-`. 다시 띄워도 같은 자리에서 죽는 환경 결함).
     - 그 밖 → `references/restart.md` 「판정」 으로 감(재시작 후보).
  - 프로세스 없으므로 기다리지 않음.
- 줄 형식 `<TSK> <id8> <branch|-> <head|-> <done_exit|-> <status> <사유…>`.
- 줄과 해시는 「팀장 상태」 한 줄 명령으로 함께 읽음. 해시 = 그 경로의 마지막 처리 해시면 처리 안 함.

**생존 증거**: tmux 팀원은 먼저 정본 표의 생존 칸(`dead` 면 증거 재지 않고 `PANE_DEAD` 와 같이 처리). 살아 있으면 HEAD commit 시각·서버 최신 progress·미commit 목록 cksum 중 하나라도 직전 `TICK` 과 다르면 생존(슬롯의 첫 `TICK` 은 기록만). **screen 은 생존 증거로 쓰지 않음**(보고용·폴더 신뢰 확인·정지/대기 판정에만). 측정 명령·`EVIDENCE` 줄 규칙 = `references/result-handling.md` 「생존 증거」.

**문제 기록**: `blocked` 아닌 결과 처리 시 `team.result` 기록·worktree 정리보다 먼저 `<MAIN>/docs/dflow-team/issues.md` 에 항목 하나 붙임(commit 안 함). `done`·`needs-merge`·`design_waiting`·`design_review` 이고 `.issues` 없거나 비면 안 붙임. 블록·`failed no-result` screen 첨부·`ISSUE_LOG_FAIL` 처리 = `references/result-handling.md` 「문제 기록」.

**status 별 처리**:
- 결과 줄은 경로별 마지막 처리 해시와 다를 때만 처리.
- `blocked` → `team.blocked`, 나머지 → `team.result` 로 해시·사유와 함께 기록(events.md).
- 모든 결과를 집계에 넣음.
- 결과 처리 시 그 id8 을 먼저 진행 중 영구 제외에서 빼고, 아래 표 제외 칸대로 일시·영구 제외를 새로 정함(그대로 두면 `skipped`·`failed rate-limit` 재시도가 막힘).

| status | 슬롯 | 제외 | worktree | 그 밖 |
|---|---|---|---|---|
| `done` | 해제 | 없음 | 「고아 정리 규칙」 2번(미commit 변경 없음, HEAD 가 `origin/<agent 브랜치>` 와 같거나 그 merge 이미 기본 branch 조상)을 맞추면 그 자리에서 정리. 아니면 3번대로 경로·미commit 목록 보고 후 남기고 `.dflow-agent` 값을 `<신원>/<host>/parked` 로 바꿈 | 자동 merge(`AUTOMERGE_ON`)면 먼저 승인 스윕 곧바로 함(이 기상 스윕 1회(「4-0」), spawn 보다 먼저. 방금 끝난 작업이 기본 branch에 들어가야 후속 착수). 그 다음 대기 큐 있으면 그 슬롯에 spawn. 비면 poll restart 조건(「2-1」)을 따름 |
| `needs-merge` | 해제 | 없음 | `done` 과 같다 | 승인 스윕 곧바로 함. 이 기상 스윕 1회이며, 워커가 approved 확인한 merge 대상 있으므로 사전 검사 없이 부름(「4-0」 의 예외) |
| `skipped`(선행 미충족·선행 미승인·선행 승인 대기·claim exit 4·공통 기점 없음·spec 부재, 계약 2.11 의 `설계 관문(<code>)`·`사람 설계 초안 있음`·`주문이 바뀜`·서버 판단 사유) | 해제 | 일시 제외 | branch 가 `-` 면 부트스트랩 실패 정리 규칙, 아니면 `done` 과 같다 | 사유 보고. `사람 설계 초안 있음` 은 「멈춤」 표에도 |
| `skipped`(`fetch 실패`·`push 실패`·`다른 PC 도는 중(<runner>)`, 계약 2.11) | 해제 | 일시 제외 | 지우지 않음. `parked` 로 | `references/design-state.md` 「3」 |
| 그 밖 status: `design_waiting`·`design_review`·`design_reopened`·`failed permission`·`failed rate-limit`·`failed no-result`·`failed not-isolated`·`failed project`·`failed not-assignee`·`failed deps`·`cancelled` | | | | 행 전문 = `references/result-handling.md` 「status 표 나머지 행」(해당 status 나오면 읽음). 요점: `failed not-isolated` 는 새 spawn 멈추고 「7. 마감」. `failed rate-limit`·`design_*` 는 **제외 없음**(바로 아래 일반 `failed <사유>` 행의 영구 제외 적용 안 함), `design_*` 는 실패 아님(차단기 0). `failed not-assignee`·`cancelled` 는 차단기에 세지 않음. `design_waiting`·`cancelled` 는 worktree 지우지 않고 `.dflow-agent` 를 `parked` 로, `cancelled` 는 "멈춤" 표에 안 넣음 |
| `blocked` | 유지 | 진행 중으로 영구 제외에 남김 | 그대로 둠(두 백엔드 공통). 팀원이 pane·탭에서 답을 기다림 | 통지(「6. blocked」) |
| `failed <사유>` | 해제 | 영구 제외 | 고아 정리 규칙 | 사유 보고, 차단기 계산 |

**해소 워커의 결과**: 슬롯 worktree 이름이 `-resolve` 로 끝나면(`dflow-<id8>-resolve`, `readopt` 뒤에도 같음) 위 표 대신 `references/merge-conflict.md` 「4. 해소 결과 처리」 표를 따름. 결과 줄 찾기·해시·`team.result`·`team.blocked` 기록·tmux 회수는 위와 같음.

- **그 자리에서 정리**: git 은 다른 worktree 가 체크아웃한 branch 못 지움. 마감까지 남기면 승인된 작업의 로컬 agent branch 삭제 실패. 정리 명령 = backends.md 백엔드별 「정리」 와 「고아 정리 규칙」. worktree 지웠으면 그 규칙 5번의 생성 branch 정리까지 함.
- **회수**: 결과 줄 처리 뒤.
  - tmux: pane 을 `kill-pane -t <pane>` 으로 거두고 `select-layout -t dflow tiled` 다시 돎(backends.md 「생존·화면·답·회수」).
  - Orca: `orca terminal close --terminal <handle> --tab --json` 으로 탭 닫음(핸들이 `-` 면 건너뜀).
  - 순서: 결과 처리 → 탭 닫기 → worktree 정리.
  - 응답의 `ptyKilled:false` 는 실패 아님(claude 프로세스는 실제로 끝남).
  - `blocked` 는 예외, 거두지 않음(답을 기다리며 살아 있어야 함).
  - 워커는 `.result` 쓰고 곧 끝나므로 보통 `remain-on-exit` 가 남긴 죽은 pane. 그것도 `kill-pane` 으로 치움.
- **차단기**: 결과 도착 순서로 `failed` 연속 2건이면 새 spawn 멈추고 보고.
  - `failed` 에 `no-result`·`rate-limit` 포함. `not-assignee`·해소 워커의 내용 실패(`references/merge-conflict.md` 「6. 차단기」) 제외.
  - `failed` 아닌 결과 오면 연속 수 0 으로 되돌림.
  - 걸린 동안 다음 `TICK` 마다 1건만 test spawn(대기 큐 맨 앞에서, 큐 비었으면 poll 한 번 띄워 얻음). 그 결과가 `failed` 아니면 차단기 풂(한도·환경 결함에 걸린 채 대기 큐 소진하지 않음).
  - 자동 재시작의 `team.lost`(모든 `cause`)도 실패 1건으로 셈(`references/restart.md`). 단 `next=wait` 인 `team.lost` 는 세지 않음.
  - 걸린 동안의 test 1건은 재시작 대기가 새 작업보다 먼저.
- **중단·무응답·정지·대기·재시작**: 결과 줄 없는 진행 슬롯은 `TICK` 마다 생존 증거로 판정.
  - `show` 가 `status=cancelled` 면 `cancelled` 결과로 처리(무응답 안 기다림, worktree 안 지움).
  - 생존 증거가 한 `TICK` 안 변하면 "무응답" 보고만(슬롯 유지). 두 `TICK` 연속 무변화(또는 결과 없는 pane·탭 죽음)면 원인 가리는 일은 `references/restart.md` 「판정」 이 대신함: 재시작 후보는 worktree 지우지 않고 pane·탭만 거둠 → `team.lost`(영구 제외 대신함). 재시작 후보 아닌 무응답만 자동 정리(영구 제외 + "멈춤" 사유 `무응답`).
  - 무응답 1회째에 screen 서브에이전트 종료 알림 뒤 입력 대기(`❯`)면 `[팀장 지시 <id8>]` 주입(같은 문구 재주입 금지). screen 입력 대기이고 heartbeat 만 살아 있으면 "대기 중인 팀원" 보고만(죽이지 않음).
  - 자동 재시작은 `references/restart.md` 「판정」 이 맡음(`team.lost` 기록 뒤 같은 기상에 「5-1」).
  - 주입 문구·조건 전문 = `references/result-handling.md` 「중단·무응답·정지·대기 판정·자동 재시작」.

## 4. 승인 스윕

「4-0. 스윕을 부르는 규칙」 이 부르라고 판정했을 때만 함.
- Skill 도구로 `/dflow-merge` 를 인자 없이 실행. 자동 merge(`AUTOMERGE_ON`, 「인자」)면 `--on-report` 하나만 붙여 실행.
- 스윕마다 `.dflow`·`.dflow.local`(레거시 `.env`) 다시 읽어 정함.
- 후보가 원격 `origin/agent/*` tip 에서도 오므로 팀장 체크아웃 state.json 유무와 무관.
- 판정은 서버 `show` 로만 하고 approved 만 merge.
- 후보는 state.json 의 `api_base` 가 팀장 `api_base` 설정(`.dflow`, 레거시 `DFLOW_API_BASE`)과 같은 것만 받음. `api_base` 없는 로컬 후보는 전제 검사가 시작 전에 막음(「1. 시작」 `LEGACY_REPORTED`).
- 결과별 처리(전문 = `references/sweep.md` 「스윕 결과별 처리」, 해당 결과가 보고에 있을 때 읽음):
  - 반려(머지됨)·반려: 보고하고 영구 제외. 팀장이 스스로 revert 하지 않음.
  - push 실패 경합(non-fast-forward)·연결·permission 오류: `/dflow-merge` 가 스윕 멈춤 → "중간에 멈춤" 으로 보고(정상 완료로 적지 않음). 다음 기상 스윕이 fetch 부터 다시 함.
  - push 훅 거부: 그 작업과 후손만 빼고 스윕 계속. 그 id8 은 "사람이 머지해야 함" 으로 보고.
  - merge 충돌(migration 버전 포함): 다음 후보로 계속. 그 id8 은 「4-1」 로(해소 못 하면 "사람이 머지해야 함").
  - `decisions.md`: `UNION_SET` 등은 사람에게 넘김. 팀장이 그 파일 고쳐 commit 하지 않음.
  - 승인 대기·건너뜀: 보고만.
  - 스윕이 "머지됨"·"머지됨(승인 전)" 을 한 건이라도 냈거나 해소 워커가 `resolved` 로 끝났으면: 일시 제외 중 사유가 선행 계열(선행 미충족·선행 미승인·선행 승인 대기·claim exit 4·공통 기점 없음·선행 미반영)인 id8 풀고 poll 을 줄어든 `--exclude-temp` 로 restart.
  - `team.sweep`(merged, waiting, rejected, resolved 개수) 기록. `resolved` 는 `lead-state.mjs` 의 `CONFLICT_CLEARED resolved=` 값.
  - 방언 검증 `DIALECT_*` 줄: 자동 되돌리기·재오픈 없음. `DIALECT_FAIL`·`DIALECT_ERROR`·`DIALECT_DEFERRED … notify=1` 만 사람에게 알림. `DIALECT_PASS`: `unverified=` 가 `-` 아니면 그 Task 붙여 한 줄. `DIALECT_FAIL`: issues.md 에 붙이고 `team.issue` 남기되 `decision` 을 `pending` 으로 쓰지 않음(재구성이 팀원 이슈로 읽음). 줄별 처리 = sweep.md.
  - detached HEAD 팀장은 스윕 끝나면(깨끗할 때만) 팀장 체크아웃을 최신으로 옮김. `SWEEP_NONE` 기상에도 함:
    ```bash
    [ -z "$(git branch --show-current)" ] && [ -z "$(git status --porcelain)" ] && git switch -q --detach origin/<기본브랜치>
    ```

### 4-0. 스윕을 부르는 규칙

스윕(`/dflow-merge` 호출) 시점·횟수는 이 절 하나가 정함. 시작(「1. 시작」 5번), 「2-3」 3번, `TICK`, 「3. 결과 처리」 `done`·`needs-merge` 행, 해소 `resolved`(merge-conflict.md 「4」), 「7. 마감」 모두 이 절을 따름.

1. 한 기상에 최대 1회.
   - 결과가 여럿 도착했거나 `done`·`needs-merge`·`resolved` 행이 "곧바로 스윕" 이라 해도, 그 기상의 판정과 스윕은 「2-3」 3번 자리에서 한 번.
   - 그 행들의 "곧바로" = "같은 기상의 spawn(「2-3」 4번)보다 먼저".
   - 판정하는 기상 = 「2-3」 3번에 적은 것(시작·결과 도착·`TICK`·poll restart 직전·마감)뿐.
   - 사람의 답·이슈 보고·`STALE`·`LEASE_LOST` 기상에서는 판정 안 함.
   - 감시 루프가 건너뛴 TICK(「2-2」)은 기상 아니므로 판정 안 함(승인·반려 생기면 루프가 안 건너뛰고 깨움).
2. 먼저 사전 검사: `/dflow-merge` 부르기 전에 아래를 돎. 후보 정의는 `/dflow-merge` 「절차」 1번 그대로(서버 조회 안 함).
   ```bash
   node .claude/skills/dflow-merge/scripts/sweep-check.mjs --dev '<기본브랜치>'; echo "rc=$?"
   ```
   | 마지막 줄 | 처리 |
   |---|---|
   | `SWEEP_CANDIDATES n=<N> <id8…>` | 「4. 승인 스윕」 대로 `/dflow-merge` 를 부름 |
   | `SWEEP_NONE` | 부르지 않음. 보고 = "스윕 생략(후보 없음)" 한 줄. 아래 3번은 함 |
   | `SWEEP_UNKNOWN <사유>`, 빈 출력, 스크립트 없음(옛 킷), `rc` ≠ 0 | 부름(fail-open). 사유 한 줄 보고 |

   글자 그대로 `SWEEP_NONE` 일 때만 건너뜀(판정 불가를 후보 없음으로 뭉개지 않음). 자동 merge(`AUTOMERGE_ON`)에서도 같음.
3. `SWEEP_NONE` 이어도 하는 일: `SWEEP_DIALECT_PENDING <sha>` 줄 있으면 `dialect-check.mjs run --dev '<기본브랜치>'` 직접 한 번 부르고 결과 줄은 「4」 방언 검증 규칙대로 / merge-conflict.md 「5. 사람 머지 감지」 / 「4」 detached HEAD 재-detach / 해소 `resolved` 있었으면 일시 제외(선행 계열) 해제. `team.sweep` 은 기록 안 함.
4. 예외 — 사전 검사 없이 늘 부름: 「1. 시작」 첫 스윕, 「7. 마감」 마지막 스윕, `needs-merge` 결과가 온 기상, 사람이 직접 요청한 경우. 예외여도 한 기상에 최대 1회. 전문 = `references/sweep.md` 「4-0. SWEEP_NONE 갈래·예외」.

### 4-1. 머지 충돌 해소

스윕이 "머지 실패(충돌)" 을 낸 id8 은 `references/merge-conflict.md` 「1. 충돌 접수」 로 넘김.
- 해소 조건: 이 신원의 주문(`mine`)만, 한 작업에 3번까지, 같은 기준에서 다시 충돌한 게 아닐 때만.
- 해소 큐에 넣으면 「5-2. 해소 spawn」 이 띄움.
- 나머지는 "사람이 머지해야 함" 으로 보고.
- 두 경우 모두 좌석표에 `merge_conflict` 표시를 대리로 쏨.
- 충돌 목록은 `team.conflict` 로 남음.
- 사람이 손으로 merge 하면 다음 스윕 판정 기상(「4-0」, 스윕 건너뛴 기상 포함)의 「5. 사람 머지 감지」 가 표시를 풂.
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
1. 그 id8 이 재구성한 슬롯 표에 있으면 안 띄움 (poll 겹쳐 같은 ready 두 번 돌려줘도 한 번만).
2. 슬롯 번호 결정(「팀장 상태」 발급 규칙) → `AGENT_ID = <신원>/<host>/w<slot>` 생성.
3. TSK = show 필터 `ref`(`.order.item.external_ref`)에서 마지막 `/` 뒤. order = `.order.id`.
   **4번은 별도 Bash 호출 → 이 줄의 셸 변수 못 봄. 값을 이 자리에서 출력하고, 그 출력을 4번 포인터에 그대로 옮겨 씀.**
   ```bash
   order='<order>'   # show 출력의 .order.id(전체 UUID)를 옮겨 쓴다
   TASK_DIR=$(node .claude/skills/dflow-work/scripts/dflow.mjs taskdir "$order"); rc=$?
   echo "TASK_DIR=${TASK_DIR:-없음} rc=$rc"
   node .claude/skills/dflow-team/scripts/docker-allow.mjs "$order" --reuse-dir "$(git rev-parse --git-path dflow-team-poll)"   # DOCKER=allow|ban — 4번 포인터에 옮긴다
   ```
   로 이 작업의 작업 폴더(`<TASKS>/<TSK>`) 구함.
   - `taskdir` 는 `external_ref` 모름 → `ref` 아닌 `order` 를 넘김.
   - `rc` ≠ 0(exit 2 `PROJECT_MISMATCH`·`AMBIGUOUS_DOCS_DIR`, exit 6 `NO_REF`)이면 **spawn 안 함**.
   - 그 id8 을 일시 제외에 넣음 → 사유 `작업 폴더 해석 실패(exit $rc)` 보고 → `team.result`(slot `-`, status `skipped`) 기록 → 다음 후보.
   - poll exit 0 갈래의 spec 부재·TSK 없음과 같은 처리.
4. 포인터 **한 줄** 생성.
   - 백엔드에 워커 프롬프트 전문 대신 이 포인터 넘김.
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
     - 워커는 둘을 다시 해석 안 함 (detach 된 옛 commit 에서는 다른 값 나올 수 있음).
   - 전문을 셸 인자로 넘기면 백틱·따옴표·여러 줄이 섞여 깨짐.
     - 워커 프롬프트 경로는 절대경로 (새 worktree에 스킬 없을 수 있음).
   - `BACKEND` = 언제나 `pane` (두 백엔드 모두 팀원이 screen 에서 멈춰 답을 기다림, worker-prompt.md).
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
   - **pane(tmux)**: 팀장 체크아웃에서 `git worktree add --detach <MAIN>/.claude/worktrees/dflow-<id8> origin/<기본브랜치>` 로 worktree 만든 뒤 backends.md 「pane(tmux)」 블록으로 띄움.
   - **pane(Orca)**: 같은 스폰 블록의 처음(입장 제어 두 줄 포함)부터 `chmod +x "$WT/.dflow-run"` 줄까지를 **한 번의 Bash 호출 안에서** 돌리고, 이어 backends.md 「pane(Orca)」 의 `orca terminal create --worktree "path:$WT" … --command ./.dflow-run --json` 블록을 돌림.
   - 두 백엔드 모두 **이어서 폴더 신뢰 확인 루프 필수**(`I trust this folder` 가 보이면 키를 보내지 않고 "사람 확인 필요" 로 보고). 단계 전문(worktree 연결·`.dflow-pane` 기록·이름표 등) = `references/spawn.md` 「5번 띄우기」.

   팀원을 Agent 도구 서브에이전트로 띄우지 않음 (머리말 「제1 제약」).
6. spawn 직후 `team.spawn` 에 `slot`·`tsk`·`order`·`id8`·`worktree`·`handle`·`spawn_kind` 기록.
   - 새 작업 → `spawn_kind` = `new`.
   - `worktree` = 팀원 worktree 절대경로 (모르면 `-`).
   - `handle` = `tmux:<pane_id>` 또는 Orca 터미널 핸들 (없으면 `-`).
   - 재구성이 이 기록으로 슬롯과 작업을 이음.
   - id8 을 영구 제외(진행 중)에 넣음. 빠뜨리면 압축 뒤 재구성이 그 작업을 놓침.

같은 작업 재spawn 은 여섯뿐 (위 0-6 단계 번호와 구별하려고 ①-⑥ 로 적음):
- ① poll 이 그 작업을 다시 돌려준 경우 (일시 제외가 풀린 `skipped`, 제외 안 하는 `failed rate-limit`).
- ② 고아 스캔이 "재개 가능" 으로 분류한 중단 작업.
- ③ `--resume` 으로 사람이 지목한 작업.
- ④ 자동 재시작(`references/restart.md`)이 다시 띄우는 작업.
- ⑤ 「5-2. 해소 spawn」 의 해소 워커. 주문이 `reported`·`approved` 라 개발 재spawn 아님. `resolve-decide.mjs` 판정 안에서만 띄움.
- ⑥ 「설계 승인」 된 작업의 이어 가기 (계약 2.11, 「2-3」 의 `build`).

- ① = 이 절 / ⑤ = 「5-2」 / ②③④⑥ = 이 절 아닌 「5-1. 재개 spawn」 절차 (worktree 새로 안 만들고 claim 도 안 함).
- `blocked` 는 재spawn 안 함. 팀원이 자기 screen 에서 답을 기다리므로 그 자리에서 이어 감 (「6. blocked」).
- 다시 띄울 때 이름·branch 충돌은 backends.md 「고아 정리 규칙」 5번(생성 branch 정리)과 결과 처리의 worktree 정리가 맡음.

### 5-1. 재개 spawn

중단된 작업을 이어 띄움. 새 작업 spawn 과 차이 둘: **worktree 새로 안 만듦**(남아 있으면 그대로 사용), **claim 안 함**.

대상 다섯:
- 고아 스캔 "재개 가능" (**자동**, 대기 큐보다 먼저)
- 좌석표 「이어서 시작」 의 `resume_requests` (**요청**, 재시도 상한 무시)
- `references/restart.md` 「재투입」 (**재시작**)
- `--resume <id8>` (**지목**, 자동 판정의 거부 사유 무시. 서버 status 가 `claimed` 일 때만 재개)
- 「2-3」 `build` 의 claimed 원소 (**승인**, 계약 2.11. worktree 없으면 원격 agent branch 에서 생성)

띄울 때마다:
1. `references/resume.md` 를 Bash `cat` 으로 읽음.
2. 「서버 판단 확인」(계약 2.11)과 0-9항 절차 그대로 따름: 입장 제어 → 손실 보고 → 다른 PC 경고 → worktree 확보 → `TASK_DIR`·`DOCKER` → 슬롯·`.dflow-agent` 되돌리기 → 포인터 재작성 → 중단 표식 정리·띄우기 → 옛 `.result` 삭제 → `team.spawn`(`resume`).

### 5-2. 해소 spawn

해소 큐의 작업을 해소 전용 워커로 띄움.
- worktree = `origin/<기본브랜치>` 에 detach 한 `<MAIN>/.claude/worktrees/dflow-<id8>-resolve`.
- 포인터 = `references/resolve-prompt.md` 가리킴.
- `team.spawn` 의 `spawn_kind` = `resolve`.
- 재개 다음·대기 큐보다 먼저, 동시 상한 `max(1, ⌊인원/2⌋)`, claim 안 함. 입장 제어도 같아 `SPAWN_DEFERRED_CAPACITY` 면 해소 큐에 그대로 두고 해소 시도로 세지 않음. 세부 = `references/spawn.md` 「5-2. 해소 spawn 세부」.
- 절차 정본 = `references/merge-conflict.md` 「2. 해소 spawn」, 결과 처리 = 같은 문서 「4」.

### 5-3. 입장 제어 (spawn 직전 자원 확인)

**입장 제어 정본 = 이 절** (「5」 0항·「5-2」·`references/resume.md` 0항·backends.md 「입장 제어」·restart.md 「재투입」 이 이 절을 가리킴).
- 팀원 세션 새로 띄우기 직전마다 PC 여유 자원 확인.
- 대상: 새 작업(「5」)·재개와 재투입(「5-1」)·해소(「5-2」)·차단기의 test spawn 모두.
- 이미 모자란 PC 에 팀원을 더 얹지 않음.
- **이미 떠 있는 팀원은 건드리지 않음** (끄거나 멈추지 않음).
- 무거운 명령 자체의 동시 실행은 워커 쪽 `heavy.mjs`(`dev-discipline.md` 「무거운 명령 줄 세우기」)가 따로 묶음.

**집행 = spawn 블록 한 곳.**
- backends.md 「입장 제어」 블록이 아래 명령 호출. 막히면 `SPAWN_DEFERRED_CAPACITY` 출력 후 끝.
- 새 작업(「5」)·해소(「5-2」)의 spawn 블록(backends.md 「팀원 워크트리 준비」)은 두 백엔드 모두 그 두 줄로 시작 → 블록 돌기만 하면 걸림.
- 블록을 통째로 안 도는 자리(재개·재투입: `references/resume.md` 0항, restart.md 「재투입」)는 「입장 제어」 블록을 첫 단계로 따로 실행 (worktree 새로 안 만들고 있는 것을 이어 씀).
```bash
node .claude/skills/dflow-team/scripts/capacity.mjs --state "$(git rev-parse --git-path dflow-team.capacity)"; echo "rc=$?"
```
- `CAPACITY_OK`(rc=0): 띄움.
- `CAPACITY_LOW`(rc=1) = 블록의 `SPAWN_DEFERRED_CAPACITY`: 이번 기상에 팀원 새로 안 띄움.
  - 후보는 대기 큐에 그대로 둠 (재개 대상 = 재개 목록, 해소 = 해소 큐, 재투입 = 재시작 대기).
  - 한 후보가 막히면 같은 기상의 나머지 후보도 안 띄움.
  - 작업 탓 아님 → `team.result` 안 남기고 일시 제외에도 안 넣음.
  - 다음 기상(늦어도 `TICK`)에 다시 확인.
- `CAPACITY_UNKNOWN`(rc=0) 은 막지 않고 띄움. **알림은 줄 끝이 `notify=1` 일 때만** 사람에게 한 줄. 알림 문구·상태 파일·기준값(메모리 압박·여유 메모리·load·무거운 명령 대기자)·환경변수 = `references/spawn.md` 「5-3. 입장 제어: 알림·기준값」(정본 기준값은 `capacity.mjs` 머리).

## 6. blocked

**공통**:
- 사람에게 AskUserQuestion 으로 안 물음 (자동 루프).
- 결과 처리가 `team.blocked` 기록.
- PushNotification 도구 있으면(지연 로드면 ToolSearch 로 불러) 질문 요약으로 한 번 알림. 없으면 screen 통지만.
- 그 id8 은 진행 중으로 영구 제외에 남김.

**그 슬롯은 blocked 팀원이 계속 잡음. 다른 작업에 재배정 안 함.**
- 살아 있는 프로세스 둘이 같은 `AGENT_ID` 로 heartbeat 보내면 좌석표가 한 인물을 두 책상에 그림.
- 두 백엔드 모두 팀원이 같은 worktree·branch 에서 이어 감. 재spawn·재claim 없음.
- `.result` 가 새 줄로 바뀌면 감시 루프가 알림.

**tmux**: "결정 필요 <id8>: <질문>. `TMUX= tmux -L dflow attach` 로 붙어 그 pane 에서 직접 답하거나, 이 세션에
`<id8> <답>` 으로 답하라" 고 알림.

**Orca**: "결정 필요 <id8>: <질문>. Orca 의 `w<slot> · <TSK> <id8> · <작업 이름>` 탭에서 답하라" 고 알림.

**답 매칭(tmux)**: 답 형식 `<id8> <답>`. 기다리는 `blocked` 가 하나뿐이면 id8 생략 가능. 여럿인데 id8 없으면 되묻음(루프 뒤 팀장이 사람에게 묻는 유일한 곳). 넣기 **전에** "그 pane 에 답을 넣는다" 한 줄 알림. `send-keys -l --` 로 넣고 `ANSWER_SENT` 면 `team.answer`(id8, answer) 기록, `PANE_GONE` 이면 이미 끝난 팀원(수동 `/dflow-dev <id8>` 대상, 영구 제외, 슬롯 해제). 슬롯은 그대로 둠. 명령 블록 = `references/blocked-seat.md` 「답 넣기 (tmux)」.

## 7. 마감

진입 조건:
- poll exit 8
- poll 오류 exit
- `failed not-isolated`
- 기상 때 확인한 종료 시각 경과
- 종료 요청 (`STOP_REQUESTED` 또는 사람의 말)

잠금 상실(「2-3」 `LOCK_LOST`)과 lease 상실(`LEASE_LOST`)은 「잠금 상실 마감」·「lease 상실 마감」 으로 감.

들어서면:
- 먼저 아래를 읽고 그 절차(1-7, 잠금 상실 마감, lease 상실 마감) 그대로 따름.
- 새 spawn 은 곧바로 멈춤.
```bash
cat .claude/skills/dflow-team/references/closing.md
```

## 좌석표 연동

- 팀원 좌석 식별 = worktree 루트 `.dflow-agent`(`<신원>/<host>/w<slot>`; `parked` 는 좌석 아님). 팀장 = `<신원>/<host>/lead`.
- STANDBY: 「1. 시작」 6번과 매 기상(`wake.mjs`)이 `dflow.mjs watch --agent … --json` 을 보냄(마감은 `--stop`). 응답의 `resume_requests` 도 읽음. 실패를 "요청 없음" 으로 읽지 않음.
- 전문 = `references/blocked-seat.md` 「좌석표 연동」.

## 금지

- 팀원에게 AskUserQuestion 쓰게 하기. 팀장이 사람에게 묻는 곳 = 시작 전 인자 질문(「인자」)과 답 매칭의 id8 되묻기, 둘뿐.
- 팀장이 작업을 claim·progress·done 하기. 서버 쓰기는 팀원 몫 (스윕의 merge만 팀장).
  - 재개도 같음: 서버가 이미 `claimed` → 다시 claim 안 함. 끊긴 Phase 잇기 = 이어받은 워커의 `/dflow-dev --worker`.
  - 예외 넷:
    1. merge 충돌 표시 heartbeat(`merge_conflict` 설정·해제, `references/merge-conflict.md` 「3」)는 팀장이 함. 주문 상태 안 바꾸고 표시 열만 씀.
    2. 팀장이 띄운 해소 워커의 `/dflow-merge --resolve` 가 개발 branch에 한 건을 merge·push. "스윕의 머지만 팀장이 한다" 의 유일한 예외. 경합은 두 쪽 모두 non-fast-forward 거부로 드러남. force push 는 여전히 금지.
    3. 「2-3」 「설계 사전 검사」 의 `design-reopen` (ready 인 구현자동 작업의 사람 설계를 되돌림 — 주문의 설계 상태만 바꿈).
    4. 「3. 결과 처리」 의 설계 멈춤 이어받기에서 부르는 `design-done` (워커가 push 까지 마친 멈춤을 서버에 기록만 함, 설계 상태 스펙 6.3).
- 팀장이 대상 리포 소스 고치거나 build·test(gradle·npm test 등) 직접 돌리기 (머리말 「팀장 역할」, 예외 = 「2-4」 5번). 팀원이나 해소 워커에게 넘김.
  - 예외: 스킬이 팀장에게 맡긴 스크립트(`dialect-check.mjs` 등)가 안에서 test 돌리는 것.
- 한 기상에 스윕 두 번 이상 호출하기. `sweep-check.mjs` 가 `SWEEP_NONE` 인데 `/dflow-merge` 호출하기 (「4-0」 의 예외 제외).
- 팀원을 Agent 도구 서브에이전트로 띄우기 (`isolation: "worktree"` 를 주어도). 머리말 「제1 제약」.
- tmux 를 PATH 로 호출하기 (Orca shim 이 잡음). 언제나 전제 검사가 구한 절대경로(`TM`)로 호출 (backends.md 「진짜 tmux 찾기」).
- 팀원 worktree 에서 팀장이 git 조작하기. 예외: 읽기 조회, `parked` 표시, 「5-1. 재개 spawn」 의 `.dflow-agent` 되돌리기·포인터 재작성·옛 `.result` 삭제, backends.md 정리 절차.
- 팀장 체크아웃에서 poll.mjs 띄우기. 빈 디렉터리(「2-1」)에서만 띄움.
- 순번 참조, force push, 훅 우회(SKIP_GUARD).
- 같은 작업의 재spawn. 예외 = 「5. 팀원 spawn」 끝의 여섯뿐. `blocked` 는 재spawn 안 함.
- poll·감시 루프를 셸 `&` 로 띄우기. 둘은 Bash `run_in_background` 로만. 팀원 spawn 에도 `&` 금지 (tmux `split-window` 가 곧바로 돌아오고 pane 은 tmux 서버가 붙잡음).
- 컨텍스트 압축 뒤 Skill 도구로 `/dflow-team` 다시 부르기 (「팀장 상태」 「압축 뒤 첫 기상」).
