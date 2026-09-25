# TSK-06-05 build-log

## B1 — 순수 클래스 3종 + SPI `MasterCodeConfirmCheck`

- 커밋: 00d42bb(구현·시험), 4fb7587(변이 검증 전 시험 보강)
- 새 시험: lib `MasterCodeVersionDiffsTest`(8)·`MasterCodeConfirmChecksTest`(26)·`MasterCodeCategoryChangesTest`(5), api `MasterCodeConfirmCheckSqliteTest`(8)
- 빨강 확인: 순수 클래스 3종을 `UnsupportedOperationException` 골격으로 먼저 두고 lib 시험을 돌려 새 시험 39건 실패를 확인한 뒤 구현했다. SPI 빈은 구현과 시험을 함께 썼고, 아래 변이 검증(I3·I8·I15)으로 시험이 틀린 구현을 잡는 것을 확인했다.
- 관련 시험: `./gradlew :mdm:lib:test :mdm:api:test` 통과(lib 705·api 853, 실패 0). 운영 SPI 빈 등록이 mdm api 의 모든 컨텍스트에 영향을 주므로 api 모듈 전체를 돌렸다.

## B2 — `dmc/codeConfirm` 서비스·BPMN·메뉴 시드

- 커밋: 98f9b9f(구현·시험), 이 기록 커밋
- 새 시험(api, 33건): `CodeConfirmServiceSqliteTest`(19)·`CodeConfirmSampleHistorySqliteTest`(6)·`CodeConfirmOasisHttpTest`(3)·`CodeConfirmBpmnActionTest`(5)
- 빨강 확인: 서비스 네 메서드를 `UnsupportedOperationException` 골격으로 두고 새 시험을 돌려 33건 중 25건 실패를 확인한 뒤 구현했다(BPMN 계약 시험 5건·HT2·HT3·레지스트리 단언은 골격에서도 통과하는 계약 시험이다).
- 관련 시험: `./gradlew :mdm:api:test` 전체 886건 통과(실패 0, B1 뒤 853 + 새 33), `:mdm:lib:test` 705건 통과(새 main 소스가 lib 에 있어 함께 돌렸다). HT2 에 `meta.message` 가 MDM010 문구를 담는지 단언을 더한 뒤 `CodeConfirmOasisHttpTest` 3건을 다시 돌려 통과했다. 새 `@Service` 빈이 모든 api 컨텍스트에 들어가므로 모듈 전체를 돌렸다. mcm 은 `:mcm:api:compileJava` 성공(mcm api 에는 시험 소스가 없다).
- 계약 검사 `check_oasis_contract.py --root .`: ERROR 0·WARN 0·INFO 29(기준선과 같다). 이 검사기는 MES 모듈만 스캔해 mdm BPMN 을 보지 않는다(F20). 새 BPMN 의 계약은 `CodeConfirmBpmnActionTest` 가 고정한다.
- I29(메뉴 시드)는 백엔드 단위 시험이 없는 알려진 갭이다(design §5). B4 E2E T1·T6 와 Verify 의 diff 확인이 맡는다.

### B3 가 기댈 응답 모양(확정값)

- 모든 응답은 `data.result` 의 Map 이다. ver 는 늘 소수 세 자리 문자열(`"1.000"`), 일시는 `yyyy-MM-dd HH:mm:ss` 문자열이다.
- `search` → `rows[]`: `maruCodeId, maruCodeName, ver, verLabel, verKind, ownerId, codeStatus`(계산 상태). MDM 원천 DRAFT 만, ID·ver 오름차순.
- `view` → `header{maruCodeId, maruCodeName, status(계산), sourceKind}`, `version{ver, verLabel, verKind, status, ownerId, rowVersion, applyFrom, applyTo, requestedBy, releasedAt, restoredFrom}`, `previous{ver, verLabel, applyFrom}` 또는 null, `firstVersion`, `diff[]`, `categoryChanges[]`, `unchangedCategories[]`(카테고리 이름), `serverNow`.
  - `diff[]` = `{table, key, kind, oldValues, newValues}`. `table` 은 `ITEM`·`CATE`·`CATE_ITEM`, `key` 는 **D10 전체 키**(`ITEM:83`, `CATE_ITEM:MAJOR,2P`), `kind` 는 `ADDED`·`REMOVED`·`CHANGED`. 값 맵 키는 물리 칼럼명(`NAME` 등), ADDED 의 oldValues·REMOVED 의 newValues 는 null.
  - `categoryChanges[]` = `{cateId, cateName, kind(NEW|CLOSED|CHANGED), beforeCount, afterCount, addedCodes, removedCodes, reduced}`, cateId 오름차순. 없는 쪽 건수는 null.
