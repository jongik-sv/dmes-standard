---
screenId: masterRuleDataUploadFilePopup
asIsId: MasterRuleDataUploadFilePopup
moduleId: mcm
moduleGroup: cmb
작성일: 2026-06-05
작성자: Agent
---

# masterRuleDataUploadFilePopup 정합체크서

> 단일 원천 = `masterRuleDataUploadFilePopup_분석리포트.md`.
> 본 정합체크서는 5종 산출물 (분석리포트 / 기능설계서 / 디자인설계서 / BPMN설계서 / 본 문서) 간 식별자·SQL·명명·As-Is 누락 0·To-Be 변환점의 6 영역 (A~F) 정합 점검. masterRuleData / masterCodeUploadFilePopup 가족과 1:1 정합.

## §A. 분석리포트 단일 원천 정합

### A.1 5 산출물 frontmatter 일치

| 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 정합체크서 (본) | 결과 |
|---|---|---|---|---|---|---|
| screenId | masterRuleDataUploadFilePopup | masterRuleDataUploadFilePopup | masterRuleDataUploadFilePopup | masterRuleDataUploadFilePopup | masterRuleDataUploadFilePopup | ✓ |
| asIsId | MasterRuleDataUploadFilePopup | MasterRuleDataUploadFilePopup | MasterRuleDataUploadFilePopup | MasterRuleDataUploadFilePopup | MasterRuleDataUploadFilePopup | ✓ |
| moduleId | mcm | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | cmb | cmb | cmb | cmb | cmb | ✓ |
| 작성일 | 2026-06-05 | 2026-06-05 | 2026-06-05 | 2026-06-05 | 2026-06-05 | ✓ |
| 작성자 | Agent | Agent | Agent | Agent | Agent | ✓ |

### A.2 5 산출물 본문 인용 정합 (주요 단언 cross-ref)

| 단언 | 분석리포트 위치 | 다른 산출물 인용 | 결과 |
|---|---|---|---|
| B-001 = "다운로드" = fn_fileDown = action search → export | §4.1 B-001 | 기능 §3.3 / 디자인 §5.1 / BPMN §1 / §3 | ✓ |
| B-002 = "파일선택" = fn_fileUpload = client only (importExcel) | §4.1 B-002 | 기능 §4.1 / 디자인 §3 / §5.1 / BPMN §1 (B-002 server N) | ✓ |
| B-003 = "등록" = fn_fileSave = action save = UserTask SaveMasterRuleFileUpload | §4.1 B-003 / §7.2 / §8.5 | 기능 §4.3 / §4.4 / 디자인 §5.1 / BPMN §1 / §3 / §4.4 | ✓ |
| T-003 = 컬럼정의 자동 조회 = fn_lov = action search_col = Task_1rf3f4m GetRuleColList | §4.3 / §8.5 | 기능 §3.2 / BPMN §1 / §3 / §6.3 | ✓ |
| ★ 동적 컬럼 빌드 (ds_RuleColData 기반 grd_Upload + grd_Download) | §3.3 / §3.4 | 기능 §3.2 / 디자인 §4 / BPMN §2 C4=Y | ✓ |
| chk_regFlag=true → 본 테이블 전건 선 DELETE (WHERE 1=1) | §6.4 SQL #4 / §7.2 S7 | 기능 §6.1 R-107 / BPMN §4.4 (S7) | ✓ |
| RULE_VER 고정 "1" + RULE_SEQ maxRuleSeq+1 채번 | §6.5 / §7.4 F-003 | 기능 §6.1 R-109 / BPMN §4.4 (`setMap.put("RULE_VER","1")`) | ✓ |
| 채번 = 부모 매퍼 MasterRuleDataMapper.GetMaxRuleSeq (namespace 불일치 Q-103) | §6.3 / §7.4 F-004 | BPMN §4.4 (S8) / §6.3 RC-004 | ✓ |
| atomic 트랜잭션 (1 row 실패 → 전체 rollback) | §7.3 | 기능 §2.2 / §6.3 / BPMN §5.1 / §5.2 | ✓ |
| P-001 = MasterRuleData.xfdl:722 호출 (sRuleId/sRuleNm 전달) | §5 P-001 | 기능 §1.3 / §9 / 디자인 §1.1 | ✓ |
| Mapper namespace = MasterRuleDataUploadFilePopupMapper (3 SELECT) | §6 SQL #1~#3 | BPMN §6.3 | ✓ |
| BPMN sqlKey = `#{serviceId}Mapper.GetRuleColList` | §8.4 | BPMN §3.2 / §6.3 | ✓ |

