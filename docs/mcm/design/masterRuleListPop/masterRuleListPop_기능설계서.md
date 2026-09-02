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

# 업무기준 List조회 (masterRuleListPop) 기능설계서

> 본 문서는 [분석리포트](./masterRuleListPop_분석리포트.md) 를 단일 원천으로 인용한다.

---

## §1. 화면 개요

| 항목 | 값 |
|---|---|
| 화면 ID | masterRuleListPop |
| As-Is 화면 ID | MasterRuleListPop |
| 화면명 | 업무기준 List조회 |
| 모듈 / 그룹 | mcm (공통관리) / cmb (업무기준 관리(원장)) |
| 메뉴 계층 | 공통관리 > 업무기준 관리(원장) > 업무기준 List조회 |
| 화면 목적 | 업무기준(Rule) 마스터 목록 조회 + 행 선택 후 부모 화면으로 `{sRuleId, sRuleNm}` 반환 (조회/선택 전용 **팝업**) |
| 사용자 | 업무기준(Rule) ID 룩업이 필요한 입력 화면 사용자 |
| 권한 | To-Be 외부 권한 프로세스 위임 (§8) |
| 주 사용 테이블 | TB_MCA_RULE_MASTER (단일 테이블, JOIN ✗) |
| 기본 동작 | 화면 로드 → 부모 전달 sRuleId/sRuleNm 세트 → 자동 조회 (분석리포트 §xfdl:100 `fn_search()` onload 후 호출) |
| CRUD | **조회(R) 단독** — 신규/수정/삭제 없음 (조회 전용 팝업) |

---

## §2. 화면 흐름도

```
[부모 화면이 팝업 호출 — sRuleId / sRuleNm / sSchema 전달]
    ↓ (xfdl:82 MasterRuleListPop_onload → gfn_formOnLoad)
[fn_formAfterOnload (xfdl:88)]
    ├─ gfn_Data_Return("sRuleId") → edt_ruleId 세트 (xfdl:90~93)
    ├─ gfn_Data_Return("sRuleNm") → edt_ruleNm 세트 (xfdl:94~97)
    ├─ fn_button — 상단 메뉴 생성 (조회/확인/닫기) (xfdl:99)
    └─ fn_search — 조회 자동 호출 (xfdl:100)
    ↓
[그리드 표시 (ds_grdMain ← ds_GetRuleMasterList)]
    ↓
사용자 액션 분기:
  ├─ 조회 (B-001)      → fn_search()                        → action=search
  ├─ 행 더블클릭 (GB-002) → div_main_grd_main_oncelldblclick → {sRuleId,sRuleNm} 반환 + 팝업 닫기
  ├─ 확인 (B-002)      → fn_confirm()                       → rowposition 행 {sRuleId,sRuleNm} 반환 + 팝업 닫기
  ├─ 닫기 (B-003)      → fn_close()                         → 팝업 닫기 (반환 없음)
  └─ 접기 (B-004)      → btn_fold_onclick                   → div_search 접기/펴기
```

비고: search action 종료 시 BPMN 정의에 따라 Task_2(Main조회) 만 실행되어 ds_grdMain 갱신 (후행 전체조회 Task 없음 — 분석리포트 §8.4).

---

## §3. 조회 기능 (S-NNN + G-001)

### §3.1 조회조건 (S-001~S-004 — 분석리포트 §3.2)

| 항목 | 라벨 | 입력 ID | 파라미터 | 검증 | 매핑 SQL WHERE |
|---|---|---|---|---|---|
| S-002 | 업무기준ID | edt_ruleId | pRuleId | 대문자 변환 (xfdl:56 inputmode=upper) | `UPPER(RULE_ID) LIKE UPPER('%' \|\| #{pRuleId} \|\| '%')` (Mapper.xml:27) |
| S-004 | 업무기준명 | edt_ruleNm | pRuleNm | 없음 (xfdl:58 inputmode 미지정) | `UPPER(RULE_NM) LIKE UPPER('%' \|\| #{pRuleNm} \|\| '%')` (Mapper.xml:30) |

추가 송신 파라미터:
| 파라미터 | 값 | 용도 | 근거 |
|---|---|---|---|
| sSchema | this.parent.sSchema | 동적 스키마 라우팅 (`${sSchema}.TB_MCA_RULE_MASTER`) | xfdl:122 / Mapper.xml:17~24 |

비고:
- 2 항목 모두 LIKE 부분일치 + UPPER 대소문자 무시. 미입력시 해당 if 블록 skip → 전체 조회.
- 고정 WHERE: `RULE_ID != NVL(OLD_RULE_ID,' ')` (구버전 대체 행 제외 — Mapper.xml:25).
- ORDER BY RULE_ID 고정 (Mapper.xml:32).
- As-Is `text="결함 코드"` 초기값은 화면 도메인 불일치 잔재 → **To-Be 빈 값 정정** (사용자 결정 — 분석리포트 §12).

### §3.2 조회 결과 그리드 G-001 (분석리포트 §3.3)

