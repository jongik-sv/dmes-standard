-- ============================================================
-- V4: 옛 업무기준 표 삭제
-- ============================================================
--
-- 대상 스키마: MCAAPUSER   위치: oracle/mcaapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경:
--   2026-10-16 사용자 결정 — 공통관리의 옛 마스터코드·업무기준 프로그램(cma·cme·cmb·cmz 화면과 csa commSyncMng)을
--   걷어낸다. 후속은 mdm 모듈이고 데이터 이관은 없다(D-016 개정). 이 스키마의 업무기준 표를 지운다.
--   메뉴·권한 행과 MCMAPUSER 의 사본 표·뷰는 mcmapuser V17 이 지운다.
--   정적 표 2개(TB_MCA_RULE_MASTER·TB_MCA_RULE_COL_LIST) 말고도 업무기준 Data관리 화면들이 기준마다 읽고 쓰던
--   동적 표(TB_MCA_<RULE_ID>)가 이 스키마에 있을 수 있다. 동적 표는 앱이 만들지 않고 적재기·DBA 가 만든다
--   (로컬 L_MAIN 에는 없었다). 동적 표는 이름을 미리 알 수 없고, 이름을 이어 붙인 동적 DROP 은 컬럼 순서 검사기
--   (scripts/db-order)가 읽지 못해 이 파일에 넣지 않았다. 개발계·운영에서는 DBA 가 아래로 남은 표를 확인해 따로 지운다.
--     SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE 'TB\_MCA\_%' ESCAPE '\';
--   없는 표는 건너뛰어 다시 실행해도 안전하다. PURGE 없이 지운다(mcmapuser V8 과 같게 — 휴지통에서 되살릴 수 있게).
--   표를 지우면 다른 사용자에게 준 권한도 함께 사라진다.
-- ============================================================

declare
    n number;
begin
    select count(*) into n from USER_TABLES where TABLE_NAME = 'TB_MCA_RULE_COL_LIST';
    if n > 0 then
        execute immediate 'drop table TB_MCA_RULE_COL_LIST cascade constraints';
    end if;
    select count(*) into n from USER_TABLES where TABLE_NAME = 'TB_MCA_RULE_MASTER';
    if n > 0 then
        execute immediate 'drop table TB_MCA_RULE_MASTER cascade constraints';
    end if;
end;
/
