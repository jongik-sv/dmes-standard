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

# 카테고리 관리 (masterCategoryMng) 기능설계서

> 본 문서는 [분석리포트](./masterCategoryMng_분석리포트.md) 를 단일 원천으로 인용한다.

---

## §1. 화면 개요

| 항목 | 값 |
|---|---|
| 화면 ID | masterCategoryMng |
| As-Is 화면 ID | MasterCategoryMng |
| 화면명 | 카테고리 관리 |
| 모듈 / 그룹 | mcm (공통관리) / cma (Master 관리(원장)) |
| 메뉴 계층 | 공통관리 > Master 관리(원장) > 카테고리 관리 |
| 화면 목적 | 코드 마스터에 종속된 카테고리 (MASTER_CODE + CATEGORY_ID 복합 PK) 의 CRUD 관리 |
| 사용자 | 코드 마스터 운영 담당자 |
| 권한 | To-Be 외부 권한 프로세스 위임 (§8) |
| 주 사용 테이블 | TB_MCM_CODE_CATEGORY (PK = MASTER_CODE + CATEGORY_ID) / TB_MCM_CODE_MASTER (JOIN) |
| 기본 동작 | 화면 로드 → 자동 조회 (분석리포트 §xfdl:127 `fn_search()` onload 호출) |

---

## §2. 화면 흐름도

```
[화면 진입]
    ↓ (xfdl:124 fn_formAfterOnload)
[fn_button — 상단/우측 메뉴 생성]
    ↓
[fn_search — 조회 자동 호출]
    ↓
[그리드 표시]
    ↓
사용자 액션 분기:
  ├─ 조회 (B-001)  → fn_search()       → action=search
  ├─ 저장 (B-002)  → fn_save()         → 클라이언트 검증 4 (필수 3 + 중복 2) → action=save
  ├─ 행추가 (B-003) → fn_rowAdd()      → ds_grdMain.addRow() (client-side)
  ├─ 행복사 (B-004) → fn_rowCopy()     → CHK==1 행 복사 (client-side)
  ├─ 행삭제 (B-005) → fn_rowDelete()   → CHK==1 행 delete (client-side; 저장 시 server 반영)
  ├─ 행취소 (B-006) → fn_rowCancel()   → 그리드 초기화 (client-side)
  ├─ 엑셀다운 (B-007) → fn_excelDown() → 그리드 → Excel
  └─ 접기 (B-008)   → btn_fold_onclick → div_search 접기/펴기
```

비고: search / save action 종료 시 BPMN 정의에 따라 Task_2(Main조회) + Task_0lk57sx(Main 전체조회) 가 자동 후속 실행되어 ds_grdMain 및 ds_grdMainAll 갱신.

---

## §3. 조회 기능 (S-NNN + G-001)

### §3.1 조회조건 (S-001~S-008 — 분석리포트 §3.2)

| 항목 | 라벨 | 입력 ID | 파라미터 | 검증 | 매핑 SQL WHERE |
|---|---|---|---|---|---|
| S-002 | 코드ID | edt_codeVal | pCodeId | 대문자 변환 / 영문 (xfdl:72) | `CMASTER.MASTER_CODE LIKE '%' \|\| #{pCodeId} \|\| '%'` (Mapper.xml:17) |
| S-004 | 코드명 | edt_codeNm | pCodeNm | 한글 (xfdl:74) | `CMASTER.CODE_NM LIKE '%' \|\| #{pCodeNm} \|\| '%'` (Mapper.xml:20) |
| S-006 | 카테고리ID | edt_categoryId | pCategoryId | 대문자 변환 / 영문 (xfdl:76) | `TMCCTEGORY.CATEGORY_ID LIKE '%' \|\| #{pCategoryId} \|\| '%'` (Mapper.xml:23) |
| S-008 | 카테고리명 | edt_categoryNm | pCategoryNm | 한글 (xfdl:78) | `TMCCTEGORY.CATEGORY_NM LIKE '%' \|\| #{pCategoryNm} \|\| '%'` (Mapper.xml:26) |

비고:
- 4 항목 모두 LIKE 부분일치. 미입력시 해당 if 블록 skip → 전체 조회.
- ORDER BY MASTER_CODE 고정 (Mapper.xml:28).
- As-Is `text="USD"` 초기값 보존 (사용자 결정).

