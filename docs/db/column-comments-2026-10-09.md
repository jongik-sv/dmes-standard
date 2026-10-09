# MCM·MDM 테이블 칼럼 주석 채우기 (2026-10-09)

- 지시: col-comments-1. 대상은 로컬 L_MAIN 에서 칼럼 주석(ALL_COL_COMMENTS)이 없던 칼럼 전부
- 수단: 스키마별 Flyway V 파일의 `COMMENT ON COLUMN`·`COMMENT ON TABLE`
- 근거: 사전 = MDM 컬럼 사전(TB_MDM_COLUMN) 논리명 / 화면 = 화면 라벨·타입 주석 / 코드 = 코드·문서·공통 칼럼 규칙 / 추정 = 물리명 분해
- 같은 물리명은 스키마가 달라도 같은 이름으로 통일

## MCMAPUSER (V12, 칼럼 860·테이블 55)

파일: `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcmapuser/V12__column_comments.sql`

### 테이블

| 테이블 | 이름 | 근거 | 상세 |
|---|---|---|---|
| SAMPLE_MASTER_CODE | 샘플 마스터 코드 | 추정 | SAMPLE_ 접두 샘플 테이블 |
| SAMPLE_NOTICE | 샘플 공지 | 추정 | SAMPLE_ 접두 샘플 테이블 |
| TB_MCM_CODE_CATEGORY | 코드 카테고리 | 코드 | src/frontend/m-mcm/page-components/mdm/masterCategoryMng |
| TB_MCM_CODE_DETAIL | 코드 상세 | 코드 | src/frontend/m-mcm/page-components/mdm/masterCodeMng |
| TB_MCM_CODE_MASTER | 코드 마스터 | 코드 | src/frontend/m-mcm/page-components/mdm/masterCodeMng |
| TB_MCM_DEPT_INFO | 부서 정보 | 추정 | 테이블명 분해 |
| TB_MCM_JOB_COLLECT_DATA | 작업 수집 데이터 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/CollectDataPanel.tsx |
| TB_MCM_JOB_DEF | 작업 정의 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/JobListPanel.tsx |
| TB_MCM_JOB_HANDLER | 작업 핸들러 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/KindEditors.tsx:50 |
| TB_MCM_JOB_RUN | 작업 실행 이력 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/HistoryPanel.tsx |
| TB_MCM_MOM_FORMAT_LAYOUT | MOM 포맷 레이아웃 | 추정 | 테이블명 분해 |
| TB_MCM_MOM_FORMAT_LIST | MOM 포맷 목록 | 추정 | 테이블명 분해 |
| TB_MCM_MOM_INTERFACES | MOM 인터페이스 | 추정 | 테이블명 분해 |
| TB_MCM_MOM_TC_ERROR | MOM 전문 오류 | 추정 | 테이블명 분해 |
| TB_MCM_MOM_TC_LIST | MOM 전문 목록 | 추정 | 테이블명 분해 |
| TB_MCM_MOM_TC_SEND | MOM 전문 송신 | 추정 | 테이블명 분해 |
| TB_MCM_MOM_TC_SKIP | MOM 전문 건너뛰기 | 추정 | 테이블명 분해 |
| TB_MCM_NOTICE | 공지사항 | 코드 | src/frontend/m-mcm/page-components/noticeMgmt |
| TB_MCM_NOTICE_TARGET | 공지 대상 직무 | 코드 | src/frontend/m-mcm/page-components/noticeMgmt |
| TB_MCM_SEC_MENU | 메뉴 | 화면 | src/frontend/m-mcm/page-components/csa/commMenuMng |
| TB_MCM_SEC_MENU_FLD | 메뉴 폴더 | 화면 | src/frontend/m-mcm/page-components/csa/commMenuMng |
| TB_MCM_SEC_OBJ | 오브젝트 | 화면 | src/frontend/m-mcm/page-components/csa/commObjMng |
| TB_MCM_SEC_PERM | 권한 | 화면 | src/frontend/m-mcm/page-components/csa/commPermMng |
| TB_MCM_SEC_ROLE | 직무 | 화면 | src/frontend/m-mcm/page-components/csa/commRoleMng |
| TB_MCM_SEC_ROLEGROUP | 직무 그룹 | 화면 | src/frontend/m-mcm/page-components/csa/commRoleGrpMng |
| TB_MCM_SEC_ROLEGROUP_MAPPING | 직무 그룹 직무 매핑 | 화면 | src/frontend/m-mcm/page-components/csa/commRoleGrpMng |
| TB_MCM_SEC_ROLE_MAPPING | 직무 권한 매핑 | 화면 | src/frontend/m-mcm/page-components/csa/commRoleMng |
| TB_MCM_SEC_USER | 사용자 | 화면 | src/frontend/m-mcm/page-components/csa/commUserMng |
| TB_MCM_SEC_USER_FAVORITE | 사용자 즐겨찾기 | 추정 | 테이블명 분해 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | 사용자 즐겨찾기 폴더 | 추정 | 테이블명 분해 |
| TB_MCM_SEC_USER_HIS | 사용자 이력 | 추정 | 테이블명 분해 |
| TB_MCM_SEC_USER_MAPPING | 사용자 매핑 | 추정 | 테이블명 분해 |
| TB_MCM_SEC_USER_PWD | 사용자 비밀번호 | 추정 | 테이블명 분해 |
| TB_MCM_SEC_USER_ROLL_HIS | 사용자 역할 이력 | 추정 | 테이블명 분해 |
| TB_MCM_SEC_USER_SRCH_DFLT | 사용자 조회 조건 기본값 | 추정 | 테이블명 분해 |
| TB_MCM_SEC_USER_START_PGM | 사용자 시작 프로그램 | 추정 | 테이블명 분해 |
| TB_MCM_SEC_USER_WIDGET | 사용자 위젯 | 추정 | 테이블명 분해 |
| TB_MCM_SEC_USER_WIDGET_CHAT | 사용자 위젯 채팅 | 추정 | 테이블명 분해 |
| TB_MCM_SEC_USER_WIDGET_MEMO | 사용자 위젯 메모 | 추정 | 테이블명 분해 |
| TB_MCM_SEC_USER_WIDGET_TAB | 사용자 위젯 탭 | 추정 | 테이블명 분해 |
| TB_MCM_WIDGET_DEF | 위젯 정의 | 추정 | 테이블명 분해 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | 위젯 기본 레이아웃 | 추정 | 테이블명 분해 |
| TB_MCM_WIDGET_DEFAULT_TAB | 위젯 기본 탭 | 추정 | 테이블명 분해 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | 위젯 기본 탭 항목 | 추정 | 테이블명 분해 |
| TB_MCM_WIDGET_MEDIA | 위젯 미디어 | 추정 | 테이블명 분해 |
| TB_SEC_AUDIT_LOG | 감사 로그 | 추정 | 테이블명 분해 |
| TB_SEC_CODE_CATEGORY | 코드 분류 | 추정 | 테이블명 분해 |
| TB_SEC_CODE_GROUP | 코드 그룹 | 추정 | 테이블명 분해 |
| TB_SEC_CODE_ITEM | 코드 항목 | 추정 | 테이블명 분해 |
| TB_SEC_KEY_STORE | 키 저장소 | 추정 | 테이블명 분해 |
| TB_SEC_LOGIN_LOG | 로그인 로그 | 추정 | 테이블명 분해 |
| TB_SEC_REVOKED_TOKEN | 폐기 토큰 | 추정 | 테이블명 분해 |
| TB_SEC_SCREEN_USAGE_DAY | 화면 사용 일별 통계 | 추정 | 테이블명 분해 |
| TB_SEC_SCREEN_USAGE_LOG | 화면 사용 로그 | 추정 | 테이블명 분해 |
| TB_SEC_USER | 사용자 | 추정 | 테이블명 분해 |

### 칼럼