- `validate` → `rows[]` 10행 `{no, item, severity, status, issues[{code, message, field, itemKey}]}`. `no` 는 `"1"`·`"2"`·`"2-1"`·`"2-2"`·`"3"`~`"8"`, `item` 은 `MasterCodeConfirmCheckItem` enum name(`APPLY_FROM_ORDER` 등), `severity` 는 `REJECT`·`WARNING`, `status` 는 `PASSED`·`WARNED`·`REJECTED`·`EXEMPT`·`DEFERRED`(3항은 D3 로 덮어 `DELEGATED` 가 나오지 않는다). 3항 거부 이슈의 code 는 `MDM008`. 그 밖에 `rejectedCount`, `warnedCount`, `applyFrom`(정규화), `futureApplyFrom`(서버 시계), `serverNow`.
- `confirm` → 확정 뒤 `view` 와 같은 키를 **최상위에 병합**하고(`header`·`version`·… ), 더해 `confirmed{ver, rowVersion}`, `closedPreviousVer`(최초 버전이면 null), `warnings[]`(확인한 경고 이슈)를 싣는다.
- `view` 는 ver 를 비우면 DRAFT 를 고르고, DRAFT 가 없으면 MDM021("확정할 DRAFT 가 없습니다")을 던진다. 확정 성공 뒤 화면을 다시 그릴 때는 ver 를 넘겨 `view` 를 부르거나, `confirm` 응답에 병합된 view 키를 그대로 쓴다(ver 없이 부르면 T4 에서 RELEASED 배지 대신 오류가 보인다).
- 순서 의존: 메뉴 시드(B2)가 page-registry 항목(B3)보다 먼저 들어갔다. B3 가 끝나기 전에는 `mdm-sample-smoke.spec.ts` 가 "등록된 페이지를 찾을 수 없습니다"로 깨질 수 있다(design 「관례·함정」 마지막 항목).
- 요청: `confirm` 의 `warningsAcknowledged` 는 JSON boolean 으로 바인딩된다(HT1 이 false → 실패, true → 확정으로 확인). 문자열 `"true"` 는 필요 없다. `rowVersion` 은 숫자.

## 설계 이탈

- 시험 도우미 `lib/src/test/.../common/mastercode/MasterCodeProcCdLedger.java` 를 새로 만들었다(설계 §2 목록에 없음). 04 PROC_CD 원장(v2.000 이 82·83 을 닫은 뒤)을 조회 모델 행 모양으로 두고 `viewAt(V)` 로 거른 모습을 만든다. `MasterCodeVersionDiffsTest`·`MasterCodeCategoryChangesTest` 가 함께 쓴다.
- `MasterCodeConfirmCheckSqliteTest` 에 설계 SP1~SP5 밖의 시험을 더했다: 레지스트리의 MASTER_CODE 확정 검사가 이 빈인지(I28 일부), 최초 버전의 `diff().base` 가 null 인지, RELEASED 없는 2.000 DRAFT 가 최초 버전이라 3·4항 EXEMPT 인지(I3 의 SPI 판). SP5 는 행 수·ROW_VERSION 에 더해 세 선분 표의 행 모습 전체를 전후로 비교한다.
- SP1·SP2 시드: `MasterCodeFixtures.seedProcCdBeforeDraftEdits()` 는 v2.000 이 편집하기 전 모습이라, 시험 `@BeforeEach` 에서 82·83@1.001·MAJOR 82 의 TO_VER 를 `2.000` 으로 직접 UPDATE 해 04:1066-1080 모습을 만든다(공용 픽스처는 고치지 않았다).
- `MasterCodeConfirmChecks` 에 설계 시그니처 외에 package-private `itemOf(MasterCodeItemIssueCode)` 를 두었다(CK6 가 enum 전체를 순회해 부른다). 순수 클래스 `MasterCodeVersionDiffs` 에 D10 키 도우미 `itemKey`·`cateKey`·`cateItemKey`(public static)를 두었다 — B2 의 `CodeConfirmService` 가 같은 키를 만들 때 쓴다.
- `MasterCodeCategoryChanges.Change.kind` 값은 상수 `NEW`·`CLOSED`·`CHANGED` 로 두었다. 없는 쪽의 건수(`beforeCount`·`afterCount`)는 null 이다.

