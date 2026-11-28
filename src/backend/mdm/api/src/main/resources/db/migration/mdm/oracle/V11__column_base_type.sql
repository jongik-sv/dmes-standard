-- V11: 컬럼 기본 타입 — TB_MDM_COLUMN 에 DATA_TYPE·LENGTH·SCALE 추가
-- 대상 스키마: MDM (위치 db/migration/mdm/oracle)
--
-- 배경: 컬럼 타입과 업무 도메인을 분리한다(2026-11-26 사용자 결정, C안).
--   유효 타입 = 도메인이 있으면 도메인 유효 값, 없으면 컬럼 기본 타입.
--   기본 타입 값 = 룰 엔진 DataType 4종(NUMBER·STRING·BOOLEAN·DATE). 빈 값 허용
--   ("타입 없는 컬럼 저장 불가" 는 서비스 규칙만, DB CHECK 없음).
--   이름은 TB_MDM_DOMAIN 의 DATA_TYPE·LENGTH·SCALE 과 같다.
-- 컬럼 순서: 엔티티 MdmColumn 필드 순서(DOMAIN_ID 뒤)로 표를 재배치한다(flyway-migration-add §4-1).

alter table TB_MDM_COLUMN add (DATA_TYPE varchar2(20 char), LENGTH number(10), SCALE number(10));

-- 값 4종 CHECK 는 TB_MDM_RULE_VAR 의 CK_TB_MDM_RULE_VAR_DTYPE 과 같은 모양. 빈 값은 허용(필수 여부는 서비스 규칙).
alter table TB_MDM_COLUMN add constraint CK_TB_MDM_COLUMN_DTYPE
    check (DATA_TYPE is null or DATA_TYPE in ('BOOLEAN', 'NUMBER', 'STRING', 'DATE'));

comment on column TB_MDM_COLUMN.DATA_TYPE is '기본 데이터 타입(도메인 없을 때)';
comment on column TB_MDM_COLUMN.LENGTH is '기본 길이(도메인 없을 때)';
comment on column TB_MDM_COLUMN.SCALE is '기본 소수 자릿수(도메인 없을 때)';

-- TB_MDM_COLUMN: 앞에 남김 COLUMN_ID
alter table TB_MDM_COLUMN modify (COLUMN_NAME invisible, LABEL_LONG invisible, LABEL_MID invisible, LABEL_SHORT invisible, PHYS_NAME invisible, DESCRIPTION invisible, DOMAIN_ID invisible, DATA_TYPE invisible, LENGTH invisible, SCALE invisible, REQUIRED invisible, DEFAULT_VALUE invisible, REF_KIND invisible, REF_TARGET invisible, REF_CATE_ID invisible, TERM_IDS invisible, USAGE_NOTE invisible, CHG_SEQ invisible, VER invisible, C_USR_ID invisible, C_AT invisible, C_SVC_ID invisible, C_PGM_ID invisible, U_USR_ID invisible, U_AT invisible, U_SVC_ID invisible, U_PGM_ID invisible);
alter table TB_MDM_COLUMN modify (COLUMN_NAME visible);
alter table TB_MDM_COLUMN modify (LABEL_LONG visible);
alter table TB_MDM_COLUMN modify (LABEL_MID visible);
alter table TB_MDM_COLUMN modify (LABEL_SHORT visible);
alter table TB_MDM_COLUMN modify (PHYS_NAME visible);
alter table TB_MDM_COLUMN modify (DESCRIPTION visible);
alter table TB_MDM_COLUMN modify (DOMAIN_ID visible);
alter table TB_MDM_COLUMN modify (DATA_TYPE visible);
alter table TB_MDM_COLUMN modify (LENGTH visible);
alter table TB_MDM_COLUMN modify (SCALE visible);
alter table TB_MDM_COLUMN modify (REQUIRED visible);
alter table TB_MDM_COLUMN modify (DEFAULT_VALUE visible);
alter table TB_MDM_COLUMN modify (REF_KIND visible);
alter table TB_MDM_COLUMN modify (REF_TARGET visible);
alter table TB_MDM_COLUMN modify (REF_CATE_ID visible);
alter table TB_MDM_COLUMN modify (TERM_IDS visible);
alter table TB_MDM_COLUMN modify (USAGE_NOTE visible);
alter table TB_MDM_COLUMN modify (CHG_SEQ visible);
alter table TB_MDM_COLUMN modify (VER visible);
alter table TB_MDM_COLUMN modify (C_USR_ID visible);
alter table TB_MDM_COLUMN modify (C_AT visible);
alter table TB_MDM_COLUMN modify (C_SVC_ID visible);
alter table TB_MDM_COLUMN modify (C_PGM_ID visible);
alter table TB_MDM_COLUMN modify (U_USR_ID visible);
alter table TB_MDM_COLUMN modify (U_AT visible);
alter table TB_MDM_COLUMN modify (U_SVC_ID visible);
alter table TB_MDM_COLUMN modify (U_PGM_ID visible);
