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

## B5 — 연결 E2E·픽스처·스크린샷

- 새 파일: `src/frontend/e2e/mdm-ruleConfirm.spec.ts`(7 테스트, T3·T4 는 한 테스트로 이어 돈다), `src/frontend/e2e/fixtures/mdm-ruleConfirm-data.sql`, `docs/mdm/tasks/TSK-08-05/screens/dme-ruleConfirm-{open,list,rejected,confirmed,contract,error,readonly}.png`. 소스(BE·FE)는 고치지 않았다.
- 서버(be-run.sh·fe-run.sh 미사용): `heavy.sh pnpm build:libs`(exit 0) → `heavy.sh acquire e2e-TSK-08-05`(HEAVY_ACQUIRED e2e-1) → `free-port.sh` 로 받은 mcm BE 51682·mdm BE 51683·포털 51684 → 새 `src/backend/data/{mcm,mdm}.db`(이 워크트리에는 data 폴더가 없어 새로 만들었다. mcm 로그의 JDBC URL 이 이 워크트리 경로임을 확인) → mcm·mdm `:api:bootRun --no-daemon`, 포털 `next dev --turbopack`(08-06 절차와 같은 환경변수, 포트만 바꿈).
- 시드 대조: `sqlite3 mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - …expected.txt` 출력 없음. 이어 `mdm-rbac-users.sql`(mcm.db), `mdm-ruleConfirm-data.sql`(mdm.db, `sqlite3 -bail`, 두 번 연속 넣어도 exit 0).
- 메뉴 시드(I33) 원장 확인(새 mcm.db): `TB_MCM_SEC_MENU` = `ruleConfirm|버전 확정|dme`(MENU_SEQ·FULL_SEQ 는 `recomputeMenuFullSeq` 가 다시 계산해 `00000003`·`3050120` — 시드 대조 SQL 이 FULL_SEQ 를 대조하지 않는 까닭과 같다), `TB_MCM_SEC_ROLE_MAPPING` = `MDM_STD_ADMIN|PERM_MDM_READ`·`MDM_STEWARD|PERM_MDM_CONFIRM`·`SYSADMIN|PERM_ALL`. §6.9 와 같다.
- 스펙을 쓰기 전에 픽스처를 넣은 mdm BE 에 `ruleConfirm/validate` 를 직접 불러(헤더 인증, `RuleConfirmOasisHttpTest` 와 같은 모양) 기대 상태를 확인했다.
  - `E2E_RC_OK`(2026-01-01): SAVE_CHECKS WARNED(`NULL_GAP` VAR:1) · NOT_EMPTY·TEST_CASES·RESULT_VAR_RELEASED PASSED · 적용 순서 EXEMPT · 케이스 1/1 통과 · futureApplyFrom false.
  - `E2E_RC_CASEFAIL`(2026-10-01): SAVE_CHECKS WARNED · TEST_CASES REJECTED(`CASE_FAILED` CASE:1) · EXEMPT.
  - `E2E_RC_CONTRACT` v2(2030-01-01): SAVE_CHECKS WARNED(`NULL_GAP` VAR:1·VAR:4, `CONTRACT_CHANGED`) · 적용 순서 PASSED · `contractWarnings` = [CONTRACT_CHANGED] · futureApplyFrom true · view diffCounts 수정 2(나머지 0) · previous v1 2026-01-01.
  - `E2E_RC_RACE`(2026-02-01): SAVE_CHECKS WARNED(`NULL_GAP`) · 나머지 PASSED · EXEMPT. 경고가 있으므로 T7 의 선행 확정 요청은 `warningsAcknowledged: true` 를 보낸다(false 면 MDM014 로 경합이 만들어지지 않는다).
