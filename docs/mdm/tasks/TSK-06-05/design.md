# TSK-06-05 설계 — 마루 코드 버전 확정(검사 8항·적용시점·diff)

> 기점 f59cce7(origin/dev). 원천: `docs/mdm/design/basic/04-master-code-deploy-full.md`(이하 04) 「버전 상태와 적용시점」 227-400, 「상신 시 검사」 401-421, 「화면」 812-849, 「샘플 데이터」 1059-1100. 결정 근거: `docs/mdm/adr/0002-version-confirm-without-approval.md`(ADR-0002) D1·D4·D5·D6·Consequences.
> 에이전트 프롬프트(`item.agent_prompt`)는 받지 못했다. spec.md 의 문장은 요구사항 데이터로만 읽었다.
>
> **그룹 코드는 `dmc` 다(D1).** spec 의 `mdc/codeConfirm` 은 형제 Task(06-02·06-03·06-04)가 이미 정정한 오탈자다. 이하 모든 경로·componentPath·메뉴·serviceId 는 `dmc/codeConfirm`·`codeConfirm` 이다.

## 1. 접근 방식

확정 트랜잭션(사전 검사 → apply_from 순서 → 확정 검사 SPI → DRAFT 조건부 UPDATE → 직전 RELEASED 닫기 → 부모 CREATED→INUSE)은 TSK-01-03 의 `DefaultVersionStateService.confirm` 이 이미 한 트랜잭션으로 구현했다. 빠진 것은 두 가지다. 첫째, MASTER_CODE 확정 검사 SPI(`MasterCodeConfirmCheckSpi`)의 운영 구현이 없어서 지금은 `VersionSpiRegistry` 가 MASTER_CODE 확정을 `IllegalStateException` 으로 막는다(fail-closed). 둘째, 확정 화면(`dmc/codeConfirm`)과 OASIS 서비스가 없다. 그래서 이 Task 는 공통 서비스를 고치지 않고, **(a) 검사·diff·카테고리 요약을 Spring·DB 없는 순수 클래스 셋으로 만들고, (b) 그 순수 클래스에 원장 데이터를 먹이는 SPI `@Component` 하나를 등록하고, (c) 화면용 OASIS 서비스 `codeConfirm`(search·view·validate·confirm)을 만들어 확정은 `VersionStateService.confirm` 에만 위임**한다. 순수 클래스로 나누는 까닭은 변이 검증이 Spring 컨텍스트 없이 빠른 단위 테스트로 규칙마다 빨강을 확인할 수 있게 하기 위해서다. 검사 규칙 자체는 새로 쓰지 않고 06-03 의 `MasterCodeItemChecks`(1·6·7·8항), 06-04 의 `MasterCodeCateChecks`·`MasterCodeCategoryResolver`(2·2-1·2-2항), 01-03 의 `ApplyFromOrderCheck`(3항)를 그대로 부른다. 화면은 06-02~06-04 선례(OASIS BPMN 액션 라우팅 + `@Service` 빈 + `MdmPageLayout` + `openMdmPage` 핸드오프)를 복제한다.

## 2. 변경 파일 목록

약어: `$LM` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`, `$LT` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm`, `$AM` = `src/backend/mdm/api/src/main`, `$AT` = `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm`, `$MDM` = `src/frontend/m-mdm`.

### 생성

| 파일 | 내용 | 단위 |
|---|---|---|
| `$LM/common/mastercode/MasterCodeVersionDiffs.java` | 순수. 버전 V 의 diff(§6.2) — ledger 행 목록 세 개 → `List<VersionDiffEntry>` | B1 |
| `$LM/common/mastercode/MasterCodeConfirmChecks.java` | 순수. 검사 10행 보고서 조립(§6.3), `check()` 펴기, 직전 RELEASED 판정 `previousReleased(List<VerRow>, BigDecimal)`(§6.1) | B1 |
| `$LM/common/mastercode/MasterCodeCategoryChanges.java` | 순수. 직전 RELEASED 대비 카테고리 해석 결과 요약(§6.4) | B1 |
| `$LM/common/mastercode/MasterCodeConfirmCheck.java` | `@Component` — `MasterCodeConfirmCheckSpi` 운영 구현. `MasterCodeLedgerQueries`·`MasterCodeSegmentService.viewAt` 로 데이터를 읽어 위 순수 클래스에 넘긴다. 쓰기 없음 | B1 |
| `$LM/dmc/codeConfirm/dto/CodeConfirmSearchRequest.java` | `keyword` | B2 |
| `$LM/dmc/codeConfirm/dto/CodeConfirmViewRequest.java` | `maruCodeId`, `ver`(문자열, 비면 DRAFT) | B2 |
| `$LM/dmc/codeConfirm/dto/CodeConfirmValidateRequest.java` | `maruCodeId`, `ver`, `applyFrom`(문자열 `yyyy-MM-dd HH:mm:ss`) | B2 |
| `$LM/dmc/codeConfirm/dto/CodeConfirmRequest.java` | `maruCodeId`, `ver`, `rowVersion`, `applyFrom`, `warningsAcknowledged` | B2 |
| `$LM/dmc/codeConfirm/dto/CodeConfirmView.java` 외 응답 DTO | §6.5 응답 모양. 파일 수는 Build 판단(codeEdit dto 관례: 게터·세터 POJO) | B2 |
| `$LM/dmc/codeConfirm/service/CodeConfirmService.java` | `@Service("codeConfirmService")`, `@Transactional` 금지(F9). 메서드 `search`·`view`·`validate`·`confirm` | B2 |
| `$AM/resources/services/dmc/codeConfirm.bpmn` | process id `codeConfirm`, `actionGateway` 분기 4개(§6.6) | B2 |
| `$LT/common/mastercode/MasterCodeVersionDiffsTest.java` | 순수 단위 | B1 |
| `$LT/common/mastercode/MasterCodeConfirmChecksTest.java` | 순수 단위 | B1 |
| `$LT/common/mastercode/MasterCodeCategoryChangesTest.java` | 순수 단위 | B1 |
| `$AT/common/mastercode/MasterCodeConfirmCheckSqliteTest.java` | SPI 빈 + SQLite 원장(`MasterCodeFixtures`·`MasterCodeTestConfig`) | B1 |
| `$AT/dmc/codeConfirm/CodeConfirmRequests.java` | 요청 DTO 빌더(시험 도우미, `CodeCateEditRequests` 관례) | B2 |
| `$AT/dmc/codeConfirm/CodeConfirmServiceSqliteTest.java` | 서비스 계층 | B2 |
| `$AT/dmc/codeConfirm/CodeConfirmSampleHistorySqliteTest.java` | 수용 기준 4 — 04 샘플 v1.000 → v1.001 확정 경로 재현 | B2 |
| `$AT/dmc/codeConfirm/CodeConfirmOasisHttpTest.java` | BPMN 경유 HTTP 종단 | B2 |
| `$AT/dmc/codeConfirm/CodeConfirmBpmnActionTest.java` | 액션↔메서드·권한 세트 표 | B2 |
| `$MDM/pages/dmc/codeConfirm/page.tsx` | 화면(§6.7) | B3 |
| `$MDM/pages/dmc/codeConfirm/api.ts` | OASIS 호출(`codeCateEdit/api.ts` 의 `unwrap`·`callOasis` 복제, 공유 파일을 바꾸지 않는다) | B3 |
| `$MDM/pages/dmc/codeConfirm/types.ts` | 응답 타입 | B3 |
| `$MDM/pages/dmc/codeConfirm/checks.ts` | 순수 — 상태 라벨·확정 버튼 활성 판정·apply_from 변환(§6.7) | B3 |
| `$MDM/pages/dmc/codeConfirm/ConfirmModal.tsx` | 확정 확인 대화상자(경고 확인 체크·미래 apply_from 경고) | B3 |
| `$MDM/tests/dmc/codeConfirm/checks.test.ts` | 순수 함수 vitest | B3 |
| `$MDM/tests/dmc/codeConfirm/code-confirm-page.test.ts` | 화면 렌더·fetch mock vitest(happy-dom, `code-edit-page.test.ts` 관례) | B3 |
| `docs/mdm/screens/codeConfirm/codeConfirm_기능설계서.md` | 화면 기능설계서(`codeCateEdit_기능설계서.md` 목차 그대로) | B3 |
| `src/frontend/e2e/mdm-codeConfirm.spec.ts` | 스모크 넷 + 수용 기준(§3.4) | B4 |
| `src/frontend/e2e/fixtures/mdm-codeConfirm.sql` | E2E 원장 픽스처(§3.4) | B4 |
| `docs/mdm/tasks/TSK-06-05/screens/*.png` | E2E 스크린샷 | B4 |
| `docs/mdm/tasks/TSK-06-05/build-log.md` | 구현 중 기록(변이 검증·설계 이탈·인계). Build 가 만든다 | B1~B4 |

### 수정

