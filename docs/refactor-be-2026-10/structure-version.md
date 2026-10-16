# 구조 변경 기록 — version 레인 (BE 리팩토링 2회차)

레인 `version`(브랜치 `refactor-be/mdm-version`, 모듈 `src/backend/mdm`)의 구조 변경을 항목마다 적는다. 형식은 1회차 [README §6.1](../refactor-2026-10/README.md#61-구조-변경-기록) 을 따른다. 경로의 `mdm/lib/…/mdm/` 는 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/` 를 줄인 것이다.

## 기준선

- 기준 커밋: `40fa5061a`(= 태그 `refactor-be-2026-10-base`, 관리 문서 커밋)
- 명령: `cd src/backend/mdm && ../gradlew test --continue -Pdmes.ora.test=clone`(heavy.mjs 로 감쌈, 27분)
- 결과: `:lib:test` 2279 통과. `:api:test` 2081 중 실패 1·건너뜀 13
- 이미 실패하던 시험: `CodeCateEditPerformanceSqliteTest.AC4_1000건_소속_이동_저장은_중앙값이_800ms_미만이다` — 중앙값 3604ms(기준 800ms), 실행 때 PC 부하(load) 약 15. 성능 기준 시험이라 부하 영향으로 본다(추정)

## S1. 적용 시작 일시 해석·검사 문제 map 을 공통으로 (C1)

- 커밋: `eec17c116`(특성 시험), `3b3520a17`(이동), `7a65293f3`(리뷰 반영)
- 바뀌기 전:
  - `parseApplyFrom`·`applyFromError` 가 `dme/ruleConfirm/service/RuleConfirmService`(public static)와 `dmc/codeConfirm/service/CodeConfirmService`(package-private)에 글자까지 같은 사본으로 있었다.
  - 레이아웃 확정(`dmb/layoutConfirm`)·룰 세트 확정(`dme/ruleSetConfirm`)·ERD 편집(`dma/erdEdit`)이 `RuleConfirmService.parseApplyFrom` 을 불러, 화면 패키지가 다른 화면 서비스에 기댔다.
  - 검사 문제(`MdmCheckIssue`) → 응답 map 사본이 룰·룰 세트·레이아웃 확정(5키)과 코드 확정(4키)에 있었다.

  ```mermaid
  graph LR
    LC[dmb.layoutConfirm] --> RC[dme.ruleConfirm.RuleConfirmService]
    SC[dme.ruleSetConfirm] --> RC
    ERD[dma.erdEdit] --> RC
  ```
- 바뀐 뒤:
  - `common/version/VersionRules.parseApplyFrom` 하나를 다섯 확정 경로(룰·룰 세트·코드·레이아웃·ERD)가 부른다. 화면 → 화면 의존이 없어졌다.
  - `common/support/MdmCheckIssueMaps.of(severity, issue)`(5키)·`of(issue)`(4키). 모양이 둘이라 함수도 둘이다.
- 바꾼 이유: 화면 사이 의존 제거(1회차 b9-4 의 남은 사본), 같은 입력 규칙을 한 곳에서 관리.
- 동작 보존 근거:
  - 특성 시험 `VersionRulesApplyFromTest`(4건)를 옛 `RuleConfirmService.parseApplyFrom` 에 먼저 걸어 통과시킨 뒤(`eec17c116`) 새 위치로 돌렸다. 오류 코드(REQUIRED_VALUE·INVALID_VALUE)·문구·칸 오류(`applyFrom`)·앞뒤 공백·열린 끝 경계를 고정한다. 리뷰 뒤 전각 공백(trim 기준)·SMART 날짜 해석 경계 2건을 더했다(6건, `7a65293f3`).
  - `MdmCheckIssueMapsTest`(3건) — 두 모양의 키 순서와 값.
  - 대상 시험: lib `common.version.*`·`common.support.*` 68건(리뷰 반영 뒤 70건), api 확정 화면·OASIS HTTP·ERD 계약 시험 231건 모두 통과.
- 영향 범위: `RuleConfirmService`·`CodeConfirmService`·`RuleSetConfirmService`·`LayoutConfirmService`·`ErdEditService`(631행 호출 한 줄, 조정자 허가). 응답 JSON·오류 응답은 그대로. 코드 항목·카테고리 편집의 4키 사본은 C6 에서 옮긴다. FE 주석 2곳(`src/frontend/m-mdm/pages/dma/erdEdit/api.ts:197`·`panels/ConfirmDialog.tsx:37`)이 옛 위치 `RuleConfirmService.parseApplyFrom` 을 적고 있다(BE 레인 밖, UI 회차 후속).
- 되돌리는 방법: `7a65293f3` → `3b3520a17` 순서로 revert(앞 커밋이 뒤 커밋의 파일을 고쳤다). 시험 `eec17c116` 은 옛 위치를 부르므로 그대로 둬도 되지만 함께 revert 를 권장한다.

## S2. 공통 버전 서비스의 레이아웃 역의존을 SPI 로 (C4)

- 커밋: `77d329803`
- 바뀌기 전: `common/version/DefaultVersionStateService.record()` 의 LAYOUT 분기가 `dmb/layout/LayoutQueries.withStackingMessages` 를 직접 불렀다. 공통 패키지가 화면 영역(dmb)을 알았다(common → dmb 역의존).

  ```mermaid
  graph LR
    DVS[common.version.DefaultVersionStateService] --> LQ[dmb.layout.LayoutQueries]
  ```
- 바뀐 뒤:
  - `contract/version/VersionReleasedChangeSpi`(`target()`·`afterReleasedChange(VersionRef)`)를 새로 두었다. 확정·확정 취소가 RELEASED 집합을 바꾼 뒤 같은 트랜잭션에서 불린다.
  - `dmb/layout/LayoutReleasedChange` 가 LAYOUT 으로 등록한다. 본문은 옛 분기와 같다(그 레이아웃과, 헤더면 쌓은 전문까지 메타 기록).
  - `VersionSpiRegistry.releasedChange(target)` 은 fail-closed 다. 등록이 없는 대상을 조회하면 `IllegalStateException`, 같은 대상이 둘이면 생성이 실패한다. `record()` 는 LAYOUT 에만 이 SPI 를 부른다. 룰·룰 세트·코드는 그대로 공통 서비스가 직접 기록한다.

  ```mermaid
  graph LR
    DVS[common.version.DefaultVersionStateService] --> REG[common.version.VersionSpiRegistry]
    REG --> SPI[contract.version.VersionReleasedChangeSpi]
    LRC[dmb.layout.LayoutReleasedChange] -.implements.-> SPI
    LRC --> LQ[dmb.layout.LayoutQueries]
  ```
- 바꾼 이유: 공통 버전 서비스가 화면 영역을 직접 알지 않게 한다. 다른 대상 SPI(확정 검사·DRAFT 삭제·확정 취소 검사·공동 편집자)와 같은 등록 방식이다.
- 동작 보존 근거:
  - 기존 api `LayoutMetaRevisionSqliteTest` 가 확정·확정 취소 뒤 레이아웃·쌓은 전문 메타 기록을 고정한다. 바꾸기 전과 뒤 모두 통과.
  - `VersionSpiRegistryTest` 에 조회 fail-closed·중복 등록 실패 시험 1건을 더했다.
  - 대상 시험: lib `common.version.*`·`dmb.*`·`contract.*`·`common.engine.*` 306건, api `dmb.*`·`common.*` 616건 모두 통과.
- 영향 범위: `DefaultVersionStateService`(생성자 매개변수 `LayoutQueries` 제거), `VersionSpiRegistry`(생성자 매개변수 1개 추가). 둘 다 Spring 이 주입하므로 바뀐 호출 코드는 `VersionSpiRegistryTest` 의 직접 생성뿐이다. 응답·오류 코드는 그대로.
- 되돌리는 방법: `77d329803` revert.

## S3. 레이아웃 코어의 화면 DTO 의존 제거 (C5 중 layout 몫)

- 커밋: `fc6723706`
- 바뀌기 전: 레이아웃 코어(`dmb/layout`)가 화면 DTO 를 직접 받고 돌려줬다.
  - `LayoutDraftBuilder.build(LayoutMngSaveRequest, …)`. `buildStored` 는 저장된 버전 행으로 `LayoutMngSaveRequest` 를 만들어 넘겼다.
  - `LayoutVersionService` 의 newVersion·delete·deleteDraft·cancelConfirm·lock·unlock·handover 가 `LayoutVersionRequest` 를 받고 `LayoutVersionResult` 를 돌려줬다.

  ```mermaid
  graph LR
    LDB[dmb.layout.LayoutDraftBuilder] --> SR[dmb.layoutMng.dto.LayoutMngSaveRequest]
    LVS[dmb.layout.LayoutVersionService] --> VR[dmb.layoutMng.dto.LayoutVersionRequest]
    LVS --> VRes[dmb.layoutMng.dto.LayoutVersionResult]
  ```
- 바뀐 뒤:
  - 코어 record 3개를 `dmb/layout` 에 두었다. `LayoutDraftAttrs`(전문 머리 값 5칸), `LayoutVersionCommand`(버전 조작 입력 6칸, `TARGET_VERSION`·`TARGET_CONFIRM` 상수), `LayoutVersionOutcome`(결과 4칸).
  - 화면 쪽이 경계에서 바꾼다. `LayoutMngSaveRequest.toDraftAttrs()`, `LayoutVersionRequest.toCommand()`(`TARGET_*` 는 코어 상수를 가리킨다), `LayoutVersionResult.of(outcome)`. 부르는 곳은 `LayoutMngService`·`HeaderMngService` 이다.
  - `dmb/layout` 에서 `dmb.layoutMng`·`dmb.headerMng` 로 가는 import 가 없어졌다. 남은 화면 의존 `dma.domainMng.service.DomainTestCaseRunner` 는 rule 레인 C5 몫이다.

  ```mermaid
  graph LR
    LMS[dmb.layoutMng.service.LayoutMngService] --> LDB[dmb.layout.LayoutDraftBuilder]
    LMS --> LVS[dmb.layout.LayoutVersionService]
    HMS[dmb.headerMng.service.HeaderMngService] --> LVS
    LDB --> A[dmb.layout.LayoutDraftAttrs]
    LVS --> C[dmb.layout.LayoutVersionCommand]
    LVS --> O[dmb.layout.LayoutVersionOutcome]
  ```
- 바꾼 이유: 코어가 화면 패키지를 알지 않게 한다(화면 → 코어 한 방향). 화면 DTO 칸이 바뀌어도 코어가 영향을 받지 않는다.
- 동작 보존 근거:
  - 칸 옮김은 값을 그대로 넘긴다. `buildStored` 의 옛 `setVer(...)` 는 `build` 가 읽지 않던 값이라 옮기지 않았다(리뷰에서 옛 코드 85–91행이 다섯 칸만 읽는 것을 확인).
  - OASIS BPMN(`layoutMng.bpmn`·`headerMng.bpmn`)은 화면 서비스 메서드에 묶여 있고, 그 서명은 바뀌지 않았다.
  - api 시험 8개 파일은 기계적으로만 고쳤다(`.toCommand()`·`.toDraftAttrs()`, getter → record 접근자). 단언은 그대로다.
  - 대상 시험: lib `dmb.*` 150건, api `dmb.*` 184건 모두 통과(리뷰 반영 뒤 다시 실행).
- 영향 범위: `LayoutDraftBuilder`·`LayoutVersionService` 서명, 화면 DTO 3개에 변환 메서드, 화면 서비스 2개. 응답 JSON·오류 코드는 그대로.
- 되돌리는 방법: `fc6723706` revert.

## S4. 미적용·결재 중 판정을 VersionRules 로 (C2)

- 커밋: `b6abb4cbc`(특성 시험), `4def2645b`(refactor), `3ca56eac9`(fix, 동작 변경)
- 바뀌기 전: 「미적용」 정의가 두 갈래였다.
  - 넓은 뜻(DRAFT·REQUESTED·APPROVED·미래 RELEASED): `common/rule/RuleVersions.isUnapplied`, `dmc/codeCateEdit`·`dmc/codeItemEdit` 의 private `isUnapplied`.
  - 좁은 뜻(DRAFT·미래 RELEASED): `common/version/VersionPreconditions.isUnapplied`(새 버전 가드 MDM006·다른 미적용 버전 검사 MDM007), `common/mastercode/MasterCodeVersionSummary.isUnapplied`, `dmb/layout/LayoutVersions.hasUnapplied`.
  - 결재 중 집합 `IN_APPROVAL = {REQUESTED, APPROVED}` 사본이 `RuleScreenSupport`·`RuleSetVersionService`·`LayoutVersionService` 에 있었다.
- 바뀐 뒤:
  - `common/version/VersionRules.isUnapplied(status, applyFrom, now)`·`isInApproval(status)` 하나를 위 9곳이 모두 부른다. `now` 를 몇 자리로 자를지는 호출자가 정한다(코드 편집 화면은 초 단위).
  - refactor 커밋은 이미 넓은 3곳과 결재 중 3곳만 바꿨다. 좁은 3곳은 fix 커밋에서 넓혔다.
  - 합치지 않은 것: `CodeItemEditService.PATCH_BLOCKING`, `VersionPreconditions.requireFutureUnapplied`, 확정 취소 가능 계산 2곳(`RuleMngService`·`CodeEditService`). 뜻이 달라 조정자 결정대로 그대로 둔다.
- 바꾼 이유: 같은 낱말의 뜻을 하나로 맞춘다. 원천 04:284 와 룰 버전 판정·카테고리·코드 항목 편집 화면은 넓은 뜻이었다. ADR-0002 D2 는 좁게 적었고, 원천 06 도 2026-09-24 에 D2 를 따라 좁게 고쳤다(그때 범위에서는 두 상태가 생기지 않아 결과가 같았다). ADR-0002 개정 이력에 메모를 남겼다.
- 동작 보존 근거(refactor):
  - 특성 시험 `RuleVersionsUnappliedTest`(8건)를 옛 코드에 먼저 걸어 통과시켰다(`b6abb4cbc`).
  - `VersionRulesUnappliedTest`(10건) — 경계 `applyFrom == now`, 적용 시작 없는 RELEASED, CANCELLED, 모르는 상태, null.
  - 차이 1건: status 가 null 이면 전에는 `Set.of().contains(null)` 이 NPE, 지금은 false. STATUS 는 NOT NULL 칼럼이다.
- 동작 변경(fix): REQUESTED·APPROVED 버전이 있으면 다음이 달라진다. 결재 보류로 지금 두 상태는 생기지 않아 운영 결과는 같다.
  - 확정(`DefaultVersionStateService.confirm`)·DRAFT 저장(`beginDraftWrite`)이 모든 대상에서 MDM007.
  - 새 버전 가드가 MDM006 — 실제로 결과가 바뀌는 곳은 ERD 새 버전(`ErdVersionService.newVersion`), 룰 세트 폐기(`RuleSetEditService.deprecate`, 룰 폐기와 같아짐), 코드 createVersion·restoreVersion. 룰·룰 세트·레이아웃 새 버전은 결재 중 검사가 이미 막아 같다.
  - 코드 요약의 미적용 목록·라벨·개수와 그것을 쓰는 코드 편집 화면 플래그(`CodeEditService` saveHeader·deprecate·buildView·releaseTarget, `CodeMngService` 목록 라벨).
  - 시험: `VersionPreconditionsUnappliedTest`, `MasterCodeVersionSummaryTest.S5b`, `LayoutVersionsTest.hasUnappliedCountsVersionsInApproval` — 옛 코드에서 4건 실패를 확인한 뒤 고쳤다.
- 대상 시험: lib·api 의 `common`·`dma`·`dmb`·`dmc`·`dme` — lib 2069 통과, api 1795 중 실패 1(`CodeCateEditPerformanceSqliteTest` AC4, 기준선부터 실패하던 성능 시험. 중앙값 3136·1772·1198ms 로 PC 부하를 따라 움직였다. 바꾼 `isUnapplied` 는 조회 경로에서만 불리고 저장 경로는 부르지 않는다).
- 영향 범위: 위 9곳과 문서(`VersionWriteGuard` 계약 Javadoc 포함). 오류 코드 종류는 그대로다.
- 되돌리는 방법: `3ca56eac9`(fix) → `4def2645b` 순서로 revert. 시험 `b6abb4cbc` 은 그대로 둬도 통과한다.

## S5. 마스터코드 편집 화면 도우미를 공용으로 (C6)

- 커밋: `6be7a0014`(특성 시험), `0c85991fd`(이동, 리뷰 반영 포함)
- 바뀌기 전: `dmc/codeCateEdit/service/CodeCateEditService` 와 `dmc/codeItemEdit/service/CodeItemEditService` 에 같은 private 도우미 13개가 사본으로 있었다 — `header`·`requireVersionExists`·`version`·`defaultVersion`·`isUnapplied`·`headerMap`(5키)·`versionMap`·`issueMap`·`ref`·`parseVer`·`str`·`display`·`text`·`isBlank`. 두 서비스는 `isUnapplied` 때문에 `Clock` 을 받았다.
- 바뀐 뒤:
  - `common/mastercode/MasterCodeScreenSupport`(@Component, `MasterCodeRows`·`Clock`) — 인스턴스 `header`·`requireVersionExists`·`isUnapplied`, static `version`·`defaultVersion`·`headerMap`·`versionMap`·`ref`·`parseVer`·`verText`(옛 `str`)·`display`. 본보기는 `common/rule/RuleScreenSupport` 다.
  - `issueMap` → C1 의 `common/support/MdmCheckIssueMaps.of(MdmCheckIssue)`(4키).
  - `text` → `MdmStrings.emptyToNull`(빈 문자열만 null, 자르지 않음), `isBlank` → `MdmStrings.isBlank`. `MdmStrings.text(Object)`(CLOB 읽기)·`str(Object)` 와 뜻이 달라 이름을 새로 지었다.
  - `CodeItemEditService.headerMap` 은 남는다 — 공용 5키 뒤에 `attrLabels` 를 더한다. 속성 라벨(`labels`)은 C7 몫이라 건드리지 않았다.
  - 두 서비스 생성자에서 `Clock` 이 빠지고 `MasterCodeScreenSupport` 가 들어왔다. 두 서비스를 `new` 로 만드는 곳은 없다(Spring 주입만).
  - 합치지 않은 것: 마루 코드 수정(`dmc/codeEdit`)·확정(`dmc/codeConfirm`)의 `parseVer` — 입력 공백을 자르고 오류 문구도 다르다.
- 바꾼 이유: 같은 도우미 사본을 하나로 둬서 문구·자릿수·기본 버전 선택이 화면마다 갈라지지 않게 한다.
- 동작 보존 근거:
  - 특성 시험 `api/…/dmc/MasterCodeScreenHelpersCharacterizationSqliteTest`(16건)를 옛 코드에 먼저 걸어 통과시켰다(`6be7a0014`). 두 서비스 진입점 11곳의 오류 문구·오류 코드(MDM021·MDM001), 버전 목록 7키 순서와 세 자리 문자열(Oracle 은 `1.000` 을 `1` 로 돌려준다), 헤더 5키·`attrLabels`, 기본 버전(DRAFT → CANCELLED 아닌 가장 큰 버전), 미적용 경계(now 와 같으면 적용됨, 초 단위로 자름), 검사 이슈 4키, 빈 문자열 → null 을 고정한다.
  - 리뷰에서 나온 빈틈 1건(경미 수정 행 문구의 버전 문자열 `A@9.000`)을 이동 커밋에서 같은 시험 메서드에 단언으로 더했다.
  - opus 리뷰: 옮긴 본문이 HEAD 와 같고, static import 가 다른 overload 로 풀리는 곳이 없고, Spring 스캔(`com.dongkuk.dmes.mdm`)이 새 빈을 잡는다고 확인했다.
- 대상 시험: lib `common.support.*`·`common.mastercode.*`·`*ArchitectureTest` 137 통과, api `dmc.*`·`DraftOwnershipCrossModuleTest` 200 중 실패 1(`CodeCateEditPerformanceSqliteTest` AC4, 기준선부터 실패하던 성능 시험, 중앙값 1308ms).
- 영향 범위: 두 서비스, `common/mastercode` 새 클래스 1개, `MdmStrings` 메서드 2개, `MdmCheckIssueMaps` Javadoc. 응답 JSON·오류 코드는 그대로.
- 되돌리는 방법: `0c85991fd` revert. 시험 `6be7a0014` 은 그대로 둬도 통과한다.

## S6. 헤더 규칙·TB_MDM_DATA 헤더 SQL (C7)

- 커밋: `ccd70cba5`(특성 시험), `d986b6cf3`·`9cf510382`·`b07afdfd2`(refactor), `e26329da4`(fix, 동작 변경)
- 바뀌기 전:
  - 헤더 검사 사본이 네 벌이었다. 코드 등록 `dmc/codeMng/service/CodeMngService` 와 데이터 등록 `dmd/dataMng/service/DataMngService` 에 `requireValidId`(1~50자·금지 문자·물리명 규칙)·이름 1~100자·설명 4000바이트가 있었다. 코드 헤더 저장 `dmc/codeEdit/service/CodeEditService` 와 데이터 헤더 저장 `dmd/dataEdit/service/DataEditService` 에 이름·설명·`label`(attr01~attr10)·`requireAuditVer` 가 있었다. 데이터 쪽 키 패턴 검사도 등록·헤더 저장에 두 벌이었다.
  - `TB_MDM_DATA` 머리 SELECT 가 세 벌이었다. `common/segment/DataSegmentLock`(잠금 뒤 재조회), `dmd/dataItemMng/service/DataItemListQuery.header`, `dmd/dataCateEdit/service/DataCateEditService.header`. 칼럼 목록이 조금씩 달랐다.
- 바뀐 뒤:
  - `common/support/MaruHeaderRules`(정적) — `requireValidId(id, 명사)`·`requireName`·`requireDescription`·`requireCodePattern`·`requireCodePatternRegex`·`labels`·`requireAuditVer(지금 값, 요청 값)`. 검사를 하나씩 두고 순서는 호출자가 그대로 정한다. 코드 헤더 저장은 auditVer 를 먼저 보고, 데이터 헤더 저장은 맨 끝에 본다. 명사만 다르던 ID 문구는 명사(「마루 코드」·「마루 데이터」)를 인자로 받는다.
  - `common/segment/MaruDataHeaderReads.find(EntityManager, id)`(정적) — 머리 한 행을 SELECT 하나로 읽고 라벨은 DB 값 그대로 준다. 라벨 다듬기와 없을 때 처리는 호출자에 그대로 있다. 잠금 재조회는 trim 뒤 비면 null, 항목 관리는 `isBlank` 를 빼고 trim, 카테고리 편집은 그대로다. 정적 메서드라 세 클래스의 생성자(시험 하위 클래스 포함)는 바뀌지 않았다.
  - 합치지 않은 것: 조정자 지시로 계층 칸 수 범위(코드는 `MasterCodeConventions`, 데이터는 0~5 상수), `job/ExchangeRateSyncService.LABELS_SQL`(job 패키지의 JdbcTemplate 읽기이고 라벨을 대문자로 바꾼다), `common/rule/check/ledger/RuleLedgerReads`. 뜻이 달라 계층 칸 수 줄이기 검사(코드는 원장 질의, 데이터는 선분 스캔)와 `DataItemListQuery.maruDataOptions`(목록 칼럼만 읽는다).
- 바꾼 이유: 같은 규칙·같은 문구를 한 곳에서 고치게 한다. 사본은 이미 갈라져 있었다(등록에만 정규식 검사가 빠짐, 아래 fix).
- 동작 보존 근거(refactor):
  - 특성 시험 27건을 옛 코드에 먼저 걸어 통과시켰다(`ccd70cba5`). `CodeMngHeaderRulesCharacterizationSqliteTest`(6)·`CodeEditHeaderRulesCharacterizationSqliteTest`(6)·`DataMngHeaderRulesCharacterizationSqliteTest`(6)·`DataEditHeaderRulesCharacterizationSqliteTest`(6)·`MaruDataHeaderReadsCharacterizationSqliteTest`(3). 문구는 글자 전체로 비교한다. 오류 코드, 여러 규칙을 함께 어긴 입력으로 검사 순서, U+3000·탭이 섞인 라벨의 다듬기를 본다.
  - 머리 읽기는 호출마다 SELECT 하나 그대로다. 문 수 상한 시험 `DataEditQueryCountTest`·`DataCateEditQueryCountTest` 가 통과한다.
  - 차이 1건: 잠금 재조회가 `getSingleResult` 에서 목록 읽기로 바뀌었다. 잠금이 행을 맞췄는데 재조회가 비면 예외 종류가 다르다(`NoResultException` → NPE). 같은 트랜잭션 안이라 생기지 않는다.
  - 찾은 내용과 다른 점: 「dmd 는 lvlCnt 0..5 하드코딩, dmc 는 `MasterCodeConventions`」는 상수 출처만 다르다. `MasterCodeConventions` 도 0~5(기본 0)라 범위와 문구는 같다. 둘 다 그대로 두었다.
- 동작 변경(fix): `DataMngService.register` 가 컴파일되지 않는 키 패턴을 MDM021 「키 패턴 정규식이 올바르지 않습니다: <패턴>」으로 거부한다. 헤더 저장과 같은 자리(키 패턴 길이 검사 뒤, 계층 칸 수 앞)이고 문구도 같다. 전에는 그대로 저장되고, 그 뒤 항목 저장마다 `DataItemChecks` 가 같은 문구로 거부했다. 시험 `DataMngServiceSqliteTest.등록은_컴파일되지_않는_키_패턴을_거부하고_행을_만들지_않는다` — 옛 코드에서 실패(예외 없음)를 확인한 뒤 고쳤다.
- 대상 시험: lib·api 의 `common.support`·`common.segment`·`dmc.codeMng`·`dmc.codeEdit`·`dmd` — lib 21 통과, api 274 통과(실패·건너뜀 0).
- 영향 범위: 위 7개 클래스. 공개 API·화면 응답·오류 코드 종류는 그대로다. `dme/ruleMng/service/RuleHeaderService` Javadoc 과 `RuleHeaderServiceTest` 주석이 지운 `CodeEditService.requireAuditVer` 를 가리킨다(rule 레인 파일이라 두었다). `dmd.dataHistory → dmd.dataItemMng` 의존은 그대로다(`DataItemHeader`·`MaruDataOption`·`DataItemListQuery`·`DataItemRows` 를 쓴다).
- 되돌리는 방법: `e26329da4`(fix) → `b07afdfd2` → `9cf510382` → `d986b6cf3` 순서로 revert. 시험 `ccd70cba5` 은 그대로 둬도 통과한다.

## S7. 새 버전 만들기 훅 (C3 중 코드 화면 밖)

- 커밋: `b51e02740`(특성 시험), `af707c053`(fix, ERD 번호 기준), `e728304d4`(훅·룰 세트), `93cb6a0ff`(룰), `702124097`(레이아웃), `0ed80acad`(ERD), 리뷰 반영 `a530e125d`(주석)·`06b5b5ef1`(시험)·`5f0243add`(손잡이 매개변수)·`ba5512dfd`·`eb1401975`(시험)·`7345653b2`(주석)
- 바뀌기 전: 「새 버전 만들기」가 대상마다 한 벌씩 네 벌 있었다(`dme/ruleMng/service/RuleVersionService`·`dme/ruleSetEdit/service/RuleSetVersionService`·`dmb/layout/LayoutVersionService`·`dma/erdEdit/service/ErdVersionService` 의 `newVersion`). 저마다 공통 가드(`VersionWriteGuard.checkCanCreateVersion`, MDM006) → 버전 목록 읽기 → 원천 → 번호 → INSERT → 부모 승격을 직접 했다.
  - 번호 기준: ERD 만 최신 RELEASED 번호, 나머지는 상태와 무관한 모든 버전의 최대값.
  - 승격: 룰·룰 세트는 `RuleVersions.needsInUsePromotion`, ERD 는 최신 RELEASED 의 적용 시작을 따로 봤다. 레이아웃은 올리지 않는다.
  - 트랜잭션: ERD 는 본문 전체가 자기 `TransactionTemplate`, 룰·룰 세트는 가드·읽기가 밖이고 쓰기만 `TransactionTemplate`, 레이아웃은 자기 트랜잭션 없이 OASIS action 트랜잭션.

  ```mermaid
  graph LR
    RULE[dme.ruleMng.RuleVersionService] --> G[contract.version.VersionWriteGuard]
    SET[dme.ruleSetEdit.RuleSetVersionService] --> G
    LAY[dmb.layout.LayoutVersionService] --> G
    ERD[dma.erdEdit.ErdVersionService] --> G
    RULE --> S[common.version.VersionRowStore.markParentInUse]
    SET --> S
    ERD --> S
  ```
- 바뀐 뒤:
  - 계약 `VersionStateService.newVersion(NewVersionCommand, SourcePicker, DraftWriter, ParentPromotion)` 하나가 순서를 갖는다. 구현 `DefaultVersionStateService` 는 한 트랜잭션(호출자 트랜잭션에 합류)에서 모든 버전 읽기 → 미적용 가드 MDM006 → 원천 고르기 → 번호(`VersionRules.nextNumber`, 상태 무관 최대값) → DRAFT 쓰기 → 적용된 RELEASED 가 하나라도 있으면 부모 승격 순으로 한다. 메타 캐시는 기록하지 않는다(DRAFT 만 바뀐다).
  - 대상마다 다른 단계는 손잡이 3개로 받는다(`contract/version`): `SourcePicker`(원천, 대상 오류를 던진다)·`DraftWriter`(버전 행과 딸린 행)·`ParentPromotion`. 입력·요약 타입은 데이터만 담는 record `NewVersionCommand`·`VersionSnapshot` 이다. 처음에는 손잡이 셋을 record `NewVersionHandles` 로 묶었으나, 계약 record 는 데이터만 담는다는 관례에 맞춰 매개변수로 풀었다(리뷰 반영 `5f0243add`).
  - `common/version` 에 `StandardParentPromotion`(확정과 같은 native `markParentInUse`), `VersionRules.latestReleased`(원천 후보), `VersionPreconditions.requireNoUnapplied`(공통 가드와 훅이 같이 쓰는 MDM006 판정)를 두었다.
  - 대상별 손잡이: 룰·룰 세트 = 원천 없으면 BUSINESS_ERROR(버전이 하나도 없으면 빈 DRAFT)·표준 승격, 레이아웃 = 원천 없으면 MDM009·승격 없음(`NO_PROMOTION`, 보고만 한 후보를 그대로 둔다), ERD = 원천 필수 MDM029·표준 승격. ERD 는 자기 트랜잭션에서 모델 확인(MDM029)·모델 행 잠금 뒤 훅을 부르고, 표시 행(`marker.mark`)은 훅 뒤 같은 트랜잭션에서 쓴다.
  - 결재 중 검사 3곳(`RuleScreenSupport.requireNoVersionInApproval`·`RuleSetVersionService` 의 검사·`LayoutVersionService.inApproval`)은 화면 앞단 검사로 남겼다(조정자 조건 2). 훅 손잡이는 늘리지 않았다.

  ```mermaid
  graph LR
    RULE[dme.ruleMng.RuleVersionService] --> VSS[contract.version.VersionStateService.newVersion]
    SET[dme.ruleSetEdit.RuleSetVersionService] --> VSS
    LAY[dmb.layout.LayoutVersionService] --> VSS
    ERD[dma.erdEdit.ErdVersionService] --> VSS
    DVS[common.version.DefaultVersionStateService] -.implements.-> VSS
    RULE --> SPP[common.version.StandardParentPromotion]
    SET --> SPP
    ERD --> SPP
  ```
- 바꾼 이유: 같은 순서·번호·승격 규칙의 사본 네 벌을 한 곳으로 모은다. 화면에는 대상마다 다른 원천·쓰기·승격만 남긴다. 옮기면서 ERD 번호 기준 결함을 고쳤다.
- 동작 보존 근거:
  - 특성 시험(`b51e02740`)을 옮기기 전 코드에 걸어 통과시켰다(api 81건). 오류 코드(룰·룰 세트·레이아웃 minor 상한 MDM009, 룰 세트 RELEASED 없음 BUSINESS_ERROR, 레이아웃 RELEASED 없음 MDM009, ERD CANCELLED 만 MDM029, 룰 세트 결재 중 MDM006), 승격(룰 세트 CREATED → INUSE, 레이아웃은 CREATED 그대로)을 고정한다.
  - 트랜잭션 경계(조정자 조건 3): 가드에 걸리면 아무것도 쓰지 않는다(4대상). 마지막 단계 실패면 모두 되돌아간다 — 룰·룰 세트는 부모 INUSE 변경, ERD 는 rev 표시 행, 레이아웃은 바깥 트랜잭션 안의 재정의 INSERT 에 트리거로 실패를 건다. 레이아웃 새 버전은 호출자 트랜잭션에 합류한다(성공 뒤 바깥이 되돌리면 남지 않는다).
  - 리뷰 반영 시험: 룰·룰 세트도 호출자 트랜잭션 합류(바깥 되돌림 뒤 새 버전·정의·승격이 남지 않음)와 바깥 트랜잭션 안 승격 실패 롤백을 고정했다(`ba5512dfd`). 훅이 따로 커밋하면 실패한다. ERD 는 표시 행 실패 시험이 합류를 고정한다. 레이아웃은 OASIS 밖에서 바로 불러도 한 단위로 되돌아감을 고정했다(`06b5b5ef1`, 훅으로 옮긴 뒤의 동작).
  - 훅 단위 시험 `DefaultVersionStateServiceNewVersionTest`(12건): 순서(트랜잭션 시작(전파 REQUIRED) → 버전 읽기 → 원천 → 쓰기 → 승격 → 커밋), 가드 MDM006 이면 원천을 고르지 않음, 원천 오류 전달, 번호 기준(CANCELLED 포함 최대값), MDM021·MDM009, 승격 경계(`applyFrom == now` 는 적용됨), 쓰기·승격 실패면 롤백하고 커밋하지 않음. `VersionRulesTest` 에 원천 후보 1건. 트리거 시험은 예외에 ORA-20001 이 실렸는지 봐서 앞 단계 오류로 일찍 끝난 경우와 가른다(`eb1401975`).
  - 리뷰: opus 리뷰 2회, 둘 다 blocker·major 없음. 검사 항목에 「트랜잭션 경계 변화」를 따로 두었다. 1회차 minor 2건, 조정자 쪽 병렬 리뷰 minor 3건·nit 1건(합류 시험, 단위 시험의 트랜잭션 확인, `NewVersionHandles` 제거, 원천 재조회 실패를 대상 오류로), 2회차 minor 2건(전파 REQUIRED 확인, 트리거 실패 확인)을 반영했다. 남긴 nit: 룰·룰 세트 `pickSource` 본문이 같다(오류 문구가 화면 몫이라 화면에 둔다), 훅의 `isApplied` 가 `RuleVersions.effectiveStatus` 와 같은 판정이다(common/version 이 common/rule 에 기대지 않게 둔다), `RuleVersions.latestReleased` 는 이제 호출자가 없다(공개 메서드라 지우지 않는다).
  - 검사 순서: 앞단 검사(종류 해석 MDM021 → 객체 읽기 → 룰 외부 원천 → 폐기 MDM009 → 룰·룰 세트 담당자 MDM013)는 그대로다. 결재 중 앞단 검사는 전에는 공통 가드 뒤, 지금은 훅 앞에서 돈다. 둘 다 같은 MDM006·같은 문구라 결과가 같다.
  - 트랜잭션 경계 변화(운영 결과 같음):
    - 룰·룰 세트: 가드·버전 읽기·번호 계산·승격 판정이 쓰기 트랜잭션 안으로 들어갔다.
    - 레이아웃: 쓰기가 훅의 트랜잭션(`TransactionTemplate`, 전파 REQUIRED)에서 돈다. OASIS action 트랜잭션에 합류하므로 운영 결과가 같다. OASIS 밖에서 바로 부르면(시험 등) 전에는 버전 행이 `saveAndFlush` 로 먼저 커밋됐고, 지금은 한 단위로 되돌아간다.
    - ERD: 훅의 트랜잭션이 ERD 의 트랜잭션에 합류한다. 잠금 → 가드 → 원천 → 번호 → INSERT → 승격 → 표시 행 순서는 그대로다.
    - 승격 판정: 룰·룰 세트는 저장 CREATED 를 먼저 보지 않고 native UPDATE 의 `STATUS='CREATED'` 조건이 거른다. ERD 는 전에 초를 자르지 않은 now 로 최신 RELEASED 하나만 봤고, 지금은 초를 자른 now 로 RELEASED 전체를 본다. 가드를 지난 뒤에는 모든 RELEASED 의 적용 시작이 now 이하라 결과가 같다.
    - 원천 행은 쓰기 단계에서 키로 한 번 더 읽는다(조회 1번 더). 같은 트랜잭션에서 방금 고른 RELEASED 라 없을 수 없지만, 없으면 그 대상의 「원천 없음」 오류다.
    - 원천 없음(BUSINESS_ERROR·MDM009)·번호(MDM021·MDM009) 오류가 이제 트랜잭션 안에서 나서 OASIS 트랜잭션을 롤백 전용으로 표시한다. 전에도 같은 경로의 MDM006 이 그랬고, 이 오류를 잡아 계속하는 호출자가 없어 결과가 같다.
- 동작 변경(fix): ERD 새 버전 번호 기준(`af707c053`). RELEASED 1.000 + CANCELLED 2.000 에서 MAJOR 는 전에 2.000 이 되어 CANCELLED 행을 DRAFT 로 덮어썼다(복합 키 엔티티라 `saveAndFlush` 가 merge 한다). 지금은 3.000 이다. MINOR 는 1.001 → 2.001. 운영에서는 CANCELLED 가 생기지 않아 결과가 같다. 시험 `ErdVersionServiceTest.newVersionNumbersFromMaxOfAllVersions`·`newMinorVersionNumbersFromMaxOfAllVersions` 가 고치기 전 코드에서 2.000·1.001 로 실패함을 확인했다.
- 대상 시험(dev `cac4ab930` 위로 리베이스한 뒤): lib `common.version`·`contract.version`·`dma.erdEdit`·`dme.ruleMng`·`dme.ruleSetEdit`·`dmb.layout`·`dmb.layoutMng`·`dmb.headerMng`·`*ArchitectureTest`(`ErdStreamLayerArchitectureTest`·`MdmScreenPackageArchitectureTest`·`MdmContractArchitectureTest` 포함) 501건, api 같은 패키지와 `dme.RuleNewVersionKindSqliteTest` 617건 모두 통과(실패·건너뜀 0). 리베이스 전에는 lib `common.version`·`contract`·`*ArchitectureTest`·`dmb`·`dma.erdEdit`·`dme` 566건, api `common.version`·`contract.version`·`dma.erdEdit`·`dme`·`dmb` 1053건(건너뜀 13) 통과.
- 영향 범위: 화면 서비스 4개의 생성자(Spring 주입만, 직접 생성 없음), 계약 `VersionStateService` 메서드 하나 추가(구현은 `DefaultVersionStateService` 하나), `DefaultVersionWriteGuard`(판정을 `requireNoUnapplied` 로). 응답 JSON·오류 코드는 그대로다(ERD 번호만 fix). 코드 화면(`dmc/codeEdit`)은 S8(`CodeVersionService` 추출, `MasterCodeVersionNumbers` 보관, 코드 상한 오류 코드 fix)을 거쳐 S9 에서 같은 훅으로 옮겼다.
- 되돌리는 방법: `7345653b2` → `eb1401975` → `ba5512dfd` → `5f0243add` → `06b5b5ef1` → `a530e125d` → `0ed80acad` → `702124097` → `93cb6a0ff` → `e728304d4` 순서로 revert(뒤 커밋이 앞 커밋의 파일을 고쳤다). 시험 커밋 `06b5b5ef1`·`ba5512dfd`·`eb1401975` 은 새 동작·새 서명을 고정하므로 함께 되돌린다. 특성 시험 `b51e02740` 은 그대로 둬도 통과한다. ERD 번호 fix `af707c053` 은 그 뒤에 따로 되돌릴 수 있다(되돌리면 번호 기준이 최신 RELEASED 로 돌아가고 그 커밋의 시험 2건도 빠진다).

## S8. 코드 화면 새 버전 번호·CodeVersionService (C3 중 코드 화면 앞부분)

- 커밋: `ff6a0eb71`(특성 시험), `b85b79f79`(fix, 동작 변경), `fac5404f5`·`839ab8483`·`69b702a8a`(refactor, 마지막은 리뷰 반영)
- 바뀌기 전:
  - 코드 화면은 버전 서비스가 없었다. `dmc/codeEdit/service/CodeEditService` 의 `createVersion`·`restoreVersion` 이 미적용 가드·번호·복원 원본 검사·DRAFT 쓰기(`insertDraft`)·부모 승격(`markInUseIfApplied`)을 직접 했다.
  - 번호는 자체 `nextNumber` 로 구했다. 상한(minor 999·major 9998)을 MDM021 로 냈다. 룰·룰 세트·레이아웃은 `common/version/VersionRules.nextNumber` 로 MDM009 를 낸다.
  - `common/mastercode/MasterCodeVersionNumbers` 는 `VersionNumbers` 에 위임만 했다(D-144). `CodeEditService`·`CodeConfirmService`·`MasterCodeVersionSummary` 가 이 이름으로 불렀다.

  ```mermaid
  graph LR
    BPMN[codeEdit.bpmn reg·restore] --> CES[dmc.codeEdit.CodeEditService]
    CES --> MCVN[common.mastercode.MasterCodeVersionNumbers]
    MCVN --> VN[common.version.VersionNumbers]
    CES --> WG[VersionWriteGuard]
    CES --> SEG[MasterCodeVersionSegments]
  ```
- 바뀐 뒤:
  - `dmc/codeEdit/service/CodeVersionService`(@Service, `@Transactional` 없음)의 `create(code, kind, summary)`·`restore(code, kind, summary, sourceVer)`(패키지 공개, `CodeEditService` 만 부른다)가 본문을 한다. 순서: 미적용 가드(MDM006) → `VersionRules.nextNumber` → 복원이면 원본 형식·RELEASED 검사 → `insertDraft`(persist·flush·1.000 이면 BASE) → 복원이면 `fillFrom` → `markInUseIfApplied` → 로그. 둘 다 만든 DRAFT 의 `VersionRef` 를 돌려준다.
  - `CodeEditService.createVersion`·`restoreVersion` 은 화면 머리(담당자·코드·원천 → 폐기 → 버전 종류 → 요약)만 하고 위를 부른 뒤 화면 모델을 만든다. BPMN 바인딩과 메서드 서명은 그대로다.
  - `markInUseIfApplied`·`parseVer` 구현은 `CodeVersionService` 하나에 있다. 헤더 저장(`saveHeader`)도 `CodeVersionService.markInUseIfApplied` 를 부른다. `CodeEditService.parseVer` 는 `draftRef`·`CodeEditServiceVerParseTest` 용 한 줄 위임이다. 의존은 `CodeEditService → CodeVersionService` 한 방향이다.
  - 버전 종류 해석(`parseKind`, 빈 값 MDM021)과 JPA 엔티티로 하는 부모 승격은 코드 화면 것을 그대로 쓴다(조정자 결정).
  - `MasterCodeVersionNumbers` 호출 11곳(`CodeEditService` 4·`CodeConfirmService` 3·`MasterCodeVersionSummary` 4)을 `VersionNumbers` 로 바꿨다. fix 커밋이 지운 `nextNumber` 안의 4곳을 더하면 처음 15곳이다. 클래스와 시험은 `src/backend/mdm/archive/java`·`archive/test-java` 의 같은 패키지 경로로 옮겼다(빌드 소스 세트 밖).

  ```mermaid
  graph LR
    BPMN[codeEdit.bpmn reg·restore] --> CES[dmc.codeEdit.CodeEditService]
    CES --> CVS[dmc.codeEdit.CodeVersionService]
    CVS --> VR[common.version.VersionRules.nextNumber]
    CVS --> WG[VersionWriteGuard]
    CVS --> SEG[MasterCodeVersionSegments]
    CES --> VN[common.version.VersionNumbers]
  ```
- 바꾼 이유: 같은 번호 규칙이 대상마다 다른 오류 코드를 내지 않게 한다. C3 뒷부분에서 코드 화면을 공통 새 버전 훅으로 옮길 때 바꿀 곳을 `CodeVersionService` 한 클래스로 모은다. 위임만 하던 이름을 없앤다.
- 동작 보존 근거(refactor):
  - 특성 시험 `CodeEditVersionNumberCharacterizationSqliteTest`(7건)를 옛 코드에 먼저 걸어 통과시켰다(`ff6a0eb71`). 상한·버전 없음·복원 원본 문구 전체, 복원 원본이 틀려도 번호 상한 오류가 먼저인 순서(설계 시험 6), 미적용 가드가 번호 상한보다 먼저인 순서, 복원 번호가 CANCELLED 를 포함한 최대값 기준인 것, 버전 종류가 빈 값도 MDM021 이고 폐기 검사 뒤·미적용 가드 앞인 것을 본다.
  - 리뷰 뒤 `CodeEditVersionSqliteTest` 에 복원 경로의 CREATED → INUSE 승격(V10b)과 적용된 RELEASED 가 없으면 CREATED 를 두는 경우(V10c)를 더했다(`69b702a8a`). 옮긴 `markInUseIfApplied` 를 새 버전 경로(V10)만 고정하고 있었다.
  - 기존 `CodeEditVersionSqliteTest`(V1~V10)·`MasterCodeRestoreSqliteTest`(P1~P5)·`CodeEditServiceVerParseTest`·`DmcCodeBpmnActionTest` 가 바꾸기 전과 뒤 모두 통과한다.
  - `VersionNumbers` 로 바꾼 호출은 옛 위임과 같은 함수다. 결과 값이 같다.
  - 로그 문구는 그대로이고 로거 이름만 `CodeEditService` → `CodeVersionService` 로 바뀌었다.
- 동작 변경(fix, `b85b79f79`, 조정자 승인): 번호 상한일 때만 달라진다.
  - minor 상한(소수부 999): MDM021 「minor 번호가 999 에 닿았습니다. major 를 올리십시오」 → MDM009 「minor 를 더 올릴 수 없습니다. major 를 올리십시오」.
  - major 상한(9998): MDM021 「major 번호가 상한(9998)을 넘습니다」 → MDM009 「major 를 더 올릴 수 없습니다」.
  - 그래서 OASIS 응답의 `meta.code` 가 MDM021 → MDM009, 오류 코드의 의미 HTTP 상태가 400 → 409, 운반용 cactus 코드가 INVALID_VALUE → BUSINESS_ERROR 로 바뀐다. FE 는 옛 코드를 쓰지 않는다(조정자 확인 0건).
  - 그대로인 것: 버전 없음 minor(MDM021 같은 문구), 번호 값, 검사 순서.
  - 시험: `CodeEditVersionSqliteTest` V3 를 MDM009 로 바꾸고 major 상한 V3b 를 더했다. 특성 시험의 상한 단언 3건도 바꿨다. 옛 코드에서 5건 실패를 확인한 뒤 고쳤다.
- 대상 시험: lib `dmc.*`·`common.mastercode.*`·`*ArchitectureTest`·`VersionNumbersTest` 121 통과(`MdmScreenPackageArchitectureTest`·`CodeEditServiceVerParseTest` 포함), api `dmc.*`·`common.mastercode.*`·`*ArchitectureTest` 284 통과(실패·건너뜀 0). 중간 실행에서는 기준선부터 실패하던 `CodeCateEditPerformanceSqliteTest` AC4 가 PC 부하에 따라 실패했다(중앙값 903·2064ms). opus 리뷰 2회. 1회차 CLEAN(minor 2·nit 4 가운데 minor 2·nit 2 반영), 2회차 CLEAN(nit 1 반영 — V10c 의 CANCELLED 적용 시각을 과거로, 반영 뒤 `CodeEditVersionSqliteTest` 19건 통과). 남긴 nit: 훅 자리 안내 문장(조정자 요청), 로거 이름 변경(위에 적음)
- 영향 범위: `CodeEditService`(생성자에서 `MasterCodeVersionSegments`·`VersionWriteGuard` 가 빠지고 `CodeVersionService` 가 들어왔다. Spring 주입만), 새 `CodeVersionService`, `CodeConfirmService`·`MasterCodeVersionSummary`(import 와 호출 이름), 문서 2곳(`docs/mdm/screens/codeMng/codeMng_기능설계서.md` 채번 행의 오류 코드, `docs/mdm/naming-dialect-rules.md` #17 의 채번 위치). 응답 JSON 은 그대로다. `MasterCodeVersionNumbersTest` 사례 가운데 `VersionNumbersTest` 에 없는 것(1.998 → 1.999, 9997.500 → 9998.000, 9998.123 major 불가, 빈 목록 max null, `canMajor(null)`, scale 0 입력 `2` → 3.000·2.001, `label(1)`·`label(12.345)` 등)은 `common/version` 이 이번 작업의 금지 경로라 더하지 않았다. 코드 화면을 공통 새 버전 훅으로 옮긴 일은 S9 에 적었다.
- 되돌리는 방법: `69b702a8a` → `839ab8483` → `fac5404f5` → `b85b79f79`(fix) 순서로 revert. `fac5404f5` 를 되돌리면 archive 의 두 파일이 원래 자리로 돌아온다. fix 만 되돌리면 시험 기대도 같은 커밋에 있어 MDM021 로 돌아간다. 다만 뒤 커밋이 번호 계산을 `CodeVersionService` 로 옮기고 V3b 를 고쳤으므로 충돌을 손으로 푼다(옛 `nextNumber` 를 `CodeVersionService` 에 두고 부른다). 시험 `ff6a0eb71` 은 그대로 둬도 된다.

## S9. 코드 화면 새 버전 훅 이전 (C3 마지막)

- 커밋: `2f8d4f836`(refactor), `29a9f6c2a`(refactor, 리뷰 반영)
- 바뀌기 전:
  - 코드 화면만 공통 새 버전 훅 밖이었다. `dmc/codeEdit/service/CodeVersionService` 의 `create(code, kind, summary)`·`restore(code, kind, summary, sourceVer)` 가 순서를 직접 가졌다(S8).
  - 순서: 공통 가드 `VersionWriteGuard.checkCanCreateVersion`(MDM006, 가드 자신의 `TransactionTemplate`) → `VersionRules.nextNumber(summary.maxVer())` → 복원이면 원본 검사(MDM021) → `insertDraft` → 복원이면 `fillFrom` → `markInUseIfApplied(code, summary)`.
  - 요약(`summary`)은 `CodeEditService` 가 `ledger.versions` 로 미리 구해 넘겼다. 번호 max 와 승격 판정에 썼다.
  - 승격은 `MdmCode` 엔티티 상태만 바꿨다. UPDATE 는 뒤의 `buildView` 네이티브 조회 때 자동 flush 로 나갔다.

  ```mermaid
  graph LR
    BPMN[codeEdit.bpmn reg·restore] --> CES[dmc.codeEdit.CodeEditService]
    CES --> CVS[dmc.codeEdit.CodeVersionService]
    CVS --> VR[common.version.VersionRules.nextNumber]
    CVS --> WG[VersionWriteGuard]
    CVS --> SEG[MasterCodeVersionSegments]
  ```
- 바뀐 뒤:
  - `CodeVersionService.create(code, kind)`·`restore(code, kind, sourceVer)` 가 `VersionStateService.newVersion(new NewVersionCommand(MASTER_CODE, 코드 ID, kind, 요청 사용자), 원천, 쓰기, 승격)` 을 부른다. 훅이 돌려준 `VersionRef` 를 돌려준다. 미적용 가드·번호·승격 판정은 훅이 한 트랜잭션에서 한다.
  - 원천 손잡이: 새 버전·복원 모두 `Optional.empty()`.
  - 쓰기 손잡이: 새 버전은 `insertDraft`(persist·flush, 1.000 이면 BASE). 복원은 원본 검사(형식 → RELEASED → 새 번호보다 작음, MDM021) → `insertDraft` → `fillFrom`. 소유자는 훅이 넘기는 `owner`(= 요청 사용자)다.
  - 복원 쓰기 손잡이는 훅이 넘기는 `source` 인자를 쓰지 않는다. 요청의 `sourceVer` 를 직접 검사하고 복사한다. `DraftWriter` 계약 문구 「source 가 있으면 그 버전을 다시 읽어 복사한다」와 다르다. 원본 검사를 원천 손잡이로 옮기면 번호보다 먼저 돌아 오류 순서가 바뀐다. 그래서 옮기지 않았다(옮기려면 승인 필요). `CodeVersionService` Javadoc 에 적었다.
  - 승격 손잡이: 관리 중인 `MdmCode` 엔티티 람다다. 저장 CREATED 면 INUSE 로 바꾸고 바로 `flush` 한다. 훅은 저장 상태를 보지 않으므로 람다가 본다. `StandardParentPromotion`(native UPDATE)은 쓰지 않는다(조정자 결정, TB_MDM_CODE 쓰기는 엔티티 경로 하나).
  - `VersionWriteGuard` 의존과 `summary` 매개변수를 지웠다. `CodeEditService.createVersion`·`restoreVersion` 은 `summary(code)` 를 더 부르지 않는다. `markInUseIfApplied`(헤더 저장용)와 `parseVer` 는 남겼다. S8 이 남긴 훅 자리 안내 문장을 지금 구조 설명으로 바꿨다.

  ```mermaid
  graph LR
    BPMN[codeEdit.bpmn reg·restore] --> CES[dmc.codeEdit.CodeEditService]
    CES --> CVS[dmc.codeEdit.CodeVersionService]
    CVS --> VSS[contract.version.VersionStateService.newVersion]
    DVS[common.version.DefaultVersionStateService] -.implements.-> VSS
    CVS --> SEG[MasterCodeVersionSegments]
    CVS --> E[entity.MdmCode 승격 람다]
  ```
- 바꾼 이유: 새 버전 순서(가드 → 번호 → 쓰기 → 승격)의 마지막 사본을 훅으로 모은다. 이제 코드·룰·룰 세트·레이아웃·ERD 5대상 새 버전이 모두 같은 훅을 탄다.
- 동작 보존 근거:
  - 특성 시험 두 벌을 고치지 않고 통과했다. `CodeEditNewVersionTxCharacterizationSqliteTest` 13건(G1-G3·R1·W1-W4·O1·O2·S1-S3), `CodeEditVersionNumberCharacterizationSqliteTest` 7건.
  - 검사 순서가 같다. 앞단(담당자·코드·원천 → 폐기 → 버전 종류)은 `CodeEditService` 그대로다. 그 뒤 훅 MDM006 → 번호(상한 MDM009, 버전 없음 MINOR MDM021) → 원본 검사(MDM021) → 쓰기 → 승격이다.
  - 번호: 전에는 `summary.maxVer()`(`ledger.versions`), 지금은 훅 `store.findAll` 의 최대값이다. 둘 다 그 코드의 TB_MDM_CODE_VER 전 행(상태 무관, scale 3)이고 같은 `VersionRules.nextNumber` 를 쓴다.
  - 미적용 가드: 전의 `checkCanCreateVersion` 과 훅 둘 다 `VersionPreconditions.requireNoUnapplied` 다.
  - 승격 조건: 전에는 「저장 CREATED 이고 effectiveStatus INUSE」 = 「저장 CREATED 이고 적용 시작 ≤ now 인 RELEASED 있음」. 지금은 훅 `isApplied`(같은 판정)를 지난 뒤 람다가 저장 CREATED 를 본다. now 는 둘 다 같은 `Clock` 을 초 단위로 자른 값이다. 전에는 가드와 요약이 now 를 따로 구했고, 지금은 훅이 한 번 구한다.
  - 로그 문구와 값이 같다. 복원 로그의 `from` 은 훅 뒤에 `parseVer(sourceVer)` 로 다시 구한다(쓰기 손잡이가 이미 형식을 확인했다).
- 트랜잭션 경계 변화:
  - 번호 오류(MDM009·버전 없음 MINOR MDM021)와 복원 원본 오류(MDM021)가 이제 훅의 `TransactionTemplate` 안에서 난다. 그래서 바깥(OASIS) 트랜잭션을 롤백 전용으로 표시한다. 전에는 안쪽 트랜잭션 밖에서 났다. MDM006 은 전에도 가드의 `TransactionTemplate` 안에서 났다. S7 이 다른 대상에 적은 변화와 같다.
  - 이 오류를 잡고 같은 바깥 트랜잭션을 커밋하는 호출자는 없다. 운영 진입은 `codeEdit.bpmn` 의 reg·restore 뿐이고 경계 이벤트가 없다. OASIS 는 오류면 전체를 롤백한다. 시험(api·lib 전체 grep)도 모두 `tx.execute(s -> service.…)` 형태라 예외가 템플릿 밖으로 나간다. `UnexpectedRollbackException` 은 보지 못했고 결과가 같다.
  - 가드·원본 오류는 아무 행도 쓰지 않는다(G1·R1). 쓰기·승격 실패면 VER 행·BASE·복원 선분·부모가 모두 되돌아간다(W1-W4). 훅은 호출자 트랜잭션에 합류하고 따로 커밋하지 않는다(O1·O2).
  - 부모 승격 UPDATE 가 훅 트랜잭션 안에서 나간다(람다의 `flush`). 전에는 `buildView` 의 네이티브 조회 때 자동 flush 로 나갔다. 같은 바깥 트랜잭션 안이라 최종 결과는 같다. 감사 카운터(+1)·`U_AT` 도 한 번만 바뀐다(S2·S3). W3·W4 의 트리거 실패 stack 이 승격 람다 → `DefaultVersionStateService.newVersion` → `TransactionTemplate.execute` 안임을 확인했다.
  - 승격 람다의 엔티티는 `requireWritable` 이 같은 트랜잭션에서 읽은 관리 상태다. flush 시점에 더러운 것은 `MdmCode` 하나다(버전 행·BASE·선분은 각자 먼저 flush 한다). 훅의 `findAll` 은 쓰기 전에 읽으므로 영속성 컨텍스트와 어긋나지 않는다.
  - 트랜잭션 없이 OASIS 밖에서 바로 부르는 경로는 없다. 그런 호출이면 `MdmCode` 가 분리 상태라 승격이 저장되지 않는다. 전에는 `persist` 가 트랜잭션 없음으로 실패했다(코드 읽기로 판단, 시험 없음).
  - 버전 행 조회가 1번 줄었다. 전: `summary` 의 `ledger.versions` + 가드 `findAll`(+ 복원 `ledger.versions`). 지금: 훅 `findAll`(+ 복원 `ledger.versions`).
- 대상 시험: lib `dmc.*`·`common.version.*`·`*ArchitectureTest` 113 통과(실패·건너뜀 0, `MdmScreenPackageArchitectureTest`·`MdmContractArchitectureTest`·`MdmEntityArchitectureTest`·`CodeEditServiceVerParseTest` 포함). api 같은 패키지 338 중 337 통과, 실패 1, 건너뜀 0. 실패는 기준선부터 실패하던 `CodeCateEditPerformanceSqliteTest` AC4 다(중앙값 1592·1396ms, PC 부하). 기준선(`ba126d608`)도 lib 113·api 338(AC4 실패 1, 중앙값 3831ms)로 수가 같다. `CodeEditVersionSqliteTest` 19·`MasterCodeRestoreSqliteTest` 7·`DmcCodeBpmnActionTest` 2 통과. 시험 파일은 바꾸지 않았다.
- 리뷰: opus 1회, CLEAN(blocker·major·minor 0, nit 5). 검사 항목에 「트랜잭션 경계 변화」를 따로 두었다. 반영: 람다 매개변수 이름(`newRef`), private 메서드 Javadoc 링크(`29a9f6c2a`), 이 문서 갱신. 남긴 nit: 복원 로그의 원본 번호 재해석(로그 값 형식 유지). `CodeEditNewVersionTxCharacterizationSqliteTest` 클래스 설명의 「훅 이전 전의 동작」·「가드 → 원본 → 채번」 문구는 레인 통합 때 고쳤다(설명만, 단언은 그대로).
- 영향 범위: `CodeVersionService`(생성자에서 `VersionWriteGuard` 가 빠지고 `VersionStateService` 가 들어왔다. Spring 주입만, 직접 생성 없음), `CodeEditService`(두 메서드에서 `summary(code)` 인자 제거, 구역 주석). BPMN 바인딩·공개 메서드 서명·응답 JSON·오류 코드는 그대로다. 계약 주석 4곳은 레인 통합 때 코드 대상을 넣어 고쳤다(주석만): `VersionWriteGuard`(가드를 직접 부르는 곳은 룰·룰 세트 폐기뿐이고 새 버전은 모두 훅), `ParentPromotion`(코드의 엔티티 구현), `DraftWriter`(코드 복원은 원천 empty·쓰기 손잡이가 원본을 직접 본다), `SourcePicker`(코드는 늘 empty).
- 되돌리는 방법: `29a9f6c2a` → `2f8d4f836` 순서로 revert. 시험은 바꾸지 않았으므로 되돌려도 그대로 통과한다.

## 보고만 한 후보 (이번에 고치지 않음)

조정자 지시(2026-10-16)로 고치지 않고 다음 판단을 위해 남긴다.

| 후보 | 근거 | 비고 |
|---|---|---|
| 레이아웃 새 버전이 부모 CREATED → INUSE 승격을 하지 않는다 | `dmb/layout/LayoutVersionService.newVersion` 에 `markParentInUse` 가 없다. 룰·룰 세트·ERD·코드는 적용된 RELEASED 가 있으면 새 버전 때 부모를 INUSE 로 올린다. 확정 때(`DefaultVersionStateService.confirm`) 적용 시각이 지났으면 올리므로, 미래 적용으로 첫 확정한 레이아웃만 CREATED 로 남는다 | C3 특성 시험이 지금 동작(승격 없음)을 고정한다(`b51e02740`). 훅으로 옮긴 뒤에도 그대로 둔다(S7). 의도인지 미확인 |
| 마루 데이터 등록에 담당자 가드가 없다 | `dmd/dataMng/service/DataMngService.register` 에 `requireSteward` 가 없다. 코드 등록(`dmc/codeMng/service/CodeMngService.register`)은 첫 줄에서 막는다 | dmd 의 권한 모델이 다른지 미확인 |
| ERD 새 버전 번호 기준이 최신 RELEASED 버전이다 | `dma/erdEdit/service/ErdVersionService.newVersion` 이 `VersionRules.nextNumber(source.getVer(), …)`. 더 큰 CANCELLED 버전이 있으면 PK 충돌 가능(운영에서는 CANCELLED 가 생기지 않는다) | C3 에서 고침(`af707c053`, S7). 실제로는 PK 충돌이 아니라 CANCELLED 행을 DRAFT 로 덮어썼다(복합 키 엔티티 merge) |
| 룰 세트·룰·레이아웃 새 버전이 같은 객체의 동시 복사를 막지 않는다 | 같은 객체에 새 버전 복사 요청 2회가 동시에 오면 둘 다 미적용 가드를 통과해 같은 번호를 받는다. 엔티티가 `@IdClass` 이고 `@Version` 이 없어 `saveAndFlush` 가 merge 로 동작해, 뒤 요청이 먼저 커밋된 DRAFT 를 덮을 수 있다. 원래부터 있던 경쟁이다(C3 훅으로 옮겨도 같다). 선례: ERD 는 `marker.lock`(부모 행 FOR UPDATE)으로 막는다 | 조정자 결정(2026-10-16): 이번 회차 제외(잠금 추가는 대기·교착이 생기는 동작 변경), fix 후보 |
| 결재 중 검사 3곳이 공통 가드와 겹친다 | C2 fix 뒤 `RuleScreenSupport.requireNoVersionInApproval`·`RuleSetVersionService.newVersion`·`LayoutVersionService.inApproval` 은 바로 앞 `checkCanCreateVersion`(또는 `hasUnapplied`)이 같은 MDM006·같은 결과를 먼저 낸다 | 조정자 결정(2026-10-16): 지우지 않고 남김. 주석은 `3ca56eac9` 에서 고쳤다. C3 뒤에는 화면 앞단 검사로 훅보다 먼저 돌고, 훅의 가드가 같은 MDM006 을 낸다(S7) |
| ADR-0002 D2 미적용 정의가 좁은 뜻이다 | `docs/mdm/adr/0002-version-confirm-without-approval.md:44`. C2 로 코드는 원천 04:284(넓은 뜻)를 따른다 | 조정자 결정(2026-10-16): ADR-0002 개정 이력에 메모를 남김. D2 본문은 그대로 |
| 원천 06 의 미적용 문구가 좁은 뜻이다 | `/Users/jji/project/mdm/docs/design/basic/06-business-rule.md:762·1228`(「원래 REQUESTED·APPROVED 포함 → ADR-0002 D2 로 바뀜」)과 SQL 주석 `:1309·1343`. C2 뒤 코드는 04:284(넓은 뜻)를 따르므로 06 문구와 다르다 | 조정자 결정(2026-10-16): 넓은 뜻 결정은 그대로다. 06 은 저장소 밖·이력 없는 파일이라 고치지 않는다. 원천 06 문구 정리 = 사용자 몫. ADR-0002 의 06 인용 행 번호는 바로잡았다 |
| 헤더 관리 화면이 레이아웃 관리 화면 DTO 를 쓴다 | `dmb/headerMng/service/HeaderMngService` 가 `dmb/layoutMng/dto` 의 `LayoutVersionRequest`·`LayoutVersionResult` 를 그대로 쓴다. ArchUnit `MdmScreenPackageArchitectureTest` 예외 `dmb.headerMng -> dmb.layoutMng` 로 남는다. BPMN 이 dto FQCN 을 묶는다 | 조정자 결정(2026-10-16): 이번 범위(C5 layout 코어) 밖. 다음 회차 후보 = 공용 layout DTO 분리 |
| 룰 관리 응답 문구에 결재 중이 빠졌다 | `dme/ruleMng/dto/RuleMngViewResult.java:104` 「미적용(작성 중 또는 적용 전 확정)」. 계산은 이미 넓은 뜻 | 조정자 결정(2026-10-16): 후보로만 남김. rule 레인 파일, 원래 있던 문구 |
