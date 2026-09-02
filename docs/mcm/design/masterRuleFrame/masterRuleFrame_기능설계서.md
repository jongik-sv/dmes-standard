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

# 업무기준 구조관리 (masterRuleFrame) 기능설계서

> 본 문서는 [분석리포트](./masterRuleFrame_분석리포트.md) 를 단일 원천으로 인용한다.

---

## §1. 화면 개요

| 항목 | 값 |
|---|---|
| 화면 ID | masterRuleFrame |
| As-Is 화면 ID | MasterRuleFrame |
| 화면명 | 업무기준 구조관리 |
| 모듈 / 그룹 | mcm (공통관리) / cmb (업무기준 관리(원장)) |
| 메뉴 계층 | 공통관리 > 업무기준 관리(원장) > 업무기준 구조관리 |
| 화면 목적 | 업무기준(RULE) 의 IN(조건항목) / OUT(결과항목) 컬럼 구조(프레임) 정의·관리 (TB_MCA_RULE_COL_LIST CRUD, RULE_ID 단위 delete-all → insert) |
| 사용자 | 업무기준(인터페이스/마스터 규칙) 운영 담당자 |
| 권한 | To-Be 외부 권한 프로세스 위임 (§8) |
| 주 사용 테이블 | MCAAPUSER.TB_MCA_RULE_COL_LIST (PK = (RULE_ID, COL_SEQ) — sheet134) / MCAAPUSER.TB_MCA_RULE_MASTER (JOIN — sheet135) — 분석리포트 §9 (정본 DMES-SECTION-MCA) |
| 기본 동작 | 화면 로드 → 업무기준 팝업(P-001) 선택 → 선택 콜백에서 자동 조회 (분석리포트 §5.1 / xfdl:419) |

비고: As-Is 는 onload 시 자동 조회 ✗ — edt_ruleId 가 비어 있어 조회 무의미. 업무기준 선택(P-001) 콜백에서 ruleId 설정 후 fn_search() 호출 (xfdl:418~419).

---

## §2. 화면 흐름도

```
[화면 진입]
    ↓ (xfdl:233 gfn_formOnLoad)
[fn_button — 상단 메뉴 생성 (조회/저장)]
    ↓
[ds_div / ds_colType 콤보 "SELECT" prepend]
    ↓
[사용자: 업무기준 버튼(B-003) 클릭 → P-001 MasterRuleListPop]
    ↓ (콜백 fn_returnMasterPopupCallBack)
[edt_ruleId / edt_ruleNm 설정 + this.ruleId 설정 → fn_search 자동]
    ↓
[IN 그리드(grd_in) + OUT 그리드(grd_out) 표시 + 항목 수 표시]
    ↓
사용자 액션 분기:
  ├─ 조회 (B-001)         → fn_search()    → action=search
  ├─ 저장 (B-002)         → fn_save()      → 클라이언트 검증 (IN 5 + OUT 5 필수) → action=save
  ├─ 업무기준 (B-003)     → P-001 팝업      → 콜백 후 fn_search()
  ├─ 기초데이터등록 (B-004)→ P-002 팝업      → 콜백 후 fn_search()
  ├─ 행추가 IN (B-005)    → ds_grdIn.addRow() (client-side; RULE_ID/IO_FLAG=IN set)
  ├─ 행삭제 IN (B-006)    → ds_grdIn.deleteRow(rowposition) (client-side)
  ├─ 행추가 OUT (B-007)   → ds_grdOut.addRow() (client-side; RULE_ID/IO_FLAG=OUT set)
  ├─ 행삭제 OUT (B-008)   → ds_grdOut.deleteRow(rowposition) (client-side)
  └─ 접기 (B-009)         → btn_fold_onclick → div_search 접기/펴기
```

비고: search / save action 종료 시 BPMN 정의에 따라 Task_1j1g5cn(조회 IN) + Task_1c4n8uv(조회 OUT) 가 자동 후속 실행되어 ds_grdIn / ds_grdOut 갱신 (분석리포트 §8.4).

---

## §3. 조회 기능 (S-NNN + G-001/G-002)