### §3.2 조회 결과 그리드 G-001 (분석리포트 §3.3)

| col | 헤드 | 컬럼 | 표시 형식 | 편집 가능 | 비고 |
|---:|---|---|---|---|---|
| 0 | 선택 | CHK | checkbox | Y | 저장/삭제 대상 선택 |
| 1 | NO | (자동) | 일련번호 (currow+1) | N | 화면 일련번호 |
| 2 | 상태 | STATUS | image | N | Nexacro auto row state — To-Be FE 동일 구현 (사용자 결정) |
| 3 | 코드명 | CODE_NM | 텍스트 | N | TB_MCM_CODE_MASTER 인용 |
| 4 | 코드 ID | MASTER_CODE | 텍스트 | Y (신규행만) | 기존행 PK 변경 불가 (As-Is 정책 보존) |
| 5 | 카테고리 ID | CATEGORY_ID | 텍스트 (영문 대문자, max 50) | Y (신규행만) | 기존행 PK 변경 불가 |
| 6 | 카테고리 명 | CATEGORY_NM | 텍스트 (한글, max 180) | Y | 모든 행 |
| 7 | 정렬 | SORT_SEQ | mask (max 180) | Y | 모든 행 |

### §3.3 조회 결과 메시지

- 정상 조회 시 하단 상태바: `{ds_GetCodeCategoryList 건수}건 조회 되었습니다.` (xfdl:231).
- 오류 시: `strErrorMsg` 표시 (xfdl:233).

---

## §4. CRUD 기능 (분석리포트 §6 / §7)

### §4.1 신규(C — INSERT)

| 항목 | 값 |
|---|---|
| 트리거 | 우측 메뉴 행추가 (B-003) → fn_rowAdd (xfdl:286) |
| 동작 | ds_grdMain.addRow() / CHK=1 마킹 / col 4 코드 ID 포커스 / CODE_NM = nRow-1 의 CODE_NM 복사 (As-Is 휴리스틱 보존) |
| 행 상태 | nativeeditor_status = "inserted" |
| 저장 시 SQL | InsertTbMcmCodeCategory (Mapper.xml:54~69) |
| 입력 컬럼 | MASTER_CODE, CATEGORY_ID, CATEGORY_NM, SORT_SEQ + ref_Audit |

### §4.2 조회(R — SELECT)

| 항목 | 값 |
|---|---|
| 트리거 | 상단 메뉴 조회 (B-001) / onload 자동 (xfdl:127) |
| 동작 | fn_search (xfdl:145) → gfn_transaction(sSvcID="search") |
| 호출 SQL | GetCodeCategoryList (Mapper.xml:7~29) + GetCodeCategoryAllList (Mapper.xml:31~37, BPMN 후행 자동) |
| 결과 적재 | ds_grdMain ← ds_GetCodeCategoryList / ds_grdMainAll ← ds_GetCodeCategoryAllList (xfdl:150) |

### §4.3 수정(U — UPDATE)

| 항목 | 값 |
|---|---|
| 트리거 | 그리드 셀 직접 편집 (CATEGORY_NM / SORT_SEQ; 신규행은 MASTER_CODE / CATEGORY_ID 도) |
| 행 상태 | nativeeditor_status = "updated" |
| 저장 시 SQL | UpdateTbMcmCodeCategory (Mapper.xml:39~46) |
| 갱신 컬럼 | CATEGORY_NM, SORT_SEQ + ref_Audit.update |
| WHERE | CATEGORY_ID = #{CATEGORY_ID} AND MASTER_CODE = #{MASTER_CODE} |

### §4.4 삭제(D — DELETE)

| 항목 | 값 |
|---|---|
| 트리거 | 우측 메뉴 행삭제 (B-005) → fn_rowDelete (xfdl:308) |
| 동작 | CHK==1 인 모든 행에 대해 `gfn_deleteRow(this.ds_grdMain, i)` (xfdl:321) → 신규행은 client-side 삭제, 기존행은 nativeeditor_status="deleted" 마킹 |
| 저장 트리거 | 상단 메뉴 저장 (B-002) — 별도 server call 즉시 발생 ✗ |
| 저장 시 SQL | DeleteTbMcmCodeCategory (Mapper.xml:48~52) |
| WHERE | CATEGORY_ID = #{CATEGORY_ID} AND MASTER_CODE = #{MASTER_CODE} |

