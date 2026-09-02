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

# 업무기준 목록조회 (masterRuleList) 정합체크서

> 본 문서는 5종 산출물 간 식별자 / SQL ID / 액션 / 명명 / As-Is 누락 / To-Be 변환점의 정합성을 점검한다.
> 단일 원천 = [분석리포트](./masterRuleList_분석리포트.md).

---

## §A. 분석리포트 단일 원천 정합

### §A.1 5종 산출물 식별자 (frontmatter)

| 산출물 | screenId | asIsId | moduleId | moduleGroup | 정합 |
|---|---|---|---|---|---|
| 분석리포트 | masterRuleList | MasterRuleList | mcm | cmb | ○ |
| 기능설계서 | masterRuleList | MasterRuleList | mcm | cmb | ○ |
| 디자인설계서 | masterRuleList | MasterRuleList | mcm | cmb | ○ |
| BPMN설계서 | masterRuleList | MasterRuleList | mcm | cmb | ○ |
| 정합체크서 | masterRuleList | MasterRuleList | mcm | cmb | ○ |

### §A.2 5종 단일 원천 인용

| 산출물 | 분석리포트 인용 항목 | 정합 |
|---|---|---|
| 기능설계서 §3 (조회) | 분석리포트 §3.2 (S-001~S-004) | ○ |
| 기능설계서 §4 (CRUD) | 분석리포트 §6 (SQL) / §7 (Java) | ○ |
| 기능설계서 §5 (action) | 분석리포트 §4.5 | ○ |
| 기능설계서 §10 (메시지) | 분석리포트 §3 + xfdl 직접 인용 | ○ |
| 디자인설계서 §3 (조회조건) | 분석리포트 §3.2 | ○ |
| 디자인설계서 §4 (그리드) | 분석리포트 §3.3 | ○ |
| 디자인설계서 §5 (버튼) | 분석리포트 §4 | ○ |
| BPMN설계서 §1 (액션) | 분석리포트 §4.5 / §8.4 | ○ |
| BPMN설계서 §3 (flow) | 분석리포트 §8.2 / §8.3 | ○ |
| BPMN설계서 §4 (Java) | 분석리포트 §7 | ○ |

---

## §B. 식별자 정합

### §B.1 화면 식별자

| 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 정합 |
|---|---|---|---|---|---|
| screenId | masterRuleList | masterRuleList | masterRuleList | masterRuleList | ○ |
| asIsId | MasterRuleList | MasterRuleList | MasterRuleList | MasterRuleList | ○ |
| pageId | masterRuleList | masterRuleList | masterRuleList | masterRuleList | ○ |
| pageName | masterRuleList | masterRuleList | masterRuleList | masterRuleList | ○ |
| serviceId | masterRuleList | masterRuleList | masterRuleList | masterRuleList | ○ |
| 화면명 (titletext) | 업무기준 목록조회 | 업무기준 목록조회 | 업무기준 목록조회 | 업무기준 목록조회 | ○ |

### §B.2 영역 / 버튼 / 그리드 ID 정합

| ID | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 정합 |
|---|---|---|---|---|---|
| A-001~A-005 | ✓ §3.1 | (간접 인용) | ✓ §2 | - | ○ |
| S-001~S-004 | ✓ §3.2 | ✓ §3.1 | ✓ §3.1 | - | ○ |
| G-001 (11 cols) | ✓ §3.3 | ✓ §3.2 | ✓ §4 | - | ○ |
| B-001~B-006 | ✓ §4 | ✓ §5 | ✓ §5 | ✓ §1.1 | ○ |
| GB-001 | ✓ §4.4 | ✓ §5.2 | (포함 §4.1) | (비대상) | ○ |
| MSG-001~MSG-012 | (분석리포트 미세분 — 기능서가 정본) | ✓ §10 | ✓ §7 | - | ○ |

---

## §C. SQL ID 일치 (Mapper.xml ↔ BPMN sqlKey ↔ Java)

### §C.1 Mapper.xml ↔ BPMN

| Mapper.xml SQL ID | BPMN sqlKey | BPMN 노드 | 정합 |
|---|---|---|---|
| GetRuleMasterList (Mapper:7) | #{serviceId}Mapper.GetRuleMasterList (bpmn:18) | Task_2 "Main조회" (bpmn:10) | ○ |