### §3.1 조회조건 (S-001~S-004 — 분석리포트 §3.2)

| 항목 | 라벨 | 입력 ID | 파라미터 | 검증 | 매핑 SQL WHERE |
|---|---|---|---|---|---|
| S-002 | 업무기준 ID | edt_ruleId | pRuleId | readonly (P-001 콜백으로만 설정, xfdl:26) | `RMASTER.RULE_ID = #{pRuleId}` (if not null, Mapper.xml:24/47) |
| S-004 | 업무기준명 | edt_ruleNm | (표시 전용) | readonly (P-001 콜백으로 설정, xfdl:28) | (SQL 미사용 — 표시만) |

비고:
- 조회조건은 업무기준 ID 단일 키. 미입력시 if 블록 skip → 전체 업무기준 조회 (단, As-Is 는 ruleId 선택 전 조회 미발생).
- 두 SELECT 모두 ORDER BY COL_SEQ 고정 (Mapper.xml:27/50).
- IO_FLAG 는 SQL 내 고정 ('IN' / 'OUT') — 사용자 입력 ✗.

### §3.2 조회 결과 그리드 G-001 (IN) / G-002 (OUT) (분석리포트 §3.3)

| col | 헤드 | 컬럼 | 표시 형식 | 편집 가능 | 비고 |
|---:|---|---|---|---|---|
| 0 | 순번 | (expr currow+1) | 일련번호 | N | 화면 일련번호 |
| 1 | 한글항목명 | COL_NM | 텍스트 (max 100) | Y | 필수 |
| 2 | 영문항목명 | COL_ID | 텍스트 (max 30) | Y | 필수 |
| 3 | 코드여부 | MASTER_CODE_DIV | combo (ds_div: N/Y) | Y | 필수 (OUT 은 null 시 "선택") |
| 4 | 유형 ("사용여부" 병합) | COL_TYPE | combo (ds_colType: DATE/NUMBER/VARCHAR2) | Y | 필수 |
| 5 | 총길이 ("사용여부" 병합) | COL_LEN | mask (정수, max 5) | Y | 필수 |
| 6 | 소수점길이 ("사용여부" 병합) | COL_PREC_LEN | mask (정수, max 5) | Y | (선택) |

비고: IN(G-001) / OUT(G-002) 동일 컬럼 구조. "사용여부" 는 col 4~6 상위 병합 헤더 (As-Is 라벨 보존 — 분석리포트 §3.3).

### §3.3 조회 결과 메시지 / 항목 수 표시

- IN 조건항목 수: mae_inCnt = ds_grdIn.rowcount (xfdl:380, 390).
- OUT 결과항목 수: mae_cntOut = ds_grdOut.rowcount (xfdl:381, 391).
- 정상 조회 시 하단 상태바: `{ds_GetRuleColInList 건수}건 조회 되었습니다.` (xfdl:382).
- 오류 시: `strErrorMsg` 표시 (xfdl:384).

---

## §4. CRUD 기능 (분석리포트 §6 / §7)

### §4.1 신규(C — INSERT)

| 항목 | 값 |
|---|---|
| 트리거 | IN 행추가 (B-005, xfdl:450) / OUT 행추가 (B-007, xfdl:468) |
| 동작 (IN) | ds_grdIn.addRow() / RULE_ID = this.ruleId / IO_FLAG = "IN" / MASTER_CODE_DIV = "" / COL_TYPE = "" (xfdl:453~458) |
| 동작 (OUT) | ds_grdOut.addRow() / RULE_ID = this.ruleId / IO_FLAG = "OUT" / MASTER_CODE_DIV = "" / COL_TYPE = "" (xfdl:471~476) |
| 가드 | this.ruleId == null 이면 행추가 중단 (xfdl:452, 470) |
| 저장 시 처리 | delete-all (RULE_ID 단위) 후 ds_grdIn + ds_grdOut 전량 insert (java:31~91) |

### §4.2 조회(R — SELECT)

