# mdm/TSK-07-04 build-log.md

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I5 | `DataItemListQuery.page()` 의 nodeFilter WHERE 절에서 `i.LVL1..LVL5 = :node` 를 모두 빼고 `i.CODE = :node` 만 남김 | `DataItemMngServiceSqliteTest.I5_노드_필터는_코드_자신_또는_lvl1_5_어딘가의_값이_같은_행만_열림_닫힘_무관` | 잡힘 |
| I6 | `DataItemListQuery.treeRows()` 에서 `AND i.VALID_TO = :openEnd` 를 빼 닫힌 행도 트리에 포함되게 함 | `DataItemMngServiceSqliteTest.I6_withTree_는_열린_행만_기존_ORDER_로_돌려준다` | 잡힘 |
| I6 | `DataItemMngService.search()` 의 `treeTruncated` 계산을 `treeRows.size() == TREE_MAX` 에서 상수 `false` 로 고정 | `DataItemMngServiceSqliteTest.I6_withTree_는_상한_TREE_MAX_에_걸리면_treeTruncated` | 잡힘 |
| I1 | `DataItemSaveCore.upsert()` 의 `checks.contentIssues(path, ...)` 호출을 `checks.contentIssues(DataSavePath.API, ...)` 로 고정(검사 3~7 무력화, CSV 도 API 처럼 행 내용 검사를 건너뛰게 함) | `DataCsvUploadPopServiceSqliteTest.이름_없는_행은_열은_맞아도_검사4로_오류다` | 잡힘 |
| I2 | `DataItemSaveCore.upsert()` 의 저장 가드 `if (!issues.isEmpty() \|\| dryRun)` 을 `if (dryRun)` 으로 약화(이슈 있어도 실제 저장 진행) | `DataCsvUploadPopServiceSqliteTest.검사_이슈가_있는_CSV_저장_시도도_전부_미저장이다` | 잡힘 |
| I3 | `DataItemSaveCore.upsert()` 의 `if (path == DataSavePath.API)` 를 `if (true)` 로 바꿔 CSV 도 닫힌 키를 REOPEN 하게 함 | `DataCsvUploadPopServiceSqliteTest.닫힌_키가_든_CSV_는_거부되고_close_액션은_생기지_않는다` | 잡힘 |
| I4 | `DataItemSaveCore.upsert()` 의 `current.value().sameAs(row.value())` 판정을 `!current.value().sameAs(row.value())` 로 뒤집음(같은 값도 UPDATE) | `DataCsvUploadPopServiceSqliteTest.같은_파일_재업로드는_전부_NONE_이고_새_선분이_없다` | 잡힘 |
| I7 | `Rfc4180Csv.parse()` 의 헤더 검사 `if (!HEADER.equals(header))` 를 `if (false)` 로 무력화(헤더 불일치를 그냥 통과시킴) | `Rfc4180CsvTest.헤더가_20열_고정_순서와_다르면_레코드_1개만_오류로_담고_데이터_행은_읽지_않는다` | 잡힘 |
| I7 | `DataCsvUploadPopService.validate()` 의 줄 번호 매핑 `outcome.lineNoOf().get(i)` 를 `outcome.lineNoOf().get(0)` 으로 고정(모든 행이 첫 줄 번호로 뒤섞임) | `DataCsvUploadPopServiceSqliteTest.오류_없는_CSV_는_검증에서_행별_동작이_입력_순서와_1대1이다` | 잡힘 |
| I8 | `src/hier-tree.ts` `order()` 의 `return [...codes, ...groups]` 를 `return [...groups, ...codes]` 로 뒤집음(코드 행 있는 노드를 그룹 뒤로 보냄) | `tests/dmc/codeItemEdit/code-tree.test.ts`(STEEL_STD 트리) + `tests/dmd/dataItemMng/item-tree.test.ts` | 잡힘 |

I1~I4·I7 여섯 변이 모두 대상 테스트에서 fail-fast 로 빨강을 확인했다(gradle `BUILD FAILED` 6/6). `DataItemSaveCore.java`
는 기존 커밋 파일이라 `/usr/bin/git checkout --` 로 되돌렸고, `Rfc4180Csv.java`·`DataCsvUploadPopService.java` 는 이번
단위가 새로 만든 미추적 파일이라 `git checkout --` 가 되돌리지 못해(스크립트가 놓친 부분) 변이 문구가 남아 있었다 —
Edit 로 손으로 원 코드(`!HEADER.equals(header)`, `outcome.lineNoOf().get(i)`)를 복원한 뒤 대상 테스트 전체를 다시 돌려
초록을 확인했다. 변이는 모두 작업 트리에서만 넣었고 커밋하지 않았다.

## 구현 단위 진행

