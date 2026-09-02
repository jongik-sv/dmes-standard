---
screenId: masterRuleDataUploadFilePopup
asIsId: MasterRuleDataUploadFilePopup
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-05
작성자: Agent
---

# masterRuleDataUploadFilePopup 디자인설계서

> 단일 원천: `masterRuleDataUploadFilePopup_분석리포트.md`. 본 문서는 xfdl 의 UI 정의를 1:1 보존하면서 To-Be 가 따라야 할 레이아웃·컴포넌트 명세를 기록한다.

## §1. 화면 개요 + 팝업 레이아웃

### 1.1 식별자

| 항목 | 값 |
|---|---|
| 화면 식별자 | masterRuleDataUploadFilePopup |
| As-Is Form ID | MasterRuleDataUploadFilePopup |
| Form titletext | 일반 업무기준 등록(Excel Upload) (xfdl:3) |
| 화면 유형 | modal popup |
| 부모 화면 | masterRuleData (P-001) |

### 1.2 As-Is 전체 치수

| 항목 | 값 | 근거 |
|---|---|---|
| Form width | 620 px | xfdl:3 |
| Form height | 460 px | xfdl:3 |
| Layout (default) width | 620 | xfdl:5 |
| Layout (default) height | 460 | xfdl:5 |
| mobileorientation | landscape | xfdl:5 |

### 1.3 To-Be 권고 치수

| 항목 | 후보 | 비고 |
|---|---|---|
| popup width | 680~860 px | **동적 N 컬럼 그리드** 가독성 (고정 6 컬럼이 아님 — 업무기준별 가변) + 검색 영역 폭 |
| popup height | 480~540 px | 헤더 + 검색 + 그리드 + 푸터 + 메시지 영역 |
| 모달 / 비모달 | modal 유지 | As-Is 동일 |
| reflow | (As-Is `mobileorientation=landscape`) | To-Be FE 반응형 정책 (개발 단계 결정). 컬럼 수가 많으면 가로 스크롤 필요 |

## §2. 영역 구성 (4 Div + 1 fold 버튼)

> xfdl Form 의 직접 자식 = 4 Div + 1 Button (btn_fold). top-down 순서로:

| 순서 | ID | 영역명 | left | top | right | height | 용도 | 근거 |
|---:|---|---|---|---|---|---:|---|---|
| 1 | div_title | 상단 타이틀 + 공용 상단 메뉴 | 20 | 0 | 20 | 50 | titletext + commonTopButton (다운로드/파일선택/등록/닫기 4 버튼) | xfdl:55-67 |
| 2 | div_search | 조회조건 영역 | 20 | 50 | 20 | 43 | 업무기준 + 업무기준명 + 삭제등록 체크박스 (read-only 표시) | xfdl:69-80 |
| 3 | btn_fold | 검색영역 접기 버튼 | 20 | 93 | 20 | 15 | div_search 접기/펴기 | xfdl:6 |
| 4 | div_main | 메인 그리드 영역 (Excel 미리보기 + 숨김 다운로드용) | 20 | btn_fold:5 | 20 | bottom=30 (반응형) | grd_Upload (사용자 가시) + grd_Download (visible=false) | xfdl:7-54 |
| 5 | div_bottom | 하단 상태바 | 0 | (반응형) | 0 | 20 | commonBottomStatus (메시지 표시 영역) | xfdl:68 |

### 2.1 div_title (xfdl:55-67)

| 자식 컴포넌트 | 속성 | 근거 |
|---|---|---|
| Edit edt_title | readonly=true, tabstop=false, value="일반 업무기준 등록(Excel Upload)", text 동일, width=260, height=30, cssclass="edi_WFHD_Title", left=0, bottom=10 | xfdl:58 |
| Div div_topMenu | width=270, height=23, right=0, url="_com_div::commonTopButton.xfdl", bottom=10 — **이 Div 안에 동적으로 다운로드/파일선택/등록/닫기 4 버튼 배치** (`fn_commonTop_onload`) | xfdl:59-64 |

