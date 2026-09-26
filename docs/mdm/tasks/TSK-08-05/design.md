# TSK-08-05 설계 — 룰 버전 확정(확정 검사·적용시점·diff)

> 기점 9458368(`agent/6874fe36-rule-confirm`). 원천: `docs/mdm/design/basic/06-business-rule.md`(이하 06) 「입력 계약」의 계약 변경 경고 232행, 「저장 시 검사」 321-351행, 「상신 시 검사」 1124-1135행, 「정의 표를 옮기는 동작」 1141-1155행, 「버전 비교」 1253-1277행. 결정 근거: `docs/mdm/adr/0002-version-confirm-without-approval.md`(ADR-0002) D4·D5·D6. 선례: TSK-06-05 design.md(마루 코드 버전 확정). 인계 출처: TSK-08-01 design.md §6.5·§638행, TSK-08-02 design.md 542행, TSK-08-04 design.md §6.1.
> 에이전트 프롬프트(`item.agent_prompt`)는 받지 못했다. spec.md 의 문장은 요구사항 데이터로만 읽었다.
>
> **그룹 코드는 `dme` 다(D1).** spec 의 `mdr/ruleConfirm` 은 wbs.md 1435행(`dme/ruleConfirm`)·`docs/mdm/screens/README.md` 55행·식별자 사전 135행과 어긋나는 오탈자다. 이하 모든 경로·componentPath·메뉴·serviceId 는 `dme/ruleConfirm`·`ruleConfirm` 이다.

## 1. 접근 방식

확정 트랜잭션(담당자 역할 → DRAFT 로드 → 소유자 → row_version → DRAFT → 미적용 하나 → apply_from 순서 → 확정 검사 SPI → 조건부 UPDATE → 직전 RELEASED 닫기 → 부모 CREATED→INUSE)은 TSK-01-03 의 `DefaultVersionStateService.confirm` 이 이미 한 트랜잭션으로 구현했다. 빠진 것은 셋이다. 첫째, BUSINESS_RULE 확정 검사 SPI 의 운영 구현이 없어 `VersionSpiRegistry` 가 룰 확정을 `IllegalStateException` 으로 막는다(fail-closed). 둘째, 확정 화면(`dme/ruleConfirm`)과 OASIS 서비스가 없다. 셋째, 룰 쪽에는 "조회는 계산 상태, 쓰기 경로에서는 저장 상태를 올린다"(ADR-0002 D6)가 없어서, 미래 apply_from 으로 확정한 룰은 저장 상태가 CREATED 로 남고 폐기도 할 수 없다. 그래서 이 Task 는 공통 서비스를 고치지 않고 다음 넷을 만든다. **(a)** row_id diff·검사 보고서 조립을 Spring·DB 없는 순수 클래스로 만든다. **(b)** 원장을 읽어 그 순수 클래스에 먹이는 검사 컴포넌트(`RuleConfirmChecks`)와, 그 컴포넌트에 위임만 하는 얇은 SPI 어댑터(`RuleConfirmCheck`)를 둔다. 검사 로직을 SPI 와 떼는 까닭은 `VersionScenarioTestConfig` 의 후처리기가 `VersionConfirmCheckSpi` 빈 정의를 모두 지우기 때문이다. 화면 서비스가 SPI 빈에 기대면 시나리오 테스트 컨텍스트가 기동하지 못한다. **(c)** 룰의 계산 상태(`RuleVersions.effectiveStatus`)를 룰 조회 화면 셋과 쓰기 경로 셋에 적용한다. **(d)** 화면용 OASIS 서비스 `ruleConfirm`(search·view·validate·confirm)을 만들고, 확정은 `VersionStateService.confirm` 에만 위임한다. 검사 규칙은 새로 쓰지 않는다. 저장 시 검사는 TSK-08-04 의 `RuleSaveValidator.validate(…, STORED)` 를, 테스트 케이스 판정은 값 테스트와 같은 판정 코드(08-04 `RuleValueTestService` 에서 공용 클래스로 옮긴 `RuleCaseJudge`)를, apply_from 순서는 01-03 `ApplyFromOrderCheck` 를 그대로 부른다. 화면은 06-05 `dmc/codeConfirm` 선례(목록 + 확정 폼 + 검사 표 + diff + 확정 대화상자)를 룰 모양으로 복제한다.

## 2. 변경 파일 목록

약어: `$LM` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`, `$LT` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm`, `$AM` = `src/backend/mdm/api/src/main`, `$AT` = `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm`, `$MDM` = `src/frontend/m-mdm`, `$DI` = `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java`.

### 생성

| 파일 | 내용 | 단위 |
|---|---|---|
| `$LM/common/rule/RuleCaseJudge.java` | 순수(final, static). `RuleValueTestService` 에서 **옮긴** 케이스 판정 — `runCase`·`compare`·`hitValue`·`sameValue`·`sameHit`·`decimal`·`mismatch`·`results`·`value`·`object`·`evaluate`·`error` 가운데 케이스 판정에 필요한 것(§6.4). 동작을 바꾸지 않는다 | B1 |
| `$LM/common/rule/confirm/RuleVersionDiffs.java` | 순수. 두 버전 행 목록 → `List<VersionDiffEntry>`(§6.2) | B1 |
| `$LM/common/rule/confirm/RuleConfirmReport.java` | 순수. 항목 4행 보고서 record·조립·`flatten`·itemKey 만들기·결과 변수 참조 판정(§6.3) | B1 |
| `$LM/common/rule/confirm/RuleConfirmQueries.java` | `@Component`, JPQL 전용(네이티브 SQL 없음). ① 다른 룰의 RESULT 변수 가운데 이름(`VAR_NAME`·`RES_GRP`)이 주어진 집합에 드는 것 → (룰 ID, 이름) ② 확정 대기 목록(MDM 원천 룰의 DRAFT 버전) | B1 |
| `$LM/common/rule/confirm/RuleConfirmChecks.java` | `@Component`(SPI 아님). 원장을 읽어 `report(VersionRef)`·`diff(VersionRef)`·`previousReleased(ruleId, ver)` 를 만든다(§6.1). 쓰기 없음 | B1 |
| `$LM/common/rule/confirm/RuleConfirmCheck.java` | `@Component implements VersionConfirmCheckSpi`, target BUSINESS_RULE. `diff`·`check` 를 `RuleConfirmChecks` 에 위임만 한다 | B1 |
| `$LT/common/rule/confirm/RuleVersionDiffsTest.java` | 순수 단위(§3.1) | B1 |
| `$LT/common/rule/confirm/RuleConfirmReportTest.java` | 순수 단위(§3.1) | B1 |
| `$AT/common/rule/confirm/RuleConfirmCheckSqliteTest.java` | 검사 컴포넌트·SPI 어댑터 + SQLite 원장(§3.2) | B1 |
| `$LT/common/rule/RuleVersionsEffectiveStatusTest.java` | 순수 단위 — 계산 상태(§3.1) | B2 |
| `$AT/dme/ruleEdit/RuleEffectiveStatusTest.java` | 계산 상태의 조회·필터·쓰기 경로(§3.2) | B2 |
| `$LM/dme/ruleConfirm/dto/*.java` | 요청 DTO 4종(`RuleConfirmSearchRequest`·`RuleConfirmViewRequest`·`RuleConfirmValidateRequest`·`RuleConfirmRequest`)과 응답 DTO(§6.5 모양). 파일 수는 Build 판단(ruleEdit dto 관례: 게터·세터 POJO) | B3 |
| `$LM/dme/ruleConfirm/service/RuleConfirmService.java` | `@Service("ruleConfirmService")`, `@Transactional` 금지. 메서드 `search`·`view`·`validate`·`confirm`(§6.5) | B3 |
| `$AM/resources/services/dme/ruleConfirm.bpmn` | process id `ruleConfirm`, `actionGateway` 분기 4개(§6.6) | B3 |
| `$AT/dme/ruleConfirm/RuleConfirmServiceTest.java` | 서비스 계층(§3.2) | B3 |
| `$AT/dme/ruleConfirm/RuleConfirmOasisHttpTest.java` | BPMN 경유 HTTP 종단(§3.2) | B3 |
| `$AT/dme/ruleConfirm/RuleConfirmBpmnActionTest.java` | 액션↔메서드·권한 세트 표(§3.2) | B3 |
| `$MDM/pages/dme/ruleConfirm/page.tsx` | 화면(§6.8) | B4 |
| `$MDM/pages/dme/ruleConfirm/api.ts` | OASIS 호출(`dmc/codeConfirm/api.ts` 의 로컬 `unwrap`·`callOasis` 복제. 공유 파일을 바꾸지 않는다) | B4 |
| `$MDM/pages/dme/ruleConfirm/types.ts` | 응답 타입 | B4 |
| `$MDM/pages/dme/ruleConfirm/checks.ts` | 순수 — 상태 라벨·확정 버튼 활성 판정·apply_from 변환·경고 분리(§6.8) | B4 |
| `$MDM/pages/dme/ruleConfirm/ConfirmModal.tsx` | 확정 대화상자(일반 경고 확인·계약 변경 확인·미래 apply_from 경고) | B4 |
| `$MDM/tests/dme/ruleConfirm/checks.test.ts` | 순수 함수 vitest | B4 |
| `$MDM/tests/dme/ruleConfirm/rule-confirm-page.test.ts` | 화면 렌더·fetch mock vitest(happy-dom, `code-confirm-page.test.ts` 관례) | B4 |
| `docs/mdm/screens/ruleConfirm/ruleConfirm_기능설계서.md` | 화면 기능설계서(`ruleEdit_기능설계서.md` 목차 1~11 그대로) | B4 |
| `src/frontend/e2e/mdm-ruleConfirm.spec.ts` | 스모크 넷 + 수용 기준(§3.4) | B5 |
| `src/frontend/e2e/fixtures/mdm-ruleConfirm-data.sql` | E2E 원장 픽스처(§3.4) | B5 |
| `docs/mdm/tasks/TSK-08-05/screens/*.png` | E2E 스크린샷 | B5 |
| `docs/mdm/tasks/TSK-08-05/build-log.md` | 구현 중 기록(변이 검증·설계 이탈·인계). Build 가 만든다 | B1~B5 |

### 수정

| 파일 | 변경 | 단위 |
|---|---|---|
| `$LM/dme/ruleEdit/service/RuleValueTestService.java` | 케이스 판정 private 메서드를 `RuleCaseJudge` 로 옮기고 호출만 남긴다. `run()` 의 입력·출력·예외는 바꾸지 않는다(I9) | B1 |
| `$LM/common/rule/check/ledger/ContractChangeCheck.java` | `targets()` 에 `RuleSaveTarget.STORED` 를 더한다(D5). Javadoc 에 "상신·확정(08-05)에서도 돈다, 06:232" 한 줄 | B1 |
| `$AT/MdmBusinessRuleMigrationTest.java` | 520-521행의 "BUSINESS_RULE 확정 검사 SPI 빈 0개" 단언 **한 줄만** 지우고 메서드 Javadoc 의 해제 기록을 고친다. `DefinitionLookup` 줄은 그대로 둔다. 근거: TSK-08-01 design.md 638행과 이 메서드 Javadoc 의 해제 조건("08-05 가 확정 검사를 넣을 때 해당 줄을 지운다"). 기대값 완화가 아니라 예정된 가드 해제다. "정확히 하나이고 그 클래스가 `RuleConfirmCheck`" 라는 긍정 단언은 `RuleConfirmOasisHttpTest` HT3 이 맡는다 | B1 |
| `$LM/common/rule/RuleVersions.java` | `effectiveStatus(String storedStatus, Collection<MdmRuleVer> versions, LocalDateTime now)` 추가(§6.7) | B2 |
| `$LM/common/rule/RuleQueries.java` | `where(RuleFilter)` 의 상태 조건을 계산 상태 기준으로 바꾼다(§6.7). `RuleFilter` 에 기준 시각이 필요하면 칸을 더한다 | B2 |
| `$LM/dme/ruleMng/service/RuleMngService.java` | 목록 행 `status` 를 계산 상태로 싣는다 | B2 |
| `$LM/dme/ruleEdit/service/RuleViewService.java` | `RuleInfo.status` 를 계산 상태로 싣는다. 87행 `setConfirmScreenReady(false)` → `true` | B2 |
| `$LM/dme/ruleEdit/service/RuleHeaderService.java` | 폐기 조건을 계산 상태 INUSE 로 바꾸고, 헤더 저장·폐기 트랜잭션 안에서 저장 CREATED 를 INUSE 로 올린다(§6.7) | B2 |
| `$LM/dme/ruleEdit/service/RuleVersionService.java` | 새 버전 트랜잭션 안에서 저장 CREATED 를 INUSE 로 올린다(§6.7) | B2 |
| `$DI` | `seedMdmRuleConfirmMenu()` 추가(§6.9)와 `seedMdmMenus()` 의 호출 한 줄(`seedMdmRuleMenus();` 다음). 08-02·08-06 의 메뉴 배열은 바꾸지 않는다 | B3 |
| `$MDM/pages/dme/ruleEdit/cards/RuleVersionCard.tsx` | "확정 이동" 버튼에 `onClick` 을 달고 활성 조건을 바꾼다(§6.8.1) | B4 |
| `$MDM/tests/dme/ruleEdit/rule-edit-page.test.ts` | `confirmScreenReady: true` 인 새 케이스를 **더한다**. 기존 "확정 이동은 확정 화면이 없어 비활성이다" 케이스와 `fixtures.ts`(false)는 그대로 둔다 | B4 |
| `$MDM/tsup.config.ts` | `"pages/dme/ruleConfirm/page": "pages/dme/ruleConfirm/page.tsx"` 한 줄(`ruleEdit` 줄 다음) | B4 |
| `src/frontend/m-mcm/lib/generated/page-registry.ts` | 손으로 고치지 않는다. `cd src/frontend/m-mcm && node scripts/generate-page-registry.mjs` 로 다시 만들어 `"dme/ruleConfirm"` 줄이 생긴 결과를 커밋한다 | B4 |
| `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` | 화면 표에 `ruleConfirm` 행 하나(242행 `ruleEdit` 행과 같은 모양, TSK-08-05, 기능설계서 1종) | B4 |
| `docs/mdm/screens/ruleEdit/ruleEdit_기능설계서.md` | 252행 "확정 화면(`ruleConfirm`, TSK-08-05) — 아직 없음 — 확정 이동 버튼 비활성" 을 연결된 동작으로 고친다 | B4 |

