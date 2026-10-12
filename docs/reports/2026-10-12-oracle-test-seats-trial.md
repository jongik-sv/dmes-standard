# 2026-10-12 Oracle 시험 잠금 세분화(시험 자리) 설계·실측

결론: 시험 자리 기본 2 + 열린 PDB 상한 기본 4 권장(이번 회차 반영). 2 빌드 동시 실행 시 총 벽시계 183s → 123-129s(약 30% 단축), ORA-04031·04036·00018·00020 없음, 메모리 여유 있음.

`DMES_ORA_MAX_OPEN` 기본값 3 → 4 는 이번 회차 판단으로 바꿈(문서화된 기본값 변경). 이유: 이 PC 는 `FREEPDB1`·`L_MAIN` 이 늘 열려 있어 상한 3 이면 둘째 시험 빌드가 자리는 받고 복제에서 열린 PDB 자리를 기다림 → gradlew 의 heavy 감싸기 아래에서는 그동안 heavy 슬롯도 놀린 채 쥠(10-09 사례와 같은 모양, 2 슬롯 중 1개가 일 없이 묶임). 3GB 컨테이너에서 4개 열림 실측 정상(b1-b3·d1). 2GB VM PC 는 `DMES_ORA_MAX_OPEN=3`·`DMES_ORA_TEST_SEATS=1`.

배경: [idea.md](../idea.md) 「Oracle 시험 잠금 세분화」, [2026-10-09 사례](2026-10-09-oracle-test-turn-deadlock-heavy-slots.md) 대책 F.

## 1. 설정 전후

| 항목 | 전 | 후 |
|---|---|---|
| `pga_aggregate_target` | 400M | 600M (`ALTER SYSTEM … SCOPE=BOTH`, 거절 없음) |
| `pga_aggregate_limit` | 2G (기본값) | 2G 그대로 |
| `sga_target`·`sga_max_size` | 900M | 그대로 |
| `memory_target` | 0 | 그대로 |
| spfile | `/opt/oracle/product/26ai/dbhomeFree/dbs/spfileFREE.ora` | 같은 파일(값 기록됨) |
| SGA+PGA target 합 | 1.3G | 1.5G (Free 상한 2G 안) |
| 변경 전 PGA | allocated 349MB, maximum allocated 504MB, shared pool free 77MB | — |
| `processes`·`sessions`·`cpu_count` | 200·322·2 | 그대로 |
| 컨테이너 | podman `oracle-26ai-free`, 메모리 1.9-2.0GB / 3.0GB | — |

Hikari: 이미 제한돼 있어 바꾸지 않음. `dmes.test-conventions` 가 Oracle 시험 모드에서만 `spring.datasource.hikari.maximum-pool-size=2`·`minimum-idle=0`·`idle-timeout=10000`·`spring.test.context.cache.maxSize=2` 와 다중 데이터소스 접두 키를 시스템 속성으로 넣음. 시험 코드가 직접 만드는 풀도 2-3(`McmCoreOraTestDb`·`AbstractMdmSharedDbTest`·`MlsTestDb` 등). 실측 user session 증가 = 쉴 때 22 → 시험 중 최대 26(직렬)·29(동시) → 제한 동작 확인.

## 2. 설계

잠금 둘로 나눔(`scripts/oracle/pclock.mjs`).

- CDB 잠금 `$TMPDIR/dmes-ora-pdb.lock`: 옛 이름 그대로. `pdb.mjs` withLock 작업(clone·drop·open·template-*·users·quiet·repair·migrate)만 짧게 쥠.
- 시험 자리 `$TMPDIR/dmes-ora-seat-<i>.lock`, i = 1..`DMES_ORA_TEST_SEATS`(기본 2, 최소 1). 같은 mkdir·owner·30분 stale·1분 touch 규칙. 1 = 옛 동작과 같은 동시성.
- 기존 PDB 모드(`-Pdmes.ora.pdb`)는 자리 + PDB 별 사용 잠금 `dmes-ora-use-<PDB>.lock`(같은 PDB 를 두 빌드가 함께 비우지 않게).
- 순서 고정: 자리 → (사용 잠금) → CDB 잠금. CDB 잠금 쥔 채 자리 기다림 없음.
- 열린 PDB 자리(`DMES_ORA_MAX_OPEN`) 대기를 CDB 잠금 밖으로 옮김(`withLockRoom`: 밖에서 기다림 → 잠금 → 다시 셈 → 모자라면 놓고 재시도). 전에는 `doClone` 이 잠금 안에서 600s 기다림 → 자리 2개면 「B 가 잠금 쥐고 자리 대기, A 는 drop 하려고 잠금 대기」 교착 가능했음.
- 하니스는 clone 에 `DMES_ORA_ROOM_WAIT_SEC=<하니스 한도>` 를 넘김 → 열린 PDB 여유보다 자리가 많아도 실패 없이 줄 섬(c1 실측).

