-- ============================================================
-- V2: 물리명 UPPER 검색용 함수 기반 인덱스
-- ============================================================
--
-- 대상 스키마: MDMAPUSER   위치: mdm/oracle
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (sargable-1008 s4):
--   DomainImpactQueries.COLUMNS_BY_PHYS_SQL 의 UPPER(PHYS_NAME) IN (...) 이 칼럼에 UPPER 를 씌워 쓰는데
--   TB_MDM_COLUMN.PHYS_NAME 에는 인덱스가 없어 표 전체를 읽는다. 저장 값에 대소문자 보장이 없어(같은 사전의
--   TB_MDM_COLUMN_SYSTEM.PHYS_NAME 은 소문자가 섞여 있다) 칼럼의 UPPER 를 뺄 수 없으므로 SQL 의 식과 글자 그대로 같은
--   함수 기반 인덱스를 둔다. IN 목록은 INLIST ITERATOR + INDEX RANGE SCAN 으로 풀린다.
--
--   TB_MDM_COLUMN_SYSTEM 의 UPPER(PHYS_NAME) IN (...) 조회(MdmColumnSystemRepository.findBySystemCodeAndUpperPhysNameIn)는
--   (SYSTEM_CODE, UPPER(PHYS_NAME)) 인덱스를 만들어도 계획이 SYSTEM_CODE 만 access 로 잡는 점이 기존
--   IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS 와 같아(IN 목록이 두 번째 칼럼이면 INLIST 반복을 못 한다) 이득이 없어 만들지 않는다.
-- ============================================================

CREATE INDEX IX_TB_MDM_COLUMN_UP_PHYS ON TB_MDM_COLUMN (UPPER(PHYS_NAME));
