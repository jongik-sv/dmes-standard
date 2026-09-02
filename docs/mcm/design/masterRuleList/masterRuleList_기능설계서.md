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

# 업무기준 목록조회 (masterRuleList) 기능설계서

> 본 문서는 [분석리포트](./masterRuleList_분석리포트.md) 를 단일 원천으로 인용한다.

---

## §1. 화면 개요

| 항목 | 값 |
|---|---|
| 화면 ID | masterRuleList |
| As-Is 화면 ID | MasterRuleList |
| 화면명 | 업무기준 목록조회 |
| 모듈 / 그룹 | mcm (공통관리) / cmb (업무기준 관리(원장)) |
| 메뉴 계층 | 공통관리 > 업무기준 관리(원장) > 업무기준 목록조회 |
| 화면 목적 | 업무기준 마스터(TB_MCA_RULE_MASTER, PK = RULE_ID) 의 활성 목록 조회 및 등록/수정(저장) 관리 |
| 사용자 | 업무기준 마스터 운영 담당자 |
| 권한 | To-Be 외부 권한 프로세스 위임 (§8) |
| 주 사용 테이블 | TB_MCA_RULE_MASTER (PK = RULE_ID, 단일) |
| 페이지 유형 | C (조회 + 저장) |
| serviceId / pageId / pageName | masterRuleList (3 동일 단일 토큰) |
| 기본 동작 | 화면 로드 → 자동 조회 (분석리포트 §7 — onload 후 `fn_search()` 호출, xfdl:132) |

---

## §2. 화면 흐름도

```
[화면 진입]
    ↓ (xfdl:124 gfn_formOnLoad → fn_formAfterOnload xfdl:127)
[fn_button — 상단(조회/저장) / 우측(행추가/행삭제/엑셀다운) 메뉴 생성]
    ↓
[fn_search — 조회 자동 호출 (xfdl:132)]
    ↓
[그리드 표시]
    ↓
사용자 액션 분기:
  ├─ 조회 (B-001)   → fn_search()        → action=search
  ├─ 저장 (B-002)   → fn_save()          → fn_checkSave (변경여부 + RULE_ID 필수) → confirm → action=save
  ├─ 행추가 (B-003) → fn_rowAdd()        → ds_grdMain.addRow() + RULE_TP='A'/USE_TP='Y'/RULE_VER='1'/담당자=로그인사번 (client-side)
  ├─ 행삭제 (B-004) → fn_rowDelete()     → 신규행만 deleteRow (기존행은 경고) (client-side)
  ├─ 엑셀다운 (B-005)→ fn_excelDown()     → 그리드 → Excel
  └─ 접기 (B-006)   → btn_fold_onclick   → div_search 접기/펴기
```

비고:
- search action 종료 시 BPMN 정의에 따라 Task_2(Main조회) 만 실행 (전체조회 후행 없음 — masterCategoryMng 과 차이). save action 종료 시 SaveMasterRule(메인저장) → Task_2(Main조회) 자동 후속 실행으로 ds_grdMain 갱신.
- 분석리포트 §3.2: edt_ruleNm 의 `onkeydown` 핸들러는 선언만 있고 본문 부재 (Q-008) — Enter 검색 미구현, To-Be 미반영.

---

## §3. 조회 기능 (S-NNN + G-001)

### §3.1 조회조건 (S-001~S-004 — 분석리포트 §3.2)

| 항목 | 라벨 | 입력 ID | 파라미터 | 검증 | 매핑 SQL WHERE |
|---|---|---|---|---|---|
| S-002 | 업무기준 ID | edt_ruleId | pRuleId | (자유 텍스트, xfdl:23) | `UPPER(RULE_ID) LIKE UPPER('%' \|\| #{pRuleId} \|\| '%')` (Mapper.xml:23) |
| S-004 | 업무기준명 | edt_ruleNm | pRuleNm | (자유 텍스트, xfdl:25) | `UPPER(RULE_NM) LIKE UPPER('%' \|\| #{pRuleNm} \|\| '%')` (Mapper.xml:26) |