- (B2) 응답을 DTO POJO 가 아니라 `Map<String, Object>` 로 두었다(설계 §2 의 `CodeConfirmView.java 외 응답 DTO` 를 만들지 않았다). 06-03·06-04 의 가장 가까운 형제(`codeItemEdit`·`codeCateEdit`)가 Map 응답이고, 중첩 모양(header·version·previous·diff·검사 행)을 POJO 로 옮기면 파일이 열 개 가까이 늘어난다. JSON 모양은 §6.5 그대로다.
- (B2) `CodeConfirmService` 는 확정 검사 SPI 를 생성자로 받지 않고 호출 시점에 `VersionSpiRegistry.confirmCheck(MASTER_CODE)` 로 꺼내 `MasterCodeConfirmCheckSpi` 로 쓴다(아니면 `IllegalStateException`). `VersionScenarioTestConfig` 의 후처리기가 운영 SPI 빈 정의를 지우므로, 생성자로 받으면 그 설정을 쓰는 기존 시나리오 시험 컨텍스트가 기동하지 못한다. 확정 트랜잭션과 같은 레지스트리를 보므로 validate·view 와 confirm 이 같은 검사를 쓴다.
- (B2) `version.requestedBy` 는 조회 모델 `VerRow` 에 없는 칸이라 `MdmCodeVerRepository.findById` 로 읽는다(새 네이티브 SQL 없음). 같은 트랜잭션에서 공통 서비스의 네이티브 UPDATE 뒤에 읽으므로 관리 중인 엔티티면 `refresh` 한다. HT1 이 OASIS 트랜잭션 안에서 `requestedBy == kim` 을 단언한다.
- (B2) 설계 S6 은 `EMERGENCY_YN` 을 NULL 로 적었으나 칼럼이 `NOT NULL DEFAULT 'N'`(V9) 이라 `'N'` 으로 단언했다.
- (B2) 설계는 요청 모양에 `CodeItemEditRequests`·`CodeCateEditRequests` 도우미를 쓰라고 했으나 다른 패키지의 package-private 이라 쓸 수 없어, 같은 모양의 행 도우미(`itemRow`·`cateRow`·`memberRow`)를 `CodeConfirmRequests` 에 두었다. 원래 도우미 파일은 고치지 않았다.
- (B2) `CodeConfirmSampleHistorySqliteTest` 는 엔티티 persist 를 쓰는 codeMng·codeEdit 서비스 때문에 액션마다 `TransactionTemplate` 으로 부른다(`CodeMngServiceSqliteTest` 관례, OASIS 프로세스 트랜잭션과 같은 경계).
- (B2) `CodeConfirmOasisHttpTest` 는 `MasterCodeTestConfig` 를 import 하지 않고 시계 하나만 둔다(`@Primary MutableCurrentUser` 가 요청 헤더 사용자를 가리므로). 설계 §3.2 머리의 "MasterCodeTestConfig import" 는 서비스 시험 두 개에만 적용했다.
- (B2) 설계 밖 시험을 더했다: `CodeConfirmBpmnActionTest.B5` 가 서비스 클래스·메서드에 `@Transactional` 이 없는지 직접 단언한다(I18 의 정적 판). `S5_담당자_역할이_없으면_입력을_보기_전에_MDM013` 은 applyFrom 을 비워도 MDM013 이 먼저 나는지 본다 — 공통 서비스도 MDM013 을 던지므로 이 단언이 없으면 서비스 가드 제거(I20 변이)가 동등 변이가 된다. `validate` 의 apply_from 빈 값(REQUIRED_VALUE)·형식 오류(INVALID_VALUE)도 단언한다.
- (B2) `confirm` 에서 SPI `check` 의 경고 목록(`ConfirmResult.warnings`)을 응답 `warnings` 로 싣는다(설계 §6.5 `warnings[…]`).

## 변이 검증 기록