### §C.2 Java ↔ 외부 Mapper (TB_MCA_RULE_MASTER_Mapper namespace)

| Java 호출 (SaveMasterRule.java) | SQL ID | 라인 |
|---|---|---|
| TB_MCA_RULE_MASTER_Mapper.select (java:48) | (외부 공통 CRUD Mapper — 본 자산 외부) | ○ (인용) |
| TB_MCA_RULE_MASTER_Mapper.insert (java:65) | (외부) | ○ (인용) |
| TB_MCA_RULE_MASTER_Mapper.update (java:77) | (외부) | ○ (인용) |

비고: masterCategoryMng 은 Java 가 자기 화면 Mapper(MasterCategoryMngMapper) 를 호출했으나, 본 화면은 Java 가 **공통 테이블 CRUD Mapper(`TB_MCA_RULE_MASTER_Mapper`)** 를 호출 — 본 화면 Mapper(MasterRuleListMapper) 에는 GetRuleMasterList SELECT 1개만 정의. To-Be 는 JPA Repository(existsById/save) 흡수.

### §C.3 xfdl ↔ BPMN (sOutDatasets ↔ resultKey)

| xfdl sOutDatasets | BPMN resultKey | 정합 |
|---|---|---|
| ds_grdMain=ds_GetRuleMasterList (xfdl:155) | Task_2.resultKey = ds_GetRuleMasterList (bpmn:19) | ○ |
| (save sOutDatasets="" — xfdl:175) | (save 응답 데이터셋 없음 — BPMN 후행 Task_2 재조회) | ○ |
| (콜백 cnt_save — xfdl:201) | SaveMasterRule.run() addDaoResultIntoContext("cnt_save", grdMainList.size(), ...) (java:82) | ○ |

---

## §D. 식별자 명명 정합 (D1~D5)

### §D.1 screenId 명명 규칙 (`{화면명}` 단일 토큰 — 01 부속서 A.3.1)

- 정본: MasterRuleList → masterRuleList (모듈명 토큰 ✗) → ○
- moduleId = `mcm` (한글명 **"공통관리"**) / moduleGroup = `cmb` (한글명 **"업무기준 관리(원장)"** — 01 부속서 A.2.1 영역 코드 / 사용자 지시 등재)
- 메뉴 계층: 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 업무기준 목록조회 (masterRuleList)

### §D.2 BPMN 기능 식별자 명명 규칙 (`{screenId}_{기능명}`)

| To-Be 식별자 | 원천 (As-Is action) | 명명 정합 |
|---|---|---|
| masterRuleList_search | search (bpmn:35) | ○ |
| masterRuleList_save | save (bpmn:48) | ○ |
| masterRuleList_searchMain | Task_2 "Main조회" (bpmn:10) | ○ |
| masterRuleList_saveMain | SaveMasterRule "메인저장" (bpmn:37) | ○ |

### §D.3 테이블 명명

| 항목 | As-Is | To-Be 권장 |
|---|---|---|
| 업무기준 마스터 | MCA_SOURCE.TB_MCA_RULE_MASTER (synonym) | **MCAAPUSER.TB_MCA_RULE_MASTER 보존** (사용자 결정 — Excel sheet135 owner 정본) |

→ TB_{모듈명}_{역할} 패턴 부합 (모듈명 MCA / 역할 RULE_MASTER). ○

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

**§D.4 종합 = ✗ (Runner 미적용 — 사용자 결정에 따라 deferred. 추후 Runner 적용 시 9 파일 생성하여 본 표 갱신)**.

### §D.5 frontmatter 필드 — 5종 모두 작성

| 산출물 | screenId | asIsId | moduleId | moduleGroup | 작성일 | 작성자 | 결과 |
|---|---|---|---|---|---|---|---|
| 분석리포트 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 기능설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 디자인설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| BPMN설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 정합체크서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |

(기능/디자인/BPMN/정합체크서는 사용자 결정에 따라 pageName/pageId/serviceId 3 추가 필드 포함 — frontmatter 9 필드).

---

## §E. As-Is 누락 0 점검

### §E.1 xfdl 전수 정합