비고:
- 2 항목 모두 LIKE 부분일치 + 양변 UPPER (대소문자 무시). 미입력 시 해당 if 블록 skip → 전체(활성) 조회.
- 고정 WHERE: `RULE_ID != NVL(OLD_RULE_ID,'ZZZZ0000')` (이력행 제외, Mapper.xml:21) + `NVL(USE_TP,'N') != 'N'` (활성만, Mapper.xml:28). To-Be 보존 (Q-009).
- ORDER BY RULE_ID 고정 (Mapper.xml:29).
- As-Is `text="USD"` 초기값 보존 (사용자 결정).

### §3.2 조회 결과 그리드 G-001 (분석리포트 §3.3 — 11 cols)

| col | 헤드 | 컬럼 | 표시 형식 | 편집 가능 | 비고 |
|---:|---|---|---|---|---|
| 0 | 구분 | STATUS | image | N | Nexacro auto row state — To-Be FE 동일 구현 (사용자 결정) |
| 1 | 순번 | (자동) | 일련번호 (currow+1) | N | 화면 일련번호 |
| 2 | 업무기준ID | RULE_ID | 텍스트 | Y (신규행만) | 기존행 PK 변경 불가 (As-Is 정책 보존) |
| 3 | 업무기준명 | RULE_NM | 텍스트 (좌측 정렬) | Y (신규행만) | 신규행 편집 / NOT NULL |
| 4 | 설명 | RULE_DESC | 텍스트 (좌측 정렬) | Y (신규행만) | 신규행 편집 |
| 5 | 사용여부 | USE_TP | 텍스트 (Y/N) | N | rowAdd 시 'Y' |
| 6 | Version | RULE_VER | 숫자 | N | rowAdd 시 '1' / editinputtype=number |
| 7 | 담당자 | RULE_OWNER_EMP_NO | 텍스트 | N | rowAdd 시 로그인 사번 |
| 8 | 시작일자 | CREATION_TIMESTAMP | datetime (yyyy-MM-dd HH:mm:ss) | N | audit 생성일시 |
| 9 | 최종수정자 | LAST_UPDATED_OBJECT_ID | 텍스트 | N | audit 최종변경 USER |
| 10 | 최종수정일 | LAST_UPDATE_TIMESTAMP | datetime (yyyy-MM-dd HH:mm:ss) | N | audit 최종변경 일시 |

비고: col 2~4 는 신규행(ROWTYPE_INSERT)일 때만 인라인 편집 (xfdl:69~71). 기존행은 read-only. col 5~10 은 grid 기본 비편집.

### §3.3 조회 결과 메시지

- 정상 조회 시 하단 상태바: `{ds_GetRuleMasterList 건수}건 조회 되었습니다.` (xfdl:193).
- 오류 시: `strErrorMsg` 표시 (xfdl:194).

---

## §4. CRUD 기능 (분석리포트 §6 / §7)

### §4.1 신규(C — INSERT)

| 항목 | 값 |
|---|---|
| 트리거 | 우측 메뉴 행추가 (B-003) → fn_rowAdd (xfdl:222) |
| 동작 | ds_grdMain.addRow() / 그리드 포커스 / RULE_TP='A'(xfdl:229) / USE_TP='Y'(xfdl:230) / RULE_VER='1'(xfdl:231) / RULE_OWNER_EMP_NO=로그인 사번(gds_user USER_EMP_NO, xfdl:232) |
| 행 상태 | nativeeditor_status = "inserted" |
| 사전 검증 | 저장 시 동일 RULE_ID 존재 SELECT 체크 → 존재 시 UserException (java:48~54) |
| 저장 시 SQL | TB_MCA_RULE_MASTER_Mapper.insert (java:65) |
| 입력 컬럼 | RULE_ID, RULE_TP, RULE_DESC, RULE_OWNER_EMP_NO, RULE_NM, USE_TP, RULE_VER (7 — java:57~63) + audit (mcm-core 자동) |

### §4.2 조회(R — SELECT)

| 항목 | 값 |
|---|---|
| 트리거 | 상단 메뉴 조회 (B-001) / onload 자동 (xfdl:132) |
| 동작 | fn_search (xfdl:148) → gfn_transaction(sSvcID="search") |
| 호출 SQL | GetRuleMasterList (Mapper.xml:7~30) |
| 결과 적재 | ds_grdMain ← ds_GetRuleMasterList (xfdl:155) |

### §4.3 수정(U — UPDATE)

