---
screenId: masterCodeUploadFilePopup
asIsId: MasterCodeUploadFilePopup
moduleId: mcm
moduleGroup: cma
작성일: 2026-05-27
작성자: Agent
---

# masterCodeUploadFilePopup 디자인설계서

> 단일 원천: `masterCodeUploadFilePopup_분석리포트.md`. 본 문서는 xfdl 의 UI 정의를 1:1 보존하면서 To-Be 가 따라야 할 레이아웃·컴포넌트 명세를 기록한다.

## §1. 화면 개요 + 팝업 레이아웃

### 1.1 식별자

| 항목 | 값 |
|---|---|
| 화면 식별자 | masterCodeUploadFilePopup |
| As-Is Form ID | MasterCodeUploadFilePopup |
| Form titletext | 마스터코드 등록(Excel Upload) (xfdl:3) |
| 화면 유형 | modal popup |
| 부모 화면 | masterCodeMng (P-001) |

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
| popup width | 640~720 px | 6 컬럼 그리드 가독성 + 검색 영역 폭 |
| popup height | 480~520 px | 헤더 + 검색 + 그리드 + 푸터 + 메시지 영역 |
| 모달 / 비모달 | modal 유지 | As-Is 동일 |
| reflow | (As-Is `mobileorientation=landscape`) | To-Be FE 프레임워크 반응형 정책 (개발 단계 결정) |

## §2. 영역 구성 (4 Div)

> xfdl Form 의 직접 자식 = 4 Div + 1 Button (btn_fold). top-down 순서로:

| 순서 | ID | 영역명 | left | top | right | height | 용도 | 근거 |
|---:|---|---|---|---|---|---:|---|---|
| 1 | div_title | 상단 타이틀 + 공용 상단 메뉴 | 20 | 0 | 20 | 50 | titletext + commonTopButton (다운로드/파일선택/등록/닫기 4 버튼) | xfdl:88-100 |
| 2 | div_search | 조회조건 영역 | 20 | 50 | 20 | 43 | 코드ID + 코드명 + 삭제등록 체크박스 (read-only 표시) | xfdl:102-113 |
| 3 | btn_fold | 검색영역 접기 버튼 | 20 | 93 | 20 | 15 | div_search 접기/펴기 | xfdl:6 |
| 4 | div_main | 메인 그리드 영역 (Excel 미리보기 + 숨김 다운로드용) | 20 | btn_fold:5 | 20 | bottom=30 (반응형) | grd_Upload (사용자 가시) + grd_Download (visible=false) | xfdl:7-87 |
| 5 | div_bottom | 하단 상태바 | 0 | (반응형) | 0 | 20 | commonBottomStatus (메시지 표시 영역) | xfdl:101 |

### 2.1 div_title (xfdl:88-100)

| 자식 컴포넌트 | 속성 | 근거 |
|---|---|---|
| Edit edt_title | readonly=true, tabstop=false, value="마스터코드 등록(Excel Upload)", text="마스터코드 등록(Excel Upload)", width=240, height=30, cssclass="edi_WFHD_Title", left=0, bottom=10 | xfdl:91 |
| Div div_topMenu | width=270, height=23, right=0, url="_com_div::commonTopButton.xfdl", bottom=10 — **이 Div 안에 동적으로 다운로드/파일선택/등록/닫기 4 버튼이 배치됨** (`fn_commonTop_onload` 호출) | xfdl:92-97 |

### 2.2 div_search (xfdl:102-113)

cssclass=`div_WFSA_Box` (검색영역 표준 스타일).

| 자식 컴포넌트 | 속성 / 라벨 | 근거 |
|---|---|---|
| Static stc_codeNm | text="코드ID", width=55, height=20, top=10, left=0, cssclass="stc_WFSA_Label", textAlign=center, verticalAlign=middle | xfdl:105 |
| Edit edt_MasterCode | top=11, width=120, height=20, left=stc_codeNm:10, **readonly=true**, text="결함 코드" (디자인 시간 기본값 — 실제는 호출자 sMasterCode) | xfdl:106 |
| Static stc_codeNm00 | text="코드명", width=55, height=20, top=11, left=edt_MasterCode:20 | xfdl:107 |
| Edit edt_MasterCodeNm | top=11, width=180, height=20, left=stc_codeNm00:10, **readonly=true**, text="결함 코드" (디자인 기본값) | xfdl:108 |
| Static stc_flag | text="삭제등록", width=60, height=20, top=10, left=edt_MasterCodeNm:10, textAlign=center | xfdl:109 |
| CheckBox chk_regFlag | text="CheckBox00" (기본 placeholder — 표시 안됨), width=20, height=20, top=10, left=stc_flag:5 | xfdl:110 |

