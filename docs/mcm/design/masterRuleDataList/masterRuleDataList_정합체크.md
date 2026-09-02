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

# 업무기준 상세조회 (masterRuleDataList) 정합체크서

> 본 문서는 5종 산출물 간 식별자 / SQL ID / 액션 / 명명 / As-Is 누락 / To-Be 변환점의 정합성을 점검한다.
> 단일 원천 = [분석리포트](./masterRuleDataList_분석리포트.md).

---

## §A. 분석리포트 단일 원천 정합

### §A.1 5종 산출물 식별자 (frontmatter)

| 산출물 | screenId | asIsId | moduleId | moduleGroup | 정합 |
|---|---|---|---|---|---|
| 분석리포트 | masterRuleDataList | MasterRuleDataList | mcm | cmb | ○ |
| 기능설계서 | masterRuleDataList | MasterRuleDataList | mcm | cmb | ○ |
| 디자인설계서 | masterRuleDataList | MasterRuleDataList | mcm | cmb | ○ |
| BPMN설계서 | masterRuleDataList | MasterRuleDataList | mcm | cmb | ○ |
| 정합체크서 | masterRuleDataList | MasterRuleDataList | mcm | cmb | ○ |

### §A.2 5종 단일 원천 인용

| 산출물 | 분석리포트 인용 항목 | 정합 |
|---|---|---|
| 기능설계서 §3 (조회) | 분석 §3.2 (S-001~S-020) | ○ |
| 기능설계서 §4 (CRUD = R only) | 분석 §6 (SQL) / §7 (Java) | ○ |
| 기능설계서 §5 (action) | 분석 §4.6 | ○ |
| 기능설계서 §10 (메시지) | 분석 §3 + xfdl 직접 인용 | ○ |
| 디자인설계서 §3 (조회조건) | 분석 §3.2 | ○ |
| 디자인설계서 §4 (그리드 동적컬럼) | 분석 §3.3 | ○ |
| 디자인설계서 §5 (버튼) | 분석 §4 | ○ |
| BPMN설계서 §1 (액션) | 분석 §4.6 / §8.4 | ○ |
| BPMN설계서 §3 (flow) | 분석 §8.2 / §8.3 | ○ |
| BPMN설계서 §4 (Java) | 분석 §7 | ○ |

---

## §B. 식별자 정합

### §B.1 화면 식별자

| 항목 | 분석 | 기능 | 디자인 | BPMN | 정합 |
|---|---|---|---|---|---|
| screenId | masterRuleDataList | masterRuleDataList | masterRuleDataList | masterRuleDataList | ○ |
| asIsId | MasterRuleDataList | MasterRuleDataList | MasterRuleDataList | MasterRuleDataList | ○ |
| pageId | masterRuleDataList | masterRuleDataList | masterRuleDataList | masterRuleDataList | ○ |
| pageName | masterRuleDataList | masterRuleDataList | masterRuleDataList | masterRuleDataList | ○ |
| serviceId | masterRuleDataList | masterRuleDataList | masterRuleDataList | masterRuleDataList | ○ |
| 화면명 (titletext) | 업무기준 상세조회 | 업무기준 상세조회 | 업무기준 상세조회 | 업무기준 상세조회 | ○ |

### §B.2 영역 / 버튼 / 그리드 ID 정합

| ID | 분석 | 기능 | 디자인 | BPMN | 정합 |
|---|---|---|---|---|---|
| A-001~A-005 | ✓ §3.1 | (간접) | ✓ §2 | - | ○ |
| C-001~C-006 | ✓ §3.5 | (간접) | ✓ §2 | - | ○ |
| S-001~S-020 | ✓ §3.2 | ✓ §3.1 | ✓ §3.1 | - | ○ |
| G-001 (동적컬럼) | ✓ §3.3 | ✓ §3.2 | ✓ §4 | - | ○ |
| B-001~B-004 | ✓ §4 | ✓ §5 | ✓ §5 | ✓ §1.1 | ○ |
| GB-001~GB-002 | ✓ §4.4 | ✓ §5.2 | (포함) | (비대상) | ○ |
| P-001~P-002 | ✓ §5.1 | ✓ §9.1 | ✓ §6 | (비대상) | ○ |
| MSG-001~MSG-012 | (기능서 정본) | ✓ §10 | ✓ §7 | - | ○ |