| 항목 | 값 |
|---|---|
| 트리거 | 신규행 그리드 셀 편집 (col 2~4) 또는 setColumn 으로 인한 데이터셋 변경 → updated 상태 |
| 행 상태 | nativeeditor_status = "updated" |
| 저장 시 SQL | TB_MCA_RULE_MASTER_Mapper.update (java:77) |
| 갱신 컬럼 | RULE_NM, RULE_DESC, USE_TP (3 — java:70~72) + audit U_* (mcm-core 자동) |
| WHERE | RULE_ID = #{pRuleId} (java:74~75) |

비고: UPDATE SET 에 RULE_TP / RULE_VER / RULE_OWNER_EMP_NO 미포함 (As-Is 그대로).

### §4.4 삭제(D — DELETE)

| 항목 | 값 |
|---|---|
| 트리거 | 우측 메뉴 행삭제 (B-004) → fn_rowDelete (xfdl:238) |
| 동작 | 신규행(ROWTYPE_INSERT)만 `deleteRow` (xfdl:242~244). 기존행은 `alert("행추가로 추가한 데이터만 삭제가 가능합니다.")` (xfdl:248) |
| 기존행 서버 삭제 | **없음** — As-Is 에 기존행 DELETE 경로 부재 (java/bpmn 전수 확인). 논리삭제는 USE_TP='N' UPDATE 로만 (사용여부 토글) |
| To-Be | delete API 미생성 (As-Is 보존 — 사용자 결정) |

비고: masterCategoryMng 과 달리 본 화면은 deleted 분기/DELETE SQL/delete BPMN flow 가 **자체 부재**. 실삭제 차단 + USE_TP 논리삭제 정책.

### §4.5 저장 통합 (B-002)

| 단계 | 동작 | 근거 |
|---|---|---|
| 검증 1 (변경여부) | `gfn_isDatasetChanged(ds_grdMain)` false 시 "변경된 데이터가 없습니다." 차단 | xfdl:268~271 |
| 검증 2 (필수) | updated/inserted 행에 대해 RULE_ID null 체크 → 누락 시 포커스 이동 + 경고 + 중단 | xfdl:276~290 |
| 확인 | `gfn_message(... "저장 하시겠습니까?", "confirm" ...)` — 확인 시에만 송신 | xfdl:182 |
| 송신 | sInDatasets="ds_grdMain=ds_grdMain:U" / sArgument = div_search 컴포넌트 스캔 (조회조건 2) | xfdl:174~176 |
| 서버 처리 | SaveMasterRule.run() — nativeeditor_status 별 분기 (inserted: 중복체크 SELECT → INSERT / updated: UPDATE) | java:33~80 |
| 트랜잭션 | inserted 중복 PK 발견 시 UserException → IllegalTaskException → 전체 롤백 | java:50~54, 84~88 |
| 결과 메시지 | `{cnt_save}건 저장 되었습니다.` (cnt_save = 전체 행수, java:82) | xfdl:201 |

비고: masterCategoryMng 과 달리 (a) 화면 내 중복체크/전체 중복체크 단계 없음 (검증 2단계만), (b) cnt_save = 전체 행수(처리행수 아님), (c) save 응답 데이터셋 없이 BPMN 후행 Task_2 재조회로 갱신.

---

## §5. 버튼 액션

### §5.1 server-side action 매트릭스

| action | 버튼 | sInDatasets | sOutDatasets | 후속 BPMN 경로 |
|---|---|---|---|---|
| search | B-001 btn_search | "" | ds_grdMain=ds_GetRuleMasterList | Gateway → Task_2(Main조회) → End |
| save | B-002 btn_save | ds_grdMain=ds_grdMain:U | "" (BPMN 후행 Task_2 재조회) | Gateway → SaveMasterRule(저장) → Task_2(조회) → End |

### §5.2 client-side 액션

| 액션 | 버튼 | 동작 |
|---|---|---|
| rowAdd | B-003 | 행 추가 + RULE_TP='A' / USE_TP='Y' / RULE_VER='1' / 담당자=로그인 사번 |
| rowDelete | B-004 | 신규행만 deleteRow (기존행 경고) |
| excelDown | B-005 | 그리드 → Excel (gfn_exportExcel(grd_Main, titletext), xfdl:218) |
| fold | B-006 | div_search 접기/펴기 토글 (gfn_fold, xfdl:212) |
| 그리드 헤드 클릭 | GB-001 | 정렬 (gfn_commonOnheadclick, xfdl:255) |