B1 담당 I1~I16. 대상 시험만 `--fail-fast` 로 돌렸다(lib 29건 한 스크립트, api 3건 별도 스크립트, 각각 `heavy.sh` 로 감쌈). 변이마다 `git checkout --` 로 되돌렸고 작업 트리가 깨끗한 것을 확인했다.

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I1 | 5항 행을 빠뜨림 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I1 | 행 순서를 뒤집음 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I2 | 공통 검사(3항)를 최초 버전 면제보다 먼저 판정 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I2 | 보류(inScope) 판정 제거 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I2 | 심각도 거부/경고 뒤바꿈 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I3 | 순수 `report` 가 최초 버전을 ver == 1.000 으로 판정 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I3 | SPI 최초 판정을 ver == 1.000 으로 | `MasterCodeConfirmCheckSqliteTest` SP4_I3 | 잡힘 |
| I4 | DELEGATED·EXEMPT 행 이슈도 errors 에 넣음 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I4 | WARNED 행 이슈를 errors 로 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I5 | 코드 행 itemKey 의 `ITEM:` 접두 누락 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I5 | 이슈 code 를 항목 enum 대신 세부 코드로 둠 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I6 | 매핑 밖 저장 검사 코드를 1항으로 흡수(던지지 않음) | `MasterCodeConfirmChecksTest` | 잡힘 |
| I6 | LVL_PARENT_MISMATCH 를 8항으로 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I7 | touched = diff 에 있는 코드만 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I8 | 순수 `previousReleased` 가 ver == V 포함 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I8 | 순수 `previousReleased` 가 RELEASED 상태 조건 없음 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I8 | SPI base 를 가장 작은 RELEASED 로 | `MasterCodeConfirmCheckSqliteTest` SP1 | 잡힘 |
| I8 | SPI base 를 V 대신 9999 기준 가장 큰 RELEASED 로 | — | 안 잡힘(보고) — 실데이터에서는 DRAFT 가 가장 큰 ver 라 결과가 같은 동등 변이다. V 기준 규칙 자체는 순수 시험 CK8 이 잡는다 |
| I9 | BASE 를 2항 검사에서 뺌 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I10 | 2항 거부 카테고리도 2-1·2-2 해석 | `MasterCodeConfirmChecksTest` CK7 | 잡힘 |
| I10 | 2-1 itemKey 를 CATE 키로 | `MasterCodeConfirmChecksTest` | 잡힘 |
| I10 | 2-2 경고 분기를 다른 코드로 바꿔 경고가 default 로 빠짐(예외) | `MasterCodeConfirmChecksTest` | 잡힘 |
| I10 | 2-2 경고를 버려진 목록에 넣어 조용히 버림 | `MasterCodeConfirmChecksTest` CK2_2_2·CK4 | 잡힘 |
| I11 | 4항 판정 반전(diff 있으면 거부) | `MasterCodeConfirmChecksTest` | 잡힘 |
| I12 | 값이 같은 닫힘·새 쌍도 CHANGED | `MasterCodeVersionDiffsTest` | 잡힘 |
| I12 | REMOVED 의 newValues 를 채움 | `MasterCodeVersionDiffsTest` | 잡힘 |
| I12 | 닫힘·새 쌍을 합치지 않음 | `MasterCodeVersionDiffsTest` | 잡힘 |
| I13 | ITEM 값 맵에 FROM_VER | `MasterCodeVersionDiffsTest` | 잡힘 |
| I13 | CATE_ITEM 값 맵에 CODE | `MasterCodeVersionDiffsTest` | 잡힘 |
| I14 | 버전 비교를 `equals` 로 | `MasterCodeVersionDiffsTest` | 잡힘 |
| I15 | SPI `report` 가 코드 1P 를 닫음(쓰기) | `MasterCodeConfirmCheckSqliteTest` | 잡힘 |
| I16 | 줄어듦 판정에서 CLOSED 제외 | `MasterCodeCategoryChangesTest` | 잡힘 |
| I16 | 적중 집합 대신 건수 비교 | `MasterCodeCategoryChangesTest` | 잡힘 |
| I16 | 적중 대신 해석 행 전체를 집합으로 | `MasterCodeCategoryChangesTest` | 잡힘 |
| I17 | 서비스가 confirm 앞에서 `VersionWriteGuard.beginDraftWrite` 를 부름(row_version 이중 증가) | `CodeConfirmServiceSqliteTest` S6_S9 | 잡힘 |
| I18 | 서비스 클래스에 `@Transactional` | `CodeConfirmOasisHttpTest` HT1 | 잡힘 |
| I19 | 공통 서비스가 확정 검사 errors(MDM010)를 버리고 진행 | `CodeConfirmServiceSqliteTest` S5(변경 없는 DRAFT) | 잡힘 |
| I20 | 서비스 첫 줄 `requireSteward()` 제거 | `CodeConfirmServiceSqliteTest` S5(역할 없음) | 잡힘 |
| I21 | validate 가 3항을 덮지 않음(DELEGATED 그대로) | `CodeConfirmServiceSqliteTest` S3 | 잡힘 |
| I21 | `DefaultApplyFromOrderCheck` 가 같은 일시를 허용 | `CodeConfirmServiceSqliteTest` S5(MDM008) | 잡힘 |
| I21·I8 | 서비스의 직전 RELEASED 를 가장 작은 RELEASED 로 | `CodeConfirmServiceSqliteTest` S8 | 잡힘 |
| I22 | validate 의 DRAFT 확인(MDM002) 제거 | `CodeConfirmServiceSqliteTest` S4 | 잡힘 |
| I23 | 서비스가 경고 확인을 늘 true 로 보냄 | `CodeConfirmServiceSqliteTest` S5(MDM014) | 잡힘 |
| I24 | CREATED→INUSE 경계를 `applyFrom.isBefore(now)` 로(같은 시각 제외) | `CodeConfirmServiceSqliteTest` S7 | 잡힘 |
| I25 | `casConfirm` 이 REQUESTED_BY 를 NULL 로 | `CodeConfirmServiceSqliteTest` S6_S9 | 잡힘 |
| I26 | 공통 서비스가 직전 RELEASED 를 닫지 않음 | `CodeConfirmSampleHistorySqliteTest` H1 | 잡힘 |
| I27 | BPMN confirm 분기 method 를 `validate` 로 | `CodeConfirmBpmnActionTest` B4 | 잡힘 |
| I28 | `MasterCodeConfirmCheck` 의 `@Component` 제거 | `CodeConfirmOasisHttpTest` HT3 | 잡힘 |
| I29 | — | — | 안 잡힘(보고) — 메뉴 시드는 백엔드 단위 시험이 없는 알려진 갭(design §5). B4 E2E T1·T6 와 Verify diff 확인 |
| I29 (B4) | `seedMdmMenus()` 의 `seedMdmCodeConfirmMenu();` 호출 제거 → mcm 새 DB 로 재기동 | E2E `mdm-codeConfirm.spec.ts` T1(마스터코드 폴더까지 열리고 "버전 확정" 항목 없음) | 잡힘 |
| I36 (B4) | page-registry 에서 `"dmc/codeConfirm"` 항목 제거 | E2E T1(`cf-list` 없음) | 잡힘 |
| I37 (B4) | 확정 뒤 `refreshList(keyword)` 를 부르지 않음 | E2E T4(`cf-row-E2E_CF_OK-1.000` 남음) | 잡힘 |
| I37 (B4) | 확정 뒤 `load({maruCodeId, ver})` 를 부르지 않음 | E2E T4(RELEASED 배지 없음) | 잡힘 |
| I38 (B4) | `canValidate` 를 `true` 로 고정(RBAC 무시) | E2E T6(`cf-validate` 활성) | 잡힘 |

