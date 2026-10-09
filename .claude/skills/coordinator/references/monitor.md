# 모니터링: 틱, 진도율, idle 감시와 자동 배정

설계 절: §3.c(주기 점검·진도율), §3.i(idle 감시·배정·반복 방지).

## 1. 주기 수단

- `CronCreate`(세션 한정 cron): **기본 감시 틱**
  - `tick.cron` 기본 `7,27,47 * * * *` = 20분
  - compact 뒤 `CronList` 로 잔존 확인(`resume.md`)
- `ScheduleWakeup`: 정해진 시각 한 번(측정 창 끝, 이동 전 점검, 한도 초기화 뒤 재개)
- `Monitor`: 짧은 조건 대기(다른 세션 compact 끝, 측정 레인 heavy 잡 끝)
- 셸 타이머: 토큰 없는 보조(한도 초기화 뒤 깨우기, `wake_targets`)
- 머지·측정 구간에도 틱 간격 유지
- 측정 창 동안 측정 레인만 5분 간격 Monitor

## 2. 틱 절차

- 틱 = `node scripts/tick.mjs` 한 번
  - 순서: `coord-status.mjs` · `prompt-watch.mjs`(+`auto-answer.mjs`) · `idle-check.mjs` · `stall-check.mjs` · `ctx-usage.mjs` · `usage-band.mjs`
  - 출력 = 행동 줄만
- 줄별 처리: SKILL.md 「틱 절차」 표
- 상태표 전체는 사용자가 상태를 물을 때·판단 근거를 볼 때만 `coord-status.mjs` 로 실행(출력 칸 `contract.md` §3.3)
- 콘솔 폴러가 돌면 `prompt-watch.mjs`(틱·`--follow` Monitor)는 폴러의 화면 캐시로 판정
  - 캐시가 없거나 낡으면 화면 직접 읽기(`contract.md` §3.3·§4.1)
- `status=gone` 이고 핸들 stale → `protocol.md` 3.10 으로 신원 재요청
- 세션이 죽었으면 → 사용자에게 알림

## 3. 판정 신호와 규칙

- `scripts/idle-check.mjs` 가 신호를 모아 판정. 조정자는 직접 모으지 않음
- 레인 상태 기본 = state.json 요약
- 터미널 화면(S4)은 `prompt-watch.mjs` 가 이상 판정한 레인 하나만 읽음

| 신호 | 읽는 법 | 의미·한계 |
|---|---|---|
| S1 세션 상태 | 세션 json `status`·`statusUpdatedAt` | 1차 신호. 백그라운드 실행 중에도 idle 로 보일 수 있음 |
| S2 ListAgents | 도구 호출 | S1 과 같은 출처 |
| S3 TUI 상태 | `tui-idle` 짧게 대기 | opencode 는 일하는 중에도 먼저 끝남(믿지 않음) |
| S4 화면 | 화면 읽기 | 「esc to interrupt」·「Compacting」·선택 창·확인 창 판별 |
| S5 출력 시각 | `lastOutputAt` | 스피너도 출력 → 보조로만 |
| S7 백그라운드 | heavy RUN·WAIT cwd, 살아 있는 잡, tasks 출력 mtime, 워크트리 cwd 의 gradle·vitest·playwright·tsc | mtime 이 `idle.bg_recent_min`(기본 10분) 안이면 실행 중 |
| S8 마지막 보고 | state `last_report_at` | 보고 끊긴 시간 |
| S9 브랜치 활동 | 마지막 커밋·워크트리 변경 | 변화 있으면 일하는 중 |
| S10 의도된 대기 | state `hold = {reason, until}` | 조정자가 세운 상태 |

판정 규칙(스크립트 구현):

```text
후보 = S1 idle 이고 statusUpdatedAt 이후 ≥ idle.idle_min(기본 5분)
거부 하나라도 맞으면 idle 아님:
  S7 어느 하나가 그 레인 것 · S4 에 선택 창·질문 창·권한 확인 · S4 에 Compacting
  S10 hold 가 있고 until 이 안 지남(지났으면 hold 를 풀고 다시 판정)
  마지막 지시 후 idle.cooldown_min(기본 15분) 안 · 사용량 띠 R
확정 = 후보이고 거부가 없고, 연속 2틱(또는 idle.confirm_gap_min 간격 두 관측) 같은 결과
```