---

## §6. 비즈니스 룰

| BR-NNN | 룰 | 근거 |
|---|---|---|
| BR-001 | 업무기준 마스터는 단일 PK RULE_ID — 동일 RULE_ID 중복 불가 (INSERT 전 SELECT 사전 체크) | java:46~54 |
| BR-002 | 목록조회는 이력행(`RULE_ID = OLD_RULE_ID`) 제외 — `RULE_ID != NVL(OLD_RULE_ID,'ZZZZ0000')` (Q-009) | Mapper.xml:21 |
| BR-003 | 목록조회는 활성 업무기준만 — `NVL(USE_TP,'N') != 'N'` (USE_TP 'N'/NULL 행 제외) | Mapper.xml:28 |
| BR-004 | 저장 전 변경여부 체크 — 변경 없으면 "변경된 데이터가 없습니다." 차단 | xfdl:268~271 |
| BR-005 | 저장 전 필수 입력: updated/inserted 행에서 RULE_ID 누락 차단 | xfdl:276~290 |
| BR-006 | 기존행 PK(RULE_ID) 변경 불가 — 그리드에서 신규행(col 2~4)만 편집 허용 | xfdl:69~71 |
| BR-007 | 행추가 시 기본값 자동 세팅: RULE_TP='A' / USE_TP='Y' / RULE_VER='1' / 담당자=로그인 사번 | xfdl:229~232 |
| BR-008 | 기존행 실삭제 불가 — 신규행만 client 삭제. 논리삭제는 USE_TP 토글(UPDATE) | xfdl:242~248 / java:67~78 |
| BR-009 | 저장 시 INSERT 7 컬럼(RULE_ID/RULE_TP/RULE_DESC/RULE_OWNER_EMP_NO/RULE_NM/USE_TP/RULE_VER) / UPDATE 3 컬럼(RULE_NM/RULE_DESC/USE_TP) | java:57~63, 70~72 |
| BR-010 | 검색 조건 2종 LIKE 부분일치 + 양변 UPPER (대소문자 무시) | Mapper.xml:22~27 |
| BR-011 | 모든 INSERT/UPDATE = mcm-core McmAuditEntity 9 audit 컬럼 자동 주입 (As-Is ref_Audit 등가) | §9.2 / §11 |
| BR-012 | 검색 결과 정렬은 RULE_ID 오름차순 고정 | Mapper.xml:29 |
| BR-013 | 저장 트랜잭션 중 inserted 행 중복 PK 발견 시 즉시 예외 → 전체 롤백 | java:50~54, 84~88 |
| BR-014 | RULE_VER(업무 버전, INSERT '1' 고정) 은 UPDATE 미변경 — mcm-core VER(@Version 낙관락)과 별개 (Q-011) | java:63 / §9.2 |

---

## §7. 상태값 (ST-NNN)

| ST-NNN | 상태 | 의미 | 발생 시점 | 대응 동작 |
|---|---|---|---|---|
| ST-001 | row inserted (nativeeditor_status="inserted" / getRowType==ROWTYPE_INSERT) | 행 추가됨 (미저장 신규) | fn_rowAdd 직후 | 저장 시 중복체크 SELECT → INSERT 호출 |
| ST-002 | row updated (nativeeditor_status="updated") | 기존 행 컬럼 변경 (미저장) | 데이터셋 변경 후 | 저장 시 UPDATE 호출 |
| ST-003 | row clean (변경 없음) | 변경 없음 | 조회 직후 | 저장 대상 아님 (검증 skip) |
| ST-004 | STATUS auto (col 0 imagecontrol) | Nexacro auto row state 아이콘 | 행 상태 변동 시 | To-Be FE row state 표시 |
| ST-005 | search done | 조회 완료 | gfn_transaction("search") 콜백 nErrorRule==0 | 하단 상태바 "{N}건 조회 되었습니다." |
| ST-006 | save done | 저장 완료 | gfn_transaction("save") 콜백 nErrorRule==0 | 하단 상태바 "{cnt_save}건 저장 되었습니다." |
| ST-007 | error | 트랜잭션 오류 (중복 PK 등) | nErrorRule≠0 | 하단 상태바 strErrorMsg 표시 |