- 동등 변이라 싣지 않은 것: I4 "EXEMPT·DELEGATED 행에도 이슈 목록을 남김"은 `report` 가 그 행에 이슈를 만들지 않아 관찰되지 않는다(`flatten` 쪽 변이로 대신 잡았다). I11 "`!firstVersion &&` 제거"는 최초 버전이면 4항이 이슈 판정 전에 EXEMPT 가 되어 관찰되지 않는다.
- (B2) 변이 검증: B2 담당 I17~I29 를 대상 시험만 `--fail-fast` 로 돌렸다(스크립트 두 번, 각각 `heavy.sh` 로 감쌈). 공통 서비스(`DefaultVersionStateService`·`DefaultApplyFromOrderCheck`·`VersionRowStore`)와 B1 파일(`MasterCodeConfirmCheck`)에는 작업 트리에서만 변이를 넣고 되돌렸다. 첫 스윕은 새 파일(추적 전)에 넣은 변이가 `git checkout --` 로 되돌려지지 않아 변이가 쌓였으므로 결과를 버리고, 구현을 복원·커밋(98f9b9f)한 뒤 전부 다시 돌렸다. 위 표는 다시 돌린 결과다. 끝난 뒤 작업 트리가 깨끗한 것을 확인했다.

---

# B3 기록 (B2 와 병렬 실행 — 별도 워크트리 wip/9656745e-b3 에서 작성한 build-log-B3.md 를 오케스트레이터가 합침)

## B3 — FE 화면 `dmc/codeConfirm`

- 작업 위치: 별도 워크트리 브랜치 `wip/9656745e-b3`(기점 0747091). B2(백엔드)와 동시에 진행해 서버 응답 모양은 design.md §6.5 를 정본으로 삼았고, vitest 는 `globalThis.fetch` mock 으로 돈다.
- 커밋: 70a3178(화면·시험·tsup·page-registry), 이어서 문서 커밋(기능설계서·식별자 사전·이 기록, `DFlow-Unit: B3 done`)
- 새 시험: `tests/dmc/codeConfirm/checks.test.ts`(33)·`code-confirm-page.test.ts`(21), 합계 54
- 빨강 확인: `checks.ts` 를 `throw` 골격, `page.tsx` 를 `null` 렌더로 두고 두 시험 파일을 돌려 53건 모두 실패를 확인한 뒤 구현했다(`checkTitle` 시험 1건은 뒤에 더했다).
- 관련 시험: `pnpm --filter @dk-oasis/m-mdm exec vitest related <codeConfirm 5개 파일> --run` 54건 통과, `tests/tsup-entries.smoke.test.ts`·`tests/evalex-entry.test.ts` 4건 통과, `pnpm --filter @dk-oasis/m-mdm lint`(tsc) 통과.
- page-registry: `cd src/frontend/m-mcm && node scripts/generate-page-registry.mjs` 로 다시 만들었다. diff 는 `"dmc/codeConfirm"` 한 줄뿐이다.

### B3 설계 이탈

- **현재 사용자 ID 출처**: §6.5 `view` 응답에는 codeEdit·ruleEdit 의 `me` 같은 현재 사용자 칸이 없다. I30 의 "소유자 본인" 판정은 shared `useUserButtonRbac()` 가 돌려주는 `userId`(`/api/auth/me` 의 `user.id`, `ButtonRbacState` 공개 필드)로 한다. 서버 계약(B2)은 바꾸지 않았다. RBAC 를 아직 불러오지 않았으면 `userId` 가 빈 문자열이라 확정 버튼은 꺼져 있다.
- **검사·확정 버튼 위치**: `MdmPageLayout.buttons` 가 아니라 확정 폼 안의 shared `Button`(`cf-validate`·`cf-confirm`)으로 두었다. RBAC 판정은 `canDoButton(rbac, "codeConfirm", "validate"|"confirm")` 으로 명시해 `canConfirm` 에 넘긴다(PageLayout 자동 비활성에 기대지 않는다). DRAFT 가 아니면 두 버튼을 비활성으로 보인다.
- **오류 표시**: codeCateEdit 의 `ErrorModal` 대신 인라인 오류 영역 `cf-error`(role=alert)만 둔다(§6.7-5, E2E T5 가 이 영역을 본다). 확정이 실패하면 대화상자를 닫고 message 를 이 영역에 보인다.
- **검사 버튼과 빈 입력**: apply_from 이 비어 있어도 검사 버튼을 끄지 않고, 누르면 오류 영역에 "적용 시작 일시를 입력하세요" 를 보인다(서버를 부르지 않는다). 버튼 활성은 DRAFT·`validate` 권한·처리 중 여부로만 정한다.
- **확정 판정의 apply_from 비교**: 서버 `validate` 가 돌려주는 정규화 `applyFrom` 과 비교하지 않고, 검사 때 보낸 `toServerDateTime(입력)` 을 기억해 지금 입력의 변환값과 비교한다(서버 형식 차이로 버튼이 영구히 꺼지는 것을 막는다). 확정 요청의 `applyFrom` 도 이 검사한 값이다.
- **검사 항목 설명**: 검사 표의 "검사" 칸에 04 「상신 시 검사」 문구를 줄인 설명(`checks.ts` 의 `checkTitle`, 번호별)과 서버 `item`(enum 이름)을 함께 보인다. 모르는 번호는 `item` 을 그대로 쓴다.
- **스냅샷 모양**: `{ maruCodeId, ver? }` — handoff 에 ver 가 없으면 ver 를 넣지 않는다.
- **확정 대화상자 testid**: 설계에 없는 `cf-future-warning`(미래 적용 경고 문구)·`cf-modal-warnings`(경고 목록)·`cf-target`·`cf-previous`·`cf-released`(DRAFT 아닌 버전의 확정 결과)·`cf-diff-{key}`·`cf-cate-{cateId}`(`data-reduced`)·`cf-check-{no}` 의 `data-rejected`·`cf-search`(목록 조회 버튼)를 더했다. shared `Checkbox` 는 data-testid 를 받지 않아 `cf-ack` 는 감싼 `span` 에 있다 — E2E 는 `getByTestId("cf-ack").locator("input")` 로 체크한다.

