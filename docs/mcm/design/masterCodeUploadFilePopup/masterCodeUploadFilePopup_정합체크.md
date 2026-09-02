---
screenId: masterCodeUploadFilePopup
asIsId: MasterCodeUploadFilePopup
moduleId: mcm
moduleGroup: cma
작성일: 2026-05-27
작성자: Agent
---

# masterCodeUploadFilePopup 정합체크서

> 단일 원천 = `masterCodeUploadFilePopup_분석리포트.md`.
> 본 정합체크서는 5종 산출물 (분석리포트 / 기능설계서 / 디자인설계서 / BPMN설계서 / 본 문서) 간 식별자·SQL·명명·As-Is 누락 0·To-Be 변환점의 6 영역 (A~F) 정합 점검.

## §A. 분석리포트 단일 원천 정합

### A.1 5 산출물 frontmatter 일치

| 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 정합체크서 (본) | 결과 |
|---|---|---|---|---|---|---|
| screenId | masterCodeUploadFilePopup | masterCodeUploadFilePopup | masterCodeUploadFilePopup | masterCodeUploadFilePopup | masterCodeUploadFilePopup | ✓ |
| asIsId | MasterCodeUploadFilePopup | MasterCodeUploadFilePopup | MasterCodeUploadFilePopup | MasterCodeUploadFilePopup | MasterCodeUploadFilePopup | ✓ |
| moduleId | mcm | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | cma | cma | cma | cma | cma | ✓ |
| 작성일 | 2026-05-27 | 2026-05-27 | 2026-05-27 | 2026-05-27 | 2026-05-27 | ✓ |
| 작성자 | Agent | Agent | Agent | Agent | Agent | ✓ |

### A.2 5 산출물 본문 인용 정합 (주요 단언 cross-ref)

| 단언 | 분석리포트 위치 | 다른 산출물 인용 | 결과 |
|---|---|---|---|
| B-001 = "다운로드" = fn_fileDown = action search | §4.1 B-001 | 기능 §3.2 / 디자인 §5.1 / BPMN §1 / §3 | ✓ |
| B-002 = "파일선택" = fn_fileUpload = client only | §4.1 B-002 | 기능 §4.1 / 디자인 §3 / §5.1 / BPMN §1 (B-002 server N) | ✓ |
| B-003 = "등록" = fn_fileSave = action save = UserTask SaveMasterCodeFileUpload | §4.1 B-003 / §7 / §8.5 | 기능 §4.3 / §4.4 / 디자인 §5.1 / BPMN §1 / §3 / §4 | ✓ |
| chk_regFlag=true → 선 DELETE | §6.2 SQL #2 / §7.3 S8 | 기능 §6.1 R-006 / BPMN §4.3 (S7) | ✓ |
| CODE_VER 고정 "1" | §6.3 / §7.5 F-004 | 기능 §6.1 R-008 / BPMN §4.3 (line `param.put("CODE_VER", "1")`) | ✓ |
| atomic 트랜잭션 (1 row 실패 → 전체 rollback) | §7.4 | 기능 §2.2 / §6.3 / BPMN §5.1 / §5.2 | ✓ |
| P-001 = MasterCodeMng.xfdl:778 호출 | §5 P-001 | 기능 §1.3 / §9 | ✓ |
| Mapper namespace = MasterCodeUploadFilePopupMapper | §6 SQL #1 | BPMN §6.3 | ✓ |
| BPMN sqlKey = `#{serviceId}Mapper.GetCodeUploadList` | §8.4 | BPMN §3.2 / §6.3 | ✓ |
| **To-Be 정본 schema = `MCM_SOURCE.TB_MCM_CODE_DETAIL` (원장 편집 schema — 본 화면 DML 대상)** (2026-05-29 사용자 명시 정정) | §6.1 / §6.2 / §9.1 / §9.4 / §11.1 (C-005) / §11.3 / §12 | 기능 §6 (R-006) / BPMN §4.3 (S7~S8) / 디자인 §4 / 본 §D.3 / §F.1 / §F.5 / §G.1 | ✓ |
| **3 schema 구조 (MCM_SOURCE 원장 / MCMAPUSER 운영 read / MCM_BACKUP 백업본)** (2026-05-29 사용자 명시 정정) | §9.1 / §11.3 / §12 | 본 §D.3 / §F.1 (C-007) / §F.5 / §G.1 | ✓ |