| 파일 | 변경 | 단위 |
|---|---|---|
| `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` | `seedMdmCodeConfirmMenu()` 추가(§6.8)와 `seedMdmMenus()` 의 호출 한 줄(`seedMdmCodeCateEditMenu();` 뒤). 기존 줄은 바꾸지 않는다 | B2 |
| `$MDM/tsup.config.ts` | `"pages/dmc/codeConfirm/page": "pages/dmc/codeConfirm/page.tsx"` 한 줄 | B3 |
| `src/frontend/m-mcm/lib/generated/page-registry.ts` | 손으로 고치지 않는다. `cd src/frontend/m-mcm && node scripts/generate-page-registry.mjs` 로 다시 만들어 `"dmc/codeConfirm"` 줄이 생긴 결과를 커밋한다(06-04 선례 50ae46f) | B3 |
| `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` | 화면 표에 `codeConfirm` 행 하나(237행 `codeCateEdit` 행과 같은 모양) | B3 |

**수정하지 않는 것**: `DefaultVersionStateService`·`VersionRowStore`·`VersionSpiRegistry`·`ApplyFromOrderCheck`(공통 서비스), `contract/**`(계약. 06-01 이 선언을 끝냈다), `ContractStubCompileTest`·`MasterCodeConfirmCheckStub`(스텁은 test 에 그대로 둔다, 06-01 §648), `VersionScenarioTestConfig`(운영 SPI 를 새로 더해도 후처리기가 시나리오 테스트를 지킨다, 06-02 §10.2), `MdmErrorCode`(새 코드를 만들지 않는다, D9), `MdmActions`·`MdmPermissions`, `codeEdit` 화면(확정 이동은 이미 `openMdmPage("dmc/codeConfirm",{maruCodeId,ver})` 로 배선돼 있다), Flyway 마이그레이션(스키마 변경 없음), `docs/mdm/decisions.md`(공용 결정 기록을 만들지 않는다. 필요해지면 임시 ID `D-TSK-06-05-<n>` 만 쓴다).

## 구현 단위

| 단위 | 범위(파일·기능) | 새 테스트 | 담당 불변 규칙 |
|---|---|---|---|
| B1 | 순수 클래스 3종(`MasterCodeVersionDiffs`·`MasterCodeConfirmChecks`·`MasterCodeCategoryChanges`) + SPI `@Component` `MasterCodeConfirmCheck` | `MasterCodeVersionDiffsTest`·`MasterCodeConfirmChecksTest`·`MasterCodeCategoryChangesTest`(lib), `MasterCodeConfirmCheckSqliteTest`(api) | I1~I16 |
| B2 | `dmc/codeConfirm` DTO·`CodeConfirmService`·`codeConfirm.bpmn` + mcm `DataInitializer` 메뉴 시드 + oasis-contract-check | `CodeConfirmServiceSqliteTest`·`CodeConfirmSampleHistorySqliteTest`·`CodeConfirmOasisHttpTest`·`CodeConfirmBpmnActionTest` | I17~I29 |
| B3 | FE 화면(`page.tsx`·`api.ts`·`types.ts`·`checks.ts`·`ConfirmModal.tsx`)·tsup 항목·page-registry 재생성·기능설계서·식별자 사전 | `checks.test.ts`·`code-confirm-page.test.ts` | I30~I35 |
| B4 | E2E 스펙·픽스처·스크린샷, 전 단위 통합 확인(전체 게이트) | `mdm-codeConfirm.spec.ts`(T1~T6) | I36~I38 |

B1 은 B2 가, B2 는 B3 가(응답 모양), B3 은 B4 가 기댄다. 단위끼리 같은 파일을 고치지 않는다. B3 가 도구 호출 80회를 넘을 것 같으면 기능설계서·식별자 사전을 B4 로 옮긴다(build-log.md 에 적는다).

## 3. 테스트 전략

모든 백엔드 시험은 SQLite·순수 단위다. 기존 `testAll` 명령 줄이 새 시험을 모두 포함한다(lib test·api test sourceSet). MSSQL·Testcontainers 시험은 만들지 않는다(§ 도커 금지로 생략한 검증).

### 3.1 lib 순수 단위(`$LT/common/mastercode/`, Spring·DB 없음)

- `MasterCodeVersionDiffsTest` — ledger 행 목록을 손으로 만들어 넘긴다.
  - DF1 04 샘플 PROC_CD V=2.000: 결과가 `ITEM:82` REMOVED, `ITEM:83` REMOVED, `CATE_ITEM:MAJOR,82` REMOVED 세 행뿐이다(04:1091 "diff(V = 2.000)" 글자 그대로).
  - DF2 V=1.001: `ITEM:83` CHANGED(old NAME `3CGl` → new NAME `3CGL`), `ITEM:2P` ADDED, `CATE_ITEM:MAJOR,2P`·`CATE_ITEM:COLD_MILL,2P` ADDED.
  - DF3 최초 버전 1.000: 모든 행이 ADDED 이고 REMOVED·CHANGED 가 없다.
  - DF4 닫힌 행과 새 행의 값이 같으면 항목을 내지 않는다(SAME 금지).
  - DF5 값 맵 키 집합: ITEM = `NAME, ALTER_NAME, SEQ, DESCRIPTION, LVL1..LVL5, ATTR01..ATTR10`, CATE = `CATE_NAME, DEF_KIND, DEF_EXPR, DEF_TARGET, DESCRIPTION`, CATE_ITEM = 빈 맵. `MARU_CODE_ID`·`CODE`·`CATE_ID`·`FROM_VER`·`TO_VER`·감사 칼럼이 없다.
  - DF6 버전 비교는 scale 무시(`new BigDecimal("2")` 와 `"2.000"` 이 같은 V).
  - DF7 정렬: 표 순서 ITEM → CATE → CATE_ITEM, 표 안에서 키 오름차순.
- `MasterCodeConfirmChecksTest` — `MasterCodeVersionView`·header·diff 를 손으로 만들어 넘긴다.
  - CK1 `report()` 는 10행이고 순서가 `MasterCodeConfirmCheckItem.values()` 와 같다.
  - CK2 항목별 한 건씩: 1항(계층 칸 값 콤마 → REJECTED), 2항(REGEX `(` → REJECTED, 허용 밖 defTarget → REJECTED), 2-1(TABLE 소속 코드가 V 에 없음 → WARNED, itemKey `CATE_ITEM:{cate},{code}`), 2-2(해당 코드 0건 → WARNED, itemKey `CATE:{cate}`), 4항(diff 빈 목록 → REJECTED), 6항(LVL_GAP·LVL_PARENT_MISMATCH → REJECTED), 7항(라벨 없는 attr 값 → REJECTED), 8항(lvl_cnt 초과 → REJECTED). 모두 통과면 각 행 PASSED.
  - CK3 최초 버전(`previousReleasedApplyFrom == null`)이면 3·4항 EXEMPT, 그 밖이면 3항 DELEGATED. 5항은 늘 DEFERRED.
  - CK4 `check()` 의 errors = REJECTED 행 이슈를 편 것, warnings = WARNED 행 이슈를 편 것. 3항 이슈는 어느 쪽에도 없다.
  - CK5 모든 이슈의 `code` 는 항목 enum `name()`, `itemKey` 는 D10 키(`ITEM:{code}`·`CATE:{cateId}`·`CATE_ITEM:{cateId},{code}`).
  - CK6 `MasterCodeItemIssueCode` 의 모든 값을 순회해, `MasterCodeItemChecks.check` 가 내는 6개(`CODE_REQUIRED`·`CODE_FORBIDDEN_CHAR` → 1항, `LVL_GAP`·`LVL_PARENT_MISMATCH` → 6항, `ATTR_WITHOUT_LABEL` → 7항, `LVL_BEYOND_CNT` → 8항)는 해당 항목으로 가고 나머지 값은 `IllegalStateException` 이다(조용히 버리지 않는다).
  - CK7 2항에서 거부된 카테고리는 2-2 경고를 내지 않는다(D10).
  - CK8 `previousReleased`: RELEASED 이면서 ver < V 인 것 중 가장 큰 ver. DRAFT·ver ≥ V 는 제외, 없으면 empty.
- `MasterCodeCategoryChangesTest`
  - CC1 04 샘플 V=1.001 대 1.000: BASE `{1P,82,83}` → `{1P,2P,82,83}`(추가 2P), MAJOR `{1P,82}` → `{1P,2P,82}`, COLD_MILL `{1P}` → `{1P,2P}`, COATING 은 그대로(SAME 목록).
  - CC2 04 샘플 V=2.000 대 1.001: COATING `{82,83}` → `{}`(줄어듦), MAJOR `{1P,2P,82}` → `{1P,2P}`(줄어듦, 빠진 82), BASE 줄어듦.
  - CC3 최초 버전(base 없음): 모든 카테고리 NEW, before 없음.
  - CC4 V 에서 닫힌 카테고리는 CLOSED·줄어듦, V 에서 추가한 카테고리는 NEW.

### 3.2 api SQLite(`$AT`, `@SpringBootTest` + `@ActiveProfiles("local")` + 임시 파일 SQLite, `MasterCodeTestConfig`(시계 2026-09-03 KST·`MutableCurrentUser`) import)

**codeConfirm·SPI 시험은 `MasterCodeTestConfig` 만 import 하고 `VersionScenarioTestConfig` 를 import 하지 않는다.** 그 설정의 후처리기가 운영 SPI 를 지우고 `VersionScenarioFakes.FakeConfirmCheck` 로 바꾸므로, import 하면 확정 시험이 실제 검사 없이 초록이 된다. 그래서 `CodeConfirmServiceSqliteTest`·`CodeConfirmSampleHistorySqliteTest` 는 각각 `VersionSpiRegistry.confirmCheck(VersionTarget.MASTER_CODE)` 가 `MasterCodeConfirmCheck` 인스턴스인지 한 번 단언한다(I28).

