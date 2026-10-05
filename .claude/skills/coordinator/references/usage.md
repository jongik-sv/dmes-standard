# 사용량(5시간·1주일) 조절

설계 절: §3.f.

## 1. 출처

스킬은 OAuth API 를 직접 부르지 않는다(토큰을 다루지 않는다). `scripts/usage-band.sh` 가 설정 `usage.sources` 순서대로 읽는다.

| 출처 kind | 내용 | 한계 |
|---|---|---|
| `cache` | 사용자 개인 statusline 이 갱신하는 캐시 파일(경로는 설정). `five_hour`·`seven_day` 사용률·초기화 시각 | statusline 이 그려질 때만 갱신 |
| `coord-dump` | 스킬이 띄운 세션의 statusLine 덤프(`<state_dir>/ctx`). 선택 기능 | 스킬이 띄운 세션에만 있다 |
| `limits-dir` | dflow-team 팀원 statusLine 덤프 | 만료되기 쉽다 |

- `usage.max_age_min`(기본 30분)보다 오래됐고 창이 이미 지난 출처는 버린다. 계정 전체 값이므로 가장 최근 것 하나만 쓴다.
- 모두 없거나 낡았으면 `BAND UNKNOWN` 이다. **UNKNOWN 은 막지 않는다**(fail-open). 사용자에게 「사용량 모름」 한 줄만 알리고 같은 알림은 반복하지 않는다.
- 사용자 전역 statusline 은 건드리지 않는다. `statusline-dump.sh` 는 스킬이 띄우는 세션에 `--settings` 로 붙이는 선택 기능이다.

출력: `BAND <G|Y|O|R|UNKNOWN> five=<n|-> week=<n|-> week_allow=<n|-> src=<kind|-> at=<iso|-> five_reset=<iso|-> week_reset=<iso|->`.

## 2. 띠와 행동

경계는 설정 `usage.bands`(이상이면 그 띠). 조건은 5시간·1주 중 높은 쪽이다.

| 띠 | 기본 조건 | 행동 |
|---|---|---|
| G 보통 | 5h < 60% 이고 1주 < 70% | 제한 없음. 레인 동시 agent 상한 3 |
| Y 주의 | 5h ≥ 60% 또는 1주 ≥ 70% | 새 레인·새 Pane 생성 금지. 동시 agent 상한 2. 조사·문서·시험 확인은 sonnet/medium 강제(이미 기본), 구현은 opus/high 유지. 대기 작업 자동 배정 중단 |
| O 경고 | 5h ≥ 80% 또는 1주 ≥ 85% | 우선순위 낮은 레인부터 「지금 항목 끝나면 정본 갱신 뒤 쉬어라」. 동시 agent 상한 1. opus 는 리뷰·판정에만, 구현은 sonnet/high. 새 Workflow 금지(진행 중인 것은 끝까지 둔다) |
| R 정지 | 5h ≥ 95% 또는 1주 ≥ 95% | 모든 레인에 「지금 단계 끝에서 멈추고 정본 갱신」. **머지·정리만 계속**한다(머지 임박 레인의 머지 요청·머지·정리는 처리). 한도 초기화 시각에 재개 예약 |

동시 agent 상한은 `workflow.agents_by_band`(기본 G3·Y2·O1·R0)다.

## 3. 1주 보정

`usage.week_pace` 가 `true` 이면 `week_allow = 100 × (7 − 남은 일수) / 7 + 10` 으로 허용치를 낸다(`usage-band.sh` 가 `week_allow=` 로 보인다). 1주 사용률이 `week_allow` 보다 높으면 띠를 **한 단계 올린다**. 화요일 오전에 60% 와 일요일 저녁 60% 는 다르기 때문이다. 띠 계산은 스크립트가 하고 조정자는 `BAND` 줄을 그대로 쓴다.

## 4. 띠가 바뀔 때

틱의 `usage-band.sh` 결과 띠가 state `usage.band`·`run.usage_band_notified` 와 다르면:

1. `coord-state.sh set '.usage' '<json>'` 으로 띠와 수치를 갱신하고 이벤트를 남긴다.
2. 전 레인에 `protocol.md` 3.7 `사용량 조정` 을 **한 번** 보낸다(`run.usage_band_notified` 에 띠를 기록해 같은 알림을 반복하지 않는다).
3. 띠별 행동을 집행한다: Y 는 새 레인 생성 금지·대기 작업 배정 중단, O 는 낮은 우선순위 레인에 쉬라 지시하고 레인 수 줄이기, R 은 전 레인 멈춤.
4. 이미 도는 Workflow 는 멈추지 않는다. 멈추면 작업이 반쯤 남는다. 다음 Workflow 부터 새 상한을 적용하게 한다.
5. 일을 안 준 레인은 `coord-state.sh hold <레인> usage-band` 로 표시한다(`monitor.md`).
6. 띠가 내려오면(예: O→Y) 같은 방식으로 한 번 알리고 `usage-band` hold 를 푼다.

## 5. 한도 초기화 뒤 재개

- 세션 설정 `autoContinueAtUsageLimit` 이 켜져 있으면 각 세션이 스스로 이어 간다. 켜져 있는지는 사용자에게 한 번 확인한다.
- 조정자는 `resets_at + 2분` 에 `ScheduleWakeup` 을 걸어 레인 status 를 확인하고, **멈춘 레인에만** 「계속 진행」 을 보낸다(`term-send-safe.sh` 또는 SendMessage, 한도 창이 떠 있는지는 `prompt-watch.sh` 가 `usage-limit` 으로 알려 준다).
- 조정자 자신도 멈춰 있을 수 있으므로 Claude 토큰을 안 쓰는 셸 타이머를 보조로 둔다. 대상 목록은 설정 `wake_targets` 이고, 레인을 새로 띄우거나 닫으면 목록을 갱신하도록 사용자에게 알린다. 타이머 스크립트 경로는 설정이다(스킬이 제공하지 않는다).
- R 띠에서 풀릴 때는 정본 갱신을 확인하고 새 Workflow 를 허용하는 `사용량 조정` 을 보낸다.
