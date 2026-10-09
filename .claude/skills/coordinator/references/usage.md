# 사용량(5시간·1주일) 조절

설계 절: §3.f.

## 1. 출처

스킬은 OAuth API 를 직접 부르지 않는다(토큰을 다루지 않는다). `scripts/usage-band.mjs` 가 설정 `usage.sources` 순서대로 읽는다.

| 출처 kind | 내용 | 한계 |
|---|---|---|
| `cache` | 사용자 개인 statusline 이 갱신하는 캐시 파일(경로는 설정). `five_hour`·`seven_day` 사용률·초기화 시각 | statusline 이 그려질 때만 갱신 |
| `coord-dump` | 스킬이 띄운 세션의 statusLine 덤프(`<state_dir>/ctx`). 선택 기능 | 스킬이 띄운 세션에만 있다 |
| `limits-dir` | dflow-team 팀원 statusLine 덤프 | 만료되기 쉽다 |

- `usage.max_age_min`(기본 30분)보다 오래됐고 창이 이미 지난 출처는 버린다. 계정 전체 값이므로 가장 최근 것 하나만 쓴다.
- 모두 없거나 낡았으면 `BAND UNKNOWN` 이다. **UNKNOWN 은 막지 않는다**(fail-open). 사용자에게 「사용량 모름」 한 줄만 알리고 같은 알림은 반복하지 않는다.
- 사용자 전역 statusline 은 건드리지 않는다. `statusline-dump.mjs` 는 스킬이 띄우는 세션에 `--settings` 로 붙이는 선택 기능이다.

출력: `BAND <G|Y|O|R|UNKNOWN> five=<n|-> week=<n|-> week_allow=<n|-> src=<kind|-> at=<iso|-> five_reset=<iso|-> week_reset=<iso|-> raw=<G|Y|O|R|->`. `raw` 는 계정 여유 스위치(`usage.relaxed`)로 내리기 전 띠다.

## 2. 띠와 행동

경계는 설정 `usage.bands`(이상이면 그 띠)다. 조건은 5시간·1주 중 높은 쪽이다. 사용량이 오르면 일을 막는 대신 **Claude 몫을 opencode·agy 로 옮긴다**(2026-10-07 사용자 지시). 그래서 Claude 세션이 줄어도 일은 계속 흘러간다.

| 띠 | 기본 조건 | 행동 |
|---|---|---|
| G 보통 | 5h < 75% 이고 1주 < 85% | 제한 없음. 동시 agent 상한 4. Claude 를 기본으로 쓴다 |
| Y 주의 | 5h ≥ 75% 또는 1주 ≥ 85% | 제한 없음에 가깝다. 동시 agent 상한 3. 사다리 끝 opus/high 허용. 대기 작업 자동 배정도 계속한다. Claude 몫 중 **조사·문서 정리·쉬운 반복 구현은 opencode·agy 로 옮긴다** |
| O 경고 | 5h ≥ 90% 또는 1주 ≥ 93% | 새 Workflow 를 허용한다(agent 마다 model·effort 명시는 유지). opus 는 판정·L 구현·동시성에 계속 허용한다. 동시 agent 상한 2. 쉬라는 지시는 하지 않는다. **대기 작업 자동 배정만 중단**한다. Y 의 이동에 더해 **일반 구현도 opencode 워커 우선**이고, Claude 는 판정·리뷰·어려운 구현만 맡는다 |
| R 정지 | 5h ≥ 98% 또는 1주 ≥ 98% | 모든 Claude 레인에 「지금 단계 끝에서 멈추고 정본 갱신」. Claude 세션은 **머지·정리만** 계속한다(머지 임박 레인의 머지 요청·머지·정리는 처리). 남은 일은 opencode·agy 워커로 계속할 수 있다. 한도 초기화 시각에 재개 예약 |

