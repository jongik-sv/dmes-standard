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
