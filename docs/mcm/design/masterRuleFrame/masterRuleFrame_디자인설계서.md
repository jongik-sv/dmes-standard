---
screenId: masterRuleFrame
asIsId: MasterRuleFrame
moduleId: mcm
moduleGroup: cmb
pageName: masterRuleFrame
pageId: masterRuleFrame
serviceId: masterRuleFrame
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 구조관리 (masterRuleFrame) 디자인설계서

> 본 문서는 [분석리포트](./masterRuleFrame_분석리포트.md) 의 UI 컴포넌트 표 (§3) 를 디자인 관점으로 재구성한다. 분석리포트의 §3 (컴포넌트) / §4 (버튼) / §5 (팝업) / §10 (LoV) 가 단일 원천.

---

## §1. 화면 개요 + 레이아웃

### §1.1 메타

| 항목 | 값 |
|---|---|
| 화면 ID | masterRuleFrame |
| 화면명 | 업무기준 구조관리 |
| 화면 크기 | 1280 × 670 (As-Is xfdl:3) |
| 상단 제목 | 업무기준 구조관리 |
| 페이지 구성 | 헤더(50px) → 조회조건(43px) → 접기버튼(15px) → 메인 (좌 IN 그리드 + 우 OUT 그리드) → 하단 상태바(20px) |
| 전체 패딩 (좌/우) | 20px |
| 전체 패딩 (하단) | 30px (메인 영역 bottom) |

### §1.2 레이아웃 (ASCII 모형 — As-Is xfdl 좌표 기반)

```
┌────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────┐                        ┌─ 상단 메뉴 (조회/저장)─┐  │ A-001 헤더 (top=0, h=50)
│ │ 업무기준 구조관리 │ (edt_title readonly)   │ [조회] [저장]           │  │
│ └──────────────────┘                        └─────────────────────────┘  │
├────────────────────────────────────────────────────────────────────────┤
│ [업무기준 ID][        ] [업무기준명][              ] [업무기준][기초데이터등록]│ A-002 조회조건 (h=43)
├────────────────────────────────────────────────────────────────────────┤
│             ━━━━━━━━━━━━━ btn_fold ━━━━━━━━━━━━━                       │ A-003 접기 (h=15)
├──────────────────────────────────┬─────────────────────────────────────┤
│ 조건항목 수 [  ] (IN)  [행추가][행삭제]│ 결과항목 수 [  ] (OUT) [행추가][행삭제]│ C-004/C-005 + B-005~B-008
│ ┌──┬─────┬─────┬────┬──────────┐ │ ┌──┬─────┬─────┬────┬──────────┐ │ A-004 (좌 50% IN / 우 OUT)
│ │순번│한글 │영문 │코드│ 사용여부  │ │ │순번│한글 │영문 │코드│ 사용여부  │ │
│ │  │항목명│항목명│여부│유형|길이|소수│ │ │  │항목명│항목명│여부│유형|길이|소수│ │
│ ├──┼─────┼─────┼────┼──┬───┬──┤ │ ├──┼─────┼─────┼────┼──┬───┬──┤ │
│ │ 1│     │     │ N/Y│  │   │  │ │ │ 1│     │     │선택│  │   │  │ │
│ └──┴─────┴─────┴────┴──┴───┴──┘ │ └──┴─────┴─────┴────┴──┴───┴──┘ │
│   grd_in (ds_grdIn)              │   grd_out (ds_grdOut)               │
├──────────────────────────────────┴─────────────────────────────────────┤
│ 상태바: "{n}건 조회 되었습니다." ...                                       │ A-005 하단 (h=20)
└────────────────────────────────────────────────────────────────────────┘
```

비고:
- 메인 영역은 좌(div_in, width=50%) / 우(div_out, left=50.81%) 2 분할. 각 영역에 그리드 1개 + 항목 수 표시 + 행추가/행삭제 버튼 2개 (xfdl:41~138).
- 두 그리드 모두 `autofittype="col"` 로 가용 폭 자동 분배. col 폭(xfdl:50~57): 30/127/135/63/88/69/72 = 584px 기본.
- 상단 메뉴 (`div_topMenu`) 폭 290px / 높이 23px / 우상단 + bottom=10 (xfdl:10).

---

## §2. 영역 구성

