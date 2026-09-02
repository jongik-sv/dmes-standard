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

# 업무기준 구조관리 (masterRuleFrame) 정합체크서

> 본 문서는 5종 산출물 간 식별자 / SQL ID / 액션 / 명명 / As-Is 누락 / To-Be 변환점의 정합성을 점검한다.
> 단일 원천 = [분석리포트](./masterRuleFrame_분석리포트.md).

---

## §A. 분석리포트 단일 원천 정합

### §A.1 5종 산출물 식별자 (frontmatter)

| 산출물 | screenId | asIsId | moduleId | moduleGroup | 정합 |
|---|---|---|---|---|---|
| 분석리포트 | masterRuleFrame | MasterRuleFrame | mcm | cmb | ○ |
| 기능설계서 | masterRuleFrame | MasterRuleFrame | mcm | cmb | ○ |
| 디자인설계서 | masterRuleFrame | MasterRuleFrame | mcm | cmb | ○ |
| BPMN설계서 | masterRuleFrame | MasterRuleFrame | mcm | cmb | ○ |
| 정합체크서 | masterRuleFrame | MasterRuleFrame | mcm | cmb | ○ |

### §A.2 5종 단일 원천 인용

| 산출물 | 분석리포트 인용 항목 | 정합 |
|---|---|---|
| 기능설계서 §3 (조회) | 분석리포트 §3.2 (S-001~S-004) | ○ |
| 기능설계서 §4 (CRUD) | 분석리포트 §6 (SQL) / §7 (Java) | ○ |
| 기능설계서 §5 (action) | 분석리포트 §4.6 | ○ |
| 기능설계서 §9 (팝업) | 분석리포트 §5 | ○ |
| 기능설계서 §10 (메시지) | 분석리포트 §3 + xfdl 직접 인용 | ○ |
| 디자인설계서 §3 (조회조건) | 분석리포트 §3.2 | ○ |
| 디자인설계서 §4 (그리드) | 분석리포트 §3.3 | ○ |
| 디자인설계서 §5 (버튼) | 분석리포트 §4 | ○ |
| 디자인설계서 §6 (팝업) | 분석리포트 §5 | ○ |
| BPMN설계서 §1 (액션) | 분석리포트 §4.6 / §8.4 | ○ |
| BPMN설계서 §3 (flow) | 분석리포트 §8.2 / §8.3 | ○ |
| BPMN설계서 §4 (Java) | 분석리포트 §7 | ○ |

---

## §B. 식별자 정합

### §B.1 화면 식별자

| 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 정합 |
|---|---|---|---|---|---|
| screenId | masterRuleFrame | masterRuleFrame | masterRuleFrame | masterRuleFrame | ○ |
| asIsId | MasterRuleFrame | MasterRuleFrame | MasterRuleFrame | MasterRuleFrame | ○ |
| pageId | masterRuleFrame | masterRuleFrame | masterRuleFrame | masterRuleFrame | ○ |
| pageName | masterRuleFrame | masterRuleFrame | masterRuleFrame | masterRuleFrame | ○ |
| serviceId | masterRuleFrame | masterRuleFrame | masterRuleFrame | masterRuleFrame | ○ |
| 화면명 (titletext) | 업무기준 구조관리 | 업무기준 구조관리 | 업무기준 구조관리 | 업무기준 구조관리 | ○ |

### §B.2 영역 / 버튼 / 그리드 / 팝업 ID 정합

| ID | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 정합 |
|---|---|---|---|---|---|
| A-001~A-005 | ✓ §3.1 | (간접 인용) | ✓ §2 | - | ○ |
| S-001~S-004 | ✓ §3.2 | ✓ §3.1 | ✓ §3.1 | - | ○ |
| G-001 (IN) / G-002 (OUT) | ✓ §3.3 | ✓ §3.2 | ✓ §4 | - | ○ |
| B-001~B-009 | ✓ §4 | ✓ §5 | ✓ §5 | ✓ §1.1/§1.2 | ○ |
| P-001 / P-002 | ✓ §5.1 | ✓ §9.1 | ✓ §6 | ✓ §1.2 | ○ |
| MSG-001~MSG-012 | (분석리포트 미세분 — 기능서가 정본) | ✓ §10 | ✓ §10.1 | - | ○ |

---

## §C. SQL ID 일치 (Mapper.xml ↔ BPMN sqlKey ↔ Java)

### §C.1 Mapper.xml ↔ BPMN

