-- ============================================================
-- V27: 역할의 MENU_ID 칸 지우기
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경:
--   2026-11-28 사용자 결정 — 역할(TB_MCM_SEC_ROLE)의 MENU_ID 를 없앤다. 권한 계산·퍼미션 저장(commRoleMng saveCmRoleMap)·
--   권한 작업대 적용 어디도 이 값으로 오브젝트 범위를 막지 않는다. 쓰임은 새 역할 ROLE_ID 자동 접두(role_<메뉴ID>_<ID>)·
--   역할 목록 칸·새 역할 필수 입력(메뉴 폴더 고르기)뿐이라 「이 역할은 그 메뉴만 쓴다」로 잘못 읽혀 혼란만 주었다.
--   이제 새 역할 ROLE_ID 는 입력한 값 그대로다. 기존 ROLE_ID(role_csa_… 등)는 바꾸지 않는다.
--   이 파일을 적용하기 전에 MENU_ID 를 읽지 않는 앱을 먼저 배포한다(옛 앱은 이 칸을 SELECT 한다).
--   칸의 값은 되살릴 수 없다. 운영·개발 DB 는 적용 전에 아래 문장으로 남은 값을 기록해 둔다.
--     SELECT ROLE_ID, MENU_ID FROM TB_MCM_SEC_ROLE WHERE MENU_ID IS NOT NULL;
--   칸을 지워도 남은 칸의 순서는 그대로라 재배치는 필요 없다(scripts/db-order/column-order.json 도 함께 고쳤다).
--   메뉴·폴더·즐겨찾기·시작 화면의 MENU_ID 는 다른 칸이다 — 건드리지 않는다.
--   다시 실행해도 안전하다(칸이 없으면 건너뛴다).
-- ============================================================

declare
    n number;
begin
    select count(*) into n from USER_TAB_COLUMNS where TABLE_NAME = 'TB_MCM_SEC_ROLE' and COLUMN_NAME = 'MENU_ID';
    if n > 0 then
        execute immediate 'alter table TB_MCM_SEC_ROLE drop column MENU_ID';
    end if;
end;
/