| 항목 | xfdl 카운트 | 본 산출물 반영 | 결과 |
|---|---:|---:|---|
| Form 컴포넌트 (Layouts/Layout 직속) | 5 (div_title + div_search + btn_fold + div_main + div_bottom) + 하위(edt_title + div_topMenu / grd_Main + div_rightMenu) | 분석리포트 §3.1 (A-001~A-005) + §3.5 (C-001~C-004) + §3.3 Grid | ○ |
| 조회조건 입력 컴포넌트 | 4 (stc 2 + edt 2) | 분석리포트 §3.2 (S-001~S-004) | ○ |
| Grid columns | 11 cols (head/body 각 11) | 분석리포트 §3.3 (col 0~10) | ○ |
| Dataset ds_grdMain ColumnInfo | 12 (RULE_ID, OLD_RULE_ID, RULE_NM, RULE_DESC, RULE_VER, RULE_TP, RULE_OWNER_DEPT_NM, RULE_OWNER_EMP_NO, USE_TP, CREATION_TIMESTAMP, LAST_UPDATED_OBJECT_ID, LAST_UPDATE_TIMESTAMP) | 분석리포트 §3.3 dataset 표 | ○ |
| Script 함수 | 12 (MasterRuleList_onload, fn_formAfterOnload, fn_button, fn_search, fn_save, fn_callBack, btn_fold_onclick, fn_excelDown, fn_rowAdd, fn_rowDelete, div_main_grd_Main_onheadclick, fn_checkSave) | 기능설계서 §2 흐름도 + §5 (action) 에 12 핸들러 반영 | ○ (전수) |
| 선언만 미정의 핸들러 | 1 (div_search_edt_ruleNm_onkeydown — xfdl:25, Script 본문 부재) | Q-008 등재 | ○ |

### §E.2 Java 메서드 전수

| 메서드 | 본 산출물 반영 | 결과 |
|---|---|---|
| run(Context, Task) (java:20~90) | 분석리포트 §7.2 단계 1~8 (8 단계 분해, inserted/updated 2 분기) | ○ |

→ Java 클래스 메서드 = 1 (run 단일) — 모두 반영. ○

### §E.3 Mapper.xml SQL 전수

| SQL ID | 정의 위치 | 본 산출물 반영 | 결과 |
|---|---|---|---|
| GetRuleMasterList | MasterRuleListMapper.xml:7 (본 화면 Mapper) | 분석리포트 §6.1 #1 | ○ |
| TB_MCA_RULE_MASTER_Mapper.select | (외부 공통 Mapper — java:48 호출) | 분석리포트 §6.2 #1 | ○ |
| TB_MCA_RULE_MASTER_Mapper.insert | (외부 — java:65) | 분석리포트 §6.2 #2 | ○ |
| TB_MCA_RULE_MASTER_Mapper.update | (외부 — java:77) | 분석리포트 §6.2 #3 | ○ |

→ 본 화면 Mapper SQL 1 + Java 호출 외부 SQL 3 = 4 모두 반영. ○

### §E.4 BPMN flow 전수

| 노드 / flow | 본 산출물 반영 | 결과 |
|---|---|---|
| StartEvent_1, EndEvent_1, ExclusiveGateway_1 | 분석리포트 §8.2 / BPMN설계서 §3 | ○ |
| Task_2 | 분석리포트 §8.2 | ○ |
| SaveMasterRule (userTask) | 분석리포트 §8.2 / §7 / BPMN설계서 §4 | ○ |
| SequenceFlow 5개 (1, 0grwghu, 0lnje1n, 0nago4p, 0tacpyk) | 분석리포트 §8.3 + BPMN설계서 §3.3 | ○ |
| BPMN Diagram 좌표 5 노드 | 분석리포트 §8.5 | ○ |

→ BPMN 노드 5 + flow 5 모두 반영. ○

### §E.5 As-Is 미사용/미정의 코드 보존 점검

| 항목 | 처리 |
|---|---|
| div_search_edt_ruleNm_onkeydown (선언만, 본문 부재) | 분석리포트 §3.2 / §13 Q-008 + 기능 §11 + 디자인 §3.1 명시 (To-Be 미반영) |
| RULE_ID != NVL(OLD_RULE_ID,...) 이력행 제외 필터 | 분석리포트 §6.1 / §11 + 기능 §6 BR-002 + Q-009 — To-Be 보존 |
| NVL(USE_TP,'N') != 'N' 활성 필터 | 분석리포트 §6.1 / §11 + 기능 §6 BR-003 — To-Be 보존 |
| delete 경로 부재 (As-Is 기존행 서버 삭제 ✗) | 분석리포트 §6 / §7 / §11 + 기능 §4.4 + BPMN §1.1 모두 "delete 부재(As-Is 보존)" 명시 |
| RULE_OWNER_DEPT_NM (SELECT 반환 / 그리드·INSERT 미사용) | 분석리포트 §3.3 dataset / §9.1 r29 명시 |
| OLD_RULE_ID / RULE_TP (그리드 미표시 dataset 컬럼) | 분석리포트 §3.3 dataset 표 명시 |
| audit 17 컬럼 → mcm-core McmAuditEntity 9 | 분석리포트 §9.2 / §11 |

