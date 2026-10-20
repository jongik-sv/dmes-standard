-- ============================================================
-- V17: 옛 마스터코드·업무기준 프로그램 걷어내기
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경:
--   2026-10-16 사용자 결정 — 공통관리 아래 옛 프로그램 13개를 걷어낸다. 후속은 mdm 모듈(마루 코드 dmc·업무기준 dme)이고
--   데이터 이관은 없다(D-016 개정).
--     마스터관리(원장) cma : masterCategoryMng, masterCodeMng
--     마스터관리(가동) cme : masterCodeMngList
--     업무기준관리(원장) cmb : masterRuleList, masterRuleData, masterRuleDataList, masterRuleFrame
--     팝업 cmz : masterCodeSelPop, masterCodeUploadFilePopup, masterRuleListPop, masterRuleFrameColListPopup,
--                masterRuleDataUploadFilePopup
--     시스템관리 csa : commSyncMng(위 마스터코드 표만 동기화하던 화면)
--   시드 코드(McmMenuSeeder·CoreRbacSeeder)에서 지워도 이미 적재된 DB 의 행은 남는다(insertIfAbsent 는 지우지 않는다).
--   남은 메뉴는 없는 화면을 가리켜 오류 탭을 연다. 그래서 메뉴·폴더·OBJECT·권한 매핑과 사용자별 즐겨찾기·시작 화면·
--   조회 기본값을 여기서 지운다. 화면 사용 통계(TB_SEC_SCREEN_USAGE_*)는 지난 기록이라 남긴다.
--   이어서 이 스키마의 사본 표 3개와 뷰 VI_MCM_CODE_ACCESS 를 지운다. 원본 MCM_SOURCE·MCM_BACKUP 표는 각 스키마의 V4 가,
--   MCAAPUSER 의 업무기준 표는 mcaapuser V4 가 지운다.
--   DELETE 와 DROP 은 다시 실행해도 안전하게 쓴다(없는 표는 건너뛴다). PURGE 없이 지운다(V8 과 같게 — 운영에서 실수였을 때 휴지통에서 되살릴 수 있게).
-- ============================================================

DELETE FROM TB_MCM_SEC_ROLE_MAPPING
 WHERE OBJECT_ID IN ('masterCategoryMng', 'masterCodeMng', 'masterCodeMngList', 'masterRuleList', 'masterRuleData',
                     'masterRuleDataList', 'masterRuleFrame', 'masterCodeSelPop', 'masterCodeUploadFilePopup',
                     'masterRuleListPop', 'masterRuleFrameColListPopup', 'masterRuleDataUploadFilePopup', 'commSyncMng');

DELETE FROM TB_MCM_SEC_USER_FAVORITE
 WHERE MENU_ID IN ('masterCategoryMng', 'masterCodeMng', 'masterCodeMngList', 'masterRuleList', 'masterRuleData',
                   'masterRuleDataList', 'masterRuleFrame', 'masterCodeSelPop', 'masterCodeUploadFilePopup',
                   'masterRuleListPop', 'masterRuleFrameColListPopup', 'masterRuleDataUploadFilePopup', 'commSyncMng');

DELETE FROM TB_MCM_SEC_USER_START_PGM
 WHERE MENU_ID IN ('masterCategoryMng', 'masterCodeMng', 'masterCodeMngList', 'masterRuleList', 'masterRuleData',
                   'masterRuleDataList', 'masterRuleFrame', 'masterCodeSelPop', 'masterCodeUploadFilePopup',
                   'masterRuleListPop', 'masterRuleFrameColListPopup', 'masterRuleDataUploadFilePopup', 'commSyncMng');

-- 조회 기본값의 PAGE_ID 는 '모듈:그룹/화면' 꼴이다(예: mcm:csa/commMenuMng).
DELETE FROM TB_MCM_SEC_USER_SRCH_DFLT
 WHERE PAGE_ID IN ('mcm:cma/masterCategoryMng', 'mcm:cma/masterCodeMng', 'mcm:cme/masterCodeMngList',
                   'mcm:cmb/masterRuleList', 'mcm:cmb/masterRuleData', 'mcm:cmb/masterRuleDataList',
                   'mcm:cmb/masterRuleFrame', 'mcm:csa/commSyncMng');

DELETE FROM TB_MCM_SEC_MENU
 WHERE MENU_ID IN ('masterCategoryMng', 'masterCodeMng', 'masterCodeMngList', 'masterRuleList', 'masterRuleData',
                   'masterRuleDataList', 'masterRuleFrame', 'masterCodeSelPop', 'masterCodeUploadFilePopup',
                   'masterRuleListPop', 'masterRuleFrameColListPopup', 'masterRuleDataUploadFilePopup', 'commSyncMng');

DELETE FROM TB_MCM_SEC_OBJ
 WHERE OBJECT_ID IN ('masterCategoryMng', 'masterCodeMng', 'masterCodeMngList', 'masterRuleList', 'masterRuleData',
                     'masterRuleDataList', 'masterRuleFrame', 'masterCodeSelPop', 'masterCodeUploadFilePopup',
                     'masterRuleListPop', 'masterRuleFrameColListPopup', 'masterRuleDataUploadFilePopup', 'commSyncMng');

-- 폴더 4개(cma·cme·cmb·cmz)와 그 옛 이름(grp-cma·grp-cme)은 위 화면만 담았다. 다른 메뉴가 그 폴더를 부모로 두지 않을 때만 지운다.
DELETE FROM TB_MCM_SEC_MENU_FLD F
 WHERE F.MENU_ID IN ('cma', 'cme', 'cmb', 'cmz', 'grp-cma', 'grp-cme')
   AND NOT EXISTS (SELECT 1
                     FROM TB_MCM_SEC_MENU M
                    WHERE M.PARENT_MENU_ID = F.MENU_ID)
   AND NOT EXISTS (SELECT 1
                     FROM TB_MCM_SEC_MENU_FLD C
                    WHERE C.PARENT_MENU_ID = F.MENU_ID);

COMMIT;

declare
    n number;
begin
    select count(*) into n from USER_VIEWS where VIEW_NAME = 'VI_MCM_CODE_ACCESS';
    if n > 0 then
        execute immediate 'drop view VI_MCM_CODE_ACCESS';
    end if;
    select count(*) into n from USER_TABLES where TABLE_NAME = 'TB_MCM_CODE_DETAIL';
    if n > 0 then
        execute immediate 'drop table TB_MCM_CODE_DETAIL cascade constraints';
    end if;
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
