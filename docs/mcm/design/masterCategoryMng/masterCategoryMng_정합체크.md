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

# 카테고리 관리 (masterCategoryMng) 정합체크서

> 본 문서는 5종 산출물 간 식별자 / SQL ID / 액션 / 명명 / As-Is 누락 / To-Be 변환점의 정합성을 점검한다.
> 단일 원천 = [분석리포트](./masterCategoryMng_분석리포트.md).

---

## §A. 분석리포트 단일 원천 정합

### §A.1 5종 산출물 식별자 (frontmatter)

| 산출물 | screenId | asIsId | moduleId | moduleGroup | 정합 |
|---|---|---|---|---|---|
| 분석리포트 | masterCategoryMng | MasterCategoryMng | mcm | cma | ○ |
| 기능설계서 | masterCategoryMng | MasterCategoryMng | mcm | cma | ○ |
| 디자인설계서 | masterCategoryMng | MasterCategoryMng | mcm | cma | ○ |
| BPMN설계서 | masterCategoryMng | MasterCategoryMng | mcm | cma | ○ |
| 정합체크서 | masterCategoryMng | MasterCategoryMng | mcm | cma | ○ |

### §A.2 5종 단일 원천 인용

| 산출물 | 분석리포트 인용 항목 | 정합 |
|---|---|---|
| 기능설계서 §3 (조회) | 분석리포트 §3.2 (S-001~S-008) | ○ |
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
| screenId | masterCategoryMng | masterCategoryMng | masterCategoryMng | masterCategoryMng | ○ |
| asIsId | MasterCategoryMng | MasterCategoryMng | MasterCategoryMng | MasterCategoryMng | ○ |
| pageId | masterCategoryMng | masterCategoryMng | masterCategoryMng | masterCategoryMng | ○ |
| pageName | masterCategoryMng | masterCategoryMng | masterCategoryMng | masterCategoryMng | ○ |
| serviceId | masterCategoryMng | masterCategoryMng | masterCategoryMng | masterCategoryMng | ○ |
| 화면명 (titletext) | 카테고리 관리 | 카테고리 관리 | 카테고리 관리 | 카테고리 관리 | ○ |

### §B.2 영역 / 버튼 / 그리드 ID 정합

| ID | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 정합 |
|---|---|---|---|---|---|
| A-001~A-005 | ✓ §3.1 | (간접 인용) | ✓ §2 | - | ○ |
| S-001~S-008 | ✓ §3.2 | ✓ §3.1 | ✓ §3.1 | - | ○ |
| G-001 | ✓ §3.3 | ✓ §3.2 | ✓ §4 | - | ○ |
| B-001~B-008 | ✓ §4 | ✓ §5 | ✓ §5 | ✓ §1.1 | ○ |
| GB-001~GB-002 | ✓ §4.4 | ✓ §5.2 | (포함) | (비대상) | ○ |
| MSG-001~MSG-013 | (분석리포트 미세분 — 기능서가 정본) | ✓ §10 | ✓ §7 | - | ○ |

---

## §C. SQL ID 일치 (Mapper.xml ↔ BPMN sqlKey ↔ Java)

### §C.1 Mapper.xml ↔ BPMN

| Mapper.xml SQL ID | BPMN sqlKey | BPMN 노드 | 정합 |
|---|---|---|---|
| GetCodeCategoryList (Mapper:7) | #{serviceId}Mapper.GetCodeCategoryList (bpmn:18) | Task_2 "Main조회" (bpmn:10) | ○ |
| GetCodeCategoryAllList (Mapper:31) | #{serviceId}Mapper.GetCodeCategoryAllList (bpmn:75) | Task_0lk57sx "Main 전체조회" (bpmn:67) | ○ |
| DeleteTbMcmCodeCategory (Mapper:48) | #{serviceId}Mapper.DeleteTbMcmCodeCategory (bpmn:59) | Task_0k24d4u "Main삭제" (bpmn:51) | ○ |
| UpdateTbMcmCodeCategory (Mapper:39) | (BPMN 직접 인용 ✗ — UserTask 내 Java 호출) | UserTask_154khzh (bpmn:40) | ○ (간접) |
| InsertTbMcmCodeCategory (Mapper:54) | (BPMN 직접 인용 ✗) | UserTask_154khzh | ○ (간접) |
| MergeTbCodeCategory (Mapper:71) | (인용 ✗ — orphan, **To-Be 제거**) | - | ○ |

