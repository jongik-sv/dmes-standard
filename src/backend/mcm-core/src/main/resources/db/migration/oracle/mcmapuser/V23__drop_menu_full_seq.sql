-- ============================================================
-- V23: 메뉴·폴더의 FULL_SEQ 칸 지우기
-- ============================================================
--
-- 대상 스키마: MCMAPUSER   위치: oracle/mcmapuser
-- 이 파일은 그 스키마 주인으로 접속해 실행된다(앱 Flyway 또는 pdb.mjs template-schema, 운영은 DBA).
--
-- 배경:
--   2026-11-27 사용자 결정 — FULL_SEQ 를 없앤다. FULL_SEQ 는 트리 위치를 7자리로 인코딩해 따로 저장한 값이었다
--   (모듈 i×1,000,000 · 그룹 +j×10,000 · 화면 +100+k×10). 트리는 PARENT_MENU_ID 로 이미 만들어지고 형제 순서는
--   MENU_SEQ 만으로 정해지므로 따로 저장할 필요가 없다. 모듈 9개·그룹 99개·폴더당 화면 90개 한도와 3단 깊이에 묶였고,
--   저장할 때마다 트리 전체를 다시 매겨야 했다. 앱은 같은 부모 안 MENU_SEQ(숫자) → MENU_ID 로 정렬한다(mcm.menu.MenuOrder).
--   이 파일을 적용하기 전에 FULL_SEQ 를 읽지 않는 앱을 먼저 배포한다(옛 앱은 이 칸을 SELECT 한다).
--
--   1) 견본 맞춤 레포트 SAMPLE_MENU_ACTIVE(V15)의 SQL 이 ORDER BY A.FULL_SEQ 를 쓴다. 칸을 지우면 실행 오류가 나므로
--      MENU_SEQ 로 바꾼다. 사용자가 직접 만든 맞춤 레포트가 FULL_SEQ 를 쓰면 그 정의는 실행 오류가 난다 — 이 파일은
--      견본만 고친다. 적용 전에 아래 문장으로 찾아 담당자에게 알린다.
--        SELECT QUERY_ID, QUERY_NM FROM TB_MCM_USRQ_DEF WHERE DBMS_LOB.INSTR(SQL_TEXT, 'FULL_SEQ') > 0;
--   2) 두 표에서 칸을 지운다. 컬럼을 지우면 남은 컬럼의 순서는 그대로라 재배치는 필요 없다(scripts/db-order/column-order.json 도 함께 고쳤다).
--   다시 실행해도 안전하다(이미 고친 견본은 조건에서 빠지고, 없는 칸은 건너뛴다).
-- ============================================================

UPDATE TB_MCM_USRQ_DEF
   SET SQL_TEXT = REPLACE(SQL_TEXT, 'ORDER BY A.FULL_SEQ, A.MENU_ID', 'ORDER BY A.MENU_SEQ, A.MENU_ID')
     , U_AT     = SYSTIMESTAMP
     , U_USR_ID = 'FLYWAY'
     , U_PGM_ID = 'V23'
     , U_SVC_ID = 'V23'
     , VER      = VER + 1
 WHERE QUERY_ID = 'SAMPLE_MENU_ACTIVE'
   AND DBMS_LOB.INSTR(SQL_TEXT, 'FULL_SEQ') > 0;

COMMIT;

declare
    n number;
begin
    select count(*) into n from USER_TAB_COLUMNS where TABLE_NAME = 'TB_MCM_SEC_MENU' and COLUMN_NAME = 'FULL_SEQ';
    if n > 0 then
        execute immediate 'alter table TB_MCM_SEC_MENU drop column FULL_SEQ';
    end if;
    select count(*) into n from USER_TAB_COLUMNS where TABLE_NAME = 'TB_MCM_SEC_MENU_FLD' and COLUMN_NAME = 'FULL_SEQ';
    if n > 0 then
        execute immediate 'alter table TB_MCM_SEC_MENU_FLD drop column FULL_SEQ';
    end if;
end;
/