- B1 완료(design.md 「구현 단위」 표): `DataItemSearchRequest`·`DataItemSearchResult`·`DataItemListQuery`·
  `DataItemMngService` + `DataItemMngServiceSqliteTest`(I5·I6 케이스). 커밋 a894a74.
- 대상 테스트: `com.dongkuk.dmes.mdm.dmd.dataItemMng.DataItemMngServiceSqliteTest` — 전체 초록(신규 3건 포함).
- design.md 이탈 없음.
- B2 완료(design.md 「구현 단위」 표): 신규 패키지 `dmd.dataCsvUploadPop` 전체(BPMN·`DataCsvUploadPopService`·
  `Rfc4180Csv`·DTO 5개) + `common/segment`(`UpsertResult.RowAction` 에 `issues` 필드 추가, `DataItemSaveCore.upsert()`
  가 그 필드를 채우게 확장) + `DmdBpmnActionTest` 신규 메서드 + `DataInitializer.seedMdmDataCsvUploadPopObject()`.
- 대상 테스트: `DataCsvUploadPopServiceSqliteTest`(9건)·`Rfc4180CsvTest`(5건)·`DmdBpmnActionTest`(3건, 기존 2 + 신규 1)
  — 전체 초록. 회귀 확인으로 `common.segment.*`(변경 파일을 공유하는 기존 스위트: `DataItemChecksSqliteTest`·
  `DataItemChecksTest`·`DataItemSegmentCoreSqliteTest`·`DataSegmentLockSqliteTest`·`DataCategorySegmentCoreSqliteTest`·
  `MasterDataExamplesScenarioTest`)도 함께 돌려 전체 초록을 확인했다(합계 92건, 실패 0).

## B3

프론트엔드 컴포넌트(design.md 「구현 단위」 B3). B1·B2 의 API 계약은 design.md §2 정본을 그대로 따랐다(백엔드 파일은
건드리지 않았다).

- **이동(D1)**: `pages/dmc/codeItemEdit/code-tree.ts` → `src/hier-tree.ts`(`git mv`, 내용은 머리 주석 한 줄만
  추가). `combo.ts`·`grid-state.ts`·`components/PreviewPanel.tsx`·`page.tsx`(codeItemEdit)·
  `tests/dmc/codeItemEdit/{code-tree.test.ts,sim-fixtures.ts}` 의 import 경로를 `@/hier-tree` 로 고쳤다(리포 관례대로
  `@/*` → `./src/*` 별칭, vitest.config.ts 의 `resolve.alias` 도 같은 별칭이라 테스트에서도 그대로 통했다).
- **`ItemTreePanel.tsx`(신규)**: 서버 `search(withTree=true)` 응답의 `tree` 를 `toHierRows` 어댑터(code/name/seq/
  lvl1~5 만 추출)로 `HierRow[]` 로 바꾼 뒤 `hier-tree.ts` 로 그린다. "이 노드로 보기"/"모두 펴기"/"모두 접기" 버튼은
  codeItemEdit 트리 탭과 같은 배치.
- **`dataItemMng/types.ts`·`api.ts`**: `DataItemFilters.nodeFilter`, `DataItemSearchResult.tree`/`treeTruncated`
  추가. `searchDataItems` 에 `withTree` 매개변수(기본 `false`) 추가.
- **`dataItemMng/page.tsx`**: 그리드/트리 탭(`iView`, `Tabs`) 전환. 트리는 그리드 페이징과 별개로
  `searchDataItems({...emptyFilters(), maruDataId}, 0, 1, true)` 로 한 번만 받는다(design.md §2 "별도(비페이징)
  조회" — `list`/`totalCount` 는 버리고 `tree`/`treeTruncated` 만 쓴다, 그리드 상태를 건드리지 않는다). "이 노드로
  보기"는 `filters.nodeFilter` 를 세팅하고 그리드로 돌아가 그 조건으로 재조회, 칩 `✕ 거르기 풀기`로 해제. "CSV
  업로드" 버튼은 `PageButton.objId="dataCsvUploadPop"` 로 판정한다(design.md 가 적은 "canDoButton(rbac,
  "dataCsvUploadPop","save")" 와 같은 효과를 이미 있는 `PageLayout` 의 objId 메커니즘으로 낸다 — 새 rbac 훅 호출
  없이 페이지가 이미 불러온 매트릭스를 재사용한다는 요건을 그대로 만족한다, 아래 「설계 이탈」에도 적는다).
- **`dataCsvUploadPop/`(신규 패키지, termRegPop 모양)**: `api.ts`(`validateCsv`·`saveCsv`, `CSV_COLS`, callOasis 는
  `dataItemMng/api.ts` 재사용 — termRegPop → columnMng/api 선례) · `dataCsvUploadPop.tsx`(Modal, 자기
  `useUserButtonRbac(true)` + 자기 OBJ_ID 로 `canDoButton` 판정, `FileReader.readAsText` 로 원문만 서버에 보냄, D3)
  · `index.ts` 배럴.
