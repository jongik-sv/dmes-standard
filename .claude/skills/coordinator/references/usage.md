# 사용량(5시간·1주일) 조절

설계 절: §3.f.

## 1. 출처

- 스킬은 OAuth API 를 직접 부르지 않음 (토큰을 다루지 않음)
- `scripts/usage-band.mjs` 가 설정 `usage.sources` 순서대로 읽음

- `cache`: 사용자 개인 statusline 이 갱신하는 캐시 파일 (경로는 설정)
  - 내용: `five_hour`·`seven_day` 사용률·초기화 시각
  - 한계: statusline 이 그려질 때만 갱신
- `coord-dump`: 스킬이 띄운 세션의 statusLine 덤프 (`<state_dir>/ctx`). 선택 기능
  - 한계: 스킬이 띄운 세션에만 있음
- `limits-dir`: dflow-team 팀원 statusLine 덤프
  - 한계: 만료되기 쉬움

- `usage.max_age_min`(기본 30분)보다 오래됐고 창이 이미 지난 출처는 버림
- 계정 전체 값이므로 가장 최근 것 하나만 씀
- 모두 없거나 낡으면 `BAND UNKNOWN`
  - **UNKNOWN 은 막지 않음** (fail-open)
  - 사용자에게 「사용량 모름」 한 줄만 알리고 같은 알림은 반복하지 않음
- 사용자 전역 statusline 은 건드리지 않음
  - `statusline-dump.mjs` = 스킬이 띄우는 세션에 `--settings` 로 붙이는 선택 기능

출력: `BAND <G|Y|O|R|UNKNOWN> five=<n|-> week=<n|-> week_allow=<n|-> src=<kind|-> at=<iso|-> five_reset=<iso|-> week_reset=<iso|-> raw=<G|Y|O|R|->`
- `raw` = 계정 여유 스위치(`usage.relaxed`)로 내리기 전 띠

## 2. 띠와 행동

- 경계 = 설정 `usage.bands` (이상이면 그 띠)
- 조건 = 5시간·1주 중 높은 쪽
- 사용량이 오르면 일을 막지 않고 **Claude 몫을 opencode·agy 로 옮김** (2026-10-07 사용자 지시)

- G 보통: 5h < 75% 이고 1주 < 85%
  - 제한 없음. 동시 agent 상한 4. Claude 를 기본으로 씀
- Y 주의: 5h ≥ 75% 또는 1주 ≥ 85%
  - 제한 없음에 가까움. 동시 agent 상한 3
  - 사다리 끝 opus/high 허용
  - 대기 작업 자동 배정 계속
  - Claude 몫 중 **조사·문서 정리·쉬운 반복 구현은 opencode·agy 로 옮김**
- O 경고: 5h ≥ 90% 또는 1주 ≥ 93%
  - 새 Workflow 허용 (agent 마다 model·effort 명시 유지)
  - opus 는 판정·L 구현·동시성에 계속 허용
  - 동시 agent 상한 2
  - 쉬라는 지시는 하지 않음
  - **대기 작업 자동 배정만 중단**
  - Y 의 이동에 더해 **일반 구현도 opencode 워커 우선**
  - Claude 는 판정·리뷰·어려운 구현만 맡음
- R 정지: 5h ≥ 98% 또는 1주 ≥ 98%
  - 모든 Claude 레인에 「지금 단계 끝에서 멈추고 정본 갱신」
  - Claude 세션은 **머지·정리만** 계속 (머지 임박 레인의 머지 요청·머지·정리 처리)
  - 남은 일은 opencode·agy 워커로 계속 가능
  - 한도 초기화 시각에 재개 예약

- 이동 규칙: opencode·agy 워커 운영은 `spawn.md` 등급 표(opencode 행)와 `weak-worker` 규칙을 따름
  - 약한 워커가 막히면 그 단계만 Claude 로 넘기는 규칙은 그대로