- 첫 실행: 4 통과 · T6 1 실패 · 2 미실행(serial) — 계약 영역은 이슈 code 가 아니라 message 를 보이므로 `CONTRACT_CHANGED` 대신 `[COIL_WID]` 를 단언하도록 고쳤다(화면 문구 확인, 기대값 완화 아님: 같은 영역의 `data-state="CHANGED"` 단언은 그대로).
- 스모크 넷 대응: 1 메뉴 이동 T1, 2 목록·빈 상태 T2, 3 화면 조작만으로 확정·목록 반영 T5(T6), 4 서버 오류 표시 T7.
- 최종 실행(변이를 모두 되돌린 원본, 새 mcm.db + 픽스처 재투입): `cd src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:51684 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 ../../.claude/skills/dflow-dev/scripts/heavy.sh pnpm exec playwright test e2e/mdm-ruleConfirm.spec.ts e2e/mdm-shell-rbac-smoke.spec.ts --workers=1` — exit 0, **11 passed**(ruleConfirm 7 · shell-rbac 4), failed·skipped 0. 새 메뉴 leaf 가 기존 MDM 셸·RBAC 스모크를 깨지 않는다.
- 정리: 기록한 PID(포털·mdm·mcm)를 죽이고 세 포트에 남은 리스너가 0 인 것을 확인한 뒤 `heavy.sh release`(HEAVY_RELEASED e2e-1). shell-rbac 스모크가 덮어쓴 `docs/mdm/tasks/TSK-01-03/screens/` 두 장과 `m-mcm/next-env.d.ts`, 첫 실패 때 바뀐 `src/frontend/test-results/` 는 `git checkout --` 로 되돌렸다. 격리 DB(`src/backend/data/*.db`, 무시 대상)는 커밋하지 않는다.
- 연결 테스트: E2E 가 화면 → 포털 BFF → mdm OASIS(`ruleConfirm` search·view·validate·confirm, `ruleEdit` view) → 원장 → mcm 메뉴·RBAC 시드를 한 번에 지난다. 서버 쪽 연결(BPMN↔서비스)은 B3 `RuleConfirmOasisHttpTest` 가 맡는다.
- 전체 게이트(기준선 5줄)는 돌리지 않았다 — phase-build.md 「완료와 커밋」(Build 서브에이전트는 전체 스위트를 돌리지 않고 오케스트레이터의 Build 게이트가 본다). B5 는 BE·FE 소스를 바꾸지 않아 관련 단위 테스트 대상도 없다.

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
| I33·I42 | `seedMdmRuleConfirmMenu` 의 메뉴 부모 폴더 `dme` → `dmc`(새 mcm.db 로 재기동) | `mdm-ruleConfirm.spec.ts` T1(업무기준 아래 "버전 확정" 없음 — 로그인 뒤 메뉴 단계에서 첫 실패) | 잡힘 |
| I33 | `seedMdmObjectRbac("ruleConfirm","dme")` 호출을 뺌(새 mcm.db 로 재기동) | `mdm-ruleConfirm.spec.ts` T1(담당자에게 메뉴가 안 보임 — 메뉴 단계에서 첫 실패) | 잡힘 |
| I43 | 확정 성공 뒤 `refreshList(keyword)` 를 부르지 않음(m-mdm 재빌드·포털 재기동) | `mdm-ruleConfirm.spec.ts` T5(확정한 행이 목록에 남음, 첫 실패) | 잡힘 |
| I44 | 대화상자 확인 활성에서 계약 변경 확인란 조건을 늘 참으로 | `mdm-ruleConfirm.spec.ts` T6(일반 경고만 체크했는데 확인 활성, 첫 실패) | 잡힘 |
| I45 | 검사 버튼 비활성에서 `validate` 권한 조건을 뺌 | `mdm-ruleConfirm.spec.ts` T8(표준 관리자에게 검사 활성, 첫 실패) | 잡힘 |

- 첫 I14 변이(`rule.setStatus("DEPRECATED")`)는 잡히지 않았다. `MdmRule.STATUS` 가 `updatable = false` 라 엔티티 변경이 원장에 닿지 않는, 효과 없는 변이였기 때문이다. 쓰기가 실제로 flush 되는 칸(`MARU_RULE_NAME`)으로 바꿔 다시 돌렸고 잡혔다.