| 영역 ID | 영역명 | xfdl id | URL/include | 폭/높이 | 위치 |
|---|---|---|---|---|---|
| A-001 | 헤더 | div_title | (내장) | full-width, h=50 | top=0, left=20, right=20 |
| A-001-1 | 제목 라벨 | div_title.edt_title | (없음) | w=140, h=25 | left=0, bottom=10 |
| A-001-2 | 상단 메뉴 | div_title.div_topMenu | _com_div::commonTopButton.xfdl | w=290, h=23 | right=0, bottom=10 |
| A-002 | 조회조건 | div_search.div_search1 | (내장, cssclass=div_WFSA_Box) | full-width, h=43 | top=div_title:0, left=20, right=20 |
| A-003 | 접기 토글 | btn_fold | (cssclass=btn_WFSA_Fold) | h=15 | top=div_search:0, left=20, right=20 |
| A-004 | 메인 (그리드 영역) | div_main | (내장) | full-width, bottom=30 | top=btn_fold:5, left=20, right=20 |
| A-004-1 | 좌측 IN 영역 | div_main.div_in | (내장) | w=50% | top=0, left=0, bottom=0 |
| A-004-1-G | IN 그리드 | div_in.grd_in | binddataset=ds_grdIn | autofitcol | top=25, left=0, right=0, bottom=0 |
| A-004-2 | 우측 OUT 영역 | div_main.div_out | (내장) | left=50.81% | top=0, right=0, bottom=0 |
| A-004-2-G | OUT 그리드 | div_out.grd_out | binddataset=ds_grdOut | autofitcol | top=25, left=0, right=0, bottom=0 |
| A-005 | 하단 상태바 | div_bottom | _com_div::commonBottomStatus.xfdl | full-width, h=20 | bottom=0, left=0, right=0 |

---

## §3. 조회조건

### §3.1 컴포넌트 배치 (한 줄 — div_search1)

| 순 | 컴포넌트 | 라벨 | width | 좌표 (left/top) | 비고 |
|---:|---|---|---:|---|---|
| 1 | edt_stc_ruleId (Edit 라벨) | 업무기준 ID | 80 | left=10, top=10 | cssclass=edi_WFSA_Label / readonly |
| 2 | edt_ruleId (Edit) | (값) | 100 | left=edt_stc_ruleId:10, top=10 | readonly / maxlength=30 / inputtype=normal (P-001 콜백 설정) |
| 3 | edt_stc_ruleNm (Edit 라벨) | 업무기준명 | 80 | left=edt_ruleId:20, top=10 | cssclass=edi_WFSA_Label / readonly |
| 4 | edt_ruleNm (Edit) | (값) | 260 | left=edt_stc_ruleNm:10, top=10 | readonly / maxlength=30 (P-001 콜백 설정) |
| 5 | btn_ruleIdPop (Button) | 업무기준 | 66 | left=edt_ruleNm:5, top=10 | cssclass=btn_WF_Point → P-001 |
| 6 | btn_ruleCol (Button) | 기초데이터등록 | 94 | left=btn_ruleIdPop:10, top=10 | cssclass=btn_WF_Point → P-002 |

### §3.2 입력 검증

| 입력 | maxlength | readonly | 기본값 | 검증 (UI) |
|---|---:|---|---|---|
| edt_ruleId | 30 | true | (없음) | 직접 입력 ✗ (P-001 콜백 설정) |
| edt_ruleNm | 30 | true | (없음) | 직접 입력 ✗ (P-001 콜백 설정) |

비고: 두 Edit 모두 readonly — 업무기준 팝업(P-001) 선택으로만 값 설정 (분석리포트 §3.2).

---

## §4. 그리드 (G-001 IN / G-002 OUT)

### §4.1 그리드 메타

| 항목 | G-001 (IN) | G-002 (OUT) |
|---|---|---|
| 그리드 ID | grd_in | grd_out |
| binddataset | ds_grdIn (12 컬럼, 모두 STRING(256)) | ds_grdOut (12 컬럼, 모두 STRING(256)) |
| autofittype | col | col |
| selecttype | multiarea | multiarea |
| cellmovingtype / cellsizingtype | col / col | col / col |
| autosizingtype | none | none |
| head 구조 | 2행 병합 (col 0~3 rowspan=2 / col 4~6 "사용여부" colspan=3) | 동일 |
| body 행 높이 | 25 | 25 |
| 헤드 클릭 이벤트 | (없음 — onheadclick 미바인딩) | (없음) |