### 2.2 div_search (xfdl:69-80)

cssclass=`div_WFSA_Box` (검색영역 표준 스타일).

| 자식 컴포넌트 | 속성 / 라벨 | 근거 |
|---|---|---|
| Static stc_ruldId | text="업무기준", width=60, height=20, top=10, left=0, cssclass="stc_WFSA_Label", textAlign=center, verticalAlign=middle | xfdl:72 |
| Edit edt_MasterRuleId | top=10, width=80, height=20, left=stc_ruldId:5, **readonly=true**, text="결함 코드" (디자인 시간 기본값 — 실제는 호출자 sRuleId) | xfdl:73 |
| Static stc_ruleNM | text="업무기준명", width=75, height=20, top=10, left=edt_MasterRuleId:10 | xfdl:74 |
| Edit edt_MasterRuleNm | top=10, width=180, height=20, left=stc_ruleNM:5, **readonly=true**, text="결함 코드" (디자인 기본값 — 실제는 호출자 sRuleNm) | xfdl:75 |
| Static stc_flag | text="삭제등록", width=60, height=20, top=10, left=edt_MasterRuleNm:10, textAlign=center | xfdl:76 |
| CheckBox chk_regFlag | text="CheckBox00" (기본 placeholder — 표시 안됨), width=20, height=20, top=10, left=stc_flag:5 | xfdl:77 |

> **레이아웃 흐름** (좌→우): 업무기준 라벨 (60) → edt_MasterRuleId (80) → 업무기준명 라벨 (75) → edt_MasterRuleNm (180) → 삭제등록 라벨 (60) → chk_regFlag (20). 총 폭 ≈ 475 px (간격 포함 ≈ 540 px).

### 2.3 div_main (xfdl:7-54) — 본 화면 핵심 영역

자식 = Grid grd_Upload (가시) + Grid grd_Download (visible=false). **두 그리드 모두 동적 컬럼** (search_col 으로 빌드).

| 항목 | grd_Upload | grd_Download |
|---|---|---|
| binddataset | ds_grdUpload | ds_grdDownload |
| visible | true (기본) | **false** |
| left / top / right / bottom | 0 / 5 / 0 / 0 (= div_main 전체 채움) | 위치만 (top=200, width=200, right=0, bottom=0) |
| cellmovingtype | col | (기본) |
| cellsizingtype | col | (기본) |
| selecttype | multiarea | (기본) |
| autosizingtype | col | col |
| autosizebandtype | allband | allband |
| 정적 Format default | 1 컬럼 (size=80), head 1행 + body 1행 | 1 컬럼 (size=48), head 3행 + body 1행 |

### 2.4 div_bottom (xfdl:68)

| 자식 | url | 비고 |
|---|---|---|
| (commonBottomStatus.xfdl) | _com_div::commonBottomStatus.xfdl | 상태바 메시지 영역 — `gfn_commonBottomStatus_msg(...)` 로 표시 |

## §3. 파일 선택 (gfn_importExcel)

### 3.1 As-Is 동작 (xfdl:188-193)

| 단계 | 동작 |
|---|---|
| 1 | (trigger) 사용자가 btn_fileUpload 클릭 |
| 2 | `this.ds_grdUpload.clear()` (dataset 메타까지 초기화) |
| 3 | `this.gfn_importExcel(this.div_main.form.grd_Upload, "일반업무기준등록(ExcelUpload)", "A5:DZ5", "A6", this.ds_grdUpload, "fn_callImportBack")` |
| 4 | (nexacro 내부) OS 파일 선택 다이얼로그 → Excel 선택 → A5:DZ5 헤더 인식 → A6~ row 적재 → ds_grdUpload push |
| 5 | callback `fn_callImportBack`: 상태바에 "Excel Data {N}건 조회 되었습니다." 표시 |

### 3.2 To-Be Excel parsing — SheetJS (가족 정합)

