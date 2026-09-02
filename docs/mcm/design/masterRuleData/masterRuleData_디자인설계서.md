---
screenId: masterRuleData
asIsId: MasterRuleData
moduleId: mcm
moduleGroup: cmb
pageName: masterRuleData
pageId: masterRuleData
serviceId: masterRuleData
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 Data관리 (masterRuleData) 디자인설계서

> 본 문서는 [분석리포트](./masterRuleData_분석리포트.md) 의 UI 컴포넌트 표(§3) / 버튼(§4) / 메시지(기능 §10) 를 디자인 관점으로 재구성한다. 분석리포트 §3 / §4 가 단일 원천.

---

## §1. 화면 개요 + 레이아웃

### §1.1 메타

| 항목 | 값 |
|---|---|
| 화면 ID | masterRuleData |
| 화면명 | 업무기준 Data관리 |
| 화면 크기 | 1280 × 670 (As-Is xfdl:3) |
| 상단 제목 | 업무기준 Data관리 |
| 페이지 구성 | 헤더(50px) → 조회조건(68px, 2줄) → 접기버튼(15px) → 메인 그리드 + 우측메뉴 + 페이징 → 하단 상태바(20px) |
| 전체 패딩 (좌/우) | 20px |
| 전체 패딩 (하단) | 40px (그리드 영역 bottom) |

### §1.2 레이아웃 (ASCII 모형 — As-Is xfdl 좌표 기반)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────┐                          ┌─ 상단 메뉴 (조회/저장) ─┐        │ A-001 헤더 (top=0, h=50)
│ │ 업무기준 Data관리 │ (edt_title readonly)   │ [조회] [저장]            │        │
│ └──────────────┘                          └──────────────────────────┘        │
├────────────────────────────────────────────────────────────────────────────┤
│ [업무기준 ID][ USD ] [업무기준명][   USD   ] [업무기준]          [☑긴급적용]  │ A-002 조회조건 1줄 (top=10)
│ [조건1▾][연산자▾][KR/A] [조건2▾][연산자▾][ ] [조건3▾][연산자▾][ ] [조건4▾]..[조건5▾].. │ A-002 2줄 (top=37, h=68)
├────────────────────────────────────────────────────────────────────────────┤
│              ━━━━━━━━━━━━━ btn_fold ━━━━━━━━━━━━━                           │ A-003 접기 (h=15)
├────────────────────────────────────────────────────────────────────────────┤
│                                  [행추가][행복사][행삭제][행취소][엑셀업][엑셀다운] │ C-002 우측메뉴 (top=0, h=21)
│ ┌──┬────┬────┬──────────── 동적 컬럼 (ds_lovData 기반) ───────────┐         │ A-004 그리드 (top=25)
│ │☑ │순번│상태│ *COLA │ COLB │ COLC(DATE) │ ... (PK= * / IN=red/OUT=blue) │         │
│ ├──┼────┼────┼────────┼──────┼────────────┼ ... ┤                          │
│ │☑ │ 1  │ ●  │        │      │ 2026-06-04 │     │ ←─ 빨간 배경 (CHK=1)       │
│ └──┴────┴────┴────────┴──────┴────────────┴─────┘                          │
│ [◀ ◀ 1 2 3 ... ▶ ▶]  (페이징)                                              │ C-003 페이징 (bottom=0, h=21)
├────────────────────────────────────────────────────────────────────────────┤
│ 상태바: "{n}건 조회 되었습니다." ...                                           │ A-005 하단 (bottom=0, h=20)
└────────────────────────────────────────────────────────────────────────────┘
   (grd_Download = visible=false 숨김 / Button00 Export = top=-78 화면밖 숨김)