**수정하지 않는 것**: `DefaultVersionStateService`·`VersionRowStore`·`VersionSpiRegistry`·`ApplyFromOrderCheck`(공통 서비스), `contract/**`(08-01 이 선언을 끝냈다. 새 계약 타입을 만들지 않는다), `BusinessRuleConfirmCheckStub`·`ContractStubCompileTest`(스텁은 test 에 그대로 둔다), `VersionScenarioTestConfig`·`VersionScenarioFakes`(후처리기가 운영 SPI 를 지워 시나리오 테스트를 지킨다), `RuleSaveValidator`·그 밖의 `RuleSaveCheck` 빈(`ContractChangeCheck` 의 `targets()` 한 줄만 예외), `ExprTypeByCaseCheck`(D5), `MdmErrorCode`(새 코드를 만들지 않는다, D10), `MdmActions`·`MdmPermissions`, `DmeBpmnActionTest`·`MdmOasisActionVocabularyTest`(§ 함정 4), Flyway 마이그레이션(스키마 변경 없음), `docs/mdm/decisions.md`(공용 결정 기록을 만들지 않는다. 필요해지면 임시 ID `D-TSK-08-05-<n>` 만 쓴다).

## 구현 단위

| 단위 | 묶음 | 범위(파일·기능) | 새 테스트 | 담당 불변 규칙 |
|---|---|---|---|---|
| B1 | 1 | `$LM/common/rule/RuleCaseJudge.java`, `$LM/common/rule/confirm/**`, `$LM/dme/ruleEdit/service/RuleValueTestService.java`, `$LM/common/rule/check/ledger/ContractChangeCheck.java`, `$LT/common/rule/confirm/**`, `$AT/common/rule/confirm/**`, `$AT/MdmBusinessRuleMigrationTest.java` | `RuleVersionDiffsTest`·`RuleConfirmReportTest`(lib), `RuleConfirmCheckSqliteTest`(api) | I1~I17 |
| B2 | 2 | `$LM/common/rule/RuleVersions.java`, `$LM/common/rule/RuleQueries.java`, `$LM/dme/ruleMng/service/RuleMngService.java`, `$LM/dme/ruleEdit/service/RuleViewService.java`·`RuleHeaderService.java`·`RuleVersionService.java`, `$LT/common/rule/RuleVersionsEffectiveStatusTest.java`, `$AT/dme/ruleEdit/RuleEffectiveStatusTest.java` | `RuleVersionsEffectiveStatusTest`, `RuleEffectiveStatusTest` | I18~I21 |
| B3 | 3 | `$LM/dme/ruleConfirm/**`, `$AM/resources/services/dme/ruleConfirm.bpmn`, `$DI`, `$AT/dme/ruleConfirm/**` + oasis-contract-check | `RuleConfirmServiceTest`·`RuleConfirmOasisHttpTest`·`RuleConfirmBpmnActionTest` | I22~I33 |
| B4 | 3 | `$MDM/pages/dme/ruleConfirm/**`, `$MDM/tests/dme/ruleConfirm/**`, `$MDM/pages/dme/ruleEdit/cards/RuleVersionCard.tsx`, `$MDM/tests/dme/ruleEdit/rule-edit-page.test.ts`, `$MDM/tsup.config.ts`, `src/frontend/m-mcm/lib/generated/page-registry.ts`, `docs/mdm/screens/ruleConfirm/**`, `docs/mdm/screens/ruleEdit/ruleEdit_기능설계서.md`, `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` | `checks.test.ts`·`rule-confirm-page.test.ts`, `rule-edit-page.test.ts` 추가 케이스 | I34~I41 |
| B5 | 4 | `src/frontend/e2e/mdm-ruleConfirm.spec.ts`, `src/frontend/e2e/fixtures/mdm-ruleConfirm-data.sql`, `docs/mdm/tasks/TSK-08-05/screens/**`, 전 단위 통합 확인(기준선 5줄 게이트) | `mdm-ruleConfirm.spec.ts`(T1~T8) | I42~I45 |

모든 단위가 서로 다른 묶음이다(순차). B1·B2 는 같은 Gradle 모듈(mdm lib)을 고치고, B3 는 mcm `DataInitializer`(공용 시드 파일)를, B4 는 ruleEdit 화면과 공용 생성 파일(page-registry)을 고치므로 묶음 조건을 확신할 수 없다. B1 은 B3 가(검사 컴포넌트), B2 는 B3 가(계산 상태), B3 는 B4 가(응답 모양), B4 는 B5 가 기댄다. 단위끼리 같은 파일을 고치지 않는다. **메뉴 시드(B3)와 page-registry(B4)가 둘 다 들어가기 전에는 `mdm-sample-smoke.spec.ts` 류 E2E 가 깨질 수 있다**(함정 7). 두 단위는 같은 Task 브랜치로 함께 머지되므로 문제가 없지만, B3 만 끝난 트리에서 E2E 를 돌리지 않는다. B4 가 도구 호출 80회를 넘을 것 같으면 기능설계서·식별자 사전·ruleEdit 기능설계서 수정을 B5 로 옮기고 build-log.md 에 적는다.

**B1 의 첫 단계는 순수 이동이다.** `RuleCaseJudge` 로 옮기기만 하고 `RuleValueTestServiceTest` 가 수정 없이 초록인 것을 확인해 build-log.md 에 적은 뒤에 확정 검사 코드를 얹는다(I9).

## 3. 테스트 전략

모든 백엔드 시험은 SQLite·순수 단위다. 기존 `testAll` 명령 줄이 새 시험을 모두 포함한다(lib test·api test sourceSet). MSSQL·Testcontainers 시험은 만들지 않는다(§ 도커 금지로 생략한 검증). **api Spring 시험은 `AbstractMdmSharedDbTest` 를 상속하고 `@Import(DmeTestSupport.Config.class)` 를 쓴다**(시계 `DmeTestSupport.NOW` = 2026-06-15 09:00:00 KST, `MutableCurrentUser`·`MutableClock`). 데이터는 `DmeTestSupport` 도우미(`rule`·`released`·`pending`·`var`·`row`·`sampleRule`·`sampleDefinition`)와 `JdbcTemplate` 직접 INSERT 로 만든다.

**ruleConfirm·검사 시험은 `VersionScenarioTestConfig` 를 import 하지 않는다.** 그 설정의 후처리기가 운영 SPI 를 지우고 가짜로 바꾸므로, import 하면 확정 시험이 실제 검사 없이 초록이 된다. 그래서 `RuleConfirmCheckSqliteTest`·`RuleConfirmServiceTest` 는 각각 `VersionSpiRegistry.confirmCheck(VersionTarget.BUSINESS_RULE)` 가 `RuleConfirmCheck` 인스턴스인지 한 번 단언한다(I16).

### 3.1 lib 순수 단위(Spring·DB 없음)

- `common/rule/confirm/RuleVersionDiffsTest` — 행 목록을 손으로 만들어 넘긴다.
  - DF1 06 「버전 비교」 예시(06:1272-1277) 그대로: old = {12, 15, 16}, new = {12(같음), 15(`left` 1000 → 1500), 17}. 결과가 12 SAME, 15 CHANGED, 16 REMOVED, 17 ADDED 이다.
  - DF2 셀은 같고 seq 만 다르면 CHANGED 이고, 값 맵의 `SEQ` 가 이전·이후 값을 담는다.
  - DF3 최초 버전(base 없음): 모든 행이 ADDED 이고 `oldValues` 가 null 이다.
  - DF4 정규화: 셀 JSON 의 객체 키 순서만 다른 두 행은 SAME 이다. 배열(`list`, AST `params`) 순서가 다르면 CHANGED 다. 공백 차이는 SAME 이다.
  - DF5 값 맵 키 집합은 정확히 `MdmRuleDiffConventions.SEQ`·`CELLS` 둘이다. `SEQ` 값은 `Integer`, `CELLS` 값은 정규화 JSON 문자열이다. ADDED 는 `oldValues` null, REMOVED 는 `newValues` null, SAME·CHANGED 는 둘 다 있다.
  - DF6 정렬은 `COALESCE(new.seq, old.seq)` 오름차순, 같으면 row_id 오름차순이다. DEFAULT 행(seq 0)이 맨 앞에 온다. REMOVED 행은 old.seq 자리에 끼어든다.
  - DF7 `key` 는 row_id 의 10진 문자열(`"15"`)이다.
- `common/rule/confirm/RuleConfirmReportTest` — 저장 시 검사 이슈 맵·변수 수·행 수·케이스 결과·생산자 표를 손으로 만들어 넘긴다.
  - CR1 `report()` 는 4행이고 순서가 `MdmRuleConfirmCheckItem.values()` 와 같다.
  - CR2 항목 상태: ERROR 이슈가 하나라도 있으면 REJECTED, ERROR 없이 WARNING 이 있으면 WARNED, 둘 다 없으면 PASSED.
  - CR3 `flatten()`: errors = 모든 항목의 ERROR 이슈, warnings = 모든 항목의 WARNING 이슈(항목 순서, 항목 안에서는 원래 순서). SAVE_CHECKS 한 항목에 ERROR·WARNING 이 섞여 있어도 각각 제자리로 간다.
  - CR4 이슈 모양: `field` = 항목 `name()`, `code` = 세부 코드(§6.3 표), `itemKey` = §6.3 표 형식(`ROW:15,16;VAR:2`·`VAR:2`·`CASE:3`·`NAME:FOO`·null).
  - CR5 NOT_EMPTY: 변수 0개 → `NO_VARS` ERROR, 행 0개 → `NO_ROWS` ERROR(둘 다면 둘 다), DEFAULT 행 하나뿐이어도 행이 있는 것으로 센다.
  - CR6 TEST_CASES: `pass == null`(기대값 없음)은 보지 않는다. `pass == false` 는 `CASE_FAILED` ERROR(outcome ERROR 인 케이스 포함, message 에 mismatches 또는 판정 오류 요약). 케이스 0건이거나 기대값 있는 케이스가 모두 통과면 PASSED.
  - CR7 RESULT_VAR_RELEASED: 읽는 이름 가운데 컬럼 사전 이름·이 룰이 만드는 이름을 뺀 것마다, 그 이름을 만드는 다른 룰이 있고 그 가운데 RELEASED 가 있는 룰이 하나도 없으면 `PRODUCER_NOT_RELEASED` ERROR(message 에 생산 룰 ID 목록). 생산 룰이 없는 이름(프로그램 변수)은 보지 않는다. 생산 룰이 둘이고 하나만 RELEASED 면 PASSED.
- `common/rule/RuleVersionsEffectiveStatusTest`(B2)
  - ES1 저장 CREATED + `applyFrom <= now` 인 RELEASED 가 있음 → INUSE(경계 `applyFrom == now` 포함).
  - ES2 저장 CREATED + RELEASED 의 applyFrom 이 미래 → CREATED. RELEASED 없음 → CREATED.
  - ES3 저장 INUSE·DEPRECATED 는 그대로 돌려준다.

### 3.2 api SQLite(`$AT`)