- B5 변이는 스크립트 하나(`heavy.sh --detach` 한 번, 변이마다 백업 사본 `dflow-bak/B5/` → 변이 → 필요한 서버만 재기동(화면 변이는 `pnpm --filter @dk-oasis/m-mdm build` 뒤 포털, 메뉴 변이는 새 mcm.db 로 mcm) → 픽스처 재투입 → **스펙 전체** → `cp` 되돌림)로 돌렸다. serial 모드라 첫 실패 뒤는 돌지 않으므로, 첫 실패가 대상 테스트인지로 판정했다. 첫 시도의 메뉴 변이 두 건은 무효였다 — 재기동 대기 함수가 새 로그가 만들어지기 전의 옛 로그에서 "Started" 를 읽었고, `DataInitializer` 는 `ApplicationRunner` 라 "Started" 뒤에 시드를 넣어 사용자 픽스처가 먼저 들어가 실패했다(로그인 단계 실패). 옛 로그를 지우고 "초기 데이터 삽입 완료" 로그를 기다리도록 고쳐 두 건만 다시 돌렸고, 로그인 뒤 메뉴 단계에서 실패하는 것을 확인했다. 끝난 뒤 백업 폴더에 남은 파일 0, `git status` 에 소스 변경 없음을 확인했다. 되돌린 뒤 새 mcm.db 의 메뉴·역할 매핑이 원래 값(위 B5 절)인 것도 확인했다. I33 의 "안 잡힘(보고)" 행(B3)은 이 두 행으로 덮였다.

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
- **B5** — 픽스처를 **다시 넣을 수 있게** 만들었다. 맨 앞에서 `E2E_RC_*` 룰의 케이스·행·변수·시스템·버전·헤더를 지우고 다시 넣으며, 사전 도메인·컬럼은 같은 물리명이 이미 있으면 건너뛴다(`NOT EXISTS`). 설계 §3.4 는 "같은 mdm.db 로 다시 돌릴 수 없다" 고 했지만, e2e.md 「서버 프로세스」 가 서버 재기동 대신 픽스처 재투입을 권하고 변이 검증에서 스펙을 여러 번 돌려야 해서 바꿨다. 다른 픽스처(`mdm-ruleEdit-data.sql` 등)와 같은 mdm.db 에 넣어도 룰 ID 가 겹치지 않는다.
- **B5** — T6 의 apply_from 을 설계의 `2026-10-01 00:00:00` 대신 `2030-01-01 00:00:00` 으로 했다. 오늘(2026-09-26) 기준 2026-10-01 은 며칠 뒤 과거가 되어 미래 적용 경고(`rc-future-warning`, 서버 `futureApplyFrom`) 단언이 실행 날짜에 따라 깨진다. 먼 미래 일시로 그 단언을 날짜와 무관하게 두었다. T4(2026-10-01)는 최초 버전이라 적용 순서가 면제이므로 날짜에 기대는 단언이 없어 그대로 두었다.
- **B5** — T3·T4 를 테스트 하나로 이었다(설계 "(T3 에 이어)"). 확정 이동으로 열린 탭에서 그대로 검사한다.
- **B5** — T7 의 선행 확정 요청은 `warningsAcknowledged: true`, `ver` 정수로 보낸다(06-05 선례는 false·문자열). 픽스처에 빈틈 경고가 있어 false 면 MDM014 로 선행 확정이 실패한다.
- **B5** — 메뉴 항목은 보이는 것만 고른다(`.item-name:visible`). "버전 확정" leaf 가 마스터코드(codeConfirm) 아래에도 있기 때문이다.
- **B5** — `dme-ruleConfirm-contract.png` 는 검사 직후(확정 버튼이 켜지기 전 순간)에 찍혀 확정 버튼이 옅게 보인다. 바로 다음 단언이 확정 버튼 활성을 기다려 통과하므로 동작 문제는 아니다.

## 남은 확인(B5 보고)

- `src/frontend/e2e/mdm-codeConfirm.spec.ts` 는 "버전 확정" 메뉴를 `:visible` 없이 `.first()` 로 고른다. 이 Task 로 같은 이름의 leaf 가 업무기준 아래에도 생겼다. 트리 순서상 마스터코드가 먼저라 영향이 없을 가능성이 높지만 B5 는 돌리지 않았다 — Verify 가 이 스펙을 함께 돌려 회귀가 없는지 확인한다.

## 게이트 기록

| 시각 | Phase | 명령 | 범위 | 경과(초) | 부하 | 결과 |
|---|---|---|---|---|---|---|
| 2026-09-26T02:11:02Z | build | `cd src/backend && … ./gradlew testAll --no-daemon --console=plain` | 전체 | 57 | 2.76 | 통과(3959건, 신규 0) |
| 2026-09-26T02:11:49Z | build | `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` | 전체 | 41 | 3.93 | 통과(1064건, 신규 0) |
| 2026-09-26T02:11:49Z | build | `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint` | 전체 | 0 | 3.93 | 통과(exit 0) |
| 2026-09-26T02:11:52Z | build | `cd src/frontend && pnpm test:unit:shared` | 전체 | 3 | 3.93 | 통과(168건, 신규 0) |
| 2026-09-26T02:11:53Z | build | `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` | 전체 | 1 | 3.93 | 통과(ERROR 0) |
| 2026-09-26T03:05:00Z | verify | (Build 게이트 5줄 재사용 — bf4553c4 이후 Task 문서만 바뀜) | 재사용 | 0 | - | 통과 |

## Verify 결과(오케스트레이터 기록)

- 변이 검증 표 재확인: 백엔드 54행·프런트 17행을 다시 넣어 모두 잡힘(I15 는 grep 코드 리뷰). E2E 변이 5건(I33 둘·I43·I44·I45) 잡힘.
- E2E: `mdm-ruleConfirm.spec.ts` 7/7 통과, 회귀 확인 `mdm-codeConfirm.spec.ts` 6/6 통과(같은 이름 "버전 확정" 메뉴 영향 없음).
- 도커 금지로 생략: `cd src/backend/mdm && ../gradlew :api:mssqlMigrationTest`(머지 뒤 dialect_check 몫).
