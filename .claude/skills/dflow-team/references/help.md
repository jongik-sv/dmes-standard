# /dflow-team 사용 안내

D'Flow 에서 나에게 배정 + `agent` 태그 켜진 ready 작업을 팀원 N명에게 나눠 동시 개발시키는 팀장.
팀원은 각자 worktree 에서 `/dflow-dev` 를 돌리고, 끝나면 D'Flow 에 완료 보고(승인 대기).
팀장은 사람이 승인한 작업을 main 에 merge.

## 사용법

```
/dflow-team [인원] <종료시각|종료 요청 전까지> [모델] [effort] [WP-XX…]
/dflow-team help
```

인자는 자연어 가능. 순서 자유.

| 인자 | 필수 | 예 | 뜻 |
|---|---|---|---|
| 종료 시각 | 예 | `18:00` · `3일 뒤 06:00까지` · `월요일 09:00` · `종료 요청 전까지` | 새 배정을 멈추는 시각. 빠지면 팀장이 물음 |
| 인원 | 아니오 | `2명` · `6명` | 동시에 띄울 팀원 수. 기본 3, 최대 PC 별 `min(6, 무거운 명령 슬롯+2)`(16GB 면 4). 환경변수 `DFLOW_TEAM_MAX` 로 덮어씀(6 까지). 빈 슬롯에 선행 대기 작업 설계를 먼저 주는 상한 = `DFLOW_DESIGN_AHEAD_MAX`(기본 2, 0 이면 끔) |
| 모델 | 아니오 | `opus` · `sonnet` | 팀원 모델. 없으면 기본 모델 |
| effort | 아니오 | `low` · `medium` · `high` · `xhigh` · `max` | 팀원 추론 강도. 없으면 `high`. 두 백엔드 모두 적용(2026-09-24부터) |
| WP 범위 | 아니오 | `WP-02` · `WP-02 WP-03` · `dict/WP-02` | 새 배정을 그 WP 작업으로 한정 |
| 설계 방식 | — | (인자 아님) | 완전자동·설계 검토·구현자동 = D'Flow WBS 작업 패널에서 작업마다 선택. 팀장은 작업마다 서버 판단 따름(옛 인자 `설계만`·`구현부터` 안 받음) |
| 재개 | 아니오 | `--resume 443b8ffe` · `443b8ffe 재개` | 다른 PC 에서 멈춘 작업 등을 손으로 지목해 이어받음 |
| `--takeover` (강제 인수) | 아니오 | `--takeover` · `넘겨받기` | 같은 신원이 이 프로젝트 팀장을 다른 곳에서 돌리는 중일 때 인수. 밀려난 팀장은 멈추고, 그 워커는 하던 작업을 끝냄 |

## 예

```
/dflow-team 18:00                       오늘 18시까지, 팀원 3명
/dflow-team 2명 18시까지 opus            오늘 18시까지, 팀원 2명, opus
/dflow-team 18:00 opus effort xhigh     오늘 18시까지, opus, 추론 강도 xhigh
/dflow-team 18:00 WP-02                 WP-02 작업만 새로 배정
/dflow-team 3일 뒤 06:00까지             사흘 뒤 아침 6시까지 무인으로
/dflow-team 종료 요청 전까지 WP-03        멈추라고 할 때까지 WP-03 만
```

## 종료 시각

- 오늘 시각(`18:00`): 이미 지난 시각이면 팀장이 다시 물음. 밤에 `06:00` 쓰면 내일로 추측 안 하고 물음.
- 날짜 붙은 시각(`내일 07:00`, `3일 뒤 06:00`, `2026-09-21 06:00`): 지금부터 7일 이내만 허용.
- 종료 요청 전까지: 멈추라고 할 때까지 동작. 7일보다 길게 돌릴 때도 이것 사용.
- 시작 보고 첫 줄에 팀장이 해석한 절대 시각 출력. 틀리면 바로 "팀장 종료" 로 멈추고 다시 시작.

## 멈추기

종료 시각 전에도 언제든 멈출 수 있음. 진행 중 팀원 결과를 잠시(최대 1시간) 기다린 뒤 마감 보고.

1. 팀장 세션에 말함: `팀장 종료`, `마감해`, `그만`
2. 다른 터미널에서 종료 파일 생성(20초 안에 팀장이 인지).
   ```bash
   touch "$(git -C <팀장 체크아웃> rev-parse --git-path dflow-team.stop)"
   ```

마감 중 종료를 한 번 더 요청하면 기다리지 않고 곧바로 마감.
팀원은 팀장이 끝나도 자기 screen 에서 계속 동작. 다음 팀장이 이어받음.

## 시작 전 준비