| 테이블 | 칼럼 | 이름 | 근거 | 상세 |
|---|---|---|---|---|
| SAMPLE_MASTER_CODE | CODE_GROUP | 코드 그룹 | 추정 | 물리명 분해 |
| SAMPLE_MASTER_CODE | CODE_VALUE | 코드 값 | 추정 | 물리명 분해 |
| SAMPLE_MASTER_CODE | ID | 아이디 | 사전 | MDM 사전 |
| SAMPLE_MASTER_CODE | LABEL | 라벨 | 추정 | 물리명 분해 |
| SAMPLE_MASTER_CODE | SORT_ORDER | 정렬 순서 | 추정 | 물리명 분해 |
| SAMPLE_MASTER_CODE | USE_YN | 사용 여부 | 사전 | MDM 사전 |
| SAMPLE_NOTICE | ACTIVE | 활성 여부 | 추정 | 물리명 분해 |
| SAMPLE_NOTICE | CONTENT | 본문 | 화면 | src/frontend/m-mcm/page-components/lsh/noticeMgmt/api.ts:57 |
| SAMPLE_NOTICE | ID | 아이디 | 사전 | MDM 사전 |
| SAMPLE_NOTICE | TITLE | 제목 | 사전 | MDM 사전 |
| TB_MCM_CODE_CATEGORY | CATEGORY_ID | 카테고리 아이디 | 화면 | src/frontend/m-mcm/page-components/cma/masterCategoryMng/types.ts:16 |
| TB_MCM_CODE_CATEGORY | CATEGORY_NM | 카테고리명 | 화면 | src/frontend/m-mcm/page-components/cma/masterCategoryMng/types.ts:18 |
| TB_MCM_CODE_CATEGORY | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_CODE_CATEGORY | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_CATEGORY | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_CATEGORY | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_CATEGORY | MASTER_CODE | 마스터 코드 | 추정 | 물리명 분해 |
| TB_MCM_CODE_CATEGORY | SORT_SEQ | 정렬 순번 | 사전 | MDM 사전 |
| TB_MCM_CODE_CATEGORY | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_CODE_CATEGORY | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_CATEGORY | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_CATEGORY | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_CATEGORY | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_CODE_DETAIL | CATEGORY_ID | 카테고리 아이디 | 화면 | src/frontend/m-mcm/page-components/cma/masterCategoryMng/types.ts:16 |
| TB_MCM_CODE_DETAIL | CODE_VAL_DESC | 코드 값 설명 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL_MEAN | 코드 의미 | 화면 | src/frontend/m-mcm/page-components/cma/masterCodeMng/page.tsx:226 |
| TB_MCM_CODE_DETAIL | CODE_VAL_REF1 | 코드 값 참조1 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL_REF2 | 코드 값 참조2 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL_REF3 | 코드 값 참조3 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL_REF4 | 코드 값 참조4 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL_REF5 | 코드 값 참조5 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL_REMARK | 코드 값 비고 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL | 코드 값 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VER | 코드 버전 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_CODE_DETAIL | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_DETAIL | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_DETAIL | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_DETAIL | MASTER_CODE | 마스터 코드 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | SORT_SEQ | 정렬 순번 | 사전 | MDM 사전 |
| TB_MCM_CODE_DETAIL | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_CODE_DETAIL | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_DETAIL | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_DETAIL | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_DETAIL | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_CODE_MASTER | CODE_CHARACTER | 코드 특성 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | CODE_DESC | 코드 설명 | 화면 | src/frontend/m-mcm/page-components/cma/masterCodeMng/page.tsx:103 |
| TB_MCM_CODE_MASTER | CODE_ID | 코드 아이디 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | CODE_NM | 코드 이름 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_CODE_MASTER | CODE_OWNER_DEPT_NM | 코드 담당 부서명 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_CODE_MASTER | CODE_OWNER_EMP_NO | 코드 담당 사원번호 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_CODE_MASTER | CODE_VER | 코드 버전 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_CODE_MASTER | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_MASTER | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_MASTER | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_MASTER | END_ACTIVE_DATE | 유효 종료일 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF1 | 마스터 코드 참조1 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF2 | 마스터 코드 참조2 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF3 | 마스터 코드 참조3 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF4 | 마스터 코드 참조4 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF5 | 마스터 코드 참조5 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE | 마스터 코드 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | START_ACTIVE_DATE | 유효 시작일 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1249 |
| TB_MCM_CODE_MASTER | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_CODE_MASTER | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_CODE_MASTER | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_MASTER | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_MASTER | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_CODE_MASTER | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_DEPT_INFO | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_DEPT_INFO | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_DEPT_INFO | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_DEPT_INFO | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_DEPT_INFO | DEPT_CD | 부서 코드 | 사전 | MDM 사전 |
| TB_MCM_DEPT_INFO | DEPT_NM_EN | 부서 영문 명 | 추정 | 물리명 분해 |
| TB_MCM_DEPT_INFO | DEPT_NM | 부서 명 | 사전 | MDM 사전 |
| TB_MCM_DEPT_INFO | END_ACTIVE_DATE | 유효 종료일 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_DEPT_INFO | START_ACTIVE_DATE | 유효 시작일 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1249 |
| TB_MCM_DEPT_INFO | UPPER_DEPT_CD | 상위 부서 코드 | 코드 | mcm-core/.../entity/DeptInfo.java:63 |
| TB_MCM_DEPT_INFO | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_DEPT_INFO | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_DEPT_INFO | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_DEPT_INFO | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_DEPT_INFO | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_DEPT_INFO | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_JOB_COLLECT_DATA | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_JOB_COLLECT_DATA | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_COLLECT_DATA | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_COLLECT_DATA | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_COLLECT_DATA | ITEM_KEY | 항목 키 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/CollectDataPanel.tsx:35 |
| TB_MCM_JOB_COLLECT_DATA | JOB_ID | 작업 아이디 | 사전 | MDM 사전 |
| TB_MCM_JOB_COLLECT_DATA | SLOT | 수집 회차 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/CollectDataPanel.tsx:126 |
| TB_MCM_JOB_COLLECT_DATA | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_JOB_COLLECT_DATA | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_COLLECT_DATA | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_COLLECT_DATA | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_COLLECT_DATA | VALUE_NUM | 숫자 값 | 코드 | m-mcm/page-components/csa/jobSchedMng/collect-data.test.ts:13 |
| TB_MCM_JOB_COLLECT_DATA | VALUE_TXT | 글자 값 | 코드 | m-mcm/page-components/csa/jobSchedMng/collect-data.test.ts:13 |
| TB_MCM_JOB_COLLECT_DATA | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_JOB_DEF | ACTION | 수행 동작 | 추정 | 물리명 분해 |
| TB_MCM_JOB_DEF | CONFIG_JSON | 설정 JSON | 추정 | 물리명 분해 |
| TB_MCM_JOB_DEF | CRON_EXPR | 크론 표현식 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/JobListPanel.tsx:28 |
| TB_MCM_JOB_DEF | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_JOB_DEF | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_DEF | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_DEF | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_DEF | JOB_DESC | 작업 설명 | 추정 | 물리명 분해 |
| TB_MCM_JOB_DEF | JOB_ID | 작업 아이디 | 사전 | MDM 사전 |
| TB_MCM_JOB_DEF | JOB_KIND | 작업 유형 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/page.tsx:464 |
| TB_MCM_JOB_DEF | JOB_NM | 작업 명 | 사전 | MDM 사전 |
| TB_MCM_JOB_DEF | MISFIRE_RUN_YN | 미실행 건 보충 실행 여부 | 추정 | 물리명 분해 |
| TB_MCM_JOB_DEF | MODULE_CD | 모듈 코드 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/JobListPanel.tsx:16 |
| TB_MCM_JOB_DEF | NEXT_RUN_AT | 다음 실행 일시 | 추정 | 물리명 분해 |
| TB_MCM_JOB_DEF | OPTS_JSON | 옵션 JSON | 추정 | 물리명 분해 |
| TB_MCM_JOB_DEF | OWNER_TP | 소유 구분 | 추정 | 물리명 분해 |
| TB_MCM_JOB_DEF | SERVICE_ID | 서비스 아이디 | 추정 | 물리명 분해 |
| TB_MCM_JOB_DEF | TIMEOUT_SEC | 제한 시간 초 | 추정 | 물리명 분해 |
| TB_MCM_JOB_DEF | USE_YN | 사용 여부 | 사전 | MDM 사전 |
| TB_MCM_JOB_DEF | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_JOB_DEF | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_DEF | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_DEF | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_DEF | VARS_JSON | 변수 JSON | 추정 | 물리명 분해 |
| TB_MCM_JOB_DEF | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_JOB_HANDLER | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_JOB_HANDLER | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_HANDLER | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_HANDLER | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_HANDLER | DEFAULT_CRON | 기본 크론 표현식 | 추정 | 물리명 분해 |
| TB_MCM_JOB_HANDLER | HANDLER_ID | 핸들러 아이디 | 추정 | 물리명 분해 |
| TB_MCM_JOB_HANDLER | HANDLER_NM | 핸들러 명 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/KindEditors.tsx:50 |
| TB_MCM_JOB_HANDLER | MODULE_CD | 모듈 코드 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/JobListPanel.tsx:16 |
| TB_MCM_JOB_HANDLER | SEEN_AT | 확인 일시 | 추정 | 물리명 분해 |
| TB_MCM_JOB_HANDLER | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_JOB_HANDLER | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_HANDLER | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_HANDLER | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_HANDLER | VARS_JSON | 변수 JSON | 추정 | 물리명 분해 |
| TB_MCM_JOB_HANDLER | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_JOB_RUN | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_JOB_RUN | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_RUN | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_RUN | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_RUN | ENDED_AT | 종료 일시 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/HistoryPanel.tsx:18 |
| TB_MCM_JOB_RUN | ITEM_CNT | 건수 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/HistoryPanel.tsx:20 |
| TB_MCM_JOB_RUN | JOB_ID | 작업 아이디 | 사전 | MDM 사전 |
| TB_MCM_JOB_RUN | MODULE_CD | 모듈 코드 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/JobListPanel.tsx:16 |
| TB_MCM_JOB_RUN | MSG | 메시지 | 사전 | MDM 사전 |
| TB_MCM_JOB_RUN | REQ_USR_ID | 요청자 아이디 | 추정 | 물리명 분해 |
| TB_MCM_JOB_RUN | RUN_ID | 실행 아이디 | 추정 | 물리명 분해 |
| TB_MCM_JOB_RUN | SCHED_AT | 예정 일시 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/HistoryPanel.tsx:12 |
| TB_MCM_JOB_RUN | SERVER_NM | 실행 서버 명 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/HistoryPanel.tsx:15 |
| TB_MCM_JOB_RUN | SERVICE_ID | 서비스 아이디 | 추정 | 물리명 분해 |
| TB_MCM_JOB_RUN | SERVICE_TAG | 서비스 태그 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/HistoryPanel.tsx:16 |
| TB_MCM_JOB_RUN | STARTED_AT | 시작 일시 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/HistoryPanel.tsx:17 |
| TB_MCM_JOB_RUN | STATUS | 상태 | 화면 | src/frontend/m-mcm/page-components/csa/jobSchedMng/HistoryPanel.tsx:14 |
| TB_MCM_JOB_RUN | TIMEOUT_SEC | 제한 시간 초 | 추정 | 물리명 분해 |
| TB_MCM_JOB_RUN | TRIGGER_TP | 기동 구분 | 추정 | 물리명 분해 |
| TB_MCM_JOB_RUN | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_JOB_RUN | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_RUN | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_RUN | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_JOB_RUN | VARS_JSON | 변수 JSON | 추정 | 물리명 분해 |
| TB_MCM_JOB_RUN | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_MOM_FORMAT_LAYOUT | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_FORMAT_LAYOUT | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_FORMAT_LAYOUT | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_FORMAT_LAYOUT | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_FORMAT_LAYOUT | DATA_DECIMAL_PREC | 소수점 이하 길이 | 코드 | src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/dmom/format/FormatItem.java:12 |
| TB_MCM_MOM_FORMAT_LAYOUT | DATA_LEN | 데이터 전체 길이 | 코드 | src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/dmom/format/FormatItem.java:11 |
| TB_MCM_MOM_FORMAT_LAYOUT | DATA_TP | 데이터 구분 | 사전 | MDM 사전 |
| TB_MCM_MOM_FORMAT_LAYOUT | FORMAT_ID | 포맷 아이디 | 추정 | 물리명 분해 |
| TB_MCM_MOM_FORMAT_LAYOUT | FORMAT_VER | 포맷 버전 | 추정 | 물리명 분해 |
| TB_MCM_MOM_FORMAT_LAYOUT | ITEM_ID | 항목 아이디 | 사전 | MDM 사전 |
| TB_MCM_MOM_FORMAT_LAYOUT | ITEM_NM | 항목 명 | 추정 | 물리명 분해 |
| TB_MCM_MOM_FORMAT_LAYOUT | ITEM_SEQ | 항목 순번 | 사전 | MDM 사전 |
| TB_MCM_MOM_FORMAT_LAYOUT | ITEM_TP | 항목 구분 | 사전 | MDM 사전 |
| TB_MCM_MOM_FORMAT_LAYOUT | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_FORMAT_LAYOUT | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_FORMAT_LAYOUT | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_FORMAT_LAYOUT | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_FORMAT_LAYOUT | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_MOM_FORMAT_LIST | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_FORMAT_LIST | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_FORMAT_LIST | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_FORMAT_LIST | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_FORMAT_LIST | END_ACTIVE_DATE | 유효 종료일 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_MOM_FORMAT_LIST | FORMAT_DESC | 포맷 설명 | 추정 | 물리명 분해 |
| TB_MCM_MOM_FORMAT_LIST | FORMAT_ID | 포맷 아이디 | 추정 | 물리명 분해 |
| TB_MCM_MOM_FORMAT_LIST | FORMAT_NM | 포맷 명 | 추정 | 물리명 분해 |
| TB_MCM_MOM_FORMAT_LIST | FORMAT_VER | 포맷 버전 | 추정 | 물리명 분해 |
| TB_MCM_MOM_FORMAT_LIST | START_ACTIVE_DATE | 유효 시작일 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1249 |
| TB_MCM_MOM_FORMAT_LIST | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_MOM_FORMAT_LIST | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_FORMAT_LIST | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_FORMAT_LIST | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_FORMAT_LIST | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_FORMAT_LIST | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_MOM_INTERFACES | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_INTERFACES | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_INTERFACES | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_INTERFACES | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_INTERFACES | END_ACTIVE_DATE | 유효 종료일 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_MOM_INTERFACES | FORMAT_ID | 포맷 아이디 | 추정 | 물리명 분해 |
| TB_MCM_MOM_INTERFACES | INTERFACE_DESC | 인터페이스 설명 | 추정 | 물리명 분해 |
| TB_MCM_MOM_INTERFACES | INTERFACE_ID | 인터페이스 아이디 | 추정 | 물리명 분해 |
| TB_MCM_MOM_INTERFACES | INTERFACE_PROTOCOL | 인터페이스 프로토콜 | 추정 | 물리명 분해 |
| TB_MCM_MOM_INTERFACES | RECV_IF_TP | 수신 인터페이스 구분 | 추정 | 물리명 분해 |
| TB_MCM_MOM_INTERFACES | RECV_MODULE_ID | 수신 모듈 아이디 | 추정 | 물리명 분해 |
| TB_MCM_MOM_INTERFACES | RECV_TABLE_ID | 수신 테이블 아이디 | 추정 | 물리명 분해 |
| TB_MCM_MOM_INTERFACES | RECV_WORKS_CD | 수신 작업장 코드 | 추정 | 물리명 분해 |
| TB_MCM_MOM_INTERFACES | SEND_IF_TP | 송신 인터페이스 구분 | 추정 | 물리명 분해 |
| TB_MCM_MOM_INTERFACES | SEND_MODULE_ID | 송신 모듈 아이디 | 코드 | caravan-core/README.md:521 |
| TB_MCM_MOM_INTERFACES | SEND_TABLE_ID | 송신 테이블 아이디 | 추정 | 물리명 분해 |
| TB_MCM_MOM_INTERFACES | SEND_WORKS_CD | 송신 작업장 코드 | 추정 | 물리명 분해 |
| TB_MCM_MOM_INTERFACES | START_ACTIVE_DATE | 유효 시작일 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1249 |
| TB_MCM_MOM_INTERFACES | TRANSACTION_CODE | 트랜잭션 코드 | 추정 | 물리명 분해 |
| TB_MCM_MOM_INTERFACES | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_MOM_INTERFACES | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_INTERFACES | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_INTERFACES | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_INTERFACES | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_INTERFACES | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_MOM_TC_ERROR | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_TC_ERROR | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_ERROR | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_ERROR | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_ERROR | ERROR_CODE | 오류 코드 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_ERROR | ERROR_MSG | 오류 메시지 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_ERROR | ERROR_STATUS_CODE | 오류 상태 코드 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_ERROR | ERROR_TYPE | 오류 유형 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_ERROR | INTERFACE_ID | 인터페이스 아이디 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_ERROR | INTERFACE_MSG | 인터페이스 메시지 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_ERROR | INTERFACE_PROTOCOL | 인터페이스 프로토콜 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_ERROR | KEY_DATA1 | 키 데이터1 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_ERROR | KEY_DATA2 | 키 데이터2 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_ERROR | KEY_DATA3 | 키 데이터3 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_ERROR | SQ_VAL | 일련 번호 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_ERROR | TRANSACTION_CODE | 트랜잭션 코드 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_ERROR | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_TC_ERROR | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_ERROR | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_ERROR | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_ERROR | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_MOM_TC_LIST | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_TC_LIST | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_LIST | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_LIST | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_LIST | END_ACTIVE_DATE | 유효 종료일 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_MOM_TC_LIST | FORMAT_ID | 포맷 아이디 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_LIST | START_ACTIVE_DATE | 유효 시작일 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1249 |
| TB_MCM_MOM_TC_LIST | TRANSACTION_CODE | 트랜잭션 코드 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_LIST | TRANSACTION_DESC | 트랜잭션 설명 | 코드 | mcm-core/.../entity/MomTcList.java:37 |
| TB_MCM_MOM_TC_LIST | TRANSACTION_NM | 트랜잭션 명 | 코드 | mcm-core/.../entity/MomTcList.java:33 |
| TB_MCM_MOM_TC_LIST | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_MOM_TC_LIST | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_TC_LIST | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_LIST | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_LIST | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_LIST | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_MOM_TC_SEND | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_TC_SEND | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_SEND | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_SEND | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_SEND | ERR_SQ_VAL | 오류 일련 번호 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_SEND | INTERFACE_ID | 인터페이스 아이디 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_SEND | INTERFACE_MSG | 인터페이스 메시지 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_SEND | SEND_RESULT | 재전송 결과 | 코드 | mcm-core/.../entity/MomTcSend.java:59 |
| TB_MCM_MOM_TC_SEND | SEND_SQ_VAL | 송신 일련 번호 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_SEND | TRANSACTION_CODE | 트랜잭션 코드 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_SEND | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_TC_SEND | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_SEND | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_SEND | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_SEND | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_MOM_TC_SKIP | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_TC_SKIP | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_SKIP | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_SKIP | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_SKIP | END_ACTIVE_DATE | 유효 종료일 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_MOM_TC_SKIP | SKIP_LEVEL | 건너뛰기 수준 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_SKIP | START_ACTIVE_DATE | 유효 시작일 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1249 |
| TB_MCM_MOM_TC_SKIP | TRANSACTION_CODE | 트랜잭션 코드 | 추정 | 물리명 분해 |
| TB_MCM_MOM_TC_SKIP | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_MOM_TC_SKIP | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_MOM_TC_SKIP | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_SKIP | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_SKIP | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_MOM_TC_SKIP | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_NOTICE_TARGET | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_NOTICE_TARGET | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_NOTICE_TARGET | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_NOTICE_TARGET | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_NOTICE_TARGET | NOTICE_ID | 공지 번호 | 화면 | src/frontend/m-mcm/page-components/lsh/noticeMgmt/page.tsx:637 |
| TB_MCM_NOTICE_TARGET | ROLE_ID | 직무 아이디 | 사전 | MDM 사전 |
| TB_MCM_NOTICE_TARGET | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_NOTICE_TARGET | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_NOTICE_TARGET | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_NOTICE_TARGET | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_NOTICE_TARGET | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_NOTICE | CONTENT_FORMAT | 본문 형식 | 화면 | src/frontend/m-mcm/page-components/lsh/noticeMgmt/page.tsx:794 |
| TB_MCM_NOTICE | CONTENT | 본문 | 화면 | src/frontend/m-mcm/page-components/lsh/noticeMgmt/api.ts:57 |
| TB_MCM_NOTICE | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_NOTICE | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_NOTICE | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_NOTICE | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_NOTICE | NOTICE_CATEGORY | 공지 분류 | 화면 | src/frontend/m-mcm/page-components/lsh/noticeMgmt/page.tsx:680 |
| TB_MCM_NOTICE | NOTICE_ID | 공지 번호 | 화면 | src/frontend/m-mcm/page-components/lsh/noticeMgmt/page.tsx:637 |
| TB_MCM_NOTICE | NOTICE_STATUS | 게시 상태 | 화면 | src/frontend/m-mcm/page-components/lsh/noticeMgmt/notice-columns.tsx:72 |
| TB_MCM_NOTICE | PIN_YN | 상단 고정 여부 | 화면 | src/frontend/m-mcm/page-components/lsh/noticeMgmt/page.tsx:695 |
| TB_MCM_NOTICE | POST_END_DT | 게시 종료일 | 화면 | src/frontend/m-mcm/page-components/lsh/noticeMgmt/page.tsx:739 |
| TB_MCM_NOTICE | POST_START_DT | 게시 시작일 | 화면 | src/frontend/m-mcm/page-components/lsh/noticeMgmt/page.tsx:727 |
| TB_MCM_NOTICE | TARGET_SCOPE | 대상 범위 | 추정 | 물리명 분해 |
| TB_MCM_NOTICE | TITLE | 제목 | 사전 | MDM 사전 |
| TB_MCM_NOTICE | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_NOTICE | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_NOTICE | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_NOTICE | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_NOTICE | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_MENU_FLD | BIZ_SYSTEM_CODE | 업무 시스템 코드 | 추정 | 물리명 분해 |
| TB_MCM_SEC_MENU_FLD | FULL_SEQ | 전체 순번 | 추정 | 물리명 분해 |
| TB_MCM_SEC_MENU_FLD | MENU_ID | 메뉴 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_MENU_FLD | MENU_NM | 메뉴 명 | 사전 | MDM 사전 |
| TB_MCM_SEC_MENU_FLD | MENU_SEQ | 메뉴 순번 | 사전 | MDM 사전 |
| TB_MCM_SEC_MENU_FLD | MENU_TP | 메뉴 구분 | 추정 | 물리명 분해 |
| TB_MCM_SEC_MENU_FLD | MENU_VIEW_YN | 메뉴 표시 여부 | 추정 | 물리명 분해 |
| TB_MCM_SEC_MENU_FLD | PARENT_MENU_ID | 상위 메뉴 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_MENU_FLD | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_SEC_MENU | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_MENU | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_MENU | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_MENU | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_MENU | END_ACTIVE_DATE | 유효 종료일 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_SEC_MENU | FULL_SEQ | 전체 순번 | 추정 | 물리명 분해 |
| TB_MCM_SEC_MENU | MENU_DESC | 메뉴 설명 | 사전 | MDM 사전 |
| TB_MCM_SEC_MENU | MENU_ID | 메뉴 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_MENU | MENU_NM | 메뉴 명 | 사전 | MDM 사전 |
| TB_MCM_SEC_MENU | MENU_PARAM1 | 메뉴 파라미터1 | 추정 | 물리명 분해 |
| TB_MCM_SEC_MENU | MENU_PARAM2 | 메뉴 파라미터2 | 추정 | 물리명 분해 |
| TB_MCM_SEC_MENU | MENU_PARAM3 | 메뉴 파라미터3 | 추정 | 물리명 분해 |
| TB_MCM_SEC_MENU | MENU_SEQ | 메뉴 순번 | 사전 | MDM 사전 |
| TB_MCM_SEC_MENU | MENU_TP | 메뉴 구분 | 추정 | 물리명 분해 |
| TB_MCM_SEC_MENU | MENU_VIEW_YN | 메뉴 표시 여부 | 추정 | 물리명 분해 |
| TB_MCM_SEC_MENU | OBJECT_ID | 오브젝트 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_MENU | PARENT_MENU_ID | 상위 메뉴 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_MENU | START_ACTIVE_DATE | 유효 시작일 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1249 |
| TB_MCM_SEC_MENU | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_SEC_MENU | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_MENU | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_MENU | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_MENU | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_MENU | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_OBJ | ACCESS_TP | 접근 구분 | 사전 | MDM 사전 |
| TB_MCM_SEC_OBJ | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_OBJ | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_OBJ | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_OBJ | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_OBJ | END_ACTIVE_DATE | 유효 종료일 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_SEC_OBJ | FORM_URL | 화면 URL | 추정 | 물리명 분해 |
| TB_MCM_SEC_OBJ | OBJECT_ID | 오브젝트 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_OBJ | OBJECT_NM | 오브젝트 명 | 사전 | MDM 사전 |
| TB_MCM_SEC_OBJ | OBJECT_TYPE | 오브젝트 유형 | 화면 | src/frontend/m-mcm/page-components/csa/commObjMng/page.tsx:142 |
| TB_MCM_SEC_OBJ | OUT_ACCESS_IP | 외부 접속 주소 | 화면 | src/frontend/m-mcm/page-components/csa/commObjMng/page.tsx:163 |
| TB_MCM_SEC_OBJ | PARAM | 파라미터 | 추정 | 물리명 분해 |
| TB_MCM_SEC_OBJ | PROGRAM_DESC | 프로그램 설명 | 화면 | src/frontend/m-mcm/page-components/csa/commObjMng/page.tsx:140 |
| TB_MCM_SEC_OBJ | SERVICE | 서비스 | 추정 | 물리명 분해 |
| TB_MCM_SEC_OBJ | START_ACTIVE_DATE | 유효 시작일 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1249 |
| TB_MCM_SEC_OBJ | SYSTEM_CODE | 시스템 코드 | 추정 | 물리명 분해 |
| TB_MCM_SEC_OBJ | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_SEC_OBJ | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_OBJ | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_OBJ | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_OBJ | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_OBJ | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_PERM | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_PERM | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_PERM | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_PERM | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_PERM | END_ACTIVE_DATE | 유효 종료일 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_SEC_PERM | PERMISSION_ACTION | 동작 권한 | 화면 | src/frontend/m-mcm/page-components/csa/commPermMng/page.tsx:191 |
| TB_MCM_SEC_PERM | PERMISSION_COMMON | 공통 버튼 권한 | 화면 | src/frontend/m-mcm/page-components/csa/commPermMng/page.tsx:188 |
| TB_MCM_SEC_PERM | PERMISSION_CUSTOM | 개별 버튼 권한 | 화면 | src/frontend/m-mcm/page-components/csa/commPermMng/page.tsx:189 |
| TB_MCM_SEC_PERM | PERMISSION_DESC | 권한 설명 | 추정 | 물리명 분해 |
| TB_MCM_SEC_PERM | PERMISSION_ID | 권한 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_PERM | PERMISSION_NM | 권한 명 | 추정 | 물리명 분해 |
| TB_MCM_SEC_PERM | POPUP_BTN | 팝업 버튼 | 화면 | src/frontend/m-mcm/page-components/csa/commPermMng/page.tsx:190 |
| TB_MCM_SEC_PERM | START_ACTIVE_DATE | 유효 시작일 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1249 |
| TB_MCM_SEC_PERM | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_SEC_PERM | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_PERM | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_PERM | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_PERM | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_PERM | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLEGROUP_MAPPING | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_ROLEGROUP_MAPPING | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLEGROUP_MAPPING | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLEGROUP_MAPPING | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLEGROUP_MAPPING | ROLE_GROUP_ID | 역할 그룹 아이디 | 화면 | src/frontend/m-mcm/page-components/csa/commRoleGrpMng/page.tsx:231 |
| TB_MCM_SEC_ROLEGROUP_MAPPING | ROLE_ID | 직무 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLEGROUP_MAPPING | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_ROLEGROUP_MAPPING | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLEGROUP_MAPPING | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLEGROUP_MAPPING | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLEGROUP_MAPPING | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLEGROUP | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_ROLEGROUP | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLEGROUP | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLEGROUP | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLEGROUP | END_ACTIVE_DATE | 유효 종료일 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_SEC_ROLEGROUP | ROLE_GROUP_DESC | 역할 그룹 설명 | 화면 | src/frontend/m-mcm/page-components/csa/commRoleGrpMng/page.tsx:175 |
| TB_MCM_SEC_ROLEGROUP | ROLE_GROUP_ID | 역할 그룹 아이디 | 화면 | src/frontend/m-mcm/page-components/csa/commRoleGrpMng/page.tsx:231 |
| TB_MCM_SEC_ROLEGROUP | ROLE_GROUP_NM | 역할 그룹 명 | 화면 | src/frontend/m-mcm/page-components/csa/commRoleGrpMng/page.tsx:174 |
| TB_MCM_SEC_ROLEGROUP | START_ACTIVE_DATE | 유효 시작일 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1249 |
| TB_MCM_SEC_ROLEGROUP | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLEGROUP | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_ROLEGROUP | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLEGROUP | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLEGROUP | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLEGROUP | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLE_MAPPING | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_ROLE_MAPPING | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLE_MAPPING | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLE_MAPPING | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLE_MAPPING | OBJECT_ID | 오브젝트 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLE_MAPPING | PERMISSION_ID | 권한 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_ROLE_MAPPING | ROLE_ID | 직무 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLE_MAPPING | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_ROLE_MAPPING | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLE_MAPPING | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLE_MAPPING | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLE_MAPPING | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLE | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_ROLE | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLE | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLE | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLE | END_ACTIVE_DATE | 유효 종료일 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_SEC_ROLE | MENU_ID | 메뉴 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLE | PARENT_ROLE_ID | 부모 역할 아이디 | 화면 | src/frontend/m-mcm/page-components/csa/commRoleGrpMng/page.tsx:206 |
| TB_MCM_SEC_ROLE | ROLE_DESC | 직무 설명 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLE | ROLE_ID | 직무 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLE | ROLE_NM | 직무 명 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLE | START_ACTIVE_DATE | 유효 시작일 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1249 |
| TB_MCM_SEC_ROLE | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_SEC_ROLE | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_ROLE | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLE | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLE | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_ROLE | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER | BOTTOM_MSG_YN | 하단 메시지 표시 여부 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_USER | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER | DEPT_CD | 부서 코드 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER | EMAIL | 이메일 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER | END_ACTIVE_DATE | 유효 종료일 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MCM_SEC_USER | EXCEL_TP | 엑셀 구분 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER | GROUP_ID1 | 그룹 아이디1 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER | GROUP_ID2 | 그룹 아이디2 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER | GROUP_ID3 | 그룹 아이디3 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER | IN_OUT_EMP_TP | 내부 외부 구분 | 화면 | src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx:1149 |
| TB_MCM_SEC_USER | MENU_TP | 메뉴 구분 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER | MOBILE_TEL_NO | 휴대 전화 번호 | 화면 | src/frontend/m-mcm/page-components/csa/commUserMng/page.tsx:234 |
| TB_MCM_SEC_USER | PWD_FAIL_COUNT | 비밀번호 실패 횟수 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER | SSO_ID | SSO 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER | START_ACTIVE_DATE | 유효 시작일 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1249 |
| TB_MCM_SEC_USER | TEL_NO | 전화 번호 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER | THEME_TP | 테마 구분 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER | USER_CATEGORY_CD | 사용자 분류 코드 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER | USER_EMP_NO | 사용자 사원 번호 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER | USER_NM | 사용자 명 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER | USE_TP | 사용 구분 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙 (동일 물리명 통일) |
| TB_MCM_SEC_USER | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | FVT_FOLD_ID | 즐겨찾기 폴더 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | FVT_FOLD_NM | 즐겨찾기 폴더 명 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | FVT_FOLD_SEQ | 즐겨찾기 폴더 순번 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE_FOLD | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_FAVORITE | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE | FULL_ID | 전체 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_FAVORITE | FVT_FOLD_ID | 즐겨찾기 폴더 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_FAVORITE | FVT_SEQ | 즐겨찾기 순번 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_FAVORITE | MENU_ID | 메뉴 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_FAVORITE | MENU_SEQ | 메뉴 순번 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_FAVORITE | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_FAVORITE | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_FAVORITE | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_HIS | ACTIVE_DT | 활성일자 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_HIS | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_HIS | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_HIS | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_HIS | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_HIS | DESCRIPTION | 설명 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_HIS | INF_REQ_NO | 인터페이스 요청 번호 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_HIS | PROC_CASE | 처리 건 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_HIS | PROC_TYPE | 처리 유형 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_HIS | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_HIS | USER_NM | 사용자 명 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_HIS | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_HIS | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_HIS | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_HIS | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_HIS | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_MAPPING | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_MAPPING | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_MAPPING | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_MAPPING | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_MAPPING | ROLE_GROUP_ID | 역할 그룹 아이디 | 화면 | src/frontend/m-mcm/page-components/csa/commRoleGrpMng/page.tsx:231 |
| TB_MCM_SEC_USER_MAPPING | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_MAPPING | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_MAPPING | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_MAPPING | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_MAPPING | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_MAPPING | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_PWD | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_PWD | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_PWD | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_PWD | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_PWD | LAST_PWD_CHNG_DATE | 마지막 비밀번호 변경일자 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_PWD | SALT | 비밀번호 솔트 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1260 |
| TB_MCM_SEC_USER_PWD | TEMP_PWD_EXPIRATION_DATE | 임시 비밀번호 만료일시 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1263 |
| TB_MCM_SEC_USER_PWD | USER_ENC_PWD | 사용자 암호화 비밀번호 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1259 |
| TB_MCM_SEC_USER_PWD | USER_ENC_TEMP_PWD | 임시 비밀번호 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1262 |
| TB_MCM_SEC_USER_PWD | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_PWD | USER_SSO_PWD | SSO 비밀번호 | 코드 | src/backend/cactus-core/docs/AS-IS/CACTUS_SECURITY.md:1261 |
| TB_MCM_SEC_USER_PWD | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_PWD | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_PWD | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_PWD | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_PWD | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_ROLL_HIS | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_ROLL_HIS | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_ROLL_HIS | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_ROLL_HIS | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_ROLL_HIS | DESCRIPTION | 설명 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_ROLL_HIS | INF_REQ_NO | 인터페이스 요청 번호 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_ROLL_HIS | OP_SUMUP_DT | 조업 집계일자 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_ROLL_HIS | RESP_GBN | 응답 구분 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_ROLL_HIS | ROLE_GROUP_ID | 역할 그룹 아이디 | 화면 | src/frontend/m-mcm/page-components/csa/commRoleGrpMng/page.tsx:231 |
| TB_MCM_SEC_USER_ROLL_HIS | ROLE_GROUP_NM | 역할 그룹 명 | 화면 | src/frontend/m-mcm/page-components/csa/commRoleGrpMng/page.tsx:174 |
| TB_MCM_SEC_USER_ROLL_HIS | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_ROLL_HIS | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_ROLL_HIS | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_ROLL_HIS | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_ROLL_HIS | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_ROLL_HIS | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_ROLL_HIS | WORKS_CODE | 업무 코드 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_SRCH_DFLT | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_SRCH_DFLT | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_SRCH_DFLT | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_SRCH_DFLT | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_SRCH_DFLT | FIELD_KEY | 필드 키 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_SRCH_DFLT | FIELD_LABEL | 필드 라벨 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_SRCH_DFLT | FIELD_META | 필드 메타 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_SRCH_DFLT | PAGE_ID | 페이지 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_SRCH_DFLT | RULE_JSON | 규칙 JSON | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_SRCH_DFLT | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_SRCH_DFLT | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_SRCH_DFLT | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_SRCH_DFLT | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_SRCH_DFLT | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_SRCH_DFLT | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_START_PGM | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_START_PGM | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_START_PGM | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_START_PGM | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_START_PGM | FULL_ID | 전체 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_START_PGM | MENU_ID | 메뉴 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_START_PGM | MENU_SEQ | 메뉴 순번 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_START_PGM | START_SEQ | 시작 순번 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_START_PGM | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_START_PGM | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_START_PGM | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_START_PGM | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_START_PGM | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_START_PGM | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET_CHAT | CONTENT | 본문 | 화면 | src/frontend/m-mcm/page-components/lsh/noticeMgmt/api.ts:57 |
| TB_MCM_SEC_USER_WIDGET_CHAT | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_CHAT | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_CHAT | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_CHAT | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_CHAT | INST_ID | 인스턴스 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET_CHAT | LINKS_JSON | 링크 JSON | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET_CHAT | MSG_SEQ | 메시지 순번 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET_CHAT | ROLE_TP | 역할 유형 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET_CHAT | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET_CHAT | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_CHAT | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_CHAT | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_CHAT | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_CHAT | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET_MEMO | CONTENT | 본문 | 화면 | src/frontend/m-mcm/page-components/lsh/noticeMgmt/api.ts:57 |
| TB_MCM_SEC_USER_WIDGET_MEMO | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_MEMO | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_MEMO | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_MEMO | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_MEMO | DEF_ID | 정의 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET_MEMO | FMT | 형식 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET_MEMO | INST_ID | 인스턴스 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET_MEMO | TITLE | 제목 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET_MEMO | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET_MEMO | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_MEMO | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_MEMO | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_MEMO | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_MEMO | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET_TAB | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_TAB | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_TAB | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_TAB | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_TAB | LOCK_YN | 잠금 여부 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET_TAB | TAB_ID | 탭 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET_TAB | TAB_NM | 탭 명 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET_TAB | TAB_SEQ | 탭 표시 순서 | 코드 | mcm-core/.../widget/layout/entity/WidgetDefaultTab.java:36 |
| TB_MCM_SEC_USER_WIDGET_TAB | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET_TAB | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_TAB | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_TAB | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_TAB | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET_TAB | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET | CONFIG_JSON | 설정 JSON | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET | INST_ID | 인스턴스 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET | LOCK_YN | 잠금 여부 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET | POS_X | 가로 위치 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET | POS_Y | 세로 위치 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET | SIZE_H | 세로 크기 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET | SIZE_W | 가로 크기 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET | TAB_ID | 탭 아이디 | 추정 | 물리명 분해 |
| TB_MCM_SEC_USER_WIDGET | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_SEC_USER_WIDGET | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_SEC_USER_WIDGET | WIDGET_ID | 위젯 아이디 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | INST_ID | 인스턴스 아이디 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | LAYOUT_KEY | 레이아웃 키 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | LOCK_YN | 잠금 여부 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | POS_X | 가로 위치 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | POS_Y | 세로 위치 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | SIZE_H | 세로 크기 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | SIZE_W | 가로 크기 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_DEFAULT_LAYOUT | WIDGET_ID | 위젯 아이디 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | INST_ID | 인스턴스 아이디 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | LAYOUT_KEY | 레이아웃 키 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | LOCK_YN | 잠금 여부 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | POS_X | 가로 위치 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | POS_Y | 세로 위치 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | SIZE_H | 세로 크기 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | SIZE_W | 가로 크기 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | TAB_ID | 탭 아이디 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_DEFAULT_TAB_ITEM | WIDGET_ID | 위젯 아이디 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_DEFAULT_TAB | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB | LAYOUT_KEY | 레이아웃 키 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_TAB | TAB_ID | 탭 아이디 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_TAB | TAB_NM | 탭 명 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEFAULT_TAB | TAB_SEQ | 탭 표시 순서 | 코드 | mcm-core/.../widget/layout/entity/WidgetDefaultTab.java:36 |
| TB_MCM_WIDGET_DEFAULT_TAB | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEFAULT_TAB | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_DEF | CATEGORY_CD | 분류 | 화면 | src/frontend/m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:263 |
| TB_MCM_WIDGET_DEF | CONFIG_JSON | 설정 JSON | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEF | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEF | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEF | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEF | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEF | DATA_SRC | 데이터 출처 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_DEF | DEF_H | 기본 세로 | 화면 | src/frontend/m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:190 |
| TB_MCM_WIDGET_DEF | DEF_W | 기본 가로 | 화면 | src/frontend/m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:190 |
| TB_MCM_WIDGET_DEF | DESCRIPTION | 설명 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEF | LINK_PAGE_ID | 연결 화면 아이디 | 화면 | src/frontend/m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:239 |
| TB_MCM_WIDGET_DEF | MAX_H | 최대 세로 | 코드 | src/backend/mcm-core/src/main/java/com/dongkuk/dmes/mcm/widget/def/service/WidgetDefMaps.java:14 |
| TB_MCM_WIDGET_DEF | MAX_W | 최대 가로 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEF | MIN_H | 최소 세로 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEF | MIN_W | 최소 가로 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_DEF | MULTIPLE_YN | 여러 번 놓기 여부 | 화면 | src/frontend/m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:251 |
| TB_MCM_WIDGET_DEF | PLACE_TP | 배치 유형 | 화면 | src/frontend/m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:276 |
| TB_MCM_WIDGET_DEF | PRIVATE_YN | 비공개 여부 | 화면 | src/frontend/m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:300 |
| TB_MCM_WIDGET_DEF | REFRESH_SEC | 새로 고침(초) | 화면 | src/frontend/m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:222 |
| TB_MCM_WIDGET_DEF | SRC_TP | 위젯 구분 | 화면 | mcm-core/.../widget/admin/service/CommWidgetMngService.java:112 |
| TB_MCM_WIDGET_DEF | SUBTITLE | 부제 | 화면 | mcm-core/.../widget/admin/service/CommWidgetMngService.java:118 |
| TB_MCM_WIDGET_DEF | TITLE | 제목 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_DEF | TYPE_ID | 위젯 유형 아이디 | 화면 | mcm-core/.../widget/admin/service/CommWidgetMngService.java:142 |
| TB_MCM_WIDGET_DEF | USE_YN | 사용 여부 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_DEF | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEF | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEF | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEF | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_DEF | VER | 버전 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_DEF | WIDGET_ID | 위젯 아이디 | 사전 | MDM 사전 |
| TB_MCM_WIDGET_MEDIA | CONTENT_TYPE | 콘텐츠 유형 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_MEDIA | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_MEDIA | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_MEDIA | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_MEDIA | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_MEDIA | FILE_ID | 파일 아이디 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_MEDIA | FILE_SIZE | 파일 크기 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_MEDIA | ORIG_NM | 원본 명 | 추정 | 물리명 분해 |
| TB_MCM_WIDGET_MEDIA | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_MEDIA | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_MEDIA | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_MEDIA | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_MCM_WIDGET_MEDIA | VER | 버전 | 사전 | MDM 사전 |
| TB_SEC_AUDIT_LOG | ACTION | 수행 동작 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_SEC_AUDIT_LOG | ACTOR_USER_ID | 수행자 사용자 아이디 | 추정 | 물리명 분해 |
| TB_SEC_AUDIT_LOG | AFTER_JSON | 변경 후 JSON | 추정 | 물리명 분해 |
| TB_SEC_AUDIT_LOG | AUDIT_ID | 감사 아이디 | 추정 | 물리명 분해 |
| TB_SEC_AUDIT_LOG | BEFORE_JSON | 변경 전 JSON | 추정 | 물리명 분해 |
| TB_SEC_AUDIT_LOG | CLIENT_IP | 클라이언트 IP | 사전 | MDM 사전 |
| TB_SEC_AUDIT_LOG | OCCURRED_AT | 발생일시 | 추정 | 물리명 분해 |
| TB_SEC_AUDIT_LOG | TARGET_ID | 대상 아이디 | 추정 | 물리명 분해 |
| TB_SEC_AUDIT_LOG | TARGET_TYPE | 대상 유형 | 추정 | 물리명 분해 |
| TB_SEC_CODE_CATEGORY | CATEGORY_CD | 분류 | 화면 | src/frontend/m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:263 |
| TB_SEC_CODE_CATEGORY | CATEGORY_NM | 카테고리명 | 화면 | src/frontend/m-mcm/page-components/cma/masterCategoryMng/types.ts:18 |
| TB_SEC_CODE_CATEGORY | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_CATEGORY | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_CATEGORY | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_CATEGORY | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_CATEGORY | GROUP_CD | 그룹 코드 | 추정 | 물리명 분해 |
| TB_SEC_CODE_CATEGORY | SORT_ORD | 정렬 순서 | 추정 | 물리명 분해 |
| TB_SEC_CODE_CATEGORY | USE_YN | 사용 여부 | 사전 | MDM 사전 |
| TB_SEC_CODE_CATEGORY | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_CATEGORY | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_CATEGORY | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_CATEGORY | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_CATEGORY | VER | 버전 | 사전 | MDM 사전 |
| TB_SEC_CODE_GROUP | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_GROUP | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_GROUP | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_GROUP | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_GROUP | GROUP_CD | 그룹 코드 | 추정 | 물리명 분해 |
| TB_SEC_CODE_GROUP | GROUP_DESC | 그룹 설명 | 추정 | 물리명 분해 |
| TB_SEC_CODE_GROUP | GROUP_NM | 그룹 명 | 추정 | 물리명 분해 |
| TB_SEC_CODE_GROUP | USE_YN | 사용 여부 | 사전 | MDM 사전 |
| TB_SEC_CODE_GROUP | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_GROUP | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_GROUP | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_GROUP | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_GROUP | VER | 버전 | 사전 | MDM 사전 |
| TB_SEC_CODE_ITEM | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_ITEM | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_ITEM | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_ITEM | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_ITEM | EXTRA_VAL1 | 부가 값 1 | 추정 | 물리명 분해 |
| TB_SEC_CODE_ITEM | EXTRA_VAL2 | 부가 값 2 | 추정 | 물리명 분해 |
| TB_SEC_CODE_ITEM | GROUP_CD | 그룹 코드 | 추정 | 물리명 분해 |
| TB_SEC_CODE_ITEM | ITEM_CD | 항목 코드 | 추정 | 물리명 분해 |
| TB_SEC_CODE_ITEM | ITEM_DESC | 항목 설명 | 추정 | 물리명 분해 |
| TB_SEC_CODE_ITEM | ITEM_NM | 항목 명 | 추정 | 물리명 분해 |
| TB_SEC_CODE_ITEM | SORT_ORD | 정렬 순서 | 추정 | 물리명 분해 |
| TB_SEC_CODE_ITEM | USE_YN | 사용 여부 | 사전 | MDM 사전 |
| TB_SEC_CODE_ITEM | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_ITEM | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_ITEM | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_ITEM | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_CODE_ITEM | VER | 버전 | 사전 | MDM 사전 |
| TB_SEC_KEY_STORE | ACTIVE | 활성 여부 | 추정 | 물리명 분해 |
| TB_SEC_KEY_STORE | ALG | 알고리즘 | 추정 | 물리명 분해 |
| TB_SEC_KEY_STORE | CREATED_AT | 생성일시 | 추정 | 물리명 분해 |
| TB_SEC_KEY_STORE | EXPIRES_AT | 만료일시 | 추정 | 물리명 분해 |
| TB_SEC_KEY_STORE | KID | 키 아이디 | 추정 | 물리명 분해 |
| TB_SEC_KEY_STORE | PRIVATE_KEY | 개인 키 | 추정 | 물리명 분해 |
| TB_SEC_KEY_STORE | PUBLIC_KEY | 공개 키 | 추정 | 물리명 분해 |
| TB_SEC_KEY_STORE | SECRET | 비밀 키 | 추정 | 물리명 분해 |
| TB_SEC_LOGIN_LOG | CLIENT_IP | 클라이언트 IP | 사전 | MDM 사전 |
| TB_SEC_LOGIN_LOG | EVENT_TYPE | 이벤트 유형 | 추정 | 물리명 분해 |
| TB_SEC_LOGIN_LOG | LOG_ID | 로그 아이디 | 사전 | MDM 사전 |
| TB_SEC_LOGIN_LOG | OCCURRED_AT | 발생일시 | 추정 | 물리명 분해 |
| TB_SEC_LOGIN_LOG | USER_AGENT | 사용자 에이전트 | 추정 | 물리명 분해 |
| TB_SEC_LOGIN_LOG | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_SEC_REVOKED_TOKEN | EXPIRES_AT | 만료일시 | 추정 | 물리명 분해 |
| TB_SEC_REVOKED_TOKEN | JTI | 토큰 아이디 | 추정 | 물리명 분해 |
| TB_SEC_REVOKED_TOKEN | REVOKED_AT | 폐기일시 | 추정 | 물리명 분해 |
| TB_SEC_REVOKED_TOKEN | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_SEC_SCREEN_USAGE_DAY | DEPT_CD | 부서 코드 | 사전 | MDM 사전 |
| TB_SEC_SCREEN_USAGE_DAY | DURATION_MS | 이용 시간(ms) | 화면 | src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/overview-tab.ts:15 |
| TB_SEC_SCREEN_USAGE_DAY | OPEN_CNT | 열람 횟수 | 화면 | src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/overview-tab.ts:13 |
| TB_SEC_SCREEN_USAGE_DAY | PAGE_ID | 페이지 아이디 | 사전 | MDM 사전 |
| TB_SEC_SCREEN_USAGE_DAY | SEG_CNT | 구간 수 | 추정 | 물리명 분해 |
| TB_SEC_SCREEN_USAGE_DAY | USAGE_DT | 사용일자 | 추정 | 물리명 분해 |
| TB_SEC_SCREEN_USAGE_DAY | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_SEC_SCREEN_USAGE_LOG | CLIENT_IP | 클라이언트 IP | 사전 | MDM 사전 |
| TB_SEC_SCREEN_USAGE_LOG | CLIENT_SEG_ID | 클라이언트 구간 아이디 | 추정 | 물리명 분해 |
| TB_SEC_SCREEN_USAGE_LOG | DEPT_CD | 부서 코드 | 사전 | MDM 사전 |
| TB_SEC_SCREEN_USAGE_LOG | DURATION_MS | 이용 시간(ms) | 화면 | src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/overview-tab.ts:15 |
| TB_SEC_SCREEN_USAGE_LOG | ENDED_AT | 종료 일시 | 화면 | src/frontend/m-mcm/page-components/csa/screenUsageStat/tabs/HistoryTab.tsx:15 |
| TB_SEC_SCREEN_USAGE_LOG | PAGE_ID | 페이지 아이디 | 사전 | MDM 사전 |
| TB_SEC_SCREEN_USAGE_LOG | RECEIVED_AT | 수신일시 | 추정 | 물리명 분해 |
| TB_SEC_SCREEN_USAGE_LOG | STARTED_AT | 시작 시각 | 코드 | src/backend/cactus-core/docs/12-요청로그DB저장_미개발.md:45 |
| TB_SEC_SCREEN_USAGE_LOG | START_KIND | 시작 종류 | 추정 | 물리명 분해 |
| TB_SEC_SCREEN_USAGE_LOG | USAGE_ID | 사용 아이디 | 추정 | 물리명 분해 |
| TB_SEC_SCREEN_USAGE_LOG | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_SEC_USER | C_AT | 생성일시 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_USER | C_PGM_ID | 생성 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_USER | C_SVC_ID | 생성 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_USER | C_USR_ID | 생성자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_USER | DEPT_CD | 부서 코드 | 사전 | MDM 사전 |
| TB_SEC_USER | LOCK_YN | 잠금 여부 | 사전 | MDM 사전 |
| TB_SEC_USER | PASS_INIT_YN | 비밀번호 초기화 여부 | 추정 | 물리명 분해 |
| TB_SEC_USER | PASS_SET_DD | 비밀번호 설정일자 | 추정 | 물리명 분해 |
| TB_SEC_USER | TRY_CNT | 로그인 실패 횟수 | 코드 | src/backend/cactus-core/docs/04-인증보안JWT_개발완료.md:101 |
| TB_SEC_USER | USER_ID | 사용자 아이디 | 사전 | MDM 사전 |
| TB_SEC_USER | USER_NM | 사용자 명 | 사전 | MDM 사전 |
| TB_SEC_USER | USER_NO | 사용자 번호 | 사전 | MDM 사전 |
| TB_SEC_USER | USER_PASS | 사용자 비밀번호 | 추정 | 물리명 분해 |
| TB_SEC_USER | USE_YN | 사용 여부 | 사전 | MDM 사전 |
| TB_SEC_USER | U_AT | 수정일시 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_USER | U_PGM_ID | 수정 프로그램 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_USER | U_SVC_ID | 수정 서비스 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_USER | U_USR_ID | 수정자 아이디 | 코드 | 공통 칼럼 규칙 |
| TB_SEC_USER | VALID_END_DD | 유효 종료일자 | 추정 | 물리명 분해 |
| TB_SEC_USER | VALID_STR_DD | 유효 시작일자 | 추정 | 물리명 분해 |
| TB_SEC_USER | VER | 버전 | 사전 | MDM 사전 |