---

## §C. SQL ID 일치 (Mapper.xml ↔ BPMN sqlKey ↔ Java)

### §C.1 Mapper.xml ↔ BPMN

| Mapper.xml SQL ID | BPMN sqlKey | BPMN 노드 | 정합 |
|---|---|---|---|
| GetRuleColList (Mapper:7) | #{serviceId}Mapper.GetRuleColList (bpmn:30) | Task_0ru18qa "lov목록 조회" (bpmn:23) | ○ |
| GetMasterRuleDataListExport (Mapper:69) | #{serviceId}Mapper.GetMasterRuleDataListExport (bpmn:57) | Task_0ifp7u0 "Main 조회 엑셀 Export" (bpmn:50) | ○ |
| GetMasterRuleDataList (Mapper:32) | (BPMN 직접 인용 ✗ — UserTask 내 Java 호출) | UserTask_067lppc (bpmn:39) | ○ (간접, java:123) |

비고: ★ orphan SQL 없음 — 본 Mapper 는 조회 3종뿐. masterRuleData 의 GetMaxRuleSeq/InsertMasterRuleSpecDataList/UpdateMasterRuleSpecDataList(orphan) 에 해당하는 SQL 이 본 Mapper 에 정의되지 않음 (분석 §6 비고).

### §C.2 Java ↔ Mapper / 외부 Mapper

| Java 호출 | 대상 | 라인 정합 |
|---|---|---|
| GetMasterRuleDataList (java:51) | TB_MCA_RULE_COL_LIST_Mapper.select (외부 Mapper) | ○ (외부 Mapper — 테이블 자체는 DMES-SECTION-MCA sheet134 수록) |
| GetMasterRuleDataList (java:123) | MasterRuleDataListMapper.GetMasterRuleDataList (Mapper:32) | ○ |

비고: 본 화면은 단일 조회 클래스(GetMasterRuleDataList) — masterRuleData 의 SaveMasterRuleData·DynamicSqlExecutor·`${pTable}_Mapper.update/delete/insert` 호출이 전혀 없다 (분석 §7.1 비고).

### §C.3 xfdl ↔ BPMN (sOutDatasets ↔ resultKey)

| xfdl sOutDatasets | BPMN resultKey / java context | 정합 |
|---|---|---|
| ds_grdMain=ds_GetMasterRuleDataList (xfdl:401) | GetMasterRuleDataList.addDaoResultIntoContext("ds_GetMasterRuleDataList", java:124) | ○ |
| ds_lovData=ds_GetRuleColList (xfdl:574) | Task_0ru18qa.resultKey = ds_GetRuleColList (bpmn:31) | ○ |
| ds_grdDownload=ds_GetMasterRuleDataListExport (xfdl:432) | Task_0ifp7u0.resultKey = ds_GetMasterRuleDataListExport (bpmn:58) | ○ |

---

## §D. 식별자 명명 정합 (D1~D5)

### §D.1 screenId 명명 규칙 (`{화면명}` lowerCamel 단일 토큰)

- 정본: MasterRuleDataList → masterRuleDataList (모듈명 토큰 ✗) → ○
- moduleId = `mcm` (한글명 **"공통관리"**) / moduleGroup = `cmb` (한글명 **"업무기준 관리(원장)"** — 01_Agent부속_가이드.md §A.2.3 등재)
- 메뉴 계층: 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 업무기준 상세조회 (masterRuleDataList)

### §D.2 BPMN 기능 식별자 명명 규칙 (`{screenId}_{기능명}`)

| To-Be 식별자 | 원천 (As-Is action) | 명명 정합 |
|---|---|---|
| masterRuleDataList_search | search (bpmn:22) | ○ |
| masterRuleDataList_lov | lov (bpmn:37) | ○ |
| masterRuleDataList_searchExport | search_export (bpmn:64) | ○ |

비고: masterRuleData 의 masterRuleData_save 에 해당하는 식별자는 본 화면에 없음(조회 전용 — 3 action).

