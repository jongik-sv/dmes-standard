# TSK-07-02 Build 로그

## 구현 단위 B1 — 완료

범위: 공용(`DataCategoryResolver` 신설, `DataItemListQuery.targetValue`/`matches` 추출, `DataSegmentRowStore`
메서드 2개 추가, `dataHandoff.ts` 신설) + dataMng 백엔드/프런트/BPMN/e2e + 메뉴 시드 3개 + `mdm-dataMng.sql`.

### 새 파일

- `common/segment/DataCategoryResolver.java`(+ `DataCategoryResolverSqliteTest.java`)
- `dmd/dataMng/service/DataMngService.java`, `dmd/dataMng/dto/{DataMngSearchRequest,DataMngSearchResult,DataMngRow,DataMngRegRequest,DataMngRegResult}.java`(+ `DataMngServiceSqliteTest.java`)
- `services/dmd/dataMng.bpmn`(process `dataMng`, bean `dataMngService`, 액션 `search`·`reg`)
- `pages/dmd/dataMng/{api.ts,page.tsx,types.ts,columns.ts}`, `pages/dmd/dataHandoff.ts`(+ `tests/dmd/dataHandoff.test.ts`)
- `e2e/mdm-dataMng.spec.ts`, `e2e/fixtures/mdm-dataMng.sql`

### 수정 파일

- `DataItemListQuery.java` — `targetValue`/`matches` 삭제, `DataCategoryResolver.targetValue`/`matches` 호출(F20, 동작 변경 없음. `DataItemMngServiceSqliteTest` 그대로 통과로 확인).
- `DataSegmentRowStore.java` — `latestCateRows`·`openMemberCodes` 추가(기존 메서드 무변경).
- `DmdBpmnActionTest.java` — `dataMng_액션은_search_reg()` 추가.
- `DmdOasisHttpTest.java` — `M1_dataMng_등록은...`·`M2_dataMng_ID_중복은...` 추가.
- `mcm/api/.../init/DataInitializer.java` — `seedMdmDataMngMenus()`(001~003, F2 예약 시퀀스) 추가, `seedMdmDataItemMenus()` 앞에서 호출.
- `src/frontend/m-mdm/tsup.config.ts` — `pages/dmd/dataMng/page` 엔트리 추가(아래 「설계 이탈」 참고, design.md 파일 목록에는 없던 필수 파일).

## 설계 이탈

1. **tsup.config.ts 엔트리 추가(design.md 파일 목록 밖)** — `pages/dmd/dataMng/page.tsx` 를 만든 뒤
   `pnpm --filter @dk-oasis/m-mdm test` 를 돌리니 `tests/tsup-entries.smoke.test.ts`(기존 회귀 테스트)가 빨강이었다.
   `page-registry.ts` 는 자동 생성(F21)이지만 `m-mdm/tsup.config.ts` 의 번들 엔트리 맵은 **수동**이라 새 화면마다
   한 줄을 더해야 한다는 사실을 design.md 가 언급하지 않았다. `"pages/dmd/dataMng/page": "pages/dmd/dataMng/page.tsx"`
   한 줄을 기존 화면들과 같은 자리에 추가해 해결했다(다른 화면 줄은 그대로). B2·B3 도 각자 화면을 추가할 때
   같은 파일에 한 줄씩 더해야 한다 — design.md §2 파일 목록에 이 사실이 빠져 있으므로 여기 적는다.
2. **portal-open-tab 의 pageId 접두어 교정** — design.md D7 은 `window.dispatchEvent(new CustomEvent("portal-open-tab",
   {detail:{pageId:"dmd/dataEdit"}}))` 로 접두어 없이 적었다. 그런데 `m-mcm/app/portal/page.tsx:47` 주석
   "pageId 형식: `{moduleId}:{componentPath}`(예: `mcm:csa/commUserMng`)"과, 이미 있는 두 선례
   (`src/shell/page-handoff.ts` 의 `pageIdOf` = `"mdm:" + componentPath`, `src/dme/rule-handoff.ts` 의
   `RULE_EDIT_PAGE_ID = "mdm:dme/ruleEdit"`)가 전부 `mdm:` 접두어를 쓴다. 접두어 없이 `dmd/dataEdit` 만 보내면
   `resolvePage` 가 모듈을 못 갈라 탭이 빈 페이지("등록된 페이지를 찾을 수 없습니다")로 열린다 — 수용 기준
   "등록 후 수정 화면으로 이동"이 깨진다. 그래서 `dataMng/page.tsx` 는 `DATA_EDIT_PAGE_ID = "mdm:dmd/dataEdit"`
   (접두어 있음)로 구현했다. B2 는 `dataEdit` 화면의 page-registry 항목이 이 값과 맞는지(자동 생성이라 신경 쓸
   필요는 없지만) 확인만 하면 된다 — B2 쪽에서 별도 코드 변경은 필요 없다.
3. **참고(변경하지 않음) — 기존 범용 인계 모듈 `page-handoff.ts` 발견.** `src/frontend/m-mdm/src/shell/page-handoff.ts`
   (TSK-06-02 D12)가 이미 `openMdmPage`/`useMdmPageParams`(전역 메모리 저장 + `portal-tab-activated` 이벤트)로
   D7 과 같은 문제(파라미터를 들고 탭 열기, 이미 열린 탭도 갱신)를 풀어 두었다. design.md D7 의 "이 저장소에 선례가
   없다"는 근거는 이 파일을 보지 못한 채 쓰인 것으로 보인다. 그럼에도 이번 Build 는 design.md D7 이 명시한 대로
   `dataHandoff.ts`(sessionStorage + 커스텀 이벤트, B2 가 그대로 소비하기로 계약된 4개 export)를 그대로 만들었다
   — 이미 승인된 결정을 Build 단계에서 단독으로 뒤집지 않는다. 다음 설계 검토에서 `page-handoff.ts` 재사용 여부를
   판단할 수 있도록 사실만 남긴다.

## 변이 검증 기록

모두 실제로 변이를 넣어 대상 테스트를 돌린 뒤 되돌렸다(`cp` 백업 — 파일이 아직 git 미추적이라 `git checkout --` 은
쓸 수 없었다, 방법 참고 「기타」 절).

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| R1 | `DataMngService.register()` 의 `tx.execute` 래퍼 제거(트랜잭션 없이 순차 실행) | `DataMngServiceSqliteTest.R1_카테고리_등록이_실패하면_MdmData_행도_롤백된다` | 잡힘(AssertionFailedError — 롤백되지 않아 행이 남음) |
| R6 | BASE `cateName` 리터럴을 `"전체"` → `"MUTATED"` | `DataMngServiceSqliteTest.R6_BASE_카테고리는_REGEX_점별_KEY_전체_로_만들어진다` | 잡힘 |
| R9 | 등록 직후 `entity.setChgSeq(1)` 주입 | `DataMngServiceSqliteTest.R9_등록_뒤_배포_순번은_0이다` | 잡힘 |
| R10 | `sourceKind` 를 `MDM` → `EXTERNAL` | (의도한 `R10_등록은_MDM_원천_고정이고...` 이 아니라) `search_는_ID_이름_상태로_부분_일치_조회한다` 가 먼저 빨강 | 잡힘(간접) — DB CHECK 제약 `CK_TB_MDM_DATA_SRC_SYS`(EXTERNAL 이면 SOURCE_SYSTEM NOT NULL)를 어겨 `SQLiteException` 으로 죽는다. `--fail-fast` 라 같은 클래스의 다른 테스트가 먼저 실행 순서상 걸렸다. 전용 단정(`R10_...`)까지는 실행이 못 갔지만, 변이 자체는 확실히 빨강이 난다 — 은폐 아님, 그대로 적는다. |
| D7(전반부 — stash·broadcast) | `dataHandoff.ts` `consumeDataEditTarget` 의 `removeItem` 호출 생략(한 번만 소비 위반) | `dataHandoff.test.ts > stash 뒤 consume 은 그 ID 를 한 번 돌려주고 지운다` | 잡힘 |
| F20(추출 무해성) | (변이 아님) 추출 뒤 `DataItemMngServiceSqliteTest` 전체 재실행 | 전체 통과 유지로 무해성 확인 | 해당 없음(회귀만 확인) |

## 도커 금지로 생략한 검증

design.md 「도커 금지로 생략한 검증」 절 그대로 — 이 단위가 추가한 `latestCateRows`·`openMemberCodes` 도 같은 이유로
전용 MSSQL 테스트를 새로 만들지 않았다(기존 `query()`/`bindString()`/`MdmTemporalBinder` 헬퍼만 재사용, 방언 분기
없음).

## B2 가 참고할 공개 시그니처

- `DataCategoryResolver(DataSegmentRowStore)` — `preview(maruDataId, defExpr, defTarget): Preview{invalid, codes, count()}`,
  `static matches(Pattern, String)`, `static targetValue(ItemSegmentRow, String)`.