- `common/rule/confirm/RuleConfirmCheckSqliteTest`(B1) — 검사 컴포넌트와 SPI 어댑터를 원장으로 시험한다. 기본 픽스처는 `DmeTestSupport.sampleRule`(QLTY_GRD_JDG)을 v1 RELEASED 로 두고 v2 DRAFT 를 `sampleDefinition` 으로 복사한 뒤 JDBC 로 고친다.
  - SP1 `diff(QLTY_GRD_JDG@2)`: 행 하나의 셀을 고치고 하나를 지우고 하나를 더하면 CHANGED·REMOVED·ADDED 가 그 row_id 로 나오고 나머지는 SAME 이다. `base` 는 `QLTY_GRD_JDG@1` 이다. v1 만 있는 최초 DRAFT 룰은 `base == null` 이다.
  - SP2 저장 시 검사 ERROR: v2 의 한 행 셀을 JDBC 로 깨진 값(경계 역순 등, 저장 경로라면 거부되었을 값)으로 바꾸면 SAVE_CHECKS REJECTED 이고 `check().errors` 에 그 세부 코드가 있다.
  - SP3 계약 변경: v2 에 필수 조건 변수를 하나 더하면(COND 변수 + 모든 NORMAL 행에 그 칸) `check().warnings` 에 `code == CONTRACT_CHANGED`·`field == SAVE_CHECKS` 가 있고 errors 는 비어 있다(I6).
  - SP4 테스트 케이스: 기대값이 틀린 케이스를 넣으면 TEST_CASES REJECTED. **같은 픽스처로 `RuleValueTestService.run(target=VERSION, ver=2, runCases=true)` 의 그 케이스 `pass` 가 false 이고, 기대값을 맞추면 두 경로가 모두 통과다**(판정 경로 동일, I8). 기대값 없는 케이스만 있으면 PASSED.
  - SP5 결과 변수 참조: 룰 B(DRAFT v1 만, RESULT `FOO_GRD`)와 룰 A(COND `FOO_GRD`, `DATA_TYPE` 선언, v1 DRAFT)를 JDBC 로 넣으면 A 의 RESULT_VAR_RELEASED 가 REJECTED 다. B 에 RELEASED 버전 행을 더하면 PASSED 다. 이름이 컬럼 사전에 있으면(`DmeTestSupport.column`) B 가 RELEASED 가 아니어도 PASSED 다(D7). `RES_GRP` 로 만드는 이름도 생산으로 센다.
  - SP6 비어 있음: 변수만 있고 행이 없는 DRAFT → NOT_EMPTY REJECTED.
  - SP7 쓰기 없음: `report`·`diff`·`check` 호출 전후 TB_MDM_RULE·RULE_VER·RULE_VAR·RULE_ROW·RULE_TEST_CASE 행 수와 VER 의 `ROW_VERSION`·`AUD_VER` 가 같다(I14).
  - SP8 `check(request)` 의 errors·warnings 가 `RuleConfirmReport.flatten(report(ref))` 와 같다(I11). 레지스트리의 BUSINESS_RULE SPI 가 `RuleConfirmCheck` 인스턴스다(I16).
  - SP9 깨진 셀(SP2 와 같은 방식)과 기대값 있는 테스트 케이스가 함께 있는 DRAFT 에서 `report` 가 예외 없이 4행을 돌려주고 SAVE_CHECKS·TEST_CASES 가 모두 REJECTED 다. 정의 조립이 예외를 던지게 만들 수 있으면 TEST_CASES 이슈 code 가 `CASE_RUN_FAILED` 인지도 본다(만들 수 없으면 build-log.md 에 적고 `RuleConfirmReportTest` 에서 예외를 던지는 가짜 실행기로 대신한다).
- `dme/ruleEdit/RuleEffectiveStatusTest`(B2) — `MutableClock` 을 옮겨 가며 본다.
  - EF1 저장 CREATED 이고 v1 RELEASED 의 applyFrom 이 미래인 룰: `ruleMngService` 검색 행 status CREATED, `ruleEditService.view` 의 `rule.status` CREATED. 시계를 applyFrom 뒤로 옮기면 둘 다 INUSE 이고 저장값은 여전히 CREATED 다.
  - EF2 상태 필터: 위 룰은 시계를 옮긴 뒤 status=INUSE 로 검색하면 나오고 CREATED 로 검색하면 나오지 않는다(I19).
  - EF3 폐기: 저장 CREATED·계산 INUSE 인 룰을 담당자가 폐기하면 성공하고 저장 STATUS 가 DEPRECATED 다(I20).
  - EF4 쓰기 경로 승격: 헤더 저장·새 버전 뒤 저장 STATUS 가 INUSE 다. 계산 상태가 CREATED 인 룰은 헤더 저장 뒤에도 CREATED 그대로다.
  - EF5 `view.confirmScreenReady` 가 true 다.
- `dme/ruleConfirm/RuleConfirmServiceTest`(B3) — 서비스 빈을 트랜잭션 없이 직접 부르고 `JdbcTemplate` 으로 단언한다.
  - S1 `search` 는 MDM 원천 룰의 DRAFT 만 돌려준다(EXTERNAL 룰·RELEASED 만 있는 룰 제외). keyword 는 룰 ID·이름 부분 일치, 없으면 빈 목록. 정렬은 룰 ID 오름차순.
  - S2 `view` 는 룰 헤더(계산 상태)·대상 버전·직전 RELEASED·`firstVersion`·diff 목록·diff 건수·변수 라벨·`serverNow` 를 돌려준다. ver 를 비우면 DRAFT 를 고른다. DRAFT 가 아닌 버전(RELEASED)을 주면 읽기 전용 모양(diff 는 그 버전 기준)으로 돌려준다.
  - S3 `validate` — 항목 4행 + `applyFromCheck`. 최초 버전이면 `applyFromCheck.status == EXEMPT`. apply_from 이 직전 RELEASED 의 apply_from 과 **같으면** REJECTED, 1초 뒤면 PASSED. `futureApplyFrom` 은 서버 시계 기준. `contractWarnings` 는 CONTRACT_CHANGED 경고만 담는다.
  - S4 `validate` 는 쓰기를 하지 않는다(행 수·ROW_VERSION 불변). DRAFT 가 아니면 MDM002.
  - S5 `confirm` 거부 경로: 표준 관리자(`STD_ADMIN`) → MDM013, 담당자지만 소유자 아님 → MDM003, row_version 불일치 → MDM001, 저장 시 검사 ERROR → MDM010, 케이스 실패 → MDM010, 결과 변수 생산 룰 미확정 → MDM010, 행 없음 → MDM010, 경고(계약 변경)가 있는데 `warningsAcknowledged=false` → MDM014, apply_from 이 직전과 같음 → MDM008. **어느 경우든** DRAFT 행(STATUS·APPLY_FROM·ROW_VERSION)과 직전 RELEASED 의 APPLY_TO 가 그대로다.
  - S6 `confirm` 성공(v1 RELEASED → v2 DRAFT 확정): v2 STATUS RELEASED, APPLY_FROM 희망값, APPLY_TO `9999-12-31 00:00:00`, ROW_VERSION +1, v1 APPLY_TO = v2 APPLY_FROM, D5 칸(`REQUESTED_BY`=확정자, `REQUESTED_AT`=`RELEASED_AT`=시계, `APPROVED_BY`·`APPROVED_AT`·`EMERGENCY_YN`·`EMERGENCY_REASON`·`REJECT_REASON` NULL — 칼럼 기본값이 있으면 그 값). 응답 `closedPreviousVer == 1`.
  - S7 CREATED→INUSE: 최초 버전을 apply_from = 시계와 **같은** 값으로 확정 → 저장 STATUS INUSE. 다른 룰을 미래 apply_from 으로 확정 → 저장 CREATED 이고 `view` 계산 상태 CREATED, `MutableClock` 을 apply_from 뒤로 옮기면 `view`·`ruleMng` 검색의 계산 상태가 INUSE.
  - S8 `validate` 의 `applyFromCheck` 와 `confirm` 의 MDM008 판정이 같은 픽스처에서 일치한다(직전 RELEASED 정의 공유, I12).
  - S9 `confirm` 은 `VersionWriteGuard.beginDraftWrite` 를 부르지 않는다 — 성공 뒤 ROW_VERSION 이 정확히 +1 이다.
  - S10 수용 기준 3(룰 참조 검사 없음): 룰에 `TB_MDM_RULE_SYSTEM` DEF 시스템 행이 있고, 룰이 참조하는 마루 코드(코드 도메인 변수 값 또는 `IN 카테고리` 셀)가 그 시스템의 `TB_MDM_CODE_SYSTEM` 에 없어도 `validate` 에 거부가 없고 `confirm` 이 성공한다. 보고서 항목 이름 집합이 `MdmRuleConfirmCheckItem` 넷과 정확히 같다. 코드 원장 픽스처가 너무 무거우면 DEF 시스템 행 + 코드 배포 행 0건으로 만들고, 그 판단을 build-log.md 에 적는다.
  - S11 EXTERNAL 원천 룰에 `validate`·`confirm` → 오류(ruleEdit `requireMdm` 과 같은 `BUSINESS_ERROR` 문구).
  - 모든 S 시험의 데이터는 처음에 한 번, 레지스트리의 BUSINESS_RULE SPI 가 `RuleConfirmCheck` 인지 단언한다(I16).
- `dme/ruleConfirm/RuleConfirmOasisHttpTest`(B3) — `MockMvc` 로 `/api/mdm/oasis/ruleConfirm/{action}` 을 부른다(`DmeOasisHttpTest`·`CodeConfirmOasisHttpTest` 관례).
  - HT1 search·view·validate·confirm 성공 봉투(`data.result`). `warningsAcknowledged` 불리언 바인딩을 이 시험이 확인한다. confirm 응답의 `version.status == "RELEASED"`, `version.applyFrom` 이 요청값, 과거 apply_from 으로 최초 버전을 확정했으면 `rule.status == "INUSE"` 다(I22a — 오래된 엔티티가 응답에 실리지 않는다).
  - HT2 confirm 이 MDM010 으로 실패하면 봉투 `meta.success=false` 이고 DRAFT 가 그대로다(OASIS 트랜잭션 롤백).
  - HT3 컨텍스트에 target BUSINESS_RULE 인 `VersionConfirmCheckSpi` 빈이 정확히 하나이고 그 클래스가 `RuleConfirmCheck` 다.
- `dme/ruleConfirm/RuleConfirmBpmnActionTest`(B3) — `DmeBpmnActionTest.assertActions` 는 모든 액션이 EDIT 세트 안이라고 단언하므로 `confirm` 에 쓸 수 없다. 같은 파싱 방식으로 따로 짠다: 분기 이름 집합이 `{search, view, validate, confirm}`, 메서드 표 `search→search`·`view→view`·`validate→validate`·`confirm→confirm`, bean `ruleConfirmService`, `search`·`view` 는 `MdmPermissions.READ_ACTIONS` 안, `validate` 는 `EDIT_ACTIONS` 안, `confirm` 은 `CONFIRM_ACTIONS` 에만 있고 `EDIT_ACTIONS` 에는 없다, 모든 액션이 `MdmActions` 상수 안.
- 기존 시험 중 영향을 받는 것: `MdmBusinessRuleMigrationTest.계약_전용_06_확정_검사와_정의_조회_빈이_없다`(B1 이 BUSINESS_RULE 줄을 지움), `RuleValueTestServiceTest`(수정 없이 초록이어야 함, I9), `RuleLedgerChecksTest`(`ContractChangeCheck` 대상 추가 뒤에도 수정 없이 초록), `BusinessRuleVersionScenarioSqliteTest`(후처리기가 운영 SPI 를 지우므로 수정 없이 초록), `RuleEditViewTest`·`RuleHeaderServiceTest`·`RuleMngServiceTest`·`RuleVersionServiceTest`(B2 뒤 수정 없이 초록. 기대값이 저장 상태를 전제로 하고 계산 상태와 달라지는 케이스가 있으면 **기대값을 고치지 말고** build-log.md 에 적은 뒤 설계 이탈로 보고한다).

### 3.3 FE vitest(`$MDM/tests/dme/ruleConfirm/`, `$MDM/tests/dme/ruleEdit/`)

- `checks.test.ts` — 상태 라벨(PASSED 통과·WARNED 경고·REJECTED 거부·EXEMPT 면제), 항목 제목(SAVE_CHECKS 저장 시 검사 전부·NOT_EMPTY 비어 있음·TEST_CASES 값 테스트·RESULT_VAR_RELEASED 결과 변수 참조, 그리고 적용 순서), `canConfirm`(DRAFT·소유자 본인·`confirm` 권한·검사 결과 있음·REJECTED 0건·`applyFromCheck` 가 REJECTED 아님·검사한 apply_from 과 입력값이 같음 — 하나라도 거짓이면 false), `toServerDateTime("2026-07-01T00:00")` = `"2026-07-01 00:00:00"`·초 있는 입력 보존·빈 값 null, `splitWarnings`(계약 변경과 일반 경고를 `code === "CONTRACT_CHANGED"` 로 나눔).
- `rule-confirm-page.test.ts`(happy-dom, `globalThis.fetch` mock, RBAC 는 `/api/mcm/oasis/secUser/myButtonEndpoints` 응답과 `__dkOasisButtonRbacStore__` 초기화 — `code-confirm-page.test.ts` 관례)
  - P1 핸드오프 `{maruRuleId, ver: "2"}` 로 열면 `view` 를 `{maruRuleId, ver: 2}` 로 부른다(`takeMdmPageParams("dme/ruleConfirm")`).
  - P2 검사 결과 5행(항목 4 + 적용 순서)이 표로 그려지고 REJECTED 가 하나라도 있으면 확정 버튼이 비활성이다.
  - P3 일반 경고만 있으면 대화상자의 "경고를 확인했습니다"(`rc-ack`) 체크 전에는 확인 버튼이 비활성이고, 체크하고 누르면 `confirm` 요청에 `warningsAcknowledged: true` 가 실린다. 경고가 없으면 `false` 다.
  - P4 계약 변경 경고가 있으면 화면에 계약 변경 영역(`rc-contract`)이 보이고, 대화상자에서 `rc-contract-ack` 와(일반 경고도 있으면) `rc-ack` 를 **모두** 체크해야 확인 버튼이 켜진다.
  - P5 `futureApplyFrom=true` 면 대화상자에 미래 적용 경고 문구가 보인다(서버 값 기준, 브라우저 시계를 보지 않는다).
  - P6 `confirm` 권한이 없는 RBAC 가짜에서는 확정 버튼·검사 버튼이 비활성이다.
  - P7 서버가 `meta.success=false` 를 돌려주면 그 message 가 화면 오류 영역(`rc-error`)에 보인다.
  - P8 apply_from 을 검사 뒤 바꾸면 확정 버튼이 다시 비활성이 된다(검사를 다시 해야 한다).
  - P9 SAVE_CHECKS 가 REJECTED 인 `validate` 응답(계약 경고 없음)을 받으면 `rc-contract` 에 "저장 시 검사 오류가 있어 계약 변경을 보지 못했습니다" 가 보이고, "입력 계약 변경 없음" 문구는 없다(I41).