| 항목 | 값 |
|---|---|
| 트리거 | 상단 메뉴 조회 (B-001) / P-001·P-002 콜백 (xfdl:419, 440) |
| 동작 | fn_search (xfdl:249) → gfn_transaction(sSvcID="search") |
| 호출 SQL | GetRuleColInList (Mapper.xml:7~28) + GetRuleColOutList (Mapper.xml:30~51, BPMN 후행 자동) |
| 결과 적재 | ds_grdIn ← ds_GetRuleColInList / ds_grdOut ← ds_GetRuleColOutList (xfdl:254) |
| 전처리 | this.ds_grdIn.clearData() (xfdl:258) |

### §4.3 수정(U — UPDATE)

| 항목 | 값 |
|---|---|
| 트리거 | 그리드 셀 직접 편집 (col 1~6 — COL_NM/COL_ID/MASTER_CODE_DIV/COL_TYPE/COL_LEN/COL_PREC_LEN) |
| 행 상태 | nativeeditor_status = "updated" (저장 시 무관 — delete-all 후 전량 재삽입) |
| 저장 시 SQL | (별도 UPDATE 없음) — delete-all → insert 로 일괄 재구성 (java:31~91) |

비고: As-Is 는 수정 행을 별도 UPDATE 하지 않고, RULE_ID 전체를 삭제 후 화면 현재 IN/OUT 행을 전량 재삽입하여 결과적으로 수정 반영 (delete-all-then-insert).

### §4.4 삭제(D — DELETE)

| 항목 | 값 |
|---|---|
| 트리거 | IN 행삭제 (B-006, xfdl:462) / OUT 행삭제 (B-007 → 정정: B-008, xfdl:480) |
| 동작 (IN) | ds_grdIn.deleteRow(ds_grdIn.rowposition) (xfdl:464) — client-side 즉시 삭제 |
| 동작 (OUT) | ds_grdOut.deleteRow(ds_grdOut.rowposition) (xfdl:482) |
| 저장 시 처리 | 화면에서 삭제된 행은 저장 시 ds_grd* 에 없으므로 재삽입 대상 제외 → DB 반영 (delete-all 후 미존재) |

비고: 행삭제는 client-side 즉시 삭제 (deleteRow). 저장 시 delete-all → insert 로 DB 정합. nativeeditor_status="deleted" 행은 insert 루프에서 명시적으로 제외 (java:45, 70).

### §4.5 저장 통합 (B-002)

| 단계 | 동작 | 근거 |
|---|---|---|
| 가드 | this.ruleId == null 이면 저장 중단 (xfdl:264) |
| 검증 IN-1 (한글항목명) | ds_grdIn 전 행 COL_NM null 체크 → "한글항목명을 입력해 주십시오." + 셀 포커스 (xfdl:267~275) |
| 검증 IN-2 (영문항목명) | ds_grdIn 전 행 COL_ID null 체크 → "영문항목명을 입력해 주십시오." (xfdl:276~284) |
| 검증 IN-3 (코드여부) | ds_grdIn 전 행 MASTER_CODE_DIV null 체크 → "코드여부를 선택해 주십시오." (xfdl:285~293) |
| 검증 IN-4 (유형) | ds_grdIn 전 행 COL_TYPE null 체크 → "유형을 선택해 주십시오." (xfdl:294~302) |
| 검증 IN-5 (총길이) | ds_grdIn 전 행 COL_LEN null 체크 → "총길이를 입력해 주십시오." (xfdl:303~311) |
| 검증 OUT-1~5 | ds_grdOut 전 행에 대해 IN 과 동일 5종 검증 (COL_NM/COL_ID/MASTER_CODE_DIV/COL_TYPE/COL_LEN) | xfdl:314~358 |
| 송신 | sInDatasets = "ds_grdIn=ds_grdIn ds_grdOut=ds_grdOut" (전체) / sArgument = pRuleId (xfdl:363~365) |
| 서버 처리 | SaveMasterRuleColList.run() — delete-all (RULE_ID) → IN insert 루프 → OUT insert 루프 (java:31~91) |
| 트랜잭션 | insert 영향행 ≤ 0 시 throw → IllegalTaskException → 전체 롤백 (java:58~63, 83~88, 95~99) |
| 결과 메시지 | `{cnt_save}건 저장 되었습니다.` (xfdl:392) |

