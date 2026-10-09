# 사용량(5시간·1주일) 조절

## 1. 출처

- 스킬은 OAuth API 를 직접 부르지 않음 (토큰을 다루지 않음)
- `usage-band.mjs` 가 설정 `usage.sources` 순서대로 읽음
  - `cache`: 사용자 statusline 캐시. statusline 이 그려질 때만 갱신
  - `coord-dump`: 스킬이 띄운 세션의 덤프(`<state_dir>/ctx`). 선택 기능
  - `limits-dir`: dflow-team 팀원 덤프. 만료되기 쉬움
- 버림: `usage.max_age_min` 보다 오래됐고 창이 이미 지난 출처
- 계정 전체 값 → 순서상 처음 유효한 출처 하나만 씀
- 모두 없거나 낡음 → `BAND UNKNOWN`
  - **막지 않음** (fail-open)
  - 사용자에게 「사용량 모름」 한 줄만. 같은 알림 반복 금지
- 사용자 전역 statusline 은 건드리지 않음
  - `statusline-dump.mjs` = 스킬이 띄우는 세션에 `--settings` 로 붙이는 선택 기능
- 출력 `BAND <G|Y|O|R|UNKNOWN> …` (칸 = `contract.md` §3.3)
  - `raw` = `usage.relaxed` 로 내리기 전 띠

## 2. 띠와 행동

- 경계 = 설정 `usage.bands` (이상이면 그 띠)
- 조건 = 5시간·1주 중 높은 쪽
- 사용량이 오름 → 일을 막지 않고 **Claude 몫을 opencode·agy 로 옮김**
- 동시 agent 상한 = `workflow.agents_by_band`

| 띠 | 5시간 | 1주 |
|---|---|---|
| G 보통 | < 75% | < 85% |
| Y 주의 | ≥ 75% | ≥ 85% |
| O 경고 | ≥ 90% | ≥ 93% |
| R 정지 | ≥ 98% | ≥ 98% |

- G: 제한 없음. Claude 를 기본으로 씀
- Y: 제한 없음에 가까움
  - 대기 작업 자동 배정 계속
  - 사다리 끝 opus/high 허용
  - Claude 몫 중 **조사·문서 정리·쉬운 반복 구현 → opencode·agy**
- O:
  - 새 Workflow 허용 (agent 마다 model·effort 명시 유지)
  - opus = 판정·L 구현·동시성에 계속 허용
  - 쉬라는 지시는 하지 않음
  - **대기 작업 자동 배정만 중단**
  - Y 의 이동에 더해 **일반 구현도 opencode 워커 우선**
  - Claude = 판정·리뷰·어려운 구현만
- R:
  - 모든 Claude 레인에 「지금 단계 끝에서 멈추고 정본 갱신」
  - Claude 세션 = **머지·정리만** 계속
    - 머지 임박 레인의 머지 요청·머지·정리 처리
  - 남은 일 = opencode·agy 워커로 계속
  - 한도 초기화 시각에 재개 예약
- opencode·agy 워커 운영 = `spawn.md` §1 「opencode 워커」
  - 막힌 단계만 Claude 세션으로 넘김
- **계정 여유 스위치** `usage.relaxed` (기본 꺼짐)
  - 켬(사용자가 다른 계정을 쓸 수 있을 때) → `usage-band.mjs` 가 Y·O 를 G 로 내려 냄
  - R 은 그대로
  - 켜짐 → R 이 아니면 띠와 상관없이 Claude 를 씀
  - 꺼짐 → 위 규칙대로 opencode·agy 로 옮김

**새 레인 상한**:
- Claude 새 레인·새 Pane = 아래 둘 다 맞을 때만
  - 1주 사용률 < `usage.spawn_week_max`
  - 띠 ≠ R
- R → opencode·agy 워커만 띄움
- 5시간 사용량이 높아도 레인을 막지 않음
  - 조절 수단 = 모델 등급·동시 agent 수·opus 사용 범위·opencode·agy 이동

## 3. 1주 보정

- `usage.week_pace` 가 `true` 이고 1주 초기화 시각을 앎 → 허용치를 냄
  - `week_allow = 100 × (7 − 남은 일수) / 7 + usage.week_pace_margin`
  - `BAND` 줄의 `week_allow=` 로 표시
- 1주 사용률 > `week_allow` → 띠를 **한 단계 올림**
- 띠 계산 = 스크립트. 조정자는 `BAND` 줄을 그대로 씀

## 4. 띠가 바뀔 때

틱 줄 `BAND_CHANGED <이전> <지금> …`:
- tick 이 state `usage` 를 갱신하고 변화마다 한 번만 냄

1. 이벤트를 남김
2. 전 레인에 `protocol.md` 3.7 `사용량 조정` 을 **한 번** 전송
3. §2 대로 띠별 행동 집행
4. 이미 도는 Workflow 는 멈추지 않음
   - 다음 Workflow 부터 새 상한 적용
5. 일을 안 준 레인 → `coord-state.mjs hold <레인> usage-band` (`monitor.md` §5)
6. 띠가 내려옴(예: O→Y)
   - 같은 방식으로 한 번 알림
   - `usage-band` hold 해제

## 5. 한도 초기화 뒤 재개

- 세션 설정 `autoContinueAtUsageLimit` 켜짐 → 각 세션이 스스로 이어 감
  - 켜짐 여부를 사용자에게 한 번 확인
- 조정자: `resets_at + 2분` 에 `ScheduleWakeup` → 레인 status 확인
  - **멈춘 레인에만** 「계속 진행」 전송
  - 전송 수단 = `term-send-safe.mjs` 또는 SendMessage
  - 한도 창 = `prompt-watch.mjs` 가 `usage-limit` 으로 알려 줌
- 보조: 토큰을 안 쓰는 셸 타이머 (조정자 자신이 멈춘 경우 대비)
  - 대상 목록 = 설정 `wake_targets`
  - 레인을 새로 띄우거나 닫음 → 목록 갱신을 사용자에게 알림
  - 타이머 스크립트 경로 = 설정 (스킬이 제공하지 않음)
- R 띠에서 풀림
  - 정본 갱신 확인
  - 새 Workflow 를 허용하는 `사용량 조정` 전송