| col | 헤드 | 컬럼 | 표시 형식 | 편집 가능 | 비고 |
|---:|---|---|---|---|---|
| 0 | NO | (자동) | 일련번호 (currow+1) | N | 화면 일련번호 |
| 1 | 업무기준 ID | RULE_ID | 텍스트 (영문 대문자, max 50) | N (To-Be 읽기 전용) | As-Is editmaxlength=50 잔재 — 편집 핸들러 ✗ |
| 2 | 업무기준 명 | RULE_NM | 텍스트 (한글, max 180) | N (To-Be 읽기 전용) | As-Is editmaxlength=180 잔재 — 편집 핸들러 ✗ |

비고: ds_grdMain 에는 SELECT 9 컬럼(RULE_ID/OLD_RULE_ID/RULE_NM/RULE_DESC/RULE_VER/RULE_TP/RULE_OWNER_DEPT_NM/RULE_OWNER_EMP_NO/USE_TP) 이 적재되나 그리드는 RULE_ID/RULE_NM 2 종만 표시 (분석리포트 §6.1).

### §3.3 조회 결과 메시지

- 정상 조회 시 하단 상태바: `{ds_GetRuleMasterList 건수}건 조회 되었습니다.` (xfdl:135).
- 오류 시: `strErrorMsg` 표시 (xfdl:136).
- 콜백에서 `set_rowposition(this.grd_row)` 로 직전 선택 행 복원 (grd_row 초기값 -1 — xfdl:81, 134).

---

## §4. CRUD 기능 (분석리포트 §6 / §7)

> 본 화면은 **조회(R) 전용 팝업** — 신규(C)/수정(U)/삭제(D)/저장 기능 없음.

### §4.1 신규(C — INSERT)

**해당 없음** — 행추가 버튼/우측 메뉴/INSERT SQL 부재 (분석리포트 §4.2, §6).

### §4.2 조회(R — SELECT)

| 항목 | 값 |
|---|---|
| 트리거 | 상단 메뉴 조회 (B-001) / onload 자동 (xfdl:100) |
| 동작 | fn_search (xfdl:114) → ds_grdMain.clearData() → gfn_transaction(sSvcID="search") (xfdl:116~125) |
| 호출 SQL | GetRuleMasterList (Mapper.xml:7~33) |
| 송신 파라미터 | pRuleId, pRuleNm, sSchema (xfdl:120~122) |
| 결과 적재 | ds_grdMain ← ds_GetRuleMasterList (xfdl:119) |
| 콜백 | fn_callBack (xfdl:129) — 건수 표시 + rowposition 복원 |

### §4.3 수정(U — UPDATE)

**해당 없음** — UPDATE SQL / 저장 버튼 부재. 그리드 셀 editmaxlength 잔재만 존재 (편집 핸들러 ✗ — 분석리포트 §3.3).

### §4.4 삭제(D — DELETE)

**해당 없음** — DELETE SQL / 행삭제 버튼 부재.

### §4.5 선택 반환 (확인 / 더블클릭)

| 단계 | 동작 | 근거 |
|---|---|---|
| 트리거 1 (더블클릭) | div_main_grd_main_oncelldblclick — e.row 행의 RULE_ID/RULE_NM 추출 | xfdl:143~149 |
| 트리거 2 (확인 B-002) | fn_confirm — ds_grdMain.rowposition 행의 RULE_ID/RULE_NM 추출 | xfdl:152~158 |
| 반환 객체 | `obj.sRuleId` = RULE_ID, `obj.sRuleNm` = RULE_NM | xfdl:146~147 / 155~156 |
| 반환 | gfn_popupClose(obj) — 부모 화면으로 객체 반환 후 팝업 닫기 | xfdl:148 / 157 |
| 닫기 (B-003) | fn_close — 반환 없이 this.close() | xfdl:161~163 |

---

## §5. 버튼 액션

### §5.1 server-side action 매트릭스

| action | 버튼 | sInDatasets | sOutDatasets | 후속 BPMN 경로 |
|---|---|---|---|---|
| search | B-001 btn_search | "" | ds_grdMain=ds_GetRuleMasterList | Gateway → Task_2(Main조회) → End |

### §5.2 client-side 액션

| 액션 | 버튼 | 동작 |
|---|---|---|
| confirm | B-002 btn_confirm | rowposition 행 {sRuleId,sRuleNm} 반환 + 팝업 닫기 (fn_confirm) |
| close | B-003 btn_close | 팝업 닫기 (반환 없음, fn_close) |
| fold | B-004 btn_fold | div_search 접기/펴기 토글 (gfn_fold) |
| 더블클릭 | GB-002 grd_main | e.row 행 {sRuleId,sRuleNm} 반환 + 팝업 닫기 |
| 그리드 헤드 클릭 | GB-001 grd_main | 정렬 (gfn_commonOnheadclick) |

---

## §6. 비즈니스 룰

