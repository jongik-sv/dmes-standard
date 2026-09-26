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

## B2 — 계산 상태

- 새 테스트: lib `RuleVersionsEffectiveStatusTest` 3건(ES1~ES3), api `RuleEffectiveStatusTest` 10건(EF1~EF5, EF2 는 경계 두 갈래와 DEPRECATED 필터). `effectiveStatus` 를 저장값을 그대로 돌려주는 스텁으로 두고 돌려 ES1·EF1·EF2·EF3(폐기 성공)·EF4(승격 둘)·EF5 가 빨강인 것을 확인한 뒤 구현했다.
- 관련 테스트(초록): `:mdm:lib:test --tests 'com.dongkuk.dmes.mdm.common.rule.*' --tests 'com.dongkuk.dmes.mdm.dme.*'` 541건, `:mdm:api:test --tests 'com.dongkuk.dmes.mdm.dme.*'` 217건, `:mdm:api:test --tests 'com.dongkuk.dmes.mdm.common.*' --tests 'com.dongkuk.dmes.mdm.MdmBusinessRule*' --tests 'com.dongkuk.dmes.mdm.*Rule*'` 506건, 실패 0. `RuleMngServiceTest`·`RuleHeaderServiceTest`·`RuleVersionServiceTest`·`DmeRoleCheckArchitectureTest`·`BusinessRuleVersionScenarioSqliteTest` 는 수정 없이 들어 있다. 저장 상태 전제와 계산 상태가 달라지는 기존 케이스는 없었다(기존 픽스처의 CREATED 룰은 RELEASED 가 없다).
- JPQL 날짜 비교(`v.applyFrom <= :now`)는 SQLite 에서 엔티티 변환기(`MdmSqliteLocalDateTimeConverter`)를 타고 같은 텍스트 형식으로 바인드된다. EF2 의 경계 두 케이스(시계 = applyFrom 이면 INUSE, 1초 전이면 CREATED)로 확인했다.
- 범위에서 뺀 것(D11): 룰 세트 화면이 싣는 룰 상태(`RuleIoReader` 82·180행 `rule.getStatus()`)는 저장 상태 그대로다.

## B3 — 서비스·BPMN·메뉴

