---
screenId: masterRuleListPop
asIsId: MasterRuleListPop
moduleId: mcm
moduleGroup: cmb
pageName: masterRuleListPop
pageId: masterRuleListPop
serviceId: masterRuleListPop
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 List조회 (masterRuleListPop) 디자인설계서

> 본 문서는 [분석리포트](./masterRuleListPop_분석리포트.md) 의 UI 컴포넌트 표 (§3) 를 디자인 관점으로 재구성한다. 분석리포트의 §3 (컴포넌트) / §4 (버튼) / §10 (코드값) 가 단일 원천.

---

## §1. 화면 개요 + 레이아웃

### §1.1 메타

| 항목 | 값 |
|---|---|
| 화면 ID | masterRuleListPop |
| 화면명 | 업무기준 List조회 |
| 화면 크기 | 480 × 740 (As-Is xfdl:3) |
| 상단 제목 | 업무기준List조회 |
| 페이지 성격 | 팝업 (세로형 — 폭 480 / 높이 740) |
| 페이지 구성 | 헤더(50px) → 조회조건(43px) → 접기버튼(15px) → 메인 그리드 → 하단 상태바(20px) |
| 전체 패딩 (좌/우) | 20px |
| 전체 패딩 (하단) | 35px (그리드 영역 bottom) |

### §1.2 레이아웃 (ASCII 모형 — As-Is xfdl 좌표 기반)

```
┌──────────────────────────────────────────────┐
│ ┌──────────────┐        ┌─ 상단 메뉴 ───────┐ │ A-001 헤더 (top=0, h=50)
│ │ 업무기준List조회 │       │ [조회][확인][닫기] │ │  (edt_title readonly, w=130)
│ └──────────────┘        └──────────────────┘ │
├──────────────────────────────────────────────┤
│ [업무기준ID][         ]  [업무기준명][        ] │ A-002 조회조건 (top=50, h=43)
├──────────────────────────────────────────────┤
│ ━━━━━━━━━━━━━ btn_fold ━━━━━━━━━━━━━━        │ A-003 접기 (top=93, h=15)
├──────────────────────────────────────────────┤
│ ┌────┬─────────────┬───────────────────────┐ │ A-004 그리드 (top=btn_fold:5)
│ │ NO │ 업무기준 ID  │ 업무기준 명            │ │
│ ├────┼─────────────┼───────────────────────┤ │
│ │ 1  │             │                       │ │ ← 더블클릭 → 선택 반환
│ │ 2  │             │                       │ │
│ └────┴─────────────┴───────────────────────┘ │
├──────────────────────────────────────────────┤
│ 상태바: "{n}건 조회 되었습니다." ...            │ A-005 하단 (bottom=0, h=20)
└──────────────────────────────────────────────┘
```

비고:
- 그리드는 `autofittype="col"` 로 가용 폭 자동 분배. col 폭(xfdl:13~17): 30 / 100 / 220 = 350px 기본.
- 상단 메뉴 (`div_topMenu`) 폭 290px / 높이 23px / 우상단 + bottom=10 (xfdl:42).
- masterCategoryMng 와 달리 우측 메뉴(div_rightMenu) 없음 — 그리드 단독.

---

## §2. 영역 구성

| 영역 ID | 영역명 | xfdl id | URL/include | 폭/높이 | 위치 |
|---|---|---|---|---|---|
| A-001 | 헤더 | div_title | (내장) | full-width, h=50 | top=0, left=20, right=20 |
| A-001-1 | 제목 라벨 | div_title.edt_title | (없음) | w=130, h=30 | left=0, bottom=10 |
| A-001-2 | 상단 메뉴 | div_title.div_topMenu | _com_div::commonTopButton.xfdl | w=290, h=23 | right=0, bottom=10 |
| A-002 | 조회조건 | div_search | (cssclass=div_WFSA_Box) | full-width, h=43 | top=50, left=20, right=20 |
| A-003 | 접기 토글 | btn_fold | (cssclass=btn_WFSA_Fold) | h=15 | top=93, left=20, right=20 |
| A-004 | 메인 (그리드 영역) | div_main | (내장) | full-width, bottom=35 | top=btn_fold:5, left=20, right=20 |
| A-004-1 | 메인 그리드 | div_main.grd_main | binddataset=ds_grdMain | autofitcol, h=auto | top=0, left=0, right=0, bottom=0 |
| A-005 | 하단 상태바 | div_bottom | _com_div::commonBottomStatus.xfdl | full-width, h=20 | bottom=0, left=0, right=0 |

---

## §3. 조회조건

### §3.1 컴포넌트 배치 (한 줄)

| 순 | 컴포넌트 | 라벨 | width | 좌표 (left/top) | 비고 |
|---:|---|---|---:|---|---|
| 1 | stc_ruleId (Static) | 업무기준ID | 80 | left=0, top=10 | cssclass=stc_WFSA_Label, textAlign=center |
| 2 | edt_ruleId (Edit) | (값) | 80 | left=stc_ruleId:10, top=10 | inputmode=upper / value="결함 코드"(As-Is 잔재 → To-Be 빈 값) |
| 3 | stc_ruleNm (Static) | 업무기준명 | 80 | left=edt_ruleId:10, top=10 | cssclass=stc_WFSA_Label, textAlign=center |
| 4 | edt_ruleNm (Edit) | (값) | 162 | left=stc_ruleNm:10, top=10 | inputmode 미지정 / value="결함 코드"(As-Is 잔재 → To-Be 빈 값) |

### §3.2 입력 검증

| 입력 | maxlength | inputmode | imemode | 기본값 (As-Is) | 검증 (UI) |
|---|---:|---|---|---|---|
| edt_ruleId | (미지정) | upper | (미지정) | "결함 코드" → To-Be 빈 값 | 없음 (서버 LIKE 자동) |
| edt_ruleNm | (미지정) | (미지정) | (미지정) | "결함 코드" → To-Be 빈 값 | 없음 |

