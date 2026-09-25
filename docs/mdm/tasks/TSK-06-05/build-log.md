# TSK-06-05 build-log

## B1 — 순수 클래스 3종 + SPI `MasterCodeConfirmCheck`

- 커밋: 00d42bb(구현·시험), 4fb7587(변이 검증 전 시험 보강)
- 새 시험: lib `MasterCodeVersionDiffsTest`(8)·`MasterCodeConfirmChecksTest`(26)·`MasterCodeCategoryChangesTest`(5), api `MasterCodeConfirmCheckSqliteTest`(8)
- 빨강 확인: 순수 클래스 3종을 `UnsupportedOperationException` 골격으로 먼저 두고 lib 시험을 돌려 새 시험 39건 실패를 확인한 뒤 구현했다. SPI 빈은 구현과 시험을 함께 썼고, 아래 변이 검증(I3·I8·I15)으로 시험이 틀린 구현을 잡는 것을 확인했다.
- 관련 시험: `./gradlew :mdm:lib:test :mdm:api:test` 통과(lib 705·api 853, 실패 0). 운영 SPI 빈 등록이 mdm api 의 모든 컨텍스트에 영향을 주므로 api 모듈 전체를 돌렸다.

## 설계 이탈

- 시험 도우미 `lib/src/test/.../common/mastercode/MasterCodeProcCdLedger.java` 를 새로 만들었다(설계 §2 목록에 없음). 04 PROC_CD 원장(v2.000 이 82·83 을 닫은 뒤)을 조회 모델 행 모양으로 두고 `viewAt(V)` 로 거른 모습을 만든다. `MasterCodeVersionDiffsTest`·`MasterCodeCategoryChangesTest` 가 함께 쓴다.
- `MasterCodeConfirmCheckSqliteTest` 에 설계 SP1~SP5 밖의 시험을 더했다: 레지스트리의 MASTER_CODE 확정 검사가 이 빈인지(I28 일부), 최초 버전의 `diff().base` 가 null 인지, RELEASED 없는 2.000 DRAFT 가 최초 버전이라 3·4항 EXEMPT 인지(I3 의 SPI 판). SP5 는 행 수·ROW_VERSION 에 더해 세 선분 표의 행 모습 전체를 전후로 비교한다.
- SP1·SP2 시드: `MasterCodeFixtures.seedProcCdBeforeDraftEdits()` 는 v2.000 이 편집하기 전 모습이라, 시험 `@BeforeEach` 에서 82·83@1.001·MAJOR 82 의 TO_VER 를 `2.000` 으로 직접 UPDATE 해 04:1066-1080 모습을 만든다(공용 픽스처는 고치지 않았다).
- `MasterCodeConfirmChecks` 에 설계 시그니처 외에 package-private `itemOf(MasterCodeItemIssueCode)` 를 두었다(CK6 가 enum 전체를 순회해 부른다). 순수 클래스 `MasterCodeVersionDiffs` 에 D10 키 도우미 `itemKey`·`cateKey`·`cateItemKey`(public static)를 두었다 — B2 의 `CodeConfirmService` 가 같은 키를 만들 때 쓴다.
- `MasterCodeCategoryChanges.Change.kind` 값은 상수 `NEW`·`CLOSED`·`CHANGED` 로 두었다. 없는 쪽의 건수(`beforeCount`·`afterCount`)는 null 이다.

## 변이 검증 기록

B1 담당 I1~I16. 대상 시험만 `--fail-fast` 로 돌렸다(lib 29건 한 스크립트, api 3건 별도 스크립트, 각각 `heavy.sh` 로 감쌈). 변이마다 `git checkout --` 로 되돌렸고 작업 트리가 깨끗한 것을 확인했다.

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I1 | 5항 행을 빠뜨림 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I1 | 행 순서를 뒤집음 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I2 | 공통 검사(3항)를 최초 버전 면제보다 먼저 판정 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I2 | 보류(inScope) 판정 제거 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I2 | 심각도 거부/경고 뒤바꿈 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I3 | 순수 `report` 가 최초 버전을 ver == 1.000 으로 판정 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I3 | SPI 최초 판정을 ver == 1.000 으로 | `MasterCodeConfirmCheckSqliteTest` SP4_I3 | 잡힘 |
| I4 | DELEGATED·EXEMPT 행 이슈도 errors 에 넣음 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I4 | WARNED 행 이슈를 errors 로 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I5 | 코드 행 itemKey 의 `ITEM:` 접두 누락 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I5 | 이슈 code 를 항목 enum 대신 세부 코드로 둠 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I6 | 매핑 밖 저장 검사 코드를 1항으로 흡수(던지지 않음) | `MasterCodeConfirmChecksTest` | 잡힘 |
| I6 | LVL_PARENT_MISMATCH 를 8항으로 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I7 | touched = diff 에 있는 코드만 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I8 | 순수 `previousReleased` 가 ver == V 포함 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I8 | 순수 `previousReleased` 가 RELEASED 상태 조건 없음 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I8 | SPI base 를 가장 작은 RELEASED 로 | `MasterCodeConfirmCheckSqliteTest` SP1 | 잡힘 |
| I8 | SPI base 를 V 대신 9999 기준 가장 큰 RELEASED 로 | — | 안 잡힘(보고) — 실데이터에서는 DRAFT 가 가장 큰 ver 라 결과가 같은 동등 변이다. V 기준 규칙 자체는 순수 시험 CK8 이 잡는다 |
| I9 | BASE 를 2항 검사에서 뺌 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I10 | 2항 거부 카테고리도 2-1·2-2 해석 | `MasterCodeConfirmChecksTest` CK7 | 잡힘 |
| I10 | 2-1 itemKey 를 CATE 키로 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I10 | 2-2 경고를 버림 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I11 | 4항 판정 반전(diff 있으면 거부) | `MasterCodeConfirmChecksTest` | 잡힘 |
| I12 | 값이 같은 닫힘·새 쌍도 CHANGED | `MasterCodeVersionDiffsTest` | 잡힘 |
| I12 | REMOVED 의 newValues 를 채움 | `MasterCodeVersionDiffsTest` | 잡힘 |
| I12 | 닫힘·새 쌍을 합치지 않음 | `MasterCodeVersionDiffsTest` | 잡힘 |
| I13 | ITEM 값 맵에 FROM_VER | `MasterCodeVersionDiffsTest` | 잡힘 |
| I13 | CATE_ITEM 값 맵에 CODE | `MasterCodeVersionDiffsTest` | 잡힘 |
| I14 | 버전 비교를 `equals` 로 | `MasterCodeVersionDiffsTest` | 잡힘 |
| I15 | SPI `report` 가 코드 1P 를 닫음(쓰기) | `MasterCodeConfirmCheckSqliteTest` | 잡힘 |
| I16 | 줄어듦 판정에서 CLOSED 제외 | `MasterCodeCategoryChangesTest` | 잡힘 |
| I16 | 적중 집합 대신 건수 비교 | `MasterCodeCategoryChangesTest` | 잡힘 |
| I16 | 적중 대신 해석 행 전체를 집합으로 | `MasterCodeCategoryChangesTest` | 잡힘 |

- 동등 변이라 싣지 않은 것: I4 "EXEMPT·DELEGATED 행에도 이슈 목록을 남김"은 `report` 가 그 행에 이슈를 만들지 않아 관찰되지 않는다(`flatten` 쪽 변이로 대신 잡았다). I11 "`!firstVersion &&` 제거"는 최초 버전이면 4항이 이슈 판정 전에 EXEMPT 가 되어 관찰되지 않는다.