### §D.3 테이블 명명

| 항목 | As-Is | To-Be 권장 |
|---|---|---|
| 동적 데이터 | MCAAPUSER.TB_MCA_<업무기준ID> | **Q-001b 확정: As-Is 동일 'DDL on-demand'** — 런타임 인스턴스 테이블, 업무기준ID별 실테이블 동적 생성/조회, owner=MCAAPUSER (가족 공통 2026-06-04) |
| 컬럼정의 | MCAAPUSER.TB_MCA_RULE_COL_LIST | **MCAAPUSER.TB_MCA_RULE_COL_LIST** — DMES-SECTION-MCA sheet134 수록 (해소) |
| 업무기준 마스터 | MCAAPUSER.TB_MCA_RULE_MASTER | **MCAAPUSER.TB_MCA_RULE_MASTER** — DMES-SECTION-MCA sheet135(26컬럼) 수록 (해소) |

→ ★ 메타 2테이블(COL_LIST/RULE_MASTER)은 정본 `DMES-SECTION-MCA_테이블정의서.xlsx` 에 수록 확인(masterRuleList §9.1 정합 / Python xml 파싱 실측 B2=MCAAPUSER.*) → **Q-001a 해소**. 동적 데이터 테이블 `TB_MCA_<업무기준ID>` 만 런타임 인스턴스라 미수록(정상) → **Q-001b(DDL on-demand) 확정** (가족 공통).

### §D.4 manifest 9 파일 정합

| 항목 | 결과 | 사유 |
|---|---|---|
| manifest.lock.json | ✗ | Runner 미실행 — 사용자 결정 |
| index.json | ✗ | 〃 |
| discover.trace.json | ✗ | 〃 |
| classify.trace.json | ✗ | 〃 |
| fallback.trace.json | ✗ | 〃 |
| q-stable-key.json | ✗ | 〃 |
| conflict-report.json | (해당 없음) | 〃 |
| verify-report.json | ✗ | 〃 |
| error.log | (해당 없음) | 〃 |

**§D.4 종합 = ✗ (Runner 미적용 — 사용자 결정에 따라 deferred).**

### §D.5 frontmatter 필드 — 5종 모두 작성

| 산출물 | screenId | asIsId | moduleId | moduleGroup | 작성일 | 작성자 | 결과 |
|---|---|---|---|---|---|---|---|
| 분석리포트 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 기능설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 디자인설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| BPMN설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 정합체크서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |

(기능/디자인/BPMN/정합 4종은 pageName/pageId/serviceId 3 추가 필드 포함 — frontmatter 9 필드.)

---

## §E. As-Is 누락 0 점검

### §E.1 xfdl 전수 정합

| 항목 | xfdl 카운트 | 본 산출물 반영 | 결과 |
|---|---:|---:|---|
| 영역/보조 div | 10 (div_title, edt_title, div_topMenu, div_search, btn_fold, div_main, grdMain, div_rightMenu, div_paging, grd_Download, div_bottom) | 분석 §3.1 (A-001~A-005) + §3.5 (C-001~C-006) + Grid | ○ |
| 조회조건 컴포넌트 | 20 (stc 2 + edt(ruleId/ruleNm) 2 + btn 1 + cbo_lov 5 + cbo_operator 5 + edt_val 5) | 분석 §3.2 (S-001~S-020) | ○ |
| Grid 정적 컬럼 | 1 (SEQ) | 분석 §3.3 (정적 표) | ○ |
| Grid 동적 컬럼 | N (런타임 빌드) | 분석 §3.3 (빌드 로직 8속성 전수) | ○ |
| Dataset | 11 (ds_grdMain, ds_lovData, ds_lov1~5, ds_srch, ds_common, ds_grdDownload) | 분석 §3.3 dataset 표 전수 | ○ |
| Script 함수 | 13 (fn_formBeforeOnload, MasterRuleDataList_onload, fn_formAfterOnload, fn_button, fn_searchPaging, fn_search, fn_excelDown, fn_callBack, btn_fold_onclick, div_search_btn_ruleId_onclick, fn_returnRulePopupCallBack, fn_lov, div_main_grdMain_oncellclick, div_main_grdMain_onheadclick) | 기능 §2 흐름도 + §4 + §5 + §10 에 반영 | ○ |

