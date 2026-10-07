-- ============================================================
-- V17: 스케줄링 플랜 기록 화면 제거
-- ============================================================
--
-- 플랜 기록의 표시 정보는 스케줄 목록 상세 패널로 흡수되었으므로
-- 별도 plan-history 메뉴와 오브젝트를 비활성화한다.

UPDATE TB_SEC_MENU
SET USE_YN = 'N',
    HIDDEN_YN = 'Y'
WHERE OBJ_ID = 'plan-history'
   OR MENU_ID = 'c0000004-0000-4000-8000-000000000018';

UPDATE TB_SEC_OBJ
SET USE_YN = 'N'
WHERE OBJ_ID = 'plan-history';

DELETE FROM TB_SEC_FAVORITE_MENU
WHERE MENU_ID IN (
    SELECT MENU_ID
    FROM TB_SEC_MENU
    WHERE OBJ_ID = 'plan-history'
       OR MENU_ID = 'c0000004-0000-4000-8000-000000000018'
);