비고: 검증은 IN 5종 → OUT 5종 순차. 소수점길이(COL_PREC_LEN) 는 필수 검증 ✗ (As-Is — 선택 입력).

---

## §5. 버튼 액션

### §5.1 server-side action 매트릭스

| action | 버튼 | sInDatasets | sOutDatasets | 후속 BPMN 경로 |
|---|---|---|---|---|
| search | B-001 btn_search | "" | ds_grdIn=ds_GetRuleColInList ds_grdOut=ds_GetRuleColOutList | Gateway → Task_1j1g5cn(조회 IN) → Task_1c4n8uv(조회 OUT) → End |
| save | B-002 btn_save | ds_grdIn=ds_grdIn ds_grdOut=ds_grdOut | ds_grdIn=ds_GetRuleColInList ds_grdOut=ds_GetRuleColOutList | Gateway → SaveMasterRuleColList(저장) → Task_1j1g5cn(조회 IN) → Task_1c4n8uv(조회 OUT) → End |

### §5.2 client-side 액션

| 액션 | 버튼 | 동작 |
|---|---|---|
| 업무기준 팝업 | B-003 btn_ruleIdPop | P-001 MasterRuleListPop 호출 (sSchema=MCA_SOURCE) → 콜백 후 fn_search |
| 기초데이터등록 팝업 | B-004 btn_ruleCol | P-002 MasterRuleFrameColListPopup 호출 (sRuleId/sRuleNm) → 콜백 후 fn_search (선행: ruleId 선택 가드) |
| 행추가 IN | B-005 | ds_grdIn.addRow() + RULE_ID/IO_FLAG=IN set |
| 행삭제 IN | B-006 | ds_grdIn.deleteRow(rowposition) |
| 행추가 OUT | B-007 | ds_grdOut.addRow() + RULE_ID/IO_FLAG=OUT set |
| 행삭제 OUT | B-008 | ds_grdOut.deleteRow(rowposition) |
| 접기 | B-009 | div_search 접기/펴기 토글 (gfn_fold) |

---

## §6. 비즈니스 룰

| BR-NNN | 룰 | 근거 |
|---|---|---|
| BR-001 | 업무기준 컬럼(RULE_COL) 은 업무기준 마스터(TB_MCA_RULE_MASTER) 에 종속 — RULE_ID FK 관계 | Mapper.xml:22, 45 |
| BR-002 | 컬럼은 IN(조건항목) / OUT(결과항목) 2 구분 (IO_FLAG) — 좌/우 그리드 분리 관리 | xfdl:455, 473 / Mapper.xml:26, 49 |
| BR-003 | 저장 = RULE_ID 단위 전량 삭제 후 IN+OUT 전량 재삽입 (delete-all-then-insert) | java:31~91 |
| BR-004 | COL_SEQ 는 IN/OUT 통합 단일 순번 (IN N개 후 OUT 이 N+1 부터) — Java 저장 시 재계산 | java:51, 64, 76, 89 |
| BR-005 | RULE_VER 빈값이면 "1" 로 보정 후 저장 | java:53~55, 78~80 |
| BR-006 | 저장 전 필수 입력 (IN/OUT 각 행): COL_NM, COL_ID, MASTER_CODE_DIV, COL_TYPE, COL_LEN — 5종 누락 차단 | xfdl:267~358 |
| BR-007 | 소수점길이(COL_PREC_LEN) 는 필수 ✗ (선택 입력) | xfdl 검증 부재 |
| BR-008 | 영문항목명(COL_ID) max 30자 / 한글항목명(COL_NM) max 100자 — 그리드 editmaxlength | xfdl:75~76, 124~125 |
| BR-009 | 총길이/소수점길이 = 정수만 입력 (mask `##,##9`, maskeditlimitbymask=integer, max 5자리) | xfdl:79~80, 128~129 |
| BR-010 | 코드여부(MASTER_CODE_DIV) = N / Y 콤보 (ds_div), 유형(COL_TYPE) = DATE/NUMBER/VARCHAR2 콤보 (ds_colType) | xfdl:178~213 |
| BR-011 | 행추가 시 업무기준(ruleId) 미선택이면 추가 불가 | xfdl:452, 470 |
| BR-012 | 저장 시 업무기준(ruleId) 미선택이면 저장 불가 | xfdl:264 |
| BR-013 | 기초데이터등록 팝업(P-002) 진입 전 업무기준 선택 필수 ("업무기준 선택 후 진행해주세요.") | xfdl:426~429 |
| BR-014 | 저장 insert 영향행 ≤ 0 인 경우 즉시 예외 → 전체 트랜잭션 롤백 (delete 포함) | java:58~63, 83~88 |
| BR-015 | delete 반환값 미검증 (검증 블록 주석) — 삭제 실패해도 진행 (As-Is 보존) | java:35~40 |
| BR-016 | 검색 결과 정렬은 COL_SEQ 오름차순 고정 | Mapper.xml:27, 50 |
| BR-017 | 모든 INSERT = mcm-core `McmAuditEntity` audit 컬럼 (C_*/U_*/VER) 자동 주입 (To-Be) | 분석리포트 §9.4 / §11 |