비고: xfdl:327~353 의 (블록 주석된) delete 즉시 호출 경로는 운영 미사용 — 표준은 저장(B-002) 일괄 처리.

### §4.5 저장 통합 (B-002)

| 단계 | 동작 | 근거 |
|---|---|---|
| 검증 1 (필수) | nativeeditor_status ≠ 1 (행 추가 후 미저장 등) 행에 대해 MASTER_CODE / CATEGORY_ID / CATEGORY_NM null 체크 | xfdl:163~186 |
| 검증 2 (화면 중복) | ds_grdMain 내 CATEGORY_ID 중복 (getCaseCount("CATEGORY_ID == '...'") != 1) 차단 | xfdl:189~195 |
| 검증 3 (전체 중복) | 신규행(RowType==2) 에 대해 ds_grdMainAll (MASTER_CODE+CATEGORY_ID) 중복 차단 | xfdl:199~206 |
| 검증 4 (체크 표시) | gfn_checkTransaction("ds_grdMain", "CHK") — CHK==1 인 행만 송신 대상 마킹 | xfdl:218 |
| 송신 | sInDatasets="ds_grdMain=ds_grdMain:U" / 조회조건 4 파라미터 포함 | xfdl:210~215 |
| 서버 처리 | UserTask_154khzh → SaveTbMcmCodeCategory.run() — nativeeditor_status 별 분기 (updated/deleted/inserted) | java:30~62 |
| 트랜잭션 | dao.update() ≤ 0 시 throw → IllegalTaskException → 전체 롤백 | java:38~42, 46~50, 56~60, 67~71 |
| 결과 메시지 | `{cnt_merge}건 저장 되었습니다.` | xfdl:239 |

---

## §5. 버튼 액션

### §5.1 server-side action 매트릭스

| action | 버튼 | sInDatasets | sOutDatasets | 후속 BPMN 경로 |
|---|---|---|---|---|
| search | B-001 btn_search | "" | ds_grdMain=ds_GetCodeCategoryList ds_grdMainAll=ds_GetCodeCategoryAllList | Gateway → Task_2(Main조회) → Task_0lk57sx(전체조회) → End |
| save | B-002 btn_save | ds_grdMain=ds_grdMain:U | ds_grdMain=ds_GetCodeCategoryList ds_grdMainAll=ds_GetCodeCategoryAllList | Gateway → UserTask_154khzh(저장) → Task_2(조회) → Task_0lk57sx(전체조회) → End |
| delete (잔존) | (xfdl 미사용 — 주석) | - | ds_grdMain=ds_GetCodeCategoryList ds_grdMainAll=ds_GetCodeCategoryAllList | Gateway → Task_0k24d4u(삭제) → Task_2(조회) → Task_0lk57sx(전체조회) → End |

### §5.2 client-side 액션

| 액션 | 버튼 | 동작 |
|---|---|---|
| rowAdd | B-003 | 행 추가 + CHK=1 + CODE_NM 직전행 복사 |
| rowCopy | B-004 | CHK==1 행 복사 (gfn_rowcopyData) |
| rowDelete | B-005 | CHK==1 행 client 삭제 마킹 |
| rowCancel | B-006 | 그리드 초기화 (gfn_grdInit) |
| excelDown | B-007 | 그리드 → Excel (gfn_exportExcel(grd_main, titletext)) |
| fold | B-008 | div_search 접기/펴기 토글 (gfn_fold) |
| 그리드 헤드 클릭(CHK) | GB-001 | 전체 선택/해제 (mainChk 변수) |
| 그리드 헤드 클릭(기타) | GB-002 | 정렬 (gfn_commonOnheadclick) |

---

## §6. 비즈니스 룰