| 후보 | 장단점 |
|---|---|
| (a) FE SheetJS | 빠른 미리보기 / 동적 컬럼 매칭 / 서버 부하 분산 (권고) |
| (b) BE Apache POI (multipart) | 보안 검증 일원화 / FE 미리보기 불가 → 2 단계 |
| (c) 양쪽 (FE preview + BE validate on save) | 권고 — As-Is UX 유지 + 동적 컬럼 화이트리스트 검증 |

### 3.3 Excel 포맷 명세 — ★동적

| 항목 | 값 |
|---|---|
| 헤더 행 | Excel 5 행 (A5:DZ5) — 1~4 행은 자유 영역 (제목/부제/빈 줄). 데이터는 6 행부터 |
| 컬럼 구성 | **동적** — `search_col`(GetRuleColList) 로 빌드된 ds_RuleColData(COL_ID/COL_NM/COL_TYPE/IO_FLAG) 기준. 업무기준별 컬럼 개수/이름/타입 가변 |
| DATE 컬럼 | COL_TYPE=="DATE" 면 캘린더 포맷 (yyyy-MM-dd), 저장 시 `-` 제거 + 14자 절단 |
| IN/OUT 색 | IO_FLAG=="IN" → red, "OUT" → blue (셀 배경) |

> masterCodeUploadFilePopup(고정 6 컬럼)과 달리 본 화면 Excel 헤더는 선택된 업무기준의 컬럼정의에 따라 동적. To-Be 는 다운로드(B-001) 로 받은 템플릿 Excel 의 헤더 = 업로드 헤더 일치를 권고.

## §4. 미리보기 그리드 (grd_Upload + grd_Download) — ★동적 컬럼

### 4.1 grd_Upload (가시) — 동적 컬럼 빌드 (xfdl:261-273)

| 항목 | 값 |
|---|---|
| 정적 초기 컬럼 | 1 컬럼 (Format default, size=80) — search_col 후 deleteContentsCol 로 제거 (xfdl:273) |
| 동적 컬럼 head | COL_NM (컬럼정의 항목명) — xfdl:269 |
| 동적 컬럼 body | bind:COL_ID — xfdl:270 |
| 셀 배경 | IO_FLAG=="IN" → cellBody_BgColor_red / else cellBody_BgColor_blue — xfdl:271 |
| DATE 컬럼 | calendardateformat="yyyy-MM-dd" / calendardisplaynulltype="nulltext" / calendardisplayinvalidtype="none" — xfdl:266-268 |

### 4.2 grd_Download (숨김) — 동적 컬럼 빌드 (xfdl:276-291)

| 항목 | 값 |
|---|---|
| 정적 초기 컬럼 | 1 컬럼 (Format default, size=48), head 3 row — search_col 후 deleteContentsCol 로 제거 (xfdl:291) |
| head row=0 | IO_FLAG (IN/OUT 표기) — xfdl:285 |
| head row(매핑) | COL_NM (`(i*2)+2`) / COL_ID (`((i*2)+2)+(i+2)`) — 3행 헤더 — xfdl:286-287 |
| 동적 컬럼 body | bind:COL_ID — xfdl:288 |
| 셀 배경 | IO_FLAG=="IN" → red / else blue — xfdl:289 |
| DATE 컬럼 | calendar 포맷 동일 — xfdl:281-283 |
| **용도** | `gfn_exportExcel` source 그리드 (xfdl:249). 3 행 헤더(IN·OUT / 컬럼명 / 컬럼ID)가 그대로 Excel 헤더로 출력 |

### 4.3 To-Be 그리드 권고

- **단일 동적 그리드 권고**: As-Is grd_Upload + grd_Download 분리는 nexacro Format 제약(multi-row header) 때문. To-Be(React 등)는 1 그리드로 통합 + Excel export 시 다운로드용 3-row 헤더 부여 (FE 설계 단계 결정).
- **동적 컬럼 빌드**: ds_RuleColData(컬럼정의)에서 COL_ID/COL_NM/COL_TYPE/IO_FLAG/PK_YN 를 받아 런타임 컬럼 생성. DATE 캘린더·IN/OUT 색·PK 표기 동일 구현 (Q-101).
- **선택 모드**: As-Is `selecttype="multiarea"` — To-Be 유지.

