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

# 업무기준 Data관리 (masterRuleData) 정합체크서

> 본 문서는 5종 산출물 간 식별자 / SQL ID / 액션 / 명명 / As-Is 누락 / To-Be 변환점의 정합성을 점검한다.
> 단일 원천 = [분석리포트](./masterRuleData_분석리포트.md).

---

## §A. 분석리포트 단일 원천 정합

### §A.1 5종 산출물 식별자 (frontmatter)

| 산출물 | screenId | asIsId | moduleId | moduleGroup | 정합 |
|---|---|---|---|---|---|
| 분석리포트 | masterRuleData | MasterRuleData | mcm | cmb | ○ |
| 기능설계서 | masterRuleData | MasterRuleData | mcm | cmb | ○ |
| 디자인설계서 | masterRuleData | MasterRuleData | mcm | cmb | ○ |
| BPMN설계서 | masterRuleData | MasterRuleData | mcm | cmb | ○ |
| 정합체크서 | masterRuleData | MasterRuleData | mcm | cmb | ○ |

### §A.2 5종 단일 원천 인용

| 산출물 | 분석리포트 인용 항목 | 정합 |
|---|---|---|
| 기능설계서 §3 (조회) | 분석 §3.2 (S-001~S-021) | ○ |
| 기능설계서 §4 (CRUD) | 분석 §6 (SQL) / §7 (Java) | ○ |
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
| screenId | masterRuleData | masterRuleData | masterRuleData | masterRuleData | ○ |
| asIsId | MasterRuleData | MasterRuleData | MasterRuleData | MasterRuleData | ○ |
| pageId | masterRuleData | masterRuleData | masterRuleData | masterRuleData | ○ |
| pageName | masterRuleData | masterRuleData | masterRuleData | masterRuleData | ○ |
| serviceId | masterRuleData | masterRuleData | masterRuleData | masterRuleData | ○ |
| 화면명 (titletext) | 업무기준 Data관리 | 업무기준 Data관리 | 업무기준 Data관리 | 업무기준 Data관리 | ○ |

### §B.2 영역 / 버튼 / 그리드 ID 정합

| ID | 분석 | 기능 | 디자인 | BPMN | 정합 |
|---|---|---|---|---|---|
| A-001~A-005 | ✓ §3.1 | (간접) | ✓ §2 | - | ○ |
| C-001~C-007 | ✓ §3.5 | (간접) | ✓ §2 | - | ○ |
| S-001~S-021 | ✓ §3.2 | ✓ §3.1 | ✓ §3.1 | - | ○ |
| G-001 (동적컬럼) | ✓ §3.3 | ✓ §3.2 | ✓ §4 | - | ○ |
| B-001~B-011 | ✓ §4 | ✓ §5 | ✓ §5 | ✓ §1.1 | ○ |
| GB-001~GB-002 | ✓ §4.4 | ✓ §5.2 | (포함) | (비대상) | ○ |
| P-001~P-002 | ✓ §5.1 | ✓ §9.1 | ✓ §6 | (비대상) | ○ |
| MSG-001~MSG-013 | (기능서 정본) | ✓ §10 | ✓ §7 | - | ○ |

---

## §C. SQL ID 일치 (Mapper.xml ↔ BPMN sqlKey ↔ Java)

### §C.1 Mapper.xml ↔ BPMN

| Mapper.xml SQL ID | BPMN sqlKey | BPMN 노드 | 정합 |
|---|---|---|---|
| GetRuleColList (Mapper:7) | #{serviceId}Mapper.GetRuleColList (bpmn:31) | Task_0ru18qa "lov목록 조회" (bpmn:24) | ○ |
| GetMasterRuleDataExport (Mapper:69) | #{serviceId}Mapper.GetMasterRuleDataExport (bpmn:71) | Task_02a3gu4 "Main 조회 엑셀 Export" (bpmn:64) | ○ |
| GetMasterRuleDataList (Mapper:32) | (BPMN 직접 인용 ✗ — UserTask 내 Java 호출) | UserTask_067lppc (bpmn:40) | ○ (간접, java:118) |
| GetMaxRuleSeq (Mapper:76) | (BPMN 직접 인용 ✗ — Java 호출) | UserTask_0zyva5v (bpmn:52) | ○ (간접, java:138) |
| InsertMasterRuleSpecDataList (Mapper:81) | (인용 ✗ — orphan 후보) | - | ○ (Q-005 제거 확정 2026-06-04) |
| UpdateMasterRuleSpecDataList (Mapper:87) | (인용 ✗ — orphan 후보) | - | ○ (Q-005 제거 확정 2026-06-04) |