> 단일 원천 위반 0건. 본 표 통과.

## §B. 식별자 정합

### B.1 5 식별자 동일성 (MES 단일 룰)

| 식별자 | 값 | 룰 적용 | 결과 |
|---|---|---|---|
| screenId | masterCodeUploadFilePopup | `{moduleId}{화면명}` camelCase | ✓ |
| pageName | masterCodeUploadFilePopup | MES: = screenId | ✓ |
| pageId | masterCodeUploadFilePopup | MES: = screenId | ✓ |
| serviceId | masterCodeUploadFilePopup | MES/APS 공통 = screenId | ✓ |
| frontend file name (To-Be) | masterCodeUploadFilePopup.tsx | MES: `{screenId}.tsx` | ✓ |

### B.2 BPMN 기능 식별자 (`{screenId}_{기능명}`)

| 기능 | 식별자 | 결과 |
|---|---|---|
| 다운로드 | masterCodeUploadFilePopup_search | ✓ (BPMN §6.2 정합) |
| 파일선택 | masterCodeUploadFilePopup_importExcel | ✓ |
| 등록 | masterCodeUploadFilePopup_save | ✓ |
| 닫기 | masterCodeUploadFilePopup_popupClose | ✓ |

## §C. SQL ID 일치 (Mapper.xml ↔ BPMN sqlKey ↔ Java)

### C.1 SQL #1 SELECT 매핑

| 위치 | sqlKey | 매핑 ID | 근거 |
|---|---|---|---|
| BPMN Task_2 | `#{serviceId}Mapper.GetCodeUploadList` | (resolve runtime → MasterCodeUploadFilePopupMapper.GetCodeUploadList) | bpmn:19 |
| Mapper namespace + select id | MasterCodeUploadFilePopupMapper / GetCodeUploadList | (= resolve target) | MasterCodeUploadFilePopupMapper.xml:5, :7 |
| 결과 | ✓ 일치 |

### C.2 SQL #2 DELETE 매핑 (Java literal)

| 위치 | sqlKey | 비고 | 근거 |
|---|---|---|---|
| Java | `TB_MCM_CODE_DETAIL_Mapper.delete` (java:44) | dao.delete literal | java:44 |
| Mapper namespace + delete id | TB_MCM_CODE_DETAIL_Mapper / delete | (= 일치) | TB_MCM_CODE_DETAIL_Mapper.xml:5, :17 |
| 결과 | ✓ 일치 |

### C.3 SQL #3 INSERT 매핑 (Java literal)

| 위치 | sqlKey | 비고 | 근거 |
|---|---|---|---|
| Java | `TB_MCM_CODE_DETAIL_Mapper.insert` (java:58) | dao.update literal (insert) | java:58 |
| Mapper namespace + insert id | TB_MCM_CODE_DETAIL_Mapper / insert | (= 일치) | TB_MCM_CODE_DETAIL_Mapper.xml:5, :82 |
| 결과 | ✓ 일치 |

### C.4 dataset key ↔ resultKey 매핑

| xfdl key | BPMN resultKey | 결과 |
|---|---|---|
| ds_GetCodeUploadList (sOutDatasets="ds_grdDownload=ds_GetCodeUploadList" 의 우측) | ds_GetCodeUploadList (bpmn:20) | ✓ |
| ds_grdUpload (sInDatasets="ds_grdUpload=ds_grdUpload" 의 우측) | (context key `ds_grdUpload` — java:31) | ✓ |
| cnt_import (xfdl:243 strErrorMsg["cnt_import"]) | (java:68 `addDaoResultIntoContext(..., "cnt_import", ...)`) | ✓ |

### C.5 BPMN UserTask class ↔ Java FQN 매핑

| 위치 | 값 | 결과 |
|---|---|---|
| BPMN UserTask_09dxtkf class | `#{basePackage}SaveMasterCodeFileUpload` (bpmn:41) | ✓ |
| As-Is Java FQN | com.dongkuk.dmes.mui.task.ui.cma.MasterCodeUploadFilePopup.SaveMasterCodeFileUpload (java:1, :18) | ✓ |
| **To-Be Java FQN** | `com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.service.SaveMasterCodeFileUpload` (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) | basePackage 변수 주입 |

## §D. 식별자 명명 정합 (D1~D5)

### D.1 모듈 / 그룹 명명