## 4. idle-check.mjs 출력별 행동

- `IDLE <레인> since=<iso>`: 확정 idle → 아래 5 배정
- `CANDIDATE <레인>`: 첫 관측 → 무행동, 다음 틱(또는 `idle.confirm_gap_min` 뒤) 재관측
- `BUSY <레인> <사유>`: 일하는 중 → 무행동, 지시 금지
- `HOLD <레인> <사유>`: 조정자가 세운 대기
  - `until` 지남 → `node scripts/coord-state.mjs hold <레인> -` 로 해제, 다음 틱 재판정
  - `until` 안 지남 → 유지
  - 사유가 머지·의존물·Oracle·heavy 슬롯·사용자 결정 대기이고 일을 안 줬으면 → 5 「병목 대기 레인」 한 번 적용
- `WAIT_USER <레인> <창 종류>`: 사용자 입력 대기
  - **지시를 덮어 보내지 않음**(사용자 답이 섞임)
  - 사용자에게 한 줄: `<레인> 이 사용자 입력을 기다린다(<창 종류>)`
  - `permission` → `approvals.md`
  - 같은 알림 반복 금지
- `COMPACTING <레인>`: 무행동
- `STALL? <레인> bg=<분>m`: 백그라운드 거부가 `idle.stall_max_min`(기본 90분) 초과 = **정체 의심**
  - 그 레인에 `상태 한 줄 보고` 만 요청
  - `node scripts/stall-check.mjs <레인>` 실행(`stall.md`)
- `GONE <레인>`: 핸들·pid 확인, 신원 재요청, 정말 죽었으면 사용자에게 알림

## 5. 배정

`IDLE` 확정 레인에 순서대로:

1. `queue` 첫 항목이 있고 `deps` 가 풀렸으면 → `protocol.md` 3.2 로 지시(`workflow.md` 블록 포함)
2. 없으면 `backlog` 에서 그 레인 범위(`fits`)이고 `taken_by` 가 빈 것을 `protocol.md` 3.3 으로 지시
   - 풀의 예: 교차 리뷰(머지 전), 기록 문서와 커밋 대조, 통합 확인 체크리스트, 레인 범위 안 기존 결함 정리(동작 변경 없음), SUMMARY 초안
   - **범위 밖 일은 자동 배정 금지.** 읽기 위주 대기 작업만
   - **의존물을 기다리는 레인**(`deps` 에 dev 미반영 항목 있음)
     - 독립 항목·대기 작업을 먼저 줌
     - 의존물이 다른 항목과 묶여 머지가 늦으면 → 의존물만 먼저 머지하게 요청(`decompose.md` §4)
3. 풀도 비면 「병목 대기 레인」 (a)~(e) 를 한 번 더 훑음
   - 그래도 없을 때만 `protocol.md` 3.4 「쉬어라」를 **한 번만** 전송 + `node scripts/coord-state.mjs hold <레인> no-work`
   - 레인 종료는 마감 단계에서 결정
   - 쉬게 한 사유(어느 항목이 왜 비었는지)를 이벤트에 남김
4. 배정마다 `node scripts/coord-state.mjs instr <레인> <kind>` 로 번호를 받고 이벤트를 남김

### 병목 대기 레인 (IDLE 확정을 기다리지 않는다)

대상: 레인이 다른 레인의 머지, 의존물, Oracle, heavy 슬롯, 사용자 결정을 기다린다는 `진행 보고`(「대기」「기다린다」 포함)

- `IDLE` 확정(연속 2관측)을 기다리지 않음
- 보고를 받은 **즉시** 같은 답장에서 병목과 무관한 일을 아래 순서로 찾아 줌
- 이 즉시 배정은 §6 cooldown·`idle.cooldown_min` 의 예외
- ack 없는 지시가 남아 있으면 → §6 을 따름
- 컴파일 오류 같은 기술적 막힘은 이 절 대상이 아님 → `질문`·`stall.md`
- 보고 없이 `hold` 로 선 레인(`HOLD`)도 사유가 위 다섯 가지이고 일을 안 줬으면 한 번 적용