| Mapper.xml SQL ID | BPMN sqlKey | BPMN 노드 | 정합 |
|---|---|---|---|
| GetRuleColInList (Mapper:7) | #{serviceId}Mapper.GetRuleColInList (bpmn:27) | Task_1j1g5cn "결과 항목 조회(IN)" (bpmn:20) | ○ |
| GetRuleColOutList (Mapper:30) | #{serviceId}Mapper.GetRuleColOutList (bpmn:43) | Task_1c4n8uv "결과 항목 조회(OUT)" (bpmn:36) | ○ |

### §C.2 Java ↔ 외부 공통 Mapper

| Java 호출 (SaveMasterRuleColList.java) | SQL ID | 라인 정합 |
|---|---|---|
| TB_MCA_RULE_COL_LIST_Mapper.delete (java:34) | (외부 공통 Mapper — 본 화면 Mapper.xml 외부) | ○ (인용) |
| TB_MCA_RULE_COL_LIST_Mapper.insert IN (java:58) | (외부 공통 Mapper) | ○ (인용) |
| TB_MCA_RULE_COL_LIST_Mapper.insert OUT (java:83) | (외부 공통 Mapper) | ○ (인용) |

비고: 본 화면 Mapper.xml(MasterRuleFrameMapper) 은 SELECT 2개만 정의 — INSERT/UPDATE/DELETE 부재. 저장은 외부 공통 Mapper (TB_MCA_RULE_COL_LIST_Mapper) 호출 (As-Is 1:1 보존).

### §C.3 xfdl ↔ BPMN (sOutDatasets ↔ resultKey)

| xfdl sOutDatasets | BPMN resultKey | 정합 |
|---|---|---|
| ds_grdIn=ds_GetRuleColInList (xfdl:254, 364) | Task_1j1g5cn.resultKey = ds_GetRuleColInList (bpmn:28) | ○ |
| ds_grdOut=ds_GetRuleColOutList (xfdl:254, 364) | Task_1c4n8uv.resultKey = ds_GetRuleColOutList (bpmn:44) | ○ |
| (save 콜백) strErrorMsg["cnt_save"] (xfdl:392) | SaveMasterRuleColList.run() addDaoResultIntoContext("cnt_save", ...) (java:93) | ○ |

---

## §D. 식별자 명명 정합 (D1~D5)

### §D.1 screenId 명명 규칙 (`{화면명}` 단일 토큰 — 01 부속 §A.3.1)

- 정본: MasterRuleFrame → masterRuleFrame (모듈명 토큰 ✗) → ○
- moduleId = `mcm` (한글명 **"공통관리"**) / moduleGroup = `cmb` (한글명 **"업무기준 관리(원장)"** — 사용자 결정 / 01 부속 §A.2.3 **등재 완료 2026-06-04**, 영역 코드 `cm`+`b`)
- 메뉴 계층: 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 업무기준 구조관리 (masterRuleFrame)

### §D.2 BPMN 기능 식별자 명명 규칙 (`{screenId}_{기능명}`)

| To-Be 식별자 | 원천 (As-Is action) | 명명 정합 |
|---|---|---|
| masterRuleFrame_search | search (bpmn:19) | ○ |
| masterRuleFrame_save | save (bpmn:62) | ○ |
| masterRuleFrame_searchIn | Task_1j1g5cn (bpmn:20) | ○ |
| masterRuleFrame_searchOut | Task_1c4n8uv (bpmn:36) | ○ |

### §D.3 테이블 명명

| 항목 | As-Is | To-Be 권장 |
|---|---|---|
| 업무기준 컬럼 | MCA_SOURCE.TB_MCA_RULE_COL_LIST (synonym) | **MCAAPUSER.TB_MCA_RULE_COL_LIST 보존** (정본 sheet134 owner — Q-001 Resolved) |
| 업무기준 마스터 | MCA_SOURCE.TB_MCA_RULE_MASTER | **MCAAPUSER.TB_MCA_RULE_MASTER 보존** (정본 sheet135 owner) |

→ TB_{모듈}_{역할} 패턴 부합 (MCA / RULE_COL_LIST). ○ — To-Be DDL = 정본 DMES-SECTION-MCA sheet134/135 확정 (Q-001 Resolved).

### §D.4 manifest 9 파일 정합

| 항목 | 결과 | 사유 |
|---|---|---|
| manifest.lock.json | ✗ | Runner 미실행 — 사용자 결정 (R-14 미적용) |
| index.json | ✗ | 〃 |
| discover.trace.json | ✗ | 〃 |
| classify.trace.json | ✗ | 〃 |
| fallback.trace.json | ✗ | 〃 |
| q-stable-key.json | ✗ | 〃 |
| conflict-report.json | (해당 없음) | 〃 |
| verify-report.json | ✗ | 〃 |
| error.log | (해당 없음) | 〃 |

