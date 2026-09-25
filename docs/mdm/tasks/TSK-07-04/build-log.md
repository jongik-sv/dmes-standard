# mdm/TSK-07-04 build-log.md

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I5 | `DataItemListQuery.page()` 의 nodeFilter WHERE 절에서 `i.LVL1..LVL5 = :node` 를 모두 빼고 `i.CODE = :node` 만 남김 | `DataItemMngServiceSqliteTest.I5_노드_필터는_코드_자신_또는_lvl1_5_어딘가의_값이_같은_행만_열림_닫힘_무관` | 잡힘 |
| I6 | `DataItemListQuery.treeRows()` 에서 `AND i.VALID_TO = :openEnd` 를 빼 닫힌 행도 트리에 포함되게 함 | `DataItemMngServiceSqliteTest.I6_withTree_는_열린_행만_기존_ORDER_로_돌려준다` | 잡힘 |
| I6 | `DataItemMngService.search()` 의 `treeTruncated` 계산을 `treeRows.size() == TREE_MAX` 에서 상수 `false` 로 고정 | `DataItemMngServiceSqliteTest.I6_withTree_는_상한_TREE_MAX_에_걸리면_treeTruncated` | 잡힘 |
| I1 | `DataItemSaveCore.upsert()` 의 `checks.contentIssues(path, ...)` 호출을 `checks.contentIssues(DataSavePath.API, ...)` 로 고정(검사 3~7 무력화, CSV 도 API 처럼 행 내용 검사를 건너뛰게 함) | `DataCsvUploadPopServiceSqliteTest.검사_이슈가_있는_CSV_저장_시도도_전부_미저장이다`(fail-fast 로 이 케이스에서 먼저 빨강, `이름_없는_행은_열은_맞아도_검사4로_오류다` 도 같은 변이로 깨짐) | 잡힘 |
| I2 | `DataItemSaveCore.upsert()` 의 저장 가드 `if (!issues.isEmpty() \|\| dryRun)` 을 `if (dryRun)` 으로 약화(이슈 있어도 실제 저장 진행) | `DataCsvUploadPopServiceSqliteTest.검사_이슈가_있는_CSV_저장_시도도_전부_미저장이다` | 잡힘 |
| I3 | `DataItemSaveCore.upsert()` 의 `if (path == DataSavePath.API)` 를 `if (true)` 로 바꿔 CSV 도 닫힌 키를 REOPEN 하게 함 | `DataCsvUploadPopServiceSqliteTest.닫힌_키가_든_CSV_는_거부되고_close_액션은_생기지_않는다` | 잡힘 |
| I4 | `DataItemSaveCore.upsert()` 의 `current.value().sameAs(row.value())` 판정을 `!current.value().sameAs(row.value())` 로 뒤집음(같은 값도 UPDATE) | `DataCsvUploadPopServiceSqliteTest.같은_파일_재업로드는_전부_NONE_이고_새_선분이_없다` | 잡힘 |
| I7 | `Rfc4180Csv.parse()` 의 헤더 검사 `if (!HEADER.equals(header))` 를 `if (false)` 로 무력화(헤더 불일치를 그냥 통과시킴) | `Rfc4180CsvTest.헤더가_20열_고정_순서와_다르면_레코드_1개만_오류로_담고_데이터_행은_읽지_않는다` | 잡힘 |
| I7 | `DataCsvUploadPopService.validate()` 의 줄 번호 매핑 `outcome.lineNoOf().get(i)` 를 `outcome.lineNoOf().get(0)` 으로 고정(모든 행이 첫 줄 번호로 뒤섞임) | `DataCsvUploadPopServiceSqliteTest.오류_없는_CSV_는_검증에서_행별_동작이_입력_순서와_1대1이다` | 잡힘 |
| I8 | `src/hier-tree.ts` `order()` 의 `return [...codes, ...groups]` 를 `return [...groups, ...codes]` 로 뒤집음(코드 행 있는 노드를 그룹 뒤로 보냄) | `tests/dmc/codeItemEdit/code-tree.test.ts`(STEEL_STD 트리) + `tests/dmd/dataItemMng/item-tree.test.ts` | 잡힘 |

