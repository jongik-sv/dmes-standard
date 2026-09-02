---
screenId: masterRuleList
asIsId: MasterRuleList
moduleId: mcm
moduleGroup: cmb
pageName: masterRuleList
pageId: masterRuleList
serviceId: masterRuleList
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 목록조회 (masterRuleList) 디자인설계서

> 본 문서는 [분석리포트](./masterRuleList_분석리포트.md) 의 UI 컴포넌트 표 (§3) 를 디자인 관점으로 재구성한다. 분석리포트의 §3 (컴포넌트) / §4 (버튼) / §10 (메시지) 가 단일 원천.

---

## §1. 화면 개요 + 레이아웃

### §1.1 메타

| 항목 | 값 |
|---|---|
| 화면 ID | masterRuleList |
| 화면명 | 업무기준 목록조회 |
| 화면 크기 | 1280 × 670 (As-Is xfdl:3) |
| 상단 제목 | 업무기준 목록조회 |
| 페이지 구성 | 헤더(50px) → 조회조건(43px) → 접기버튼(15px) → 메인 그리드 + 우측메뉴 → 하단 상태바(20px) |
| 전체 패딩 (좌/우) | 20px |
| 전체 패딩 (하단) | 40px (그리드 영역 bottom) |

### §1.2 레이아웃 (ASCII 모형 — As-Is xfdl 좌표 기반)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────┐                       ┌─ 상단 메뉴 (조회/저장)─┐ │ A-001 헤더 (top=0, h=50)
│ │ 업무기준 목록조회 │ (edt_title readonly)  │ [조회] [저장]           │ │
│ └──────────────────┘                       └─────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ [업무기준 ID] [ USD ]   [업무기준명] [        USD        ]                │ A-002 조회조건 (top=50, h=43)
├────────────────────────────────────────────────────────────────────────┤
│             ━━━━━━━━━━━━━ btn_fold ━━━━━━━━━━━━━                       │ A-003 접기 (top=div_search:0, h=15)
├────────────────────────────────────────────────────────────────────────┤
│                                       [행추가][행삭제][엑셀다운]          │ C-003 우측 메뉴 (top=0, h=20)
│ ┌──┬──┬─────┬──────┬────┬──┬──┬───┬────┬────┬────┐                    │ A-004 그리드 (top=25)
│ │구분│순번│업무기준ID│업무기준명│설명│사용│Ver│담당│시작 │수정자│수정일│        │
│ ├──┼──┼─────┼──────┼────┼──┼──┼───┼────┼────┼────┤                    │
│ │ ◉│ 1│ USD ... │      │    │ Y│ 1│   │... │... │... │                    │
│ │ ◉│ 2│         │      │    │  │  │   │    │    │    │                    │
│ └──┴──┴─────┴──────┴────┴──┴──┴───┴────┴────┴────┘                    │
├────────────────────────────────────────────────────────────────────────┤
│ 상태바: "{n}건 조회 되었습니다." ...                                       │ A-005 하단 (bottom=0, h=20)
└────────────────────────────────────────────────────────────────────────┘
```

비고:
- 그리드는 `autofittype="col"` 로 가용 폭 자동 분배. col 폭(xfdl:37~47): 20/30/60/160/80/50/50/60/60/60/60 = 690px 기본.
- 우측 메뉴 (`div_rightMenu`) 폭 300px / 높이 20px / 우상단 정렬 (xfdl:82).
- 상단 메뉴 (`div_topMenu`) 폭 290px / 높이 23px / 우상단 + bottom=10 (xfdl:10).
- 조회조건 1 줄 (업무기준 ID + 업무기준명 2 입력). masterCategoryMng 의 4 입력(2 줄)보다 단순.

---

## §2. 영역 구성

| 영역 ID | 영역명 | xfdl id | URL/include | 폭/높이 | 위치 |
|---|---|---|---|---|---|
| A-001 | 헤더 | div_title | (내장) | full-width, h=50 | top=0, left=20, right=20 |
| A-001-1 | 제목 라벨 | div_title.edt_title | (없음) | w=140, h=25 | left=0, bottom=10 |
| A-001-2 | 상단 메뉴 | div_title.div_topMenu | _com_div::commonTopButton.xfdl | w=290, h=23 | right=0, bottom=10 |
| A-002 | 조회조건 | div_search | (내장, cssclass=div_WFSA_Box) | full-width, h=43 | top=div_title:0, left=20, right=20 |
| A-003 | 접기 토글 | btn_fold | (cssclass=btn_WFSA_Fold) | h=15 | top=div_search:0, left=20, right=20 |
| A-004 | 메인 (그리드 영역) | div_main | (내장) | full-width, bottom=40 | top=btn_fold:5, left=20, right=20 |
| A-004-1 | 메인 그리드 | div_main.grd_Main | binddataset=ds_grdMain | autofitcol, h=auto | top=25, left=0, right=0, bottom=0 |
| A-004-2 | 우측 메뉴 | div_main.div_rightMenu | _com_div::commonRightButton.xfdl | w=300, h=20 | top=0, right=0 |
| A-005 | 하단 상태바 | div_bottom | _com_div::commonBottomStatus.xfdl | full-width, h=20 | bottom=0, left=0, right=0 |

---

## §3. 조회조건

### §3.1 컴포넌트 배치 (한 줄)

| 순 | 컴포넌트 | 라벨 | width | 좌표 (left/top) | 비고 |
|---:|---|---|---:|---|---|
| 1 | stc_ruleId (Static) | 업무기준 ID | 80 | left=10, top=10 | cssclass=stc_WFSA_Label |
| 2 | edt_ruleId (Edit) | (값) | 100 | left=stc_ruleId:10, top=10 | normal / value="USD" (As-Is 보존) |
| 3 | stc_ruleNm (Static) | 업무기준명 | 80 | left=edt_ruleId:20, top=10 | cssclass=stc_WFSA_Label |
| 4 | edt_ruleNm (Edit) | (값) | 260 | left=stc_ruleNm:10, top=10 | normal / value="USD" (As-Is 보존) / onkeydown 선언(본문 부재 Q-008) |

### §3.2 입력 검증

| 입력 | maxlength | inputmode | 기본값 | 검증 (UI) |
|---|---:|---|---|---|
| edt_ruleId | 0 (무제한) | normal | USD | 없음 (서버 LIKE 자동) |
| edt_ruleNm | 0 | normal | USD | 없음 |

비고: 2 Edit 모두 As-Is text="USD" 보존 (사용자 결정). masterCategoryMng 의 upper/alpha·hangul imemode 와 달리 본 화면 2 Edit 는 inputmode 명시 없음(normal) — As-Is 그대로.

---

## §4. 그리드 (G-001)

### §4.1 그리드 메타

| 항목 | 값 |
|---|---|
| 그리드 ID | grd_Main |
| binddataset | ds_grdMain (12 컬럼: RULE_ID, OLD_RULE_ID, RULE_NM, RULE_DESC, RULE_VER, RULE_TP, RULE_OWNER_DEPT_NM, RULE_OWNER_EMP_NO, USE_TP, CREATION_TIMESTAMP, LAST_UPDATED_OBJECT_ID, LAST_UPDATE_TIMESTAMP — 모두 STRING(256)) |
| autofittype | col |
| selecttype | multiarea |
| cellmovingtype | col |
| cellsizingtype | col |
| head 행 높이 | 25 |
| body 행 높이 | 25 |
| 헤드 클릭 이벤트 | div_main_grd_Main_onheadclick (정렬 위임만 — CHK 전체선택 없음) |

### §4.2 컬럼 전수 (11 cols)

| col | head text | 폭 (px) | bind | displaytype | edittype | editinputtype | 편집 | format |
|---:|---|---:|---|---|---|---|---|---|
| 0 | 구분 | 20 | STATUS | imagecontrol | (기본) | - | N | Nexacro auto row state — To-Be FE 동일 구현 (사용자 결정) |
| 1 | 순번 | 30 | (expr:currow+1) | normal | (기본) | - | N | 1부터 일련 |
| 2 | 업무기준ID | 60 | RULE_ID | 신규행=editcontrol / else normal | 신규행=text / else none | - | 신규행만 | 텍스트 |
| 3 | 업무기준명 | 160 | RULE_NM | 신규행=editcontrol / else normal | 신규행=text / else none | - | 신규행만 | 텍스트 (좌측 정렬) |
| 4 | 설명 | 80 | RULE_DESC | 신규행=editcontrol / else normal | 신규행=text / else none | - | 신규행만 | 텍스트 (좌측 정렬) |
| 5 | 사용여부 | 50 | USE_TP | normal | none | - | N | Y/N |
| 6 | Version | 50 | RULE_VER | (기본) | (기본) | number | N | 숫자 |
| 7 | 담당자 | 60 | RULE_OWNER_EMP_NO | (기본) | (기본) | - | N | 텍스트 |
| 8 | 시작일자 | 60 | CREATION_TIMESTAMP | (기본) | (기본) | - | N | datetime yyyy-MM-dd HH:mm:ss / null=빈표시 |
| 9 | 최종수정자 | 60 | LAST_UPDATED_OBJECT_ID | (기본) | (기본) | - | N | 텍스트 |
| 10 | 최종수정일 | 60 | LAST_UPDATE_TIMESTAMP | (기본) | (기본) | - | N | datetime yyyy-MM-dd HH:mm:ss / null=빈표시 |

### §4.3 셀 cssclass 조건부

- 본 화면은 masterCategoryMng 의 CHK==1 → 빨간 배경 cssclass 조건부 바인딩이 **없음** (CHK 컬럼 부재). 셀 조건부 cssclass ✗.
- 신규행 편집 가능 컬럼(col 2~4)은 `displaytype/edittype` expr 로 ROWTYPE_INSERT 판별 (xfdl:69~71).

### §4.4 dataset 컬럼 / Grid col 매핑 정합

| Grid col | Grid bind | ds_grdMain ColumnInfo (xfdl:90~105) | 정합 |
|---:|---|---|---|
| 0 | STATUS | ✗ 미선언 (Nexacro auto row state) | ○ — To-Be FE 동일 구현 |
| 1 | (expr) | - | OK (계산식 / 컬럼 미선언) |
| 2 | RULE_ID | ✓ | OK |
| 3 | RULE_NM | ✓ | OK |
| 4 | RULE_DESC | ✓ | OK |
| 5 | USE_TP | ✓ | OK |
| 6 | RULE_VER | ✓ | OK |
| 7 | RULE_OWNER_EMP_NO | ✓ | OK |
| 8 | CREATION_TIMESTAMP | ✓ | OK |
| 9 | LAST_UPDATED_OBJECT_ID | ✓ | OK |
| 10 | LAST_UPDATE_TIMESTAMP | ✓ | OK |
| (미표시) | OLD_RULE_ID | ✓ | OK (WHERE 필터 전용 — 그리드 미표시) |
| (미표시) | RULE_TP | ✓ | OK (rowAdd='A' / INSERT — 그리드 미표시) |
| (미표시) | RULE_OWNER_DEPT_NM | ✓ | OK (SELECT 반환 — 그리드/INSERT 미사용) |

---

## §5. 버튼

### §5.1 상단 메뉴

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-001 | (조회 — commonTop 표준) | (commonTopButton 표준) | div_topMenu | fn_search → action=search |
| B-002 | (저장 — commonTop 표준) | (commonTopButton 표준) | div_topMenu | fn_save → 변경여부+필수 검증 → confirm → action=save |

### §5.2 우측 메뉴

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-003 | (행추가 — commonRight 표준) | (commonRightButton 표준) | div_rightMenu | fn_rowAdd |
| B-004 | (행삭제 — commonRight 표준) | 〃 | 〃 | fn_rowDelete (신규행만) |
| B-005 | (엑셀다운 — commonRight 표준) | 〃 | 〃 | fn_excelDown |

### §5.3 본문 버튼

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-006 | (접기/펴기 화살표 — text="") | btn_WFSA_Fold | top=div_search:0, left=20, right=20, h=15 | btn_fold_onclick → div_search 접기/펴기 |

### §5.4 버튼 활성/비활성

| 버튼 | 활성 조건 | 비활성 조건 |
|---|---|---|
| B-001 조회 | 항상 | - |
| B-002 저장 | 항상 (검증은 클릭 시 수행) | - |
| B-003 행추가 | 항상 | - |
| B-004 행삭제 | 신규행 선택 시 의미 있음 (기존행 선택 시 경고 MSG-004) | - |
| B-005 엑셀다운 | 항상 | - |
| B-006 fold | 항상 | - |

---

## §6. 팝업

본 화면은 호출 팝업 없음 (분석리포트 §5).

---

## §7. 메시지 표기

### §7.1 검증 메시지

| MSG-NNN | 화면 표시 텍스트 (As-Is 보존) | 유형 |
|---|---|---|
| MSG-001 | "변경된 데이터가 없습니다." | error |
| MSG-002 | "[업무기준ID] 를 입력해 주시기 바랍니다." | warning |
| MSG-003 | "저장 하시겠습니까?" | confirm |
| MSG-004 | "행추가로 추가한 데이터만 삭제가 가능합니다." | alert |
| MSG-005 | "[{RULE_ID}] 동일한 업무기준ID가 존재합니다." | error (UserException) |

### §7.2 상태바 메시지 (하단 div_bottom)

| MSG-NNN | 화면 표시 텍스트 |
|---|---|
| MSG-010 | "{n}건 조회 되었습니다." (n = ds_GetRuleMasterList 행수) |
| MSG-011 | "{n}건 저장 되었습니다." (n = cnt_save = 전체 행수) |
| MSG-012 | (오류 시) strErrorMsg 그대로 |

### §7.3 라벨 / 헤드 텍스트 (As-Is 보존)

| 위치 | 텍스트 |
|---|---|
| 상단 제목 (edt_title) | "업무기준 목록조회" |
| 조회조건 라벨 1 (stc_ruleId) | "업무기준 ID" |
| 조회조건 라벨 2 (stc_ruleNm) | "업무기준명" |
| 그리드 헤드 col 0 | "구분" |
| 그리드 헤드 col 1 | "순번" |
| 그리드 헤드 col 2 | "업무기준ID" |
| 그리드 헤드 col 3 | "업무기준명" |
| 그리드 헤드 col 4 | "설명" |
| 그리드 헤드 col 5 | "사용여부" |
| 그리드 헤드 col 6 | "Version" |
| 그리드 헤드 col 7 | "담당자" |
| 그리드 헤드 col 8 | "시작일자" |
| 그리드 헤드 col 9 | "최종수정자" |
| 그리드 헤드 col 10 | "최종수정일" |