### §C.2 Java ↔ Mapper / 외부 Mapper

| Java 호출 | 대상 | 라인 정합 |
|---|---|---|
| GetMasterRuleData (java:51) | TB_MCA_RULE_COL_LIST_Mapper.select (외부 Mapper) | ○ (외부 Mapper — 테이블 자체는 DMES-SECTION-MCA sheet134 수록) |
| GetMasterRuleData (java:118) | MasterRuleDataMapper.GetMasterRuleDataList (Mapper:32) | ○ |
| SaveMasterRuleData (java:138) | MasterRuleDataMapper.GetMaxRuleSeq (Mapper:76) | ○ |
| SaveMasterRuleData (java:92/124/171) | `${pTable}_Mapper.update/delete/insert` (외부 동적 Mapper) | ○ (외부 — Q-005/Q-007) |
| SaveMasterRuleData (java:88/120/168) | DynamicSqlExecutor (긴급적용) | ○ (외부 유틸 — Q-008) |

### §C.3 xfdl ↔ BPMN (sOutDatasets ↔ resultKey)

| xfdl sOutDatasets | BPMN resultKey / java context | 정합 |
|---|---|---|
| ds_grdMain=ds_GetMasterRuleData (xfdl:405, 556) | GetMasterRuleData.addDaoResultIntoContext("ds_GetMasterRuleData", java:119) | ○ |
| ds_lovData=ds_GetRuleColList (xfdl:461) | Task_0ru18qa.resultKey = ds_GetRuleColList (bpmn:32) | ○ |
| ds_grdDownload=ds_GetMasterRuleDataExport (xfdl:705) | Task_02a3gu4.resultKey = ds_GetMasterRuleDataExport (bpmn:72) | ○ |
| (save 콜백) strErrorMsg["cnt_save"] (xfdl:684) | SaveMasterRuleData.addDaoResultIntoContext("cnt_save", java:183) | ○ |

---

## §D. 식별자 명명 정합 (D1~D5)

### §D.1 screenId 명명 규칙 (`{화면명}` lowerCamel 단일 토큰)

- 정본: MasterRuleData → masterRuleData (모듈명 토큰 ✗) → ○
- moduleId = `mcm` (한글명 **"공통관리"**) / moduleGroup = `cmb` (한글명 **"업무기준 관리(원장)"** — 사용자 결정 등재)
- 메뉴 계층: 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 업무기준 Data관리 (masterRuleData)

### §D.2 BPMN 기능 식별자 명명 규칙 (`{screenId}_{기능명}`)

| To-Be 식별자 | 원천 (As-Is action) | 명명 정합 |
|---|---|---|
| masterRuleData_search | search (bpmn:23) | ○ |
| masterRuleData_lov | lov (bpmn:38) | ○ |
| masterRuleData_save | save (bpmn:62) | ○ |
| masterRuleData_searchExport | search_export (bpmn:79) | ○ |

### §D.3 테이블 명명

| 항목 | As-Is | To-Be 권장 |
|---|---|---|
| 동적 데이터 | MCA_SOURCE.TB_MCA_<업무기준ID> | **Q-001 (동적전략)** — 런타임 인스턴스 테이블, 영속/생성 전략 미확정 (DDL on-demand vs EAV vs JSON) |
| 컬럼정의 | MCA_SOURCE.TB_MCA_RULE_COL_LIST | **MCAAPUSER.TB_MCA_RULE_COL_LIST** — DMES-SECTION-MCA sheet134 수록 (해소) |
| 업무기준 마스터 | MCA_SOURCE.TB_MCA_RULE_MASTER | **MCAAPUSER.TB_MCA_RULE_MASTER** — DMES-SECTION-MCA sheet135(26컬럼) 수록 (해소) |