### B3 변이 검증 기록

B3 담당 I30~I35. 대상 시험 `tests/dmc/codeConfirm`(2파일)만 `vitest run --bail=1` 로 돌렸다. 스크립트 하나(변이 넣기 → 대상 시험 → `git checkout --` 되돌리기, `trap` 으로 중단 시에도 되돌림)를 `heavy.sh` 로 한 번 감싸 70a3178 기준으로 돌렸고, 끝난 뒤 작업 트리가 깨끗한 것을 확인했다. 20개 변이가 모두 적용되었고 모두 잡혔다.

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I30 | `canConfirm` 의 DRAFT 조건 제거 | `checks.test.ts` "DRAFT 가 아님 → false" | 잡힘 |
| I30 | 소유자 본인 조건 제거 | `checks.test.ts` "소유자가 아님 → false" | 잡힘 |
| I30 | confirm 권한 조건 제거 | `checks.test.ts` "confirm 권한 없음 → false" | 잡힘 |
| I30 | 검사 결과 빈 목록 허용 | `checks.test.ts` "검사 결과가 빈 목록 → false" | 잡힘 |
| I30 | REJECTED 0건 조건 제거 | `checks.test.ts` "REJECTED 1건 → false" | 잡힘 |
| I30 | 검사한 apply_from 일치 조건 제거(`return true`) | `checks.test.ts` "검사한 apply_from 과 입력값이 다름 → false" | 잡힘 |
| I30 | 화면이 현재 사용자 대신 DRAFT `ownerId` 를 `me` 로 넘김 | `code-confirm-page.test.ts` "DRAFT 소유자가 아니면 … 비활성" | 잡힘 |
| I30 | 화면이 confirm RBAC 대신 `true` 를 넘김 | `code-confirm-page.test.ts` P5 confirm 권한 없음 | 잡힘 |
| I30 | 화면이 검사한 apply_from 대신 현재 입력을 넘김 | `code-confirm-page.test.ts` P7 | 잡힘 |
| I31 | 대화상자가 늘 `warningsAcknowledged=true` 를 보냄 | `code-confirm-page.test.ts` P3 경고 없음 → false | 잡힘 |
| I31 | 경고 확인 체크 전에도 확인 버튼 활성 | `code-confirm-page.test.ts` P3 경고 있음 | 잡힘 |
| I32 | 미래 판정을 브라우저 시계(`Date.now()`)로 | `code-confirm-page.test.ts` P4 futureApplyFrom=true·과거 일시 | 잡힘 |
| I33 | `callOasis` 의 null·undefined 필터 제거 | `code-confirm-page.test.ts` P1 ver 없이 넘겨받음 | 잡힘 |
| I33 | `view` 의 ver 를 `Number` 로 | `code-confirm-page.test.ts` 목록 행 선택 → view | 잡힘 |
| I33 | `confirm` 의 ver 를 `Number` 로 | `code-confirm-page.test.ts` P3 경고 있음 | 잡힘 |
| I34 | 초(`:00`)를 붙이지 않음 | `checks.test.ts` toServerDateTime 분 단위 | 잡힘 |
| I34 | `T` 구분자를 그대로 둠 | `checks.test.ts` toServerDateTime 분 단위 | 잡힘 |
| I34 | 화면이 변환 없이 입력값 그대로 `validate` | `code-confirm-page.test.ts` P2 | 잡힘 |
| I35 | 서버 message 대신 고정 문구 | `code-confirm-page.test.ts` P6 | 잡힘 |
| I35 | 오류 영역 testid 제거 | `code-confirm-page.test.ts` P6 | 잡힘 |

- 동등 변이라 싣지 않은 것: I31 "화면이 대화상자의 체크 값 대신 `경고 있음` 여부를 보냄"은 체크 전에는 확인 버튼이 꺼져 있어(위 두 번째 I31 변이가 잡는 조건) 관찰되는 요청이 같다.
- 스윕 뒤 `checkTitle`(검사 항목 설명) 추가로 `page.tsx`·`checks.ts` 가 바뀌었지만 위 변이 대상 줄은 바뀌지 않았다.

### B3 B4 에 넘기는 것