> 단일 원천 위반 0건. 본 표 통과.

## §B. 식별자 정합

### B.1 5 식별자 동일성 (MES 단일 룰)

| 식별자 | 값 | 룰 적용 | 결과 |
|---|---|---|---|
| screenId | masterRuleDataUploadFilePopup | `{화면명}` camelCase | ✓ |
| pageName | masterRuleDataUploadFilePopup | MES: = screenId | ✓ |
| pageId | masterRuleDataUploadFilePopup | MES: = screenId | ✓ |
| serviceId | masterRuleDataUploadFilePopup | MES/APS 공통 = screenId | ✓ |
| frontend file name (To-Be) | masterRuleDataUploadFilePopup.tsx | MES: `{screenId}.tsx` | ✓ |

> moduleId = `mpn` 아님 → "MES 단일 룰" 적용. APS 예외 미적용 (✓).

### B.2 BPMN 기능 식별자 (`{screenId}_{기능명}`)

| 기능 | 식별자 | 결과 |
|---|---|---|
| 다운로드 | masterRuleDataUploadFilePopup_search | ✓ (BPMN §6.2 정합) |
| 파일선택 | masterRuleDataUploadFilePopup_importExcel | ✓ |
| 등록 | masterRuleDataUploadFilePopup_save | ✓ |
| 컬럼정의 조회 | masterRuleDataUploadFilePopup_search_col | ✓ |
| 닫기 | masterRuleDataUploadFilePopup_popupClose | ✓ |

## §C. SQL ID 일치 (Mapper.xml ↔ BPMN sqlKey ↔ Java)

### C.1 SQL #1 SELECT (GetRuleColList) 매핑

| 위치 | sqlKey | 매핑 ID | 근거 |
|---|---|---|---|
| BPMN Task_1rf3f4m | `#{serviceId}Mapper.GetRuleColList` | (resolve runtime → MasterRuleDataUploadFilePopupMapper.GetRuleColList) | bpmn:53 |
| Mapper namespace + select id | MasterRuleDataUploadFilePopupMapper / GetRuleColList | (= resolve target) | MasterRuleDataUploadFilePopupMapper.xml:5, :7 |
| 결과 | ✓ 일치 |

### C.2 SQL #2 SELECT (GetMasterRuleDataList) 매핑 (Java literal)

| 위치 | sqlKey | 비고 | 근거 |
|---|---|---|---|
| Java Get | `MasterRuleDataUploadFilePopupMapper.GetMasterRuleDataList` (java:29) | dao.selectList literal | GetMasterRuleDataPopup.java:29 |
| Mapper namespace + select id | MasterRuleDataUploadFilePopupMapper / GetMasterRuleDataList | (= 일치) | MasterRuleDataUploadFilePopupMapper.xml:5, :31 |
| 결과 | ✓ 일치 |

### C.3 SQL #3 SELECT (GetMaxRuleSeq) 매핑 — namespace 불일치 (Q-103)

| 위치 | sqlKey | 비고 | 근거 |
|---|---|---|---|
| Java Save (호출) | `MasterRuleDataMapper.GetMaxRuleSeq` (java:57) | **부모 masterRuleData 매퍼 호출** | SaveMasterRuleFileUpload.java:57 |
| 본 화면 매퍼 정의 | MasterRuleDataUploadFilePopupMapper / GetMaxRuleSeq (동명·동일 본문) | (정의되어 있으나 미호출) | MasterRuleDataUploadFilePopupMapper.xml:36-39 |
| 결과 | ○ (Q-103 본 화면 매퍼 일원화 확정 2026-06-05) |

### C.4 SQL #4 DELETE / #5 INSERT 매핑 (Java literal — 외부 동적 매퍼)

| 위치 | sqlKey | 비고 | 근거 |
|---|---|---|---|
| Java Save (dao.delete) | `${pTable}_Mapper.delete` (= TB_MCA_<RuleId>_Mapper.delete) | MYBATIS_WHERE="1 = 1" 전건 (pRegFlag=true 시만) | java:51-52 |
| Java Save (dao.insert) | `${pTable}_Mapper.insert` (= TB_MCA_<RuleId>_Mapper.insert) | row 마다 호출. RULE_VER="1"+RULE_SEQ 부여 | java:77 |
| 결과 | ○ (외부 동적 매퍼 — 자산 외부 / To-Be DDL on-demand + 화이트리스트 안전화 Q-104 확정 2026-06-04) |

