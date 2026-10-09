# /dflow-team 인자 질문·키 판정 상세 (SKILL.md 「인자」)

SKILL.md 「인자」 가 가리킴. 아래 때만 Bash `cat` 으로 읽음:
- 사람에게 인자를 물어야 할 때 (종료 시각 없음·틀림, 키 후보 둘 이상)
- 키를 자동 선택해 저장할 때
- 키 판정이 `KEY_*`·`NO_*_KEY` 로 끝날 때

## 키 판정 상세

토큰마다 한 줄 JSON 출력: `n`·`prefix`·`name`·`email`·`who`·`expires_at`·`projects`·`bound`·`selected`·`in_use`. `/me` 가 실패한 토큰은 `error`. 토큰 값은 안 나옴.
- `bound` = 그 키의 프로젝트에 이 리포의 바인딩 프로젝트가 있음
- `selected` = 지금 설정으로 `dflow.mjs` 가 고르는 키
- `who` = 그 키의 신원 슬러그 (잠금 `owner` 의 `<신원>` 과 같은 규칙)
- `in_use` = 같은 리포의 **다른 워크트리에서 살아 있는 팀장**이 그 신원을 쓰면 그 워크트리 경로, 아니면 `null`. 살아 있음 기준 = 전제 검사 `SAME_IDENTITY_LEAD` 와 같음 (`live-leads.mjs`)

`in_use` 가 `null` 아닌 키로는 시작 불가.
- 전제 검사가 어차피 거부하므로, 사람에게 종료 시각까지 물은 뒤가 아니라 묻기 전에 알려고 여기서 봄
- **같은 계정의 키** 여럿은 `who` 가 같아 함께 빠짐. 잠금 `owner` 에는 prefix 없이 신원만 있고, 좌석표·팀원 접두(`<신원>/<host>/`)도 신원 단위이기 때문

- `bound` 가 `null` (프로젝트 바인딩 없음) → 키 판정 건너뛰고 전제 검사로. `NO_PROJECT` 가 시작을 막음
- 선택지는 후보마다 하나. label = `<name> · <email>`, description = `prefix <prefix> · <프로젝트 이름들> · 만료 <expires_at 의 날짜>`. 후보가 4개 넘으면 앞 3개를 내고 나머지는 "Other 에 prefix 를 적는다" 로 받음
- **종료 시각이 인자로 주어져도 키 질문은 함.** 인원·WP 범위는 기본값이 있어 안 묻지만, 신원에는 안전한 기본값이 없음
- 키를 묻는 호출에서는 WP 범위 선택지를 서버에서 안 뽑고 `전체 (기본)` 과 "Other 로 직접 적는다" 만 둠. 이유: 그 목록은 고른 키로 조회해야 하는데, 키는 같은 호출의 답으로 정해짐
- 자동 선택이든 답이든, 고른 prefix 를 `.dflow.local` 끝에 더하고 한 줄 보고. 자동 선택한 키가 첫 토큰이어도 더함.
  - 이유: 나중에 토큰을 더하거나 순서를 바꿔도 이 리포의 키가 안 바뀜
  - `.dflow.local` 이 아직 없으면 새로 만듦
  - 새 방식이 아닌 리포(레거시)는 `.env` 에 `DFLOW_AS` 로 적음
  ```bash
  if [ "$(node .claude/skills/dflow-work/scripts/dflow.mjs config --source | sed -n 's/^mode=//p')" = new ]; then
    printf '\nas=%s\n' '<prefix>' >> .dflow.local
  else
    printf '\nDFLOW_AS=%s\n' '<prefix>' >> .env
  fi
  ```
  보고: "키: <이름> (<email>, <prefix>). `.dflow.local` 에 `as` 로 저장했습니다(레거시는 `.env` 의 `DFLOW_AS`). 바꾸려면 그 줄을 고치십시오."
  `.dflow.local`(레거시 `.env`)은 gitignore 대상이라 전제 검사의 `DIRTY` 에 안 걸림.