## MCAAPUSER (V2, 칼럼 39·테이블 2)

파일: `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcaapuser/V2__column_comments.sql`

### 테이블

| 테이블 | 이름 | 근거 | 상세 |
|---|---|---|---|
| TB_MCA_RULE_COL_LIST | 업무기준 항목 목록 | 추정 | 물리명 분해 |
| TB_MCA_RULE_MASTER | 업무기준 마스터 | 추정 | 물리명 분해 |

### 칼럼

| 테이블 | 칼럼 | 이름 | 근거 | 상세 |
|---|---|---|---|---|
| TB_MCA_RULE_COL_LIST | COL_ID | 항목 영문명 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleFrame/types.ts:27 |
| TB_MCA_RULE_COL_LIST | COL_LEN | 총길이 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleFrame/types.ts:31 |
| TB_MCA_RULE_COL_LIST | COL_NM | 항목 한글명 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleFrame/types.ts:25 |
| TB_MCA_RULE_COL_LIST | COL_PREC_LEN | 소수점 길이 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleFrame/types.ts:33 |
| TB_MCA_RULE_COL_LIST | COL_SEQ | 열 순번 | 사전 |  |
| TB_MCA_RULE_COL_LIST | COL_TYPE | 항목 유형 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleFrame/types.ts:29 |
| TB_MCA_RULE_COL_LIST | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_COL_LIST | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_COL_LIST | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_COL_LIST | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_COL_LIST | IO_FLAG | 입출력 구분 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleFrame/types.ts:41 |
| TB_MCA_RULE_COL_LIST | MASTER_CODE_DIV | 코드 여부 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleFrame/types.ts:27 |
| TB_MCA_RULE_COL_LIST | MES_COL_ID | MES 항목 아이디 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleFrame/types.ts:44 |
| TB_MCA_RULE_COL_LIST | OLD_COL_ID | 이전 항목 아이디 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleFrame/types.ts:46 |
| TB_MCA_RULE_COL_LIST | RULE_ID | 업무기준 아이디 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleList/constants.ts:30 |
| TB_MCA_RULE_COL_LIST | RULE_VER | 업무기준 버전 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleFrame/types.ts:48 |
| TB_MCA_RULE_COL_LIST | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_COL_LIST | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_COL_LIST | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_COL_LIST | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_COL_LIST | VER | 버전 | 사전 |  |
| TB_MCA_RULE_MASTER | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_MASTER | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_MASTER | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_MASTER | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_MASTER | OLD_RULE_ID | 이전 업무기준 아이디 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleList/types.ts:28 |
| TB_MCA_RULE_MASTER | RULE_DESC | 업무기준 설명 | 추정 | 물리명 분해 |
| TB_MCA_RULE_MASTER | RULE_ID | 업무기준 아이디 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleList/constants.ts:30 |
| TB_MCA_RULE_MASTER | RULE_NM | 업무기준 명 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleList/constants.ts:31 |
| TB_MCA_RULE_MASTER | RULE_OWNER_DEPT_NM | 업무기준 담당 부서명 | 추정 | 물리명 분해 |
| TB_MCA_RULE_MASTER | RULE_OWNER_EMP_NO | 업무기준 담당 사원번호 | 코드 | mcm-core/.../masterRuleList/service/MasterRuleListService.java:80 |
| TB_MCA_RULE_MASTER | RULE_TP | 업무기준 유형 | 추정 | 물리명 분해 |
| TB_MCA_RULE_MASTER | RULE_VER | 업무기준 버전 | 화면 | src/frontend/m-mcm/page-components/cmb/masterRuleFrame/types.ts:48 |
| TB_MCA_RULE_MASTER | USE_TP | 사용 구분 | 사전 |  |
| TB_MCA_RULE_MASTER | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_MASTER | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_MASTER | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_MASTER | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCA_RULE_MASTER | VER | 버전 | 사전 |  |