- `DataSegmentRowStore.latestCateRows(String maruDataId): List<CateSegmentRow>`(카테고리별 마지막 행, 닫힌 것 포함),
  `openMemberCodes(String maruDataId, String cateId): List<String>`(그 카테고리에 지금 열린 CODE 목록).
  **주의**: 둘 다 내부에서 `entityManager.flush()` 를 하므로 **트랜잭션 안에서만** 호출해야 한다
  (`TransactionRequiredException` — 이 Task 의 테스트에서 실제로 겪음, 위 「담당자 확인 필요 결정」 밖의 순수 구현
  함정이라 여기 남긴다). 서비스에서 직접 부를 때는 `readTx.execute(...)`(읽기 전용 TransactionTemplate) 로 감싼다
  (`DataItemMngService.view()` 선례). SQLite 테스트에서 서비스를 거치지 않고 저장소를 직접 검증할 때는 그 테스트
  메서드에 `@Transactional`(Spring test, org.springframework.transaction.annotation) 을 붙인다 — 단, R1 류
  "서비스를 감싸지 않고 그대로 호출" 테스트에는 붙이면 안 된다(변이 무력화).
- `pages/dmd/dataHandoff.ts` — `stashDataEditTarget(maruDataId)`, `consumeDataEditTarget(): string|null`,
  `DATA_EDIT_SELECT_EVENT`(문자열 상수), `broadcastDataEditTarget(maruDataId)`. `dataEdit/page.tsx` 는 마운트 시
  `consumeDataEditTarget()` 한 번 + `DATA_EDIT_SELECT_EVENT` 리스너(마운트 기간 내내)를 걸면 된다(design.md D7).
- 새 화면(`dataEdit`) `page.tsx` 를 만들면 **`m-mdm/tsup.config.ts` 에도 엔트리 한 줄을 추가**해야 한다(위 「설계
  이탈」 1번, `pnpm --filter @dk-oasis/m-mdm test` 의 `tsup-entries.smoke.test.ts` 가 지킨다).
- `DmdScreenMessageParityTest` 루프 리팩터(F24, design.md §2)는 B2 담당 그대로다 — B1 은 이 파일을 건드리지 않았다.

## 미실행 검증

- **e2e(`mdm-dataMng.spec.ts`)는 이 단위에서 돌리지 않았다** — phase-build.md 「구현 단위」 규칙상 E2E 스모크
  실행은 마지막 단위(B3) 몫이다. `mdm-dataEdit.spec.ts`·`mdm-dataCateEdit.spec.ts` 가 아직 없어 서버를 띄워도
  세 화면을 한 번에 확인할 수 없다. spec·픽스처는 설계대로 작성만 했다(문법은 TypeScript 컴파일·lint 로 확인,
  `pnpm --filter @dk-oasis/m-mdm lint` 통과).
- mssqlTest 관련 2개 명령은 design.md 가 이미 생략을 기록했다(위 절 그대로 인용).

## 관련 테스트 실행 결과(이 단위)

- `cd src/backend && JAVA_HOME=... ./gradlew :mdm:api:test --tests DataMngServiceSqliteTest --tests DataCategoryResolverSqliteTest --tests DmdBpmnActionTest --tests DmdOasisHttpTest --tests DataItemMngServiceSqliteTest --no-daemon --console=plain` → BUILD SUCCESSFUL(전부 통과).
- `cd src/backend && JAVA_HOME=... ./gradlew :mcm:api:compileJava --no-daemon --console=plain` → BUILD SUCCESSFUL(DataInitializer 컴파일 확인. mcm/api 에는 별도 test 소스셋이 없다).
- `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` → 764 tests, 761 passed, 3 failed(전부
  `tests/evalex-perf.test.ts` 의 타이밍 성능 단정 — 이 워크트리에서 다른 무거운 명령과 동시에 도는 CPU 경합 때문으로
  보이는 기존 무관 flaky 테스트. dataHandoff 관련 4개 새 테스트는 전부 통과, `tsup-entries.smoke.test.ts` 도 통과).
- `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint` → 통과(tsc --noEmit, 오류 0).
- `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` → `ERROR 0 / WARN 0 / INFO 29`(기준선과 같음, `dataMng.bpmn`/`dataMngService` bean 해석됨).

## 진행 방식 변경(오케스트레이터, B1 뒤)

- 사람(담당자) 요청 "동시에 여러 빌드 실행이 가능하면 실행"에 따라 B2(dataEdit)는 이 워크트리에서, B3(dataCateEdit)는 별도 워크트리 `/Users/jji/project/dmes-standard/.claude/worktrees/dflow-4be6eb9f-b3`(브랜치 `wip/4be6eb9f-b3`, push 하지 않음)에서 동시에 구현하고, 오케스트레이터가 B3 를 agent 브랜치로 머지한다. 픽스처 키 접두는 B2 `E2E_DE_`, B3 `E2E_DC_`.
- 충돌 회피 규칙: B3 는 `DmdScreenMessageParityTest` 를 건드리지 않는다(B2 의 루프 구조 리팩터 뒤에 통합 단위가 `dataCateEdit` 항목을 더한다). B3 는 dataMng·인계 코드도 건드리지 않는다. 공유 파일(`DmdBpmnActionTest`·`DmdOasisHttpTest`·`m-mdm/tsup.config.ts`·`e2e/fixtures/mdm-dataMng.sql`)은 각자 덧붙이기만 하고, 머지 충돌은 오케스트레이터가 양쪽을 모두 살려 푼다.
- E2E 스모크(세 spec)와 통합 확인은 머지 뒤 마지막 단위 `I`(통합)가 이 워크트리에서 돈다.
- D7 개정: `pages/dmd/dataHandoff.ts` 대신 기존 `src/shell/page-handoff.ts` 를 쓴다(design.md D7). 교체는 B2 몫이다.

## 구현 단위 B2 — 완료

범위: dataEdit 백엔드(`DataEditService`·DTO 5개·`dataEdit.bpmn`)·프런트(`pages/dmd/dataEdit/{api,page,types,messages}.ts`)·e2e(`mdm-dataEdit.spec.ts`, 작성만) + D7 개정 적용(dataMng 등록 핸들러를 `openMdmPage` 로 교체, `dataHandoff.ts`·그 테스트 삭제) + `DmdScreenMessageParityTest` 루프 구조 리팩터(dataItemMng·dataEdit 두 항목).

### 새 파일

- `src/backend/mdm/lib/.../dmd/dataEdit/service/DataEditService.java` — `view`·`save`·`deprecate`(액션 `delete`). `save`·`deprecate` 는 자기 `TransactionTemplate`(R1′), `view` 는 읽기 전용 `TransactionTemplate`(dataItemMng `view` 선례 — design.md 는 "트랜잭션이 필요 없다"고 적었지만 `DataSegmentRowStore` 네이티브 읽기가 활성 트랜잭션을 요구해(B1 기록) 그대로 하면 `TransactionRequiredException` 이 난다, 아래 「설계 이탈」1).
- `src/backend/mdm/lib/.../dmd/dataEdit/dto/{DataEditViewRequest,DataEditView,DataEditHeaderSaveRequest,DataEditDeprecateRequest,CategorySummaryRow}.java`.
- `src/backend/mdm/api/src/main/resources/services/dmd/dataEdit.bpmn` — process `dataEdit`, bean `dataEditService`, 액션 `view`·`save`·`delete`(method=`deprecate`).
- `src/backend/mdm/api/src/test/java/.../dmd/dataEdit/DataEditServiceSqliteTest.java`.
- `src/frontend/m-mdm/pages/dmd/dataEdit/{api.ts,page.tsx,types.ts,messages.ts}` — `page.tsx` 는 `useMdmPageParams("dmd/dataEdit", tabId, ...)` 로 handoff 를 소비하고(D7 후반부), `api.ts` 는 마루 데이터 select 목록을 `dataMng/api.ts` 의 `searchDataMng`(읽기만, 고치지 않음)로 채운다.
- `src/frontend/m-mdm/tests/dmd/dataEdit/data-edit-page.test.ts` — codeEdit 렌더 스모크 선례(handoff 로드·헤더 저장·MDM001 충돌 재조회).
- `src/frontend/e2e/mdm-dataEdit.spec.ts` — 스모크 넷(메뉴 이동·select 로드·헤더 저장·잘못된 키 패턴 정규식 거부). **작성만, 실행하지 않음**(통합 단위 I 가 돈다).

### 수정 파일

- `src/frontend/m-mdm/pages/dmd/dataMng/page.tsx` — 등록 성공 핸들러를 `stashDataEditTarget`/`broadcastDataEditTarget`/수동 `portal-open-tab` 대신 `openMdmPage("dmd/dataEdit", { maruDataId })` 로 교체(D7 개정). `DATA_EDIT_PAGE_ID` 상수·관련 import 제거.
- `src/frontend/m-mdm/tsup.config.ts` — `"pages/dmd/dataEdit/page"` 엔트리 추가(B1 「설계 이탈」1 이 남긴 규칙).
- `src/backend/mdm/api/src/test/java/.../dmd/DmdBpmnActionTest.java` — `dataEdit_액션은_view_save_delete()` 추가(`view→view`, `save→save`, `delete→deprecate`).
- `src/backend/mdm/api/src/test/java/.../dmd/DmdOasisHttpTest.java` — `E1_dataEdit_저장은_헤더를_바꾸고_auditVer_가_오른다()` 추가(대표 쓰기 1개 왕복).
- `src/backend/mdm/api/src/test/java/.../dmd/DmdScreenMessageParityTest.java` — 화면 목록 `@ParameterizedTest` 루프로 리팩터. `dataItemMng`(`ROW_VERSION_CONFLICT_PREFIX`+`CLOSED_KEY_REOPEN`)·`dataEdit`(`ROW_VERSION_CONFLICT_PREFIX`만) 두 항목. 기존 `dataItemMng` 단정 내용은 바꾸지 않았다.