- E2E 에서 쓸 testid 는 §6.7 이름 그대로다(`cf-list`·`cf-keyword`·`cf-search`·`cf-row-{id}-{ver}`·`cf-list-empty`·`cf-form`·`cf-apply-from`·`cf-validate`·`cf-confirm`·`cf-checks`·`cf-check-{no}`·`cf-check-status-{no}`·`cf-diff`·`cf-diff-empty`·`cf-cate-summary`·`cf-error`·`cf-ack`·`cf-modal-ok`). `cf-apply-from` 은 `type="datetime-local" step=1` 이라 Playwright `fill("2026-10-01T00:00:00")` 로 넣는다.
- **B2 실제 응답과 대조할 것**(화면은 §6.5 모양의 fetch mock 으로만 초록이다. 기준 파일 `pages/dmc/codeConfirm/types.ts`):
  1. `confirm` 의 `warningsAcknowledged` 는 JSON boolean 으로 보낸다. B2 가 문자열 `"true"` 가 필요하다고 기록했으면 `api.ts` `confirmDraft` 와 P3 기대값을 바꾼다.
  2. `ver` 는 모든 응답(search 행, `view.version`, `previous`, `confirmed`)에서 문자열이어야 한다. BigDecimal 이 JSON number 로 나오면 `cf-row-{id}-2.000` testid 와 I33 이 깨진다.
  3. search 결과 키는 `rows`, validate 행 `no` 는 문자열(`"2-1"` 등)이다. testid `cf-check-{no}` 가 이 값에 기댄다.
- mantine-aggrid-ui 점검: `grep -rnE "@mantine|ag-grid" src/frontend/m-mdm/pages/dmc/codeConfirm` 0건 — shared 래퍼(`@dk-oasis/shared/form`·`modal`·`layout`)만 쓴다.
- 성공 토스트 문구는 "확정했습니다", 확정 뒤 상태 배지는 `VersionStatusBadge`(RELEASED 이고 apply_from 이 지났으면 "확정", 미래면 "적용 대기")다.

---

## B4 — 연결 확인·E2E

- 커밋: 이 기록과 함께 커밋(E2E 스펙·픽스처·스크린샷, `DFlow-Unit: B4 done`)
- 새 시험: `src/frontend/e2e/mdm-codeConfirm.spec.ts` T1~T6(design §3.4), 픽스처 `src/frontend/e2e/fixtures/mdm-codeConfirm.sql`(E2E_CF_OK·NOCHG·RACE)
- 스크린샷: `screens/dmc-codeConfirm-{open,list,rejected,confirmed,error,readonly}.png`

### B2 응답 ↔ B3 화면 대조(고칠 곳 없음)

B3 가 §6.5 모양 mock 으로만 시험한 가정을 B2 실제 코드와 맞대었다. 다섯 항목이 모두 맞아 FE·BE 모두 고치지 않았다. E2E T1~T6 가 실제 서버로 같은 결론을 확인했다.

| 항목 | B3 가정(`pages/dmc/codeConfirm`) | B2 실제(`CodeConfirmService.java`) | 판정 |
|---|---|---|---|
| confirm 응답 | view 키를 쓰지 않고 확정 뒤 `load({maruCodeId, ver: version.ver})` 로 다시 부른다(`page.tsx:185`) | `buildView(target(id, ver))` 를 최상위에 병합(214행). view 는 ver 가 비면 DRAFT, 없으면 MDM021(233-244행) | 맞음 — 다시 그릴 때 ver 를 넘기므로 MDM021 이 나지 않는다(T4 가 RELEASED 배지로 확인) |
| `warningsAcknowledged` | JSON boolean(`api.ts` `confirmDraft`) | `Boolean` 필드, `Boolean.TRUE.equals(...)`(`CodeConfirmRequest`, 208행) | 맞음 — T4(true)·T5(false) 가 실제로 통과 |
| ver | 문자열(`types.ts`) | `MasterCodeLedgerQueries` 가 `setScale(3)` 한 BigDecimal 을 `toPlainString()`(125·265·279행) → `"1.000"` | 맞음 — T2 의 `cf-row-E2E_CF_NOCHG-1.001` testid 가 실제 값으로 잡힌다 |
| search 결과 키 | `rows` | `result.put("rows", rows)`(134행) | 맞음 |
| validate 행 `no` | 문자열(`"2-1"` 등) | `r.item().no()`(176행, enum 의 문자열 번호) | 맞음 — T4 의 `cf-check-status-2-2` 가 잡힌다 |
| 현재 사용자(B3 설계 이탈) | `useUserButtonRbac().userId` = `/api/auth/me` 의 `user.id` | 소유자 `OWNER_ID` = 로그인 USER_ID | 맞음 — T4 에서 확정 버튼이 켜진다(소유자 본인 판정) |

### 서버·E2E 실행

design 「서버·E2E 기동 방법」 그대로 슬롯 `e2e-TSK-06-05` 를 잡고 mcm 18605·mdm 18698·FE 15605 에 새 mcm.db·mdm.db 로 직접 띄웠다. 끝난 뒤 기록한 PID 와 자기 포트 리스너만 종료하고 슬롯을 풀었다. 다른 Task 스크린샷(TSK-01-02·01-03)·`next-env.d.ts`·`test-results` 변경은 `git checkout --`·`git restore` 로 되돌렸다.

