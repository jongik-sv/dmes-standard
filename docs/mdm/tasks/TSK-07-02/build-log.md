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