→ ★ 메타 2테이블(COL_LIST/RULE_MASTER)은 정본 `DMES-SECTION-MCA_테이블정의서.xlsx` 에 수록 확인(masterRuleList §9.1 정합) → **Q-001 메타 부분 해소**. 동적 데이터 테이블 `TB_MCA_<업무기준ID>` 만 런타임 인스턴스라 미수록(정상) → **Q-001 (동적 데이터 테이블 To-Be 전략)** 잔존 (임의 추론 금지).

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
| 영역/보조 div | 12 (div_title, edt_title, div_topMenu, div_search, btn_fold, div_main, grd_main, div_rightMenu, div_paging, grd_Download, Button00, div_bottom) | 분석 §3.1 (A-001~A-005) + §3.5 (C-001~C-007) + Grid | ○ |
| 조회조건 컴포넌트 | 21 (stc 2 + edt(ruleId/ruleNm) 2 + btn 1 + cbo_lov 5 + cbo_operator 5 + edt_val 5 + chk 1) | 분석 §3.2 (S-001~S-021) | ○ |
| Grid 정적 컬럼 | 3 (CHK/SEQ/STATUS) | 분석 §3.3 (정적 표) | ○ |
| Grid 동적 컬럼 | N (런타임 빌드) | 분석 §3.3 (빌드 로직 9속성 전수) | ○ |
| Dataset | 11 (ds_grdMain, ds_lovData, ds_lov1~5, ds_srch, ds_common, ds_grdDownload) | 분석 §3.3 dataset 표 전수 | ○ |
| Script 함수 | 22 (fn_formBeforeOnload, MasterRuleData_onload, fn_formAfterOnload, fn_button, fn_searchPaging, fn_search, div_search_btn_ruleId_onclick, fn_returnRulePopupCallBack, fn_lov, fn_rowAdd, fn_rowCopy, fn_rowDelete, fn_rowCancel, fn_save, fn_callBack, btn_fold_onclick, fn_excelDown, fn_excelUp, fn_returnMasterRuleDataUploadFilePopupCallBack, div_main_grd_main_onheadclick, ds_grdMain_oncolumnchanged) | 기능 §2 흐름도 + §4 + §5 + §10 에 반영 | ○ |

비고: Script 함수 전수 = 21 (위 목록 — fn_formBeforeOnload xfdl:325 / onload 336 / fn_formAfterOnload 343 / fn_button 349 / fn_searchPaging 364 / fn_search 372 / btn_ruleId_onclick 429 / fn_returnRulePopupCallBack 441 / fn_lov 455 / fn_rowAdd 470 / fn_rowCopy 485 / fn_rowDelete 497 / fn_rowCancel 518 / fn_save 523 / fn_callBack 582 / btn_fold_onclick 692 / fn_excelDown 698 / fn_excelUp 716 / fn_returnMasterRuleDataUploadFilePopupCallBack 726 / div_main_grd_main_onheadclick 732 / ds_grdMain_oncolumnchanged 752).

### §E.2 Java 메서드 전수

| 클래스 | 메서드 | 반영 | 결과 |
|---|---|---|---|
| GetMasterRuleData | run(Context, Task) (java:20~128) | 분석 §7.1 단계 1~9 | ○ |
| SaveMasterRuleData | run(Context, Task) (java:32~190) | 분석 §7.2 단계 1~8 | ○ |
| SaveMasterRuleData | filterKeyByColId (java:193~214) | 분석 §7.2 보조 메서드 | ○ |
| SaveMasterRuleData | setAuditField (java:217~231) | 분석 §7.2 보조 메서드 | ○ |

→ Java 메서드 = 4 (Get run / Save run, filterKeyByColId, setAuditField) — 모두 반영. ○

### §E.3 Mapper.xml SQL 전수

| SQL ID | 반영 | 결과 |
|---|---|---|
| GetRuleColList | 분석 §6 #1 / §6.1 #1 | ○ |
| GetMasterRuleDataList | 분석 §6 #2 / §6.1 #2 | ○ |
| GetMasterRuleDataExport | 분석 §6 #3 / §6.1 #3 | ○ |
| GetMaxRuleSeq | 분석 §6 #4 / §6.1 #4 | ○ |
| InsertMasterRuleSpecDataList | 분석 §6 #5 / §6.1 #5 (orphan 후보) | ○ |
| UpdateMasterRuleSpecDataList | 분석 §6 #6 / §6.1 #6 (orphan 후보) | ○ |