### §C.2 Java ↔ Mapper.xml

| Java 호출 (SaveTbMcmCodeCategory.java) | Mapper.xml SQL ID | 라인 정합 |
|---|---|---|
| MasterCategoryMngMapper.UpdateTbMcmCodeCategory (java:38) | UpdateTbMcmCodeCategory (Mapper:39) | ○ |
| MasterCategoryMngMapper.DeleteTbMcmCodeCategory (java:46) | DeleteTbMcmCodeCategory (Mapper:48) | ○ |
| MasterCategoryMngMapper.InsertTbMcmCodeCategory (java:56) | InsertTbMcmCodeCategory (Mapper:54) | ○ |

### §C.3 xfdl ↔ BPMN (sOutDatasets ↔ resultKey)

| xfdl sOutDatasets | BPMN resultKey | 정합 |
|---|---|---|
| ds_grdMain=ds_GetCodeCategoryList (xfdl:150, 211) | Task_2.resultKey = ds_GetCodeCategoryList (bpmn:19) | ○ |
| ds_grdMainAll=ds_GetCodeCategoryAllList (xfdl:150, 211) | Task_0lk57sx.resultKey = ds_GetCodeCategoryAllList (bpmn:74) | ○ |
| (콜백 nErrorCode=0 시) strErrorMsg["cnt_merge"] (xfdl:239) | SaveTbMcmCodeCategory.run() addDaoResultIntoContext("cnt_merge", ...) (java:64) | ○ |

---

## §D. 식별자 명명 정합 (D1~D5)

### §D.1 screenId 명명 규칙 (`{화면명}` 단일 토큰 — 2026-05-28 가이드 정본)

- 정본: MasterCategoryMng → masterCategoryMng (모듈명 토큰 ✗) → ○
- moduleId = `mcm` (한글명 **"공통관리"**) / moduleGroup = `cma` (한글명 **"Master 관리(원장)"** — 사용자 결정 등재)
- 메뉴 계층: 공통관리 (mcm) > Master 관리(원장) (cma) > 카테고리 관리 (masterCategoryMng)

### §D.2 BPMN 기능 식별자 명명 규칙 (`{screenId}_{기능명}`)

| To-Be 식별자 | 원천 (As-Is action) | 명명 정합 |
|---|---|---|
| masterCategoryMng_search | search (bpmn:37) | ○ |
| masterCategoryMng_save | save (bpmn:39) | ○ |
| ~~masterCategoryMng_delete~~ | **To-Be 제거** (As-Is xfdl 주석) | ○ |

### §D.3 테이블 명명

| 항목 | As-Is | To-Be 권장 |
|---|---|---|
| 카테고리 | MCM_SOURCE.TB_MCM_CODE_CATEGORY (mui Mapper.xml 원장 schema 명시 — synonym 아님) | **MCM_SOURCE.TB_MCM_CODE_CATEGORY 보존** (2026-05-29 사용자 명시 정정 — 본 화면 = 원장 편집 화면 / DML 대상) |
| 코드 마스터 | MCM_SOURCE.TB_MCM_CODE_MASTER (원장 schema 명시) | **MCM_SOURCE.TB_MCM_CODE_MASTER 보존** (2026-05-29 사용자 명시 정정 — 동일 원장 schema JOIN) |

→ TB_{모듈명}_{역할} 패턴 부합 (모듈명 MCM / 역할 CODE_CATEGORY). ○