- **테스트**: `tests/dmd/dataItemMng/item-tree.test.ts`(신규, 수용 기준 1) — ORG 표본을 서버 `DataItemRow` 모양으로
  부풀려 `toHierRows` 가 code/name/seq/lvl1~5 만 뽑는지, 그 결과의 `buildCodeTree`/`toTreeItems` 가 `code-tree.test.ts`
  와 같은 시뮬레이터 대조 결과·라벨 규칙을 내는지 확인. `tests/dmd/dataItemMng/data-item-api.test.ts` 는 `searchDataItems`
  시그니처가 바뀌어(`withTree` 추가) 기존 케이스의 기대값에 `withTree: false` 를 더하고, `withTree`/`nodeFilter` 를
  실어 보내는 케이스를 하나 추가했다(§ 「설계 이탈」).
- 대상 테스트(`vitest related`, 관련 파일 전체): `code-tree.test.ts`·`combo.test.ts`·`grid-state.test.ts`·
  `page-render.test.ts`(codeItemEdit) · `item-tree.test.ts`·`data-item-api.test.ts`·`data-item-columns.test.ts`·
  `data-item-page.test.ts`(dataItemMng) · `data-history-page.test.ts` — 9 파일 46건 전체 초록. `pnpm --filter
  @dk-oasis/m-mdm lint`(`tsc --noEmit`) 통과.
- 변이 검증(I8, 이 단위 담당): 위 「변이 검증 기록」 표 참고.
- 도커 금지로 생략한 검증: 없음(이 단위는 프런트엔드 vitest·lint만 다뤘다, gradlew 호출 없음).

## 설계 이탈

- **DmdBpmnActionTest 의 writes 인자** — design.md §2 「생성」 B2 절이 예시로 든 호출 줄은
  `assertActions(..., Set.of("save"))` 였지만, 그대로 쓰면 `assertActions` 공용 헬퍼의
  `assertEquals(!writes.contains(action), MdmPermissions.READ_ACTIONS.contains(action), ...)` 검사가 `validate` 에서
  깨진다 — `MdmPermissions.READ_ACTIONS` 는 `search·view·export·compare` 뿐이고 `validate` 는 거기 없다(이 작업이
  `MdmPermissions.java` 를 고치는 파일 목록에 없어 건드리지 않았다). `Set.of("validate", "save")` 로 바꿔 통과시켰다 —
  팝업 진입 자체가 "CSV 업로드" 버튼(EDIT 권한 가드)으로만 열리므로 `validate` 를 READ 권한만으로 노출할 필요가
  없다는 점과도 맞다. `DmdBpmnActionTest.dataCsvUploadPop_액션은_validate_save()` 의 javadoc에 같은 근거를 남겼다.
- **(B3) "CSV 업로드" 버튼의 RBAC 판정** — design.md §2 는 "`canDoButton(rbac, "dataCsvUploadPop", "save")`로
  가드 — 이미 로드된 rbac 매트릭스를 재사용, 새 훅 호출 없음"이라고 적었다. `dataItemMng/page.tsx` 에서 직접
  `canDoButton` 을 불러 `disabled` 에 넣는 대신, `PageButton.objId`(`PageLayout.tsx` 가 이미 갖춘 "팝업을 여는
  버튼은 팝업의 OBJECT_ID 로 판정" 메커니즘, `objId` 지정 시 `canDoButton(rbacState, btn.objId, btn.action)` 을
  `PageLayout` 자신이 계산)를 썼다. 결과는 design.md 가 요구한 것과 같다 — 같은 `useUserButtonRbac` 캐시를
  재사용하고 새 fetch 가 없다 — 이므로 기능적 이탈은 아니지만, 코드 자리가 design.md 문구와 다르다는 점을 적는다.
- **(B3) `tests/dmd/dataItemMng/data-item-api.test.ts` 수정** — design.md §2 는 이 파일을 변경 목록에 올리지
  않았지만, `searchDataItems` 시그니처에 `withTree` 를 추가한 결과 기존 "빈 조건은 params 키에서 빠지고 null 이
  없다" 케이스의 기대값(`{maruDataId, showClosed, page, size}`)이 실제 payload(`withTree: false` 추가)와 어긋나
  실패했다 — API 계약 변경의 직접 결과라 이 단위(B3)가 함께 고쳤다(테스트 완화가 아니라 새 매개변수를 기대값에
  반영, `withTree`/`nodeFilter` 케이스도 하나 추가).