- `common/mastercode/MasterCodeConfirmCheckSqliteTest` — 운영 SPI 빈을 원장으로 시험한다. `MasterCodeFixtures` 의 PROC_CD 샘플을 쓴다.
  - SP1 `diff(PROC_CD@2.000)` 가 DF1 과 같고 `base` 가 `PROC_CD@1.001` 이다.
  - SP2 `report(PROC_CD@2.000, applyFrom 미래)` — 2-2 COATING WARNED, 4항 PASSED, 3항 DELEGATED, 나머지 PASSED.
  - SP3 2-1 을 만들려고 픽스처로 CATE_ITEM 행(TABLE 카테고리, V 에 없는 코드)을 직접 INSERT → 2-1 WARNED. `viewAt` 은 CATE_ITEM 을 선분으로만 거르고 코드와 교집합을 하지 않으므로(확인함, `MasterCodeItemSegmentOps.viewAt` 80-82행) 2-1 이 실제로 난다.
  - SP4 계층 칸 위반 행을 픽스처로 직접 INSERT(저장 검사를 우회) → 6항 REJECTED, `check()` errors 에 `LVL_HIERARCHY` 가 있다.
  - SP5 SPI 는 쓰기를 하지 않는다 — 호출 전후 네 표 행 수와 VER 의 `ROW_VERSION` 이 같다.
- `dmc/codeConfirm/CodeConfirmServiceSqliteTest` — 서비스 빈을 트랜잭션 없이 직접 부르고 `JdbcTemplate` 으로 단언한다(`CodeItemEditSampleDataTest` 관례).
  - S1 `search` 는 DRAFT 가 있는 MDM 원천 마루 코드만 돌려주고, keyword 로 걸러 없으면 빈 목록이다.
  - S2 `view` 는 헤더(계산 상태)·대상 버전·직전 RELEASED·diff·카테고리 요약·`serverNow` 를 돌려준다. ver 를 비우면 DRAFT 를 고른다.
  - S3 `validate` — 10행, 3항은 `ApplyFromOrderCheck` 결과로 PASSED/REJECTED(D3), 최초 버전은 EXEMPT. apply_from 이 직전 RELEASED 의 apply_from 과 같으면 3항 REJECTED, 1초 뒤면 PASSED. `futureApplyFrom` 은 서버 시계 기준.
  - S4 `validate` 는 쓰기를 하지 않는다(행 수·ROW_VERSION 불변). DRAFT 가 아니면 MDM002.
  - S5 `confirm` 거부 경로: 담당자 역할 없음(`{MDM_STD_ADMIN}`) → MDM013, 담당자지만 소유자 아님 → MDM003, row_version 불일치 → MDM001, 4항 위반(변경 없는 DRAFT) → MDM010, 경고가 있는데 `warningsAcknowledged=false` → MDM014, apply_from 이 직전과 같음 → MDM008. **어느 경우든** DRAFT 행(STATUS·APPLY_FROM·ROW_VERSION)과 직전 RELEASED 의 APPLY_TO 가 그대로다.
  - S6 `confirm` 성공: STATUS RELEASED, APPLY_FROM 희망값, APPLY_TO `9999-12-31 00:00:00`, ROW_VERSION +1, 직전 RELEASED 의 APPLY_TO = 새 APPLY_FROM, D5 칸(`REQUESTED_BY`=확정자, `REQUESTED_AT`=`RELEASED_AT`=시계, `APPROVED_BY`·`APPROVED_AT`·`EMERGENCY_YN`·`EMERGENCY_REASON`·`REJECT_REASON` NULL).
  - S7 CREATED→INUSE: 최초 버전을 apply_from = 시계와 **같은** 값으로 확정 → 저장 STATUS INUSE. 미래 apply_from 으로 확정 → 저장 CREATED 이고 `view` 계산 상태 CREATED, `MutableClock` 을 apply_from 뒤로 옮기면 `view`·`codeMng` 검색의 계산 상태가 INUSE.
  - S8 `validate` 3항 판정과 `confirm` 의 MDM008 판정이 같은 픽스처에서 일치한다(직전 RELEASED 정의 공유, I8).
  - S9 `confirm` 은 `VersionWriteGuard.beginDraftWrite` 를 부르지 않는다 — 성공 뒤 ROW_VERSION 이 정확히 +1(2 가 아니다).
- `dmc/codeConfirm/CodeConfirmSampleHistorySqliteTest` — 수용 기준 4. 시계 2026-09-03, 사용자 kim(`MDM_STEWARD`). 데이터는 화면과 같은 서비스로만 만든다: `codeMngService.register`(PROC_CD, 1.000 DRAFT + BASE) → `codeItemEditService.save`(1P·82·83(`3CGl`)) → `codeCateEditService.save`(COATING REGEX `8[0-9]` CODE, MAJOR TABLE {1P,82}, COLD_MILL TABLE {1P}) → `codeConfirmService.confirm`(1.000, `2024-01-01 00:00:00`, 2-2 경고 없음) → `codeEditService.createVersion`(MINOR → 1.001) → `codeItemEditService.save`(83 이름 `3CGL`, 2P 추가) → `codeCateEditService.save`(MAJOR·COLD_MILL 에 2P) → `codeConfirmService.confirm`(1.001, `2026-07-01 00:00:00`). 요청 모양은 `CodeItemEditRequests`·`CodeCateEditRequests` 도우미를 쓴다.
  - H1 VER 표가 04:1066-1067 과 같다: 1.000 RELEASED `2024-01-01 00:00:00`~`2026-07-01 00:00:00` MAJOR, 1.001 RELEASED `2026-07-01 00:00:00`~`9999-12-31 00:00:00` MINOR.
  - H2 ITEM 표 PROC_CD 행이 04:1070-1074 의 1.001 까지 모습과 같다(83 은 `[1.000,1.001) 3CGl` 과 `[1.001,9999) 3CGL` 두 행, 2P 는 `[1.001,9999)`). CATE_ITEM 에 MAJOR·COLD_MILL 의 2P `[1.001,9999)`.
  - H3 TB_MDM_CODE.STATUS INUSE(첫 확정의 apply_from 이 시계보다 앞이라 첫 확정 트랜잭션에서 올랐다).
  - H4 `view(PROC_CD, 1.001)` diff 가 DF2 와 같고 카테고리 요약이 CC1 과 같다.
  - H5 1.000 확정 시 `validate` 는 3·4항 EXEMPT(수용 기준 2의 서비스 판).
- `dmc/codeConfirm/CodeConfirmOasisHttpTest` — `MockMvc` 로 `/api/mdm/oasis/codeConfirm/{action}` 를 부른다(`CodeCateEditOasisHttpTest` 관례).
  - HT1 search·view·validate·confirm 성공 봉투(`data.result`).
  - HT2 confirm 이 MDM010 으로 실패하면 봉투 `meta.success=false` 이고 DRAFT 가 그대로다(OASIS 트랜잭션 롤백).
  - HT3 컨텍스트에 `VersionConfirmCheckSpi` 빈 중 target MASTER_CODE 가 정확히 하나이고 그 클래스가 `MasterCodeConfirmCheck` 다.
- `dmc/codeConfirm/CodeConfirmBpmnActionTest` — `DmcCodeBpmnActionTest.assertActions` 는 모든 액션이 EDIT 세트 안이라고 단언하므로 `confirm` 에 쓸 수 없다. 같은 파싱 방식으로 따로 짠다: 분기 이름 집합이 `{search, view, validate, confirm}`, 메서드 표 `search→search`, `view→view`, `validate→validate`, `confirm→confirm`, bean `codeConfirmService`, `search`·`view` 는 READ 세트, `validate` 는 EDIT 세트, `confirm` 은 CONFIRM 세트에만 있고 EDIT 세트에는 없다, 모든 액션이 `MdmActions` 상수 안.

### 3.3 FE vitest(`$MDM/tests/dmc/codeConfirm/`)

- `checks.test.ts` — 상태 라벨(PASSED 통과·WARNED 경고·REJECTED 거부·EXEMPT 면제·DELEGATED 공통 검사·DEFERRED 보류), `canConfirm`(DRAFT·소유자 본인·`confirm` 권한·검사 결과 있음·REJECTED 0건·검사한 apply_from 과 입력값이 같음 — 하나라도 거짓이면 false), `toServerDateTime("2026-07-01T00:00")` = `"2026-07-01 00:00:00"`·초 있는 입력 보존·빈 값 null.
- `code-confirm-page.test.ts`(happy-dom, `globalThis.fetch` mock, RBAC 는 `__dkOasisButtonRbacStore__`)
  - P1 핸드오프 `{maruCodeId, ver}` 로 열면 `view` 를 그 값으로 부른다(`takeMdmPageParams("dmc/codeConfirm")`).
  - P2 검사 결과 10행이 표로 그려지고 REJECTED 가 하나라도 있으면 확정 버튼이 비활성이다.
  - P3 경고가 있으면 확정 대화상자의 "경고를 확인했습니다" 체크 전에는 확인 버튼이 비활성이고, 체크하고 누르면 `confirm` 요청에 `warningsAcknowledged: true` 가 실린다. 경고가 없으면 `false` 다.
  - P4 `futureApplyFrom=true` 면 대화상자에 미래 적용 경고 문구가 보인다(서버 값 기준, 브라우저 시계를 보지 않는다).
  - P5 `confirm` 권한이 없는 RBAC 가짜에서는 확정 버튼이 비활성이다.
  - P6 서버가 `meta.success=false` 를 돌려주면 그 message 가 화면 오류 영역에 보인다.
  - P7 apply_from 을 검사 뒤 바꾸면 확정 버튼이 다시 비활성이 된다(검사를 다시 해야 한다).