→ Mapper.xml SQL 6/6 반영. ○

### §E.4 BPMN flow 전수

| 노드 / flow | 반영 | 결과 |
|---|---|---|
| StartEvent_1, EndEvent_1, ExclusiveGateway_1 | 분석 §8.2 / BPMN §3 | ○ |
| Task_0ru18qa, Task_02a3gu4 | 분석 §8.2 / BPMN §3.2, §3.4 | ○ |
| UserTask_067lppc, UserTask_0zyva5v | 분석 §8.2 / §7 / BPMN §4 | ○ |
| SequenceFlow 9개 (1, 0grwghu, 1x309em, 03tu9nr, 1jzueym, 0dqldpo, 0vcg09z, 0k1ued4, 17wvr16) | 분석 §8.3 + BPMN §3.5 | ○ |
| BPMN Diagram 좌표 7 노드 | 분석 §8.5 | ○ |

→ BPMN 노드 6 + flow 9 모두 반영. ○

### §E.5 As-Is 주석 / 미사용 코드 보존 점검

| 항목 | 처리 |
|---|---|
| xfdl:352 (주석된 사용자정의버튼 btn_dec/"확정") | 분석 §4.1 비고 — 미사용 명시 |
| xfdl:95~110 (GetMasterRuleData 이전방식 블록 주석) | 분석 §7.1 비고 — 잔존 보존 |
| xfdl:478~479, 612~613, 615 (주석된 setCellProperty / editmaxlength) | 분석 §3.3 / §9.2 비고 — 임시조치 보존 |
| InsertMasterRuleSpecDataList / UpdateMasterRuleSpecDataList (orphan 후보) | §6 #5/#6 — Q-005 위임 (보존 vs 제거) |
| 외부 Mapper / DynamicSqlExecutor / CommonUtil | 본 자료 외부 — §2 인용 형태 보존 |

---

## §F. To-Be 변환점

### §F.1 DB 변환점 (As-Is Oracle → To-Be MSSQL) — 분석 §11

| 변환점 | As-Is | To-Be | 분석 §11 |
|---|---|---|---|
| 페이징 ROW_NUMBER/BETWEEN | CTE + ROW_NUMBER() OVER | ROW_NUMBER 또는 OFFSET/FETCH | ○ |
| NVL → ISNULL/COALESCE | NVL(...) | ISNULL/COALESCE | ○ |
| DUAL 제거 | FROM dual | (VALUES) 또는 제거 | ○ |
| 문자열 결합 `\|\|` → `+`/CONCAT | 'TB_MCA_' \|\| #{pRuleId} | 'TB_MCA_' + #{pRuleId} | ○ |
| 시스템 카탈로그 PK 판정 | ALL_CONS_COLUMNS / NVL2 | sys.indexes / INFORMATION_SCHEMA | ○ |
| 스키마명 | MCA_SOURCE | 메타 owner=MCAAPUSER (해소) / 동적 테이블 owner=**Q-001(동적전략)** | ○ |
| `${}` 동적 치환 안전화 | pTable/pColumns/pWhereN 등 | 화이트리스트 + 바인딩 — **Q-007** | ○ |
| 긴급적용 DynamicSqlExecutor | Mapper 미경유 직접 | To-Be 동적 실행기 — **Q-008** | ○ |
| audit | setAuditField 8컬럼 수기 | cactus 적용 검토 (동적테이블 비표준) — **Q-006** | ○ |
| orphan SQL #5/#6 | 정의됨 + 호출 ✗ | **Q-005** (보존 vs 제거) | ○ |

### §F.2 식별자 변환점

| 항목 | As-Is | To-Be |
|---|---|---|
| Form id / process id | MasterRuleData | masterRuleData |
| Mapper namespace | MasterRuleDataMapper | masterRuleDataMapper |
| serviceId 변수 치환 | "MasterRuleData" | "masterRuleData" |
| sqlKey (BPMN) | `#{serviceId}Mapper.{sqlId}` | (식 보존, 주입 값 변경) |
| BPMN action 식별자 | search / lov / save / search_export | masterRuleData_search / _lov / _save / _searchExport |
| Java 패키지 | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleData.* | com.dongkuk.dmes.mcm.cmb.masterRuleData.service.* |