| 항목 | 값 | 룰 | 결과 |
|---|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | 5 모듈 enum (mpn/mpp/mls/mqc/mcm) | ✓ |
| moduleGroup | cma — 한글명 **"Master 관리(원장)"** | As-Is 폴더 prefix (`task/ui/cma`, `mappers-cma`, `services/cma`) — 사용자 결정 등재 | ✓ |
| 메뉴 계층 | 공통관리 (mcm) > Master 관리(원장) (cma) > 마스터코드 등록(Excel Upload) | UI 메뉴 트리 표시 | ✓ |

### D.2 화면명 camelCase

| screenId | 토큰 | 결과 |
|---|---|---|
| masterCodeUploadFilePopup | mcm + MasterCodeUploadFilePopup | ✓ (2-토큰 룰 — As-Is 영문 식별자를 camelCase 의 2번째 토큰으로 직역) |

### D.3 테이블 명명 (As-Is 보존)

| As-Is | To-Be 후보 | 결과 |
|---|---|---|
| `MCM_SOURCE.TB_MCM_CODE_DETAIL` (mui Mapper.xml — **원장 schema 명시 / synonym 아님**) | **`MCM_SOURCE.TB_MCM_CODE_DETAIL` 보존 (원장 편집 schema)** — 본 화면은 Excel Upload → 원장 INSERT/DELETE 수행 (2026-05-29 사용자 명시 정정) | ✓ |

> **3 schema 구조 (2026-05-29 사용자 명시)**: `MCM_SOURCE` (원장 — 본 화면 DML 대상: Excel Upload → 원장 INSERT/DELETE) / `MCMAPUSER` (운영 read 동기화본 — 다른 모듈/뷰 SELECT 대상, 동기화 화면이 적재 책임) / `MCM_BACKUP` (백업본 — 동기화 화면 위임). As-Is mui DB테이블명세서 (`docs/mcm/001_마스터코드/mui-20260522_1430-MCM코드관리-DB테이블명세서.md:5`): "스키마: MCMAPUSER (운영) / MCM_SOURCE (Mapper 내 사용)" 분리 표기 정합. As-Is mui Mapper.xml 의 `MCM_SOURCE.` prefix 는 synonym 이 아니라 **원장 schema 명시** — 본 화면은 원장 편집 화면이므로 To-Be 도 `MCM_SOURCE` 정본 (selPop = 운영 read 화면 → `MCMAPUSER.VI_MCM_CODE_ACCESS` 와 반대 결정).

### D.4 manifest 9 파일 정합

| 항목 | 결과 | 사유 |
|---|---|---|
| Auto Manifest Runner 실행 | **✗** | 사용자 결정 — Runner 미적용 (분석리포트 §0 환경 제약). 메모리 `reference_legacy_erp_ddl_location.md` 도 기본 `enabled=false`. 본 화면 mui 자산은 4 원천 (xfdl/java/xml/bpmn) 으로 자체 완결되므로 Runner manifest 9 파일 생성 의무 없음. |
| manifest.lock.json | ✗ | 미생성 (Runner 미실행) |
| index.json | ✗ | 미생성 |
| discover.trace.json | ✗ | 미생성 |
| classify.trace.json | ✗ | 미생성 |
| fallback.trace.json | ✗ | 미생성 |
| q-stable-key.json | ✗ | 미생성 |
| conflict-report.json | (N/A) | 미생성 |
| verify-report.json | ✗ | 미생성 |
| error.log | (N/A) | 미생성 |

> §D.4 = **✗** (의도된 면제). 사용자 요구사항 §10 / 분석리포트 §0 와 정합. 별도 조치 없이 5 산출물 정합 검증은 본 §A~§F 자체로 완결.

### D.5 BPMN process id ↔ screenId

| As-Is BPMN process id | To-Be screenId | 결과 |
|---|---|---|
| MasterCodeUploadFilePopup | masterCodeUploadFilePopup | ✓ (2-토큰 prefix `mcm` 추가) |

## §E. As-Is 누락 0 점검

### E.1 xfdl 컴포넌트 전수