### 3.4 브라우저 E2E — `src/frontend/e2e/mdm-codeConfirm.spec.ts`(스모크 넷 포함)

E2E 는 게이트 명령 목록(기준선 5줄)에 없다. **B4 와 Verify 가 `references/e2e.md` 의 슬롯·직접 기동 규칙으로 돌리고 결과를 보고한다**(§ 서버·E2E 기동 방법). 픽스처 `e2e/fixtures/mdm-codeConfirm.sql` 은 mdm 기동(Flyway) 뒤 한 번 넣는다. 확정이 원장을 바꾸므로 **같은 mdm.db 로 다시 돌릴 수 없다**(06-04 선례와 같다). 사용자는 `mdm-rbac-users.sql` 의 `e2e_mdm_steward`·`e2e_mdm_stdadmin`.

픽스처(모두 MDM 원천, lvl_cnt 0, 소유자 `e2e_mdm_steward`, ROW_VERSION 0):
- `E2E_CF_OK` — CREATED, 1.000 DRAFT(MAJOR), ITEM A1·A2(from 1.000), CATE BASE(REGEX `.*` CODE)·EMPTYC(REGEX `Z.*` CODE) → 2-2 경고 1건, 최초 버전.
- `E2E_CF_NOCHG` — INUSE, 1.000 RELEASED(`2026-01-01 00:00:00`~`9999-12-31 00:00:00`), 1.001 DRAFT(MINOR) 변경 없음, ITEM B1(from 1.000), BASE → 4항 거부.
- `E2E_CF_RACE` — CREATED, 1.000 DRAFT, ITEM C1, BASE → 스모크 4용.

| # | 사용자 | 단계 | 확인 |
|---|---|---|---|
| T1 | 담당자 | 메뉴 마루 MDM > 마스터코드 > 버전 확정 | 화면이 열리고 breadcrumb `마루 MDM > 마스터코드 > 버전 확정`(스모크 1, 수용 기준 5) |
| T2 | 담당자 | 확정 대기 목록 | `E2E_CF_OK`·`E2E_CF_NOCHG`·`E2E_CF_RACE` 행이 서버 데이터로 보인다. keyword `NO_SUCH` 로 조회하면 빈 상태 "확정할 DRAFT 가 없습니다"(스모크 2) |
| T3 | 담당자 | `E2E_CF_NOCHG` 선택 → apply_from `2026-10-01 00:00:00` → 검사 | diff 빈 상태 "변경된 행이 없습니다", 4항 거부, 확정 버튼 비활성(수용 기준 1) |
| T4 | 담당자 | `E2E_CF_OK` 선택 → apply_from `2026-01-01 00:00:00` → 검사 → 확정 → 대화상자에서 경고 확인 체크 → 확인 | 검사 표 3·4항 면제(수용 기준 2), 2-2 경고, 토스트 "확정했습니다", 상태 배지 RELEASED, 확정 대기 목록에서 사라진다(스모크 3) |
| T5 | 담당자 | `E2E_CF_RACE` 선택 → apply_from 입력 → 검사 → 테스트가 `page.request` 로 `codeConfirm/confirm` 을 먼저 성공시킴 → 화면 확정 → 확인 | 화면 오류 영역에 서버 문구(MDM002 "DRAFT 상태에서만 할 수 있습니다" 또는 MDM001 "다른 사용자가 수정했습니다. 다시 불러오세요")가 보인다(스모크 4) |
| T6 | 표준 관리자 | 메뉴로 열고 `E2E_CF_NOCHG` 선택 | 확정 버튼·검사 버튼이 비활성(수용 기준 3의 화면 판) |

선택 항목(시간이 남으면 T7): 담당자로 codeEdit 에서 `E2E_CF_NOCHG` 의 DRAFT 를 고르고 "확정 이동" → codeConfirm 탭이 그 코드·버전으로 열린다. 넣지 못하면 build-log.md 에 적는다(핸드오프는 P1·codeEdit 기존 vitest 가 잡는다).

스크린샷: `docs/mdm/tasks/TSK-06-05/screens/dmc-codeConfirm-{open,list,rejected,confirmed,error,readonly}.png`.

### 3.5 그 밖의 검사

- `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` ERROR 0(새 BPMN). 기준선 WARN 0 을 유지한다.
- `mantine-aggrid-ui` 스킬 규칙으로 새 FE 파일을 점검한다(shared 래퍼 사용).
- 게이트: 기준선 5줄 명령(testAll·m-mdm test·shared unit·m-mdm lint·계약 검사)에서 신규 실패 0, 총수 미감소.

## 4. 수용 기준 매핑

| # | 수용 기준 | 검증 방법 |
|---|---|---|
| 1 | 거부 1건이라도 있으면 확정 불가 | 서버: `CodeConfirmServiceSqliteTest` S5(MDM010·MDM008 뒤 DRAFT 불변), `MasterCodeConfirmChecksTest` CK4(REJECTED → errors), `CodeConfirmOasisHttpTest` HT2(롤백). 화면: `code-confirm-page.test.ts` P2, E2E T3 |
| 2 | 최초 버전은 3항 면제 | `MasterCodeConfirmChecksTest` CK3, `CodeConfirmServiceSqliteTest` S3, `CodeConfirmSampleHistorySqliteTest` H5(1.000 을 2024-01-01 로 확정), E2E T4(표에 "면제") |
| 3 | 담당자가 아닌 사용자는 확정할 수 없다 | 서버: `CodeConfirmServiceSqliteTest` S5(역할 없음 MDM013, 소유자 아님 MDM003), 권한 세트: `CodeConfirmBpmnActionTest`(`confirm` 은 CONFIRM 세트만 → dmc 매트릭스상 담당자만). 화면: P5, E2E T6 |
| 4 | 04 「샘플 데이터」 버전 이력(v1.000 → v1.001)을 확정 경로로 재현 | `CodeConfirmSampleHistorySqliteTest` H1~H4 |
| 5 | 포털 메뉴에서 화면이 열리고 e2e `mdm-codeConfirm.spec.ts` 가 통과 | 메뉴 시드(`seedMdmCodeConfirmMenu`) + E2E T1~T6 전체 통과(B4·Verify 가 직접 기동해 돌림) |

이번 Task 는 도커 금지로 확인하지 못하는 수용 기준이 없다(전부 SQLite·vitest·Playwright 로 확인한다).

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

각 규칙 뒤 괄호가 대상 테스트다. Build 의 변이 검증은 이 테스트만 돌린다.

**B1 — 검사·diff(순수·SPI)**