### §4.2 컬럼 전수 (7 cols — IN/OUT 동일)

| col | head text | 폭 (px) | bind | displaytype | edittype | editmaxlength | combo dataset | mask | 편집 |
|---:|---|---:|---|---|---|---:|---|---|---|
| 0 | 순번 | 30 | (expr:currow+1) | (default) | - | - | - | - | N |
| 1 | 한글항목명 | 127 | COL_NM | text | text | 100 | - | - | Y |
| 2 | 영문항목명 | 135 | COL_ID | text | text | 30 | - | - | Y |
| 3 | 코드여부 | 63 | MASTER_CODE_DIV | combocontrol | combo | - | ds_div (N/Y) | - | Y |
| 4 | 유형 ("사용여부") | 88 | COL_TYPE | combocontrol | combo | - | ds_colType (DATE/NUMBER/VARCHAR2) | - | Y |
| 5 | 총길이 ("사용여부") | 69 | COL_LEN | mask | mask | 5 | - | ##,##9 (integer) | Y |
| 6 | 소수점길이 ("사용여부") | 72 | COL_PREC_LEN | mask | mask | 5 | - | ##,##9 (integer) | Y |

비고:
- col 폭 (xfdl:50~57 / 99~106) 은 IN/OUT 동일 (30/127/135/63/88/69/72).
- OUT col 3 (코드여부) 콤보에만 `combodisplaynulltext="선택" combodisplaynulltype="nulltext"` (null 시 "선택" 표시, xfdl:126). IN 은 미지정 (xfdl:77).
- head 2행 병합: col 4~6 상위 헤더 "사용여부" (colspan=3) + 하위 (유형/총길이/소수점길이) — As-Is 라벨 보존.

### §4.3 head 병합 구조 (As-Is xfdl:63~72 / 112~121)

```
┌──────┬──────────┬──────────┬──────┬──────────────────────────┐
│ 순번 │ 한글항목명│ 영문항목명│코드여부│         사용여부          │  ← band head row0
│(span2│ (span2)  │ (span2)  │(span2)├────────┬────────┬────────┤
│      │          │          │      │  유형   │ 총길이  │소수점길이│  ← band head row1
└──────┴──────────┴──────────┴──────┴────────┴────────┴────────┘
```

### §4.4 dataset 컬럼 / Grid col 매핑 정합 (ds_grdIn / ds_grdOut 12 컬럼 — xfdl:146~177)

| Grid col | Grid bind | Dataset ColumnInfo | 정합 |
|---:|---|---|---|
| 0 | (expr) | - | OK (계산식) |
| 1 | COL_NM | ✓ | OK |
| 2 | COL_ID | ✓ | OK |
| 3 | MASTER_CODE_DIV | ✓ | OK |
| 4 | COL_TYPE | ✓ | OK |
| 5 | COL_LEN | ✓ | OK |
| 6 | COL_PREC_LEN | ✓ | OK |
| (hidden) | RULE_ID / COL_SEQ / MES_COL_ID / IO_FLAG / OLD_COL_ID / RULE_VER | ✓ (6 컬럼 미표시) | OK |

---

## §5. 버튼

### §5.1 상단 메뉴

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-001 | 조회 | (commonTopButton 표준) | div_topMenu | fn_search → action=search |
| B-002 | 저장 | (commonTopButton 표준) | div_topMenu | fn_save → 검증 (IN 5 + OUT 5) → action=save |

### §5.2 조회조건 영역 버튼

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-003 | 업무기준 | btn_WF_Point | div_search1 (right of edt_ruleNm) | P-001 MasterRuleListPop |
| B-004 | 기초데이터등록 | btn_WF_Point | div_search1 (right of btn_ruleIdPop) | P-002 MasterRuleFrameColListPopup (선행 ruleId 가드) |

### §5.3 그리드 영역 버튼 (IN/OUT 각 2)

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-005 | 행추가 | btn_WF_RowAdd | div_in 우상단 (right=btn_rowDelete:4) | ds_grdIn.addRow() |
| B-006 | 행삭제 | btn_WF_RowAdd | div_in 우상단 (right=0) | ds_grdIn.deleteRow() |
| B-007 | 행추가 | btn_WF_RowAdd | div_out 우상단 (right=btn_rowDelete:4) | ds_grdOut.addRow() |
| B-008 | 행삭제 | btn_WF_RowAdd | div_out 우상단 (right=0) | ds_grdOut.deleteRow() |