**3 schema 구조 (2026-05-29 사용자 명시 정정)**: **`MCM_SOURCE`** (원장 — 본 화면 DML 대상) / **`MCMAPUSER`** (운영 read 동기화본 — 다른 모듈/뷰 SELECT 대상, 동기화 화면이 적재 책임) / **`MCM_BACKUP`** (백업본 — 동기화 화면 위임). As-Is mui DB테이블명세서: "MCMAPUSER (운영) / MCM_SOURCE (Mapper 내 사용)" 분리 표기 정합 (`docs/mcm/001_마스터코드/mui-20260522_1430-MCM코드관리-DB테이블명세서.md:5`).

**audit 9 컬럼 (가이드 정본)**: audit 9 컬럼 (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`) = cactus-core `CactusAuditEntity` (또는 mcm-core `McmAuditEntity`) 자동 적용. 3 schema 모두 동일 적용 (동기화 시 row copy 정합 위해). 가이드 02 §A.5-3-1 정합 / BackEnd 가이드 §8-1 MUST.

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

### §D.5 frontmatter 6 필드 (screenId / asIsId / moduleId / moduleGroup / 작성일 / 작성자) — 5종 모두 작성

| 산출물 | screenId | asIsId | moduleId | moduleGroup | 작성일 | 작성자 | 결과 |
|---|---|---|---|---|---|---|---|
| 분석리포트 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 기능설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 디자인설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| BPMN설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 정합체크서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |

(BPMN설계서 / 기능설계서 / 디자인설계서 / 정합체크서는 사용자 결정에 따라 pageName/pageId/serviceId 3 추가 필드 포함 — frontmatter 9 필드).

---

## §E. As-Is 누락 0 점검

### §E.1 xfdl 전수 정합

| 항목 | xfdl 카운트 | 본 산출물 반영 | 결과 |
|---|---:|---:|---|
| Form 컴포넌트 (Layouts/Layout 내부) | 9 (btn_fold + div_main + div_title + div_bottom + div_search + Grid grd_main + div_rightMenu + div_topMenu + edt_title) | 분석리포트 §3.1 (A-001~A-005) + §3.5 (C-001~C-004) + §3.3 Grid | ○ |
| 조회조건 입력 컴포넌트 | 8 (stc 4 + edt 4) | 분석리포트 §3.2 (S-001~S-008) | ○ |
| Grid columns | 8 cols (head/body 각 8) | 분석리포트 §3.3 (col 0~7) | ○ |
| Dataset ds_grdMain ColumnInfo | 6 (MASTER_CODE, CATEGORY_ID, CATEGORY_NM, SORT_SEQ, CODE_NM, CHK) | 분석리포트 §3.3 dataset 표 | ○ |
| Dataset ds_grdMainAll ColumnInfo | 2 (MASTER_CODE, CATEGORY_ID) | 분석리포트 §3.3 dataset 표 | ○ |
| Script 함수 | 10 (MasterCategoryMng_onload, fn_formAfterOnload, fn_button, fn_search, fn_save, fn_callBack, btn_fold_onclick, div_main_grd_main_onheadclick, fn_excelDown, fn_rowAdd, fn_rowCopy, fn_rowDelete, fn_rowCancel — 실제 13) | 기능설계서 §2 흐름도 + §5 (action) 에 13 핸들러 모두 반영 | ○ (전수) |

비고: Script 함수 전수 = 13 (위 13 — 분석리포트/기능서/디자인서/BPMN서 어디서든 명시).

### §E.2 Java 메서드 전수

| 메서드 | 본 산출물 반영 | 결과 |
|---|---|---|
| run(Context, Task) (java:19~72) | 분석리포트 §7.2 단계 1~8 (luther 8 단계 분해) | ○ |

→ Java 클래스 메서드 = 1 (run 단일) — 모두 반영. ○

### §E.3 Mapper.xml SQL 전수

| SQL ID | 본 산출물 반영 | 결과 |
|---|---|---|
| GetCodeCategoryList | 분석리포트 §6 #1 / §6.1 #1 | ○ |
| GetCodeCategoryAllList | 분석리포트 §6 #2 / §6.1 #2 | ○ |
| UpdateTbMcmCodeCategory | 분석리포트 §6 #3 / §6.1 #3 | ○ |
| DeleteTbMcmCodeCategory | 분석리포트 §6 #4 / §6.1 #4 | ○ |
| InsertTbMcmCodeCategory | 분석리포트 §6 #5 / §6.1 #5 | ○ |
| MergeTbCodeCategory | 분석리포트 §6 #6 / §6.1 #6 (orphan 표시) | ○ |

→ Mapper.xml SQL 6/6 모두 반영. ○

### §E.4 BPMN flow 전수

| 노드 / flow | 본 산출물 반영 | 결과 |
|---|---|---|
| StartEvent_1, EndEvent_1, ExclusiveGateway_1 | 분석리포트 §8.2 / BPMN설계서 §3 | ○ |
| Task_2, Task_0lk57sx, Task_0k24d4u | 분석리포트 §8.2 | ○ |
| UserTask_154khzh | 분석리포트 §8.2 / §7 / BPMN설계서 §4 | ○ |
| SequenceFlow 8개 (1, 0grwghu, 0x77sm3, 0w4k9x6, 0xzcgxb, 10mn97r, 0lnje1n, 0wrkusx) | 분석리포트 §8.3 + BPMN설계서 §3.4 | ○ |
| BPMN Diagram 좌표 7 노드 | 분석리포트 §8.5 | ○ |

→ BPMN 노드 7 + flow 8 모두 반영. ○

### §E.5 As-Is 주석 / 미사용 코드 보존 점검

| 항목 | 처리 |
|---|---|
| xfdl:327~353 (블록 주석된 fn_rowDelete 의 즉시 delete 호출) | 분석리포트 §4.5 + 기능설계서 §5.1 + BPMN설계서 §1.1 / §3.3 모두 "**To-Be 제거**" 로 명시 (사용자 결정) |
| xfdl:245~251 (블록 주석된 delete 콜백) | 기능설계서 §10.2 MSG-012 잔존 명시 |
| MergeTbCodeCategory (orphan) | §6 #6 — **To-Be 제거** (사용자 결정) |
| ref_Audit fragment | 본 자료 외부 — §6.1 / §11 fragment 인용 형태 보존 |

---

## §F. To-Be 변환점

### §F.1 DB 변환점 (As-Is Oracle → To-Be MSSQL)

| 변환점 | As-Is | To-Be | 분석리포트 §11 |
|---|---|---|---|
| 문자열 결합 `\|\|` → `+` 또는 CONCAT | LIKE '%' \|\| #{x} \|\| '%' | LIKE '%' + #{x} + '%' or CONCAT | ○ |
| MERGE USING DUAL → USING VALUES | MERGE INTO ~ USING (SELECT FROM DUAL) | MERGE INTO ~ USING (VALUES (...)) AS src ON ... ; | ○ |
| 스키마명 | MCM_SOURCE (mui Mapper.xml 원장 schema 명시 — synonym 아님) → **`MCM_SOURCE` 보존** (2026-05-29 사용자 명시 정정 — 본 화면 = 원장 편집 화면 / DML 대상). 3 schema 구조 (MCM_SOURCE 원장 / MCMAPUSER 운영 read 동기화본 / MCM_BACKUP 백업본) 명시. As-Is mui DB테이블명세서 정합 | ○ |
| ref_Audit fragment | (Oracle 의 SYSDATE / USER) | (MSSQL 의 GETDATE() / SUSER_SNAME()) | ○ |
| PK 정의 | (자산 본 분석 외) | (MASTER_CODE, CATEGORY_ID) 명시 | ○ |
| orphan MergeTbCodeCategory | (정의 + 호출 ✗) | **To-Be 제거** (사용자 결정) | ○ |

### §F.2 식별자 변환점

| 항목 | As-Is | To-Be |
|---|---|---|
| Form id / process id | MasterCategoryMng | masterCategoryMng |
| Mapper namespace | MasterCategoryMngMapper | masterCategoryMngMapper |
| serviceId 변수 치환 | "MasterCategoryMng" | "masterCategoryMng" |
| sqlKey (BPMN) | `#{serviceId}Mapper.{sqlId}` | `#{serviceId}Mapper.{sqlId}` (식 보존, 주입 값 변경) |
| BPMN action 식별자 | search / save / delete | masterCategoryMng_search / _save / _delete |

### §F.3 결정 누적

활성 확인필요 = **0 건**. 결정 누적 표는 분석리포트 §12 참조.

**To-Be 적용**: cactus-core `CactusAuditEntity` 9 컬럼 (3 schema 모두 동일 적용 — 가이드 02 §A.5-3-1 / BackEnd 가이드 §8-1 MUST) / `MCM_SOURCE.TB_MCM_CODE_CATEGORY` 보존 (2026-05-29 사용자 명시 정정 — 본 화면 = 원장 편집 화면 / DML 대상 = 원장 schema MCM_SOURCE / 3 schema 구조: MCM_SOURCE 원장 + MCMAPUSER 운영 read 동기화본 + MCM_BACKUP 백업본 / 동기화 화면이 row copy 책임 위임) / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 (모듈 단위 공유) + Service·DTO = `com.dongkuk.dmes.mcm.cma.masterCategoryMng.{service,dto}.*` 패키지 (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) / 미사용 SQL·BPMN flow 제거 / 권한 외부 위임 / Optimistic Locking 자동.

---

## §G. 종합

| 게이트 | 결과 |
|---|---|
| §A 단일 원천 정합 | ○ |
| §B 식별자 정합 | ○ |
| §C SQL ID 일치 | ○ (orphan MergeTbCodeCategory **To-Be 제거** 결정) |
| §D 명명 정합 D1~D3 / D5 | ○ |
| §D.4 manifest 9 파일 | ✗ (Runner 미실행 — 사용자 결정) |
| §E As-Is 누락 0 | ○ |
| §F To-Be 변환점 | ○ |

**최종 정합 결과 = ○ (단 §D.4 manifest 만 Runner 미적용 사유 ✗)**.

---

## §H. Phase 종료 자동 고해성사

| # | 질문 | 답 |
|---|---|---|
| 1 | 사용자 요구사항 14항 위반? | No — As-Is xfdl 컴포넌트 9 / 조회조건 8 / Grid columns 8 / Dataset 컬럼 8 / Java 메서드 1 / Mapper SQL 6 / BPMN 노드 7 / SequenceFlow 8 모두 전수 인용 + 모든 본문 file:line cite. |
| 2 | 검증 안 한 부분? | 없음. DMES Excel 추출 + 사용자 결정 (cactus-core 9 컬럼 / **2026-05-29 정정: `MCM_SOURCE.TB_MCM_CODE_*` 보존** — 본 화면 = 원장 편집 화면 / 3 schema 구조 MCM_SOURCE / MCMAPUSER / MCM_BACKUP 명시) 모두 본문 반영. |
| 3 | 그대로 수용? | mui 자료 본문/표/컬럼/SQL/flow 1:1 보존 (수정 ✗ / 병합 ✗). 주석 처리된 delete 로직 / orphan MergeTbCodeCategory / 로그 메시지 오타 / "USD" 초기값 모두 보존 + Q-NNN 위임. |
| 4 | 임의 합리화? | No — STATUS 컬럼 (Nexacro auto) / delete flow / orphan SQL / 로그 오타 모두 사용자 결정으로 처리 완료 (To-Be FE 동일 구현 / To-Be 제거 / To-Be 정정). 임의 결론 ✗. |

→ 4 질문 모두 No → 결과 반환 가능.
