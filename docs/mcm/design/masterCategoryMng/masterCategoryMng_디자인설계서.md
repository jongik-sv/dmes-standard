---
screenId: masterCategoryMng
asIsId: MasterCategoryMng
moduleId: mcm
moduleGroup: cma
pageName: masterCategoryMng
pageId: masterCategoryMng
serviceId: masterCategoryMng
작성일: 2026-05-27
작성자: Agent
---

# 카테고리 관리 (masterCategoryMng) 디자인설계서

> 본 문서는 [분석리포트](./masterCategoryMng_분석리포트.md) 의 UI 컴포넌트 표 (§3) 를 디자인 관점으로 재구성한다. 분석리포트의 §3 (컴포넌트) / §4 (버튼) / §10 (메시지) 가 단일 원천.

---

## §1. 화면 개요 + 레이아웃

### §1.1 메타

| 항목 | 값 |
|---|---|
| 화면 ID | masterCategoryMng |
| 화면명 | 카테고리 관리 |
| 화면 크기 | 1280 × 670 (As-Is xfdl:3) |
| 상단 제목 | 카테고리 관리 |
| 페이지 구성 | 헤더(50px) → 조회조건(43px) → 접기버튼(15px) → 메인 그리드 + 우측메뉴 → 하단 상태바(20px) |
| 전체 패딩 (좌/우) | 20px |
| 전체 패딩 (하단) | 35px (그리드 영역 bottom) |

