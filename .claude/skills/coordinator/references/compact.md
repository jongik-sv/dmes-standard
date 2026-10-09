# compact·재개 관리

설계 절: §3.g(정본 메모), §3.j(임계값·자동 compact), Q1·Q6.

## 1. 정본 메모 규칙

- 레인마다 **정본 메모**(메모리 파일 또는 scratchpad `resume-*.md`) 하나
  - 형식: 지금 상태, 남은 순서, 결정, 조정 세션 이름, 다음 단계
  - 착수 지시에 정본 메모 경로 지정을 넣고 state `lanes.<레인>.memo` 에 기록
  - 첫 `lane-add` 에 `memo` 로 함께 넣음. 비면 compact 문구 「정본은 -」 + `lane-add` 경고(`decompose.md` §5)
- 조정자 정본 = state 폴더(`state.json`, `summary.md`) + 사람이 읽는 메모 하나
  - 갱신 시점: compact 전, 주요 결정 뒤(`node scripts/coord-state.mjs summary`)
- compact 뒤 스킬 전체 재호출 방지용으로 SKILL.md 맨 위에 재독 세트 인용문 있음(`resume.md`)

## 2. 사용률 읽기

기본 = transcript 계산: `node scripts/ctx-usage.mjs --lane <레인>`(또는 `<session-id>`, `--pid <pid>`, `--window N`).

출력: `CTX <session-id> tokens=<n> window=<n> pct=<n> src=transcript|dump at=<iso>` 또는 `CTX <id> unknown <사유>`.

- 계산: transcript 의 마지막 비 sidechain assistant 메시지 사용량 합
- 창 크기: transcript 에 없음 → state `session.window` 또는 설정 `compact.default_window`(200000)
- 파일 크기는 무의미(compact 전 기록 잔존)
- `statusline-dump.mjs` 덤프(`src=dump`) = **스킬이 띄운 세션 전용** 선택 기능
  - 있으면 스크립트가 우선 사용
  - 사용자 전역 statusline 수정 금지
- `unknown` → 이번 틱은 그 레인 건너뜀, 사유를 이벤트에 기록
- 틱마다 기록: `node scripts/coord-state.mjs set '.lanes.<레인>.ctx' '{"tokens":…,"window":…,"pct":…,"src":…,"at":…}'`

## 3. 임계값

| 설정 | 기본 | 뜻 |
|---|---|---|
| `compact.threshold_pct` | 40 | 기본 임계 % |
| `compact.threshold_tokens` | null | 토큰 임계(둘 다 있으면 먼저 닿는 쪽) |
| `compact.by_window` | `{"1000000":{"pct":40},"200000":{"pct":70}}` | 창 크기별 덮어쓰기 |
| `compact.hard_pct` | 70 | Workflow 중에도 사용자에게 알리는 % |
| `compact.cooldown_min` | 30 | 같은 레인 compact 최소 간격 |
| `compact.wait_max_min` | 10 | Compacting 사라짐 대기 상한 |

- 40% = 1M 창 약 400K, 200K 창 약 80K. 그래서 200K 창은 70% 로 덮어씀
- 새 세션에는 백스톱 `--autocompact <tokens>` 지정 가능

## 4. 안전한 실행 시점(모두 만족할 때만)

`compact-lane.mjs` 가 확인하고 어긋나면 `COMPACT_REFUSED` 출력.

- 사용자 입력 대기(선택 창·질문 창)·Compacting·백그라운드(Workflow·gradle·잡) 없음(`idle-check.mjs` 거부와 동일)
- 머지 중 아님(`merge.in_flight` 의 레인이 아님)
- 측정 창의 측정 레인 아님
- `tui-idle` 만족(최대 300초 대기) + 화면 아래에 「esc to interrupt」 없음

## 5. 준비와 실행

1. 임계 초과 레인 발견 → 조건 4 확인
   - Workflow 가 돌면 `node scripts/coord-state.mjs set '.lanes.<레인>.compact.pending' true` 로 표시
   - Workflow 종료 뒤 첫 틱에 실행(세션이 Workflow 결과를 처리해 정본을 갱신한 다음)