---

## §7. 상태값 (ST-NNN)

| ST-NNN | 상태 | 의미 | 발생 시점 | 대응 동작 |
|---|---|---|---|---|
| ST-001 | ruleId null | 업무기준 미선택 | 화면 진입 직후 | 행추가/저장 차단 (BR-011/012) |
| ST-002 | ruleId 선택됨 | 업무기준 확정 | P-001 콜백 (xfdl:418) | fn_search 자동 호출 |
| ST-003 | row inserted (IN/OUT 행추가) | 미저장 신규 행 | fn_rowAdd (xfdl:453/471) | 저장 시 insert 대상 |
| ST-004 | row deleted (행삭제) | client 삭제 | fn_rowDelete (xfdl:464/482) | 저장 시 재삽입 제외 |
| ST-005 | search done | 조회 완료 | gfn_transaction("search") 콜백 nErrorRule==0 | mae_inCnt/mae_cntOut 갱신 + "{N}건 조회 되었습니다." |
| ST-006 | save done | 저장 완료 | gfn_transaction("save") 콜백 nErrorRule==0 | mae_inCnt/mae_cntOut 갱신 + "{cnt_save}건 저장 되었습니다." |
| ST-007 | error | 트랜잭션 오류 | nErrorRule≠0 | 하단 상태바 strErrorMsg 표시 |

---

## §8. 권한 / 접근 제어

| 항목 | 정책 | 근거 |
|---|---|---|
| 화면 접근 | (As-Is mui 자료 권한 명시 없음 — 모듈 통합 권한관리 화면에 위임) | (분석 범위 외) |
| 조회 권한 | 화면 접근자 모두 | To-Be 외부 권한 프로세스 위임 |
| 저장 권한 | To-Be 외부 권한 프로세스 위임 | - |
| 행추가/삭제 / 팝업 권한 | To-Be 외부 권한 프로세스 위임 | - |

> 본 화면 자체 권한 분기 ✗ — To-Be 외부 권한 모델 (전사 정책) 위임 (사용자 결정). 본 화면이 업무기준(TB_MCA_RULE_MASTER) 종속 구조를 다루므로, 형제 화면 (MasterRuleList / MasterRuleData) 접근 권한자와 동일 정책으로 통합 권장.

---

## §9. 팝업 / 연계 화면

### §9.1 호출(out-going) 팝업

| P-NNN | 호출 대상 | 트리거 | 인자 | 결과 |
|---|---|---|---|---|
| P-001 | cmb::MasterRuleListPop.xfdl (업무기준 선택) | B-003 btn_ruleIdPop | { sSchema: "MCA_SOURCE" } | rtVal.sRuleId/sRuleNm → edt_ruleId/edt_ruleNm + ruleId 설정 → fn_search (xfdl:411~421) |
| P-002 | cmb::MasterRuleFrameColListPopup.xfdl (업무기준 컬럼 등록) | B-004 btn_ruleCol | { sRuleId, sRuleNm } | fn_search 재조회 (xfdl:439~441) — 선행: ruleId 선택 가드 |

