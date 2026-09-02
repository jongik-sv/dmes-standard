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

# 업무기준 상세조회 (masterRuleDataList) 기능설계서

> 본 문서는 [분석리포트](./masterRuleDataList_분석리포트.md) 를 단일 원천으로 인용한다. 식별자/SQL/액션/Q-NNN 은 분석리포트 정의를 따른다.

---

## §1. 화면 개요

| 항목 | 값 |
|---|---|
| 화면 ID | masterRuleDataList |
| As-Is 화면 ID | MasterRuleDataList |
| 화면명 | 업무기준 상세조회 |
| 모듈 / 그룹 | mcm (공통관리) / cmb (업무기준 관리(원장)) |
| 메뉴 계층 | 공통관리 > 업무기준 관리(원장) > 업무기준 상세조회 |
| 화면 목적 | 업무기준(프레임)에 매핑된 실데이터(동적 테이블 `TB_MCA_<업무기준ID>`)의 동적 컬럼 **조회 전용** + 엑셀 Export + 마스터코드 셀 조회 (분석 §1) |
| 사용자 | 업무기준 데이터 조회 담당자 |
| 권한 | To-Be 외부 권한 프로세스 위임 (§8) |
| 주 사용 테이블 | TB_MCA_<업무기준ID> (동적 데이터, 런타임 인스턴스, DDL on-demand Q-001b) / TB_MCA_RULE_COL_LIST (컬럼정의, DMES-SECTION-MCA sheet134 수록) / TB_MCA_RULE_MASTER (JOIN, sheet135 26컬럼 수록) — 분석 §9 |
| 기본 동작 | 화면 진입 후 업무기준 미선택 상태 → 업무기준 선택(P-001) → lov(컬럼정의) → search 자동 연쇄 (분석 §5.1) |
| ★ 특이성 | 동적 컬럼(컬럼정의 기반 런타임 생성) + 동적 테이블명 + 5조건 LoV 검색 + 페이징 + **조회 전용(저장/CRUD 없음)** + **마스터코드 셀 클릭 팝업** (분석 §0, §3.3, §4.4) |
| ★ masterRuleData 대비 | 저장(save)·행추가/복사/삭제/취소·긴급적용·PK검증·채번·orphan SQL·DynamicSqlExecutor **모두 없음**. action 3종(search/lov/search_export). MasterCodeSelPop 셀 클릭 추가 (분석 §0, §6 비고) |

---

## §2. 화면 흐름도

```
[화면 진입]
    ↓ (xfdl:342 fn_formAfterOnload)
[fn_button — 상단(조회)/우측(엑셀다운) 메뉴 생성]
    ↓
[업무기준 미선택 — 대기]
    ↓ 업무기준 버튼(B-004) → P-001(MasterRuleListPop, oArg={sSchema:"MCAAPUSER"})
[업무기준 선택 콜백 (fn_returnRulePopupCallBack)]
    ↓ edt_ruleId/edt_ruleNm 세팅
[fn_lov — 컬럼정의(lov) 조회]   → action=lov → ds_lovData
    ↓ lov 콜백(case "lov"): cbo_lov1~5 채움 + fn_search() 자동
[fn_search — 데이터 조회]       → action=search → ds_grdMain (동적컬럼 빌드)
    ↓
[그리드 표시 (정적 SEQ + 동적 N 컬럼, 읽기 전용) + 페이징]
    ↓
사용자 액션 분기:
  ├─ 조회 (B-001)     → fn_search()           → action=search (페이징/5조건LoV)
  ├─ 엑셀다운 (B-002) → fn_excelDown()         → action=search_export → grd_Download → Excel
  ├─ 접기 (B-003)     → btn_fold_onclick       → div_search 접기/펴기
  ├─ 업무기준 (B-004) → div_search_btn_ruleId_onclick → P-001
  ├─ 마스터코드 셀클릭(GB-001) → div_main_grdMain_oncellclick → P-002(MasterCodeSelPop)
  └─ 헤드 클릭 (GB-002) → div_main_grdMain_onheadclick → 정렬
```

비고: 본 화면은 조회 전용이라 save→재조회 같은 BPMN 후속 연쇄가 없다. search/lov/search_export 는 각각 단일 task 후 End (분석 §8.4).

---

## §3. 조회 기능 (S-NNN + G-001)

### §3.1 조회조건 (S-001~S-020 — 분석 §3.2)