| BR-NNN | 룰 | 근거 |
|---|---|---|
| BR-001 | 카테고리는 코드 마스터(TB_MCM_CODE_MASTER) 에 종속 — MASTER_CODE 는 TB_MCM_CODE_MASTER.CODE_ID 의 FK 관계 | Mapper.xml:15, 36 |
| BR-002 | 카테고리 PK 는 (MASTER_CODE, CATEGORY_ID) 복합 — 동일 코드 마스터 내 CATEGORY_ID 유일성 | Mapper.xml:44~45, 50~51 |
| BR-003 | 저장 전 필수 입력: 신규/수정행에서 MASTER_CODE, CATEGORY_ID, CATEGORY_NM 누락 차단 | xfdl:165~185 |
| BR-004 | 화면 내 CATEGORY_ID 중복 차단 (단, MASTER_CODE 와 무관 — As-Is 룰 그대로 보존) | xfdl:189~195 |
| BR-005 | 전체 마스터 내 (MASTER_CODE+CATEGORY_ID) 중복 차단 (신규행에 한함) | xfdl:199~206 |
| BR-006 | 기존행 PK (MASTER_CODE, CATEGORY_ID) 변경 불가 — 그리드에서 신규행만 편집 허용 | xfdl:42~43 |
| BR-007 | 카테고리 명(CATEGORY_NM) max 180 자 / 카테고리 ID(CATEGORY_ID) max 50 자 — 그리드 editmaxlength | xfdl:43, 44 |
| BR-008 | 카테고리 ID(CATEGORY_ID) 입력 = 영문 대문자 자동 변환 | xfdl:43 (editinputmode="upper", editimemode="alpha") |
| BR-009 | 카테고리 명(CATEGORY_NM) 입력 = 한글 IME | xfdl:44 (editimemode="hangul") |
| BR-010 | 행추가 시 CODE_NM 은 직전 행 값으로 자동 복사 (As-Is 휴리스틱 보존) | xfdl:292 |
| BR-011 | 저장 시 CHK==1 인 행만 대상 (gfn_checkTransaction) | xfdl:218 |
| BR-012 | 저장 dao.update() 반환값 ≤ 0 인 경우 즉시 예외 → 전체 트랜잭션 롤백 | java:38~60 |
| BR-013 | 검색 조건 4종 모두 LIKE 부분일치 (대소문자 정책은 DB CONFIG 의존 — Oracle 기본 case-sensitive) | Mapper.xml:17, 20, 23, 26 |
| BR-014 | 모든 INSERT/UPDATE = ref_Audit fragment 으로 감사 컬럼 자동 주입 | Mapper.xml:43, 60, 67 |
| BR-015 | 검색 결과 정렬은 MASTER_CODE 오름차순 고정 | Mapper.xml:28 |

---

## §7. 상태값 (ST-NNN)

| ST-NNN | 상태 | 의미 | 발생 시점 | 대응 동작 |
|---|---|---|---|---|
| ST-001 | row inserted (nativeeditor_status="inserted" / getRowType==2) | 행 추가됨 (미저장 신규) | fn_rowAdd / fn_rowCopy 직후 | 저장 시 InsertTbMcmCodeCategory 호출 |
| ST-002 | row updated (nativeeditor_status="updated") | 기존 행 컬럼 변경 (미저장) | 그리드 셀 편집 후 | 저장 시 UpdateTbMcmCodeCategory 호출 |
| ST-003 | row deleted (nativeeditor_status="deleted") | 행 삭제 마킹 (미저장) | fn_rowDelete / gfn_deleteRow 후 | 저장 시 DeleteTbMcmCodeCategory 호출 |
| ST-004 | row clean (nativeeditor_status==1 또는 변경 없음) | 변경 없음 | 조회 직후 | 저장 대상 아님 (검증 skip) |
| ST-005 | row CHK=1 | 사용자 선택 행 — 빨간 배경 cssclass 표시 | 사용자 체크박스 토글 또는 GB-001 헤드 전체선택 | 저장/삭제 시 대상 |
| ST-006 | row CHK=0 | 미선택 | 기본 / 헤드 전체해제 | 저장/삭제 시 제외 |
| ST-007 | search done | 조회 완료 | gfn_transaction("search") 콜백 nErrorCode==0 | 하단 상태바 "{N}건 조회되었습니다." |
| ST-008 | save done | 저장 완료 | gfn_transaction("save") 콜백 nErrorCode==0 | 하단 상태바 "{cnt_merge}건 저장 되었습니다." |
| ST-009 | error | 트랜잭션 오류 | nErrorCode≠0 | 하단 상태바 strErrorMsg 표시 |

---

