# 마루 MDM 화면 — 그룹 코드·screenId·경로 규약

> 작성: 2026-09-24 (mdm/TSK-02-01 전사 아키텍처·버전 확정 규칙 설계)
> 결정 근거: [ADR-0003 MDM 모듈 경계 — 화면 그룹·산출물 위치·As-Is 병존·권한 역할](../adr/0003-module-boundary-screens-roles.md), `docs/mdm/decisions.md` D-015
> 이 문서가 mdm 화면 그룹 코드와 screenId 목록의 정본이다. [TRD](../TRD.md) §5 표와 [wbs](../wbs.md) entry-point 는 이 문서와 같아야 한다.

## 1. 이 폴더의 뜻

- 화면별 설계 산출물 5종(분석 리포트·기능·디자인·BPMN·정합 체크)을 **`docs/mdm/screens/{screenId}/`** 에 둔다. 파일 이름과 5종 구성은 `docs/guide/design/README.md` 규약을 그대로 따른다.
- 다른 MES 모듈은 산출물을 `docs/{moduleId}/design/{screenId}/` 에 두지만, mdm 은 그 자리를 쓰지 않는다. `docs/mdm/design` 은 외부 mdm 프로젝트(`/Users/jji/project/mdm/docs/design`)로 가는 로컬 링크이고 `.gitignore` 로 무시되므로, 그 안의 파일은 저장소에 커밋되지 않는다. RULE.md 와 `docs/guide/MES/Mes-Guide.md` 에 이 예외를 적었다.
- mls 의 `docs/mls/screens/` 는 레거시 화면 분석 보고서(BPA) 자리라서 이 폴더와 뜻이 다르다. MDM 은 As-Is 화면이 없는 신규 모듈이라 BPA 가 없고, 이 폴더는 설계 산출물 5종을 담는다.

## 2. 화면 그룹 코드

식별자 사전 §A.2.1 영역 코드(`{moduleId 2~3번째 글자}{a~z 순번}` → mdm 은 `dm` + 순번)를 따른다. 식별자 사전 §A.2.3 에 등재했다.

| 그룹 | 영역 | 메뉴 폴더 이름(`TB_MCM_SEC_MENU_FLD`) |
|---|---|---|
| `dma` | 용어·도메인·컬럼·단위(02) | 용어·도메인 |
| `dmb` | 인터페이스 레이아웃(03) | 레이아웃 |
| `dmc` | 마스터코드(04) | 마스터코드 |
| `dmd` | 마스터데이터(05) | 마스터데이터 |
| `dme` | 업무기준·룰 세트(06) | 업무기준 |
| (보류) | 결재 공통 — 결재를 구현할 때 다음 순번 `dmf` 로 등재한다(PRD §2 규칙 7) | — |

- 메뉴 루트 폴더는 `mdm` 이다(TSK-01-01 이 시드).
- 메뉴 leaf 의 `PARENT_MENU_ID` 는 그룹 코드, `OBJECT_ID` 는 screenId 다.

## 3. screenId 목록

wbs entry-point 에서 도출해 원천 화면 절과 대조했다. `독립` 은 page.tsx 와 메뉴 leaf 를 갖는 화면이고, `팝업` 은 page.tsx 와 메뉴 leaf 가 없는 화면이다. screenId 는 wbs entry-point 의 값을 그대로 쓴다.

| 그룹 | screenId | 화면 | 형태 | Task | 원천 |
|---|---|---|---|---|---|
| dma | `unitMng` | 단위 마스터 | 독립 | TSK-04-02 | 02:290 |
| dma | `termMng` | 용어 관리 | 독립 | TSK-04-02 | 01:101 |
| dma | `domainMng` | 도메인 관리 | 독립 | TSK-04-03 | 02:292-298 |
| dma | `columnMng` | 컬럼 사전 | 독립 | TSK-04-04 | 01:103 |
| dma | `termRegPop` | 용어 인라인 등록 | 팝업(columnMng 에서 호출) | TSK-04-04 | 02:521 |
| dmb | `headerMng` | 전문 헤더 정의 | 독립 | TSK-05-02 | 01:184 |
| dmb | `layoutMng` | 전문 레이아웃 | 독립 | TSK-05-02·05-03 | 03:104 |
| dmc | `codeMng` | 마루 코드(조회·등록) | 독립 | TSK-06-02 | 04:812- |
| dmc | `codeEdit` | 마루 코드 수정 | 독립 | TSK-06-02 | 04 |
| dmc | `codeItemEdit` | 코드 편집 | 독립 | TSK-06-03 | 04 |
| dmc | `codeCateEdit` | 카테고리 편집 | 독립 | TSK-06-04 | 04(결정 2026-09-22) |
| dmc | `codeConfirm` | 버전 확정 | 독립 | TSK-06-05 | PRD 규칙 7(상신 화면 대체) |
| dmd | `dataMng` | 마루 데이터(조회·등록) | 독립 | TSK-07-02 | 05:472- |
| dmd | `dataEdit` | 마루 데이터 수정 | 독립 | TSK-07-02 | 05 |
| dmd | `dataCateEdit` | 카테고리 편집 | 독립 | TSK-07-02 | 05 |
| dmd | `dataItemMng` | 항목 관리 | 독립 | TSK-07-03·07-04 | 05 |
| dmd | `dataHistory` | 항목 이력 | 독립 | TSK-07-03 | 05 |
| dmd | `dataCsvUploadPop` | CSV 업로드 | 팝업(`dataItemMng` 에서 호출) — TSK-07-04 가 확정(§4) | TSK-07-04 | 05 |
| dme | `ruleMng` | 룰(조회·등록) | 독립 | TSK-08-02 | 06:741- |
| dme | `ruleEdit` | 룰 화면 | 독립 | TSK-08-02~08-04 | 06 |
| dme | `ruleConfirm` | 버전 확정 | 독립 | TSK-08-05 | PRD 규칙 7 |
| dme | `ruleSetMng` | 룰 세트(조회·등록) | 독립 | TSK-08-06 | 06 |
| dme | `ruleSetEdit` | 룰 세트 편집 | 독립 | TSK-08-06 | 06 |
| (보류) | `dictSystemMng` | 사전 수신 시스템 | 보류(PRD §5) — 그룹 `dma` 예약 | — | 02:291 |

