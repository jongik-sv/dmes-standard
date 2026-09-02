---
screenId: masterRuleDataList
asIsId: MasterRuleDataList
moduleId: mcm
moduleGroup: cmb
pageName: masterRuleDataList
pageId: masterRuleDataList
serviceId: masterRuleDataList
작성일: 2026-06-05
작성자: Agent
---

# 업무기준 상세조회 (masterRuleDataList) 디자인설계서

> 본 문서는 [분석리포트](./masterRuleDataList_분석리포트.md) 의 UI 컴포넌트 표(§3) / 버튼(§4) / 메시지(기능 §10) 를 디자인 관점으로 재구성한다. 분석리포트 §3 / §4 가 단일 원천.

---

## §1. 화면 개요 + 레이아웃

### §1.1 메타

| 항목 | 값 |
|---|---|
| 화면 ID | masterRuleDataList |
| 화면명 | 업무기준 상세조회 |
| 화면 크기 | 1280 × 670 (As-Is xfdl:3) |
| 상단 제목 | 업무기준 상세조회 |
| 페이지 구성 | 헤더(50px) → 조회조건(68px, 2줄) → 접기버튼(15px) → 메인 그리드 + 우측메뉴 + 페이징 → 하단 상태바(20px) |
| 전체 패딩 (좌/우) | 20px |
| 전체 패딩 (하단) | 40px (그리드 영역 bottom) |

### §1.2 레이아웃 (ASCII 모형 — As-Is xfdl 좌표 기반)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────┐                          ┌─ 상단 메뉴 (조회) ─┐             │ A-001 헤더 (top=0, h=50)
│ │ 업무기준 상세조회 │ (edt_title readonly)   │ [조회]               │             │
│ └──────────────┘                          └──────────────────────┘             │
├────────────────────────────────────────────────────────────────────────────┤
│ [업무기준 ID][ USD ] [업무기준명][   USD   ] [업무기준]                      │ A-002 조회조건 1줄 (top=10)
│ [조건1▾][연산자▾][ ] [조건2▾][연산자▾][ ] [조건3▾][연산자▾][ ] [조건4▾].. [조건5▾].. │ A-002 2줄 (top=37, h=68)
├────────────────────────────────────────────────────────────────────────────┤
│              ━━━━━━━━━━━━━ btn_fold ━━━━━━━━━━━━━                           │ A-003 접기 (h=15)
├────────────────────────────────────────────────────────────────────────────┤
│                                                            [엑셀다운]          │ C-002 우측메뉴 (top=0, h=20)
│ ┌────┬──────────── 동적 컬럼 (ds_lovData 기반, 읽기 전용) ───────────┐       │ A-004 그리드 (top=25)
│ │순번│ COLA │ COLB │ COLC(DATE) │ [코드컬럼(파란밑줄,클릭→P-002)] │ ... │       │
│ ├────┼──────┼──────┼────────────┼──────────────────────────────────┤       │
│ │ 1  │      │      │ 2026-06-05 │ <u>CODE_VAL</u>                  │       │       │
│ └────┴──────┴──────┴────────────┴──────────────────────────────────┘       │
│ [◀ ◀ 1 2 3 ... ▶ ▶]  (페이징)                                              │ C-003 페이징 (bottom=0, h=21)
├────────────────────────────────────────────────────────────────────────────┤
│ 상태바: "{n}건 조회 되었습니다." ...                                           │ A-005 하단 (bottom=0, h=20)
└────────────────────────────────────────────────────────────────────────────┘
   (grd_Download = visible=false 숨김)