- 이동 규칙: opencode·agy 워커 운영은 `spawn.md` 등급 표(opencode 행)와 `weak-worker` 규칙을 따른다. 약한 워커가 막히면 그 단계만 Claude 로 넘기는 규칙은 그대로다.
- **계정 여유 스위치**: 설정 `usage.relaxed` 가 `true` 이면(사용자가 다른 계정을 쓸 수 있을 때) `usage-band.mjs` 가 Y·O 를 G 로 내려 낸다. R 은 그대로 둔다. 스위치가 켜져 있으면 띠와 상관없이 Claude 를 쓰고, 꺼져 있으면 위 규칙으로 opencode·agy 로 옮긴다. 기본은 꺼짐이다.

동시 agent 상한은 `workflow.agents_by_band`(기본 G4·Y3·O2·R0)다.

**새 레인 상한**: 새 레인·새 Pane 은 **1주 사용률이 `usage.spawn_week_max`(기본 95) 미만이면 띠와 상관없이 띄운다**(사용자 지시 2026-10-06). 5시간 사용량이 높을 때는 레인을 막지 않고 모델 등급·동시 agent 수·opus 사용 범위·opencode·agy 이동으로만 조절한다. 1주가 이 값 이상이면 새 레인을 띄우지 않는다.

## 3. 1주 보정

`usage.week_pace` 는 기본 `false` 다. `true` 로 켜면 `week_allow = 100 × (7 − 남은 일수) / 7 + usage.week_pace_margin`(기본 20) 으로 허용치를 낸다(`usage-band.mjs` 가 `week_allow=` 로 보인다). 1주 사용률이 `week_allow` 보다 높으면 띠를 **한 단계 올린다**. 화요일 오전에 60% 와 일요일 저녁 60% 는 다르기 때문이다. 띠 계산은 스크립트가 하고 조정자는 `BAND` 줄을 그대로 쓴다.

## 4. 띠가 바뀔 때

틱의 `usage-band.mjs` 결과 띠가 state `usage.band`·`run.usage_band_notified` 와 다르면:

1. `node scripts/coord-state.mjs set '.usage' '<json>'` 으로 띠와 수치를 갱신하고 이벤트를 남긴다.
2. 전 레인에 `protocol.md` 3.7 `사용량 조정` 을 **한 번** 보낸다(`run.usage_band_notified` 에 띠를 기록해 같은 알림을 반복하지 않는다).
3. 띠별 행동을 집행한다: Y 는 조사·문서·쉬운 반복 구현을 opencode·agy 로 옮기고, O 는 대기 작업 자동 배정을 중단하며 일반 구현도 opencode 워커 우선으로 돌리고(쉬라는 지시는 없다), R 은 Claude 레인을 멈추고 남은 일은 opencode·agy 워커로 넘긴다(새 레인은 위 「새 레인 상한」 이 허용하면 띄우되, R 에서는 opencode·agy 워커로만 띄운다).
4. 이미 도는 Workflow 는 멈추지 않는다. 멈추면 작업이 반쯤 남는다. 다음 Workflow 부터 새 상한을 적용하게 한다.
5. 일을 안 준 레인은 `node scripts/coord-state.mjs hold <레인> usage-band` 로 표시한다(`monitor.md`).
6. 띠가 내려오면(예: O→Y) 같은 방식으로 한 번 알리고 `usage-band` hold 를 푼다.

## 5. 한도 초기화 뒤 재개

- 세션 설정 `autoContinueAtUsageLimit` 이 켜져 있으면 각 세션이 스스로 이어 간다. 켜져 있는지는 사용자에게 한 번 확인한다.
- 조정자는 `resets_at + 2분` 에 `ScheduleWakeup` 을 걸어 레인 status 를 확인하고, **멈춘 레인에만** 「계속 진행」 을 보낸다(`term-send-safe.mjs` 또는 SendMessage, 한도 창이 떠 있는지는 `prompt-watch.mjs` 가 `usage-limit` 으로 알려 준다).
- 조정자 자신도 멈춰 있을 수 있으므로 Claude 토큰을 안 쓰는 셸 타이머를 보조로 둔다. 대상 목록은 설정 `wake_targets` 이고, 레인을 새로 띄우거나 닫으면 목록을 갱신하도록 사용자에게 알린다. 타이머 스크립트 경로는 설정이다(스킬이 제공하지 않는다).
- R 띠에서 풀릴 때는 정본 갱신을 확인하고 새 Workflow 를 허용하는 `사용량 조정` 을 보낸다.