### 삭제 파일(D7 개정)

- `src/frontend/m-mdm/pages/dmd/dataHandoff.ts`, `src/frontend/m-mdm/tests/dmd/dataHandoff.test.ts` — B1 이 만든 전용 인계 모듈. `src/shell/page-handoff.ts` 재사용으로 대체.

## 설계 이탈(B2)

1. **`buildView` 안 `auditVer` 읽기 순서 버그, HTTP 왕복 테스트로 처음 잡힘.** 처음 구현은 `view.setAuditVer(entity.getVersion())` 을 `categorySummaries(...)` 호출보다 먼저 했다. `DataSegmentRowStore` 네이티브 읽기가 호출 전에 `entityManager.flush()` 를 하고, `MdmData.VER` 증가는 `CactusAuditListener.onPreUpdate`(`@PreUpdate`, flush 시점에만 발동)가 하므로, `categorySummaries` 를 부르기 **전에** `auditVer` 를 읽으면 아직 flush 가 안 일어나 증가 전 값(0)이 나간다. `DataEditServiceSqliteTest` 는 저장 뒤 **트랜잭션 커밋 후** DB 를 raw JDBC 로 읽어 확인했으므로(커밋 시점엔 이미 flush 가 끝나 있어) 이 버그를 못 잡았다 — `DmdOasisHttpTest.E1`(응답 JSON 의 `auditVer` 필드를 직접 확인)이 처음 빨강을 냈다. 고친 뒤 `buildView` 는 `categorySummaries` 를 먼저 호출해 그 flush 를 먼저 겪고 그 다음에 `auditVer` 를 읽는다. `DataEditServiceSqliteTest` 의 R1 테스트에도 `saved.getAuditVer()` 단정을 추가해 회귀를 잡게 했다. **교훈**: 트랜잭션 내부에서 리스너가 올리는 감사 필드를 응답 DTO 에 실어 보낼 때는, 그 필드를 읽기 전에 flush 를 강제하는 호출이 먼저 일어나는지 순서를 반드시 확인해야 한다(다음 화면에서 비슷한 패턴을 쓸 때 참고).
2. **`view` 의 트랜잭션 필요 여부 — design.md 문구와 다르게 구현.** design.md §2 는 "view 는 트랜잭션이 필요 없다(읽기 전용, 잠금도 걸지 않는다)"고 적었다. "잠금(`DataSegmentLock.lock`)을 걸지 않는다"는 그대로 따랐지만, 실제로는 읽기 전용 `TransactionTemplate`(`dataItemMngService.view()` 선례)으로 감쌌다 — 감싸지 않으면 `DataSegmentRowStore`(카테고리 요약 카드 조회에 씀)의 네이티브 쿼리가 `entityManager.flush()` 에서 `TransactionRequiredException` 을 던진다(B1 이 build-log 「B2 가 참고할 공개 시그니처」에 이미 남긴 경고). 동작에는 영향 없음(읽기 전용이라 커밋할 것이 없다) — design.md 문구가 "잠금 없음"을 "트랜잭션 자체가 없음"으로 과장해 적은 것으로 보인다.
3. **키 패턴 정규식 문법 검사를 `save` 에 추가(design.md §2 DTO 목록에는 명시되지 않음).** design.md §3.3 스모크 넷 4(dataEdit)가 "잘못된 코드 패턴 문법(또는 DEPRECATED 후 저장) 오류 모달"을 수용 기준으로 들었는데, `DataMngService.register()`(등록)는 codePattern 문법을 검사하지 않는다(등록 시점엔 항목이 없어 당장 못 씀 — 첫 `dataItemMng` 등록에서야 `DataItemChecks.pattern()` 이 늦게 걸러낸다). dataEdit 의 `save` 는 기존 마루 데이터의 키 패턴을 즉시 바꿀 수 있어 문법 오류를 방치하면 이후 모든 항목 등록이 막힌다 — 그래서 `save()` 에 `Pattern.compile(codePattern)` 검사(문법 오류 시 `INVALID_INPUT`, "키 패턴 정규식이 올바르지 않습니다: ...")를 추가했다. R 불변 규칙표에는 없는 추가 검사라 여기 기록한다. e2e 스모크 4 는 이 경로를 쓴다.

## 변이 검증 기록(B2)

`.claude/skills/dflow-dev/scripts/heavy.sh` 로 감싼 스크립트 하나(`mutate-dataedit.sh`, cp 백업/복구 — `DataEditService.java` 가 아직 git 미추적 새 파일이라 `git checkout --` 불가) 안에서 규칙마다 변이→대상 테스트(`DataEditServiceSqliteTest`, `--fail-fast`)→복구를 반복했다. 프런트(D7 후반부)는 별도로 `data-edit-page.test.ts` 하나만 대상으로 돌렸다(단일 파일 러너라 `heavy.sh` 불필요).

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| R1′ | 생성자에서 `tx` 를 `PROPAGATION_NOT_SUPPORTED` 로 재설정(자기 트랜잭션 무력화) | `계층_칸_수_늘리기는_항상_허용한다`(`TransactionRequiredException` — 트랜잭션 없이 `lock.lock()` 의 `entityManager.flush()` 호출이 죽는다) | 잡힘 |
| R2 | `save()` 안 `lock.lock(id)` 를 한 줄 더 추가(이중 호출) | `R2_저장은_잠금을_정확히_한_번_부른다`(Mockito `TooManyActualInvocations`) | 잡힘 |
| R7 | `save()`·`deprecate()` 의 `checks.requireActive(locked);` 두 줄을 주석 처리 | `R7_DEPRECATED_마루_데이터는_저장을_거부한다`(예외가 안 남) | 잡힘 |
| R11/D6 | `if (lvlCnt < locked.lvlCnt())` 를 `if (false && ...)` 로(축소 검사 자체를 건너뜀) | `D6_닫힌_채로_남은_키의_마지막_행에_값이_있으면_lvl_cnt_축소를_거부한다`(예외가 안 남) | 잡힘 |
| D7(후반부 — consume·리스너) | `dataEdit/page.tsx` 의 `useMdmPageParams` 콜백 조건을 `if (false && params.maruDataId)` 로(handoff 값을 무시) | `data-edit-page.test.ts > handoff 로 받은 ID 를 불러와 헤더·카테고리 요약을 보인다`(`view` 호출이 `OTHER`(snapshot) 로 감, `PORT`(handoff) 가 아님) | 잡힘 |
| R5(카드4 매칭 건수) | (변이 아님) `DataCategoryResolver.preview`(B1 산출물)를 그대로 호출하도록 구현 — 별도 재구현이 없다는 것 자체가 코드 리뷰 대상. 테스트는 REGEX(BASE 포함, 열린 항목만)·TABLE(열린 소속 수)·닫힌 카테고리(매칭 0) 세 조합을 직접 확인했다 | 해당 없음(재구현 없음 확인) |

## 미실행 검증(B2)

- **e2e(`mdm-dataEdit.spec.ts`)는 이 단위에서 돌리지 않았다** — phase-build.md 규칙상 E2E 스모크 실행은 마지막 단위(I)의 몫이다. 문법은 `pnpm --filter @dk-oasis/m-mdm lint`(전체 tsc, e2e 디렉터리 포함하지 않는 구성이면 별도 확인 필요 — 이 워크트리의 `m-mdm lint` 는 `tsc --noEmit` 으로 m-mdm 패키지만 본다. e2e TS 파일 자체의 구문 오류는 실제 `playwright test` 실행(통합 단위 I) 때 처음 잡힌다) 확인.
- mssqlTest 관련 2개 명령은 design.md 가 이미 생략을 기록했다(위 절 그대로 인용, B2 도 새 mssqlTest 를 추가하지 않는다).

## 관련 테스트 실행 결과(B2)

- `cd src/backend && JAVA_HOME=... ./gradlew :mdm:api:test --tests DataEditServiceSqliteTest --tests DmdBpmnActionTest --tests DmdScreenMessageParityTest --tests DmdOasisHttpTest --tests DataMngServiceSqliteTest --tests DataItemMngServiceSqliteTest --no-daemon --console=plain`(heavy.sh) → BUILD SUCCESSFUL(전부 통과, 여러 차례 재확인).
- `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test`(heavy.sh) → 765 tests, 762 passed, 3 failed(전부 `tests/evalex-perf.test.ts` 타이밍 성능 단정 — B1 이 이미 기록한 것과 같은, 동시 무거운 명령 부하로 인한 무관 flaky. `data-edit-page.test.ts` 5개·`tsup-entries.smoke.test.ts` 모두 통과).
- `pnpm build:libs` 1차 시도는 `Button variant="secondary"` 타입 오류(`ButtonVariant` 는 `"default"|"primary"|"danger"` 뿐)로 실패 → `data-edit-deprecate` 버튼을 `variant="default"` 로 고쳐 재통과(사소한 설계 이탈은 아니고 단순 오타 수정이라 위 「설계 이탈」에는 안 올림).
- `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint` → 통과(오류 0).
- `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` → `ERROR 0 / WARN 0 / INFO 29`(기준선과 같음, `dataEdit.bpmn`/`dataEditService` bean 해석됨).