- **계정 여유 스위치**: 설정 `usage.relaxed` (기본 꺼짐)
  - `true`(사용자가 다른 계정을 쓸 수 있을 때)이면 `usage-band.mjs` 가 Y·O 를 G 로 내려 냄
  - R 은 그대로
  - 켜져 있으면 띠와 상관없이 Claude 를 씀
  - 꺼져 있으면 위 규칙으로 opencode·agy 로 옮김
- 동시 agent 상한 = `workflow.agents_by_band` (기본 G4·Y3·O2·R0)

**새 레인 상한**:
- 1주 사용률이 `usage.spawn_week_max`(기본 95) 미만이면 → 띠와 상관없이 새 레인·새 Pane 을 띄움 (사용자 지시 2026-10-06)
- 5시간 사용량이 높아도 레인을 막지 않음
  - 모델 등급·동시 agent 수·opus 사용 범위·opencode·agy 이동으로만 조절
- 1주가 이 값 이상이면 → 새 레인을 띄우지 않음

## 3. 1주 보정

- `usage.week_pace` 기본 `false`
- `true` 이면 `week_allow = 100 × (7 − 남은 일수) / 7 + usage.week_pace_margin`(기본 20) 으로 허용치를 냄
  - `usage-band.mjs` 가 `week_allow=` 로 표시
- 1주 사용률이 `week_allow` 보다 높으면 → 띠를 **한 단계 올림**
- 띠 계산은 스크립트가 함. 조정자는 `BAND` 줄을 그대로 씀

## 4. 띠가 바뀔 때

틱의 `usage-band.mjs` 결과 띠가 state `usage.band`·`run.usage_band_notified` 와 다르면:

1. `node scripts/coord-state.mjs set '.usage' '<json>'` 으로 띠와 수치를 갱신하고 이벤트를 남김
2. 전 레인에 `protocol.md` 3.7 `사용량 조정` 을 **한 번** 전송
   - `run.usage_band_notified` 에 띠를 기록해 같은 알림 반복 방지
3. 띠별 행동 집행:
   - Y: 조사·문서·쉬운 반복 구현을 opencode·agy 로 옮김
   - O: 대기 작업 자동 배정 중단, 일반 구현도 opencode 워커 우선 (쉬라는 지시 없음)
   - R: Claude 레인을 멈추고 남은 일을 opencode·agy 워커로 넘김
     - 새 레인은 위 「새 레인 상한」 이 허용하면 띄움
     - R 에서는 opencode·agy 워커로만 띄움
4. 이미 도는 Workflow 는 멈추지 않음
   - 다음 Workflow 부터 새 상한 적용
5. 일을 안 준 레인은 `node scripts/coord-state.mjs hold <레인> usage-band` 로 표시 (`monitor.md`)
6. 띠가 내려오면(예: O→Y) 같은 방식으로 한 번 알리고 `usage-band` hold 해제

## 5. 한도 초기화 뒤 재개

- 세션 설정 `autoContinueAtUsageLimit` 이 켜져 있으면 각 세션이 스스로 이어 감
  - 켜짐 여부를 사용자에게 한 번 확인
- 조정자는 `resets_at + 2분` 에 `ScheduleWakeup` 을 걸어 레인 status 확인
  - **멈춘 레인에만** 「계속 진행」 전송 (`term-send-safe.mjs` 또는 SendMessage)
  - 한도 창이 떠 있는지는 `prompt-watch.mjs` 가 `usage-limit` 으로 알려 줌
- 보조: 토큰을 안 쓰는 셸 타이머 (조정자 자신이 멈춘 경우 대비)
  - 대상 목록 = 설정 `wake_targets`
  - 레인을 새로 띄우거나 닫으면 목록을 갱신하도록 사용자에게 알림
  - 타이머 스크립트 경로는 설정 (스킬이 제공하지 않음)
- R 띠에서 풀릴 때는 정본 갱신을 확인하고 새 Workflow 를 허용하는 `사용량 조정` 전송