---

## §8. 권한 / 접근 제어

| 항목 | 정책 | 근거 |
|---|---|---|
| 화면 접근 | (As-Is mui 자료 권한 명시 없음 — 모듈 통합 권한관리에 위임) | 분석 범위 외 |
| 조회 권한 | 화면 접근자 모두 | To-Be 외부 권한 프로세스 위임 |
| 저장 권한 | To-Be 외부 권한 프로세스 위임 | - |
| 행추가/삭제 권한 | To-Be 외부 권한 프로세스 위임 | - |
| 엑셀다운 권한 | To-Be 외부 권한 프로세스 위임 | - |

> 본 화면 자체 권한 분기 ✗ — To-Be 외부 권한 모델 (전사 정책) 위임 (사용자 결정).

---

## §9. 팝업 / 연계 화면

### §9.1 호출(out-going) 팝업

| P-NNN | 호출 대상 | 트리거 | 결과 |
|---|---|---|---|
| (없음) | - | - | - |

본 화면은 외부 팝업/조회창을 직접 호출하지 않음 — 모든 CRUD 가 단일 그리드 내 완결 (분석리포트 §5).

### §9.2 호출됨(in-coming) 추정 — 분석 범위 외

| 호출 가능 외부 화면 | 호출 시나리오 | 결정 |
|---|---|---|
| MasterRuleListPop (업무기준 List조회 팝업) | 별개 팝업 화면 — 본 화면(MasterRuleList) 미호출 | mcm 모듈 단독 화면 — 호출 화면 없음 (사용자 결정) |

---

## §10. 메시지 / 알림

### §10.1 검증 메시지

| MSG-NNN | 트리거 | 메시지 | 유형 | 후처리 | 근거 |
|---|---|---|---|---|---|
| MSG-001 | 저장 검증 (변경 없음) | "변경된 데이터가 없습니다." | error | 저장 중단 | xfdl:269 |
| MSG-002 | 저장 검증 (RULE_ID null) | "[업무기준ID] 를 입력해 주시기 바랍니다." | warning | 해당 행/셀 포커스 이동 / 저장 중단 | xfdl:286 |
| MSG-003 | 저장 확인 | "저장 하시겠습니까?" | confirm | 확인 시 save service 호출 | xfdl:182 |
| MSG-004 | 행삭제 (기존행) | "행추가로 추가한 데이터만 삭제가 가능합니다." | alert | 작업 중단 | xfdl:248 |
| MSG-005 | 저장 서버 (중복 PK) | "[{RULE_ID}] 동일한 업무기준ID가 존재합니다." | UserException → 상태바 | 트랜잭션 롤백 | java:51 |

### §10.2 상태바 메시지

| MSG-NNN | 트리거 | 메시지 | 근거 |
|---|---|---|---|
| MSG-010 | search 콜백 성공 | "{n}건 조회 되었습니다." | xfdl:193 |
| MSG-011 | save 콜백 성공 | "{cnt_save}건 저장 되었습니다." | xfdl:201 |
| MSG-012 | 콜백 오류 | strErrorMsg 그대로 표시 | xfdl:194, 203 |

---

## §11. 특이사항 (분석리포트 §13 Q-NNN 인용 — 자체 추가 ✗)

| ID | 항목 | 처리 |
|---|---|---|
| Q-008 | onkeydown 미정의 핸들러 | edt_ruleNm `onkeydown` 선언만(xfdl:25) 본문 부재 — To-Be 미반영 (운영 의도 확인) |
| Q-009 | RULE_ID != OLD_RULE_ID 필터 | 이력행 제외 룰 — To-Be 보존 (Mapper.xml:21) |
| Q-010 | Excel 한글의미 misalign | sheet135 한글항목명 수치코드 misalign — 그리드 헤드 직역 보강 |
| Q-011 | RULE_VER vs @Version 중복 | As-Is RULE_VER(업무 버전) 보존 + mcm-core VER(낙관락) 별개 컬럼 |
| Q-012 | MSSQL UPPER 양변 검색 | 양변 UPPER 유지/생략 — DB collation 정책 확인 |

> 활성 확인필요 5 건 — 모두 영향도 낮음~중간. 설계 진행 가능 (분석리포트 §15 G9 △).