Gradle 하니스(`OraTestPdbService`):

- `lock-hold` 대신 `pdb.mjs seat-hold [--pdb X]` 로 자리 쥠(`SEATED <pid> <번호> [adopted]`). clone·drop 자식은 CDB 잠금을 스스로 잠깐 잡음 → 자식 환경에서 `DMES_ORA_LOCK_HELD` 지움(`childEnv`).
- 시험 PDB 이름 `T_<레인>_<자리>`(레인 부분 먼저 잘라 `T_` 뒤 25자 이하). 전에는 `T_<레인>` 하나라 같은 워크트리에서 mcm·mdm 시험을 함께 걸면 둘째가 첫째 PDB 를 drop 했음(자리 도입 시 드러나는 결함). 시작 때 남은 같은 이름 PDB drop 은 그 자리 주인만 하므로 안전.
- 상위 넘김: heavy → `DMES_ORA_SEAT_HELD=<pid>`(seat-hold 가 그 번호를 그대로 씀, 놓지 않음). 옛 상위 → `DMES_ORA_LOCK_HELD=<pid>` 면 자리 없이 CDB 잠금 사용(옛 동작, `lockHeldByParent` 의미 그대로 = CDB 잠금 주인일 때만 참).
- 빌드 안 차례(`acquireTurn`·`TURN_OWNER`, JVM 모니터 하나)는 그대로. 한 빌드 안 모듈은 PDB 하나를 함께 쓰므로 직렬 유지. 자리는 빌드 사이 상한.

heavy.mjs(대책 F, 이번 회차 미커밋분 수정): 슬롯 + 빈 자리 하나를 한 번에 잡음. 자리 다 차면 잡은 슬롯 즉시 반납 후 대기. 넘기는 값 `DMES_ORA_SEAT_HELD`. 옛 `pclock.mjs`(자리 API 없음) 워크트리에서는 옛 CDB 잠금 방식으로 돌아감.

새 `pdb.mjs` 명령: `seat-hold`·`seat-held`·`seats`(주인 보기). `lock-hold`·`lock-held` 유지(e2e `withPcLock`·옛 하니스용).

## 3. 실측

작업 A = `mcm-core: cleanTest test --tests 'com.dongkuk.dmes.mcm.oracheck.*'`(151 test). B = `mdm: :api:cleanTest :api:test --tests 'com.dongkuk.dmes.mdm.dmb.*'`(184 test). 모두 `-Pdmes.ora.test=clone`, d1 을 뺀 변형은 `DFLOW_GRADLEW_NO_HEAVY=1`(heavy 없이 gradlew 직접, d1 은 gradlew 의 heavy 감싸기·기본값 그대로), JDK 21, `testClasses` 예열 뒤. 템플릿 `TPL_EMPTY`, 복제·열기 7-10s. 표본 약 10s 간격.

| 변형 | 자리 | MAX_OPEN | A(s) | B(s) | 총(s) | 결과 | shared pool free 최소(MB) | PGA allocated 최대(MB) | user session 최대 | 열린 PDB 최대 | VM CPU 평균/최대(%) | 컨테이너 메모리 최대 | mac load1 최대 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| a1 직렬(A→B) | 1 | 4 | 64 | 118 | 183 | 통과 | 49 | 414 | 26 | 3 | - | 2.12GB | 4.11 |
| a2 동시 시작 | 1 | 4 | 67 | 181 | 182 | 통과(B 가 A 뒤로 줄 섬) | 54 | 404 | 26 | 3 | 25/50 | 2.11GB | 5.90 |
| b1 동시 | 2 | 4 | 75 | 128 | 129 | A 1건 실패(아래) | 46 | 430 | 28 | 4 | 37/75 | 1.94GB | 6.17 |
| b2 동시 | 2 | 4 | 69 | 122 | 123 | 통과 | 48 | 439 | 29 | 4 | 33/65 | 2.03GB | 5.19 |
| b3 동시 | 2 | 4 | 70 | 124 | 125 | 통과 | 45 | 440 | 29 | 4 | 33/67 | 1.92GB | 5.52 |
| d1 동시, gradlew→heavy 기본 경로(기본값만) | 2 | 4(기본) | 75 | 128 | 129 | 통과. heavy 가 slot-1+seat-1·slot-2+seat-2 를 잡아 넘김(대기 0s) | 55 | 412 | 28 | 4 | 31/69 | 1.94GB | 4.55 |
| c1 동시 | 2 | 3 | 69 | 184 | 185 | 통과(B 복제가 열린 PDB 자리 대기 → 사실상 직렬) | 51 | 443 | 26 | 3 | 24/45 | 1.92GB | 4.65 |

