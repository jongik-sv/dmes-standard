# 고부하 작업 조절

- 목적: 팬 없는 노트북급 PC 에서 무거운 명령이 겹치지 않게 함
  - 무거운 명령 = Gradle·시험·빌드·E2E·측정
- 스크립트 = `node scripts/<이름>.mjs`

## 1. 두 겹 통제

1. **기계 장치**: `heavy.sh`(설정 `heavy.script`)와 Gradle test-slot
   - 감싼 명령만 막음
   - 동시 수 = heavy.sh 일반 슬롯 K개 (`max(1, RAM_GB/8)`)
   - 기능: 부하 검사(`DFLOW_HEAVY_LOAD_MAX`), `--exclusive`
   - 기능: `--detach`/`wait`, `snapshot`
   - `heavy.script` 가 `null` → 통지만
2. **통지**: heavy.sh 밖 명령(vitest·tsc·tsup·playwright)은 통지로만 막음
   - 통지는 항상 같이 함

- heavy.sh 는 고치지 않음
- 측정 창 = 통지 + `measure-window.mjs open --hold-heavy`
  - heavy.sh 없음 → `--hold-heavy` 무시됨

## 2. 레인 우선순위

- state 레인별 `priority` (숫자가 낮을수록 높음)
- 순서: 머지 임박 > 측정 > 일반 구현 > 대기 작업
- 슬롯 부족 → 낮은 레인에 `무거운 작업 금지` 전송
- heavy.sh 자체에는 우선순위 없음 (먼저 잡는 쪽이 이김)

## 3. 측정 창(독점)

- 창을 열기 전에 측정 레인과 예정 끝 시각을 정함
  - 명령: `/coordinator measure <레인> <분>`

1. **금지 통지**: `protocol.md` 3.6 `무거운 작업 금지` 전송
   - 대상: 측정 레인 외 모든 레인 (전용 칸 `heavy_env` 레인 포함)
   - 내용: 사유 측정, 예상 끝, 그동안 할 가벼운 일
2. **창 열기**: `measure-window.mjs open measure --lane <측정 레인> --until <iso> --hold-heavy`
   - 출력 `WINDOW_OPEN measure until=<iso> hold_job=<id|->`
   - `hold_job` = 공용 칸을 창 내내 붙잡는 detach 잡 id
3. **정숙 확인**: 진행 중인 무거운 명령이 끝나길 기다림
   - `measure-window.mjs quiet-check` 를 틱이나 `Monitor` 로 봄
   - `QUIET yes run=0 … procs=0` → 4 로 (기준 `heavy.measure_quiet`)
   - `QUIET no` → 계속 기다림
   - `QUIET unknown` = load 를 못 얻는 윈도우(Git Bash)
     - `heavy.sh status`·프로세스 목록으로 조정자가 직접 판단
4. **측정 시작**: 측정 레인에 `protocol.md` 3.5 `측정 시작` 전송
   - 내용: 항목, 창 끝 예정, 쓸 칸
   - 측정 레인 = 전용 DIR(`heavy.measure_dir`)로 돔
   - 회차마다 load 기록 (`coord-status.mjs` PC 줄 `load1=`)
   - 윈도우(Git Bash)는 `-` → 「관측 불가」 기재
5. **측정 끝**: `측정 끝` 보고 수신
   - `measure-window.mjs close` (출력 `WINDOW_CLOSED measure`, `hold_job` 해제)
   - 전 레인에 `무거운 작업 재개` 전송

창이 끝나지 않음(측정 레인 멈춤):
- 창 예정 끝 + 15분의 틱에서 측정 레인 화면을 읽어 이유 확인
- 연장(`open` 을 새 until 로 다시) 또는 중단(`close`) 결정

주의:
- `heavy.sh --exclusive` = 명령 하나 동안만 K개를 쥠
  - 회차 사이에 슬롯이 풀림 → 통지와 같이 창을 엶
- heavy.sh 밖 명령과 test-slot 은 보유로 막지 못함
  - test-slot 형식 = gradle 쪽 사양, 건드리지 않음
- 창 동안 heavy.sh 밖 명령이 끼어듦 → 그 회차 무효, 측정 레인에 알림
- 창이 열린 동안 머지 허가 = 창 끝 뒤로 미룸 (`merge-gate.md` `WINDOW`)

## 4. load 기준(틱마다)