I1~I4·I7 여섯 변이 모두 커밋 14db376(B2 코드 커밋) 뒤 다시 돌려 대상 테스트(`DataCsvUploadPopServiceSqliteTest`·
`Rfc4180CsvTest`)에서 fail-fast 로 빨강(테스트 실패, 컴파일 오류 아님)을 확인했다. 되돌린 뒤 세 파일
(`DataItemSaveCore.java`·`Rfc4180Csv.java`·`DataCsvUploadPopService.java`) 모두 `git diff --quiet` 로 원 상태 복귀를
확인했고, 대상 테스트를 다시 돌려 초록(9건)도 확인했다. 변이는 모두 작업 트리에서만 넣었고 커밋하지 않았다.

**앞선 기록 정정** — 이 절의 첫 버전(커밋 14db376 이전)은 무효였다. B2 코드가 아직 커밋되지 않은 상태에서
`/usr/bin/git checkout -- $CORE` 로 변이를 되돌렸는데, 이는 변이만이 아니라 B2 가 그 파일에 낸 진짜 수정(`RowAction`
3-인자 생성자 호출)까지 커밋 시점(B1 상태)으로 되돌렸다. 그 뒤 이어진 M-I2·M-I3·M-I4·M-I7a·M-I7b 는 모두 그 깨진
2-인자 상태 위에서 돌아 `BUILD FAILED` 가 났지만, 원인은 컴파일 오류(`UpsertResult` 3-인자 레코드에 2-인자를 넘김)
였지 변이가 잡힌 게 아니었다. `Rfc4180Csv.java`·`DataCsvUploadPopService.java` 는 그 시점엔 미추적 파일이라
`git checkout --` 가 아예 되돌리지 못해 변이 문구가 그대로 남기도 했다. Edit 로 두 파일의 변이를 손으로 복원한 뒤
B2 를 커밋(14db376)하고, 위 표는 그 커밋 뒤 다시 돈 결과로 교체했다.

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
  `MasterDataExamplesScenarioTest`)와 B1 의 `dataItemMng.DataItemMngServiceSqliteTest`(`DataItemSaveCore` 를
  register·modify·close·reopen 경유로 같이 쓰는 형제 코드라 회귀 확인 — `upsert()`·`UpsertResult` 자체는 안 씀)도
  함께 돌려 전체 초록을 확인했다(9+5+6+21+1+33+5+11+3+12 = 106건, 실패 0).
- `mcm/api`(`DataInitializer.java` 소속 모듈) — `src/backend/mcm/api/src/test` 디렉토리 자체가 없다(테스트 소스셋
  없음, `mcm` 전체에 테스트가 있는 곳은 `mcm/lib/src/test`의 `SampleNoticeServiceTest` 하나뿐이고 `DataInitializer`
  와 무관). `ApplicationRunner`(부팅 시드)라 SQLite 단위 테스트로 값 검증도 어렵다. 대신
  `heavy.sh bash -c 'cd src/backend/mcm && ../gradlew :api:compileJava --no-daemon --console=plain'` 로 컴파일만
  확인했다 — BUILD SUCCESSFUL.
- `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` — BPMN 26/진입점 bean 26(해석
  26, 미해석 0), ERROR 0 / WARN 0 / INFO 29(기준선과 동일). 신규 `dataCsvUploadPop.bpmn` 이 정상 해석됨을 확인.

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

## B4

마지막 단위(design.md 「구현 단위」 표) — e2e·통합. B1·B2·B3 완료 뒤 시작, 이 단위가 만든 파일만 고쳤다
(`src/frontend/e2e/mdm-dataItemMng.spec.ts` 확장, `src/frontend/e2e/mdm-dataCsvUploadPop.spec.ts` 신규,
`src/frontend/e2e/fixtures/mdm-dataItem.sql` 추가, 스크린샷).

