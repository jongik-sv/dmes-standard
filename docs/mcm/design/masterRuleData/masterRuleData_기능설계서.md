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

# 업무기준 Data관리 (masterRuleData) 기능설계서

> 본 문서는 [분석리포트](./masterRuleData_분석리포트.md) 를 단일 원천으로 인용한다. 식별자/SQL/액션/Q-NNN 은 분석리포트 정의를 따른다.

---

## §1. 화면 개요

| 항목 | 값 |
|---|---|
| 화면 ID | masterRuleData |
| As-Is 화면 ID | MasterRuleData |
| 화면명 | 업무기준 Data관리 |
| 모듈 / 그룹 | mcm (공통관리) / cmb (업무기준 관리(원장)) |
| 메뉴 계층 | 공통관리 > 업무기준 관리(원장) > 업무기준 Data관리 |
| 화면 목적 | 업무기준(프레임) 에 매핑된 실데이터(동적 테이블 `TB_MCA_<업무기준ID>`) 의 동적 컬럼 CRUD 관리 (분석 §1) |
| 사용자 | 업무기준 데이터 운영 담당자 |
| 권한 | To-Be 외부 권한 프로세스 위임 (§8) |
| 주 사용 테이블 | TB_MCA_<업무기준ID> (동적 데이터, PK = RULE_VER + RULE_SEQ — 런타임 인스턴스, To-Be 전략 Q-001) / TB_MCA_RULE_COL_LIST (컬럼정의, DMES-SECTION-MCA sheet134 수록) / TB_MCA_RULE_MASTER (JOIN, sheet135 수록) — 분석 §9 |
| 기본 동작 | 화면 진입 후 업무기준 미선택 상태 → 업무기준 선택(P-001) → lov(컬럼정의) → search 자동 연쇄 (분석 §5.1) |
| ★ 특이성 | 동적 컬럼(컬럼정의 기반 런타임 생성) + 동적 테이블명 + 5조건 LoV 검색 + 페이징 + 긴급적용 분기 (분석 §0, §3.3, §6) |

---

## §2. 화면 흐름도

```
[화면 진입]
    ↓ (xfdl:343 fn_formAfterOnload)
[fn_button — 상단/우측 메뉴 생성]
    ↓
[업무기준 미선택 — 대기]
    ↓ 업무기준 버튼(B-010) → P-001(MasterRuleListPop)
[업무기준 선택 콜백 (fn_returnRulePopupCallBack)]
    ↓ edt_ruleId/edt_ruleNm 세팅
[fn_lov — 컬럼정의(lov) 조회]   → action=lov → ds_lovData
    ↓ lov 콜백: cbo_lov1~5 채움 + fn_search() 자동
[fn_search — 데이터 조회]       → action=search → ds_grdMain (동적컬럼 빌드)
    ↓
[그리드 표시 (정적 3 + 동적 N 컬럼) + 페이징]
    ↓
사용자 액션 분기:
  ├─ 조회 (B-001)   → fn_search()        → action=search (페이징/5조건LoV)
  ├─ 저장 (B-002)   → fn_save()          → 필수(PK)검증 + 긴급적용 confirm → action=save
  ├─ 행추가 (B-003) → fn_rowAdd()        → ds_grdMain.addRow() + CHK=1 (client)
  ├─ 행복사 (B-004) → fn_rowCopy()       → CHK==1 행 복사 (client)
  ├─ 행삭제 (B-005) → fn_rowDelete()     → CHK==1 행 deleteRow 마킹 (client; 저장 시 server)
  ├─ 행취소 (B-006) → fn_rowCancel()     → 그리드 초기화 (client)
  ├─ 엑셀업 (B-007) → fn_excelUp()       → P-002(업로드 팝업)
  ├─ 엑셀다운 (B-008) → fn_excelDown()   → action=search_export → grd_Download → Excel
  └─ 접기 (B-009)   → btn_fold_onclick   → div_search 접기/펴기
```