본 화면은 위 2 팝업을 직접 호출 (out-going). 두 팝업 화면 자체는 별도 phase 산출물.

### §9.2 호출됨(in-coming) 추정 — 분석 범위 외

| 호출 가능 외부 화면 | 호출 시나리오 | 결정 |
|---|---|---|
| MasterRuleList (업무기준 목록조회) | 업무기준 선택 후 구조관리로 진입 가능성 | **[확인필요: Q-003]** — 형제 화면 분석 phase |

---

## §10. 메시지 / 알림

### §10.1 검증 메시지

| MSG-NNN | 트리거 | 메시지 | 유형 | 후처리 | 근거 |
|---|---|---|---|---|---|
| MSG-001 | IN/OUT 저장 검증 (COL_NM null) | "한글항목명을 입력해 주십시오." | warning | 해당 행 포커스 / col 1 셀 이동 / 저장 중단 | xfdl:269, 316 |
| MSG-002 | IN/OUT 저장 검증 (COL_ID null) | "영문항목명을 입력해 주십시오." | warning | 해당 행 포커스 / col 2 셀 이동 / 저장 중단 | xfdl:278, 325 |
| MSG-003 | IN/OUT 저장 검증 (MASTER_CODE_DIV null) | "코드여부를 선택해 주십시오." | warning | 해당 행 포커스 / col 3 셀 이동 / 저장 중단 | xfdl:287, 334 |
| MSG-004 | IN/OUT 저장 검증 (COL_TYPE null) | "유형을 선택해 주십시오." | warning | 해당 행 포커스 / col 4 셀 이동 / 저장 중단 | xfdl:296, 343 |
| MSG-005 | IN/OUT 저장 검증 (COL_LEN null) | "총길이를 입력해 주십시오." | warning | 해당 행 포커스 / col 5 셀 이동 / 저장 중단 | xfdl:305, 352 |
| MSG-006 | 기초데이터등록 팝업 가드 (ruleId 미선택) | "업무기준 선택 후 진행해주세요." | warning | 팝업 미오픈 / return false | xfdl:427 |

### §10.2 상태바 메시지

| MSG-NNN | 트리거 | 메시지 | 근거 |
|---|---|---|---|
| MSG-010 | search 콜백 성공 | "{n}건 조회 되었습니다." (n = ds_GetRuleColInList 건수) | xfdl:382 |
| MSG-011 | save 콜백 성공 | "{cnt_save}건 저장 되었습니다." | xfdl:392 |
| MSG-012 | 콜백 오류 (search/save) | strErrorMsg 그대로 표시 | xfdl:384, 394 |

---

## §11. 특이사항 / 설계 결정

| # | 항목 | 결정 / 처리 |
|---|---|---|
| 1 | To-Be 테이블 정본 확정 (Q-001 Resolved) | TB_MCA_RULE_COL_LIST (MCAAPUSER, sheet134) / TB_MCA_RULE_MASTER (MCAAPUSER, sheet135) 가 정본 DMES-SECTION-MCA 정의서에 **존재** (종전 MCM 정의서 오참조 정정). PK=(RULE_ID,COL_SEQ) / audit=mcm-core McmAuditEntity 9 (분석리포트 §0/§9) |
| 2 | delete-all-then-insert | 저장 = RULE_ID 전체 삭제 후 IN+OUT 전량 재삽입 — As-Is 보존 (분석리포트 §7.2) |
| 3 | orphan 핸들러 mae_inCnt_onchanged | 바인딩만 정의 ✗ → To-Be 제거 (분석리포트 §3.5) |
| 4 | "사용여부" 병합 헤더 의미 불일치 | 상위 헤더 "사용여부" + 하위 유형/총길이/소수점길이 — As-Is 보존 (분석리포트 §3.3) |
| 5 | LoV 하드코딩 | ds_div / ds_colType 정적 — 보존 vs 공통코드 이관 **[확인필요: Q-004]** |
| 6 | delete 반환값 미검증 | 주석 처리 블록 As-Is 보존 (분석리포트 §7.2) |