- **변이 검증 담당 없음** — design.md 「구현 단위」 표의 B4 행이 명시한 대로 I1~I8 은 모두 B1~B3 가 담당 단위에서
  끝냈다(위 「변이 검증 기록」 표). 이 단위는 그 결과가 E2E 로도 관통되는지만 확인한다 — 「변이 검증 기록」 표에 B4
  행이 없는 것은 커버리지 구멍이 아니라 표대로다.
- **`mdm-dataItemMng.spec.ts`(확장)** — 기존 S1~S4 는 그대로 두고 S5·S6 을 더했다. S5: PORT 선택 → 트리 탭 전환 →
  `withTree=true` 응답으로 `KR (n건)`·`CN (n건)` 그룹 노드가 채워짐(건수는 다른 시나리오가 늘릴 수 있어 정규식으로
  검사) + "CSV 업로드" 버튼이 PORT(MDM·편집 가능)에서 활성·CUST(EXTERNAL)에서 비활성(Q6 과 같은 판정) + `EMPTY`
  선택 시 트리 빈 상태(`item-tree-empty`). S6: KR 그룹 노드 선택 → "이 노드로 보기" → `nodeFilter=KR` 로 그리드 재조회
  → KRPUS·KRINC 는 보이고 CNSHA 는 빠짐 + 칩("KR 아래") → 칩 ✕ 로 해제 → CNSHA 복귀(I5). 트리 로드와 그리드 조회가
  같은 `dataItemMng/search` 엔드포인트를 쓰므로(design.md §2) `waitAction(page,"search")` 만으로는 응답을 가르지
  못해 postData 로 좁히는 `waitTree`/`waitNodeFilter` 헬퍼를 추가했다(`selectMaru` 와 같은 방식).
- **`mdm-dataCsvUploadPop.spec.ts`(신규)** — `dataCsvUploadPop` 은 팝업이라(D2) `dataItemMng` 화면으로 이동해 "CSV
  업로드" 버튼으로 연다. C1 팝업 열림, C2 헤더만 있는(0행) CSV 검증 → 결과 0/0/0/0 + 그리드 빈 상태
  (`.ag-overlay-no-rows-wrapper` 가 ag-grid 컨테이너·우리 컴포넌트 둘 다에 같은 클래스명을 써 `getByText` 로
  문구를 찾도록 고쳤다), C4 키 패턴 위반 행이 그 줄에만 오류로 붙고(I7, 레코드 번호 헤더=1·데이터=2부터) 저장
  버튼 비활성, C3 오류 0건 CSV 저장 → 팝업 닫힘 + 목록 반영 + 같은 파일 재업로드 시 전부 NONE(I4, C3 안에서
  이어서 확인). 대상 마루는 새로 만든 `E2E_DI_CSV`(항목 없음) — `E2E_DI_PORT` 의 KRPUS·KRINC·CNSHA 는 건드리지
  않는다(아래 「설계 이탈」).
- **대상 명령**(도커 금지 모드, gradlew 호출 없음 — 이 단위는 프런트엔드 e2e만 다룬다):
  1. `pnpm exec playwright test e2e/mdm-dataCsvUploadPop.spec.ts e2e/mdm-dataItemMng.spec.ts --list` — 컴파일
     확인(10 tests, 실패 0).
  2. 「E2E 서버 절차(TSK-07-04)」(아래)로 서버를 띄우고 `pnpm exec playwright test
     e2e/mdm-dataCsvUploadPop.spec.ts e2e/mdm-dataItemMng.spec.ts e2e/mdm-dataHistory.spec.ts --workers=1` —
     `dataHistory` 는 이 단위가 픽스처 파일을 고쳤으므로 함께 돌렸다. 1차 시도(load average 23~30, 같은 머신에서
     동시에 다른 팀원 e2e·mutation 스윕이 돌고 있었다)는 두 번 연속 서로 다른 테스트가 타임아웃(그리드 overlay
     렌더 지연·`waitForResponse` 30s 초과)으로 플레이크됐다 — 재현되지 않고 매번 다른 테스트가 걸려 코드 결함이
     아니라 부하로 판단했다(TSK-07-03 build-log 의 `evalex-perf` 부하 의존 플레이크와 같은 유형). `.ag-overlay-no-rows-wrapper`
     중복 클래스명 문제(C2)만 실제 버그라 `getByText` 로 고쳤고, 그 뒤 재시도 3차에서 **14 passed(44.7s), 실패 0**.
  3. `.ag-overlay-no-rows-wrapper` 수정 뒤 `mdm-dataCsvUploadPop.spec.ts` 단독 4/4 통과도 별도로 확인했다.