비고: save action 종료 시 BPMN 정의에 따라 UserTask_0zyva5v(저장) → UserTask_067lppc(Main 조회) 자동 후속 실행 → ds_grdMain 갱신 (분석 §8.4). search/lov/search_export 는 단일 task 후 End.

---

## §3. 조회 기능 (S-NNN + G-001)

### §3.1 조회조건 (S-001~S-021 — 분석 §3.2)

| 영역 | 항목 | 입력 ID | 파라미터 | 비고 |
|---|---|---|---|---|
| 업무기준 | 업무기준 ID (필수, readonly) | edt_ruleId (S-002) | pRuleId / pTable(=`TB_MCA_`+값) | 업무기준 버튼(B-010)→P-001 로만 채움 |
| 업무기준 | 업무기준명 (readonly) | edt_ruleNm (S-004) | (표시용) | P-001 콜백 세팅 |
| 조건1 | 컬럼 / 연산자 / 값 | cbo_lov1(S-006) / cbo_operator1(S-007) / edt_val1(S-008) | pWhere1 / pOperator1 / pVal1 | 컬럼=동적LoV / 연산자=LIKE,=,<=,>= / 값="KR/A" 초기 |
| 조건2 | 컬럼 / 연산자 / 값 | cbo_lov2(S-009) / cbo_operator2(S-010) / edt_val2(S-011) | pWhere2 / pOperator2 / pVal2 | 동일 |
| 조건3 | 컬럼 / 연산자 / 값 | cbo_lov3(S-012) / cbo_operator3(S-013) / edt_val3(S-014) | pWhere3 / pOperator3 / pVal3 | 동일 |
| 조건4 | 컬럼 / 연산자 / 값 | cbo_lov4(S-015) / cbo_operator4(S-016) / edt_val4(S-017) | pWhere4 / pOperator4 / pVal4 | 동일 |
| 조건5 | 컬럼 / 연산자 / 값 | cbo_lov5(S-018) / cbo_operator5(S-019) / edt_val5(S-020) | pWhere5 / pOperator5 / pVal5 | 동일 |
| 옵션 | 긴급적용 | chk_option (S-021) | pOption (Y/N) | 저장 시 DynamicSqlExecutor 분기 |