## MCM_BACKUP (V2, 칼럼 38·테이블 2)

파일: `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcm_backup/V2__column_comments.sql`

### 테이블

| 테이블 | 이름 | 근거 | 상세 |
|---|---|---|---|
| TB_MCM_CODE_CATEGORY | 코드 카테고리 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | 코드 마스터 | 추정 | 물리명 분해 |

### 칼럼

| 테이블 | 칼럼 | 이름 | 근거 | 상세 |
|---|---|---|---|---|
| TB_MCM_CODE_CATEGORY | CATEGORY_ID | 카테고리 아이디 | 화면 | src/frontend/m-mcm/page-components/cma/masterCategoryMng/types.ts:16 |
| TB_MCM_CODE_CATEGORY | CATEGORY_NM | 카테고리 이름 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:51 |
| TB_MCM_CODE_CATEGORY | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | MASTER_CODE | 마스터 코드 | 추정 | 물리명 분해 |
| TB_MCM_CODE_CATEGORY | SORT_SEQ | 정렬 순번 | 사전 |  |
| TB_MCM_CODE_CATEGORY | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | VER | 버전 | 사전 |  |
| TB_MCM_CODE_MASTER | CODE_CHARACTER | 코드 특성 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:30 |
| TB_MCM_CODE_MASTER | CODE_DESC | 코드 설명 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:23 |
| TB_MCM_CODE_MASTER | CODE_ID | 코드 아이디 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:21 |
| TB_MCM_CODE_MASTER | CODE_NM | 코드 이름 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:22 |
| TB_MCM_CODE_MASTER | CODE_OWNER_DEPT_NM | 코드 담당 부서명 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:28 |
| TB_MCM_CODE_MASTER | CODE_OWNER_EMP_NO | 코드 담당 사원번호 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:29 |
| TB_MCM_CODE_MASTER | CODE_VER | 코드 버전 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:57 |
| TB_MCM_CODE_MASTER | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | END_ACTIVE_DATE | 유효 종료일 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:27 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF1 | 마스터 코드 참조1 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF2 | 마스터 코드 참조2 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF3 | 마스터 코드 참조3 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF4 | 마스터 코드 참조4 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF5 | 마스터 코드 참조5 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE | 마스터 코드 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | START_ACTIVE_DATE | 유효 시작일 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:26 |
| TB_MCM_CODE_MASTER | USE_TP | 사용 구분 | 사전 |  |
| TB_MCM_CODE_MASTER | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | VER | 버전 | 사전 |  |