- 새 테스트: api `RuleConfirmServiceTest` 15건(S1~S11), `RuleConfirmOasisHttpTest` 3건(HT1~HT3), `RuleConfirmBpmnActionTest` 5건. 서비스를 `UnsupportedOperationException` 스텁으로 두고 돌려 23건 가운데 17건이 빨강인 것을 확인한 뒤 구현했다. 초록이던 6건은 BPMN 시험 5건(BPMN 을 테스트보다 먼저 복제했다)과 HT3(B1 의 SPI 빈)이다. BPMN 시험이 실제로 규칙을 잡는지는 아래 변이 I32 두 건으로 확인했다.
- 구현 뒤: `:mdm:api:test --tests 'com.dongkuk.dmes.mdm.dme.ruleConfirm.*'` 23건 통과(실패 0).
- 관련 테스트(초록): `:mdm:lib:test --tests 'com.dongkuk.dmes.mdm.dme.*'` 1건(`DmeRoleCheckArchitectureTest`), `:mdm:api:test --tests 'com.dongkuk.dmes.mdm.dme.*' --tests 'com.dongkuk.dmes.mdm.common.version.*' --tests 'com.dongkuk.dmes.mdm.common.rule.*' --tests 'com.dongkuk.dmes.mdm.MdmOasisActionVocabularyTest' --tests 'com.dongkuk.dmes.mdm.MdmBusinessRuleMigrationTest' --tests 'com.dongkuk.dmes.mdm.dmc.codeConfirm.*'` 411건, 실패 0. 이 안에 `BusinessRuleVersionScenarioSqliteTest`·`VersionStateServiceSqliteTest`(새 `@Service` 가 들어가도 시나리오 후처리기 컨텍스트가 뜬다, I16)·`DmeBpmnActionTest`·`DmeOasisHttpTest`·`MdmOasisActionVocabularyTest`(전체 스캔이 새 BPMN 도 읽는다)가 수정 없이 들어 있다.
- mcm: 프롬프트의 좁힌 명령 `:mcm:test` 는 NO-SOURCE 라 `DataInitializer` 를 컴파일하지 않는다. 그래서 `:mcm:api:compileJava :mcm:api:test` 를 따로 돌렸다. 컴파일은 성공했고, mcm api 에는 테스트가 없다(NO-SOURCE).
- OASIS 계약 검사: `check_oasis_contract.py --root .` ERROR 0 / WARN 0 / INFO 29. 다만 이 검사기는 mdm BPMN 을 스캔하지 않는다(`--all` 출력에 ruleConfirm·codeConfirm 이 없음, 06-05 F20 과 같다). 새 BPMN 을 실제로 지키는 시험은 `RuleConfirmBpmnActionTest` 다.
- 응답 JSON 모양은 B4 `pages/dme/ruleConfirm/types.ts` 와 대조했다. 키 이름, 정수 ver, `oldCells`·`newCells` 문자열, `diffCounts` 네 종류(0 포함), 이슈의 `severity` 가 모두 일치한다.
- 변이는 스크립트 하나(`mutate.py` + `run.sh`)로 세 번에 나눠 돌렸다. 각 묶음을 heavy.sh 로 한 번 감쌌고, Gradle 데몬을 재사용했으며 `--fail-fast` 를 썼다. 되돌리기는 백업 사본(`<git-dir>/dflow-bak/B3/`)을 `cp` 로 복사하는 방식이다. 끝난 뒤 백업 폴더에 남은 파일이 없음을 확인했다. 모든 변이에서 컴파일 오류는 0건이었다.
- 첫 I24 변이(JPA 엔티티 `setApplyTo` 뒤 `save`)는 잡히지 않았다. `MdmRuleVer.APPLY_TO` 가 `updatable = false` 라 원장에 닿지 않는, 효과 없는 변이였기 때문이다. 별도 `TransactionTemplate` 안의 네이티브 UPDATE(커밋되는 부분 쓰기)로 바꿔 다시 돌렸고, 잡혔다.
- I30 의 D5 칸(`REQUESTED_BY`·`REQUESTED_AT`·`RELEASED_AT`, 결재·긴급·반려 칸 비움)을 쓰는 것은 공통 서비스(`casConfirm`)다. 이 서비스가 바꿀 수 있는 것은 확정자 ID 전달뿐이고, 그 변이는 공통 서비스의 소유자 판정에서 먼저 빨강이 된다. D5 칸 값 자체는 S6 이 원장에서 단언한다.

## B4 — 확정 화면·ruleEdit 연결