| 영역 | 항목 | 입력 ID | 파라미터 | 비고 |
|---|---|---|---|---|
| 업무기준 | 업무기준 ID (필수, readonly) | edt_ruleId (S-002) | pRuleId / pTable(=`TB_MCA_`+값) | 업무기준 버튼(B-004)→P-001 로만 채움 |
| 업무기준 | 업무기준명 (readonly) | edt_ruleNm (S-004) | pRuleNm (lov 송신) | P-001 콜백 세팅 |
| 조건1 | 컬럼 / 연산자 / 값 | cbo_lov1(S-006) / cbo_operator1(S-007) / edt_val1(S-008) | pWhere1 / pOperator1 / pVal1 | 컬럼=동적LoV / 연산자=LIKE,=,<=,>= |
| 조건2 | 컬럼 / 연산자 / 값 | cbo_lov2(S-009) / cbo_operator2(S-010) / edt_val2(S-011) | pWhere2 / pOperator2 / pVal2 | 동일 |
| 조건3 | 컬럼 / 연산자 / 값 | cbo_lov3(S-012) / cbo_operator3(S-013) / edt_val3(S-014) | pWhere3 / pOperator3 / pVal3 | 동일 |
| 조건4 | 컬럼 / 연산자 / 값 | cbo_lov4(S-015) / cbo_operator4(S-016) / edt_val4(S-017) | pWhere4 / pOperator4 / pVal4 | 동일 |
| 조건5 | 컬럼 / 연산자 / 값 | cbo_lov5(S-018) / cbo_operator5(S-019) / edt_val5(S-020) | pWhere5 / pOperator5 / pVal5 | 동일 |