### C.5 dataset key ↔ resultKey 매핑

| xfdl key | BPMN / context key | 결과 |
|---|---|---|
| ds_GetRuleDataUploadList (sOutDatasets="ds_grdDownload=ds_GetRuleDataUploadList") | context key `ds_GetRuleDataUploadList` (java Get:31) | ✓ |
| ds_GetRuleColUploadList (sOutDatasets="ds_RuleColData=ds_GetRuleColUploadList") | BPMN resultKey ds_GetRuleColUploadList (bpmn:54) | ✓ |
| ds_grdUpload / ds_RuleColData (sInDatasets) | context key `ds_grdUpload` / `ds_RuleColData` (java Save:32-33) | ✓ |
| cnt_import (xfdl:303 strErrorMsg["cnt_import"]) | java Save:84 addDaoResultIntoContext(..., "cnt_import", ...) | ✓ |

### C.6 BPMN UserTask class ↔ Java FQN 매핑

| 위치 | 값 | 결과 |
|---|---|---|
| BPMN UserTask_1j7375k class | `#{basePackage}GetMasterRuleDataPopup` (bpmn:39) | ✓ |
| BPMN UserTask_09dxtkf class | `#{basePackage}SaveMasterRuleFileUpload` (bpmn:27) | ✓ |
| As-Is Java FQN (Get) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataUploadFilePopup.GetMasterRuleDataPopup | ✓ |
| As-Is Java FQN (Save) | com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataUploadFilePopup.SaveMasterRuleFileUpload | ✓ |
| **To-Be Java FQN** | `com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service.{GetMasterRuleDataPopup, SaveMasterRuleFileUpload}` (RULE.md §"패키지 명명 규칙" §3-1) | basePackage 변수 주입 |

## §D. 식별자 명명 정합 (D1~D5)

### D.1 모듈 / 그룹 명명

| 항목 | 값 | 룰 | 결과 |
|---|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | 5 모듈 enum (mpn/mpp/mls/mqc/mcm) | ✓ |
| moduleGroup | cmb — 한글명 **"업무기준 관리(원장)"** | As-Is 폴더 prefix (`task/ui/cmb`, `mappers-cmb`, `services/cmb`) — 01 부속 §A.2.3 등재 | ✓ |
| 메뉴 계층 | 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 일반 업무기준 등록(Excel Upload) | UI 메뉴 트리 표시 | ✓ |

### D.2 화면명 camelCase

| screenId | 토큰 | 결과 |
|---|---|---|
| masterRuleDataUploadFilePopup | As-Is 영문 식별자 MasterRuleDataUploadFilePopup 의 lowerCamel 직역 | ✓ |

### D.3 테이블 명명 (As-Is 보존 / DMES-SECTION-MCA 정합)

| As-Is | To-Be | 결과 |
|---|---|---|
| MCA_SOURCE.TB_MCA_RULE_COL_LIST (Oracle synonym, 메타) | **MCAAPUSER.TB_MCA_RULE_COL_LIST** (sheet134 owner=MCAAPUSER, xlsx 확인) | ✓ |
| MCA_SOURCE.TB_MCA_RULE_MASTER (Oracle synonym, 메타) | **MCAAPUSER.TB_MCA_RULE_MASTER** (sheet135 owner=MCAAPUSER) | ✓ |
| MCA_SOURCE.TB_MCA_<업무기준ID> (동적 데이터) | **MCAAPUSER.TB_MCA_<업무기준ID>** (DDL on-demand, owner=MCAAPUSER — 가족 확정) | ✓ |

### D.4 manifest 9 파일 정합

| 항목 | 결과 | 사유 |
|---|---|---|
| Auto Manifest Runner 실행 | **✗** | 사용자 결정 — Runner 미적용 (분석리포트 §0 환경 제약). 본 화면 mui 자산은 6 원천 (xfdl/java×2/xml/bpmn/부모 xfdl) + DMES MCA Excel 1종으로 자체 완결되므로 Runner manifest 9 파일 생성 의무 없음. |
| manifest.lock.json | ✗ | 미생성 (Runner 미실행) |
| index.json | ✗ | 미생성 |
| discover.trace.json | ✗ | 미생성 |
| classify.trace.json | ✗ | 미생성 |
| fallback.trace.json | ✗ | 미생성 |
| q-stable-key.json | ✗ | 미생성 |
| conflict-report.json | (N/A) | 미생성 |
| verify-report.json | ✗ | 미생성 |
| error.log | (N/A) | 미생성 |

