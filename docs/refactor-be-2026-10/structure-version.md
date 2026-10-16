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

## 보고만 한 후보 (이번에 고치지 않음)

조정자 지시(2026-10-16)로 고치지 않고 다음 판단을 위해 남긴다.

| 후보 | 근거 | 비고 |
|---|---|---|
| 레이아웃 새 버전이 부모 CREATED → INUSE 승격을 하지 않는다 | `dmb/layout/LayoutVersionService.newVersion` 에 `markParentInUse` 가 없다. 룰·룰 세트·ERD·코드는 적용된 RELEASED 가 있으면 새 버전 때 부모를 INUSE 로 올린다. 확정 때(`DefaultVersionStateService.confirm`) 적용 시각이 지났으면 올리므로, 미래 적용으로 첫 확정한 레이아웃만 CREATED 로 남는다 | 시험이 잡지 않는다. 의도인지 미확인 |
| 마루 데이터 등록에 담당자 가드가 없다 | `dmd/dataMng/service/DataMngService.register` 에 `requireSteward` 가 없다. 코드 등록(`dmc/codeMng/service/CodeMngService.register`)은 첫 줄에서 막는다 | dmd 의 권한 모델이 다른지 미확인 |
| ERD 새 버전 번호 기준이 최신 RELEASED 버전이다 | `dma/erdEdit/service/ErdVersionService.newVersion` 이 `VersionRules.nextNumber(source.getVer(), …)`. 더 큰 CANCELLED 버전이 있으면 PK 충돌 가능(운영에서는 CANCELLED 가 생기지 않는다) | C3 에서 fix 커밋으로 전체 최대 버전 기준으로 바꾼다(조정자 결정 Q2) |