비고 (분석 §6.1 #2 / §7.1 단계4):
- 5조건 → SQL 동적 WHERE: `AND ${pWhereN} ${pOperatorN} ${pValN}` (각 pWhereN null 아닐 때). 미입력 조건 skip.
- VARCHAR2 컬럼이면 GetMasterRuleData 가 `UPPER(컬럼) ... UPPER('값')` 로 래핑 (대소문자 무시 검색).
- ORDER BY RULE_SEQ 고정 (ROW_NUMBER, Mapper.xml:40).
- ★ To-Be: `${}` 치환 화이트리스트 안전화 필요 (Q-007).

### §3.2 조회 결과 그리드 G-001 (분석 §3.3) — ★동적 컬럼

| col | 헤드 | 컬럼 | 표시 형식 | 편집 | 비고 |
|---:|---|---|---|---|---|
| 0 | (head checkbox) | CHK | checkbox | Y | 저장/삭제 대상 선택 (head=전체선택 mainChk) |
| 1 | 순번 | SEQ | 텍스트 | N | ROW_NUMBER |
| 2 | 상태 | STATUS | image | N | Nexacro auto row state — To-Be FE 동일 구현 (Q-003) |
| 3~N | (동적) | ds_lovData[i].COL_ID | COL_TYPE 별 (DATE=캘린더 / 그외 text) | Y (전 컬럼) | PK 컬럼=` * `prefix / IN(red)·OUT(blue) head 색 / 폭=13×COL_NM.length |

비고: 동적 컬럼은 search 콜백에서 ds_lovData 만큼 `addColumn`+`appendContentsCol` (분석 §3.3 빌드 표). 재조회 시 col 3 이후 전수 제거 후 재빌드 (xfdl:395~400).

### §3.3 조회 결과 메시지

- 정상 조회: 하단 상태바 `{ds_GetMasterRuleData 건수}건 조회 되었습니다.` (xfdl:591).
- 오류: `strErrorMsg` 표시 (xfdl:625).
- 조회 후 edt_val1 포커스 (xfdl:624).

---

## §4. CRUD 기능 (분석 §6 / §7)

### §4.1 신규(C — INSERT)

| 항목 | 값 |
|---|---|
| 트리거 | 우측 메뉴 행추가 (B-003) → fn_rowAdd (xfdl:470) |
| 동작 | ds_grdMain.addRow() / CHK="1" 마킹 (xfdl:473~474) |
| 행 상태 | nativeeditor_status = "inserted" |
| 채번 | 저장 시 GetMaxRuleSeq(#4) 로 maxRuleSeq 조회 → +1 → RULE_SEQ, RULE_VER="1" 고정 (java(Save):138, 147, 162~163) |
| 저장 시 경로 | 긴급적용=Y → DynamicSqlExecutor.insertData / N → `${pTable}_Mapper.insert` (java:167~171) |
| 입력 컬럼 | filterKeyByColId 로 ds_lovData COL_ID + RULE_VER/RULE_SEQ 만 (java:149, 193~214) + setAuditField |

### §4.2 조회(R — SELECT)

| 항목 | 값 |
|---|---|
| 트리거 | 상단 메뉴 조회 (B-001) / 업무기준 선택 후 자동 연쇄 (lov→search, xfdl:678) |
| 동작 | fn_search (xfdl:372) → gfn_transaction(sSvcID="search") |
| 호출 SQL | GetMasterRuleDataList (#2, java(Get):118) — 페이징 + 5조건 동적 WHERE |
| 컬럼정의 | GetMasterRuleData 내부에서 `TB_MCA_RULE_COL_LIST_Mapper.select`(java:51) 추가 조회 — UPPER 대상 컬럼 판정 |
| 결과 적재 | ds_grdMain ← ds_GetMasterRuleData (xfdl:405) + 동적 컬럼 빌드 (xfdl:593~617) |

### §4.3 수정(U — UPDATE)

| 항목 | 값 |
|---|---|
| 트리거 | 그리드 동적 컬럼 셀 직접 편집 (전 컬럼 edittype="text" — xfdl:614) |
| 행 상태 | nativeeditor_status = "updated" (oncolumnchanged 가 CHK=1 자동 — xfdl:752~757) |
| WHERE | `RULE_SEQ = '<값>'` (sUpdateWhere — java(Save):78) |
| 저장 경로 | 긴급적용=Y → DynamicSqlExecutor.updateData / N → `${pTable}_Mapper.update` (java:87~92) |
| DATE 처리 | COL_TYPE="DATE" 이고 길이>14 면 앞 14자 절단 (java(Save):77) |

비고: ★ As-Is 는 RULE_SEQ 로 WHERE 를 대체하여 PK 컬럼도 수정 가능하게 함 (xfdl:614 주석 — "RULE_SEQ 로 WHERE 절 대체하여 기존key 수정가능").

### §4.4 삭제(D — DELETE)

| 항목 | 값 |
|---|---|
| 트리거 | 우측 메뉴 행삭제 (B-005) → fn_rowDelete (xfdl:497) |
| 동작 | CHK=="1" 행에 대해 `gfn_deleteRow(ds_grdMain, i)` (xfdl:509~511) → 신규행 client 삭제, 기존행 nativeeditor_status="deleted" |
| 선택 없으면 | "선택된 행이 없습니다." 경고 후 중단 (xfdl:501~504) |
| 저장 트리거 | 상단 메뉴 저장 (B-002) 일괄 — 즉시 server call ✗ |
| WHERE | `RULE_SEQ = '<값>'` (java(Save):112) |
| 저장 경로 | 긴급적용=Y → DynamicSqlExecutor.deleteData / N → `${pTable}_Mapper.delete` (java:119~124) |

### §4.5 저장 통합 (B-002)

| 단계 | 동작 | 근거 |
|---|---|---|
| 검증 1 (PK 필수) | CHK=="1" 행에 대해 ds_lovData PK_YN=="Y" 컬럼 null 이면 `{COL_NM} 항목은 필수 입력사항 입니다.` 경고 + 해당 셀 포커스/에디터 + 중단 | xfdl:529~541 |
| 긴급적용 confirm | chk_option=true 면 `긴급으로 적용하시겠습니까?\n추후에 반드시 Mapper파일 적용하십시오.` confirm — 취소 시 중단 | xfdl:546~551 |
| 송신 마킹 | gfn_checkTransaction("ds_grdMain", "CHK") — CHK==1 행만 송신 | xfdl:577 |
| 송신 | sInDatasets="ds_srch=ds_srch ds_lovData=ds_lovData ds_grdMain=ds_grdMain:U" + 5조건/pRuleId/pTable/pOption 파라미터 | xfdl:553~578 |
| 서버 처리 | UserTask_0zyva5v → SaveMasterRuleData.run() — updated/deleted 루프 #1, inserted 루프 #2 (채번 후) | java:63~181 |
| 트랜잭션 | catch 시 throw IllegalTaskException → 전체 롤백 (영향행 검증은 로그만, 예외 throw ✗ — As-Is) | java:95~100, 185~189 |
| 후속 조회 | BPMN 으로 UserTask_067lppc(Main 조회) 자동 재조회 | bpmn:63 |
| 결과 메시지 | `{cnt_save}건 저장 되었습니다.` | xfdl:684 |

비고: ★ masterCategoryMng 과 달리 As-Is SaveMasterRuleData 는 영향행 ≤ 0 시 **예외를 던지지 않고 log.debug 만** 남김 (java:95~100, 127~132, 174~179) — 부분 실패가 조용히 무시될 수 있음. To-Be 정책 강화 검토 대상 (BR-013 비고).

---

## §5. 버튼 액션

### §5.1 server-side action 매트릭스 (분석 §4.6)

| action | 버튼 | sInDatasets | sOutDatasets | 후속 BPMN 경로 |
|---|---|---|---|---|
| search | B-001 btn_search | ds_srch=ds_srch | ds_grdMain=ds_GetMasterRuleData | Gateway → UserTask_067lppc(Main 조회) → End |
| lov | B-010 콜백 fn_lov | "" | ds_lovData=ds_GetRuleColList | Gateway → Task_0ru18qa(lov목록 조회) → End |
| save | B-002 btn_save | ds_srch=ds_srch ds_lovData=ds_lovData ds_grdMain=ds_grdMain:U | ds_grdMain=ds_GetMasterRuleData | Gateway → UserTask_0zyva5v(저장) → UserTask_067lppc(조회) → End |
| search_export | B-008 btn_excelDown | "" | ds_grdDownload=ds_GetMasterRuleDataExport | Gateway → Task_02a3gu4(엑셀 Export) → End |

### §5.2 client-side 액션

| 액션 | 버튼 | 동작 |
|---|---|---|
| rowAdd | B-003 | 행 추가 + CHK=1 |
| rowCopy | B-004 | CHK==1 행 복사 (gfn_rowcopyData) |
| rowDelete | B-005 | CHK==1 행 삭제 마킹 (없으면 경고) |
| rowCancel | B-006 | 그리드 초기화 (gfn_grdInit) |
| excelUp | B-007 | P-002(업로드 팝업) 호출 |
| fold | B-009 | div_search 접기/펴기 (gfn_fold) |
| ruleId 선택 | B-010 | P-001(업무기준 선택 팝업) 호출 |
| 그리드 헤드 클릭(CHK) | GB-001 | 전체 선택/해제 (mainChk) |
| 그리드 헤드 클릭(기타) | GB-002 | 정렬 (gfn_commonOnheadclick) |

---

## §6. 비즈니스 룰

| BR-NNN | 룰 | 근거 |
|---|---|---|
| BR-001 | 업무기준 ID(edt_ruleId) 는 필수 — 미선택 시 조회 차단 ("업무기준 ID는 필수입니다.") | xfdl:388~391 |
| BR-002 | 업무기준 ID 는 직접 입력 불가(readonly) — P-001(MasterRuleListPop) 선택으로만 채움 | xfdl:23, 437 |
| BR-003 | 업무기준 선택 시 lov(컬럼정의) → search 자동 연쇄 | xfdl:451, 678 |
| BR-004 | 조회 대상 테이블명 = `TB_MCA_` + 업무기준 ID (동적) | xfdl:406 / java(Get):29 / Mapper.xml:42 |
| BR-005 | 그리드 컬럼은 컬럼정의(ds_lovData) 기반 런타임 동적 생성 (개수/이름/타입 가변) | xfdl:593~617 |
| BR-006 | PK 컬럼(PK_YN="Y") 헤더 ` * ` prefix 표시 + 저장 시 필수 입력 검증 | xfdl:533, 607 |
| BR-007 | 컬럼 IO_FLAG="IN" 헤더 빨강 / 그외 파랑 | xfdl:608 |
| BR-008 | VARCHAR2 컬럼 검색은 `UPPER()` 양측 래핑 (대소문자 무시) | java(Get):57~76 |
| BR-009 | DATE 타입 컬럼은 캘린더(yyyy-MM-dd) + 저장 시 14자 초과 절단 | xfdl:604~606 / java(Save):77, 111, 154 |
| BR-010 | 신규행 RULE_SEQ = GetMaxRuleSeq+1 채번 / RULE_VER="1" 고정 | java(Save):138~163 |
| BR-011 | 수정/삭제 WHERE = `RULE_SEQ = '<값>'` (PK 컬럼도 수정 가능) | xfdl:614 / java(Save):78, 112 |
| BR-012 | 저장 시 CHK==1 행만 대상 (gfn_checkTransaction) + filterKeyByColId 로 실제 컬럼만 | xfdl:577 / java(Save):72, 193~214 |
| BR-013 | 긴급적용(chk_option=Y) 시 Mapper 미경유 DynamicSqlExecutor 직접 — confirm + "추후 Mapper 적용" 경고 | xfdl:546~551 / java(Save):87, 120, 168 |
| BR-014 | INSERT 는 audit 8컬럼(CREATED_*/LAST_UPDATE_*), UPDATE 는 LAST_UPDATE_* 4컬럼 setAuditField | java(Save):217~231 |
| BR-015 | 검색 결과 정렬은 RULE_SEQ 오름차순 (ROW_NUMBER) + 페이징(countPerPage/currentPage) | Mapper.xml:40, 66 |
| BR-016 | 조회 컬럼 추가 전 기존 동적 컬럼(col≥3) 전수 제거 후 재빌드 | xfdl:395~400 |

비고 (BR-013): As-Is 저장 영향행 ≤ 0 시 예외 미발생(log만) — To-Be 부분실패 정책 강화 검토 (§4.5 비고 / Q-008).

---

## §7. 상태값 (ST-NNN)

| ST-NNN | 상태 | 의미 | 발생 시점 | 대응 동작 |
|---|---|---|---|---|
| ST-001 | row inserted (nativeeditor_status="inserted") | 행 추가됨 (미저장 신규) | fn_rowAdd / fn_rowCopy 직후 | 저장 시 채번 후 insert |
| ST-002 | row updated (nativeeditor_status="updated") | 기존 행 컬럼 변경 (미저장) | 동적 컬럼 셀 편집 (oncolumnchanged) | 저장 시 update |
| ST-003 | row deleted (nativeeditor_status="deleted") | 행 삭제 마킹 (미저장) | fn_rowDelete / gfn_deleteRow | 저장 시 delete |
| ST-004 | row clean | 변경 없음 | 조회 직후 | 저장 대상 아님 |
| ST-005 | row CHK=1 | 선택 행 — 빨간 배경 cssclass | 체크박스/GB-001 헤드 전체선택 | 저장/삭제 대상 |
| ST-006 | row CHK=0 | 미선택 | 기본 / 헤드 전체해제 | 제외 |
| ST-007 | 업무기준 미선택 | edt_ruleId 빈값 | 진입 / 초기 | 조회 차단 (BR-001) |
| ST-008 | 컬럼정의 로드됨 | ds_lovData 채워짐 | lov 콜백 | 동적 컬럼 빌드 가능 |
| ST-009 | 긴급적용 ON | chk_option=true | 사용자 체크 | 저장 시 confirm + DynamicSqlExecutor |
| ST-010 | search done | 조회 완료 | gfn_transaction("search") 콜백 nErrorRule==0 | "{N}건 조회 되었습니다." |
| ST-011 | save done | 저장 완료 | gfn_transaction("save") 콜백 nErrorRule==0 | "{cnt_save}건 저장 되었습니다." |
| ST-012 | export done | 엑셀 추출 완료 | gfn_transaction("search_export") 콜백 | "{N}건 Export 되었습니다." |
| ST-013 | error | 트랜잭션 오류 | nErrorRule≠0 | strErrorMsg 표시 |

---

## §8. 권한 / 접근 제어

| 항목 | 정책 | 근거 |
|---|---|---|
| 화면 접근 | (As-Is mui 자료 권한 명시 없음 — 모듈 통합 권한관리에 위임) | 분석 §5.2 |
| 조회/저장/엑셀 권한 | To-Be 외부 권한 프로세스 위임 | - |

> 본 화면 자체 권한 분기 ✗ — To-Be 외부 권한 모델(전사 정책) 위임. 업무기준 구조(masterRuleFrame) 관리 권한과 연계 정책 권장 (Q-004 와 함께 검토).

---

## §9. 팝업 / 연계 화면

### §9.1 호출(out-going) 팝업 (분석 §5.1)

| P-NNN | 호출 대상 | 트리거 | 결과 |
|---|---|---|---|
| P-001 | cmb::MasterRuleListPop.xfdl (업무기준 선택) | B-010 btn_ruleId | sRuleId/sRuleNm 세팅 → fn_lov() → fn_search() 연쇄 |
| P-002 | cmb::MasterRuleDataUploadFilePopup.xfdl (엑셀 업로드 등록) | B-007 btn_excelUp | 콜백 본문 no-op (재조회 수동) |

### §9.2 호출됨(in-coming) — 분석 범위 외

| 호출 가능 외부 화면 | 시나리오 | 결정 |
|---|---|---|
| masterRuleList / masterRuleFrame 등 형제 화면 | 업무기준 선택 후 데이터 진입 | Q-004 위임 |

---

## §10. 메시지 / 알림

### §10.1 검증 / confirm 메시지

| MSG-NNN | 트리거 | 메시지 | 유형 | 후처리 | 근거 |
|---|---|---|---|---|---|
| MSG-001 | 조회 (업무기준ID 미입력) | "업무기준 ID는 필수입니다." | warning | 조회 중단 | xfdl:389 |
| MSG-002 | 저장 검증 (PK 컬럼 null) | "{COL_NM} 항목은 필수 입력사항 입니다." | warning | 해당 셀 포커스/에디터 / 저장 중단 | xfdl:534 |
| MSG-003 | 삭제 (선택 행 없음) | "선택된 행이 없습니다." | warning | 작업 중단 | xfdl:502 |
| MSG-004 | 저장 (긴급적용 확인) | "긴급으로 적용하시겠습니까?\n추후에 반드시 Mapper파일 적용하십시오." | confirm | 취소 시 저장 중단 | xfdl:548 |

### §10.2 상태바 메시지

| MSG-NNN | 트리거 | 메시지 | 근거 |
|---|---|---|---|
| MSG-010 | search 콜백 성공 | "{n}건 조회 되었습니다." | xfdl:591 |
| MSG-011 | save 콜백 성공 | "{cnt_save}건 저장 되었습니다." | xfdl:684 |
| MSG-012 | search_export 콜백 성공 | "{n}건 Export 되었습니다." | xfdl:631 |
| MSG-013 | 콜백 오류 | strErrorMsg 그대로 표시 | xfdl:625, 648, 685 |