## §5. 버튼 (4 + 1 = 5 버튼)

### 5.1 div_topMenu 동적 4 버튼 (xfdl:145-149)

| 버튼 식별자 | 라벨 | 핸들러 (xfdl) | 표시 순서 (Array 등록 순) |
|---|---|---|---:|
| btn_fileDown | 다운로드 | fn_fileDown | 1 (xfdl:146) |
| btn_fileUpload | 파일선택 | fn_fileUpload | 2 (xfdl:147) |
| btn_fileSave | 등록 | fn_fileSave | 3 (xfdl:148) |
| btn_close | (닫기 — 기본 라벨) | fn_close (commonTopButton 기본) | 4 (xfdl:149) |

> commonTopButton.xfdl 의 `fn_commonTop_onload(this, [사용자 정의 3 버튼], [기본 1 버튼])` 패턴. 사용자 정의 3 개 (다운로드/파일선택/등록) + 기본 1 개 (닫기) = 총 4 개.

### 5.2 div_search 위 본 화면 native 1 버튼

| 버튼 | 위치 | 동작 |
|---|---|---|
| btn_fold | 검색영역 위 (top=93) | 검색영역 (div_search) 접기/펴기 — `gfn_fold(this, div_search, div_main, btn_fold)` |

### 5.3 버튼 시각 디자인 (cssclass 인용)

| 영역 | cssclass | 비고 |
|---|---|---|
| btn_fold | `btn_WFSA_Fold` | 검색영역 표준 fold 버튼 스타일 |
| edt_title | `edi_WFHD_Title` | 헤더 타이틀 표준 |
| 라벨 (stc_ruldId, stc_ruleNM, stc_flag) | `stc_WFSA_Label` | 검색조건 라벨 표준 |
| div_search 본체 | `div_WFSA_Box` | 검색영역 박스 표준 |
| div_bottom | `div_WF_Footer` | 푸터 표준 |
| 그리드 셀 (IN) | `cellBody_BgColor_red` | IO_FLAG=="IN" |
| 그리드 셀 (OUT) | `cellBody_BgColor_blue` | IO_FLAG=="OUT" |

## §6. 메시지 표기 (상태바 + 모달)

### 6.1 상태바 (div_bottom — commonBottomStatus)

| 시점 | 본문 |
|---|---|
| B-002 후 (fn_callImportBack) | "Excel Data {ds_grdUpload.getRowCount()}건 조회 되었습니다." |
| T-003 후 (case "search_col" 성공) | "{strErrorMsg.ds_GetRuleColUploadList}건 조회 되었습니다." |
| B-001 후 (case "search" 성공) | "{strErrorMsg.ds_GetRuleDataUploadList}건 조회 되었습니다." |
| B-001/T-003 후 (실패) | strErrorMsg (서버 메시지) |
| B-003 후 (case "save" 성공) | "{strErrorMsg.cnt_import}건 저장 되었습니다." |
| B-003 후 (case "save" 실패) | strErrorMsg |

### 6.2 모달 메시지 (gfn_message)

| 시점 | 본문 | type |
|---|---|---|
| B-003 후 (case "save" 성공) | "업무기준 등록이 완료되었습니다." | info |

### 6.3 디자인 권고 (To-Be)

- 상태바 메시지 + 모달 메시지 이중 표시는 Excel 일괄 등록 안전성 강조 패턴. To-Be 유지 권고.
- Excel 행 수가 큰 경우 진행 표시 (progress bar) 추가 권고.
- 오류 메시지에 row index 포함 (F-101 기반).
- 동적 컬럼 수가 많으면 그리드 가로 스크롤 + 컬럼 고정(업무기준ID/RULE_SEQ) 권고.

## §7. 컴포넌트 ↔ 분석리포트 ID 매트릭스