> §D.4 = **✗** (의도된 면제). 사용자 요구사항 §1(A. R-14 미적용·manifest 금지) / 분석리포트 §0 와 정합. 별도 조치 없이 5 산출물 정합 검증은 본 §A~§F 자체로 완결.

### D.5 BPMN process id ↔ screenId

| As-Is BPMN process id | To-Be screenId | 결과 |
|---|---|---|
| MasterRuleDataUploadFilePopup | masterRuleDataUploadFilePopup | ✓ (lowerCamel 직역) |

## §E. As-Is 누락 0 점검

### E.1 xfdl 컴포넌트 전수

| 카테고리 | xfdl 발견 수 | 본 5 산출물 반영 | 결과 |
|---|---:|---:|---|
| Form | 1 | 1 (분석 §1.1) | ✓ |
| Layout | 1 (default) | 1 (분석 §3.1 / 디자인 §1.2) | ✓ |
| Div | 4 (div_main / div_title / div_bottom / div_search) | 4 (분석 §3.1 R-001/002/004/005, 디자인 §2) | ✓ |
| Button (xfdl native) | 1 (btn_fold) | 1 (분석 §4.3 T-001, 디자인 §5.2) | ✓ |
| Static | 3 (stc_ruldId / stc_ruleNM / stc_flag) | 3 (분석 §3.2, 디자인 §2.2) | ✓ |
| Edit | 3 (edt_title / edt_MasterRuleId / edt_MasterRuleNm) | 3 (분석 §3.1 R-001 / §3.2, 디자인 §2.1 / §2.2) | ✓ |
| CheckBox | 1 (chk_regFlag) | 1 (분석 §3.2 S-003, 디자인 §2.2) | ✓ |
| Grid | 2 (grd_Upload / grd_Download) | 2 (분석 §3.3 / §3.4, 디자인 §4) | ✓ |
| Dataset | 3 (ds_grdUpload / ds_grdDownload / ds_RuleColData) | 3 (분석 §3.5) | ✓ |
| Dataset 컬럼 | 8 (2×RULE_ID + 6×ds_RuleColData) | 8 (분석 §3.5) | ✓ |
| 동적 commonTopButton 버튼 | 4 (다운로드 / 파일선택 / 등록 / 닫기) | 4 (분석 §4.1 B-001/002/003 + §4.2 B-099, 디자인 §5.1) | ✓ |
| xfdl method | 11 (onload / fn_formAfterOnload / fn_button / fn_lov / fn_fileDown / fn_fileUpload / fn_callImportBack / fn_fileSave / fn_callBack / fn_close / btn_fold_onclick) | 11 (분석 §4 / §5 / §7 / §10 / §3.1; 기능 §3 / §4 / §6) | ✓ |
| xfdl Script comment header (수정 이력) | 1 (2020.07.07 최규찬) | 1 (분석 §1.3) | ✓ |

### E.2 Java 메서드 전수

| 클래스 | 메서드 | 본 5 산출물 반영 | 결과 |
|---|---|---|---|
| GetMasterRuleDataPopup | `run(Context, Task)` | 분석 §7.1 + 기능 §3.3 + BPMN §4.3 + 본 §C.2 | ✓ |
| SaveMasterRuleFileUpload | `run(Context, Task)` | 분석 §7.2 + 기능 §4.4 + BPMN §4.4 + 본 §C.3/§C.4 | ✓ |

> Java 클래스 2종 각 1 메서드. 누락 0.

### E.3 Mapper.xml SQL 전수

| Mapper 파일 | SQL ID | 본 5 산출물 반영 | 결과 |
|---|---|---|---|
| MasterRuleDataUploadFilePopupMapper.xml | GetRuleColList | 분석 §6.1 + 기능 §3.2 + BPMN §3.2 / §6.3 + 본 §C.1 | ✓ |
| MasterRuleDataUploadFilePopupMapper.xml | GetMasterRuleDataList | 분석 §6.2 + 기능 §3.3 + BPMN §4.3 + 본 §C.2 | ✓ |
| MasterRuleDataUploadFilePopupMapper.xml | GetMaxRuleSeq | 분석 §6.3 + BPMN §6.3 + 본 §C.3 (정의됨 — 미호출, Q-103) | ✓ |
| ${pTable}_Mapper.xml (외부 동적) | delete (사용분) | 분석 §6.4 + BPMN §4.4 (S7) + 본 §C.4 | ✓ |
| ${pTable}_Mapper.xml (외부 동적) | insert (사용분) | 분석 §6.5 + §9.1 + BPMN §4.4 (S9) + 본 §C.4 | ✓ |