## §8. 권한 / 접근 제어

| 항목 | 정책 | 근거 |
|---|---|---|
| 화면 접근 | (As-Is mui 자료 권한 명시 없음 — 모듈 통합 권한관리 화면(`CommPermMng` / `CommRoleMng` 등) 에 위임) | mappers-csa 폴더 인용 (분석 범위 외) |
| 조회 권한 | 화면 접근자 모두 | To-Be 외부 권한 프로세스 위임 |
| 저장 권한 | To-Be 외부 권한 프로세스 위임 | - |
| 행추가/복사/삭제 권한 | To-Be 외부 권한 프로세스 위임 | - |
| 엑셀다운 권한 | To-Be 외부 권한 프로세스 위임 | - |

> 본 화면 자체 권한 분기 ✗ — To-Be 외부 권한 모델 (전사 정책) 위임 (사용자 결정). 본 화면이 코드 마스터(TB_MCM_CODE_MASTER) 종속 카테고리를 다루므로, masterCodeMng 접근 권한자와 동일 정책으로 통합 권장.

---

## §9. 팝업 / 연계 화면

### §9.1 호출(out-going) 팝업

| P-NNN | 호출 대상 | 트리거 | 결과 |
|---|---|---|---|
| (없음) | - | - | - |

본 화면은 외부 팝업/조회창을 직접 호출하지 않음 — 모든 CRUD 가 단일 그리드 내 완결.

### §9.2 호출됨(in-coming) 추정 — 분석 범위 외

| 호출 가능 외부 화면 | 호출 시나리오 | 결정 |
|---|---|---|
| masterCodeMng (코드 마스터 관리) | 코드 종속 카테고리 일괄 관리로 본 화면 직접 호출 가능성 | mcm 모듈 단독 화면 — 호출 화면 없음 (사용자 결정) |

---

## §10. 메시지 / 알림

### §10.1 검증 메시지

| MSG-NNN | 트리거 | 메시지 | 유형 | 후처리 | 근거 |
|---|---|---|---|---|---|
| MSG-001 | 저장 검증 (MASTER_CODE null) | "코드ID를 입력해 주십시오." | warning | 해당 행 포커스 / col 4 셀 이동 / 저장 중단 | xfdl:166 |
| MSG-002 | 저장 검증 (CATEGORY_ID null) | "카테고리 ID를 입력해 주십시오." | warning | 해당 행 포커스 / col 5 셀 이동 / 저장 중단 | xfdl:173 |
| MSG-003 | 저장 검증 (CATEGORY_NM null) | "카테고리 명을 입력해 주십시오." | warning | 해당 행 포커스 / col 6 셀 이동 / 저장 중단 | xfdl:180 |
| MSG-004 | 저장 검증 (CATEGORY_ID 중복 — 화면 내) | "중복된 카테고리 ID가 존재합니다." | warning | 해당 행 포커스 / col 5 셀 이동 / 저장 중단 | xfdl:190 |
| MSG-005 | 저장 검증 (MASTER_CODE+CATEGORY_ID 중복 — 전체) | "전체 마스터 내 중복된 코드값이 존재합니다." | warning | 저장 중단 (포커스 이동 없음 — As-Is) | xfdl:202 |
| MSG-006 | 삭제 검증 (선택 행 없음) | "선택된 행이 없습니다." | warning | 작업 중단 | xfdl:313 |
| MSG-007 | (주석처리된 As-Is) 삭제 확인 | "[코드] = {MASTER_CODE}\n[카테고리] = {CATEGORY_ID} \n삭제하시겠습니까?" | confirm | 확인 시 delete service 호출 — 현재 미사용 | xfdl:351 |

### §10.2 상태바 메시지

| MSG-NNN | 트리거 | 메시지 | 근거 |
|---|---|---|---|
| MSG-010 | search 콜백 성공 | "{n}건 조회 되었습니다." | xfdl:231 |
| MSG-011 | save 콜백 성공 | "{cnt_merge}건 저장 되었습니다." | xfdl:239 |
| MSG-012 | (주석) delete 콜백 성공 | "{deleteMain}건 삭제 되었습니다." | xfdl:247 |
| MSG-013 | 콜백 오류 | strErrorMsg 그대로 표시 | xfdl:233, 241 |