- I1 **`report()` 는 `MasterCodeConfirmCheckItem.values()` 순서대로 10행을 모두 담는다.** 빠지거나 순서가 바뀌면 안 된다. (`MasterCodeConfirmChecksTest` CK1)
- I2 **행 상태 결정 순서: 보류(`inScope=false` → DEFERRED) → 최초 버전 면제(`firstVersionExempt` && 직전 RELEASED 없음 → EXEMPT) → 공통 검사(`sharedCheck` → DELEGATED) → 이슈 있음(심각도 REJECT → REJECTED, WARNING → WARNED) → PASSED.** 5항은 언제나 DEFERRED 다. (`MasterCodeConfirmChecksTest` CK2·CK3)
- I3 **"최초 버전" = 직전 RELEASED 가 없는 버전이다**(ver 값이 1.000 인지로 판정하지 않는다). (`MasterCodeConfirmChecksTest` CK3 — 1.000 삭제 뒤 다시 만든 경우와 같은 "RELEASED 없는 2.000" 케이스 포함)
- I4 **`check()` = `report()` 를 편 것**: errors 는 REJECTED 행 이슈 전부, warnings 는 WARNED 행 이슈 전부, 순서는 행 순서. 3항(DELEGATED·EXEMPT) 이슈는 어느 쪽에도 넣지 않는다 — apply_from 순서는 공통 서비스가 SPI 전에 검사한다. (`MasterCodeConfirmChecksTest` CK4)
- I5 **이슈의 `code` 는 항목 enum `name()`, `itemKey` 는 D10 키 `ITEM:{code}`·`CATE:{cateId}`·`CATE_ITEM:{cateId},{code}`(구분자 `MasterCodeDiffConventions` 상수)다.** (`MasterCodeConfirmChecksTest` CK5)
- I6 **항목 매핑: `CODE_REQUIRED`·`CODE_FORBIDDEN_CHAR` → 1항, `LVL_GAP`·`LVL_PARENT_MISMATCH` → 6항, `ATTR_WITHOUT_LABEL` → 7항, `LVL_BEYOND_CNT` → 8항. 그 밖의 `MasterCodeItemIssueCode` 값은 `IllegalStateException`(조용히 버리지 않는다).** (`MasterCodeConfirmChecksTest` CK6)
- I7 **1·6·7·8항은 V 에 유효한 모든 코드 행을 검사한다**(touched = V 의 모든 코드). 저장 검사처럼 바뀐 행만 보지 않는다. (`MasterCodeConfirmChecksTest` CK2 — 바뀌지 않은 옛 행의 위반도 잡는 케이스)
- I8 **직전 RELEASED = 같은 마루 코드에서 STATUS RELEASED 이고 ver < V 인 것 중 가장 큰 ver.** SPI `diff().base`·`report` 의 최초 판정·validate 3항이 모두 이 정의 하나(`MasterCodeConfirmChecks.previousReleased`)를 쓴다. 공통 서비스의 private `previousReleased` 와 결과가 같아야 한다. (`MasterCodeConfirmChecksTest` CK8, `CodeConfirmServiceSqliteTest` S8)
- I9 **2항은 V 에 유효한 모든 카테고리(BASE 포함)를 `MasterCodeCateChecks.checkDefinition` 으로 본다. 정규식 판정은 `Pattern.compile` 하나이고 새 정규식 엔진을 만들지 않는다.** (`MasterCodeConfirmChecksTest` CK2)
- I10 **2-1·2-2 는 `MasterCodeCategoryResolver.resolve` 의 경고(`CATE_ITEM_CODE_MISSING`·`CATEGORY_EMPTY`)를 그대로 옮긴다. 판정을 재구현하지 않는다. 2항에서 거부된 카테고리는 2-2 를 내지 않는다.** (`MasterCodeConfirmChecksTest` CK2·CK7, `MasterCodeConfirmCheckSqliteTest` SP3)
- I11 **4항: 최초 버전이 아니면 diff 항목이 하나도 없을 때 REJECTED, 하나라도 있으면 PASSED**(D2). (`MasterCodeConfirmChecksTest` CK2)
- I12 **diff 는 from_ver = V 또는 to_ver = V 인 행만 본다. 같은 키의 닫힌 행과 새 행은 CHANGED 하나로 합치고, 새 행만 ADDED(oldValues null), 닫힌 행만 REMOVED(newValues null). SAME 은 내지 않고 값이 같은 쌍은 항목을 내지 않는다.** (`MasterCodeVersionDiffsTest` DF1~DF4)
- I13 **diff 값 맵 키는 물리 칼럼명(UPPER_SNAKE)이고 PK·FROM_VER·TO_VER·감사 칼럼을 넣지 않는다. CATE_ITEM 의 값 맵은 빈 맵이다.** (`MasterCodeVersionDiffsTest` DF5)
- I14 **버전 비교는 `compareTo` 로 한다(`equals` 금지 — SQLite 가 scale 이 다른 BigDecimal 을 돌려줄 수 있다).** (`MasterCodeVersionDiffsTest` DF6)
- I15 **SPI 는 쓰기를 하지 않는다**(확정 트랜잭션 안에서 불리므로 읽기만). (`MasterCodeConfirmCheckSqliteTest` SP5)
- I16 **카테고리 요약은 base·V 각각을 `MasterCodeCategoryResolver.resolve` 로 해석한 적중 코드 집합의 차이다. 빠진 코드가 있거나 V 에서 닫힌 카테고리면 "줄어듦"이다.** (`MasterCodeCategoryChangesTest` CC1~CC4)

**B2 — 서비스·BPMN·메뉴**

- I17 **확정은 `VersionStateService.confirm` 하나로만 한다.** `CodeConfirmService` 는 VER·CODE 표를 직접 UPDATE 하지 않고, `VersionWriteGuard.beginDraftWrite` 를 부르지 않는다(ROW_VERSION 이중 증가 금지). (`CodeConfirmServiceSqliteTest` S6·S9)
- I18 **`CodeConfirmService` 에 `@Transactional` 을 붙이지 않는다**(CGLIB 프록시가 OASIS 파라미터 이름을 잃는다, F9). 트랜잭션은 OASIS 프로세스와 공통 서비스의 `TransactionTemplate` 이 건다. (`CodeConfirmOasisHttpTest` HT1 — 붙이면 파라미터 바인딩 실패로 빨강)
- I19 **확정 실패는 전부 롤백된다: 어느 거부 경로에서도 DRAFT 의 STATUS·APPLY_FROM·ROW_VERSION 과 직전 RELEASED 의 APPLY_TO 가 그대로다.** (`CodeConfirmServiceSqliteTest` S5, `CodeConfirmOasisHttpTest` HT2)
- I20 **확정 권한 = 담당자 역할(MDM013) + DRAFT 소유자(MDM003).** 둘 중 하나라도 없으면 거부한다. 서비스 첫 줄에서 `MdmStewardGuard.requireSteward()` 를 부르고, 소유자 판정은 공통 서비스에 맡긴다. (`CodeConfirmServiceSqliteTest` S5)
- I21 **3항 = 직전 RELEASED 의 apply_from 보다 엄격히 뒤(같으면 거부), 최초 버전 면제, 과거 일시 허용.** 화면 표의 3항은 `validate` 가 `ApplyFromOrderCheck` 를 불러 PASSED/REJECTED 로 채우고 SPI 보고서의 DELEGATED 를 덮는다(D3). 하한(리드타임·현재 시각)을 새로 만들지 않는다. (`CodeConfirmServiceSqliteTest` S3·S5)
- I22 **`validate` 는 쓰기를 하지 않는다**(행 수·ROW_VERSION 불변). DRAFT 가 아니면 MDM002. (`CodeConfirmServiceSqliteTest` S4)
- I23 **경고가 있고 `warningsAcknowledged=false` 면 확정하지 않는다(MDM014).** 서버는 화면의 확인 여부를 믿지 않고 다시 검사한다. (`CodeConfirmServiceSqliteTest` S5)
- I24 **CREATED→INUSE: apply_from ≤ 확정 시각이면 확정 트랜잭션에서 저장 상태를 올린다(경계 포함). 미래면 저장 CREATED 로 두고 조회는 계산 상태를 돌려준다.** (`CodeConfirmServiceSqliteTest` S7)
- I25 **D5 결재 칸: `REQUESTED_BY`=확정자, `REQUESTED_AT`=`RELEASED_AT`=확정 시각, 결재·긴급·반려·철회 칸은 NULL.** 이 Task 는 긴급·사유·결재 입력을 만들지 않는다(spec 제약). (`CodeConfirmServiceSqliteTest` S6, `CodeConfirmSampleHistorySqliteTest` H1)
- I26 **04 샘플 이력(v1.000 → v1.001)이 확정 경로만으로 원천 표와 글자 그대로 같게 재현된다.** (`CodeConfirmSampleHistorySqliteTest` H1~H4)
- I27 **BPMN 액션 표: `search→search`·`view→view`·`validate→validate`·`confirm→confirm`, bean `codeConfirmService`. `confirm` 은 CONFIRM 세트에만 있다(EDIT 세트 밖).** (`CodeConfirmBpmnActionTest`)
- I28 **운영 컨텍스트에서 MASTER_CODE 확정 검사 SPI 빈은 `MasterCodeConfirmCheck` 하나다.** 테스트 스텁(`MasterCodeConfirmCheckStub`)과 `ContractStubCompileTest.CONFIRM_CHECKS` 는 고치지 않는다. codeConfirm 시험 컨텍스트는 가짜 SPI 를 쓰지 않는다(§3.2 머리). (`CodeConfirmOasisHttpTest` HT3, `CodeConfirmServiceSqliteTest`·`CodeConfirmSampleHistorySqliteTest` 의 레지스트리 단언, 기존 `ContractStubCompileTest`)
- I29 **메뉴는 dmc 폴더 아래 새 leaf(`OBJECT_ID`=`codeConfirm`, MENU_SEQ `005`, 이름 "버전 확정")이고 기존 마스터관리 메뉴를 고치지 않는다. 권한은 `seedMdmObjectRbac("codeConfirm","dmc")`(표준 관리자 READ·담당자 CONFIRM) + SYSADMIN PERM_ALL.** (E2E T1·T6 — 백엔드 단위 테스트가 없는 알려진 커버리지 갭. Verify 가 diff 로 확인한다)

**B3 — 화면**

- I30 **확정 버튼 활성 = DRAFT && 소유자 본인 && `confirm` 권한 && 검사 결과 있음 && REJECTED 0건 && 검사한 apply_from 이 지금 입력값과 같음.** (`checks.test.ts`, `code-confirm-page.test.ts` P2·P5·P7)
- I31 **사용자가 대화상자에서 경고 확인을 체크하기 전에는 `warningsAcknowledged=true` 를 보내지 않는다. 경고가 없으면 `false` 를 보낸다.** (`code-confirm-page.test.ts` P3)
- I32 **미래 apply_from 여부는 서버가 준 `futureApplyFrom`(서버 시계)으로만 판정한다. 브라우저 `Date.now()` 로 판정하지 않는다.** (`code-confirm-page.test.ts` P4)
- I33 **ver 는 문자열로 주고받는다(JS number 는 `2.000` 의 소수 자릿수를 잃는다). null·undefined 파라미터는 보내지 않는다(F23).** (`code-confirm-page.test.ts` P1·P3 의 요청 본문 단언)
- I34 **apply_from 은 `yyyy-MM-dd HH:mm:ss`(KST, 초 단위)로 보낸다.** (`checks.test.ts`)
- I35 **서버 거부 message 를 화면 오류 영역에 그대로 보인다.** (`code-confirm-page.test.ts` P6)