- 테스트 먼저(빨강 확인): `cd src/frontend/m-mdm && pnpm exec vitest run tests/dme/ruleConfirm tests/dme/ruleEdit/rule-edit-page.test.ts` — 구현 전 checks.test.ts·rule-confirm-page.test.ts 는 모듈 없음으로 실패, rule-edit-page.test.ts 는 RE1·RE2 3건 실패(20건 통과).
- 구현 뒤 같은 명령: 3 파일 95건 통과, 실패 0.
- 관련 테스트: `cd src/frontend/m-mdm && pnpm exec vitest related pages/dme/ruleConfirm/{page.tsx,api.ts,types.ts,checks.ts,ConfirmModal.tsx} pages/dme/ruleEdit/cards/RuleVersionCard.tsx --run` — 4 파일 109건 통과, 실패 0(tsup.config.ts 포함 실행 때 6 파일 113건 통과).
- 린트: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint`(tsc --noEmit) — exit 0.
- page-registry: `cd src/frontend/m-mcm && node scripts/generate-page-registry.mjs` — `"dme/ruleConfirm"` 한 줄만 추가(42 pages).
- 변이 검증: 스크립트 하나(heavy.sh 한 번, `vitest run <대상> --bail=1`, 백업 사본 `dflow-bak/B4/` 로 되돌림) — 17개 모두 잡힘. 되돌린 뒤 관련 테스트·린트 초록 재확인.
- B3 가 같은 시각 만든 `RuleConfirmService` 의 응답 키(`rule`·`version`·`previous`·`diff`·`diffCounts`·`vars`·`items`·`applyFromCheck`·`contractWarnings`·`caseSummary`·`closedPreviousVer` 등, ver 정수)를 grep 으로 대조했고 types.ts 와 어긋나는 키는 없었다(읽기만 함).
- 전체 스위트(m-mdm test 전체·testAll 등)와 E2E 는 돌리지 않았다(Build 단위 규칙, E2E 는 B5 몫).
- 화면을 브라우저로 보는 시각 확인은 하지 않았다(B5 E2E 몫).
- `mantine-aggrid-ui` 스킬 점검: `mantine_docs.py audit`(ruleConfirm 5 파일 + RuleVersionCard) 의심 0건, `aggrid_docs.py audit` 의심 0건. 새 파일은 codeConfirm 과 같은 shared 래퍼(`@dk-oasis/shared/form` Button·Input·Checkbox, `modal` Modal, `layout` ContentBody·ContentPanel·DETAIL_* ·RBAC)만 쓰고 `@mantine`·`ag-grid` 직접 import 가 없다. prop 은 tsc(lint) 로 확인했다. 색은 codeConfirm 과 같이 의미 토큰에 대체값을 붙인 `var(--color-danger, #b91c1c)` 모양을 그대로 따랐다.
- 옛 "확정 이동 비활성" 단언 탐색: `grep -rn '확정 이동\|confirmScreenReady\|버전 확정 화면(TSK-08-05)' src/frontend/e2e src/frontend/m-mdm/tests` — e2e 스펙에는 없고, m-mdm 에는 fixtures.ts(false, 그대로 둠)와 기존 비활성 케이스(여전히 초록)뿐이다. B5 가 고칠 기존 단언은 없다.

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
| I18 | 계산 상태의 경계를 `!applyFrom.isAfter(now)` → `applyFrom.isBefore(now)`(같은 시각을 적용 전으로) | `RuleVersionsEffectiveStatusTest` ES1 | 잡힘 |
| I19 | ruleMng INUSE 필터에서 "저장 CREATED + 적용된 RELEASED" 갈래를 끔 | `RuleEffectiveStatusTest` EF2 | 잡힘 |
| I19 | ruleMng CREATED 필터에서 `NOT EXISTS(적용된 RELEASED)` 를 끔 | `RuleEffectiveStatusTest` EF2 | 잡힘 |
| I19 | ruleMng 목록 행 status 를 저장값으로 | `RuleEffectiveStatusTest` EF1·EF2 | 잡힘 |
| I19 | ruleEdit view 의 `rule.status` 를 저장값으로 | `RuleEffectiveStatusTest` EF1 | 잡힘 |
| I20 | 헤더 저장의 승격 호출을 뺌 | `RuleEffectiveStatusTest` EF4(헤더 저장) | 잡힘 |
| I20 | 폐기 트랜잭션의 승격 호출을 뺌 | `RuleEffectiveStatusTest` EF3 | 잡힘 |
| I20 | 폐기 가능 판정을 저장값 INUSE 기준으로 | `RuleEffectiveStatusTest` EF3 | 잡힘 |
| I20 | 새 버전의 승격 호출을 뺌 | `RuleEffectiveStatusTest` EF4(새 버전) | 잡힘 |
| I21 | `setConfirmScreenReady(true)` → `false` | `RuleEffectiveStatusTest` EF5 | 잡힘 |
| I16 | 서비스에 SPI 빈(`RuleConfirmCheck`) 필드 주입을 더함 | `BusinessRuleVersionScenarioSqliteTest`(후처리기가 SPI 정의를 지워 컨텍스트 기동 실패, 전건) | 잡힘 |
| I19 | ruleConfirm view 의 `rule.status` 를 저장값으로 | `RuleConfirmServiceTest` S7 | 잡힘 |
| I19 | ruleConfirm search 의 `ruleStatus` 를 저장값으로 | `RuleConfirmServiceTest` S7(확정 대기 목록 계산 상태) | 잡힘 |
| I22 | `versionState.confirm` 을 부르지 않고 가짜 결과를 돌려줌 | `RuleConfirmServiceTest` S10(확정 뒤 RELEASED) | 잡힘 |
| I22 | 확정 전에 `VersionWriteGuard.beginDraftWrite` 를 불러 ROW_VERSION 을 한 번 더 올림 | `RuleConfirmOasisHttpTest` HT1(`confirmed.rowVersion == 1`) | 잡힘 |
| I22a | 공통 서비스 호출 뒤 `entityManager.clear()` 를 뺌 | `RuleConfirmOasisHttpTest` HT1(`version.status == RELEASED`) | 잡힘 |
| I23 | 서비스 클래스에 `@Transactional` 을 붙임 | `RuleConfirmOasisHttpTest` HT2(응답 message 가 `ParameterName must not be null` — 파라미터 바인딩 실패, 테스트 결과 XML 로 확인) | 잡힘 |
| I24 | 확정 전에 직전 RELEASED 의 APPLY_TO 를 별도 트랜잭션으로 커밋(부분 쓰기) | `RuleConfirmServiceTest` S8(거부 뒤 직전 RELEASED APPLY_TO 불변 단언) | 잡힘 |
| I25 | `confirm` 첫 줄 `requireSteward()` 를 뺌 | `RuleConfirmServiceTest` S5(빈 입력에 MDM013 이 아니라 REQUIRED_VALUE) | 잡힘 |
| I26 | 최초 버전 `applyFromCheck` 를 EXEMPT 대신 PASSED 로 | `RuleConfirmServiceTest` S3 | 잡힘 |
| I26 | `ApplyFromOrderCheck` 를 부르지 않고 늘 통과 | `RuleConfirmServiceTest` S8 | 잡힘 |
| I27 | validate 안에서 룰명을 고쳐 저장 | `RuleConfirmServiceTest` S4(원장 스냅숏) | 잡힘 |
| I27 | validate 의 DRAFT 판정(MDM002)을 끔 | `RuleConfirmServiceTest` S4 | 잡힘 |
| I28 | `warningsAcknowledged` 를 늘 true 로 | `RuleConfirmServiceTest` S5(MDM014) | 잡힘 |
| I29 | 확정 응답·view 의 `rule.status` 를 저장값으로 | `RuleConfirmServiceTest` S7 | 잡힘 |
| I30 | `ConfirmCommand` 확정자를 현재 사용자 대신 다른 ID 로 | `RuleConfirmServiceTest` S10(공통 서비스 소유자 판정 `DRAFT 소유자만 할 수 있습니다`(MDM003) 로 빨강, 테스트 결과 XML 로 확인) | 잡힘 |
| I31 | validate 항목에 다섯째 항목(`RULE_REFERENCE`)을 더함 | `RuleConfirmServiceTest` S10(항목 이름 집합) | 잡힘 |
| I32 | BPMN confirm 분기의 method 를 `validate` 로 | `RuleConfirmBpmnActionTest` B4 | 잡힘 |
| I32 | BPMN serviceTask bean 을 `ruleEditService` 로 | `RuleConfirmBpmnActionTest` B3 | 잡힘 |
| I33 | (변이 없음 — 메뉴 시드는 E2E T1·T8 로만 잡힌다) | 없음, B5 E2E·Verify diff 확인 몫 | 안 잡힘(보고) |
| I34 | `canConfirm` 에서 적용 순서 REJECTED 조건을 뺌 | `checks.test.ts` canConfirm "적용 순서 REJECTED → false" | 잡힘 |
| I34 | 검사한 apply_from 과 입력값 일치 조건을 뺌 | `checks.test.ts` canConfirm "검사한 apply_from 과 입력값이 다름 → false" | 잡힘 |
| I34 | 화면이 confirm 권한 대신 늘 true 를 넘김 | `rule-confirm-page.test.ts` P6(validate 는 있음) | 잡힘 |
| I35 | 확인 활성에서 계약 변경 확인란 조건을 뺌 | `rule-confirm-page.test.ts` P4(둘 다 체크) | 잡힘 |
| I35 | 계약 변경 경고만 있을 때 warningsAcknowledged=false 를 보냄 | `rule-confirm-page.test.ts` P4(계약 경고만) | 잡힘 |
| I35 | 경고가 없어도 warningsAcknowledged=true 를 보냄 | `rule-confirm-page.test.ts` P3(경고 없음) | 잡힘 |
| I36 | 미래 적용을 브라우저 시계로 판정 | `rule-confirm-page.test.ts` P5(futureApplyFrom=true) | 잡힘 |
| I37 | view 요청의 ver 를 문자열로 보냄 | `rule-confirm-page.test.ts` 목록 행 → view(정수) | 잡힘 |
| I37 | handoff ver 문자열을 정수로 바꾸지 않음 | `rule-confirm-page.test.ts` P1 | 잡힘 |
| I37 | null 파라미터를 빼지 않고 보냄 | `rule-confirm-page.test.ts` P1(ver 없음) | 잡힘 |
| I38 | apply_from 에서 초를 뺌 | `checks.test.ts` toServerDateTime | 잡힘 |
| I39 | 서버 message 대신 고정 문구를 보임 | `rule-confirm-page.test.ts` P7 | 잡힘 |
| I40 | 확정 이동 활성에서 confirmScreenReady 를 뺌 | `rule-edit-page.test.ts` "확정 이동은 확정 화면이 없어 비활성이다" | 잡힘 |
| I40 | 확정 이동 활성에서 MDM 원천 조건을 뺌 | `rule-edit-page.test.ts` RE2(EXTERNAL) | 잡힘 |
| I40 | 확정 이동 활성에서 DRAFT 조건을 뺌 | `rule-edit-page.test.ts` RE2(RELEASED) | 잡힘 |
| I40 | 확정 이동이 ver 를 넘기지 않음 | `rule-edit-page.test.ts` RE1 | 잡힘 |
| I41 | 저장 시 검사 거부여도 계약 영역을 변경 없음으로 | `checks.test.ts` contractState BLOCKED | 잡힘 |

- 첫 I14 변이(`rule.setStatus("DEPRECATED")`)는 잡히지 않았다. `MdmRule.STATUS` 가 `updatable = false` 라 엔티티 변경이 원장에 닿지 않는, 효과 없는 변이였기 때문이다. 쓰기가 실제로 flush 되는 칸(`MARU_RULE_NAME`)으로 바꿔 다시 돌렸고 잡혔다.

- B2 변이는 스크립트 하나(heavy.sh 한 번, Gradle 데몬 재사용, `--fail-fast`, 백업 사본 `dflow-bak/B2/` 로 되돌림)로 돌렸다. ruleMng 필터 변이는 `:now` 파라미터가 쿼리에 남도록 조건을 끄는 방식(`AND 1 = 0`·`1 = 1 OR`)으로 넣었다 — 파라미터를 지우면 Hibernate 가 바인드 오류로 빨강을 내어 규칙이 아니라 다른 이유로 잡힌다. `-q` 출력이라 실패한 메서드 이름은 남지 않았고, 표의 잡은 테스트 열은 대상 클래스에서 그 규칙을 보는 케이스다(각 변이에서 대상 클래스 1건 실패, 컴파일 오류 없음).

## 설계 이탈

- **B1 — `RuleConfirmReport.report` 오버로드**: §6.3 의 6인자 `report` 에는 값 테스트 실행 예외(CASE_RUN_FAILED)를 넘길 칸이 없다. 그래서 `String caseRunFailure`(null 이면 없음)를 더한 7인자 판을 두고, 6인자 판은 그것을 null 로 부른다. 결과 변수 참조 예외는 `RuleConfirmReport.producerCheckFailed(message)` 가 만든 이슈를 `resultVarIssues` 자리로 넘긴다.
- **B1 — 케이스가 없으면 정의를 조립하지 않는다**: `RuleConfirmChecks` 는 케이스가 0건이면 값 테스트 정의 조립·엔진 생성을 건너뛴다. 케이스가 없는 DRAFT 가 조립 실패로 CASE_RUN_FAILED 를 받지 않게 하기 위해서다(I8 "케이스가 없으면 PASSED").
- **B1 — SP9 의 조립 예외 픽스처**: 원장으로는 정의 조립이 예외를 던지게 만들 수 없었다. HIT_POLICY 는 CHECK 제약(`BOGUS` 불가)이 있고, NULL 은 엔진이 받아들여 판정했다. 그래서 `RuleConfirmCheckSqliteTest` SP9 둘째 시험은 케이스 조회·생산 룰 조회가 런타임 예외를 던지는 협력자(`RuleTestCaseQueries`·`RuleConfirmQueries` 익명 하위 클래스)로 `RuleConfirmChecks` 를 직접 만들어 두 catch 경로(CASE_RUN_FAILED·PRODUCER_CHECK_FAILED)를 본다. 메시지 모양은 `RuleConfirmReportTest` CR6 도 본다.
- **B1 — 확정 대기 목록 모양**: `RuleConfirmQueries.drafts(keyword)` 는 `Pending(MdmRule rule, MdmRuleVer version)` 목록을 룰 ID·VER 오름차순으로 돌려준다(키워드는 룰 ID·룰명 대문자 부분 일치, `%`·`_`·`\` 는 글자 그대로). B3 `search` 가 이것을 쓴다. `RuleConfirmCheckSqliteTest` 에 이 조회의 시험 하나를 더했다.
- **B2 — 쓰기 경로 승격을 엔티티가 아니라 네이티브로**: §6.7 은 "`MdmRule` 엔티티를 읽어 고치는 경로(헤더 저장)에서는 엔티티 `setStatus("INUSE")`" 라고 했지만 `MdmRule.STATUS` 는 `@Column(updatable = false)` 라 엔티티 변경이 원장에 닿지 않는다. 그래서 세 경로(헤더 저장·폐기·새 버전) 모두 기존 `TransactionTemplate` 안에서 `VersionRowStore.markParentInUse(BUSINESS_RULE, id, audit.currentStamp())` 를 부른다. 같은 까닭으로 flush 가 CREATED 를 다시 덮어쓰는 문제도 없다. 헤더 저장은 `saveAndFlush` 뒤, 폐기는 `writes.deprecate`(조건 `STATUS = 'INUSE'`) 앞에서 부른다. 승격은 저장 CREATED·계산 INUSE 일 때만 한다(`RuleVersions.needsInUsePromotion`, 설계에 없던 작은 도우미).
- **B2 — `RuleEditViewTest` 한 줄**: 설계 §3.2 가 놓친 기존 단언 `assertFalse(v.isConfirmScreenReady())`(RuleEditViewTest 78행)가 I21(`confirmScreenReady` = true)과 정면으로 부딪친다. 설계가 87행을 true 로 바꾸라고 정했으므로 이 단언을 `assertTrue` 로 뒤집었다(기대값 완화가 아니라 설계가 정한 새 값). 이 파일은 B2 범위 표에 없다.
- **B2 — `RuleFilter` 에 기준 시각 칸**: `RuleFilter(keyword, ruleKind, status, now)`. 생성 지점은 `RuleMngService.search` 하나이고 목록 표시와 같은 `now` 를 쓴다.
- 오케스트레이터(B2 뒤): 구현 단위 표의 B4 를 B3 과 같은 묶음 3 으로 옮기고 B5 를 묶음 4 로 당겼다. B3(백엔드 mdm·mcm 시드·BPMN)과 B4(프런트 m-mdm·page-registry)는 컴파일 범위와 파일이 겹치지 않고, B4 가 기대는 응답 모양은 §6.5 에 이미 고정돼 있으며 B4 vitest 는 fetch 목으로 돈다. 마지막 단위 B5 는 혼자 마지막 묶음이다.
- **B3 — 응답을 POJO 가 아니라 `Map` 으로**: §2 는 "응답 DTO(§6.5 모양), ruleEdit dto 관례 POJO" 라고 했다. 그러나 §1 이 화면 선례로 지정한 06-05 `CodeConfirmService` 와 같게 `Map<String, Object>` 로 응답한다. JSON 키·타입은 §6.5 그대로다(ver·baseVer·closedPreviousVer 는 정수, `oldCells`·`newCells` 는 정규화 JSON 문자열, `diffCounts` 는 네 종류 모두, 이슈마다 `severity`). 서비스 테스트 S1~S3·S6 과 HT1 이 이 키 이름으로 단언하고, B4 `types.ts` 와도 대조했다. 요청 DTO 4종은 설계대로 게터·세터 POJO 다.
- **B3 — HTTP 시험은 MockMvc 가 아니라 RANDOM_PORT + HttpClient**: 설계 §3.2 는 `MockMvc` 라고 적었지만, 같은 절이 관례로 든 `DmeOasisHttpTest`·`CodeConfirmOasisHttpTest` 가 모두 실제 포트와 `HttpClient`, 헤더 인증(`X-Authenticated-User`·`X-Authenticated-Role`)을 쓴다. URL 은 `/oasis/ruleConfirm/{action}` 이다. 시계는 운영 시계라 HT1 의 과거 apply_from(2026-01-01)으로 최초 버전을 확정해 `rule.status == INUSE` 를 본다.
- **B3 — 입력 오류 코드**: `confirm` 의 ver·rowVersion 이 비면 `REQUIRED_VALUE`(ruleEdit `requireVer`·`requireRowVersion` 문구), 룰 ID 가 비면 `REQUIRED_VALUE`, 룰이 없거나 버전이 없으면 `INVALID_VALUE`(ruleEdit `loadRule` 과 같은 모양)다. view 에서 ver 를 비웠는데 DRAFT 가 없으면 `INVALID_VALUE` "확정할 DRAFT 가 없습니다" 를 낸다. 06-05 는 MDM021 을 썼지만 dme 서비스 관례를 따랐다. EXTERNAL 원천은 validate·confirm 모두 ruleEdit `requireMdm` 과 같은 `BUSINESS_ERROR` 문구이고, validate 에서는 이 검사가 MDM002 판정보다 앞선다. view 는 EXTERNAL 도 읽는다.
- **B3 — `changedVarIds`**: CHANGED 행에서 칸(var_id)마다 `RuleVersionDiffs.canonicalCells` 로 정규화해 비교한다. 한쪽에만 있는 칸도 바뀐 칸으로 센다. ADDED·REMOVED·SAME 행은 빈 목록이다.
- **B3 — confirm 응답의 `warnings`**: 공통 서비스 `ConfirmResult.warnings()` 에는 심각도가 없다. 화면이 같은 이슈 모양을 쓰도록 `severity: "WARNING"` 을 붙여 싣는다.
- **B3 — S10 픽스처**: 룰의 DEF 시스템 행(`TB_MDM_RULE_SYSTEM` MES/DEF)과, 그 시스템에 코드 배포 행이 0건인 상태로 만들었다(설계 S10 이 허용한 경량판). 코드 도메인 변수·`IN 카테고리` 셀은 넣지 않았다.
- **B3 — S7 에 확정 대기 목록 계산 상태 단언 추가**: 설계 S7 은 view·ruleMng 만 본다. 그러나 I19 는 ruleConfirm search 의 상태 표시도 대상으로 삼는다. 기존 픽스처로는 저장값과 계산 상태가 같아 search 변이가 잡히지 않으므로, 미래 확정 룰에 v2 DRAFT 를 더해 시계 이동 전후의 `ruleStatus`(CREATED→INUSE)를 단언했다.
- **B3 — BPMN 을 텍스트 복제로 작성**: §6.6 은 `bpmn-skill`(bpmn-tool)·`oasis-project-support` 규칙을 따르라고 했지만, 이 PC 에 `bpmn-tool` 이 PATH 에 없어 06-05 `dmc/codeConfirm.bpmn` 을 텍스트 치환으로 복제했다. 구조(분기 4개·serviceTask·DI 좌표)는 바꾸지 않았고 process id·bean·dto 패키지·문서 문구만 바꿨다. `RuleConfirmBpmnActionTest` 5건과 HT1(네 분기를 실제로 탄다), 변이 I32 두 건이 계약을 고정한다.
- **B3 — 메뉴 시드 로그 한 줄**: `seedMdmRuleConfirmMenu()` 끝에 08-02·08-06 시드와 같은 모양의 `log.info` 한 줄을 두었다(06-05 `seedMdmCodeConfirmMenu` 에는 없다). 메뉴 값은 §6.9 그대로다(OBJECT `ruleConfirm`, MENU_SEQ 003, FULL_SEQ 5050300, "버전 확정", 폴더 dme, SYSADMIN PERM_ALL, `seedMdmObjectRbac("ruleConfirm","dme")`). 호출 위치는 `seedMdmRuleMenus();` 바로 다음 줄이다.
- **B4** — `checks.ts` 에 설계에 없던 순수 함수 `contractState(firstVersion, items, contractWarnings)` 를 두었다. 계약 영역(§6.8-4)의 다섯 상태(FIRST·NOT_CHECKED·BLOCKED·CHANGED·NONE)를 한 곳에서 정해 I41 을 순수 테스트로 덮기 위해서다. 검사 전(NOT_CHECKED)에는 "변경 없음" 으로 단정하지 않고 "검사를 하면 … 보입니다" 를 보인다(설계는 검사 전 문구를 정하지 않았다).
- **B4** — `splitWarnings(items, contractWarnings = [])` 는 항목의 WARNING 을 code 로 나누고, validate 의 `contractWarnings` 도 계약 변경으로 받되 같은 경고(code·message·itemKey)는 한 번만 담는다. 서버가 CONTRACT_CHANGED 를 SAVE_CHECKS 이슈와 `contractWarnings` 양쪽에 싣기 때문에 대화상자 중복을 막고, 한쪽만 실려도 계약 확인란이 빠지지 않게 하려는 것이다.
- **B4** — 설계에 없던 testid 를 더했다: `rc-modal-cancel`(대화상자 취소), `rc-modal-contract`·`rc-modal-warnings`(대화상자 목록), `rc-diff-show-same`(같은 행 보기 토글), `rc-closed-previous`(확정 뒤 "직전 버전 n 의 적용을 닫았습니다", E2E T6 의 `closedPreviousVer` 표시용). `rc-contract` 에는 `data-state` 속성을 단다.
- **B4** — `rc-previous` 문구는 `직전 RELEASED 버전 1 · 2026-01-01 00:00:00` 이다(설계 예시 `버전 1 · …` 앞에 codeConfirm 과 같은 "직전 RELEASED " 를 붙였다. 설계 예시 문자열을 부분으로 포함한다).
- **B4** — `RuleVersionCard.tsx` 의 확정 이동 활성 조건에 소유자 조건을 넣지 않았다(I40 그대로). 비소유 DRAFT 도 확정 화면으로 넘어가고, 확정 화면·서버가 소유자를 판정한다. 이것을 RE1 추가 케이스("소유자가 아닌 DRAFT 도 확정 이동은 활성")로 고정했다.
- **B4** — 기능설계서 목차는 ruleEdit 의 1~11 번호를 따르되 제목을 화면에 맞게 바꿨다(3 "편집(확정) 가능 여부", 4 "상단 바 (A-LIST)", 5 "영역").