> **레이아웃 흐름** (좌→우): 코드ID 라벨 (55) → edt_MasterCode (120) → 코드명 라벨 (55) → edt_MasterCodeNm (180) → 삭제등록 라벨 (60) → chk_regFlag (20). 총 폭 ≈ 490 px (간격 포함 ≈ 560 px → div_search 폭 580 px 에 잘 맞춤).

### 2.3 div_main (xfdl:7-87) — 본 화면 핵심 영역

자식 = Grid grd_Upload (가시) + Grid grd_Download (visible=false).

| 항목 | grd_Upload | grd_Download |
|---|---|---|
| binddataset | ds_grdUpload | ds_grdDownload |
| visible | true (기본) | **false** |
| left / top / right / bottom | 0 / 5 / 0 / 0 (= div_main 전체 채움) | 400 / 197 / - / - (위치만 정의, 실제 화면에 표시 안됨) |
| width / height | (반응형) | 240 / 100 |
| cellmovingtype | col | (기본) |
| cellsizingtype | col | (기본) |
| selecttype | multiarea | (기본) |
| autofittype | col | (기본) |

### 2.4 div_bottom (xfdl:101)

| 자식 | url | 비고 |
|---|---|---|
| (commonBottomStatus.xfdl) | _com_div::commonBottomStatus.xfdl | 상태바 메시지 영역 — `gfn_commonBottomStatus_msg(...)` 로 표시 |

## §3. 파일 선택 (gfn_importExcel)

### 3.1 As-Is 동작 (xfdl:200-204)

| 단계 | 동작 |
|---|---|
| 1 | (trigger) 사용자가 btn_fileUpload 클릭 |
| 2 | `this.ds_grdUpload.clear()` (dataset 메타까지 초기화) |
| 3 | `this.gfn_importExcel(this.div_main.form.grd_Upload, "마스터코드등록(ExcelUpload)", "A4:F4", "A5", this.ds_grdUpload, "fn_callImportBack")` |
| 4 | (nexacro 내부) OS 파일 선택 다이얼로그 표시 → Excel 파일 선택 → A4:F4 헤더 인식 → A5~ row 적재 → ds_grdUpload 에 push |
| 5 | callback `fn_callImportBack`: 상태바에 "Excel Data {N}건 조회 되었습니다." 표시 |

### 3.2 To-Be Excel parsing — SheetJS (사용자 결정)

| 후보 | 장단점 |
|---|---|
| (a) FE SheetJS | 빠른 미리보기 / 큰 파일은 메모리 부담 / 서버 부하 분산 |
| (b) BE Apache POI (multipart upload) | 보안 검증 일원화 / 큰 파일도 가능 / FE 미리보기 불가 → 2 단계 (1차 upload → 2차 preview API) |
| (c) 양쪽 (FE preview + BE validate on save) | 권고 — As-Is UX 유지 |

### 3.3 Excel 포맷 명세

| 셀 | 컬럼명 (한글) | dataset 컬럼 (영문) | 형식 (권고) | 필수 |
|---|---|---|---|---|
| A | 코드ID | MASTER_CODE | string | Y (= 호출자 sMasterCode 와 일치 검증 권고) |
| B | 카테고리ID | CATEGORY_ID | string | Y (PK 일부) |
| C | 코드값 | CODE_VAL | string | Y (PK 일부) |
| D | 코드의미 | CODE_VAL_MEAN | string | (As-Is 미지정 — 운영 정책 따라 결정) |
| E | 코드설명 | CODE_VAL_DESC | string | N |
| F | 정렬순서 | SORT_SEQ | string (정수 권고) | N |