- `KEY_NOT_FOUND`: "`.dflow.local` 의 `as`(레거시 `.env` 의 `DFLOW_AS`)가 어느 토큰과도 맞지 않는다. `dflow.mjs profiles` 의 `prefix` 로 고쳐라" + profiles 출력을 표로 내고 끝.
  - `as`·`DFLOW_AS` 는 prefix 만 받음 (이메일·이름 불가). 훅이 네트워크 없이 같은 키를 골라야 하기 때문
- `KEY_IN_USE`: "이 키의 신원(`<who>`)은 `<in_use 경로>` 의 팀장이 쓰고 있다. 같은 신원으로는 팀장을 둘 띄울 수 없다(`SAME_IDENTITY_LEAD`)" + profiles 출력을 표로 내고 끝.
  - `as`(레거시 `DFLOW_AS`)가 있었다면 덧붙임: "이 워크트리의 `.dflow.local`(레거시 `.env`)에서 그 줄을 지우고 다시 실행하면 남은 키에서 고른다"
  - 다른 키로 **자동으로 안 바꿈.** 사람이 적어 둔 값을 조용히 무시하면 의도한 계정이 아닌 신원으로 작업이 claim 됨
- `NO_FREE_KEY`: "이 리포의 프로젝트에 속한 키가 모두 다른 워크트리의 팀장이 쓰는 신원이다. 다른 계정의 PAT 를 이 워크트리의 `.dflow.local`(레거시 `.env`)의 `pats`(레거시 `DFLOW_PATS`)에 더하거나, 그 팀장에 인원과 WP 범위를 더 주어라" + profiles 출력을 표로 내고 끝.
- `NO_KEY_FOR_PROJECT`: "이 리포의 D'Flow 프로젝트에 속한 키가 `.dflow.local`(레거시 `.env`)에 없다" + profiles 출력을 표로 내고 끝.
  - `error` 가 `auth` 인 행 = "폐기·만료된 키", `unreachable` 인 행 = "서버에 닿지 못함" 으로 적음 (조회 실패를 후보 없음으로 뭉개지 않기 위해)
- profiles 행이 하나도 없음 = `profiles` 실패 (파이프 뒤라 종료 코드 안 보임). 그 stderr 를 그대로 보고하고 끝.

## 인자 질문

- 한 번의 AskUserQuestion 에 질문을 모아 묻기. 종료 시각이 빠졌을 때만 묻고, 종료 시각이 주어졌으면 나머지 선택 인자는 안 묻고 기본값 사용. 이유: 인자를 다 준 사람을 안 붙잡음.
  1. **종료 시각** (필수): 선택지 넷. 오늘 안의 가까운 정시 하나 (없으면 뺌), `내일 09:00`, `다음 월요일 09:00` (오늘이 금·토·일일 때만. 아니면 `내일 18:00`), `종료 요청 전까지`. 사람이 "Other" 로 직접 적을 수 있음.
  2. **인원**: 이번 인자에 없을 때만. `3 (기본)`·`2`·`4`·`6` 순. 1·5 는 "Other" 로 직접 적음 (선택지는 넷까지). 이 PC 인원 상한(아래 「인원」 줄)을 넘는 선택지는 뺌.
  3. **WP 범위**: 이번 인자에 없을 때만. `전체 (기본)` 하나 + 서버 ready 목록에서 뽑은 WP 최대 3개.
     - 목록 = `dflow.mjs list --scope assigned` 의 `RD` 행마다 show 한 `external_ref` 의 TSK 번호 첫 칸 (`TSK-02-05` → `WP-02`)
     - 조회 실패 → `전체 (기본)` 과 "Other 로 직접 적는다" 만 둠
     - `multiSelect` 로 묻기. `전체` 를 함께 고르면 전체로 봄
  - 모델은 안 물음. 기본 모델로 도는 것이 통상이고, 질문이 많으면 답이 늦어지기 때문.
