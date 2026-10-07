# mdm 시험 시간 비교 — SQLite 대 Oracle 시험 PDB

2026-10-07, ora-mdm 레인. **양쪽 모두 1회 측정한 참고값이다(반복 측정 아님, 조정자 지시).** 같은 PC(MacBook Air M5, 팬 없음)에서 같은 설정도 2배까지 흔들리므로 아래 차이로 결론을 내리지 않는다.

**요약**: lib 은 DB 를 거의 쓰지 않아 같다(6.9초 대 6.4초). api 의 순수 시험 시간(스위트 시간 합)은 SQLite 153.8초 대 Oracle 267.3초로 약 1.7배다. 늘어난 몫의 대부분은 시험 클래스마다 하는 공유 DB 재설정(시험이 만든 객체 제거·FK 위상 순서 DELETE·V1 시드 재삽입)과 Oracle 왕복 비용으로 본다. 건수가 달라(아래 §2) 엄밀한 비교는 아니다.

## 1. 측정 방법

| 항목 | SQLite (옛) | Oracle (새) |
|---|---|---|
| 대상 | dev `ce378785a` 를 임시 워크트리(detached)에 받음 | 레인 브랜치 `feat/ora-mdm` `cb84b651d`(dev `14b09f1af` 머지③ 합친 뒤) |
| 위치 | `src/backend/mdm` | `src/backend/mdm` |
| 명령 | `heavy.sh ../gradlew :lib:test :api:test` | 모듈별로 따로 `DFLOW_HEAVY_WAIT=1800 heavy.sh ../gradlew -Pdmes.ora.test=clone :<lib|api>:test --rerun` |
| DB | 공유 SQLite 시험 파일 | 하니스가 `TPL_EMPTY` 에서 `T_ORA_MDM` 복제, 끝나면 삭제. MDMAPUSER 를 JVM 당 한 번 Flyway clean+migrate, 클래스마다 행 재설정 |
| 반복 | 1회 | 1회 |
| 집계 | `build/test-results/test/*.xml` 의 testsuite `time=` 합(python) | 같음 |

- Oracle 은 Podman VM 3GB 의 26ai Free 컨테이너 하나를 모든 레인이 함께 쓴다. 측정은 2026-10-07 밤, 다른 레인 Oracle 작업과 겹치지 않게 PC 잠금 아래에서 돌았다.
- SQLite 의 gradle 벽시계(29분 43초)는 heavy.sh·gradlew 슬롯 대기가 섞여 비교에 쓰지 않는다.

## 2. 결과

| 항목 | SQLite | Oracle | 비고 |
|---|---|---|---|
| lib 시험 수 / 실패 | 2,061 / 0 | 2,071 / 0 | |
| lib 스위트 시간 합 | 6.9초 | 6.4초 | DB 를 거의 쓰지 않는 단위 시험 |
| lib 벽시계 | — | 35초 | PDB 복제·삭제 포함 |
| api 시험 수 / 실패 / 건너뜀 | 1,923 / 0 / — | 1,853 / 0 / 13 | |
| api 스위트 시간 합 | 153.8초 | **267.3초** | 약 1.7배 |
| api 벽시계 | — | 5분 34초 | PDB 복제·삭제, 컨텍스트 기동 포함. m3(머지③ 전) 실행은 4분 36초 |

- api 건수 차이(1,923 → 1,853): SQLite 전용 `*MigrationTest` 14개 등 18개 클래스를 `src/backend/mdm/archive/test-java` 로 옮겼다(Oracle 기준선 V1 검증으로 대체). 건너뜀 13건은 Oracle 샘플이 없어 `@Disabled` 로 둔 `RuleCalcSeedSetTest` 등이다.
- Oracle api 스위트 상위 10개(합 87.8초, 전체의 33%):

| 시간 | 시험 수 | 클래스 |
|---|---|---|
| 21.2초 | 33 | RuleLedgerChecksTest |
| 12.8초 | 2 | MdmApplicationHealthTest(컨텍스트 기동 포함) |
| 10.5초 | 12 | RuleTableSaveCheckTest |
| 8.4초 | 1 | CodeDataRuleLedgerChainTest |
| 8.3초 | 12 | LayoutConfirmPinSqliteTest |
| 6.5초 | 13 | LayoutConfirmSqliteTest |
| 5.7초 | 33 | MasterCodeVersionStateSqliteTest |
| 5.0초 | 3 | DataCateEditQueryCountTest |
| 4.8초 | 37 | BusinessRuleVersionScenarioSqliteTest |
| 4.6초 | 1 | TermRecommendPerformanceTest |

(클래스 이름의 `Sqlite` 는 옛 이름 그대로다. 이번 회차에는 바꾸지 않는다.) SQLite 쪽 클래스별 값은 임시 워크트리를 정리하며 남기지 않아 클래스 단위 대조는 하지 못했다.

## 3. 해석과 후속

- 늘어난 시간은 기능 회귀가 아니라 시험 기반 비용이다. 클래스마다 재설정하는 `AbstractMdmSharedDbTest` 가 표 39개를 위상 순서로 DELETE 하고 V1 시드를 다시 넣는다. 줄이려면 재설정을 "바뀐 표만"으로 좁히거나, 시험을 트랜잭션 롤백 방식으로 바꾸는 방안이 있다(후속, 이번 회차 범위 밖).
- 백엔드 기능 성능(P1~P5)은 `scripts/perf/mdm-backend/run-measure.sh` 가 Oracle 시험 PDB 에서 잰다(4caad53c3). EMBEDDING 칸이 NULL 이라 2026-10-04 SQLite 측정과 조건이 달라 **Oracle 값끼리만** 비교한다. 이번 회차에는 실행하지 않았다.
