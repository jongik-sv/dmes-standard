-- ============================================================
-- V14: 맞춤 레포트 정의에 모듈 코드 추가
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경 (docs/superpowers/specs/2026-10-10-custom-report-v2-design.md §4):
--   TB_MCM_USRQ_DEF.MODULE_CD: 정의가 속한 모듈. 값은 예약 작업(TB_MCM_JOB_DEF.MODULE_CD)과 같은 6개이다.
--   기존 행은 MCM 이 된다. 외래 키는 두지 않는다(확인 제약만).

alter table TB_MCM_USRQ_DEF add (MODULE_CD varchar2(10 char) default 'MCM' not null);

alter table TB_MCM_USRQ_DEF add constraint CK_TB_MCM_USRQ_DEF_MOD
    check (MODULE_CD in ('MCM','MDM','MPP','MLS','MQC','MPN'));

COMMENT ON COLUMN TB_MCM_USRQ_DEF.MODULE_CD IS '모듈 코드';