**§D.4 종합 = ✗ (Runner 미적용 — 사용자 결정에 따라 deferred. manifest 폴더 생성 ✗ — 처리 절차 A).**

### §D.5 frontmatter 필드 — 5종 모두 작성

| 산출물 | screenId | asIsId | moduleId | moduleGroup | 작성일 | 작성자 | 결과 |
|---|---|---|---|---|---|---|---|
| 분석리포트 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 기능설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 디자인설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| BPMN설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 정합체크서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |

(기능/디자인/BPMN/정합 4종은 pageName/pageId/serviceId 3 추가 필드 포함 — frontmatter 9 필드).

---

## §E. As-Is 누락 0 점검

### §E.1 xfdl 전수 정합

| 항목 | xfdl 카운트 | 본 산출물 반영 | 결과 |
|---|---:|---:|---|
| Form 영역/컴포넌트 | div_title + div_search + btn_fold + div_main(div_in/div_out) + div_bottom + grd_in + grd_out + 상단/하단 메뉴 div + edt_title | 분석리포트 §3.1 (A-001~A-005) + §3.5 (C-001~C-005) + §3.3 Grid 2 | ○ |
| 조회조건 입력 컴포넌트 | 6 (edt_stc 2 + edt 2 + btn 2) | 분석리포트 §3.2 (S-001~S-004) + §4.2 (B-003/B-004) | ○ |
| Grid columns | IN 7 + OUT 7 (head/body 각 7) | 분석리포트 §3.3 (col 0~6 × 2) | ○ |
| Dataset ds_grdIn ColumnInfo | 12 | 분석리포트 §3.3 dataset 표 | ○ |
| Dataset ds_grdOut ColumnInfo | 12 | 분석리포트 §3.3 dataset 표 | ○ |
| 정적 콤보 Dataset | ds_div(2행) + ds_colType(3행) | 분석리포트 §3.3 / §10 | ○ |
| 행추가/행삭제 버튼 | 4 (IN 2 + OUT 2) | 분석리포트 §4.3 (B-005~B-008) | ○ |
| Script 함수 | 16 (MasterRuleFrame_onload, fn_button, fn_search, fn_save, fn_callBack, div_search_div_search_btn_ruleIdPop_onclick, fn_returnMasterPopupCallBack, div_search_div_search1_btn_ruleCol_onclick, fn_returnColListPopupCallBack, btn_fold_onclick, div_main_div_in_btn_rowAdd_onclick, div_main_div_in_btn_rowDelete_onclick, div_main_div_out_btn_rowAdd_onclick, div_main_div_out_btn_rowDelete_onclick) | 기능설계서 §2 흐름도 + §5 (action) + §9 (팝업) 반영 | ○ (전수) |

비고: Script 정의 함수 = 14 (위 14 — 분석리포트/기능서/디자인서/BPMN서 어디서든 명시). 추가로 onchanged 바인딩 `div_main_div_in_mae_inCnt_onchanged` (xfdl:45) 는 **정의 부재 orphan** → 분석리포트 §3.5 / 기능서 §11 에 "To-Be 제거" 명시. ○

### §E.2 Java 메서드 전수

| 메서드 | 본 산출물 반영 | 결과 |
|---|---|---|
| run(Context, Task) (java:20~100) | 분석리포트 §7.2 단계 1~10 분해 | ○ |

→ Java 클래스 메서드 = 1 (run 단일) — 모두 반영. ○

### §E.3 Mapper.xml SQL 전수

| SQL ID | 본 산출물 반영 | 결과 |
|---|---|---|
| GetRuleColInList | 분석리포트 §6 #1 / §6.1 #1 | ○ |
| GetRuleColOutList | 분석리포트 §6 #2 / §6.1 #2 | ○ |
| (외부) TB_MCA_RULE_COL_LIST_Mapper.delete/insert | 분석리포트 §6.1 외부 Mapper 표 / §7.2 | ○ (인용) |

→ 본 화면 Mapper.xml SQL 2/2 + 외부 공통 2 모두 반영. ○

### §E.4 BPMN flow 전수

