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
