# /dflow-team 인자 질문·키 판정 상세 (SKILL.md 「인자」)

SKILL.md 「인자」 에서 참조. 「키 판정 상세」·「인자 질문」 = 아래 경우, 끝 「인자 전문」 = 도커 허용 태그·`--resume`·WP 범위·자동 merge 세부 필요할 때 Bash `cat` 으로 읽음:
- 사람에게 인자 물어야 할 때 (종료 시각 없음·틀림, 키 후보 둘 이상)
- 키 자동 선택해 저장할 때
- 키 판정이 `KEY_*`·`NO_*_KEY` 로 끝날 때

## 키 판정 상세

토큰마다 한 줄 JSON 출력: `n`·`prefix`·`name`·`email`·`who`·`expires_at`·`projects`·`bound`·`selected`·`in_use`. `/me` 실패 토큰 = `error`. 토큰 값 안 나옴.
- `bound` = 그 키 프로젝트에 이 리포 바인딩 프로젝트 있음
- `selected` = 지금 설정으로 `dflow.mjs` 고르는 키
- `who` = 그 키 신원 슬러그 (잠금 `owner` `<신원>` 과 같은 규칙)
- `in_use` = 같은 리포 **다른 worktree 의 살아 있는 팀장**이 그 신원 쓰면 그 worktree 경로, 아니면 `null`. 살아 있음 기준 = 전제 검사 `SAME_IDENTITY_LEAD` 와 같음 (`live-leads.mjs`)

`in_use` ≠ `null` 키는 시작 불가.
- 전제 검사가 어차피 거부 → 종료 시각까지 물은 뒤 아닌 묻기 전에 알려고 여기서 봄
- **같은 계정 키** 여럿 = `who` 같아 함께 빠짐. 이유: 잠금 `owner` 에 prefix 없이 신원만 있음. 좌석표·팀원 접두(`<신원>/<host>/`)도 신원 단위

- `bound` = `null` (프로젝트 바인딩 없음) → 키 판정 건너뛰고 전제 검사로. `NO_PROJECT` 가 시작 막음
- 선택지 = 후보마다 하나. label = `<name> · <email>`, description = `prefix <prefix> · <프로젝트 이름들> · 만료 <expires_at 의 날짜>`. 후보 4개 넘으면 앞 3개 내고 나머지는 "Other 에 prefix 를 적는다" 로 받음
- **종료 시각 인자 있어도 키 질문 함.** 인원·WP 범위는 기본값 있어 안 묻지만, 신원은 안전한 기본값 없음
- 키 묻는 호출은 WP 범위 선택지를 서버에서 안 뽑고 `전체 (기본)` 과 "Other 로 직접 적는다" 만 둠. 이유: 목록은 고른 키로 조회해야 하는데 키는 같은 호출의 답으로 정해짐
- 자동 선택·답 모두 고른 prefix 를 `.dflow.local` 끝에 더하고 한 줄 보고. 자동 선택 키가 첫 토큰이어도 더함.
  - 이유: 나중에 토큰 추가·순서 변경해도 이 리포 키 안 바뀜
  - `.dflow.local` 아직 없으면 새로 만듦
  - 새 방식 아닌 리포(레거시) = `.env` 에 `DFLOW_AS` 로 적음
  ```bash
  if [ "$(node .claude/skills/dflow-work/scripts/dflow.mjs config --source | sed -n 's/^mode=//p')" = new ]; then
    printf '\nas=%s\n' '<prefix>' >> .dflow.local
  else
    printf '\nDFLOW_AS=%s\n' '<prefix>' >> .env
  fi
  ```
  보고: "키: <이름> (<email>, <prefix>). `.dflow.local` 에 `as` 로 저장했습니다(레거시는 `.env` 의 `DFLOW_AS`). 바꾸려면 그 줄을 고치십시오."
  `.dflow.local`(레거시 `.env`) = gitignore 대상 → 전제 검사 `DIRTY` 에 안 걸림.
- `KEY_NOT_FOUND`: "`.dflow.local` 의 `as`(레거시 `.env` 의 `DFLOW_AS`)가 어느 토큰과도 맞지 않는다. `dflow.mjs profiles` 의 `prefix` 로 고쳐라" + profiles 출력을 표로 내고 끝.
  - `as`·`DFLOW_AS` = prefix 만 받음 (이메일·이름 불가). 이유: 훅이 network 없이 같은 키를 골라야 함
- `KEY_IN_USE`: "이 키의 신원(`<who>`)은 `<in_use 경로>` 의 팀장이 쓰고 있다. 같은 신원으로는 팀장을 둘 띄울 수 없다(`SAME_IDENTITY_LEAD`)" + profiles 출력을 표로 내고 끝.
  - `as`(레거시 `DFLOW_AS`) 있었다면 덧붙임: "이 워크트리의 `.dflow.local`(레거시 `.env`)에서 그 줄을 지우고 다시 실행하면 남은 키에서 고른다"
  - 다른 키로 **자동 전환 안 함.** 사람이 적은 값 조용히 무시하면 의도한 계정 아닌 신원으로 작업 claim 됨
- `NO_FREE_KEY`: "이 리포의 프로젝트에 속한 키가 모두 다른 워크트리의 팀장이 쓰는 신원이다. 다른 계정의 PAT 를 이 워크트리의 `.dflow.local`(레거시 `.env`)의 `pats`(레거시 `DFLOW_PATS`)에 더하거나, 그 팀장에 인원과 WP 범위를 더 주어라" + profiles 출력을 표로 내고 끝.
- `NO_KEY_FOR_PROJECT`: "이 리포의 D'Flow 프로젝트에 속한 키가 `.dflow.local`(레거시 `.env`)에 없다" + profiles 출력을 표로 내고 끝.
  - `error` = `auth` 행 → "폐기·만료된 키", `unreachable` 행 → "서버에 닿지 못함" 으로 적음 (조회 실패를 후보 없음으로 뭉개지 않으려고)