### §F.3 결정 누적 / 미결

활성 확인필요 = **0 건**. Q-004(부모)는 호출관계 조사로 **해소(메뉴 직접 진입, GUI 부모 없음, 2026-06-05)**. 분석 §12 참조. Q-001(동적 데이터 테이블 = DDL on-demand)·Q-002/3/5/6/7/8·영속성(JPA)은 사용자 확정 2026-06-04. 메타 테이블은 DMES-SECTION-MCA 수록 확인으로 해소.

---

## §G. 종합

| 게이트 | 결과 |
|---|---|
| §A 단일 원천 정합 | ○ |
| §B 식별자 정합 | ○ |
| §C SQL ID 일치 | ○ (orphan #5/#6 제거 확정 Q-005 / 외부 Mapper·DynamicSqlExecutor As-Is 유지+안전화 Q-007/Q-008 확정) |
| §D 명명 정합 D1~D2 / D5 | ○ |
| §D.3 테이블 명명 | ○ (메타 2테이블 DMES-SECTION-MCA 수록 / 동적 데이터 테이블 = DDL on-demand 확정 Q-001) |
| §D.4 manifest 9 파일 | ✗ (Runner 미실행 — 사용자 결정) |
| §E As-Is 누락 0 | ○ |
| §F To-Be 변환점 | ○ (메타 해소 / Q-001 DDL on-demand·Q-005·Q-006·Q-007·Q-008 사용자 확정) |

**최종 정합 결과 = ○ (설계 완료 — As-Is 누락 0·식별자 정합 ○ / 활성 확인필요 0건. 메타 테이블 오탐 해소 + Q-001(DDL on-demand)·Q-002/3/5/6/7/8·영속성 확정 2026-06-04, Q-004(부모)=메뉴 진입 해소 2026-06-05. §D.4 manifest ✗ 는 R-14 미적용 의도 면제).**

---

## §H. Phase 종료 자동 고해성사

| # | 질문 | 답 |
|---|---|---|
| 1 | 사용자 요구사항 14항 위반? | No — As-Is xfdl 760줄 전수 정독(offset 분할), 영역/보조 div 12 / 조회조건 21 / Grid 정적 3+동적 빌드 / Dataset 11 / Java 메서드 4 / Mapper SQL 6 / BPMN 노드 6·flow 9 모두 전수 인용 + 모든 본문 file:line cite. |
| 2 | 검증 안 한 부분? | To-Be 메타 테이블 카탈로그 — 정본 `DMES-SECTION-MCA` sheet134(COL_LIST)/sheet135(RULE_MASTER, 26컬럼) **수록 확인 → 컬럼 매핑 완료(Q-001 메타 해소)**. 동적 데이터 테이블 `TB_MCA_<업무기준ID>` 는 런타임 인스턴스라 고정 DDL 미수록(정상) — 영속/생성 전략은 **임의 추론하지 않고 Q-001(동적전략) 위임**. 동적 컬럼/긴급적용/외부 Mapper·DynamicSqlExecutor 는 본 자산 외부이므로 인용만, 정의 본문 추측 ✗. |
| 3 | 그대로 수용? | mui 자료 본문/표/컬럼/SQL/flow 1:1 보존 (수정 ✗ / 병합 ✗). 주석 잔존(btn_dec/이전방식/임시조치) / orphan SQL #5#6 / audit 프로그램ID 오기준 / "USD"·"KR/A" 초기값 / 영향행≤0 예외미발생 모두 보존 + Q-NNN 위임. |
| 4 | 임의 합리화? | No — 동적 데이터 테이블 전략·긴급적용·orphan SQL·audit·in-coming 모두 Q-001~Q-008 로 사용자 결정 위임. 메타 테이블은 정본 카탈로그(DMES-SECTION-MCA) 실측으로 해소하고, 동적 데이터 테이블만 동적 전략 Q 로 분리 보고. masterCategoryMng 선례를 무비판 복제하지 않고 본 화면의 동적 특성을 구분. 임의 결론 ✗. |

→ 4 질문 모두 No (단 §2 는 동적 데이터 테이블 전략을 Q-001 로 위임 명시) → 결과 반환 가능 (메타 해소 + 미결 8건 — Q-001 동적전략 포함 — 명시).