## B3 가 참고할 사실(B2, B1 이어서)

- D7 은 이제 완전히 `src/shell/page-handoff.ts`(`openMdmPage`/`useMdmPageParams`) 로 통일됐다 — `dataHandoff.ts` 는 더 이상 존재하지 않는다. dataCateEdit 화면에서 다른 화면으로 이동할 일이 있다면 같은 모듈을 쓴다.
- `DmdScreenMessageParityTest` 는 이제 `@ParameterizedTest` 루프 구조다(`Case(screen, messagesPath, checkClosedKeyReopen)`). B3 는 `screens()` 메서드의 `Stream.of(...)` 에 `dataCateEdit` 항목 하나만 추가한다(루프 구조 자체는 고치지 않는다, design.md §2 지시대로).
- `DataCategoryResolver.preview(maruDataId, defExpr, defTarget)`(B1 산출물)가 REGEX 매칭 건수까지 제공한다 — dataCateEdit 의 REGEX 미리보기(compare 액션)도 이것을 그대로 쓰면 된다(재구현 금지).

## 구현 단위 B3 — 완료

범위: dataCateEdit 백엔드/프런트/BPMN/e2e(작성만). 별도 워크트리 `.claude/worktrees/dflow-4be6eb9f-b3`(브랜치
`wip/4be6eb9f-b3`)에서 B2 와 동시에 진행. `DmdScreenMessageParityTest`·dataMng·인계 코드(`dataHandoff.ts`·
`page-handoff.ts`)는 건드리지 않았다.

### 새 파일

- `common/segment` 는 건드리지 않았다 — B1 이 만든 `DataCategoryResolver`·`DataSegmentRowStore.latestCateRows`/
  `openMemberCodes` 를 호출만 한다(R2′).
- `dmd/dataCateEdit/service/DataCateEditService.java` — 액션 7개(search·view·compare·reg·save·delete·restore).
  `reg`·`save`(REGEX)·`delete`·`restore` 는 `DataCategorySegmentCore` 를 그대로 호출(잠금·검사 위임). `save` 는
  대상 카테고리의 실제 defKind 를 서버가 스스로 읽어 REGEX 정의 수정과 TABLE 소속 일괄 적용(전부-아니면-전무,
  자기 `TransactionTemplate` 로 addMember/removeMember N 회를 join)을 가른다.
- `dmd/dataCateEdit/dto/{CateSearchRequest,CateSearchResult,CateRow,CateViewRequest,CateViewResult,CateRegRequest,
  CateSaveRequest,CateCompareRequest,CateCompareResult,MemberApplyRequest}.java` — design.md §2 파일 목록 그대로
  10개. `CateViewResult.Item`(코드·이름·lvl1)은 별도 파일을 늘리지 않으려고 `CateViewResult` 안 정적 중첩 클래스로
  두었다(설계 이탈 아님 — 파일 수·이름은 그대로다).
- `services/dmd/dataCateEdit.bpmn` — process `dataCateEdit`, bean `dataCateEditService`, 액션 7개
  (`search→search`, `view→view`, `compare→compare`, `reg→register`, `save→save`, `delete→close`, `restore→reopen`).
- `api/.../dmd/dataCateEdit/DataCateEditServiceSqliteTest.java` — 14 테스트(R2′·R4·R5·R6·R7·R12 전담 + reg·save·
  search·compare 기능 확인).
- `pages/dmd/dataCateEdit/{api.ts,types.ts,messages.ts,defTargetOptions.ts,transfer.ts,page.tsx,
  components/{CategoryListPanel,RegexEditPanel,PreviewPanel,TransferListPanel}.tsx}`.
- `tests/dmd/dataCateEdit/{transfer.test.ts,defTargetOptions.test.ts}` — 순수 함수 8개 테스트(카테고리 diff·D5
  defTarget 드롭다운 제한).
- `e2e/mdm-dataCateEdit.spec.ts` — 스모크 넷 4개(메뉴 이동, 목록/BASE, REGEX 등록, 잘못된 정규식 거부). **작성만,
  돌리지 않았다**(마지막 단위 I 가 세 spec 을 함께 돈다).

### 수정 파일

- `DmdBpmnActionTest.java` — `dataCateEdit_액션은_search_view_compare_reg_save_delete_restore()` 추가(기존
  메서드는 한 글자도 안 바꿈).
- `DmdOasisHttpTest.java` — `C1_dataCateEdit_등록은_검색되고_닫으면_소속은_남고_매칭은_0이_된다()`·
  `C2_dataCateEdit_BASE_수정은_예약_카테고리_문구로_거부된다()` 추가(기존 `PORT` 픽스처 재사용, 기존 메서드 무변경).
- `m-mdm/tsup.config.ts` — `"pages/dmd/dataCateEdit/page"` 엔트리 한 줄 추가(B1 「설계 이탈」1번 그대로 적용).
- `e2e/fixtures/mdm-dataMng.sql` — `E2E_DC_PORT`(마루 데이터, TABLE 카테고리 `DC_GROUP`, 항목 2개, 소속 1개) 새
  `INSERT OR IGNORE` 블록만 덧붙였다. 기존 `E2E_DM_*` 행은 그대로. B2 의 dataEdit e2e 가 마루 데이터를 폐기할 수
  있어(통합 단위가 세 spec 을 한 스위트로 돌린다) 공유 행 대신 전용 행을 썼다(design.md 는 세 화면이 픽스처를
  공유한다고 적었지만, 마루 데이터 단위는 서로 격리해야 spec 간 상태 간섭이 없다 — 이 판단은 설계 이탈이라기보다
  design.md 가 명시하지 않은 세부라 여기 기록만 한다).
  DataInitializer.java 는 고치지 않았다 — B1 이 `seedMdmDataMngMenus()` 한 메서드에 세 화면(dataMng·dataEdit·
  dataCateEdit) 메뉴·RBAC 을 이미 다 심어 뒀다(961~980행 확인).

### 설계 이탈

없음(B1 의 tsup.config.ts 이탈을 그대로 따랐을 뿐, 이 단위가 새로 design.md 를 벗어난 결정은 없다).

### 변이 검증 기록

`.claude/skills/dflow-dev/scripts/heavy.sh` 안에서 스크립트 하나로 7개를 순서대로 돌렸다(변이 → 대상 테스트
`--fail-fast` → `git checkout --`(추적 파일)·`cp` 백업 복원(미추적 `DataCateEditService.java`) → 다음 변이).
스윕 뒤 `git status`로 세 파일(`DataCategorySegmentCore.java`·`DataItemChecks.java`·`DataCateEditService.java`)
모두 변이 흔적 없음을 확인했다.

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| R2′ | `DataCategorySegmentCore.registerCate` 안에서 `lock.lock(maruDataId)` 를 한 번 더 호출(이중 잠금 흉내) | `R2_reg는_잠금을_한_번만_한다`(spy `verify(times(1))`) | 잡힘 |
| R4 | `DataCategorySegmentCore.closeCate` 가 카테고리를 닫을 때 그 카테고리의 열린 소속 코드를 전부 `memberStore.close` 로 같이 닫도록 주입(연쇄 닫힘 흉내) | `R4_닫기는_소속_행을_지우지_않고_다시_열면_매칭이_되살아난다`(닫은 뒤 `VALID_TO = OPEN_END` 행 수를 직접 SELECT) | 잡힘 |
| R5(REGEX) | `DataCateEditService.toCateRow` 의 `if (open)` 가드를 `if (true)` 로(닫힌 카테고리도 매칭 계산) | `R5_닫힌_REGEX_카테고리는_매칭_건수가_0이다` | 잡힘 |
| R5(TABLE) | TABLE 매칭 계산에서 `openItemCodes` 교집합을 빼고 `openMemberCodes(...).size()` 그대로 씀(닫힌 항목도 셈) | `R5_닫힌_항목의_TABLE_소속은_매칭에_들지_않는다` | 잡힘 |
| R6 | `DataCategorySegmentCore.requireNotBase` 본문을 비움(BASE 검사 제거) | `R6_BASE_수정은...`·`R6_BASE_닫기는...`(같은 클래스를 `--tests DataCateEditServiceSqliteTest` 로 전체 재실행, `--fail-fast` 로 첫 빨강에서 멈춤) | 잡힘 |
| R7 | `DataItemChecks.requireActive` 본문을 비움(DEPRECATED 검사 제거) | `R7_DEPRECATED_마루_데이터는_카테고리_등록을_거부한다` | 잡힘 |
| R12 | `DataCateEditService` 의 `applyMembers` 추가 루프에서 개별 `addMember` 실패를 `catch`로 삼키게 주입(부분 성공 흉내) | `R12_TABLE_일괄_적용은_하나가_실패하면_전체_롤백된다`(실패 코드가 유효 코드 뒤에 오게 해 실제 부분 삽입이 먼저 일어나게 함) | 잡힘 |

모두 되돌린 뒤 `DataCateEditServiceSqliteTest`(14)·`DmdBpmnActionTest`(4)·`DmdOasisHttpTest`(8) 를 다시 돌려
초록을 재확인했다.

### 도커 금지로 생략한 검증

