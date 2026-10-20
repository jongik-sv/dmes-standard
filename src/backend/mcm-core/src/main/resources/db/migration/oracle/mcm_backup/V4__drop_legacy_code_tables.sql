-- ============================================================
-- V4: 옛 마스터코드 표 삭제
-- ============================================================
--
-- 대상 스키마: MCM_BACKUP   위치: oracle/mcm_backup
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경:
--   2026-10-16 사용자 결정 — 공통관리의 옛 마스터코드·업무기준 프로그램(cma·cme·cmb·cmz 화면과 csa commSyncMng)을
--   걷어낸다. 후속은 mdm 모듈이고 데이터 이관은 없다(D-016 개정). 이 스키마의 마스터코드 백업 표 2개를 지운다.
--   메뉴·권한 행과 MCMAPUSER 의 사본 표·뷰는 mcmapuser V17 이 지운다.
--   없는 표는 건너뛰어 다시 실행해도 안전하다. PURGE 없이 지운다(mcmapuser V8 과 같게 — 휴지통에서 되살릴 수 있게).
--   표를 지우면 다른 사용자에게 준 권한도 함께 사라진다.
-- ============================================================

declare
    n number;
begin
    select count(*) into n from USER_TABLES where TABLE_NAME = 'TB_MCM_CODE_MASTER';
    if n > 0 then
        execute immediate 'drop table TB_MCM_CODE_MASTER cascade constraints';
    end if;
    select count(*) into n from USER_TABLES where TABLE_NAME = 'TB_MCM_CODE_CATEGORY';
    if n > 0 then
        execute immediate 'drop table TB_MCM_CODE_CATEGORY cascade constraints';
    end if;
end;
/