```

비고:
- 조회조건(div_search) 2줄 구성 — 1줄: 업무기준 ID/명 + 업무기준 버튼 + 긴급적용 / 2줄: 5조건(컬럼+연산자+값) 가로 배열 (xfdl:22~167).
- 그리드 컬럼 폭은 동적 — 정적 3컬럼(30/30/30, xfdl:179~181) + 동적 N컬럼(13×COL_NM.length, xfdl:609).
- 우측 메뉴(div_rightMenu) 폭 500px / 높이 21px (xfdl:201). 페이징(div_paging) 하단 full-width (xfdl:202).

---

## §2. 영역 구성 (분석 §3.1 / §3.5)

| 영역 ID | 영역명 | xfdl id | URL/include | 폭/높이 | 위치 |
|---|---|---|---|---|---|
| A-001 | 헤더 | div_title | (내장) | full-width, h=50 | top=0, left=20, right=20 |
| C-005 | 제목 라벨 | div_title.edt_title | (없음) | w=150, h=25 | left=0, bottom=10 |
| C-001 | 상단 메뉴 | div_title.div_topMenu | _com_div::commonTopButton.xfdl | w=290, h=23 | right=0, bottom=10 |
| A-002 | 조회조건 | div_search | (내장, cssclass=div_WFSA_Box) | full-width, h=68 | top=div_title:0, left=20, right=20 |
| A-003 | 접기 토글 | btn_fold | (cssclass=btn_WFSA_Fold) | h=15 | top=div_search:0, left=20, right=20 |
| A-004 | 메인 (그리드 영역) | div_main | (내장) | full-width, bottom=40 | top=btn_fold:5, left=20, right=20 |
| A-004-1 | 메인 그리드 | div_main.grd_main | binddataset=ds_grdMain | top=25, h=auto | left=0, right=0, bottom=30 |
| C-002 | 우측 메뉴 | div_main.div_rightMenu | _com_div::commonRightButton.xfdl | w=500, h=21 | top=0, right=0 |
| C-003 | 페이징 | div_main.div_paging | _com_div::commonPagingButton.xfdl | full-width, h=21 | left=0, bottom=0, right=0 |
| C-006 | Export 버튼(숨김) | div_main.Button00 | (cssclass=btn_WF_ExcelExport) | w=75, h=20 | top=-78 (화면 밖) |
| C-007 | 다운로드 그리드(숨김) | div_main.grd_Download | binddataset=ds_grdDownload | visible=false | top=400 |
| A-005 | 하단 상태바 | div_bottom | _com_div::commonBottomStatus.xfdl | full-width, h=20 | bottom=0, left=0, right=0 |

---

## §3. 조회조건

### §3.1 컴포넌트 배치 (분석 §3.2 — 2줄)

#### 1줄 (top=10)

| 순 | 컴포넌트 | 라벨 | width | 좌표 (left/top) | 비고 |
|---:|---|---|---:|---|---|
| 1 | stc_ruleId (Static) | 업무기준 ID | 80 | left=10, top=10 | cssclass=stc_WFSA_LabelE |
| 2 | edt_ruleId (Edit) | (값) | 100 | left=stc_ruleId:10, top=10 | readonly / Essential / value="USD" (As-Is 보존, Q-002) |
| 3 | stc_ruleNm (Static) | 업무기준명 | 80 | left=edt_ruleId:20, top=10 | cssclass=stc_WFSA_Label |
| 4 | edt_ruleNm (Edit) | (값) | 260 | left=stc_ruleNm:10, top=10 | readonly / value="USD" (As-Is 보존, Q-002) |
| 5 | btn_ruleId (Button) | 업무기준 | 69 | left=edt_ruleNm:10, top=10 | cssclass=btn_WF_Point → P-001 |
| 6 | chk_option (CheckBox) | 긴급적용 | 100 | right=10, top=6 | 저장 시 DynamicSqlExecutor 분기 |

#### 2줄 (top=37) — 5조건 (각: 컬럼콤보 + 연산자콤보 + 값에디트)

| 조건 | 컬럼콤보 | 연산자콤보 | 값에디트 | 초기값 |
|---|---|---|---|---|
| 1 | cbo_lov1 (w=100, innerdataset=ds_lov1) | cbo_operator1 (w=50, LIKE/=/<=/>=) | edt_val1 (w=60) | edt_val1="KR/A" (As-Is, Q-002) |
| 2 | cbo_lov2 (w=100, ds_lov2) | cbo_operator2 (w=50) | edt_val2 (w=60) | - |
| 3 | cbo_lov3 (w=100, ds_lov3) | cbo_operator3 (w=50) | edt_val3 (w=60) | - |
| 4 | cbo_lov4 (w=100, ds_lov4) | cbo_operator4 (w=50) | edt_val4 (w=60) | - |
| 5 | cbo_lov5 (w=100, ds_lov5) | cbo_operator5 (w=50) | edt_val5 (w=60) | - |

### §3.2 입력 검증

| 입력 | readonly | 콤보 index 초기 | 검증 (UI) |
|---|---|---|---|
| edt_ruleId | true (필수, 팝업으로만) | - | 조회 시 빈값이면 차단 (MSG-001) |
| edt_ruleNm | true | - | - |
| cbo_lovN (컬럼) | - | -1 (조건N 표시) | lov 콜백 후 index=0 ("조건N") |
| cbo_operatorN (연산자) | - | 0 (LIKE) | - |
| edt_valN (값) | - | - | 없음 (서버 동적 WHERE) |

비고: edt_ruleId/edt_ruleNm="USD", edt_val1="KR/A" 모두 As-Is 초기값 보존 (Q-002 확인 위임).

---

## §4. 그리드 (G-001) — ★동적 컬럼

### §4.1 그리드 메타

| 항목 | 값 |
|---|---|
| 그리드 ID | grd_main |
| binddataset | ds_grdMain (선언 컬럼: TOTALCOUNT 1개 — CHK/SEQ/STATUS/동적 컬럼은 런타임 addColumn) |
| cellmovingtype / cellsizingtype | col / col |
| selecttype | multiarea |
| autosizebandtype / autosizingtype | allband / col |
| head/body 높이 | 25 / 25 |
| 헤드 클릭 이벤트 | div_main_grd_main_onheadclick (전체선택 + 정렬) |

### §4.2 정적 컬럼 (초기 Format — 3 cols)

| col | head text | 폭 (px) | bind | displaytype | edittype | 편집 |
|---:|---|---:|---|---|---|---|
| 0 | (head checkbox, mainChk) | 30 | CHK | checkboxcontrol | checkbox | Y |
| 1 | 순번 | 30 | SEQ | normal | - | N |
| 2 | 상태 | 30 | STATUS | imagecontrol(body) | - | N |

### §4.3 동적 컬럼 (col 3~N — 런타임 빌드, 분석 §3.3)

| 속성 | 규칙 | 근거 |
|---|---|---|
| 생성 수 | ds_lovData.rowcount (컬럼정의 개수) | xfdl:595 |
| bind | `bind:` + ds_lovData[i].COL_ID | xfdl:611 |
| head text | PK_YN=="Y" → ` * `+COL_NM / 그외 COL_NM | xfdl:607 |
| head cssclass | IO_FLAG=="IN" → cellHead_BgColor_red / 그외 cellHead_BgColor_blue | xfdl:608 |
| body edittype | "text" (전 컬럼 편집) | xfdl:614 |
| 폭 | 13 × COL_NM.length + autosizecol="limitmin" | xfdl:609~610 |
| DATE 타입 | calendardateformat="yyyy-MM-dd" / calendardisplaynulltype="nulltext" / calendardisplayinvalidtype="none" | xfdl:604~606 |
| body cssclass | CHK=='1' → cellBody_BgColor_red | xfdl:616 |

### §4.4 셀 cssclass 조건부

정적 3컬럼 + 동적 N컬럼 공통:
```
cssclass="expr:dataset.getColumn(currow, &quot;CHK&quot;) == &quot;1&quot; ? &quot;cellBody_BgColor_red&quot; : &quot;&quot;"
```
- CHK=1 행 전체 빨간 배경. 근거: xfdl:193~195 (정적), xfdl:616 (동적).

### §4.5 dataset 컬럼 / Grid col 매핑 정합

| Grid col | bind | ds_grdMain ColumnInfo | 정합 |
|---:|---|---|---|
| 0 | CHK | ✗ 선언 (런타임 addColumn "CHK") | ○ (xfdl:593) |
| 1 | SEQ | ✗ (SQL ROW_NUMBER 반환) | ○ |
| 2 | STATUS | ✗ (Nexacro auto row state) | ○ — To-Be FE 동일 (Q-003) |
| 3~N | COL_ID (동적) | ✗ 선언 (런타임 addColumn) | ○ (xfdl:597) |
| (TOTALCOUNT) | - | ✓ 선언 (xfdl:231) | 페이징 총건수 |

---

## §5. 버튼

### §5.1 상단 메뉴

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-001 | 조회 | (commonTopButton 표준) | div_topMenu | fn_search → action=search |
| B-002 | 저장 | (commonTopButton 표준) | div_topMenu | fn_save → PK검증 + 긴급confirm → action=save |

### §5.2 우측 메뉴

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-003 | 행추가 | (commonRightButton 표준) | div_rightMenu | fn_rowAdd |
| B-004 | 행복사 | 〃 | 〃 | fn_rowCopy |
| B-005 | 행삭제 | 〃 | 〃 | fn_rowDelete |
| B-006 | 행취소 | 〃 | 〃 | fn_rowCancel |
| B-007 | 엑셀업 | 〃 | 〃 | fn_excelUp → P-002 |
| B-008 | 엑셀다운 | 〃 | 〃 | fn_excelDown → action=search_export |

### §5.3 본문 버튼

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-009 | (접기/펴기 화살표) | btn_WFSA_Fold | top=div_search:0, h=15 | btn_fold_onclick |
| B-010 | 업무기준 | btn_WF_Point | div_search (left=edt_ruleNm:10) | div_search_btn_ruleId_onclick → P-001 |
| B-011 | Export (숨김) | btn_WF_ExcelExport | top=-78 (화면 밖) | (onclick 미지정 — 미사용) |

### §5.4 버튼 활성/비활성

| 버튼 | 활성 조건 | 비활성 조건 |
|---|---|---|
| B-001 조회 | 항상 (업무기준 미선택 시 클릭 → MSG-001) | - |
| B-002 저장 | 항상 (검증은 클릭 시) | - |
| B-003~B-006 | 항상 | - |
| B-007 엑셀업 / B-008 엑셀다운 | edt_ruleId 값 있을 때 (없으면 즉시 return) | 업무기준 미선택 |
| B-009 fold / B-010 업무기준 | 항상 | - |

비고: B-007/B-008 은 `gfn_isNull(edt_ruleId.value)` 면 즉시 return (xfdl:700, 718).

---

## §6. 팝업 (분석 §5.1)

| P-NNN | 호출 대상 | 트리거 | 인자 |
|---|---|---|---|
| P-001 | cmb::MasterRuleListPop.xfdl (업무기준 선택) | B-010 업무기준 버튼 | `{ sSchema : "MCA_SOURCE" }` |
| P-002 | cmb::MasterRuleDataUploadFilePopup.xfdl (엑셀 업로드) | B-007 엑셀업 | `{ sRuleId, sRuleNm }` |

비고: P-001 콜백 → fn_lov() → fn_search() 자동 연쇄.

---

## §7. 메시지 표기

### §7.1 검증 / confirm 메시지

| MSG-NNN | 화면 표시 텍스트 (As-Is 보존) | 유형 |
|---|---|---|
| MSG-001 | "업무기준 ID는 필수입니다." | warning |
| MSG-002 | "{COL_NM} 항목은 필수 입력사항 입니다." | warning |
| MSG-003 | "선택된 행이 없습니다." | warning |
| MSG-004 | "긴급으로 적용하시겠습니까?\n추후에 반드시 Mapper파일 적용하십시오." | confirm |

### §7.2 상태바 메시지 (하단 div_bottom)

| MSG-NNN | 화면 표시 텍스트 |
|---|---|
| MSG-010 | "{n}건 조회 되었습니다." (n = ds_GetMasterRuleData 행수) |
| MSG-011 | "{n}건 저장 되었습니다." (n = cnt_save) |
| MSG-012 | "{n}건 Export 되었습니다." (n = ds_GetMasterRuleDataExport 행수) |
| MSG-013 | (오류 시) strErrorMsg 그대로 |

### §7.3 라벨 / 헤드 텍스트 (As-Is 보존)

| 위치 | 텍스트 |
|---|---|
| 상단 제목 (edt_title) | "업무기준 Data관리" |
| 조회조건 라벨 1 | "업무기준 ID" |
| 조회조건 라벨 2 | "업무기준명" |
| 업무기준 버튼 | "업무기준" |
| 긴급적용 체크박스 | "긴급적용" |
| 조건 콤보 기본 | "조건1" ~ "조건5" |
| 연산자 콤보 항목 | "LIKE" / "=" / "<=" / ">=" |
| 그리드 헤드 col 0 | (체크박스) |
| 그리드 헤드 col 1 | "순번" |
| 그리드 헤드 col 2 | "상태" |
| 그리드 헤드 col 3~N | (동적 — COL_NM, PK 는 ` * ` prefix) |