| 카테고리 | xfdl 발견 수 | 본 5 산출물 반영 | 결과 |
|---|---:|---:|---|
| Form | 1 | 1 (§1.1) | ✓ |
| Layout | 1 (default) | 1 (분석 §3.1 / 디자인 §1.2) | ✓ |
| Div | 4 (div_main / div_title / div_bottom / div_search) | 4 (분석 §3.1 R-001/002/004/005, 디자인 §2) | ✓ |
| Button (xfdl native) | 1 (btn_fold) | 1 (분석 §4.4 T-001, 디자인 §5.2) | ✓ |
| Static | 3 (stc_codeNm / stc_codeNm00 / stc_flag) | 3 (분석 §3.2, 디자인 §2.2) | ✓ |
| Edit | 3 (edt_title / edt_MasterCode / edt_MasterCodeNm) | 3 (분석 §3.1 R-001 / §3.2, 디자인 §2.1 / §2.2) | ✓ |
| CheckBox | 1 (chk_regFlag) | 1 (분석 §3.2 S-003, 디자인 §2.2) | ✓ |
| Grid | 2 (grd_Upload / grd_Download) | 2 (분석 §3.3 / §3.4, 디자인 §4) | ✓ |
| Dataset | 2 (ds_grdUpload / ds_grdDownload) | 2 (분석 §3.5) | ✓ |
| Dataset 컬럼 | 12 (= 2 × 6) | 12 (분석 §3.5) | ✓ |
| Grid head Cell | 6 + 12 (grd_Upload 6 + grd_Download head row 0/1 = 12) = 18 | 18 (분석 §3.3 G + §3.4 GE 6+6 + GE head row=1 6) | ✓ |
| Grid body Cell | 6 + 6 = 12 | 12 (분석 §3.3 body 6 + §3.4 body 6) | ✓ |
| 동적 commonTopButton 버튼 | 4 (다운로드 / 파일선택 / 등록 / 닫기) | 4 (분석 §4.1 B-001/002/003 + §4.2 B-099, 디자인 §5.1) | ✓ |
| xfdl method | 10 (MasterCodeUploadFilePopup_onload / fn_formAfterOnload / fn_button / fn_fileDown / fn_fileUpload / fn_callImportBack / fn_fileSave / fn_callBack / fn_close / btn_fold_onclick) | 10 (분석 §4 / §7.2 / §7.3 / §10 / §3.1; 기능 §3.1 / §3.2 / §4.1 / §4.3 / §6) | ✓ |
| xfdl Script comment header (수정 이력) | 1 (2020.07.03 최규찬) | 1 (분석 §1.3) | ✓ |

### E.2 Java 메서드 전수

| 메서드 | 본 5 산출물 반영 | 결과 |
|---|---|---|
| `run(Context, Task)` | 분석 §7.1 / §7.2 / §7.3 / §7.4 / §7.5 + 기능 §4.4 + BPMN §4.3 | ✓ |

> Java 클래스는 1 메서드 만 보유. 누락 0.

### E.3 Mapper.xml SQL 전수

| Mapper 파일 | SQL ID | 본 5 산출물 반영 | 결과 |
|---|---|---|---|
| MasterCodeUploadFilePopupMapper.xml | GetCodeUploadList | 분석 §6.1 + 기능 §3.3 + BPMN §3.2 / §6.3 + 본 정합 §C.1 | ✓ |
| TB_MCM_CODE_DETAIL_Mapper.xml | delete (사용분) | 분석 §6.2 + BPMN §4.3 (S7) + 본 §C.2 | ✓ |
| TB_MCM_CODE_DETAIL_Mapper.xml | insert (사용분) | 분석 §6.3 + 9.2 + BPMN §4.3 (S8) + 본 §C.3 | ✓ |
| TB_MCM_CODE_DETAIL_Mapper.xml | select / update / mergePK | (본 화면 미사용 — §C 영역 외) | △ (의도 외 — N/A) |

> 본 화면 매퍼 (MasterCodeUploadFilePopupMapper.xml) 의 SQL 전수 = 1 건. 모두 반영. 공용 매퍼는 본 화면 사용 분 (delete/insert) 만 반영하며, select/update/mergePK 는 본 화면 미사용 → 자연 제외.

### E.4 BPMN flow 전수