| 노드 / flow | 본 산출물 반영 | 결과 |
|---|---|---|
| StartEvent_1, EndEvent_1, ExclusiveGateway_1 | 분석리포트 §8.2 / BPMN설계서 §3 | ○ |
| Task_1j1g5cn, Task_1c4n8uv | 분석리포트 §8.2 | ○ |
| SaveMasterRuleColList (UserTask) | 분석리포트 §8.2 / §7 / BPMN설계서 §4 | ○ |
| SequenceFlow 6개 (1, 0grwghu, 19mau2h, 10i9t2b, 1ul62kh, 0ifq7qf) | 분석리포트 §8.3 + BPMN설계서 §3.3 | ○ |
| BPMN Diagram 좌표 6 노드 | 분석리포트 §8.5 | ○ |

→ BPMN 노드 6 + flow 6 모두 반영. ○

### §E.5 As-Is 주석 / 미사용 코드 보존 점검

| 항목 | 처리 |
|---|---|
| xfdl:362 (주석된 `ds_grdIn:U ds_grdOut:U` 변경분 송신) | 분석리포트 §4.6 비고 + 기능서 §4.5 — 전체 송신 운영, 주석 보존 명시 |
| java:35~40 (주석된 delete 반환값 검증 블록) | 분석리포트 §7.2 / 기능서 §11 #6 — As-Is 보존 명시 |
| div_main_div_in_mae_inCnt_onchanged (xfdl:45 바인딩, 정의 ✗) | 분석리포트 §3.5 / 기능서 §11 #3 — **To-Be 제거** (orphan) |
| "사용여부" 병합 헤더 의미 불일치 | 분석리포트 §3.3 / 기능서 §11 #4 / 디자인 §4.2 — As-Is 보존 |
| 외부 TB_MCA_RULE_COL_LIST_Mapper | 본 자료 외부 — §6.1 / §C.2 인용 형태 보존 |

---

## §F. To-Be 변환점

### §F.1 DB 변환점 (As-Is Oracle → To-Be MSSQL)

| 변환점 | As-Is | To-Be | 분석리포트 §11 |
|---|---|---|---|
| 스키마명 | MCA_SOURCE (synonym) → **`MCAAPUSER` 보존** (정본 sheet134/135 owner — Q-001 Resolved) | ○ |
| 동적 WHERE `<if>` | `<if test='pRuleId != null and pRuleId != ""'>` | JPA/native 조건 분기 | ○ |
| audit 컬럼 | (As-Is DDL 17 컬럼) | mcm-core `McmAuditEntity` 9 컬럼 (C_*/U_*/VER) — DATA_END_*/ARCHIVE_* 9 제거 | ○ |
| 외부 공통 Mapper delete/insert | TB_MCA_RULE_COL_LIST_Mapper | JPA Repository deleteByRuleId + saveAll | ○ |
| PK 정의 | (정본 sheet134 — RULE_ID NOT NULL) | (RULE_ID, COL_SEQ) 복합 PK — Q-001 Resolved | ○ |
| To-Be 테이블 카탈로그 | DMES-SECTION-MCA sheet134/135 **존재** | 정본 카탈로그 매핑 → Q-001 Resolved | ○ |

### §F.2 식별자 변환점

| 항목 | As-Is | To-Be |
|---|---|---|
| Form id / process id | MasterRuleFrame | masterRuleFrame |
| Mapper namespace | MasterRuleFrameMapper | masterRuleFrameMapper |
| serviceId 변수 치환 | "MasterRuleFrame" | "masterRuleFrame" |
| sqlKey (BPMN) | `#{serviceId}Mapper.{sqlId}` | `#{serviceId}Mapper.{sqlId}` (식 보존, 주입 값 변경) |
| BPMN action 식별자 | search / save | masterRuleFrame_search / _save |
| Java 패키지 | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleFrame | Entity·Repository = com.dongkuk.dmes.mcm.{entity,repository}.* / Service = com.dongkuk.dmes.mcm.cmb.masterRuleFrame.service |

### §F.3 결정 누적

활성 확인필요 = **0 건**. Q-003(in-coming)은 호출관계 조사로 **해소(메뉴 직접 진입, GUI 부모 없음, 2026-06-05)**. Q-001(To-Be 테이블, 정본 sheet134/135)·Q-002(cmb 등재 완료)·Q-004(LoV As-Is 정적 유지)·영속성(JPA)·"사용여부" 병합헤더(As-Is 보존)는 사용자 확정 2026-06-04. 결정 누적 표는 분석리포트 §12 참조.