- 스크린샷: `docs/mdm/tasks/TSK-07-04/screens/`(신규 폴더) — `dmd-dataItemMng-tree.png`·
  `dmd-dataItemMng-node-filter.png`·`dmd-dataCsvUploadPop-open.png`·`dmd-dataCsvUploadPop-error.png`·
  `dmd-dataCsvUploadPop-saved.png`. `dataHistory` 재실행이 `TSK-07-03/screens/*.png` 를 덮어써 커밋 전
  `git checkout --`로 되돌렸다(TSK-07-03 절차의 8번과 같다).
- 도커 금지로 생략한 검증: 없음(이 단위는 gradlew 를 부르지 않는다).

### E2E 서버 절차(TSK-07-04)

TSK-07-03 design.md 「E2E 서버 절차」를 이 워크트리·이 Task 값으로 옮겼다(design.md 에는 이 절이 없어 Verify 가
재현할 수 있도록 여기 남긴다). `be-run.sh`·`fe-run.sh` 는 쓰지 않는다. 포트는 실행 시점에 빈 번호로 다시 고른다.

```bash
W=<이 워크트리>
SP=<Build/Verify 실행자의 scratchpad>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
lsof -iTCP:18741 -sTCP:LISTEN; lsof -iTCP:18742 -sTCP:LISTEN; lsof -iTCP:15741 -sTCP:LISTEN   # 비어 있어야 한다
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh acquire e2e-TSK-07-04
mkdir -p $W/src/backend/data
[ -f $W/src/backend/data/mcm.db ] && mv $W/src/backend/data/mcm.db $W/src/backend/data/mcm.db.bak-$(date +%Y%m%d%H%M%S)
[ -f $W/src/backend/data/mdm.db ] && mv $W/src/backend/data/mdm.db $W/src/backend/data/mdm.db.bak-$(date +%Y%m%d%H%M%S)
cd $W/src/backend/mcm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18741 --mcm.bff.invalidate-role-url=http://127.0.0.1:15741/api/mcm/internal/cache/invalidate-role --cactus.notify.publish-url=http://127.0.0.1:18741/notify/publish' > $SP/be-mcm.log 2>&1 &
BE_MCM_PID=$!
cd $W/src/backend/mdm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18742' > $SP/be-mdm.log 2>&1 &
BE_MDM_PID=$!
# 기동 로그(mcm: DataInitializer 완료 줄, mdm: "Started MdmApplication")를 기다린 뒤 SQLite 경로가 $W 안인지 확인.
cd $W/src/frontend && sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt   # 출력 없음 = 통과
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-users.sql
sqlite3 $W/src/backend/data/mdm.db < e2e/fixtures/mdm-dataItem.sql
cd $W/src/frontend && pnpm build:libs
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:15741 OIDC_ISSUER=http://127.0.0.1:15741 \
  MCM_WAS_URL=http://127.0.0.1:18741 MDM_WAS_URL=http://127.0.0.1:18742 BACKEND_API_URL=http://127.0.0.1:18741 \
  BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 pnpm exec next dev --turbopack --port 15741 > $SP/fe.log 2>&1 &
FE_PID=$!
cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15741 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  $W/.claude/skills/dflow-dev/scripts/heavy.sh pnpm exec playwright test e2e/mdm-dataCsvUploadPop.spec.ts e2e/mdm-dataItemMng.spec.ts e2e/mdm-dataHistory.spec.ts --workers=1
cd $W && /usr/bin/git checkout -- docs/mdm/tasks/TSK-07-03/screens/ src/frontend/m-mcm/next-env.d.ts
cd $W && /usr/bin/git diff --name-only -z -- src/frontend/test-results/ | xargs -0 -I{} /usr/bin/git checkout -- "{}"
kill $FE_PID $BE_MDM_PID $BE_MCM_PID
lsof -tiTCP:15741 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18742 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18741 -sTCP:LISTEN | xargs -r kill
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh release
```

