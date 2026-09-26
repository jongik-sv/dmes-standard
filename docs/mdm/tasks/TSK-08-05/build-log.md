# TSK-08-05 build-log

## B1 — 순수 이동(I9)

- `RuleValueTestService` 의 케이스 판정(`Evaluated`·`object`·`evaluate`·`runCase`·`hitValue`·`compare`·`resultKey`·`sameValue`·`sameHit`·`decimal`·`mismatch`·`results`·`value`·`error` 두 개)과 상수 `HIT_KEY`·`INPUT`·`NUMBER_TEXT` 를 `common/rule/RuleCaseJudge` 로 옮겼다. `RuleValueTestService` 는 static import 로 부른다. 옮긴 상수는 다른 테스트가 쓰지 않아 `RuleValueTestService` 에 남기지 않았다.
- 본문에서 바뀐 글자는 접근 제한자(`public`·`public static`), `runCase` 의 `static` 추가(인스턴스 필드를 쓰지 않았다), 메서드 참조 `RuleValueTestService::error`·`::value` → `RuleCaseJudge::error`·`::value` 뿐이다.
- 확인: `./gradlew :mdm:api:test --tests 'com.dongkuk.dmes.mdm.dme.ruleEdit.RuleValueTestServiceTest'` — 12건 통과(실패 0), 테스트 파일 수정 없음.

## B1 — 확정 검사·diff·SPI

- 새 테스트: lib `RuleVersionDiffsTest` 7건·`RuleConfirmReportTest` 8건, api `RuleConfirmCheckSqliteTest` 13건. 구현 전 스텁(`UnsupportedOperationException`)으로 lib 15건이 모두 빨강인 것을 확인한 뒤 구현했다.
- 관련 테스트(초록): `:mdm:lib:test --tests 'com.dongkuk.dmes.mdm.common.rule.*' --tests 'com.dongkuk.dmes.mdm.contract.*' --tests 'com.dongkuk.dmes.mdm.common.version.*'` 653건, `:mdm:api:test --tests 'com.dongkuk.dmes.mdm.dme.*' --tests 'com.dongkuk.dmes.mdm.common.*' --tests 'com.dongkuk.dmes.mdm.MdmBusinessRuleMigrationTest' --tests 'com.dongkuk.dmes.mdm.dmc.codeConfirm.*'` 511건, 실패 0. 이 안에 `RuleValueTestServiceTest`·`RuleLedgerChecksTest`·`BusinessRuleVersionScenarioSqliteTest`·`VersionStateServiceSqliteTest`·`CodeConfirmOasisHttpTest`·`RuleSaveValidatorTest`·`ContractStubCompileTest`·`VersionSpiRegistryTest` 가 수정 없이 들어 있다.
- 다음 단위가 알아 둘 것: 기본 픽스처(QLTY_GRD_JDG, FIRST)는 STORED 저장 시 검사에서 `NULL_GAP` WARNING 두 건(COIL_THK·SURF_GRD)이 나온다. D3(모든 WARNING 을 확인 대상으로)에 따라 이 픽스처를 확정하려면 `warningsAcknowledged=true` 가 필요하다(B3 S6·S7, B5 픽스처).
- I15: `grep -n "createNativeQuery\|JdbcTemplate" src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/rule/confirm/*.java` 결과 없음.

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I1 | 보고서 조립에서 RESULT_VAR_RELEASED 항목을 건너뜀 | `RuleConfirmReportTest` CR1·CR6 | 잡힘 |
| I2 | WARNING 만 있는 항목을 PASSED 로 | `RuleConfirmReportTest` CR2 | 잡힘 |
| I3 | `flatten` 을 이슈 심각도 대신 항목 상태(REJECTED)로 나눔 | `RuleConfirmReportTest` CR3 | 잡힘 |
| I4 | SAVE_CHECKS 이슈 code 에 항목 이름을 넣음 | `RuleConfirmReportTest` CR3·CR4 | 잡힘 |
| I5 | 저장 시 검사 결과를 `issues()` 대신 `errors()` 만 씀 | `RuleConfirmCheckSqliteTest` SP3 | 잡힘 |
| I6 | `ContractChangeCheck.targets()` 에서 STORED 를 뺌 | `RuleConfirmCheckSqliteTest` SP3 | 잡힘 |
| I7 | 행 수 판정을 `rowCount < 2` 로(행 하나를 비어 있음으로) | `RuleConfirmReportTest` CR5 | 잡힘 |
| I8 | 기대값 없는 케이스(`pass == null`)도 판정에 넣음 | `RuleConfirmReportTest` CR6 | 잡힘 |
| I8 | 기본 행 row_id 를 NORMAL 행에서 고름 | `RuleConfirmCheckSqliteTest` SP4(기본 행) | 잡힘 |
| I8 | 값 테스트 실행 예외를 CASE_RUN_FAILED 로 바꾸지 않고 다시 던짐 | `RuleConfirmCheckSqliteTest` SP9(예외) | 잡힘 |
| I9 | `RuleCaseJudge.sameValue` 의 NUMBER 비교를 `compareTo` 대신 `equals` 로 | `RuleValueTestServiceTest` 케이스 비교 | 잡힘 |
| I10 | 통과 조건을 "생산 룰 모두 RELEASED" 로 | `RuleConfirmReportTest` CR7 | 잡힘 |
| I10 | 이 룰이 만드는 이름을 빼지 않음 | `RuleConfirmReportTest` CR7 | 잡힘 |
| I10 | 생산 룰 조회에서 `RES_GRP` 를 뺌 | `RuleConfirmCheckSqliteTest` SP5 | 잡힘 |
| I10 | 생산 룰을 RELEASED 버전에서만 찾음(모든 버전 아님) | `RuleConfirmCheckSqliteTest` SP5 | 잡힘 |
| I10 | 컬럼 사전 이름을 빼지 않음 | `RuleConfirmCheckSqliteTest` SP5 | 잡힘 |
| I11 | SPI `check` 가 보고서를 거치지 않고 빈 결과를 돌려줌 | `RuleConfirmCheckSqliteTest` SP2 | 잡힘 |
| I12 | 직전 RELEASED 판정 `<` → `<=` | `RuleConfirmCheckSqliteTest` SP1(최초·v3) | 잡힘 |
| I12 | 직전 RELEASED 를 가장 큰 ver 대신 가장 작은 ver 로 | `RuleConfirmCheckSqliteTest` SP1(최초·v3) | 잡힘 |
| I13 | 정렬 seq 를 새 seq 대신 옛 seq 우선으로 | `RuleVersionDiffsTest` DF6 | 잡힘 |
| I13 | 정규화에서 객체 키 정렬을 끔 | `RuleVersionDiffsTest` DF4 | 잡힘 |
| I13 | CHANGED 판정에서 seq 비교를 뺌 | `RuleVersionDiffsTest` DF2·DF6 | 잡힘 |
| I13 | `SEQ` 값을 문자열로 | `RuleVersionDiffsTest` DF2·DF5 | 잡힘 |
| I14 | `report` 안에서 룰 엔티티 `setMaruRuleName` 호출(트랜잭션 커밋 때 flush) | `RuleConfirmCheckSqliteTest` SP7 | 잡힘 |
| I15 | (변이 없음 — 코드 리뷰 규칙) | 없음, 위 grep 으로 확인 | 안 잡힘(보고) |
| I16 | `RuleConfirmCheck` 의 `@Component` 를 뺌 | `RuleConfirmCheckSqliteTest`(컨텍스트 주입 실패로 전건) | 잡힘 |
| I17 | 임시 `@Component DefinitionLookup` 구현을 더함 | `MdmBusinessRuleMigrationTest` 계약 전용 가드 | 잡힘 |