### §1.2 레이아웃 (ASCII 모형 — As-Is xfdl 좌표 기반)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ┌────────────┐                              ┌─ 상단 메뉴 (조회/저장)─┐ │ A-001 헤더 (top=0, h=50)
│ │ 카테고리 관리 │ (edt_title readonly)        │ [조회] [저장]           │ │
│ └────────────┘                              └─────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ [코드ID]  [   USD  ]   [코드명]  [   USD  ]                              │ A-002 조회조건 (top=50, h=43)
│ [카테고리ID][   USD ]   [카테고리명][   USD  ]                            │
├────────────────────────────────────────────────────────────────────────┤
│             ━━━━━━━━━━━━━ btn_fold ━━━━━━━━━━━━━                       │ A-003 접기 (top=93, h=15)
├────────────────────────────────────────────────────────────────────────┤
│                              [행추가][행복사][행삭제][행취소][엑셀다운] │ C-001 우측 메뉴 (top=0, h=20)
│ ┌──┬───┬───┬───────┬───────┬───────┬───────┬───┐                       │ A-004 그리드 (top=26)
│ │선택│NO │상태│ 코드명 │ 코드 ID │카테고리ID│카테고리명 │정렬│            │
│ ├──┼───┼───┼───────┼───────┼───────┼───────┼───┤                       │
│ │ ▢│ 1 │   │       │       │       │       │   │ ←── 빨간 배경 (CHK=1) │
│ │ ▢│ 2 │   │       │       │       │       │   │                       │
│ └──┴───┴───┴───────┴───────┴───────┴───────┴───┘                       │
├────────────────────────────────────────────────────────────────────────┤
│ 상태바: "{n}건 조회 되었습니다." ...                                       │ A-005 하단 (bottom=0, h=20)
└────────────────────────────────────────────────────────────────────────┘
```

비고:
- 그리드는 `autofittype="col"` 로 가용 폭 자동 분배. col 폭(xfdl:13~22): 30/30/30/160/160/160/160/48 = 778px 기본.
- 우측 메뉴 (`div_rightMenu`) 폭 400px / 높이 20px / 우상단 정렬 (xfdl:50).
- 상단 메뉴 (`div_topMenu`) 폭 330px / 높이 23px / 우상단 + bottom=10 (xfdl:58).

---

## §2. 영역 구성

| 영역 ID | 영역명 | xfdl id | URL/include | 폭/높이 | 위치 |
|---|---|---|---|---|---|
| A-001 | 헤더 | div_title | (내장) | full-width, h=50 | top=0, left=20, right=20 |
| A-001-1 | 제목 라벨 | div_title.edt_title | (없음) | w=110, h=30 | left=0, bottom=10 |
| A-001-2 | 상단 메뉴 | div_title.div_topMenu | _com_div::commonTopButton.xfdl | w=330, h=23 | right=0, bottom=10 |
| A-002 | 조회조건 | div_search | (내장) | full-width, h=43 | top=50, left=20, right=20 |
| A-003 | 접기 토글 | btn_fold | (cssclass=btn_WFSA_Fold) | h=15 | top=93, left=20, right=20 |
| A-004 | 메인 (그리드 영역) | div_main | (내장) | full-width, bottom=35 | top=btn_fold:5, left=20, right=20 |
| A-004-1 | 메인 그리드 | div_main.grd_main | binddataset=ds_grdMain | autofitcol, h=auto | top=26, left=0, right=0, bottom=0 |
| A-004-2 | 우측 메뉴 | div_main.div_rightMenu | _com_div::commonRightButton.xfdl | w=400, h=20 | top=0, right=0 |
| A-005 | 하단 상태바 | div_bottom | _com_div::commonBottomStatus.xfdl | full-width, h=20 | bottom=0, left=0, right=0 |

---

## §3. 조회조건

### §3.1 컴포넌트 배치 (한 줄)

| 순 | 컴포넌트 | 라벨 | width | 좌표 (left/top) | 비고 |
|---:|---|---|---:|---|---|
| 1 | stc_codeVal (Static) | 코드ID | 50 | left=10, top=10 | cssclass=stc_WFSA_Label |
| 2 | edt_codeVal (Edit) | (값) | 135 | left=stc_codeVal:10, top=10 | upper / alpha / value="USD" (As-Is 보존) |
| 3 | stc_codeValMean (Static) | 코드명 | 50 | left=edt_codeVal:20, top=10 | cssclass=stc_WFSA_Label |
| 4 | edt_codeNm (Edit) | (값) | 135 | left=stc_codeValMean:10, top=10 | normal / hangul / value="USD" (As-Is 보존) |
| 5 | stc_categoryId (Static) | 카테고리ID | 75 | left=edt_codeNm:20, top=10 | cssclass=stc_WFSA_Label |
| 6 | edt_categoryId (Edit) | (값) | 135 | left=stc_categoryId:10, top=10 | upper / alpha / value="USD" (As-Is 보존) |
| 7 | stc_categoryNm (Static) | 카테고리명 | 75 | left=edt_categoryId:20, top=10 | cssclass=stc_WFSA_Label |
| 8 | edt_categoryNm (Edit) | (값) | 135 | left=stc_categoryNm:10, top=10 | normal / hangul / value="USD" (As-Is 보존) |

### §3.2 입력 검증

| 입력 | maxlength | inputmode | imemode | 기본값 | 검증 (UI) |
|---|---:|---|---|---|---|
| edt_codeVal | 0 (무제한) | upper | alpha | USD | 없음 (서버 LIKE 자동) |
| edt_codeNm | 0 | normal | hangul | USD | 없음 |
| edt_categoryId | 0 | upper | alpha | USD | 없음 |
| edt_categoryNm | 0 | normal | hangul | USD | 없음 |

비고: 4 Edit 모두 As-Is text="USD" 보존 (사용자 결정 — 운영 의도).

---

## §4. 그리드 (G-001)

### §4.1 그리드 메타

| 항목 | 값 |
|---|---|
| 그리드 ID | grd_main |
| binddataset | ds_grdMain (6 컬럼: MASTER_CODE, CATEGORY_ID, CATEGORY_NM, SORT_SEQ, CODE_NM, CHK — 모두 STRING(256)) |
| autofittype | col |
| selecttype | multiarea |
| cellmovingtype | col |
| cellsizingtype | col |
| head 높이 | 26 |
| body 높이 | 26 |
| 헤드 클릭 이벤트 | div_main_grd_main_onheadclick (전체선택 + 정렬) |

### §4.2 컬럼 전수 (8 cols)

| col | head text | 폭 (px) | bind | displaytype | edittype | editmaxlength | editinputmode | editimemode | 편집 | format / mask |
|---:|---|---:|---|---|---|---:|---|---|---|---|
| 0 | 선택 | 30 | CHK | checkboxcontrol | checkbox | - | - | - | Y | true/false ↔ 1/0 |
| 1 | NO | 30 | (expr:currow+1) | normal | none | - | - | - | N | 1부터 일련 |
| 2 | 상태 | 30 | STATUS | imagecontrol | none | - | - | - | N | Nexacro auto row state — To-Be FE 동일 구현 (사용자 결정) |
| 3 | 코드명 | 160 | CODE_NM | normal | none | - | - | - | N | 텍스트 (TB_MCM_CODE_MASTER 인용) |
| 4 | 코드 ID | 160 | MASTER_CODE | 신규행=editcontrol / 그외=normal | 신규행=text / 그외=none | - | upper | - | 신규행만 | 영문 대문자 |
| 5 | 카테고리 ID | 160 | CATEGORY_ID | 신규행=editcontrol / 그외=normal | 신규행=text / 그외=none | 50 | upper | alpha | 신규행만 | 영문 대문자 |
| 6 | 카테고리 명 | 160 | CATEGORY_NM | editcontrol | normal | 180 | - | hangul | Y (전 행) | 한글 |
| 7 | 정렬 | 48 | SORT_SEQ | editcontrol | mask | 180 | - | - | Y (전 행) | mask (As-Is 패턴 보존) |

### §4.3 셀 cssclass 조건부

모든 셀 (col 0~7) 공통:
```
cssclass="expr:dataset.getColumn(currow, &quot;CHK&quot;) == &quot;1&quot; ? &quot;cellBody_BgColor_red&quot; : &quot;&quot;"
```
- CHK=1 인 행 전체가 빨간 배경(class `cellBody_BgColor_red`) 적용 — 사용자가 선택한 행 시각 강조.
- 근거: xfdl:38~45 (8 셀 전수).

### §4.4 dataset 컬럼 / Grid col 매핑 정합

| Grid col | Grid bind | ds_grdMain ColumnInfo (xfdl:85~94) | 정합 |
|---:|---|---|---|
| 0 | CHK | ✓ | OK |
| 1 | (expr) | - | OK (계산식 / 컬럼 미선언) |
| 2 | STATUS | ✗ 미선언 (Nexacro auto row state) | ○ — To-Be FE 동일 구현 |
| 3 | CODE_NM | ✓ | OK |
| 4 | MASTER_CODE | ✓ | OK |
| 5 | CATEGORY_ID | ✓ | OK |
| 6 | CATEGORY_NM | ✓ | OK |
| 7 | SORT_SEQ | ✓ | OK |

---

## §5. 버튼

### §5.1 상단 메뉴

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-001 | 조회 | (commonTopButton 표준) | div_topMenu | fn_search → action=search |
| B-002 | 저장 | (commonTopButton 표준) | div_topMenu | fn_save → 검증 4 → action=save |

### §5.2 우측 메뉴

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-003 | 행추가 | (commonRightButton 표준) | div_rightMenu | fn_rowAdd |
| B-004 | 행복사 | 〃 | 〃 | fn_rowCopy |
| B-005 | 행삭제 | 〃 | 〃 | fn_rowDelete |
| B-006 | 행취소 | 〃 | 〃 | fn_rowCancel |
| B-007 | 엑셀다운 | 〃 | 〃 | fn_excelDown |

### §5.3 본문 버튼

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-008 | (접기/펴기 화살표) | btn_WFSA_Fold | top=93, left=20, right=20, h=15 | btn_fold_onclick → div_search 접기/펴기 |

### §5.4 버튼 활성/비활성

| 버튼 | 활성 조건 | 비활성 조건 |
|---|---|---|
| B-001 조회 | 항상 | - |
| B-002 저장 | 항상 (검증은 클릭 시 수행) | - |
| B-003 행추가 | 항상 | - |
| B-004 행복사 | CHK=1 행 존재 시 의미 있음 (gfn_rowcopyData 가 내부 처리) | - |
| B-005 행삭제 | CHK=1 행 존재 시 (없으면 MSG-006 경고) | - |
| B-006 행취소 | 항상 | - |
| B-007 엑셀다운 | 항상 | - |
| B-008 fold | 항상 | - |

---

## §6. 팝업

본 화면은 호출 팝업 없음 (분석리포트 §5).

---

## §7. 메시지 표기

### §7.1 검증 메시지 (warning)

| MSG-NNN | 화면 표시 텍스트 (As-Is 보존) |
|---|---|
| MSG-001 | "코드ID를 입력해 주십시오." |
| MSG-002 | "카테고리 ID를 입력해 주십시오." |
| MSG-003 | "카테고리 명을 입력해 주십시오." |
| MSG-004 | "중복된 카테고리 ID가 존재합니다." |
| MSG-005 | "전체 마스터 내 중복된 코드값이 존재합니다." |
| MSG-006 | "선택된 행이 없습니다." |

### §7.2 상태바 메시지 (하단 div_bottom)

| MSG-NNN | 화면 표시 텍스트 |
|---|---|
| MSG-010 | "{n}건 조회 되었습니다." (n = ds_GetCodeCategoryList 행수) |
| MSG-011 | "{n}건 저장 되었습니다." (n = cnt_merge) |
| MSG-013 | (오류 시) strErrorMsg 그대로 |

### §7.3 (주석) confirm 메시지 (As-Is 잔존, 운영 미사용)

| MSG-NNN | 텍스트 |
|---|---|
| MSG-007 | "[코드] = {MASTER_CODE}\n[카테고리] = {CATEGORY_ID} \n삭제하시겠습니까?" (xfdl:351 — 블록 주석) |

### §7.4 라벨 / 헤드 텍스트 (As-Is 보존)

| 위치 | 텍스트 |
|---|---|
| 상단 제목 (edt_title) | "카테고리 관리" |
| 조회조건 라벨 1 | "코드ID" |
| 조회조건 라벨 2 | "코드명" |
| 조회조건 라벨 3 | "카테고리ID" |
| 조회조건 라벨 4 | "카테고리명" |
| 그리드 헤드 col 0 | "선택" |
| 그리드 헤드 col 1 | "NO" |
| 그리드 헤드 col 2 | "상태" |
| 그리드 헤드 col 3 | "코드명" |
| 그리드 헤드 col 4 | "코드 ID" |
| 그리드 헤드 col 5 | "카테고리 ID" |
| 그리드 헤드 col 6 | "카테고리 명" |
| 그리드 헤드 col 7 | "정렬" |