design.md 「도커 금지로 생략한 검증」 절 그대로 — 이 단위는 새 `common.segment` 메서드를 추가하지 않았다(전부
B1 산출물 재사용).

### 관련 테스트 실행 결과(이 단위)

- `cd src/backend && JAVA_HOME=... ./gradlew :mdm:api:test --tests DataCateEditServiceSqliteTest --tests
  DmdBpmnActionTest --tests DmdOasisHttpTest --tests DataMngServiceSqliteTest --no-daemon --console=plain` →
  BUILD SUCCESSFUL. XML 결과: `DataCateEditServiceSqliteTest` 14/14, `DmdBpmnActionTest` 4/4, `DmdOasisHttpTest`
  8/8, `DataMngServiceSqliteTest` 7/7(회귀 없음).
- `cd src/backend && JAVA_HOME=... ./gradlew :mdm:lib:test :mdm:api:test --tests SecurityScreenContractTest
  --tests DataCategorySegmentCoreSqliteTest --tests MdmOasisActionVocabularyTest --no-daemon --console=plain` →
  BUILD SUCCESSFUL(새 BPMN 이 두 계약 검사도 통과, TSK-07-03 코어 테스트 회귀 없음).
- `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` → 70 files, 772 tests, 0 failed
  (이번 단위가 이 워크트리에서 첫 프런트 실행이라 `build:libs` 를 먼저 돌렸다. B1 이 보고한 `evalex-perf.test.ts`
  flaky 3건은 이번 실행에서는 재현되지 않았다 — CPU 경합 유무 차이로 보인다).
- `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint` → 통과(`tsc --noEmit`, 오류 0).
- `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` → `ERROR 0 / WARN 0 /
  INFO 29`(기준선과 같음, `dataCateEdit.bpmn`/`dataCateEditService` bean 해석됨, BPMN 26개 전부 해석).

### 하지 못한 것

- e2e(`mdm-dataCateEdit.spec.ts`)는 작성만 하고 돌리지 않았다(단위 제약 (c), 마지막 단위 I 가 세 spec 을 함께
  돈다 — 이 spec 하나만으로는 dataMng 등록→dataCateEdit 이동 같은 화면 간 연결을 확인할 수 없다).
- `DmdScreenMessageParityTest` 에 `dataCateEdit` 파리티 항목을 더하지 않았다(단위 제약 (b), 통합 단위(I) 몫 —
  `messages.ts` 의 `RESERVED_CATEGORY_PREFIX`·`CLOSED_KEY_REOPEN` 두 상수는 서버 원문과 이미 같은 글자로
  맞춰 뒀다).

## 통합 단위 I — 완료

