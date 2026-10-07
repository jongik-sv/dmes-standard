# mcm 시험 시간 비교 — SQLite 대 Oracle 시험 PDB

2026-10-07, ora-mcm-app 레인. 지시: "SQLite 대비 시험 시간은 이 문서에 남긴다."
SQLite·Oracle 모두 3회씩 측정했다(Oracle 은 VM 3GB, feat/ora-mcm-core 1d612401a·dev ce378785a 를 합친 상태).

**결론**: 시험만 도는 시간은 Oracle 이 SQLite 보다 약 4~10초 길다(공통 31개 클래스 합 중앙값 39.3초 대 34.2초, +15%).
벽시계는 SQLite 45초 대 Oracle 78초(중앙값)다. 늘어난 시간의 대부분은 시험 전 단계(PC 잠금 대기와 시험 PDB 복제·이전 PDB 삭제, 10~41초)다.

## 1. 측정 방법

| 항목 | SQLite (옛) | Oracle (새) |
|---|---|---|
| 대상 | dev `fb253556d` 를 임시 워크트리에 받음 | 이 레인 브랜치 `feat/ora-mcm-app` |
| 위치 | `src/backend/mcm` | `src/backend/mcm` |
| 명령 | `../gradlew :lib:test --rerun :api:test --rerun --continue -q` | 같은 명령에 `-Pdmes.ora.test=clone` 추가 |
| 컴파일 | 미리 해 둠(시간에 안 넣음) | 같음 |
| 반복 | 3회, 중앙값 | 3회, 중앙값 |
| DB | 시험마다 임시 SQLite 파일 | 하니스가 TPL_EMPTY 에서 시험 PDB 를 복제, 끝나면 삭제 |

- 환경: MacBook Air M5(팬 없음, 16GB). 같은 설정에서도 결과가 크게 흔들려서 **3회 반복의 중앙값**을 쓴다.
- Oracle 은 Podman VM 의 26ai Free 컨테이너 하나(`oracle-26ai-free`)다. 여러 레인이 함께 쓴다. **Oracle 측정은 VM 3GB 기준이다**(2026-10-07 20:20 에 2GB → 3GB 로 늘려 재기동, 사용자 결정). 2GB 시절의 1회 실행 값은 비교에 쓰지 않는다.
- Oracle 은 PDB 복제·삭제 시간과, PC 전체 Oracle 잠금을 기다리는 시간이 따로 든다. 순수 시험 시간과 나누어 적는다.
- 스크립트: scratchpad 의 `sqlite-bench.sh`·`ora-bench.sh`(heavy.sh `--detach`, `DFLOW_HEAVY_WAIT=1800`). JUnit XML 은 `sqlite-xml1~3`·`ora-xml1~3`.
- Oracle 측정: 2026-10-07 20:28~20:32. heavy.sh 슬롯 대기는 벽시계에 넣지 않았다(스크립트 안에서 회차마다 잰다).
- Oracle 의 「시험 전 단계」는 로그 시각으로 나눴다: `:lib:testClasses` 끝 → `[dmes-ora] :lib:test 시험 PDB …` 줄. 하니스가 PC 잠금을 잡고 이전 시험 PDB 를 지우고 TPL_EMPTY 에서 복제하는 구간이다. 하니스가 잠금 대기와 복제를 따로 찍지 않아 둘을 나누지 못했다.

## 2. 전체 결과

