# MQC 모듈 설계 결정 레퍼런스 (확인필요 해소 누적)

> 갱신: 2026-06-23. 본 파일은 **mqc 화면 설계 시 "이미 결정된 항목"의 단일 정본**이다.
> 신규 mqc 화면의 Q-NNN 이 아래 결정과 일치하면 사용자 재질문 없이 resolved 처리하고 본 파일을 cite 한다.
> 신규 결정 확정 시 화면 `정합체크 §G`/`분석 §13` 갱신과 동시에 본 파일 + `reference_mqc_design_decisions` 메모리에 추가한다.

## A. 모듈 공통 결정

| # | 결정 | 근거 | 확정일 |
|---|---|---|---|
| A-01 | **mqc 고립 데이터소스** — mqc 는 자기 DB(MQCAPUSER)만 소유. 마스터 카탈로그(품목·공통코드·BOP/PQP 등)는 타 모듈(mcm/mpn/mpp) 소유 → LoV/조회는 (A안) 자기 DB DISTINCT 또는 (B안) 크로스모듈 LoV/조회 API. 공통코드(B_COMM_CODE 류)는 **mcm/mpn 공통마스터 위임**(자기 DB 직접 CRUD ✗). | memory `mqc-isolated-datasource` / qca 5화면 적용 | 2026-06-23 |
| A-02 | **API 패턴 판정** — 분석 §11 C1~C6 자동 판정. 6/6 → Phase 7 분리(query/service/lov), 그 외 OASIS 단일 actionGateway(`/api/mqc/oasis/{screenId}/{action}`). mqc 는 SqlSession 미등록(inspRstReg 선례) → 조회전용/단순 화면은 OASIS 단일이 안전(Phase7 query 라우트 runtime 404 위험). | inspRstReg / qca 5화면 | 2026-06-23 |
| A-03 | **§-1 / Auto-Manifest = Runner 실행 (자산 실재)** — ⚠ 정정(2026-06-23): Auto-Manifest Runner 는 **`docs/guide/runners/Auto-Manifest-Runner.ps1`(+ `source-roots.config.json`)에 실재**(가이드 00 §0.2.8 의 `local_docs/테스트/runners/` 는 stale 경로). 기존 mqc 화면 20개(QGA·QMA*)에 manifest 기생성됨. **source 보유 화면은 Runner 를 실행**(`-ModuleId mqc -TargetKey {AsIsId} -VerifyRuns 2`, SourceRoot 자동탐색)해 manifest 9 파일 생성 → 분석 §-1 R14-Step0 + 정합 §D.4 에 hash 인용(Agent 는 hash 만 인용, 결과 해석·수정 ✗). abnrStndInfo(QBA021K) 실행 완료(verify pass=true/byteDiff=0/conflict 없음). **source 없는 화면(QBA990C → qultComnCode)만 R-14 비대상**(Runner noCandidate). manifest classify 는 raw 분류 — §4 정제 카운트와 1:1 일치 비대상(Runner=결정성 증적). | docs/guide/runners/ / 00 §0.2.9 / qca | 2026-06-23 |
| A-04 | **영속성 = JPA 단일 (사용자 결정 2026-06-23, 확정)** — mqc OASIS serviceTask 영속성은 **JPA**로 통일. 근거: mqc 모듈 JPA 단일 선례(`@Entity` 7·`JpaRepository` 6·**MyBatis(@Mapper/XML) 0**) + RULE.md §영속성. 구현: Spring Data JPA Repository + JPQL, 동적/복잡 쿼리는 `@Query(nativeQuery=true)` 또는 `EntityManager`(MyBatis 우회 금지, APS 코어 규칙 준용). 조회 전용 화면은 read-only projection. → qca 5화면 영속성 Q-NNN(abnrStndInfo Q-003 / inspStndTimeReg Q-006 / qultComnMearsure Q-MEAS-10) **resolved=JPA**. (RULE.md §영속성의 "OASIS serviceTask 사용자 확인 필수"는 본 결정으로 충족 — 신규 mqc 화면도 본 A-04 cite, 재질문 불요.) | RULE.md §영속성 / 사용자 결정 / mqc JPA 선례 | 2026-06-23 |
| A-06 | **To-Be 테이블 정본 = `docs/mqc/MQC_TABLE_MIGRATION.MD` (MUST 참조)** — mqc 화면 설계 §6/§7/§8·기능·BPMN·개발체크의 To-Be 테이블명·컬럼명·audit는 As-Is DDL 추정이 아니라 **MQC_TABLE_MIGRATION.MD §2 일람 + §3.x 컬럼 매핑**을 정본으로 인용한다. 핵심 주의: (a) 약어 정명(`TB_MQC_DEFECT_DETL`/`TB_MQC_INSP_TIME`/`TB_MQC_INSTRUMENT_CHNG` 등 — DETAIL/INSPECTION_TIME/CHANGE 아님), (b) 한글명이 화면명과 다를 수 있음(예: Q_Inspection_Time → `TB_MQC_INSP_TIME` "측정장비계측시간"), (c) **audit = 시스템 감사컬럼 `C_*/U_*/VER`, 레거시 `IN_DT/IN_ID/UP_DT/UP_ID` 미보유**(DEFECT_TYPE/DEFECT_DETL/MEASURE_INFO/INSP_TIME 4테이블 2026-06-17(c)), (d) As-Is 미사용 컬럼(ENG_NM 등)도 To-Be 테이블엔 존재할 수 있음. 2026-06-23 qca 4화면(abnrStndInfo/inspStndTimeReg/inspStndTimeInq/qultComnMearsure) 정본 정렬 교정 완료. **작성 brief에 본 정본 경로 포함 필수**(누락 시 As-Is DDL 추정으로 정명 불일치 발생 — 본 batch 1차 결함 원인). | MQC_TABLE_MIGRATION.MD / qca 교정 | 2026-06-23 |
| A-05 | **01 §A.3.2 화면↔As-Is 매핑 — mqc 26화면 일괄 백필 등재 완료** (2026-06-23). qca 5 + qcb 4(QGA) + qcc 17(QMA). moduleGroup 은 폴더 위치 기준. ⚠ **abnr*Review 6화면(QMA010/012/013/024/025/026K)은 frontmatter `moduleGroup: qcb` 선언이나 폴더·형제(abnr)=qcc 불일치** — A.3.2 는 qcc 로 등재하고 비고에 플래그. 해당 6화면 frontmatter 정정(qcb→qcc) 권고(미수행 — 사용자 확정 대기). qca 5화면 Q-001(부속서 등재) 전부 resolved. | 01 §A.3.2 / 사용자 지시(B 일괄 백필) | 2026-06-23 |