## MCM_SOURCE (V2, 칼럼 60·테이블 3)

파일: `src/backend/mcm-core/src/main/resources/db/migration/oracle/mcm_source/V2__column_comments.sql`

### 테이블

| 테이블 | 이름 | 근거 | 상세 |
|---|---|---|---|
| TB_MCM_CODE_CATEGORY | 코드 카테고리 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | 코드 상세 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | 코드 마스터 | 추정 | 물리명 분해 |

### 칼럼

| 테이블 | 칼럼 | 이름 | 근거 | 상세 |
|---|---|---|---|---|
| TB_MCM_CODE_CATEGORY | CATEGORY_ID | 카테고리 아이디 | 화면 | src/frontend/m-mcm/page-components/cma/masterCategoryMng/types.ts:16 |
| TB_MCM_CODE_CATEGORY | CATEGORY_NM | 카테고리 이름 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:51 |
| TB_MCM_CODE_CATEGORY | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | MASTER_CODE | 마스터 코드 | 추정 | 물리명 분해 |
| TB_MCM_CODE_CATEGORY | SORT_SEQ | 정렬 순번 | 사전 |  |
| TB_MCM_CODE_CATEGORY | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_CATEGORY | VER | 버전 | 사전 |  |
| TB_MCM_CODE_DETAIL | CATEGORY_ID | 카테고리 아이디 | 화면 | src/frontend/m-mcm/page-components/cma/masterCategoryMng/types.ts:16 |
| TB_MCM_CODE_DETAIL | CODE_VAL_DESC | 코드 값 설명 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:56 |
| TB_MCM_CODE_DETAIL | CODE_VAL_MEAN | 코드 값 의미 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:55 |
| TB_MCM_CODE_DETAIL | CODE_VAL_REF1 | 코드 값 참조1 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL_REF2 | 코드 값 참조2 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL_REF3 | 코드 값 참조3 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL_REF4 | 코드 값 참조4 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL_REF5 | 코드 값 참조5 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL_REMARK | 코드 값 비고 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | CODE_VAL | 코드 값 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:54 |
| TB_MCM_CODE_DETAIL | CODE_VER | 코드 버전 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:57 |
| TB_MCM_CODE_DETAIL | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_DETAIL | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_DETAIL | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_DETAIL | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_DETAIL | MASTER_CODE | 마스터 코드 | 추정 | 물리명 분해 |
| TB_MCM_CODE_DETAIL | SORT_SEQ | 정렬 순번 | 사전 |  |
| TB_MCM_CODE_DETAIL | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_DETAIL | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_DETAIL | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_DETAIL | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_DETAIL | VER | 버전 | 사전 |  |
| TB_MCM_CODE_MASTER | CODE_CHARACTER | 코드 특성 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:30 |
| TB_MCM_CODE_MASTER | CODE_DESC | 코드 설명 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:23 |
| TB_MCM_CODE_MASTER | CODE_ID | 코드 아이디 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:21 |
| TB_MCM_CODE_MASTER | CODE_NM | 코드 이름 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:22 |
| TB_MCM_CODE_MASTER | CODE_OWNER_DEPT_NM | 코드 담당 부서명 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:28 |
| TB_MCM_CODE_MASTER | CODE_OWNER_EMP_NO | 코드 담당 사원번호 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:29 |
| TB_MCM_CODE_MASTER | CODE_VER | 코드 버전 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:57 |
| TB_MCM_CODE_MASTER | C_AT | 생성일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | C_PGM_ID | 생성 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | C_SVC_ID | 생성 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | C_USR_ID | 생성자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | END_ACTIVE_DATE | 유효 종료일 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:27 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF1 | 마스터 코드 참조1 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF2 | 마스터 코드 참조2 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF3 | 마스터 코드 참조3 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF4 | 마스터 코드 참조4 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE_REF5 | 마스터 코드 참조5 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | MASTER_CODE | 마스터 코드 | 추정 | 물리명 분해 |
| TB_MCM_CODE_MASTER | START_ACTIVE_DATE | 유효 시작일 | 화면 | src/frontend/m-mcm/page-components/cme/masterCodeMngList/types.ts:26 |
| TB_MCM_CODE_MASTER | USE_TP | 사용 구분 | 사전 |  |
| TB_MCM_CODE_MASTER | U_AT | 수정일시 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | U_PGM_ID | 수정 프로그램 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | U_SVC_ID | 수정 서비스 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | U_USR_ID | 수정자 아이디 | 추정 | 공통 칼럼 규칙(지시) |
| TB_MCM_CODE_MASTER | VER | 버전 | 사전 |  |

## MDMAPUSER (V5, 칼럼 746·테이블 39)

파일: `src/backend/mdm/api/src/main/resources/db/migration/mdm/oracle/V5__column_comments.sql`

### 테이블

| 테이블 | 이름 | 근거 | 상세 |
|---|---|---|---|
| TB_MDM_CODE | 마루 코드 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng title="마루 코드" |
| TB_MDM_CODE_CATE | 마루 코드 카테고리 | 추정 | 추정: 마루 코드+카테고리 (dmc/codeItemEdit) |
| TB_MDM_CODE_CATE_ITEM | 마루 코드 카테고리 항목 | 추정 | 추정 |
| TB_MDM_CODE_ITEM | 마루 코드 항목 | 화면 | src/frontend/m-mdm/pages/dmc/codeItemEdit 코드 편집 |
| TB_MDM_CODE_RECV | 마루 코드 수신 | 추정 | 추정: *_RECV 수신 로그(docs/mdm/PRD.md:62) |
| TB_MDM_CODE_SYSTEM | 마루 코드 배포 시스템 | 코드 | docs/mdm/PRD.md:62 *_SYSTEM 배포 대상 |
| TB_MDM_CODE_VER | 마루 코드 버전 | 추정 | 추정 |
| TB_MDM_COLUMN | 컬럼 사전 | 화면 | src/frontend/m-mdm/pages/dma/columnMng title="컬럼 사전" |
| TB_MDM_COLUMN_SYSTEM | 컬럼 시스템 매핑 | 코드 | docs/mdm/PRD.md:62 컬럼 매핑 |
| TB_MDM_DATA | 마루 데이터 | 화면 | src/frontend/m-mdm/pages/dmd/dataMng title="마루 데이터" |
| TB_MDM_DATA_CATE | 마루 데이터 카테고리 | 추정 | 추정 |
| TB_MDM_DATA_CATE_ITEM | 마루 데이터 카테고리 항목 | 추정 | 추정 |
| TB_MDM_DATA_ITEM | 마루 데이터 항목 | 화면 | src/frontend/m-mdm/pages/dmd/dataItemMng title="항목 편집" |
| TB_MDM_DATA_RECV | 마루 데이터 수신 | 코드 | docs/mdm/PRD.md:62 *_RECV 수신 로그 |
| TB_MDM_DATA_RECV_ITEM | 마루 데이터 수신 항목 | 추정 | 추정 |
| TB_MDM_DATA_SYSTEM | 마루 데이터 배포 시스템 | 코드 | docs/mdm/PRD.md:62 *_SYSTEM 배포 대상 |
| TB_MDM_DICT_SEQ | 사전 변경 순번 | 코드 | docs/mdm/PRD.md:62 배포 순번 표 |
| TB_MDM_DICT_SYSTEM | 사전 배포 시스템 | 코드 | docs/mdm/PRD.md:83 사전 수신 시스템 지정 |
| TB_MDM_DOMAIN | 도메인 | 화면 | src/frontend/m-mdm/pages/dma/domainMng title="도메인 관리" |
| TB_MDM_EAI | EAI 전문 헤더 | 화면 | src/frontend/m-mdm/pages/dmb/headerMng title="전문 헤더 정의" |
| TB_MDM_LAYOUT | 전문 레이아웃 | 추정 | 테이블 물리명 분해 |
| TB_MDM_LAYOUT_CONST | 전문 레이아웃 헤더 상수 | 추정 | 테이블 물리명 분해 |
| TB_MDM_LAYOUT_HEADER | 전문 레이아웃 헤더 | 추정 | 테이블 물리명 분해 |
| TB_MDM_LAYOUT_ITEM | 전문 레이아웃 항목 | 추정 | 테이블 물리명 분해 |
| TB_MDM_LAYOUT_VER | 전문 레이아웃 버전 | 추정 | 테이블 물리명 분해 |
| TB_MDM_META_REV | 메타 변경 이력 | 추정 | 테이블 물리명 분해 |
| TB_MDM_RULE | 룰 | 추정 | 테이블 물리명 분해 |
| TB_MDM_RULE_RECV | 룰 수신 | 추정 | 테이블 물리명 분해 |
| TB_MDM_RULE_ROW | 룰 행 | 추정 | 테이블 물리명 분해 |
| TB_MDM_RULE_SET | 룰 세트 | 추정 | 테이블 물리명 분해 |
| TB_MDM_RULE_SET_TEST_CASE | 룰 세트 시험 케이스 | 추정 | 테이블 물리명 분해 |
| TB_MDM_RULE_SET_VER | 룰 세트 버전 | 추정 | 테이블 물리명 분해 |
| TB_MDM_RULE_SYSTEM | 룰 적용 시스템 | 추정 | 테이블 물리명 분해 |
| TB_MDM_RULE_TEST_CASE | 룰 시험 케이스 | 추정 | 테이블 물리명 분해 |
| TB_MDM_RULE_VAR | 룰 변수 | 추정 | 테이블 물리명 분해 |
| TB_MDM_RULE_VER | 룰 버전 | 추정 | 테이블 물리명 분해 |
| TB_MDM_SYSTEM | 시스템 | 추정 | 테이블 물리명 분해 |
| TB_MDM_TERM | 표준 용어 | 추정 | 테이블 물리명 분해 |
| TB_MDM_UNIT | 단위 | 추정 | 테이블 물리명 분해 |

### 칼럼

