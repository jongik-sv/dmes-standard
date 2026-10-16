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

## 보고만 한 후보 (이번에 고치지 않음)

조정자 지시(2026-10-16)로 고치지 않고 다음 판단을 위해 남긴다.

| 후보 | 근거 | 비고 |
|---|---|---|
| 레이아웃 새 버전이 부모 CREATED → INUSE 승격을 하지 않는다 | `dmb/layout/LayoutVersionService.newVersion` 에 `markParentInUse` 가 없다. 룰·룰 세트·ERD·코드는 적용된 RELEASED 가 있으면 새 버전 때 부모를 INUSE 로 올린다. 확정 때(`DefaultVersionStateService.confirm`) 적용 시각이 지났으면 올리므로, 미래 적용으로 첫 확정한 레이아웃만 CREATED 로 남는다 | 시험이 잡지 않는다. 의도인지 미확인 |
| 마루 데이터 등록에 담당자 가드가 없다 | `dmd/dataMng/service/DataMngService.register` 에 `requireSteward` 가 없다. 코드 등록(`dmc/codeMng/service/CodeMngService.register`)은 첫 줄에서 막는다 | dmd 의 권한 모델이 다른지 미확인 |
| ERD 새 버전 번호 기준이 최신 RELEASED 버전이다 | `dma/erdEdit/service/ErdVersionService.newVersion` 이 `VersionRules.nextNumber(source.getVer(), …)`. 더 큰 CANCELLED 버전이 있으면 PK 충돌 가능(운영에서는 CANCELLED 가 생기지 않는다) | C3 에서 fix 커밋으로 전체 최대 버전 기준으로 바꾼다(조정자 결정 Q2) |
| 결재 중 검사 3곳이 공통 가드와 겹친다 | C2 fix 뒤 `RuleScreenSupport.requireNoVersionInApproval`·`RuleSetVersionService.newVersion`·`LayoutVersionService.inApproval` 은 바로 앞 `checkCanCreateVersion`(또는 `hasUnapplied`)이 같은 MDM006·같은 결과를 먼저 낸다 | 조정자 결정(2026-10-16): 지우지 않고 남김. 주석은 `3ca56eac9` 에서 고쳤다 |
| ADR-0002 D2 미적용 정의가 좁은 뜻이다 | `docs/mdm/adr/0002-version-confirm-without-approval.md:44`. C2 로 코드는 원천 04:284(넓은 뜻)를 따른다 | 조정자 결정(2026-10-16): ADR-0002 개정 이력에 메모를 남김. D2 본문은 그대로 |
| 원천 06 의 미적용 문구가 좁은 뜻이다 | `/Users/jji/project/mdm/docs/design/basic/06-business-rule.md:762·1228`(「원래 REQUESTED·APPROVED 포함 → ADR-0002 D2 로 바뀜」)과 SQL 주석 `:1309·1343`. C2 뒤 코드는 04:284(넓은 뜻)를 따르므로 06 문구와 다르다 | 조정자 결정(2026-10-16): 넓은 뜻 결정은 그대로다. 06 은 저장소 밖·이력 없는 파일이라 고치지 않는다. 원천 06 문구 정리 = 사용자 몫. ADR-0002 의 06 인용 행 번호는 바로잡았다 |
| 헤더 관리 화면이 레이아웃 관리 화면 DTO 를 쓴다 | `dmb/headerMng/service/HeaderMngService` 가 `dmb/layoutMng/dto` 의 `LayoutVersionRequest`·`LayoutVersionResult` 를 그대로 쓴다. ArchUnit `MdmScreenPackageArchitectureTest` 예외 `dmb.headerMng -> dmb.layoutMng` 로 남는다. BPMN 이 dto FQCN 을 묶는다 | 조정자 결정(2026-10-16): 이번 범위(C5 layout 코어) 밖. 다음 회차 후보 = 공용 layout DTO 분리 |
| 룰 관리 응답 문구에 결재 중이 빠졌다 | `dme/ruleMng/dto/RuleMngViewResult.java:104` 「미적용(작성 중 또는 적용 전 확정)」. 계산은 이미 넓은 뜻 | 조정자 결정(2026-10-16): 후보로만 남김. rule 레인 파일, 원래 있던 문구 |