| A-07 | **LoV 처리 기준 — 고정 소형 enum = FE 상수 / 대용량 마스터만 위임** (사용자 결정 2026-06-23) — mqc FE 는 LoV API(`apiLovMaster`/`/lov/`) **미사용**(실측 0건) — 코드 라벨은 **FE 상수**(`Record<string,string>`, 예: faiCheckResReg `INSP_CLASS_LABEL = {M:"사내",O:"외주",P:"구매",X:"금형",R:"RMA"}`, `DECISION_LABEL`). 분류: (a) **고정 소형 enum**(검사분류 Q001, Y/N B029, 합격/불합격 Q004 등) → **FE 상수 enum 공유**(중복정의 ✗, 기존 상수 재사용), BE LoV service task 미신설. (b) **대용량/가변 마스터 카탈로그**(품목, 측정장비명 Q050 등) → A-01 의 크로스모듈 위임 또는 화면 전용 LoV 서비스(예: `FaiCheckResRegLovRequest`). ⚠ mcm/mpn 에 범용 공통코드 마스터(B_COMM_CODE 대응)는 **현재 미구현** — "공통마스터 위임"을 고정 enum 에 적용하지 말 것(over-engineering). abnrStndInfo Q-004(검사분류 Q001) = FE 상수 resolved. | faiCheckResReg 선례 / 사용자 결정 | 2026-06-23 |

## B. 도메인 공통 결정

| # | 결정 | 근거 | 확정일 |
|---|---|---|---|
| B-01 | **품질 공통코드(B_COMM_CODE) 위임** — 품질화면이 소비하는 공통코드(Q001 검사분류 / Q032 측정방법 / E175 구분 / E176 필수 / E192 측정장비 / Z014 시간단위 / P001 공정 / Q050~Q067·B029·Q004 측정장비 도메인)의 편집(IUD)은 mcm/mpn 공통마스터 소유. mqc 화면은 조회/LoV(읽기)만. | qultComnCode / abnrStndInfo / inspStndTimeReg / qultComnMearsure | 2026-06-23 |
| B-02 | **As-Is 영문명(ENG_NM) 컬럼 미이식** — Q_BAS_DEFECT_TYPE/DETAIL 의 *_ENG_NM 은 As-Is 화면·SP 미사용 → To-Be 제외(자연 제외). | abnrStndInfo §0.1 | 2026-06-23 |

## C. 화면 고유 결정