> 헤더 행 = Excel 4 행 (A4:F4) — 즉 1~3 행은 자유 영역 (제목 / 부제 / 빈 줄 등 사용 가능). 데이터는 5 행부터.

## §4. 미리보기 그리드 (grd_Upload + grd_Download)

### 4.1 grd_Upload (가시) — Format/default

| Cell | head | body bind | size | head band | body band |
|---|---|---|---:|---|---|
| col=0 | 코드ID | bind:MASTER_CODE | 80 | xfdl:26 | xfdl:34 |
| col=1 | 카테고리ID | bind:CATEGORY_ID | 80 | xfdl:27 | xfdl:35 |
| col=2 | 코드값 | bind:CODE_VAL | 80 | xfdl:28 | xfdl:36 |
| col=3 | 코드의미 | bind:CODE_VAL_MEAN | 80 | xfdl:29 | xfdl:37 |
| col=4 | 코드설명 | bind:CODE_VAL_DESC | 80 | xfdl:30 | xfdl:38 |
| col=5 | 정렬순서 | bind:SORT_SEQ | 80 | xfdl:31 | xfdl:39 |

- Row 정의: head 24 px + body 24 px (xfdl:22-23).
- 편집 가능 여부: 본 화면은 `editable` 명시 없음 → **xfdl 기본 (false 또는 cell 단위 default)**. To-Be 동일 (As-Is 보존 — Excel 업로드 미리보기는 read-only).

### 4.2 grd_Download (숨김) — Format/default

| Cell | head row=0 | head row=1 | body bind | size |
|---|---|---|---|---:|
| col=0 | 코드ID | MASTER_CODE | bind:MASTER_CODE | 80 |
| col=1 | 카테고리ID | CATEGORY_ID | bind:CATEGORY_ID | 80 |
| col=2 | 코드값 | CODE_VAL | bind:CODE_VAL | 80 |
| col=3 | 코드의미 | CODE_VAL_MEAN | bind:CODE_VAL_MEAN | 80 |
| col=4 | 코드설명 | CODE_VAL_DESC | bind:CODE_VAL_DESC | 80 |
| col=5 | 정렬순서 | SORT_SEQ | bind:SORT_SEQ | 80 |

- Row 정의: head 24 px × 2 (= 한글 + 영문) + body 24 px (xfdl:56-58).
- **용도**: `gfn_exportExcel` 의 source 그리드. 두 줄 헤더가 그대로 Excel 헤더로 출력됨.

### 4.3 To-Be 그리드 권고

- **단일 그리드 권고**: As-Is 의 grd_Upload + grd_Download 분리는 nexacro xfdl 의 Format 제약 (multi-row header) 때문. To-Be 가 React 등 modern UI 라면 1 그리드로 통합 + Excel export 시에만 2-row header 추가 (To-Be FE 설계 단계 결정).
- **반응형**: As-Is 의 `autofittype="col"` 은 컬럼 너비 자동 맞춤. To-Be 도 동일하게 적용 권고.
- **선택 모드**: As-Is `selecttype="multiarea"` (다중 영역 선택) — To-Be 유지.

## §5. 버튼 (4 + 1 = 5 버튼)

### 5.1 div_topMenu 동적 4 버튼 (xfdl:174-182)

| 버튼 식별자 | 라벨 | 핸들러 (xfdl) | 표시 순서 (Array 등록 순) |
|---|---|---|---:|
| btn_fileDown | 다운로드 | fn_fileDown | 1 (xfdl:178) |
| btn_fileUpload | 파일선택 | fn_fileUpload | 2 (xfdl:179) |
| btn_fileSave | 등록 | fn_fileSave | 3 (xfdl:180) |
| btn_close | (닫기 — 기본 라벨) | fn_close (commonTopButton 기본) | 4 (xfdl:181) |

> commonTopButton.xfdl 의 `fn_commonTop_onload(this, [사용자 정의 버튼들], [기본 버튼들])` 패턴. 사용자 정의 3 개 (다운로드/파일선택/등록) + 기본 1 개 (닫기) = 총 4 개. `btn_search` / `btn_confirm` 은 주석 처리되어 미사용 (xfdl:181).