| 카테고리 | bpmn 발견 수 | 본 5 산출물 반영 | 결과 |
|---|---:|---:|---|
| process | 1 | 1 (분석 §8.1) | ✓ |
| startEvent | 1 | 1 (분석 §8.2 / BPMN §3.2) | ✓ |
| endEvent | 1 | 1 (분석 §8.2 / BPMN §3.2) | ✓ |
| exclusiveGateway | 1 | 1 (분석 §8.2 / BPMN §3.2) | ✓ |
| task (Task_2) | 1 | 1 (분석 §8.2 + §8.4 / BPMN §3.2) | ✓ |
| userTask | 1 | 1 (분석 §8.2 + §8.5 / BPMN §3.2 + §4) | ✓ |
| sequenceFlow | 5 | 5 (분석 §8.3 / BPMN §3.3) | ✓ |
| BPMNShape | 5 (diagram) | (diagram 미명세 — 산출물 §F.6 권고) | △ (의도 외 — diagram 좌표는 5 산출물 명세 대상 외) |
| BPMNEdge | 5 (diagram) | (diagram 미명세) | △ (좌표는 명세 대상 외) |

> BPMN diagram 좌표 (BPMNShape / BPMNEdge / BPMNLabel) 는 5 산출물 명세 대상 외 (UI 시각화 영역만) — 자연 제외. flow 본문 (process + 5 노드 + 5 flow) 은 100% 반영.

### E.5 호출 출처 (P-NNN)

| P-NNN | 호출 화면 | 본 5 산출물 반영 | 결과 |
|---|---|---|---|
| P-001 | MasterCodeMng | 분석 §5 + 기능 §1.3 + §9 | ✓ |

## §F. To-Be 변환점

### F.1 DBMS 변환점

| # | As-Is (Oracle) | To-Be (MSSQL) | 영향 (산출물) |
|---:|---|---|---|
| C-001 | `TO_TIMESTAMP('${X}')` | cactus-core JPA `@PrePersist` / `@PreUpdate` (Instant.now() 자동) — TO_TIMESTAMP 직접 사용 위치는 audit fragment 외 없음 | 분석 §11.1 |
| C-002 | `SYSDATE` / `SYSTIMESTAMP` | `SYSDATETIME()` / `GETDATE()` | 분석 §11.1 |
| C-003 | `MERGE INTO ... USING (... FROM DUAL) ON (...)` | MSSQL `MERGE` (DUAL 제거, VALUES 또는 derived table 사용) | 분석 §11.1 (본 화면 미사용 — 공용 mapper 잠재 영향) |
| C-004 | `${MYBATIS_WHERE}` literal | 동일 (ANSI 호환) | 변경 없음 |
| C-005 | `MCM_SOURCE.TB_MCM_CODE_DETAIL` (mui Mapper.xml — **원장 schema 명시 / synonym 아님**) | **`MCM_SOURCE.TB_MCM_CODE_DETAIL` 보존 (원장 편집 schema)** — 본 화면은 Excel Upload → 원장 INSERT/DELETE 수행 (2026-05-29 사용자 명시 정정) | 모든 SQL |
| C-006 | 컬럼명 대문자/언더스코어 | 그대로 유지 + Entity camelCase 매핑 | Entity 매핑 시 |
| C-007 | (추가) 3 schema 구조 명시 — As-Is Oracle 의 schema 분리 정합 | **`MCM_SOURCE`** (원장 — 본 화면 DML 대상: Excel Upload → INSERT/DELETE) / **`MCMAPUSER`** (운영 read 동기화본 — 다른 모듈/뷰 SELECT 대상, 동기화 화면이 적재 책임) / **`MCM_BACKUP`** (백업본 — 동기화 화면 위임). audit 9 컬럼은 3 schema 모두 동일 적용 (동기화 시 row copy 정합). | 분석 §9 / §11.3 / 본 §F.5 |

### F.2 식별자 변환점 (As-Is → To-Be)

| As-Is | To-Be | 비고 |
|---|---|---|
| MasterCodeUploadFilePopup (Form id) | masterCodeUploadFilePopup | 2-토큰 prefix |
| MasterCodeUploadFilePopup (BPMN process id) | masterCodeUploadFilePopup | 동일 |
| MasterCodeUploadFilePopupMapper (namespace) | masterCodeUploadFilePopupMapper | namespace prefix |
| GetCodeUploadList (select id) | **As-Is 보존** (`GetCodeUploadList` PascalCase) — Mapper SQL id 일관 컨벤션 | - |
| com.dongkuk.dmes.mui.task.ui.cma.MasterCodeUploadFilePopup.SaveMasterCodeFileUpload | **`com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.service.SaveMasterCodeFileUpload`** (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) | - |

### F.3 파일 업로드 처리 변환점