- 팀장 체크아웃 = 개발 branch, 깨끗해야 함.
- 준비물: `.dflow`(commit, `api_base`·`project_id`) 와 `.dflow.local`(개인, `pats`·`dev_branch` 필수, `as`·`automerge`·`project_map` 선택).
- 예시: `.claude/skills/dflow-work/dflow.example`·`dflow.local.example`.
- 두 파일 없으면 종전 `.env` 로 동작.
- 프로젝트 바인딩 없으면 start 안 함. 이유: 한 사람이 여러 프로젝트에 속하면 다른 프로젝트 작업을 이 리포에서 개발하게 됨.
- `pats`(레거시 `DFLOW_PATS`)에 토큰이 둘 이상이면 팀장이 start 때 이 리포가 쓸 키를 정함.
  - 그 키를 `.dflow.local` 에 `as=<prefix>`(레거시는 `.env` 에 `DFLOW_AS=<prefix>`)로 기록.
  - 이 리포 프로젝트에 속한 키가 하나면 묻지 않고 선택. 둘 이상이면 물음.
  - 바꾸려면 그 줄 수정.
  - 키 목록 확인: `node .claude/skills/dflow-work/scripts/dflow.mjs profiles`
  - 시작 보고에 `키: <이름> (<email>, <prefix>)` 출력.
- 팀원이 잡을 작업은 D'Flow 에서 `agent` 태그 켬. 태그 없는 작업 = 사람 몫 → 안 건드림.
- 팀장은 한 체크아웃에 하나만 뜸. 다른 계정(다른 PAT)으로 동시에 돌리려면 clone 대신 팀장 worktree 생성.
  ```
  node .claude/skills/dflow-team/scripts/lead-worktree.mjs <이름>     # 주 체크아웃 루트에서
  ```
  - `.claude/worktrees/lead-<이름>` 생성, `.dflow.local`(레거시 `.env`) 복사. `as` 줄(레거시 `DFLOW_AS` 줄)은 빼고 복사.
  - 그 폴더에서 `claude` 를 띄워 `/dflow-team …` 실행.
  - 다른 팀장이 쓰는 계정을 뺀 나머지 키에서 이 팀장 키를 정해, 그 폴더 `.dflow.local`(레거시 `.env`)에 기록.
  - 키는 폴더(worktree)마다 따로.
  - 팀장 worktree 에 `node_modules` 불필요.
  - 다 쓰면 `git worktree remove --force .claude/worktrees/lead-<이름>` 으로 삭제.
- 같은 계정으로 팀장 둘 못 띄움(`SAME_IDENTITY_LEAD`). 일을 더 나누려면 팀장 하나에 인원과 WP 범위 지정.

## 팀원 화면과 질문

- Orca 안에서 띄우면 팀원 = Orca 탭(`w<slot> · <TSK> <id8> · <작업 이름>`). 터미널에서 띄우면 tmux 로 표시, `TMUX= tmux -L dflow attach` 로 확인.
- 팀원은 permission 확인 생략 모드로 동작. 팀장 세션 permission 모드와 무관.
- 팀원이 결정을 물으면(`blocked`) 팀장이 알림. 그 탭이나 pane 에서 직접 답하거나, 팀장 세션에 `<id8> <답>` 으로 답함.

## 팀원 첫 턴을 가볍게 (선택, PC별)

팀원은 켜진 plugin 과 MCP 를 끈 채로 뜸(기본). 사용자 스킬 목록·출력 스타일까지 줄이려면 팀장 체크아웃 `.dflow.local` 에 아래 키 기록. 안 적으면 지금과 같음. 다음 spawn(재개·재시작 포함)부터 반영.

```
worker_keep_skills=auto       # 내 전역 지침(~/.claude/CLAUDE.md)에 이름이 나오는 사용자 스킬만 남긴다(예: 브라우저 E2E 스킬). auto,<이름> 로 더할 수 있다
worker_keep_plugins=auto      # 지침이 쓰라는 플러그인만 켜 둔다(그 플러그인의 MCP 도 살린다). 나머지는 지금처럼 끈다
worker_skills_off=<끌 스킬 이름, 쉼표>          # 예: 팀원이 쓰지 않는 Claude Code 내장 스킬
worker_output_style=default   # 팀원의 출력 스타일
```

- `dflow-*` 와 대상 리포 프로젝트 스킬(`.claude/skills`)은 어떤 값을 적어도 유지.
- 적은 스킬·plugin·스타일이 그 PC 에 없으면 팀장이 경고 한 줄만 출력하고 그대로 띄움.
- `auto` = PC 마다 다른 도구(브라우저 스킬이냐 plugin 이냐 등)를 킷에 이름 없이 맞추는 값.
- 지침의 부정문("…을 먼저 고르지 않는다" 등)에 나온 이름은 유지 안 함.
- 남은 것 확인: spawn 때 `WORKER_SKILLS_AUTO`·`WORKER_PLUGINS_AUTO` 줄.
- 틀리면 이름 직접 기록(예 `worker_keep_plugins=<이름>@<마켓>`).
- 지침 파일 못 읽으면 사용자 스킬 하나도 안 끔.
- 이름 직접 기록 방식도 그대로 사용 가능(`worker_keep_skills=<이름,…>`, 남길 것 없으면 `none`).
- 사용자 전역 설정(`~/.claude/settings.json`) 수정 안 함. 팀원 전용 설정 파일(`~/.dflow/limits/<id8>.settings.json`)에만 기록. 근거·실측은 `references/rationale.md` 「팀원 첫 턴 컨텍스트 줄이기」.