---

## §F. To-Be 변환점

### §F.1 DB 변환점 (As-Is Oracle → To-Be MSSQL)

| 변환점 | As-Is | To-Be | 분석리포트 §11 |
|---|---|---|---|
| 문자열 결합 `\|\|` → `+` 또는 CONCAT | LIKE '%' \|\| #{x} \|\| '%' | LIKE '%' + #{x} + '%' or CONCAT | ○ |
| NVL → ISNULL/COALESCE | NVL(OLD_RULE_ID,'ZZZZ0000') / NVL(USE_TP,'N') | ISNULL(...) / COALESCE(...) | ○ |
| 대소문자 검색 UPPER 양변 | UPPER(col) LIKE UPPER(...) | (MSSQL CI collation 시 생략 가능 — Q-012) | ○ |
| 스키마명 | MCA_SOURCE (synonym) → **`MCAAPUSER` 보존** (사용자 결정) | ○ |
| audit 컬럼 | As-Is 17 audit (그룹 1~4) | mcm-core McmAuditEntity 9 (C_* 4 / U_* 4 / VER 1) + 그룹 3·4 9 제거 | ○ |
| PK 정의 | (Excel r24 RULE_ID NOT NULL) | RULE_ID 단일 PK 명시 | ○ |
| Java 호출 SQL | TB_MCA_RULE_MASTER_Mapper.{select,insert,update} | RuleMasterRepository.{existsById,save} | ○ |
| 이력행/활성 필터 | RULE_ID != OLD_RULE_ID / USE_TP != 'N' | **To-Be 보존** (사용자 결정) | ○ |
| delete 경로 | (부재) | (부재 보존 — delete API 미생성) | ○ |

### §F.2 식별자 변환점

| 항목 | As-Is | To-Be |
|---|---|---|
| Form id / process id | MasterRuleList | masterRuleList |
| Mapper namespace (목록) | MasterRuleListMapper | masterRuleListMapper |
| serviceId 변수 치환 | "MasterRuleList" | "masterRuleList" |
| sqlKey (BPMN) | `#{serviceId}Mapper.GetRuleMasterList` | `#{serviceId}Mapper.GetRuleMasterList` (식 보존, 주입 값 변경) |
| BPMN action 식별자 | search / save | masterRuleList_search / _save |
| Java 패키지 | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleList | com.dongkuk.dmes.mcm.cmb.masterRuleList.service |

### §F.3 결정 누적

활성 확인필요 = **0 건**. Q-008(미반영)·Q-010(직역 보존)·Q-012(UPPER 유지)는 **사용자 확정 2026-06-05**. Q-009(이력행 제외 보존)·Q-011(RULE_VER 별개 컬럼)·영속성(JPA)은 사용자 확정 2026-06-04. 결정 누적 표는 분석리포트 §12 참조.