| 항목 | SQLite run1 | run2 | run3 | SQLite 중앙값 | Oracle 중앙값 |
|---|---|---|---|---|---|
| 벽시계(초) | 45 | 45 | 43 | **45** | **78** (60 / 78 / 101) |
| 시험 전 단계: 잠금 대기 + PDB 삭제·복제(초) | 없음 | 없음 | 없음 | 0 | **30** (10 / 30 / 41) |
| 시험 단계: lib 시작 → api 끝(초) | — | — | — | — | **46** (46 / 45 / 56) |
| 순수 시험 시간(XML 클래스 시간 합, 초) | 39.9 | 40.0 | 38.3 | **39.9** | **43.9** (43.9 / 43.7 / 53.2) |
| 공통 31개 클래스 합(초) | 34.2 | 35.0 | 32.7 | **34.2** | **39.3** (39.3 / 37.6 / 47.3) |
| 시험 수 | 173 | 173 | 173 | 173 | 166 |
| 실패 / 건너뜀 | 0 / 1 | 0 / 1 | 0 / 1 | 0 / 1 | 0 / 1 |
| 종료 코드 | 0 | 0 | 0 | 0 | 0 |

- 클래스 35개(안쪽 클래스 하나 포함). 벽시계에서 클래스 시간 합을 뺀 5~6초는 JVM 기동·Gradle 몫이다.
- 클래스별 중앙값을 다 더하면 39.5초다. 회차별 합의 중앙값(39.9)과 조금 다르다.
- Oracle 의 「순수 시험 시간」도 XML 클래스 시간 합이다. 건너뜀 1건은 양쪽 모두 성능 시험(MasterCodeSelPopQueryRoutePerfTest)이다.
- run1 의 시험 전 단계가 10초로 짧은 것은 직전에 T_ORA_MCM_APP 을 지워 두어 삭제할 PDB 가 없었기 때문으로 보인다. run2·3 은 이전 회차의 PDB 를 지우고 다시 복제했다.
- run3 은 시험 단계도 10초쯤 길다(56초). 같은 시각 다른 레인의 Oracle 작업과 겹쳤는지는 확인하지 않았다. 중앙값을 쓰는 까닭이다.

### 참고: Oracle 첫 실행(반복 측정 아님)

2026-10-07 18:35~18:53 에 한 번 돌렸다. 잠금 대기 약 15분을 포함하고, 162개 시험 중 실패 1·건너뜀 1이었다.
한 번뿐이고 다른 레인과 겹친 실행이며 VM 2GB 시절이라 **이 숫자로 결론을 내지 않는다.**

## 3. SQLite 클래스별 시간 (3회 중앙값, 상위 10)

| 순위 | 클래스 | 시험 수 | 중앙값(초) |
|---|---|---|---|
| 1 | McmLoginLockoutDbTest | 8 | 16.6 |
| 2 | NoticePermissionFilterTest | 21 | 6.8 |
| 3 | DataInitializerSeedFingerprintTest | 3 | 2.6 |
| 4 | NoticeOasisHttpTest | 8 | 2.0 |
| 5 | McmAuthControllerSqliteRetryTest (archive 대상) | 1 | 1.9 |
| 6 | DataInitializerLocalAdminUnlockTest | 7 | 1.9 |
| 7 | McmAuthServiceSqliteLockTest (archive 대상) | 2 | 1.9 |
| 8 | MenuCatalogOasisSaveIntegrationTest | 3 | 1.1 |
| 9 | JpaConfigSqliteFlagTest (archive 대상) | 4 | 0.9 |
| 10 | MasterCodeSelPopQueryRouteParityTest | 15 | 0.7 |

- 상위 2개가 전체 클래스 시간의 약 59%(23.4 / 39.5)다. McmLoginLockoutDbTest 한 개가 42%다.
- 상위 10개 중 3개는 SQLite 전용이라 Oracle 쪽에는 없다. 합 4.7초.

## 3-1. Oracle 클래스별 시간 (3회 중앙값, 상위 10)