| 순서 | 일 | 지시 형식 | 비고 |
|---|---|---|---|
| (a) | 자기 범위의 의존 없는 다음 항목 앞당김 | `protocol.md` 3.2 | `queue`·`items` 중 `.deps` 선행이 dev 에 들어갔거나 `.deps` 에 없는 것 |
| (b) | dev 를 미리 합치고 컴파일까지만 확인 | 3.3 | 머지 요청을 이미 냈으면 요청 SHA 를 바꾸는 합류 금지. 합류했으면 SHA·시험 결과 재보고 |
| (c) | 병목 해소 뒤 할 단계 준비 | 3.3 | 리허설 계획, 스크립트, 런북, 머지 요청 초안 |
| (d) | 문서·후속 목록 정리 | 3.3 | 레인 소유 범위 안 |
| (e) | 병목 레인 돕기 | 3.3 | 읽기 조사·교차 리뷰만. 소유 파일 수정 금지. 조정자만 배정 |

- (a)~(c) 에서 병목 자원을 쓰는 실행·시험은 병목 해소 뒤로 미룸
- 병목이 특정 레인(머지·의존물을 주는 쪽)이면
  - 그 레인은 표 대상에서 뺌 → 새 지시 없이 이어가게 함(필요하면 머지 허가 순서를 앞당김)
  - 그 레인이 다른 병목을 기다리면 표 적용
  - 병목이 Oracle·heavy 슬롯·사용자 결정이면 모든 대기 레인이 대상
- 지시에 「병목: <무엇을 기다리는지>」 한 줄 추가
- 이벤트에 병목 사유와 배정 항목을 남김
- 띠·상한 규칙: (a) 는 위 1, (b)~(e) 는 위 2 에 준함
- 범위 밖 수정은 자동 배정 금지
- §5 3번 「쉬어라」 = (a)~(e) 모두 빈 경우만

사용량 띠별 배정:

- G: 1·2 모두
- Y: 1·2 모두. 조사·문서 정리·쉬운 반복 구현은 opencode·agy 워커 우선
- O: 1 만(2 의 자동 배정 중단). 일반 구현도 opencode 워커 우선. Claude 레인은 판정·리뷰·어려운 구현만
- R: Claude 레인 배정 없음(머지·정리만). opencode·agy 워커 queue 항목은 계속 배정

- O·R 에서 2 를 건너뛴 레인 → 3 의 훑기와 「쉬어라」 도 건너뜀, `node scripts/coord-state.mjs hold <레인> usage-band` 만 설정
- 같은 hold 로 다음 틱의 판단 반복을 막음. load 때문에 보류한 착수 지시(`heavy.load_soft` 초과)도 같음(`heavy.md`)
- `usage.relaxed` 켜짐 → `usage-band.mjs` 가 Y·O 를 G 로 내림 → G 행 적용
- 약한 워커(opencode)가 막히면 그 단계만 Claude 세션으로 넘김(`spawn.md`)

## 6. 반복 지시 방지

- 지시마다 `instr_id` 발급(`node scripts/coord-state.mjs instr`), 상태에 `{id, sent_at, kind, ack_at, nudges}` 기록
- 같은 레인에 같은 종류 지시를 cooldown 안에 재전송 금지
- ack 없는 지시가 있으면 새 지시 대신 「`<instr_id>` 받았는지 한 줄 답」만 전송(`nudges` 최대 2회)
  - 그 뒤 화면을 읽어 원인 확인, 사용자에게 알림
- 지시는 늘 SendMessage. Workflow 가 도는 중이면 전송 금지

## 7. 진도율

- 출처 = 레인 `진행 보고` 의 「끝난 항목/전체(가중치)」
- 보고마다 `node scripts/coord-state.mjs item-done <레인> <항목id>` 로 갱신(`PROGRESS <레인> <pct>%`)
- 전체 = `node scripts/coord-state.mjs progress`
  - `PROGRESS <레인> <pct>% <끝난가중치>/<전체가중치>`
  - 마지막 `PROGRESS ALL <pct>%`
- 보고 뒤 커밋으로 보정 가능. 보정값 = 「추정」 표기
- 사용자가 진도율을 물으면 이 표로 즉시 답함
- 레인에 재문의 = 마지막 보고가 1시간보다 오래됐을 때만
- 마감 단계(측정·SUMMARY·정리)도 항목 → 「코드 100%, 측정·정리 남음」 구분