**B4 — 통합**

- I36 **포털 메뉴 마루 MDM > 마스터코드 > 버전 확정으로 화면이 열린다.** (E2E T1)
- I37 **화면 조작만으로 확정이 끝나고 목록·상태 배지에 반영된다.** (E2E T4)
- I38 **표준 관리자는 화면에서 검사·확정을 누를 수 없다.** (E2E T6)

## 6. 상세 설계

### 6.1 데이터 읽기(SPI `MasterCodeConfirmCheck`)

- 버전 목록: `MasterCodeLedgerQueries.versions(maruCodeId)` → `VerRow`. 직전 RELEASED 는 `MasterCodeConfirmChecks.previousReleased(rows, V)`(I8).
- V 의 모습: `MasterCodeSegmentService.viewAt(VersionRef V)`(유일 구현 `DefaultMasterCodeSegmentService`). 직전 RELEASED 의 모습도 같은 메서드로 읽는다.
- diff 용 전체 선분: `MasterCodeLedgerQueries.items/cates/cateItems(maruCodeId)`(fromVer·toVer 포함, 버전 선택은 Java 에서).
- 헤더: `MasterCodeLedgerQueries.header(maruCodeId)` → `lvlCnt`·`attrNames`(라벨은 버전이 없는 헤더 값).
- 새 네이티브 SQL 을 쓰지 않는다. 그래서 MSSQL 방언 영향이 없다.

### 6.2 diff(`MasterCodeVersionDiffs`)

```java
public static List<VersionDiffEntry> diff(BigDecimal v, List<ItemRow> items, List<CateRow> cates, List<CateItemRow> cateItems)
```
- 표마다 `fromVer.compareTo(v)==0` 인 행(새)과 `toVer.compareTo(v)==0` 인 행(닫힘)을 키로 묶는다. 키는 D10(`ITEM:{code}`, `CATE:{cateId}`, `CATE_ITEM:{cateId},{code}`).
- 둘 다 있으면 값 맵을 비교해 다르면 CHANGED(old = 닫힌 행, new = 새 행), 같으면 내지 않는다. 새만 있으면 ADDED, 닫힘만 있으면 REMOVED.
- 값 맵은 `LinkedHashMap`(null 값 허용). 정렬은 DF7.
- SPI `diff(draft)` 는 `new VersionDiff(base, draft, entries)` 이고 base 는 직전 RELEASED 의 `VersionRef`(없으면 null).

### 6.3 검사 보고서(`MasterCodeConfirmChecks`)

```java
public static MasterCodeConfirmCheckReport report(VersionRef draft, boolean firstVersion, MasterCodeItemChecks.Header header,
        MasterCodeVersionView view, List<VersionDiffEntry> diff)
public static ConfirmCheckResult flatten(MasterCodeConfirmCheckReport report)
public static Optional<VerRow> previousReleased(List<VerRow> versions, BigDecimal v)
```
- 1·6·7·8항: `MasterCodeItemChecks.check(header, V 의 코드 전부를 MasterCodeItemEntry 로, V 의 코드 전부)` 결과를 I6 표로 나눈다. 이슈의 message·field 는 원래 값을 두고 code·itemKey 만 바꾼다(I5).
- 2항: V 의 카테고리마다 `MasterCodeCateChecks.checkDefinition(def)`. itemKey `CATE:{cateId}`.
- 2-1·2-2: 2항을 통과한 카테고리마다 `MasterCodeCategoryResolver.resolve(V 의 코드, cate, V 의 CATE_ITEM)` 의 warnings 를 나눈다(`CATE_ITEM_CODE_MISSING` → 2-1, itemKey `CATE_ITEM:{cateId},{원래 itemKey}`, `CATEGORY_EMPTY` → 2-2, itemKey `CATE:{cateId}`).
- 4항: 최초 버전이 아니고 diff 가 비면 이슈 하나(`HAS_CHANGES`, "직전 RELEASED 대비 바뀐 행이 없습니다. 이름·설명만 고치려면 경미 수정을 쓰세요", field null, itemKey null).
- 행 상태는 I2 순서. SPI `report(request)` 의 `firstVersion` = `request.previousReleasedApplyFrom() == null`, SPI `check(request)` = `flatten(report(request))`.
- **알려진 동작**: `MasterCodeItemChecks` 는 한 행에서 형식 위반(1·8항, LVL_GAP)이 있으면 앞 칸 불일치(LVL_PARENT_MISMATCH)를 보지 않는다. 그래서 한 행에 1항과 6항 위반이 함께 있으면 그 행의 6항 위반이 표에 나오지 않을 수 있다. 1항 거부로 어차피 확정은 막히므로 이 동작을 바꾸지 않는다.

### 6.4 카테고리 요약(`MasterCodeCategoryChanges`)

```java
public record Change(String cateId, String cateName, String kind /* NEW|CLOSED|CHANGED */, Integer beforeCount, Integer afterCount,
                     List<String> addedCodes, List<String> removedCodes, boolean reduced) {}
public record Summary(List<Change> changed, List<String> unchanged) {}
public static Summary summarize(MasterCodeVersionView base /* nullable */, MasterCodeVersionView target)
```
- base·target 의 카테고리 ID 합집합을 돈다. 적중 집합은 `resolve(...).rows` 중 `hit`. 추가·빠진 코드는 코드 오름차순.
- 적중 집합이 같고 정의가 양쪽에 있으면 `unchanged` 에 이름만 넣는다. `reduced` = 빠진 코드가 있거나 CLOSED.

### 6.5 OASIS 서비스 `codeConfirm`(`CodeConfirmService`)

| 액션 | 메서드 | 입력 | 출력(`data.result`) | 권한 세트 |
|---|---|---|---|---|
| search | `search(CodeConfirmSearchRequest)` | keyword | `rows[]`: maruCodeId, maruCodeName, ver(문자열 `"1.001"`), verLabel(`"v1.001"`), verKind, ownerId, codeStatus(계산) — MDM 원천이고 DRAFT 가 있는 코드의 DRAFT 마다 한 행, ID·ver 오름차순 | READ |
| view | `view(CodeConfirmViewRequest)` | maruCodeId, ver(선택) | `header`{maruCodeId, maruCodeName, status(계산), sourceKind}, `version`{ver, verLabel, verKind, status, ownerId, rowVersion, applyFrom, applyTo, requestedBy, releasedAt, restoredFrom}, `previous`{ver, verLabel, applyFrom} 또는 null, `firstVersion`, `diff`[{table, key, kind, oldValues, newValues}], `categoryChanges`[…], `unchangedCategories`[…], `serverNow` | READ |
| validate | `validate(CodeConfirmValidateRequest)` | maruCodeId, ver, applyFrom | `rows`[{no, item, severity, status, issues[{code, message, field, itemKey}]}](10행, 3항은 D3 로 덮음), `rejectedCount`, `warnedCount`, `applyFrom`(정규화), `futureApplyFrom`, `serverNow` | EDIT(`validate`) |
| confirm | `confirm(CodeConfirmRequest)` | maruCodeId, ver, rowVersion, applyFrom, warningsAcknowledged | `confirmed`{ver, rowVersion}, `closedPreviousVer`(없으면 null), `warnings`[…], 확정 뒤 `view` 와 같은 모양 | CONFIRM(`confirm`) |

- 날짜 문자열은 `yyyy-MM-dd HH:mm:ss`(`CodeEditService.TEXT` 와 같은 형식)로 주고받는다. 파싱 실패는 `ErrorCode.INVALID_VALUE`(field `applyFrom`), 빈 값은 `REQUIRED_VALUE`.
- `view`·`validate` 의 계산 상태는 `MasterCodeVersionSummary`(06-02) 를 쓴다(D6 조회 계산값).
- `confirm` 은 `stewardGuard.requireSteward()` → `versionState.confirm(new ConfirmCommand(ref, rowVersion, applyFrom, currentUser.userId(), warningsAcknowledged))` → flush 뒤 조회 모델로 응답(I17·I20).
- 업무 오류는 BPMN 안에서 던지면 봉투에 `meta.message` 만 오고 `errors[]` 는 비어 있다(06-04 F11). 그래서 화면은 경고 목록을 MDM014 오류에서 읽지 않고 `validate` 응답에서 읽는다(D6).

### 6.6 BPMN `services/dmc/codeConfirm.bpmn`

`codeEdit.bpmn` 모양을 복제한다: startEvent → `exclusiveGateway id="actionGateway"`(camunda:property `input=action`) → 분기 4개(`sequenceFlow name` = 액션) → `bpmn:serviceTask camunda:class="codeConfirmService"` + camunda:property `method=`·`output="result"` → endEvent. 작성 뒤 계약 검사 ERROR 0.

### 6.7 화면 `dmc/codeConfirm`