- screenId 유일성: 위 24종은 리포의 OBJECT_ID·BPMN·코드 어디와도 겹치지 않는다. mcm `cma`/`cmb` 의 `masterCodeMng` 등과 이름이 다르다.
- TSK-01-01 이 만든 샘플 화면 `mdmSample` 은 아직 옛 그룹 경로에 있다. TSK-01-03 이 `dma` 로 옮기거나 샘플을 지운다(메뉴 시드·tsup entry·pages 폴더·스모크 테스트를 함께 맞춘다).
- 새 화면을 설계하는 Task 는 식별자 사전 §A.3.2 에 화면 행을 등재한다(등재 절차 1).

## 4. `dataCsvUploadPop` 인계 — 확정(TSK-07-04, D-097)

이름의 `Pop` 접미와 리포 규칙(팝업은 page.tsx·메뉴 금지)은 팝업을 가리킨다. 반면 wbs TSK-07-04 는 page.tsx·메뉴 leaf·e2e 를 요구하고, 원천 05 는 팝업 여부를 적지 않아, 이 문서가 판단을 TSK-07-04 에 **인계**했었다.

- **TSK-07-04 가 팝업으로 확정했다.** `dataItemMng` 안의 "CSV 업로드" 버튼으로 열고, page.tsx·메뉴 leaf 를 두지 않는다(`termRegPop` 과 같은 모양: `{screenId}.tsx` + `index.ts` 배럴). 근거: mcm `masterRuleDataUploadFilePopup`(`docs/mcm/design/masterRuleDataUploadFilePopup/`) 이 "modal popup — 단독 진입 불가, 부모의 자식" 선례이고, 이 저장소 안에는 같은 모양의 `termRegPop`(TSK-04-04)이 이미 있다.
- e2e `mdm-dataCsvUploadPop.spec.ts` 는 파일명은 spec.md 그대로 두되, 시나리오는 "`dataItemMng` 화면의 CSV 업로드 버튼으로 팝업을 연다"로 바꾼다(TSK-07-04 design.md 「수용 기준 매핑」).
- §3 의 `dataCsvUploadPop` 행을 "팝업(`dataItemMng` 에서 호출)"로 갱신했다.

## 5. 경로 규약

| 대상 | 경로 |
|---|---|
| FE 화면 | `src/frontend/m-mdm/pages/{group}/{screenId}/page.tsx` (`src/` 없음 — 포털 codegen 이 스캔하는 경로) |
| FE 팝업 | `src/frontend/m-mdm/pages/{group}/{screenId}/{screenId}.tsx` + `index.ts` 배럴(page.tsx 금지) |
| BE 패키지 | `com.dongkuk.dmes.mdm.{group}.{screenId}.{dto,service}`, 공용 `com.dongkuk.dmes.mdm.{entity,repository}` |
| BPMN | `src/backend/mdm/api/src/main/resources/services/{group}/{screenId}.bpmn`, process id = serviceId = screenId |
| URL | `POST /api/mdm/oasis/{serviceId}/{action}` |
| componentPath | `{group}/{screenId}` |
| 화면 설계 산출물 5종 | `docs/mdm/screens/{screenId}/` (§1) |

## 6. 만들지 않는 화면 (보류, PRD §5)

- 결재 화면
- 04·05·06 수신 로그 화면
- EXTERNAL 등록 변형 화면
- 배포 대상 카드
- 04 「배포와 사본」·05 「배포 순번」 목업 화면

이 목록과 §3 `(보류)` 행의 `dictSystemMng` 는 다르다. `dictSystemMng` 는 그룹 `dma` 를 예약해 둔 **보류 화면**(나중에 만들 수 있음)이고, 위 목록은 이번 범위에서 **아예 만들지 않는** 화면이다.

## 7. 근거

- [ADR-0003](../adr/0003-module-boundary-screens-roles.md) — 그룹 코드·산출물 위치·As-Is 병존·권한 역할
- 식별자 사전 [§A.2.1·§A.2.3](../../guide/design/identifier-dictionary/01-modules-and-screens.md) — 영역 코드 표기 표준과 mdm 등재 행
- [TRD](../TRD.md) §5·§8·§9 T2