**To-Be 적용**: mcm-core `McmAuditEntity` 9 컬럼 / `MCAAPUSER.TB_MCA_RULE_*` 보존(정본 owner, Q-001 Resolved) / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 + Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleFrame.{service,dto}.*` / delete-all-then-insert 저장 패턴 보존 / orphan 핸들러 제거 / 권한 외부 위임 / Optimistic Locking(VER) 자동.

---

## §G. 확인필요 항목 집계

| Q-NNN | 항목 | 영향 | 상태 |
|---|---|---|---|
| Q-001 | TB_MCA_RULE_COL_LIST (sheet134) / TB_MCA_RULE_MASTER (sheet135) To-Be DDL — 정본 DMES-SECTION-MCA 정의서 **존재** (PK=(RULE_ID,COL_SEQ) / owner=MCAAPUSER / audit=mcm-core McmAuditEntity 9). 종전 MCM 정의서 오참조 정정 | BE Entity / Migration 차단 해소 | **Resolved** (정본 카탈로그 확정 — §F.1 / 분석 §9) |
| Q-002 | moduleGroup `cmb` (업무기준 관리(원장)) 01 부속 §A.2.3 등재 | 폴더/URL/카탈로그 | **resolved (등재 완료 2026-06-04)** |
| Q-003 | 형제 화면 in-coming 호출 여부 (MasterRuleList 등) | 호출 계약 | **해소 (메뉴 직접 진입, GUI 부모 없음 — 2026-06-05)** |
| Q-004 | LoV (ds_div / ds_colType) 정적 보존 vs 공통 코드테이블 이관 | FE/BE 코드값 | **확정 (As-Is 정적 유지 — 사용자 2026-06-04)** |

---

## §H. 종합

| 게이트 | 결과 |
|---|---|
| §A 단일 원천 정합 | ○ |
| §B 식별자 정합 | ○ |
| §C SQL ID 일치 | ○ |
| §D 명명 정합 D1~D3 / D5 | ○ (D1 cmb 등재 완료 2026-06-04) |
| §D.4 manifest 9 파일 | ✗ (Runner 미실행 — 사용자 결정) |
| §E As-Is 누락 0 | ○ |
| §F To-Be 변환점 | ○ (To-Be 테이블 = 정본 sheet134/135 확정 — Q-001 Resolved) |
| §G 확인필요 | ○ (0건 — Q-003 메뉴 진입 해소 2026-06-05; Q-001·Q-002(cmb 등재)·Q-004·영속성·병합헤더 확정) |

**최종 정합 결과 = ○ (설계 완료 — §A~§F ✓ / 활성 확인필요 0건. §D.4 manifest ✗ 는 R-14 미적용 의도 면제. Q-003(부모)=메뉴 진입 해소 2026-06-05, Q-001·Q-002(cmb 등재)·Q-004·영속성·병합헤더 확정 2026-06-04).**

---

## §I. Phase 종료 자동 고해성사

| # | 질문 | 답 |
|---|---|---|
| 1 | 사용자 요구사항 14항 위반? | No — As-Is xfdl 컴포넌트(영역 7 / 조회조건 6 / Grid 2×7 cols / Dataset 12×2+5 / Script 14) / Java 메서드 1 / Mapper SQL 2(+외부 2) / BPMN 노드 6 / SequenceFlow 6 / 팝업 2 모두 전수 인용 + 모든 본문 file:line cite. |
| 2 | 검증 안 한 부분? | To-Be 테이블을 정본 **DMES-SECTION-MCA sheet134/135** 로 확정 (§0/§9/§F.1) — 종전 MCM 정의서 오참조를 정정. ls/Glob 로 정본 파일 존재 검증 + masterRuleList §9.1 sheet135 26 컬럼과 owner·PK·audit 1:1 정합 대조. |
| 3 | 그대로 수용? | mui 자료 본문/표/컬럼/SQL/flow 1:1 보존 (수정 ✗ / 병합 ✗). 주석된 변경분 송신·delete 검증 블록 / orphan 핸들러 / "사용여부" 병합 헤더 의미 불일치 모두 보존 + 잔여 Q-NNN 위임. To-Be 테이블만 정본 카탈로그로 정정(Q-001 Resolved). |
| 4 | 임의 합리화? | No — cmb 등재 / in-coming 팝업 / LoV 이관은 Q-NNN 으로 위임 유지 (자체 결론 ✗). To-Be DDL 은 정본 sheet134/135 + masterRuleList 선례 근거로 확정 (추측 ✗). |

→ 4 질문 점검 완료. open Q 3건 (Q-002~Q-004) 은 §G 에 집계, Q-001 은 Resolved. 결과 반환 가능.