- `tick.mjs` 가 `coord-status.mjs` 의 `per_core` 로 단계를 정함
  - `per_core` = load1 / 코어 수
  - 단계는 `<회차>/ticks/load` 파일에 기록
- 같은 단계가 **두 틱 연속**일 때만 줄을 냄
- 비교: soft·hard = `≥`, release = `<`
- 기준값 = 설정 `heavy.load_soft`·`heavy.load_hard`·`heavy.load_release`
- 조정자는 카운터를 손으로 갱신하지 않음

틱 줄 → 조정자 행동:
- `LOAD_SOFT per_core=<f>`
  - 새 Workflow·새 무거운 명령 착수 지시 보류
  - `coord-state.mjs hold <레인> heavy-ban`, 풀리면 재개
- `LOAD_HARD per_core=<f>`
  - `priority` 가 가장 낮은(숫자가 큰) 레인에 `무거운 작업 금지`(사유 부하) 전송
  - 그 레인을 `load.banned` 에 기록 (`coord-state.mjs set`)
- `LOAD_RELEASE per_core=<f>` (`load.banned` 가 비면 안 나옴)
  - `load.banned` 의 금지를 풀고 `무거운 작업 재개` 전송
  - `load.banned` 를 비움

- 측정 창에서는 `heavy.measure_quiet` 기준
- **부하의 원인은 잰 숫자로 말함.**
  - 화면·다른 세션의 진단 한 줄을 사용자에게 옮기지 않음
    - 예: 「감시 스크립트가 CPU 주원인」
  - 프로세스별 CPU 확인
    - macOS·Linux: `ps -Ao pid,pcpu,etime,command`
    - 윈도우(Git Bash): 누적 CPU 시간 없음
      - `compat_ps_table` 프로세스 목록과 작업 관리자로 대신
  - 합이 코어 몇 개분인지 기재
  - 의심 명령은 `time` 으로 한 번 실행
  - 잰 숫자가 없음 → 「추정」 으로 기재

## 5. 예외 칸(전용 칸)

- 사용자 지시가 있을 때만 특정 레인에 공용과 따로 슬롯 1개를 줌
- state `lanes.<레인>.heavy_env` 에 환경 변수 묶음으로 기록
- 착수 지시에 그대로 넣음

```text
DFLOW_HEAVY_DIR=<전용 DIR> DFLOW_HEAVY_SLOTS=1 DMES_TEST_SLOTS=0
```

- 전용 칸이 있으면 PC 전체 상한 = K+1
  - 측정 창 동안 전용 칸 레인에도 금지 전송
- 레인 안 규칙 = 지시문 (`templates/brief.md` 「무거운 작업 칸」)

## 6. 이동·외출 창

- 사용자가 정한 시각부터 무거운 명령 금지
  - 예: 「9시 20분부터 gradle 시험 돌리지 말라」
- 측정 창과 같은 장치로 처리

1. `measure-window.mjs open move --until <iso>`
   - `--lane` 없음, `--hold-heavy` 선택
2. 전 레인에 `무거운 작업 금지`(사유 이동) 전송
3. 끝 시각에 `close` 후 `무거운 작업 재개` 전송
   - 끝 시각 미정 → `until` = 사용자가 알려 주는 예상 시각
   - 사용자가 돌아왔다고 함 → 닫음
4. 이동 창에서도 머지 허가는 미룸

- `kind` 가 `ban` 인 창 = 부하 금지 기록용 (`LOAD_HARD` 행동)

## 7. 무거운 시험 운영(조정자 몫)

- 레인의 시험 규칙 정본 = `templates/brief.md` 「시험」
  - 무거운 명령 1회 시간 상한(모듈당 15분·전체 빌드 40분) = 같은 파일 「작업 방식」
  - 범위·예산·시간 상한·백그라운드 정리
- 여러 레인의 전체 시험이 겹침 → 머지 요청이 빠른 순으로 하나씩
  - `priority` 순서 = §2
- 남은 머지가 여럿 → 묶어서 전체 시험 횟수를 줄임
  - 묶은 머지의 허가 = `merge-gate.md` §1 의 한 번에 하나 원칙
- 리포 전체 시험·E2E 전체 = 조정자가 지시할 때만
- 레인의 「남은 백그라운드 0」 확인
  - `idle-check.mjs` 의 `BUSY` 사유와 `ps`
  - 절차 = `closing.md` §4, `spawn.md` §5