쉴 때 기준: shared pool free 96MB, PGA allocated 384MB, user session 22, 열린 PDB 2(FREEPDB1·L_MAIN). maximum PGA allocated 는 내내 504MB(인스턴스 기동 뒤 최대치, 이번 시험이 넘기지 않음).

- a1 의 표본은 A 끝 무렵(21:42:48)부터만 바르게 기록됨(첫 표본기가 컨테이너별 PGA 행을 잘못 읽음). VM CPU 열은 a2 부터.
- ORA-04031·ORA-04036·ORA-00018·ORA-00020: 모든 변형에서 alert log 새 줄·시험 출력 0건. alert log 새 줄(171-177줄)은 PDB 복제·열기·닫기·삭제 기록뿐.
- 시험 빌드 동안 be-run dev 서버 `localhost:8096`·`8100` `/actuator/health` 전후 모두 UP.
- b1 실패: `JobDispatchServiceOraTest.misfireRunsLateSlotOnce` 223행 `expected: 1 but was: 2`(같은 작업 JOB_RUN 행 수). 메모리·접속 오류 아님, 자리와 무관한 시각 경계 결함. 원인: 선점 조건이 `NEXT_RUN_AT <= now + INTERVAL '30' SECOND`(`JobDispatchService` 89·101행). 그 클래스는 호스트 21:49:39-46 에 돌았고 DB 시계는 약 2s 빠름 → DB 21:49:41-48 + 30s ≥ 21:50:00 → 두 번째 claim 이 `*/10` 다음 회차(21:50)를 「때가 됨」으로 봄 → 첫 회차가 아직 RUN 이라 겹침 SKIP 행 1개 추가 → 2행. `:x9:30-:x0:00` 사이에 이 시험이 돌면 자리 수와 상관없이 실패함. 같은 시험은 a1·a2·b2·b3·c1 에서 통과(5/6). 시험 수정은 이번 범위 밖(따로 추적).

## 4. 판단·권장

- 자리 2: 이 두 작업 기준 총 벽시계 약 30% 단축(183 → 123-129s). 긴 쪽(B)이 독자 실행보다 약 6-10s 느려짐(118 → 122-128s), A 도 64 → 69-75s. 인스턴스 쪽 여유는 충분(shared pool free 45MB 이상, PGA 440MB < target 600MB, 컨테이너 2.0GB / 3.0GB).
- 기본값 `DMES_ORA_TEST_SEATS=2` 유지 권장. 3 이상은 실측 안 함(Free CPU 2 thread·shared pool free 45MB 수준이라 권하지 않음).
- 자리 2 효과는 `DMES_ORA_MAX_OPEN ≥ 늘 열린 PDB 수 + 2` 일 때만 → 기본값 4 로 올림(위 결론). 레인 PDB 를 더 열어 둔 PC 는 자리 수를 낮춘다. 넘어도 c1 처럼 실패는 없고 사실상 직렬(단 heavy 슬롯을 놀린 채 쥠).
- PC 의 모든 호출이 같은 `DMES_ORA_TEST_SEATS` 를 써야 상한이 맞음(값이 다르면 큰 값 쪽이 더 많이 들어옴).
- 이번 시험 두 작업은 1-3분 짜리. 더 긴 시험(10분 이상)·3개 이상 동시는 미측정.

## 5. 회귀 시험

- `node --test .claude/skills/dflow-dev/tests/heavy-oracle.test.mjs` 9/9(자리 2개에서 seat-2 잡기·CDB 잠금 안 건드림·옛 pclock 호환 추가).
- `src/backend/build-logic/tests/run-lockheld.sh` 9항목 통과(own·seatadopt·mutex·죽은 pid·자리 가득 → 시간 초과). gradlew 의 heavy 감싸기를 끔(`DFLOW_GRADLEW_NO_HEAVY=1`) — heavy 가 자리를 먼저 잡으면 own 경우를 볼 수 없음.
- `run.sh` 통과(heavy → Gradle 자리 넘김 경로 포함), `run-seq.sh` composite-seq 2/2·composite-multi 1/1·probeRelease 1/1.
- `src/frontend/e2e/support/oracle.unit.spec.ts` withPcLock 2/2(lock-hold 그대로).
- 시험 뒤 남은 PDB·잠금 없음(`pdb.mjs list`·`seats`).