| 항목 | As-Is | To-Be 후보 |
|---|---|---|
| 클라이언트 Excel parsing | `gfn_importExcel` (nexacro) | **SheetJS (FE)** (사용자 결정) |
| 서버 전송 | oasis `gfn_transaction` JSON | **REST API JSON (행 배열)** (사용자 결정) |
| 미리보기 그리드 | nexacro Grid (Format/default) | FE 프레임워크 표준 (AG-Grid 등) |
| Excel export | `gfn_exportExcel` (nexacro client) | FE library 또는 BE generation (개발 단계 결정) |

### F.4 결함 → To-Be 보강

| F-ID | As-Is 결함 | To-Be 보강 (RC-ID) | 등재 위치 |
|---|---|---|---|
| F-001 | param.clear() 재사용 (정상이지만 잠재 위험) | (구조 분리 권고) | BPMN §4.4 |
| F-002 | row index 미포함 오류 메시지 | RC-002 | BPMN §4.4 |
| F-003 | (String) cast 위험 | RC-001 | BPMN §4.4 |
| F-004 | CODE_VER 고정 "1" | RC-004 | BPMN §4.4 |
| F-005 | chk_regFlag=false 시 PK 중복 위험 | RC-003 | BPMN §4.4 |
| F-006 | xfdl:165 if 가드 변수 혼동 | (가드 분리 — 기능 §3.1 비고) | 기능 §3.1 |
| F-007 | 빈 dataset + chk_regFlag=true → 무경고 전체 삭제 | (MT-002 confirm 메시지 — 기능 §10.2) | 기능 §10.2 |

### F.5 schema / 테이블 변환