- `rule-edit-page.test.ts` 추가 케이스(B4)
  - RE1 `confirmScreenReady: true`, 선택 버전 DRAFT, MDM 원천이면 "확정 이동" 이 활성이고, 누르면 `openMdmPage` 가 `mdm:dme/ruleConfirm` 을 열며 `takeMdmPageParams("dme/ruleConfirm")` 가 `{maruRuleId, ver: "<선택 버전>"}` 이다(`code-edit-page.test.ts` 190-203행 관례).
  - RE2 `confirmScreenReady: true` 라도 선택 버전이 RELEASED 이거나 원천이 EXTERNAL 이면 비활성이다.

### 3.4 브라우저 E2E — `src/frontend/e2e/mdm-ruleConfirm.spec.ts`(스모크 넷 포함)

E2E 는 게이트 명령 목록(기준선 5줄)에 없다. **B5 와 Verify 가 `references/e2e.md` 의 슬롯·직접 기동 규칙으로 돌리고 결과를 보고한다**(§ 서버·E2E 기동 방법). 픽스처 `e2e/fixtures/mdm-ruleConfirm-data.sql` 은 mdm 기동(Flyway) 뒤 한 번 넣는다. 확정이 원장을 바꾸므로 **같은 mdm.db 로 다시 돌릴 수 없다**(06-05 선례와 같다). 사용자는 `mdm-rbac-users.sql` 의 `e2e_mdm_steward`·`e2e_mdm_stdadmin` 이다.

픽스처(모두 MDM 원천, 소유자 `e2e_mdm_steward`, ROW_VERSION 0, 행·셀 모양은 `mdm-ruleEdit-data.sql` 의 QLTY_GRD_JDG 행을 본떠 만든다. **B5 는 스펙을 쓰기 전에 픽스처를 넣은 서버에 `validate` 를 직접 불러 기대 상태가 나오는지 먼저 확인한다**):
- `E2E_RC_OK` — CREATED, v1 DRAFT(FIRST), 조건 변수 1~2개·결과 변수 1개, NORMAL 행 2개, 기대값이 맞는 테스트 케이스 1건. 적어도 경고 1건(예: 빈틈 경고)이 나오도록 만든다. 최초 버전.
- `E2E_RC_CASEFAIL` — CREATED, v1 DRAFT, 기대값이 틀린 테스트 케이스 1건 → TEST_CASES 거부.
- `E2E_RC_CONTRACT` — INUSE, v1 RELEASED(`2026-01-01 00:00:00`~`9999-12-31 00:00:00`), v2 DRAFT 는 v1 에 필수 조건 변수 하나를 더한 정의 → 계약 변경 경고.
- `E2E_RC_RACE` — CREATED, v1 DRAFT, 검사를 통과하는 정의 → 스모크 4용.

| # | 사용자 | 단계 | 확인 |
|---|---|---|---|
| T1 | 담당자 | 메뉴 마루 MDM > 업무기준 > 버전 확정 | 화면이 열리고 breadcrumb `마루 MDM > 업무기준 > 버전 확정`(스모크 1, 수용 기준 4) |
| T2 | 담당자 | 확정 대기 목록 | `E2E_RC_OK`·`E2E_RC_CASEFAIL`·`E2E_RC_CONTRACT`·`E2E_RC_RACE` 행이 서버 데이터로 보인다. keyword `NO_SUCH` 로 조회하면 빈 상태 "확정할 DRAFT 가 없습니다"(스모크 2) |
| T3 | 담당자 | 룰 화면(`dme/ruleEdit`)에서 `E2E_RC_CASEFAIL` v1 을 고르고 "확정 이동" | 버전 확정 탭이 그 룰·버전으로 열린다(ruleEdit 연결) |
| T4 | 담당자 | (T3 에 이어) apply_from `2026-10-01 00:00:00` → 검사 | 값 테스트 행이 "거부", 적용 순서 "면제", 확정 버튼 비활성(수용 기준 1) |
| T5 | 담당자 | `E2E_RC_OK` 선택 → apply_from `2026-01-01 00:00:00` → 검사 → 확정 → 대화상자에서 경고 확인 체크 → 확인 | 토스트 "확정했습니다", 상태 배지 RELEASED, 확정 대기 목록에서 사라진다(스모크 3) |
| T6 | 담당자 | `E2E_RC_CONTRACT` 선택 → apply_from `2026-10-01 00:00:00` → 검사 → 확정 → 대화상자 | 화면에 계약 변경 영역이 보이고, 계약 변경 확인란을 체크하기 전에는 확인 버튼이 비활성이다. 체크 뒤 확인 → 확정 성공, 직전 버전 v1 이 닫힌 것(`closedPreviousVer` 표시 또는 직전 RELEASED 칸의 apply_to)이 보인다 |
| T7 | 담당자 | `E2E_RC_RACE` 선택 → apply_from 입력 → 검사 → 테스트가 `page.request` 로 `ruleConfirm/confirm` 을 먼저 성공시킴 → 화면 확정 → 확인 | 화면 오류 영역에 서버 문구(MDM002 "DRAFT 상태에서만 할 수 있습니다" 또는 MDM001 "다른 사용자가 수정했습니다. 다시 불러오세요")가 보인다(스모크 4) |
| T8 | 표준 관리자 | 메뉴로 열고 `E2E_RC_CASEFAIL` 선택 | 검사·확정 버튼이 비활성(수용 기준 2의 화면 판) |

스크린샷: `docs/mdm/tasks/TSK-08-05/screens/dme-ruleConfirm-{open,list,rejected,confirmed,contract,error,readonly}.png`.

### 3.5 그 밖의 검사

- `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` ERROR 0(새 BPMN). 기준선 WARN 0 을 유지한다.
- `mantine-aggrid-ui` 스킬 규칙으로 새 FE 파일을 점검한다(shared 래퍼 사용).
- 게이트: 기준선 5줄 명령(testAll·m-mdm test·m-mdm lint·shared unit·계약 검사)에서 신규 실패 0, 총수 미감소.

## 4. 수용 기준 매핑

| # | 수용 기준 | 검증 방법 |
|---|---|---|
| 1 | 검사 하나라도 실패하면 확정 거부 | 서버: `RuleConfirmServiceTest` S5(MDM010 네 경로·MDM008 뒤 DRAFT 불변), `RuleConfirmReportTest` CR2·CR3(ERROR → errors), `RuleConfirmCheckSqliteTest` SP2·SP4·SP5·SP6(항목별 REJECTED), `RuleConfirmOasisHttpTest` HT2(롤백). 화면: `rule-confirm-page.test.ts` P2, E2E T4 |
| 2 | 담당자가 아닌 사용자는 확정할 수 없다 | 서버: `RuleConfirmServiceTest` S5(표준 관리자 MDM013, 소유자 아님 MDM003). 권한 세트: `RuleConfirmBpmnActionTest`(`confirm` 은 CONFIRM 세트만 → dme 매트릭스상 담당자만). 화면: P6, E2E T8 |
| 3 | 룰 참조 검사(배포 대상 시스템 기준)는 하지 않는다 | `RuleConfirmServiceTest` S10(DEF 시스템에 코드가 배포되지 않아도 확정 성공, 항목 이름 집합이 넷뿐), `RuleConfirmReportTest` CR1(4행) |
| 4 | 포털 메뉴에서 화면이 열리고 e2e `mdm-ruleConfirm.spec.ts` 가 통과 | 메뉴 시드(`seedMdmRuleConfirmMenu`) + E2E T1~T8 전체 통과(B5·Verify 가 직접 기동해 돌림) |

spec 요구사항과의 대응: "저장 시 검사 전부 + 변수·행 1개 이상 + 기대값 있는 케이스 전부 통과" → SP2·SP3·SP4·SP6·CR5·CR6, "앞 룰 RELEASED 확인" → SP5·CR7, "apply_from 이 직전 RELEASED apply_from 보다 뒤" → S3·S5·S8, "계약 변경 확인란" → SP3·S5(MDM014)·P4·T6, "row_id diff(ADDED/REMOVED/CHANGED/SAME)" → DF1~DF7·SP1, "DRAFT → RELEASED, 직전 apply_to 닫기" → S6, "CREATED→INUSE 자동 전이" → S7·EF1~EF4.

이번 Task 는 도커 금지로 확인하지 못하는 수용 기준이 없다(전부 SQLite·vitest·Playwright 로 확인한다).

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

각 규칙 뒤 괄호가 대상 테스트다. Build 의 변이 검증은 이 테스트만 돌린다.

**B1 — 검사·diff(순수·검사 컴포넌트·SPI)**

- I1 **`report()` 는 `MdmRuleConfirmCheckItem.values()` 순서대로 4행을 모두 담는다.** 빠지거나 순서가 바뀌거나 다섯째 항목(룰 참조·적용시점 하한)이 생기면 안 된다. (`RuleConfirmReportTest` CR1)
- I2 **항목 상태 = 그 항목 이슈의 심각도로만 정한다: ERROR 하나라도 → REJECTED, 아니면 WARNING 하나라도 → WARNED, 아니면 PASSED.** (`RuleConfirmReportTest` CR2)
- I3 **`flatten()`: errors 는 모든 ERROR 이슈, warnings 는 모든 WARNING 이슈다(항목 상태가 아니라 이슈 심각도 기준).** (`RuleConfirmReportTest` CR3)
- I4 **이슈 모양: `field` = 항목 `name()`, `code` = 세부 코드, `itemKey` = §6.3 표 형식.** 06-05 처럼 code 에 항목 이름을 넣지 않는다(08-01 계약 Javadoc). (`RuleConfirmReportTest` CR4)
- I5 **SAVE_CHECKS = `RuleSaveValidator.validate(new RuleCheckInput(…, RuleSaveTarget.STORED))` 의 이슈 전부**다. 저장된 DRAFT 의 변수·행을 `StoredRuleDefinitions.read` 로 읽어 넣고, 적중 정책은 버전 행의 값을 쓴다. 검사 목록을 따로 만들거나 이슈를 걸러 버리지 않는다. (`RuleConfirmCheckSqliteTest` SP2)
- I6 **입력 계약 변경은 STORED 에서도 돈다(`ContractChangeCheck.targets()` ⊇ {TABLE, COLUMNS, STORED}). 심각도 WARNING 이므로 확정을 막지 않고 경고 확인(MDM014)만 요구한다.** (`RuleConfirmCheckSqliteTest` SP3, `RuleConfirmServiceTest` S5)
- I7 **NOT_EMPTY: 변수 0개면 `NO_VARS`, 행 0개면 `NO_ROWS`(모두 ERROR). 행 수는 NORMAL·DEFAULT 를 가리지 않는다(06:1131 "기본 행은 요구하지 않는다").** (`RuleConfirmReportTest` CR5, `RuleConfirmCheckSqliteTest` SP6)
- I8 **TEST_CASES: 이 룰의 모든 케이스를 저장된 DRAFT 정의로 값 테스트와 같은 판정 코드(`RuleCaseJudge.runCase`, `SingleRuleDefinitionLookup` + 운영 평가기, 평가 시각 = 시계 현재 초 단위)로 돌린다. 기대값 없는 케이스는 보지 않고, `pass == false`(판정 오류 포함)이면 ERROR, 케이스가 없으면 PASSED. 실행 중 런타임 예외는 `CASE_RUN_FAILED` ERROR 로 바꾸고 `report` 는 예외 없이 4행을 돌려준다.** 같은 픽스처에서 SPI 판정과 `RuleValueTestService.run(VERSION, runCases=true)` 의 `pass` 가 같다. (`RuleConfirmReportTest` CR6, `RuleConfirmCheckSqliteTest` SP4·SP9)
- I9 **`RuleCaseJudge` 로 옮긴 뒤에도 값 테스트 동작은 그대로다 — `RuleValueTestServiceTest` 가 수정 없이 초록이다.** (`RuleValueTestServiceTest` 전체)
- I10 **RESULT_VAR_RELEASED: 대상 이름 = `RuleDefinitionReads.of(vars, rowCells).reads` − 이 룰의 `produces` − 컬럼 사전 이름. 생산 룰 = 이 룰이 아닌 룰의 **모든 버전**에서 RESULT 변수의 `VAR_NAME` 또는 `RES_GRP` 가 그 이름인 룰. 생산 룰이 있고 그 가운데 RELEASED 버전이 있는 룰이 하나도 없으면 ERROR. 생산 룰이 없는 이름은 보지 않는다.** (`RuleConfirmReportTest` CR7, `RuleConfirmCheckSqliteTest` SP5)
- I11 **SPI `check(request)` = `RuleConfirmReport.flatten(checks.report(request.draft()))`, SPI `diff(draft)` = `checks.diff(draft)`.** SPI 어댑터에는 판정 코드가 없다. (`RuleConfirmCheckSqliteTest` SP8)
- I12 **직전 RELEASED = 같은 룰에서 STATUS RELEASED 이고 ver < V 인 것 중 가장 큰 ver.** diff 의 base·validate 의 적용 순서 판정이 모두 `RuleConfirmChecks.previousReleased` 하나를 쓰고, 공통 서비스의 private `previousReleased` 와 결과가 같아야 한다. (`RuleConfirmCheckSqliteTest` SP1, `RuleConfirmServiceTest` S8)
- I13 **diff: row_id 마다 항목 하나. 한쪽에만 있으면 ADDED(old null)/REMOVED(new null), 양쪽에 있으면 정규화 셀 또는 seq 가 다를 때 CHANGED, 같으면 SAME. 값 맵 키는 `SEQ`(Integer)·`CELLS`(정규화 JSON) 둘뿐. 정렬은 `COALESCE(new.seq, old.seq)`, row_id. 정규화는 객체 키만 재귀 정렬하고 배열 순서는 보존한다.** (`RuleVersionDiffsTest` DF1~DF7)
- I14 **검사 컴포넌트·SPI 는 쓰기를 하지 않는다**(확정 트랜잭션 안에서 불리므로 읽기만). (`RuleConfirmCheckSqliteTest` SP7)
- I15 **검사·diff 에 새 네이티브 SQL 을 쓰지 않는다**(JPQL·엔티티 조회만). 그래서 MSSQL 방언 영향이 없다. (코드 리뷰 — Verify 가 `RuleConfirmQueries`·`RuleConfirmChecks` 에 `createNativeQuery`·`JdbcTemplate` 이 없는지 grep 으로 확인한다. 알려진 커버리지 갭)
- I16 **운영 컨텍스트에서 BUSINESS_RULE 확정 검사 SPI 빈은 `RuleConfirmCheck` 하나다. 화면 서비스는 SPI 빈이 아니라 `RuleConfirmChecks` 를 주입받는다**(시나리오 후처리기가 SPI 정의를 지워도 컨텍스트가 뜬다). 테스트 스텁(`BusinessRuleConfirmCheckStub`)과 `ContractStubCompileTest` 는 고치지 않는다. (`RuleConfirmOasisHttpTest` HT3, `RuleConfirmCheckSqliteTest` SP8, `RuleConfirmServiceTest` 의 레지스트리 단언, 기존 `BusinessRuleVersionScenarioSqliteTest`)
- I17 **`MdmBusinessRuleMigrationTest` 의 계약 전용 가드에서는 BUSINESS_RULE 확정 SPI 줄만 지운다. `DefinitionLookup` 빈 0개 단언은 남는다.** (`MdmBusinessRuleMigrationTest`)