비고: 2 Edit 모두 As-Is text="결함 코드" 잔재 — **To-Be 빈 값 정정** (화면 도메인 불일치 — 사용자 결정 / 분석리포트 §12).

---

## §4. 그리드 (G-001)

### §4.1 그리드 메타

| 항목 | 값 |
|---|---|
| 그리드 ID | grd_main |
| binddataset | ds_grdMain (ColumnInfo 미선언 — 서버 응답 9 컬럼 동적 바인딩, 표시 2 컬럼) |
| autofittype | col |
| selecttype | cell |
| cellmovingtype | col |
| cellsizingtype | col |
| head 높이 | 26 |
| body 높이 | 26 |
| 헤드 클릭 이벤트 | div_main_grd_main_onheadclick (정렬) |
| 셀 더블클릭 이벤트 | div_main_grd_main_oncelldblclick (선택 반환) |

### §4.2 컬럼 전수 (3 cols)

| col | head text | 폭 (px) | bind | displaytype | editmaxlength | editinputmode | editimemode | 편집 | format |
|---:|---|---:|---|---|---:|---|---|---|---|
| 0 | NO | 30 | (expr:currow+1) | normal | - | - | - | N | 1부터 일련 |
| 1 | 업무기준 ID | 100 | RULE_ID | normal | 50 | upper | alpha | N (To-Be 읽기 전용) | 영문 대문자 |
| 2 | 업무기준 명 | 220 | RULE_NM | normal | 180 | - | hangul | N (To-Be 읽기 전용) | 한글 |

비고: col1/col2 의 editmaxlength/editimemode/editinputmode 는 As-Is xfdl 잔재(편집 핸들러 ✗). 본 화면은 조회/선택 전용이므로 **To-Be 읽기 전용 표시** (사용자 결정).

### §4.3 셀 cssclass 조건부

**해당 없음** — masterCategoryMng 의 CHK 빨간 배경 강조 없음 (선택 컬럼 자체 없음). 행 선택은 더블클릭/확인으로 처리 (xfdl:143~158).

### §4.4 dataset 컬럼 / Grid col 매핑 정합

| Grid col | Grid bind | ds_grdMain ColumnInfo | 정합 |
|---:|---|---|---|
| 0 | (expr:currow+1) | - | OK (계산식 / 컬럼 미선언) |
| 1 | RULE_ID | (미선언 — 서버 ds_GetRuleMasterList.RULE_ID 동적) | ○ |
| 2 | RULE_NM | (미선언 — 서버 ds_GetRuleMasterList.RULE_NM 동적) | ○ |

비고: ds_grdMain 은 `<Dataset id="ds_grdMain"/>` (xfdl:65) 빈 선언 — 서버 응답 9 컬럼이 런타임 자동 생성. 표시는 RULE_ID / RULE_NM 2 종. (분석리포트 §3.3)

---

## §5. 버튼

### §5.1 상단 메뉴

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-001 | 조회 | (commonTopButton 표준) | div_topMenu | fn_search → action=search |
| B-002 | 확인 | (commonTopButton 표준) | div_topMenu | fn_confirm → rowposition 행 선택 반환 |
| B-003 | 닫기 | (commonTopButton 표준) | div_topMenu | fn_close → 팝업 닫기 |

### §5.2 우측 메뉴

**해당 없음** — 본 화면 우측 메뉴(div_rightMenu) 부재 (조회 전용 팝업).

### §5.3 본문 버튼

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-004 | (접기/펴기 화살표) | btn_WFSA_Fold | top=93, left=20, right=20, h=15 | btn_fold_onclick → div_search 접기/펴기 |

### §5.4 버튼 활성/비활성

| 버튼 | 활성 조건 | 비활성 조건 |
|---|---|---|
| B-001 조회 | 항상 | - |
| B-002 확인 | 항상 (행 미선택 시 rowposition 기준 — As-Is 별도 가드 없음) | - |
| B-003 닫기 | 항상 | - |
| B-004 fold | 항상 | - |

---

## §6. 팝업

본 화면은 호출 팝업 없음 (분석리포트 §5.1). 본 화면 자체가 룩업 팝업이며 더블클릭(GB-002)/확인(B-002) 으로 부모에 {sRuleId, sRuleNm} 반환 (분석리포트 §5.2).

---

## §7. 메시지 표기

### §7.1 검증 메시지 (warning)

**해당 없음** — 조회 전용 팝업으로 입력 검증 메시지 부재.

### §7.2 상태바 메시지 (하단 div_bottom)

| MSG-NNN | 화면 표시 텍스트 |
|---|---|
| MSG-001 | "{n}건 조회 되었습니다." (n = ds_GetRuleMasterList 건수) |
| MSG-002 | (오류 시) strErrorMsg 그대로 |

### §7.3 라벨 / 헤드 텍스트 (As-Is 보존)

| 위치 | 텍스트 |
|---|---|
| 상단 제목 (edt_title) | "업무기준List조회" |
| 조회조건 라벨 1 | "업무기준ID" |
| 조회조건 라벨 2 | "업무기준명" |
| 그리드 헤드 col 0 | "NO" |
| 그리드 헤드 col 1 | "업무기준 ID" |
| 그리드 헤드 col 2 | "업무기준 명" |

### §7.4 정정 대상 (As-Is 잔재)

| 위치 | As-Is | To-Be |
|---|---|---|
| edt_ruleId.value | "결함 코드" | (빈 값) — 화면 도메인 불일치 잔재 정정 (사용자 결정) |
| edt_ruleNm.value | "결함 코드" | (빈 값) — 동일 |
