-- ============================================================
-- V2: 물리명 UPPER 검색용 함수 기반 인덱스
-- ============================================================
--
-- 대상 스키마: MDMAPUSER   위치: mdm/oracle
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (sargable-1008 s4):
--   물리명을 대소문자 무시로 찾는 조회가 칼럼에 UPPER 를 씌워 쓴다. TB_MDM_COLUMN_SYSTEM.PHYS_NAME 에는 소문자가
--   있어(L_MAIN 11250행 중 10행) 칼럼의 UPPER 를 뺄 수 없고, TB_MDM_COLUMN.PHYS_NAME 은 인덱스가 없다. SQL 의 식과
--   글자 그대로 같은 함수 기반 인덱스를 둔다.
--   - TB_MDM_COLUMN_SYSTEM: MdmColumnSystemRepository.findBySystemCodeAndUpperPhysNameIn
--     (SYSTEM_CODE = :s AND UPPER(PHYS_NAME) IN (...)) — 앞 칸은 기존 IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS 와 같다
--   - TB_MDM_COLUMN: DomainImpactQueries.COLUMNS_BY_PHYS_SQL 의 UPPER(PHYS_NAME) IN (...)
-- ============================================================

CREATE INDEX IX_TB_MDM_COLUMN_SYSTEM_SYS_UPPHYS ON TB_MDM_COLUMN_SYSTEM (SYSTEM_CODE, UPPER(PHYS_NAME));

CREATE INDEX IX_TB_MDM_COLUMN_UP_PHYS ON TB_MDM_COLUMN (UPPER(PHYS_NAME));