> 본 화면 매퍼 (MasterRuleDataUploadFilePopupMapper.xml) SQL 전수 = 3 건. 모두 반영. 외부 동적 매퍼는 본 화면 사용 분 (delete/insert) 만 반영 (본 화면 자산 외부).

### E.4 BPMN flow 전수

| 카테고리 | bpmn 발견 수 | 본 5 산출물 반영 | 결과 |
|---|---:|---:|---|
| process | 1 | 1 (분석 §8.1) | ✓ |
| startEvent | 1 | 1 (분석 §8.2 / BPMN §3.2) | ✓ |
| endEvent | 1 | 1 (분석 §8.2 / BPMN §3.2) | ✓ |
| exclusiveGateway | 1 | 1 (분석 §8.2 / BPMN §3.2) | ✓ |
| userTask | 2 (UserTask_1j7375k / UserTask_09dxtkf) | 2 (분석 §8.2 / BPMN §3.2 + §4) | ✓ |
| task (Task_1rf3f4m) | 1 | 1 (분석 §8.2 + §8.4 / BPMN §3.2) | ✓ |
| sequenceFlow | 7 | 7 (분석 §8.3 / BPMN §3.3) | ✓ |
| BPMNShape | 6 (diagram) | (diagram 미명세 — §F.6 권고) | △ (의도 외 — diagram 좌표는 5 산출물 명세 대상 외) |
| BPMNEdge | 6 (diagram) | (diagram 미명세) | △ (좌표는 명세 대상 외) |

> BPMN diagram 좌표 (BPMNShape / BPMNEdge / BPMNLabel) 는 5 산출물 명세 대상 외 (UI 시각화 영역만) — 자연 제외. flow 본문 (process + 6 노드 + 7 flow) 은 100% 반영.

### E.5 호출 출처 (P-NNN)

| P-NNN | 호출 화면 | 본 5 산출물 반영 | 결과 |
|---|---|---|---|
| P-001 | masterRuleData (As-Is MasterRuleData.xfdl:722) | 분석 §5 + 기능 §1.3 / §9 + 디자인 §1.1 | ✓ |

## §F. To-Be 변환점

### F.1 DBMS 변환점 (Oracle → MSSQL)