**B2 — 계산 상태**

- I18 **계산 상태 = 저장 CREATED 이면서 `applyFrom <= now` 인 RELEASED 가 있으면 INUSE, 그 밖에는 저장값.** 경계는 포함이다(ADR-0002 D6). (`RuleVersionsEffectiveStatusTest` ES1~ES3)
- I19 **룰 조회(ruleMng 목록·ruleEdit view·ruleConfirm view/search)의 상태 표시와 ruleMng 상태 필터는 같은 계산 상태를 쓴다.** 표시와 필터가 어긋나면 안 된다. (`RuleEffectiveStatusTest` EF1·EF2, `RuleConfirmServiceTest` S7)
- I20 **쓰기 경로(헤더 저장·폐기·새 버전)는 계산 상태가 INUSE 이고 저장 CREATED 면 같은 트랜잭션에서 저장값을 INUSE 로 올린다. 폐기 가능 판정은 계산 상태 INUSE 기준이다.** (`RuleEffectiveStatusTest` EF3·EF4)
- I21 **`RuleEditViewResult.confirmScreenReady` 는 true 다.** (`RuleEffectiveStatusTest` EF5)

**B3 — 서비스·BPMN·메뉴**

- I22 **확정은 `VersionStateService.confirm` 하나로만 한다.** `RuleConfirmService` 는 VER·RULE 표를 직접 UPDATE 하지 않고 `VersionWriteGuard.beginDraftWrite` 를 부르지 않는다(ROW_VERSION 이중 증가 금지). (`RuleConfirmServiceTest` S6·S9)
- I22a **confirm 응답은 확정 뒤 원장 값을 싣는다: `version.status == RELEASED`, `version.applyFrom` = 요청값, apply_from 이 과거면 `rule.status == INUSE`.** 공통 서비스 호출 뒤 영속성 컨텍스트를 비우고 다시 읽는다. 실제 트랜잭션 경로를 거치는 HTTP 시험만 이 결함을 잡는다. (`RuleConfirmOasisHttpTest` HT1)
- I23 **`RuleConfirmService` 에 `@Transactional` 을 붙이지 않는다**(CGLIB 프록시가 OASIS 파라미터 이름을 잃는다). (`RuleConfirmOasisHttpTest` HT1 — 붙이면 파라미터 바인딩 실패로 빨강)
- I24 **확정 실패는 전부 롤백된다: 어느 거부 경로에서도 DRAFT 의 STATUS·APPLY_FROM·ROW_VERSION 과 직전 RELEASED 의 APPLY_TO 가 그대로다.** (`RuleConfirmServiceTest` S5, `RuleConfirmOasisHttpTest` HT2)
- I25 **확정 권한 = 담당자 역할(MDM013) + DRAFT 소유자(MDM003).** 서비스 `confirm` 첫 줄에서 `RuleStewardCheck.requireSteward()` 를 부르고(`MdmCurrentUser.roleIds()` 를 직접 보지 않는다 — `DmeRoleCheckArchitectureTest`), 소유자 판정은 공통 서비스에 맡긴다. (`RuleConfirmServiceTest` S5, 기존 `DmeRoleCheckArchitectureTest`)
- I26 **적용 순서 = 직전 RELEASED 의 apply_from 보다 엄격히 뒤(같으면 거부), 최초 버전 면제, 과거 일시 허용.** `validate` 는 `ApplyFromOrderCheck` 를 불러 `applyFromCheck` 를 채운다. 08 「적용시점 하한」(리드타임·긴급)은 만들지 않는다(PRD §2 규칙 7). (`RuleConfirmServiceTest` S3·S5·S8)
- I27 **`validate` 는 쓰기를 하지 않는다**(행 수·ROW_VERSION 불변). DRAFT 가 아니면 MDM002. (`RuleConfirmServiceTest` S4)
- I28 **경고가 있고 `warningsAcknowledged=false` 면 확정하지 않는다(MDM014).** 서버는 화면의 확인 여부를 믿지 않고 다시 검사한다. (`RuleConfirmServiceTest` S5)
- I29 **CREATED→INUSE: apply_from ≤ 확정 시각이면 확정 트랜잭션에서 저장 상태를 올린다(경계 포함, 공통 서비스). 미래면 저장 CREATED 로 두고 조회는 계산 상태를 돌려준다.** (`RuleConfirmServiceTest` S7)
- I30 **D5 결재 칸: `REQUESTED_BY`=확정자, `REQUESTED_AT`=`RELEASED_AT`=확정 시각, 결재·긴급·반려 칸은 비워 둔다.** 이 Task 는 긴급·사유·결재 입력을 만들지 않는다(spec 제약). (`RuleConfirmServiceTest` S6)
- I31 **룰 참조 검사(배포 대상 시스템 기준)를 하지 않는다 — `TB_MDM_RULE_SYSTEM`·`TB_MDM_CODE_SYSTEM`·`TB_MDM_DATA_SYSTEM` 을 확정 경로에서 읽지 않는다.** (`RuleConfirmServiceTest` S10)
- I32 **BPMN 액션 표: `search→search`·`view→view`·`validate→validate`·`confirm→confirm`, bean `ruleConfirmService`. `confirm` 은 CONFIRM 세트에만 있다(EDIT 세트 밖).** (`RuleConfirmBpmnActionTest`)
- I33 **메뉴는 dme 폴더 아래 새 leaf(`OBJECT_ID`=`ruleConfirm`, MENU_SEQ `003`, FULL_SEQ `5050300`, 이름 "버전 확정")이고 08-02·08-06 메뉴를 고치지 않는다. 권한은 `seedMdmObjectRbac("ruleConfirm","dme")`(표준 관리자 READ·담당자 CONFIRM) + SYSADMIN PERM_ALL.** (E2E T1·T8 — 백엔드 단위 테스트가 없는 알려진 커버리지 갭. Verify 가 diff 로 확인한다)

**B4 — 화면**

- I34 **확정 버튼 활성 = DRAFT && 소유자 본인 && `confirm` 권한 && 검사 결과 있음 && REJECTED 0건 && `applyFromCheck` 가 REJECTED 아님 && 검사한 apply_from 이 지금 입력값과 같음.** (`checks.test.ts`, `rule-confirm-page.test.ts` P2·P6·P8)
- I35 **사용자가 대화상자에서 필요한 확인란(일반 경고 `rc-ack`, 계약 변경 `rc-contract-ack`)을 모두 체크하기 전에는 `warningsAcknowledged=true` 를 보내지 않는다. 경고가 없으면 `false` 를 보낸다.** (`rule-confirm-page.test.ts` P3·P4)
- I36 **미래 apply_from 여부는 서버가 준 `futureApplyFrom`(서버 시계)으로만 판정한다.** (`rule-confirm-page.test.ts` P5)
- I37 **ver 는 정수로 보내고, handoff 문자열은 정수로 바꿔 쓴다. null·undefined 파라미터는 보내지 않는다.** (`rule-confirm-page.test.ts` P1·P3 의 요청 본문 단언)
- I38 **apply_from 은 `yyyy-MM-dd HH:mm:ss`(KST, 초 단위)로 보낸다.** (`checks.test.ts`)
- I39 **서버 거부 message 를 화면 오류 영역에 그대로 보인다.** (`rule-confirm-page.test.ts` P7)
- I40 **ruleEdit "확정 이동" 활성 = `confirmScreenReady` && MDM 원천 && 선택 버전 DRAFT. 누르면 `openMdmPage("dme/ruleConfirm", {maruRuleId, ver: String(ver)})`.** (`rule-edit-page.test.ts` RE1·RE2)
- I41 **계약 변경 경고를 "계약 변경 없음" 으로 단정해 보이지 않는다** — 저장 시 검사에 ERROR 가 있으면 원장 검사(계약 변경 포함)가 돌지 않으므로, 그때 화면은 계약 영역에 "저장 시 검사 오류가 있어 계약 변경을 보지 못했습니다" 를 보인다. (`rule-confirm-page.test.ts` P9)

**B5 — 통합**

- I42 **포털 메뉴 마루 MDM > 업무기준 > 버전 확정으로 화면이 열린다.** (E2E T1)
- I43 **화면 조작만으로 확정이 끝나고 목록·상태 배지에 반영된다.** (E2E T5)
- I44 **계약 변경 확인란을 체크해야만 확정된다.** (E2E T6)
- I45 **표준 관리자는 화면에서 검사·확정을 누를 수 없다.** (E2E T8)

## 6. 상세 설계

### 6.1 검사 컴포넌트(`RuleConfirmChecks`)와 SPI 어댑터(`RuleConfirmCheck`)

```java
@Component
public class RuleConfirmChecks {
    public RuleConfirmReport.Report report(VersionRef draft);          // 4항목
    public VersionDiff diff(VersionRef draft);                          // base = previousReleased
    public Optional<MdmRuleVer> previousReleased(String ruleId, int ver);
}

@Component
public class RuleConfirmCheck implements VersionConfirmCheckSpi {       // 판정 코드 없음(I11)
    public VersionTarget target() { return VersionTarget.BUSINESS_RULE; }
    public VersionDiff diff(VersionRef draft) { return checks.diff(draft); }
    public ConfirmCheckResult check(ConfirmCheckRequest r) { return RuleConfirmReport.flatten(checks.report(r.draft())); }
}
```