## 여러 날 무인으로 돌릴 때

- macOS 면 팀장이 절전 방지(`caffeinate`) 적용. 뚜껑 닫으면 못 막으므로 전원 연결하고 연 채로 둠.
  Linux 서버는 따로 할 것 없음.
- 답 기다리는 팀원은 사람이 답할 때까지 슬롯 점유. 밤사이 슬롯이 줄 수 있음.
- 사용량 한도나 환경 문제로 실패 2건 이어지면 새 배정을 멈추고 30분마다 시험 1건만.
- 자동 재시작: 팀원이 결과 없이 멈추면 팀장이 같은 worktree·같은 자리에서 restart.
  - 멈춤 기준: 1시간 가까이 진척 없음, 또는 pane·탭에서 팀원 프로세스 죽음.
  - 2026-09-24부터 Orca 탭도 동일. 예전에는 Orca 탭을 자동 restart 안 하고 재시작 명령만 알림.
  - 한 작업당 최대 3번. 넘으면 「멈춤」 표에 올리고 `/dflow-team <종료시각> --resume <id8>` 명령 기록.
  - 사용량 한도에 걸리면 한도 풀린 뒤 한 번만 restart. 그때까지 새 배정 멈춤.
  - permission 거부·질문(`blocked`)·중단 = restart 안 하고 알림.

## 그 밖

- 승인은 사람이 D'Flow 웹에서 함. 팀장은 30분마다(그리고 결과가 올 때마다) 승인된 작업을 main 에 merge.
  팀장 worktree 의 팀장은 main 을 안 잡고 임시 worktree 에서 merge 해 push.
- 자동 merge: `.dflow.local` 에 `automerge=1` 넣으면(레거시는 `.env` 에 `DFLOW_AUTOMERGE=1`) 완료 보고된 작업을 승인 전에 바로 개발 branch 에 merge 하고 다음 Task 착수.
  - 의존 사슬 있는 WBS 가 승인 한 번에 멈추지 않게 하는 설정.
  - 승인은 사후. 승인되면 다음 스윕이 표식(`unapproved`)만 삭제.
  - 반려되면 "개발 branch 에 merge 된 반려 작업" 과 그 위에 쌓였을 수 있는 작업 보고.
  - 되돌리기(`git revert`)와 재작업 중 선택 = 사람.
  - 기본 = 꺼짐.
- 도커: 팀원은 인원 무관하게 docker·Testcontainers 검증을 빼고 동작. 뺀 것을 완료 보고에 기록.
  - 꼭 도커 필요한 Task 는 D'Flow 에서 그 작업에 `docker` 태그 부착. 그 팀원만 도커 사용. PC 전체에서 도커 명령은 한 번에 하나씩 동작.
  - DB 방언 검증처럼 여러 Task 가 같은 목적으로 도는 검증은 `.dflow` 에 `dialect_check=<명령>` 기록하면 승인 스윕이 merge 뒤 한 번 실행.
  - PC 전용 값(JAVA_HOME 등)이 든 명령은 `.dflow.local` 에 기록.
  - 태그가 있어도 막으려면 `no_docker=1` 추가.
  - 팀원도 팀장도 꺼진 도커 런타임을 스스로 안 켬. 방언 검증은 보류하고 알림.
- 반려된 작업은 자동 재배정 안 함. `/dflow-dev <id8>` 로 사람이 재작업 시작.
- 마감 보고 "멈춤" 표에 자동으로 잇지 못한 작업과 이어받는 명령이 함께 출력.
- 팀원이 겪은 에러·문제점은 팀장 체크아웃 `docs/dflow-team/issues.md` 에 누적.
- commit 안 하는 로컬 기록. 스킬·환경 개선 때 읽음.

## 머지 충돌 해소 (2026-09-23)

승인 스윕이 개발 branch 와 충돌한 작업을 만나고 그 작업이 이 신원 것이면, 해소 전용 팀원(`w<slot> · 해소 <TSK> <id8>`) start.
- 해소 팀원은 개발 branch 위 merge commit 에서 해소.
- 한 작업에 3번까지, 동시에는 인원의 절반(최소 1)까지.
- 못 풀면 "사람이 머지해야 함" 으로 보고하고 좌석표에 「머지 충돌」 표시.
- 사람이 손으로 merge 하면 다음 스윕이 표시 해제.
- 새 인자 없음.
