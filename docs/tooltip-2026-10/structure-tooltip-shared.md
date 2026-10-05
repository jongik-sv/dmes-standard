# 구조 변경 기록 — tooltip-shared 레인

브랜치 `fix/tooltip-shared`, 기준 dev `e00a3c7c`. 지시 tooltip-shared-1(A1~A6).

## S1. 포털 탭 메타 모듈 대체 표(mdm → mcm)
- 커밋: c2cf6be8, 68d2bb9e, fa28c5d5
- 바뀌기 전: `MDM_META_UNSUPPORTED_MODULES = {mdm, analog}` — portal-shell `TabPageSlot` 이 두 모듈 탭의 `MdmMetaProvider` 를 `disabled` 로 꺼 MDM 화면 머리글·라벨 툴팁이 나오지 않았다(e6dd175d).
- 바뀐 뒤: 표 하나 `MDM_META_TAB_MODULES = Map{mdm → "mcm", analog → null(끔)}`(비공개)와 `mdmMetaTabProps(pageId)` 를 `mdm-meta/context.tsx` 에 둔다. portal-shell 이 `<MdmMetaProvider {...mdmMetaTabProps(pageId)}>` 로 넘긴다(표에 없으면 빈 객체 → 예전처럼 pageId 모듈). 예전 `MDM_META_UNSUPPORTED_MODULES`·`isMdmMetaUnsupportedPage` 는 이 표로 합쳤다(배럴 밖 내부 이름).
- 바꾼 이유: MDM 서버는 `cactus.mdm` 을 켜지 않아 `/api/mdm/mdmMeta` 가 404 이지만 `/api/mcm/mdmMeta` 가 같은 사전을 200 으로 준다(조정자 실측).
- 동작 보존 근거: `portal-shell-mdm-meta.unit.test.ts` 3건(mls 탭 그대로, analog 요청 0, mdm 탭 → mcm 요청), `mdm-meta-context.unit.test.ts` 대체 함수 2건 통과.
- 영향 범위: m-mdm 탭 전체(이제 `/api/mcm/mdmMeta/*` 요청이 생긴다). 화면 안쪽 공급자가 `module` 을 주면 그 값이 이긴다. m-mdm 시험 `decision-table-card.test.ts` 737행 주석이 낡음(조정 세션 경유로 tooltip-screens 에 전달).
- 되돌리는 방법: c2cf6be8 revert(68d2bb9e 는 시험만이라 함께 revert).

## S2. AgDataGrid 기본 머리글 툴팁·툴팁 지연 prop
- 커밋: 1e6f0393, 892c17dd, 8af10d91, 493fe2ed, fa28c5d5
- 바뀌기 전: MDM 메타가 있는 열에만 `headerTooltip`. 그리드 `tooltipShowDelay` 를 정하지 않아 ag-grid 기본 2000ms. `MdmHeaderLabel` 기본 지연 상수 2000.
- 바뀐 뒤: `leafColDef` 가 메타 카드가 없는 잎 열에 `headerTooltip = col.headerTooltip ?? 표시 이름`(빈 이름·headerComponent 열 제외)을 준다. 공개 prop `AgDataGridProps.tooltipShowDelay`(기본 `GRID_TOOLTIP_SHOW_DELAY_MS` = 500, 그리드 배럴 export). 값은 중립 모듈 `components/grid/grid-tooltip.ts` 하나에 두고 AgDataGrid·MdmHeaderLabel 이 가져다 쓴다(예전 `MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS` 는 없앴다 — 배럴 밖). `leafColDef` 의 머리글 툴팁 판정은 한 식(`headerTooltip`)에 모았다.
- 바꾼 이유: 사전에 없는 열은 좁아서 말줄임된 머리글을 확인할 수 없었고, 2초 지연은 툴팁을 기다리기에 너무 길었다.
- 동작 보존 근거: `grid-*` 시험 17파일 통과. 열 그룹·No 열은 그대로(`grid-mdm-meta.unit.test.ts`). `columnDefs` useMemo deps 변화 없음.
- 영향 범위: 모든 AgDataGrid 화면. 셀 값 툴팁도 500ms 로 빨라진다(화면이 `tooltipShowDelay` 로 늦출 수 있고, 열은 `tooltip: false`). 폼 라벨(useHoverTip) 지연은 그대로.
- 되돌리는 방법: 지연은 8af10d91·493fe2ed revert, 기본 머리글 툴팁은 1e6f0393·892c17dd revert.

## S3. SearchField `name`·`meta`
- 커밋: 562289e1
- 바뀌기 전: `SearchField` 라벨은 `<Text>{label}</Text>`, MDM 메타를 쓰지 않았다.
- 바뀐 뒤: optional `name`·`meta` 를 주면 라벨 안에 `MdmFieldLabel`(name→물리명, meta 문자열 우선, meta=false 끔)을 그린다. `layout` 묶음이 `mdm-meta/MdmFieldLabel` 을 직접 import 한다(배럴 아님). store·컨텍스트는 globalThis 단일 인스턴스라 tsup 분리 빌드에서도 요청이 한 묶음으로 모인다. 그 대신 `dist/layout.js` 가 54.4K(메인 체크아웃 dist, 변경 전) → 85.5K(이 브랜치)로 커진다(같은 코드가 form·grid·mdm-meta 묶음에도 이미 있다, splitting:false).
- 바꾼 이유: 조회 영역 라벨에 컬럼 사전 툴팁이 없었다(tooltip-screens 의 SearchField 항목이 이 prop 을 쓴다).
- 동작 보존 근거: `search-field-mdm-meta.unit.test.ts` 특성 시험 — name 없는 텍스트·선택·라디오·사용자 입력 칸이 공급자 안팎에서 같은 DOM(자동 id 정규화)이고 요청 0건. 구현 전 코드에서 먼저 통과를 확인했다.
- 영향 범위: name 을 주는 화면만. 필터 키(edt_·cbo_)에서 이름을 추론하지 않는다. Radio name·최근 입력값 키는 계속 label.
- 되돌리는 방법: 562289e1 revert(화면이 name 을 쓰기 시작했다면 그 화면 커밋을 먼저 revert).