- 답으로 받은 종료 시각이 여전히 틀리면 한 번만 더 묻고, 그래도 안 맞으면 아래 사용법을 출력하고 끝.
```
사용법: /dflow-team [인원] <종료시각|종료 요청 전까지> [모델] [effort] [WP-XX…]
       예) /dflow-team 18:00 · /dflow-team 4명 3일 뒤 06:00까지 opus · /dflow-team 종료 요청 전까지 WP-02
       자세한 안내: /dflow-team help
```

# 인자 전문 (SKILL.md 「인자」 에서 이동)

SKILL.md 「인자」 에서 옮긴 세부(원문 그대로). 요약은 SKILL.md 에 있고, 해당 인자를 다룰 때 Bash `cat` 으로 읽음.

## 인자 전문: 키 판정 표·묻기

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

## 인자 전문: 도커 허용 태그 세부

  - 허용된 팀원도 도커 명령은 PC 전역 도커 슬롯(`heavy.mjs --pool docker`, 기본 1개)을 잡은 동안만 실행.
  - 여러 Task 가 같은 목적으로 도는 도커 검증(DB 방언)은 팀원이 아니라 「4. 승인 스윕」 끝의 방언 검증이 한 번 실행.
  - `.dflow`·`.dflow.local` 의 `no_docker=1` = 태그가 있어도 막는 강제 스위치. 워커가 스스로 읽음(`0` 은 아무것도 풀지 않음).
  - 태그는 사람이 D'Flow 웹의 WBS 명세나 wbs.md import 의 tags 필드로 지정(`agent` 와 같은 자리).
  - 도커 명령은 대상 리포가 제공하는 컨테이너 재사용 방식을 따름. 규칙 정본 = dev-discipline.md 「도커 사용 규칙」.

## 인자 전문: --resume 세부

  - `--resume` = **워크트리가 이 PC 에 없거나 다른 PC 가 claim 한 작업**을 사람이 손으로 지목해 이어받게 함(「5-1. 재개 spawn」).
  - 지목한 id8 은 자동 판정의 거부 사유(재시도 상한 초과, `claimed_by` 불일치)를 무시하고 진행. 띄우기 전에 남은 것과 잃는 것을 한 줄로 보고.
  - 계약 2.11 서버에서는 서버 `mine` 이 거짓이면(다른 PC 가 30분 안에 돌렸거나 다른 신원이 잡음) 안 띄움(`references/resume.md` 「서버 판단 확인」).

## 인자 전문: WP 범위 세부

  - 이 범위는 **새 배정만** 좁힘. poll 이 `--wp` 로 그 WP 의 Task 만 돌려줌(「2-1」).
  - 판정 기준 = `external_ref` 의 TSK 번호 첫 칸(`dict/TSK-02-05` → `WP-02`).
  - 재개(「5-1. 재개 spawn」)·「이어서 시작」 요청·승인 스윕은 범위 무관하게 그대로.
  - 범위 안 작업이 범위 밖 선행을 기다리면 워커가 `skipped` 로 끝내고 일시 제외되는 것은 지금과 같음.
  - 범위는 `team.start` 의 `wp` 에 남김(「1. 시작」 5번). 컨텍스트 압축 뒤 poll 을 다시 띄울 때 그 값으로 복원.

## 인자 전문: 자동 머지 세부

  - **승인은 사후 확인.** 스윕이 `/dflow-merge --on-report` 로 돔(「4. 승인 스윕」). 승인 전에 머지한 작업은 state.json 에 `phase: "merged"` 와 `unapproved: true` 를 남김.
  - 나중에 사람이 승인하면 다음 스윕이 표식만 지움. 반려하면 "반려(머지됨)" 으로 보고(되돌리기는 사람이 고름).
  - 꺼져 있으면 종전대로 approved 만 머지. 승인 대기인 선행의 후속은 승인·머지 뒤에야 풀림.