```

비고:
- 조회조건(div_search) 2줄 구성 — 1줄: 업무기준 ID/명 + 업무기준 버튼 / 2줄: 5조건(컬럼+연산자+값) 가로 배열 (xfdl:22~166). **masterRuleData 와 달리 긴급적용 체크박스 없음.**
- 그리드 컬럼 폭은 동적 — 정적 1컬럼(순번 30, xfdl:178) + 동적 N컬럼(13×COL_NM.length, xfdl:459).
- 우측 메뉴(div_rightMenu) 폭 300px / 높이 20px (xfdl:193) — 엑셀다운 1버튼. 페이징(div_paging) 하단 full-width (xfdl:194).
- 마스터코드 컬럼 셀은 파란 글자 + 밑줄 + 포인터 커서로 클릭 가능함을 시각 표시 (xfdl:463~466).

---

## §2. 영역 구성 (분석 §3.1 / §3.5)

| 영역 ID | 영역명 | xfdl id | URL/include | 폭/높이 | 위치 |
|---|---|---|---|---|---|
| A-001 | 헤더 | div_title | (내장) | full-width, h=50 | top=0, left=20, right=20 |
| C-005 | 제목 라벨 | div_title.edt_title | (없음) | w=140, h=25 | left=0, bottom=10 |
| C-001 | 상단 메뉴 | div_title.div_topMenu | _com_div::commonTopButton.xfdl | w=290, h=23 | right=0, bottom=10 |
| A-002 | 조회조건 | div_search | (내장, cssclass=div_WFSA_Box) | full-width, h=68 | top=div_title:0, left=20, right=20 |
| A-003 | 접기 토글 | btn_fold | (cssclass=btn_WFSA_Fold) | h=15 | top=div_search:0, left=20, right=20 |
| A-004 | 메인 (그리드 영역) | div_main | (내장) | full-width, bottom=40 | top=btn_fold:5, left=20, right=20 |
| A-004-1 | 메인 그리드 | div_main.grdMain | binddataset=ds_grdMain | top=25, h=auto | left=0, right=0, bottom=30 |
| C-002 | 우측 메뉴 | div_main.div_rightMenu | _com_div::commonRightButton.xfdl | w=300, h=20 | top=0, right=0 |
| C-003 | 페이징 | div_main.div_paging | _com_div::commonPagingButton.xfdl | full-width, h=21 | left=0, bottom=0, right=0 |
| C-006 | 다운로드 그리드(숨김) | div_main.grd_Download | binddataset=ds_grdDownload | visible=false | top=400 |
| A-005 | 하단 상태바 | div_bottom | _com_div::commonBottomStatus.xfdl | full-width, h=20 | bottom=0, left=0, right=0 |

---

## §3. 조회조건

### §3.1 컴포넌트 배치 (분석 §3.2 — 2줄)

#### 1줄 (top=10)

| 순 | 컴포넌트 | 라벨 | width | 좌표 (left/top) | 비고 |
|---:|---|---|---:|---|---|
| 1 | stc_ruleId (Static) | 업무기준 ID | 80 | left=10, top=10 | cssclass=stc_WFSA_LabelE |
| 2 | edt_ruleId (Edit) | (값) | 100 | left=stc_ruleId:10, top=10 | readonly / Essential / text="USD" (As-Is 보존, Q-002) |
| 3 | stc_ruleNm (Static) | 업무기준명 | 80 | left=edt_ruleId:20, top=10 | cssclass=stc_WFSA_Label |
| 4 | edt_ruleNm (Edit) | (값) | 260 | left=stc_ruleNm:10, top=10 | readonly / text="USD" (As-Is 보존, Q-002) |
| 5 | btn_ruleId (Button) | 업무기준 | 69 | left=edt_ruleNm:10, top=10 | cssclass=btn_WF_Point → P-001 |

비고: masterRuleData 1줄에 있던 긴급적용(chk_option) 체크박스가 본 화면엔 없음.

#### 2줄 (top=37) — 5조건 (각: 컬럼콤보 + 연산자콤보 + 값에디트)

| 조건 | 컬럼콤보 | 연산자콤보 | 값에디트 | 초기값 |
|---|---|---|---|---|
| 1 | cbo_lov1 (w=100, innerdataset=ds_lov1) | cbo_operator1 (w=50, LIKE/=/<=/>=) | edt_val1 (w=60) | - |
| 2 | cbo_lov2 (w=100, ds_lov2) | cbo_operator2 (w=50) | edt_val2 (w=60) | - |
| 3 | cbo_lov3 (w=100, ds_lov3) | cbo_operator3 (w=50) | edt_val3 (w=60) | - |
| 4 | cbo_lov4 (w=100, ds_lov4) | cbo_operator4 (w=50) | edt_val4 (w=60) | - |
| 5 | cbo_lov5 (w=100, ds_lov5) | cbo_operator5 (w=50) | edt_val5 (w=60) | - |

비고: masterRuleData 와 달리 edt_val1 초기값("KR/A")이 없음 — 본 화면 edt_val1 은 빈 값(xfdl:54).

### §3.2 입력 검증

| 입력 | readonly | 콤보 index 초기 | 검증 (UI) |
|---|---|---|---|
| edt_ruleId | true (필수, 팝업으로만) | - | 조회 시 빈값이면 차단 (MSG-001) |
| edt_ruleNm | true | - | - |
| cbo_lovN (컬럼) | - | -1 (조건N 표시) | lov 콜백 후 index=0 ("조건N") |
| cbo_operatorN (연산자) | - | 0 (LIKE) | - |
| edt_valN (값) | - | - | 없음 (서버 동적 WHERE) |

비고: edt_ruleId/edt_ruleNm="USD" As-Is 초기값 보존 (Q-002 확정 — 가족 선례).

---

## §4. 그리드 (G-001) — ★동적 컬럼·읽기 전용

### §4.1 그리드 메타

| 항목 | 값 |
|---|---|
| 그리드 ID | grdMain |
| binddataset | ds_grdMain (선언 컬럼: RULE_ID/OLD_RULE_ID/RULE_NM/.../LAST_UPDATE_TIMESTAMP 12개 — 동적 업무기준 컬럼은 런타임 appendContentsCol) |
| cellmovingtype / cellsizingtype | col / col |
| selecttype | multiarea |
| autosizingtype | col |
| head/body 높이 | 25 / 25 |
| 셀 클릭 이벤트 | div_main_grdMain_oncellclick (마스터코드 셀 → P-002) |
| 헤드 클릭 이벤트 | div_main_grdMain_onheadclick (정렬) |

### §4.2 정적 컬럼 (초기 Format — 1 col)

| col | head text | 폭 (px) | bind | displaytype | edittype | 편집 |
|---:|---|---:|---|---|---|---|
| 0 | 순번 | 30 | SEQ | normal | - | N |

비고: masterRuleData(CHK/SEQ/STATUS 3컬럼) 대비 본 화면은 순번(SEQ) 1컬럼만 정적 — CHK/STATUS 없음(조회 전용).

### §4.3 동적 컬럼 (col 1~N — 런타임 빌드, 분석 §3.3)

| 속성 | 규칙 | 근거 |
|---|---|---|
| 생성 수 | ds_lovData.rowcount (컬럼정의 개수) | xfdl:451 |
| bind | `bind:` + ds_lovData[i].COL_ID | xfdl:461 |
| head text | COL_NM (그대로 — PK ` * ` prefix 없음) | xfdl:458 |
| body edittype | (미지정 — 읽기 전용) | xfdl:451~466 |
| 폭 | 13 × COL_NM.length + autosizecol="limitmin" | xfdl:459~460 |
| DATE 타입 | calendardateformat="yyyy-MM-dd" / calendardisplaynulltype="nulltext" / calendardisplayinvalidtype="none" | xfdl:455~457 |
| 마스터코드(CODE_YN="Y") | cssclass="cellBody_fontColor_blue, cellBody_underline" + cursor="pointer" | xfdl:463~466 |

비고: masterRuleData 의 head cssclass(IN/OUT 색)·body edittype("text")·CHK cssclass 가 없다. 본 화면 고유 = CODE_YN 파란 밑줄·포인터.

### §4.4 셀 cssclass 조건부

- 마스터코드 컬럼만 조건부 cssclass: `CODE_YN=="Y"` → `cellBody_fontColor_blue, cellBody_underline` + `cursor="pointer"`. 근거: xfdl:463~466.
- masterRuleData 의 CHK=1 빨간 배경 cssclass 는 본 화면에 없음(체크박스 부재).

### §4.5 dataset 컬럼 / Grid col 매핑 정합

| Grid col | bind | ds_grdMain ColumnInfo | 정합 |
|---:|---|---|---|
| 0 | SEQ | ✗ 선언 (SQL ROW_NUMBER 반환) | ○ |
| 1~N | COL_ID (동적) | ✗ 선언 (런타임 appendContentsCol) | ○ (xfdl:453, 461) |
| (RULE_ID 외 11) | - | ✓ 선언 (xfdl:223~234) | 마스터 성격 컬럼 잔존 (As-Is 보존) |

---

## §5. 버튼

### §5.1 상단 메뉴

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-001 | 조회 | (commonTopButton 표준) | div_topMenu | fn_search → action=search |

비고: 상단 기본버튼 = `["btn_search"]` 단 1종 (xfdl:352) — masterRuleData 의 저장(btn_save) 없음.

### §5.2 우측 메뉴

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-002 | 엑셀다운 | (commonRightButton 표준) | div_rightMenu | fn_excelDown → action=search_export |

비고: 우측 기본버튼 = `["btn_excelDown"]` 단 1종 (xfdl:355) — masterRuleData 의 행추가/복사/삭제/취소/엑셀업 없음.

### §5.3 본문 버튼

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-003 | (접기/펴기 화살표) | btn_WFSA_Fold | top=div_search:0, h=15 | btn_fold_onclick |
| B-004 | 업무기준 | btn_WF_Point | div_search (left=edt_ruleNm:10) | div_search_btn_ruleId_onclick → P-001 |

### §5.4 버튼 활성/비활성

| 버튼 | 활성 조건 | 비활성 조건 |
|---|---|---|
| B-001 조회 | 항상 (업무기준 미선택 시 클릭 → MSG-001) | - |
| B-002 엑셀다운 | edt_ruleId 값 있을 때 (없으면 즉시 return) | 업무기준 미선택 |
| B-003 fold / B-004 업무기준 | 항상 | - |

비고: B-002 는 `gfn_isNull(edt_ruleId.value)` 면 즉시 return (xfdl:427).

---

## §6. 팝업 (분석 §5.1)

| P-NNN | 호출 대상 | 트리거 | 인자 |
|---|---|---|---|
| P-001 | cmb::MasterRuleListPop.xfdl (업무기준 선택) | B-004 업무기준 버튼 | `{ sSchema : "MCAAPUSER" }` |
| P-002 | cma::MasterCodeSelPop.xfdl (마스터코드 조회) | GB-001 마스터코드 셀 클릭 (CODE_YN="Y") | `{ sCodeId, sCodeNm, sCodeVal }` |

비고: P-001 콜백 → fn_lov() → fn_search() 자동 연쇄. P-002 콜백 본문 미정의(no-op).

---

## §7. 메시지 표기

### §7.1 검증 / confirm 메시지

| MSG-NNN | 화면 표시 텍스트 (As-Is 보존) | 유형 |
|---|---|---|
| MSG-001 | "업무기준 ID는 필수입니다." | warning |

### §7.2 상태바 메시지 (하단 div_bottom)

| MSG-NNN | 화면 표시 텍스트 |
|---|---|
| MSG-010 | "{n}건 조회 되었습니다." (n = ds_GetMasterRuleDataList 행수) |
| MSG-011 | "{n}건 Export 되었습니다." (n = ds_GetMasterRuleDataListExport 행수) |
| MSG-012 | (오류 시) strErrorMsg 그대로 |

### §7.3 라벨 / 헤드 텍스트 (As-Is 보존)

| 위치 | 텍스트 |
|---|---|
| 상단 제목 (edt_title) | "업무기준 상세조회" |
| 조회조건 라벨 1 | "업무기준 ID" |
| 조회조건 라벨 2 | "업무기준명" |
| 업무기준 버튼 | "업무기준" |
| 조건 콤보 기본 | "조건1" ~ "조건5" |
| 연산자 콤보 항목 | "LIKE" / "=" / "<=" / ">=" |
| 그리드 헤드 col 0 | "순번" |
| 그리드 헤드 col 1~N | (동적 — COL_NM) |

---

## §8. As-Is 화면 캡처 대조

- **As-Is 캡처 미제공**: `docs/mcm/screen_image/` 에 `cmb__MasterRuleDataList.png` 부재 (확인 2026-06-05). 동일 폴더에 형제 화면 캡처(`cmb__MasterRuleData.png` / `cmb__MasterRuleList.png` 등)는 있으나 본 화면 직접 대조 자산 아님.
- 따라서 본 디자인설계서는 **xfdl 단독 검증** 기반 와이어프레임이다 (designer/캡처 3자 대조 미수행 — 14항 §6 폴백). 캡처 확보 시 §8 에 대조표 보강.
- 동적 컬럼 그리드(col 1~N = 선택 업무기준의 COL_NM)는 As-Is xfdl(`search_col` 빌드)·형제 masterRuleData §3.3 와 동일 패턴으로 설계.