비고: Script 함수 전수 = 14 (fn_formBeforeOnload xfdl:326 / MasterRuleDataList_onload 337 / fn_formAfterOnload 342 / fn_button 348 / fn_searchPaging 361 / fn_search 369 / fn_excelDown 425 / fn_callBack 443 / btn_fold_onclick 534 / div_search_btn_ruleId_onclick 540 / fn_returnRulePopupCallBack 552 / fn_lov 568 / div_main_grdMain_oncellclick 583 / div_main_grdMain_onheadclick 598). ★ masterRuleData(22 함수) 대비 fn_rowAdd/Copy/Delete/Cancel/save/excelUp/returnUploadCallBack/oncolumnchanged 8 함수가 없고, div_main_grdMain_oncellclick(마스터코드 셀) 1 함수가 추가됨 (조회 전용 + 코드 룩업 — 분석 §0).

### §E.2 Java 메서드 전수

| 클래스 | 메서드 | 반영 | 결과 |
|---|---|---|---|
| GetMasterRuleDataList | run(Context, Task) (java:20~133) | 분석 §7.1 단계 1~9 | ○ |

→ Java 메서드 = 1 (Get run 단독) — 반영. ○. masterRuleData(4 메서드 — Get/Save run + filterKeyByColId + setAuditField) 대비 저장·보조 메서드 3종이 없다 (조회 전용 — 분석 §7.1 비고).

### §E.3 Mapper.xml SQL 전수

| SQL ID | 반영 | 결과 |
|---|---|---|
| GetRuleColList | 분석 §6 #1 / §6.1 #1 | ○ |
| GetMasterRuleDataList | 분석 §6 #2 / §6.1 #2 | ○ |
| GetMasterRuleDataListExport | 분석 §6 #3 / §6.1 #3 | ○ |