- 데이터 읽기: 룰 헤더는 `MdmRuleRepository.findById`, 버전 목록은 `RuleQueries.versions(ruleId)`, 정의는 `StoredRuleDefinitions.read(ruleId, ver)`(변수 원장·해석, 행 셀 파싱).
- ver 변환: `VersionRef.ver()` 는 BigDecimal(scale 0)이다. `intValueExact()` 로 바꾼다.
- SAVE_CHECKS: `validator.validate(new RuleCheckInput(id, ver, rule.getRuleKind(), s.version().getHitPolicy(), s.rawVars(), s.vars(), s.rows(), RuleSaveTarget.STORED))` 의 `issues()` 전부(I5).
- NOT_EMPTY: `s.rawVars().size()`, `s.rows().size()`.
- TEST_CASES: `StoredRuleDefinitions.assemble(id, ruleKind, s)` → `new MdmRuleEngine(evaluator.configuration(), new SingleRuleDefinitionLookup(def))` → `RuleTestCaseQueries.cases(id)` 마다 `RuleCaseJudge.runCase(engine, id, c, ts, defaultRowId)`. 값 테스트 VERSION 분기와 같은 조립이다(I8).
- RESULT_VAR_RELEASED: `RuleDefinitionReads.of(s.rawVars(), rowCells)` → 대상 이름 → `RuleConfirmQueries.producers(ruleId, names)` → `RuleQueries.latestReleasedVers(producerRuleIds)`(맵에 키가 있으면 RELEASED 있음). 컬럼 사전 판정은 `RuleVarTypeResolver` 에 이름 하나짜리 COND 탐침을 물어 `typeSource == COLUMN` 인지 본다(`StoredRuleDefinitions.externalTypes`·`RuleSaveValidator.externalNames` 와 같은 방식, 한 호출 안에서 캐시).
- 네 항목은 서로 독립으로 모두 돈다(앞 항목이 거부여도 뒤 항목을 돌린다). 화면이 한 번에 모든 문제를 보이게 하기 위해서다.
- **항목 실행 중 예외는 조용히 통과시키지도, 500 으로 흘리지도 않는다.** 저장 시 검사에 ERROR 가 있는 DRAFT 에서는 정의 조립·엔진이 `EngineEvaluationException` 이 아닌 런타임 예외를 던질 수 있다. TEST_CASES 실행(정의 조립·엔진 생성·케이스 판정)에서 난 `RuntimeException` 은 그 항목의 ERROR 이슈 `CASE_RUN_FAILED`(itemKey null, message "값 테스트를 끝내지 못했다: " + 예외 message)로 바꾼다. RESULT_VAR_RELEASED 조회 예외도 같은 방식(`PRODUCER_CHECK_FAILED`)이다. 검사기의 `ANALYSIS_FAILED`(08-04 §7.12)와 같은 원칙이다.
- **알려진 동작**: `RuleSaveValidator` 는 앞 단계(셀·식·미완성·분석)에 ERROR 가 있으면 `RuleSaveCheck` 빈(계약 변경·세트 순서·코드 참조 등)을 부르지 않는다. 그래서 SAVE_CHECKS 가 거부일 때는 계약 변경 경고가 나오지 않을 수 있다. 어차피 확정이 막히므로 이 동작을 바꾸지 않고 화면 문구로만 알린다(I41).

### 6.2 diff(`RuleVersionDiffs`)

```java
public record Row(int rowId, int seq, String cellsJson) {}
public static List<VersionDiffEntry> diff(List<Row> base /* 없으면 빈 목록 */, List<Row> target)
public static String canonicalCells(String cellsJson)   // 객체 키 재귀 정렬, 배열 순서 보존, 공백 없음
```
- 06 「버전 비교」 SQL(06:1255-1268)을 Java 로 옮긴다. SQL 로 쓰지 않는 까닭은 D8 이다.
- `SEQ` 값은 `Integer`, `CELLS` 값은 `canonicalCells` 결과다. CHANGED 판정은 정규화 문자열 비교와 seq 비교다.
- `RuleConfirmChecks.diff` 는 `new VersionDiff(baseRef /* 직전 RELEASED 가 없으면 null */, draft, entries)` 다.

### 6.3 검사 보고서(`RuleConfirmReport`)

```java
public enum ItemStatus { PASSED, WARNED, REJECTED }
public record Issue(String severity /* ERROR|WARNING */, MdmCheckIssue issue) {}
public record Item(MdmRuleConfirmCheckItem item, ItemStatus status, List<Issue> issues) {}
public record Report(VersionRef draft, List<Item> items, CaseSummary cases) {}
public record CaseSummary(int total, int withExpected, int passed, int failed) {}

public static Report report(VersionRef draft, List<Map<String, Object>> saveIssues, int varCount, int rowCount,
                            List<Map<String, Object>> caseResults, List<MdmCheckIssue> resultVarIssues)
public static ConfirmCheckResult flatten(Report report)
public static List<MdmCheckIssue> resultVarIssues(Set<String> reads, Set<String> produces, Predicate<String> isColumn,
                                                  Map<String, Set<String>> producersByName, Set<String> releasedRuleIds)
static String itemKey(List<Integer> rowIds, Integer varId)
```

| 항목 | code | severity | itemKey | message |
|---|---|---|---|---|
| SAVE_CHECKS | 저장 시 검사 이슈의 `code`(`RuleSaveIssueCode`·`RuleIssueCode` 이름) | 이슈 맵의 `severity` | rowIds 가 있으면 `ROW:{오름차순 콤마}`, varId 가 있으면 `VAR:{varId}`, 둘 다면 `;` 로 잇는다(`ROW:15,16;VAR:2`), 둘 다 없으면 null | 이슈 맵의 `message` |
| NOT_EMPTY | `NO_VARS` / `NO_ROWS` | ERROR | null | "변수가 하나 이상이어야 합니다" / "행이 하나 이상이어야 합니다" |
| TEST_CASES | `CASE_FAILED` | ERROR | `CASE:{caseId}` | "케이스 {caseId} {caseName}: " + mismatches 요약(`키 기대 → 실제`) 또는 판정 오류 message |
| TEST_CASES | `CASE_RUN_FAILED` | ERROR | null | "값 테스트를 끝내지 못했다: " + 예외 message(§6.1) |
| RESULT_VAR_RELEASED | `PRODUCER_NOT_RELEASED` | ERROR | `NAME:{이름}` | "조건 변수 {이름} 을(를) 만드는 룰 {ID 목록} 에 RELEASED 버전이 없습니다" |
| RESULT_VAR_RELEASED | `PRODUCER_CHECK_FAILED` | ERROR | null | "결과 변수 참조 검사를 끝내지 못했다: " + 예외 message(§6.1) |

### 6.4 케이스 판정 옮기기(`RuleCaseJudge`)

- `RuleValueTestService` 의 `runCase` 와 그것이 부르는 private static(`compare`·`hitValue`·`sameValue`·`sameHit`·`decimal`·`mismatch`·`results`·`value`·`object`·`evaluate`·`error` 가운데 필요한 것)을 `public static` 으로 옮긴다. `run()` 도 같은 메서드를 부르게 한다. 상수(`HIT_KEY`·`INPUT` ObjectMapper 등)도 함께 옮기되 `RuleValueTestService` 쪽 이름이 다른 테스트에서 쓰이면 남긴다.
- `Evaluated` record 가 필요하면 `RuleCaseJudge.Evaluated` 로 옮긴다.
- 옮긴 코드는 한 글자도 바꾸지 않는다(패키지·접근 제한자만). 첫 커밋은 이동만 담는다(I9).

### 6.5 OASIS 서비스 `ruleConfirm`(`RuleConfirmService`)

| 액션 | 메서드 | 입력 | 출력(`data.result`) | 권한 세트 |
|---|---|---|---|---|
| search | `search(RuleConfirmSearchRequest)` | keyword | `rows[]`: maruRuleId, maruRuleName, ruleKind, ver(정수), ownerId, ruleStatus(계산) — MDM 원천 룰의 DRAFT 마다 한 행, 룰 ID 오름차순 | READ |
| view | `view(RuleConfirmViewRequest)` | maruRuleId, ver(선택) | `rule`{maruRuleId, maruRuleName, ruleKind, status(계산), sourceKind}, `version`{ver, status, ownerId, rowVersion, hitPolicy, baseVer, applyFrom, applyTo, requestedBy, releasedAt}, `previous`{ver, hitPolicy, applyFrom, applyTo} 또는 null, `firstVersion`, `diff`[{rowId, kind, oldSeq, newSeq, oldCells, newCells, changedVarIds}], `diffCounts`{ADDED, REMOVED, CHANGED, SAME}, `vars`[{varId, varKind, label, varName}](대상 버전 ∪ 직전 버전, 라벨 표시용), `serverNow` | READ |
| validate | `validate(RuleConfirmValidateRequest)` | maruRuleId, ver, applyFrom | `items`[{item, status, issues[{severity, code, message, field, itemKey}]}](4행), `applyFromCheck`{status PASSED/REJECTED/EXEMPT, previousApplyFrom, message}, `contractWarnings`[이슈], `caseSummary`{total, withExpected, passed, failed}, `rejectedCount`(REJECTED 항목 수 + 적용 순서 REJECTED 면 1), `warnedCount`, `applyFrom`(정규화), `futureApplyFrom`, `serverNow` | EDIT(`validate`) |
| confirm | `confirm(RuleConfirmRequest)` | maruRuleId, ver, rowVersion, applyFrom, warningsAcknowledged | `confirmed`{ver, rowVersion}, `closedPreviousVer`(없으면 null), `warnings`[…], 확정 뒤 `view` 와 같은 모양 | CONFIRM(`confirm`) |

- 날짜 문자열은 `yyyy-MM-dd HH:mm:ss` 로 주고받는다. 파싱 실패는 `ErrorCode.INVALID_VALUE`(field `applyFrom`), 빈 값은 `REQUIRED_VALUE`. 서버는 초 단위로 자른다.
- `changedVarIds` 는 CHANGED 행에서 정규화 셀이 다른 var_id 목록이다(화면이 바뀐 칸만 강조하게). 계산은 서비스에서 `RuleVersionDiffs.canonicalCells` 를 칸마다 적용해 한다.
- `confirm` 은 `ruleStewardCheck.requireSteward()` → 입력 검사 → `versionState.confirm(new ConfirmCommand(ref, rowVersion, applyFrom, currentUser.userId(), warningsAcknowledged))` → **`EntityManager.clear()`(또는 새로 읽기)** → 조회 모델로 응답(I22·I25·I22a). OASIS 경로에서는 SPI 검사가 같은 트랜잭션에서 `MdmRuleVer`·`MdmRule` 을 관리 엔티티로 읽어 두고 공통 서비스가 네이티브 UPDATE 로 바꾸므로, 비우지 않으면 응답에 DRAFT·CREATED 가 실린다(08-01 design 634행 "공통 서비스를 부른 뒤에는 엔티티를 다시 읽는다").
- 업무 오류는 BPMN 안에서 던지면 봉투에 `meta.message` 만 오고 `errors[]` 는 비어 있다(06-04 F11). 그래서 화면은 경고 목록을 MDM014 오류에서 읽지 않고 `validate` 응답에서 읽는다(D9).
- 이 서비스는 `dme.ruleEdit` 패키지 타입(`RuleEditSupport` 등)을 쓰지 않는다(08-04 design §2 방침). EXTERNAL 원천 검사·룰 로드는 자체 private 메서드로 둔다.

### 6.6 BPMN `services/dme/ruleConfirm.bpmn`

`ruleSetEdit.bpmn`·`dmc/codeConfirm.bpmn` 모양을 복제한다: startEvent → `exclusiveGateway id="actionGateway"`(camunda:property `input=action`) → 분기 4개(`sequenceFlow name` = 액션) → `bpmn:serviceTask camunda:class="ruleConfirmService"` + camunda:property `method=`·`output="result"` → endEvent. 작성 뒤 계약 검사 ERROR 0. BPMN 작성·수정은 `bpmn-skill`·`oasis-project-support` 스킬 규칙을 따른다.

### 6.7 계산 상태(`RuleVersions.effectiveStatus`)와 쓰기 경로 승격

```java
public static String effectiveStatus(String storedStatus, Collection<MdmRuleVer> versions, LocalDateTime now)
// "CREATED".equals(stored) && versions 에 RELEASED 이면서 applyFrom != null && !applyFrom.isAfter(now) 인 것이 있으면 "INUSE", 아니면 stored
```
- 조회: `RuleMngService` 목록 행, `RuleViewService.RuleInfo.status`, `RuleConfirmService` 의 search·view 가 이 값을 싣는다. 06-02 `MasterCodeVersionSummary.effectiveStatus` 와 같은 정의다.
- ruleMng 상태 필터(`RuleQueries.where`): `INUSE` = `r.status = 'INUSE' OR (r.status = 'CREATED' AND EXISTS(RELEASED v, v.applyFrom <= :now))`, `CREATED` = `r.status = 'CREATED' AND NOT EXISTS(…)`, `DEPRECATED` = 저장값. JPQL 로 쓴다(네이티브 SQL 없음). 페이지·건수 쿼리가 같은 조건을 쓴다.
- 쓰기 경로 승격: `RuleHeaderService` 헤더 저장·폐기, `RuleVersionService` 새 버전의 쓰기 트랜잭션 안에서 계산 상태가 INUSE 이고 저장 CREATED 면 `TB_MDM_RULE.STATUS` 를 INUSE 로 저장한다. **`MdmRule` 엔티티를 읽어 고치는 경로(헤더 저장 등)에서는 엔티티 `setStatus("INUSE")` 로 하고 네이티브 UPDATE 를 쓰지 않는다** — 네이티브로 올리면 flush 때 엔티티에 남은 CREATED 가 다시 덮어쓴다. 엔티티를 건드리지 않는 경로(네이티브 쓰기만 하는 폐기 등)에서만 `VersionRowStore.markParentInUse(BUSINESS_RULE, id, audit.currentStamp())` 를 쓴다. 06-02 `CodeEditService` 386-391행이 선례다.
- 폐기 가능 판정(`RuleHeaderService.deprecate` 120행)은 계산 상태 INUSE 로 바꾼다. 폐기 UPDATE 가 `STATUS = 'INUSE'` 조건을 쓰면 승격을 먼저 한다(같은 트랜잭션).