`MdmPageLayout`(그룹 "마스터코드", 제목 "버전 확정"). 영역:
1. **확정 대기 목록**(`cf-list`, 왼쪽): keyword 입력(`cf-keyword`)·조회, 행(`cf-row-{maruCodeId}-{ver}`) = ID·이름·버전·종류·소유자. 비면 "확정할 DRAFT 가 없습니다"(`cf-list-empty`). 행을 누르면 `view`.
2. **확정 폼**(`cf-form`): 대상 `PROC_CD v1.001 MINOR` + `VersionStatusBadge` + `DraftLockBadge`, 직전 RELEASED(`v1.000 · 2024-01-01 00:00:00`, 없으면 "최초 버전 — 적용 순서 검사를 하지 않습니다"), 희망 apply_from(`cf-apply-from`, `datetime-local` step 1), 검사 버튼(`cf-validate`, RBAC `validate`), 확정 버튼(`cf-confirm`, I30). DRAFT 가 아니면 폼은 읽기 전용이고 확정 결과(apply 구간·확정자)를 보인다.
3. **검사 결과 표**(`cf-checks`): 행(`cf-check-{no}`) = 번호·검사·결과(`cf-check-status-{no}`, 라벨은 §3.3)·상세(이슈 message 와 itemKey). 거부 행은 강조.
4. **diff**(`cf-diff`): 표 = 테이블·키·변경(추가·삭제·수정)·이전·이후. 비면 "변경된 행이 없습니다"(`cf-diff-empty`). 그 아래 **바뀐 카테고리 요약**(`cf-cate-summary`): 카테고리별 `{이전 n건} → {이후 m건}`·추가·빠진 코드, 줄어든 카테고리 강조, 그대로인 카테고리 이름 한 줄.
5. **오류 영역**(`cf-error`): 서버 message.
6. **확정 대화상자**(`ConfirmModal`): 경고가 있으면 목록과 체크박스(`cf-ack`) — 체크 전에는 확인(`cf-modal-ok`) 비활성. `futureApplyFrom` 이면 문구 "적용 시작 일시가 미래입니다. 그 시각이 올 때까지 이 버전을 고치거나 새 버전을 만들 수 없습니다(철회 없음)."(ADR-0002 Consequences). 성공 토스트 "확정했습니다" 뒤 `view`·`search` 다시 부름.
- 진입: `useMdmPageParams("dmc/codeConfirm", tabId, p => …)` 로 `{maruCodeId, ver}` 를 받아 snapshot 에 넣는다(06-02 §6.10, 우선순위 handoff > snapshot).
- 시안 탭7 의 상신 일시·긴급 상신·긴급 사유·반려 사유·승인·반려 영역은 만들지 않는다(spec 제약).

### 6.8 메뉴 시드(`DataInitializer.seedMdmCodeConfirmMenu`)

`seedMdmCodeCateEditMenu()`(1185-1198행)를 복제한다: `insertMcmSecObjIfAbsent("codeConfirm","버전 확정","mdm")`, `insertMcmSecMenuIfAbsent("codeConfirm","005","5030500","버전 확정","dmc","codeConfirm")`, SYSADMIN `PERM_ALL` 행, `seedMdmObjectRbac("codeConfirm","dmc")`. Javadoc 은 TSK-06-05 와 액션 4종(search·view·validate·confirm)을 적는다. 호출은 `seedMdmMenus()` 의 `seedMdmCodeCateEditMenu();` 다음 줄.

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 해당 없음 — 이번 Task 는 Flyway 마이그레이션도 새 네이티브 SQL 도 추가하지 않는다. 확정 UPDATE 는 TSK-01-03 의 `VersionRowStore` 가 이미 가진 SQL 을 그대로 쓰고, 새 조회는 기존 `MasterCodeLedgerQueries`·`viewAt` 만 쓴다. 그래서 이 Task 몫의 MSSQL 실측 대상이 없다. 기존 `mssqlMigrationTest`(`MasterCodeVersionStateMssqlTest` 등)는 기준선 명령에 원래 들어 있지 않아 제외할 것도 없다.

## 담당자 확인 필요 결정

- **D1 — entry-point 그룹 코드**: 질문: spec 의 `mdc/codeConfirm` 을 그대로 쓰나. 선택지: (a) `mdc` (b) `dmc`. 결정: (b). 근거: `docs/mdm/screens/README.md` §3 이 `codeConfirm` 을 `dmc` 에 등재했고, `MdmOasisConventions.GROUP_CODE_PATTERN="^dm[a-z]$"` 가 `mdc` 를 허용하지 않으며, codeEdit 의 확정 이동이 이미 `dmc/codeConfirm` 을 연다. 반려 시 재작업: BE 패키지·BPMN 경로·FE 폴더·메뉴·serviceId 전체 이름 변경.
- **D2 — 4항 해석**: 질문: "직전 RELEASED 대비 추가·닫힘·변경 행이 있다 | 거부 … 설명·이름만 고치는 것은 경미 수정으로 한다"를 어떻게 읽나. 선택지: (a) diff 행이 하나도 없으면 거부, 하나라도 있으면 통과 (b) (a)에 더해 ITEM 의 NAME·ALTER_NAME·SEQ·DESCRIPTION 만 바뀐 CHANGED 뿐이면 거부. 결정: (a). 근거: 시안 탭7 이 이 항목을 "바뀐 행이 있다 → 통과(추가 2, 변경 1)" 로 그리고, 06-01 계약 enum 주석이 "직전 RELEASED 대비 변경이 있다" 이며, 04 샘플 v1.001("냉연 라인 2기 추가") 도 이름 수정(83)과 추가(2P)를 한 버전에 담는다. 경미 수정 문장은 "그런 수정은 버전 없이 할 수 있다"는 안내로 읽었다. 반려 시 재작업: `MasterCodeConfirmChecks` 4항에 "경미 칼럼만 바뀐 CHANGED 는 변경으로 세지 않음" 조건을 더하고 CK2·H4 기대값을 고친다.
- **D3 — 3항 표시**: 질문: 계약상 SPI 보고서의 3항은 DELEGATED 인데 화면은 3항 결과를 어떻게 보이나. 선택지: (a) DELEGATED 그대로 "공통 검사"로 보임 (b) `validate` 서비스가 `ApplyFromOrderCheck` 를 불러 3항 행을 PASSED/REJECTED 로 덮음. 결정: (b). 근거: spec 요구사항이 "3항은 직전 RELEASED apply_from 보다 뒤로 검사"와 "검사 8항 결과 표(통과·경고·거부)"를 함께 요구한다. SPI 계약(3항 DELEGATED, check() 에 3항 없음)은 바꾸지 않는다. 반려 시 재작업: `validate` 의 덮기 한 곳을 지우고 화면 라벨만 남긴다.
- **D4 — 액션 구성**: 질문: diff 를 별도 `compare` 액션으로 두나. 선택지: (a) search·view·compare·validate·confirm (b) search·view·validate·confirm(diff 는 view 에 포함). 결정: (b). 근거: diff 는 버전을 여는 순간 늘 필요하고 입력이 view 와 같다. 액션이 적을수록 BPMN·권한 표가 단순하다. 반려 시 재작업: BPMN 분기 하나와 `CodeConfirmBpmnActionTest` 표 한 줄 추가.
- **D5 — 운영 `CodeLookup` 빈 등록**: 질문: 06-02 D5·decisions.md(637행)가 "06-05 이후 판단"으로 넘긴 `MdmCodeLookup` 운영 등록을 이번에 하나. 선택지: (a) 등록(`@Component`) (b) 등록하지 않음. 결정: (b). 근거: spec 요구사항·수용 기준에 엔진 판정이 없고, 등록하면 TSK-04-03 도메인 저장 R10 거부·MASTER 판정이 켜져 이 Task 범위 밖의 동작과 테스트가 바뀐다. 이제 확정 경로가 생겼으므로 등록 시점은 엔진을 쓰는 첫 Task(또는 담당자 지시)가 정하도록 다시 인계한다. 반려 시 재작업: `MdmCodeLookup` 에 `@Component` 한 줄 + TSK-04-03 테스트(`DomainMngWithoutCodeLedgerTest` 등) 기대값 조정.
- **D6 — 경고 확인 흐름**: 질문: 경고(2-1·2-2)가 있을 때 화면은 어떻게 `warningsAcknowledged` 를 정하나. 선택지: (a) 먼저 false 로 보내 MDM014 를 받고 다시 true 로 보냄 (b) `validate` 결과의 경고를 대화상자에 보이고 사용자가 체크하면 true 로 한 번 보냄. 결정: (b). 근거: BPMN 안에서 던진 업무 오류는 봉투에 message 만 오고 이슈 목록이 없어(06-04 F11) (a) 로는 경고 내용을 보여 줄 수 없다. 서버는 어느 경우든 다시 검사하므로(I23) 화면 판단을 믿지 않는다. 반려 시 재작업: 대화상자 없이 MDM014 message 를 보인 뒤 재요청 버튼을 두는 흐름으로 바꾼다.
- **D7 — 미래 apply_from 경고**: 질문: ADR-0002 가 확정 화면에 요구한 "미래 apply_from 확인 경고"를 어디서 판정하나. 선택지: (a) 브라우저 시계 (b) 서버 시계(`validate` 의 `futureApplyFrom`). 결정: (b). 근거: 적용 구간은 KST 서버 시계 기준이고 브라우저 시계는 틀릴 수 있다. 서버는 이 경고를 강제하지 않는다(ADR-0002 D4 에 없는 검사라 새로 만들지 않는다). 반려 시 재작업: 서버에 확인 플래그를 더하는 계약 변경(공통 서비스 수정)이 필요하다.
- **D8 — 이슈 세부 코드**: 질문: `MasterCodeItemChecks`·`MasterCodeCateChecks` 의 세부 코드(`LVL_GAP` 등)를 보고서 이슈에 어떻게 남기나. 선택지: (a) code 를 항목 enum 으로 바꾸고 세부는 message·field 로만 남김 (b) 계약에 세부 코드 칸 추가. 결정: (a). 근거: 06-01 계약이 `code = 항목 enum name()` 을 정했고 계약을 바꾸지 않는다. 사용자에게 필요한 정보는 message·field·itemKey 에 있다. 반려 시 재작업: 계약 record 변경(06-01 영역)과 스텁 수정.
- **D9 — 새 오류 코드**: 질문: 확정 화면 전용 오류 코드를 만드나. 결정: 만들지 않는다. MDM001·002·003·007·008·010·013·014 와 공통 `REQUIRED_VALUE`·`INVALID_VALUE` 로 모든 경로를 덮는다. 근거: `MdmErrorCode` 는 여러 Task 가 동시에 채번하는 공유 파일이다(06-04 D6 과 같은 원칙). 반려 시 재작업: 새 코드 추가와 머지 때 번호 조정.
- **D10 — 2-2 중복 억제**: 질문: 정규식 문법 오류로 2항 거부된 카테고리가 결과 0건이라 2-2 경고까지 내는 것을 허용하나. 결정: 허용하지 않는다(2항 거부 카테고리는 2-2 를 건너뛴다). 근거: 같은 원인이 거부와 경고로 두 번 보이면 사용자가 경고 확인 체크로 풀 수 있다고 오해한다. 반려 시 재작업: `MasterCodeConfirmChecks` 한 조건 제거와 CK7 삭제.