범위: B1·B2·B3 를 합친 뒤(오케스트레이터 커밋 6d6088a) `DmdScreenMessageParityTest` 루프에 `dataCateEdit` 항목 추가,
좁힌 백엔드·프런트 회귀 확인, 세 화면 e2e 실행·스크린샷, dataMng→dataEdit 인계(수용 기준 "등록 후 수정 화면으로
이동") 확인, 변이 검증 표 R1~R12 커버리지 점검(advisor 재검토로 R3·R8 누락을 발견해 채움).

### 수정 파일

- `src/backend/mdm/api/src/test/java/.../dmd/DmdScreenMessageParityTest.java` — `Case` 레코드에 `prefixConstant`·
  `expectedPrefix` 두 필드를 추가해(기존엔 `ROW_VERSION_CONFLICT_PREFIX` 하나로 고정) 화면마다 다른 접두어 상수를
  대조할 수 있게 넓혔다. `dataCateEdit` 항목(`RESERVED_CATEGORY_PREFIX` ↔ `MdmErrorCode.RESERVED_CATEGORY`,
  `checkClosedKeyReopen=true`)을 추가했다. dataItemMng·dataEdit 두 기존 항목의 단정 내용은 바꾸지 않았다 —
  `ROW_VERSION_CONFLICT_PREFIX`/`MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage()` 인자를 그대로 넘긴다.
- `src/backend/mdm/api/src/test/java/.../dmd/dataCateEdit/DataCateEditServiceSqliteTest.java` — R8 커버리지
  점검 중 찾은 구멍을 메우는 새 테스트 `reg_는_잘못된_REGEX_문법이면_거부한다` 1개 추가(아래 「변이 검증 기록」).
- `src/frontend/e2e/mdm-dataMng.spec.ts` — 스모크 3(등록→dataEdit 인계)의 로케이터 버그 2건을 고쳤고(아래
  「설계 이탈」), 스모크 3 안에 R10(등록 폼에 원천 선택 UI 없음) 단정을 추가했다. "이미 열린 dataEdit 탭" 케이스의
  새 e2e 테스트는 시도했으나 원인 불명의 재현 가능한 문제로 되돌렸다(아래 「하지 못한 것」).

### 설계 이탈

1. **레지스트리 수동 재생성 필요 — `pnpm exec next dev` 는 `predev` 훅을 타지 않는다.** design.md 「E2E 서버
   절차」가 그대로 지시하는 `pnpm exec next dev --turbopack --port 15831` 명령으로 포털을 띄우니 세 화면
   (`dataMng`·`dataEdit`·`dataCateEdit`) 메뉴는 열렸지만 `data-mng-list`/`data-edit-pick` 등 testid 자체가
   전혀 렌더되지 않아 10개 spec 전부 `beforeEach`/화면 진입 단계에서 타임아웃했다. 원인: `m-mcm/package.json`
   의 `predev`(`generate-page-registry.mjs`)는 `pnpm run dev`/`pnpm dev` 로 스크립트를 부를 때만 pnpm 이
   자동으로 먼저 돌리는 라이프사이클 훅이라, `pnpm exec next dev ...`(바이너리 직접 호출)로는 실행되지 않는다.
   이 Task 세 화면은 B1~B3 가 새로 만든 페이지라 커밋된 `page-registry.ts`(F21, 자동 생성 파일)에 아직
   반영돼 있지 않았다. `cd m-mcm && node scripts/generate-page-registry.mjs` 를 수동으로 한 번 돌려(38 pages,
   19 from module packages) 세 항목을 채운 뒤 포털을 다시 띄우니 정상 렌더됐다. design.md 「E2E 서버 절차」
   6번 항목은 "레지스트리는 predev 가 재생성한다"고만 적어 이 함정을 언급하지 않는다 — 다음 Task 의 E2E 절차
   문서에 반영할 사실로 여기 남긴다. 재생성 결과(`m-mcm/lib/generated/page-registry.ts`)는 커밋했다(F21, design.md
   원문 그대로 — 화면·서버 코드가 아니라 자동 생성 산출물이라 「설계 이탈」이라기보다 절차 함정에 가깝지만,
   design.md 문구와 실제 동작이 다르므로 여기 기록한다).
2. **`mdm-dataMng.spec.ts` 스모크 3 단정 — 두 차례 고침.**
   - 1차: `page.getByText(NEW_ID)` 를 페이지 전체에 그대로 쓰면, 새로 열린 dataEdit 탭 뒤에 숨겨진 채 DOM 에
     남아 있는 원래 dataMng 탭의 목록 행 버튼(`data-mng-open-<ID>`)과 dataEdit 쪽 값이 같은 글자로 두 번 걸려
     Playwright strict mode violation 이 났다. `data-edit-pick` 으로 좁혔다.
   - 2차: 좁혀도 여전히 실패했다 — `data-edit-pick` 아래 Mantine `Select`(`ComboBox` 공용 컴포넌트, `searchable`)는
     사용자에게 보이는 값을 `<input>` 의 `value` 로 표시하고, 닫힌 드롭다운 안에는 같은 글자의 `<span
     role="option">` 이 `display:none` 상태로 DOM 에 남아 있다. `getByText` 는 그 숨은 옵션에 걸려 "hidden"
     타임아웃이 났다(화면은 실제로는 정상 — a11y 스냅샷으로 `combobox "마루 데이터 선택":
     E2EDMMUH84EVW E2E 등록 테스트` 가 이미 채워져 있음을 직접 확인했다). `mdm-dataEdit.spec.ts` 의 `choose()`
     헬퍼가 쓰는 같은 패턴(`input:not([type="hidden"])`)으로 `toHaveValue(new RegExp(`^${NEW_ID} `))` 로
     바꿔 고쳤다. 둘 다 spec 쪽 로케이터 버그였고, 화면·서버 코드는 고치지 않았다(기대값 완화가 아니라 올바른
     로케이터로 교체).
3. **파리티 `Case` 확장은 design.md §2 "루프 구조 자체는 고치지 않는다"(B2 기록)를 살짝 벗어난다.** B2 는
   B3 가 `screens()` 의 `Stream.of(...)` 에 항목 하나만 더하면 된다고 적었지만, dataCateEdit 의 접두어 상수
   이름이 `ROW_VERSION_CONFLICT_PREFIX` 가 아니라 `RESERVED_CATEGORY_PREFIX`(R6, MDM012)라 항목 추가만으로는
   안 되고 `Case` 자체(대조할 상수 이름·기대 문구)를 넓혀야 했다. 대조 로직(`assertTrue(... startsWith ...)`)과
   기존 두 화면의 실제 대조 내용은 그대로다 — 필드를 인자화했을 뿐 회귀는 없다(`DmdScreenMessageParityTest`
   3/3 그대로 통과).

### 변이 검증 기록 — 표 커버리지 점검(R3·R8 추가)

phase-build.md 「변이 검증」 규칙대로 B1~B3 기록 표가 불변 규칙 R1~R12 를 모두 덮는지 점검했다. R1(B1)·R1′(B2)·
R2(B2)·R2′(B3)·R4(B3)·R5(B3, REGEX+TABLE 둘 다)·R6(B1 BASE 값 + B3 BASE 수정·닫기 거부)·R7(B2 헤더/라벨/lvl_cnt/
폐기 + B3 카테고리 등록 거부)·R9(B1)·R10(B1 SELECT 확인, 이번 단위가 e2e 로 UI 부재까지 추가 확인)·R11(B2)·
R12(B3) 는 이미 실제 변이로 확인돼 있었다. 그런데 R3·R8 은 design.md §5 의 대상 테스트 칸이 "없음"/기존 정적
테스트로만 적혀 있어 B1~B3 어느 단위도 실제 변이를 넣지 않았다 — advisor 재검토로 이 누락을 찾아 이번 단위가
채웠다(`.claude/skills/dflow-dev/scripts/heavy.sh` 로 감싼 스크립트 하나, `trap` 으로 원복).

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| R3 | `com.dongkuk.dmes.mdm._r3mutation.TempSegmentStoreImpl`(`common.segment` 패키지 밖, `mdm/lib/src/main`)를 `MdmTemporalSegmentStore<String,String>` 의 네 번째 구현체로 임시 추가 | `MdmTemporalSegmentStoreNoImplementationTest.MdmTemporalSegmentStore_구현체는_common_segment_의_정해진_세_클래스뿐이다`(ArchUnit, TSK-07-03 소유·이 Task 는 고치지 않음) | 잡힘(제거 뒤 재실행으로 회귀 없음도 확인) |
| R8 | `DataItemChecks.cateDefIssues` 의 REGEX 정규식 문법 검사(`Pattern.compile` try/catch) 블록을 주석 한 줄로 치환 | `DataCateEditServiceSqliteTest.reg_는_잘못된_REGEX_문법이면_거부한다`(이번 단위가 새로 추가) | 잡힘(원복 뒤 `DataCateEditServiceSqliteTest` 15/15 재확인) |

R8 은 design.md 원문이 "재검사하지 않는다"고 적은 공용 코어 파일(`DataItemChecks`)의 검사이지만, 그 결과를
소비하는 `reg`/`save` 경로(이 Task 소유, `DataCateEditServiceSqliteTest`)에 REGEX 문법 거부를 직접 확인하는
단위 테스트가 하나도 없었다 — e2e `mdm-dataCateEdit.spec.ts` 스모크 4(잘못된 REGEX 문법 저장 거부)가 화면을
거쳐 같은 경로를 확인하지만, 서버 없이 빠르게 도는 단위 테스트가 없으면 다음 변경에서 회귀를 e2e 에서야 늦게
발견한다 — 그래서 새 테스트를 추가했다(파일 소유·시그니처는 바꾸지 않았다, R8 자체는 여전히 지켜진다).

### 관련 테스트 실행 결과(이 단위)

- `cd src/backend && JAVA_HOME=... ./gradlew :mdm:api:test --tests DmdBpmnActionTest --tests DmdOasisHttpTest
  --tests DmdScreenMessageParityTest --tests DataMngServiceSqliteTest --tests DataEditServiceSqliteTest --tests
  DataCateEditServiceSqliteTest --tests DataCategoryResolverSqliteTest --tests DataItemMngServiceSqliteTest
  --no-daemon --console=plain`(heavy.sh, R8 새 테스트 추가 뒤 마지막으로 재확인) → BUILD SUCCESSFUL. XML 결과:
  `DmdBpmnActionTest` 5/5, `DmdOasisHttpTest` 9/9, `DmdScreenMessageParityTest` 3/3(`dataCateEdit` 포함),
  `DataMngServiceSqliteTest` 7/7, `DataEditServiceSqliteTest` 16/16, `DataCateEditServiceSqliteTest` 15/15(R8
  새 테스트 포함), `DataCategoryResolverSqliteTest` 4/4, `DataItemMngServiceSqliteTest` 9/9 — 회귀 없음.
- `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test`(heavy.sh) → 70 files, 773 tests,
  3 failed(전부 `tests/evalex-perf.test.ts` NFR-1 — B1·B2 가 이미 기록한 것과 같은, 동시 무거운 명령 부하로
  인한 무관 flaky). 팀장 지시대로 그 파일만 단독으로 heavy.sh 슬롯 안에서 재실행:
  `cd src/frontend/m-mdm && pnpm exec vitest run tests/evalex-perf.test.ts` → 4 tests, 4 passed(중앙값 모두
  100ms 미만). 부하 민감 env 실패로 인정, 본 실행 통과 로그로 갈음.
- `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint` → 통과(`tsc --noEmit`, 오류 0, `mdm-dataMng.spec.ts`
  수정 뒤 재확인 포함).
- `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` → B3 가 이 단위 직전에
  이미 `ERROR 0 / WARN 0 / INFO 29` 로 확인했고, 이 단위는 oasis 계약에 영향 없는 테스트·spec 파일만 고쳐 다시
  돌리지 않았다.

### E2E 서버 절차 실행

design.md 「E2E 서버 절차」 그대로(포트 mcm BE 18831·mdm BE 18832·FE 15831, 모두 이 워크트리 안에서 새로 고른
빈 포트) `heavy.sh acquire e2e-TSK-07-02` 로 슬롯을 쥐고 진행했다. DB·서버를 처음부터 새로 띄운 전체 사이클을
**다섯 차례** 돌렸다 — 사이클마다 원인이 남아 다음 사이클로 넘어갔다:
1. 1차: 레지스트리 미생성(위 「설계 이탈」1)으로 10개 spec 전부 `beforeEach` 단계에서 실패.
2. 2차: 레지스트리를 수동 재생성한 뒤 재시도했으나 DB 를 그대로 재사용해(1차 실행 때 이미 등록·저장이 일부
   반영됨) 두 테스트가 픽스처 값 충돌로 실패 — spec 로케이터 버그(위 「설계 이탈」2)의 1차 수정본을 이때 넣었다.
3. 3차: DB·서버를 처음부터 다시 띄워 10개 전부 통과(로케이터 2차 수정 전이라 이 통과는 R10 단정·「하지
   못한 것」의 3b 시도 이전 버전 기준).
4. 4차: R10 단정과 "이미 열린 dataEdit 탭"(3b) 새 테스트를 추가한 뒤 재확인 — 11개 중 3b 만 재현 가능하게
   실패(아래 「하지 못한 것」). 같은 서버 세션에서 `--grep 3b` 로 두 차례 더 시도(타임아웃 연장·안정화 대기 추가)
   했으나 동일하게 실패해 3b 를 되돌렸다.
5. 5차: 3b 를 뺀 최종본으로 DB·서버를 처음부터 다시 띄워 10개 전부 통과 — 이 결과를 최종 스크린샷·게이트
   결과로 쓴다.

기동 로그로 `mcm.db`/`mdm.db` 가 각각 `$W/src/backend/data/mcm.db`·`../data/mdm.db`(= 같은 경로)로, 이
워크트리 안임을 매 사이클 확인했다(메인 체크아웃 DB 공유 없음). RBAC 시드 대조(`mdm-rbac-seed-check.sql` →
`.expected.txt`) diff 출력 없음(매 사이클 통과). `DataInitializer` 로그에 `[DataInitializer] TSK-07-02 MDM
마루 데이터 조회·등록·수정·카테고리 편집 시드 — OBJECT 3 + 메뉴 leaf 3 + RBAC(SYSADMIN 3 + MDM 역할 6)` 한 줄을
확인했다.

최종 실행(5차): `SMOKE_MCM_BASE_URL=http://127.0.0.1:15831 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123
heavy.sh pnpm exec playwright test e2e/mdm-dataMng.spec.ts e2e/mdm-dataEdit.spec.ts e2e/mdm-dataCateEdit.spec.ts
--workers=1` → **10 passed (33.1s)**, skipped 0, failed 0.

- `e2e/mdm-dataCateEdit.spec.ts` 3개: 메뉴 이동·목록(BASE 포함), REGEX 카테고리 등록→목록 반영, 잘못된 REGEX
  문법 거부.
- `e2e/mdm-dataEdit.spec.ts` 4개: 메뉴 이동, select 로 헤더 채움, 헤더 저장→재조회 반영, 잘못된 키 패턴 거부.
- `e2e/mdm-dataMng.spec.ts` 3개: 메뉴 이동·목록, **등록 1건 → dataEdit 탭이 열리고 방금 등록한 ID 가 자동
  로드된다(D7, 수용 기준 "등록 후 수정 화면으로 이동", R10 원천 UI 없음도 이 테스트 안에서 확인)**, 중복 ID
  재등록 MDM011 거부.

세 화면 연결 확인(수용 기준): `mdm-dataMng.spec.ts` 스모크 3 이 등록 직후 새로 열린 `dataEdit` 탭에서
`data-edit-pick` 입력값이 `^{등록한 ID} ` 로 시작함을 확인해, dataMng 등록 → dataEdit 화면 자동 이동·로드를
e2e 로 검증했다(새 탭이 열리는 경로). "이미 열린 dataEdit 탭" 경로는 아래 「하지 못한 것」 참고.

**스크린샷 목록**(`docs/mdm/tasks/TSK-07-02/screens/`, 9개, 5차 최종 실행 결과로 커밋):
`dmd-dataMng-list.png`, `dmd-dataMng-register-handoff.png`, `dmd-dataMng-duplicate-id.png`,
`dmd-dataEdit-view.png`, `dmd-dataEdit-save.png`, `dmd-dataEdit-invalid-pattern.png`,
`dmd-dataCateEdit-list.png`, `dmd-dataCateEdit-register.png`, `dmd-dataCateEdit-invalid-regex.png`.

서버 정리: 자기 PID(FE·mdm BE·mcm BE)와 자기가 고른 세 포트(15831·18832·18831)만 매 사이클 `kill`, 이후 `lsof
-tiTCP:<포트> -sTCP:LISTEN` 으로 잔존 프로세스 없음 확인, 마지막에 `heavy.sh release` 로 슬롯 반환. 다른 Task
추적 스크린샷(TSK-01-02/01-03/04-02/04-03/04-04/07-03)과 `m-mcm/next-env.d.ts`·`src/frontend/test-results/`
는 매 사이클 뒤 `git checkout --` 로 되돌렸다.

### 하지 못한 것 / 생략

- **"dataEdit 탭이 이미 열려 있는 경우"(design.md §4 가 "등록 후 수정 화면으로 이동" 수용 기준에 요구하는 두
  번째 케이스)를 e2e 로 새로 확인하지 못했다.** design.md §4 가 이 케이스의 근거로 든 `dataHandoff.test.ts`
  는 B2 의 D7 개정(`page-handoff.ts` 로 교체)으로 이미 삭제됐다 — 표가 가리키는 검증 방법 자체가 낡았다.
  이 케이스의 메커니즘(같은 탭이 재활성화될 때 새 파라미터를 다시 소비하는 것)은 공유 모듈
  `src/shell/page-handoff.ts` 의 기존 `tests/shell/page-handoff.test.ts`(`useMdmPageParams 는 마운트 때와
  자기 탭 활성화 때 소비한다`, TSK-06-02 소유, 이번 단위의 `pnpm --filter @dk-oasis/m-mdm test` 실행에서
  4/4 통과 확인)가 이미 단위 수준에서 덮는다. 이 화면 조합(dataMng↔dataEdit)으로 새 e2e 케이스를 두 차례
  시도했으나(사이드바로 dataEdit 열기 → 다른 마루 데이터 선택 → 탭 바 클릭으로 dataMng 탭 복귀 → 등록),
  탭 전환 뒤 `data-mng-list`/`data-mng-reg-save` 가 Playwright 기준 visible·enabled 로 확인되는데도 등록
  버튼 클릭이 서버에 `POST /api/mdm/oasis/dataMng/reg` 요청을 전혀 내지 않는 현상이 두 시도 모두 재현됐다
  (`fe.log` 로 직접 확인 — 해당 시간대에 그 요청 자체가 없다). 타임아웃 연장·클릭 전 "enabled" 명시적 대기를
  더해도 같았다. a11y 스냅샷에는 여전히 dataEdit 화면의 breadcrumb(`generic: dataEdit`)이 남아 있어, 탭 전환이
  실제로는 완전히 반영되지 않은 상태에서 두 화면의 testid 가 동시에 "보임"으로 잡히는(포털 탭 전환의 실제 화면
  전환과 Playwright 의 actionability 판정 사이 괴리로 보이는) 현상일 가능성이 커 보이지만, 확정하지 못했다 —
  화면 코드의 실제 버그인지 e2e 조작 가능성의 한계인지 가르려면 Playwright trace(`--trace on`)로 클릭 시점의
  실제 DOM 스냅샷을 봐야 하는데, 이번 단위 예산(아래 참고) 안에서는 더 못 돌렸다. 다음에 이 케이스를 다시
  시도할 사람을 위해 시도한 spec 코드와 증상을 여기 남긴다(코드 자체는 되돌려 커밋하지 않았다).
- design.md 「E2E 서버 절차」의 "전체 mdm 스위트(회귀 확인용)" 단계(`mdm-*.spec.ts` 전체 + `dataItem` 픽스처)는
  돌리지 않았다 — 이 단위에 배정된 범위는 세 spec(`mdm-dataMng`·`mdm-dataEdit`·`mdm-dataCateEdit`)이고, 팀장
  지시도 그 세 spec 만 명시했다. 전체 mdm e2e 회귀는 이 Task 의 Build 게이트(오케스트레이터)가 별도로 판단할
  몫으로 남긴다.
- mssqlTest 관련 2개 명령은 design.md 가 이미 생략을 기록했다(도커 금지, 위 절 그대로 인용). 이 단위는 새
  mssqlTest 를 추가하지 않았다.
- 전체 백엔드 `testAll`·`pnpm test:unit:shared` 는 이 단위에서 돌리지 않았다(phase-build.md — Build 서브에이전트는
  전체 스위트를 돌리지 않는다, 오케스트레이터의 Build 게이트 몫).
- **단위 상한 초과**: phase-build.md 의 단위 상한(도구 호출 약 80회)을 이 단위 도중 크게 넘겼다(변이 검증
  표 점검·재현 시도·다섯 차례 E2E 사이클 때문). 커밋 경계를 지킬 수 있는 지점(현재 시점)에서 마무리했다.

## Build 게이트(오케스트레이터 직접 실행, HEAD 4e6ece7)

- 백엔드 testAll: 3172 통과, 실패 0(기준선 3120).
- m-mdm vitest: 773 중 2 실패(env: 부하 민감, 단독 통과) — `tests/evalex-perf.test.ts` NFR-1 BASE_SPD_LKP·QLTY_GRD_JDG. 팀장 지시(두 파일 한정 부하 민감 실패 인정)에 따라 heavy 슬롯을 잡고 `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/evalex-perf.test.ts` 단독 실행 → 4/4 통과(loadavg 9.63). 신규 실패 0.
- shared 단위: 168 통과. m-mdm lint 통과. oasis 계약 검사 ERROR 0 / WARN 0 / INFO 29.

## Verify 감사

Build 가 남긴 변이 검증 기록·e2e 결과를 감사했다(전체 스위트는 다시 돌리지 않는다, phase-verify.md). 코드는 감사 중엔
고치지 않았고, 아래 「이미 열린 탭」 절의 부수 발견만 사람 지시로 뒤이어 수정했다(별도 커밋).

### 변이 재주입 결과 — R1~R12 전부

표의 행마다 실제로 변이를 다시 넣어 대상 테스트가 빨간불을 내는지 확인한 뒤 원복했다(`git checkout --`, 매 행 뒤
`git status --porcelain` 이 비어 있음을 확인). 새로 채운 행(R2 폐기)과 정적 diff 2건도 포함한다.

| 규칙 | 변이 | 대상 테스트 | 재확인 결과 |
|---|---|---|---|
| R1 | 등록 tx 래퍼 제거 | `DataMngServiceSqliteTest.R1_...` | 잡힘 |
| R6(BASE 값) | BASE cateName 변조 | `DataMngServiceSqliteTest.R6_...` | 잡힘 |
| R9 | `entity.setChgSeq(1)` 주입 | `DataMngServiceSqliteTest.R9_...` | 잡힘 |
| R10 | sourceKind→EXTERNAL | `DataMngServiceSqliteTest` 전체 | 잡힘 — build-log 원본이 "간접"이라 적은 것보다 강하게, 전용 단정(`R10_...`) 도 같이 빨개짐 |
| R1′ | 자기 트랜잭션 `PROPAGATION_NOT_SUPPORTED` | `DataEditServiceSqliteTest` | 잡힘 — build-log 가 적은 바로 그 테스트(`계층_칸_수_늘리기는_항상_허용한다`)에서 `TransactionRequiredException` |
| R2(저장) | `save()` 이중 잠금 | `DataEditServiceSqliteTest.R2_저장은...` | 잡힘 |
| **R2(폐기)** | `deprecate()` 이중 잠금 | `DataEditServiceSqliteTest.R2_폐기는...` | **잡힘 — 이 행은 B2 표에 없었다(테스트는 이미 있었음), 이번 감사로 채움** |
| R7(dataEdit) | `checks.requireActive` 주석(저장·폐기 둘 다) | `DataEditServiceSqliteTest.R7_...` | 잡힘 |
| R11/D6 | lvlCnt 축소 검사 우회 | `DataEditServiceSqliteTest.D6_...` | 잡힘 |
| R2′ | `registerCate` 이중 잠금 | `DataCateEditServiceSqliteTest.R2_reg는...` | 잡힘 |
| R4 | 닫기 연쇄(소속 같이 닫힘 흉내) | `DataCateEditServiceSqliteTest.R4_...` | 잡힘 |
| R5(REGEX) | `if(open)`→`if(true)` | `DataCateEditServiceSqliteTest.R5_닫힌_REGEX_...` | 잡힘(단독 재실행으로 재확인 — 스윕 중엔 `--fail-fast` 로 R4 행이 먼저 걸렸었다) |
| R5(TABLE) | 열린 항목 교집합 제거 | `DataCateEditServiceSqliteTest.R5_닫힌_항목의_TABLE_...` | 잡힘 |
| R6(BASE 편집·닫기) | `requireNotBase` 본문 제거 | `DataCateEditServiceSqliteTest.R6_BASE_...` | 잡힘 |
| R7(dataCateEdit) | 공용 `DataItemChecks.requireActive` 본문 제거 | `DataCateEditServiceSqliteTest.R7_...` | 잡힘 |
| R12 | `applyMembers` 부분 성공 흉내 | `DataCateEditServiceSqliteTest.R12_...` | 잡힘 |
| R3 | `common.segment` 밖에 임시 4번째 구현체 추가 | `MdmTemporalSegmentStoreNoImplementationTest` | 잡힘(끝나고 파일 삭제) |
| R8 | `cateDefIssues` REGEX 문법 검사 제거 | `DataCateEditServiceSqliteTest.reg_는_잘못된_REGEX_문법이면_거부한다`(I 유닛 신설) | 잡힘 |

정적 diff(`git diff f59cce7..HEAD`): `DataItemChecks.java`·`DataCategorySegmentCore.java`·저장 코어 3클래스(R3·R8 대상 TSK-07-03 소유 공용 파일) 전부 변경 없음. `common.segment` 밖에 `MdmTemporalSegmentStore` 구현체도 없음 — R3·R8 이 "재검사·재구현하지 않는다"고 적은 그대로 지켜졌다.

### 커버리지 구멍 — R2 의 dataMng "등록" 경로

R2 규칙 문구는 "등록·헤더·라벨·lvl_cnt·폐기" 를 함께 적었지만, dataMng 의 `register()` 자신은 `DataSegmentLock.lock()`
을 직접 부르지 않는다(등록 시점엔 아직 없는 행이라 구조상 불가능 — `lock()` 은 0행이면 예외를 던진다). 대신 등록
트랜잭션 안에서 부르는 `registerCate()`(공용, R2′ 소유) 의 단일 lock() 호출에 얹혀 간다. `registerCate()` 에 이중
잠금을 주입하면 `DataCateEditServiceSqliteTest`(R2′) 는 빨개지지만, **`DataMngServiceSqliteTest` 만 단독으로 돌리면
초록으로 통과한다** — dataMng 쪽에는 이 잠금 횟수를 스스로 지키는 회귀 테스트가 없다. 오늘은 R2′ 테스트가 대신
지켜주고 있어 동작은 정상이지만(기능 결함 아님), 기록의 구멍으로 남긴다. R2′ 쪽 spy 단정이 나중에 약해지거나
지워지면 dataMng 등록 경로의 이 불변 규칙은 아무도 못 잡는다.

### 전체 mdm e2e 스위트 — Build 게이트가 미뤄 아무도 안 돌렸던 단계

design.md 「E2E 서버 절차」 그대로 이 워크트리 전용 포트(mcm 18831·mdm 18832·FE 15831)로 서버를 새로 띄워 이 Task
3 spec(10/10, I 유닛과 동일 재현)과 전체 `mdm-*.spec.ts`(19개 spec)를 직접 돌렸다. **TSK-07-02 소유 파일이 원인인
신규 실패는 0건.**

- design.md 가 "dataItem 픽스처만 추가하면 된다"고 적은 절차가 실제로는 불완전했다 — `mdm-codeCateEdit.sql`·
  `mdm-codeItemEdit.sql`·`mdm-columnMng-dict.sql`·`mdm-layout-m201.sql`·`mdm-ruleEdit-data.sql`(mdm.db)·
  `mdm-ruleEdit-users.sql`(mcm.db) 도 있어야 다른 화면들의 spec 이 돈다. 채운 뒤 `codeCateEdit`·`codeItemEdit`(T1~T4)
  는 전부 통과했다.
- `mdm-columnMng.spec.ts` 는 spec 자신의 주석에 "전용 값을 만들기 때문에 다른 spec 과 같은 mdm.db 로 돌릴 수
  없다"고 이미 적혀 있다. `TB_MDM_COLUMN` 에 값을 넣는 픽스처는 `mdm-layout-m201.sql`·`mdm-ruleEdit-data.sql` 뿐이고
  (grep 으로 확인) TSK-07-02 의 `mdm-dataMng.sql`(B3 가 수정)은 이 테이블을 안 건드린다 — 전용 DB(rbac-users+
  columnMng-dict 만)로 새로 돌리니 4/4 전부 통과했다. TSK-07-02 와 무관한 절차 공백이다.
- `mdm-codeItemEdit.spec.ts` T5 는 혼합 스윕에서 로그인 타임아웃으로 한 번 실패했다(재현 여부 미확정, 재시도는
  DB 오염으로 다른 결과가 나 결론 못 냄). `git diff f59cce7..HEAD` 로 codeItemEdit 관련 파일은 TSK-07-02 가 전혀
  건드리지 않았음을 확인했다(변경 파일 77개 목록 밖) — 이 Task 몫이 아니라 더 파고들지 않았다.
- `headerMng`·`layoutMng` 두 spec 은 `SMOKE_MDM_DB` 환경변수가 있어야 자기 픽스처를 스스로 싣는다 — design.md
  절차에 이 변수가 빠져 있다.
- 다음 Task 의 E2E 절차 문서화에 참고할 사실로 남긴다(design.md 는 고치지 않는다 — 담당자 확인 필요 결정·도커
  금지 절 외에는 Verify 가 design.md 를 고치지 않는다).

### "이미 열린 dataEdit 탭" 경로 — 수용 기준 충족으로 판정, 콤보박스 라벨 결함은 고침

build-log 원본은 이 e2e 케이스를 "원인 미확정으로 되돌렸다"고 적었다(위 통합 단위 I 절). Verify 가 직접 재현해
결론을 냈다.

- dataMng 탭 → dataEdit 탭(사이드바로 따로 열기) → 다른 항목 선택 → 탭 바 클릭으로 dataMng 복귀 → 등록 순서로
  두 차례 재현했는데 **둘 다 성공**했다 — build-log 가 겪은 "클릭해도 요청이 안 나간다" 현상은 재현되지 않았다.
- 등록 클릭 뒤 `POST dataEdit/view` 요청이 **새 ID 를 담아 실제로 발생**함과, 헤더 이름 입력창(`data-edit-name`)이
  **새로 등록한 이름으로 실제로 바뀜**을 네트워크 로그·DOM 값으로 직접 확인했다. 수용 기준("등록 후 수정 화면으로
  이동")의 핵심(새 데이터가 화면에 반영되는 것)은 충족된다 — **판정: 수용 기준 충족**.
- **부수 발견(수정함)**: 이 경로(이미 열린 탭 재사용)에서는 콤보박스 표시값이 "ID 이름" 대신 **"ID" 단독**으로
  보였다(신규 탭 경로는 정상적으로 "ID 이름"). 원인: `pages/dmd/dataEdit/page.tsx` 의 `useMdmPageParams` 콜백이
  handoff ID 로 `choose()` 는 부르지만 콤보박스 옵션 목록(`options` state, 마운트 시 한 번만 `searchMaruDataOptions()`
  로 채움)은 갱신하지 않아, 방금 등록한 ID 가 옵션 목록에 없어 라벨을 못 찾는 것이었다(`shared/ComboBox` 는 옵션에
  없는 value 를 라벨 없이 그대로 보여주는 게 정상 동작이라 공용 컴포넌트는 안 건드렸다).
  - 수정: handoff 로 받은 `maruDataId` 가 현재 `options` 에 없으면 `searchMaruDataOptions()` 를 다시 불러 `setOptions`
    한다(`page.tsx` `useMdmPageParams` 콜백, 4줄 추가).
  - 테스트 먼저: `tests/dmd/dataEdit/data-edit-page.test.ts` 에 "handoff 로 받은 ID 가 옵션 목록에 없으면 옵션을
    다시 불러와 콤보박스에 라벨이 보인다(이미 열린 탭 인계)" 케이스를 추가 — 1차 옵션 조회엔 없고 2차(재조회)에만
    있는 픽스처로 수정 전엔 빨강(`searchCalls` 1 vs 기대 ≥2), 수정 후 6/6 전부 초록 확인.
  - `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dmd/dataEdit/data-edit-page.test.ts` →
    6 passed. `pnpm --filter @dk-oasis/m-mdm lint` → 통과(`tsc --noEmit`, 오류 0).
  - 전체 스위트·e2e 는 다시 돌리지 않았다(오케스트레이터 Verify 게이트 몫).
- design.md §4 수용 기준 매핑 표는 이 케이스의 근거로 여전히 `dataHandoff.test.ts` 를 인용하는데, 그 파일은 B2 의
  D7 개정(`page-handoff.ts` 로 교체)으로 이미 삭제됐다 — 지금은 `tests/shell/page-handoff.test.ts`(공유, 소비 메커니즘
  자체) + `data-edit-page.test.ts`(화면 단, 이번에 옵션 재조회 케이스 추가) + `mdm-dataMng.spec.ts` 스모크 3(e2e, 새 탭
  경로) 세 가지가 그 자리를 대체한다. design.md 표 문구가 낡았다는 사실만 보고에 올린다(design.md 는 고치지 않는다).