### 5.2 div_search 내 본 화면 native 1 버튼

| 버튼 | 위치 | 동작 |
|---|---|---|
| btn_fold | 검색영역 위 (top=93) | 검색영역 (div_search) 접기/펴기 — `gfn_fold(this, div_search, div_main, btn_fold)` |

### 5.3 버튼 시각 디자인 (cssclass 인용)

| 영역 | cssclass | 비고 |
|---|---|---|
| btn_fold | `btn_WFSA_Fold` | 검색영역 표준 fold 버튼 스타일 |
| edt_title | `edi_WFHD_Title` | 헤더 타이틀 표준 |
| 라벨 (stc_codeNm, stc_codeNm00, stc_flag) | `stc_WFSA_Label` | 검색조건 라벨 표준 |
| div_search 본체 | `div_WFSA_Box` | 검색영역 박스 표준 |
| div_bottom | `div_WF_Footer` | 푸터 표준 |

## §6. 메시지 표기 (상태바 + 모달)

### 6.1 상태바 (div_bottom — commonBottomStatus)

| 시점 | 본문 |
|---|---|
| B-002 후 (fn_callImportBack) | "Excel Data {ds_grdUpload.getRowCount()}건 조회 되었습니다." |
| B-001 후 (fn_callBack case "search" 성공) | "{strErrorMsg.ds_GetCodeUploadList}건 조회 되었습니다." |
| B-001 후 (fn_callBack case "search" 실패) | strErrorMsg (서버 메시지) |
| B-003 후 (fn_callBack case "save" 성공) | "{strErrorMsg.cnt_import}건 저장 되었습니다." |
| B-003 후 (fn_callBack case "save" 실패) | strErrorMsg |

### 6.2 모달 메시지 (gfn_message)

| 시점 | 본문 | type |
|---|---|---|
| B-003 후 (fn_callBack case "save" 성공) | "마스터코드 등록이 완료되었습니다." | info |

### 6.3 디자인 권고 (To-Be)

- As-Is 의 상태바 메시지 + 모달 메시지 이중 표시는 Excel 일괄 등록의 안전성 강조 패턴. To-Be 에서도 유지 권고.
- Excel 행 수가 큰 경우 (예: 1000 건+) 진행 표시 (progress bar) 추가 권고 — To-Be FE 설계 단계 결정.
- 오류 메시지에 row index 포함 (To-Be 보강 — 사용자 결정) — F-002 기반.

## §7. 컴포넌트 ↔ 분석리포트 ID 매트릭스

| 분석리포트 ID | 디자인 컴포넌트 | xfdl line |
|---|---|---|
| R-001 (div_title) | div_title + edt_title + div_topMenu | xfdl:88-100 |
| R-002 (div_search) | div_search + 6 자식 컴포넌트 | xfdl:102-113 |
| R-003 (btn_fold) | Button btn_fold | xfdl:6 |
| R-004 (div_main) | div_main + grd_Upload + grd_Download | xfdl:7-87 |
| R-005 (div_bottom) | div_bottom (commonBottomStatus) | xfdl:101 |
| S-001 (코드ID) | edt_MasterCode + stc_codeNm | xfdl:105-106 |
| S-002 (코드명) | edt_MasterCodeNm + stc_codeNm00 | xfdl:107-108 |
| S-003 (삭제등록) | chk_regFlag + stc_flag | xfdl:109-110 |
| G-001~G-006 | grd_Upload 6 컬럼 | xfdl:14-19 / 26-31 / 34-39 |
| GE-001~GE-006 | grd_Download 6 컬럼 (숨김) | xfdl:48-53 / 61-72 / 75-80 |
| B-001 (다운로드) | div_topMenu 동적 버튼 btn_fileDown | xfdl:178 |
| B-002 (파일선택) | div_topMenu 동적 버튼 btn_fileUpload | xfdl:179 |
| B-003 (등록) | div_topMenu 동적 버튼 btn_fileSave | xfdl:180 |
| B-099 (닫기) | div_topMenu 동적 버튼 btn_close | xfdl:181 |
| T-001 (fold) | btn_fold | xfdl:6 |
| T-002 (chk toggle) | chk_regFlag | xfdl:110 |