2. `protocol.md` 3.8 `정본 갱신 요청` 전송
3. 답 `정본 갱신 완료: 경로 / 남은 일 3줄` 수신 → 「남은 일 3줄」을 `lanes.<레인>.compact.pre_compact` 에 기록
   - **30분 안에 답이 없으면 이번 틱은 넘김**(다음 틱 재시도, 최대 2회 뒤 사용자 알림)
4. `node scripts/compact-lane.mjs <레인>`(`--dry-run` 가능). 스크립트 순서:
   - 안전 확인
   - `/compact <레인> 진행 중. 정본은 <경로>. 조정 세션 <이름>(<주소>). 다음 단계: <한 줄>` 전송
   - Compacting 사라짐 대기
   - 사용률 재측정
   - 출력: `COMPACT_REFUSED <레인> <사유>` · `COMPACT_DONE <레인> before=<n> after=<n|->` · `COMPACT_TIMEOUT <레인>`
   - 문구에 `!` 금지
   - 정본 갱신 확인 없음 → `--force-no-memo` 없이는 거절
   - 회색 추천 문구로 `draft-in-input` 거절 → `approvals.md` 「입력창의 회색 추천 문구」 조건 확인 후 `--over-draft` 로 재호출(조정자가 화면을 읽고 추천 문구라고 판단한 때만)

**Workflow·agent 가 도는 중 임계 초과 → compact 보류.**
- 도는 중에는 정본 갱신 요청 금지, `compact.pending` 만 표시(위 1)
- 레인이 머지 요청을 앞두고 있으면 → 정본 갱신 요청에 「머지 요청 뒤에는 입력 대기로 있어라」 병기
  - 효과: 머지 완료·정리 완료 보고를 받은 그 틱에 compact 가능(web 레인 실적)
- `compact.hard_pct` 초과 → §7 예외 적용

## 6. compact 뒤 확인

1. `COMPACT_DONE` → 사용률이 크게 줄었는지 확인(보통 10% 아래)
   - **스크립트 재측정 숫자를 그대로 믿지 않음**: compact 직후 transcript 미갱신으로 `before` = `after` 가 나온 적 있음
   - 같게 나옴 → `compact-lane.mjs` 가 화면 상태줄 ctx % 로 `after` 를 어림(stderr `COMPACT_NOTE`)
   - 그것도 못 읽음 → 화면 `Compacted` 문구만 확인하고 `after=-`
   - `after=-` 또는 `COMPACT_NOTE` 있음 →
     - 화면(`terminal read --screen`)에서 ctx % 또는 「Compacted」 직접 확인
     - 몇 분 뒤 `node scripts/ctx-usage.mjs --lane <레인>` 재측정
     - 그 값으로 `compact.history` 정정
   - `COMPACT_TIMEOUT` → 화면을 읽어 상태 확인, 사용자에게 알림
2. `protocol.md` 3.9 `재개 확인` 전송. 답을 `pre_compact` 와 대조. 크게 다르면 정본 경로를 다시 짚어 줌
3. compact 기록(`at`, before, after)을 `compact.history`·`last_at` 에 기록
   - 같은 레인은 compact 뒤 최소 `compact.cooldown_min`(30분) 재실행 금지
   - `compact.pending` 해제

## 7. 예외

- opencode·agy 처럼 `/compact` 가 다른 워커 = 대상 제외(tui-idle 신뢰 불가)
- Workflow 가 도는 세션 = Workflow 종료 뒤에 실행
  - 단 컨텍스트가 `compact.hard_pct` 초과 → 세션이 Workflow 결과를 받기 전에 넘칠 수 있으므로 사용자에게 알림(강제 중단 금지)
- 임시 워커 = compact 금지, 일을 끝내면 닫음

## 8. 조정자 자기 compact

- 조정자는 자기 턴 안에서 자기 터미널에 `/compact` 전송 금지(입력이 대기열에 쌓임)
- 틱에서 자기 사용률이 임계값 초과 시:
  1. 정본 메모와 state(`summary.md`) 갱신
  2. 사용자에게 **한 줄 알림**: 「조정자 compact 필요(컨텍스트 N%). 정본은 <경로>」. 사용자가 `/compact` 입력
  3. compact 뒤 `resume.md` 재독 세트만 읽고 `CronList` 로 감시 cron 확인
- 같은 알림을 틱마다 반복 금지(`run` 이벤트에 알림 사실 기록)