| 분석리포트 ID | 디자인 컴포넌트 | xfdl line |
|---|---|---|
| R-001 (div_title) | div_title + edt_title + div_topMenu | xfdl:55-67 |
| R-002 (div_search) | div_search + 6 자식 컴포넌트 | xfdl:69-80 |
| R-003 (btn_fold) | Button btn_fold | xfdl:6 |
| R-004 (div_main) | div_main + grd_Upload + grd_Download | xfdl:7-54 |
| R-005 (div_bottom) | div_bottom (commonBottomStatus) | xfdl:68 |
| S-001 (업무기준) | edt_MasterRuleId + stc_ruldId | xfdl:72-73 |
| S-002 (업무기준명) | edt_MasterRuleNm + stc_ruleNM | xfdl:74-75 |
| S-003 (삭제등록) | chk_regFlag + stc_flag | xfdl:76-77 |
| G-동적 (grd_Upload 동적 컬럼) | grd_Upload (search_col 빌드) | xfdl:10-28 / 261-273 |
| GE-동적 (grd_Download 동적 컬럼, 숨김) | grd_Download (search_col 빌드) | xfdl:29-51 / 276-291 |
| B-001 (다운로드) | div_topMenu 동적 버튼 btn_fileDown | xfdl:146 |
| B-002 (파일선택) | div_topMenu 동적 버튼 btn_fileUpload | xfdl:147 |
| B-003 (등록) | div_topMenu 동적 버튼 btn_fileSave | xfdl:148 |
| B-099 (닫기) | div_topMenu 동적 버튼 btn_close | xfdl:149 |
| T-001 (fold) | btn_fold | xfdl:6 |
| T-002 (chk toggle) | chk_regFlag | xfdl:77 |
| T-003 (자동 컬럼정의) | fn_lov (search_col) → 그리드 동적 컬럼 | xfdl:136 / 154-168 |

---

## §8. As-Is 화면 캡처 대조 (xfdl + 캡처 + 디자인 3자 1:1)

- As-Is 캡처: `docs/mcm/screen_image/cmb__MasterRuleDataUploadFilePopup.png` (사용자 제공 2026-06-05)
- 대조 결과: **1:1 일치 (불일치 0)** — 캡처 요소 ↔ xfdl 정의 매핑:

| 캡처 요소 | 캡처 표기 | xfdl 정의 | 일치 |
|---|---|---|---|
| 제목 | "일반 업무기준 등록(Excel Upload)" | titletext (xfdl:3) / edt_title | ✓ |
| 상단 버튼 4종 | 다운로드 · 파일선택 · 등록 · 닫기 | div_topMenu 동적 버튼 (xfdl:145-149) | ✓ |
| 조회조건 업무기준 | "MCMAP004" (예시 ID) | edt_MasterRuleId (xfdl:72) readonly | ✓ |
| 조회조건 업무기준명 | "공장공정코드와 ERP WorkCenter…" | edt_MasterRuleNm (xfdl:74) readonly | ✓ |
| 삭제등록 | 체크박스 | chk_regFlag (xfdl:76-77) | ✓ |
| 접기 토글 | "^" | btn_fold (xfdl:6) | ✓ |
| 동적 컬럼 그리드 | 사업장구분 · 조업구분 · 공장공정코드 · Work_Center | grd_Upload 동적 컬럼 (search_col 빌드, xfdl:261-273) | ✓ |
| 빈 상태 | "조회된 결과가 없습니다." | 그리드 nodata 표시 | ✓ |
| 하단 건수 | "N건 조회 되었습니다." | commonBottomStatus (xfdl:68) | ✓ |

- 비고: 캡처의 그리드 컬럼(사업장구분/조업구분/공장공정코드/Work_Center)은 선택 업무기준(MCMAP004)의 **동적 컬럼** 예시이며, 업무기준별로 가변(§4 ★동적 컬럼). To-Be 도 동일하게 컬럼정의(TB_MCA_RULE_COL_LIST) 기반 런타임 빌드.