## 탐색에서 얻은 관례·함정·기존 유틸

- **재사용하고 새로 만들지 않는 것**: `MasterCodeItemChecks`(1·6·7·8항, Javadoc 이 "06-05 확정 검사가 같은 규칙을 다시 쓴다"고 명시), `MasterCodeCateChecks.checkDefinition`·`validRegex`(2항), `MasterCodeCategoryResolver.resolve`(2-1·2-2·카테고리 요약), `ApplyFromOrderCheck`(3항), `MasterCodeLedgerQueries`(버전·선분 조회), `MasterCodeSegmentService.viewAt`(V 의 모습), `MasterCodeVersionSummary`(계산 상태·"v1.001" 표시), `MasterCodeVersionNumbers`(표시 번호), `MdmStewardGuard`, `openMdmPage`/`useMdmPageParams`(`$MDM/src/shell/page-handoff.ts`), `MdmPageLayout`·`VersionStatusBadge`·`DraftLockBadge`.
- **공통 확정 트랜잭션**(`DefaultVersionStateService.confirm`, 01-03): 담당자 역할(MDM013) → DRAFT 로드 → 소유자(MDM003) → row_version(MDM001) → DRAFT(MDM002) → 미적용 하나(MDM007) → apply_from 순서(MDM008, SPI 전) → SPI check(errors → MDM010, 경고 미확인 → MDM014) → `casConfirm`(D5 칸 포함) → 직전 닫기 → apply_from ≤ now 면 `markParentInUse`. apply_from 은 초 단위로 자르고 `9999-12-31 00:00:00` 이상이면 거부한다.
- **함정 1 — fail-closed**: 운영 MASTER_CODE SPI 가 없으면 `VersionSpiRegistry.confirmCheck` 가 `IllegalStateException` 을 던진다. B1 이 `MasterCodeConfirmCheck` 를 등록하면 풀린다. 시나리오 테스트(`VersionScenarioTestConfig` import)는 후처리기가 운영 SPI 를 지우므로 손대지 않아도 초록이다(06-02 §10.2). 같은 target 에 운영 빈이 둘이면 기동이 실패한다.
- **함정 2 — `@Transactional` 금지(F9)**: OASIS 진입 서비스에 붙이면 CGLIB 프록시가 파라미터 이름을 잃어 `ParameterName must not be null` 로 실패한다.
- **함정 3 — 요청 모양**: FE 는 null 파라미터를 빼고 보낸다(F23). ver 는 문자열. 그리드가 없는 액션이므로 `grids` 를 보내지 않는다. boolean `warningsAcknowledged` 바인딩은 Build 가 HTTP 테스트로 확인한다(문자열 `"true"` 가 필요하면 build-log.md 에 적는다).
- **함정 4 — `DmcCodeBpmnActionTest.assertActions`** 는 모든 액션이 EDIT 세트 안이라고 단언한다. `confirm` 은 CONFIRM 세트에만 있으므로 이 도우미를 재사용하지 말고 `CodeConfirmBpmnActionTest` 에서 따로 단언한다. BPMN 전체를 훑는 기존 테스트는 `MdmOasisActionVocabularyTest.mcm_시드의_allActions_는_mdm_BPMN_의_모든_action_을_담고…` 하나이고, 이 테스트는 "mcm `allActions`(PERM_ALL) 안" 만 단언한다(EDIT 세트 단언은 dme 두 파일에만 건다, 확인함). `search`·`view`·`validate`·`confirm` 은 모두 `DataInitializer` 298-322행 `allActions` 에 있으므로 새 BPMN 이 자동으로 스캔되어도 초록이다 — 기존 테스트를 고치지 않는다. 다른 `*BpmnActionTest`(dma·dmd·dme·codeItemEdit·codeCateEdit)는 자기 BPMN 파일만 읽는다.
- **함정 5 — 2-1 재현**: 화면·서비스 저장 경로는 없는 코드의 소속 저장을 막고(06-04 불변 규칙 5), 코드 삭제는 소속을 연쇄로 닫는다. 그래서 2-1 은 픽스처 직접 INSERT 로만 만든다(SP3).
- **함정 6 — 시계**: api 시험은 `MasterCodeTestConfig` 의 `MutableClock`(2026-09-03 00:00 KST)을 쓴다. 04 샘플의 apply_from(2024-01-01, 2026-07-01)은 둘 다 이 시계보다 앞이라 확정 즉시 INUSE 가 되고 미적용 버전도 남지 않는다(F15 와 같은 이유).
- **함정 7 — page-registry**: `src/frontend/m-mcm/lib/generated/page-registry.ts` 는 생성 파일이지만 git 에 추적된다. 손으로 고치지 말고 생성 스크립트로 다시 만든 결과를 커밋한다.
- **RBAC**: dmc 매트릭스는 표준 관리자 READ(search·view·export·compare), 담당자 CONFIRM(EDIT + confirm). 새 역할·새 액션이 필요 없다. `mdm-rbac-seed-check.expected.txt` 는 화면별 항목을 나열하지 않아 고칠 필요가 없다.
- **E2E 샘플 스모크**: `mdm-sample-smoke.spec.ts` 는 메뉴 화면마다 "등록된 페이지를 찾을 수 없습니다" 가 없는지 본다. 메뉴를 시드하고 page-registry 에 항목이 없으면 이 스펙이 깨지므로 B2(메뉴)와 B3(registry)가 함께 머지돼야 한다.

## 서버·E2E 기동 방법

`be-run.sh`·`fe-run.sh` 를 쓰지 않는다. 06-03(18603·18696·15603)·06-04(18604·18697·15604)와 겹치지 않게 **mcm BE 18605, mdm BE 18698, FE 15605** 를 기본값으로 하되, 기동 직전 `lsof -i :<port>` 로 비었는지 다시 확인하고 차 있으면 다른 빈 포트를 고른다.

1. `.claude/skills/dflow-dev/scripts/heavy.sh acquire e2e-TSK-06-05` → `HEAVY_ACQUIRED` 확인(`HEAVY_BUSY` 면 다시 부른다).
2. 새 mcm.db·mdm.db 로 시작한다(기존 파일은 `mv` 로 보존). 기동 명령은 06-04 design.md 「서버·E2E 기동 방법」과 같고 포트만 바꾼다(mcm `:api:bootRun --no-daemon --args='--spring.profiles.active=local --server.port=18605 …'`, mdm 같은 방식 18698, FE `pnpm exec next dev --turbopack --port 15605` 에 `MCM_WAS_URL`·`MDM_WAS_URL`·`BACKEND_API_URL` 을 새 포트로).
3. mcm 기동 뒤 `sqlite3 mcm.db < src/frontend/e2e/fixtures/mdm-rbac-users.sql`, mdm 기동(Flyway) 뒤 `sqlite3 mdm.db < src/frontend/e2e/fixtures/mdm-codeConfirm.sql`.
4. `cd src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15605 SMOKE_LOGIN_PASSWORD=admin123 ../../.claude/skills/dflow-dev/scripts/heavy.sh pnpm exec playwright test e2e/mdm-codeConfirm.spec.ts --workers=1`(포그라운드).
5. 성공·실패와 상관없이 기록한 PID 와 고른 포트의 리스너만 종료하고 `heavy.sh release`. 다른 Task 의 스크린샷·`next-env.d.ts`·`test-results` 변경은 `git checkout --` 로 되돌린다.