- 첫 I14 변이(`rule.setStatus("DEPRECATED")`)는 잡히지 않았다. `MdmRule.STATUS` 가 `updatable = false` 라 엔티티 변경이 원장에 닿지 않는, 효과 없는 변이였기 때문이다. 쓰기가 실제로 flush 되는 칸(`MARU_RULE_NAME`)으로 바꿔 다시 돌렸고 잡혔다.

## 설계 이탈

- **B1 — `RuleConfirmReport.report` 오버로드**: §6.3 의 6인자 `report` 에는 값 테스트 실행 예외(CASE_RUN_FAILED)를 넘길 칸이 없다. 그래서 `String caseRunFailure`(null 이면 없음)를 더한 7인자 판을 두고, 6인자 판은 그것을 null 로 부른다. 결과 변수 참조 예외는 `RuleConfirmReport.producerCheckFailed(message)` 가 만든 이슈를 `resultVarIssues` 자리로 넘긴다.
- **B1 — 케이스가 없으면 정의를 조립하지 않는다**: `RuleConfirmChecks` 는 케이스가 0건이면 값 테스트 정의 조립·엔진 생성을 건너뛴다. 케이스가 없는 DRAFT 가 조립 실패로 CASE_RUN_FAILED 를 받지 않게 하기 위해서다(I8 "케이스가 없으면 PASSED").
- **B1 — SP9 의 조립 예외 픽스처**: 원장으로는 정의 조립이 예외를 던지게 만들 수 없었다. HIT_POLICY 는 CHECK 제약(`BOGUS` 불가)이 있고, NULL 은 엔진이 받아들여 판정했다. 그래서 `RuleConfirmCheckSqliteTest` SP9 둘째 시험은 케이스 조회·생산 룰 조회가 런타임 예외를 던지는 협력자(`RuleTestCaseQueries`·`RuleConfirmQueries` 익명 하위 클래스)로 `RuleConfirmChecks` 를 직접 만들어 두 catch 경로(CASE_RUN_FAILED·PRODUCER_CHECK_FAILED)를 본다. 메시지 모양은 `RuleConfirmReportTest` CR6 도 본다.
- **B1 — 확정 대기 목록 모양**: `RuleConfirmQueries.drafts(keyword)` 는 `Pending(MdmRule rule, MdmRuleVer version)` 목록을 룰 ID·VER 오름차순으로 돌려준다(키워드는 룰 ID·룰명 대문자 부분 일치, `%`·`_`·`\` 는 글자 그대로). B3 `search` 가 이것을 쓴다. `RuleConfirmCheckSqliteTest` 에 이 조회의 시험 하나를 더했다.
