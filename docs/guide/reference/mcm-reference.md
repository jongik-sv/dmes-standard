# MCM 모듈 설계 결정 레퍼런스 (확인필요 해소 누적)

> 갱신: 2026-06-10. 본 파일은 **mcm(공통·시스템) 화면 설계 시 "이미 결정된 항목"의 단일 정본**이다.
> 신규 mcm 화면의 Q-NNN / 확인필요 항목이 아래 결정과 일치하면 **사용자 재질문 없이 resolved 처리하고 본 파일을 cite** 한다.
> 신규 결정이 확정되면 화면의 `정합체크 §G`(확인필요 집계) / `분석리포트 §12`(결정 누적 표) 갱신과 **동시에** 본 파일에 추가한다.
>
> harvest 원천: 각 화면의 `분석리포트 §12 결정 누적(사용자 결정 완료)` 표 + `정합체크 §G 확인필요 항목 집계`(대부분 "활성 0건 — §12 참조"로 위임). **resolved 항목만** 등재.
>
> harvest 원천 화면(2026-06-10, 실제 폴더명 — `docs/mcm/design/` 하위 20개):
> **csa**: commMenuMng · commObjMng · commPermMng · commRoleGrpMng · commRoleMng · commSyncMng · commUserMng · commUserRoleCopy
> **cma**: masterCategoryMng · masterCodeUploadFilePopup · masterCodeSelPop
> **cme**: masterCodeMngList / **cmb**: masterRuleList
> **cia**: interfaceList · messageSender / **cib**: interfaceFormatLayout · interfaceFormatList
> **cic**: tcAbnormalData · tcErrorList · tcErrorResendPop
>
> 분류 기준: **A** = mcm 전 화면 적용(cross-cutting 정책 #1·#2·#4·#6 + 인프라/오딧/권한/패키지 표준), **B** = 동일 moduleGroup(csa/cma/cmb/cme/cia/cib/cic) 내 공통, **C** = 타 화면 재사용 가능성 있는 화면 고유 결정, **D** = 미결(open) cross-cutting.

## A. 모듈 공통 결정 (모든 mcm 화면 적용)

| 결정 영역 | 결정 내용 (요약) | 근거 화면/Q | 확정일 |
|---|---|---|---|
| **As-Is/To-Be 표준 우선** (cross-cutting 정책 #4) | As-Is 1:1 보존 + 누락 0 + cite 100% 가 최우선. To-Be 정정/제거 결정은 §12 누적표 + §11 변환점에 명시. 분량 회피/요약화 금지. As-Is 충돌 시 To-Be 개발 표준 우선 | commPermMng §12 / commRoleMng §12 / masterCodeMngList §12 (정책 #4 (0), 전 화면) | 2026-05-29 |
| **BIZ_SYSTEM_CODE / APP_HOST_ID 도메인 전면 폐기** (cross-cutting 정책 #1) | mcm 전역 — BIZ_SYSTEM_CODE 콤보/그리드컬럼/Essential + ds_lovSubSystem Dataset + fn_lov 메서드 + lov action + cross-namespace `CommObjMngMapper.selectAppHostId` 호출 + BPMN lov Task/Flow 일괄 폐기. 단일 BIZ SYSTEM 운영. DB DDL 컬럼 자체는 legacy 보존(SQL/UI/Entity 미사용) | commMenuMng §12 / commObjMng §12(Q-NEW-001 자동해소) / commPermMng §12(2026-05-31) / commRoleGrpMng §12 / commRoleMng §12(Q-005 자동해소) | 2026-05-31 |
| **EAI 외부 인터페이스 → DMES 자체 마스터** (cross-cutting 정책 #2) | As-Is `EAIUSER.IF_*` 외부 부서 마스터 직접 참조 → To-Be DMES 자체 `MCMAPUSER.TB_MCM_DEPT_INFO` JOIN 변환. USAGE_YN='A' → USE_TP='Y' 대응 | commUserMng §12 / commUserRoleCopy §12 | 2026-05-29 |
| **Entity / Repository 명명** (cross-cutting 정책 #6 A안) | As-Is 테이블명 1:1 직역(TB_MCM_ prefix 제거 + camelCase, 모듈 단축형). `com.dongkuk.dmes.mcm.entity.*` / `mcm.repository.*` 모듈 직속 평탄(공유). 예: SecMenu/SecObj/SecMenuFld/SecRole/SecRoleMapping/SecUser | commMenuMng §12 / commObjMng §12 / commPermMng §12(SecPerm) / commRoleMng §12 | 2026-05-31 |
| **Java 패키지 (RULE.md §3-1)** | Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄(모듈 공유) / Service·DTO = `com.dongkuk.dmes.mcm.{moduleGroup}.{screenId}.{service,dto}.*`. 2026-05-29 BE 자산 mcm-core 이동 정합 | commMenuMng §12 / commPermMng §12 / masterCategoryMng §12 / masterCodeUploadFilePopup §12 | 2026-05-29 |
| **audit 오딧 일원화** | As-Is `ref_Audit` fragment(17컬럼 등) → cactus-core `CactusAuditEntity`(=mcm-core `McmAuditEntity`) **9컬럼** `C_USR_ID/C_AT/C_SVC_ID/C_PGM_ID/U_USR_ID/U_AT/U_SVC_ID/U_PGM_ID/VER`. JPA `@PrePersist`/`@PreUpdate` 자동 채움. `DATA_END_*/ARCHIVE_*` 9컬럼 제거 | 전 화면 §12 (commMenuMng/commPermMng/masterCategoryMng/masterCodeSelPop 등) | 2026-05-28 |
| **동시성 / Optimistic Locking** | cactus-core `VER`(@Version) 자동 적용(상속, 별도 선언 ✗). 조회전용 화면은 영향 ✗ | commMenuMng §12 / commPermMng §12 / masterCategoryMng §12 | 2026-05-28 |
| **스키마 / 테이블명 (대문자 prefix 보존)** | As-Is 스키마 미명시/무명 prefix → To-Be **대문자 스키마 prefix 명시 보존**(`MCMAPUSER.TB_MCM_SEC_*` 등). MSSQL `ksm_dmes` 환경 통합. 테이블명 대문자 유지 | commPermMng §12 / commRoleMng §12 / commUserMng §12 / commRoleGrpMng §12 | 2026-05-29 |
| **영속성 / SQL 표준** | JPA 1순위(Repository + `@Query(nativeQuery=true)`) / 불가 시 MyBatis. SQL = ANSI 기본 / 불가 시 MSSQL. Oracle 구문(CONNECT BY, `(+)`, KEEP DENSE_RANK)은 ANSI CTE/LEFT JOIN/상관 서브쿼리로 변환 | interfaceList §12(Q-010) / tcAbnormalData §12 / tcErrorList §12 / interfaceFormatLayout §12 | 2026-05-29 |
| **통신 채널** | OASIS REST (cactus 표준) | masterCategoryMng §12 / masterRuleList §12 / interfaceFormatLayout §12 | 2026-05-29 |
| **권한 / 접근 제어 (RBAC 외부 위임)** | 본 화면 자체 권한 분기 ✗ → To-Be 외부 권한 프로세스(전사 정책) 위임. nexacro 권한 → React Context(PortalShell + RBAC). 화면별 PERM 코드는 별도 부여 가능(예 interfaceFormatLayout `PERM_MCM_CIB_W`) | 전 화면 §12(commPermMng/commUserMng/masterCategoryMng 등) | 2026-05-29 |
| **STATUS 컬럼 (Nexacro auto row state)** | As-Is Nexacro 자동 row state → To-Be FE 프레임워크에서 동일 row state 표시 기능 구현(AG Grid rowClassRules + CSS) | commMenuMng §12 ST-005 / commPermMng §12 / masterCategoryMng §12 / masterRuleList §12 | 2026-05-29 |
| **BPMN process id/name 잔존 정정** | As-Is 복붙 잔존 식별자(`sample1` / 타 화면명) → To-Be screenId(camelCase)로 process id·name 정정 | commMenuMng §12 / commPermMng §12 / commRoleMng §12(Q-012) / interfaceFormatLayout §12 | 2026-05-29 |
| **더미 텍스트 초기값 처리** | As-Is 디자인 더미("부산역 CY"/"USD" 등) → To-Be 빈 문자열/placeholder 출발(신규 미반영). ※ cma masterCategoryMng 는 "보존" 했다가 masterRuleList(2026-06-05)에서 "제거"로 정합화 | commRoleMng §12(Q-001) / interfaceFormatLayout §12 / masterRuleList §12 | 2026-06-05 |

## B. 도메인 공통 결정 (moduleGroup 별)

| 결정 영역 | 결정 내용 | 근거 화면/Q | 확정일 |
|---|---|---|---|
| **(cma/cme) 3-schema 구조** | `MCM_SOURCE`(원장 — 편집/DML) / `MCMAPUSER`(운영 read 동기화본 — 뷰·SELECT 대상) / `MCM_BACKUP`(백업본). As-Is `MCM_SOURCE.` 는 synonym 이 아니라 **원장 schema 명시**. 원장 편집 화면=MCM_SOURCE DML / 운영 read 화면=MCMAPUSER. audit 9컬럼은 3 schema 모두 동일 적용(row copy 정합) | masterCodeSelPop §12 / masterCategoryMng §12 / masterCodeUploadFilePopup §12 / commSyncMng §12(Q-002~003) | 2026-05-29 |
| **(cma/cme) VI_MCM_CODE_ACCESS 뷰 재사용** | cma 정본 `MCMAPUSER.VI_MCM_CODE_ACCESS`(owner=MCMAPUSER, 자기 schema JOIN, `MASTER.USE_TP='Y'` 필터) 재사용. PUBLIC SYNONYM MSSQL 미지원 → Service FROM 절에 schema 명시(a안). `DataInitializer.initMcmCmaSyncSchemaArtifacts()` 멱등 적재 | masterCodeSelPop §12(C-005) / commSyncMng §12(Q-003) | 2026-05-29 |
| **(csa) Sec* Entity 명명 + 복합 PK 패턴** | csa 보안 테이블 = `Sec*` 직역(SecMenu/SecObj/SecMenuFld/SecPerm/SecRole/SecRoleMapping/SecRoleGroup/SecUser 등). mcm-core 의 legacy `Sec*` entity 와 공존. 매핑 테이블은 `@IdClass` 복합 PK(예 SecRoleMappingId) | commRoleMng §12 / commRoleGrpMng §12 / commObjMng §12 / commUserMng §12 | 2026-05-31 |
| **(csa) 셔틀 cssclass 정정** | As-Is btn_right `btn_WF_ShuttleAddH`(실동작=삭제) / btn_left `btn_WF_ShuttleDeleteH`(실동작=추가) 의미 반대 결함 → To-Be swap 정정(의미 정합) | commRoleMng §12(Q-008) / commRoleGrpMng §12 | 2026-06-04 |
| **(csa) "역활"→"역할" / 오타 라벨 정정** | As-Is xfdl 오타("역활", "PERMISSON", div_buttom, "외부  접속 주소" 더블스페이스) → To-Be 정정 | commUserMng §12 / commRoleMng §12(Q-013) / commPermMng §12 | 2026-05-31 |
| **(cia) SERAI 자동 라우팅 + LV-001 전송방식 폐지** | As-Is 전송방식 콤보(EAI_HTTP/DB 등 6값) → To-Be 화면 미노출(0값). 라우팅 책임이 SERAI(`TB_MCM_MOM_KAFKA_SERAI_CONFIG.INTEGRATION_TYPE` 기준)로 이전 → 사용자 선택 무의미. 송수신모듈 입력 = Edit 박스(LoV ✗) | messageSender §12 #1/#17(M-9) / interfaceList §12(Q-001/Q-006) | 2026-06-01 |
| **(cia/cic) SERAI 통합 = MessageDispatcher DIP** | mcm-core 가 `MessageDispatcher` 인터페이스 정의, mcm/lib `SeraiMessageDispatcher` 가 cactus `SeraiIntegrationClient`(`send(topicId, transactionCode, interfaceMsg)` 3인자) 구현·주입. mcm-core 는 cactus 직접 import ✗(SI 독립). messageSender 패턴 재사용 | tcErrorResendPop §12 #2(2026-06-04 정정) / messageSender §12 #10(M-2) | 2026-06-04 |
| **(cic) cactus audit 매핑 + 부문구분 LoV 인라인** | As-Is `CREATION_TIMESTAMP`/`LAST_UPDATE_*` → cactus `C_AT`/`U_AT` 등 자동 주입(신축 모델에 별도 컬럼 미정의). 부문구분 LoV(MMPP/MMLS/MMQC+전체) 인라인 유지(마스터 등재 ✗) | tcErrorList §12 / tcAbnormalData §12 #6 | 2026-05-29 |

## C. 화면 고유 결정 (타 화면 재사용 가능성 있는 것만)

| 화면 | 결정 영역 | 결정 내용 | Q |
|---|---|---|---|
| commMenuMng | FULL_SEQ 자동부여 | 저장·기동 시 `recomputeMenuFullSeq()` 가 트리 전체를 7자리 인코딩으로 멱등 재계산(사용자 입력 ✗, read-only). PK=MENU_ID 단독화(복합 PK 폐기) + MENU_SEQ 8자리 '0' LPAD | C1~C6(iter#6) |
| commMenuMng | 오류 팝업 z-index 전역 | shared `.error-modal-overlay` z-index 50→10001(모든 팝업 위 표시) — FE shared CSS 전역 | C7 |
| commSyncMng | Oracle DB Link 폐기 | DB Link 3종(`@MEPP_MCM`/`@DPMESA1_MCM`/`@TSTMPH_MCM`) 폐기 → 단일 MSSQL. schema 간(MCM_SOURCE↔MCMAPUSER↔MCM_BACKUP) 메타 동기화로 화면 존속, LOC 분기만 잔존 | Q-002/004/005/010 |
| commSyncMng | 동기화 audit 정책 | SOURCE→TARGET `INSERT...SELECT *` 직후 별도 UPDATE 로 `U_*`=동기화주체 덮어쓰기, `C_*`=원작자 보존(Bulk INSERT 가 @PreUpdate 우회 → 명시 SQL `updateSyncAudit`) | Q-008 |
| commUserRoleCopy | 외부 namespace SQL JPA 흡수 | As-Is cross-namespace Mapper 호출 → 본 Repository JPA `saveAll()`/`findRoleMergeObject` 흡수(외부 namespace 의존 폐기) | (§6.1/§6.2) |
| commRoleMng | no-op UPDATE 폐기 | As-Is `SELECT 'X' FROM DUAL` no-op UPDATE → SQL 폐기 + BPMN updateSqlKey property 삭제, JPA saveAll 이 INSERT/DELETE-only 자연 처리 | Q-011 |
| masterCategoryMng | dead BPMN/SQL 제거 | 미호출 delete flow(Task/Flow) + orphan SQL(`MergeTbCodeCategory`) To-Be 제거. 키(MASTER_CODE/CATEGORY_ID) 편집 불가 정책 보존 | (§6/§8) |
| masterCodeUploadFilePopup | Excel import 패턴 | SheetJS(FE) 파싱 + JSON row 배열 전송 + atomic 트랜잭션(전체 rollback). PK 중복 preview 단계 사전 검증. CODE_VAL_REF1~5 미공급 → NULL 허용 | F-003/F-005 |
| masterRuleList | RULE_VER vs @Version 분리 | As-Is RULE_VER(업무 버전) 보존 + cactus VER(@Version) 별도 컬럼. 이력행 제외 룰(RULE_ID!=OLD_RULE_ID) 보존, delete API 미생성(USE_TP 논리삭제만) | Q-009/Q-011 |
| messageSender | INTERFACE 데이터 모델 변경 | 사용자 입력 = (INTERFACE_ID + TC_CODE) 2박스. As-Is `1 I/F:1 FORMAT:N TC` → To-Be `1 I/F:N(1 FORMAT:1 TC)`. LoV 팝업 2개(INTERFACE / 종속 TC). 입력사항 길이검증 FE/BE 이중. INTERFACE 0건 → "해당 인터페이스 없음" BusinessException | M-6/M-7/M-10(Q-601 등) |
| tcErrorResendPop | 재전송 이력/범위 | `TB_MCM_MOM_TC_SEND` 신설(재전송 이력형). 'S'(송신실패)만 재전송, 'R'(수신실패) 제외. PROTOCOL 표시 제거(EAI 프로토콜 폐기). 재전송 화면=TCErrorList components(`TcErrorResendModal.tsx`) | Q-100/Q-302/Q-304 |
| tcErrorList | 행 클릭 진입 + 발생일 기본값 | 그리드 TRANSACTION_CODE 셀 클릭 → TCErrorResendPop 모달. 발생일 From=today-7+현재시각 / To=현재시각 | (E-001/P-001) |
| tcAbnormalData | Java Task 흡수 | As-Is Java Task `SaveTbMcmMomTcSkip.java` → Service.save() 통합(Java Task 신설 ✗). dead code `MasterRuleListPop` 제거. 전문ID/전문명 그리드 read-only(TC_LIST 정본 보호) | (#2/#3/#4) |
| interfaceList | 삭제 핸들러 / 송신 분리 | 삭제 = BPMN CommonDeleteTask×3(Java Task 회피). 송신만 화면 노출(수신은 SERAI 명시). FORMAT_VER 버전1 고정(Phase 1) | Q-002/Q-005/Q-008 |
| interfaceFormatLayout | replaceAll 저장 패턴 | As-Is replaceAll 1:1 보존(FORMAT_ID+FORMAT_VER 단위 전체 DELETE + N건 INSERT). 항상 INSERT(VER=0L)라 @Version 잠금 미발화 | (§6/§7) |

## D. 미결(open) — 모듈 차원 추적

| 항목 | 상태 | 비고 |
|---|---|---|
| interfaceFormatLayout Q-501 | open | DELETE WHERE 가 FORMAT_ID 만(FORMAT_VER 누락) — As-Is 의도(활성 버전 1개 정책)인지 단순 누락인지 사용자 확정 필요. DATA_TP=4(VARCHAR2) LoV 누락 보강도 동건 |
| interfaceFormatLayout Q-503/504 | open | 화면 진입 방식(모달 vs 독립 page) / import 팝업(Phase 2 신규 화면) 미결 |
| interfaceFormatList Q-400 | open | `MCM_BACKUP.TB_MCM_MOM_FORMAT_LAYOUT` UNION — (A)백업 스키마 신설 / (B)MCMAPUSER 단일 / (C)DB 백업 메커니즘. Phase 1b 보류 |
| interfaceFormatList Q-402/403 | open | 비교 팝업 diff 표시 방식(라인/컬럼별, Phase 2) / `GetFormatLayoutBackup` 미호출 SQL 처리 미결 |
| tcAbnormalData Q-203 | open | SKIP_LEVEL 기본값 — 신규 row 미선택 시 (1)`N` 자동 set vs (2)저장 차단. 사용자 결정 대기 |
| tcAbnormalData Q-204 | open | START/END_ACTIVE_DATE 그리드 노출 여부(유효기간 관리) 결정 대기 |
| tcErrorList Q-100/Q-103 | open | RESEND_CNT 추적 모델 / ERROR_STATUS_CODE 활용 = Phase 1b/Phase 2 결정 보류 |
| tcErrorResendPop Q-300 | open | 헤더 7항목 검증의 표준 일반화 보류(FE+BE 이중 검증 자체는 확정) |
| commUserRoleCopy WORKS_CODE='P' | open | B_COMM_CODE 미등재 — Permission/Privilege 추정. DMES 코드 마스터 시드 정의 시 별도 결정(As-Is 'P' 하드코딩은 보존) |