| # | As-Is (Oracle) | To-Be (MSSQL) | 영향 (산출물) |
|---:|---|---|---|
| C-001 | `NVL2(MAX(CONSTRAINT_NAME), 'Y','N')` (PK_YN 판정) | `CASE WHEN MAX(...) IS NOT NULL THEN 'Y' ELSE 'N' END` | 분석 §11.1 / Mapper.xml:15 |
| C-002 | `NVL(MAX(RULE_SEQ),0)` (채번 base) | `ISNULL(MAX(RULE_SEQ),0)` 또는 `COALESCE(...)` | 분석 §11.1 / Mapper.xml:37 |
| C-003 | `'TB_MCA_' \|\| #{pRuleId}` (문자열 결합) | `'TB_MCA_' + #{pRuleId}` 또는 CONCAT | 분석 §11.1 / Mapper.xml:17 |
| C-004 | `ALL_CONS_COLUMNS` 시스템 카탈로그 PK 판정 | `sys.indexes` / `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` 등가 변환 (또는 메타 컬럼 직접 보유) | 분석 §11.1 / Mapper.xml:16 |
| C-005 | `MCA_SOURCE.${pTable}` / `MCA_SOURCE.TB_MCA_RULE_*` schema prefix | owner **MCAAPUSER** (DMES-SECTION-MCA 정합) | 모든 SQL FROM 절 |
| C-006 | `${pTable}` 동적 테이블명 치환 (SQL injection 표면) | **화이트리스트(업무기준ID 메타 검증) + 바인딩** — 임의 테이블 치환 차단 (Q-104) | 동적 영속 |
| C-007 | `${pTable}_Mapper.delete/insert` 외부 동적 namespace | 테이블별 개별 Mapper → To-Be DDL on-demand 정합 | 동적 영속 |
| C-008 | `MasterRuleDataMapper.GetMaxRuleSeq` (부모 매퍼 namespace 호출) | 본 화면 매퍼(#3)로 일원화 권고 (Q-103 / RC-004) | 채번 호출 경로 |
| C-009 | 컬럼명 대문자/언더스코어 | 그대로 유지 + Entity camelCase 매핑 | Entity 매핑 시 |

### F.2 식별자 변환점 (As-Is → To-Be)

| As-Is | To-Be | 비고 |
|---|---|---|
| MasterRuleDataUploadFilePopup (Form id / BPMN process id) | masterRuleDataUploadFilePopup | lowerCamel 직역 |
| MasterRuleDataUploadFilePopupMapper (namespace) | masterRuleDataUploadFilePopupMapper | namespace prefix |
| GetRuleColList / GetMasterRuleDataList / GetMaxRuleSeq (select id) | **As-Is 보존** (PascalCase SQL id) | 가족 정합 |
| com.dongkuk.dmes.mui.task.ui.cmb.MasterRuleDataUploadFilePopup.{Get,Save}* | **`com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service.*`** (RULE.md §"패키지 명명 규칙" §3-1) — Entity·Repository 는 `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 | 패키지 변환 |

### F.3 파일 업로드 처리 변환점

| 항목 | As-Is | To-Be 후보 |
|---|---|---|
| 클라이언트 Excel parsing | `gfn_importExcel` ("A5:DZ5" 헤더 / "A6" 데이터 — nexacro) | **SheetJS (FE)** (사용자 결정 / 가족 선례) |
| 서버 전송 | oasis `gfn_transaction` JSON | **REST API JSON (행 배열)** (사용자 결정) |
| 미리보기 그리드 | nexacro Grid grd_Upload + grd_Download (동적 컬럼) | FE 프레임워크 동적 그리드 (단일 통합 권고 — 디자인 §4.3) |
| Excel export | `gfn_exportExcel` (grd_Download 3행 헤더 — nexacro client) | FE library 또는 BE generation (개발 단계 결정) |

### F.4 결함 → To-Be 보강

| F-ID | As-Is 결함 | To-Be 보강 (RC-ID) | 등재 위치 |
|---|---|---|---|
| F-001 | `dao.insert ≤ 0` 시 일반 Exception — row index 미포함 | RC-001 | BPMN §4.5 |
| F-002 | ds_grdUpload 값 toString cast (number 셀 위험) | RC-002 | BPMN §4.5 |
| F-003 | RULE_VER "1" 고정 | RC-003 | BPMN §4.5 |
| F-004 | 채번이 부모 매퍼 namespace 사용 (Q-103) | RC-004 | BPMN §4.5 / §6.3 |
| F-005 | chk_regFlag=false 시 PK/UNIQUE 중복 위험 → 전체 rollback / 빈 dataset + true 시 무경고 전체 삭제 | RC-005 (Q-102 confirm) | BPMN §4.5 / 기능 §10.2 MT-002 |
| F-006 | audit 컬럼 미세팅 (외부 매퍼 ref / DB default 의존) | RC-006 (McmAuditEntity) | BPMN §4.5 / 분석 §9.4 |
| F-101 | fn_formAfterOnload 가드 변수 혼동 (sRuleId 로 sRuleNm set 검사) | (가드 분리 — 기능 §3.1 비고) | 기능 §3.1 |

### F.5 schema / 테이블 변환

| 항목 | As-Is | To-Be |
|---|---|---|
| schema | MCA_SOURCE (synonym) → **`MCAAPUSER` 보존** (DMES-SECTION-MCA 정합) |
| 메타 테이블 | TB_MCA_RULE_COL_LIST (sheet134, 29컬럼) / TB_MCA_RULE_MASTER (sheet135, 26컬럼) | owner MCAAPUSER 보존 (As-Is 1:1 + 카탈로그 매핑) |
| 동적 데이터 테이블 | TB_MCA_<업무기준ID> (런타임 인스턴스) | **DDL on-demand** (업무기준ID별 실테이블 동적 생성/조회, owner MCAAPUSER — 가족 확정 2026-06-04) |
| 컬럼 audit (As-Is `CREATED_*` / `LAST_UPDATE_*` / `DATA_END_*` / `ARCHIVE_*` 17 컬럼) | ref_Audit fragment | **cactus/Mcm 표준 `McmAuditEntity` 9 컬럼** — As-Is `DATA_END_*` / `ARCHIVE_*` 9 컬럼 To-Be 대체 (가족 확정). 동적 데이터 테이블 audit 도 동일 정책 (native 세팅) |

### F.6 BPMN 산출물 변환 (추가 권고 — 산출물 외)

| 항목 | As-Is | To-Be |
|---|---|---|
| .bpmn 파일명 | MasterRuleDataUploadFilePopup.bpmn | masterRuleDataUploadFilePopup.bpmn |
| .bpmn 위치 | services/cmb/ | services/cmb/ (As-Is 보존 — RULE.md 폴더 룰 확정 시 일괄 이동) |
| diagram (좌표) | As-Is 보존 (시각화는 의미 없음) | 신규 그릴 시 BPMN §3.1 flow 그대로 재현 (`bpmn-tool` — 직접 XML 금지) |

## §G. 확인필요 항목 집계 — 활성 3 건 (가족 확정 외)

> masterRuleData 가족 확정 사항(JPA / DDL on-demand / 동적 SQL 안전화 / audit McmAuditEntity / MCAAPUSER / SheetJS / 패키지 — 사용자 확정 2026-06-04) 적용. 본 팝업 고유 Q-101/Q-102/Q-103 = **사용자 확정 2026-06-05**. 활성 확인필요 = **0 건**. 결정 누적 표는 분석리포트 §12 참조.

| ID (`Q-NNN`) | 항목 | 내용 | 영향도 | 설계 반영 방식 | 후속 조치 | 상태 |
|---|---|---|---|---|---|---|
| Q-101 | 동적 그리드 빌드 | ds_RuleColData 기반 동적 컬럼(IN·OUT 색/DATE 캘린더/3행 다운로드 헤더) FE 동일 구현 방식 | 중간 | 디자인 §4.3 단일 동적 그리드 권고 | FE 설계 단계 결정 | **확정 (2026-06-05): FE 동일 구현** |
| Q-102 | 삭제등록 UX | chk_regFlag=true 시 본 테이블 전건 삭제 → 사전 confirm (빈 dataset + 삭제등록 무경고 전체 삭제 F-005) | 높음 | 기능 §10.2 MT-002 confirm 메시지 | 사용자 정책 결정 | **확정 (2026-06-05): confirm 메시지 + 미리보기 빈 상태 시 전건삭제 차단 가드** |
| Q-103 | 채번 namespace | maxRuleSeq 가 부모 `MasterRuleDataMapper.GetMaxRuleSeq` 호출(java:57) — 본 화면 매퍼 #3 로 일원화 vs As-Is 유지 | 중간 | BPMN §6.3 RC-004 일원화 권고 | 개발 단계 결정 | **확정 (2026-06-05): 본 화면 매퍼 일원화** |

**§G 결과 (참고)**: open 0 / resolved 3 (Q-101/102/103 사용자 확정 2026-06-05) / wontfix 0. (가족 확정 Q-104 동적 SQL 안전화 / Q-105 audit 는 2026-06-04 resolved — 분석 §12.)

## §H. 결론

| 영역 | 결과 |
|---|---|
| §A. 단일 원천 정합 | ✓ |
| §B. 식별자 정합 | ✓ |
| §C. SQL ID 일치 | ✓ (C.3 GetMaxRuleSeq = Q-103 본 화면 매퍼 일원화 확정 2026-06-05 / C.4 외부 동적 매퍼 = 자산 외부) |
| §D.1~D.3 / D.5 | ✓ |
| §D.4 manifest 9 파일 | ✗ (Runner 미적용 — 사용자 결정 R-14 미적용 / 의도된 면제) |
| §E. As-Is 누락 0 | ✓ (E.4 BPMN diagram 좌표 △ = 의도 외) |
| §F. To-Be 변환점 | ✓ (Q-101/102/103 사용자 확정 2026-06-05 — 활성 0건) |

> §D.4 외 모든 게이트 ✓. §D.4 의 ✗ 는 사용자 결정(R-14 미적용)에 따른 의도된 면제로, 본 5 산출물 완결성에는 영향이 없다. 활성 확인필요 0 건 (Q-101/102/103 사용자 확정 2026-06-05) — 설계 완료 (00 §0.1.4).