### 6.8 화면 `dme/ruleConfirm`

`MdmPageLayout`(그룹 "업무기준", 제목 "버전 확정"). data-testid 접두사는 `rc-` 다. 영역:
1. **확정 대기 목록**(`rc-list`, 왼쪽): keyword 입력(`rc-keyword`)·조회(`rc-search`), 행(`rc-row-{maruRuleId}-{ver}`) = 룰 ID·이름·종류·버전·소유자. 비면 "확정할 DRAFT 가 없습니다"(`rc-list-empty`). 행을 누르면 `view`.
2. **확정 폼**(`rc-form`): 대상 `QLTY_GRD_JDG 버전 2 · DECISION`(`rc-target`) + `VersionStatusBadge` + `DraftLockBadge`, 직전 RELEASED(`rc-previous`: `버전 1 · 2026-01-01 00:00:00`, 없으면 "최초 버전 — 적용 순서 검사를 하지 않습니다"), 희망 apply_from(`rc-apply-from`, `datetime-local` step 1), 검사 버튼(`rc-validate`, RBAC `validate`), 확정 버튼(`rc-confirm`, I34). DRAFT 가 아니면 폼은 읽기 전용이고 확정 결과(apply 구간·확정자)를 보인다(`rc-released`).
3. **검사 결과 표**(`rc-checks`): 행(`rc-check-{item}`, 적용 순서 행은 `rc-check-APPLY_FROM`) = 검사·결과(`rc-check-status-{item}`)·상세(이슈 message 와 itemKey). 값 테스트 행 상세에는 `caseSummary`(전체·기대값 있음·통과·실패)를 보인다. 거부 행은 강조한다.
4. **계약 변경**(`rc-contract`): `contractWarnings` 가 있으면 경고 목록과 "적용 시점부터 이 키를 보내지 않거나 NULL 을 보내는 호출은 판정 오류가 됩니다" 안내를 보인다. 없으면 "직전 RELEASED 대비 입력 계약 변경 없음", 최초 버전이면 "최초 버전", SAVE_CHECKS 에 ERROR 가 있으면 I41 문구.
5. **diff**(`rc-diff`): 건수 요약(`rc-diff-counts`: 추가 n · 삭제 n · 수정 n · 같음 n), 표 = 행 번호·변경(추가·삭제·수정·같음)·순서(이전→이후)·바뀐 칸(`changedVarIds` 를 `vars` 라벨로)·이전 셀·이후 셀. 기본은 SAME 행을 접고 "같은 행 보기" 토글로 편다. 행 testid `rc-diff-{rowId}`. 모든 행이 SAME 이면 "바뀐 행이 없습니다"(`rc-diff-empty`).
6. **오류 영역**(`rc-error`): 서버 message.
7. **확정 대화상자**(`ConfirmModal`): 일반 경고가 있으면 목록과 체크박스(`rc-ack` "경고를 확인했습니다"), 계약 변경 경고가 있으면 따로 강조한 목록과 체크박스(`rc-contract-ack` "입력 계약 변경을 확인했습니다"). 필요한 확인란을 모두 체크하기 전에는 확인(`rc-modal-ok`) 비활성. `futureApplyFrom` 이면 문구 "적용 시작 일시가 미래입니다. 그 시각이 올 때까지 이 룰의 새 버전을 만들 수 없습니다(철회 없음)."(ADR-0002 Consequences). 성공 토스트 "확정했습니다" 뒤 `view`·`search` 다시 부름.
- 진입: `useMdmPageParams("dme/ruleConfirm", tabId, p => …)` 로 `{maruRuleId, ver}` 를 받아 snapshot 에 넣는다(우선순위 handoff > snapshot, codeConfirm 관례).
- 시안 「상신」의 긴급 상신·긴급 사유·상신 일시·결재 흐름 영역과 적용시점 하한 계산은 만들지 않는다(spec 제약, PRD §2 규칙 7).

#### 6.8.1 ruleEdit "확정 이동"

`RuleVersionCard.tsx` 105-107행: 활성 조건을 `view.confirmScreenReady && mdm && draft && !busy` 로 바꾸고(I40), `onClick={() => openMdmPage("dme/ruleConfirm", { maruRuleId: id, ver: String(selected.ver) })}` 를 단다. 툴팁 문구 "버전 확정 화면(TSK-08-05)에서 한다" 는 비활성 사유에 맞게 "DRAFT 버전만 확정할 수 있습니다" 로 바꾼다. `openMdmPage` 는 `@/shell` 에서 import 한다(codeEdit 관례).

### 6.9 메뉴 시드(`DataInitializer.seedMdmRuleConfirmMenu`)

`seedMdmCodeConfirmMenu()`(1287행)를 복제한다: `insertMcmSecObjIfAbsent("ruleConfirm","버전 확정","mdm")`, `insertMcmSecMenuIfAbsent("ruleConfirm","003","5050300","버전 확정","dme","ruleConfirm")`, SYSADMIN `PERM_ALL` 행, `seedMdmObjectRbac("ruleConfirm","dme")`. Javadoc 은 TSK-08-05 와 액션 4종(search·view·validate·confirm)을 적는다. 호출은 `seedMdmMenus()` 의 `seedMdmRuleMenus();`(955행) 다음 줄. 003/5050300 자리는 08-06 D12 가 이 Task 몫으로 비워 두었다.

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 도커 금지로 생략: cd src/backend/mdm && ../gradlew :api:mssqlMigrationTest
- 사유(마감 때 오케스트레이터가 보정): 이번 Task 는 Flyway 마이그레이션도 새 네이티브 SQL 도 추가하지 않는다(새 조회는 JPQL `RuleConfirmQueries`·`RuleQueries.where`, 확정 UPDATE 는 TSK-01-03 `VersionRowStore` 의 기존 SQL). 다만 운영 SPI `@Component` `RuleConfirmCheck` 를 등록해 `VersionScenarioTestConfig` 로 컨텍스트를 올리는 `VersionStateServiceMssqlTest` 의 컨텍스트가 바뀐다. 같은 설정의 SQLite 쌍(`BusinessRuleVersionScenarioSqliteTest`·`VersionStateServiceSqliteTest`)은 게이트에서 확인하지만 MSSQL 쌍은 도커 금지로 돌리지 못한다. 머지 뒤 방언 검증(dialect_check)이 확인한다. 수용 기준 1~4 는 SQLite·vitest·Playwright 로 모두 확인하므로 이 생략으로 확인하지 못한 수용 기준은 없다.

## 담당자 확인 필요 결정

- **D1 — entry-point 그룹 코드**: 질문: spec 의 `mdr/ruleConfirm` 을 그대로 쓰나. 선택지: (a) `mdr` (b) `dme`. 결정: (b). 근거: wbs.md 1435행이 `dme/ruleConfirm` 이고, `docs/mdm/screens/README.md` 55행·식별자 사전 135행이 `ruleConfirm` 을 `dme` 에 등재했으며, 형제 화면(ruleMng·ruleEdit·ruleSetMng·ruleSetEdit)이 모두 `dme` 다. 08-02 가 확정 이동 대상을 `mdm:dme/ruleConfirm` 으로 예약했다. 반려 시 재작업: BE 패키지·BPMN 경로·FE 폴더·메뉴·serviceId 전체 이름 변경.
- **D2 — 검사 항목 구성**: 질문: 06 「상신 시 검사」 여섯 줄 가운데 무엇을 하나. 선택지: (a) 계약 enum 넷(저장 시 검사 전부·비어 있음·값 테스트·결과 변수 참조) + 공통 서비스의 적용 순서 (b) (a) + 룰 참조 (c) (a) + 적용시점 하한(리드타임·긴급). 결정: (a). 근거: spec 수용 기준 3 이 룰 참조를 빼라 하고, PRD §2 규칙 7·ADR-0002 가 적용시점 하한을 "직전 RELEASED apply_from 보다 뒤" 로 바꿨으며, 08-01 계약 enum 이 넷으로 고정했다. 반려 시 재작업: 계약 enum 변경(08-01 영역)과 보고서 행 추가.
- **D3 — 경고 확인 범위**: 질문: 저장 시 검사 WARNING(분석기 빈틈·도달 불가, 도메인 범위, 코드 참조, 필수 컬럼, 축 조합, 같은 결과 변수 중복 대입, 계약 변경)을 확정 때 모두 확인 대상으로 하나. 선택지: (a) 모든 WARNING 을 SPI warnings 로 보내 확인(MDM014)을 요구 (b) 계약 변경만 확인 대상, 나머지는 표시만. 결정: (a). 근거: ADR-0002 D4 가 SPI warnings 를 "담당자 확인 대상" 으로 정했고 06-05 도 그렇게 했다. 강약: FIRST 정책 룰은 빈틈 경고가 흔해서 확정할 때마다 확인란을 체크하게 된다. 반려 시 재작업: `RuleConfirmReport.flatten` 이 CONTRACT_CHANGED 외 WARNING 을 warnings 에서 빼고(표시 전용 칸으로 옮김) CR3·S5 기대값을 고친다.
- **D4 — 확인란을 둘로 나누나**: 질문: 06:232 "상신 화면은 경고가 있으면 확인란을 둔다" 를 어떻게 그리나. 선택지: (a) 확인란 하나 (b) 일반 경고 확인란과 계약 변경 확인란을 따로 두고 둘 다 체크해야 `warningsAcknowledged=true`. 결정: (b). 근거: 계약 변경은 호출하는 쪽을 깨는 변경이라 spec 이 따로 "계약 변경 확인란" 을 요구한다. 서버 계약(`ConfirmCommand.warningsAcknowledged` 불리언 하나)은 바꾸지 않는다. 반려 시 재작업: 대화상자 확인란 하나로 합치고 P4 를 고친다.
- **D5 — "저장 시 검사 전부" 의 범위와 계약 변경 켜기**: 질문: STORED 로 무엇이 도나. 선택지: (a) 08-04 §6.1 표의 STORED 열 그대로 + `ContractChangeCheck` 에 STORED 를 더함 (b) (a) 에서 계약 변경을 SPI 가 직접 호출 (c) STORED 에 `ExprTypeByCaseCheck` 와 08-03 열 수준 검사도 더함. 결정: (a). 근거: 06:232 가 계약 비교를 "저장과 상신 때" 한다고 적었다. `targets()` 한 줄이면 검사기의 "앞 단계 ERROR 면 원장 검사를 건너뜀" 규칙을 그대로 탄다. STORED 에서 돌지 않는 것은 다음과 같다. 08-03 열 수준 검사(변수·프로그램 변수 선언, 결과 열 그룹, 변수명)는 열 설정 적용 때 이미 거부했고 저장된 열에서 다시 볼 입력이 없다. `ExprTypeByCaseCheck` 는 케이스로 식 타입을 경고하는데, 확정에서는 TEST_CASES 가 기대값 있는 케이스를 거부로 본다(08-04 D9 근거와 같다). 반려 시 재작업: (b) 면 `targets()` 원복 + `RuleConfirmChecks` 에서 직접 호출, (c) 면 두 검사의 `targets()` 에 STORED 추가.
- **D6 — 테스트 케이스 판정 재사용 방식**: 질문: 값 테스트의 케이스 판정을 어떻게 다시 쓰나. 선택지: (a) 판정 코드를 공용 `common/rule/RuleCaseJudge` 로 옮기고 값 테스트·확정이 함께 부름 (b) 확정 컴포넌트가 `RuleValueTestService.run(VERSION, inputJson="{}", runCases=true)` 를 부르고 cases 만 씀 (c) 판정 코드를 복제. 결정: (a). 근거: 08-04 design §2 가 "08-05 가 `dme.ruleEdit` 타입을 끌고 가지 않게 한다" 고 정했고, (b) 는 버리는 본 판정을 한 번 더 돌리며 공용 패키지가 화면 패키지를 가리키게 된다. (c) 는 두 판정이 어긋날 수 있다. 강약: 08-04 파일을 고치므로 첫 커밋을 순수 이동으로 두고 기존 테스트로 동작 불변을 확인한다(I9). 반려 시 재작업: 옮긴 코드를 되돌리고 (b) 로 바꾼다.
- **D7 — 결과 변수 참조의 정의**: 질문: "조건 변수가 다른 룰의 결과 변수면 그 룰에 RELEASED 버전이 있어야 한다" 의 대상·생산 룰·통과 조건. 시안 `reqChecks` 는 `otherResults()` 가 최신 RELEASED 버전만 보므로 MDM 룰에 대해 이 검사가 절대 실패하지 않는다(시안 560-568행). 선택지: 대상 (a) 읽는 이름 전부(`RuleDefinitionReads.reads`, 식 참조 포함) (b) 식 변수가 아닌 COND 의 `VAR_NAME` 만(시안). 생산 룰 (a) 다른 룰의 모든 버전 (b) 최신 버전만. 통과 (a) 생산 룰 가운데 하나라도 RELEASED (b) 모두 RELEASED. 결정: 대상 (a), 생산 룰 (a), 통과 (a), 컬럼 사전 이름은 제외(시안 `!DICT[x.name]`). 근거: 세트 순서 검사(`RuleSetOrderCheck`)가 같은 읽는 이름 집합을 쓰므로 둘을 맞춘다. 생산 룰을 모든 버전에서 찾아야 "아직 한 번도 확정되지 않은 룰의 결과" 를 잡는다. 세트는 확정된 생산 룰 하나만 있어도 그 이름을 채울 수 있다. 반려 시 재작업: `RuleConfirmReport.resultVarIssues` 의 이름 집합·통과 조건과 CR7·SP5 기대값.
- **D8 — diff 를 SQL 이 아니라 Java 로**: 질문: 08-01 인계("규칙표 #12 FULL OUTER JOIN 실측")대로 SQL diff 를 쓰나. 선택지: (a) 06 SQL 을 네이티브로 두 방언에 씀 (b) 두 버전 행을 JPQL 로 읽고 Java 로 비교. 결정: (b). 근거: 06 이 SQLite 는 "TEXT 비교, 저장 시 키 순서를 정규화해야" 라고 적었는데, 08-02 `RuleCellsCodec.write` 는 받은 순서를 보존하므로 SQL 문자열 비교는 키 순서만 다른 같은 셀을 CHANGED 로 본다. Java 정규화 비교는 두 방언에서 같고, 도커 금지로 MSSQL 실측을 할 수 없는 이번 Task 에서 방언 위험을 없앤다. 08-01 인계의 FULL OUTER JOIN 실측은 이 결정으로 필요 없어진다. 반려 시 재작업: `RuleConfirmQueries` 에 네이티브 diff SQL 두 방언과 MSSQL 실측 시험 추가.
- **D9 — 경고 확인 흐름**: 질문: 경고가 있을 때 화면은 어떻게 `warningsAcknowledged` 를 정하나. 선택지: (a) 먼저 false 로 보내 MDM014 를 받고 다시 true 로 보냄 (b) `validate` 결과의 경고를 대화상자에 보이고 사용자가 체크하면 true 로 한 번 보냄. 결정: (b). 근거: BPMN 안에서 던진 업무 오류는 봉투에 message 만 오고 이슈 목록이 없다(06-04 F11). 서버는 어느 경우든 다시 검사한다(I28). 반려 시 재작업: 대화상자 없이 MDM014 message 를 보인 뒤 재요청 버튼을 두는 흐름.
- **D10 — 새 오류 코드**: 질문: 확정 화면 전용 오류 코드를 만드나. 결정: 만들지 않는다. MDM001·002·003·007·008·010·013·014 와 공통 `REQUIRED_VALUE`·`INVALID_VALUE`·`BUSINESS_ERROR` 로 모든 경로를 덮는다. 근거: `MdmErrorCode` 는 여러 Task 가 동시에 채번하는 공유 파일이다(06-05 D9 와 같은 원칙). 반려 시 재작업: 새 코드 추가와 머지 때 번호 조정.
- **D11 — CREATED→INUSE 계산 상태의 적용 범위**: 질문: 공통 서비스는 확정 시각에 apply_from 이 지났을 때만 저장 상태를 올린다. 미래 apply_from 으로 확정한 룰을 어떻게 다루나. 선택지: (a) ADR-0002 D6 대로 조회 셋(ruleMng·ruleEdit·ruleConfirm)은 계산 상태를 보이고, ruleMng 필터도 계산 상태로 거르며, 쓰기 경로 셋(헤더 저장·폐기·새 버전)은 저장값을 올린다 (b) ruleConfirm 화면만 계산 상태를 보이고 나머지는 한계로 남김. 결정: (a). 근거: spec 이 "CREATED→INUSE 자동 전이" 를 요구하고, (b) 면 미래 적용으로 첫 확정한 룰이 적용 뒤에도 CREATED 로 보이고 폐기(`RuleHeaderService` 120행, 저장 INUSE 요구)도 할 수 없다. 06-02·06-05 가 마스터 코드에 같은 규칙을 적용했다(`MasterCodeVersionSummary.effectiveStatus`, `CodeEditService` 386행). 강약: 08-02 파일 넷을 고친다. 룰 세트 화면(ruleSetMng·ruleSetEdit)이 담은 룰의 상태를 보이는 곳이 있으면 이번 범위에서 빼고 build-log.md 에 적는다. 반려 시 재작업: B2 를 되돌리고 ruleConfirm view 만 계산 상태를 쓴다.
- **D12 — diff 에 SAME 을 포함하나**: 질문: 06-05 는 SAME 을 내지 않았다. 결정: 06 은 낸다(`DiffKind` Javadoc·08-01 §6.5). 화면은 SAME 행을 기본으로 접는다. 반려 시 재작업: 없음(계약 관례).

