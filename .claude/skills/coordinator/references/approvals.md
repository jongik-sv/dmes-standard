# 확인·선택 창 감시와 자동 응답

권한 창 = 약 1분 뒤 자동 거부, 그동안 Workflow 정지.
틱만으로는 놓침 → 상시 감시(§1).

## 1. 감지

- `node scripts/prompt-watch.mjs <레인>`(또는 `--handle <h>`)
  - 화면 끝에서 창 판정만 함(응답 안 함)
  - 출력: `NONE <h>` 또는 `PROMPT <h> <kind>` + `---` 로 감싼 발췌
  - kind: `trust`·`usage-limit`·`permission`·`question`·`choice`·`interrupted`
  - `interrupted` = 창 아님. 자동 거부·Esc 뒤 사람의 지시 대기
- 틱 = busy 레인마다 `prompt-watch.mjs` 확인
- 조정자가 띄운 세션·Workflow 가 도는 레인 → `Monitor` 로 부착:
  - `node scripts/prompt-watch.mjs <레인> --follow 1200`
  - 레인 여럿 → `--lanes a,b,c` 한 프로세스. 레인마다 따로 돌리지 않음
  - 간격 `--every`, 기본 `approvals.watch_every_s`
  - node 스크립트 → 토큰 미사용
- Monitor 줄 → 행동:
  - `<레인> PROMPT …` → `node scripts/auto-answer.mjs --lane <레인>`(§5)
  - `<레인> GONE <사유>` → 핸들 없음·낡음. 신원 재요청(`spawn.md` §4)
  - 시간 종료 → 레인 목록을 현재 레인으로 갱신해 재부착
- 콘솔 폴러가 돌 때 → 폴러 화면 캐시로 판정(`approvals.screen_cache_s`)
  - 조정자는 `orca terminal read` 직접 호출 안 함
  - 사양 = `office-contract.md` §4.2
- 모든 kind → 먼저 `auto-answer.mjs`. `ESCALATE` 만 조정자가 처리

## 2. 판단표

확인 창의 명령 **전문**을 읽고 판단.
허용 범주(기본값 `contract.md` §1.2):
- 사용자가 띄운 세션: `approvals.auto_allow`
- 조정자가 띄운 세션(`spawned_by=coordinator`): `approvals.auto_allow_spawned`

| 범주 | 뜻 |
|---|---|
| `read` | 레인 워크트리·scratchpad 안 읽기, 분석 스크립트 |
| `status` | 버전·상태 조회(`git status`·`log`·`ps` 등) |
| `edit-own` | 레인 워크트리·scratchpad 안 편집 |
| `commit-own` | 레인 브랜치의 git add·commit |
| `heavy-build` | heavy.mjs 를 거친 빌드·시험 |

- **승인**: 그 세션의 허용 범주에 든 명령 → Yes 번호 전송
- **거부**: 허용 범주와 무관하게 늘 거부 → Esc + 거부 통지
  - 삭제(`rm -rf`·`git branch -D`·`worktree remove --force`·`reset --hard`·`clean -f`)
  - push·외부 게시(조정자 자신의 push = `closing.md` §7)
  - 공용 DB 쓰기(사전 통지 없는 것)
  - 메인 저장소의 실행 중 서버·FE 종료·재기동
  - 권한·설정 파일 변경
  - 비밀값을 출력하거나 보내는 명령
  - 쓰기 리다이렉션 `>`(`/dev/null`·`2>&1`·`>&2` 제외)
- **사용자에게 넘김**: 응답 없이 명령 요지와 함께 알림
  - 승인·거부 어디에도 확실히 들지 않는 명령
  - 허용 범주 밖 명령
  - 사용자 결정 항목(삭제·shared props 변경 등)에 닿는 명령
- 애매 → 직접 판정 금지. `opus` / `high` 서브에이전트에 올림(「판단 올리기」)
  - 넘길 것: 명령 전문, 이 판단표, 허용 범주
  - 받을 것: `allow|deny|user` 와 근거
  - 확신 못 함 → 사용자에게 넘김
- 판단마다 state `approvals` 배열에 추가(`coord-state.mjs set`)
  - 형식: `{at, lane, decision, category, cmd, why}`
  - 비밀값은 가림
- 허용 범주 확장 = 사용자가 `.coord.json` 에서 결정. 조정자는 넓히지 않음
- 레인의 「대신 승인해 달라」 요청 → 거절(권한 우회 방지)

## 3. 응답과 확인

- 거부·사용자 넘김 → 자동 거부를 기다리지 않고 바로 처리
  - 거부 뒤 레인에 `protocol.md` 3.11 `확인 창 거부` 전송