| 순위 | 클래스 | 시험 수 | Oracle 중앙값(초) | SQLite 중앙값(초) |
|---|---|---|---|---|
| 1 | McmLoginLockoutDbTest | 8 | 13.3 | 16.6 |
| 2 | NoticePermissionFilterTest | 21 | 7.0 | 6.8 |
| 3 | DataInitializerLocalAdminUnlockTest | 7 | 5.7 | 1.9 |
| 4 | DataInitializerSeedFingerprintTest | 3 | 4.6 | 2.6 |
| 5 | NoticeInstantRoundTripTest (새) | 1 | 2.9 | — |
| 6 | MasterCodeSelPopQueryRouteParityTest | 15 | 2.9 | 0.7 |
| 7 | McmMenuSeederNormalizeTest (새) | 1 | 2.1 | — |
| 8 | McmMybatisConfigWiringTest | 1 | 2.1 | 0.1 |
| 9 | MenuCatalogOasisSaveIntegrationTest | 3 | 2.1 | 1.1 |
| 10 | NoticeMgmtServiceTest | 27 | 0.4 | 0.3 |

- Oracle 에서 늘어난 몫은 대부분 클래스마다 한 번 하는 스키마 준비(`McmOraTestDb.resetSchemas` — 네 스키마 Flyway clean → migrate, 1~2초)다. LocalAdminUnlock·Fingerprint·QueryRouteParity·MybatisWiring·MenuSeederNormalize 가 그렇다.
- McmLoginLockoutDbTest 는 Oracle 이 더 빠르다(16.6 → 13.3초). SQLite 파일 잠금 대기가 없어진 몫으로 보인다.
- 새 시험(NoticeInstantRoundTrip 2.9초)은 공지 Spring 컨텍스트를 처음 띄우는 클래스라 그 기동 시간이 붙는다.

## 4. 시험 수가 다른 이유

SQLite 173개는 dev `fb253556d` 기준이고, Oracle 쪽은 이 레인에서 SQLite 전용 시험을 archive 하고 새 시험을 넣은 결과다.
아래는 SQLite XML 의 클래스 이름과 이 브랜치 `src/backend/mcm/{api,lib}/src/test/java` 의 시험 클래스 목록을 비교한 차이다. 나머지 30개 클래스는 양쪽에 같이 있다.

**SQLite 에만 있음(이 레인에서 archive)**

| 클래스 | 시험 수 | 이유 |
|---|---|---|
| SqliteBusyRetryTest | 5 | SQLite 잠금 재시도 |
| McmAuthControllerSqliteRetryTest | 1 | SQLite 잠금 재시도 |
| McmAuthServiceSqliteLockTest | 2 | SQLite 잠금 |
| JpaConfigSqliteFlagTest | 4 | SQLite 플래그 |
| RoleChangedEventListenerTest 의 안쪽 클래스 `설정_해석` | 6 | XML 에 안쪽 클래스가 따로 잡힘. 바깥 클래스는 양쪽에 있음 |

**Oracle 쪽에서 새로 생김**

| 클래스 | 비고 |
|---|---|
| NoticeInstantRoundTripTest | 새 시험(공지 일시 왕복) |
| CaravanMetaSeederTableMissingTest | 새 시험(caravan 표가 없는 PDB) |
| McmMenuSeederNormalizeTest | 새 시험 |
| McmNoticeTestDb | 시험 도우미 클래스이고 시험 자체는 아님 |

- XML 기준 공통 클래스는 31개다(안쪽 클래스 `RoleChangedEventListenerTest$설정_해석` 이 Oracle XML 에도 잡힌다). 시험 수 173 대 166 의 차이는 archive 한 SQLite 전용 시험 12개와 새 시험(왕복 1·가드 2·공백 보정 1·빈 조회조건 1 등)의 차이다.
- 따라서 시험 수 차이는 시험 환경 차이가 아니라 시험 목록 차이다. 시간 비교는 위 표의 「공통 31개 클래스 합」으로 한다.

## 5. 남은 것

| 할 일 | 상태 |
|---|---|
| 잠금 대기와 PDB 삭제·복제를 따로 재기 | 하니스가 두 구간을 따로 찍지 않아 못 했다. 하니스(ora-base 몫)가 찍으면 다시 잰다 |
| 다른 레인이 Oracle 을 쓰지 않는 시간대 측정 | 못 했다. run3 이 겹침 의심 |