## 탐색에서 얻은 관례·함정·기존 유틸

- **재사용하고 새로 만들지 않는 것**: `RuleSaveValidator`·`RuleSaveTarget.STORED`(08-04 가 08-05 용으로 준비), `StoredRuleDefinitions.read`·`assemble`·`externalTypes`, `SingleRuleDefinitionLookup`, `RuleTestCaseQueries.cases`, `RuleDefinitionReads.of`, `RuleQueries.versions`·`latestReleasedVers`, `RuleVarTypeResolver`(typeSource `COLUMN`·`RULE_RESULT`), `RuleVersions`(미적용·현재 RELEASED), `RuleStewardCheck`, `ApplyFromOrderCheck`, `VersionStateService.confirm`, `openMdmPage`/`useMdmPageParams`(`$MDM/src/shell/page-handoff.ts`, `MdmPageParams = Record<string,string>`), `MdmPageLayout`·`VersionStatusBadge`·`DraftLockBadge`, `dmc/codeConfirm` 화면 구조(page 437줄·checks 90줄·ConfirmModal 85줄·api 64줄).
- **공통 확정 트랜잭션**(`DefaultVersionStateService.confirm` 65-113행): 담당자 역할(MDM013) → DRAFT 로드 → 소유자(MDM003) → row_version(MDM001) → DRAFT(MDM002) → 미적용 하나(MDM007) → apply_from 순서(MDM008, SPI 전) → SPI check(errors → MDM010, 경고 미확인 → MDM014) → `casConfirm`(D5 칸 포함) → 직전 닫기 → apply_from ≤ now 면 `markParentInUse`. BUSINESS_RULE 의 표 명세는 `TB_MDM_RULE_VER`·키 `MARU_RULE_ID`·`VER`(정수, versionScale 0)·부모 `TB_MDM_RULE`·감사 카운터 `AUD_VER`.
- **함정 1 — fail-closed 와 가드**: 운영 BUSINESS_RULE SPI 가 없으면 `VersionSpiRegistry.confirmCheck` 가 `IllegalStateException` 을 던진다. 같은 target 에 운영 빈이 둘이면 기동이 실패한다. `MdmBusinessRuleMigrationTest` 520행이 "BUSINESS_RULE SPI 빈 0개" 를 단언하므로 B1 이 그 줄을 지워야 testAll 이 초록이다(I17).
- **함정 2 — 시나리오 후처리기**: `VersionScenarioTestConfig` 는 import 한 컨텍스트에서 `VersionConfirmCheckSpi`·`VersionDraftDeletionSpi` 운영 빈 정의를 모두 지운다. 화면 서비스가 SPI 빈(`RuleConfirmCheck`)에 기대면 `BusinessRuleVersionScenarioSqliteTest` 컨텍스트가 뜨지 않는다. 그래서 서비스는 `RuleConfirmChecks` 를 주입받는다(I16).
- **함정 3 — `@Transactional` 금지**: OASIS 진입 서비스에 붙이면 CGLIB 프록시가 파라미터 이름을 잃어 `ParameterName must not be null` 로 실패한다. dme 서비스는 모두 `TransactionTemplate` 을 쓴다.
- **함정 4 — BPMN 액션 테스트**: `DmeBpmnActionTest.assertActions`(88행)와 `MdmOasisActionVocabularyTest` 의 dme 테스트는 파일을 하나씩 지정해 EDIT 세트를 단언한다. 새 `ruleConfirm.bpmn` 은 그 목록에 없으므로 기존 테스트를 고치지 않고 `RuleConfirmBpmnActionTest` 를 따로 둔다. 전체 스캔 테스트 `mcm_시드의_allActions_는_mdm_BPMN_의_모든_action_을_담고…` 는 "allActions 안" 만 단언하고, search·view·validate·confirm 은 모두 그 안에 있다(06-05 가 확인).
- **함정 5 — 결과 변수 참조 픽스처**: 저장 경로의 해석기는 RELEASED 가 없는 룰의 결과 이름을 "다른 룰의 결과" 로 보지 않고 프로그램 변수로 다룬다(타입 선언이 없으면 거부). 그래서 SP5 의 실패 픽스처는 서비스로 만들 수 없고 JDBC 로 직접 넣는다(A 의 COND 에 `DATA_TYPE` 선언).
- **함정 6 — 검사기 게이트**: `RuleSaveValidator` 는 앞 단계 ERROR 가 있으면 `RuleSaveCheck` 빈을 부르지 않는다. SP2 처럼 셀 오류를 심으면 SP3 의 계약 변경 경고는 같은 픽스처에서 나오지 않는다. 두 시험은 픽스처를 나눈다.
- **함정 7 — page-registry 와 메뉴**: `src/frontend/m-mcm/lib/generated/page-registry.ts` 는 생성 파일이지만 git 에 추적된다. 메뉴를 시드하고 registry 에 항목이 없으면 "등록된 페이지를 찾을 수 없습니다" 가 난다. B3(메뉴)와 B4(registry)가 모두 들어간 트리에서만 E2E 를 돌린다.
- **함정 8 — 시계**: api 시험은 `DmeTestSupport.NOW`(2026-06-15 09:00:00 KST)다. 픽스처의 RELEASED apply_from 을 이보다 앞(예: 2026-01-01)으로 두면 확정 즉시 INUSE 가 되고, 미래 적용을 시험하려면 이보다 뒤(예: 2026-07-01)를 쓴다.
- **함정 9 — 셀 JSON 순서**: `RuleCellsCodec.write` 는 받은 순서를 보존한다(정규화 없음). diff 비교는 반드시 `RuleVersionDiffs.canonicalCells` 로 정규화한 뒤 한다(DF4).
- **RBAC**: dme 매트릭스는 표준 관리자 READ(search·view·export·compare), 담당자 CONFIRM(EDIT + confirm). 새 역할·새 액션이 필요 없다. 서버 권한 판정은 OASIS 액션 권한이 하고, 서비스는 `confirm` 에서만 `requireSteward` 를 한 번 더 부른다(공통 서비스도 부른다).

## 서버·E2E 기동 방법

`be-run.sh`·`fe-run.sh` 를 쓰지 않는다. 포트는 번호를 눈으로 고르지 않고 `.claude/skills/dflow-dev/scripts/free-port.sh` 로 셋(mcm BE, mdm BE, FE)을 받아 기록한다(`references/e2e.md` 「서버 프로세스」).

1. `pnpm build:libs` 를 프런트 dev 서버 기동 전에 끝낸다(heavy.sh 로 감싼다).
2. `.claude/skills/dflow-dev/scripts/heavy.sh acquire e2e-TSK-08-05` → `HEAVY_ACQUIRED` 확인(`HEAVY_BUSY` 면 다시 부른다).
3. 새 mcm.db·mdm.db 로 시작한다(기존 파일은 `mv` 로 보존). 기동 명령은 06-05·08-06 design.md 「서버·E2E 기동 방법」과 같고 포트만 받은 값으로 바꾼다(mcm `:api:bootRun --no-daemon --args='--spring.profiles.active=local --server.port=<mcm> …'`, mdm 같은 방식, FE `pnpm exec next dev --turbopack --port <fe>` 에 `MCM_WAS_URL`·`MDM_WAS_URL`·`BACKEND_API_URL` 을 받은 포트로).
4. mcm 기동 뒤 `sqlite3 mcm.db < src/frontend/e2e/fixtures/mdm-rbac-users.sql`, mdm 기동(Flyway) 뒤 `sqlite3 mdm.db < src/frontend/e2e/fixtures/mdm-ruleConfirm-data.sql`.
5. `cd src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:<fe> SMOKE_LOGIN_PASSWORD=admin123 ../../.claude/skills/dflow-dev/scripts/heavy.sh pnpm exec playwright test e2e/mdm-ruleConfirm.spec.ts --workers=1`(포그라운드).
6. 성공·실패와 상관없이 기록한 PID 와 받은 포트의 리스너만 종료하고 `heavy.sh release`. 다른 Task 의 스크린샷·`next-env.d.ts`·`test-results` 변경은 `git checkout --` 로 되돌린다. 전역 `gradlew --stop`·`pkill`·`killall` 은 쓰지 않는다.