- 통과 기준: 이 Task 의 두 spec + `mdm-dataHistory.spec.ts`(픽스처 공유) 전부 passed, 실패 0.
- `SMOKE_MCM_BASE_URL` 을 반드시 자기 포털(이 절차의 포트)로 두고, 5100(메인 체크아웃)을 쓰지 않는다.

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
- **(B4) `mdm-dataItem.sql` 픽스처에 마루 데이터 2건 추가** — design.md §2 는 이 파일을 변경 목록에 올리지 않았다.
  트리 "데이터 없는 마루는 빈 상태"(e2e 스모크 넷 2) 시험에 쓸, 항목이 하나도 없는 마루 데이터가 기존 픽스처
  (`E2E_DI_PORT`·`E2E_DI_CUST`)에는 없었다 — 같은 리포의 `mdm-codeItemEdit.sql`(`E2E_EMPTY`)·
  `mdm-codeCateEdit.sql`(`E2E_CATE_EMPTY`) 선례를 따라 `E2E_DI_EMPTY`(항상 빈 상태)를 더했다. CSV 업로드
  시험도 `E2E_DI_PORT` 를 그대로 쓰면 실행마다 그 마루에 새 키가 쌓여 `mdm-dataHistory.spec.ts` 가 기대하는
  KRPUS 행 수(1)에는 영향이 없지만 트리 건수 스모크(S5)의 "빈 마루" 대조를 흐릴 수 있어, CSV 전용 대상
  `E2E_DI_CSV`(항목 없음, PORT 와 같은 모양)를 따로 두었다. 두 마루 모두 `INSERT OR IGNORE`·`E2E_DI_` 접두어
  규약을 그대로 따른다(기존 행은 고치지 않았다).

## Build 게이트 (오케스트레이터)

- HEAD `fafe6af`. 백엔드 `testAll` 3138/실패 0(기준선 3120 + 신규 18), `pnpm test:unit:shared` 168/0, m-mdm lint 통과,
  OASIS 계약 검사 ERROR 0 · WARN 0 · INFO 29(기준선과 같음).
- `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` — **764 중 2 실패(env: 부하 민감, 단독 통과)**.
  실패는 `tests/evalex-perf.test.ts` NFR-1(<100ms) 두 건뿐이다(중앙값 118~140ms, 1분 부하 평균 17~32). 팀장 지시대로 부하 평균이
  12 이하로 내려간 뒤 heavy.sh 슬롯 안에서 같은 명령을 2회 다시 돌렸으나, 실행 중 부하가 27~30 으로 다시 올라 2회 모두
  evalex-perf 가 실패했다. 2회차에는 `tests/dme/ruleEdit/sections-render.test.ts` 한 건도 5s 타임아웃으로 실패했다.
  두 파일 모두 이 Task 가 고치지 않은 파일이다(`git diff f59cce7 HEAD` 에 dme·evalex 경로 없음).
- 팀장 결정(blocked 응답, 2026-09-26): (B) env 문제로 인정하고 진행한다(TSK-09-01 과 같은 판정). 기준 완화·skip·게이트 명령
  변경은 하지 않았다.
- 증적 — 2026-09-25T16:29:39Z, 부하 `{ 14.59 24.07 21.91 }`, `HEAVY_SLOT slot-2 k=2` 안에서
  `cd src/frontend && pnpm --filter @dk-oasis/m-mdm exec vitest run tests/evalex-perf.test.ts tests/dme/ruleEdit/sections-render.test.ts`
  → exit 0, `Test Files 2 passed (2)`, `Tests 27 passed (27)`(evalex-perf 4 — BASE_SPD_LKP 332ms·QLTY_GRD_JDG 388ms 포함,
  sections-render 23 — 문제의 "열 설정 초안이 dirty…" 339ms 포함).