| BR-NNN | 룰 | 근거 |
|---|---|---|
| BR-001 | 조회 결과는 현행 업무기준만 표시 — `RULE_ID != NVL(OLD_RULE_ID,' ')` (구버전 대체 행 제외) | Mapper.xml:25 |
| BR-002 | 업무기준 ID 검색 = 대문자 무시 부분일치 (UPPER + LIKE) | Mapper.xml:27 |
| BR-003 | 업무기준 명 검색 = 대문자 무시 부분일치 (UPPER + LIKE) | Mapper.xml:30 |
| BR-004 | 조회 결과 정렬 = RULE_ID 오름차순 고정 | Mapper.xml:32 |
| BR-005 | 동적 스키마 — 부모가 전달한 sSchema 가 있으면 해당 스키마, 없으면 MCA_SOURCE 조회 | Mapper.xml:17~24 / xfdl:122 |
| BR-006 | 행 선택(더블클릭/확인) 시 RULE_ID / RULE_NM 만 부모로 반환 | xfdl:146~147, 155~156 |
| BR-007 | 업무기준 ID 입력 = 영문 대문자 자동 변환 (조회조건) | xfdl:56 (inputmode="upper") |
| BR-008 | 그리드 컬럼 = 조회/선택 전용 표시 (편집 불가 — To-Be 읽기 전용) | xfdl:10 (selecttype="cell") / §3.3 |
| BR-009 | 조회 송신 전 그리드 초기화 (clearData) | xfdl:124 |
| BR-010 | 조회 콜백 시 직전 선택 행(rowposition=grd_row) 복원 | xfdl:81, 134 |

---

## §7. 상태값 (ST-NNN)

| ST-NNN | 상태 | 의미 | 발생 시점 | 대응 동작 |
|---|---|---|---|---|
| ST-001 | popup opened | 팝업 진입 | 부모가 호출 → onload | sRuleId/sRuleNm 세트 + 자동 조회 |
| ST-002 | search done | 조회 완료 | gfn_transaction("search") 콜백 nErrorRule==0 | 하단 상태바 "{N}건 조회 되었습니다." + rowposition 복원 |
| ST-003 | error | 트랜잭션 오류 | nErrorRule≠0 | 하단 상태바 strErrorMsg 표시 |
| ST-004 | row selected (dblclick) | 행 더블클릭 선택 | 셀 더블클릭 | {sRuleId,sRuleNm} 반환 + 팝업 닫기 |
| ST-005 | row selected (confirm) | 현재 rowposition 행 확정 | 확인 버튼 | {sRuleId,sRuleNm} 반환 + 팝업 닫기 |
| ST-006 | popup closed | 팝업 닫힘 | 닫기 버튼 / 반환 후 | this.close() |

---

## §8. 권한 / 접근 제어

| 항목 | 정책 | 근거 |
|---|---|---|
| 화면 접근 | (As-Is mui 자료 권한 명시 없음 — 모듈 통합 권한관리에 위임) | 분석 범위 외 |
| 조회 권한 | 화면 접근자 모두 | To-Be 외부 권한 프로세스 위임 |
| 선택 반환 권한 | To-Be 외부 권한 프로세스 위임 | - |

> 본 화면 자체 권한 분기 ✗ — To-Be 외부 권한 모델 (전사 정책) 위임 (사용자 결정). 본 화면은 부모(업무기준 입력) 화면에 종속된 룩업 팝업이므로, 부모 화면 접근 권한자와 동일 정책으로 통합 권장.

---

## §9. 팝업 / 연계 화면

### §9.1 호출(out-going) 팝업

| P-NNN | 호출 대상 | 트리거 | 결과 |
|---|---|---|---|
| (없음) | - | - | - |

본 화면은 외부 팝업/조회창을 직접 호출하지 않음 — 본 화면 자체가 룩업 팝업.

### §9.2 호출됨(in-coming) — 본 화면이 팝업 (분석리포트 §5.2)

| 항목 | 값 |
|---|---|
| 입력 (부모→본) | sRuleId / sRuleNm (gfn_Data_Return) + this.parent.sSchema |
| 출력 (본→부모) | { sRuleId: RULE_ID, sRuleNm: RULE_NM } (gfn_popupClose) |
| 부모 화면 | 호출자 = masterRuleFrame·masterRuleData·masterRuleDataList (호출관계 조사 2026-06-05 — 분석리포트 §12 Q-003 해소) |

---

## §10. 메시지 / 알림

### §10.1 상태바 메시지 (하단 div_bottom)

| MSG-NNN | 트리거 | 메시지 | 근거 |
|---|---|---|---|
| MSG-001 | search 콜백 성공 (nErrorRule==0) | "{n}건 조회 되었습니다." (n = ds_GetRuleMasterList 건수) | xfdl:135 |
| MSG-002 | search 콜백 오류 (nErrorRule≠0) | strErrorMsg 그대로 표시 | xfdl:136 |

### §10.2 검증 메시지 (warning)

**해당 없음** — 조회 전용 팝업으로 입력 필수/중복 검증 로직 부재 (저장 기능 없음).