| 테이블 | 칼럼 | 이름 | 근거 | 상세 |
|---|---|---|---|---|
| TB_MDM_CODE_CATE_ITEM | CATE_ID | 카테고리 아이디 | 화면 | src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx:559 |
| TB_MDM_CODE_CATE_ITEM | CODE | 코드 | 추정 | CODE=코드 |
| TB_MDM_CODE_CATE_ITEM | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE_ITEM | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE_ITEM | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE_ITEM | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE_ITEM | FROM_VER | 시작 버전 | 추정 | FROM_VER |
| TB_MDM_CODE_CATE_ITEM | MARU_CODE_ID | 마루 코드 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng MdmFieldLabel maruCodeId |
| TB_MDM_CODE_CATE_ITEM | TO_VER | 종료 버전 | 추정 | TO_VER |
| TB_MDM_CODE_CATE_ITEM | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE_ITEM | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE_ITEM | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE_ITEM | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE_ITEM | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_CODE_CATE | CATE_ID | 카테고리 아이디 | 화면 | src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx:559 |
| TB_MDM_CODE_CATE | CATE_NAME | 카테고리 이름 | 화면 | src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx:559 |
| TB_MDM_CODE_CATE | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE | DEF_EXPR | 정규식 | 화면 | src/frontend/m-mdm/pages/dmc/codeItemEdit/fieldLabels.ts:19 |
| TB_MDM_CODE_CATE | DEF_KIND | 정의 종류 | 화면 | src/frontend/m-mdm/pages/dmc/codeItemEdit/fieldLabels.ts:18 |
| TB_MDM_CODE_CATE | DEF_TARGET | 대상 칸 | 화면 | src/frontend/m-mdm/pages/dmc/codeItemEdit/fieldLabels.ts:20 |
| TB_MDM_CODE_CATE | DESCRIPTION | 설명 | 추정 | 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE | FROM_VER | 시작 버전 | 추정 | FROM_VER |
| TB_MDM_CODE_CATE | MARU_CODE_ID | 마루 코드 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng MdmFieldLabel maruCodeId |
| TB_MDM_CODE_CATE | TO_VER | 종료 버전 | 추정 | TO_VER |
| TB_MDM_CODE_CATE | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_CATE | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_CODE_ITEM | ALTER_NAME | 약칭 | 화면 | src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx:535 |
| TB_MDM_CODE_ITEM | ATTR01 | 속성 01 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE_ITEM | ATTR02 | 속성 02 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE_ITEM | ATTR03 | 속성 03 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE_ITEM | ATTR04 | 속성 04 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE_ITEM | ATTR05 | 속성 05 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE_ITEM | ATTR06 | 속성 06 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE_ITEM | ATTR07 | 속성 07 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE_ITEM | ATTR08 | 속성 08 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE_ITEM | ATTR09 | 속성 09 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE_ITEM | ATTR10 | 속성 10 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE_ITEM | CODE | 코드 | 추정 | CODE=코드 |
| TB_MDM_CODE_ITEM | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_ITEM | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_ITEM | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_ITEM | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_ITEM | DESCRIPTION | 설명 | 추정 | 공통 칼럼 규칙 |
| TB_MDM_CODE_ITEM | FROM_VER | 시작 버전 | 추정 | FROM_VER |
| TB_MDM_CODE_ITEM | LVL1 | 계층 1 값 | 추정 | LVL=계층 단계 |
| TB_MDM_CODE_ITEM | LVL2 | 계층 2 값 | 추정 | LVL=계층 단계 |
| TB_MDM_CODE_ITEM | LVL3 | 계층 3 값 | 추정 | LVL=계층 단계 |
| TB_MDM_CODE_ITEM | LVL4 | 계층 4 값 | 추정 | LVL=계층 단계 |
| TB_MDM_CODE_ITEM | LVL5 | 계층 5 값 | 추정 | LVL=계층 단계 |
| TB_MDM_CODE_ITEM | MARU_CODE_ID | 마루 코드 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng MdmFieldLabel maruCodeId |
| TB_MDM_CODE_ITEM | NAME | 항목명 | 추정 | NAME=이름, 항목 테이블 |
| TB_MDM_CODE_ITEM | SEQ | 순번 | 추정 | SEQ=순번 |
| TB_MDM_CODE_ITEM | TO_VER | 종료 버전 | 추정 | TO_VER |
| TB_MDM_CODE_ITEM | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_ITEM | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_ITEM | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_ITEM | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_ITEM | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_CODE_RECV | AUD_VER | 감사 버전 | 추정 | AUD=감사 |
| TB_MDM_CODE_RECV | BODY | 본문 | 화면 | src/frontend/m-mcm/page-components/csa/mdmCacheMng/utils.ts:61 |
| TB_MDM_CODE_RECV | CHG_SEQ | 변경 순번 | 사전 | MDM 사전 이름 |
| TB_MDM_CODE_RECV | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_RECV | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_RECV | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_RECV | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_RECV | MARU_CODE_ID | 마루 코드 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng MdmFieldLabel maruCodeId |
| TB_MDM_CODE_RECV | PROCESSED_AT | 처리 일시 | 추정 | PROCESSED_AT |
| TB_MDM_CODE_RECV | RECEIVED_AT | 수신일시 | 추정 | RECEIVED_AT (동일 물리명 통일) |
| TB_MDM_CODE_RECV | RECV_ID | 수신 아이디 | 추정 | RECV=수신 |
| TB_MDM_CODE_RECV | REQ_KIND | 요청 종류 | 추정 | REQ_KIND |
| TB_MDM_CODE_RECV | RESULT_DETAIL | 처리 결과 상세 | 추정 | RESULT_DETAIL |
| TB_MDM_CODE_RECV | RESULT | 처리 결과 | 추정 | RESULT |
| TB_MDM_CODE_RECV | SOURCE_REF | 원천 참조 | 추정 | SOURCE+REF |
| TB_MDM_CODE_RECV | SOURCE_SYSTEM | 원천 시스템 | 추정 | SOURCE+SYSTEM |
| TB_MDM_CODE_RECV | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_RECV | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_RECV | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_RECV | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_RECV | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_CODE_SYSTEM | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_SYSTEM | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_SYSTEM | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_SYSTEM | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_SYSTEM | DESCRIPTION | 설명 | 추정 | 공통 칼럼 규칙 |
| TB_MDM_CODE_SYSTEM | MARU_CODE_ID | 마루 코드 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng MdmFieldLabel maruCodeId |
| TB_MDM_CODE_SYSTEM | SYSTEM_CODE | 시스템 코드 | 추정 | SYSTEM=시스템 |
| TB_MDM_CODE_SYSTEM | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_SYSTEM | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_SYSTEM | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_SYSTEM | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_SYSTEM | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_CODE_VER | APPLY_FROM | 적용 시작일시 | 화면 | src/frontend/m-mdm/pages/dmb/layoutConfirm/page.tsx:279 |
| TB_MDM_CODE_VER | APPLY_TO | 적용 종료일시 | 화면 | src/frontend/m-mdm/pages/dmb/layoutConfirm/page.tsx:279 |
| TB_MDM_CODE_VER | APPROVED_AT | 승인 일시 | 추정 | APPROVED_AT |
| TB_MDM_CODE_VER | APPROVED_BY | 승인자 | 추정 | APPROVED_BY |
| TB_MDM_CODE_VER | AUD_VER | 감사 버전 | 추정 | AUD=감사 |
| TB_MDM_CODE_VER | CANCELLED_AT | 취소 일시 | 추정 | CANCELLED_AT |
| TB_MDM_CODE_VER | CANCEL_REASON | 취소 사유 | 추정 | CANCEL_REASON |
| TB_MDM_CODE_VER | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_VER | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_VER | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_VER | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_VER | DESCRIPTION | 설명 | 추정 | 공통 칼럼 규칙 |
| TB_MDM_CODE_VER | EMERGENCY_REASON | 긴급 사유 | 추정 | EMERGENCY_REASON |
| TB_MDM_CODE_VER | EMERGENCY_YN | 긴급 여부 | 추정 | EMERGENCY_YN |
| TB_MDM_CODE_VER | MARU_CODE_ID | 마루 코드 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng MdmFieldLabel maruCodeId |
| TB_MDM_CODE_VER | OWNER_ID | 소유자 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx:70 |
| TB_MDM_CODE_VER | REJECT_REASON | 반려 사유 | 추정 | REJECT_REASON |
| TB_MDM_CODE_VER | RELEASED_AT | 확정 일시 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx:68 |
| TB_MDM_CODE_VER | REQUESTED_AT | 요청일시 | 추정 | REQUESTED_AT (동일 물리명 통일) |
| TB_MDM_CODE_VER | REQUESTED_BY | 요청자 | 추정 | REQUESTED_BY |
| TB_MDM_CODE_VER | RESTORED_FROM | 복원 원본 버전 | 추정 | RESTORED_FROM |
| TB_MDM_CODE_VER | ROW_VERSION | 행 버전 | 추정 | ROW_VERSION 낙관적 잠금 |
| TB_MDM_CODE_VER | STATUS | 상태 | 추정 | STATUS=상태 |
| TB_MDM_CODE_VER | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_VER | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_VER | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_VER | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE_VER | VER_KIND | 버전 종류 | 추정 | VER_KIND |
| TB_MDM_CODE_VER | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_CODE | ATTR01_NAME | 속성 01 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE | ATTR02_NAME | 속성 02 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE | ATTR03_NAME | 속성 03 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE | ATTR04_NAME | 속성 04 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE | ATTR05_NAME | 속성 05 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE | ATTR06_NAME | 속성 06 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE | ATTR07_NAME | 속성 07 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE | ATTR08_NAME | 속성 08 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE | ATTR09_NAME | 속성 09 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE | ATTR10_NAME | 속성 10 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_CODE | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE | DESCRIPTION | 설명 | 추정 | 공통 칼럼 규칙 |
| TB_MDM_CODE | LAST_CHG_SEQ | 마지막 변경 순번 | 추정 | LAST+CHG_SEQ |
| TB_MDM_CODE | LVL_CNT | 계층 칸 수 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx MdmFieldLabel lvlCnt |
| TB_MDM_CODE | MARU_CODE_ID | 마루 코드 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng MdmFieldLabel maruCodeId |
| TB_MDM_CODE | MARU_CODE_NAME | 마루 코드 이름 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng MdmFieldLabel maruCodeName |
| TB_MDM_CODE | SOURCE_KIND | 원천 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx:135 |
| TB_MDM_CODE | SOURCE_SYSTEM | 원천 시스템 | 추정 | SOURCE+SYSTEM |
| TB_MDM_CODE | STATUS | 상태 | 추정 | STATUS=상태 |
| TB_MDM_CODE | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_CODE | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_COLUMN_SYSTEM | COLUMN_ID | 컬럼 아이디 | 추정 | COLUMN_ID |
| TB_MDM_COLUMN_SYSTEM | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN_SYSTEM | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN_SYSTEM | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN_SYSTEM | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN_SYSTEM | NOTE | 비고 | 추정 | NOTE |
| TB_MDM_COLUMN_SYSTEM | PHYS_NAME | 물리명 | 화면 | src/frontend/m-mdm/pages/dma/columnMng MdmFieldLabel physName |
| TB_MDM_COLUMN_SYSTEM | SYSTEM_CODE | 시스템 코드 | 추정 | SYSTEM=시스템 |
| TB_MDM_COLUMN_SYSTEM | TRANSFORM | 변환 방식 | 추정 | TRANSFORM |
| TB_MDM_COLUMN_SYSTEM | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN_SYSTEM | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN_SYSTEM | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN_SYSTEM | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN_SYSTEM | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_COLUMN | CHG_SEQ | 변경 순번 | 사전 | MDM 사전 이름 |
| TB_MDM_COLUMN | COLUMN_ID | 컬럼 아이디 | 추정 | COLUMN_ID |
| TB_MDM_COLUMN | COLUMN_NAME | 논리명 | 화면 | src/frontend/m-mdm/pages/dma/columnMng MdmFieldLabel columnName |
| TB_MDM_COLUMN | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN | DEFAULT_VALUE | 기본값 | 화면 | src/frontend/m-mdm/pages/dma/columnMng MdmFieldLabel defaultValue |
| TB_MDM_COLUMN | DESCRIPTION | 설명 | 추정 | 공통 칼럼 규칙 |
| TB_MDM_COLUMN | DOMAIN_ID | 도메인 아이디 | 화면 | src/frontend/m-mdm/pages/dma/columnMng MdmFieldLabel domainId |
| TB_MDM_COLUMN | LABEL_LONG | 긴 표시명 | 화면 | src/frontend/m-mdm/pages/dma/columnMng/ColumnDetailForm.tsx:140 |
| TB_MDM_COLUMN | LABEL_MID | 중간 표시명 | 화면 | src/frontend/m-mdm/pages/dma/columnMng/ColumnDetailForm.tsx:140 |
| TB_MDM_COLUMN | LABEL_SHORT | 짧은 표시명 | 화면 | src/frontend/m-mdm/pages/dma/columnMng/ColumnDetailForm.tsx:140 |
| TB_MDM_COLUMN | PHYS_NAME | 물리명 | 화면 | src/frontend/m-mdm/pages/dma/columnMng MdmFieldLabel physName |
| TB_MDM_COLUMN | REF_CATE_ID | 참조 카테고리 아이디 | 화면 | src/frontend/m-mdm/pages/dma/columnMng MdmFieldLabel refCateId |
| TB_MDM_COLUMN | REF_KIND | 참조 종류 | 화면 | src/frontend/m-mdm/pages/dma/columnMng/ColumnDetailForm.tsx:204 |
| TB_MDM_COLUMN | REF_TARGET | 참조 대상 | 화면 | src/frontend/m-mdm/pages/dma/columnMng/ColumnDetailForm.tsx:217 |
| TB_MDM_COLUMN | REQUIRED | 필수 여부 | 화면 | src/frontend/m-mdm/pages/dma/columnMng MdmFieldLabel required |
| TB_MDM_COLUMN | TERM_IDS | 용어 아이디 목록 | 추정 | TERM_IDS |
| TB_MDM_COLUMN | USAGE_NOTE | 활용처 메모 | 화면 | src/frontend/m-mdm/pages/dme/ruleMng/RuleDetailPanel.tsx:329 |
| TB_MDM_COLUMN | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_COLUMN | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_DATA_CATE_ITEM | CATE_ID | 카테고리 아이디 | 화면 | src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx:559 |
| TB_MDM_DATA_CATE_ITEM | CHG_SEQ | 변경 순번 | 사전 | MDM 사전 이름 |
| TB_MDM_DATA_CATE_ITEM | CODE | 코드 | 추정 | CODE=코드 |
| TB_MDM_DATA_CATE_ITEM | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE_ITEM | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE_ITEM | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE_ITEM | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE_ITEM | MARU_DATA_ID | 마루 데이터 아이디 | 화면 | src/frontend/m-mdm/pages/dmd/dataMng/DataDetail.tsx:52 |
| TB_MDM_DATA_CATE_ITEM | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE_ITEM | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE_ITEM | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE_ITEM | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE_ITEM | VALID_FROM | 유효 시작 일시 | 추정 | VALID_FROM |
| TB_MDM_DATA_CATE_ITEM | VALID_TO | 유효 종료 일시 | 추정 | VALID_TO |
| TB_MDM_DATA_CATE_ITEM | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_DATA_CATE | CATE_ID | 카테고리 아이디 | 화면 | src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx:559 |
| TB_MDM_DATA_CATE | CATE_NAME | 카테고리 이름 | 화면 | src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx:559 |
| TB_MDM_DATA_CATE | CHG_SEQ | 변경 순번 | 사전 | MDM 사전 이름 |
| TB_MDM_DATA_CATE | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE | DEF_EXPR | 정규식 | 화면 | src/frontend/m-mdm/pages/dmc/codeItemEdit/fieldLabels.ts:19 |
| TB_MDM_DATA_CATE | DEF_KIND | 정의 종류 | 화면 | src/frontend/m-mdm/pages/dmc/codeItemEdit/fieldLabels.ts:18 |
| TB_MDM_DATA_CATE | DEF_TARGET | 대상 칸 | 화면 | src/frontend/m-mdm/pages/dmc/codeItemEdit/fieldLabels.ts:20 |
| TB_MDM_DATA_CATE | DESCRIPTION | 설명 | 추정 | 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE | MARU_DATA_ID | 마루 데이터 아이디 | 화면 | src/frontend/m-mdm/pages/dmd/dataMng/DataDetail.tsx:52 |
| TB_MDM_DATA_CATE | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_CATE | VALID_FROM | 유효 시작 일시 | 추정 | VALID_FROM |
| TB_MDM_DATA_CATE | VALID_TO | 유효 종료 일시 | 추정 | VALID_TO |
| TB_MDM_DATA_CATE | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_DATA_ITEM | ALTER_NAME | 약칭 | 화면 | src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx:535 |
| TB_MDM_DATA_ITEM | ATTR01 | 속성 01 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA_ITEM | ATTR02 | 속성 02 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA_ITEM | ATTR03 | 속성 03 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA_ITEM | ATTR04 | 속성 04 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA_ITEM | ATTR05 | 속성 05 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA_ITEM | ATTR06 | 속성 06 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA_ITEM | ATTR07 | 속성 07 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA_ITEM | ATTR08 | 속성 08 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA_ITEM | ATTR09 | 속성 09 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA_ITEM | ATTR10 | 속성 10 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA_ITEM | CHG_SEQ | 변경 순번 | 사전 | MDM 사전 이름 |
| TB_MDM_DATA_ITEM | CODE | 코드 | 추정 | CODE=코드 |
| TB_MDM_DATA_ITEM | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_ITEM | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_ITEM | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_ITEM | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_ITEM | DESCRIPTION | 설명 | 추정 | 공통 칼럼 규칙 |
| TB_MDM_DATA_ITEM | LVL1 | 계층 1 값 | 추정 | LVL=계층 단계 |
| TB_MDM_DATA_ITEM | LVL2 | 계층 2 값 | 추정 | LVL=계층 단계 |
| TB_MDM_DATA_ITEM | LVL3 | 계층 3 값 | 추정 | LVL=계층 단계 |
| TB_MDM_DATA_ITEM | LVL4 | 계층 4 값 | 추정 | LVL=계층 단계 |
| TB_MDM_DATA_ITEM | LVL5 | 계층 5 값 | 추정 | LVL=계층 단계 |
| TB_MDM_DATA_ITEM | MARU_DATA_ID | 마루 데이터 아이디 | 화면 | src/frontend/m-mdm/pages/dmd/dataMng/DataDetail.tsx:52 |
| TB_MDM_DATA_ITEM | NAME | 항목명 | 추정 | NAME=이름, 항목 테이블 |
| TB_MDM_DATA_ITEM | ROW_VERSION | 행 버전 | 추정 | ROW_VERSION 낙관적 잠금 |
| TB_MDM_DATA_ITEM | SEQ | 순번 | 추정 | SEQ=순번 |
| TB_MDM_DATA_ITEM | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_ITEM | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_ITEM | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_ITEM | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_ITEM | VALID_FROM | 유효 시작 일시 | 추정 | VALID_FROM |
| TB_MDM_DATA_ITEM | VALID_TO | 유효 종료 일시 | 추정 | VALID_TO |
| TB_MDM_DATA_ITEM | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_DATA_RECV_ITEM | ACTION | 수행 동작 | 추정 | ACTION (동일 물리명 통일) |
| TB_MDM_DATA_RECV_ITEM | CODE | 코드 | 추정 | CODE=코드 |
| TB_MDM_DATA_RECV_ITEM | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV_ITEM | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV_ITEM | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV_ITEM | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV_ITEM | RECV_ID | 수신 아이디 | 추정 | RECV=수신 |
| TB_MDM_DATA_RECV_ITEM | SEQ | 순번 | 추정 | SEQ=순번 |
| TB_MDM_DATA_RECV_ITEM | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV_ITEM | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV_ITEM | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV_ITEM | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV_ITEM | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_DATA_RECV | BODY | 본문 | 화면 | src/frontend/m-mcm/page-components/csa/mdmCacheMng/utils.ts:61 |
| TB_MDM_DATA_RECV | CHG_SEQ | 변경 순번 | 사전 | MDM 사전 이름 |
| TB_MDM_DATA_RECV | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV | MARU_DATA_ID | 마루 데이터 아이디 | 화면 | src/frontend/m-mdm/pages/dmd/dataMng/DataDetail.tsx:52 |
| TB_MDM_DATA_RECV | PROCESSED_AT | 처리 일시 | 추정 | PROCESSED_AT |
| TB_MDM_DATA_RECV | RECEIVED_AT | 수신일시 | 추정 | RECEIVED_AT (동일 물리명 통일) |
| TB_MDM_DATA_RECV | RECV_ID | 수신 아이디 | 추정 | RECV=수신 |
| TB_MDM_DATA_RECV | RESULT_DETAIL | 처리 결과 상세 | 추정 | RESULT_DETAIL |
| TB_MDM_DATA_RECV | RESULT | 처리 결과 | 추정 | RESULT |
| TB_MDM_DATA_RECV | ROW_COUNT | 행 수 | 추정 | ROW_COUNT |
| TB_MDM_DATA_RECV | SOURCE_REF | 원천 참조 | 추정 | SOURCE+REF |
| TB_MDM_DATA_RECV | SOURCE_SYSTEM | 원천 시스템 | 추정 | SOURCE+SYSTEM |
| TB_MDM_DATA_RECV | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_RECV | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_DATA_SYSTEM | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_SYSTEM | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_SYSTEM | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_SYSTEM | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_SYSTEM | DESCRIPTION | 설명 | 추정 | 공통 칼럼 규칙 |
| TB_MDM_DATA_SYSTEM | MARU_DATA_ID | 마루 데이터 아이디 | 화면 | src/frontend/m-mdm/pages/dmd/dataMng/DataDetail.tsx:52 |
| TB_MDM_DATA_SYSTEM | SYSTEM_CODE | 시스템 코드 | 추정 | SYSTEM=시스템 |
| TB_MDM_DATA_SYSTEM | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_SYSTEM | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_SYSTEM | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_SYSTEM | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA_SYSTEM | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_DATA | ATTR01_NAME | 속성 01 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA | ATTR02_NAME | 속성 02 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA | ATTR03_NAME | 속성 03 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA | ATTR04_NAME | 속성 04 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA | ATTR05_NAME | 속성 05 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA | ATTR06_NAME | 속성 06 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA | ATTR07_NAME | 속성 07 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA | ATTR08_NAME | 속성 08 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA | ATTR09_NAME | 속성 09 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA | ATTR10_NAME | 속성 10 이름 | 화면 | src/frontend/m-mdm/tests/dmc/codeMng/code-mng-detail.test.ts:296 attrLabels |
| TB_MDM_DATA | CHG_SEQ | 변경 순번 | 사전 | MDM 사전 이름 |
| TB_MDM_DATA | CLOSED_AT | 폐기 일시 | 코드 | src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/code/MasterDataRows.java:14 |
| TB_MDM_DATA | CODE_PATTERN | 키 패턴 | 화면 | src/frontend/m-mdm/pages/dmd/dataMng/DataDetail.tsx:76 |
| TB_MDM_DATA | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA | DESCRIPTION | 설명 | 추정 | 공통 칼럼 규칙 |
| TB_MDM_DATA | LAST_CHG_SEQ | 마지막 변경 순번 | 추정 | LAST+CHG_SEQ |
| TB_MDM_DATA | LVL_CNT | 계층 칸 수 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx MdmFieldLabel lvlCnt |
| TB_MDM_DATA | MARU_DATA_ID | 마루 데이터 아이디 | 화면 | src/frontend/m-mdm/pages/dmd/dataMng/DataDetail.tsx:52 |
| TB_MDM_DATA | MARU_DATA_NAME | 마루 데이터 이름 | 화면 | src/frontend/m-mdm/pages/dmd/dataMng MdmFieldLabel maruDataName |
| TB_MDM_DATA | SOURCE_KIND | 원천 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx:135 |
| TB_MDM_DATA | SOURCE_SYSTEM | 원천 시스템 | 추정 | SOURCE+SYSTEM |
| TB_MDM_DATA | STATUS | 상태 | 추정 | STATUS=상태 |
| TB_MDM_DATA | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DATA | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_DICT_SEQ | DICT_CODE | 사전 코드 | 추정 | DICT_CODE |
| TB_MDM_DICT_SEQ | LAST_CHG_SEQ | 마지막 변경 순번 | 추정 | LAST+CHG_SEQ |
| TB_MDM_DICT_SYSTEM | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DICT_SYSTEM | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DICT_SYSTEM | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DICT_SYSTEM | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DICT_SYSTEM | DICT_CODE | 사전 코드 | 추정 | DICT_CODE |
| TB_MDM_DICT_SYSTEM | NOTE | 비고 | 추정 | NOTE |
| TB_MDM_DICT_SYSTEM | SYSTEM_CODE | 시스템 코드 | 추정 | SYSTEM=시스템 |
| TB_MDM_DICT_SYSTEM | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DICT_SYSTEM | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DICT_SYSTEM | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DICT_SYSTEM | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DICT_SYSTEM | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_DOMAIN | BIZ_AST | 비즈니스 검증식 구문 트리 | 추정 | BIZ_RULE+AST |
| TB_MDM_DOMAIN | BIZ_RULE | 비즈니스 검증식 | 화면 | src/frontend/m-mdm/pages/dma/domainMng/components/DomainRuleEditor.tsx:35 |
| TB_MDM_DOMAIN | CATE_ID | 카테고리 아이디 | 화면 | src/frontend/m-mdm/pages/dmd/dataItemMng/page.tsx:559 |
| TB_MDM_DOMAIN | CHG_SEQ | 변경 순번 | 사전 | MDM 사전 이름 |
| TB_MDM_DOMAIN | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DOMAIN | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DOMAIN | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DOMAIN | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DOMAIN | DATA_TYPE | 데이터 타입 | 화면 | src/frontend/m-mdm/pages/dma/domainMng MdmFieldLabel dataType |
| TB_MDM_DOMAIN | DESCRIPTION | 설명 | 추정 | 공통 칼럼 규칙 |
| TB_MDM_DOMAIN | DOMAIN_ID | 도메인 아이디 | 화면 | src/frontend/m-mdm/pages/dma/columnMng MdmFieldLabel domainId |
| TB_MDM_DOMAIN | DOMAIN_KIND | 도메인 종류 | 화면 | src/frontend/m-mdm/pages/dma/domainMng/components/DomainBasicForm.tsx:77 |
| TB_MDM_DOMAIN | DOMAIN_NAME | 도메인명 | 화면 | src/frontend/m-mdm/pages/dma/domainMng MdmFieldLabel domainName |
| TB_MDM_DOMAIN | EXAMPLES | 예시 값 | 화면 | src/frontend/m-mdm/pages/dma/domainMng/components/DomainBasicForm.tsx:142 |
| TB_MDM_DOMAIN | LENGTH | 길이 | 사전 | MDM 사전 이름 |
| TB_MDM_DOMAIN | MARU_CODE_ID | 마루 코드 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng MdmFieldLabel maruCodeId |
| TB_MDM_DOMAIN | PARENT_DOMAIN_ID | 부모 도메인 아이디 | 화면 | src/frontend/m-mdm/pages/dma/domainMng/components/DomainBasicForm.tsx:65 |
| TB_MDM_DOMAIN | SCALE | 소수 자릿수 | 추정 | SCALE |
| TB_MDM_DOMAIN | STD_AST | 표준 검증식 구문 트리 | 추정 | STD_RULE+AST |
| TB_MDM_DOMAIN | STD_NAME | 표준명 | 화면 | src/frontend/m-mdm/pages/dma/domainMng/components/DomainBasicForm.tsx:58 |
| TB_MDM_DOMAIN | STD_RULE | 표준 검증식 | 화면 | src/frontend/m-mdm/pages/dma/domainMng/components/DomainRuleEditor.tsx:26 |
| TB_MDM_DOMAIN | TEST_CASES | 시험 사례 | 추정 | TEST_CASES |
| TB_MDM_DOMAIN | UNIT_CODE | 단위 코드 | 화면 | src/frontend/m-mdm/pages/dma/unitMng/UnitDetailForm.tsx:84 |
| TB_MDM_DOMAIN | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DOMAIN | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DOMAIN | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DOMAIN | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_DOMAIN | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_EAI | C_AT | 생성일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_EAI | C_PGM_ID | 생성 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_EAI | C_SVC_ID | 생성 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_EAI | C_USR_ID | 생성자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_EAI | EAI_CODE | EAI 코드 | 화면 | src/frontend/m-mdm/pages/dmb/layoutMng/components/LayoutBasicForm.tsx:83 |
| TB_MDM_EAI | EAI_NAME | EAI 이름 | 화면 | src/frontend/m-mdm/pages/dmb/headerMng/components/HeaderForm.tsx:89 |
| TB_MDM_EAI | ENCODING | 인코딩 | 화면 | src/frontend/m-mdm/pages/dmb/headerMng/components/HeaderForm.tsx:102 |
| TB_MDM_EAI | HEADER_LAYOUT_ID | 헤더 레이아웃 아이디 | 화면 | src/frontend/m-mdm/pages/dmb/layoutMng/page.tsx:482 |
| TB_MDM_EAI | PAD_RULE | 패딩 규칙 | 화면 | src/frontend/m-mdm/pages/dmb/headerMng/components/HeaderForm.tsx:104 |
| TB_MDM_EAI | U_AT | 수정일시 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_EAI | U_PGM_ID | 수정 프로그램 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_EAI | U_SVC_ID | 수정 서비스 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_EAI | U_USR_ID | 수정자 아이디 | 추정 | MCM 공통 칼럼 규칙 |
| TB_MDM_EAI | VER | 버전 | 사전 | MDM 사전 이름 |
| TB_MDM_LAYOUT_CONST | AUD_VER | 감사 버전 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_CONST | CONST_VALUE | 이 전문의 값 | 화면 | src/frontend/m-mdm/pages/dmb/layoutMng/fieldLabels.ts:17 |
| TB_MDM_LAYOUT_CONST | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_CONST | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_CONST | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_CONST | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_CONST | HEADER_COLUMN_PHYS | 헤더 칼럼 물리명 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_CONST | HEADER_LAYOUT_ID | 헤더 레이아웃 아이디 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MDM_LAYOUT_CONST | LAYOUT_ID | 전문 아이디 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_CONST | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_CONST | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_CONST | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_CONST | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_CONST | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_LAYOUT_HEADER | AUD_VER | 감사 버전 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_HEADER | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_HEADER | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_HEADER | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_HEADER | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_HEADER | HEADER_LAYOUT_ID | 헤더 레이아웃 아이디 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MDM_LAYOUT_HEADER | LAYOUT_ID | 전문 아이디 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_HEADER | SEQ | 순번 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_HEADER | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_HEADER | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_HEADER | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_HEADER | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_HEADER | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_LAYOUT_ITEM | AUD_VER | 감사 버전 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_ITEM | COLUMN_PHYS | 칼럼 물리명 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_ITEM | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_ITEM | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_ITEM | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_ITEM | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_ITEM | DATA_TYPE | 데이터 타입 | 화면 | src/frontend/m-mdm/pages/dma/domainMng/fieldLabels.ts:12 |
| TB_MDM_LAYOUT_ITEM | DEFAULT_VALUE | 기본값 | 화면 | src/frontend/m-mdm/pages/dma/columnMng/ColumnDetailForm.tsx:196 |
| TB_MDM_LAYOUT_ITEM | FILLER_LENGTH | 채움 길이 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_ITEM | FILL_KIND | 채움 종류 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_LAYOUT_ITEM | LAYOUT_ID | 전문 아이디 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_ITEM | LENGTH | 길이 | 사전 | MDM 사전 |
| TB_MDM_LAYOUT_ITEM | NUM_FORMAT | 숫자 형식 | 코드 | src/frontend/m-mdm/src/layout/snapshot-export.ts:68 |
| TB_MDM_LAYOUT_ITEM | OFFSET | 시작 위치 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_ITEM | PINNED_YN | 고정 여부 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_ITEM | SCALE | 소수 자릿수 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_ITEM | SEQ | 순번 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_ITEM | TRANS_UNIT | 전송 단위 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_LAYOUT_ITEM | UNIT_CODE | 단위 코드 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_LAYOUT_ITEM | UNIT_ITEM | 단위 항목 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_ITEM | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_ITEM | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_ITEM | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_ITEM | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_ITEM | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_LAYOUT_VER | APPLY_FROM | 적용 시작일시 | 화면 | src/frontend/m-mdm/pages/dmb/layoutConfirm/page.tsx:279 |
| TB_MDM_LAYOUT_VER | APPLY_TO | 적용 종료일시 | 화면 | src/frontend/m-mdm/pages/dmb/layoutConfirm/page.tsx:279 |
| TB_MDM_LAYOUT_VER | AUD_VER | 감사 버전 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_VER | BASE_VER | 기준 버전 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_VER | CHANGE_KINDS | 변경 종류 | 코드 | src/frontend/m-mdm/pages/dmb/layoutConfirm/types.ts:107 |
| TB_MDM_LAYOUT_VER | CHANGE_SUMMARY | 변경 요약 | 화면 | src/frontend/m-mdm/pages/dmb/layoutMng/components/VersionPanel.tsx:32 |
| TB_MDM_LAYOUT_VER | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_VER | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_VER | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_VER | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_VER | EAI_CODE | EAI 코드 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_LAYOUT_VER | LAYOUT_ID | 전문 아이디 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_VER | LEGACY_SNAPSHOT_YN | 옛 스냅샷 여부 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_LAYOUT_VER | OWNER_ID | 소유자 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx:70 |
| TB_MDM_LAYOUT_VER | OWN_LENGTH | 자기 길이 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_LAYOUT_VER | RELEASED_AT | 확정 일시 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx:68 |
| TB_MDM_LAYOUT_VER | REQUESTED_AT | 요청일시 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_VER | REQUESTED_BY | 요청자 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_VER | ROW_VERSION | 행 버전 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_VER | SNAPSHOT_JSON | 스냅샷 JSON | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_LAYOUT_VER | STATUS | 상태 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_VER | SWITCH_MODE | 전환 방식 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT_VER | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_VER | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_VER | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_VER | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT_VER | VER_KIND | 버전 종류 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_LAYOUT_VER | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_LAYOUT | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT | LAYOUT_ID | 전문 아이디 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT | LAYOUT_KIND | 전문 종류 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT | LAYOUT_NAME | 전문 이름 | 화면 | src/frontend/m-mdm/pages/dmb/layoutMng/components/LayoutBasicForm.tsx:74 |
| TB_MDM_LAYOUT | RCV_SYSTEM | 수신 시스템 | 화면 | src/frontend/m-mdm/pages/dmb/layoutMng/components/LayoutBasicForm.tsx:100 |
| TB_MDM_LAYOUT | SND_SYSTEM | 송신 시스템 | 코드 | mdm/lib/.../dmb/layout/LayoutDraftBuilder.java:98 |
| TB_MDM_LAYOUT | STATUS | 상태 | 추정 | 물리명 분해 |
| TB_MDM_LAYOUT | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_LAYOUT | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_META_REV | CHANGE_KIND | 변경 종류 | 추정 | 물리명 분해 |
| TB_MDM_META_REV | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_META_REV | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_META_REV | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_META_REV | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_META_REV | REV_SEQ | 변경 순번 | 추정 | 물리명 분해 |
| TB_MDM_META_REV | TARGET_KEY | 대상 키 | 추정 | 물리명 분해 |
| TB_MDM_META_REV | TARGET_TYPE | 대상 유형 | 추정 | 물리명 분해 |
| TB_MDM_META_REV | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_META_REV | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_META_REV | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_META_REV | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_META_REV | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_RULE_RECV | AUD_VER | 감사 버전 | 추정 | 물리명 분해 |
| TB_MDM_RULE_RECV | BODY | 본문 | 화면 | src/frontend/m-mcm/page-components/csa/mdmCacheMng/utils.ts:61 |
| TB_MDM_RULE_RECV | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_RECV | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_RECV | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_RECV | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_RECV | MARU_RULE_ID | 룰 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_RECV | PROCESSED_AT | 처리 일시 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MDM_RULE_RECV | RECEIVED_AT | 수신일시 | 추정 | 물리명 분해 |
| TB_MDM_RULE_RECV | RECV_ID | 수신 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_RECV | REQ_KIND | 요청 종류 | 추정 | 물리명 분해 |
| TB_MDM_RULE_RECV | RESULT_DETAIL | 처리 결과 상세 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MDM_RULE_RECV | RESULT | 처리 결과 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MDM_RULE_RECV | SOURCE_REF | 원천 참조 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MDM_RULE_RECV | SOURCE_SYSTEM | 원천 시스템 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MDM_RULE_RECV | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_RECV | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_RECV | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_RECV | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_RECV | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_RULE_ROW | AUD_VER | 감사 버전 | 추정 | 물리명 분해 |
| TB_MDM_RULE_ROW | CELLS | 셀 목록 | 추정 | 물리명 분해 |
| TB_MDM_RULE_ROW | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_ROW | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_ROW | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_ROW | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_ROW | MARU_RULE_ID | 룰 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_ROW | NOTE | 비고 | 추정 | 물리명 분해 |
| TB_MDM_RULE_ROW | ROW_ID | 행 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_ROW | ROW_KIND | 행 종류 | 추정 | 물리명 분해 |
| TB_MDM_RULE_ROW | SEQ | 순번 | 추정 | 물리명 분해 |
| TB_MDM_RULE_ROW | TAG | 태그 | 추정 | 물리명 분해 |
| TB_MDM_RULE_ROW | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_ROW | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_ROW | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_ROW | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_ROW | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_RULE_SET_TEST_CASE | CASE_ID | 케이스 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_TEST_CASE | CASE_NAME | 케이스 이름 | 화면 | src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TestCasePanel.tsx:65 |
| TB_MDM_RULE_SET_TEST_CASE | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_TEST_CASE | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_TEST_CASE | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_TEST_CASE | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_TEST_CASE | DESCRIPTION | 설명 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_TEST_CASE | EVAL_TS | 평가 시각 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_TEST_CASE | EXPECTED_JSON | 기대 결과 JSON | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_TEST_CASE | INPUT_JSON | 입력 JSON | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_TEST_CASE | MARU_RULE_SET_ID | 룰 세트 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_TEST_CASE | ROW_VERSION | 행 버전 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_TEST_CASE | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_TEST_CASE | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_TEST_CASE | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_TEST_CASE | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_TEST_CASE | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_RULE_SET_VER | APPLY_FROM | 적용 시작일시 | 화면 | src/frontend/m-mdm/pages/dmb/layoutConfirm/page.tsx:279 |
| TB_MDM_RULE_SET_VER | APPLY_TO | 적용 종료일시 | 화면 | src/frontend/m-mdm/pages/dmb/layoutConfirm/page.tsx:279 |
| TB_MDM_RULE_SET_VER | AUD_VER | 감사 버전 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_VER | BASE_VER | 기준 버전 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_VER | CALL_SET_IDS | 호출 세트 아이디 목록 | 코드 | src/frontend/m-mdm/pages/dme/ruleSetEdit/flow-model.ts:607 |
| TB_MDM_RULE_SET_VER | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_VER | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_VER | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_VER | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_VER | FLOW_JSON | 흐름도 JSON | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_VER | MARU_RULE_SET_ID | 룰 세트 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_VER | OWNER_ID | 소유자 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx:70 |
| TB_MDM_RULE_SET_VER | RELEASED_AT | 확정 일시 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx:68 |
| TB_MDM_RULE_SET_VER | REQUESTED_AT | 요청일시 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_VER | REQUESTED_BY | 요청자 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_VER | ROW_VERSION | 행 버전 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_VER | RULE_IDS | 룰 아이디 목록 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_VER | STATUS | 상태 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET_VER | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_VER | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_VER | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_VER | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET_VER | VER_KIND | 버전 종류 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_RULE_SET_VER | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_RULE_SET | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET | DESCRIPTION | 설명 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET | MARU_RULE_SET_ID | 룰 세트 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET | MARU_RULE_SET_NAME | 룰 세트 이름 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET | STATUS | 상태 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SET | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SET | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_RULE_SYSTEM | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SYSTEM | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SYSTEM | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SYSTEM | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SYSTEM | DEPLOY_KIND | 배포 종류 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SYSTEM | DESCRIPTION | 설명 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SYSTEM | MARU_RULE_ID | 룰 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SYSTEM | SYSTEM_CODE | 시스템 코드 | 추정 | 물리명 분해 |
| TB_MDM_RULE_SYSTEM | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SYSTEM | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SYSTEM | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SYSTEM | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_SYSTEM | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_RULE_TEST_CASE | CASE_ID | 케이스 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_TEST_CASE | CASE_NAME | 케이스 이름 | 화면 | src/frontend/m-mdm/pages/dme/ruleSetEdit/debugger/TestCasePanel.tsx:65 |
| TB_MDM_RULE_TEST_CASE | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_TEST_CASE | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_TEST_CASE | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_TEST_CASE | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_TEST_CASE | DESCRIPTION | 설명 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_TEST_CASE | EXPECTED_JSON | 기대 결과 JSON | 추정 | 물리명 분해 |
| TB_MDM_RULE_TEST_CASE | INPUT_JSON | 입력 JSON | 추정 | 물리명 분해 |
| TB_MDM_RULE_TEST_CASE | MARU_RULE_ID | 룰 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_TEST_CASE | ROW_VERSION | 행 버전 | 추정 | 물리명 분해 |
| TB_MDM_RULE_TEST_CASE | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_TEST_CASE | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_TEST_CASE | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_TEST_CASE | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_TEST_CASE | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_RULE_VAR | AUD_VER | 감사 버전 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VAR | COLLECT_AGG | 수집 집계 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VAR | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VAR | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VAR | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VAR | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VAR | DATA_TYPE | 데이터 타입 | 화면 | src/frontend/m-mdm/pages/dma/domainMng/fieldLabels.ts:12 |
| TB_MDM_RULE_VAR | DESCRIPTION | 설명 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VAR | DISP_TYPE | 표시 유형 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_RULE_VAR | DOMAIN_ID | 도메인 아이디 | 화면 | src/frontend/m-mdm/pages/dma/columnMng/ColumnDetailForm.tsx:172 |
| TB_MDM_RULE_VAR | GRP_COND_AST | 그룹 조건 AST | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_RULE_VAR | GRP_COND | 그룹 조건 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_RULE_VAR | LABEL | 라벨 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VAR | MARU_RULE_ID | 룰 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VAR | PRIO_LIST | 우선순위 목록 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VAR | RES_GRP | 결과 그룹 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_RULE_VAR | SEQ | 순번 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VAR | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VAR | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VAR | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VAR | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VAR | VAR_AST | 변수 식 AST | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_RULE_VAR | VAR_ID | 변수 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VAR | VAR_KIND | 변수 종류 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VAR | VAR_NAME | 변수 이름 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VAR | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_RULE_VER | APPLY_FROM | 적용 시작일시 | 화면 | src/frontend/m-mdm/pages/dmb/layoutConfirm/page.tsx:279 |
| TB_MDM_RULE_VER | APPLY_TO | 적용 종료일시 | 화면 | src/frontend/m-mdm/pages/dmb/layoutConfirm/page.tsx:279 |
| TB_MDM_RULE_VER | APPROVED_AT | 승인 일시 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MDM_RULE_VER | APPROVED_BY | 승인자 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VER | AUD_VER | 감사 버전 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VER | BASE_VER | 기준 버전 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VER | CANCELLED_AT | 취소 일시 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MDM_RULE_VER | CANCEL_REASON | 취소 사유 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VER | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VER | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VER | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VER | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VER | DESCRIPTION | 설명 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VER | EMERGENCY_REASON | 긴급 사유 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VER | EMERGENCY_YN | 긴급 여부 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VER | HIT_POLICY | 적중 정책 | 코드 | src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dme/ruleEdit/service/RuleEditService.java:109 |
| TB_MDM_RULE_VER | MARU_RULE_ID | 룰 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VER | OWNER_ID | 소유자 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx:70 |
| TB_MDM_RULE_VER | REJECT_REASON | 반려 사유 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VER | RELEASED_AT | 확정 일시 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx:68 |
| TB_MDM_RULE_VER | REQUESTED_AT | 요청일시 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VER | REQUESTED_BY | 요청자 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VER | ROW_VERSION | 행 버전 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VER | STATUS | 상태 | 추정 | 물리명 분해 |
| TB_MDM_RULE_VER | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VER | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VER | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VER | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE_VER | VER_KIND | 버전 종류 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_RULE_VER | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_RULE | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE | DESCRIPTION | 설명 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE | LAST_CASE_ID | 마지막 케이스 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE | LAST_ROW_ID | 마지막 행 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE | LAST_VAR_ID | 마지막 변수 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE | MARU_RULE_ID | 룰 아이디 | 추정 | 물리명 분해 |
| TB_MDM_RULE | MARU_RULE_NAME | 룰명 | 화면 | src/frontend/m-mdm/pages/dme/ruleMng/RuleDetailPanel.tsx:302 |
| TB_MDM_RULE | RULE_KIND | 룰 종류 | 추정 | 물리명 분해 |
| TB_MDM_RULE | SOURCE_KIND | 원천 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MDM_RULE | SOURCE_SYSTEM | 원천 시스템 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MDM_RULE | STATUS | 상태 | 추정 | 물리명 분해 |
| TB_MDM_RULE | USAGE_NOTE | 활용처 메모 | 추정 | 물리명 분해 (동일 물리명 통일) |
| TB_MDM_RULE | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_RULE | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_SYSTEM | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_SYSTEM | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_SYSTEM | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_SYSTEM | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_SYSTEM | SELF_YN | 자기 시스템 여부 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_SYSTEM | SYSTEM_CODE | 시스템 코드 | 추정 | 물리명 분해 |
| TB_MDM_SYSTEM | SYSTEM_NAME | 시스템 이름 | 추정 | 물리명 분해 |
| TB_MDM_SYSTEM | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_SYSTEM | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_SYSTEM | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_SYSTEM | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_SYSTEM | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_TERM | ALIASES | 별칭 | 화면 | src/frontend/m-mdm/pages/dma/termMng/TermDetailPane.tsx:191 |
| TB_MDM_TERM | CONTEXT | 맥락 | 화면 | src/frontend/m-mdm/pages/dma/termMng/page.tsx:33 |
| TB_MDM_TERM | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_TERM | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_TERM | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_TERM | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_TERM | DEFINITION | 정의 | 화면 | src/frontend/m-mdm/pages/dma/termMng/TermDetailPane.tsx:185 |
| TB_MDM_TERM | EMBEDDING_MODEL | 임베딩 모델 | 추정 | 물리명 분해 |
| TB_MDM_TERM | EMBEDDING | 임베딩 | 추정 | 물리명 분해 |
| TB_MDM_TERM | ENG_ABBR | 영문 약어 | 사전 | MDM 사전 |
| TB_MDM_TERM | ENG_NAME | 영문명 | 화면 | src/frontend/m-mdm/pages/dma/termMng/page.tsx:31 |
| TB_MDM_TERM | OWNER_DEPT | 오너 부서 | 사전 | MDM 사전 |
| TB_MDM_TERM | OWNER_ID | 소유자 아이디 | 화면 | src/frontend/m-mdm/pages/dmc/codeMng/CodeDetail.tsx:70 |
| TB_MDM_TERM | SENSE_NO | 의미 번호 | 추정 | 물리명 분해 |
| TB_MDM_TERM | SRC_ORIGIN | 출처 기원 | 추정 | 물리명 분해 |
| TB_MDM_TERM | STD_BASIS | 표준 근거 | 화면 | mdm/lib/.../termMng/service/TermMngService.java:200 |
| TB_MDM_TERM | SYNONYMS | 동의어 | 화면 | mdm/lib/.../termMng/service/TermMngService.java:201 |
| TB_MDM_TERM | SYSTEMS | 적용 시스템 | 추정 | 물리명 분해 |
| TB_MDM_TERM | TERM_ID | 용어 아이디 | 추정 | 물리명 분해 |
| TB_MDM_TERM | TERM_NAME | 용어명 | 코드 | cactus-core/src/test/.../ServiceStarterCharTask.java:34 |
| TB_MDM_TERM | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_TERM | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_TERM | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_TERM | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_TERM | VER | 버전 | 사전 | MDM 사전 |
| TB_MDM_UNIT | BASE_UNIT | 기준 단위 | 화면 | src/frontend/m-mdm/pages/dma/unitMng/page.tsx:40 |
| TB_MDM_UNIT | CHG_SEQ | 변경 순번 | 사전 | MDM 사전 |
| TB_MDM_UNIT | C_AT | 생성일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_UNIT | C_PGM_ID | 생성 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_UNIT | C_SVC_ID | 생성 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_UNIT | C_USR_ID | 생성자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_UNIT | DIMENSION | 차원 | 화면 | src/frontend/m-mdm/pages/dma/unitMng/UnitDetailForm.tsx:95 |
| TB_MDM_UNIT | FACTOR | 환산 계수 | 화면 | src/frontend/m-mdm/pages/dma/unitMng/UnitDetailForm.tsx:114 |
| TB_MDM_UNIT | UNIT_CODE | 단위 코드 | 코드 | src/backend/mdm V 파일 주석 |
| TB_MDM_UNIT | U_AT | 수정일시 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_UNIT | U_PGM_ID | 수정 프로그램 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_UNIT | U_SVC_ID | 수정 서비스 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_UNIT | U_USR_ID | 수정자 아이디 | 코드 | MCM 공통 칼럼 규칙 |
| TB_MDM_UNIT | VER | 버전 | 사전 | MDM 사전 |

