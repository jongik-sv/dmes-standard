# 고부하 작업 조절

설계 절: §3.d.

팬 없는 노트북급 PC 에서 무거운 명령(Gradle·시험·빌드·E2E·측정)이 겹치지 않게 한다. 같은 설정의 반복 측정도 두 배씩 흔들리므로, 부하 조절은 선택이 아니라 측정의 전제다.

## 1. 두 겹 통제

1. **기계 장치**: `heavy.sh`(설정 `heavy.script`)와 Gradle test-slot 은 그것으로 감싼 명령만 막는다. `heavy.sh` 의 일반 슬롯은 PC 전체 동시 K개(기본 `max(1, RAM_GB/8)`), 부하 검사(`DFLOW_HEAVY_LOAD_MAX`), `--exclusive`(K개를 한꺼번에), `--detach`/`wait`, `snapshot` 을 가진다. `heavy.script` 가 `null` 이면 기계 장치 없이 통지만 한다.
2. **통지**: heavy.sh 를 거치지 않는 vitest·tsc·tsup·playwright 는 통지로만 막을 수 있다. 그러므로 통지는 항상 같이 한다.

heavy.sh 는 고치지 않는다. 측정 창은 통지와 `measure-window.sh open --hold-heavy` 로 연다(heavy.sh 가 없으면 `--hold-heavy` 는 무시된다).

## 2. 레인 우선순위

state 의 레인별 `priority`(숫자가 낮을수록 높음)로 정한다: 머지 임박 > 측정 > 일반 구현 > 대기 작업. 슬롯이 모자라면 조정자가 낮은 레인에 `무거운 작업 금지` 를 보낸다. heavy.sh 자체에는 우선순위가 없다(먼저 잡는 쪽이 이긴다).

## 3. 측정 창(독점)

벽시계 성능 측정은 다른 무거운 일과 겹치면 값이 의미 없다. 창을 열기 전에 측정 레인과 예정 끝 시각을 정한다(`/coordinator measure <레인> <분>`).

순서:

1. **금지 통지**: 측정 레인 외 모든 레인에 `protocol.md` 3.6 `무거운 작업 금지`(사유 측정, 예상 끝, 그동안 할 가벼운 일)를 보낸다. 전용 칸(`heavy_env`)이 있는 레인에도 보낸다(전용 칸 때문에 PC 전체 상한이 K+1 이다).
2. **창 열기**: `scripts/measure-window.sh open measure --lane <측정 레인> --until <iso> --hold-heavy`. 출력 `WINDOW_OPEN measure until=<iso> hold_job=<id|->`. 공용 칸을 창 내내 붙잡는 detach 잡 id 가 `hold_job` 이다.
3. **정숙 확인**: 진행 중인 무거운 명령이 끝나기를 기다린다. `scripts/measure-window.sh quiet-check` 가 `QUIET yes run=0 per_core=<f> procs=0` 이 될 때까지(기준은 `heavy.measure_quiet`, 기본 load1/코어 < 0.5 가 2분 유지) 틱이나 `Monitor` 로 본다. `QUIET no` 면 기다린다.
4. **측정 시작**: 정숙이 확인되면 측정 레인에 `protocol.md` 3.5 `측정 시작`(항목, 창 끝 예정, 쓸 칸)을 보낸다. 측정 레인은 전용 DIR(`heavy.measure_dir`)로 돈다. 회차마다 `uptime` load 를 남기게 한다.
5. **측정 끝**: `측정 끝` 보고를 받으면 `scripts/measure-window.sh close` 로 창을 닫는다(출력 `WINDOW_CLOSED measure`, `hold_job` 해제). 전 레인에 `무거운 작업 재개` 를 보낸다. state 의 `windows[]` 에서 빠지고 이벤트가 남는다.

창이 끝나지 않을 때(측정 레인이 멈춤): 창 예정 끝 + 15분의 틱에서 측정 레인 상태를 보고, 화면을 읽어 이유를 확인한 뒤 연장(`open` 을 새 until 로 다시)이나 중단(`close`)을 정한다.