### §5.4 본문 버튼

| B-NNN | 라벨 | css | 위치 | 동작 |
|---|---|---|---|---|
| B-009 | (접기/펴기 화살표) | btn_WFSA_Fold | top=div_search:0, left=20, right=20, h=15 | btn_fold_onclick → div_search 접기/펴기 |

### §5.5 버튼 활성/비활성

| 버튼 | 활성 조건 | 비활성 조건 |
|---|---|---|
| B-001 조회 | 항상 | - |
| B-002 저장 | ruleId 선택 시 의미 있음 (null 시 즉시 return) | - |
| B-003 업무기준 | 항상 | - |
| B-004 기초데이터등록 | ruleId 선택 시 (없으면 MSG-006 경고) | - |
| B-005/B-007 행추가 | ruleId 선택 시 (null 시 즉시 return) | - |
| B-006/B-008 행삭제 | 항상 (선택 행 deleteRow) | - |
| B-009 fold | 항상 | - |

---

## §6. 팝업

| P-NNN | 화면 | 트리거 | 인자 | 결과 |
|---|---|---|---|---|
| P-001 | MasterRuleListPop (업무기준 선택) | B-003 | { sSchema: "MCA_SOURCE" } | edt_ruleId/edt_ruleNm 설정 + fn_search |
| P-002 | MasterRuleFrameColListPopup (업무기준 컬럼 등록) | B-004 | { sRuleId, sRuleNm } | fn_search 재조회 |

상세는 분석리포트 §5.1 / 기능설계서 §9.1.

---

## §7. 빈 상태 / 로딩 / 에러 표시

| 상태 | 표시 |
|---|---|
| 업무기준 미선택 | 그리드 빈 상태 (조회 미발생) / 행추가·저장 차단 |
| 조회 0건 | 그리드 빈 행 + 상태바 "0건 조회 되었습니다." |
| 로딩 | (공통 gfn_transaction 로딩 인디케이터 — 공통 라이브러리) |
| 에러 | 상태바 strErrorMsg 표시 (MSG-012) |

---

## §8. 반응형 규칙

- 메인 영역 좌/우 50% 고정 분할 (div_in width=50% / div_out left=50.81%). 폭 변동 시 그리드 autofittype=col 로 컬럼 자동 분배.
- 조회조건/메인/상태바 모두 left=20/right=20 또는 0~0 full-width — 가로 리사이즈 대응.

---

## §9. 아이콘

- 별도 상태 이미지/아이콘 컬럼 없음 (masterCategoryMng 의 STATUS imagecontrol 같은 컬럼 부재).
- 콤보 셀 (코드여부/유형) 은 표준 드롭다운 인디케이터.

---

## §10. 스크린샷 / 와이어프레임 참조

- As-Is 화면 캡처 미제공 (환경 제약 — fail-fast). xfdl 좌표 기반 §1.2 ASCII 모형으로 대체.
- 본 설계는 xfdl 컴포넌트/좌표 (분석리포트 §3) 단독 검증.

### §10.1 라벨 / 헤드 텍스트 (As-Is 보존)

| 위치 | 텍스트 |
|---|---|
| 상단 제목 (edt_title) | "업무기준 구조관리" |
| 조회조건 라벨 1 | "업무기준 ID" |
| 조회조건 라벨 2 | "업무기준명" |
| 버튼 1 | "업무기준" |
| 버튼 2 | "기초데이터등록" |
| IN 항목 수 라벨 | "조건항목 수" |
| OUT 항목 수 라벨 | "결과항목 수" |
| 그리드 헤드 col 0 | "순번" |
| 그리드 헤드 col 1 | "한글항목명" |
| 그리드 헤드 col 2 | "영문항목명" |
| 그리드 헤드 col 3 | "코드여부" |
| 그리드 헤드 상위 병합 | "사용여부" |
| 그리드 헤드 col 4 | "유형" |
| 그리드 헤드 col 5 | "총길이" |
| 그리드 헤드 col 6 | "소수점길이" |
| 행 버튼 | "행추가" / "행삭제" |