- 시드 대조: 첫 기동 직후 `mdm-rbac-seed-check.sql` diff 출력 없음. `codeConfirm` 권한 행 `MDM_STD_ADMIN|PERM_MDM_READ`·`MDM_STEWARD|PERM_MDM_CONFIRM`·`SYSADMIN|PERM_ALL`, 메뉴 행 1건.
- 최종 실행: `pnpm exec playwright test e2e/mdm-codeConfirm.spec.ts e2e/mdm-sample-smoke.spec.ts e2e/mdm-shell-rbac-smoke.spec.ts --workers=1` → **11 passed**(codeConfirm 6·sample-smoke 1·shell-rbac-smoke 4). 메뉴 시드(B2)와 page-registry(B3)가 함께 들어가 기존 스모크가 깨지지 않는다.
- 확정 뒤 원장: E2E_CF_OK 1.000 RELEASED `2026-01-01 00:00:00`~`9999-12-31 00:00:00`, ROW_VERSION 1, REQUESTED_BY `e2e_mdm_steward`, TB_MDM_CODE.STATUS INUSE(과거 apply_from 이라 확정 트랜잭션에서 올랐다).
- 일시적 실패 1회(보고): 스크린샷 대기를 더한 뒤 서버를 다시 띄운 첫 실행에서 codeConfirm T2·shell-rbac T3 가 로그인 단계에서 실패했다. mcm 로그에 로그인 요청의 `SQLITE_BUSY`(mcm.db 잠금)가 남았고 화면·시험 코드와 무관하다. 데이터가 소모되지 않은 상태(serial 이라 T4 전에 멈춤)에서 같은 명령을 다시 돌려 11건 모두 통과했다.

### B4 설계 이탈

- **apply_from 입력 형식**: B3 인계는 `fill("2026-10-01T00:00:00")` 을 권했으나, 초가 0 이면 Chromium 이 `datetime-local`(step 1) 값을 분 단위로 정규화해 Playwright 가 `Malformed value` 로 실패한다. 스펙은 `yyyy-MM-ddTHH:mm` 으로 넣고, 화면의 `toServerDateTime` 이 `:00` 을 붙여 보낸다(I34). 화면 코드는 고치지 않았다.
- **T6 무조건 통과 방지**: 권한 조회(`/secUser/myButtonEndpoints`) 응답을 기다린 뒤 버튼 비활성을 단언한다. RBAC 를 불러오기 전에는 버튼이 늘 꺼져 있기 때문이다. 아래 I38 변이가 T6 에서 잡히는 것으로 확인했다.
- **스크린샷 대기**: T4·T5 는 닫히는 확정 대화상자가 화면을 가리지 않도록 `dialog` 가 사라진 뒤 찍는다.
- **T7(codeEdit → 확정 이동) 넣지 않음**: 선택 항목이다. 핸드오프는 `code-confirm-page.test.ts` P1 과 codeEdit 기존 vitest 가 잡는다.

### B4 변이 검증

B4 담당 I36~I38 과 B2 가 넘긴 I29 를 돌렸다(위 「변이 검증 기록」 표의 `(B4)` 행). 스크립트 두 개(변이 넣기 → mdm.db 의 `E2E_CF_%` 행을 지우고 픽스처 다시 넣기 → E2E `--max-failures=1` → `git checkout --` 되돌리기, `trap` 으로 중단 시에도 되돌림)를 각각 `heavy.sh` 로 감쌌다. m-mdm 변이(I37·I38)는 `pnpm --filter @dk-oasis/m-mdm build` 뒤 돌렸고 끝에 되돌린 소스로 다시 빌드했다. I29 는 mcm 을 새 DB 로 재기동해 돌리고, 되돌린 뒤 다시 새 DB 로 재기동했다. 각 실패가 의도한 단언(메뉴 항목·`cf-list`·목록 행 수·RELEASED 배지·`cf-validate` 비활성)에서 났는지 로그로 확인했다. 스윕 뒤 작업 트리가 깨끗하고, 최종 실행 11건이 통과했다.

- **대상 범위를 좁힌 것(보고)**: phase-build 는 E2E 로만 잡히는 규칙의 대상을 E2E 스위트 전체로 정한다. 이번에는 `mdm-codeConfirm.spec.ts` 만 대상으로 했다. mdm E2E 전체는 스펙마다 다른 픽스처(columnMng·codeItemEdit·codeCateEdit·ruleEdit 등)가 필요하고 확정·저장으로 데이터를 소모해 변이마다 재설정해야 하기 때문이다. 네 변이 모두 이 스펙에서 빨강이 났으므로 잡힘 판정에는 영향이 없다. 스위트 간 상태 간섭은 codeConfirm·sample-smoke·shell-rbac-smoke 를 한 번에 돈 최종 실행으로만 확인했다.
- 동등 변이라 싣지 않은 것: I38 "`confirmPermitted` 를 true 로 고정"은 표준 관리자가 DRAFT 소유자가 아니고 검사 결과도 없어 확정 버튼이 어차피 꺼져 있다. 이 조건은 vitest P5 가 잡는다(B3 표).