비고 (분석 §6.1 #2 / §7.1 단계4):
- 5조건 → SQL 동적 WHERE: `AND ${pWhereN} ${pOperatorN} ${pValN}` (각 pWhereN null 아닐 때). 미입력 조건 skip.
- VARCHAR2 컬럼이면 GetMasterRuleDataList 가 `UPPER(컬럼) ... UPPER('값')` 로 래핑 (대소문자 무시 검색).
- ORDER BY RULE_SEQ 고정 (ROW_NUMBER, Mapper.xml:40).
- ★ To-Be: `${}` 치환 화이트리스트 안전화 필요 (Q-007).
- ★ masterRuleData 의 긴급적용(chk_option) 체크박스는 본 화면에 없음 (조회 전용).

### §3.2 조회 결과 그리드 G-001 (분석 §3.3) — ★동적 컬럼·읽기 전용

| col | 헤드 | 컬럼 | 표시 형식 | 편집 | 비고 |
|---:|---|---|---|---|---|
| 0 | 순번 | SEQ | 텍스트 | N | ROW_NUMBER (정적 1컬럼) |
| 1~N | (동적) | ds_lovData[i].COL_ID | COL_TYPE 별 (DATE=캘린더 / 그외 normal) | N (읽기 전용) | CODE_YN="Y" → 파란 밑줄·포인터(클릭 시 P-002) / 폭=13×COL_NM.length |

비고: 동적 컬럼은 search 콜백에서 ds_lovData 만큼 `appendContentsCol` (분석 §3.3 빌드 표). 재조회 시 col 1 이후 전수 제거 후 재빌드 (xfdl:392~396). masterRuleData 와 달리 CHK/STATUS 컬럼·PK ` * ` prefix·IN/OUT 색·edittype 이 없다.

### §3.3 조회 결과 메시지

- 정상 조회: 하단 상태바 `{ds_GetMasterRuleDataList 건수}건 조회 되었습니다.` (xfdl:449).
- 오류: `strErrorMsg` 표시 (xfdl:475).
- 조회 후 edt_val1 포커스 (xfdl:474).

---

## §4. CRUD 기능 (분석 §6 / §7)

> ★ 본 화면은 **조회 전용(R)** — Create / Update / Delete 가 모두 없다. 아래 §4.1 이 유일한 데이터 기능.

### §4.1 조회(R — SELECT)

| 항목 | 값 |
|---|---|
| 트리거 | 상단 메뉴 조회 (B-001) / 업무기준 선택 후 자동 연쇄 (lov→search, xfdl:528) |
| 동작 | fn_search (xfdl:369) → gfn_transaction(sSvcID="search") |
| 호출 SQL | GetMasterRuleDataList (#2, java:123) — 페이징 + 5조건 동적 WHERE |
| 컬럼정의 | GetMasterRuleDataList 내부에서 `TB_MCA_RULE_COL_LIST_Mapper.select`(java:51) 추가 조회 — UPPER 대상 컬럼 판정 |
| 결과 적재 | ds_grdMain ← ds_GetMasterRuleDataList (xfdl:401) + 동적 컬럼 빌드 (xfdl:451~467) |

### §4.2 엑셀 Export (조회의 부가 — search_export)

| 항목 | 값 |
|---|---|
| 트리거 | 우측 메뉴 엑셀다운 (B-002) → fn_excelDown (xfdl:425) |
| 선행 | edt_ruleId 값 없으면 즉시 return (xfdl:427) |
| 호출 SQL | GetMasterRuleDataListExport (#3) — 전건(페이징 없음) |
| 동작 | ds_grdDownload 에 동적 컬럼 빌드(xfdl:482~494) 후 `gfn_exportExcel(grd_Download, titletext)` (xfdl:496) |
| 결과 메시지 | `{ds_GetMasterRuleDataListExport 건수}건 Export 되었습니다.` (xfdl:481) |

### §4.3 신규(C) / 수정(U) / 삭제(D) — 해당 없음

- 본 화면은 조회 전용 — INSERT/UPDATE/DELETE SQL·저장 트랜잭션·행 편집 모두 없음 (분석 §6 / §7 / §9.1 비고). masterRuleData 와의 핵심 차이.

---

## §5. 버튼 액션

### §5.1 server-side action 매트릭스 (분석 §4.6)

| action | 버튼 | sInDatasets | sOutDatasets | 후속 BPMN 경로 |
|---|---|---|---|---|
| search | B-001 btn_search | ds_srch=ds_srch | ds_grdMain=ds_GetMasterRuleDataList | Gateway → UserTask_067lppc(Main 조회) → End |
| lov | B-004 콜백 fn_lov | "" | ds_lovData=ds_GetRuleColList | Gateway → Task_0ru18qa(lov목록 조회) → End |
| search_export | B-002 btn_excelDown | "" | ds_grdDownload=ds_GetMasterRuleDataListExport | Gateway → Task_0ifp7u0(엑셀 Export) → End |

### §5.2 client-side 액션

| 액션 | 버튼 | 동작 |
|---|---|---|
| fold | B-003 | div_search 접기/펴기 (gfn_fold) |
| ruleId 선택 | B-004 | P-001(업무기준 선택 팝업) 호출, oArg={sSchema:"MCAAPUSER"} |
| 마스터코드 셀 클릭 | GB-001 | CODE_YN="Y" 셀이면 P-002(MasterCodeSelPop) 호출 ({sCodeId, sCodeNm, sCodeVal}) |
| 그리드 헤드 클릭 | GB-002 | 정렬 (gfn_commonOnheadclick) |

---

## §6. 비즈니스 룰

| BR-NNN | 룰 | 근거 |
|---|---|---|
| BR-001 | 업무기준 ID(edt_ruleId) 는 필수 — 미선택 시 조회 차단 ("업무기준 ID는 필수입니다.") | xfdl:385~388 |
| BR-002 | 업무기준 ID 는 직접 입력 불가(readonly) — P-001(MasterRuleListPop) 선택으로만 채움 | xfdl:23, 540~549 |
| BR-003 | 업무기준 선택 시 lov(컬럼정의) → search 자동 연쇄 | xfdl:563 / xfdl:528 |
| BR-004 | 조회 대상 테이블명 = `TB_MCA_` + 업무기준 ID (동적) | xfdl:402 / Mapper.xml:42 |
| BR-005 | 그리드 컬럼은 컬럼정의(ds_lovData) 기반 런타임 동적 생성 (개수/이름/타입 가변) | xfdl:451~467 |
| BR-006 | DATE 타입 컬럼은 캘린더(yyyy-MM-dd) 표시 | xfdl:455~457 |
| BR-007 | VARCHAR2 컬럼 검색은 `UPPER()` 양측 래핑 (대소문자 무시) | java:57~80 |
| BR-008 | 마스터코드 컬럼(CODE_YN="Y") 은 파란 밑줄·포인터로 표시되고, 셀 클릭 시 마스터코드 조회 팝업(P-002) 호출 | xfdl:463~466, 583~595 |
| BR-009 | 검색 결과 정렬은 RULE_SEQ 오름차순 (ROW_NUMBER) + 페이징(countPerPage/currentPage) | Mapper.xml:40, 66 |
| BR-010 | 조회 컬럼 추가 전 기존 동적 컬럼(col≥1) 전수 제거 후 재빌드 | xfdl:392~396 |
| BR-011 | 엑셀 Export 는 업무기준 ID 있을 때만 (없으면 즉시 return) + 전건(페이징 없음) | xfdl:427 / Mapper.xml:69~73 |
| BR-012 | 본 화면은 조회 전용 — 저장/행편집/삭제 기능 없음 (READ only) | 분석 §4.3 / §6 / §7 |

---

## §7. 상태값 (ST-NNN)

| ST-NNN | 상태 | 의미 | 발생 시점 | 대응 동작 |
|---|---|---|---|---|
| ST-001 | 업무기준 미선택 | edt_ruleId 빈값 | 진입 / 초기 | 조회 차단 (BR-001) |
| ST-002 | 컬럼정의 로드됨 | ds_lovData 채워짐 | lov 콜백(case "lov") | 동적 컬럼 빌드 가능 + cbo_lov1~5 채움 |
| ST-003 | search done | 조회 완료 | gfn_transaction("search") 콜백 nErrorRule==0 | "{N}건 조회 되었습니다." + 동적 컬럼 빌드 + edt_val1 포커스 |
| ST-004 | export done | 엑셀 추출 완료 | gfn_transaction("search_export") 콜백 | "{N}건 Export 되었습니다." |
| ST-005 | 마스터코드 셀 활성 | CODE_YN="Y" 컬럼 | 동적 컬럼 빌드 시 | 파란 밑줄·포인터 / 클릭 시 P-002 |
| ST-006 | error | 트랜잭션 오류 | nErrorRule≠0 | strErrorMsg 표시 |

---

## §8. 권한 / 접근 제어

| 항목 | 정책 | 근거 |
|---|---|---|
| 화면 접근 | (As-Is mui 자료 권한 명시 없음 — 모듈 통합 권한관리에 위임) | 분석 §5.2 |
| 조회/엑셀 권한 | To-Be 외부 권한 프로세스 위임 | - |

> 본 화면 자체 권한 분기 ✗ — To-Be 외부 권한 모델(전사 정책) 위임. 업무기준 구조(masterRuleList/masterRuleData) 관리 권한과 연계 정책 권장 (Q-004 와 함께 검토).

---

## §9. 팝업 / 연계 화면

### §9.1 호출(out-going) 팝업 (분석 §5.1)

| P-NNN | 호출 대상 | 트리거 | 인자 | 결과 |
|---|---|---|---|---|
| P-001 | cmb::MasterRuleListPop.xfdl (업무기준 선택) | B-004 btn_ruleId | `{ sSchema : "MCAAPUSER" }` | sRuleId/sRuleNm 세팅 → fn_lov() → fn_search() 연쇄 |
| P-002 | cma::MasterCodeSelPop.xfdl (마스터코드 조회) | GB-001 셀 클릭 (CODE_YN="Y") | `{ sCodeId, sCodeNm, sCodeVal }` | 콜백(fn_returnMasterCodePopupCallBack) 본문 미정의 — no-op (단순 코드 조회) |

### §9.2 호출됨(in-coming) — 분석 범위 외

| 호출 가능 외부 화면 | 시나리오 | 결정 |
|---|---|---|
| masterRuleList / masterRuleData 등 형제 화면 | 업무기준 선택 후 데이터 조회 진입 | Q-004 위임 |

---

## §10. 메시지 / 알림

### §10.1 검증 / confirm 메시지

| MSG-NNN | 트리거 | 메시지 | 유형 | 후처리 | 근거 |
|---|---|---|---|---|---|
| MSG-001 | 조회 (업무기준ID 미입력) | "업무기준 ID는 필수입니다." | warning | 조회 중단 | xfdl:386 |

비고: masterRuleData 의 PK 필수검증(MSG-002)·삭제 선택없음(MSG-003)·긴급적용 confirm(MSG-004) 은 본 화면에 없음 (조회 전용).

### §10.2 상태바 메시지

| MSG-NNN | 트리거 | 메시지 | 근거 |
|---|---|---|---|
| MSG-010 | search 콜백 성공 | "{n}건 조회 되었습니다." | xfdl:449 |
| MSG-011 | search_export 콜백 성공 | "{n}건 Export 되었습니다." | xfdl:481 |
| MSG-012 | 콜백 오류 | strErrorMsg 그대로 표시 | xfdl:475, 498 |
