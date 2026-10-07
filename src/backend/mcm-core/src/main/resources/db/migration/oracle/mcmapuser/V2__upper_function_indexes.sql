-- ============================================================
-- V2: UPPER 검색용 함수 기반 인덱스
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (sargable-1008 s4·s5):
--   대소문자를 무시하는 검색이 칼럼 쪽에 UPPER 를 씌워 쓴다. 저장 값에 소문자가 섞일 수 있어(L_MAIN 의
--   TB_MCM_SEC_USER.USER_ID 는 11행 중 5행이 소문자) 칼럼의 UPPER 를 뺄 수 없다. SQL 의 식과 글자 그대로 같은
--   함수 기반 인덱스를 두어 UPPER(칼럼) = / LIKE '앞부분%' 가 인덱스 범위 탐색을 하게 한다.
--   - TB_MCM_SEC_USER: SecUserRepository.searchByFilter 의 UPPER(USER_ID·USER_EMP_NO·USER_NM) LIKE 앞 일치 3칸
--   - TB_MCM_CODE_MASTER: 코드 선택 팝업(VI_MCM_CODE_ACCESS 를 거친) UPPER(CODE_ID) = UPPER(:v)
-- ============================================================

create index IX_TB_MCM_SEC_USER_UP_ID on TB_MCM_SEC_USER (UPPER(USER_ID));

create index IX_TB_MCM_SEC_USER_UP_EMPNO on TB_MCM_SEC_USER (UPPER(USER_EMP_NO));

create index IX_TB_MCM_SEC_USER_UP_NM on TB_MCM_SEC_USER (UPPER(USER_NM));

create index IX_TB_MCM_CODE_MASTER_UP_ID on TB_MCM_CODE_MASTER (UPPER(CODE_ID));