주의:

- `heavy.sh --exclusive` 는 명령 하나 동안만 K개를 쥔다. ABAB 회차 사이에 슬롯이 풀려 다른 레인의 gradle 이 끼어든 사고가 있었다. 창을 기계 보유만 믿지 않고 반드시 통지와 같이 연다.
- heavy.sh 밖 명령과 test-slot 은 보유로 막지 못한다. test-slot 형식은 gradle 쪽 사양이라 이 스킬이 건드리지 않는다.
- 창 동안 heavy.sh 밖 명령이 끼어들면 그 회차를 무효로 하고 측정 레인에 알린다.
- 창이 열린 동안 머지 허가는 창 끝 뒤로 미룬다(`merge-gate.md` `WINDOW`).

## 4. load 기준(틱마다)

`coord-status.sh` 의 `per_core`(= load1 / 코어 수)를 본다. 값은 설정 `heavy.*`.

| 조건 | 행동 |
|---|---|
| `per_core` > `heavy.load_soft`(1.2) | 새 Workflow·새 무거운 명령 착수 지시를 보류한다(`hold <레인> heavy-ban`, 풀리면 재개). state `load.soft_ticks` 증가 |
| `per_core` > `heavy.load_hard`(2.0) 가 **두 틱 연속**(`load.hard_ticks` ≥ 2) | `priority` 가 가장 낮은(숫자가 큰) 레인에 `무거운 작업 금지`(사유 부하)를 보낸다. `load.banned` 에 기록 |
| `per_core` < `heavy.load_release`(0.8) 가 **두 틱 연속**(`load.release_ticks` ≥ 2) | `load.banned` 의 금지를 풀고 `무거운 작업 재개` 를 보낸다 |

- 틱마다 해당 카운터를 `coord-state.sh set '.load.soft_ticks' <n>` 등으로 갱신한다. 조건이 끊기면 0 으로 되돌린다.
- 측정 창에서는 `heavy.measure_quiet`(기본 0.5)를 기준으로 쓴다.
- 참고: 이 부류의 PC 에서는 load 가 코어당 약 1.5 인 상태에서도 시험이 시간 초과로 연쇄 실패한 일이 있어 기본 soft 를 heavy.sh 의 1.5 보다 낮은 1.2 로 둔다.

## 5. 예외 칸(전용 칸)

특정 레인에 공용과 따로 슬롯 1개를 줄 수 있다(사용자 지시가 있을 때). 전용 칸은 state `lanes.<레인>.heavy_env` 에 환경 변수 묶음으로 기록하고 착수 지시에 그대로 넣는다.

```text
DFLOW_HEAVY_DIR=<전용 DIR> DFLOW_HEAVY_SLOTS=1 DMES_TEST_SLOTS=0
```

전용 칸이 있으면 PC 전체 상한이 K+1 이 되므로 측정 창 동안에는 전용 칸 레인에도 금지를 보낸다. 레인 안 규칙은 지시문에 둔다: 레인당 무거운 작업 1개, gradle·vitest workers 2, 동시 agent 는 `workflow.agents_by_band`.

## 6. 이동·외출 창

사용자가 정한 시각부터 무거운 명령을 금지한다(예: 「9시 20분부터 gradle 시험 돌리지 말라」). 측정 창과 같은 장치로 처리한다.

1. `scripts/measure-window.sh open move --until <iso>`(`--lane` 없음, `--hold-heavy` 는 선택).
2. 전 레인에 `무거운 작업 금지`(사유 이동)를 보낸다.
3. 끝 시각에 `close` 후 `무거운 작업 재개` 를 보낸다. 끝 시각이 정해지지 않았으면 `until` 은 사용자가 알려 주는 예상 시각으로 하고, 사용자가 돌아왔다고 하면 닫는다.
4. 이동 창에서도 머지 허가는 미룬다.

`kind` 가 `ban` 인 창은 부하 때문에 일시적으로 세우는 금지 기록용이다(load 기준 4 의 hard 행동).