| 항목 | As-Is | To-Be |
|---|---|---|
| schema | `MCM_SOURCE` (mui Mapper.xml — **원장 schema 명시 / synonym 아님**) | **`MCM_SOURCE` 보존 (원장 편집 schema)** — 본 화면은 Excel Upload → 원장 INSERT/DELETE (2026-05-29 사용자 명시 정정) |
| 테이블명 | TB_MCM_CODE_DETAIL | TB_MCM_CODE_DETAIL 보존 (As-Is 1:1) |
| 3 schema 구조 (To-Be 운영 모델) | (Oracle 시절 분리: MCM_SOURCE / MCMAPUSER / MCM_BACKUP) | **`MCM_SOURCE`** (원장 — 본 화면 DML 대상: Excel Upload → INSERT/DELETE) / **`MCMAPUSER`** (운영 read 동기화본 — 다른 모듈/뷰 SELECT 대상, 동기화 화면이 적재 책임) / **`MCM_BACKUP`** (백업본 — 동기화 화면 위임). As-Is mui DB테이블명세서 (`docs/mcm/001_마스터코드/mui-20260522_1430-MCM코드관리-DB테이블명세서.md:5`): "스키마: MCMAPUSER (운영) / MCM_SOURCE (Mapper 내 사용)" 분리 표기 정합 (2026-05-29 사용자 명시 정정) |
| 컬럼 audit (As-Is `CREATED_*` / `LAST_UPDATED_*` / `DATA_END_*` / `ARCHIVE_*` 17 컬럼) | ref_Audit fragment | **cactus-core `CactusAuditEntity` (또는 mcm-core `McmAuditEntity`) 9 컬럼** (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`) — JPA `@PrePersist` / `@PreUpdate` 자동 적용. **3 schema (MCM_SOURCE / MCMAPUSER / MCM_BACKUP) 모두 동일 적용** (동기화 시 row copy 정합 위해). 가이드 02 §A.5-3-1 정본 / BackEnd 가이드 §8-1 MUST. As-Is `DATA_END_*` / `ARCHIVE_*` 9 컬럼 **To-Be 제거** (사용자 결정) |

### F.6 BPMN 산출물 변환 (추가 권고 — 산출물 외)

| 항목 | As-Is | To-Be |
|---|---|---|
| .bpmn 파일명 | MasterCodeUploadFilePopup.bpmn | masterCodeUploadFilePopup.bpmn |
| .bpmn 위치 | services/cma/ | services/cma/ (As-Is 보존 — RULE.md 폴더 룰 확정 시 일괄 이동) |
| diagram (좌표) | As-Is 보존 (시각화는 의미 없음) | 신규 그릴 시 5 산출물 §3.1 flow 그대로 재현 |

## §G. 확인필요 항목 집계 — 결정 완료

> 사용자 결정 완료 — **활성 확인필요 = 0 건**. 결정 누적 표는 분석리포트 §12 참조. To-Be 적용: cactus-core `CactusAuditEntity` (또는 mcm-core `McmAuditEntity`) 9 컬럼 (3 schema 모두 동일 적용) / **`MCM_SOURCE.TB_MCM_CODE_DETAIL` 보존 (원장 편집 schema — 본 화면 DML 대상, 2026-05-29 사용자 명시 정정)** + REMARK 보존 + DATA_END_*/ARCHIVE_* 제거 / Entity·Repository 는 `com.dongkuk.dmes.mcm.entity.*` / `com.dongkuk.dmes.mcm.repository.*` 평탄 (모듈 단위 공유) + Service·DTO 는 `com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.{service,dto}.*` 패키지 (RULE.md §"패키지 명명 규칙" §3-1 — 2026-05-29 BE 자산 mcm-core 이동에 따른 패키지 경로 갱신) / Excel parsing SheetJS / JSON 전송 / 권한 외부 위임 / Optimistic Locking 자동.

### G.1 정정 결정 누적 표 (2026-05-29 사용자 명시 정정)

| 결정 영역 | 기존 결정 (오류) | 정정 결정 | 본문 반영 위치 |
|---|---|---|---|
| **스키마 정본 (To-Be DML 대상)** | As-Is `MCM_SOURCE.` synonym → To-Be `MCMAPUSER.TB_MCM_CODE_DETAIL` 보존 (사용자 결정) | **As-Is `MCM_SOURCE.TB_MCM_CODE_DETAIL` (원장 schema 명시 — synonym 아님) → To-Be `MCM_SOURCE.TB_MCM_CODE_DETAIL` 보존 (원장 편집 schema)**. 본 화면 INSERT/DELETE = 원장 DML 정합. 근거: mui DB테이블명세서 (`docs/mcm/001_마스터코드/mui-20260522_1430-MCM코드관리-DB테이블명세서.md:5`) "스키마: MCMAPUSER (운영) / MCM_SOURCE (Mapper 내 사용)" 분리 표기. selPop = 운영 read 화면 → `MCMAPUSER.VI_MCM_CODE_ACCESS` 와 반대 결정 (본 화면은 원장 편집). | §D.3 / §F.1 (C-005) / §F.5 / 분석 §6.1 ~ §6.3 / §9 / §11 / §12 |
| **3 schema 구조** | (미명시) | **`MCM_SOURCE`** (원장 — 본 화면 DML 대상: Excel Upload → INSERT/DELETE) / **`MCMAPUSER`** (운영 read 동기화본 — 다른 모듈/뷰 SELECT 대상, 동기화 화면이 적재 책임) / **`MCM_BACKUP`** (백업본 — 동기화 화면 위임) | §D.3 / §F.1 (C-007) / §F.5 / 분석 §11.3 / §12 |
| **audit 9 컬럼 3 schema 통일** | cactus-core 9 컬럼 적용 (자체) | cactus-core `CactusAuditEntity` (또는 mcm-core `McmAuditEntity`) 9 컬럼 (`C_USR_ID` / `C_AT` / `C_SVC_ID` / `C_PGM_ID` / `U_USR_ID` / `U_AT` / `U_SVC_ID` / `U_PGM_ID` / `VER`) — **3 schema (MCM_SOURCE / MCMAPUSER / MCM_BACKUP) 모두 동일 적용** (동기화 시 row copy 정합 위해). 가이드 02 §A.5-3-1 정본 / BackEnd 가이드 §8-1 MUST. | §F.5 / 분석 §9.2 / §11.4 / §12 |

## §H. 결론

| 영역 | 결과 |
|---|---|
| §A. 단일 원천 정합 | ✓ |
| §B. 식별자 정합 | ✓ |
| §C. SQL ID 일치 | ✓ |
| §D.1~D.3 / D.5 | ✓ |
| §D.4 manifest 9 파일 | ✗ (Runner 미실행 — 사용자 결정 / 의도된 면제) |
| §E. As-Is 누락 0 | ✓ (E.4 BPMN diagram 좌표 △ = 의도 외) |
| §F. To-Be 변환점 | ✓ (Q-NNN 28 건 모두 §G 등재) |

> §D.4 외 모든 게이트 ✓. §D.4 의 ✗ 는 사용자 결정에 따른 의도된 면제로, 본 5 산출물 완결성에는 영향이 없다.