**To-Be 적용**: mcm-core `McmAuditEntity` 9 컬럼 / `MCAAPUSER.TB_MCA_RULE_MASTER` 보존 / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 + Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleList.{service,dto}.*` / 이력행·활성 필터 보존 / delete 경로 부재 보존 / 권한 외부 위임.

---

## §G. 확인필요(Q-NNN) 집계

| ID | 항목 | 영향도 | 상태 |
|---|---|---|---|
| Q-008 | onkeydown 미정의 핸들러 (To-Be 미반영) | 낮음 | **확정 (2026-06-05): 미반영** |
| Q-009 | RULE_ID != OLD_RULE_ID 이력행 제외 필터 (To-Be 보존) | 중간 | **확정 (As-Is 보존 — 사용자 2026-06-04)** |
| Q-010 | Excel 한글의미 misalign (그리드 헤드 직역 보강) | 낮음 | **확정 (2026-06-05): 직역 보존** |
| Q-011 | RULE_VER vs @Version 중복 (별개 컬럼 유지) | 중간 | **확정 (별개 컬럼 — 사용자 2026-06-04)** |
| Q-012 | MSSQL UPPER 양변 검색 (collation 정책) | 낮음 | **확정 (2026-06-05): UPPER 양변 유지** |
| Q-013 | B-006 fold(div_search 접기/펴기) — shared `SearchArea` collapse 미지원 | 낮음 | **활성 (2026-06-05 개발 중 발견)**: 도입 시 shared SearchArea 개선 필요(명시승인 영역) vs 드롭. 업무로직 무관 UI 토글 — 화면 동작 비차단 |

→ 활성 확인필요 1 건(Q-013, 영향도 낮음·UI 토글). Q-008/Q-010/Q-012 사용자 확정 2026-06-05 / Q-009·Q-011·영속성(JPA) 확정 2026-06-04. **설계 정합은 완료**(00 §0.1.4) — Q-013 은 개발 단계 발견 UI 갭으로, 본 화면 업무 동작/저장 무관(GATE-02 참조).

---

## §H. 종합

| 게이트 | 결과 |
|---|---|
| §A 단일 원천 정합 | ○ |
| §B 식별자 정합 | ○ |
| §C SQL ID 일치 | ○ |
| §D 명명 정합 D1~D3 / D5 | ○ |
| §D.4 manifest 9 파일 | ✗ (Runner 미실행 — 사용자 결정) |
| §E As-Is 누락 0 | ○ |
| §F To-Be 변환점 | ○ |
| §G 확인필요 집계 | ○ (1 활성 = Q-013 B-006 fold, 비차단 UI; Q-008~Q-012 확정) |
| **개발 완료 게이트 (= 개발체크리스트 §6)** | **○ (E2E 통과 — MSSQL 브라우저, 사용자 2026-06-05)** |

**최종 정합 결과 = ○ (설계 완료 — §A~§F ✓. §D.4 manifest ✗ 는 R-14 미적용 의도 면제. Q-008/010/012 확정 2026-06-05, Q-009·Q-011·영속성 확정 2026-06-04)**.

**개발 완료 = ○** — BE(Entity/Repo/Service/BPMN)+FE(조회/CRUD/엑셀)+MSSQL 시드, **런타임 E2E 통과**(조회·행추가·저장·재조회, 저장행 APS00001 MSSQL 실재). 잔여: Q-013(B-006 fold, 비차단 UI 토글 — shared SearchArea 개선 결정 보류). §12 "USD 기본필터 보존"은 철회(2026-06-05 — 저장후 재조회 가림 혼란).

---

## §I. Phase 종료 자동 고해성사

| # | 질문 | 답 |
|---|---|---|
| 1 | 사용자 요구사항 14항 위반? | No — As-Is xfdl 컴포넌트 + 조회조건 4 / Grid columns 11 / Dataset 컬럼 12 / Java 메서드 1 / Mapper SQL 1+외부 3 / BPMN 노드 5 / SequenceFlow 5 모두 전수 인용 + 모든 본문 file:line cite. |
| 2 | 검증 안 한 부분? | DMES MCA Excel sheet135 26 컬럼 추출 완료. 단 Excel 한글의미·Type 셀 misalign(Q-010) / onkeydown 미정의(Q-008) / RULE_VER vs @Version(Q-011) 3건은 사용자 확인 대기 — 본문 [확인필요] 명시. |
| 3 | 그대로 수용? | mui 자료 본문/표/컬럼/SQL/flow 1:1 보존 (수정 ✗ / 병합 ✗). delete 경로 부재 / 이력행 필터 / 활성 필터 / "USD" 초기값 / RULE_OWNER_DEPT_NM 미사용 컬럼 / 미정의 onkeydown 모두 보존 + Q-NNN 위임. |
| 4 | 임의 합리화? | No — STATUS auto / delete 부재 / 이력·활성 필터 / audit 9 컬럼 전환은 masterCategoryMng 선례 + As-Is 보존 원칙으로 처리. 임의 결론 ✗ (delete 노드/AllList 노드 부재는 bpmn 전수 확인 사실). |

→ 1·3·4 = No / 2 = 5 Q-NNN open (영향도 낮음~중간, 설계 진행 가능) → 결과 반환 가능.