| # | 화면 | 결정 | 근거 | 확정일 |
|---|---|---|---|---|
| C-01 | qultComnCode (QBA990C) | QBA990C 전용 As-Is(화면/SP/Designer.cs) 부재. **조회/LoV 전용**(CRUD 없음) — 공통코드 편집은 mcm/mpn 공통마스터 위임. 데이터 원천 = 크로스모듈 LoV/조회 API(B안). asIsId=QBA990C, B_COMM_CODE 구조 원형 참조. **REL_CD1~10 = 원시 참조1~10 generic 표시**(사용자 결정 2026-06-23, Q-001) — 뷰어는 generic(B_COMM_CODE DDL 명칭), 그룹별 의미(예: Q050.REL_CD1=장비구분자)는 **소비 화면 책임**. ⚠ As-Is 에 그룹별 REL_CD 의미 메타(코드그룹정의 테이블) **부재** — 의미는 소비코드에만. 후속: 공통마스터 그룹메타 신설 시 동적헤더. **Q-002(라우팅) resolved — A안(사용자 결정 2026-06-23): 공통코드 마스터 = mcm `MasterCodeController`(`GET /api/mcm/master-codes/groups` + `/groups/{groupCd}/items`). qultComnCode = FE 전용 페이지로 mcm BFF route 직접 호출(cross-module), 품질 MAJOR_CD 화이트리스트 필터. mqc BE/OASIS serviceTask/.bpmn 신설 0.** 구현 sub-task: REL_CD1~10 → mcm `SecCodeItem`(Map) 실필드 정렬 + 화이트리스트 현업 검수. | 사용자 결정 2026-06-23 | 2026-06-23 |
| C-02 | qultComnMearsure (QBA991C) | QBA991C(품질공통측정) 전용 As-Is 부재 → **QIA010K(측정장비마스터등록)를 As-Is 정본으로 앵커 치환**. asIsId=QIA010K. 측정장비 마스터 CRUD + 교정이력(Q_INSTRUMENT_HIST)/변경이력(Q_INSTRUMENT_CHANGE 자동적재) 종속 + 첨부 3종 + 이력카드 인쇄 + 권한게이트(Q067). C1~C6 4충족 → Phase 7 분리. | 사용자 결정 2026-06-23 | 2026-06-23 |
| C-03 | qultComnMearsure | 미사용 As-Is 자산 이관 제외 — Q_BAS_MEASURE("사용안함" 명시)·Q_INSTRUMENT_RNTL(본 화면 미참조)은 측정장비 마스터 이관 범위 외. 권한 Q067(B_COMM_CODE REL_CD1 ALL/AU 직접 SQL)은 MES RBAC 재설계 대상(Q-MEAS-06, open). | QIA010K 전수 분석 | 2026-06-23 |
| C-04 | inspStndTimeInq (QBA032K) | 조회 전용 파생 집계. As-Is soQBA032 가 단일 SP 에서 직접 조인하는 BOP/PQP/품목(mpp 소유)·공통코드(mcm/mpn 소유) 는 mqc 고립 DB 경계상 크로스모듈 조회/projection 위임 필요(Q-ISTI-04/05, open — 아키 확인). 검사시간(mqc, Q_Inspection_Time)만 자기 보유. | A-01 / QBA032K 분석 | 2026-06-23 |

## D. 미결(open)

| Q-NNN(대표) | 화면 | 내용 | 처리 후보 |
|---|---|---|---|
| Q-MEAS-06 | qultComnMearsure | 권한 Q067 직접 SQL → MES RBAC 재설계 | 권한체계 설계 시 |
| Q-MEAS-07 | qultComnMearsure | 첨부(wwAttachmentFile) 3종·Crystal 이력카드(QIA010HistRpt.rpt) → MES 컴포넌트/리포트 재설계 | 구현 단계 |
| Q-MEAS-08 | qultComnMearsure | 관리번호 PK 회사 미포함·교정주기 코드=개월 동일저장 키체계 | 사용자/현업 확인 |
| Q-ISTI-04/05 | inspStndTimeInq | BOP/PQP/품목 크로스모듈 read-only 위임(A안 뷰 vs B안 조회결합) + 품목 LoV 원천 | 아키텍처 확인 |
| Q-(영속성) | 전 화면 | OASIS serviceTask JPA vs MyBatis | 구현 착수 전 사용자 확인 (A-04) |
| Q-(To-Be 테이블) | abnrStndInfo/inspStndTimeReg | TB_MQC_* 신규 테이블 명/매핑 정본(MQC_TABLE_MIGRATION 등재) | 개발 단계 |