- profiles 행 없음 = `profiles` 실패 (pipe 뒤라 종료 코드 안 보임). 그 stderr 그대로 보고하고 끝.

## 인자 질문

- AskUserQuestion 한 번에 질문 모아 묻기. 종료 시각 빠졌을 때만 묻기. 종료 시각 있으면 나머지 선택 인자는 안 묻고 기본값 사용. 이유: 인자 다 준 사람 안 붙잡음.
  1. **종료 시각** (필수): 선택지 넷. 오늘 안 가까운 정시 하나 (없으면 뺌), `내일 09:00`, `다음 월요일 09:00` (오늘이 금·토·일일 때만. 아니면 `내일 18:00`), `종료 요청 전까지`. 사람이 "Other" 로 직접 적을 수 있음.
  2. **인원**: 이번 인자에 없을 때만. `3 (기본)`·`2`·`4`·`6` 순. 1·5 = "Other" 로 직접 적음 (선택지 넷까지). 이 PC 인원 상한(아래 「인원」 줄) 넘는 선택지 뺌.
  3. **WP 범위**: 이번 인자에 없을 때만. `전체 (기본)` 하나 + 서버 ready 목록에서 뽑은 WP 최대 3개.
     - 목록 = `dflow.mjs list --scope assigned` `RD` 행마다 show 한 `external_ref` TSK 번호 첫 칸 (`TSK-02-05` → `WP-02`)
     - 조회 실패 → `전체 (기본)` 과 "Other 로 직접 적는다" 만 둠
     - `multiSelect` 로 묻기. `전체` 함께 고르면 전체로 봄
  - 모델은 안 물음. 이유: 기본 모델로 도는 게 통상, 질문 많으면 답 늦어짐.
- 답 종료 시각이 여전히 틀리면 한 번만 더 묻고, 그래도 안 맞으면 아래 사용법 출력하고 끝.
```
사용법: /dflow-team [인원] <종료시각|종료 요청 전까지> [모델] [effort] [WP-XX…]
       예) /dflow-team 18:00 · /dflow-team 4명 3일 뒤 06:00까지 opus · /dflow-team 종료 요청 전까지 WP-02
       자세한 안내: /dflow-team help
```

# 인자 전문 (SKILL.md 「인자」 에서 이동)

SKILL.md 「인자」 에서 옮긴 세부(원문 그대로). 요약은 SKILL.md 에 있음. 해당 인자 다룰 때 Bash `cat` 으로 읽음.

## 인자 전문: 도커 허용 태그 세부

  - 허용된 팀원도 도커 명령은 PC 전역 도커 슬롯(`heavy.mjs --pool docker`, 기본 1개) 잡은 동안만 실행.
  - 여러 Task 공통 목적 도커 검증(DB 방언)은 팀원 아닌 「4. 승인 스윕」 끝 방언 검증이 한 번 실행.
  - `.dflow`·`.dflow.local` `no_docker=1` = 태그 있어도 막는 강제 스위치. 워커가 직접 읽음(`0` 은 아무것도 풀지 않음).
  - 태그 = 사람이 D'Flow 웹 WBS 명세나 wbs.md import tags 필드로 지정(`agent` 와 같은 자리).
  - 도커 명령 = 대상 리포 제공 컨테이너 재사용 방식 따름. 규칙 정본 = dev-discipline.md 「도커 사용 규칙」.

## 인자 전문: --resume 세부

  - `--resume` = **worktree 가 이 PC 에 없거나 다른 PC 가 claim 한 작업**을 사람이 직접 지목해 이어받게 함(「5-1. 재개 spawn」).
  - 지목한 id8 = 자동 판정의 거부 사유(재시도 상한 초과, `claimed_by` 불일치) 무시하고 진행. 띄우기 전에 남은 것·잃는 것 한 줄 보고.
  - 계약 2.11 서버에서 서버 `mine` 이 거짓이면(다른 PC 가 30분 안에 돌렸거나 다른 신원이 잡음) 안 띄움(`references/resume.md` 「서버 판단 확인」).

## 인자 전문: WP 범위 세부

  - 이 범위 = **새 배정만** 좁힘. poll 이 `--wp` 로 그 WP Task 만 돌려줌(「2-1」).
  - 판정 기준 = `external_ref` TSK 번호 첫 칸(`dict/TSK-02-05` → `WP-02`).
  - 재개(「5-1. 재개 spawn」)·「이어서 시작」 요청·승인 스윕 = 범위 무관하게 그대로.
  - 범위 안 작업이 범위 밖 선행 기다리면 워커가 `skipped` 로 끝내고 일시 제외됨. 지금과 같음.
  - 범위 = `team.start` `wp` 에 남김(「1. 시작」 5번). context 압축 뒤 poll 다시 띄울 때 그 값으로 복원.

## 인자 전문: 자동 머지 세부

  - **승인은 사후 확인.** 스윕이 `/dflow-merge --on-report` 로 돔(「4. 승인 스윕」). 승인 전에 merge 한 작업은 state.json 에 `phase: "merged"`·`unapproved: true` 남김.
  - 나중에 사람이 승인하면 다음 스윕이 표식만 지움. 반려하면 "반려(머지됨)" 으로 보고(되돌리기는 사람이 고름).
  - 꺼져 있으면 종전대로 approved 만 merge. 승인 대기인 선행의 후속은 승인·merge 뒤에야 풀림.