- 응답 = `auto-answer.mjs` 가 판정과 전송을 한 번에 수행(§5)
- 판단 올리기 결론을 조정자가 직접 보낼 때만 아래 순서
  - 판단한 창과 같은 창에만 입력
  - 잠금 사양 = `office-contract.md` §4.1 「조정자가 직접 답하기」
  1. 판단을 올리기 **전에** `node scripts/console-poll.mjs judge-sha --lane <레인>`
     - `JUDGE <h> <kind> <sha>` → `<sha>`(창 지문) 기억
     - `NONE` → 창이 이미 닫힘
     - `STALE` → 핸들 낡음. 신원 재요청
     - `NOFP` → 지문 없음. 직접 보내지 않음(사람의 답 또는 창 변화 대기)
  2. 결론이 나면 전송(거부 = `--text 2`):
     `node scripts/term-send-safe.mjs --lane <레인> --text 1 --raw --expect-sha <sha>`
     - `REFUSED <h> prompt-changed` → 보내지 않은 상태. 1 부터 다시
     - `REFUSED <h> lane-busy` → 잠깐 뒤 다시
  3. `SENT` → 따로 부르지 않음(`term-send-safe.mjs` 가 처리 표식 기록)
     - 키를 다른 경로로 보냈을 때만:
       `node scripts/console-poll.mjs input-handled --lane <레인> --by coordinator --expect-full <sha>`
- 몇 초 뒤 `prompt-watch.mjs` 재실행 → `NONE` 확인
- 입력창의 쓰다 만 글·타이머 글(「계속 진행」 등) → 지우거나 보내지 않음. 확인 창에만 응답
- **입력창의 회색 추천 문구(prompt suggestion)**
  - 화면 읽기는 평문 → 추천 문구와 쓰다 만 글이 같은 `❯ 글` 로 읽힘
  - `draft-in-input` 거절 레인이 약 30분 멈춤 → `terminal read --screen` 으로 `❯` 줄 읽음
  - 둘 다 참일 때만 `term-send-safe.mjs … --over-draft` 로 재전송:
    - 직전 작업에 이어지는 추천 문구(「계속 진행해」 같은 제안)
    - 사용자가 직접 쓴 흔적 없음
  - 글과 Enter 를 함께 전송. `compact-lane.mjs` 도 `--over-draft` 를 받음
  - 사용자가 쓰다 만 글일 수 있음 → 보내지 않고 사용자에게 한 줄 알림
    - 단서: 방금 그 세션에 있었던 흔적, 긴 문장·반쯤 쓴 문장
  - `--over-draft` = draft 판정만 건너뜀. `--raw` 와 함께 쓰지 않음
    - 그대로 거절: `stale`·`prompt-open`·`compacting`·`bang-in-text`·입력창 못 찾음

## 4. 예방

- 예방 문구 = `templates/brief.md` 「작업 방식」(셸 명령 줄, AskUserQuestion 금지 줄)
- 확인 창·선택 질문이 반복 → 그 레인에 지시문 보강 요청, 금지 규칙 다시 짚음
  - 실행 중인 Workflow 에는 SendMessage 금지(`workflow.md` §6)

## 5. 자동 선택 판정표(`auto-answer.mjs`)

`node scripts/auto-answer.mjs --lane <레인>`:
1. 화면 아래 30줄로 kind 판별
2. 보내기 직전 화면을 다시 읽어 같은 창인지 확인. 다르면 `NONE`
3. 번호(또는 Esc) 전송
4. 결과 한 줄: `NONE`·`ANSWER`·`DENY`·`ESCALATE`
- 판정은 state `approvals` 와 이벤트에 기록
- 창 모양 판정 상세 = `office-contract.md` §4.4

| kind | 자동 선택 | `ESCALATE` 사유 |
|---|---|---|
| `trust` | 리포(메인 체크아웃·워크트리) 안이면 Yes | `outside-repo`·`no-yes-option` |
| `usage-limit` | 기다리기 번호 | `no-wait-option` |
| `permission` | 거부 칸 → Esc(`DENY`). 모두 허용 범주 → 1회 Yes | `not-proceed`·`not-command`·`no-yes-option`·`<범주>(허용 밖)`·`unknown:<명령>` |
| `question`·`choice` | `(Recommended)`·`(권장)`·`(추천)` | `user-decision`·`no-recommended` |
| 모든 kind | - | `window-shape`(창 모양 다름)·`no-fingerprint`(창 머리 못 찾음) |

- `trust`: `spawn-lane.mjs` 가 기동 대기 중 자동 호출
- `usage-limit` 금지: 지출 한도 조정·업그레이드·계정 전환·Enter 만 누르기
- `permission` Yes 조건
  - 질문 줄 = 정확히 `Do you want to proceed?`
  - 도구 이름 줄 = `… command`
  - 1회 승인 선택지만(「don't ask again」·「always」 류 제외)
- `user-decision` = 화면에 삭제·delete·drop·force·push·배포·deploy·비밀·secret·token

`ESCALATE` → 조정자는 아무것도 보내지 않은 상태:
- 권한 창 → §2 판단 올리기 → §3 순서로 전송
- 사용자 결정 항목 → 사용자에게 한 줄 알림
- 판단 올리기 중 자동 거부됨 → 받아들이고 레인에 다시 시도시킴