→ Mapper.xml SQL 3/3 반영. ○. orphan 없음 (masterRuleData 의 #4~#6 = GetMaxRuleSeq/orphan 2종이 본 Mapper 에 부재 — 분석 §6 비고).

### §E.4 BPMN flow 전수

| 노드 / flow | 반영 | 결과 |
|---|---|---|
| StartEvent_1, EndEvent_1, ExclusiveGateway_1 | 분석 §8.2 / BPMN §3 | ○ |
| Task_0ru18qa, Task_0ifp7u0 | 분석 §8.2 / BPMN §3.2, §3.4 | ○ |
| UserTask_067lppc | 분석 §8.2 / §7 / BPMN §4.1 | ○ |
| SequenceFlow 7개 (1, 0grwghu, 1x309em, 03tu9nr, 1jzueym, 167nz13, 1lritbv) | 분석 §8.3 + BPMN §3.5 | ○ |
| BPMN Diagram 좌표 6 노드 | 분석 §8.5 | ○ |

→ BPMN 노드 5 (Start/End + Gateway + Task 2 + UserTask 1) + flow 7 모두 반영. ○. masterRuleData(노드 6 + flow 9) 대비 save UserTask 1 + save flow 2 가 없다 (분석 §8.3 비고).

### §E.5 As-Is 주석 / 미사용 코드 보존 점검

| 항목 | 처리 |
|---|---|
| xfdl:542~543 (주석된 oArg = {sRuleId, sRuleNm}) | 분석 §5.1 비고 — 이전 인자 방식 잔존 보존 |
| xfdl:59, 64, 69, 74, 79 (주석된 LIKE 분기 pValN 처리) | 분석 §7.1 비고 — UPPER 단순화로 대체, 잔존 보존 |
| java:100~115 (이전방식 직접 context 값 블록 주석) | 분석 §7.1 비고 — UPPER 래핑 방식 대체, 잔존 보존 |
| java:125 (주석된 context.put 직접 적재) | 분석 §7.1 단계 8 — addDaoResultIntoContext 로 대체, 잔존 보존 |
| xfdl:428 (주석된 gfn_exportExcel 직접 호출) | 분석 §4.2 — search_export 서버 경유로 대체, 잔존 보존 |
| fn_returnMasterCodePopupCallBack (xfdl:593 지정 / 본문 미정의) | 분석 §5.1 비고 — no-op 보존 |
| ★ 변수명 혼동 pTable=context.get("pRuleId") (java:29) | 분석 §7.1 비고 — As-Is 보존 + To-Be 정정 검토 (Q-009) |
| 외부 Mapper / CommonDaoUtil | 본 자료 외부 — §2 인용 형태 보존 |

---

## §F. To-Be 변환점

### §F.1 DB 변환점 (As-Is Oracle → To-Be MSSQL) — 분석 §11

| 변환점 | As-Is | To-Be | 분석 §11 |
|---|---|---|---|
| 페이징 ROW_NUMBER/BETWEEN | CTE + ROW_NUMBER() OVER(ORDER BY RULE_SEQ) | ROW_NUMBER 또는 OFFSET/FETCH | ○ |
| NVL → ISNULL/COALESCE | NVL(#{x},1) | ISNULL/COALESCE | ○ |
| DUAL 제거 | FROM dual (CTE PARAM) | (VALUES) 또는 제거 | ○ |
| 문자열 결합 `\|\|` → `+`/CONCAT | 'TB_MCA_' \|\| #{pRuleId} | 'TB_MCA_' + #{pRuleId} | ○ |
| 시스템 카탈로그 PK 판정 | ALL_CONS_COLUMNS / NVL2 | INFORMATION_SCHEMA / sys.indexes (본 화면 PK_YN 미사용 — 우선순위 낮음) | ○ |
| UPPER 검색 | UPPER(col) / UPPER('val') 문자열 주입 | MSSQL UPPER 동일 + `${}` 안전화 동반 | ○ |
| 스키마명 | MCAAPUSER (명시) | 메타 owner=MCAAPUSER (해소) / 동적 테이블 owner=MCAAPUSER (Q-001b DDL on-demand) / `${sSchema}` 미전달 시 기본 MCAAPUSER | ○ |
| `${}` 동적 치환 안전화 | pTable/pWhereN/pOperatorN/pValN (5쌍) | 화이트리스트(컬럼정의 메타 검증) + 바인딩 — **Q-007** | ○ |
| Java 변수명 혼동 | pTable=context.get("pRuleId") (실제 ruleId 값) | To-Be 변수명 정정 검토 — **Q-009** (As-Is 보존) | ○ |

비고: ★ masterRuleData 의 긴급적용 DynamicSqlExecutor(Q-008)·audit setAuditField(Q-006)·orphan SQL #5/#6(Q-005) 변환점은 본 화면에 비해당 (저장 자체 부재 — 조회 전용).

### §F.2 식별자 변환점

| 항목 | As-Is | To-Be |
|---|---|---|
| Form id / process id | MasterRuleDataList | masterRuleDataList |
| Mapper namespace | MasterRuleDataListMapper | masterRuleDataListMapper |
| serviceId 변수 치환 | "MasterRuleDataList" | "masterRuleDataList" |
| sqlKey (BPMN) | `#{serviceId}Mapper.{sqlId}` | (식 보존, 주입 값 변경) |
| BPMN action 식별자 | search / lov / search_export | masterRuleDataList_search / _lov / _searchExport |
| Java 패키지 | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataList.* | com.dongkuk.dmes.mcm.cmb.masterRuleDataList.service.* |

### §F.3 결정 누적 / 미결

활성 확인필요 = **0 건**. Q-004(부모)=메뉴 직접 진입(GUI 부모 없음) 해소 / Q-009(변수명)=To-Be 정정 확정 (2026-06-05). 분석 §12 참조. Q-001a(메타 수록 해소)·Q-001b(DDL on-demand)·Q-002(초기값 보존)·Q-003(FE 동적그리드 동일 구현)·Q-007(동적 SQL 안전화)·영속성(JPA)은 사용자 확정 2026-06-04. 본 화면은 저장·긴급적용·orphan SQL 이 없어 masterRuleData 의 Q-005/Q-006/Q-008 비해당.

---

## §G. 종합

| 게이트 | 결과 |
|---|---|
| §A 단일 원천 정합 | ○ |
| §B 식별자 정합 | ○ |
| §C SQL ID 일치 | ○ (orphan 없음 — 조회 3종뿐 / 외부 Mapper(TB_MCA_RULE_COL_LIST_Mapper) As-Is 유지+안전화 Q-007 확정) |
| §D 명명 정합 D1~D2 / D5 | ○ |
| §D.3 테이블 명명 | ○ (메타 2테이블 DMES-SECTION-MCA 수록 해소 / 동적 데이터 테이블 = DDL on-demand 확정 Q-001b) |
| §D.4 manifest 9 파일 | ✗ (Runner 미실행 — 사용자 결정) |
| §E As-Is 누락 0 | ○ |
| §F To-Be 변환점 | ○ (메타 해소 / Q-001b DDL on-demand·Q-007 사용자 확정 / Q-009 정정 검토) |

**최종 정합 결과 = ○ (설계 완료 — As-Is 누락 0·식별자 정합 ○ / 활성 확인필요 0건. 메타 오탐 해소 + Q-001b(DDL on-demand)·Q-002/3/7·영속성 확정 2026-06-04, Q-004(부모)=메뉴 진입 해소·Q-009 변수명 정정 확정 2026-06-05. §D.4 manifest ✗ 는 R-14 미적용 의도 면제).**

---

## §H. Phase 종료 자동 고해성사

| # | 질문 | 답 |
|---|---|---|
| 1 | 사용자 요구사항 14항 위반? | No — As-Is xfdl 603줄 전수 정독(offset 분할 1~302/303~603), 영역/보조 div 10 / 조회조건 20(S-001~S-020) / Grid 정적 1(SEQ)+동적 빌드 / Dataset 11 / Java 메서드 1(run) / Mapper SQL 3 / BPMN 노드 5·flow 7 모두 전수 인용 + 모든 본문 file:line cite. 호출 팝업 2종(P-001 MasterRuleListPop / P-002 MasterCodeSelPop) 인자·콜백 전수. |
| 2 | 검증 안 한 부분? | To-Be 메타 테이블 카탈로그 — 정본 `DMES-SECTION-MCA` sheet134(COL_LIST)/sheet135(RULE_MASTER, 26컬럼) **수록 확인 → 컬럼 매핑 완료(Q-001a 해소)**. 동적 데이터 테이블 `TB_MCA_<업무기준ID>` 는 런타임 인스턴스라 고정 DDL 미수록(정상) → 영속/생성 전략 = **가족 공통 Q-001b(DDL on-demand) 확정**. 본 화면 캡처(cmb__MasterRuleDataList.png) **부재 — xfdl 단독 검증** (디자인 §10 / 본 정합 §H 명시). 외부 Mapper(TB_MCA_RULE_COL_LIST_Mapper) 정의 본문은 본 자산 외부이므로 인용만, 추측 ✗. |
| 3 | 그대로 수용? | mui 자료 본문/표/컬럼/SQL/flow 1:1 보존 (수정 ✗ / 병합 ✗). 주석 잔존(이전 인자 방식/LIKE 분기 주석/이전방식 블록/직접 export 호출) / 변수명 혼동(pTable=pRuleId) / "USD" 초기값 / no-op 콜백(fn_returnMasterCodePopupCallBack) 모두 보존 + Q-NNN 위임. |
| 4 | 임의 합리화? | No — 동적 데이터 테이블 전략(Q-001b)·동적 SQL 안전화(Q-007)·변수명 정정(Q-009)·in-coming(Q-004) 사용자 결정 위임. 메타 테이블은 정본 카탈로그(DMES-SECTION-MCA) 실측으로 해소. masterRuleData 선례를 무비판 복제하지 않고 본 화면의 **조회 전용·코드 룩업 팝업** 차이(save/orphan/긴급적용 부재 + MasterCodeSelPop 추가)를 §E 전수 구분. 임의 결론 ✗. |

→ 4 질문 모두 No (단 §2 는 동적 데이터 테이블 전략을 Q-001b 로 확정 명시 + 본 화면 캡처 부재 xfdl 단독 검증 명시) → 결과 반환 가능 (메타 해소 + 잔여 Q-004/Q-009 명시).
